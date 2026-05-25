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

const FEATURES = [
  { label: 'Unlimited trip generations', meta: '~3/month free' },
  { label: 'All 12 AI travel styles',     meta: '5 free' },
  { label: 'Unlimited saved trips' },
  { label: 'Priority support',            meta: '24h response' },
  { label: 'Early access',                meta: 'new features, styles' },
];

export default function UpgradeModal({ open, onClose, feature, reason, generationsUsed, savedTripsUsed }: Props) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function startCheckout() {
    setLoading(true);
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
        setLoading(false);
      }
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        animation: 'modalFadeIn 0.25s ease-out',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.80)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'rgba(13,13,36,0.97)',
          border: '1px solid rgba(167,139,250,0.35)',
          borderRadius: 22,
          padding: '28px 28px 22px',
          maxWidth: 420, width: '92%',
          animation: 'modalSlideUp 0.3s ease-out',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
          color: '#f2f2f8',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 14,
            background: 'none', border: 'none',
            color: 'rgba(168,168,192,0.6)',
            fontSize: 22, lineHeight: 1, cursor: 'pointer', padding: 4,
          }}
        >&times;</button>

        {/* Brand mark */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4, marginBottom: 12 }}>
          <span style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
            display: 'grid', placeItems: 'center',
            color: '#0a0a1f', fontSize: 22, fontWeight: 700,
            fontFamily: 'var(--font-display, Georgia, serif)',
          }}>&#10022;</span>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <span style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em',
          }}>
            GeKnee{' '}
            <em style={{ fontStyle: 'italic', color: '#a78bfa' }}>Pro</em>
          </span>
        </div>
        <p style={{
          margin: '0 0 18px', textAlign: 'center',
          color: 'rgba(168,168,192,0.85)', fontSize: 13,
        }}>
          Unlimited trips. All AI styles. Priority support.
        </p>

        {/* Conditional context line */}
        {feature && (
          <p style={{ margin: '-10px 0 14px', fontSize: 12, color: '#a5b4fc', textAlign: 'center', fontWeight: 600 }}>
            {feature} is a Pro feature
          </p>
        )}
        {reason && (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.5 }}>
            {reason}
          </p>
        )}

        {/* Usage strip */}
        {(generationsUsed !== undefined || savedTripsUsed !== undefined) && (
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(148,163,208,0.12)',
            borderRadius: 10, padding: '10px 14px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(168,168,192,0.7)', marginBottom: 6 }}>
              Your usage · this month
            </div>
            {generationsUsed !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                <span>AI generations</span>
                <span style={{ color: generationsUsed >= 3 ? '#f87171' : '#a5b4fc', fontWeight: 700 }}>{generationsUsed} / 3</span>
              </div>
            )}
            {savedTripsUsed !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                <span>Saved trips</span>
                <span style={{ color: savedTripsUsed >= 3 ? '#f87171' : '#a5b4fc', fontWeight: 700 }}>{savedTripsUsed} / 3</span>
              </div>
            )}
          </div>
        )}

        {/* Feature list */}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {FEATURES.map((f) => (
            <li key={f.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 0', fontSize: 13,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'rgba(167,139,250,0.18)',
                color: '#a78bfa',
                display: 'grid', placeItems: 'center',
                fontSize: 11, flexShrink: 0,
              }}>&#10003;</span>
              <span style={{ flex: 1, color: '#f2f2f8' }}>{f.label}</span>
              {f.meta && (
                <span style={{ fontSize: 11, color: 'rgba(168,168,192,0.65)' }}>{f.meta}</span>
              )}
            </li>
          ))}
        </ul>

        {/* Pricing pills — side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <PriceTile
            label="Monthly"
            price="$4.99"
            unit="/mo"
            active={interval === 'monthly'}
            onClick={() => setInterval('monthly')}
          />
          <PriceTile
            label="Yearly"
            price="$39"
            unit="/yr"
            badge="SAVE 35%"
            active={interval === 'yearly'}
            onClick={() => setInterval('yearly')}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 10, padding: '8px 12px', marginBottom: 12,
            fontSize: 12, color: '#fca5a5', textAlign: 'center',
          }}>{error}</div>
        )}

        {/* Primary CTA */}
        <button
          onClick={startCheckout}
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px 0',
            borderRadius: 14, border: 'none',
            background: loading
              ? 'rgba(167,139,250,0.5)'
              : 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
            color: '#0a0a1f',
            fontSize: 14, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Redirecting to checkout…' : 'Go Pro →'}
        </button>

        <p style={{
          margin: '10px 0 0', textAlign: 'center',
          fontSize: 11, color: 'rgba(168,168,192,0.55)',
        }}>
          Cancel anytime · Powered by Stripe
        </p>
      </div>
    </div>
  );
}

function PriceTile({
  label, price, unit, badge, active, onClick,
}: {
  label: string;
  price: string;
  unit: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '14px 12px',
        borderRadius: 14,
        border: `1px solid ${active ? 'rgba(167,139,250,0.55)' : 'rgba(148,163,208,0.18)'}`,
        background: active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.03)',
        color: '#f2f2f8',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'all 150ms ease',
      }}
    >
      <div style={{
        fontSize: 10, letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: active ? '#a78bfa' : 'rgba(168,168,192,0.65)',
        fontWeight: 600, marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-display, Georgia, serif)',
        fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em',
        color: '#f2f2f8',
      }}>
        {price}
        <span style={{ fontSize: 12, color: 'rgba(168,168,192,0.7)', fontWeight: 400, marginLeft: 2 }}>{unit}</span>
      </div>
      {badge && (
        <span style={{
          position: 'absolute', top: -8, right: 10,
          background: '#fbbf24', color: '#0a0a1f',
          fontSize: 9, fontWeight: 800, letterSpacing: '0.05em',
          padding: '2px 7px', borderRadius: 99,
        }}>{badge}</span>
      )}
    </button>
  );
}
