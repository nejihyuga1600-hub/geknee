'use client';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  feature?: string;
  reason?: string;
  generationsUsed?: number;
  savedTripsUsed?: number;
}

export default function UpgradeModal({ open, onClose, feature, reason, generationsUsed, savedTripsUsed }: Props) {
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  async function startCheckout(interval: 'monthly' | 'yearly') {
    setLoading(interval);
    setError('');
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
      } else {
        setError(data.error ?? 'Failed to start checkout. Please try again.');
        setLoading(null);
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(null);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 24, padding: '36px 32px',
          maxWidth: 440, width: '92%',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ textAlign: 'center', fontSize: 40, marginBottom: 12 }}>
          {String.fromCodePoint(0x2728)}
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#e0e7ff', textAlign: 'center' }}>
          Upgrade to GeKnee Pro
        </h2>

        {feature && (
          <p style={{ margin: '0 0 6px', fontSize: 14, color: '#a5b4fc', textAlign: 'center', fontWeight: 600 }}>
            {feature} is a Pro feature
          </p>
        )}
        {reason && (
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.6 }}>
            {reason}
          </p>
        )}

        {(generationsUsed !== undefined || savedTripsUsed !== undefined) && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            {generationsUsed !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                <span>AI generations this month</span>
                <span style={{ color: generationsUsed >= 3 ? '#f87171' : '#a5b4fc', fontWeight: 700 }}>{generationsUsed} / 3</span>
              </div>
            )}
            {savedTripsUsed !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                <span>Saved trips</span>
                <span style={{ color: savedTripsUsed >= 3 ? '#f87171' : '#a5b4fc', fontWeight: 700 }}>{savedTripsUsed} / 3</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          {[
            { label: 'Unlimited AI itinerary generations' },
            { label: 'Unlimited saved trips' },
            { label: 'Multi-city trip planning (up to 6 stops)' },
            { label: 'Unlimited AI trip chat + priority speed' },
            { label: 'File Vault &#8212; store passports, bookings &amp; docs' },
            { label: 'PDF export of your full itinerary' },
            { label: 'Live Weather &#8212; day-by-day forecasts &amp; alerts', highlight: true },
            { label: 'Live Trip Tracking &#8212; GPS map with rerouting', highlight: true },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <span style={{ color: f.highlight ? '#fbbf24' : '#34d399', fontSize: 14, flexShrink: 0, marginTop: 1 }}>&#10003;</span>
              <span
                style={{ fontSize: 13, color: f.highlight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)', fontWeight: f.highlight ? 600 : 400 }}
                dangerouslySetInnerHTML={{ __html: f.label }}
              />
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fca5a5', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => startCheckout('yearly')}
            disabled={!!loading}
            style={{
              padding: '14px 0', borderRadius: 14, border: 'none',
              background: loading ? 'rgba(99,102,241,0.5)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              position: 'relative',
            }}
          >
            {loading === 'yearly' ? 'Redirecting to checkout...' : 'Go Pro &#8212; $39 / year'}
            {loading !== 'yearly' && (
              <span style={{ position: 'absolute', top: -8, right: 12, background: '#f59e0b', color: '#000', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99 }}>
                SAVE 35%
              </span>
            )}
          </button>

          <button
            onClick={() => startCheckout('monthly')}
            disabled={!!loading}
            style={{
              padding: '12px 0', borderRadius: 14,
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.08)',
              color: '#a5b4fc', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading === 'monthly' ? 'Redirecting to checkout...' : 'Go Pro &#8212; $4.99 / month'}
          </button>

          <button
            onClick={onClose}
            disabled={!!loading}
            style={{
              padding: '10px 0', borderRadius: 14, border: 'none',
              background: 'transparent', color: 'rgba(255,255,255,0.3)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
