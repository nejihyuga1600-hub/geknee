import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { getTripAccess } from '@/lib/tripAccess';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ suggestions: [] });

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  if (!(await getTripAccess(tripId, userId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  const suggestions = await prisma.itinerarySuggestion.findMany({
    where: { tripId, status: { in: ['pending', 'pending_apply'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      votes: {
        select: { id: true, userId: true, vote: true, alternative: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return Response.json({ suggestions });
}
