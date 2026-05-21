export interface TzResult {
  ianaId: string;
  utcOffsetSec: number;
  dstOffsetSec: number;
}

export async function fetchTimezone(lat: number, lng: number): Promise<TzResult | null> {
  try {
    const res = await fetch(`/api/timezone?lat=${lat}&lng=${lng}`);
    if (!res.ok) return null;
    return await res.json() as TzResult | null;
  } catch {
    return null;
  }
}
