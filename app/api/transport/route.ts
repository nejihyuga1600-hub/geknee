import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TransportBody {
  stops: Array<{ city: string; startDate: string; endDate: string }>;
}

export interface TransportLeg {
  from: string;
  to: string;
  type: "flight" | "train" | "bus" | "ferry" | "subway";
  duration: string;
  notes: string;
  departureDate: string;
}

const TRANSPORT_RULES = `Transport type rules:
- "flight": distance > 600km or no practical overland route
- "train": < 600km and rail service exists (prefer train for 100-500km in Europe/Japan)
- "bus": < 400km, no train service, budget route
- "ferry": water crossing required (islands, fjords, coastal)
- "subway": same metro area, just a short urban hop

Be specific — name the actual train service, airline route, ferry company, or bus company.`;

function buildLegPrompt(from: string, to: string, departureDate: string): string {
  return `You are a travel logistics expert. Determine the single best transport option for this journey.

From: ${from} (departing ${departureDate})
To: ${to}

${TRANSPORT_RULES}

Return ONLY a raw JSON object (no markdown, no code fences):
{
  "from": "${from}",
  "to": "${to}",
  "type": "train",
  "duration": "3h 20m",
  "notes": "Thalys high-speed train from Gare du Nord. Book on Eurostar or SNCF.",
  "departureDate": "${departureDate}"
}`;
}

async function fetchLeg(from: string, to: string, departureDate: string): Promise<TransportLeg | null> {
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: buildLegPrompt(from, to, departureDate) }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(raw) as TransportLeg;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: TransportBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  if (!body.stops || body.stops.length < 2) {
    return Response.json({ legs: [] });
  }

  const legPairs = body.stops.slice(0, -1).map((stop, i) => ({
    from: stop.city,
    to: body.stops[i + 1].city,
    departureDate: stop.endDate,
  }));

  // Fire all leg requests in parallel — fast and reliable for real-time use
  const results = await Promise.all(
    legPairs.map((leg) => fetchLeg(leg.from, leg.to, leg.departureDate))
  );

  const legs = results.filter((l): l is TransportLeg => l !== null);
  return Response.json({ legs });
}
