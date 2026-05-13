import type { ProviderResult } from '../types';

export interface TikTokSnapshot {
  followers: number;
  views7d: number;
  handle: string;
}

// TikTok Display API (creator account, OAuth flow). Doc:
//   https://developers.tiktok.com/doc/login-kit-user-info-basic
//   https://developers.tiktok.com/doc/research-api-codebook/  (for views)
// Required env:
//   TIKTOK_ACCESS_TOKEN   user access token from OAuth flow
//   TIKTOK_OPEN_ID        the open_id returned alongside the token
export async function getTikTokSnapshot(): Promise<ProviderResult<TikTokSnapshot>> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const openId = process.env.TIKTOK_OPEN_ID;
  if (!token) return { status: 'unconfigured', missing: ['TIKTOK_ACCESS_TOKEN', !openId && 'TIKTOK_OPEN_ID'].filter(Boolean) as string[] };

  try {
    // User info — gives follower_count + display_name.
    const userRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,follower_count,display_name,username',
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    if (!userRes.ok) {
      return { status: 'error', error: `TikTok user ${userRes.status}: ${await userRes.text()}` };
    }
    const userJson = await userRes.json() as {
      data?: { user?: { follower_count?: number; display_name?: string; username?: string } };
    };
    const followers = userJson.data?.user?.follower_count ?? 0;
    const handle = userJson.data?.user?.username ?? userJson.data?.user?.display_name ?? '';

    // Views last 7d via video list. Cursor through up to 50 videos and sum
    // view_count for any whose create_time falls in the window.
    let views7d = 0;
    const since = Math.floor((Date.now() - 7 * 86400 * 1000) / 1000);
    const videosRes = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: 50 }),
        cache: 'no-store',
      },
    );
    if (videosRes.ok) {
      const json = await videosRes.json() as { data?: { videos?: { create_time: number; view_count: number }[] } };
      for (const v of json.data?.videos ?? []) {
        if (v.create_time >= since) views7d += v.view_count ?? 0;
      }
    }

    return { status: 'ok', data: { followers, views7d, handle } };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
