import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { isAgentEnabledFor } from "@/lib/agent/feature-flag";
import { runAgent } from "@/lib/agent/loop";
import { getAgentTools } from "@/lib/agent/tools";
import { captureError } from "@/lib/sentry";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      try {
        await runAgent({
          client,
          systemPrompt,
          userPrompt,
          tools: getAgentTools(),
          ctx: { userId },
          onEvent: (e) => {
            if (e.type === "text") controller.enqueue(encoder.encode(e.delta));
          },
        });
      } catch (err) {
        captureError(err, { route: "/api/itinerary/optimize", path: "agent", userId });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function runLegacy(body: OptimizeBody): Promise<Response> {
  const prompt = `You are a travel planning expert optimizing an existing itinerary to include additional destinations the traveler has handpicked.

${buildPromptShared(body)}`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
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
