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
      background: 'rgba(255,255,255,0.03)',
      borderLeft: `3px solid ${accent}`,
      border: '1px solid var(--brand-border)',
      borderLeftWidth: 3,
      borderRadius: 12,
      padding: '14px 16px',
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
