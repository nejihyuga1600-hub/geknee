export interface WeatherDay {
  date: string;
  highC: number | null;
  lowC: number | null;
  conditionsText: string;
  iconUrl: string | null;
  precipPct: number;
}
export interface WeatherHour {
  time: string;              // ISO 8601 timestamp
  tempC: number | null;
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
  hourly?: WeatherHour[];
}

export async function fetchWeather(
  lat: number,
  lng: number,
  days: 0 | 7 = 0,
  hours: 0 | 12 | 24 = 0,
): Promise<WeatherResult | null> {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}&days=${days}&hours=${hours}`);
    if (!res.ok) return null;
    return await res.json() as WeatherResult;
  } catch { return null; }
}
