// Hotelbeds Content API — hotel descriptions, images, facilities, rate comments.
//
// Cert §5.x: required to display hotel content (descriptions, photos,
// facilities). Cert §3.9 + §4.4: required to look up rate comments by
// rateCommentsId returned on Availability / CheckRate / Booking.
//
// Content data is supposed to be cached and refreshed weekly (cert §5
// intro). We surface a fetch+cache helper here; the call sites use
// Next.js fetch revalidate for edge caching.
//
// Shares the same HMAC signing + Api-key auth as the booking API
// (lib/hotelbeds.ts → hbFetch), so we import that primitive.

import { createHash } from "node:crypto";

const ENV = process.env.HOTELBEDS_ENV ?? "test";
const BASE_URL = ENV === "live" ? "https://api.hotelbeds.com" : "https://api.test.hotelbeds.com";

function creds() {
  const apiKey = process.env.HOTELBEDS_HOTEL_API_KEY;
  const secret = process.env.HOTELBEDS_HOTEL_SECRET;
  if (!apiKey || !secret) return null;
  return { apiKey, secret };
}

async function contentFetch<T>(path: string, revalidateSeconds = 604800): Promise<T> {
  const c = creds();
  if (!c) throw new Error("HOTELBEDS_HOTEL_API_KEY or _SECRET not set");
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256")
    .update(c.apiKey + c.secret + timestamp)
    .digest("hex");
  const resp = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Api-key": c.apiKey,
      "X-Signature": signature,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
    // 7-day cache by default — content updates rarely (rate comments
    // can be fresher; callers override revalidate via the parameter).
    next: { revalidate: revalidateSeconds },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`hotelbeds-content ${resp.status}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
}

// ── Hotel detail ─────────────────────────────────────────────────────────

export interface HotelContent {
  code: number;
  name: string;
  description: string | null;
  category: { code: string; name: string } | null;
  address: { street?: string; city?: string; postalCode?: string; country?: string } | null;
  phones: Array<{ phoneNumber: string; phoneType: string }>;
  images: Array<{ path: string; type: string; order: number }>;
  facilities: Array<{
    code: number;
    name: string;
    description: string;
    groupCode: number;
    fee: boolean;
  }>;
  interestPoints: Array<{ name: string; distance: string }>;
}

interface HotelDetailApiResponse {
  hotel?: {
    code: number;
    name?: { content: string };
    description?: { content: string };
    category?: { code: string; description?: { content: string } };
    address?: { content?: string; street?: string };
    city?: { content: string };
    postalCode?: string;
    countryCode?: string;
    phones?: Array<{ phoneNumber: string; phoneType: string }>;
    images?: Array<{ path: string; imageTypeCode: string; order: number }>;
    facilities?: Array<{
      facilityCode: number;
      facilityGroupCode: number;
      description?: { content: string };
      indFee?: boolean;
      indYesOrNo?: boolean;
    }>;
    interestPoints?: Array<{ poiName: string; distance: string }>;
  };
}

export async function getHotelContent(code: number, language = "ENG"): Promise<HotelContent | null> {
  try {
    const data = await contentFetch<HotelDetailApiResponse>(
      `/hotel-content-api/1.0/hotels/${code}/details?language=${language}`,
    );
    const h = data.hotel;
    if (!h) return null;
    return {
      code: h.code,
      name: h.name?.content ?? "",
      description: h.description?.content ?? null,
      category: h.category
        ? { code: h.category.code, name: h.category.description?.content ?? "" }
        : null,
      address: h.address
        ? {
            street: h.address.street ?? h.address.content,
            city: h.city?.content,
            postalCode: h.postalCode,
            country: h.countryCode,
          }
        : null,
      phones: h.phones ?? [],
      images: (h.images ?? []).map((img) => ({
        // Content API returns relative paths; prepend the CDN base.
        path: `https://photos.hotelbeds.com/giata/bigger/${img.path}`,
        type: img.imageTypeCode,
        order: img.order,
      })),
      facilities: (h.facilities ?? [])
        .filter((f) => f.indYesOrNo !== false) // skip "mandatory but not present" facilities
        .map((f) => ({
          code: f.facilityCode,
          name: f.description?.content ?? "",
          description: f.description?.content ?? "",
          groupCode: f.facilityGroupCode,
          fee: f.indFee ?? false,
        })),
      interestPoints: (h.interestPoints ?? []).map((p) => ({
        name: p.poiName,
        distance: p.distance,
      })),
    };
  } catch (err) {
    console.error("[hotelbeds-content] getHotelContent", err);
    return null;
  }
}

// ── Rate comments (cert §3.9, §4.4 mandatory) ────────────────────────────

export interface RateComment {
  id: string;
  description: string;
  validFrom: string | null;
  validTo: string | null;
}

interface RateCommentsApiResponse {
  rateComments?: Array<{
    code: string;
    description: string;
    incomingOffice?: { code: string };
    dateFrom?: string;
    dateTo?: string;
  }>;
}

// rateCommentsId format is "incomingOffice|code|hotel" — pass the
// incomingOffice and code parts to look up the comment text.
export async function getRateComment(
  rateCommentsId: string,
  language = "ENG",
): Promise<RateComment | null> {
  // rateCommentsId is dash- or pipe-separated. Hotelbeds wants
  // ?code=<code>&incomingOffice=<office> on the query.
  const parts = rateCommentsId.split(/[|\-]/);
  if (parts.length < 2) return null;
  const [incomingOffice, code] = parts;
  try {
    const data = await contentFetch<RateCommentsApiResponse>(
      `/hotel-content-api/1.0/types/ratecomments?codes=${encodeURIComponent(code)}&incomingOffice=${encodeURIComponent(incomingOffice)}&language=${language}`,
      // Shorter cache for rate comments — they can change with promos.
      86400,
    );
    const rc = data.rateComments?.[0];
    if (!rc) return null;
    return {
      id: rc.code,
      description: rc.description,
      validFrom: rc.dateFrom ?? null,
      validTo: rc.dateTo ?? null,
    };
  } catch (err) {
    console.error("[hotelbeds-content] getRateComment", err);
    return null;
  }
}

export async function getRateCommentsBulk(
  ids: string[],
  language = "ENG",
): Promise<Record<string, RateComment>> {
  const out: Record<string, RateComment> = {};
  await Promise.all(
    ids.map(async (id) => {
      const rc = await getRateComment(id, language);
      if (rc) out[id] = rc;
    }),
  );
  return out;
}
