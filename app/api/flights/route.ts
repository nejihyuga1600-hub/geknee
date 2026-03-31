import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface FlightsBody {
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export async function POST(req: Request) {
  let body: FlightsBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const { origin, destination, startDate, endDate } = body;

  const prompt = `You are a flight search expert with knowledge of real airline routes and typical prices.

Generate 4 realistic flight options for:
Route: ${origin} → ${destination}
Outbound date: ${startDate}
Return date: ${endDate}

Return ONLY a raw JSON array (no markdown, no code fences) with exactly this structure:
[
  {
    "airline": "Delta Air Lines",
    "code": "DL",
    "price": "$420",
    "priceNote": "per person, round trip, Economy",
    "outbound": {
      "departure": "07:15",
      "arrival": "14:30",
      "duration": "7h 15m",
      "stops": "Nonstop",
      "airports": "JFK → CDG"
    },
    "inbound": {
      "departure": "10:00",
      "arrival": "13:45+1",
      "duration": "8h 45m",
      "stops": "Nonstop",
      "airports": "CDG → JFK"
    },
    "cabin": "Economy",
    "highlight": "Best value nonstop",
    "airlineUrl": "https://www.delta.com/us/en/flight-search/book-a-flight"
  }
]

Rules:
- Use REAL airlines that actually fly this route (major carriers + budget airlines + regional)
- Use REALISTIC typical prices for Economy class on this route
- Use REAL airport IATA codes in the airports field (e.g. "JFK → CDG")
- Use realistic flight durations and layover cities if applicable
- Vary options: 1-2 nonstop (if available on route), 1-2 with stops, include a budget option
- Sort by price ascending
- airlineUrl = that airline's flight search/booking page URL
- highlight = short selling point (e.g. "Best value nonstop", "Budget pick", "Premium carrier", "Most convenient times")
- If route has no nonstop service, all options should have stops
- Use realistic departure/arrival times spread across the day`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No response");

    const raw = textBlock.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const flights = JSON.parse(raw);
    return Response.json({ flights });
  } catch (err) {
    console.error("Flights error:", err);
    return Response.json({ error: "Failed to get flight options" }, { status: 500 });
  }
}
