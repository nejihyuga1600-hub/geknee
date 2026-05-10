'use client';
// Slow color-drift gradient backdrop. Used briefly behind the unlock ceremony
// reveal — matches the "aurora" rarity tier visually, so the animation language
// rhymes with the rarity system. Adapted from Aceternity UI's Aurora Background.

import { motion } from 'framer-motion';

interface AuroraBackgroundProps {
  duration?: number;
  opacity?: number;
  className?: string;
}

export function AuroraBackground({
  duration = 8,
  opacity = 0.45,
  className,
}: AuroraBackgroundProps) {
  return (
    <motion.div
      aria-hidden
      className={className}
      animate={{
        backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
      }}
      transition={{
        duration,
        ease: 'easeInOut',
        repeat: Infinity,
      }}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: [
          'radial-gradient(at 20% 30%, #7c3aedaa 0px, transparent 50%)',
          'radial-gradient(at 80% 70%, #34d39988 0px, transparent 50%)',
          'radial-gradient(at 50% 50%, #f59e0b66 0px, transparent 50%)',
          'radial-gradient(at 30% 80%, #60e8ff88 0px, transparent 50%)',
        ].join(', '),
        backgroundSize: '200% 200%',
        filter: 'blur(48px)',
        opacity,
      }}
    />
  );
}
