import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { isAgentEnabledFor } from "@/lib/agent/feature-flag";
import { runAgent } from "@/lib/agent/loop";
import { getAgentTools } from "@/lib/agent/tools";
import { captureError } from "@/lib/sentry";
import { IDENTITY_VOICE_PRIMER } from "@/lib/voice/identity";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Force per-request rendering and disable buffering. Without these,
// Vercel's default routing buffers the streaming body until the whole
// response is generated, so the user sees a frozen UI until completion
// (then everything appears at once). Also raise maxDuration above the
// 60 s Pro default — agent-path replans pull tool calls before the
// first text byte and can run 30-90 s.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  "Transfer-Encoding": "chunked",
  "Connection": "keep-alive",
};

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

  const systemPrompt = `You replan single sections of travel itineraries for geknee's wanderers. Use tools (find_places, route_between, weather_forecast) to validate restaurant names and transit times BEFORE outputting. Output only the rewritten section markdown — no preamble, no commentary, no explanation.

${IDENTITY_VOICE_PRIMER}`;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // 8 KB prime breaks through Vercel/Node small-write buffering so
      // the client's reader wakes up before the first real byte.
      try { controller.enqueue(encoder.encode(" ".repeat(8192) + "\n")); } catch {}
      let firstDeltaSeen = false;
      const heartbeat = setInterval(() => {
        if (firstDeltaSeen) return;
        try { controller.enqueue(encoder.encode(" ".repeat(64) + "\n")); } catch {}
      }, 500);
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
            if (e.type === "text") {
              firstDeltaSeen = true;
              try { controller.enqueue(encoder.encode(e.delta)); } catch {}
            }
          },
        });
      } catch (err) {
        captureError(err, { route: "/api/itinerary/replan", path: "agent", userId });
        try { controller.enqueue(encoder.encode("\n\n[Error regenerating section. Please try again.]")); } catch {}
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(readable, { headers: STREAM_HEADERS });
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

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try { controller.enqueue(encoder.encode(" ".repeat(8192) + "\n")); } catch {}
      let firstDeltaSeen = false;
      const heartbeat = setInterval(() => {
        if (firstDeltaSeen) return;
        try { controller.enqueue(encoder.encode(" ".repeat(64) + "\n")); } catch {}
      }, 500);
      try {
        const stream = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            firstDeltaSeen = true;
            try { controller.enqueue(encoder.encode(chunk.delta.text)); } catch {}
          }
        }
      } catch (err) {
        console.error("[itinerary/replan/legacy] error:", err);
        captureError(err, { route: "/api/itinerary/replan", path: "legacy" });
        try { controller.enqueue(encoder.encode("\n\n[Error regenerating section. Please try again.]")); } catch {}
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(readable, { headers: STREAM_HEADERS });
}
