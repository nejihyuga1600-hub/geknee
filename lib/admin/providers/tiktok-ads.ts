import type { ProviderResult } from '../types';

export interface TikTokAdsSnapshot {
  todayUsd: number;
  last7dUsd: number;
  activeCampaigns: number;
}

// TikTok Marketing API. Required env:
//   TIKTOK_ADS_ACCESS_TOKEN
//   TIKTOK_ADVERTISER_ID
export async function getTikTokAdsSnapshot(): Promise<ProviderResult<TikTokAdsSnapshot>> {
  const token = process.env.TIKTOK_ADS_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  if (!token || !advertiserId) {
    return { status: 'unconfigured', missing: [!token && 'TIKTOK_ADS_ACCESS_TOKEN', !advertiserId && 'TIKTOK_ADVERTISER_ID'].filter(Boolean) as string[] };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);

    const url = new URL('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
    url.searchParams.set('advertiser_id', advertiserId);
    url.searchParams.set('report_type', 'BASIC');
    url.searchParams.set('data_level', 'AUCTION_CAMPAIGN');
    url.searchParams.set('dimensions', JSON.stringify(['campaign_id', 'stat_time_day']));
    url.searchParams.set('metrics', JSON.stringify(['spend']));
    url.searchParams.set('start_date', sevenAgo);
    url.searchParams.set('end_date', today);
    url.searchParams.set('page_size', '200');

    const res = await fetch(url.toString(), {
      headers: { 'Access-Token': token },
      cache: 'no-store',
    });
    if (!res.ok) return { status: 'error', error: `TikTok Ads ${res.status}` };
    const json = await res.json() as {
      data?: {
        list?: { dimensions?: { stat_time_day?: string; campaign_id?: string }; metrics?: { spend?: string } }[];
      };
    };

    let last7dUsd = 0;
    let todayUsd = 0;
    const activeCampaigns = new Set<string>();
    for (const row of json.data?.list ?? []) {
      const amt = Number(row.metrics?.spend ?? 0);
      last7dUsd += amt;
      if (row.dimensions?.stat_time_day?.startsWith(today)) todayUsd += amt;
      if (amt > 0 && row.dimensions?.campaign_id) activeCampaigns.add(row.dimensions.campaign_id);
    }

    return {
      status: 'ok',
      data: {
        todayUsd: Math.round(todayUsd * 100) / 100,
        last7dUsd: Math.round(last7dUsd * 100) / 100,
        activeCampaigns: activeCampaigns.size,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
