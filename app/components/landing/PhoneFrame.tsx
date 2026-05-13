// CSS-only iPhone-shape mockup for the landing feature tour.
// Pure SVG + divs — no asset files needed.
// Children render inside the bezel; pick the "tint" prop to color the wash.

import type { ReactNode } from 'react';

interface PhoneFrameProps {
  children: ReactNode;
  tint?: 'lavender' | 'cyan' | 'gold' | 'rose' | 'emerald';
  rotate?: number;
}

const TINTS = {
  lavender: 'radial-gradient(circle at 50% 0%, rgba(167,139,250,0.35), transparent 70%)',
  cyan:     'radial-gradient(circle at 50% 0%, rgba(125,211,252,0.30), transparent 70%)',
  gold:     'radial-gradient(circle at 50% 0%, rgba(251,191,36,0.30), transparent 70%)',
  rose:     'radial-gradient(circle at 50% 0%, rgba(248,113,113,0.30), transparent 70%)',
  emerald:  'radial-gradient(circle at 50% 0%, rgba(52,211,153,0.30), transparent 70%)',
};

export function PhoneFrame({ children, tint = 'lavender', rotate = 0 }: PhoneFrameProps) {
  return (
    <div style={{
      width: 'min(100%, 320px)',
      aspectRatio: '9 / 19',
      borderRadius: 42,
      background: '#0a0a1f',
      boxShadow: `
        inset 0 0 0 2px rgba(255,255,255,0.06),
        inset 0 0 0 6px #1a1a2e,
        0 30px 70px rgba(0,0,0,0.35),
        0 8px 20px rgba(0,0,0,0.25)
      `,
      padding: 10,
      position: 'relative',
      overflow: 'hidden',
      transform: rotate ? `rotate(${rotate}deg)` : undefined,
    }}>
      {/* Screen */}
      <div style={{
        height: '100%', width: '100%',
        borderRadius: 32,
        overflow: 'hidden',
        background: '#0a0a1f',
        position: 'relative',
        color: '#f2f2f8',
        fontFamily: 'var(--font-ui), system-ui, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Top-of-screen tint wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: TINTS[tint],
          pointerEvents: 'none',
        }} />
        {/* Dynamic Island */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 92, height: 26, background: '#000', borderRadius: 14,
          zIndex: 2,
        }} />
        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1,
          height: '100%', width: '100%',
          padding: '50px 16px 18px',
          display: 'flex', flexDirection: 'column',
          gap: 10,
          fontSize: 11,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
