import Anthropic from "@anthropic-ai/sdk";
import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import { auth } from "@/auth";
import { addTokenUsage } from "@/lib/tokenTracking";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  itinerary?: string;
  pageContext?: string;
  tripInfo?: { location?: string; nights?: string; purpose?: string; style?: string; budget?: string };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const sanitize = (s: string, max = 100) =>
    String(s).replace(/[\r\n\t]/g, " ").slice(0, max).trim();

  const raw = body.tripInfo ?? {};
  const location = sanitize(raw.location ?? "");
  const nights   = sanitize(raw.nights   ?? "", 10);
  const purpose  = sanitize(raw.purpose  ?? "");
  const style    = sanitize(raw.style    ?? "");
  const budget   = sanitize(raw.budget   ?? "");

  // Only include itinerary on the first user message — after that the assistant
  // already has context in the conversation history, no need to repeat it.
  const isFirstMessage = body.messages.filter(m => m.role === "user").length <= 1;
  const itinerarySection = isFirstMessage && (body.itinerary ?? "").trim()
    ? `\nCurrent itinerary (summary):\n${body.itinerary!.slice(0, 3000)}`
    : "";

  const pageSection = body.pageContext
    ? `\nCurrent page context:\n${body.pageContext}`
    : "";

  const system = `You are GeKnee, a magical, friendly travel genie embedded in a travel planning app. You assist travelers at every stage of their trip — from choosing a destination to booking and beyond.

Trip details (if known):
- Destination: ${location || "not yet chosen"}
- Duration: ${nights ? nights + " nights" : "not yet set"}
- Purpose: ${purpose || "not specified"} | Style: ${style || "not specified"} | Budget: ${budget || "not specified"}
${pageSection}${itinerarySection}

Guidelines:
- Be warm, enthusiastic, and concise (2-4 sentences or a short list)
- Give specific, real-world suggestions (actual place names, neighborhoods, restaurants)
- When asked for alternatives, provide exactly 3 options with a one-line reason each
- Match the traveler's stated style and budget when known
- If on the globe/discovery page, help them choose a destination with enthusiasm
- If on the preferences page, help them pick travel style, purpose, or budget
- If on the dates page, suggest best times to visit based on weather/events
- If on the booking page, give practical advice on flights, hotels, and activities
- Occasionally use a touch of genie personality (\u2728) but stay practical`;

  // Filter out empty assistant placeholders before sending to API
  const validMessages = body.messages.filter((m) => m.content.trim() !== "");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let inputTokens  = 0;
      let outputTokens = 0;
      try {
        const stream = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          stream: true,
          system,
          messages: validMessages,
        });

        for await (const event of stream as AsyncIterable<MessageStreamEvent>) {
          if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens;
          } else if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        // Append token sentinel (parsed by GlobalChat, stripped before display)
        controller.enqueue(
          encoder.encode(`\x1F{"i":${inputTokens},"o":${outputTokens}}`)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Chat error:", msg);
        controller.enqueue(
          encoder.encode("My magic fizzled for a moment! Please try again.")
        );
      } finally {
        controller.close();
        // Save usage in background — don't await to avoid delaying response close
        if (inputTokens || outputTokens) {
          const userId = (session.user as { id: string }).id;
          addTokenUsage(userId, inputTokens, outputTokens).catch(console.error);
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
