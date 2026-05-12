import type { AgentTool } from '../tools';

// Places API is a distinct Google Cloud product from Maps Geocoding —
// the dedicated key (if present) is the right one to use here.
const KEY =
  process.env.GOOGLE_PLACES_API_KEY ??
  process.env.GOOGLE_MAPS_API_KEY ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
  '';

// Google Places "Nearby Search" via the Text Search endpoint, which
// handles natural-language queries ("ramen in Shinjuku") better than
// the rigid Nearby Search. Returns up to 8 results with rating, price
// tier, and a snippet so the agent can pick rather than hallucinate.
export const findPlacesTool: AgentTool = {
  name: 'find_places',
  description:
    'Search for real places (restaurants, cafes, sights, museums, hotels) near a location. Returns rating, price level (1–4 = $–$$$$), open status, and a short address. Always call this BEFORE recommending a specific named restaurant or business — never invent place names.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search. Examples: "ramen", "vegan brunch", "rooftop bar with views", "Renaissance art museum".',
      },
      near: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
        },
        required: ['lat', 'lon'],
      },
      radius_m: {
        type: 'number',
        description: 'Search radius in meters. Default 2000 (good for walking-distance city searches).',
      },
    },
    required: ['query', 'near'],
  },
  handler: async (input) => {
    if (!KEY) return { error: 'GOOGLE_MAPS_API_KEY not configured on server' };
    const { query, near } = input as {
      query: string;
      near: { lat: number; lon: number };
      radius_m?: number;
    };
    const radius = (input as { radius_m?: number }).radius_m ?? 2000;
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(query)}` +
      `&location=${near.lat},${near.lon}` +
      `&radius=${radius}` +
      `&key=${KEY}`;
    try {
      const r = await fetch(url);
      const j = (await r.json()) as {
        status: string;
        results?: Array<{
          name: string;
          formatted_address: string;
          place_id: string;
          rating?: number;
          user_ratings_total?: number;
          price_level?: number;
          opening_hours?: { open_now?: boolean };
          geometry: { location: { lat: number; lng: number } };
        }>;
        error_message?: string;
      };
      if (j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
        return { error: j.error_message ?? `Google Places ${j.status}` };
      }
      const places = (j.results ?? []).slice(0, 8).map((p) => ({
        name: p.name,
        address: p.formatted_address,
        place_id: p.place_id,
        lat: p.geometry.location.lat,
        lon: p.geometry.location.lng,
        rating: p.rating,
        review_count: p.user_ratings_total,
        price_level: p.price_level,
        open_now: p.opening_hours?.open_now,
      }));
      return { places, query };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed' };
    }
  },
};
