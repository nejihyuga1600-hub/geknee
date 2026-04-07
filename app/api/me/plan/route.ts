import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { FREE_LIMITS } from '@/lib/plan';

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ plan: 'free', itineraryGenerations: 0, savedTripCount: 0 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      itineraryGenerations: true,
      generationsResetAt: true,
      _count: { select: { trips: true } },
    },
  });

  if (!user) return Response.json({ plan: 'free', itineraryGenerations: 0, savedTripCount: 0 });

  return Response.json({
    plan: user.plan,
    itineraryGenerations: user.itineraryGenerations,
    generationsResetAt: user.generationsResetAt,
    savedTripCount: user._count.trips,
    limits: FREE_LIMITS,
  });
}
