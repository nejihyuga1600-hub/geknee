import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const body = await req.json();
  const { itinerary, bookmarks, tripInfo } = body as {
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
  };

  const destinationList = bookmarks
    .map((b, i) => `${i + 1}. ${b.name}`)
    .join("\n");

  const prompt = `You are a travel planning expert optimizing an existing itinerary to include additional destinations the traveler has handpicked.

Trip context:
- Main destination: ${tripInfo.location}
- Duration: ${tripInfo.nights} nights (${tripInfo.startDate} to ${tripInfo.endDate})
- Travel purpose: ${tripInfo.purpose}
- Travel style: ${tripInfo.style}
- Budget: ${tripInfo.budget}

Destinations the traveler wants to add:
${destinationList}

Current itinerary:
${itinerary}

Your task — rewrite the full itinerary inserting each bookmarked destination on the day where it fits best:
1. Geographic efficiency: group the new place with nearby existing activities on the same day to minimise backtracking.
2. Transport logic: prefer days where the traveler is already passing through or near that area.
3. Cost efficiency: combine transport legs where possible; avoid extra long-distance detours.
4. Time-of-day fit: morning sights early, evening spots late — adjust timing notes accordingly.
5. If a new destination warrants its own day (e.g. a day trip to a different city), add it clearly.
6. Keep every existing day that doesn't need changes exactly as-is.
7. Maintain the same markdown format: ## Day N: Title headings, bullet points, time blocks, cost estimates.

Output the COMPLETE revised itinerary — all sections — in markdown. No preamble, no commentary, just the itinerary.`;

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
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
