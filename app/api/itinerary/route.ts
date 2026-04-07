import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkAndIncrementGeneration } from "@/lib/plan";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface StopParam {
  city: string;
  startDate?: string;
  endDate?: string;
}

interface MustVisitPlace {
  name: string;
  category: string; // food | activities | hotels | shopping | other
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
  mustVisit?: MustVisitPlace[];
  language?: string; // BCP-47 code e.g. "es", "ja", "ar"
}

const LANG_NAMES: Record<string, string> = {
  zh: "Chinese (中文)", es: "Spanish (Español)", pt: "Portuguese (Português)",
  ar: "Arabic (العربية)", fr: "French (Français)", de: "German (Deutsch)",
  id: "Indonesian (Bahasa Indonesia)", it: "Italian (Italiano)", hi: "Hindi (हिन्दी)",
  ja: "Japanese (日本語)", ms: "Malay (Bahasa Melayu)", pl: "Polish (Polski)",
  ru: "Russian (Русский)", ko: "Korean (한국어)",
};

function buildPrompt(p: TripParams): string {
  const interestList = p.interests ? p.interests.split(",").join(", ") : "general sightseeing";

  // Language instruction
  const langInstruction = p.language && p.language !== "en" && LANG_NAMES[p.language]
    ? `\nIMPORTANT: Write your ENTIRE response in ${LANG_NAMES[p.language]}. Every heading, description, tip, and recommendation must be in ${LANG_NAMES[p.language]}.\n`
    : "";

  // Build must-visit section
  const mustVisitBlock = p.mustVisit && p.mustVisit.length > 0
    ? `\nMUST-INCLUDE PLACES (the traveler has specifically selected these — every one must appear in the itinerary on an appropriate day):\n${p.mustVisit.map(v => `- ${v.name} [${v.category}]`).join("\n")}\n`
    : "";

  // Build personality emphasis block
  const personalityBlock = [
    p.purpose    && `Purpose: ${p.purpose}`,
    p.style      && `Travel style: ${p.style}`,
    p.budget     && `Budget level: ${p.budget}`,
    interestList && `Key interests: ${interestList}`,
    p.constraints && `Special needs/constraints: ${p.constraints.split(",").join(", ")}`,
  ].filter(Boolean).join("\n");


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
${langInstruction}
TRAVELER PERSONALITY (every decision — pace, restaurant tier, activity intensity, transport mode — must reflect this):
${personalityBlock}
${mustVisitBlock}
${scheduleNote}

Create a complete day-by-day itinerary covering ALL stops. For each city section use "## [City Name]" as a heading.
Include:
1. A brief multi-city trip overview with your recommended night allocation per city
2. For each city: a full day-by-day schedule with precise clock times for every activity, travel time and transport mode between each activity, specific restaurant recommendations with cuisine and price range, local highlights
3. Transport between each city (mode, journey time, booking tips, departure station/airport)
4. Top highlights across the whole trip
5. Practical tips and budget breakdown per city that align with the traveler's budget level and style

CRITICAL: Every activity must have a start time (e.g. **9:00 AM**), a duration *(~X hrs)*, and the travel segment to the next activity must show mode emoji + minutes + route name. Do not skip transit segments.
${p.mustVisit && p.mustVisit.length > 0 ? "CRITICAL: Every place listed in MUST-INCLUDE PLACES above must appear in the itinerary. Schedule them on appropriate days and integrate them naturally.\n" : ""}
Write in an engaging, friendly tone. Be specific — real place names, dish names, neighborhoods.`;
  }

  return `Plan a detailed ${p.nights}-night trip to ${p.location}.
${langInstruction}
TRAVELER PERSONALITY (shape every recommendation — pace, venue tier, activity type, transport choice — around this profile):
${personalityBlock}
${mustVisitBlock}
Dates: ${p.startDate} to ${p.endDate} (${p.nights} nights)

Create a complete day-by-day itinerary. Format your response clearly with:

HEADING FORMAT (critical): Use "## " (double hash + space) for every section heading. Example: ## Day 1: Arrival & First Impressions, ## Day 2: City Highlights, ## Practical Tips. Do NOT use bold text (**Day 1:**) or triple-hash (###) for headings.

1. A brief trip overview (## Overview heading) explaining why this destination and this itinerary match the traveler's personality and purpose
2. A full day-by-day schedule, each day as its own ## Day N: [Title] heading (Day 1 through Day ${p.nights}), where EVERY activity has:
   - A precise start time (e.g. **9:00 AM**)
   - The activity name in bold with approximate duration *(~X hrs)*
   - A transit segment immediately after showing how to reach the next stop: mode emoji + travel time + route/line name
     Examples: 🚶 8 min walk | 🚇 12 min subway (Line 1 → Central Station) | 🚕 15 min taxi | 🚌 20 min bus (Route 38)
   - Lunch and dinner with restaurant name, cuisine, and price per person that fit the budget level (${p.budget})
3. Top 5 must-see/must-do highlights chosen to match the traveler's interests (${interestList})
4. Practical tips tailored to their travel style (${p.style}) and budget (${p.budget})
5. A rough daily budget breakdown in USD matching the ${p.budget} budget level
${p.mustVisit && p.mustVisit.length > 0 ? "\nCRITICAL: Every place listed in MUST-INCLUDE PLACES above must appear in the itinerary on an appropriate day. Do not omit any of them.\n" : ""}
CRITICAL: Do not skip transit segments. Every activity must flow into the next with real travel info.
Write in an engaging, friendly tone. Be specific — use real place names, dish names, and neighborhood names.`;
}

const SYSTEM = `You are an expert travel planner with deep knowledge of destinations worldwide.
You create personalized, practical itineraries that are laser-focused on the traveler's specific personality, purpose, style, and budget.
CRITICAL: Never suggest generic tourist activities that conflict with the stated travel style or budget. A budget backpacker should not get Michelin-star restaurants; a luxury traveler should not get hostel recommendations. An adventure traveler should not get museum-heavy days unless they asked for it. Always match every suggestion to the stated personality.
If the traveler has pinned specific places (MUST-INCLUDE), every single one must appear in the itinerary — do not skip or replace them.
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
  // ── Auth + generation limit ───────────────────────────────────────────────
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (userId) {
    const { allowed, reason } = await checkAndIncrementGeneration(userId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: reason, code: "GENERATION_LIMIT" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

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
