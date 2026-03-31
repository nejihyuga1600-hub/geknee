import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const body = await req.json();
  const { section, itinerary, tripInfo, instruction } = body as {
    section:    string;   // markdown text of the section to replan
    itinerary:  string;   // full itinerary for context
    tripInfo:   { location: string; nights: string; purpose: string; style: string; budget: string };
    instruction?: string; // optional user note e.g. "make it more budget-friendly"
  };

  const instructionNote = instruction
    ? `\nSpecific instruction from the traveler: "${instruction}"`
    : "";

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
