'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  open: boolean;
  onClose: () => void;
  feature?: string;
  reason?: string;
  generationsUsed?: number;
  savedTripsUsed?: number;
}

export default function UpgradeModal({ open, onClose, feature, reason, generationsUsed, savedTripsUsed }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null);

  if (!open) return null;

  async function startCheckout(interval: 'monthly' | 'yearly') {
    setLoading(interval);
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
      if (data.url) router.push(data.url);
    } catch {
      setLoading(null);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 24, padding: '36px 32px',
          maxWidth: 440, width: '90%',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Icon */}
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

        {/* Pro features list */}
        <div style={{ marginBottom: 24 }}>
          {[
            'Unlimited AI itinerary generations',
            'Unlimited saved trips',
            'Multi-stop trip planning',
            'File Vault — store trip documents',
            'PDF export & shareable link',
            'Unlimited AI chat',
            'Priority AI speed',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: '#34d399', fontSize: 14, flexShrink: 0 }}>&#10003;</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{f}</span>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => startCheckout('yearly')}
            disabled={!!loading}
            style={{
              padding: '14px 0', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              position: 'relative',
            }}
          >
            {loading === 'yearly' ? 'Redirecting...' : 'Go Pro — $39 / year'}
            <span style={{ position: 'absolute', top: -8, right: 12, background: '#f59e0b', color: '#000', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99 }}>
              SAVE 35%
            </span>
          </button>
          <button
            onClick={() => startCheckout('monthly')}
            disabled={!!loading}
            style={{
              padding: '12px 0', borderRadius: 14,
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.08)',
              color: '#a5b4fc', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {loading === 'monthly' ? 'Redirecting...' : 'Go Pro — $4.99 / month'}
          </button>
          <button
            onClick={onClose}
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
