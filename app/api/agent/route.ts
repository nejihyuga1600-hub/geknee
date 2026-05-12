import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/auth';
import { runAgent, type AgentEvent } from '@/lib/agent/loop';
import { getAgentTools } from '@/lib/agent/tools';
import { isAgentEnabledFor } from '@/lib/agent/feature-flag';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SYSTEM_PROMPT = `You are geknee's travel-planning agent. Use the available tools to gather facts (places, weather, routes, prices) before composing answers. Prefer tool output over your own recall when they conflict. Output a clear markdown itinerary when the user asks for one. Never call diagnostic tools (e.g. echo) during real planning unless explicitly told to test the agent.`;

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
