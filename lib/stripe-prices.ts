import Stripe from 'stripe';

export type PriceDisplay = {
  amount: string; // formatted, e.g. "$4.99"
  sub:    string; // formatted, e.g. "/ month"
  raw:    number; // unit_amount in cents — used to compute yearly→monthly equivalents
};

type Result = {
  monthly:     PriceDisplay | null;
  yearly:      PriceDisplay | null;
  savingsPct:  number | null;
};

// Format a Stripe Price object (cents) into the display strings TierGrid expects.
function fmtPrice(p: Stripe.Price): PriceDisplay | null {
  const cents    = p.unit_amount;
  const currency = p.currency?.toUpperCase() ?? 'USD';
  const interval = p.recurring?.interval; // 'month' | 'year' | ...
  if (cents == null || !interval) return null;

  const dollars = cents / 100;
  // Drop trailing .00 for whole-dollar prices.
  const amount = `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}` +
                 (currency !== 'USD' ? ` ${currency}` : '');
  const sub = interval === 'month' ? '/ month' : interval === 'year' ? '/ year' : `/ ${interval}`;
  return { amount, sub, raw: cents };
}

// Server-side fetch of monthly + yearly Pro prices for the /pricing page.
// Returns nulls if STRIPE_SECRET_KEY is unset or the API call fails — the
// TierGrid component renders its static copy in that case.
export async function fetchStripePrices(): Promise<Result> {
  const key       = process.env.STRIPE_SECRET_KEY;
  const monthlyId = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;
  const yearlyId  = process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;
  if (!key || !monthlyId || !yearlyId) {
    return { monthly: null, yearly: null, savingsPct: null };
  }

  try {
    const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
    const [m, y] = await Promise.all([
      stripe.prices.retrieve(monthlyId),
      stripe.prices.retrieve(yearlyId),
    ]);
    const monthly = fmtPrice(m);
    const yearly  = fmtPrice(y);

    // Savings % = how much less per month the yearly plan costs vs the monthly plan.
    let savingsPct: number | null = null;
    if (m.unit_amount && y.unit_amount && m.recurring?.interval === 'month' && y.recurring?.interval === 'year') {
      const yearlyMonthlyEquiv = y.unit_amount / 12;
      savingsPct = Math.round((1 - yearlyMonthlyEquiv / m.unit_amount) * 100);
      if (savingsPct < 0) savingsPct = null;
    }

    return { monthly, yearly, savingsPct };
  } catch {
    return { monthly: null, yearly: null, savingsPct: null };
  }
}
