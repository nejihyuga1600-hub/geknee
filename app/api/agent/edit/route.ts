import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAgentEnabledFor } from '@/lib/agent/feature-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
// Agent edits fan out to multiple tool calls before synthesizing the
// edited itinerary; 60 s Pro default isn't enough. 300 s matches
// /api/itinerary so smart-edit doesn't get cut off mid-stream.
export const maxDuration = 300;

// Convenience endpoint: looks up the trip's saved itinerary and forwards
// to /api/agent in edit mode. Saves the client a round-trip and ensures
// the agent always sees the canonical persisted version, not a stale
// in-memory copy.
//
// POST { tripId: string, prompt: string }
//   → SSE stream from the agent (same shape as /api/agent)
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAgentEnabledFor(userId)) {
    return Response.json({ error: 'Agent not enabled for this account' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { tripId?: string; prompt?: string };
  if (!body.tripId || !body.prompt) {
    return Response.json({ error: 'tripId and prompt required' }, { status: 400 });
  }

  const trip = await prisma.tripDraft.findUnique({
    where: { id: body.tripId },
    select: { userId: true, itinerary: true },
  });
  if (!trip || trip.userId !== userId) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }
  if (!trip.itinerary) {
    return Response.json(
      { error: 'No saved itinerary to edit. Generate one first via /api/agent.' },
      { status: 400 },
    );
  }

  // Forward to /api/agent. We can't internal-fetch with cookies cleanly
  // in Next.js, so reuse the runAgent logic directly here. Cookies don't
  // need to flow because we already auth'd above and pass userId via ctx.
  const { runAgent } = await import('@/lib/agent/loop');
  const { getAgentTools } = await import('@/lib/agent/tools');
  const { captureError } = await import('@/lib/sentry');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const SYSTEM_PROMPT = `You are geknee's travel-planning agent in EDIT MODE. The user has an existing itinerary and wants to make a specific change. Modify ONLY what they asked. Keep every unchanged day verbatim. Use the minimum tools necessary to validate your change (often just one find_places or one route_between). Output the full updated markdown itinerary so the client can replace the saved version.`;

  const userPrompt = `EXISTING ITINERARY:\n---\n${trip.itinerary}\n---\n\nUSER REQUEST: ${body.prompt}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await runAgent({
          client,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
          tools: getAgentTools(),
          ctx: { userId, tripId: body.tripId },
          onEvent: send,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        captureError(err, { route: '/api/agent/edit', userId, tripId: body.tripId });
        send({ type: 'tool_error', name: '__agent__', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
