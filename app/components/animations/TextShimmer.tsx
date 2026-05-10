'use client';
// Silver-foil wave shimmer over text. Each letter cycles opacity + y-offset
// with a staggered phase, like reading raised-foil letterpress under angled
// light. Adapted from ibelick / motion-primitives "Text Shimmer Wave".

import { motion } from 'framer-motion';

interface TextShimmerWaveProps {
  children: string;
  duration?: number;
  spread?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TextShimmerWave({
  children,
  duration = 2.2,
  spread = 1.8,
  className,
  style,
}: TextShimmerWaveProps) {
  const letters = children.split('');
  return (
    <span
      className={className}
      style={{ display: 'inline-block', ...style }}
      aria-label={children}
    >
      {letters.map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          aria-hidden
          animate={{
            opacity: [0.45, 1, 0.45],
            y: [0, -2, 0],
            filter: [
              'brightness(0.8)',
              'brightness(1.4) drop-shadow(0 0 8px rgba(255,255,255,0.5))',
              'brightness(0.8)',
            ],
          }}
          transition={{
            duration,
            ease: 'easeInOut',
            repeat: Infinity,
            delay: (i / Math.max(letters.length - 1, 1)) * spread,
          }}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {char === ' ' ? ' ' : char}
        </motion.span>
      ))}
    </span>
  );
}
