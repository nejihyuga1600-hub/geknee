// Server-side geocoding cache — saves Google Geocoding API credits by caching
// resolved coordinates in a module-level Map (persists within a serverless instance).
// Identical requests within the same instance return instantly without hitting the API.

const cache = new Map<string, { lat: number; lng: number }>();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address')?.trim();
  if (!address) return Response.json({ error: 'address required' }, { status: 400 });

  const hit = cache.get(address);
  if (hit) return Response.json(hit);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Response.json({ error: 'no API key' }, { status: 500 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.[0]) {
    return Response.json(null);
  }

  const loc = data.results[0].geometry.location as { lat: number; lng: number };
  cache.set(address, loc);
  return Response.json(loc);
}
