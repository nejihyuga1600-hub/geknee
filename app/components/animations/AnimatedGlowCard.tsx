'use client';
// Animated glow card — a rotating conic-gradient border for *unlocked* monument
// cards. Sits outside the existing MagicCard pointer-spotlight so the two
// effects don't fight: MagicCard moves a spotlight INSIDE the card; this one
// rotates a light beam AROUND the card's edge.
//
// CSS-only animation (no JS RAF). The conic gradient is rendered on a
// pseudo-pane behind the content and rotated via a 6s keyframe loop. The
// `--glow-color` CSS variable carries the rarity tint so the same component
// can render bronze / gold / damascus / etc.

import type { CSSProperties, ReactNode } from 'react';

interface AnimatedGlowCardProps {
  children: ReactNode;
  color?: string;
  intensity?: number; // 0..1, scales the glow brightness
  speed?: number;     // seconds per full rotation
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
}

export function AnimatedGlowCard({
  children,
  color = '#a78bfa',
  intensity = 0.85,
  speed = 6,
  borderRadius = 14,
  className,
  style,
}: AnimatedGlowCardProps) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        borderRadius,
        ...style,
      }}
    >
      <style>{`
        @keyframes geknee-glow-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes geknee-glow-pulse {
          0%, 100% { opacity: ${intensity * 0.6}; }
          50%      { opacity: ${intensity}; }
        }
      `}</style>

      {/* Rotating conic beam, sits BEHIND content. Uses ::before-style absolutely
          positioned div with negative inset so it bleeds past the card edges,
          then mask-clipped back via overflow on the wrapper. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -1,
          borderRadius: 'inherit',
          padding: 1,
          background: `conic-gradient(from 0deg, transparent 0deg, ${color} 60deg, ${color}cc 90deg, transparent 120deg, transparent 240deg, ${color}88 300deg, transparent 360deg)`,
          WebkitMask:
            'linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          animation: `geknee-glow-spin ${speed}s linear infinite, geknee-glow-pulse ${speed * 0.66}s ease-in-out infinite`,
          pointerEvents: 'none',
          filter: `drop-shadow(0 0 12px ${color}88)`,
        }}
      />

      {/* Soft outer halo — sits OUTSIDE the card, gives the "glow" feeling. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: borderRadius + 8,
          background: `radial-gradient(circle at 50% 50%, ${color}33 0%, transparent 65%)`,
          filter: 'blur(10px)',
          opacity: intensity * 0.85,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, borderRadius: 'inherit' }}>
        {children}
      </div>
    </div>
  );
}
