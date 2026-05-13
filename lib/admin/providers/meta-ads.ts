import type { ProviderResult } from '../types';

export interface MetaAdsSnapshot {
  todayUsd: number;
  last7dUsd: number;
  activeCampaigns: number;
}

// Meta Marketing API. Required env:
//   META_ADS_TOKEN          long-lived user/system-user token with ads_read
//   META_AD_ACCOUNT_ID      numeric act_id (without the "act_" prefix)
export async function getMetaAdsSnapshot(): Promise<ProviderResult<MetaAdsSnapshot>> {
  const token = process.env.META_ADS_TOKEN;
  const acct = process.env.META_AD_ACCOUNT_ID;
  if (!token || !acct) {
    return { status: 'unconfigured', missing: [!token && 'META_ADS_TOKEN', !acct && 'META_AD_ACCOUNT_ID'].filter(Boolean) as string[] };
  }

  try {
    const accountId = acct.startsWith('act_') ? acct : `act_${acct}`;
    const today = new Date().toISOString().slice(0, 10);
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

    // Insight call covering 7d window — we'll bucket today separately.
    const insightsUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=spend,date_start,date_stop&time_range={"since":"${sevenAgo}","until":"${today}"}&time_increment=1&access_token=${token}`;
    const insightsRes = await fetch(insightsUrl, { cache: 'no-store' });
    if (!insightsRes.ok) {
      return { status: 'error', error: `Meta insights ${insightsRes.status}: ${(await insightsRes.text()).slice(0, 200)}` };
    }
    const insights = await insightsRes.json() as { data?: { spend?: string; date_start?: string }[] };
    let last7dUsd = 0;
    let todayUsd = 0;
    for (const row of insights.data ?? []) {
      const amt = Number(row.spend ?? 0);
      last7dUsd += amt;
      if (row.date_start === today) todayUsd += amt;
    }

    const campaignsRes = await fetch(
      `https://graph.facebook.com/v21.0/${accountId}/campaigns?fields=id,status,effective_status&limit=100&access_token=${token}`,
      { cache: 'no-store' },
    );
    let activeCampaigns = 0;
    if (campaignsRes.ok) {
      const json = await campaignsRes.json() as { data?: { effective_status?: string }[] };
      activeCampaigns = (json.data ?? []).filter((c) => c.effective_status === 'ACTIVE').length;
    }

    return {
      status: 'ok',
      data: {
        todayUsd: Math.round(todayUsd * 100) / 100,
        last7dUsd: Math.round(last7dUsd * 100) / 100,
        activeCampaigns,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
