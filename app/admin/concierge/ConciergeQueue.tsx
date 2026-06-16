'use client';

import { useEffect, useState } from 'react';

interface QueueRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  estimatedCents: number | null;
  finalCents: number | null;
  currency: string;
  paymentMethodId: string | null;
  otaProvider: string | null;
  createdAt: string;
  payload: unknown;
  user: { id: string; email: string | null; name: string | null; stripeCustomerId: string | null };
}

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const DIM = '#7a6f5e';
const ACCENT = '#a78bfa';

export default function ConciergeQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'booked' | 'failed'>('pending');
  const [acting, setActing] = useState<string | null>(null);

  async function reload() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/concierge/queue?status=${status}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setRows(j.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, [status]);

  async function complete(id: string) {
    const otaConfirmation = prompt('OTA confirmation code:');
    if (!otaConfirmation) return;
    const finalRaw = prompt('Final amount in cents (leave blank to keep estimate):');
    const finalCents = finalRaw ? parseInt(finalRaw, 10) : undefined;
    const stripePaymentId = prompt('Stripe PaymentIntent id (optional, paste from dashboard):') || undefined;
    setActing(id);
    try {
      const r = await fetch(`/api/concierge/requests/${id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ otaConfirmation, finalCents, stripePaymentId }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'failed');
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(null);
    }
  }

  async function fail(id: string) {
    const failureReason = prompt('Failure reason (shown to user):');
    if (!failureReason) return;
    setActing(id);
    try {
      const r = await fetch(`/api/concierge/requests/${id}/fail`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ failureReason }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'failed');
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed');
    } finally {
      setActing(null);
    }
  }

  return (
    <main style={{
      minHeight: '100svh', background: PAPER, color: INK,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: DIM, marginBottom: 8 }}>
          geknee · admin · concierge
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 18px' }}>Booking queue</h1>

        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {(['pending', 'booked', 'failed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                padding: '6px 14px', borderRadius: 999,
                background: status === s ? INK : 'transparent',
                color: status === s ? PAPER : INK,
                border: `1px solid ${INK}`, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{s} {status === s ? `(${rows.length})` : ''}</button>
          ))}
        </div>

        {error && (
          <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 8, background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.35)', color: '#b91c1c', fontSize: 13 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ color: DIM, fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '24px', borderRadius: 10, background: '#fff', border: `1px solid #d4d4d8`, fontSize: 14, color: DIM }}>
            No {status} requests.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {rows.map((r) => (
              <li key={r.id} style={{
                padding: '16px 18px', borderRadius: 10,
                background: '#fff', border: '1px solid #d4d4d8',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: '#f5f5f4', padding: '3px 7px', borderRadius: 4, letterSpacing: '0.06em' }}>{r.kind}</span>
                      {r.otaProvider && <span style={{ fontSize: 11, color: DIM }}>{r.otaProvider}</span>}
                      <span style={{ fontSize: 11, color: DIM }}>{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
                      {r.user.name ?? r.user.email}
                      {r.estimatedCents != null && (
                        <> · est {new Intl.NumberFormat('en-US', { style: 'currency', currency: r.currency }).format(r.estimatedCents / 100)}</>
                      )}
                      {r.paymentMethodId && (
                        <> · pm <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{r.paymentMethodId.slice(-12)}</code></>
                      )}
                    </div>
                  </div>
                  {status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        disabled={acting === r.id}
                        onClick={() => complete(r.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 6,
                          background: ACCENT, color: INK,
                          border: 'none', fontSize: 12, fontWeight: 700,
                          cursor: acting === r.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}
                      >✓ Booked</button>
                      <button
                        disabled={acting === r.id}
                        onClick={() => fail(r.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 6,
                          background: 'transparent', color: '#b91c1c',
                          border: '1px solid rgba(220, 38, 38, 0.35)', fontSize: 12, fontWeight: 700,
                          cursor: acting === r.id ? 'wait' : 'pointer',
                          fontFamily: 'inherit', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}
                      >✕ Fail</button>
                    </div>
                  )}
                </div>
                <details style={{ fontSize: 12, color: DIM }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Payload</summary>
                  <pre style={{ background: '#f5f5f4', padding: 10, borderRadius: 6, overflow: 'auto', fontSize: 11, marginTop: 6 }}>
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
