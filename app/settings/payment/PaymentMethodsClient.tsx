'use client';

import { useEffect, useState } from 'react';
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';
const DIM = '#7a6f5e';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function PaymentMethodsClient() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/payments/payment-methods');
      const j = await r.json();
      setMethods(j.paymentMethods ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function startAdd() {
    setAdding(true);
    setError(null);
    try {
      const r = await fetch('/api/payments/setup-intent', { method: 'POST' });
      const j = await r.json();
      if (!j.clientSecret) throw new Error('Could not start setup');
      setClientSecret(j.clientSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
      setAdding(false);
    }
  }

  async function detach(id: string) {
    if (!confirm('Remove this card?')) return;
    setError(null);
    try {
      const r = await fetch(`/api/payments/payment-methods/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? 'Failed');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove');
    }
  }

  return (
    <main style={{
      minHeight: '100svh', background: PAPER, color: INK,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      padding: '48px 24px',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: DIM, marginBottom: 12,
        }}>geknee · settings · payment</div>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.1, margin: '0 0 12px',
          fontWeight: 800, letterSpacing: '-0.01em',
        }}>Cards on file</h1>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3f3f46', maxWidth: 480, margin: '0 0 28px' }}>
          Save a card so the concierge can book hotels, flights, and activities for you without
          re-typing details every time. You approve every charge before it runs.
        </p>

        {error && (
          <div style={{
            marginBottom: 18, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.35)',
            color: '#b91c1c', fontSize: 13,
          }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: DIM, fontSize: 13 }}>Loading…</div>
        ) : methods.length === 0 ? (
          <div style={{
            padding: '18px 20px', borderRadius: 12,
            background: '#fff', border: `2px solid ${INK}`,
            marginBottom: 16,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No cards yet</div>
            <div style={{ fontSize: 13, color: DIM }}>Add one to enable concierge bookings.</div>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 10 }}>
            {methods.map((m) => (
              <li key={m.id} style={{
                padding: '14px 16px', borderRadius: 10,
                background: '#fff', border: '1px solid #d4d4d8',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    background: '#f5f5f4', padding: '3px 8px', borderRadius: 4,
                    letterSpacing: '0.06em',
                  }}>{m.brand}</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 14 }}>•••• {m.last4}</span>
                  {m.expMonth && m.expYear && (
                    <span style={{ fontSize: 12, color: DIM }}>{String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}</span>
                  )}
                </div>
                <button
                  onClick={() => detach(m.id)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 12px',
                    background: 'transparent', color: '#b91c1c',
                    border: '1px solid rgba(220, 38, 38, 0.35)', borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Remove</button>
              </li>
            ))}
          </ul>
        )}

        {!adding && (
          <button
            onClick={startAdd}
            style={{
              padding: '14px 22px', background: INK, color: PAPER,
              fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', textDecoration: 'none',
              border: `2px solid ${INK}`, borderRadius: 10,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Add a card</button>
        )}

        {adding && clientSecret && (
          <div style={{
            marginTop: 18, padding: 20, background: '#fff',
            border: `2px solid ${INK}`, borderRadius: 12,
          }}>
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: { colorPrimary: ACCENT, fontFamily: 'inherit' },
              },
            }}>
              <AddCardForm
                onDone={async () => {
                  setAdding(false);
                  setClientSecret(null);
                  await reload();
                }}
                onCancel={() => { setAdding(false); setClientSecret(null); }}
              />
            </Elements>
          </div>
        )}

        {adding && !clientSecret && (
          <div style={{ marginTop: 18, color: DIM, fontSize: 13 }}>Preparing secure form…</div>
        )}
      </div>
    </main>
  );
}

// Inner form — needs to live under <Elements> so useStripe/useElements work.
function AddCardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripeJs: Stripe | null = useStripe();
  const elements: StripeElements | null = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripeJs || !elements) return;
    setSubmitting(true);
    setError(null);
    const result = await stripeJs.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/settings/payment`,
      },
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'Could not save card');
      setSubmitting(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={{
            padding: '10px 16px', borderRadius: 8,
            background: 'transparent', color: INK,
            border: '1px solid #d4d4d8', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Cancel</button>
        <button
          type="submit"
          disabled={!stripeJs || submitting}
          style={{
            padding: '10px 18px', borderRadius: 8,
            background: ACCENT, color: INK,
            border: 'none', fontSize: 13, fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}
        >{submitting ? 'Saving…' : 'Save card'}</button>
      </div>
    </form>
  );
}
