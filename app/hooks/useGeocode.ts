'use client';
import { useEffect, useState } from 'react';

// Multi-layer cache for client-side geocoding:
// 1. In-memory Map (fastest, per-page-session)
// 2. sessionStorage (per-tab persistence)
// 3. /api/geocode endpoint (server has its own module-level cache)
// Worst case: one /api/geocode call per unique (name, cityHint) per browser
// tab. Aggressive enough that even a busy trip with 30 activities will rack
// up < 1$ in Geocoding API spend across hundreds of users (most popular
// places dedupe across users).

type Coord = { lat: number; lng: number } | null;
type Status = 'loading' | 'done';
type State = { coord: Coord; status: Status };

const MEM_CACHE = new Map<string, Coord>();

function buildKey(name: string, cityHint?: string | null): string {
  const trimmedName = name.trim();
  if (cityHint) return `${trimmedName} · ${cityHint.trim()}`;
  return trimmedName;
}

export function useGeocode(
  name: string | null | undefined,
  cityHint?: string | null,
): State {
  const key = name && name.trim() ? buildKey(name, cityHint) : '';
  const [state, setState] = useState<State>(() => {
    if (!key) return { coord: null, status: 'done' };
    if (MEM_CACHE.has(key)) return { coord: MEM_CACHE.get(key) ?? null, status: 'done' };
    return { coord: null, status: 'loading' };
  });

  useEffect(() => {
    if (!key) { setState({ coord: null, status: 'done' }); return; }

    if (MEM_CACHE.has(key)) {
      setState({ coord: MEM_CACHE.get(key) ?? null, status: 'done' });
      return;
    }

    // sessionStorage check
    try {
      const stored = sessionStorage.getItem(`geocode:${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Coord;
        MEM_CACHE.set(key, parsed);
        setState({ coord: parsed, status: 'done' });
        return;
      }
    } catch { /* sessionStorage may be unavailable */ }

    let cancelled = false;
    setState({ coord: null, status: 'loading' });

    fetch(`/api/geocode?address=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Coord) => {
        if (cancelled) return;
        const coord = data && typeof data.lat === 'number' && typeof data.lng === 'number' ? data : null;
        MEM_CACHE.set(key, coord);
        try { sessionStorage.setItem(`geocode:${key}`, JSON.stringify(coord)); } catch {}
        setState({ coord, status: 'done' });
      })
      .catch(() => {
        if (cancelled) return;
        MEM_CACHE.set(key, null);
        setState({ coord: null, status: 'done' });
      });

    return () => { cancelled = true; };
  }, [key]);

  return state;
}
