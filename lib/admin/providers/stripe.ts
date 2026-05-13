import Stripe from 'stripe';
import type { ProviderResult, RevenueStats } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getRevenueStats(): Promise<ProviderResult<RevenueStats>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: 'unconfigured', missing: ['STRIPE_SECRET_KEY'] };

  try {
    const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });

    const now = Math.floor(Date.now() / 1000);
    const since24h = now - 86400;
    const since7d = now - 7 * 86400;
    const since30d = now - 30 * 86400;

    // Revenue: sum charges (not invoices, charges include one-time + sub
    // payments) across windows. Pull last 30d once then bucket locally.
    const charges = await stripe.charges.list({
      created: { gte: since30d },
      limit: 100,
    });

    let todayUsd = 0;
    let last7dUsd = 0;
    let last30dUsd = 0;
    for (const c of charges.data) {
      if (c.status !== 'succeeded' || c.refunded) continue;
      const amt = (c.amount ?? 0) / 100;
      last30dUsd += amt;
      if (c.created >= since7d) last7dUsd += amt;
      if (c.created >= since24h) todayUsd += amt;
    }

    // Active subs + churn signal. Cap at 100 — if ever > 100 we paginate,
    // but at our scale this is fine.
    const subs = await stripe.subscriptions.list({ status: 'all', limit: 100 });
    let mrrUsd = 0;
    let paidSubsActive = 0;
    let newPaidLast7d = 0;
    let cancelsLast7d = 0;

    for (const s of subs.data) {
      if (s.status === 'active' || s.status === 'trialing') {
        paidSubsActive++;
        for (const item of s.items.data) {
          const unit = item.price.unit_amount ?? 0;
          const interval = item.price.recurring?.interval;
          const intervalCount = item.price.recurring?.interval_count ?? 1;
          const qty = item.quantity ?? 1;
          // Convert to monthly USD.
          let monthly = 0;
          if (interval === 'month') monthly = (unit * qty) / 100 / intervalCount;
          else if (interval === 'year') monthly = (unit * qty) / 100 / (12 * intervalCount);
          else if (interval === 'week') monthly = ((unit * qty) / 100) * (52 / 12) / intervalCount;
          else if (interval === 'day') monthly = ((unit * qty) / 100) * 30 / intervalCount;
          mrrUsd += monthly;
        }
      }
      if (s.created >= since7d && (s.status === 'active' || s.status === 'trialing')) newPaidLast7d++;
      if (s.canceled_at && s.canceled_at >= since7d) cancelsLast7d++;
    }

    void DAY_MS;

    return {
      status: 'ok',
      data: {
        mrrUsd: Math.round(mrrUsd * 100) / 100,
        arrUsd: Math.round(mrrUsd * 12 * 100) / 100,
        todayUsd: Math.round(todayUsd * 100) / 100,
        last7dUsd: Math.round(last7dUsd * 100) / 100,
        last30dUsd: Math.round(last30dUsd * 100) / 100,
        paidSubsActive,
        newPaidLast7d,
        cancelsLast7d,
      },
    };
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }
}
