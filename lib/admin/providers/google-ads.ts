import type { ProviderResult } from '../types';

export interface GoogleAdsSnapshot {
  todayUsd: number;
  last7dUsd: number;
  activeCampaigns: number;
}

// Google Ads API requires a developer token + OAuth refresh-token + customer
// id. Implementation uses the v17 REST surface with searchStream for spend.
// Required env:
//   GOOGLE_ADS_DEVELOPER_TOKEN
//   GOOGLE_ADS_CLIENT_ID
//   GOOGLE_ADS_CLIENT_SECRET
//   GOOGLE_ADS_REFRESH_TOKEN
//   GOOGLE_ADS_CUSTOMER_ID  (10-digit, no dashes)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID  optional MCC manager account id
export async function getGoogleAdsSnapshot(): Promise<ProviderResult<GoogleAdsSnapshot>> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const missing: string[] = [];
  if (!devToken) missing.push('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!clientId) missing.push('GOOGLE_ADS_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET');
  if (!refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN');
  if (!customerId) missing.push('GOOGLE_ADS_CUSTOMER_ID');
  if (missing.length) return { status: 'unconfigured', missing };

  try {
    // Exchange refresh_token → access_token.
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: refreshToken!,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    if (!tokenRes.ok) return { status: 'error', error: `oauth ${tokenRes.status}` };
    const { access_token } = await tokenRes.json() as { access_token: string };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${access_token}`,
      'developer-token': devToken!,
      'Content-Type': 'application/json',
    };
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

    const query = `
      SELECT campaign.id, campaign.status, metrics.cost_micros, segments.date
      FROM campaign
      WHERE segments.date DURING LAST_7_DAYS
    `;
    const searchRes = await fetch(
      `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }), cache: 'no-store' },
    );
    if (!searchRes.ok) return { status: 'error', error: `search ${searchRes.status}: ${(await searchRes.text()).slice(0, 200)}` };
    const json = await searchRes.json() as {
      results?: { campaign?: { status?: string }; metrics?: { costMicros?: string }; segments?: { date?: string } }[];
    };

    const today = new Date().toISOString().slice(0, 10);
    let last7dUsd = 0;
    let todayUsd = 0;
    const activeIds = new Set<string>();
    for (const row of json.results ?? []) {
      const micros = Number(row.metrics?.costMicros ?? 0);
      const usd = micros / 1_000_000;
      last7dUsd += usd;
      if (row.segments?.date === today) todayUsd += usd;
      if (row.campaign?.status === 'ENABLED') activeIds.add(JSON.stringify(row.campaign));
    }

    return {
      status: 'ok',
      data: {
        todayUsd: Math.round(todayUsd * 100) / 100,
        last7dUsd: Math.round(last7dUsd * 100) / 100,
        activeCampaigns: activeIds.size,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
