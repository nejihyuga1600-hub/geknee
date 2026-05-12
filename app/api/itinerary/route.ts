import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkAndIncrementGeneration } from "@/lib/plan";
import { isAgentEnabledFor } from "@/lib/agent/feature-flag";
import { runAgent } from "@/lib/agent/loop";
import { getAgentTools } from "@/lib/agent/tools";
import { captureError } from "@/lib/sentry";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Force per-request rendering and disable any layer of caching. Without
// these, Next.js / Vercel can route the request through a buffering
// path that delays the first byte arriving at the client until the
// whole stream is collected. We need each chunk to flush as soon as
// Anthropic emits it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

interface StopParam {
  city: string;
  startDate?: string;
  endDate?: string;
}

interface MustVisitPlace {
  name: string;
  category: string; // food | activities | hotels | shopping | other
}

interface MonumentQuestPayload {
  name: string;
  quests: string[]; // human-readable quest objectives from quests.ts
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
  monumentQuests?: MonumentQuestPayload[];
  language?: string; // BCP-47 code e.g. "es", "ja", "ar"
  currency?: string; // ISO 4217 e.g. "GBP", "EUR", "JPY"
  // Optional — when provided, the server accumulates the full streamed
  // text and writes it to TripDraft.itinerary on completion. This makes
  // generation durable across client disconnects (navigating away,
  // closing the tab, network blip mid-stream): the AI's output is
  // persisted server-side regardless of whether the reader is still
  // attached.
  tripId?: string;
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

  // Currency instruction — give every price in BOTH the local currency
  // (so the user knows what to hand over at the till) AND their home
  // currency (so they immediately understand what it costs them).
  // Example output for an INR trip with a GBP user: "Entry: ₹650 (~£6.30)".
  // Also adds a per-day total in the user's currency at the bottom of
  // each Day section so the chip aggregator on the client can pick it up.
  const CCY_SYMBOL: Record<string, string> = {
    USD: "$", GBP: "£", EUR: "€", JPY: "¥", CNY: "¥", CHF: "CHF",
    AUD: "A$", CAD: "C$", NZD: "NZ$", INR: "₹", KRW: "₩", THB: "฿",
    SGD: "S$", HKD: "HK$", TWD: "NT$", MYR: "RM", IDR: "Rp", VND: "₫",
    PHP: "₱", AED: "AED ", SAR: "SAR ", ZAR: "R", BRL: "R$", MXN: "MX$",
    ARS: "AR$", RUB: "₽", TRY: "₺", PLN: "zł", SEK: "kr", NOK: "kr", DKK: "kr",
  };
  const homeCcy = p.currency && CCY_SYMBOL[p.currency] ? p.currency : "USD";
  const homeSymbol = CCY_SYMBOL[homeCcy];
  const currencyInstruction = `\nCURRENCY: The traveler's home currency is ${homeCcy} (${homeSymbol}). For every price you mention, lead with the home currency (${homeSymbol}) and put the destination's local-currency amount in parentheses for reference. Example: "Entry: ${homeSymbol}7.80 (~₹650)", "Lunch: ${homeSymbol}9.50 (~¥1,800)", "Snacks: ${homeSymbol}3 (~₹250)". The user wants to see costs in their own currency at a glance — never lead with the foreign currency. At the end of each Day section, write one summary line in this exact format: "Estimated daily cost: ~${homeSymbol}XX per person" using a realistic sum of activity + food + local transit for the day.\n`;

  // Build must-visit section
  const mustVisitBlock = p.mustVisit && p.mustVisit.length > 0
    ? `\nMUST-INCLUDE PLACES (the traveler has specifically selected these — every one must appear in the itinerary on an appropriate day):\n${p.mustVisit.map(v => `- ${v.name} [${v.category}]`).join("\n")}\n`
    : "";

  // Monument quest block — these are real collectible objectives from
  // the user's monument-collection system. When the activity for one
  // of these places appears, integrate ONE of the listed quests as a
  // specific challenge in that activity's description, AND prefix the
  // activity headline with the literal token "[MONUMENT QUEST]" so the
  // client UI can render the gold badge styling. Pick the quest that
  // best matches the time of day and pace of the visit.
  const monumentQuestBlock = p.monumentQuests && p.monumentQuests.length > 0
    ? `\nMONUMENT QUESTS — these places are part of the traveler's collectible-monument game. For each one, when the activity appears in the itinerary, weave ONE of its quests into the activity description as a concrete objective the traveler can do during the visit. CRITICAL: prefix the activity's time/place headline with the literal token "[MONUMENT QUEST]" — for example: "**6:00 AM** — [MONUMENT QUEST] Sunrise photograph at **Taj Mahal** *(~2 hrs)*". The UI uses this marker to render gold styling. Available quests:\n${p.monumentQuests.map(m => `- ${m.name}: ${m.quests.map(q => `"${q}"`).join(' / ')}`).join("\n")}\n`
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
${langInstruction}${currencyInstruction}
TRAVELER PERSONALITY (every decision — pace, restaurant tier, activity intensity, transport mode — must reflect this):
${personalityBlock}
${mustVisitBlock}${monumentQuestBlock}
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
${langInstruction}${currencyInstruction}
TRAVELER PERSONALITY (shape every recommendation — pace, venue tier, activity type, transport choice — around this profile):
${personalityBlock}
${mustVisitBlock}${monumentQuestBlock}
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
CRITICAL TRANSIT FORMAT: Every transit segment MUST start with one of these emoji as the very first character of the line, with no markdown around it: 🚶 (walk), 🚴 (bike), 🚇 (subway/metro), 🚌 (bus), 🚂 or 🚆 (train), 🚕 or 🚖 (taxi/rideshare), ✈️ (flight), ⛵ (ferry). The day-map UI parses this emoji to choose between walking, cycling, and driving routing — without it, the route renders as a straight line.
Write in an engaging, friendly tone. Be specific — use real place names, dish names, and neighborhood names.`;
}

const SYSTEM = `You are an expert travel planner with deep knowledge of destinations worldwide.
You create personalized, practical itineraries that are laser-focused on the traveler's specific personality, purpose, style, and budget.
CRITICAL: Never suggest generic tourist activities that conflict with the stated travel style or budget. A budget backpacker should not get Michelin-star restaurants; a luxury traveler should not get hostel recommendations. An adventure traveler should not get museum-heavy days unless they asked for it. Always match every suggestion to the stated personality.
If the traveler has pinned specific places (MUST-INCLUDE), every single one must appear in the itinerary — do not skip or replace them.

AUTOFILL: If the traveler's pinned places + style don't fill the trip duration with sensible coverage (e.g. they pinned 2 sights for a 5-day trip, or their style says "deep-dive culture" but they pinned mostly food), AUTONOMOUSLY add more destinations that match their declared travel style + budget + dietary constraints. The user is relying on you to fill the gaps — they expect a complete plan, not one with thin days. Auto-added stops should feel hand-picked (real places, specific reasons), not generic. Don't ask the user — just add them.

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
   - Factor in realistic travel times between locations — don't pack in activities that are geographically too spread out

3. NO TIME-OF-DAY SUBHEADINGS: Do NOT split a day into "Morning / Afternoon / Evening" subsections (no \`### Morning\`, no \`**Morning**\`, no bare "Morning:" lines). The clock time on each activity already conveys when it happens. List all activities for a day as one chronological flow under the day's \`## Day N: Title\` heading.`;

export async function POST(req: Request) {
  // ── Auth + generation limit ───────────────────────────────────────────────
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Sign in to generate itineraries", code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = (session.user as { id?: string })?.id;
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

  const nights = parseInt(body.nights, 10);
  if (isNaN(nights) || nights < 1 || nights > 365) {
    return new Response("Invalid nights value (must be 1–365)", { status: 400 });
  }
  if (body.location.length > 200) {
    return new Response("Location too long (max 200 characters)", { status: 400 });
  }
  if (body.interests && body.interests.length > 1000) {
    return new Response("Interests too long (max 1000 characters)", { status: 400 });
  }

  // Agent-enabled users get tool-grounded itinerary generation. Same
  // plain-text response shape (priming, heartbeats, server-side
  // accumulate, DB persist) so the existing client doesn't notice.
  if (userId && isAgentEnabledFor(userId)) {
    return runViaAgent(body, userId);
  }

  const encoder = new TextEncoder();

  // Accumulate the full text server-side. Even if the client disconnects
  // mid-stream, the AI continues generating and we persist the complete
  // result to the TripDraft row at the end — so navigating away no
  // longer loses work.
  let accumulated = "";
  let clientStillConnected = true;

  const readable = new ReadableStream({
    async start(controller) {
      // Break through Vercel/Node/proxy small-write buffering. A 1-byte
      // prime is below TCP/Nagle and edge-buffer thresholds — it queues
      // and waits for the next write. We need a chunk large enough to
      // (a) saturate the initial TCP segment, (b) exceed the edge
      // proxy's hold-until-N-bytes threshold (~4 KB on most paths),
      // and (c) wake the browser's body reader.
      //
      // 8 KB of whitespace + newline does it. The whitespace is benign
      // on the client: the line-splitter sees one giant blank line that
      // renders as an empty MarkdownLine in the in-flight box.
      const PRIME = " ".repeat(8192) + "\n";
      try { controller.enqueue(encoder.encode(PRIME)); } catch { /* aborted */ }

      // Heartbeats during Anthropic's 3-8 s first-token latency. Without
      // these, the connection sits idle long enough for the platform to
      // re-coalesce buffers and the next real write can get held again.
      // We send a small whitespace+newline burst every 500 ms until the
      // first real content delta arrives, then stop (the deltas
      // themselves keep pressure on the stream).
      let firstDeltaSeen = false;
      const HEARTBEAT = " ".repeat(64) + "\n";
      const heartbeat = setInterval(() => {
        if (firstDeltaSeen || !clientStillConnected) return;
        try { controller.enqueue(encoder.encode(HEARTBEAT)); }
        catch { clientStillConnected = false; }
      }, 500);

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
            firstDeltaSeen = true;
            accumulated += event.delta.text;
            if (clientStillConnected) {
              try {
                controller.enqueue(encoder.encode(event.delta.text));
              } catch {
                // Client disconnected — stop pushing chunks but KEEP
                // consuming the upstream stream so we accumulate the
                // full text and can persist it below.
                clientStillConnected = false;
              }
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
        clearInterval(heartbeat);
        // Persist the accumulated itinerary to the trip's DB row so it
        // survives client disconnects. Only saves if we got a non-empty
        // result and the request carries a tripId the user owns.
        if (body.tripId && userId && accumulated.trim().length > 0) {
          try {
            const trip = await prisma.tripDraft.findUnique({
              where: { id: body.tripId },
              select: { userId: true },
            });
            if (trip && trip.userId === userId) {
              await prisma.tripDraft.update({
                where: { id: body.tripId },
                data: {
                  itinerary: accumulated,
                  itineraryUpdatedAt: new Date(),
                },
              });
              console.log(`[itinerary] saved ${accumulated.length} chars for trip ${body.tripId}`);
            } else {
              console.warn(`[itinerary] tripId ${body.tripId} ownership mismatch — not saving`);
            }
          } catch (e) {
            console.error("[itinerary] DB save failed:", e);
          }
        }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // No-cache + no-buffering. `X-Accel-Buffering: no` is the magic
      // header that tells nginx-style proxies (which Vercel uses in
      // some paths) to stop holding the body — without it, even a
      // properly-flushed ReadableStream can sit buffered for tens of
      // seconds before the client gets the first byte.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Transfer-Encoding": "chunked",
      "Connection": "keep-alive",
    },
  });
}

// ── Agent path ──────────────────────────────────────────────────────────────
//
// Tool-grounded generation. Mirrors the legacy path's response shape
// exactly (8 KB primer → heartbeats → text deltas → DB persist) so the
// client experience is identical. Differences:
//   - Tools (find_places, geocode, route_between, weather_forecast,
//     flight_search) get called during the planner phase before any
//     text is produced. The first user-visible byte arrives a few
//     hundred ms later than the legacy path; the heartbeat covers it.
//   - Restaurants / venues are grounded in real Google Places hits
//     instead of model recall.
//   - Transit times come from real Mapbox routing.
async function runViaAgent(body: TripParams, userId: string): Promise<Response> {
  const encoder = new TextEncoder();
  let accumulated = "";
  let clientStillConnected = true;

  const readable = new ReadableStream({
    async start(controller) {
      const PRIME = " ".repeat(8192) + "\n";
      try { controller.enqueue(encoder.encode(PRIME)); } catch { /* aborted */ }

      let firstDeltaSeen = false;
      const HEARTBEAT = " ".repeat(64) + "\n";
      const heartbeat = setInterval(() => {
        if (firstDeltaSeen || !clientStillConnected) return;
        try { controller.enqueue(encoder.encode(HEARTBEAT)); }
        catch { clientStillConnected = false; }
      }, 500);

      try {
        const agentClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        await runAgent({
          client: agentClient,
          systemPrompt: SYSTEM,
          userPrompt: buildPrompt(body),
          tools: getAgentTools(),
          ctx: { userId, tripId: body.tripId },
          onEvent: (e) => {
            if (e.type !== "text") return;
            firstDeltaSeen = true;
            accumulated += e.delta;
            if (clientStillConnected) {
              try {
                controller.enqueue(encoder.encode(e.delta));
              } catch {
                clientStillConnected = false;
              }
            }
          },
        });
      } catch (err) {
        captureError(err, { route: "/api/itinerary", path: "agent", userId, tripId: body.tripId });
        try {
          controller.enqueue(encoder.encode("\n\n[Error generating itinerary. Please try again.]"));
        } catch { /* client disconnected */ }
      } finally {
        clearInterval(heartbeat);
        if (body.tripId && accumulated.trim().length > 0) {
          try {
            const trip = await prisma.tripDraft.findUnique({
              where: { id: body.tripId },
              select: { userId: true },
            });
            if (trip && trip.userId === userId) {
              await prisma.tripDraft.update({
                where: { id: body.tripId },
                data: { itinerary: accumulated, itineraryUpdatedAt: new Date() },
              });
            }
          } catch (e) {
            console.error("[itinerary/agent] DB save failed:", e);
          }
        }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Transfer-Encoding": "chunked",
      "Connection": "keep-alive",
    },
  });
}
