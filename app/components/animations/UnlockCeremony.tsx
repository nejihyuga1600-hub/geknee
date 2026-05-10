'use client';
// The cinematic unlock choreography. Six stages, fixed-position overlay that
// renders above everything for ~4.4s, then unmounts.
//
//   1. bloom   — radial ink-pulse from the unlock-tap origin (0–1.0s)
//   2. reveal  — aurora gradient backdrop + foil-shimmer monument name +
//                  rarity skin label, all centered (1.0–2.4s)
//   3. travel  — glowing orb morphs across the screen along an SVG arc to
//                  the globe canvas corner (2.4–3.6s)
//   4. stamp   — JetBrains Mono "+ 1 · GEKNEE PASSPORT · ISSUE 001"
//                  fades in/out at the bottom (3.6–4.4s)
//
// The component listens for a `trigger` object (latest unlock info) — when it
// changes, it kicks the phase machine. The originRef points at the button
// that fired the unlock so the bloom can start from the tap point.
//
// Also dispatches `geknee:monument-just-collected` window event when the
// orb completes travel, so globe-side landmark.tsx can render its ring pulse
// in sync. See app/plan/location/globe/landmark.tsx for the listener.

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState, type RefObject } from 'react';
import { AuroraBackground } from './AuroraBackground';
import { TextShimmerWave } from './TextShimmer';

// Per-skin tier color. 'default' is the geknee primary purple — used when
// the base monument is unlocked (no specific skin yet).
const SKIN_TIER_COLOR: Record<string, string> = {
  default:   '#a78bfa',
  bronze:    '#cd7f32',
  silver:    '#cbd5e1',
  gold:      '#fbbf24',
  damascus:  '#7c3aed',
  diamond:   '#60e8ff',
  aurora:    '#34d399',
  celestial: '#818cf8',
  stone:     '#94a3b8',
};

export type UnlockTrigger = { mk: string; name: string; skin: string } | null;

interface UnlockCeremonyProps {
  trigger: UnlockTrigger;
  originRef?: RefObject<HTMLElement | null>;
}

type Phase = 'idle' | 'bloom' | 'reveal' | 'travel' | 'stamp';

export function UnlockCeremony({ trigger, originRef }: UnlockCeremonyProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const [activeTrigger, setActiveTrigger] = useState<UnlockTrigger>(null);

  useEffect(() => {
    if (!trigger) return;
    // Reading window + the unlock-button rect must happen client-side after
    // the trigger fires — we have to set state here. React 18 auto-batches
    // these three setStates, so the cascading-renders concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const rect = originRef?.current?.getBoundingClientRect();
    setOrigin(
      rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    );
    setActiveTrigger(trigger);
    setPhase('bloom');
    const timers = [
      setTimeout(() => setPhase('reveal'), 400),
      setTimeout(() => setPhase('travel'), 1800),
      setTimeout(() => {
        // Notify the globe that the orb has arrived — kicks the ring pulse.
        if (trigger) {
          window.dispatchEvent(
            new CustomEvent('geknee:monument-just-collected', {
              detail: { mk: trigger.mk, skin: trigger.skin },
            }),
          );
        }
        setPhase('stamp');
      }, 3000),
      setTimeout(() => setPhase('idle'), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [trigger, originRef]);

  if (phase === 'idle' || !activeTrigger || !viewport) return null;
  const color = SKIN_TIER_COLOR[activeTrigger.skin] ?? SKIN_TIER_COLOR.default;

  // Globe corner: bottom-right on landscape, just above the bottom edge on
  // narrow viewports (where the planner sheet lives).
  const globeCorner = {
    x: viewport.w > 720 ? viewport.w - 80 : viewport.w - 60,
    y: viewport.w > 720 ? viewport.h - 80 : viewport.h - 120,
  };
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {/* Stage 1 — ink bloom radiating from the tap point */}
      <AnimatePresence>
        {phase === 'bloom' && origin && (
          <motion.div
            key="bloom"
            initial={{ scale: 0, opacity: 0.95 }}
            animate={{ scale: 60, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              left: origin.x - 40,
              top: origin.y - 40,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${color}cc 0%, ${color}55 40%, transparent 70%)`,
              filter: 'blur(8px)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Stage 2 — centered reveal: aurora backdrop + foil text */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 14,
              padding: 24,
            }}
          >
            <AuroraBackground duration={4} opacity={0.5} />
            <div
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono-display, monospace)',
                letterSpacing: '0.22em',
                color: 'rgba(255,255,255,0.6)',
                textTransform: 'uppercase',
                position: 'relative',
                zIndex: 1,
              }}
            >
              Added to your passport
            </div>
            <div
              style={{
                fontSize: 'clamp(28px, 6vw, 44px)',
                fontFamily: 'var(--font-display, Georgia, serif)',
                color: '#fff',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                textShadow: `0 0 30px ${color}99, 0 0 60px ${color}44`,
                textAlign: 'center',
                position: 'relative',
                zIndex: 1,
                maxWidth: '88vw',
                lineHeight: 1.1,
              }}
            >
              <TextShimmerWave>{activeTrigger.name}</TextShimmerWave>
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono-display, monospace)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color,
                fontWeight: 600,
                position: 'relative',
                zIndex: 1,
              }}
            >
              · {activeTrigger.skin === 'default' ? 'COLLECTED' : `${activeTrigger.skin.toUpperCase()} SKIN`} ·
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stage 3 — orb travel along an SVG arc */}
      <AnimatePresence>
        {phase === 'travel' && (
          <>
            <motion.svg
              key="arc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              width="100%"
              height="100%"
              viewBox={`0 0 ${viewport.w} ${viewport.h}`}
            >
              <motion.path
                d={`M ${viewport.w / 2} ${viewport.h / 2} Q ${viewport.w * 0.82} ${viewport.h * 0.3} ${globeCorner.x} ${globeCorner.y}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="3 6"
                initial={{ pathLength: 0, opacity: 0.9 }}
                animate={{ pathLength: 1, opacity: 0 }}
                transition={{ duration: 1.0, ease: 'easeInOut' }}
              />
            </motion.svg>
            <motion.div
              key="orb"
              initial={{ x: viewport.w / 2 - 24, y: viewport.h / 2 - 24, scale: 1.4, opacity: 0 }}
              animate={{
                x: [viewport.w / 2 - 24, viewport.w * 0.82 - 24, globeCorner.x - 24],
                y: [viewport.h / 2 - 24, viewport.h * 0.3 - 24, globeCorner.y - 24],
                scale: [1.4, 1.0, 0.45],
                opacity: [0, 1, 1, 0.6],
              }}
              transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1] }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: `radial-gradient(circle at 30% 30%, #fff, ${color} 55%, ${color}88)`,
                boxShadow: `0 0 40px ${color}cc, 0 0 80px ${color}77, 0 0 120px ${color}33`,
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Stage 4 — JetBrains Mono ISSUE 001 stamp */}
      <AnimatePresence>
        {phase === 'stamp' && (
          <motion.div
            key="stamp"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45 }}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '10%',
              transform: 'translateX(-50%)',
              fontSize: 11,
              fontFamily: 'var(--font-mono-display, monospace)',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.75)',
              textAlign: 'center',
              padding: '6px 14px',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            + 1 &nbsp;·&nbsp; GEKNEE PASSPORT &nbsp;·&nbsp; ISSUE 001
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
