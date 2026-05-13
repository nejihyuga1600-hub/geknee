import type { ProviderResult } from '../types';

export interface IgSnapshot {
  followers: number;
  views7d: number;
  handle: string;
}

// Instagram Graph API (requires IG Business/Creator account linked to a
// Facebook Page, plus a long-lived page token). Doc:
//   https://developers.facebook.com/docs/instagram-api/reference/ig-user
// Required env:
//   IG_ACCESS_TOKEN  long-lived user token with instagram_basic + instagram_manage_insights
//   IG_USER_ID       numeric IG Business account id
export async function getInstagramSnapshot(): Promise<ProviderResult<IgSnapshot>> {
  const token = process.env.IG_ACCESS_TOKEN;
  const userId = process.env.IG_USER_ID;
  if (!token || !userId) {
    return { status: 'unconfigured', missing: [!token && 'IG_ACCESS_TOKEN', !userId && 'IG_USER_ID'].filter(Boolean) as string[] };
  }

  try {
    // Followers + handle from the user node.
    const profileRes = await fetch(
      `https://graph.facebook.com/v21.0/${userId}?fields=followers_count,username&access_token=${token}`,
      { cache: 'no-store' },
    );
    if (!profileRes.ok) {
      return { status: 'error', error: `IG profile ${profileRes.status}: ${await profileRes.text()}` };
    }
    const profile = await profileRes.json() as { followers_count?: number; username?: string };

    // Views: IG insights uses metric=impressions for content-level reach.
    // For the account-level rolling-7d we use the user-level insights with
    // period=days_28 and slice client-side; or use views from V18+ for
    // reels. Falling back to reach if impressions unavailable.
    const since = Math.floor((Date.now() - 7 * 86400 * 1000) / 1000);
    const until = Math.floor(Date.now() / 1000);
    const insightsRes = await fetch(
      `https://graph.facebook.com/v21.0/${userId}/insights?metric=views&period=day&since=${since}&until=${until}&access_token=${token}`,
      { cache: 'no-store' },
    );
    let views7d = 0;
    if (insightsRes.ok) {
      const json = await insightsRes.json() as { data?: { values?: { value: number }[] }[] };
      const series = json.data?.[0]?.values ?? [];
      views7d = series.reduce((a, v) => a + (v.value ?? 0), 0);
    }

    return {
      status: 'ok',
      data: {
        followers: profile.followers_count ?? 0,
        views7d,
        handle: profile.username ?? '',
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
