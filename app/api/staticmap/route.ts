// Generic Maps Static API proxy. Lets unsaved-trip surfaces (e.g. the
// mobile itinerary thumbnail before the trip has been persisted) render
// a low-cost static preview instead of mounting interactive Google Maps.
//
// Read-side companion to /api/og-trip-map, which is reserved for trip
// OG cards (fixed 1200x630, looks up tripId in Prisma, public for link
// previewers). This route is parameter-driven, auth-gated, and tuned
// for in-app thumbnails.
//
// Cost mitigations
// - lat/lng coalesced to 2dp before being sent upstream → CDN cache hits
// - response Cache-Control: public, max-age=1d, s-maxage=1d, swr=1w
// - hard caps: size 100..640, zoom 0..20, max 50 pins, querystring 2048 chars
//
// Style parity with og-trip-map: same dark palette so the two routes look
// identical when stacked in the UI.

import { auth } from '@/auth';

export const runtime = 'nodejs';

const STATIC_STYLE_PARTS = [
  'feature:all|element:geometry|color:0x1d2c4d',
  'feature:water|element:geometry|color:0x0e1626',
  'feature:road|element:geometry|color:0x304a7d',
  'feature:road|element:labels.text.fill|color:0x98a5be',
  'feature:road|element:labels.icon|visibility:off',
  'feature:road.highway|element:labels.icon|visibility:off',
  'feature:administrative.land_parcel|visibility:off',
  'feature:poi|visibility:off',
  'feature:transit|visibility:off',
];
const STATIC_STYLE_QUERY = STATIC_STYLE_PARTS.map((s) => `style=${encodeURIComponent(s)}`).join('&');

const PIN_COLOR = '0xa78bfa'; // geknee purple
const MAX_PINS = 50;
const MAX_QUERY_LEN = 2048;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// 2dp coalescing: ~1.1 km at the equator. The static thumbnail use case
// can't tell the difference but the CDN absolutely can.
function snap2dp(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function parsePins(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_PINS)
    .map((p) => {
      const [latS, lngS] = p.split(',');
      const lat = Number(latS);
      const lng = Number(lngS);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return `${snap2dp(lat)},${snap2dp(lng)}`;
    })
    .filter((p): p is string => p !== null);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return new Response('No API key', { status: 500 });

  const url = new URL(req.url);
  const location = url.searchParams.get('location')?.trim();
  const pins = parsePins(url.searchParams.get('pins'));

  // Need a center: either an explicit location string or at least one pin.
  if (!location && pins.length === 0) {
    return new Response('location or pins required', { status: 400 });
  }

  const w = clamp(Number(url.searchParams.get('w')) || 800, 100, 640) | 0;
  const h = clamp(Number(url.searchParams.get('h')) || 320, 100, 640) | 0;
  const zoom = clamp(Number(url.searchParams.get('zoom')) || 12, 0, 20) | 0;

  const parts: string[] = [`size=${w}x${h}`];
  if (location) parts.push(`center=${encodeURIComponent(location)}`);
  parts.push(`zoom=${zoom}`);
  if (pins.length > 0) {
    parts.push(
      `markers=${encodeURIComponent(`color:${PIN_COLOR}|size:small|${pins.join('|')}`)}`,
    );
  } else if (location) {
    // No explicit pins → mark the center so the user gets a focal point.
    parts.push(`markers=${encodeURIComponent(`color:${PIN_COLOR}|size:large|${location}`)}`);
  }
  parts.push(STATIC_STYLE_QUERY);

  const upstreamQuery = parts.join('&');
  if (upstreamQuery.length > MAX_QUERY_LEN) {
    return new Response('query too long', { status: 414 });
  }

  const upstream = `https://maps.googleapis.com/maps/api/staticmap?${upstreamQuery}&key=${key}`;

  try {
    const res = await fetch(upstream, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      const warn = res.headers.get('x-staticmap-api-warning') ?? '';
      const body = await res.text().catch(() => '');
      console.error('[staticmap] upstream', res.status, warn || body.slice(0, 300));
      return new Response(`Static maps ${res.status}`, { status: 502 });
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    console.error('[staticmap] exception', isTimeout ? 'timeout' : err);
    return new Response(isTimeout ? 'timeout' : 'fetch failed', { status: isTimeout ? 504 : 502 });
  }
}
