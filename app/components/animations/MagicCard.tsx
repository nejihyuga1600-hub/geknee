'use client';
// Spotlight-on-cursor card wrapper. Idle state for locked monument cards —
// the pointer drags a radial highlight across the card surface, like light
// catching foil on a passport page. Adapted from MagicUI / 21st.dev "Magic Card".
//
// Why we built it instead of installing: 21st.dev components are designed to be
// copied in — they're not npm packages. This is the canonical pattern, ~60 lines.

import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { useRef, type CSSProperties, type ReactNode } from 'react';

interface MagicCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
}

export function MagicCard({
  children,
  className,
  style,
  gradientSize = 220,
  gradientColor = '#A855F7',
  gradientOpacity = 0.45,
}: MagicCardProps) {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);
  const ref = useRef<HTMLDivElement>(null);

  const background = useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 70%)`;

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        mouseX.set(e.clientX - rect.left);
        mouseY.set(e.clientY - rect.top);
      }}
      onMouseLeave={() => {
        mouseX.set(-gradientSize);
        mouseY.set(-gradientSize);
      }}
    >
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          borderRadius: 'inherit',
          opacity: gradientOpacity,
          background,
          transition: 'opacity 200ms',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
