import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';
import { runAgent, type AgentEvent } from '@/lib/agent/loop';
import { getAgentTools } from '@/lib/agent/tools';
import { isAgentEnabledFor } from '@/lib/agent/feature-flag';
import { captureError } from '@/lib/sentry';
import { IDENTITY_VOICE_PRIMER } from '@/lib/voice/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
// Same 5-minute ceiling as /api/itinerary. The agent loop fans out
// multiple tool calls before synthesis; on big trips it routinely
// approaches 2-3 minutes. Default 60 s cuts it off mid-stream.
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are geknee's travel-planning agent. Plan trips by gathering real facts with tools BEFORE writing any prose.

${IDENTITY_VOICE_PRIMER}

Required tool order for itinerary generation:
1. recall_user_context with facets ["dietary", "past_trips", "plan_tier"] — personalization signals.
2. geocode the trip city to anchor coordinates.
3. weather_forecast for the trip's date window when within 14 days.
4. For each activity you propose: find_places near the anchor (never invent restaurant or business names) then geocode the result if you need precise coords.
5. route_between consecutive stops to validate transit time and pick the right mode.

Output rules:
- Markdown itinerary with bold place names. Each activity's transit segment starts with a mode token ([walk], [bike], [taxi], [subway], [bus], [train], [ferry], [flight]) and a duration estimate from route_between, not your guess.
- Honor dietary tags strictly — if the user is vegetarian, every recommended restaurant must have vegetarian options.
- Cite weather where it changes plans ("indoor backup: Day 2 rain expected").
- When the user mentions budget or asks about flight prices, use flight_search (needs IATA codes) and currency_convert to ground numbers in current rates instead of guessing.
- Never call the echo diagnostic tool during real planning.

EDIT MODE: when the user request includes "EXISTING ITINERARY:" you are in edit mode. Modify ONLY what the user asks to change. Keep every unchanged day verbatim. Do not regenerate the trip from scratch. Use the minimum number of tools necessary (often just one find_places or one route_between) to validate your change. Output the full updated markdown so the client can replace the saved itinerary.`;

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAgentEnabledFor(userId)) {
    return Response.json({ error: 'Agent not enabled for this account' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    tripId?: string;
    existing_itinerary?: string;
  };
  if (!body.prompt || typeof body.prompt !== 'string') {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }

  // Edit mode: client passes the current itinerary so the agent makes
  // a surgical change instead of regenerating the trip. Wrap it into
  // the user prompt rather than the system prompt so the system prompt
  // stays cacheable across both modes.
  const userPrompt = body.existing_itinerary
    ? `EXISTING ITINERARY (do not regenerate; modify only what is requested):\n---\n${body.existing_itinerary}\n---\n\nUSER REQUEST: ${body.prompt}`
    : body.prompt;

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
          userPrompt,
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
