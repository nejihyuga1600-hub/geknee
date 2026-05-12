'use client';

// Single Google Maps view that aggregates pins from every day section
// of an itinerary. Day-filter chips at the top let the user toggle
// which day's pins are visible. Numbered pins; click opens the place
// in the native Google Maps app/site for directions + reviews.
//
// Replaces the previous per-day Mapbox DayMap pattern (one map per
// section). One sticky map gives users cross-day geographic context
// at a glance and is much lighter on the page.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import type { Section } from './lib/itinerary-parse';
import { extractActivityCandidates, extractActivityPlace } from './lib/places';

interface PlacePin {
  dayIdx: number;          // 0 = first day section, 1 = second, ...
  dayNumber: number;       // human-facing 1-based
  dayLabel: string;        // "Day 1", "Day 2"
  positionInDay: number;   // 1-based — drives the marker badge label
  name: string;            // primary display name
  candidates: string[];    // fallback names for geocoding
  resolved?: { lat: number; lng: number };
}

interface Props {
  sections: Section[];
  location: string;        // trip city (anchors map view + biases geocoding)
  height?: number;
  sticky?: boolean;
  topOffset?: number;      // px from top when sticky
}

declare global {
  // Minimal Google Maps type surface — the SDK is loaded at runtime.
  interface Window {
    google?: {
      maps?: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
        Marker: new (opts: Record<string, unknown>) => GoogleMarker;
        InfoWindow: new (opts?: Record<string, unknown>) => { open: (opts: Record<string, unknown>) => void; close: () => void; setContent: (s: string) => void };
        LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void; isEmpty: () => boolean };
        Size: new (w: number, h: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        SymbolPath: { CIRCLE: number };
        event: { clearInstanceListeners: (i: unknown) => void };
      };
    };
  }
}

interface GoogleMap {
  setCenter: (p: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: unknown, padding?: number) => void;
  panTo: (p: { lat: number; lng: number }) => void;
}

interface GoogleMarker {
  setMap: (m: GoogleMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
}

const DAY_COLORS = [
  '#a78bfa', '#7dd3fc', '#fbbf24', '#34d399', '#f472b6',
  '#fb923c', '#60a5fa', '#facc15', '#4ade80', '#c084fc',
];

export default function UnifiedTripMap({
  sections,
  location,
  height = 360,
  sticky = true,
  topOffset = 16,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const infoWindowRef = useRef<{ open: (opts: Record<string, unknown>) => void; close: () => void; setContent: (s: string) => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | number>('all');

  // Pull day sections only — Overview / Practical Tips don't get pins.
  const daySections = useMemo(() => {
    return sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => /^Day\s*\d+/i.test(s.heading ?? ''));
  }, [sections]);

  // Build the candidate place list per day, in chronological order.
  const pins = useMemo<PlacePin[]>(() => {
    const out: PlacePin[] = [];
    daySections.forEach((entry, dayIdx) => {
      const dayNum = parseInt(((entry.s.heading ?? '').match(/Day\s*(\d+)/i) ?? [])[1] ?? `${dayIdx + 1}`, 10);
      const headlines = entry.s.lines.filter((l: string) => /\*\*[^*]+\*\*/.test(l));
      let pos = 0;
      for (const headline of headlines) {
        const candidates = extractActivityCandidates(headline, []);
        const primary = extractActivityPlace(headline, []);
        if (!candidates.length || !primary) continue;
        pos += 1;
        out.push({
          dayIdx,
          dayNumber: dayNum,
          dayLabel: `Day ${dayNum}`,
          positionInDay: pos,
          name: primary,
          candidates,
        });
      }
    });
    return out;
  }, [daySections]);

  // Init map once.
  useEffect(() => {
    if (!divRef.current) return;
    const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!KEY) { setKeyMissing(true); return; }
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !divRef.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(divRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
          styles: DARK_MAP_STYLE,
        });
        mapRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow();
        setReady(true);
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load Google Maps'));
    return () => { cancelled = true; };
  }, []);

  // Geocode + render markers whenever pins or filter changes.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    let cancelled = false;

    // Clear existing markers.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    infoWindowRef.current?.close();

    const visible = pins.filter((p) => activeFilter === 'all' || p.dayNumber === activeFilter);

    // Reject candidate names that are obviously generic activity verbs
    // (geocoding "Lunch" returns a random Lunch, NJ; "Breakfast" returns
    // a Breakfast, ID, etc). Without this, the unified map sprays pins
    // worldwide for any trip whose itinerary mentions meals or generic
    // activities by category instead of by specific place.
    const GENERIC_REJECTS = new Set([
      'lunch', 'dinner', 'breakfast', 'brunch', 'snack', 'snacks', 'meal',
      'check-in', 'check in', 'checkout', 'check-out', 'arrival', 'departure',
      'transfer', 'transit', 'rest', 'free time', 'optional', 'overview',
      'restaurant', 'hotel', 'cafe', 'bar', 'shop', 'market', 'museum',
    ]);
    const isGeneric = (name: string) => {
      const n = name.toLowerCase().replace(/[^a-z\s-]/g, '').trim();
      return n.length === 0 || GENERIC_REJECTS.has(n);
    };

    async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
      const cacheKey = `geo:${query}`;
      try {
        const hit = sessionStorage.getItem(cacheKey);
        if (hit) return JSON.parse(hit) as { lat: number; lng: number };
      } catch { /* sessionStorage unavailable */ }
      try {
        const r = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`);
        if (r.ok) {
          const c = (await r.json()) as { lat: number; lng: number } | null;
          if (c) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify(c)); } catch { /* ignore */ }
            return c;
          }
        }
      } catch { /* network */ }
      return null;
    }

    async function resolve(p: PlacePin, anchor: { lat: number; lng: number } | null): Promise<{ lat: number; lng: number } | null> {
      const inBbox = (c: { lat: number; lng: number }) =>
        !anchor || (Math.abs(c.lat - anchor.lat) < 1.5 && Math.abs(c.lng - anchor.lng) < 2.0);

      for (const c of p.candidates) {
        if (isGeneric(c)) continue;
        const tries = [
          `${c}, ${location}`,
          `${c.replace(/\([^)]*\)/g, '').trim()}, ${location}`,
        ];
        const seen = new Set<string>();
        for (const q of tries) {
          if (seen.has(q.toLowerCase())) continue;
          seen.add(q.toLowerCase());
          const hit = await geocode(q);
          if (hit && inBbox(hit)) return hit;
        }
      }
      return null;
    }

    (async () => {
      // Anchor on the trip city first so we can reject candidate
      // geocode hits that fall outside it. Without this, generic words
      // ("Lunch", "Restaurant") that slip past isGeneric still pin
      // wherever Google's first match happens to be.
      const anchor = await geocode(location);

      const resolved = await Promise.all(
        visible.map(async (p) => ({ ...p, resolved: (await resolve(p, anchor)) ?? undefined })),
      );
      if (cancelled) return;

      const bounds = new window.google!.maps!.LatLngBounds();
      let perDayCounter = new Map<number, number>();

      for (const p of resolved) {
        if (!p.resolved) continue;
        const dayCount = (perDayCounter.get(p.dayNumber) ?? 0) + 1;
        perDayCounter.set(p.dayNumber, dayCount);
        const color = DAY_COLORS[(p.dayNumber - 1) % DAY_COLORS.length];

        const marker = new window.google!.maps!.Marker({
          position: p.resolved,
          map: mapRef.current,
          label: { text: String(p.positionInDay), color: '#0a0a1f', fontSize: '12px', fontWeight: '700' },
          icon: {
            path: window.google!.maps!.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: color,
            fillOpacity: 0.9,
            strokeColor: '#0a0a1f',
            strokeWeight: 2,
          },
          title: `${p.dayLabel} · ${p.name}`,
        });
        marker.addListener('click', () => {
          // Open the place in Google Maps. Defers to the native app on
          // mobile if installed; opens maps.google.com on desktop.
          const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${location}`)}`;
          window.open(url, '_blank', 'noopener,noreferrer');
        });
        markersRef.current.push(marker);
        bounds.extend(p.resolved);
      }

      if (!bounds.isEmpty()) {
        mapRef.current?.fitBounds(bounds, 64);
      } else if (anchor && mapRef.current) {
        // No resolved pins (or none in current filter) — anchor on the
        // city so the user sees the right region instead of a world view.
        mapRef.current.setCenter(anchor);
        mapRef.current.setZoom(11);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, pins, activeFilter, location]);

  if (keyMissing) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
        Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  const dayChips = Array.from(new Set(pins.map((p) => p.dayNumber))).sort((a, b) => a - b);

  return (
    <div
      style={{
        position: sticky ? 'sticky' : 'static',
        top: sticky ? topOffset : undefined,
        zIndex: 5,
        marginBottom: 18,
      }}
    >
      <div
        ref={divRef}
        style={{
          width: '100%',
          height,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--brand-border)',
          background: '#0a0a1f',
        }}
      />
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#fbbf24' }}>
          Map error: {error}
        </div>
      )}
      {dayChips.length > 0 && (
        <div
          role="tablist"
          aria-label="Filter map by day"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            marginTop: 8,
          }}
        >
          <button
            role="tab"
            aria-selected={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
            style={chipStyle(activeFilter === 'all', null)}
          >
            All ({pins.length})
          </button>
          {dayChips.map((d) => {
            const count = pins.filter((p) => p.dayNumber === d).length;
            const color = DAY_COLORS[(d - 1) % DAY_COLORS.length];
            return (
              <button
                key={d}
                role="tab"
                aria-selected={activeFilter === d}
                onClick={() => setActiveFilter(d)}
                style={chipStyle(activeFilter === d, color)}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />
                Day {d} ({count})
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chipStyle(active: boolean, color: string | null): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 999,
    background: active ? (color ? `${color}33` : 'rgba(167,139,250,0.22)') : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? (color ?? 'rgba(167,139,250,0.5)') : 'rgba(255,255,255,0.12)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  };
}

// Dark Mapbox-equivalent style for Google Maps. Pulled from Google's
// Snazzy Maps "Midnight Commander" preset, trimmed to essentials.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
];
