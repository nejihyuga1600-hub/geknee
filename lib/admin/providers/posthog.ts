import type { ProviderResult, PosthogStats } from '../types';

// PostHog HogQL query API. Required env:
//   POSTHOG_PROJECT_API_KEY    (project-scoped personal API key with query:read)
//   POSTHOG_PROJECT_ID         numeric project id (e.g. 394944)
//   POSTHOG_API_HOST           defaults to https://us.posthog.com
async function hogQuery<T>(sql: string): Promise<T[]> {
  const key = process.env.POSTHOG_PROJECT_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.POSTHOG_API_HOST ?? 'https://us.posthog.com';
  if (!key || !projectId) throw new Error('POSTHOG_PROJECT_API_KEY or POSTHOG_PROJECT_ID missing');

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { results?: unknown[][]; columns?: string[] };
  const cols = json.columns ?? [];
  return (json.results ?? []).map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj as T;
  });
}

export async function getPosthogStats(): Promise<ProviderResult<PosthogStats>> {
  if (!process.env.POSTHOG_PROJECT_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
    const missing = [
      !process.env.POSTHOG_PROJECT_API_KEY && 'POSTHOG_PROJECT_API_KEY',
      !process.env.POSTHOG_PROJECT_ID && 'POSTHOG_PROJECT_ID',
    ].filter(Boolean) as string[];
    return { status: 'unconfigured', missing };
  }

  try {
    const [traffic, conv, refs] = await Promise.all([
      hogQuery<{ uniq: number; pv: number }>(`
        SELECT count(distinct distinct_id) as uniq,
               countIf(event = '$pageview') as pv
        FROM events
        WHERE timestamp >= now() - INTERVAL 7 DAY
      `),
      hogQuery<{ visitors: number; signups: number; paid: number }>(`
        SELECT count(distinct distinct_id) as visitors,
               countIf(event = 'signup_completed' OR event = '$identify') as signups,
               countIf(event = 'subscription_started') as paid
        FROM events
        WHERE timestamp >= now() - INTERVAL 7 DAY
      `),
      hogQuery<{ referrer: string; visits: number }>(`
        SELECT properties.$referring_domain as referrer, count() as visits
        FROM events
        WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
        GROUP BY referrer
        ORDER BY visits DESC
        LIMIT 5
      `),
    ]);

    const visitors = Number(traffic[0]?.uniq ?? 0);
    const pageviews = Number(traffic[0]?.pv ?? 0);
    const signups = Number(conv[0]?.signups ?? 0);
    const paid = Number(conv[0]?.paid ?? 0);

    return {
      status: 'ok',
      data: {
        uniqueVisitorsLast7d: visitors,
        pageviewsLast7d: pageviews,
        signupConversionPct: visitors > 0 ? Math.round((signups / visitors) * 1000) / 10 : 0,
        paidConversionPct: signups > 0 ? Math.round((paid / signups) * 1000) / 10 : 0,
        topReferrers: refs.map((r) => ({
          referrer: r.referrer || '(direct)',
          visits: Number(r.visits ?? 0),
        })),
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
