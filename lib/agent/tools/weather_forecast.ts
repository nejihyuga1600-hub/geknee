import type { AgentTool } from '../tools';

const KEY = process.env.OPENWEATHER_API_KEY ?? '';

interface DayForecast {
  date: string;
  temp_min_c: number;
  temp_max_c: number;
  summary: string;
  precipitation_mm?: number;
}

// OpenWeather "forecast/daily" wrapper. Returns up to 14 days from now.
// The agent should call this for trips starting within ~2 weeks so it
// can warn about weather and tune indoor/outdoor activity mix.
export const weatherForecastTool: AgentTool = {
  name: 'weather_forecast',
  description:
    'Get a daily weather forecast for a location. Returns up to 14 days from today. Use when the trip start date is within 2 weeks so you can tune indoor/outdoor activities and warn about rain or extreme temps.',
  input_schema: {
    type: 'object',
    properties: {
      lat: { type: 'number' },
      lon: { type: 'number' },
      days: {
        type: 'number',
        description: 'How many days of forecast to return (1–14). Default 7.',
      },
    },
    required: ['lat', 'lon'],
  },
  handler: async (input) => {
    if (!KEY) return { error: 'OPENWEATHER_API_KEY not configured on server' };
    const { lat, lon } = input as { lat: number; lon: number; days?: number };
    const days = Math.min(Math.max((input as { days?: number }).days ?? 7, 1), 14);
    const url = `https://api.openweathermap.org/data/2.5/forecast/daily?lat=${lat}&lon=${lon}&cnt=${days}&units=metric&appid=${KEY}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return { error: `OpenWeather ${r.status}`, lat, lon };
      const j = (await r.json()) as {
        list?: Array<{
          dt: number;
          temp: { min: number; max: number };
          weather: Array<{ description: string }>;
          rain?: number;
        }>;
      };
      const forecast: DayForecast[] = (j.list ?? []).map((d) => ({
        date: new Date(d.dt * 1000).toISOString().slice(0, 10),
        temp_min_c: Math.round(d.temp.min),
        temp_max_c: Math.round(d.temp.max),
        summary: d.weather[0]?.description ?? 'unknown',
        precipitation_mm: d.rain,
      }));
      return { forecast, source: 'openweather' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed' };
    }
  },
};
