'use client';
import { useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface Props {
  open: boolean;
  onClose: () => void;
  feature?: string;
  reason?: string;
  generationsUsed?: number;
  savedTripsUsed?: number;
}

export default function UpgradeModal({ open, onClose, feature, reason, generationsUsed, savedTripsUsed }: Props) {
  const [step, setStep] = useState<'plans' | 'checkout'>('plans');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly' | null>(null);

  function handleClose() {
    setStep('plans');
    setSelectedInterval(null);
    onClose();
  }

  const fetchClientSecret = useCallback(async () => {
    const priceId = selectedInterval === 'monthly'
      ? process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY;

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json();

    // Fallback: if embedded not supported, redirect to Stripe-hosted page
    if (data.url) {
      window.location.href = data.url;
      return '';
    }

    if (!data.clientSecret) throw new Error(data.error ?? 'Failed to start checkout');
    return data.clientSecret as string;
  }, [selectedInterval]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)',
      }}
      onClick={handleClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg,#0f172a,#1e1b4b)',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 24,
          maxWidth: step === 'checkout' ? 520 : 440,
          width: '92%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          transition: 'max-width 0.3s ease',
        }}
      >
        {step === 'plans' ? (
          <div style={{ padding: '36px 32px' }}>
            {/* Header */}
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

            {/* Usage stats */}
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

            {/* Pro features */}
            <div style={{ marginBottom: 24 }}>
              {[
                { label: 'Unlimited AI itinerary generations' },
                { label: 'Unlimited saved trips' },
                { label: 'Multi-city trip planning (up to 6 stops)' },
                { label: 'Unlimited AI trip chat + priority speed' },
                { label: 'File Vault — store passports, bookings & docs' },
                { label: 'PDF export of your full itinerary' },
                { label: 'Live Weather — day-by-day forecasts & alerts per destination', highlight: true },
                { label: 'Live Trip Tracking — GPS map with next stops, transit times & rerouting', highlight: true },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: f.highlight ? '#fbbf24' : '#34d399', fontSize: 14, flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                  <span style={{ fontSize: 13, color: f.highlight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)', fontWeight: f.highlight ? 600 : 400 }}>{f.label}</span>
                </div>
              ))}
            </div>

            {/* Plan selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => { setSelectedInterval('yearly'); setStep('checkout'); }}
                style={{
                  padding: '14px 0', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  position: 'relative',
                }}
              >
                Go Pro &#8212; $39 / year
                <span style={{
                  position: 'absolute', top: -8, right: 12,
                  background: '#f59e0b', color: '#000',
                  fontSize: 10, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 99,
                }}>
                  SAVE 35%
                </span>
              </button>

              <button
                onClick={() => { setSelectedInterval('monthly'); setStep('checkout'); }}
                style={{
                  padding: '12px 0', borderRadius: 14,
                  border: '1px solid rgba(99,102,241,0.4)',
                  background: 'rgba(99,102,241,0.08)',
                  color: '#a5b4fc', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Go Pro &#8212; $4.99 / month
              </button>

              <button
                onClick={handleClose}
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
        ) : (
          <div>
            {/* Checkout header */}
            <div style={{ padding: '24px 28px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setStep('plans')}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none',
                  color: '#a5b4fc', borderRadius: 8, padding: '6px 12px',
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                &#8592; Back
              </button>
              <span style={{ color: '#e0e7ff', fontWeight: 700, fontSize: 15 }}>
                GeKnee Pro &#8212; {selectedInterval === 'yearly' ? '$39/year' : '$4.99/month'}
              </span>
            </div>

            {/* Embedded Stripe checkout */}
            <div style={{ padding: '16px 0 0' }}>
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
