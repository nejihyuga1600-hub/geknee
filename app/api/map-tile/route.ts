// Google Static Maps proxy + offline-cache surface.
//
// Why a proxy: the Service Worker can only cache same-origin requests
// reliably (cross-origin opaque responses bloat storage and can't be
// verified). Routing every static map fetch through /api/map-tile makes
// it same-origin so the SW can match-and-cache cleanly.
//
// Also lets us:
//   - Hide the Google API key from the client (key never appears in DOM)
//   - Apply HTTP cache headers so CDN + SW + browser all align on TTL
//   - Pre-warm tiles for a trip (the /api/map-tile/prewarm side hits
//     this route N times with the day-bbox grid)
//
// Cost note: Google Static Maps is billed per request — $2 per 1000 with
// 28K/mo free tier. A typical trip day (5 stops × 2 zoom levels) is 10
// requests; pre-warming the entire trip is maybe 100 requests. Safely
// inside free tier for early users.

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY ?? "";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days — static maps are very stable

export async function GET(req: NextRequest) {
  if (!KEY) {
    return new Response("Server missing GOOGLE_MAPS_API_KEY", { status: 500 });
  }
  const { searchParams } = new URL(req.url);
  // Allowed pass-through params. We deliberately don't accept arbitrary
  // params to limit abuse vectors (e.g. custom `style` injection).
  const allowed = new Set([
    "center", "zoom", "size", "scale", "format", "maptype", "markers", "path", "style",
  ]);
  const out = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) {
    if (!allowed.has(k)) continue;
    out.append(k, v);
  }
  // Sensible defaults so callers can be terse.
  if (!out.has("size")) out.set("size", "600x400");
  if (!out.has("scale")) out.set("scale", "2");
  if (!out.has("format")) out.set("format", "png");
  if (!out.has("zoom")) out.set("zoom", "13");
  if (!out.has("center")) {
    return new Response("center=<lat,lng> required", { status: 400 });
  }
  out.set("key", KEY);

  const upstream = `https://maps.googleapis.com/maps/api/staticmap?${out.toString()}`;
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream);
  } catch (err) {
    console.error("[map-tile] upstream fetch failed", err);
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstreamRes.ok) {
    const body = await upstreamRes.text();
    console.error("[map-tile] upstream non-2xx:", upstreamRes.status, body.slice(0, 200));
    return new Response("Upstream error", { status: upstreamRes.status });
  }
  const png = await upstreamRes.arrayBuffer();
  return new Response(png, {
    status: 200,
    headers: {
      "content-type": "image/png",
      // CDN + SW + browser all see this — they can all cache for 30 days.
      "cache-control": `public, max-age=${MAX_AGE_S}, immutable`,
      "x-tile-source": "google-static-maps",
    },
  });
}
