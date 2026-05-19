import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { checkChatSuggestQuota } from '@/lib/plan';
import { CHAT_SUGGESTIONS_ENABLED } from '@/lib/suggestions/featureFlag';
import { buildUserPrompt, SUGGESTION_SYSTEM_PROMPT } from '@/lib/suggestions/prompt';
import { parseAndValidate } from '@/lib/suggestions/validate';

const MAX_RECENT_MESSAGES = 25;   // cost lever
const MAX_HISTORY = 10;
const SUGGESTION_TTL_DAYS = 7;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!CHAT_SUGGESTIONS_ENABLED) {
    return Response.json({ error: 'feature_disabled' }, { status: 404 });
  }

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tripId } = await params;
  const trip = await prisma.tripDraft.findUnique({ where: { id: tripId } });
  if (!trip) return Response.json({ error: 'Trip not found' }, { status: 404 });

  const [latestMsg, latestVote] = await Promise.all([
    prisma.tripMessage.findFirst({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
    prisma.suggestionVote.findFirst({
      where: { suggestion: { tripId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);

  if (!latestMsg) {
    return Response.json({ suggestions: [], reason: 'no_messages' });
  }

  // Cache hit
  const cached = await prisma.itinerarySuggestion.findMany({
    where: {
      tripId,
      latestMessageId: latestMsg.id,
      latestVoteId: latestVote?.id ?? null,
      status: { in: ['pending', 'pending_apply'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { votes: true },
  });
  if (cached.length > 0) {
    return Response.json({ suggestions: cached, cached: true });
  }

  // Rate limit only on cache miss
  const quota = await checkChatSuggestQuota(userId, tripId);
  if (!quota.allowed) {
    return Response.json({ error: 'rate_limit', resetAt: quota.resetAt }, { status: 429 });
  }

  const [messages, prior] = await Promise.all([
    prisma.tripMessage.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: MAX_RECENT_MESSAGES,
    }).then(rows => rows.reverse()),
    prisma.itinerarySuggestion.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
      include: { votes: { where: { alternative: { not: null } } } },
    }),
  ]);

  const prompt = buildUserPrompt({
    trip: {
      id: trip.id, title: trip.title, location: trip.location,
      startDate: trip.startDate, endDate: trip.endDate,
      itinerary: trip.itinerary,
    },
    messages: messages.map(m => ({ id: m.id, author: m.author, content: m.content, createdAt: m.createdAt })),
    history: prior.map(p => ({
      status: p.status, kind: p.kind, dayNumber: p.dayNumber, summary: p.summary,
      votesUpCount: p.votesUpCount, votesDownCount: p.votesDownCount,
      alternatives: p.votes
        .filter(v => v.alternative)
        .map(v => ({ author: v.userId, text: v.alternative as string })),
    })),
  });

  // Split for prompt caching: stable prefix (trip + itinerary) vs volatile tail (chat + history)
  const stableHeader = prompt.split('\nRECENT CHAT')[0];
  const volatileTail = '\nRECENT CHAT' + prompt.split('\nRECENT CHAT').slice(1).join('\nRECENT CHAT');

  let raw = '';
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [
        { type: 'text', text: SUGGESTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: stableHeader, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: volatileTail },
        ],
      }],
    });
    const block = resp.content.find(b => b.type === 'text');
    if (block && block.type === 'text') raw = block.text;
  } catch (err) {
    console.error('suggest-from-chat: Anthropic call failed', err);
    return Response.json({ error: 'ai_failed' }, { status: 502 });
  }

  const validated = parseAndValidate(raw);

  // Supersede prior pending rows
  await prisma.itinerarySuggestion.updateMany({
    where: { tripId, status: 'pending' },
    data: { status: 'superseded' },
  });

  if (validated.length === 0) {
    return Response.json({ suggestions: [], reason: 'no_change_suggested' });
  }

  const expiresAt = new Date(Date.now() + SUGGESTION_TTL_DAYS * 86400_000);
  const created = await Promise.all(validated.map(v =>
    prisma.itinerarySuggestion.create({
      data: {
        tripId,
        kind: v.kind,
        dayNumber: v.dayNumber,
        summary: v.summary,
        rationale: v.rationale,
        payload: v.payload as unknown as Prisma.InputJsonValue,
        basedOnMessageIds: v.basedOnMessageIds,
        latestMessageId: latestMsg.id,
        latestVoteId: latestVote?.id ?? null,
        expiresAt,
      },
      include: { votes: true },
    })
  ));

  return Response.json({ suggestions: created, cached: false });
}
