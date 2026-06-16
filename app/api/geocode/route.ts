// Server-side geocoding cache — saves Google Geocoding API credits by caching
// resolved coordinates in a module-level Map (persists within a serverless instance).
// Identical requests within the same instance return instantly without hitting the API.

import { auth } from "@/auth";

const cache = new Map<string, { lat: number; lng: number; country?: string | null }>();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address')?.trim();
  if (!address) return Response.json({ error: 'address required' }, { status: 400 });

  // Optional viewport-bias bounds. When the client knows roughly where a
  // pin SHOULD be (e.g. clustered with the other pins from the same day),
  // it can pass swLat/swLng/neLat/neLng to bias Google's result toward
  // that bbox without hard-restricting. Cache key includes bounds so a
  // biased query doesn't poison the un-biased cache slot.
  const swLat = parseFloat(searchParams.get('swLat') ?? '');
  const swLng = parseFloat(searchParams.get('swLng') ?? '');
  const neLat = parseFloat(searchParams.get('neLat') ?? '');
  const neLng = parseFloat(searchParams.get('neLng') ?? '');
  const hasBounds = [swLat, swLng, neLat, neLng].every(Number.isFinite);
  const cacheKey = hasBounds
    ? `${address}|${swLat.toFixed(3)},${swLng.toFixed(3)}|${neLat.toFixed(3)},${neLng.toFixed(3)}`
    : address;

  const hit = cache.get(cacheKey);
  if (hit) return Response.json(hit);

  // Fall through the same key chain the agent's geocode tool uses, so
  // production deploys that only configured GOOGLE_MAPS_API_KEY (or the
  // NEXT_PUBLIC_ variant) don't 500 here and silently kill the day map.
  const apiKey =
    process.env.GOOGLE_GEOCODE_KEY ??
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Response.json({ error: 'no API key' }, { status: 500 });

  const boundsParam = hasBounds
    ? `&bounds=${swLat},${swLng}|${neLat},${neLng}`
    : '';
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}${boundsParam}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.[0]) {
    return Response.json(null);
  }

  const loc = data.results[0].geometry.location as { lat: number; lng: number };
  // ISO 3166-1 alpha-2 country code, used by the live-trip Safety card.
  const country =
    (data.results[0].address_components as { types: string[]; short_name: string }[] | undefined)
      ?.find((c) => c.types.includes('country'))?.short_name ?? null;
  const result = { ...loc, country };
  cache.set(cacheKey, result);
  return Response.json(result);
}
