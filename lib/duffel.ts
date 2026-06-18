// Duffel API client — real flight offers with cabin selection.
//
// Duffel aggregates 300+ airlines via NDC and traditional GDS feeds.
// Replaces our previous flow (Aviasales price snapshot + bare aggregator
// deeplinks) with bookable offers that include cabin class, seat maps,
// fare rules, and the option to create real orders.
//
// Auth: Bearer token via Authorization header. The token determines
// live vs test mode (duffel_live_* vs duffel_test_*) — we honor what's
// in DUFFEL_API_KEY without caring which mode it is.

import { Duffel } from "@duffel/api";

const TOKEN = process.env.DUFFEL_API_KEY ?? "";

if (!TOKEN && process.env.NODE_ENV !== "test") {
  // Don't throw at import time — let callers degrade to the affiliate
  // flow if Duffel isn't configured. Some envs (preview, local without
  // .env.local) intentionally don't ship the key.
  console.warn("[duffel] DUFFEL_API_KEY not set — Duffel search disabled");
}

export const duffel = TOKEN ? new Duffel({ token: TOKEN }) : null;

export type DuffelCabin = "economy" | "premium_economy" | "business" | "first";

export interface DuffelSearchInput {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  cabin?: DuffelCabin;
  adults?: number;
}

export interface FlightSegment {
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  durationMin: number;
  flightNumber: string;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  segments: FlightSegment[];
  totalDurationMin: number;
}

export interface FlightOffer {
  id: string;
  totalAmount: string;
  totalCurrency: string;
  cabin: DuffelCabin;
  carrier: string;
  carrierName: string;
  slices: FlightSlice[];
  expiresAt: string;
}

// Run an offer-request and return the top N offers per cabin level,
// flattened. Duffel offer-requests are async — we use sync mode (the
// SDK polls under the hood and resolves with results in <10s).
export async function searchOffers(
  input: DuffelSearchInput,
  limit = 12,
): Promise<FlightOffer[]> {
  if (!duffel) return [];

  const slices: Array<{
    origin: string;
    destination: string;
    departure_date: string;
    departure_time?: { from: string; to: string };
    arrival_time?: { from: string; to: string };
  }> = [
    { origin: input.origin, destination: input.destination, departure_date: input.departDate },
  ];
  if (input.returnDate) {
    slices.push({
      origin: input.destination,
      destination: input.origin,
      departure_date: input.returnDate,
    });
  }

  const passengers = Array.from({ length: input.adults ?? 1 }, () => ({ type: "adult" as const }));

  // Cast through unknown — Duffel's SDK types use `null` instead of
  // `undefined` for optional time-range filters which is overstrict
  // for our use (we never specify times of day).
  const req = await duffel.offerRequests.create({
    slices,
    passengers,
    cabin_class: input.cabin ?? "economy",
    return_offers: true,
  } as unknown as Parameters<typeof duffel.offerRequests.create>[0]);

  const offers = req.data.offers ?? [];
  return offers.slice(0, limit).map(normalizeOffer);
}

// Loose type — Duffel's SDK types are stricter than needed and some
// fields (owner.iata_code) can be null on rare hosts. We coerce here.
type RawOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { iata_code: string | null; name: string };
  expires_at: string;
  slices: Array<{
    segments: Array<{
      origin: { iata_code: string };
      destination: { iata_code: string };
      departing_at: string;
      arriving_at: string;
      duration: string;
      marketing_carrier_flight_number: string;
    }>;
  }>;
  passengers?: Array<{ cabin_class?: string }>;
};

function normalizeOffer(raw: unknown): FlightOffer {
  const o = raw as RawOffer;
  const slices: FlightSlice[] = o.slices.map((s) => {
    const segments = s.segments.map((seg) => ({
      from: seg.origin.iata_code,
      to: seg.destination.iata_code,
      departAt: seg.departing_at,
      arriveAt: seg.arriving_at,
      durationMin: parseIsoDurationToMinutes(seg.duration),
      flightNumber: seg.marketing_carrier_flight_number,
    }));
    return {
      origin: segments[0]?.from ?? "",
      destination: segments[segments.length - 1]?.to ?? "",
      segments,
      totalDurationMin: segments.reduce((sum, x) => sum + x.durationMin, 0),
    };
  });
  const cabin = (o.passengers?.[0]?.cabin_class ?? "economy") as DuffelCabin;
  return {
    id: o.id,
    totalAmount: o.total_amount,
    totalCurrency: o.total_currency,
    cabin,
    carrier: o.owner.iata_code ?? "??",
    carrierName: o.owner.name,
    slices,
    expiresAt: o.expires_at,
  };
}

// ISO-8601 duration parser — "PT5H30M" → 330. Duffel returns these on
// every segment. We surface duration in the UI for "Direct · 5h30m"
// chips and for sorting fastest-first.
function parseIsoDurationToMinutes(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  const hours = parseInt(m[1] ?? "0", 10);
  const minutes = parseInt(m[2] ?? "0", 10);
  return hours * 60 + minutes;
}
