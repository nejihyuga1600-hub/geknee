// Content generators for trip-driven notifications. Pure functions — given
// a trip + day index, return the title/body strings that go straight into
// the Notification model. The cron job is the only consumer; isolate the
// formatting here so it's easy to tune copy without touching scheduling.

interface TripLike {
  id: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  itinerary: string | null;
}

export interface NotifContent { title: string; body: string }

// Two-weeks-out forecast — broad outlook, prompts user to start checking
// detailed weather. Keeps the body short; the link in the bell takes the
// user into the trip page where the full WeatherStrip lives.
export async function buildWeatherForecastNotif(trip: TripLike): Promise<NotifContent | null> {
  if (!trip.location || !trip.startDate) return null;
  // Best-effort live forecast lookup. Falls back to seasonal copy if the
  // weather endpoint isn't reachable from the cron context.
  let summary = '';
  try {
    const url = new URL('https://api.openweathermap.org/geo/1.0/direct');
    url.searchParams.set('q', trip.location);
    url.searchParams.set('limit', '1');
    url.searchParams.set('appid', process.env.OPENWEATHER_API_KEY ?? '');
    if (process.env.OPENWEATHER_API_KEY) {
      const r = await fetch(url);
      const arr = await r.json() as Array<{ lat: number; lon: number }>;
      const hit = arr?.[0];
      if (hit) {
        const wx = await fetch(`https://api.openweathermap.org/data/2.5/forecast/daily?lat=${hit.lat}&lon=${hit.lon}&cnt=14&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`);
        if (wx.ok) {
          const wd = await wx.json() as { list: { temp: { day: number; min: number; max: number }; weather: { description: string }[] }[] };
          const ts = wd.list?.slice(-3) ?? [];
          if (ts.length) {
            const avgMax = Math.round(ts.reduce((a, t) => a + t.temp.max, 0) / ts.length);
            const avgMin = Math.round(ts.reduce((a, t) => a + t.temp.min, 0) / ts.length);
            const cond = ts[ts.length - 1]?.weather?.[0]?.description ?? '';
            summary = `${avgMax}° / ${avgMin}°C, ${cond}.`;
          }
        }
      }
    }
  } catch { /* fall through */ }
  return {
    title: `2 weeks until ${trip.location}`,
    body: summary
      ? `Forecast looking like ${summary} Time to start checking flights and packing list.`
      : `Two weeks out — start watching the weather and pulling together your packing list.`,
  };
}

// Packing prep — destination-aware checklist. Keep generic for now; future
// pass can pull conditions from the forecast and produce climate-specific
// items (umbrella, layers, sunscreen).
export function buildPackingPrepNotif(trip: TripLike): NotifContent | null {
  if (!trip.location) return null;
  return {
    title: `Packing list for ${trip.location}`,
    body: `Two weeks out — open the trip to see a tailored packing checklist (clothes, tech, docs, meds).`,
  };
}

// Daily briefing — fired each morning of the trip. Pulls today's activity
// headlines from the saved itinerary so the user gets a glanceable plan
// without having to open the app right away.
export function buildDailyBriefingNotif(trip: TripLike, dayNumber: number): NotifContent | null {
  if (!trip.itinerary) return null;
  const lines = trip.itinerary.split('\n');
  let inDay = false;
  const todays: string[] = [];
  const dayHeadingRe = new RegExp(`^#{1,4}\\s*Day\\s*${dayNumber}\\b`, 'i');
  const otherDayRe = /^#{1,4}\s*Day\s*\d+/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (dayHeadingRe.test(line)) { inDay = true; continue; }
    if (inDay && otherDayRe.test(line)) break;
    if (!inDay) continue;
    // Pick lines that look like activity headlines: "**9:00 AM** — ..."
    const m = line.match(/^\*\*(\d{1,2}:\d{2}\s*[AP]M)\*\*\s*[—–-]\s*(.+)$/i);
    if (m) {
      const stripped = m[2].replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      todays.push(`${m[1]} — ${stripped.split(/[.*]/, 1)[0].slice(0, 60)}`);
    }
    if (todays.length >= 4) break;
  }
  const top = todays.length ? todays.join(' · ') : 'See your full itinerary in the app.';
  return {
    title: `Day ${dayNumber} · ${trip.location ?? 'your trip'}`,
    body: top,
  };
}
