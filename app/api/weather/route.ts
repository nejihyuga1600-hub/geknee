const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE    = "https://api.openweathermap.org/data/2.5";

export interface DayWeather {
  date:      string;   // "YYYY-MM-DD"
  tempMin:   number;   // °C
  tempMax:   number;   // °C
  condition: string;   // e.g. "Partly Cloudy"
  icon:      string;   // e.g. "02d"
  iconUrl:   string;
  pop:       number;   // max precipitation probability 0–1
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  if (!city) return Response.json({ error: "city required" }, { status: 400 });

  if (!API_KEY) {
    return Response.json({ error: "OPENWEATHER_API_KEY not set" }, { status: 500 });
  }

  const url = `${BASE}/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&cnt=40`;
  const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1 hour

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: `OpenWeather error: ${res.status}`, detail: text }, { status: res.status });
  }

  const data = await res.json();

  // Group 3-hour slots by date, derive per-day summary
  const byDate = new Map<string, { temps: number[]; pops: number[]; icons: Map<string, number>; conditions: Map<string, number> }>();

  for (const item of data.list ?? []) {
    const date = (item.dt_txt as string).slice(0, 10);
    if (!byDate.has(date)) {
      byDate.set(date, { temps: [], pops: [], icons: new Map(), conditions: new Map() });
    }
    const d = byDate.get(date)!;
    d.temps.push(item.main.temp_min, item.main.temp_max);
    d.pops.push(item.pop ?? 0);
    const icon      = item.weather?.[0]?.icon ?? "01d";
    const condition = item.weather?.[0]?.description ?? "";
    d.icons.set(icon, (d.icons.get(icon) ?? 0) + 1);
    d.conditions.set(condition, (d.conditions.get(condition) ?? 0) + 1);
  }

  const days: DayWeather[] = Array.from(byDate.entries()).map(([date, d]) => {
    // Most frequent icon/condition
    const icon      = [...d.icons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "01d";
    const condition = [...d.conditions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    return {
      date,
      tempMin:   Math.round(Math.min(...d.temps)),
      tempMax:   Math.round(Math.max(...d.temps)),
      condition: condition.replace(/\b\w/g, c => c.toUpperCase()),
      icon,
      iconUrl:   `https://openweathermap.org/img/wn/${icon}@2x.png`,
      pop:       Math.max(...d.pops),
    };
  });

  return Response.json({ city: data.city?.name ?? city, days });
}
