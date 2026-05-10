'use client';
// CTA with a sweeping diagonal shimmer overlay. The shimmer keeps moving
// even when the button is at rest, signaling "tap me, something happens."
// Press / hover micro-interactions via framer's whileTap / whileHover.
// Adapted from MagicUI / 21st.dev "Shimmer Button".

import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';

interface ShimmerButtonProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  background?: string;
  shimmerColor?: string;
  shimmerSpeed?: number;
  style?: CSSProperties;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function ShimmerButton({
  children,
  onClick,
  disabled = false,
  background = 'linear-gradient(135deg,#7c3aed,#a855f7)',
  shimmerColor = '#fff',
  shimmerSpeed = 2.4,
  style,
  className,
  type = 'button',
}: ShimmerButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.04 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className={className}
      style={{
        position: 'relative',
        padding: '8px 14px',
        borderRadius: 10,
        border: 'none',
        background,
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'wait' : 'pointer',
        overflow: 'hidden',
        boxShadow: disabled
          ? 'none'
          : '0 4px 20px rgba(124, 58, 237, 0.4), 0 0 0 1px rgba(255,255,255,0.1) inset',
        ...style,
      }}
    >
      <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
      {!disabled && (
        <motion.span
          aria-hidden
          animate={{ x: ['-120%', '220%'] }}
          transition={{
            duration: shimmerSpeed,
            ease: 'linear',
            repeat: Infinity,
            repeatDelay: 0.6,
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '70%',
            background: `linear-gradient(110deg, transparent 30%, ${shimmerColor}66 50%, transparent 70%)`,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
    </motion.button>
  );
}
