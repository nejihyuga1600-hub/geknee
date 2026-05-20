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

  const origin = `${body.origin.lat},${body.origin.lng}`;
  const dest   = `${body.destination.lat},${body.destination.lng}`;
  const mode   = MODE_MAP[body.mode];
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=${mode}&key=${key}`;

  const res = await fetch(url);
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
