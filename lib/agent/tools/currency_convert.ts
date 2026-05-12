import type { AgentTool } from '../tools';

// exchangerate.host is keyless and stable for the small volumes the
// agent will hit. If it ever flakes we can swap to openexchangerates
// (paid) or hardcode a refreshed snapshot — the tool surface stays
// the same.
export const currencyConvertTool: AgentTool = {
  name: 'currency_convert',
  description:
    'Convert an amount between two ISO currency codes using current rates. Use when budgeting in a foreign country or showing a user a price in their home currency.',
  input_schema: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Amount in the source currency.' },
      from: { type: 'string', description: 'Source ISO 4217 code, e.g. USD, EUR, JPY.' },
      to: { type: 'string', description: 'Target ISO 4217 code, e.g. USD, EUR, JPY.' },
    },
    required: ['amount', 'from', 'to'],
  },
  handler: async (input) => {
    const { amount, from, to } = input as { amount: number; from: string; to: string };
    if (from.toUpperCase() === to.toUpperCase()) {
      return { amount, from, to, converted: amount, rate: 1 };
    }
    const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return { error: `exchangerate.host ${r.status}` };
      const j = (await r.json()) as { result?: number; info?: { rate?: number } };
      if (typeof j.result !== 'number') return { error: 'No conversion result' };
      return {
        amount,
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        converted: +j.result.toFixed(2),
        rate: j.info?.rate ?? null,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'fetch failed' };
    }
  },
};
