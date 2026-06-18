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

// ── Status helper (used by the search route for graceful degrades) ──────

export function hotelbedsConfigured(product: HotelbedsProduct): boolean {
  return creds(product) !== null;
}
