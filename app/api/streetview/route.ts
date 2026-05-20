import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return new Response('No API key', { status: 500 });

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!isFinite(lat) || !isFinite(lng)) return new Response('lat/lng required', { status: 400 });

  const heading = searchParams.get('heading') ?? '0';
  const pitch = searchParams.get('pitch') ?? '10';
  const fov = searchParams.get('fov') ?? '80';
  const size = searchParams.get('size') ?? '400x300';

  const url = `https://maps.googleapis.com/maps/api/streetview?location=${lat},${lng}&size=${size}&heading=${heading}&pitch=${pitch}&fov=${fov}&source=outdoor&key=${key}`;

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable' },
  });
}
