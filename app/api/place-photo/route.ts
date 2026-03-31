// Proxies a single Google Places photo by photo_reference.
// Keeps the API key server-side; responses are cached 24h.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") ?? "";

  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_KEY || !ref) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(ref)}&key=${GOOGLE_KEY}`
    );

    if (!res.ok) {
      return new Response("Photo not found", { status: 404 });
    }

    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("place-photo proxy error:", err);
    return new Response("Error", { status: 500 });
  }
}
