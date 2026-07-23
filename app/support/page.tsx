import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support · geknee',
  description: 'How to reach the geknee team, common questions, and app help.',
};

const PAPER = '#f5f1e8';
const INK = '#0a0a1f';
const ACCENT = '#a78bfa';

const CONTACT_EMAIL = 'support@geknee.com';
const LAST_UPDATED = 'July 13, 2026';

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'How do I save a place from Instagram, TikTok, or Google Maps?',
    a: (
      <>
        Tap <b>Share</b> in the other app, scroll the app row on the share sheet, and pick
        <b> geknee</b>. We&apos;ll identify the place, ask which trip to save it to, and drop
        it into your itinerary.
      </>
    ),
  },
  {
    q: 'geknee isn’t showing up in my share sheet',
    a: (
      <>
        On iPhone: kill the other app once and reopen; iOS caches the share-target list. On Android,
        try force-stop of geknee from Settings and reopen. If it still doesn&apos;t appear, email us with
        your device model and iOS/Android version.
      </>
    ),
  },
  {
    q: 'What are &quot;monument check-ins&quot; and how do they work?',
    a: (
      <>
        We ship a curated set of 60+ world monuments. When your device confirms you&apos;re actually at
        one (via GPS + timestamp), you unlock a collectible tier. No couch-unlocks. See the{' '}
        <Link href="/" style={{ color: ACCENT }}>homepage</Link> for the full list.
      </>
    ),
  },
  {
    q: 'Why do you ask for &quot;Always&quot; location?',
    a: (
      <>
        Only if you turn on <b>Nearby alerts</b> for a saved place. That feature uses geofences, which
        need Always-location so we can quietly notify you when you&apos;re near a place you&apos;ve saved.
        You can turn it off at any time in Settings → Location.
      </>
    ),
  },
  {
    q: 'How do I delete my account?',
    a: (
      <>
        Open <b>Settings → Account → Delete account</b> in the app, or email {' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT }}>{CONTACT_EMAIL}</a>. We&apos;ll wipe
        your data within 30 days.
      </>
    ),
  },
  {
    q: 'How do I cancel a Pro subscription?',
    a: (
      <>
        In the geknee app: <b>Settings → Manage plan → Cancel</b>. If you subscribed via the App Store,
        cancel through Apple: iOS <b>Settings → your name → Subscriptions → geknee → Cancel</b>.
      </>
    ),
  },
  {
    q: 'Something else — how do I contact you?',
    a: (
      <>
        Email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT }}>{CONTACT_EMAIL}</a>. We
        aim to reply within one business day.
      </>
    ),
  },
];

export default function SupportPage() {
  return (
    <main style={{ background: PAPER, color: INK, minHeight: '100svh', padding: '48px 20px 80px' }}>
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          fontFamily: 'var(--font-ui), system-ui, sans-serif',
          lineHeight: 1.6,
        }}
      >
        <Link href="/" style={{ color: ACCENT, fontSize: 13, textDecoration: 'none' }}>← geknee</Link>
        <h1
          style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: 40,
            margin: '24px 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Support
        </h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 40 }}>Last updated: {LAST_UPDATED}</p>

        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 22, margin: '0 0 12px' }}>
            Get help
          </h2>
          <p style={{ margin: '0 0 6px' }}>
            Email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: ACCENT, fontWeight: 500 }}>
              {CONTACT_EMAIL}
            </a>{' '}
            — one human reads and replies to every message, usually within one business day.
          </p>
          <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
            When you email, include your device (iPhone 15 Pro, Pixel 8, etc.), OS version, and the
            geknee app version if you know it — it makes debugging 3× faster.
          </p>
        </section>

        <section style={{ marginBottom: 44 }}>
          <h2 style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: 22, margin: '0 0 16px' }}>
            Common questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {FAQS.map(({ q, a }, i) => (
              <details
                key={i}
                style={{
                  borderTop: '1px solid rgba(10,10,31,0.12)',
                  paddingTop: 16,
                }}
              >
                <summary
                  style={{
                    fontFamily: 'var(--font-display), Georgia, serif',
                    fontSize: 17,
                    cursor: 'pointer',
                    listStyle: 'none',
                  }}
                >
                  {q}
                </summary>
                <div style={{ marginTop: 10, fontSize: 15 }}>{a}</div>
              </details>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 24, fontSize: 14, color: '#555' }}>
          <p style={{ margin: '0 0 8px' }}>
            Legal:{' '}
            <Link href="/terms" style={{ color: ACCENT }}>Terms</Link>{' · '}
            <Link href="/privacy" style={{ color: ACCENT }}>Privacy</Link>
          </p>
          <p style={{ margin: 0 }}>
            geknee is designed and built in the United States.
          </p>
        </section>
      </div>
    </main>
  );
}
