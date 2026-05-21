// app/api/weather/route.ts
// Google Maps Platform Weather API -- server proxy.
// Coalesces lat/lng to 2-decimal precision (~1.1 km grid) for CDN cache efficiency.
// days=0  -> current conditions only
// days=7  -> current + 7-day forecast
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_PLACES_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: "no key" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const rawLat = Number(searchParams.get("lat"));
  const rawLng = Number(searchParams.get("lng"));
  if (!isFinite(rawLat) || !isFinite(rawLng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }
  const days = Number(searchParams.get("days") ?? "0");
  // Coalesce to 2-decimal precision (~1.1 km grid) for cache efficiency
  const lat = Math.round(rawLat * 100) / 100;
  const lng = Math.round(rawLng * 100) / 100;

  const currentUrl = `https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=${lat}&location.longitude=${lng}&key=${key}`;
  const forecastUrl = `https://weather.googleapis.com/v1/forecast/days:lookup?location.latitude=${lat}&location.longitude=${lng}&days=${days || 7}&key=${key}`;

  try {
    const reqs: Promise<Response>[] = [fetch(currentUrl, { signal: AbortSignal.timeout(8000) })];
    if (days > 0) reqs.push(fetch(forecastUrl, { signal: AbortSignal.timeout(8000) }));
    const responses = await Promise.all(reqs);
    const [currentRes, forecastRes] = responses;

    if (!currentRes.ok) {
      return NextResponse.json({ error: `weather ${currentRes.status}` }, { status: 502 });
    }

    const currentData = await currentRes.json() as {
      temperature?: { degrees: number };
      weatherCondition?: { description?: { text: string }; iconBaseUri?: string };
      wind?: { speed?: { value: number } };
    };

    const forecastData = forecastRes && forecastRes.ok
      ? await forecastRes.json() as {
          forecastDays?: Array<{
            displayDate?: { year: number; month: number; day: number };
            maxTemperature?: { degrees: number };
            minTemperature?: { degrees: number };
            daytimeForecast?: {
              weatherCondition?: { description?: { text: string }; iconBaseUri?: string };
              precipitation?: { probability?: { percent: number } };
            };
          }>;
        }
      : null;

    return NextResponse.json({
      current: {
        tempC: currentData.temperature?.degrees ?? null,
        conditionsText: currentData.weatherCondition?.description?.text ?? "",
        iconUrl: currentData.weatherCondition?.iconBaseUri
          ? `${currentData.weatherCondition.iconBaseUri}.svg`
          : null,
        windKph: currentData.wind?.speed?.value ?? null,
      },
      forecast: (forecastData?.forecastDays ?? []).map((d) => ({
        date: d.displayDate
          ? `${d.displayDate.year}-${String(d.displayDate.month).padStart(2, "0")}-${String(d.displayDate.day).padStart(2, "0")}`
          : "",
        highC: d.maxTemperature?.degrees ?? null,
        lowC: d.minTemperature?.degrees ?? null,
        conditionsText: d.daytimeForecast?.weatherCondition?.description?.text ?? "",
        iconUrl: d.daytimeForecast?.weatherCondition?.iconBaseUri
          ? `${d.daytimeForecast.weatherCondition.iconBaseUri}.svg`
          : null,
        precipPct: d.daytimeForecast?.precipitation?.probability?.percent ?? 0,
      })),
    }, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=21600",
      },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      { error: isTimeout ? "weather timeout" : "weather failed" },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
