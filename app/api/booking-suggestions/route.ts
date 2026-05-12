// AI-generated booking suggestions for the Booking tab.
// Replaces the hardcoded Kyoto MOCK_* data in BookView with realistic
// hotels, a flight option, and activities specific to the trip's
// destination, dates, budget, and travel style.
//
// Persistence: when tripId is provided, the model output is stored on
// TripDraft.bookingSuggestions (stringified JSON) + a timestamp. Repeat
// visits within 14 days return the cached row instead of re-billing
// the model. Pass `force: true` to regenerate.

import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const runtime = "nodejs";
export const maxDuration = 60;

interface SuggestionsRequest {
  location: string;
  startDate?: string;
  endDate?: string;
  nights?: string;
  budget?: string;
  style?: string;
  travelingFrom?: string;
  userHomeAirport?: { iata: string; city: string; country: string };
  userHomeCountry?: string; // fallback origin from client locale
  currency?: string; // ISO code, used as a hint for the secondary price
  itineraryPlaces?: string[]; // place names already in the user's itinerary
  /** When provided, enables persistence — cached on TripDraft.bookingSuggestions. */
  tripId?: string;
  /** When true, bypasses the cache and regenerates fresh. */
  force?: boolean;
}

// Suggestions are considered fresh for 14 days. After that the booking
// landscape (hotels, prices) is stale enough to warrant a regenerate.
const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const SYSTEM = `You are a travel-booking assistant generating realistic, well-known booking options for a destination. Respond with ONLY a single JSON object — no markdown fences, no commentary, no leading/trailing prose. Use real venues that a knowledgeable concierge would name. Match the budget level: a luxury traveler should not see hostels; a budget traveler should not see Park Hyatt.`;

const CCY_SYMBOL: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", JPY: "¥", CNY: "¥", CHF: "CHF",
  AUD: "A$", CAD: "C$", NZD: "NZ$", INR: "₹", KRW: "₩", THB: "฿",
  SGD: "S$", HKD: "HK$", TWD: "NT$", MYR: "RM", IDR: "Rp", VND: "₫",
  PHP: "₱", AED: "AED", SAR: "SAR", ZAR: "R", BRL: "R$", MXN: "MX$",
  ARS: "AR$", RUB: "₽", TRY: "₺", PLN: "zł", SEK: "kr", NOK: "kr", DKK: "kr",
};

function buildPrompt(p: SuggestionsRequest): string {
  const homeCcy = p.currency && CCY_SYMBOL[p.currency] ? p.currency : "USD";
  const homeSymbol = CCY_SYMBOL[homeCcy];
  return `Generate booking suggestions for a ${p.nights || "?"}-night trip to ${p.location} (${p.startDate ?? "TBD"} to ${p.endDate ?? "TBD"}).
Travel style: ${p.style || "balanced"}.
Budget level: ${p.budget || "mid-range"}.
${(() => {
  // Strongest signal first: a captured home airport (browser geolocation
  // → nearest IATA in lib/airport-coords). Use it as the LITERAL "from"
  // IATA for every flight option's outbound and the "to" for every
  // return. Falls back to travelingFrom string, then locale-derived
  // country name. Same-country trips still work because we instruct
  // the model to allow it explicitly.
  if (p.userHomeAirport?.iata) {
    const a = p.userHomeAirport;
    return `Departing from: ${a.city}, ${a.country} (airport code ${a.iata}).\nORIGIN RULE — STRICT: For every flight option, outbound.from MUST be "${a.iata}" (or a co-located airport in the same metro), and return.to MUST be "${a.iata}". The traveler is starting from ${a.city} — do not suggest domestic flights at the destination as the primary option. If origin and destination happen to share a country, normal rules apply.`;
  }
  const origin = p.travelingFrom?.trim() || p.userHomeCountry?.trim();
  if (!origin) return '';
  return `Departing from: ${origin}.\nORIGIN RULE: Every flight option below MUST originate from a major international hub airport in/near "${origin}", NOT from the destination country. If the user is traveling internationally, the outbound flight is from the user's region to the destination, and the return is the reverse. Do not suggest a domestic flight at the destination unless the user's home is in the same country as the destination.`;
})()}
User's home currency: ${homeCcy} (${homeSymbol}). All prices below MUST be in ${homeCcy}; convert from local currency to ${homeCcy} using current approximate rates. Use the symbol "${homeSymbol}" for every \`currency\` field.

${(p.itineraryPlaces && p.itineraryPlaces.length > 0)
  ? `EXISTING ITINERARY PLACES (the user has already chosen these as activities or stops):
${p.itineraryPlaces.map(s => `- ${s}`).join('\n')}

When a hotel is in the same neighborhood as one of these places, OR an activity exactly matches one of these places (case-insensitive name match), set its \`fromItinerary\` field to true. For everything else, set \`fromItinerary\` to false. Bias your hotel district choices toward neighborhoods that put guests close to multiple itinerary places.\n`
  : ''}

Return ONLY a JSON object with this exact shape:

{
  "hotels": [
    {
      "tier": "EDITORS' PICK" | "LOCAL" | "BUDGET",
      "district": "neighborhood or area name",
      "tag": "HOTEL" | "RYOKAN" | "HOSTEL" | "INN" | "BNB" | "RIAD" | "RESORT",
      "name": "real, well-known property in the area",
      "rating": 4 or 5,
      "features": ["short feature 1", "short feature 2", "short feature 3"],
      "price": number (per night, IN ${homeCcy}),
      "currency": "${homeSymbol}",
      "fromItinerary": boolean (true if the hotel sits in the same neighborhood as one of the user's existing itinerary places — see ITINERARY PLACES rule above; otherwise false)
    }
    // EXACTLY 8 hotels with a real spread of options:
    //   - 2 EDITORS' PICK (top-tier luxury)
    //   - 4 LOCAL (mid-range, varied districts/tags — boutique, ryokan,
    //     riad, design hotel, etc.)
    //   - 2 BUDGET (well-rated 3-star, hostel, BNB)
    // CRITICAL: Bias every district choice toward neighborhoods that
    // are walking distance to the user's existing itinerary places
    // (see EXISTING ITINERARY PLACES above). At least 5 of the 8
    // hotels MUST be in districts that contain or border one of those
    // places. Spread the prices realistically within the user's
    // declared budget level — don't cluster everything at the same
    // price point.
  ],
  "flightOptions": [
    {
      "carrier": "real major airline serving this route",
      "flightNumbers": ["e.g. UA 824", "e.g. UA 875"],
      "totalPrice": number (round-trip total, IN ${homeCcy}),
      "currency": "${homeSymbol}",
      "totalDuration": "e.g. 13h 45m (sum of both legs incl layovers)",
      "cabin": "economy",
      "co2Kg": number (estimated round-trip CO₂ in kilograms per passenger; ballpark realistic for distance and aircraft type),
      "dealBadge": "BEST PRICE" | "FASTEST" | "GREENEST" | "BEST VALUE" | omit,
      "outbound": {
        "from": "3-letter IATA",
        "to": "3-letter IATA",
        "date": "yyyy-mm-dd",
        "departTime": "e.g. 11:30 PM",
        "arriveTime": "e.g. 5:50 AM next day",
        "duration": "e.g. 11h 20m",
        "layovers": [
          { "airport": "3-letter IATA", "city": "city name", "duration": "e.g. 2h 15m" }
          // 0-2 layovers; empty array for direct flights
        ]
      },
      "return": {
        "from": "3-letter IATA",
        "to": "3-letter IATA",
        "date": "yyyy-mm-dd",
        "departTime": "e.g. 8:40 PM",
        "arriveTime": "e.g. 12:25 PM next day",
        "duration": "e.g. 9h 45m",
        "layovers": [ /* same shape; empty for direct */ ]
      }
    }
    // EXACTLY 5 options, each with a DIFFERENT carrier and a clear
    // trade-off. Cover the spread:
    //   - BEST PRICE  — cheapest, likely 1-2 stops, longer duration
    //   - FASTEST     — direct or single short layover, higher fare
    //   - GREENEST    — newest aircraft / shortest distance
    //   - BEST VALUE  — balanced mid-priced direct
    //   - one more from a different alliance for variety (any unused
    //     badge or none if no obvious one applies)
    // Use REAL airlines that fly the route in 2026; vary alliances
    // (Star Alliance / Oneworld / SkyTeam / unaligned) so users see
    // real choices.
    // Use real airlines that fly the route in 2026. Compute CO2 honestly:
    // ~115g per passenger-km for typical narrow-body, less for direct,
    // more for connecting flights with extra distance.
  ],
  "flight": {
    "date": "two date labels separated by an en-dash, like 'APR 28–MAY 1'. Used by legacy single-flight UI; copy the BEST VALUE option's date range here.",
    "carrier": "the BEST VALUE option's carrier",
    "segments": [
      {
        "from": "from-IATA", "to": "to-IATA",
        "departTime": "...", "arriveTime": "...",
        "duration": "..."
      }
      // 2 segments mirroring the BEST VALUE option's outbound + return
    ],
    "total": number,
    "currency": "${homeSymbol}",
    "status": "PENDING"
  },
  "activities": [
    {
      "tag": "TEA" | "CULTURE" | "FOOD" | "NATURE" | "NIGHTLIFE",
      "name": "real bookable experience or venue",
      "meta": "date · time · duration",
      "price": number (IN ${homeCcy}),
      "currency": "${homeSymbol}",
      "fromItinerary": boolean (true if the activity name matches one of the user's existing itinerary places — case-insensitive — otherwise false)
    }
    // EXACTLY 8 activities, varied tags (mix all five categories), all
    // fitting the budget level. Composition rule:
    //   - 3-4 from the EXISTING ITINERARY PLACES list above (set
    //     fromItinerary: true) so users can directly book what's
    //     already in their plan.
    //   - 4-5 fresh discoveries (fromItinerary: false) that complement
    //     what's in the itinerary — different category, different
    //     time of day, different neighborhood.
    // Spread prices across the budget range — include at least one
    // free/very-cheap option and one premium experience.
  ]
}

For ${p.location} specifically: use real hotels in real neighborhoods, real airline routes, real activities. Do NOT return generic placeholders.`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id;

  let body: SuggestionsRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body.location || !body.location.trim()) {
    return Response.json({ error: "location required" }, { status: 400 });
  }

  // ── Cache hit ────────────────────────────────────────────────────────
  // When the client passes tripId, look up the persisted suggestions on
  // the TripDraft row. Repeat visits in the booking tab — and revisits
  // in subsequent sessions — return instantly without re-billing the
  // model. Pass force: true to override and regenerate.
  if (body.tripId && userId && !body.force) {
    try {
      const cached = await prisma.tripDraft.findUnique({
        where: { id: body.tripId },
        select: {
          userId: true,
          bookingSuggestions: true,
          bookingSuggestionsAt: true,
        },
      });
      if (
        cached &&
        cached.userId === userId &&
        cached.bookingSuggestions &&
        cached.bookingSuggestionsAt &&
        Date.now() - cached.bookingSuggestionsAt.getTime() < CACHE_MAX_AGE_MS
      ) {
        try {
          const parsed = JSON.parse(cached.bookingSuggestions);
          return Response.json(parsed);
        } catch { /* malformed cache row — fall through to regenerate */ }
      }
    } catch (err) {
      // DB hiccup shouldn't block the generation path — just regenerate.
      console.warn("[booking-suggestions] cache lookup failed:", err);
    }
  }

  try {
    const resp = await client.messages.create({
      // Switched sonnet → haiku-4-5. Booking suggestions are a structured
      // JSON task — Haiku is 3-4x faster, well within its capability,
      // and the user flagged Sonnet was too slow on this surface.
      model: "claude-haiku-4-5-20251001",
      // Lowered 7168 → 4500. Realistic max output: 3 hotels + 1 flight
      // + 8 activities + flight options ≈ 3500 tokens.
      max_tokens: 4500,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(body) }],
    });

    // Extract text content. Anthropic returns content blocks; join the
    // text ones (typically just one for a JSON-only response).
    const text = resp.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip any stray markdown fence the model might still wrap output
    // in despite the instruction. Defensive — usually a no-op.
    const cleaned = text
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[booking-suggestions] JSON parse failed:", cleaned.slice(0, 400));
      return Response.json({ error: "model returned invalid JSON" }, { status: 502 });
    }

    // Persist the result so subsequent visits return instantly.
    // Skip silently if the DB write fails — the user still gets their
    // result from the in-flight response.
    if (body.tripId && userId) {
      try {
        await prisma.tripDraft.update({
          where: { id: body.tripId },
          data: {
            bookingSuggestions: JSON.stringify(parsed),
            bookingSuggestionsAt: new Date(),
          },
        });
      } catch (err) {
        console.warn("[booking-suggestions] cache write failed:", err);
      }
    }

    return Response.json(parsed);
  } catch (err) {
    console.error("[booking-suggestions] error:", err);
    return Response.json({ error: "generation failed" }, { status: 500 });
  }
}
