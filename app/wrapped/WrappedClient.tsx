'use client';
// Spotify-Wrapped-style paged cinematic for the user's collection year.
// Five cards, swipe / tap to advance, share CTA at the end.
//
// Cards:
//   1. Hero  — animated COBE globe with all collected points + tagline
//   2. Total — N monuments unlocked this year, big number
//   3. Top country — the country they spent the most monument-collecting in
//   4. Rarest — their most prestigious monument unlock
//   5. Share — capture-able stat card with native Web Share API CTA

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { AuroraBackground } from '@/app/components/animations/AuroraBackground';
import { TextShimmerWave } from '@/app/components/animations/TextShimmer';
import { ShimmerButton } from '@/app/components/animations/ShimmerButton';
import { Globe as ShadcnGlobe } from '@/components/ui/cobe-globe';
import { Sparkle } from '@/lib/icons';

interface TimelineEntry {
  mk: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  skin: string;
  rarity: string;
  collectedAt: string;
}

interface WrappedClientProps {
  year: number;
  userName: string;
  timeline: TimelineEntry[];
  stats: {
    total: number;
    countryCount: number;
    topCountry: { country: string; count: number } | null;
    rarest: TimelineEntry | null;
  };
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  width: '100%',
  background: '#0a0a1f',
  color: '#fff',
  overflow: 'hidden',
  fontFamily: 'var(--font-ui, system-ui, sans-serif)',
};

const cardStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 28,
  textAlign: 'center',
  gap: 18,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-mono-display, monospace)',
  letterSpacing: '0.24em',
  color: 'rgba(255,255,255,0.55)',
  textTransform: 'uppercase',
};

const numberStyle: React.CSSProperties = {
  fontSize: 'clamp(80px, 22vw, 160px)',
  fontFamily: 'var(--font-display, Georgia, serif)',
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: '-0.04em',
  background: 'linear-gradient(135deg, #fff 0%, #a78bfa 50%, #f59e0b 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const headlineStyle: React.CSSProperties = {
  fontSize: 'clamp(32px, 8vw, 56px)',
  fontFamily: 'var(--font-display, Georgia, serif)',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  lineHeight: 1.05,
  margin: 0,
  maxWidth: '88%',
};

export function WrappedClient({ year, userName, timeline, stats }: WrappedClientProps) {
  const [page, setPage] = useState(0);
  const total = 5;
  const next = () => setPage((p) => Math.min(p + 1, total - 1));
  const prev = () => setPage((p) => Math.max(p - 1, 0));

  // Empty-state — they didn't collect anything this year
  if (timeline.length === 0) {
    return (
      <main style={containerStyle}>
        <AuroraBackground duration={10} opacity={0.35} />
        <div style={cardStyle}>
          <span style={labelStyle}>GEKNEE PASSPORT · {year}</span>
          <h1 style={headlineStyle}>
            Your{' '}
            <TextShimmerWave style={{ fontStyle: 'italic' }}>{`${year} wrap`}</TextShimmerWave>{' '}
            is empty
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', maxWidth: 320, margin: 0 }}>
            No monuments collected this year yet — visit a city and start your
            passport. Issue {String(year).slice(-2)} is waiting.
          </p>
          <ShimmerButton onClick={() => { window.location.href = '/plan/location'; }}>
            Open the globe
          </ShimmerButton>
        </div>
      </main>
    );
  }

  const handleShare = async () => {
    const text = `My ${year} on @geknee: ${stats.total} monument${stats.total === 1 ? '' : 's'} unlocked${
      stats.topCountry ? ` · top spot ${stats.topCountry.country}` : ''
    }${stats.rarest ? ` · rarest ${stats.rarest.name}` : ''} 🗺️`;
    const url = typeof window !== 'undefined' ? `${window.location.origin}/wrapped?year=${year}` : '';
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: `geknee ${year}`, text, url });
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert('Copied to clipboard');
    }
  };

  return (
    <main style={containerStyle}>
      <AuroraBackground duration={10} opacity={0.35} />

      {/* Progress dots */}
      <div style={{
        position: 'fixed', top: 28, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, zIndex: 10,
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 22, height: 3, borderRadius: 999,
              background: i <= page ? '#fff' : 'rgba(255,255,255,0.25)',
              transition: 'background 280ms ease',
            }}
          />
        ))}
      </div>

      {/* Tap zones for paging */}
      <div
        onClick={prev}
        style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '30%', zIndex: 5, cursor: 'pointer' }}
      />
      <div
        onClick={next}
        style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: '30%', zIndex: 5, cursor: 'pointer' }}
      />

      <AnimatePresence mode="wait">
        {page === 0 && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5 }}
            style={cardStyle}
          >
            <span style={labelStyle}>GEKNEE PASSPORT · ISSUE {String(year).slice(-3)}</span>
            <h1 style={headlineStyle}>
              <TextShimmerWave style={{ fontStyle: 'italic' }}>
                {`Where ${userName.split(' ')[0]} went`}
              </TextShimmerWave>
            </h1>
            {/* shadcn cobe-globe: native cobe arc rendering + per-marker CSS
                Anchor-positioned labels. Wired with our brand palette so it
                matches the lavender → icy-blue spectrum used on the main
                globe's JourneyArcs. Arcs connect each consecutive collection
                in chronological order; markers carry the city name. */}
            <div style={{ width: 340, maxWidth: '100%' }}>
              <ShadcnGlobe
                markers={timeline.map(({ mk, lat, lon, location }, idx) => ({
                  id: `${mk}-${idx}`,
                  location: [lat, lon] as [number, number],
                  label: location.split(',')[0].trim(),
                }))}
                arcs={timeline.slice(0, -1).map((entry, idx) => ({
                  id: `arc-${idx}`,
                  from: [entry.lat, entry.lon] as [number, number],
                  to: [timeline[idx + 1].lat, timeline[idx + 1].lon] as [number, number],
                }))}
                // Brand palette — cobe takes 0..1 RGB triplets.
                // baseColor = lavender tint for the dotted earth
                // markerColor = icy blue dots
                // arcColor = icy blue arcs (with lavender glow)
                baseColor={[0.3, 0.3, 0.45]}
                markerColor={[0.49, 0.83, 0.99]}
                arcColor={[0.655, 0.545, 0.98]}
                glowColor={[0.655, 0.545, 0.98]}
                dark={1}
                mapBrightness={6}
                arcWidth={0.7}
                arcHeight={0.35}
                markerSize={0.045}
              />
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', maxWidth: 320, margin: 0 }}>
              Tap to the right to start your {year} wrap.
            </p>
          </motion.div>
        )}

        {page === 1 && (
          <motion.div
            key="count"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            style={cardStyle}
          >
            <span style={labelStyle}>YOU UNLOCKED</span>
            <div style={numberStyle}>{stats.total}</div>
            <h2 style={{ ...headlineStyle, fontSize: 'clamp(24px, 6vw, 36px)' }}>
              monument{stats.total === 1 ? '' : 's'} in {year}.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
              Across {stats.countryCount} countr{stats.countryCount === 1 ? 'y' : 'ies'}.
            </p>
          </motion.div>
        )}

        {page === 2 && stats.topCountry && (
          <motion.div
            key="country"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            style={cardStyle}
          >
            <span style={labelStyle}>YOUR TOP COUNTRY</span>
            <h2 style={{ ...headlineStyle, fontSize: 'clamp(40px, 11vw, 80px)' }}>
              <TextShimmerWave>{stats.topCountry.country}</TextShimmerWave>
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              {stats.topCountry.count} monument{stats.topCountry.count === 1 ? '' : 's'} unlocked there.
            </p>
          </motion.div>
        )}

        {page === 3 && stats.rarest && (
          <motion.div
            key="rarest"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            style={cardStyle}
          >
            <span style={labelStyle}>RAREST FIND</span>
            <h2 style={{ ...headlineStyle, fontSize: 'clamp(34px, 9vw, 56px)' }}>
              {stats.rarest.name}
            </h2>
            <p style={{ fontSize: 13, fontFamily: 'var(--font-mono-display, monospace)', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fbbf24', margin: 0 }}>
              {stats.rarest.rarity}
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              {stats.rarest.location}
            </p>
          </motion.div>
        )}

        {page === 4 && (
          <motion.div
            key="share"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5 }}
            style={cardStyle}
          >
            <span style={labelStyle}>{year} · WRAPPED</span>
            <h2 style={{ ...headlineStyle, fontSize: 'clamp(28px, 7vw, 44px)' }}>
              <TextShimmerWave style={{ fontStyle: 'italic' }}>
                {`Tell the world.`}
              </TextShimmerWave>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', maxWidth: 320, margin: 0 }}>
              {stats.total} monuments · {stats.countryCount} countries · {stats.rarest?.rarity ?? 'unranked'} highest tier
            </p>
            <ShimmerButton onClick={handleShare}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Sparkle size={12} /> Share your {year} wrap
              </span>
            </ShimmerButton>
            <a
              href="/plan/location"
              style={{ marginTop: 8, color: 'rgba(255,255,255,0.5)', fontSize: 13, textDecoration: 'underline' }}
            >
              Back to the globe
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
