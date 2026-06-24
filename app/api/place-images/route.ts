// Returns proxy URLs for place photos.
// Pipeline: Google Places → Foursquare → empty array
//
// Diagnostics: every response includes a `status` field so the client
// (or curl) can verify whether photos came from Google, Foursquare,
// neither, or whether the API key is missing entirely. The previous
// shape ({ images: [...] }) is preserved for back-compat.

import { auth } from "@/auth";

type PlaceImagesStatus =
  | "ok-google"             // Google Places returned at least one usable photo
  | "ok-foursquare"         // Google had nothing/keyless, Foursquare returned photos
  | "no-google-key"         // GOOGLE_PLACES_API_KEY not configured in env
  | "google-no-photos"      // Key configured, but the query returned no photos
  | "google-error"          // Google API threw / non-OK response
  | "no-name"               // Caller didn't pass `name`
  | "unauthorized"          // Session missing
  | "empty";                // Nothing matched anywhere

function log(status: PlaceImagesStatus, query: string, extra?: unknown) {
  // Server-side log so we can grep Vercel runtime logs for "place-images:".
  console.log(`[place-images] status=${status} q=${JSON.stringify(query)}${extra ? ` extra=${JSON.stringify(extra)}` : ""}`);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    log("unauthorized", "");
    return Response.json({ images: [], status: "unauthorized" as PlaceImagesStatus }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const name     = searchParams.get("name")     ?? "";
  const location = searchParams.get("location") ?? "";

  if (!name) {
    log("no-name", "");
    return Response.json({ images: [], status: "no-name" as PlaceImagesStatus });
  }

  const query = `${name} ${location}`.trim();

  // ── 1. Google Places ────────────────────────────────────────────────────────
  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_KEY) {
    log("no-google-key", query);
  }
  if (GOOGLE_KEY) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`
      );
      const data = await res.json() as {
        results?: Array<{
          photos?: Array<{ photo_reference: string; width?: number; height?: number }>;
          types?: string[];
          business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
        }>;
      };
      const top = data.results?.[0];
      const photos = top?.photos ?? [];
      const businessStatus = top?.business_status ?? null;
      // Type-driven filtering. We have three buckets:
      //   - SELFIE_PRONE: markets, cafes, bars, etc. — Google's user-
      //     uploaded photos are dominated by portraits/selfies. Strict
      //     landscape only.
      //   - TRUSTED: lodging, museums, attractions, parks, religious
      //     sites — pro-quality photos, portraits are usually room
      //     shots / interior verticals (totally fine). Accept all
      //     dimensioned photos so the slideshow has variety.
      //   - UNKNOWN: split the difference — landscape preferred,
      //     dimensioned photos as fallback.
      const SELFIE_PRONE_TYPES = new Set([
        'restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'meal_delivery',
        'bakery', 'night_club', 'beauty_salon', 'hair_care', 'gym',
        'clothing_store', 'shopping_mall', 'store',
      ]);
      const TRUSTED_TYPES = new Set([
        'lodging', 'hotel', 'spa', 'resort',
        'tourist_attraction', 'museum', 'art_gallery',
        'park', 'natural_feature', 'campground', 'amusement_park',
        'place_of_worship', 'church', 'hindu_temple', 'mosque', 'synagogue',
        'stadium', 'aquarium', 'zoo',
      ]);
      const types = top?.types ?? [];
      const isSelfieProne = types.some(t => SELFIE_PRONE_TYPES.has(t));
      const isTrusted = types.some(t => TRUSTED_TYPES.has(t));

      // Sort landscape-first by width/height ratio.
      const ranked = [...photos].sort((a, b) => {
        const ar = (a.width ?? 0) / Math.max(1, a.height ?? 0);
        const br = (b.width ?? 0) / Math.max(1, b.height ?? 0);
        return br - ar;
      });
      const dimensioned = ranked.filter(p => p.width && p.height);
      const landscape = dimensioned.filter(p => p.width! / p.height! >= 1.05);

      const pool = isSelfieProne
        ? landscape
        : (isTrusted
            ? dimensioned                                            // hotels etc — accept everything dimensioned
            : (landscape.length > 0 ? landscape : dimensioned));     // unknown — prefer landscape

      if (pool.length > 0) {
        const images = pool.slice(0, 8).map(
          (p) => `/api/place-photo?ref=${encodeURIComponent(p.photo_reference)}`
        );
        log("ok-google", query, { count: images.length, types });
        return Response.json({ images, status: "ok-google" as PlaceImagesStatus, businessStatus });
      }
      // No photos but we still know the status — surface it so the
      // itinerary card can warn the user even if no thumb renders.
      if (businessStatus && businessStatus !== 'OPERATIONAL') {
        return Response.json({ images: [], status: "empty" as PlaceImagesStatus, businessStatus });
      }
      log("google-no-photos", query, { hitCount: data.results?.length ?? 0 });
    } catch (err) {
      console.error("[place-images] google error:", err);
      log("google-error", query, { error: String(err) });
    }
  }

  // ── 2. Foursquare Places ────────────────────────────────────────────────────
  const FSQ_KEY = process.env.FOURSQUARE_API_KEY;
  if (FSQ_KEY) {
    try {
      // Search for the place
      const searchRes = await fetch(
        `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(query)}&limit=1&fields=fsq_id,name`,
        { headers: { Authorization: FSQ_KEY, Accept: "application/json" } }
      );
      const searchData = await searchRes.json() as {
        results?: Array<{ fsq_id: string }>;
      };
      const fsqId = searchData.results?.[0]?.fsq_id;

      if (fsqId) {
        // Fetch photos for that place
        const photoRes = await fetch(
          `https://api.foursquare.com/v3/places/${fsqId}/photos?limit=5`,
          { headers: { Authorization: FSQ_KEY, Accept: "application/json" } }
        );
        const photoData = await photoRes.json() as Array<{
          prefix: string; suffix: string;
        }>;
        const images = (photoData ?? []).map(
          (p) => `${p.prefix}800x600${p.suffix}`
        );
        if (images.length > 0) {
          log("ok-foursquare", query, { count: images.length });
          return Response.json({ images, status: "ok-foursquare" as PlaceImagesStatus });
        }
      }
    } catch (err) {
      console.error("[place-images] foursquare error:", err);
    }
  }

  // Determine final empty-state status so the client can distinguish
  // "key missing" from "key present but no photos matched".
  const finalStatus: PlaceImagesStatus = GOOGLE_KEY ? "empty" : "no-google-key";
  log(finalStatus, query);
  return Response.json({ images: [], status: finalStatus });
}
