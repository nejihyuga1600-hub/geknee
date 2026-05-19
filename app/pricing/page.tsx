import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchStripePrices } from '@/lib/stripe-prices';
import TierGrid from './TierGrid';

// Stripe prices change rarely — revalidate hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Pricing · geknee',
  description: 'Free forever, or go Pro for unlimited AI trip planning and exclusive monument skins.',
  openGraph: {
    title: 'Pricing · geknee',
    description: 'Free forever, or go Pro for unlimited AI trip planning.',
    type: 'website',
  },
};

// ── Brand tokens (in sync with the cosmic design in the design canvas) ──
const T = {
  bg: '#05050f',
  bg2: '#0a0a1f',
  ink: '#f2f2f8',
  inkDim: '#a8a8c0',
  inkMute: '#6b6b85',
  accent: '#a78bfa',
  accent2: '#7dd3fc',
  gold: '#fbbf24',
  border: 'rgba(167, 139, 250, 0.18)',
  borderHi: 'rgba(167, 139, 250, 0.40)',
  serif: "var(--font-display), Georgia, serif",
  ui: "var(--font-ui), 'Inter', system-ui, sans-serif",
  mono: "var(--font-mono-display), ui-monospace, monospace",
} as const;

// A small static starfield (server-rendered, deterministic — no hydration mismatch).
const STARS = Array.from({ length: 120 }, (_, i) => {
  // Deterministic pseudo-random from index
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    size: r(1) * 1.4 + 0.3,
    left: r(2) * 100,
    top: r(3) * 100,
    delay: -r(4) * 4,
    dur: 3 + r(5) * 4,
  };
});

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const sp = await searchParams;
  const success = sp.success === '1';
  const canceled = sp.canceled === '1';

  // Live from Stripe — TierGrid falls back to static copy if these are null.
  const { monthly, yearly, savingsPct } = await fetchStripePrices();

  return (
    <main
      style={{
        minHeight: '100svh',
        background: `
          radial-gradient(ellipse at 30% 10%, rgba(167,139,250,0.14), transparent 55%),
          radial-gradient(ellipse at 80% 60%, rgba(125,211,252,0.08), transparent 55%),
          ${T.bg}
        `,
        color: T.ink,
        fontFamily: T.ui,
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      {/* Inline keyframes + the few transitions we can't do with inline styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gk-tw { 0%, 100% { opacity: 0.18 } 50% { opacity: 0.7 } }
        .gk-star { animation: gk-tw 4s ease-in-out infinite }
        details.gk-faq summary { list-style: none; cursor: pointer; }
        details.gk-faq summary::-webkit-details-marker { display: none; }
        details.gk-faq summary::after {
          content: '+'; font-weight: 300; font-size: 24px; color: ${T.accent};
          transition: transform 200ms ease;
        }
        details.gk-faq[open] summary::after { transform: rotate(45deg); }
      `}} />

      {/* Starfield */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} aria-hidden>
        {STARS.map((s, i) => (
          <span
            key={i}
            className="gk-star"
            style={{
              position: 'absolute',
              width: s.size, height: s.size,
              left: `${s.left}%`, top: `${s.top}%`,
              borderRadius: '50%', background: '#fff',
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        ))}
      </div>

      {/* Top nav */}
      <nav style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 40px',
        maxWidth: 1280, margin: '0 auto',
      }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.accent, boxShadow: `0 0 12px ${T.accent}` }} />
          <span style={{ fontFamily: T.serif, fontSize: 22, fontStyle: 'italic', fontWeight: 500, letterSpacing: '-0.01em' }}>
            geknee
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href="/" style={navLink}>Globe</Link>
          <Link href="/leaderboard" style={navLink}>Leaderboard</Link>
          <Link href="/pricing" style={{ ...navLink, color: T.accent }}>Pricing</Link>
          <Link href="/plan/location" style={{
            padding: '9px 16px', borderRadius: 10,
            background: 'rgba(167,139,250,0.14)', color: T.accent,
            border: `1px solid ${T.borderHi}`,
            fontSize: 12, fontWeight: 600, textDecoration: 'none',
            marginLeft: 8,
          }}>
            Open the globe →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        position: 'relative', zIndex: 5,
        maxWidth: 1120, margin: '0 auto',
        padding: '40px 40px 0', textAlign: 'center',
      }}>
        <Link href="/" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          color: T.inkMute, fontFamily: T.mono, fontSize: 11,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          textDecoration: 'none',
        }}>
          ← back to globe
        </Link>

        {/* Post-checkout banners */}
        {success && (
          <Banner color="#7cff97" bg="rgba(124,255,151,0.08)">
            ◉ You&apos;re Pro. Welcome aboard. All features unlocked.
          </Banner>
        )}
        {canceled && (
          <Banner color={T.gold} bg="rgba(251,191,36,0.08)">
            Checkout canceled. No charge. Change your mind? Pick a plan below.
          </Banner>
        )}

        <div style={{
          fontFamily: T.mono, fontSize: 11, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: T.accent,
          marginTop: 28, marginBottom: 24,
        }}>
          § 02 · pricing · simple by design
        </div>
        <h1 style={{
          fontFamily: T.serif, fontWeight: 300,
          fontSize: 'clamp(46px, 7vw, 80px)',
          lineHeight: 0.95, letterSpacing: '-0.025em',
          margin: '0 0 22px',
        }}>
          Free forever.
          <br />
          <em style={{ fontStyle: 'italic', color: T.accent }}>Pro when you mean it.</em>
        </h1>
        <p style={{
          fontSize: 17, color: T.inkDim,
          maxWidth: 580, margin: '0 auto',
          lineHeight: 1.55,
        }}>
          Plan unlimited trips, collect monuments across seven rarity tiers, and earn Pro-only skins — all from the same globe.
        </p>
      </section>

      {/* Tiers + Toggle (client) */}
      <TierGrid
        stripeMonthly={monthly}
        stripeYearly={yearly}
        stripeSavingsPct={savingsPct}
      />

      {/* Comparison strip */}
      <section style={{
        position: 'relative', zIndex: 5,
        maxWidth: 1120, margin: '64px auto 0',
        padding: '28px 40px',
        borderTop: `1px solid ${T.border}`,
        borderBottom: `1px solid ${T.border}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 28,
      }}>
        <StatCell num="60+" label="Monuments across all plans" />
        <StatCell num="7" label="Rarity tiers — stone → celestial" />
        <StatCell num="∞" label="Pro AI trip generations" italic />
        <StatCell num="14d" label="No-questions refund window" />
      </section>

      {/* FAQ */}
      <section style={{
        position: 'relative', zIndex: 5,
        maxWidth: 720, margin: '84px auto 0',
        padding: '0 40px',
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: 11, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: T.accent,
          marginBottom: 12,
        }}>
          § 03 · the small print
        </div>
        <h2 style={{
          fontFamily: T.serif, fontWeight: 300,
          fontSize: 42, letterSpacing: '-0.02em',
          margin: '0 0 36px',
        }}>
          A few <em style={{ fontStyle: 'italic', color: T.accent }}>questions</em>.
        </h2>

        <Faq
          q="Can I cancel anytime?"
          a="Yes — upgrade, downgrade, or cancel from the billing portal at any time. No contracts, no renewal traps, no calls."
          open
        />
        <Faq
          q="What happens to my monuments if I downgrade?"
          a="They're yours forever. Free users can see everything they've already collected. Pro-only skins stay visible on your globe — you just can't unlock new Pro tiers without an active Pro plan."
        />
        <Faq
          q="Is there a refund policy?"
          a="If you're unhappy in the first 14 days, email hello@geknee.com and we'll refund you in full — no follow-ups, no friction."
        />
        <Faq
          q="Can I use geknee for work trips?"
          a="Absolutely. Pro is one account; add your company card at checkout and expense the receipt. Team plans coming Q3."
        />
        <Faq
          q="Why's the trip planner free?"
          a="The trip planner is a means to an end — collecting monuments. We give you the planner so you actually go, complete quests, and earn rare skins. Pro just removes the throttle for power users."
        />
      </section>

      {/* CTA band */}
      <section style={{
        position: 'relative', zIndex: 5,
        maxWidth: 1120, margin: '96px auto 0',
        padding: '0 40px', textAlign: 'center',
      }}>
        <div style={{
          padding: '56px 40px',
          border: `1px solid ${T.borderHi}`,
          borderRadius: 24,
          background: `radial-gradient(ellipse at 50% 0%, rgba(167,139,250,0.18), transparent 70%), rgba(13,13,36,0.6)`,
          backdropFilter: 'blur(20px)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 220, height: 220, borderRadius: '50%',
            background: `radial-gradient(circle, rgba(167,139,250,0.22), transparent 70%)`,
            pointerEvents: 'none',
          }} />
          <h3 style={{
            fontFamily: T.serif, fontWeight: 300,
            fontSize: 38, letterSpacing: '-0.02em',
            margin: '0 0 14px', position: 'relative',
          }}>
            Start your <em style={{ fontStyle: 'italic', color: T.accent }}>collection</em>.
          </h3>
          <p style={{
            color: T.inkDim, fontSize: 15, lineHeight: 1.55,
            maxWidth: 480, margin: '0 auto 28px', position: 'relative',
          }}>
            Open the globe, pick a monument, plan the trip. It&apos;s free, and you can be on a 3D-rendered Earth in under a minute.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', position: 'relative' }}>
            <Link href="/plan/location" style={ctaPrimary}>Open the globe →</Link>
            <Link href="/leaderboard" style={ctaGhost}>See the leaderboard</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        position: 'relative', zIndex: 5,
        maxWidth: 1120, margin: '80px auto 0',
        padding: '64px 40px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: T.mono, fontSize: 10,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: T.inkMute,
        borderTop: `1px solid ${T.border}`,
      }}>
        <div>© 2026 geknee · Built with three.js + ☕</div>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/terms" style={{ color: T.inkMute, textDecoration: 'none' }}>Terms</Link>
          <Link href="/privacy" style={{ color: T.inkMute, textDecoration: 'none' }}>Privacy</Link>
          <a href="mailto:hello@geknee.com" style={{ color: T.inkMute, textDecoration: 'none' }}>hello@geknee.com</a>
        </div>
      </footer>
    </main>
  );
}

// ─── Small helpers ─────────────────────────────────────────────

const navLink: React.CSSProperties = {
  padding: '8px 14px',
  color: T.inkDim,
  fontSize: 12,
  letterSpacing: '0.04em',
  textDecoration: 'none',
  borderRadius: 8,
};

const ctaPrimary: React.CSSProperties = {
  padding: '14px 26px', borderRadius: 12, minWidth: 200,
  background: T.accent, color: T.bg,
  fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
  textDecoration: 'none', textAlign: 'center',
  boxShadow: '0 8px 28px rgba(167,139,250,0.30)',
};

const ctaGhost: React.CSSProperties = {
  padding: '14px 26px', borderRadius: 12, minWidth: 200,
  background: 'transparent', color: T.ink,
  border: `1px solid ${T.borderHi}`,
  fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
  textDecoration: 'none', textAlign: 'center',
};

function Banner({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}55`, color,
      borderRadius: 12, padding: '14px 18px',
      marginTop: 18,
      fontSize: 14, fontWeight: 600, textAlign: 'center',
    }}>
      {children}
    </div>
  );
}

function StatCell({ num, label, italic }: { num: string; label: string; italic?: boolean }) {
  return (
    <div style={{
      borderLeft: `1px solid ${T.border}`,
      paddingLeft: 18,
    }}>
      <div style={{
        fontFamily: T.serif, fontWeight: 300,
        fontSize: 34, letterSpacing: '-0.02em',
        lineHeight: 1, color: T.accent,
        fontStyle: italic ? 'italic' : 'normal',
        marginBottom: 8,
      }}>{num}</div>
      <div style={{
        fontFamily: T.mono, fontSize: 10,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        color: T.inkMute,
      }}>{label}</div>
    </div>
  );
}

function Faq({ q, a, open }: { q: string; a: string; open?: boolean }) {
  return (
    <details className="gk-faq" open={open} style={{
      borderBottom: `1px solid ${T.border}`,
      borderTop: open ? `1px solid ${T.border}` : 'none',
      padding: '22px 4px',
    }}>
      <summary style={{
        fontFamily: T.serif, fontWeight: 400, fontSize: 19,
        letterSpacing: '-0.01em', color: T.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {q}
      </summary>
      <div style={{
        fontSize: 14, color: T.inkDim, lineHeight: 1.65,
        marginTop: 14, paddingRight: 36,
      }}>
        {a}
      </div>
    </details>
  );
}
