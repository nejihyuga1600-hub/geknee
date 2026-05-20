import { NextResponse } from 'next/server';

// Server-side Google Directions wrapper. Hides the server key from the
// client and lets us add caching later. Used by DayMap, UnifiedTripMap,
// and the live trip page.

export const runtime = 'nodejs';

type Body = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: 'walking' | 'driving' | 'cycling' | 'transit';
};

const MODE_MAP: Record<Body['mode'], string> = {
  walking: 'walking',
  driving: 'driving',
  cycling: 'bicycling',
  transit: 'transit',
};

export async function POST(req: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 });

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

  const googleMode = MODE_MAP[body.mode];
  if (!googleMode) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 });
  }

  const origin = `${oLat},${oLng}`;
  const dest   = `${dLat},${dLng}`;
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=${googleMode}&key=${key}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json({ error: isTimeout ? 'directions timeout' : 'directions fetch failed' }, { status: isTimeout ? 504 : 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `directions ${res.status}` }, { status: 502 });
  const data = await res.json() as { routes?: Array<{ overview_polyline?: { points: string }; legs: Array<{ duration: { value: number }; distance: { value: number } }> }> };
  const route = data.routes?.[0];
  if (!route) return NextResponse.json({ error: 'no route' }, { status: 404 });

  return NextResponse.json({
    polyline: route.overview_polyline?.points ?? '',
    durationSec: route.legs?.[0]?.duration?.value ?? null,
    distanceM:   route.legs?.[0]?.distance?.value ?? null,
  }, {
    headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400' },
  });
}
