import type { AgentTool } from '../tools';

const TOKEN = process.env.TRAVELPAYOUTS_TOKEN ?? '';

// Travelpayouts month-matrix wrapper. Returns the cheapest fare per
// day across a given month. The agent uses this to (a) suggest a date
// shift if the user is flexible and (b) ground budget conversations
// in real prices instead of guesses.
export const flightSearchTool: AgentTool = {
  name: 'flight_search',
  description:
    'Look up cheapest one-way fares for every day of a given month between two airports. Returns a price-per-day map (USD). Provide IATA airport codes (e.g. JFK, CDG, NRT). Use this when the user mentions budget, flexibility on dates, or asks "is this trip affordable".',
  input_schema: {
    type: 'object',
    properties: {
      origin: { type: 'string', description: 'IATA code of origin airport (3 letters, uppercase). Example: JFK.' },
      destination: { type: 'string', description: 'IATA code of destination airport. Example: CDG.' },
      month: { type: 'string', description: 'Month to search, format YYYY-MM. Example: 2026-08.' },
    },
    required: ['origin', 'destination', 'month'],
  },
  handler: async (input) => {
    if (!TOKEN) return { error: 'TRAVELPAYOUTS_TOKEN not configured on server' };
    const { origin, destination, month } = input as {
      origin: string;
      destination: string;
      month: string;
    };
    const url =
      `https://api.travelpayouts.com/v2/prices/month-matrix` +
      `?currency=usd` +
      `&origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&month=${encodeURIComponent(month)}` +
      `&token=${encodeURIComponent(TOKEN)}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return { error: `Travelpayouts ${r.status}`, origin, destination, month };
      const j = (await r.json()) as { data?: Array<{ depart_date: string; value: number }> };
      const items = j.data ?? [];
      if (!items.length) {
        return { prices_usd: {}, note: 'No fares returned for this route/month', origin, destination, month };
      }
      const prices: Record<string, number> = {};
      for (const item of items) {
        if (item.depart_date && typeof item.value === 'number') {
          prices[item.depart_date] = Math.round(item.value);
        }
      }
      const sorted = Object.entries(prices).sort((a, b) => a[1] - b[1]);
      return {
        origin,
        destination,
        month,
        cheapest_usd: sorted[0]?.[1] ?? null,
        cheapest_date: sorted[0]?.[0] ?? null,
        median_usd: sorted[Math.floor(sorted.length / 2)]?.[1] ?? null,
        prices_usd: prices,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed' };
    }
  },
};
