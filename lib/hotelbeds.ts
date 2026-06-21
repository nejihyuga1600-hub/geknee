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
  // Cert §3.3: when children present, ages are mandatory.
  childAges?: number[];
  // Cert §3.6: pass-through to influence pricing for the user's market.
  // Defaults to HOTELBEDS_SOURCE_MARKET env (e.g. "US", "UK").
  sourceMarket?: string;
  // Cert §3.7: optional filters — when omitted, no filtering applied.
  filters?: {
    boards?: string[]; // e.g. ["RO", "BB"]
    minCategory?: number;
    maxCategory?: number;
    maxRatesPerRoom?: number;
  };
}

export interface HotelOffer {
  code: number; // Hotelbeds hotel code (for content lookup)
  name: string;
  categoryName: string | null;
  destinationName: string | null;
  minRate: number;
  currency: string;
  rateKey: string; // ephemeral — required for booking
  rateType: "BOOKABLE" | "RECHECK"; // cert §2.5 — drives whether CheckRate is needed
  rateCommentsId: string | null; // cert §3.9 — look up rate-comment text via Content API
  promotions: Array<{ code: string; name: string }>; // cert §2.7
  cancellationPolicies: Array<{ amount: string; from: string }>; // cert §3.8
  cancellationPolicy: string | null; // legacy summary string for older UI
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
          rateType?: string;
          boardName?: string;
          rateCommentsId?: string;
          promotions?: Array<{ code: string; name: string }>;
          cancellationPolicies?: Array<{ amount: string; from: string }>;
        }>;
      }>;
    }>;
  };
}

export async function searchHotels(input: HotelSearchInput): Promise<HotelOffer[]> {
  const childCount = input.children ?? (input.childAges?.length ?? 0);
  const occupancy: {
    rooms: number;
    adults: number;
    children: number;
    paxes?: Array<{ type: "CH"; age: number }>;
  } = {
    rooms: input.rooms ?? 1,
    adults: input.adults ?? 2,
    children: childCount,
  };
  // Cert §3.3: child ages mandatory when children > 0.
  if (childCount > 0 && input.childAges?.length) {
    occupancy.paxes = input.childAges.map((age) => ({ type: "CH" as const, age }));
  }

  const body: Record<string, unknown> = {
    stay: { checkIn: input.checkIn, checkOut: input.checkOut },
    occupancies: [occupancy],
    destination: { code: input.destinationCode },
  };

  // Cert §3.6: sourceMarket affects pricing for the user's market.
  const sourceMarket = input.sourceMarket ?? process.env.HOTELBEDS_SOURCE_MARKET;
  if (sourceMarket) body.sourceMarket = sourceMarket;

  // Cert §3.7: filters — boards / category range / max rates per room.
  if (input.filters) {
    if (input.filters.boards?.length) {
      body.boards = { included: true, board: input.filters.boards };
    }
    const filter: Record<string, unknown> = {};
    if (input.filters.minCategory) filter.minCategory = input.filters.minCategory;
    if (input.filters.maxCategory) filter.maxCategory = input.filters.maxCategory;
    if (input.filters.maxRatesPerRoom) filter.maxRatesPerRoom = input.filters.maxRatesPerRoom;
    if (Object.keys(filter).length) body.filter = filter;
  }

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
      rateType: (firstRate?.rateType as HotelOffer["rateType"]) ?? "BOOKABLE",
      rateCommentsId: firstRate?.rateCommentsId ?? null,
      promotions: firstRate?.promotions ?? [],
      cancellationPolicies: firstRate?.cancellationPolicies ?? [],
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

// ── CheckRate (rate re-verification before booking) ────────────────────────
//
// Hotelbeds cert §2.5: CheckRate is REQUIRED on rates marked
// rateType="RECHECK" before issuing a Booking. BOOKABLE rates skip
// this step entirely. Group up to 10 rates per call (cert §2.6).
//
// Response surfaces the up-to-date price, may include upsell options,
// and crucially returns rateCommentsId / rateComments that the cert
// process requires us to display pre-confirmation.

export interface CheckRateInput {
  rateKeys: string[]; // up to 10
}

export interface CheckedRate {
  rateKey: string;
  net: number;
  currency: string;
  boardName: string | null;
  rateCommentsId: string | null;
  rateComments: string | null;
  promotions: Array<{ code: string; name: string }>;
  cancellationPolicies: Array<{ amount: string; from: string }>;
  upsellRates: Array<{ rateKey: string; netDiff: number }>;
}

interface CheckRateApiResponse {
  hotel?: {
    rooms?: Array<{
      rates?: Array<{
        rateKey: string;
        net?: string;
        boardName?: string;
        rateCommentsId?: string;
        rateComments?: string;
        promotions?: Array<{ code: string; name: string }>;
        cancellationPolicies?: Array<{ amount: string; from: string }>;
        upsellingRates?: Array<{ rateKey: string; netDiff?: string }>;
      }>;
    }>;
    currency?: string;
  };
}

export async function checkRates(input: CheckRateInput): Promise<CheckedRate[]> {
  if (input.rateKeys.length === 0) return [];
  if (input.rateKeys.length > 10) {
    throw new Error("CheckRate accepts max 10 rateKeys per call (Hotelbeds cert §2.6)");
  }
  const body = {
    rooms: input.rateKeys.map((k) => ({ rateKey: k })),
  };
  const data = await hbFetch<CheckRateApiResponse>(
    "hotel",
    "/hotel-api/1.0/checkrates",
    { method: "POST", body: JSON.stringify(body) },
  );
  const currency = data.hotel?.currency ?? "USD";
  const rates: CheckedRate[] = [];
  for (const room of data.hotel?.rooms ?? []) {
    for (const r of room.rates ?? []) {
      rates.push({
        rateKey: r.rateKey,
        net: parseFloat(r.net ?? "0"),
        currency,
        boardName: r.boardName ?? null,
        rateCommentsId: r.rateCommentsId ?? null,
        rateComments: r.rateComments ?? null,
        promotions: r.promotions ?? [],
        cancellationPolicies: r.cancellationPolicies ?? [],
        upsellRates: (r.upsellingRates ?? []).map((u) => ({
          rateKey: u.rateKey,
          netDiff: parseFloat(u.netDiff ?? "0"),
        })),
      });
    }
  }
  return rates;
}

// ── Booking confirmation ───────────────────────────────────────────────────
//
// Cert §3.11: Booking response timeout must be ≥60s. Cert §4.x: voucher
// generation is mandatory. Cert §6.1: must demonstrate a successful
// live booking + cancellation.
//
// Booking flow: takes a rateKey (verified via CheckRate when needed) +
// passenger details + holder. Returns Hotelbeds reference + confirmation
// status for voucher rendering.

export interface BookingPax {
  type: "AD" | "CH"; // adult or child
  name: string;
  surname: string;
  age?: number; // required for children
  roomId: number; // 1, 2, 3 for multi-room
}

export interface BookingInput {
  rateKey: string;
  holder: { name: string; surname: string };
  paxes: BookingPax[];
  clientReference: string; // our internal trip/booking ID
  remark?: string;
  tolerance?: number; // % price tolerance (Hotelbeds default 2.0)
}

export interface ConfirmedBooking {
  reference: string; // Hotelbeds booking reference
  clientReference: string;
  status: "CONFIRMED" | "PENDING" | "ERROR";
  hotel: {
    code: number;
    name: string;
    categoryName: string | null;
    destinationName: string | null;
    address?: string;
    phone?: string | null;
  };
  rooms: Array<{
    code: string;
    name: string;
    boardName: string;
    paxes: BookingPax[];
    rateCommentsId: string | null;
  }>;
  checkIn: string;
  checkOut: string;
  totalNet: number;
  currency: string;
  supplier: { name: string; vatNumber: string };
}

interface BookingApiResponse {
  booking?: {
    reference: string;
    clientReference: string;
    status: string;
    hotel: {
      code: number;
      name: string;
      categoryName?: string;
      destinationName?: string;
      address?: string;
      phone?: string;
      rooms?: Array<{
        code: string;
        name: string;
        boardName?: string;
        paxes?: Array<{
          type: string;
          name: string;
          surname: string;
          age?: number;
          roomId: number;
        }>;
        rateCommentsId?: string;
      }>;
    };
    totalNet: string;
    currency: string;
    checkIn: string;
    checkOut: string;
    supplier?: { name: string; vatNumber: string };
  };
}

export async function createBooking(input: BookingInput): Promise<ConfirmedBooking> {
  const body = {
    holder: { name: input.holder.name, surname: input.holder.surname },
    rooms: groupPaxesByRoom(input.paxes),
    clientReference: input.clientReference,
    remark: input.remark ?? "",
    tolerance: input.tolerance ?? 2.0,
  };
  // Use rateKey as path-style identifier on confirm — Hotelbeds nests
  // it inside `rooms[].rateKey` in the request body.
  const bodyWithRate = {
    ...body,
    rooms: [
      { rateKey: input.rateKey, paxes: body.rooms.flatMap((r) => r.paxes) },
    ],
  };
  const data = await hbFetch<BookingApiResponse>(
    "hotel",
    "/hotel-api/1.0/bookings",
    { method: "POST", body: JSON.stringify(bodyWithRate) },
  );
  const b = data.booking;
  if (!b) throw new Error("Hotelbeds returned no booking object");
  return {
    reference: b.reference,
    clientReference: b.clientReference,
    status: (b.status as ConfirmedBooking["status"]) ?? "PENDING",
    hotel: {
      code: b.hotel.code,
      name: b.hotel.name,
      categoryName: b.hotel.categoryName ?? null,
      destinationName: b.hotel.destinationName ?? null,
      address: b.hotel.address,
      phone: b.hotel.phone ?? null,
    },
    rooms: (b.hotel.rooms ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      boardName: r.boardName ?? "",
      paxes: (r.paxes ?? []).map((p) => ({
        type: p.type as "AD" | "CH",
        name: p.name,
        surname: p.surname,
        age: p.age,
        roomId: p.roomId,
      })),
      rateCommentsId: r.rateCommentsId ?? null,
    })),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    totalNet: parseFloat(b.totalNet),
    currency: b.currency,
    supplier: b.supplier ?? {
      name: process.env.HOTELBEDS_SUPPLIER_NAME ?? "HBX Group",
      vatNumber: process.env.HOTELBEDS_VAT_NUMBER ?? "",
    },
  };
}

function groupPaxesByRoom(paxes: BookingPax[]): Array<{ paxes: BookingPax[] }> {
  const byRoom = new Map<number, BookingPax[]>();
  for (const p of paxes) {
    const list = byRoom.get(p.roomId) ?? [];
    list.push(p);
    byRoom.set(p.roomId, list);
  }
  return [...byRoom.values()].map((paxes) => ({ paxes }));
}

// Cancel a booking by Hotelbeds reference. Cert §6.2: must demonstrate
// cancellation on the live booking made during certification.
export async function cancelBooking(reference: string, simulate = false): Promise<{ reference: string; status: string }> {
  const data = await hbFetch<{ booking?: { reference: string; status: string } }>(
    "hotel",
    `/hotel-api/1.0/bookings/${encodeURIComponent(reference)}?cancellationFlag=${simulate ? "SIMULATE" : "CANCELLATION"}`,
    { method: "DELETE" },
  );
  return {
    reference: data.booking?.reference ?? reference,
    status: data.booking?.status ?? "UNKNOWN",
  };
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
