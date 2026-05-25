'use client';
import { useState } from 'react';
import Link from 'next/link';
import CheckoutButton from './CheckoutButton';
import type { PriceDisplay } from '@/lib/stripe-prices';

type Interval = 'monthly' | 'yearly';

type Props = {
  stripeMonthly: PriceDisplay | null;
  stripeYearly: PriceDisplay | null;
  stripeSavingsPct: number | null;
};

// Brand tokens — duplicated client-side to keep the file self-contained.
const T = {
  bg: '#05050f',
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

export default function TierGrid({ stripeMonthly, stripeYearly, stripeSavingsPct }: Props) {
  const [interval, setIntervalState] = useState<Interval>('yearly');

  // Display prices — prefer live Stripe, fall back to copy in the design.
  const monthlyPrice = stripeMonthly?.amount ?? '$4.99';
  const monthlySub   = stripeMonthly?.sub ?? '/ month';
  const yearlyPrice  = stripeYearly?.amount ?? '$39';
  const yearlySub    = stripeYearly?.sub ?? '/ year';
  const savingsPct   = stripeSavingsPct ?? 35;

  // Monthly equivalent of yearly, for the price note ("$3.25 / mo").
  let yearlyMonthlyEquiv = '$3.25';
  if (stripeYearly?.raw) {
    yearlyMonthlyEquiv = `$${(stripeYearly.raw / 12 / 100).toFixed(2)}`;
  }

  return (
    <>
      {/* Toggle */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 5, marginTop: 36 }}>
        <div style={{
          display: 'inline-flex',
          padding: 4,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          fontFamily: T.mono, fontSize: 11,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          <TogglePill on={interval === 'monthly'} onClick={() => setIntervalState('monthly')}>
            Monthly
          </TogglePill>
          <TogglePill on={interval === 'yearly'} onClick={() => setIntervalState('yearly')}>
            Yearly
            <span style={{
              marginLeft: 6, padding: '1px 6px',
              background: T.gold, color: T.bg,
              borderRadius: 4, fontSize: 9, fontWeight: 700,
            }}>
              SAVE {savingsPct}%
            </span>
          </TogglePill>
        </div>
      </div>

      {/* Tier grid */}
      <section style={{
        position: 'relative', zIndex: 5,
        maxWidth: 1120, margin: '48px auto 0',
        padding: '0 40px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 20,
      }}>
        {/* Free / Drifter */}
        <TierCard
          label="▣ Free tier"
          name="Drifter"
          tagline="Collect monuments. Dream up trips."
          price="$0"
          priceSub="forever"
          priceNote="no card · no signup wall"
          features={[
            { label: 'Explore the 3D globe', on: true },
            { label: 'Collect monuments as you travel', on: true },
            { label: '3 AI-planned trips / month', on: true },
            { label: '3 saved trip drafts', on: true },
            { label: 'Unlimited AI planning', on: false },
            { label: 'Unlimited saved trips', on: false },
            { label: 'Pro-only monument skins', on: false },
          ]}
          cta={
            <Link href="/plan/location" style={ctaStyle('ghost')}>
              Start free
            </Link>
          }
        />

        {/* Pro Monthly / Traveler */}
        <TierCard
          label="◈ Pro · monthly"
          name="Traveler"
          tagline="For the serial trip-planner."
          price={interval === 'monthly' ? monthlyPrice : monthlyPrice}
          priceSub={monthlySub}
          priceNote="cancel anytime"
          features={[
            { label: 'Everything in Drifter', on: true },
            { label: 'Unlimited AI-planned trips', on: true },
            { label: 'Unlimited saved drafts', on: true },
            { label: 'Priority support · 12h response', on: true },
            { label: 'Early access to new monument skins', on: true },
            { label: 'Pro-only rarity tiers', on: true },
          ]}
          cta={
            <CheckoutButton
              interval="monthly"
              label="Go Pro monthly →"
              style={ctaStyle('ghost') as React.CSSProperties}
            />
          }
        />

        {/* Pro Yearly / Wanderer — highlighted */}
        <TierCard
          highlight
          badge={`★ Best value · save ${savingsPct}%`}
          label="✦ Pro · yearly"
          name="Wanderer"
          tagline="For the constant-mover. Best value."
          price={yearlyPrice}
          priceSub={yearlySub}
          priceNote={`${yearlyMonthlyEquiv} / mo · 2+ months free`}
          features={[
            { label: 'Everything in Pro Monthly', on: true },
            { label: `${savingsPct}% off vs. paying monthly`, on: true },
            { label: 'Exclusive Pro-Yearly monument skin', on: true },
            { label: 'Annual collection postcard, printed', on: true },
          ]}
          cta={
            <CheckoutButton
              interval="yearly"
              label="Go Pro yearly →"
              style={ctaStyle('primary') as React.CSSProperties}
            />
          }
        />
      </section>
    </>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────

function TogglePill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? 'rgba(167,139,250,0.16)' : 'transparent',
        color: on ? T.accent : T.inkMute,
        border: 'none', cursor: 'pointer',
        padding: '10px 22px', borderRadius: 999,
        fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
        boxShadow: on ? `inset 0 0 0 1px ${T.borderHi}` : 'none',
        transition: 'all 180ms ease',
      }}
    >
      {children}
    </button>
  );
}

function TierCard({
  highlight, badge, label, name, tagline, price, priceSub, priceNote, features, cta,
}: {
  highlight?: boolean;
  badge?: string;
  label: string;
  name: string;
  tagline: string;
  price: string;
  priceSub: string;
  priceNote: string;
  features: { label: string; on: boolean }[];
  cta: React.ReactNode;
}) {
  return (
    <article style={{
      background: highlight
        ? 'linear-gradient(165deg, rgba(167,139,250,0.12), rgba(125,211,252,0.04))'
        : 'rgba(13, 13, 36, 0.55)',
      border: `1px solid ${highlight ? T.borderHi : T.border}`,
      borderRadius: 18,
      padding: '28px 26px',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)',
      boxShadow: highlight
        ? '0 20px 60px rgba(167,139,250,0.18), inset 0 0 0 1px rgba(167,139,250,0.08)'
        : 'none',
    }}>
      {badge && (
        <div style={{
          position: 'absolute', top: -10, left: 24,
          padding: '4px 10px',
          background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`,
          color: T.bg,
          borderRadius: 999,
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          {badge}
        </div>
      )}

      <div style={{
        fontFamily: T.mono, fontSize: 10,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: highlight ? T.accent : T.inkMute,
        marginBottom: 10,
      }}>
        {label}
      </div>

      <div style={{
        fontFamily: T.serif, fontSize: 30, fontWeight: 400,
        letterSpacing: '-0.015em', marginBottom: 6,
      }}>
        {name}
      </div>

      <div style={{
        fontSize: 14, color: T.inkDim,
        lineHeight: 1.45, marginBottom: 24,
      }}>
        {tagline}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '8px 0 6px' }}>
        <span style={{
          fontFamily: T.serif, fontWeight: 300,
          fontSize: 56, letterSpacing: '-0.03em', lineHeight: 1,
        }}>{price}</span>
        <span style={{
          fontFamily: T.mono, fontSize: 11, color: T.inkMute,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{priceSub}</span>
      </div>

      <div style={{
        fontFamily: T.mono, fontSize: 10, color: T.gold,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        marginBottom: 24,
      }}>{priceNote}</div>

      <ul style={{
        listStyle: 'none', padding: 0, margin: '0 0 28px',
        display: 'flex', flexDirection: 'column', gap: 11,
        flex: 1,
      }}>
        {features.map((f, i) => (
          <li key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            fontSize: 13, lineHeight: 1.45,
            color: f.on ? T.ink : T.inkMute,
          }}>
            <span style={{
              flexShrink: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: f.on ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
              color: f.on ? T.accent : T.inkMute,
              display: 'grid', placeItems: 'center',
              fontSize: 10, lineHeight: 1, fontWeight: 700,
              marginTop: 1,
            }}>
              {f.on ? '✓' : '·'}
            </span>
            {f.label}
          </li>
        ))}
      </ul>

      {cta}
    </article>
  );
}

function ctaStyle(variant: 'primary' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'center',
    padding: '14px 18px', borderRadius: 12,
    fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
    textDecoration: 'none', cursor: 'pointer',
    fontFamily: T.ui,
  };
  if (variant === 'primary') {
    return {
      ...base,
      background: T.accent, color: T.bg,
      border: 'none',
      boxShadow: '0 8px 28px rgba(167,139,250,0.30)',
    };
  }
  return {
    ...base,
    background: 'transparent', color: T.ink,
    border: `1px solid ${T.borderHi}`,
  };
}
