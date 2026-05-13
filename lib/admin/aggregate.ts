import type { DashboardSnapshot, ProviderResult, SocialFollowers, SocialViews, AdSpendStats } from './types';
import { getUserStats, getProductStats } from './providers/prisma-stats';
import { getRevenueStats } from './providers/stripe';
import { getInstagramSnapshot } from './providers/instagram';
import { getTikTokSnapshot } from './providers/tiktok';
import { getMetaAdsSnapshot } from './providers/meta-ads';
import { getGoogleAdsSnapshot } from './providers/google-ads';
import { getTikTokAdsSnapshot } from './providers/tiktok-ads';
import { getPosthogStats } from './providers/posthog';

function unwrapMissing<T>(...rs: ProviderResult<T>[]): string[] {
  const out: string[] = [];
  for (const r of rs) if (r.status === 'unconfigured') out.push(...r.missing);
  return out;
}

export async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [
    users,
    revenue,
    product,
    posthog,
    ig,
    tt,
    meta,
    gAds,
    ttAds,
  ] = await Promise.all([
    getUserStats(),
    getRevenueStats(),
    getProductStats(),
    getPosthogStats(),
    getInstagramSnapshot(),
    getTikTokSnapshot(),
    getMetaAdsSnapshot(),
    getGoogleAdsSnapshot(),
    getTikTokAdsSnapshot(),
  ]);

  // Merge IG+TT into the followers + views envelopes. If both are missing
  // we surface unconfigured; if either errors we surface error with the
  // failing platform name.
  let followers: ProviderResult<SocialFollowers>;
  if (ig.status === 'unconfigured' && tt.status === 'unconfigured') {
    followers = { status: 'unconfigured', missing: unwrapMissing(ig, tt) };
  } else if (ig.status === 'error' && tt.status === 'error') {
    followers = { status: 'error', error: `IG: ${ig.error}; TT: ${tt.error}` };
  } else {
    const perPlatform: SocialFollowers['perPlatform'] = [];
    let total = 0;
    if (ig.status === 'ok') { perPlatform.push({ platform: 'instagram', followers: ig.data.followers, handle: ig.data.handle }); total += ig.data.followers; }
    if (tt.status === 'ok') { perPlatform.push({ platform: 'tiktok', followers: tt.data.followers, handle: tt.data.handle }); total += tt.data.followers; }
    followers = { status: 'ok', data: { total, perPlatform, totalLast7dDelta: null } };
  }

  let socialViews: ProviderResult<SocialViews>;
  if (ig.status === 'unconfigured' && tt.status === 'unconfigured') {
    socialViews = { status: 'unconfigured', missing: unwrapMissing(ig, tt) };
  } else {
    const perPlatform: SocialViews['perPlatform'] = [];
    let total = 0;
    if (ig.status === 'ok') { perPlatform.push({ platform: 'instagram', views7d: ig.data.views7d }); total += ig.data.views7d; }
    if (tt.status === 'ok') { perPlatform.push({ platform: 'tiktok', views7d: tt.data.views7d }); total += tt.data.views7d; }
    socialViews = { status: 'ok', data: { total7d: total, perPlatform } };
  }

  // Merge ad spend.
  const adProviders = [meta, gAds, ttAds];
  const allUnconfig = adProviders.every((r) => r.status === 'unconfigured');
  let adSpend: ProviderResult<AdSpendStats>;
  if (allUnconfig) {
    adSpend = { status: 'unconfigured', missing: unwrapMissing(...adProviders) };
  } else {
    let todayUsd = 0;
    let last7dUsd = 0;
    const perPlatform: AdSpendStats['perPlatform'] = [];
    if (meta.status === 'ok') { todayUsd += meta.data.todayUsd; last7dUsd += meta.data.last7dUsd; perPlatform.push({ platform: 'meta', todayUsd: meta.data.todayUsd, last7dUsd: meta.data.last7dUsd, activeCampaigns: meta.data.activeCampaigns }); }
    if (gAds.status === 'ok') { todayUsd += gAds.data.todayUsd; last7dUsd += gAds.data.last7dUsd; perPlatform.push({ platform: 'google', todayUsd: gAds.data.todayUsd, last7dUsd: gAds.data.last7dUsd, activeCampaigns: gAds.data.activeCampaigns }); }
    if (ttAds.status === 'ok') { todayUsd += ttAds.data.todayUsd; last7dUsd += ttAds.data.last7dUsd; perPlatform.push({ platform: 'tiktok', todayUsd: ttAds.data.todayUsd, last7dUsd: ttAds.data.last7dUsd, activeCampaigns: ttAds.data.activeCampaigns }); }
    adSpend = {
      status: 'ok',
      data: {
        todayUsd: Math.round(todayUsd * 100) / 100,
        last7dUsd: Math.round(last7dUsd * 100) / 100,
        last30dUsd: 0,
        perPlatform,
      },
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    users,
    revenue,
    followers,
    socialViews,
    adSpend,
    product,
    posthog,
  };
}
