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
