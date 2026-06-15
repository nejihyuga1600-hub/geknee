// Hotel extractor — pulls structured hotel booking info out of
// confirmation emails using Claude. Mirrors flight-extractor.ts.
//
// Returns null when the email isn't a hotel booking (flight-only, car,
// experience) or when Claude can't parse with confidence.
//
// Dates returned as ISO strings; caller is responsible for matching
// hotel destination + dates against existing TripDraft rows.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ExtractedHotel {
  hotelName: string;
  /** City the hotel is in ("Tokyo", "Paris"). */
  city: string;
  /** ISO check-in date (date-only is fine — time is optional). */
  checkinAt: string;
  /** ISO check-out date. */
  checkoutAt: string;
  /** Booking reference / confirmation number, if the email contained one. */
  bookingRef: string | null;
  /** Total amount in the email's stated currency, as displayed. Optional. */
  totalDisplay: string | null;
  /** Confidence 0..1. <0.6 → caller skips persistence. */
  confidence: number;
}

const SYSTEM = `You read travel booking confirmation emails and extract HOTEL booking details as JSON.

Rules:
- ONLY return hotel-stay emails (rooms, apartments, vacation rentals, B&Bs). Flight-only, car rental, train, restaurant, experience bookings → return { "isHotel": false } only.
- city = the city the property is in, in plain English (e.g. "Tokyo", "Paris", "New York").
- hotelName = the property name exactly as the email displays it.
- checkinAt / checkoutAt = ISO 8601 date or datetime in the email's stated timezone. If only date is given, use "YYYY-MM-DD".
- bookingRef = the confirmation number or PIN, exactly. null if missing.
- totalDisplay = the total cost line ("$1,250.00", "¥58,000"), exactly as shown. null if missing.
- confidence = 0..1. <0.6 = caller skips persistence.
- Return ONLY the JSON object, no commentary, no code fences.

JSON shape when it IS a hotel: { "isHotel": true, "hotelName": string, "city": string, "checkinAt": string, "checkoutAt": string, "bookingRef": string|null, "totalDisplay": string|null, "confidence": number }

When isHotel is false: { "isHotel": false } only.`;

export async function extractHotel(emailBody: string): Promise<ExtractedHotel | null> {
  if (!emailBody || emailBody.length < 50) return null;

  // Same 16k cap as flight extractor — fits typical confirmation emails.
  const body = emailBody.length > 16000 ? emailBody.slice(0, 16000) : emailBody;

  let raw: string;
  try {
    const result = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    raw = result.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();
  } catch (err) {
    console.error("[hotel-extractor] Anthropic error:", err);
    return null;
  }

  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("[hotel-extractor] non-JSON model output:", cleaned.slice(0, 200));
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.isHotel !== true) return null;

  const hotel = {
    hotelName: typeof obj.hotelName === "string" ? obj.hotelName.trim() : "",
    city: typeof obj.city === "string" ? obj.city.trim() : "",
    checkinAt: typeof obj.checkinAt === "string" ? obj.checkinAt : "",
    checkoutAt: typeof obj.checkoutAt === "string" ? obj.checkoutAt : "",
    bookingRef: typeof obj.bookingRef === "string" ? obj.bookingRef : null,
    totalDisplay: typeof obj.totalDisplay === "string" ? obj.totalDisplay : null,
    confidence: typeof obj.confidence === "number" ? obj.confidence : 0,
  };

  if (!hotel.hotelName || !hotel.city || !hotel.checkinAt || !hotel.checkoutAt) return null;
  if (hotel.confidence < 0.6) return null;

  return hotel;
}

/**
 * Matches an extracted hotel to a TripDraft. Match rule:
 *   - destination city contains/contained-by trip.location, case-insensitive
 *   - check-in falls between trip.startDate and trip.endDate (±1 day grace)
 *
 * Returns the matched trip id or null.
 */
export function matchHotelToTrip(
  hotel: ExtractedHotel,
  trips: Array<{ id: string; location: string | null; startDate: string | Date | null; endDate?: string | Date | null }>,
): string | null {
  const hotelCity = hotel.city.toLowerCase();
  const checkin = new Date(hotel.checkinAt);
  if (isNaN(checkin.getTime())) return null;

  for (const trip of trips) {
    const tripLoc = trip.location?.toLowerCase() ?? "";
    if (!tripLoc) continue;
    if (!tripLoc.includes(hotelCity) && !hotelCity.includes(tripLoc.split(",")[0].trim())) continue;
    if (!trip.startDate) continue;
    const tripStart = new Date(trip.startDate);
    const tripEnd = trip.endDate ? new Date(trip.endDate) : tripStart;
    if (isNaN(tripStart.getTime())) continue;
    // ±1 day grace either side.
    const earliest = new Date(tripStart.getTime() - 24 * 60 * 60 * 1000);
    const latest = new Date(tripEnd.getTime() + 24 * 60 * 60 * 1000);
    if (checkin >= earliest && checkin <= latest) return trip.id;
  }
  return null;
}
