import type { AgentTool } from '../tools';

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type Mode = 'walking' | 'cycling' | 'driving' | 'driving-traffic';

// Mapbox Directions wrapper. The agent uses this to (a) verify a
// proposed mode of transit is realistic for the distance and (b)
// surface the actual leg duration so itinerary timing reflects real-
// world routing instead of straight-line guesses.
export const routeBetweenTool: AgentTool = {
  name: 'route_between',
  description:
    'Compute a real-world route between two coordinates with a chosen mode of transit. Returns distance (km), duration (minutes), and a brief route summary. Use this BEFORE committing transit times in an itinerary so walking/cycling/driving estimates match reality.',
  input_schema: {
    type: 'object',
    properties: {
      from: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
        },
        required: ['lat', 'lon'],
      },
      to: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
        },
        required: ['lat', 'lon'],
      },
      mode: {
        type: 'string',
        enum: ['walking', 'cycling', 'driving', 'driving-traffic'],
        description: 'Preferred mode. Use walking for <2km city legs, cycling 2–10km, driving otherwise.',
      },
    },
    required: ['from', 'to', 'mode'],
  },
  handler: async (input) => {
    if (!MAPBOX_TOKEN) return { error: 'MAPBOX_TOKEN not configured on server' };
    const { from, to, mode } = input as {
      from: { lat: number; lon: number };
      to: { lat: number; lon: number };
      mode: Mode;
    };
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coords}?overview=false&access_token=${MAPBOX_TOKEN}`;
    try {
      const r = await fetch(url);
      const j = (await r.json()) as {
        routes?: Array<{ distance: number; duration: number; weight_name?: string }>;
        message?: string;
      };
      if (!j.routes?.length) {
        return { error: j.message ?? 'No route found', mode };
      }
      const route = j.routes[0];
      return {
        mode,
        distance_km: +(route.distance / 1000).toFixed(2),
        duration_min: Math.round(route.duration / 60),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed', mode };
    }
  },
};
