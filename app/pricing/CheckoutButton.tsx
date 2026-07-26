'use client';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { useIsNative } from '@/lib/useIsNative';

type Interval = 'monthly' | 'yearly';

export default function CheckoutButton({
  interval,
  label,
  style,
}: {
  interval: Interval;
  label: string;
  style?: React.CSSProperties;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isNative = useIsNative();
  if (isNative) return null;

  async function startCheckout() {
    setLoading(true);
    setErr(null);
    track('upgrade_click', { surface: 'pricing_page', interval });
    const priceId = interval === 'monthly'
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        // Not signed in → send to login with a redirect back here
        window.location.href = `/?signin=1&redirect=${encodeURIComponent('/pricing')}`;
      } else {
        setErr(data.error ?? 'Checkout failed');
        setLoading(false);
      }
    } catch {
      setErr('Network error');
      setLoading(false);
    }
  }

  return (
    <>
      <button onClick={startCheckout} disabled={loading} style={style}>
        {loading ? 'Starting checkout…' : label}
      </button>
      {err && <div style={{ marginTop: 8, color: '#fca5a5', fontSize: 12 }}>{err}</div>}
    </>
  );
}
