'use client';
// Aurora-borealis curtain — atmospheric flash that fires when a monument lands
// on the globe. Listens for the `geknee:monument-just-collected` window event
// (dispatched by UnlockCeremony at the end of orb travel) and animates a set
// of vertical ribbons with mix-blend-mode: screen for 2.5s, then unmounts.
//
// Pure CSS / Framer Motion — no GLSL shader, no WebGL context to fight the
// existing Three.js globe. The "borealis" look comes from 3 ribbons of
// linear-gradient color (green / teal / violet) each running their own slow
// sinusoidal warp + drift, layered behind the globe canvas.
//
// Skin tint: the ribbon palette is overridden when the unlock skin maps to a
// specific aurora-friendly hue (aurora / damascus / diamond / etc).

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const SKIN_PALETTE: Record<string, [string, string, string]> = {
  default:   ['#a78bfa', '#34d399', '#60e8ff'],
  bronze:    ['#cd7f32', '#fbbf24', '#f59e0b'],
  silver:    ['#cbd5e1', '#a8b5d8', '#e2e8f0'],
  gold:      ['#fbbf24', '#f59e0b', '#fde68a'],
  damascus:  ['#7c3aed', '#a78bfa', '#c084fc'],
  diamond:   ['#60e8ff', '#a5f3fc', '#67e8f9'],
  aurora:    ['#34d399', '#10b981', '#6ee7b7'],
  celestial: ['#818cf8', '#a78bfa', '#60a5fa'],
  stone:     ['#94a3b8', '#cbd5e1', '#64748b'],
};

interface CurtainState {
  id: number;
  palette: [string, string, string];
}

export function AuroraBorealis() {
  const [curtains, setCurtains] = useState<CurtainState[]>([]);

  useEffect(() => {
    let idCounter = 0;
    const onUnlock = (e: Event) => {
      const detail = (e as CustomEvent<{ skin?: string }>).detail;
      const skin = detail?.skin ?? 'default';
      const palette = SKIN_PALETTE[skin] ?? SKIN_PALETTE.default;
      const id = ++idCounter;
      setCurtains((prev) => [...prev, { id, palette }]);
      // Auto-remove after the curtain finishes its arc (matches inner timing).
      setTimeout(() => {
        setCurtains((prev) => prev.filter((c) => c.id !== id));
      }, 2800);
    };
    window.addEventListener('geknee:monument-just-collected', onUnlock as EventListener);
    return () => {
      window.removeEventListener('geknee:monument-just-collected', onUnlock as EventListener);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
        overflow: 'hidden',
        mixBlendMode: 'screen',
      }}
    >
      <AnimatePresence>
        {curtains.map((c) => (
          <Curtain key={c.id} palette={c.palette} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Curtain({ palette }: { palette: [string, string, string] }) {
  // Three vertical ribbons — each gets its own horizontal drift + scaleY warp
  // so the curtain "breathes" instead of moving as a rigid block.
  const ribbons = [
    { color: palette[0], delay: 0,    x: ['-12vw', '8vw',  '-4vw'] },
    { color: palette[1], delay: 0.15, x: ['18vw',  '-6vw', '12vw'] },
    { color: palette[2], delay: 0.3,  x: ['-4vw',  '14vw', '0vw'] },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2.6, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      {ribbons.map((r, i) => (
        <motion.div
          key={i}
          initial={{ x: r.x[0], scaleY: 0.6, opacity: 0 }}
          animate={{
            x: r.x,
            scaleY: [0.6, 1.0, 0.85],
            opacity: [0, 0.9, 0.7],
          }}
          transition={{
            duration: 2.4,
            delay: r.delay,
            ease: 'easeInOut',
            times: [0, 0.4, 1],
          }}
          style={{
            position: 'absolute',
            top: '-10%',
            left: `${10 + i * 28}%`,
            width: '38%',
            height: '120%',
            transformOrigin: 'center top',
            background: `linear-gradient(180deg, transparent 0%, ${r.color}cc 30%, ${r.color}88 55%, ${r.color}33 80%, transparent 100%)`,
            filter: 'blur(36px)',
            borderRadius: '50%',
            mixBlendMode: 'screen',
          }}
        />
      ))}
      {/* A single faint full-screen wash that ties the ribbons together — gives
          the moment a "sky lit up" feel rather than discrete ribbons. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.25, 0] }}
        transition={{ duration: 2.4, ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 30%, ${palette[0]}55, transparent 70%)`,
          mixBlendMode: 'screen',
        }}
      />
    </motion.div>
  );
}
