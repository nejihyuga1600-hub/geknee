export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "travel";
  const count = parseInt(searchParams.get("n") ?? "5");

  const PEXELS_KEY = process.env.PEXELS_API_KEY;

  if (!PEXELS_KEY) {
    // No key configured — return empty so client shows gradient placeholder
    return Response.json({ images: [] });
  }

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!res.ok) throw new Error(`Pexels error ${res.status}`);
    const data = await res.json() as { photos?: Array<{ src: { large: string } }> };
    const images = (data.photos ?? []).map((p) => p.src.large);
    return Response.json({ images });
  } catch (err) {
    console.error("Images error:", err);
    return Response.json({ images: [] });
  }
}
