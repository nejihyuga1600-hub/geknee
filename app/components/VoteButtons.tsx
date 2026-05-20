'use client';

// Thumb-up / thumb-down vote control. Self-contained: handles its own
// POST to /api/trips/[id]/item-vote and updates the local tally without
// requiring the parent to re-fetch.
//
// Used by both BookView (kind='booking') and SummaryView (kind='stop')
// so the vote-and-ping behavior stays consistent across surfaces.
//
// Visual model: two compact pill buttons side-by-side, each showing the
// thumb glyph and (when non-zero) the count. The user's current vote is
// highlighted. Tapping the same direction again removes the vote.

import { useEffect, useState, useCallback } from 'react';

interface Tally { up: number; down: number; mine: 0 | 1 | -1; }

interface Props {
  tripId: string;
  itemKey: string;            // booking id OR content-hash for an itinerary stop
  kind: 'booking' | 'stop';
  label: string;              // short display name for the chat ping
  day?: number | null;        // 1-based; only used for kind='stop'
  initialTally?: Tally;       // optional preload from a parent batch GET
  compact?: boolean;          // smaller form factor inside dense lists
}

export default function VoteButtons({ tripId, itemKey, kind, label, day = null, initialTally, compact = false }: Props) {
  const [tally, setTally] = useState<Tally>(initialTally ?? { up: 0, down: 0, mine: 0 });
  const [loading, setLoading] = useState(false);

  // If no initialTally was passed and the parent isn't batch-fetching,
  // pull the row's current tally lazily on mount. The batch path is
  // preferred — N parallel GETs across a long booking list is wasteful.
  useEffect(() => {
    if (initialTally) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/trips/${tripId}/item-vote`);
        if (!r.ok) return;
        const d = await r.json() as { tallies?: Record<string, Tally> };
        const t = d.tallies?.[itemKey];
        if (!cancelled && t) setTally(t);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [tripId, itemKey, initialTally]);

  const submit = useCallback(async (direction: 1 | -1) => {
    if (loading || !tripId || !itemKey) return;
    setLoading(true);
    // Optimistic update for snappier feel — recompute the projected
    // tally before the server response lands. Reconciled with the
    // server's authoritative count on success.
    const prev = tally;
    let optimistic: Tally;
    if (prev.mine === direction) {
      // Toggle off
      optimistic = {
        up:   direction === 1  ? Math.max(0, prev.up   - 1) : prev.up,
        down: direction === -1 ? Math.max(0, prev.down - 1) : prev.down,
        mine: 0,
      };
    } else if (prev.mine === 0) {
      // New vote
      optimistic = {
        up:   direction === 1  ? prev.up + 1   : prev.up,
        down: direction === -1 ? prev.down + 1 : prev.down,
        mine: direction,
      };
    } else {
      // Switch direction
      optimistic = {
        up:   direction === 1  ? prev.up + 1   : Math.max(0, prev.up - 1),
        down: direction === -1 ? prev.down + 1 : Math.max(0, prev.down - 1),
        mine: direction,
      };
    }
    setTally(optimistic);
    try {
      const res = await fetch(`/api/trips/${tripId}/item-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKey, direction, kind, label, day }),
      });
      if (!res.ok) {
        setTally(prev);
        return;
      }
      const d = await res.json() as { tally?: Tally };
      if (d.tally) setTally(d.tally);
    } catch {
      setTally(prev);
    } finally {
      setLoading(false);
    }
  }, [tripId, itemKey, kind, label, day, loading, tally]);

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: compact ? '3px 8px' : '5px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: compact ? 11 : 12,
    fontWeight: 600,
    cursor: loading ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    lineHeight: 1,
    transition: 'background 120ms, color 120ms, border-color 120ms',
  };
  const upStyle: React.CSSProperties = {
    ...btnBase,
    background: tally.mine === 1 ? 'rgba(74,222,128,0.18)' : btnBase.background,
    borderColor: tally.mine === 1 ? 'rgba(74,222,128,0.5)' : btnBase.borderColor,
    color: tally.mine === 1 ? '#86efac' : btnBase.color,
  };
  const downStyle: React.CSSProperties = {
    ...btnBase,
    background: tally.mine === -1 ? 'rgba(248,113,113,0.18)' : btnBase.background,
    borderColor: tally.mine === -1 ? 'rgba(248,113,113,0.5)' : btnBase.borderColor,
    color: tally.mine === -1 ? '#fca5a5' : btnBase.color,
  };

  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} aria-label={`Vote on ${label}`}>
      <button
        type="button"
        onClick={() => submit(1)}
        disabled={loading}
        style={upStyle}
        title={tally.mine === 1 ? 'Remove your vote' : 'Vote up'}
      >
        <span aria-hidden>{String.fromCodePoint(0x1F44D)}</span>
        {tally.up > 0 && <span>{tally.up}</span>}
      </button>
      <button
        type="button"
        onClick={() => submit(-1)}
        disabled={loading}
        style={downStyle}
        title={tally.mine === -1 ? 'Remove your vote' : 'Vote down'}
      >
        <span aria-hidden>{String.fromCodePoint(0x1F44E)}</span>
        {tally.down > 0 && <span>{tally.down}</span>}
      </button>
    </div>
  );
}
