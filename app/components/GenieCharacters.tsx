'use client';

import React from 'react';

export interface GenieCharacter {
  id: string;
  name: string;
  title: string;
  colors: { primary: string; glow: string; accent: string };
}

export const GENIES: GenieCharacter[] = [
  { id: 'lumina',  name: 'Lumina',  title: 'Star Wanderer',   colors: { primary: '#c084fc', glow: 'rgba(192,132,252,0.6)', accent: '#f0abfc' } },
  { id: 'cosmo',   name: 'Cosmo',   title: 'Galaxy Keeper',   colors: { primary: '#818cf8', glow: 'rgba(129,140,248,0.6)', accent: '#a5b4fc' } },
  { id: 'nova',    name: 'Nova',    title: 'Supernova Spirit', colors: { primary: '#f472b6', glow: 'rgba(244,114,182,0.6)', accent: '#fbcfe8' } },
  { id: 'nebula',  name: 'Nebula',  title: 'Void Dancer',     colors: { primary: '#7c3aed', glow: 'rgba(124,58,237,0.6)', accent: '#a78bfa' } },
  { id: 'aurora',  name: 'Aurora',  title: 'Cosmic Drifter',  colors: { primary: '#22d3ee', glow: 'rgba(34,211,238,0.6)', accent: '#67e8f9' } },
  { id: 'stella',  name: 'Stella',  title: 'Stardust Queen',  colors: { primary: '#fb923c', glow: 'rgba(251,146,60,0.6)',  accent: '#fed7aa' } },
];

// ── Lumina — Star Wanderer ────────────────────────────────────────────────────
function Lumina({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="lbody" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f9d4ff" />
          <stop offset="55%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#7e22ce" />
        </radialGradient>
        <radialGradient id="lglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lpoint" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id="lcrown" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="50" cy="68" r="42" fill="url(#lglow)" />

      {/* 6 star ray spikes */}
      {[0,60,120,180,240,300].map((deg, i) => {
        const rad = (Math.PI * deg) / 180;
        const cx = 50 + 33 * Math.cos(rad);
        const cy = 68 + 33 * Math.sin(rad);
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="4" ry="11"
            fill="url(#lpoint)" opacity="0.88"
            transform={`rotate(${deg}, ${cx}, ${cy})`} />
        );
      })}

      {/* Body */}
      <circle cx="50" cy="68" r="24" fill="url(#lbody)" />

      {/* Body inner highlight */}
      <ellipse cx="43" cy="60" rx="9" ry="6" fill="rgba(255,255,255,0.25)" />

      {/* Crown */}
      <path d="M34 44 L37 34 L42 40 L50 28 L58 40 L63 34 L66 44 Z"
        fill="url(#lcrown)" opacity="0.95" />
      <circle cx="37" cy="33" r="2.5" fill="#fde68a" />
      <circle cx="50" cy="28" r="3.5" fill="#fff" opacity="0.95" />
      <circle cx="63" cy="33" r="2.5" fill="#fde68a" />

      {/* Crown base line */}
      <rect x="33" y="43" width="34" height="5" rx="2.5" fill="#a855f7" opacity="0.7" />

      {/* Eyes */}
      <ellipse cx="40" cy="67" rx="6" ry="7" fill="#fff" />
      <ellipse cx="60" cy="67" rx="6" ry="7" fill="#fff" />
      <circle cx="41.5" cy="68.5" r="4" fill="#1e1b4b" />
      <circle cx="61.5" cy="68.5" r="4" fill="#1e1b4b" />
      {/* Star sparkle in eye */}
      <circle cx="43" cy="66.5" r="1.5" fill="#fff" />
      <circle cx="63" cy="66.5" r="1.5" fill="#fff" />
      <circle cx="40.5" cy="70" r="0.8" fill="#c084fc" opacity="0.9" />
      <circle cx="60.5" cy="70" r="0.8" fill="#c084fc" opacity="0.9" />

      {/* Smile */}
      <path d="M41 78 Q50 86 59 78" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />

      {/* Rosy cheeks */}
      <ellipse cx="30" cy="74" rx="5.5" ry="3.5" fill="#e879f9" opacity="0.35" />
      <ellipse cx="70" cy="74" rx="5.5" ry="3.5" fill="#e879f9" opacity="0.35" />

      {/* Floating sparkles */}
      <circle cx="18" cy="40" r="2" fill="#f0abfc" opacity="0.9" />
      <circle cx="82" cy="38" r="1.5" fill="#fff" opacity="0.8" />
      <circle cx="84" cy="80" r="2" fill="#f0abfc" opacity="0.7" />
      <circle cx="16" cy="82" r="1.5" fill="#fff" opacity="0.6" />
      <text x="10" y="60" fontSize="8" fill="#f0abfc" opacity="0.8">&#10022;</text>
      <text x="78" y="62" fontSize="6" fill="#fff" opacity="0.7">&#10022;</text>
    </svg>
  );
}

// ── Cosmo — Galaxy Keeper ─────────────────────────────────────────────────────
function Cosmo({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cbody" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#c7d2fe" />
          <stop offset="50%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#3730a3" />
        </radialGradient>
        <radialGradient id="cglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="corb" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#6366f1" />
        </radialGradient>
        <linearGradient id="cring" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0" />
          <stop offset="30%" stopColor="#a5b4fc" stopOpacity="0.8" />
          <stop offset="70%" stopColor="#a5b4fc" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="50" cy="68" r="42" fill="url(#cglow)" />

      {/* Orbit ring (behind body) */}
      <ellipse cx="50" cy="68" rx="44" ry="13" stroke="url(#cring)" strokeWidth="2"
        strokeDasharray="6 3" fill="none" opacity="0.7" transform="rotate(-15 50 68)" />

      {/* Body */}
      <ellipse cx="50" cy="70" rx="26" ry="24" fill="url(#cbody)" />

      {/* Galaxy swirl pattern on body */}
      <path d="M50 58 Q62 62 58 70 Q54 78 44 76 Q34 74 38 64 Q41 56 50 58"
        stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M50 58 Q44 68 52 72" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* Body inner highlight */}
      <ellipse cx="43" cy="62" rx="9" ry="6" fill="rgba(255,255,255,0.22)" />

      {/* Antenna stem */}
      <line x1="50" y1="47" x2="50" y2="30" stroke="#a5b4fc" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="50" y1="30" x2="58" y2="22" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" />

      {/* Antenna orb */}
      <circle cx="58" cy="20" r="7" fill="url(#corb)" />
      <circle cx="58" cy="20" r="4.5" fill="url(#corb)" opacity="0.9" />
      <circle cx="56" cy="18" r="2" fill="rgba(255,255,255,0.6)" />
      {/* Orb glow ring */}
      <circle cx="58" cy="20" r="9" stroke="#a5b4fc" strokeWidth="1" fill="none" opacity="0.5" />

      {/* Eyes — cool/analytical */}
      <ellipse cx="40" cy="68" rx="5.5" ry="6" fill="#fff" />
      <ellipse cx="60" cy="68" rx="5.5" ry="6" fill="#fff" />
      <circle cx="41" cy="69" r="3.8" fill="#1e3a8a" />
      <circle cx="61" cy="69" r="3.8" fill="#1e3a8a" />
      <circle cx="42.5" cy="67.5" r="1.5" fill="#fff" />
      <circle cx="62.5" cy="67.5" r="1.5" fill="#fff" />
      {/* Angular eyebrow hint */}
      <path d="M35 61 L45 59" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <path d="M55 59 L65 61" stroke="#a5b4fc" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />

      {/* Confident smirk */}
      <path d="M42 78 Q50 83 58 78" stroke="#e0e7ff" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* Small satellite / planet detail */}
      <circle cx="22" cy="58" r="5" fill="#6366f1" opacity="0.7" />
      <ellipse cx="22" cy="58" rx="9" ry="3" stroke="#a5b4fc" strokeWidth="1.5" fill="none" opacity="0.7" transform="rotate(-20 22 58)" />

      {/* Stars */}
      <circle cx="80" cy="45" r="1.5" fill="#a5b4fc" opacity="0.9" />
      <circle cx="85" cy="80" r="1" fill="#fff" opacity="0.7" />
      <circle cx="14" cy="85" r="1.5" fill="#a5b4fc" opacity="0.8" />
    </svg>
  );
}

// ── Nova — Supernova Spirit ───────────────────────────────────────────────────
function Nova({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="nbody" cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#fce7f3" />
          <stop offset="50%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#be185d" />
        </radialGradient>
        <radialGradient id="nglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f472b6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nspike" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbcfe8" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="50" cy="70" r="44" fill="url(#nglow)" />

      {/* Energy burst spikes (8 directions) */}
      {[22,67,112,157,202,247,292,337].map((deg, i) => {
        const rad = (Math.PI * deg) / 180;
        const cx = 50 + 36 * Math.cos(rad);
        const cy = 70 + 36 * Math.sin(rad);
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="3" ry="10"
            fill="url(#nspike)" opacity={i % 2 === 0 ? 0.9 : 0.65}
            transform={`rotate(${deg}, ${cx}, ${cy})`} />
        );
      })}

      {/* Cloud puff body — 3 bumps + main oval */}
      <ellipse cx="50" cy="72" rx="24" ry="22" fill="url(#nbody)" />
      <ellipse cx="34" cy="59" rx="14" ry="12" fill="url(#nbody)" />
      <ellipse cx="66" cy="59" rx="14" ry="12" fill="url(#nbody)" />
      {/* Fill the gap between bumps */}
      <rect x="30" y="53" width="40" height="22" rx="4" fill="#f472b6" />

      {/* Body highlight */}
      <ellipse cx="42" cy="59" rx="9" ry="6" fill="rgba(255,255,255,0.28)" />
      <ellipse cx="34" cy="55" rx="5" ry="3.5" fill="rgba(255,255,255,0.2)" />
      <ellipse cx="66" cy="55" rx="5" ry="3.5" fill="rgba(255,255,255,0.15)" />

      {/* Eyes — big and cute */}
      <circle cx="40" cy="67" r="8" fill="#fff" />
      <circle cx="60" cy="67" r="8" fill="#fff" />
      <circle cx="41" cy="68" r="5.5" fill="#831843" />
      <circle cx="61" cy="68" r="5.5" fill="#831843" />
      {/* Heart in eye */}
      <path d="M38.5 66 Q40 64.5 41.5 66 Q43 64.5 44.5 66 Q44.5 68 41.5 70.5 Q38.5 68 38.5 66Z"
        fill="#f472b6" opacity="0.7" />
      <path d="M58.5 66 Q60 64.5 61.5 66 Q63 64.5 64.5 66 Q64.5 68 61.5 70.5 Q58.5 68 58.5 66Z"
        fill="#f472b6" opacity="0.7" />
      <circle cx="43" cy="65" r="2" fill="#fff" />
      <circle cx="63" cy="65" r="2" fill="#fff" />

      {/* Blush */}
      <ellipse cx="28" cy="76" rx="6" ry="4" fill="#fda4af" opacity="0.5" />
      <ellipse cx="72" cy="76" rx="6" ry="4" fill="#fda4af" opacity="0.5" />

      {/* Excited smile */}
      <path d="M40 82 Q50 92 60 82" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <ellipse cx="50" cy="87" rx="4" ry="2.5" fill="#fff" opacity="0.4" />

      {/* Star particles */}
      <circle cx="15" cy="48" r="2.5" fill="#fbcfe8" opacity="0.9" />
      <circle cx="85" cy="44" r="2" fill="#fff" opacity="0.8" />
      <circle cx="88" cy="90" r="2" fill="#fbcfe8" opacity="0.7" />
      <text x="8" y="72" fontSize="9" fill="#fbcfe8" opacity="0.8">&#10022;</text>
      <text x="84" y="72" fontSize="7" fill="#fff" opacity="0.7">&#10022;</text>
    </svg>
  );
}

// ── Nebula — Void Dancer ──────────────────────────────────────────────────────
function Nebula({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nebBody" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="40%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>
        <radialGradient id="nebGlow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nebEye" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#7c3aed" />
        </radialGradient>
        <linearGradient id="nebWisp" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="nebWispR" x1="100%" y1="50%" x2="0%" y2="50%">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Deep void glow */}
      <circle cx="50" cy="64" r="44" fill="url(#nebGlow)" />

      {/* Shadow wisps flowing left */}
      <path d="M28 62 Q10 50 8 30 Q18 42 24 60" fill="url(#nebWisp)" opacity="0.7" />
      <path d="M26 70 Q6 65 4 85 Q16 74 26 72" fill="url(#nebWisp)" opacity="0.5" />

      {/* Shadow wisps flowing right */}
      <path d="M72 62 Q90 50 92 30 Q82 42 76 60" fill="url(#nebWispR)" opacity="0.7" />
      <path d="M74 70 Q94 65 96 85 Q84 74 74 72" fill="url(#nebWispR)" opacity="0.5" />

      {/* Crystal facet lines behind body */}
      <path d="M50 22 L78 60 L50 98 L22 60 Z" fill="url(#nebBody)" opacity="0.25" />

      {/* Main diamond body */}
      <path d="M50 26 L76 62 L50 96 L24 62 Z" fill="url(#nebBody)" />

      {/* Facet highlights */}
      <path d="M50 26 L76 62 L50 62 Z" fill="rgba(255,255,255,0.12)" />
      <path d="M50 26 L24 62 L50 62 Z" fill="rgba(255,255,255,0.06)" />
      {/* Inner gem shimmer */}
      <path d="M50 38 L64 62 L50 74 L36 62 Z" fill="rgba(167,139,250,0.25)" />
      <path d="M50 38 L64 62 L50 58 Z" fill="rgba(255,255,255,0.12)" />

      {/* Glowing slit eyes */}
      <ellipse cx="40" cy="60" rx="7" ry="4" fill="url(#nebEye)" />
      <ellipse cx="60" cy="60" rx="7" ry="4" fill="url(#nebEye)" />
      <ellipse cx="40" cy="60" rx="4" ry="2" fill="#fff" opacity="0.9" />
      <ellipse cx="60" cy="60" rx="4" ry="2" fill="#fff" opacity="0.9" />
      {/* Eye inner glow */}
      <ellipse cx="40" cy="60" rx="9" ry="5.5" fill="#a78bfa" opacity="0.2" />
      <ellipse cx="60" cy="60" rx="9" ry="5.5" fill="#a78bfa" opacity="0.2" />

      {/* Mysterious smirk */}
      <path d="M43 76 Q52 82 58 74" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.9" />

      {/* Crystal sparkles */}
      <text x="10" y="38" fontSize="10" fill="#a78bfa" opacity="0.85">&#10022;</text>
      <text x="80" y="34" fontSize="8" fill="#c4b5fd" opacity="0.75">&#10022;</text>
      <text x="46" y="16" fontSize="7" fill="#fff" opacity="0.6">&#10022;</text>
      <circle cx="85" cy="88" r="2" fill="#a78bfa" opacity="0.7" />
      <circle cx="14" cy="90" r="1.5" fill="#7c3aed" opacity="0.8" />
    </svg>
  );
}

// ── Aurora — Cosmic Drifter ───────────────────────────────────────────────────
function Aurora({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="aDome" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0e7490" />
        </radialGradient>
        <radialGradient id="aGlow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aTentL" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aTentA" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="50" cy="52" r="44" fill="url(#aGlow)" />

      {/* Tentacles (behind body) */}
      <path d="M30 65 Q24 80 28 95 Q32 82 36 68" fill="url(#aTentL)" opacity="0.8" />
      <path d="M38 68 Q33 82 36 98 Q40 84 42 70" fill="url(#aTentA)" opacity="0.7" />
      <path d="M50 70 Q50 85 50 100 Q53 86 54 72" fill="url(#aTentL)" opacity="0.8" />
      <path d="M62 68 Q67 82 64 98 Q60 84 58 70" fill="url(#aTentA)" opacity="0.7" />
      <path d="M70 65 Q76 80 72 95 Q68 82 64 68" fill="url(#aTentL)" opacity="0.8" />

      {/* Dome body */}
      <ellipse cx="50" cy="52" rx="28" ry="24" fill="url(#aDome)" />

      {/* Dome glassy highlights */}
      <ellipse cx="50" cy="36" rx="28" ry="10" fill="#cffafe" opacity="0.3" />
      <ellipse cx="40" cy="42" rx="10" ry="7" fill="rgba(255,255,255,0.28)" />
      {/* Small internal dots */}
      <circle cx="38" cy="34" r="2.5" fill="#fff" opacity="0.3" />
      <circle cx="52" cy="30" r="2" fill="#fff" opacity="0.22" />
      <circle cx="63" cy="36" r="1.5" fill="#fff" opacity="0.18" />

      {/* Eyes — wide with wonder */}
      <circle cx="39" cy="52" r="8" fill="#fff" />
      <circle cx="61" cy="52" r="8" fill="#fff" />
      <circle cx="40" cy="53" r="5.5" fill="#0e7490" />
      <circle cx="62" cy="53" r="5.5" fill="#0e7490" />
      <circle cx="41.5" cy="51" r="2.5" fill="#fff" />
      <circle cx="63.5" cy="51" r="2.5" fill="#fff" />
      {/* Tiny inner shimmer */}
      <circle cx="39" cy="55.5" r="1" fill="#67e8f9" opacity="0.8" />
      <circle cx="61" cy="55.5" r="1" fill="#67e8f9" opacity="0.8" />

      {/* Open O mouth (wonder) */}
      <ellipse cx="50" cy="64" rx="5" ry="4" fill="#fff" opacity="0.95" />
      <ellipse cx="50" cy="65" rx="3" ry="2.5" fill="#0891b2" opacity="0.5" />

      {/* Bioluminescent glow dots on body rim */}
      <circle cx="22" cy="54" r="2" fill="#67e8f9" opacity="0.7" />
      <circle cx="78" cy="52" r="2" fill="#67e8f9" opacity="0.7" />
      <circle cx="30" cy="66" r="1.5" fill="#cffafe" opacity="0.6" />
      <circle cx="70" cy="66" r="1.5" fill="#cffafe" opacity="0.6" />

      {/* Floating bubbles */}
      <circle cx="12" cy="40" r="4" stroke="#67e8f9" strokeWidth="1.2" fill="rgba(103,232,249,0.12)" opacity="0.8" />
      <circle cx="88" cy="44" r="3" stroke="#67e8f9" strokeWidth="1" fill="rgba(103,232,249,0.1)" opacity="0.7" />
      <circle cx="84" cy="28" r="2" stroke="#67e8f9" strokeWidth="1" fill="none" opacity="0.6" />
    </svg>
  );
}

// ── Stella — Stardust Queen ───────────────────────────────────────────────────
function Stella({ size }: { size: number; colors: GenieCharacter['colors'] }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="stBody" cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#fff7ed" />
          <stop offset="45%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <radialGradient id="stGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="stPoint" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
        <linearGradient id="stDust" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#fed7aa" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fed7aa" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="stCrown" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="50" cy="68" r="42" fill="url(#stGlow)" />

      {/* Stardust trail flowing left */}
      <ellipse cx="14" cy="58" rx="12" ry="5" fill="url(#stDust)" opacity="0.7" transform="rotate(-20 14 58)" />
      <circle cx="8" cy="52" r="2" fill="#fed7aa" opacity="0.7" />
      <circle cx="16" cy="47" r="1.5" fill="#fed7aa" opacity="0.6" />
      <circle cx="10" cy="66" r="1" fill="#fff" opacity="0.5" />

      {/* 8-point star rays */}
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const rad = (Math.PI * deg) / 180;
        const cx = 50 + 34 * Math.cos(rad);
        const cy = 68 + 34 * Math.sin(rad);
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="3.5" ry="10"
            fill="url(#stPoint)" opacity={i % 2 === 0 ? 0.92 : 0.72}
            transform={`rotate(${deg}, ${cx}, ${cy})`} />
        );
      })}

      {/* Body */}
      <circle cx="50" cy="68" r="22" fill="url(#stBody)" />

      {/* Inner ring glow */}
      <circle cx="50" cy="68" r="16" fill="#fed7aa" opacity="0.2" />

      {/* Body highlight */}
      <ellipse cx="43" cy="60" rx="9" ry="6" fill="rgba(255,255,255,0.28)" />

      {/* Crown */}
      <path d="M36 46 L39 38 L44 43 L50 34 L56 43 L61 38 L64 46"
        fill="none" stroke="url(#stCrown)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="39" cy="38" r="2.5" fill="#fde68a" />
      <circle cx="50" cy="34" r="3.5" fill="#fff" opacity="0.95" />
      <circle cx="61" cy="38" r="2.5" fill="#fde68a" />
      <rect x="35" y="44.5" width="30" height="4" rx="2" fill="#d97706" opacity="0.7" />

      {/* Eyes — confident sparkle diamond shape */}
      <path d="M31 66 L39 62 L47 66 L39 70 Z" fill="#fff" opacity="0.95" />
      <path d="M53 66 L61 62 L69 66 L61 70 Z" fill="#fff" opacity="0.95" />
      <circle cx="39" cy="66" r="3.5" fill="#7c2d12" />
      <circle cx="61" cy="66" r="3.5" fill="#7c2d12" />
      <circle cx="40.5" cy="64.5" r="1.5" fill="#fff" />
      <circle cx="62.5" cy="64.5" r="1.5" fill="#fff" />

      {/* Wide grin */}
      <path d="M37 78 Q50 90 63 78" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Rosy cheeks */}
      <ellipse cx="29" cy="74" rx="5" ry="3.5" fill="#fdba74" opacity="0.45" />
      <ellipse cx="71" cy="74" rx="5" ry="3.5" fill="#fdba74" opacity="0.45" />

      {/* Floating sparkles */}
      <text x="78" y="44" fontSize="10" fill="#fed7aa" opacity="0.9">&#10022;</text>
      <text x="84" y="62" fontSize="7" fill="#fff" opacity="0.7">&#10022;</text>
      <text x="80" y="80" fontSize="8" fill="#fed7aa" opacity="0.6">&#10022;</text>
    </svg>
  );
}

// ── Avatar map ────────────────────────────────────────────────────────────────

const GENIE_SVG_MAP: Record<string, (props: { size: number; colors: GenieCharacter['colors'] }) => React.JSX.Element> = {
  lumina: Lumina,
  cosmo:  Cosmo,
  nova:   Nova,
  nebula: Nebula,
  aurora: Aurora,
  stella: Stella,
};

// Approved geknee help-bot mascot. Single canonical avatar — the per-id
// SVG variants (Lumina, Cosmo, etc.) are kept around for future "skin"
// rebuilds but are no longer rendered. All call sites now resolve to the
// same purple-genie crayon mark.
export function GenieAvatar({ id, size = 80 }: { id: string; size?: number }) {
  void id; // retained for API compatibility
  return (
    <img
      src="/brand/geknee-mascot.jpg"
      alt="geknee mascot"
      width={size}
      height={size}
      style={{
        width: size, height: size,
        objectFit: 'contain',
        display: 'block',
      }}
    />
  );
}
