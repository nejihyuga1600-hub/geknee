// POST /api/share-unfurl
//
// Called by the iOS Share Extension when the user taps geknee in the share
// sheet. Given a shared URL or text, resolves a canonical place — venue name,
// city, country, lat/lon, thumbnail — so the mini-UI can show "add {venue}
// to Tokyo trip?" and the add-from-share endpoint can insert it into the
// user's itinerary.
//
// Sources supported (v1):
//   - Instagram post / reel URL → OG scrape + JSON-LD parse for location
//   - TikTok video URL          → oEmbed API + author city
//   - YouTube video URL         → oEmbed API + description parse
//   - Airbnb listing URL        → OG scrape (title carries city)
//   - Google Maps URL           → lat/lon extracted from ?q=/@ params
//   - Generic URL               → OG title + Places text-search fallback
//   - Raw text ("Angkor Wat")   → Google Places text-search
//
// The Share Extension is auth-gated by the App Group auth token (see
// GekneeShare/ShareViewController). This endpoint requires a valid geknee
// session — the extension forwards the cookie from the main app.

import { auth } from "@/auth";

const PLACES_KEY =
  process.env.GOOGLE_PLACES_API_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

type UnfurlResult = {
  venueName: string;
  city?: string;
  country?: string;
  lat?: number;
  lon?: number;
  thumbnail?: string;
  source: "instagram" | "tiktok" | "youtube" | "airbnb" | "gmaps" | "url" | "text";
  sourceUrl?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { source?: string; payload?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.source;
  const payload = (body.payload ?? "").trim();
  if (!payload) {
    return Response.json({ error: "payload required" }, { status: 400 });
  }

  try {
    if (kind === "text") {
      const result = await unfurlText(payload);
      return Response.json(result);
    }
    // Default to URL handling for anything not explicitly text.
    const result = await unfurlUrl(payload);
    return Response.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: `Unfurl failed: ${message}` }, { status: 500 });
  }
}

// ── URL handlers ────────────────────────────────────────────────────────────

async function unfurlUrl(input: string): Promise<UnfurlResult> {
  const url = normalizeUrl(input);
  const host = new URL(url).hostname.replace(/^www\./, "");

  if (host.includes("instagram.com")) return unfurlInstagram(url);
  if (host.includes("tiktok.com"))    return unfurlTikTok(url);
  if (host === "youtube.com" || host === "youtu.be" || host.includes("youtube.com")) {
    return unfurlYouTube(url);
  }
  if (host.includes("airbnb.")) return unfurlAirbnb(url);
  if (host === "google.com" || host === "maps.google.com" || host === "goo.gl" ||
      host === "maps.app.goo.gl") {
    return unfurlGoogleMaps(url);
  }
  return unfurlGeneric(url);
}

function normalizeUrl(s: string): string {
  // Strip surrounding whitespace, angle brackets, share-sheet-added query cruft.
  let clean = s.trim().replace(/^[<"']|[>"']$/g, "");
  if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;
  try {
    const u = new URL(clean);
    // Strip common tracking params.
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content",
                      "utm_term", "igshid", "fbclid"]) {
      u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return clean;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; geknee-share-unfurl/1.0; +https://geknee.com)",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // Follow social redirects; oEmbed pages rely on it.
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
  return await res.text();
}

// Extract <meta property="og:X" content="Y"> or JSON-LD.
function ogTag(html: string, prop: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = re.exec(html);
  return m?.[1];
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out;
}

async function unfurlInstagram(url: string): Promise<UnfurlResult> {
  const html = await fetchHtml(url);
  const title = ogTag(html, "og:title") ?? "";
  const desc = ogTag(html, "og:description") ?? "";
  const thumb = ogTag(html, "og:image");

  // Instagram sometimes embeds the tagged location inside JSON-LD.
  let venue = "";
  let lat: number | undefined;
  let lon: number | undefined;
  for (const block of jsonLdBlocks(html)) {
    const loc = extractPlace(block);
    if (loc) {
      venue = loc.name ?? venue;
      lat = loc.lat ?? lat;
      lon = loc.lon ?? lon;
    }
  }
  // Fallback: Instagram OG title is often "Handle on Instagram: comment". Not
  // useful as venue name. Try Places text-search on desc + geocode.
  if (!venue) {
    const guess = pickVenueGuess(desc) ?? pickVenueGuess(title);
    if (guess) {
      const place = await placesTextSearch(guess);
      if (place) return { ...place, source: "instagram", sourceUrl: url, thumbnail: thumb };
    }
  }
  return {
    venueName: venue || title.split(" on Instagram")[0] || "Instagram post",
    lat, lon,
    thumbnail: thumb,
    source: "instagram",
    sourceUrl: url,
  };
}

async function unfurlTikTok(url: string): Promise<UnfurlResult> {
  // TikTok's oEmbed endpoint returns title + author + thumbnail_url.
  const oe = await fetch(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  ).then(r => r.ok ? r.json() : null).catch(() => null) as
    | { title?: string; thumbnail_url?: string; author_name?: string } | null;

  // Pull the caption from oEmbed title, then fish for a venue via Places
  // text-search. Consumer TikToks rarely include structured location; text
  // heuristics + Places give us the best guess.
  const title = oe?.title ?? "";
  const guess = pickVenueGuess(title);
  if (guess) {
    const place = await placesTextSearch(guess);
    if (place) return { ...place, source: "tiktok", sourceUrl: url,
                        thumbnail: oe?.thumbnail_url };
  }
  return {
    venueName: title || "TikTok video",
    thumbnail: oe?.thumbnail_url,
    source: "tiktok",
    sourceUrl: url,
  };
}

async function unfurlYouTube(url: string): Promise<UnfurlResult> {
  const oe = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  ).then(r => r.ok ? r.json() : null).catch(() => null) as
    | { title?: string; thumbnail_url?: string } | null;

  const title = oe?.title ?? "";
  const guess = pickVenueGuess(title);
  if (guess) {
    const place = await placesTextSearch(guess);
    if (place) return { ...place, source: "youtube", sourceUrl: url,
                        thumbnail: oe?.thumbnail_url };
  }
  return {
    venueName: title || "YouTube video",
    thumbnail: oe?.thumbnail_url,
    source: "youtube",
    sourceUrl: url,
  };
}

async function unfurlAirbnb(url: string): Promise<UnfurlResult> {
  const html = await fetchHtml(url);
  const title = ogTag(html, "og:title") ?? "";
  const desc = ogTag(html, "og:description") ?? "";
  const thumb = ogTag(html, "og:image");
  // Airbnb OG title format: "<listing type> in <city> · Airbnb"
  const cityMatch = /\bin\s+([^·|,·]+?)\s*[·|,]/i.exec(title) ||
                    /\bin\s+([A-Z][^\.]+)/i.exec(desc);
  const city = cityMatch?.[1]?.trim();
  if (city) {
    const place = await placesTextSearch(city);
    if (place) return { ...place, venueName: title || place.venueName,
                        source: "airbnb", sourceUrl: url, thumbnail: thumb };
  }
  return {
    venueName: title || "Airbnb listing",
    thumbnail: thumb,
    source: "airbnb",
    sourceUrl: url,
  };
}

async function unfurlGoogleMaps(url: string): Promise<UnfurlResult> {
  // Resolve shortened links (goo.gl / maps.app.goo.gl) first.
  const finalUrl = await resolveRedirect(url);
  const parsed = new URL(finalUrl);

  // @LAT,LON,zoom pattern in path
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(parsed.pathname + parsed.search);
  if (at) {
    const lat = parseFloat(at[1]);
    const lon = parseFloat(at[2]);
    const reverse = await reverseGeocode(lat, lon);
    return {
      venueName: reverse?.venueName ?? "Location",
      city: reverse?.city,
      country: reverse?.country,
      lat, lon,
      source: "gmaps",
      sourceUrl: finalUrl,
    };
  }
  // ?q=<query>
  const q = parsed.searchParams.get("q");
  if (q) {
    const place = await placesTextSearch(q);
    if (place) return { ...place, source: "gmaps", sourceUrl: finalUrl };
  }
  return { venueName: "Google Maps location", source: "gmaps", sourceUrl: finalUrl };
}

async function unfurlGeneric(url: string): Promise<UnfurlResult> {
  const html = await fetchHtml(url);
  const title = ogTag(html, "og:title") ?? ogTag(html, "twitter:title") ?? "";
  const thumb = ogTag(html, "og:image");
  const guess = pickVenueGuess(title);
  if (guess) {
    const place = await placesTextSearch(guess);
    if (place) return { ...place, source: "url", sourceUrl: url, thumbnail: thumb };
  }
  return { venueName: title || "Shared link", thumbnail: thumb, source: "url", sourceUrl: url };
}

async function unfurlText(text: string): Promise<UnfurlResult> {
  const place = await placesTextSearch(text);
  if (place) return { ...place, source: "text" };
  return { venueName: text, source: "text" };
}

// ── Support: JSON-LD place, Places text-search, geocoding ───────────────────

function extractPlace(node: unknown): { name?: string; lat?: number; lon?: number } | null {
  // Walk JSON-LD for @type: Place / TouristAttraction / LocalBusiness.
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const types = Array.isArray(t) ? t : t ? [t] : [];
  if (types.some((x) =>
        String(x).match(/Place|TouristAttraction|LocalBusiness|Restaurant|Hotel/i))) {
    const geo = obj.geo as Record<string, unknown> | undefined;
    return {
      name: (obj.name as string) ?? undefined,
      lat: geo?.latitude !== undefined ? Number(geo.latitude) : undefined,
      lon: geo?.longitude !== undefined ? Number(geo.longitude) : undefined,
    };
  }
  // Recurse into arrays / nested objects (SchemaOrg often wraps in @graph).
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = extractPlace(item);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = extractPlace(v);
      if (hit) return hit;
    }
  }
  return null;
}

// Heuristic: strip caption-style prefixes and try to identify a proper-noun
// substring that looks like a venue or place name.
function pickVenueGuess(text: string): string | null {
  if (!text) return null;
  const stripped = text
    .replace(/^[^:]{0,40}:\s*/, "")           // "Handle: caption" → "caption"
    .replace(/[#@]\w+/g, "")                    // strip hashtags + mentions
    .replace(/\s+/g, " ")
    .trim();
  // Take the first stretch of Titlecase Words (likely place name).
  const m = /((?:[A-Z][\w'’.-]+(?:\s+|$)){1,5})/.exec(stripped);
  if (m) {
    const guess = m[1].trim();
    // Reject if it's all lowercase leftovers or 1 short word ("A", "The")
    if (guess.length >= 3 && /[A-Z]/.test(guess)) return guess;
  }
  return null;
}

async function placesTextSearch(query: string): Promise<{
  venueName: string; city?: string; country?: string;
  lat?: number; lon?: number; thumbnail?: string;
} | null> {
  if (!PLACES_KEY) return null;
  const url = "https://maps.googleapis.com/maps/api/place/textsearch/json?"
    + new URLSearchParams({ query, key: PLACES_KEY }).toString();
  const res = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null) as
    | { results?: Array<{
          name?: string;
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
      }>; } | null;
  const top = res?.results?.[0];
  if (!top) return null;
  const addr = top.formatted_address ?? "";
  const parts = addr.split(",").map(s => s.trim());
  return {
    venueName: top.name ?? query,
    city: parts.length >= 2 ? parts[parts.length - 2] : undefined,
    country: parts.length >= 1 ? parts[parts.length - 1] : undefined,
    lat: top.geometry?.location?.lat,
    lon: top.geometry?.location?.lng,
  };
}

async function reverseGeocode(lat: number, lon: number): Promise<{
  venueName?: string; city?: string; country?: string;
} | null> {
  if (!PLACES_KEY) return null;
  const url = "https://maps.googleapis.com/maps/api/geocode/json?"
    + new URLSearchParams({
        latlng: `${lat},${lon}`,
        key: PLACES_KEY,
      }).toString();
  const res = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null) as
    | { results?: Array<{
          formatted_address?: string;
          address_components?: Array<{ long_name: string; types: string[] }>;
      }>; } | null;
  const top = res?.results?.[0];
  if (!top) return null;
  const comps = top.address_components ?? [];
  const city = comps.find(c => c.types.includes("locality"))?.long_name
             ?? comps.find(c => c.types.includes("administrative_area_level_1"))?.long_name;
  const country = comps.find(c => c.types.includes("country"))?.long_name;
  return { venueName: top.formatted_address, city, country };
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return res.url || url;
  } catch {
    return url;
  }
}
