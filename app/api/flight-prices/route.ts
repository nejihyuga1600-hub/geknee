import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Amadeus OAuth token cache ────────────────────────────────────────────────
let amadeusToken: string | null = null;
let amadeusTokenExpiry = 0;

async function getAmadeusToken(): Promise<string | null> {
  const id     = process.env.AMADEUS_CLIENT_ID;
  const secret = process.env.AMADEUS_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (amadeusToken && Date.now() < amadeusTokenExpiry) return amadeusToken;
  try {
    const res = await fetch(
      "https://test.api.amadeus.com/v1/security/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    amadeusToken       = data.access_token ?? null;
    amadeusTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return amadeusToken;
  } catch { return null; }
}

// ─── 1. Amadeus Flight Dates API — GDS prices ────────────────────────────────
async function fetchAmadeusPrices(
  origin: string,
  destination: string,
  month: string,
  daysInMonth: number,
  nights: number
): Promise<Record<string, number> | null> {
  const token = await getAmadeusToken();
  if (!token) return null;

  const startDate = `${month}-01`;
  const endDate   = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const url = new URL("https://test.api.amadeus.com/v1/shopping/flight-dates");
  url.searchParams.set("origin",        origin);
  url.searchParams.set("destination",   destination);
  url.searchParams.set("departureDate", `${startDate}--${endDate}`);
  url.searchParams.set("duration",      String(nights));
  url.searchParams.set("viewBy",        "DATE");
  url.searchParams.set("oneWay",        "false");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { return null; }
    const data = await res.json();
    const items: Array<{ departureDate: string; price: { total: string } }> =
      data.data ?? [];
    if (!items.length) return null;
    const prices: Record<string, number> = {};
    for (const item of items) {
      prices[item.departureDate] = Math.round(parseFloat(item.price.total));
    }
    return prices;
  } catch {
    return null;
  }
}

// ─── 2. Travelpayouts month-matrix — real affiliate prices ───────────────────
async function fetchTravelpayoutsPrices(
  origin: string,
  destination: string,
  month: string        // YYYY-MM
): Promise<Record<string, number> | null> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) return null;

  const url = `https://api.travelpayouts.com/v2/prices/month-matrix`
    + `?currency=usd`
    + `&origin=${encodeURIComponent(origin)}`
    + `&destination=${encodeURIComponent(destination)}`
    + `&month=${encodeURIComponent(month)}`
    + `&token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Travelpayouts month-matrix error:", res.status);
      return null;
    }
    const data = await res.json();
    const items: Array<{ depart_date: string; value: number }> = data?.data ?? [];
    if (!items.length) return null;

    const prices: Record<string, number> = {};
    for (const item of items) {
      if (item.depart_date && typeof item.value === "number") {
        prices[item.depart_date] = Math.round(item.value);
      }
    }
    return Object.keys(prices).length > 0 ? prices : null;
  } catch (err) {
    console.error("Travelpayouts fetch exception:", err);
    return null;
  }
}

// ─── 3. SerpAPI Google Flights — real prices sampled across the month ────────
async function fetchSerpApiPrices(
  origin: string,
  destination: string,
  month: string,
  daysInMonth: number,
  nights: number
): Promise<Record<string, number> | null> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;

  // Sample ~5 dates spread across the month (every 6 days)
  const sampleDays = [1, 6, 12, 18, 24, Math.min(28, daysInMonth)];

  const results = await Promise.all(
    sampleDays.map(async (day) => {
      const dep = `${month}-${String(day).padStart(2, "0")}`;
      const retDate = new Date(dep + "T00:00:00");
      retDate.setDate(retDate.getDate() + nights);
      const ret = retDate.toISOString().split("T")[0];

      const url = `https://serpapi.com/search.json?engine=google_flights`
        + `&departure_id=${encodeURIComponent(origin)}`
        + `&arrival_id=${encodeURIComponent(destination)}`
        + `&outbound_date=${dep}`
        + `&return_date=${ret}`
        + `&currency=USD&type=1&hl=en`
        + `&api_key=${encodeURIComponent(key)}`;

      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const price: number | undefined =
          data?.best_flights?.[0]?.price ??
          data?.other_flights?.[0]?.price;
        if (typeof price !== "number") return null;
        return { date: dep, price: Math.round(price) };
      } catch {
        return null;
      }
    })
  );

  const prices: Record<string, number> = {};
  for (const r of results) {
    if (r) prices[r.date] = r.price;
  }
  return Object.keys(prices).length > 0 ? prices : null;
}

// ─── 4. AI price estimation using Claude ─────────────────────────────────────
async function fetchAIPrices(
  origin: string,
  destination: string,
  month: string,
  daysInMonth: number,
  nights: number
): Promise<Record<string, number>> {
  const [year, mon] = month.split("-").map(Number);
  const monthName = new Date(year, mon - 1).toLocaleString("default", { month: "long", year: "numeric" });

  const prompt = `You are an expert flight pricing analyst with deep knowledge of current airfare markets. Generate accurate economy class round-trip prices for the route ${origin} → ${destination} for every departure date in ${monthName}.

Context:
- Route: ${origin} → ${destination} (round trip, economy class)
- Trip length: ${nights} nights (depart on date X, return on date X+${nights})
- Month: ${monthName} (${daysInMonth} days)
- Each price = total round-trip cost departing on that date, returning ${nights} days later

Use your knowledge of:
- Actual base fare levels for this specific origin-destination pair (consider the airports, distance, airline competition, and typical market pricing as of 2025-2026)
- Real seasonal demand for this route and month
- Day-of-week pricing: Mon/Tue/Wed typically 10-20% cheaper, Thu neutral, Fri/Sat/Sun 15-30% more expensive
- Holiday surcharges: school breaks, public holidays, major events near either city
- Booking lead time effects already baked in (prices shown are what you'd see booking ~6-8 weeks out)

Return ONLY a raw JSON object, no markdown, no explanation:
{
  "${month}-01": <integer>,
  "${month}-02": <integer>,
  ...
  "${month}-${String(daysInMonth).padStart(2, "0")}": <integer>
}

Requirements:
- Prices in USD, integers only, no decimals
- Total round-trip (both legs combined), NOT one-way
- Must return all ${daysInMonth} dates
- Price spread within month: 25-45% difference between cheapest and most expensive dates
- Base price must reflect real market rates for this specific route — not generic estimates`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text block");
  const raw = textBlock.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(raw) as Record<string, number>;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const origin      = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const month       = searchParams.get("month");
  const nights      = parseInt(searchParams.get("nights") ?? "7", 10);

  if (!origin || !destination || !month) {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();

  try {
    // 1️⃣  Travelpayouts month-matrix (affiliate real prices, full calendar)
    const tpPrices = await fetchTravelpayoutsPrices(origin, destination, month);
    if (tpPrices && Object.keys(tpPrices).length > 0) {
      return Response.json({ prices: tpPrices, source: "travelpayouts" });
    }

    // 2️⃣  SerpAPI Google Flights (real prices, 5 sampled dates)
    const serpPrices = await fetchSerpApiPrices(origin, destination, month, daysInMonth, nights);
    if (serpPrices && Object.keys(serpPrices).length > 0) {
      return Response.json({ prices: serpPrices, source: "serpapi" });
    }

    // 3️⃣  AI estimate (always-available fallback)
    const aiPrices = await fetchAIPrices(origin, destination, month, daysInMonth, nights);
    return Response.json({ prices: aiPrices, source: "ai-estimate" });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Flight prices error:", msg);
    return Response.json({ error: "Failed to get prices" }, { status: 500 });
  }
}
