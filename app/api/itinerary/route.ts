import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface StopParam {
  city: string;
  startDate?: string;
  endDate?: string;
}

interface TripParams {
  location: string;
  purpose: string;
  style: string;
  budget: string;
  interests: string;
  constraints: string;
  startDate: string;
  endDate: string;
  nights: string;
  stops?: StopParam[];
}

function buildPrompt(p: TripParams): string {
  const interestList = p.interests ? p.interests.split(",").join(", ") : "general sightseeing";
  const constraintList = p.constraints ? `\nConstraints/needs: ${p.constraints.split(",").join(", ")}` : "";

  const isMultiStop = p.stops && p.stops.length > 0;

  if (isMultiStop) {
    const allStops = [
      { city: p.location, startDate: p.startDate, endDate: p.endDate },
      ...(p.stops ?? []),
    ];
    const hasDates = allStops.some(s => s.startDate && s.endDate);
    const stopSummary = hasDates
      ? allStops.map(s => s.startDate ? `- ${s.city}: ${s.startDate} to ${s.endDate}` : `- ${s.city}`).join("\n")
      : allStops.map(s => `- ${s.city}`).join("\n");
    const route = allStops.map(s => s.city).join(" → ");
    const scheduleNote = hasDates
      ? `Itinerary schedule:\n${stopSummary}`
      : `Cities to visit: ${route}\n\nIMPORTANT: The traveler has ${p.nights} nights total. You must decide the optimal number of nights at each city based on what each destination deserves and the traveler's interests. Recommend the best allocation.`;

    return `Plan a detailed multi-city trip: ${route} (${p.nights} nights total, ${p.startDate} to ${p.endDate}).

Trip details:
- Travel purpose: ${p.purpose}
- Travel style: ${p.style}
- Budget: ${p.budget}
- Interests: ${interestList}${constraintList}

${scheduleNote}

Create a complete day-by-day itinerary covering ALL stops. For each city section use "## [City Name]" as a heading.
Include:
1. A brief multi-city trip overview with your recommended night allocation per city
2. For each city: a full day-by-day schedule with precise clock times for every activity, travel time and transport mode between each activity, specific restaurant recommendations with cuisine and price range, local highlights
3. Transport between each city (mode, journey time, booking tips, departure station/airport)
4. Top highlights across the whole trip
5. Practical tips and budget breakdown per city

CRITICAL: Every activity must have a start time (e.g. **9:00 AM**), a duration *(~X hrs)*, and the travel segment to the next activity must show mode emoji + minutes + route name. Do not skip transit segments.

Write in an engaging, friendly tone. Be specific — real place names, dish names, neighborhoods.`;
  }

  return `Plan a detailed ${p.nights}-night trip to ${p.location}.

Trip details:
- Dates: ${p.startDate} to ${p.endDate} (${p.nights} nights)
- Travel purpose: ${p.purpose}
- Travel style: ${p.style}
- Budget: ${p.budget}
- Interests: ${interestList}${constraintList}

Create a complete day-by-day itinerary. Format your response clearly with:

HEADING FORMAT (critical): Use "## " (double hash + space) for every section heading. Example: ## Day 1: Arrival & First Impressions, ## Day 2: City Highlights, ## Practical Tips. Do NOT use bold text (**Day 1:**) or triple-hash (###) for headings.

1. A brief trip overview (## Overview heading) and what makes this destination perfect for their purpose/style
2. A full day-by-day schedule, each day as its own ## Day N: [Title] heading (Day 1 through Day ${p.nights}), where EVERY activity has:
   - A precise start time (e.g. **9:00 AM**)
   - The activity name in bold with approximate duration *(~X hrs)*
   - A transit segment immediately after showing how to reach the next stop: mode emoji + travel time + route/line name
     Examples: 🚶 8 min walk | 🚇 12 min subway (Line 1 → Central Station) | 🚕 15 min taxi | 🚌 20 min bus (Route 38)
   - Lunch and dinner with restaurant name, cuisine, and price per person
3. Top 5 must-see/must-do highlights
4. Practical tips tailored to their travel style and budget
5. A rough daily budget breakdown in USD

CRITICAL: Do not skip transit segments. Every activity must flow into the next with real travel info.
Write in an engaging, friendly tone. Be specific — use real place names, dish names, and neighborhood names.`;
}

const SYSTEM = `You are an expert travel planner with deep knowledge of destinations worldwide.
You create personalized, practical itineraries that match each traveler's unique style and preferences.
Be specific, enthusiastic, and helpful. Use real place names and practical details.

FORMATTING RULES:
1. Every specific place name — attractions, temples, museums, restaurants, parks, neighborhoods, markets, viewpoints, beaches, landmarks — must be written in **bold** (e.g., **Senso-ji Temple**, **Shibuya Crossing**, **Tsukiji Outer Market**). Do NOT bold generic words like Morning, Afternoon, Evening, Day, Tips, or Overview.

2. TIME & TRANSPORT FORMAT: For every day plan, format each activity block like this:
   **9:00 AM** — Activity description at **Place Name** *(~1.5 hrs)*
   🚶 12 min walk / 🚇 8 min subway (Ginza Line → Shinjuku) / 🚌 15 min bus / 🚕 10 min taxi / 🚂 45 min train
   **11:00 AM** — Next activity...

   - Always specify a realistic clock time for each activity
   - Always show how to get from one activity to the next — include the mode of transport emoji (🚶 walk, 🚇 subway/metro, 🚌 bus, 🚕 taxi/rideshare, 🚂 train, 🚴 bike, ⛵ ferry), the travel time in minutes, and the specific line or route name where relevant
   - Include approximate duration for each activity in parentheses e.g. *(~2 hrs)*
   - Lunch and dinner entries should specify the restaurant, cuisine type, and approximate cost per person
   - Factor in realistic travel times between locations — don't pack in activities that are geographically too spread out`;

export async function POST(req: Request) {
  let body: TripParams;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!body.location || !body.nights) {
    return new Response("Missing required fields", { status: 400 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          stream: true,
          system: SYSTEM,
          messages: [{ role: "user", content: buildPrompt(body) }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            try {
              controller.enqueue(encoder.encode(event.delta.text));
            } catch {
              // Client disconnected — stop streaming
              break;
            }
          }
        }
      } catch (err) {
        console.error("Itinerary generation error:", err);
        try {
          controller.enqueue(
            encoder.encode("\n\n[Error generating itinerary. Please try again.]")
          );
        } catch { /* client already disconnected */ }
      } finally {
        try { controller.close(); } catch { /* already closed */ }
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
