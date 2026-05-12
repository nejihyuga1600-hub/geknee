import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';
import { runAgent, type AgentEvent } from '@/lib/agent/loop';
import { getAgentTools } from '@/lib/agent/tools';
import { isAgentEnabledFor } from '@/lib/agent/feature-flag';
import { captureError } from '@/lib/sentry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SYSTEM_PROMPT = `You are geknee's travel-planning agent. Plan trips by gathering real facts with tools BEFORE writing any prose.

Required tool order for itinerary generation:
1. recall_user_context with facets ["dietary", "past_trips", "plan_tier"] — personalization signals.
2. geocode the trip city to anchor coordinates.
3. weather_forecast for the trip's date window when within 14 days.
4. For each activity you propose: find_places near the anchor (never invent restaurant or business names) then geocode the result if you need precise coords.
5. route_between consecutive stops to validate transit time and pick the right mode.

Output rules:
- Markdown itinerary with bold place names. Each activity line starts with a transit emoji (🚶 walking, 🚲 cycling, 🚕 driving, 🚇 transit) and a duration estimate from route_between, not your guess.
- Honor dietary tags strictly — if the user is vegetarian, every recommended restaurant must have vegetarian options.
- Cite weather where it changes plans ("indoor backup: Day 2 rain expected").
- When the user mentions budget or asks about flight prices, use flight_search (needs IATA codes) and currency_convert to ground numbers in current rates instead of guessing.
- Never call the echo diagnostic tool during real planning.`;

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAgentEnabledFor(userId)) {
    return Response.json({ error: 'Agent not enabled for this account' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; tripId?: string };
  if (!body.prompt || typeof body.prompt !== 'string') {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await runAgent({
          client,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: body.prompt!,
          tools: getAgentTools(),
          ctx: { userId, tripId: body.tripId },
          onEvent: send,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        captureError(err, { route: '/api/agent', userId, tripId: body.tripId });
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
