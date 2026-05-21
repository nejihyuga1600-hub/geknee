import { NextResponse } from 'next/server';
import { getCached, setCached } from '@/lib/cache/directionsCache';

// Server-side Google Routes API v2 wrapper. Hides the server key from the
// client and caches results via getCached/setCached. Used by DayMap,
// UnifiedTripMap, and the live trip page.

export const runtime = 'nodejs';

type Body = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: 'walking' | 'driving' | 'cycling' | 'transit';
};

const TRAVEL_MODE_MAP: Record<Body['mode'], string> = {
  walking: 'WALK',
  driving: 'DRIVE',
  cycling: 'BICYCLE',
  transit: 'TRANSIT',
};

export async function POST(req: Request) {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: 'No Google Maps API key configured (GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY)' }, { status: 500 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body?.origin || !body?.destination || !body?.mode) {
    return NextResponse.json({ error: 'origin, destination, mode required' }, { status: 400 });
  }

  const { lat: oLat, lng: oLng } = body.origin;
  const { lat: dLat, lng: dLng } = body.destination;
  if (
    typeof oLat !== 'number' || !isFinite(oLat) ||
    typeof oLng !== 'number' || !isFinite(oLng) ||
    typeof dLat !== 'number' || !isFinite(dLat) ||
    typeof dLng !== 'number' || !isFinite(dLng)
  ) {
    return NextResponse.json({ error: 'lat/lng must be finite numbers' }, { status: 400 });
  }

  const travelMode = TRAVEL_MODE_MAP[body.mode];
  if (!travelMode) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
  }

  // Check server-side cache before hitting Google
  const cached = await getCached({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng }, body.mode);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
        'x-cache': 'HIT',
      },
    });
  }

  const reqBody = {
    origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
    destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
    travelMode,
    polylineEncoding: 'ENCODED_POLYLINE',
  };

  let res: Response;
  try {
    res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json({ error: isTimeout ? 'directions timeout' : 'directions fetch failed' }, { status: isTimeout ? 504 : 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `directions ${res.status}` }, { status: 502 });
  const data = await res.json() as { routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline: string } }> };
  const route = data.routes?.[0];
  if (!route) return NextResponse.json({ error: 'no route' }, { status: 404 });

  const durationStr = route.duration ?? '';
  const durationSec = durationStr.endsWith('s') ? parseInt(durationStr.slice(0, -1), 10) : NaN;
  const payload = {
    polyline: route.polyline?.encodedPolyline ?? '',
    durationSec: Number.isFinite(durationSec) ? durationSec : null,
    distanceM: route.distanceMeters ?? null,
  };

  await setCached({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng }, body.mode, payload);

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400' },
  });
}
