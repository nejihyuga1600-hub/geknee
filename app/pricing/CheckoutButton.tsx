'use client';

import { useState, type CSSProperties } from 'react';

type Props = {
  interval: 'monthly' | 'yearly';
  label:    string;
  style?:   CSSProperties;
};

// Starts a Stripe Checkout session for the Pro plan at the given interval.
// Mirrors the call pattern in app/components/UpgradeModal.tsx so behavior
// stays consistent across the upgrade surfaces.
export default function CheckoutButton({ interval, label, style }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function start() {
    setError('');
    setLoading(true);
    const priceId = interval === 'monthly'
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;

    if (!priceId) {
      setError('Stripe price not configured.');
      setLoading(false);
      return;
    }

    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ priceId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return; // keep button in loading state through nav
      }
      setError(data.error ?? 'Failed to start checkout.');
      setLoading(false);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        style={{
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
          ...style,
        }}
      >
        {loading ? 'Loading…' : label}
      </button>
      {error && (
        <div style={{
          marginTop: 8, fontSize: 12,
          color: '#ff8a8a', textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
