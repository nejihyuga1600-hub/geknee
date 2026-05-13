'use client';

// Sticky pill nav for the landing "How it works" section.
// Borrowed shape from polarsteps' PLAN / TRACK / RELIVE bottom-of-phone pill.
// Geknee adaptation: ink-tinted pill that sticks to the top of the section
// while the user scrolls through the 3 steps, with the active step highlighted
// in lavender. Active-step detection via IntersectionObserver — no scroll-position
// math, no layout thrash.

import { useEffect, useRef, useState } from 'react';

const ACCENT = '#a78bfa';

interface StepPillNavProps {
  steps: Array<{ id: string; n: string; label: string }>;
}

export default function StepPillNav({ steps }: StepPillNavProps) {
  const [active, setActive] = useState(steps[0]?.id ?? '');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Target the upper third of the viewport so a step "activates" as it
    // crosses into the top half — feels right when scrolling top-to-bottom.
    const opts: IntersectionObserverInit = { rootMargin: '-30% 0px -55% 0px', threshold: 0 };
    const onIntersect: IntersectionObserverCallback = (entries) => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    };
    const obs = new IntersectionObserver(onIntersect, opts);
    observerRef.current = obs;
    steps.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [steps]);

  return (
    <div style={{
      position: 'sticky',
      top: 16,
      zIndex: 6,
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 24,
      pointerEvents: 'none',
    }}>
      <nav
        aria-label="How it works steps"
        style={{
          pointerEvents: 'auto',
          display: 'inline-flex',
          gap: 4,
          padding: 4,
          background: 'rgba(10,10,31,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        {steps.map(s => {
          const isActive = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 999,
                fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: isActive ? '#0a0a1f' : 'rgba(245,241,232,0.7)',
                background: isActive ? ACCENT : 'transparent',
                textDecoration: 'none',
                transition: 'background 180ms ease, color 180ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                fontSize: 10, opacity: 0.7,
              }}>{s.n}</span>
              <span>{s.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
