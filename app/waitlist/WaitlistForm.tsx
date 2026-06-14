'use client';

import { useState } from 'react';
import Link from 'next/link';
import { track, useScreen } from '@/lib/analytics';

// Passport-zine palette mirrors the landing — see app/page.tsx for the
// shared tokens (PAPER cream, INK near-black, lavender highlight).
const PAPER = '#f5f1e8';
const INK = '#1a1a1a';
const LAV = '#7c3aed';
const DIM = '#7a6f5e';

type Status = 'idle' | 'loading' | 'ok' | 'already' | 'error';

function readSource(): string | null {
  if (typeof window === 'undefined') return null;
  const qs = new URLSearchParams(window.location.search);
  const fromQS = qs.get('src') ?? qs.get('ref');
  if (fromQS) return fromQS.slice(0, 64);
  const ref = document.referrer;
  if (!ref) return null;
  if (ref.includes('instagram.com')) return 'ig';
  if (ref.includes('tiktok.com')) return 'tiktok';
  if (ref.includes('pinterest')) return 'pinterest';
  return null;
}

export default function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string>('');
  // Snapshot the attribution source on mount so useScreen + submit share
  // it (readSource() reads window.location/document.referrer which only
  // exist client-side).
  const [source] = useState<string | null>(() => (typeof window === 'undefined' ? null : readSource()));

  // Fires `screen_view` with `{screen:'waitlist', source}` so PostHog
  // funnels can compute (visits → submit_attempt → signup) per source.
  useScreen('waitlist', source ? { source } : undefined);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setMessage('');
    track('waitlist_submit_attempt', { source: source ?? 'unknown', has_city: city.trim().length > 0 });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          city: city.trim() || undefined,
          source: source ?? undefined,
        }),
      });
      const json: { ok?: boolean; alreadyOnList?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setStatus('error');
        setMessage(json.error === 'bad_email' ? 'that email looks off — try again?' : 'something broke. try again in a sec.');
        track('waitlist_signup_failed', { source: source ?? 'unknown', reason: json.error ?? `http_${res.status}` });
        return;
      }
      setStatus(json.alreadyOnList ? 'already' : 'ok');
      setMessage(json.alreadyOnList ? "you're already on the list — we'll email you when iOS drops." : "you're in. check your inbox for confirmation.");
      if (json.alreadyOnList) {
        track('waitlist_already_member', { source: source ?? 'unknown' });
      } else {
        track('waitlist_signup', { source: source ?? 'unknown', has_city: city.trim().length > 0 });
      }
    } catch {
      setStatus('error');
      setMessage('network error. try again.');
      track('waitlist_signup_failed', { source: source ?? 'unknown', reason: 'network' });
    }
  }

  return (
    <main style={{
      minHeight: '100svh', background: PAPER, color: INK,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      padding: '48px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        <div style={{
          fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: DIM, marginBottom: 18,
        }}>
          geknee · iOS early access
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 56px)', lineHeight: 1.05, margin: '0 0 18px',
          fontWeight: 800, letterSpacing: '-0.01em',
        }}>
          the app launches.<br />
          <span style={{ color: LAV }}>you get it first.</span>
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.55, margin: '0 0 32px', maxWidth: 480 }}>
          275 monuments. 7 rarity tiers. stand under it — phone verifies via GPS + Street View — badge unlocks. couch flexes don't count.
        </p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === 'loading'}
            style={{
              padding: '14px 16px', fontSize: 16, borderRadius: 8,
              border: `2px solid ${INK}`, background: PAPER, color: INK,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <input
            type="text"
            placeholder="first city you'd check in (optional)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={status === 'loading'}
            style={{
              padding: '14px 16px', fontSize: 16, borderRadius: 8,
              border: `2px solid ${INK}`, background: PAPER, color: INK,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={status === 'loading' || status === 'ok' || status === 'already'}
            style={{
              padding: '15px 22px', fontSize: 15, fontWeight: 700,
              borderRadius: 8, border: `2px solid ${INK}`,
              background: status === 'ok' || status === 'already' ? '#7cff97' : INK,
              color: status === 'ok' || status === 'already' ? '#003812' : PAPER,
              cursor: status === 'loading' ? 'wait' : 'pointer',
              letterSpacing: '0.04em', textTransform: 'uppercase',
              fontFamily: 'inherit',
            }}
          >
            {status === 'loading' ? '…adding you' : status === 'ok' || status === 'already' ? '✓ on the list' : 'join the waitlist'}
          </button>
        </form>

        {message && (
          <div style={{
            marginTop: 18, fontSize: 14, lineHeight: 1.5,
            color: status === 'error' ? '#b91c1c' : INK,
          }}>
            {message}
          </div>
        )}

        <div style={{ marginTop: 40, fontSize: 13, color: DIM, lineHeight: 1.6 }}>
          web version is live now — <Link href="/plan/location" style={{ color: LAV, textDecoration: 'none', fontWeight: 600 }}>spin the globe →</Link>
        </div>
      </div>
    </main>
  );
}
