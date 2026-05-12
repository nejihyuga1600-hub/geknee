'use client';
// Vertical Recommendations panel — lives inside SummaryView's planning
// sidebar as a sub-tab next to "Pins". Compact list (not horizontal
// rail) so it fits inside the existing pin-panel column.
//
// Click behaviour: `onPick` is called with the rec name. SummaryView
// resolves that to a place via Google Places `findPlaceFromQuery` and
// then calls mapControlRef.current.openPlace — same path as a bookmark
// click. This means "click rec → see it on map" reuses every existing
// rec-on-map affordance (info popup, photo, add-as-pin CTA).

import { useCallback, useEffect, useState } from 'react';
import { Sparkle } from '@/lib/icons';

interface Rec {
  id: string;
  name: string;
  category: 'restaurant' | 'sight' | 'experience' | 'off-beat' | 'neighborhood';
  blurb: string;
  whyItFits: string;
  duration?: string;
  priceTier?: 1 | 2 | 3;
}

interface Props {
  tripId: string;
  /** Called with the rec — parent geocodes via Google Places + drives the map. */
  onPick: (rec: Rec) => void;
}

const CATEGORY_TINT: Record<Rec['category'], { fg: string; bg: string }> = {
  restaurant:   { fg: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  sight:        { fg: '#7dd3fc', bg: 'rgba(125,211,252,0.12)' },
  experience:   { fg: '#a78bfa', bg: 'rgba(167,139,250,0.14)' },
  'off-beat':   { fg: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  neighborhood: { fg: '#7cff97', bg: 'rgba(124,255,151,0.10)' },
};

export function RecPanel({ tripId, onPick }: Props) {
  const [recs, setRecs] = useState<Rec[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `geknee:recs:${tripId}`;

  const fetchRecs = useCallback(async (opts?: { force?: boolean }) => {
    if (!tripId) return;
    // SessionStorage cache — re-visits to the planning tab in the same
    // session shouldn't re-spend the Anthropic call. Refresh button
    // bypasses the cache by passing { force: true }.
    if (!opts?.force && typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { ts: number; recs: Rec[] };
          // Treat cache as fresh for the session — the user's style + dest
          // don't change mid-session in practice. Refresh re-curates.
          if (Array.isArray(parsed.recs) && parsed.recs.length > 0) {
            setRecs(parsed.recs);
            return;
          }
        }
      } catch { /* corrupted entry — fall through to network */ }
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json() as { recommendations: Rec[] };
      setRecs(j.recommendations);
      if (typeof window !== 'undefined' && j.recommendations.length > 0) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({
            ts: Date.now(), recs: j.recommendations,
          }));
        } catch { /* storage full / disabled — silent */ }
      }
    } catch (e) {
      console.error('[recommendations] fetch failed', e);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tripId, cacheKey]);

  useEffect(() => { fetchRecs(); }, [fetchRecs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: '1 1 auto' }}>
      <p style={{
        margin: 0,
        fontSize: 12, lineHeight: 1.45,
        color: 'var(--brand-ink-dim)',
      }}>
        Tap a rec to see it on the map. Like it? Add it as a pin.
      </p>

      {loading && (
        <div style={{
          padding: '12px 0',
          fontFamily: 'var(--font-mono-display), monospace',
          fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--brand-ink-mute)',
        }}>
          <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Curating…
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.10)',
          border: '1px solid rgba(248,113,113,0.30)',
          color: 'var(--brand-danger)', fontSize: 12,
        }}>
          {error}{' '}
          <button onClick={() => fetchRecs({ force: true })} style={{
            background: 'none', border: 'none',
            color: 'var(--brand-accent)',
            fontSize: 12, cursor: 'pointer', padding: 0,
            textDecoration: 'underline',
          }}>retry</button>
        </div>
      )}

      {!loading && !error && recs && (
        <ul role="list" style={{
          listStyle: 'none', margin: 0, padding: 0,
          display: 'flex', flexDirection: 'column', gap: 6,
          overflowY: 'auto', minHeight: 0, flex: '1 1 auto',
        }}>
          {recs.map(rec => (
            <li key={rec.id}>
              <button
                onClick={() => onPick(rec)}
                style={recBtnStyle}
                className="rec-pick"
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono-display), monospace',
                    fontSize: 8, letterSpacing: '0.16em',
                    padding: '2px 6px', borderRadius: 999,
                    background: CATEGORY_TINT[rec.category].bg,
                    color: CATEGORY_TINT[rec.category].fg,
                    textTransform: 'uppercase', fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {rec.category === 'off-beat' ? 'Off-beat' : rec.category}
                  </span>
                  {rec.priceTier && (
                    <span style={{
                      fontFamily: 'var(--font-mono-display), monospace',
                      fontSize: 9, color: 'var(--brand-ink-mute)',
                    }}>
                      {'$'.repeat(rec.priceTier)}
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: 'var(--font-display), Georgia, serif',
                  fontSize: 14, fontWeight: 600,
                  color: 'var(--brand-ink)', lineHeight: 1.2,
                  marginBottom: 4,
                }}>
                  {rec.name}
                </div>
                <div style={{
                  fontSize: 11, lineHeight: 1.4,
                  color: 'var(--brand-ink-dim)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {rec.blurb}
                </div>
                <div style={{
                  marginTop: 6,
                  fontSize: 10, fontStyle: 'italic',
                  color: CATEGORY_TINT[rec.category].fg,
                  lineHeight: 1.3,
                }}>
                  <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> {rec.whyItFits}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <style>{`
        .rec-pick:hover {
          border-color: rgba(167,139,250,0.40) !important;
          background: rgba(167,139,250,0.06) !important;
        }
        .rec-pick:focus-visible {
          outline: 2px solid var(--brand-accent);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

const recBtnStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--brand-border)',
  borderRadius: 10,
  color: 'var(--brand-ink)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background 160ms ease, border-color 160ms ease',
};
