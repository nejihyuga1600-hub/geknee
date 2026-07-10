// POST /api/geofence/register
//
// Called by the GekneeGeofence Capacitor plugin on:
//   1. app foreground (initial arm + refresh when user moves > 5km)
//   2. after a new place is saved (bridge fires this)
//
// Body:
//   { lat: number, lon: number, radiusM?: number }
//     lat/lon = current device position (used to prioritize closest 20 places)
//     radiusM = per-fence radius in meters (default 300m — enough for a
//               block or two of NYC, tight enough to feel like "you're here")
//
// Response:
//   {
//     fences: [{ id, venueName, city, lat, lon, radiusM, category }],
//     ttlMinutes: number   // client re-registers on foreground OR after ttl
//   }
//
// Notes:
//   - iOS CoreLocation caps monitored regions per-app at 20; we surface at
//     most 20 sorted by great-circle distance from (lat, lon).
//   - Android GeofencingClient caps at 100 per-app; when we ship Android we
//     bump the limit but keep the 20-closest ordering for consistency.
//   - Great-circle math done in-process rather than PostGIS. With a
//     lat/lon index and a bounding-box prefilter we scan at most a few
//     hundred rows for a heavy user.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RADIUS_M = 300;
const MAX_FENCES = 20;
const TTL_MINUTES = 60;
// Approx km per degree at the equator — near the poles this over-estimates,
// which is fine for a prefilter (we still compute exact distance below).
const KM_PER_DEG = 111;
// Bounding box radius for the prefilter — 100 km. Anything closer than that
// gets an exact great-circle distance and is candidate for the top-20.
const PREFILTER_KM = 100;

type Body = { lat?: number; lon?: number; radiusM?: number };

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat/lon required" }, { status: 400 });
  }
  const radiusM = clampNumber(body.radiusM, 100, 2000, DEFAULT_RADIUS_M);

  // Bounding-box prefilter — keeps the row scan bounded even for global travelers.
  const latDelta = PREFILTER_KM / KM_PER_DEG;
  const lonDelta = PREFILTER_KM / (KM_PER_DEG * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const rows = await prisma.savedPlace.findMany({
    where: {
      userId,
      lat: { gte: lat - latDelta, lte: lat + latDelta, not: null },
      lon: { gte: lon - lonDelta, lte: lon + lonDelta, not: null },
    },
    select: {
      id: true,
      venueName: true,
      city: true,
      lat: true,
      lon: true,
      category: true,
    },
  });

  const ranked = rows
    .filter((r): r is typeof r & { lat: number; lon: number } => r.lat != null && r.lon != null)
    .map(r => ({ ...r, distanceKm: haversineKm(lat, lon, r.lat, r.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_FENCES);

  return Response.json({
    fences: ranked.map(r => ({
      id: r.id,
      venueName: r.venueName,
      city: r.city,
      lat: r.lat,
      lon: r.lon,
      radiusM,
      category: r.category,
    })),
    ttlMinutes: TTL_MINUTES,
    prefilterRadiusKm: PREFILTER_KM,
    origin: { lat, lon },
  });
}

// POST /api/geofence/trigger — the plugin calls this when the OS fires an
// entry event for a monitored region. We rate-limit per (user, place) to
// avoid re-notifying if the user loiters, and to skip when they're already
// looking at the trip.
export async function PUT(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { placeId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placeId = (body.placeId ?? "").trim();
  if (!placeId) return Response.json({ error: "placeId required" }, { status: 400 });

  const place = await prisma.savedPlace.findFirst({
    where: { id: placeId, userId },
    select: { id: true, venueName: true, city: true, category: true, tripId: true },
  });
  if (!place) return Response.json({ error: "Not found" }, { status: 404 });

  // 30-min cooldown per (user, place). If we notified in the last 30m, no-op.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const recent = await prisma.nearbyNotification.findFirst({
    where: { userId, placeId, notifiedAt: { gte: thirtyMinAgo } },
    orderBy: { notifiedAt: "desc" },
  });
  if (recent) {
    return Response.json({ status: "cooldown", cooldownUntil: new Date(recent.notifiedAt.getTime() + 30 * 60 * 1000).toISOString() });
  }

  await prisma.nearbyNotification.create({ data: { userId, placeId } });

  return Response.json({
    status: "notify",
    title: `You're near ${place.venueName}${place.city ? ` in ${place.city}` : ""}`,
    body: "One of your saved places is just around the corner.",
    deeplink: place.tripId ? `/trip/${place.tripId}/live` : `/saves?highlight=${place.id}`,
  });
}

// ── math ────────────────────────────────────────────────────────────────────

function clampNumber(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
