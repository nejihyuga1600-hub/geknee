'use client';

// SavesClient — "Your Saves" search + filter grid.
// Debounced search input + horizontal category-chip row + card grid.
// Cards deep-link to the parent trip's itinerary tab.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type CategoryChip = {
  key: string;
  label: string;
  emoji: string;
  count: number;
};

type SavedPlace = {
  id: string;
  venueName: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  category: string;
  thumbnail: string | null;
  source: string;
  sourceUrl: string | null;
  savedAt: string;
  tripId: string | null;
  tripTitle: string | null;
};

type SavesResponse = {
  count: number;
  filteredCount: number;
  categories: CategoryChip[];
  places: SavedPlace[];
};

export default function SavesClient() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [data, setData] = useState<SavesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input — 220ms is enough to feel responsive without
  // firing on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (category && category !== 'all') params.set('category', category);
    fetch(`/api/saves?${params.toString()}`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? `${r.status}`);
        }
        return r.json() as Promise<SavesResponse>;
      })
      .then(j => { if (!cancelled) setData(j); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Load failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery, category]);

  const chips = useMemo(() => {
    if (!data) return [];
    const activeChips = data.categories.filter(c => c.count > 0);
    return [{ key: 'all', label: 'All', emoji: '📍', count: data.count } as CategoryChip].concat(activeChips);
  }, [data]);

  const showEmptyState = !loading && data && data.places.length === 0;
  const showNoSavesYet = !loading && data && data.count === 0 && !debouncedQuery && category === 'all';

  return (
    <main
      style={{
        minHeight: '100svh',
        background: 'var(--bg, #0a0a1f)',
        color: 'var(--fg, #f5f1e8)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 0 calc(env(safe-area-inset-bottom, 0px) + 96px)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '6px 0 18px' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.55, marginBottom: 4 }}>
              Your saves
            </div>
            <h1
              style={{
                fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
                fontSize: 30,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Find anything <em style={{ color: '#7c93ff' }}>instantly</em>.
            </h1>
          </div>
          <button
            onClick={() => router.back()}
            style={pillBtn}
            aria-label="Back"
          >
            ← Back
          </button>
        </header>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search saves — venue, city, country…"
            aria-label="Search saves"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px 14px 42px',
              fontSize: 15,
              background: 'rgba(255,255,255,0.06)',
              color: 'inherit',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              boxSizing: 'border-box',
              minHeight: 48,
              outline: 'none',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.5,
              fontSize: 16,
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
        </div>

        <ChipRow chips={chips} value={category} onChange={setCategory} />

        <div style={{ marginTop: 20 }}>
          {loading && !data && <Loading />}
          {error && <ErrorBox message={error} />}
          {showNoSavesYet && <EmptyFirstUse />}
          {showEmptyState && !showNoSavesYet && (
            <p style={{ opacity: 0.7, textAlign: 'center', padding: '40px 20px', fontSize: 14 }}>
              No saves match{debouncedQuery ? ` "${debouncedQuery}"` : ''}
              {category !== 'all' ? ' in this category' : ''}.
            </p>
          )}
          {data && data.places.length > 0 && (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.places.map(p => (
                <SaveCard key={p.id} place={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────

function ChipRow({ chips, value, onChange }: { chips: CategoryChip[]; value: string; onChange: (k: string) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Filter by category"
      style={{
        display: 'flex',
        gap: 8,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        margin: '0 -16px',
        padding: '4px 16px 6px',
      }}
    >
      {chips.map(c => {
        const active = value === c.key;
        return (
          <button
            key={c.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              minHeight: 40,
              borderRadius: 999,
              border: '1px solid ' + (active ? 'transparent' : 'rgba(255,255,255,0.16)'),
              background: active ? '#7c93ff' : 'transparent',
              color: active ? '#0a0a1f' : 'inherit',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            <span style={{ fontSize: 14 }}>{c.emoji}</span>
            <span>{c.label}</span>
            <span
              style={{
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                fontSize: 11,
                opacity: active ? 0.65 : 0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SaveCard({ place }: { place: SavedPlace }) {
  const loc = [place.city, place.country].filter(Boolean).join(', ');
  const href = place.tripId ? `/trip/${place.tripId}/live` : '#';
  const clickable = Boolean(place.tripId);
  const content = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: place.thumbnail ? '72px 1fr' : '1fr',
        gap: 14,
        alignItems: 'center',
        padding: 14,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 12,
        transition: 'border-color 120ms ease',
      }}
    >
      {place.thumbnail && (
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'rgba(0,0,0,0.35)',
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={place.thumbnail}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
              fontSize: 17,
              lineHeight: 1.15,
              letterSpacing: '-0.005em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {place.venueName}
          </div>
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              opacity: 0.55,
              padding: '2px 6px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 4,
            }}
          >
            {place.category}
          </span>
        </div>
        {loc && (
          <div style={{ fontSize: 13, opacity: 0.65, marginTop: 3 }}>
            {loc}
          </div>
        )}
        <div style={{ fontSize: 11.5, opacity: 0.5, marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>from {place.source}</span>
          {place.tripTitle && (
            <>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{place.tripTitle}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
  return clickable ? (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

function Loading() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            height: 88,
            borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.05) 100%)',
            backgroundSize: '200% 100%',
            animation: 'skeleton 1.4s ease-in-out infinite',
          }}
        />
      ))}
      <style>{`@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'rgba(255, 90, 90, 0.10)',
        border: '1px solid rgba(255, 90, 90, 0.25)',
        color: '#ffb3b3',
        borderRadius: 10,
        fontSize: 14,
      }}
    >
      Couldn’t load your saves — {message}.
    </div>
  );
}

function EmptyFirstUse() {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 10 }}>📌</div>
      <h2
        style={{
          fontFamily: '"Iowan Old Style", Palatino, Georgia, serif',
          fontSize: 21,
          margin: '0 0 8px',
        }}
      >
        No saves yet
      </h2>
      <p style={{ opacity: 0.7, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        Share a link from Instagram, TikTok, Google Maps, or any browser to
        geknee — we’ll save the place here so you can find it later.
      </p>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'inherit',
  fontSize: 13,
  padding: '8px 12px',
  borderRadius: 999,
  cursor: 'pointer',
  minHeight: 36,
};
