// geknee icon set — custom line-art glyphs tuned to the cosmic-editorial
// voice. Replaces generic Unicode emojis (🚶 🚕 🏛 etc.) across the app
// with a single coherent visual language.
//
// Two render layers:
//   1. Bare glyph — `<Walk />` etc. — 24×24, stroke 1.8, currentColor
//   2. Game-badge — `<IconBadge icon="walk" tier="gold" />` — wraps the
//      glyph in a hex shard with rarity-tinted ring + soft cosmic glow.
//      Use this on monument cards, quest unlocks, achievement chips.
//
// Design rules (per ui-design / ui-ux-pro-max):
//   - stroke-width 1.8 — game badges need a touch more weight than
//     pure UI chrome
//   - stroke-linecap / linejoin round
//   - Pure line art (no fills inside the glyph) — keeps mass low so
//     the icon reads on tinted hex backgrounds
//   - Hex frame for "game" feel — every modern adult-game UI (Apex,
//     Destiny, Monument Valley shards) leans on hex. Not bubbly,
//     not childish — confident geometric containment.
//   - Each glyph is one named export → consumers import { Walk } from '@/lib/icons'

import type { ReactElement, ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = ({ size = 16, ...rest }: IconProps) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  // v2: bumped 1.8 → 2.0 for trading-card weight. Tested at 14-64px.
  strokeWidth: 2.0,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...rest,
});

// v3 accent palette — gives each glyph a second-color "story" so the
// set reads as collectible game-art rather than monochrome line-art.
// Strokes still inherit currentColor (so parent context tints them);
// only specific accent paths use these hex values, baked in.
const C = {
  cyan:    '#7dd3fc', // motion, water, contrail, glass
  gold:    '#fbbf24', // prestige, lit windows, lit panels
  rose:    '#f87171', // affection, alarm, magnetic north
  lavender:'#a78bfa', // sparkle inner, generic accent
  emerald: '#34d399', // nature, ferry/eco hint
  amber:   '#f59e0b', // warm spotlights
} as const;

// Rarity → tint table. Mirrors the monument-collection skin tiers so a
// gold-tier unlock badge and a gold-skinned monument speak the same
// color language. Lavender (default) ties back to --brand-accent.
const TIER_TINT: Record<string, { ring: string; glow: string; ink: string }> = {
  default:   { ring: '#a78bfa', glow: 'rgba(167,139,250,0.30)', ink: '#f2f2f8' },
  bronze:    { ring: '#cd7f32', glow: 'rgba(205,127,50,0.28)',  ink: '#fdf3e6' },
  silver:    { ring: '#cbd5e1', glow: 'rgba(203,213,225,0.28)', ink: '#f8fafc' },
  gold:      { ring: '#fbbf24', glow: 'rgba(251,191,36,0.30)',  ink: '#fffbeb' },
  diamond:   { ring: '#60e8ff', glow: 'rgba(96,232,255,0.30)',  ink: '#ecfeff' },
  aurora:    { ring: '#34d399', glow: 'rgba(52,211,153,0.30)',  ink: '#ecfdf5' },
  celestial: { ring: '#818cf8', glow: 'rgba(129,140,248,0.32)', ink: '#eef2ff' },
};

interface IconBadgeProps {
  /** A glyph from this module — pass the component itself, not a string. */
  icon: (p: IconProps) => ReactElement;
  /** Rarity/skin tier — drives the ring + glow color. */
  tier?: keyof typeof TIER_TINT;
  /** Outer hex size in pixels. Default 44 — fits inline next to mono labels. */
  size?: number;
  /** Optional decorative children (e.g. number badge in the corner). */
  children?: ReactNode;
}

/**
 * Game-feel hex badge wrapper. Drop any icon component inside a faceted
 * hexagonal shard with a rarity-tinted ring + soft cosmic glow. Use this
 * for "trophy moments" — monument unlocks, quest completions, leaderboard
 * positions. NOT for inline UI chrome (use the bare glyph there).
 */
export function IconBadge({ icon: Icon, tier = 'default', size = 44, children }: IconBadgeProps) {
  const t = TIER_TINT[tier] ?? TIER_TINT.default;
  // Hex points for a 100-unit hex centered at 50,50 (pointy-top).
  const HEX = '50,4 92,28 92,76 50,100 8,76 8,28';
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size,
      }}
    >
      {/* Outer glow halo — bleeds past the hex edge for the cosmic feel. */}
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: -4, borderRadius: 12,
          background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`,
          filter: 'blur(6px)',
          pointerEvents: 'none',
        }}
      />
      {/* Hex frame. Two layers: subtle inner fill + crisp tier-tinted ring. */}
      <svg
        viewBox="0 0 100 100"
        width={size} height={size}
        style={{ position: 'relative' }}
      >
        <polygon points={HEX} fill="rgba(13,13,36,0.85)" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <polygon points={HEX} fill="none" stroke={t.ring} strokeWidth="2" strokeLinejoin="round" opacity="0.85" />
        {/* Inner orbit — three tiny constellation dots; reads as "cosmic"
            without going pictorial. Skip on small sizes (<32) so they
            don't crowd. */}
        {size >= 32 && (
          <>
            <circle cx="18" cy="18" r="1.2" fill={t.ring} opacity="0.5" />
            <circle cx="84" cy="22" r="0.9" fill={t.ring} opacity="0.4" />
            <circle cx="82" cy="80" r="1.1" fill={t.ring} opacity="0.45" />
          </>
        )}
      </svg>
      {/* Glyph — sized to ~55% of hex so it sits comfortably inside. */}
      <span
        style={{
          position: 'absolute',
          color: t.ink,
          display: 'inline-flex',
          pointerEvents: 'none',
        }}
      >
        <Icon size={Math.round(size * 0.5)} />
      </span>
      {children}
    </span>
  );
}

// ── Transit ───────────────────────────────────────────────────────────

/** Walking person — replaces 🚶 · cyan motion lines suggest stride */
export const Walk = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="13" cy="4.5" r="1.8" fill={C.gold} stroke={C.gold} />
    <path d="M11 8l-2 5 3 1 1 5" />
    <path d="M14 10l3 1-1 3" />
    <path d="M11 13l-3 3" />
    <path d="M3 11h2M2 14h3" stroke={C.cyan} opacity="0.9" />
  </svg>
);

/** Subway / metro — replaces 🚇 · lit windows + headlights in gold */
export const Subway = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="3" width="14" height="14" rx="2.5" />
    {/* lit window strip above the divider */}
    <rect x="6.5" y="5" width="11" height="3" rx="0.6" fill={C.gold} stroke="none" opacity="0.85" />
    <path d="M5 11h14" />
    <circle cx="9" cy="14" r="0.9" fill={C.gold} stroke="none" />
    <circle cx="15" cy="14" r="0.9" fill={C.gold} stroke="none" />
    <path d="M9 17l-2 4M15 17l2 4" />
  </svg>
);

/** Bus — replaces 🚌 · lit upper windows in gold, wheel hubs gold */
export const Bus = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 5h14v11a1 1 0 01-1 1H6a1 1 0 01-1-1V5z" />
    <rect x="6.5" y="6.5" width="11" height="3" rx="0.4" fill={C.gold} stroke="none" opacity="0.85" />
    <path d="M5 10h14" />
    <circle cx="9" cy="13.5" r="0.9" fill={C.gold} stroke="none" />
    <circle cx="15" cy="13.5" r="0.9" fill={C.gold} stroke="none" />
    <path d="M7 17v2M17 17v2" />
  </svg>
);

/** Taxi / car — replaces 🚕 · gold roof sign + gold headlights */
export const Taxi = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 14l1.5-4.5A2 2 0 016.4 8h11.2a2 2 0 011.9 1.5L21 14" />
    <rect x="3" y="14" width="18" height="4" rx="1" />
    <circle cx="7" cy="18" r="1.3" fill={C.gold} fillOpacity="0.18" />
    <circle cx="17" cy="18" r="1.3" fill={C.gold} fillOpacity="0.18" />
    <rect x="9" y="5.5" width="6" height="2.5" rx="0.4" fill={C.gold} stroke="none" />
    {/* tiny headlights */}
    <circle cx="4.6" cy="13" r="0.55" fill={C.gold} stroke="none" />
    <circle cx="19.4" cy="13" r="0.55" fill={C.gold} stroke="none" />
  </svg>
);

/** Train — replaces 🚂 · gold windshield + gold headlights */
export const Train = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="3" width="14" height="13" rx="3" />
    <rect x="6.5" y="5" width="11" height="3" rx="0.4" fill={C.gold} stroke="none" opacity="0.85" />
    <path d="M5 10h14" />
    <circle cx="9" cy="13" r="0.9" fill={C.gold} stroke="none" />
    <circle cx="15" cy="13" r="0.9" fill={C.gold} stroke="none" />
    <path d="M8 16l-2 5M16 16l2 5" />
    <path d="M9 6h6" />
  </svg>
);

/** Bike — replaces 🚴 · cyan motion marks + gold rider head */
export const Bike = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="16" r="3.5" />
    <circle cx="18" cy="16" r="3.5" />
    <path d="M6 16l4-7h5l3 7" stroke={C.cyan} />
    <circle cx="14" cy="6" r="1.3" fill={C.gold} stroke={C.gold} />
    <path d="M10 9l4-3" />
    <path d="M2 13h1.5M2.5 16h1" stroke={C.cyan} opacity="0.9" />
  </svg>
);

/** Ferry / boat — replaces ⛵ · cyan waves, gold sail */
export const Ferry = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 15c2 2 4 2 6 0s4-2 6 0 4 2 6 0" stroke={C.cyan} />
    <path d="M4 12l2-3h12l2 3" />
    <path d="M12 3v9" />
    <path d="M12 4l6 5" stroke={C.gold} fill={C.gold} fillOpacity="0.15" />
  </svg>
);

/** Flight / plane · cyan contrail trail behind */
export const Plane = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M21 12l-7 7-2-5-5-2 7-7 7 7z" fill={C.gold} fillOpacity="0.18" />
    <path d="M14 19l-1-4M5 12l4-1" />
    <path d="M2 4l3 1M2 7l4 1" stroke={C.cyan} opacity="0.9" />
  </svg>
);

// ── Locations + monuments ────────────────────────────────────────────

/** Map pin — replaces 📍 · rose dot pops on the lavender body */
export const Pin = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" fill={C.rose} fillOpacity="0.2" />
    <circle cx="12" cy="9" r="2.5" fill={C.rose} stroke={C.rose} />
  </svg>
);

/** Globe — replaces 🌍 / 🌐 · cyan meridians + gold orbit stars */
export const Globe = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" fill={C.cyan} fillOpacity="0.12" />
    <path d="M3.5 12h17" stroke={C.cyan} />
    <path d="M12 3.5c2.5 2.5 4 5.5 4 8.5s-1.5 6-4 8.5c-2.5-2.5-4-5.5-4-8.5s1.5-6 4-8.5z" stroke={C.cyan} />
    <circle cx="22" cy="4" r="1.0" fill={C.gold} stroke={C.gold} />
    <circle cx="2.5" cy="20" r="0.8" fill={C.gold} stroke={C.gold} opacity="0.85" />
  </svg>
);

/** Monument — claimable peak with a gold pennant flag on top */
export const Monument = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 1v3" stroke={C.gold} />
    <path d="M12 1l4 1.5-4 1.5" fill={C.gold} stroke={C.gold} />
    <path d="M3 9l9-5 9 5" />
    <path d="M4 9v9M20 9v9" />
    <path d="M8 11v7M12 11v7M16 11v7" />
    <path d="M3 20h18" stroke={C.gold} strokeWidth={2.6} />
  </svg>
);

/** Compass — rose needle points north, cyan dial ring */
export const Compass = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" stroke={C.cyan} />
    <path d="M15 9l-1.5 4.5L12 12z" fill={C.rose} stroke={C.rose} />
    <path d="M9 15l1.5-4.5L12 12z" fill="currentColor" />
    <circle cx="12" cy="12" r="0.8" fill={C.gold} stroke="none" />
  </svg>
);

/** Map (folded) · cyan fold lines + gold trail pin */
export const Map = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" fill={C.cyan} fillOpacity="0.1" />
    <path d="M9 4v16M15 6v16" stroke={C.cyan} />
    <circle cx="13" cy="10" r="1.1" fill={C.gold} stroke="none" />
  </svg>
);

// ── State + abstract ─────────────────────────────────────────────────

/** Four-point sparkle — geknee signature · gold heart, cyan diagonals */
export const Sparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <path d="M7 7l3.5 3.5M13.5 13.5L17 17M17 7l-3.5 3.5M10.5 13.5L7 17" stroke={C.cyan} opacity="0.95" />
    <circle cx="12" cy="12" r="1.6" fill={C.gold} stroke={C.gold} />
  </svg>
);

/** Lock — collection locked · rose keyhole reads as "blocked" */
export const Lock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2" fill={C.rose} fillOpacity="0.1" />
    <path d="M8 11V8a4 4 0 018 0v3" />
    <circle cx="12" cy="15.5" r="1.2" fill={C.rose} stroke={C.rose} />
  </svg>
);

/** Unlock — collected · gold core + gold celebration burst */
export const Unlock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2" fill={C.gold} fillOpacity="0.18" />
    <path d="M8 11V8a4 4 0 018 0" />
    <circle cx="12" cy="15.5" r="1.6" fill={C.gold} stroke={C.gold} />
    <path d="M22 3l1 1.5M2 6l1.5 1M20 9l2 .5" stroke={C.gold} opacity="0.9" />
  </svg>
);

/** Camera — replaces 📷 · cyan lens glint, gold flash dot */
export const Camera = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13.5" r="3.2" stroke={C.cyan} fill={C.cyan} fillOpacity="0.18" />
    <circle cx="12" cy="13.5" r="1.1" fill={C.gold} stroke="none" />
    <circle cx="18.5" cy="9.5" r="0.6" fill={C.gold} stroke="none" />
  </svg>
);

/** Paperclip — attach */
export const Paperclip = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m21 12-9.5 9.5a5.5 5.5 0 1 1-7.78-7.78L13.22 4.22a3.5 3.5 0 1 1 4.95 4.95L8.66 18.68a1.5 1.5 0 1 1-2.12-2.12L15.07 8" />
  </svg>
);

/** Bed / stays · cyan pillow + amber mattress strip */
export const Bed = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3 9v11M21 14v6" />
    <rect x="3" y="14" width="18" height="2.5" fill={C.amber} fillOpacity="0.25" stroke="none" />
    <path d="M3 14h18" />
    <path d="M3 9h11a4 4 0 014 4v1" />
    <circle cx="8" cy="11.5" r="1.5" fill={C.cyan} stroke={C.cyan} />
  </svg>
);

/** Fork & spoon — food/dining · gold spoon bowl reads as "warm meal" */
export const Dining = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 3v18M5 3v6a2 2 0 002 2 2 2 0 002-2V3" />
    <path d="M16 3a4 4 0 014 4v4h-2v10" fill={C.gold} fillOpacity="0.2" stroke={C.gold} />
  </svg>
);

/** Trophy — leaderboard / achievement · gold cup + rose victory burst */
export const Trophy = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 1v2M5 4l1 1.5M19 4l-1 1.5" stroke={C.rose} opacity="0.95" />
    <path d="M7 3h10v4a5 5 0 01-10 0V3z" fill={C.gold} fillOpacity="0.3" stroke={C.gold} />
    <path d="M5 5H3v2a3 3 0 003 3M19 5h2v2a3 3 0 01-3 3" stroke={C.gold} />
    <path d="M9 14h6l1 4H8z" fill={C.gold} stroke={C.gold} />
    <path d="M7 21h10" stroke={C.gold} strokeWidth={2.6} />
  </svg>
);

/** Heart — favorite · filled rose */
export const Heart = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z" fill={C.rose} stroke={C.rose} />
  </svg>
);

/** Calendar · cyan header bar + gold today dot */
export const Calendar = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <rect x="3.5" y="5" width="17" height="5" rx="2" fill={C.cyan} fillOpacity="0.25" stroke="none" />
    <path d="M3.5 10h17" />
    <path d="M8 3v4M16 3v4" />
    <circle cx="12" cy="15" r="1.3" fill={C.gold} stroke="none" />
  </svg>
);

// Ordered registry for the contact-sheet renderer. Each entry maps to
// the named export so the SVG sheet can be regenerated from this single
// source. Update when adding a new icon.
export const ICON_REGISTRY: Array<{ name: string; Cmp: (p: IconProps) => ReactElement; emoji?: string }> = [
  { name: 'Walk',      Cmp: Walk,      emoji: '🚶' },
  { name: 'Subway',    Cmp: Subway,    emoji: '🚇' },
  { name: 'Bus',       Cmp: Bus,       emoji: '🚌' },
  { name: 'Taxi',      Cmp: Taxi,      emoji: '🚕' },
  { name: 'Train',     Cmp: Train,     emoji: '🚂' },
  { name: 'Bike',      Cmp: Bike,      emoji: '🚴' },
  { name: 'Ferry',     Cmp: Ferry,     emoji: '⛵' },
  { name: 'Plane',     Cmp: Plane,     emoji: '✈️' },
  { name: 'Pin',       Cmp: Pin,       emoji: '📍' },
  { name: 'Globe',     Cmp: Globe,     emoji: '🌍' },
  { name: 'Monument',  Cmp: Monument,  emoji: '🏛️' },
  { name: 'Compass',   Cmp: Compass,   emoji: '🧭' },
  { name: 'Map',       Cmp: Map,       emoji: '🗺️' },
  { name: 'Sparkle',   Cmp: Sparkle,   emoji: '✨' },
  { name: 'Lock',      Cmp: Lock,      emoji: '🔒' },
  { name: 'Unlock',    Cmp: Unlock,    emoji: '🔓' },
  { name: 'Camera',    Cmp: Camera,    emoji: '📷' },
  { name: 'Paperclip', Cmp: Paperclip, emoji: '📎' },
  { name: 'Bed',       Cmp: Bed,       emoji: '🛏️' },
  { name: 'Dining',    Cmp: Dining,    emoji: '🍴' },
  { name: 'Trophy',    Cmp: Trophy,    emoji: '🏆' },
  { name: 'Heart',     Cmp: Heart,     emoji: '❤️' },
  { name: 'Calendar',  Cmp: Calendar,  emoji: '📅' },
];
