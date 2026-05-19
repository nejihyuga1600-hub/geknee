import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { applySuggestion } from '@/lib/suggestions/apply';

type Params = Promise<{ id: string; suggestionId: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const body = await req.json().catch(() => ({})) as { action?: string; bySystem?: boolean };
  if (body.action !== 'accept' && body.action !== 'reject') {
    return Response.json({ error: 'invalid_action' }, { status: 400 });
  }

  const [trip, s] = await Promise.all([
    prisma.tripDraft.findUnique({ where: { id: tripId }, select: { userId: true, suggestionVoteMode: true } }),
    prisma.itinerarySuggestion.findUnique({ where: { id: suggestionId } }),
  ]);
  if (!trip || !s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });
  if (s.status === 'accepted' || s.status === 'rejected') {
    return Response.json({ ok: true, alreadyClosed: true });
  }

  const isAutoFinalize = body.bySystem === true
    && s.status === 'pending_apply'
    && trip.suggestionVoteMode === 'auto_majority'
    && s.autoApplyAt !== null
    && s.autoApplyAt.getTime() <= Date.now();

  const isOwnerAction = trip.userId === userId;
  if (!isOwnerAction && !isAutoFinalize) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  if (body.action === 'reject') {
    await prisma.itinerarySuggestion.update({
      where: { id: suggestionId },
      data: { status: 'rejected', appliedById: userId, appliedAt: new Date() },
    });
    return Response.json({ ok: true });
  }

  const result = await applySuggestion(suggestionId);
  if (!result.ok) {
    return Response.json({ error: result.error ?? 'apply_failed' }, { status: 500 });
  }
  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: { appliedById: userId },
  });
  return Response.json({ ok: true });
}
