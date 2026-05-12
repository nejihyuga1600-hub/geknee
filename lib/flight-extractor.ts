// Flight extractor — pulls structured flight info out of booking-
// confirmation emails using Claude. Called from the Gmail scan worker
// after a new InboundMessage is created.
//
// Returns null when the email isn't a flight (hotel-only, car, train,
// experience) or when Claude can't parse with confidence. Hotel-only
// emails are a common case — we deliberately don't error on them.
//
// IATA codes are normalized uppercase. Dates are returned as ISO strings
// in the email's stated timezone, parsed by JS Date afterwards. The caller
// is responsible for matching destination + dates against existing
// TripDraft rows.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ExtractedFlight {
  /** IATA airport code if the email gave one, otherwise null. */
  destinationIata: string | null;
  /** Human-readable city name ("Rome", "London Heathrow"). */
  destinationCity: string;
  /** ISO timestamp of arrival at destination. */
  arrivesAt: string;
  /** Optional return-flight departure timestamp, if the email is a round-trip. */
  returnsAt: string | null;
  /** Confidence — 0..1, how sure Claude was. We treat <0.6 as null. */
  confidence: number;
}

const SYSTEM = `You read travel booking confirmation emails and extract flight details as JSON.

Rules:
- ONLY return flight emails. Hotel-only, car, train, restaurant, experience bookings → return null.
- For round-trip emails, return BOTH the outbound arrival and the return-flight departure.
- For one-way, return arrivesAt only and returnsAt: null.
- destinationCity must be the END city of the outbound flight (where the traveler ends up sleeping).
- Dates must be in ISO 8601 with timezone offset, e.g. "2026-06-12T14:30:00+02:00". If the email gives local time without timezone, infer from the airport's timezone.
- confidence: 0..1. Use <0.6 only if you genuinely can't tell — it tells the caller to skip persistence.
- Return ONLY the JSON object, no commentary, no code fences.

JSON shape: { "isFlight": boolean, "destinationIata": string|null, "destinationCity": string, "arrivesAt": string, "returnsAt": string|null, "confidence": number }

When isFlight is false, return { "isFlight": false } only.`;

export async function extractFlight(emailBody: string): Promise<ExtractedFlight | null> {
  if (!emailBody || emailBody.length < 50) return null;

  // Cap body length to keep token spend predictable. Confirmation emails
  // usually fit; long marketing footers get truncated harmlessly.
  const body = emailBody.length > 16000 ? emailBody.slice(0, 16000) : emailBody;

  let raw: string;
  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // small + fast — extraction is well-suited
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    raw = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
  } catch (err) {
    console.error("[flight-extractor] Anthropic error:", err);
    return null;
  }

  // Strip code fences if Claude added them despite the instructions.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[flight-extractor] non-JSON response:", cleaned.slice(0, 200));
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (p.isFlight === false) return null;
  if (typeof p.destinationCity !== "string" || typeof p.arrivesAt !== "string") return null;

  const confidence = typeof p.confidence === "number" ? p.confidence : 0.5;
  if (confidence < 0.6) return null;

  return {
    destinationIata: typeof p.destinationIata === "string" ? p.destinationIata.toUpperCase() : null,
    destinationCity: p.destinationCity,
    arrivesAt: p.arrivesAt,
    returnsAt: typeof p.returnsAt === "string" ? p.returnsAt : null,
    confidence,
  };
}

/**
 * Match an extracted flight to an existing TripDraft. Returns the trip id
 * if destination+dates overlap, else null. Used by the Gmail scan worker
 * to flag flightBookingDetectedAt on the right trip.
 *
 * Match strategy:
 *   - Destination city case-insensitive match against trip.location
 *   - Arrival date within +/- 1 day of trip.startDate
 */
export function matchFlightToTrip(
  flight: ExtractedFlight,
  trips: Array<{ id: string; location: string; startDate: string | null }>,
): string | null {
  const arrivesAt = new Date(flight.arrivesAt);
  if (isNaN(arrivesAt.getTime())) return null;
  const destLower = flight.destinationCity.toLowerCase();

  for (const t of trips) {
    if (!t.startDate) continue;
    const tripStart = new Date(t.startDate + "T00:00:00");
    if (isNaN(tripStart.getTime())) continue;
    // Within ±1 day of stated trip start.
    const diff = Math.abs(arrivesAt.getTime() - tripStart.getTime());
    const within = diff <= 1.5 * 24 * 3600 * 1000;
    if (!within) continue;
    // Destination text overlap (case-insensitive substring either way).
    const locLower = t.location.toLowerCase();
    if (locLower.includes(destLower) || destLower.includes(locLower)) {
      return t.id;
    }
  }
  return null;
}
