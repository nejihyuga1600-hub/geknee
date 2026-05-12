import type { AgentTool } from '../tools';
import { lookupCity } from '../cities';

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

interface GeocodeResult {
  lat: number;
  lon: number;
  formatted_address: string;
  place_id: string;
}

// Google Geocoding wrapper. Returns the top match plus a small list of
// alternates so the agent can disambiguate (e.g. "Springfield" exists
// in 30 US states). When `near` is supplied we bias by passing it as a
// region/components hint where possible — Google uses it as a soft
// preference, not a hard filter.
export const geocodeTool: AgentTool = {
  name: 'geocode',
  description:
    'Resolve a place name (city, neighborhood, landmark, address) to lat/lon coordinates. Use this whenever you need to attach a real-world position to anything you mention in an itinerary. Returns the best match plus up to 4 alternates for disambiguation.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The place to look up. Examples: "Eiffel Tower", "Shibuya Crossing", "123 Main St, Boston".',
      },
      near: {
        type: 'string',
        description: 'Optional bias hint, usually the trip city. Helps disambiguate ambiguous names. Example: "Paris, France".',
      },
    },
    required: ['query'],
  },
  handler: async (input) => {
    const { query, near } = input as { query: string; near?: string };
    // Hot-path: top travel cities short-circuit Google entirely. Only
    // fires when there's no `near` qualifier — "Paris, Texas" must still
    // hit Google because the cache only knows the canonical Paris.
    if (!near) {
      const cached = lookupCity(query);
      if (cached) {
        return {
          best: { ...cached, place_id: 'cache' },
          alternates: [],
          query,
          source: 'cache',
        };
      }
    }
    if (!GOOGLE_KEY) return { error: 'GOOGLE_MAPS_API_KEY not configured on server' };
    const q = near ? `${query}, ${near}` : query;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GOOGLE_KEY}`;
    try {
      const r = await fetch(url);
      const j = (await r.json()) as {
        status: string;
        results?: Array<{
          formatted_address: string;
          place_id: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
        error_message?: string;
      };
      if (j.status !== 'OK' || !j.results?.length) {
        return { error: j.error_message ?? `No results (${j.status})`, query: q };
      }
      const top = j.results[0];
      const best: GeocodeResult = {
        lat: top.geometry.location.lat,
        lon: top.geometry.location.lng,
        formatted_address: top.formatted_address,
        place_id: top.place_id,
      };
      const alternates = j.results.slice(1, 5).map((r) => ({
        formatted_address: r.formatted_address,
        lat: r.geometry.location.lat,
        lon: r.geometry.location.lng,
      }));
      return { best, alternates, query: q };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed', query: q };
    }
  },
};
