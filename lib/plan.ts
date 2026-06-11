import { prisma } from '@/lib/prisma';

const DEVELOPER_EMAILS = new Set(
  (process.env.DEVELOPER_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

export async function isDevAccount(userId: string): Promise<boolean> {
  if (DEVELOPER_EMAILS.size === 0) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return !!user?.email && DEVELOPER_EMAILS.has(user.email.toLowerCase());
}

export const FREE_LIMITS = {
  savedTrips: 3,
  generationsPerMonth: 3,
  maxStops: 2, // origin + 1 additional city
} as const;

export async function getUserPlan(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      plan: true,
      itineraryGenerations: true,
      generationsResetAt: true,
      _count: { select: { trips: true } },
    },
  });
  return {
    plan: user.plan as 'free' | 'pro',
    itineraryGenerations: user.itineraryGenerations,
    generationsResetAt: user.generationsResetAt,
    savedTripCount: user._count.trips,
  };
}

export async function checkAndIncrementGeneration(
  userId: string
): Promise<{ allowed: boolean; reason?: string }> {
  if (await isDevAccount(userId)) return { allowed: true };
  const info = await getUserPlan(userId);
  if (info.plan === 'pro') return { allowed: true };

  const now = new Date();
  const resetMonth = new Date(info.generationsResetAt);
  const windowExpired =
    now.getFullYear() > resetMonth.getFullYear() ||
    now.getMonth() > resetMonth.getMonth();

  if (windowExpired) {
    await prisma.user.update({
      where: { id: userId },
      data: { itineraryGenerations: 1, generationsResetAt: now },
    });
    return { allowed: true };
  }

  if (info.itineraryGenerations >= FREE_LIMITS.generationsPerMonth) {
    return {
      allowed: false,
      reason: `You've used all ${FREE_LIMITS.generationsPerMonth} free AI generations this month. Upgrade to Pro for unlimited itineraries.`,
    };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { itineraryGenerations: { increment: 1 } },
  });
  return { allowed: true };
}

export async function checkTripSaveLimit(userId: string): Promise<string | null> {
  if (await isDevAccount(userId)) return null;
  const info = await getUserPlan(userId);
  if (info.plan === 'pro') return null;
  if (info.savedTripCount >= FREE_LIMITS.savedTrips) {
    return `Free plan allows ${FREE_LIMITS.savedTrips} saved trips. Upgrade to Pro for unlimited.`;
  }
  return null;
}


const FREE_SUGGEST_PER_DAY = 1;   // cost lever: free tier is a taste; heavy use upgrades to Pro
const PRO_SUGGEST_PER_DAY  = 20;

// Media upload (photo/video → itinerary). Caps Anthropic vision spend per
// user per month so a single power user can't burn the bill on a vlog
// upload spree. Both photo and video paths share this counter — videos
// already get a separate cost guardrail via single-frame extraction +
// the 60 s / 40 MB client caps (see PhotoToItinerary.extractMidFrame).
//
// Sustainability math at 10k MAU:
//   Free 30 × $0.005 × 10k        = $1.5k worst-case if everyone caps out
//   Realistic 3/user × $0.005 × 10k = $150/mo — comfortable.
//   Pro 200 limit is wide on purpose; the Pro fee covers it many times over.
const FREE_MEDIA_PER_MONTH = 30;
const PRO_MEDIA_PER_MONTH  = 200;
const MEDIA_USAGE_TRIP_KEY = '__media__';

/** Check whether a user may upload another photo/video for vision analysis this month. */
export async function checkMediaQuota(
  userId: string,
): Promise<{ allowed: true; remaining: number } | { allowed: false; reason: 'rate_limit'; resetAt: string; limit: number }> {
  if (await isDevAccount(userId)) return { allowed: true, remaining: PRO_MEDIA_PER_MONTH };

  // YYYY-MM key so a user's quota rolls over on the 1st (UTC).
  const month = new Date().toISOString().slice(0, 7);
  const info = await getUserPlan(userId);
  const limit = info.plan === 'pro' ? PRO_MEDIA_PER_MONTH : FREE_MEDIA_PER_MONTH;

  // Piggyback on ChatSuggestUsage so this ships without a migration —
  // tripId is a sentinel ('__media__') so it doesn't collide with real
  // trip ids, and `day` carries the month string instead of a date.
  const row = await prisma.chatSuggestUsage.upsert({
    where: { userId_tripId_day: { userId, tripId: MEDIA_USAGE_TRIP_KEY, day: month } },
    create: { userId, tripId: MEDIA_USAGE_TRIP_KEY, day: month, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > limit) {
    // Roll back so a denied call doesn't permanently burn quota.
    await prisma.chatSuggestUsage.update({
      where: { id: row.id },
      data: { count: { decrement: 1 } },
    });
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    next.setUTCHours(0, 0, 0, 0);
    return { allowed: false, reason: 'rate_limit', resetAt: next.toISOString(), limit };
  }
  return { allowed: true, remaining: Math.max(0, limit - row.count) };
}

/** Check whether a user may trigger another AI suggestion call for this trip today. */
export async function checkChatSuggestQuota(
  userId: string,
  tripId: string,
): Promise<{ allowed: true } | { allowed: false; reason: 'rate_limit'; resetAt: string }> {
  if (await isDevAccount(userId)) return { allowed: true };

  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const info = await getUserPlan(userId);
  const limit = info.plan === 'pro' ? PRO_SUGGEST_PER_DAY : FREE_SUGGEST_PER_DAY;

  const row = await prisma.chatSuggestUsage.upsert({
    where: { userId_tripId_day: { userId, tripId, day } },
    create: { userId, tripId, day, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (row.count > limit) {
    // Roll back the increment so a denied call doesn't burn budget
    await prisma.chatSuggestUsage.update({
      where: { id: row.id },
      data: { count: { decrement: 1 } },
    });
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return { allowed: false, reason: 'rate_limit', resetAt: tomorrow.toISOString() };
  }

  return { allowed: true };
}
