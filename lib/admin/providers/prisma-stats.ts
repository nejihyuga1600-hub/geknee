import { prisma } from '@/lib/prisma';
import type { ProviderResult, UsersStats, ProductStats } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBucketKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getUserStats(): Promise<ProviderResult<UsersStats>> {
  try {
    const now = Date.now();
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);
    const since30d = new Date(now - 30 * DAY_MS);

    const [total, newLast24h, newLast7d, newLast30d, paid, activeLast7d, recentSignups] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since24h } } }),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      prisma.user.count({ where: { createdAt: { gte: since30d } } }),
      prisma.user.count({ where: { plan: 'pro' } }),
      prisma.user.count({ where: { lastSeen: { gte: since7d } } }),
      prisma.user.findMany({
        where: { createdAt: { gte: since7d } },
        select: { createdAt: true },
      }),
    ]);

    // Bucket signups into the last 7 daily buckets, oldest first.
    const spark = Array(7).fill(0) as number[];
    const todayKey = dayBucketKey(new Date());
    const keys: string[] = [];
    for (let i = 6; i >= 0; i--) keys.push(dayBucketKey(new Date(now - i * DAY_MS)));
    void todayKey;
    for (const u of recentSignups) {
      const key = dayBucketKey(u.createdAt);
      const idx = keys.indexOf(key);
      if (idx >= 0) spark[idx]++;
    }

    return {
      status: 'ok',
      data: {
        total,
        newLast24h,
        newLast7d,
        newLast30d,
        paid,
        paidPct: total > 0 ? Math.round((paid / total) * 1000) / 10 : 0,
        activeLast7d,
        spark7d: spark,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}

export async function getProductStats(): Promise<ProviderResult<ProductStats>> {
  try {
    const since7d = new Date(Date.now() - 7 * DAY_MS);

    const sevenDayKeys: string[] = [];
    for (let i = 0; i < 7; i++) {
      sevenDayKeys.push(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10));
    }

    const [tripsTotal, tripsLast7d, recentTrips, tokenRows] = await Promise.all([
      prisma.tripDraft.count(),
      prisma.tripDraft.count({ where: { createdAt: { gte: since7d } } }),
      prisma.tripDraft.findMany({
        where: { createdAt: { gte: since7d } },
        select: { location: true, itinerary: true },
      }),
      prisma.dailyTokenUsage.findMany({
        where: { date: { in: sevenDayKeys } },
        select: { inputTokens: true, outputTokens: true },
      }).catch(() => [] as { inputTokens: number; outputTokens: number }[]),
    ]);

    const itinerariesGeneratedLast7d = recentTrips.filter((t) => t.itinerary && t.itinerary.length > 50).length;

    const inputTokens = tokenRows.reduce((acc, r) => acc + (r.inputTokens ?? 0), 0);
    const outputTokens = tokenRows.reduce((acc, r) => acc + (r.outputTokens ?? 0), 0);
    const agentTokensLast7d = inputTokens + outputTokens;
    // Blended estimate across Haiku planner + Sonnet synthesis: ~$2/M input,
    // ~$10/M output. Off by maybe 30% but good enough for trend tracking.
    const agentCostUsdLast7d = (inputTokens * 2 + outputTokens * 10) / 1_000_000;

    const locCounts = new Map<string, number>();
    for (const t of recentTrips) {
      if (!t.location) continue;
      const loc = t.location.trim();
      locCounts.set(loc, (locCounts.get(loc) ?? 0) + 1);
    }
    const topLocationsLast7d = Array.from(locCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([location, count]) => ({ location, count }));

    return {
      status: 'ok',
      data: {
        tripsTotal,
        tripsLast7d,
        itinerariesGeneratedLast7d,
        agentTokensLast7d,
        agentCostUsdLast7d: Math.round(agentCostUsdLast7d * 100) / 100,
        topLocationsLast7d,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
