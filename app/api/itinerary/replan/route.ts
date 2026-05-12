import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { isAgentEnabledFor } from "@/lib/agent/feature-flag";
import { runAgent } from "@/lib/agent/loop";
import { getAgentTools } from "@/lib/agent/tools";
import { captureError } from "@/lib/sentry";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ReplanBody {
  section: string;     // markdown of the section to rewrite
  itinerary: string;   // full itinerary for context
  tripInfo: { location: string; nights: string; purpose: string; style: string; budget: string };
  instruction?: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = (session.user as { id?: string }).id;

  const body = (await req.json()) as ReplanBody;

  // Agent-enabled users get tool-grounded section replanning. Same
  // plain-text response contract so the existing client doesn't notice
  // the swap.
  if (userId && isAgentEnabledFor(userId)) {
    return runViaAgent(body, userId);
  }
  return runLegacy(body);
}

async function runViaAgent(body: ReplanBody, userId: string): Promise<Response> {
  const { section, itinerary, tripInfo, instruction } = body;
  const userPrompt = `EXISTING ITINERARY:
---
${itinerary}
---

The user wants to replan ONLY this section:
\`\`\`markdown
${section}
\`\`\`

Trip context: ${tripInfo.location}, ${tripInfo.nights} nights, ${tripInfo.purpose} purpose, ${tripInfo.style} style, ${tripInfo.budget} budget.
${instruction ? `Specific instruction: "${instruction}"` : ""}

Output ONLY the rewritten section markdown. Keep the same heading. Match the existing bullet/time-block format. No preamble, no commentary.`;

  const systemPrompt = `You replan single sections of travel itineraries. Use tools (find_places, route_between, weather_forecast) to validate restaurant names and transit times BEFORE outputting. Output only the rewritten section markdown — no preamble, no commentary, no explanation.`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        await runAgent({
          client,
          systemPrompt,
          userPrompt,
          tools: getAgentTools(),
          ctx: { userId },
          onEvent: (e) => {
            // Adapt SSE events → plain text. Existing client expects raw
            // text deltas, not data: framed events.
            if (e.type === "text") controller.enqueue(encoder.encode(e.delta));
          },
        });
      } catch (err) {
        captureError(err, { route: "/api/itinerary/replan", path: "agent", userId });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function runLegacy(body: ReplanBody): Promise<Response> {
  const { section, itinerary, tripInfo, instruction } = body;
  const instructionNote = instruction ? `\nSpecific instruction from the traveler: "${instruction}"` : "";

  const prompt = `You are replanning one section of an existing travel itinerary.

Trip context:
- Destination: ${tripInfo.location}
- Duration: ${tripInfo.nights} nights
- Purpose: ${tripInfo.purpose}
- Style: ${tripInfo.style}
- Budget: ${tripInfo.budget}
${instructionNote}

Full itinerary for reference (do NOT reproduce this, only use it as context):
${itinerary}

Section to replan:
${section}

Rewrite ONLY the section above. Keep the same markdown heading (## ...) but replace the content with an improved version. Match the format exactly (bullet points, time blocks, cost estimates). Output only the rewritten section — no preamble, no commentary.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
