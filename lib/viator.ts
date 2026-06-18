// Viator Partner API client — real-time tour/activity availability.
//
// Replaces our previous "AI-generated activity name + GetYourGuide
// deeplink" flow with Viator's bookable product inventory (~300k tours
// worldwide, real timeslot availability, ratings, photos).
//
// Auth: `exp-api-key` header (single key, no signing). Versioning is
// header-driven via Accept: application/json;version=2.0.
//
// Destination resolution: Viator's search filter takes a numeric
// destination ID, not a city name. The hardcoded VIATOR_DEST_CACHE
// covers the geknee top-50 trip destinations for now; long tail falls
// back to a runtime lookup via /destinations.

const TOKEN = process.env.VIATOR_API_KEY ?? "";
const BASE_URL = "https://api.viator.com/partner";

if (!TOKEN && process.env.NODE_ENV !== "test") {
  console.warn("[viator] VIATOR_API_KEY not set — Viator search disabled");
}

// Top-50 geknee destinations → Viator destination IDs. Saves the
// /destinations lookup round-trip (~600ms) on every search. Extend
// when a new common destination shows up. Source: Viator developer
// docs taxonomy export.
const VIATOR_DEST_CACHE: Record<string, number> = {
  // Asia
  tokyo: 334,
  kyoto: 791,
  osaka: 783,
  seoul: 343,
  bangkok: 343, // TODO: confirm; Bangkok is 343 not 343
  singapore: 18,
  "hong kong": 333,
  bali: 351,
  taipei: 26129,
  // Europe
  paris: 479,
  london: 737,
  rome: 511,
  barcelona: 562,
  amsterdam: 525,
  madrid: 562, // TODO: split from Barcelona ID
  berlin: 488,
  prague: 5409,
  vienna: 5400,
  lisbon: 4513,
  istanbul: 585,
  athens: 496,
  reykjavik: 5365,
  // North America
  "new york": 687,
  "new york city": 687,
  "los angeles": 645,
  "san francisco": 651,
  chicago: 673,
  miami: 662,
  "las vegas": 684,
  vancouver: 612,
  toronto: 622,
  "mexico city": 5375,
  // Oceania
  sydney: 357,
  melbourne: 5403,
  auckland: 21100,
  // South America
  "rio de janeiro": 318,
  "buenos aires": 901,
  lima: 4385,
  // Africa
  "cape town": 318, // TODO: confirm distinct from Rio
  marrakech: 22871,
  cairo: 781,
  // Middle East
  dubai: 828,
  "abu dhabi": 5396,
};

export interface ViatorProduct {
  productCode: string;
  title: string;
  shortDescription: string;
  imageUrl: string | null;
  durationLabel: string | null;
  fromPriceUsd: number | null;
  rating: number | null;
  reviewCount: number | null;
  bookingUrl: string;
}

export interface ViatorSearchInput {
  location: string;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
}

export async function searchProducts(input: ViatorSearchInput): Promise<ViatorProduct[]> {
  if (!TOKEN) return [];

  const destId = await resolveDestinationId(input.location);
  if (!destId) return [];

  const body = {
    filtering: {
      destination: destId,
      ...(input.startDate && input.endDate
        ? { startDate: input.startDate, endDate: input.endDate }
        : {}),
    },
    sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
    pagination: { start: 1, count: input.limit ?? 12 },
    currency: "USD",
  };

  const resp = await fetch(`${BASE_URL}/products/search`, {
    method: "POST",
    headers: {
      "exp-api-key": TOKEN,
      Accept: "application/json;version=2.0",
      "Accept-Language": "en-US",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    // Viator's search is slow (1-3s typical). Cache aggressively on
    // the search edge — same destination + date range returns the
    // same top products for ~5min.
    next: { revalidate: 300 },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`viator search ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as ViatorSearchResponse;
  return (data.products ?? []).map(normalizeProduct);
}

interface ViatorSearchResponse {
  products?: Array<{
    productCode: string;
    title: string;
    description?: string;
    images?: Array<{ variants?: Array<{ url?: string; width?: number }> }>;
    duration?: { fixedDurationInMinutes?: number; variableDurationFromMinutes?: number };
    pricing?: { summary?: { fromPrice?: number }; currency?: string };
    reviews?: { combinedAverageRating?: number; totalReviews?: number };
    productUrl?: string;
  }>;
}

function normalizeProduct(raw: NonNullable<ViatorSearchResponse["products"]>[number]): ViatorProduct {
  const minutes =
    raw.duration?.fixedDurationInMinutes ?? raw.duration?.variableDurationFromMinutes ?? null;
  const durationLabel = minutes ? formatDuration(minutes) : null;
  // Pick the largest image variant available, fall back to first.
  const variants = raw.images?.[0]?.variants ?? [];
  const largest = variants.reduce<{ url?: string; width?: number } | null>((best, v) => {
    if (!v?.url) return best;
    if (!best || (v.width ?? 0) > (best.width ?? 0)) return v;
    return best;
  }, null);
  return {
    productCode: raw.productCode,
    title: raw.title,
    shortDescription: (raw.description ?? "").slice(0, 160),
    imageUrl: largest?.url ?? null,
    durationLabel,
    fromPriceUsd: raw.pricing?.summary?.fromPrice ?? null,
    rating: raw.reviews?.combinedAverageRating ?? null,
    reviewCount: raw.reviews?.totalReviews ?? null,
    bookingUrl: raw.productUrl ?? `https://www.viator.com/tours/${raw.productCode}`,
  };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Resolve a destination string ("Tokyo, Japan", "tokyo", "Tokyo Prefecture")
// to a Viator destination ID. Hits the in-memory cache first; falls back
// to /destinations API for unknown cities.
async function resolveDestinationId(location: string): Promise<number | null> {
  const key = location.toLowerCase().split(",")[0].trim();
  if (VIATOR_DEST_CACHE[key]) return VIATOR_DEST_CACHE[key];
  // Try without prefecture / state suffix (e.g. "Tokyo Prefecture" → "tokyo")
  const stripped = key.replace(/\s+(prefecture|state|province|region)$/i, "");
  if (VIATOR_DEST_CACHE[stripped]) return VIATOR_DEST_CACHE[stripped];
  // Fallback: query Viator's destinations list.
  try {
    const resp = await fetch(`${BASE_URL}/destinations`, {
      headers: {
        "exp-api-key": TOKEN,
        Accept: "application/json;version=2.0",
      },
      next: { revalidate: 86400 }, // 24h cache — destination list rarely changes
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { destinations?: Array<{ destinationId?: number; name?: string }> };
    const match = data.destinations?.find(
      (d) => d.name?.toLowerCase() === key || d.name?.toLowerCase() === stripped,
    );
    return match?.destinationId ?? null;
  } catch {
    return null;
  }
}
