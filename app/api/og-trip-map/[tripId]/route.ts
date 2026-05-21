import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// Dark style equivalent for Static Maps. Translated from the DARK_STYLE
// in lib/googleMaps/darkStyle.ts, formatted as repeating `&style=` params.
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

export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return new Response('No API key', { status: 500 });

  // Trip-page OG cards must be reachable WITHOUT auth (link previewer
  // services don't authenticate). But we should not leak private trips.
  // For v0: only show OG for the trip's location string + a single
  // pin geocoded from that string. No private pin data exposed.
  const trip = await prisma.tripDraft.findUnique({
    where: { id: tripId },
    select: { location: true, title: true },
  });
  if (!trip || !trip.location) return new Response('Not found', { status: 404 });

  // Use the location string directly as the marker — Static Maps will
  // geocode it server-side (one less API hop for us).
  const markers = `markers=${encodeURIComponent(`color:0xa78bfa|size:large|${trip.location}`)}`;
  const center = `center=${encodeURIComponent(trip.location)}`;
  const url = `https://maps.googleapis.com/maps/api/staticmap?size=1200x630&zoom=12&${center}&${markers}&${STATIC_STYLE_QUERY}&key=${key}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return new Response(`Static maps ${res.status}`, { status: 502 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return new Response(isTimeout ? 'timeout' : 'fetch failed', { status: isTimeout ? 504 : 502 });
  }
}
