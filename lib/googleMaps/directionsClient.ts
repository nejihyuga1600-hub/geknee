import type { RouteMode } from './route';

// Decodes a Google polyline-5 encoded string into [lat, lng] pairs.
function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export interface DirectionsResult {
  points: Array<{ lat: number; lng: number }>;
  durationSec: number | null;
  distanceM: number | null;
}

export async function fetchDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: Exclude<RouteMode, 'flight' | 'ferry'>,
): Promise<DirectionsResult | null> {
  const res = await fetch('/api/directions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ origin, destination, mode }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { polyline: string; durationSec: number | null; distanceM: number | null };
  if (!data.polyline) return null;
  return {
    points: decodePolyline(data.polyline),
    durationSec: data.durationSec,
    distanceM: data.distanceM,
  };
}
