import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { shouldAutoApply, AUTO_APPLY_WINDOW_MS } from '@/lib/suggestions/threshold';

const MAX_ALT_LEN = 280;

type Params = Promise<{ id: string; suggestionId: string }>;

async function recountAndMaybeQueueAutoApply(suggestionId: string, tripId: string) {
  const [up, down, trip] = await Promise.all([
    prisma.suggestionVote.count({ where: { suggestionId, vote: 'up' } }),
    prisma.suggestionVote.count({ where: { suggestionId, vote: 'down' } }),
    prisma.tripDraft.findUnique({ where: { id: tripId }, select: { suggestionVoteMode: true } }),
  ]);

  const suggestion = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { kind: true, status: true },
  });
  if (!suggestion) return;

  const autoCondition = trip?.suggestionVoteMode === 'auto_majority'
    && shouldAutoApply(suggestion.kind, up, down);
  const enteringPendingApply = autoCondition && suggestion.status === 'pending';
  const cancelPendingApply = !autoCondition && suggestion.status === 'pending_apply';

  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: {
      votesUpCount: up,
      votesDownCount: down,
      ...(enteringPendingApply ? {
        status: 'pending_apply',
        autoApplyAt: new Date(Date.now() + AUTO_APPLY_WINDOW_MS),
      } : {}),
      ...(cancelPendingApply ? {
        status: 'pending',
        autoApplyAt: null,
      } : {}),
    },
  });
}

export async function POST(req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const body = await req.json().catch(() => ({})) as { vote?: string; alternative?: string };
  if (body.vote !== 'up' && body.vote !== 'down') {
    return Response.json({ error: 'invalid_vote' }, { status: 400 });
  }
  const alternative = typeof body.alternative === 'string'
    ? body.alternative.trim().slice(0, MAX_ALT_LEN) || null
    : null;

  const s = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { tripId: true, status: true },
  });
  if (!s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });
  if (s.status === 'accepted' || s.status === 'rejected' || s.status === 'expired' || s.status === 'superseded') {
    return Response.json({ error: 'closed' }, { status: 409 });
  }

  await prisma.suggestionVote.upsert({
    where: { suggestionId_userId: { suggestionId, userId } },
    create: { suggestionId, userId, vote: body.vote, alternative },
    update: { vote: body.vote, alternative },
  });

  const latest = await prisma.suggestionVote.findFirst({
    where: { suggestionId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  await prisma.itinerarySuggestion.update({
    where: { id: suggestionId },
    data: { latestVoteId: latest?.id ?? null },
  });

  await recountAndMaybeQueueAutoApply(suggestionId, tripId);

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  if (!CHAT_SUGGESTIONS_ENABLED) return Response.json({ error: 'feature_disabled' }, { status: 404 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId, suggestionId } = await params;
  const s = await prisma.itinerarySuggestion.findUnique({
    where: { id: suggestionId },
    select: { tripId: true },
  });
  if (!s || s.tripId !== tripId) return Response.json({ error: 'not_found' }, { status: 404 });

  await prisma.suggestionVote.deleteMany({ where: { suggestionId, userId } });
  await recountAndMaybeQueueAutoApply(suggestionId, tripId);

  return Response.json({ ok: true });
}
