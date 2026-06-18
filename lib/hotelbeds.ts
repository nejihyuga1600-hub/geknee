// Hotelbeds APITUDE client — wholesale hotel inventory (180k+ properties).
//
// Replaces our previous Booking.com bare deeplinks with real bookable
// rooms in-app at wholesale rates (10-30% below public, 2-3x margin
// vs affiliate commission).
//
// Auth: every request signs (apiKey + sharedSecret + unixTimestamp)
// with SHA-256 and sends both the apiKey and the resulting signature
// in headers. Three separate API products (Hotel / Activities /
// Transfers), each with its own key+secret pair.
//
// Environment toggle via HOTELBEDS_ENV:
//   test (default) → https://api.test.hotelbeds.com — sandbox data
//   live           → https://api.hotelbeds.com      — real inventory
// Must be "test" until the user completes Hotelbeds certification.

import { createHash } from "node:crypto";

type HotelbedsProduct = "hotel" | "activities" | "transfers";

const ENV = process.env.HOTELBEDS_ENV ?? "test";
const BASE_URL = ENV === "live" ? "https://api.hotelbeds.com" : "https://api.test.hotelbeds.com";

interface ProductCreds {
  apiKey: string;
  secret: string;
}

function creds(product: HotelbedsProduct): ProductCreds | null {
  const apiKey = process.env[`HOTELBEDS_${product.toUpperCase()}_API_KEY`];
  const secret = process.env[`HOTELBEDS_${product.toUpperCase()}_SECRET`];
  if (!apiKey || !secret) return null;
  return { apiKey, secret };
}

// Hotelbeds signature: sha256(apiKey + sharedSecret + unixTimestamp).
// Timestamp is current Unix epoch seconds. Send via X-Signature header
// alongside Api-key on every request.
function sign(apiKey: string, secret: string): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256")
    .update(apiKey + secret + timestamp)
    .digest("hex");
  return { signature, timestamp };
}

async function hbFetch<T>(
  product: HotelbedsProduct,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const c = creds(product);
  if (!c) {
    throw new Error(
      `HOTELBEDS_${product.toUpperCase()}_API_KEY or _SECRET not set. ` +
        `Find the shared secret in your Hotelbeds dashboard under MY API KEYS.`,
    );
  }
  const { signature } = sign(c.apiKey, c.secret);
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Api-key": c.apiKey,
      "X-Signature": signature,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`hotelbeds ${product} ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
}

// ── Hotel Availability Search ─────────────────────────────────────────────

export interface HotelSearchInput {
  destinationCode: string; // e.g. "TKO" for Tokyo, "PAR" for Paris
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  adults?: number;
  children?: number;
  rooms?: number;
}

export interface HotelOffer {
  code: number; // Hotelbeds hotel code (for content lookup)
  name: string;
  categoryName: string | null;
  destinationName: string | null;
  minRate: number;
  currency: string;
  rateKey: string; // ephemeral — required for booking
  cancellationPolicy: string | null;
  boardName: string | null; // e.g. "Room only", "Bed and breakfast"
}

interface HotelsApiResponse {
  hotels: {
    hotels: Array<{
      code: number;
      name: string;
      categoryName?: string;
      destinationName?: string;
      currency: string;
      minRate: string;
      rooms?: Array<{
        rates?: Array<{
          rateKey: string;
          boardName?: string;
          cancellationPolicies?: Array<{ amount: string; from: string }>;
        }>;
      }>;
    }>;
  };
}

export async function searchHotels(input: HotelSearchInput): Promise<HotelOffer[]> {
  const body = {
    stay: { checkIn: input.checkIn, checkOut: input.checkOut },
    occupancies: [
      {
        rooms: input.rooms ?? 1,
        adults: input.adults ?? 2,
        children: input.children ?? 0,
      },
    ],
    destination: { code: input.destinationCode },
  };

  const data = await hbFetch<HotelsApiResponse>("hotel", "/hotel-api/1.0/hotels", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (data.hotels?.hotels ?? []).map((h) => {
    const firstRate = h.rooms?.[0]?.rates?.[0];
    const cancelPolicy = firstRate?.cancellationPolicies?.[0];
    return {
      code: h.code,
      name: h.name,
      categoryName: h.categoryName ?? null,
      destinationName: h.destinationName ?? null,
      minRate: parseFloat(h.minRate),
      currency: h.currency,
      rateKey: firstRate?.rateKey ?? "",
      cancellationPolicy: cancelPolicy ? `Free until ${cancelPolicy.from}` : null,
      boardName: firstRate?.boardName ?? null,
    };
  });
}

// ── Destination Code Lookup ───────────────────────────────────────────────
//
// Hotelbeds searches by 3-letter destination code, not city name.
// Top-50 geknee destinations cached here; long tail falls back to
// Content API /locations/destinations call (24h cache).

const HOTELBEDS_DEST_CACHE: Record<string, string> = {
  tokyo: "TKO",
  kyoto: "UKY",
  osaka: "OSA",
  seoul: "SEL",
  bangkok: "BKK",
  singapore: "SIN",
  "hong kong": "HKG",
  bali: "DPS",
  taipei: "TPE",
  paris: "PAR",
  london: "LON",
  rome: "ROM",
  barcelona: "BCN",
  amsterdam: "AMS",
  madrid: "MAD",
  berlin: "BER",
  prague: "PRG",
  vienna: "VIE",
  lisbon: "LIS",
  istanbul: "IST",
  athens: "ATH",
  reykjavik: "REK",
  "new york": "NYC",
  "new york city": "NYC",
  "los angeles": "LAX",
  "san francisco": "SFO",
  chicago: "CHI",
  miami: "MIA",
  "las vegas": "LAS",
  vancouver: "YVR",
  toronto: "YYZ",
  "mexico city": "MEX",
  sydney: "SYD",
  melbourne: "MEL",
  auckland: "AKL",
  "rio de janeiro": "RIO",
  "buenos aires": "BUE",
  lima: "LIM",
  "cape town": "CPT",
  marrakech: "RAK",
  cairo: "CAI",
  dubai: "DXB",
  "abu dhabi": "AUH",
};

export function resolveDestinationCode(location: string): string | null {
  const key = location.toLowerCase().split(",")[0].trim();
  if (HOTELBEDS_DEST_CACHE[key]) return HOTELBEDS_DEST_CACHE[key];
  const stripped = key.replace(/\s+(prefecture|state|province|region)$/i, "");
  return HOTELBEDS_DEST_CACHE[stripped] ?? null;
}

// ── Activities Availability Search ────────────────────────────────────────

export interface ActivitySearchInput {
  destinationCode: string;
  from: string; // YYYY-MM-DD
  to: string;
  adults?: number;
}

export interface ActivityOffer {
  code: string; // Hotelbeds activity code
  name: string;
  fromPrice: number;
  currency: string;
  durationLabel: string | null;
  imageUrl: string | null;
  ratesAvailable: number;
}

interface ActivitiesApiResponse {
  activities?: Array<{
    code: string;
    name: string;
    amountsFrom?: Array<{ amount: string; currencyId?: string }>;
    duration?: { unit?: string; value?: number };
    content?: { media?: Array<{ urls?: Array<{ resource?: string }> }> };
    modalities?: Array<unknown>;
  }>;
}

export async function searchActivities(input: ActivitySearchInput): Promise<ActivityOffer[]> {
  const body = {
    filters: [
      { searchFilterItems: [{ type: "destination", value: input.destinationCode }] },
    ],
    from: input.from,
    to: input.to,
    paxes: Array.from({ length: input.adults ?? 1 }, () => ({ age: 30 })),
    language: "en",
  };
  const data = await hbFetch<ActivitiesApiResponse>(
    "activities",
    "/activity-api/3.0/activities/availability",
    { method: "POST", body: JSON.stringify(body) },
  );
  return (data.activities ?? []).map((a) => {
    const cheapest = a.amountsFrom?.[0];
    const imageUrl = a.content?.media?.[0]?.urls?.[0]?.resource ?? null;
    const durationLabel = a.duration
      ? `${a.duration.value ?? "?"} ${a.duration.unit ?? ""}`.trim()
      : null;
    return {
      code: a.code,
      name: a.name,
      fromPrice: parseFloat(cheapest?.amount ?? "0"),
      currency: cheapest?.currencyId ?? "USD",
      durationLabel,
      imageUrl,
      ratesAvailable: a.modalities?.length ?? 0,
    };
  });
}

// ── Transfers Availability Search ─────────────────────────────────────────

export interface TransferSearchInput {
  fromIata: string; // origin IATA
  toCode: string;   // destination Hotelbeds zone code OR hotel code
  toType: "IATA" | "ATLAS"; // ATLAS = Hotelbeds zone (cities/hotels)
  pickupDate: string; // YYYY-MM-DDTHH:mm:ss
  returnDate?: string;
  adults?: number;
}

export interface TransferOffer {
  rateKey: string;
  category: string; // e.g. "STANDARD", "BUSINESS"
  vehicleName: string | null;
  pax: { max: number };
  totalPrice: number;
  currency: string;
}

interface TransfersApiResponse {
  services?: Array<{
    rateKey: string;
    category?: { name?: string };
    vehicle?: { name?: string };
    pax?: { max?: number };
    price?: { totalAmount?: number; currencyId?: string };
  }>;
}

export async function searchTransfers(input: TransferSearchInput): Promise<TransferOffer[]> {
  // Transfers v1 is REST-ish: parts of the request go in the path,
  // others in query string. Format: /availability/{lang}/from/{type}/{code}/to/{type}/{code}/{date}
  const path =
    `/transfer-api/1.0/availability/en/from/IATA/${input.fromIata}/to/${input.toType}/${input.toCode}/${input.pickupDate}` +
    (input.returnDate ? `?returnDate=${input.returnDate}&adults=${input.adults ?? 2}` : `?adults=${input.adults ?? 2}`);
  const data = await hbFetch<TransfersApiResponse>("transfers", path);
  return (data.services ?? []).map((s) => ({
    rateKey: s.rateKey,
    category: s.category?.name ?? "STANDARD",
    vehicleName: s.vehicle?.name ?? null,
    pax: { max: s.pax?.max ?? 4 },
    totalPrice: s.price?.totalAmount ?? 0,
    currency: s.price?.currencyId ?? "USD",
  }));
}

// ── Status helper (used by the search route for graceful degrades) ──────

export function hotelbedsConfigured(product: HotelbedsProduct): boolean {
  return creds(product) !== null;
}
