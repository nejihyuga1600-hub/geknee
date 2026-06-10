import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { isAgentEnabledFor } from "@/lib/agent/feature-flag";
import { runAgent } from "@/lib/agent/loop";
import { getAgentTools } from "@/lib/agent/tools";
import { captureError } from "@/lib/sentry";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Optimize rewrites the full itinerary — easily 30–90 s on the agent
// path (route_between calls per bookmark + synthesis). Default 60 s
// Pro timeout cuts it off mid-stream; bump to 300 s like /api/itinerary.
// Disable buffering so deltas reach the client live.
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

interface OptimizeBody {
  itinerary: string;
  bookmarks: Array<{ name: string; coords: [number, number] }>;
  tripInfo: {
    location: string;
    nights: string;
    startDate: string;
    endDate: string;
    purpose: string;
    style: string;
    budget: string;
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = (session.user as { id?: string }).id;

  const body = (await req.json()) as OptimizeBody;

  if (userId && isAgentEnabledFor(userId)) {
    return runViaAgent(body, userId);
  }
  return runLegacy(body);
}

function buildPromptShared(body: OptimizeBody): string {
  const destinationList = body.bookmarks
    .map((b, i) => `${i + 1}. ${b.name} [${b.coords[0]},${b.coords[1]}]`)
    .join("\n");
  return `Trip context:
- Main destination: ${body.tripInfo.location}
- Duration: ${body.tripInfo.nights} nights (${body.tripInfo.startDate} to ${body.tripInfo.endDate})
- Travel purpose: ${body.tripInfo.purpose}
- Travel style: ${body.tripInfo.style}
- Budget: ${body.tripInfo.budget}

Destinations the traveler wants added:
${destinationList}

Current itinerary:
${body.itinerary}

Rewrite the full itinerary inserting each bookmarked destination on the day where it fits best:
1. Geographic efficiency: group new places with nearby existing activities to minimise backtracking.
2. Transport logic: prefer days the traveler is already passing through that area.
3. Cost efficiency: combine transport legs when possible.
4. Time-of-day fit: morning sights early, evening spots late.
5. If a new destination warrants its own day, add it.
6. Keep every existing day that doesn't need changes exactly as-is.
7. Maintain the same markdown format: ## Day N: Title headings, bullet points, time blocks, cost estimates.

Output the COMPLETE revised itinerary in markdown. No preamble, no commentary.`;
}

async function runViaAgent(body: OptimizeBody, userId: string): Promise<Response> {
  const userPrompt = `EXISTING ITINERARY (this is what you are revising):
${buildPromptShared(body)}`;
  const systemPrompt = `You optimize travel itineraries by inserting newly-bookmarked destinations on the days where they fit best. Use route_between to verify which existing day each new place is geographically nearest to. Use find_places only when you need to validate a name. Output the COMPLETE rewritten itinerary in markdown — no preamble, no commentary.`;

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
        await runAgent({
          client,
          systemPrompt,
          userPrompt,
          tools: getAgentTools(),
          ctx: { userId },
          onEvent: (e) => {
            if (e.type === "text") {
              firstDeltaSeen = true;
              try { controller.enqueue(encoder.encode(e.delta)); } catch {}
            }
          },
        });
      } catch (err) {
        captureError(err, { route: "/api/itinerary/optimize", path: "agent", userId });
        try { controller.enqueue(encoder.encode("\n\n[Error optimizing itinerary. Please try again.]")); } catch {}
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(readable, { headers: STREAM_HEADERS });
}

async function runLegacy(body: OptimizeBody): Promise<Response> {
  const prompt = `You are a travel planning expert optimizing an existing itinerary to include additional destinations the traveler has handpicked.

${buildPromptShared(body)}`;

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
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            firstDeltaSeen = true;
            try { controller.enqueue(encoder.encode(chunk.delta.text)); } catch {}
          }
        }
      } catch (err) {
        console.error("[itinerary/optimize/legacy] error:", err);
        captureError(err, { route: "/api/itinerary/optimize", path: "legacy" });
        try { controller.enqueue(encoder.encode("\n\n[Error optimizing itinerary. Please try again.]")); } catch {}
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(readable, { headers: STREAM_HEADERS });
}
