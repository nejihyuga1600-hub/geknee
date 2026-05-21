export interface WeatherDay {
  date: string;
  highC: number | null;
  lowC: number | null;
  conditionsText: string;
  iconUrl: string | null;
  precipPct: number;
}
export interface WeatherResult {
  current: {
    tempC: number | null;
    conditionsText: string;
    iconUrl: string | null;
    windKph: number | null;
  };
  forecast: WeatherDay[];
}

export async function fetchWeather(lat: number, lng: number, days: 0 | 7 = 0): Promise<WeatherResult | null> {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}&days=${days}`);
    if (!res.ok) return null;
    return await res.json() as WeatherResult;
  } catch { return null; }
}
