import React from 'react';

const MONO = 'var(--font-mono-display), ui-monospace, monospace';

// Shared shell for the live-view context cards (weather, crowds, safety, …).
// Accent colors the left border + the mono label.
export function CardShell({ accent, label, children }: {
  accent: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      // Subtle accent-tinted gradient background so each card
      // carries a whiff of its category color (weather = gold,
      // safety = red, insights = sky-blue) without going neon.
      // color-mix keeps the tint at a low 6-9% opacity — enough
      // to read against the dark chrome, quiet enough that dense
      // pages don't look like a rainbow.
      background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 9%, transparent) 0%, rgba(255,255,255,0.03) 55%)`,
      borderLeft: `3px solid ${accent}`,
      border: '1px solid var(--brand-border)',
      borderLeftWidth: 3,
      borderRadius: 12,
      padding: '14px 16px',
      boxShadow: `0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.25)`,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
        color: accent, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}
