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
import { extractActivityCandidates, extractActivityPlace, extractTransitMode } from './lib/places';

const QUEST_RE = /\[\s*MONUMENT\s*QUEST\s*\]/i;

type LegMode = 'walking' | 'cycling' | 'driving';

interface PlacePin {
  dayIdx: number;          // 0 = first day section, 1 = second, ...
  dayNumber: number;       // human-facing 1-based
  dayLabel: string;        // "Day 1", "Day 2"
  positionInDay: number;   // 1-based — drives the marker badge label
  name: string;            // primary display name
  candidates: string[];    // fallback names for geocoding
  isQuest: boolean;        // [MONUMENT QUEST] marker → gold pin
  legModeToNext: LegMode | null; // transit mode used to reach the next stop
  resolved?: { lat: number; lng: number };
}

const QUEST_COLOR = '#fbbf24'; // gold — matches monument-quest pill in ActivityBlock

interface Props {
  sections: Section[];
  location: string;        // trip city (anchors map view + biases geocoding)
  height?: number;
  sticky?: boolean;
  topOffset?: number;      // px from top when sticky
  fillHeight?: boolean;    // when true, map fills its parent's height (split layout)
}

declare global {
  // Minimal Google Maps type surface — the SDK is loaded at runtime.
  interface Window {
    google?: {
      maps?: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
        Marker: new (opts: Record<string, unknown>) => GoogleMarker;
        Polyline: new (opts: Record<string, unknown>) => GooglePolyline;
        InfoWindow: new (opts?: Record<string, unknown>) => GoogleInfoWindow;
        LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void; isEmpty: () => boolean };
        Size: new (w: number, h: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        SymbolPath: { CIRCLE: number };
        event: { clearInstanceListeners: (i: unknown) => void };
        places?: {
          PlacesService: new (m: GoogleMap | HTMLElement) => PlacesService;
          PlacesServiceStatus: { OK: string };
        };
      };
    };
  }
}

interface GoogleInfoWindow {
  open: (opts: Record<string, unknown>) => void;
  close: () => void;
  setContent: (s: string | HTMLElement) => void;
  setPosition: (p: { lat: number; lng: number }) => void;
}

interface PlacePhoto {
  getUrl: (opts: { maxWidth?: number; maxHeight?: number }) => string;
}

interface PlaceDetails {
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  formatted_address?: string;
  photos?: PlacePhoto[];
  opening_hours?: { isOpen?: () => boolean };
  url?: string; // canonical Google Maps URL
}

interface PlacesService {
  findPlaceFromQuery: (
    req: { query: string; fields: string[]; locationBias?: unknown },
    cb: (results: Array<{ place_id?: string }> | null, status: string) => void,
  ) => void;
  getDetails: (
    req: { placeId: string; fields: string[] },
    cb: (place: PlaceDetails | null, status: string) => void,
  ) => void;
}

interface GooglePolyline {
  setMap: (m: GoogleMap | null) => void;
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
  fillHeight = false,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const polylinesRef = useRef<GooglePolyline[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const placesServiceRef = useRef<PlacesService | null>(null);
  const [ready, setReady] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | number>('all');

  // Pull day sections only — Overview / Practical Tips don't get pins.
  // Strict: must start with "Day <n>" then a separator (": " / " — " / " - ").
  // The looser /^Day\s*\d+/ used to match wrap-up headings like "Day 4
  // highlights" on a 3-day trip, producing a phantom Day 4 chip.
  const daySections = useMemo(() => {
    return sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => /^Day\s*\d+\s*[:\-–—]/i.test(s.heading ?? ''));
  }, [sections]);

  // Build the candidate place list per day, in chronological order.
  // Walk lines in order so we can capture each activity's transit-mode-
  // to-next (the emoji line that follows the headline). That lets the
  // route polylines pick the right Mapbox profile per leg.
  const pins = useMemo<PlacePin[]>(() => {
    const out: PlacePin[] = [];
    daySections.forEach((entry, dayIdx) => {
      const dayNum = parseInt(((entry.s.heading ?? '').match(/Day\s*(\d+)/i) ?? [])[1] ?? `${dayIdx + 1}`, 10);
      let pos = 0;
      let pendingTransit: LegMode | null = null;
      for (const line of entry.s.lines as string[]) {
        if (/\*\*[^*]+\*\*/.test(line)) {
          // Activity headline. The transit line we last saw applies to
          // the previous activity's leg-to-this one — assign it back.
          if (pendingTransit && out.length > 0) {
            const prev = out[out.length - 1];
            if (prev.dayIdx === dayIdx && prev.legModeToNext === null) {
              prev.legModeToNext = pendingTransit;
            }
          }
          pendingTransit = null;
          const candidates = extractActivityCandidates(line, []);
          const primary = extractActivityPlace(line, []);
          if (!candidates.length || !primary) continue;
          pos += 1;
          out.push({
            dayIdx,
            dayNumber: dayNum,
            dayLabel: `Day ${dayNum}`,
            positionInDay: pos,
            name: primary,
            candidates,
            isQuest: QUEST_RE.test(line),
            legModeToNext: null,
          });
        } else {
          const m = extractTransitMode(line);
          if (m) pendingTransit = m;
        }
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
        infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });
        if (window.google.maps.places?.PlacesService) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(map);
        }
        setReady(true);
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load Google Maps'));
    return () => { cancelled = true; };
  }, []);

  // Geocode + render markers whenever pins or filter changes.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    let cancelled = false;

    // Clear existing markers + polylines.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
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

      // Render a Google-Maps-style place card inside the InfoWindow.
      // Uses Google Places API (already loaded via libraries=places) to
      // hydrate the marker's text-only entry into a real place: photo,
      // rating, price tier, address, opening status, "Open in Google
      // Maps" button. Falls back to a minimal card if Places lookup
      // fails (e.g. no match, quota exhausted).
      const openPlaceCard = (p: PlacePin) => {
        if (!p.resolved || !mapRef.current || !infoWindowRef.current) return;
        const dayColor = DAY_COLORS[(p.dayNumber - 1) % DAY_COLORS.length];
        const accent = p.isQuest ? QUEST_COLOR : dayColor;
        const minimalCard = renderCard({
          name: p.name,
          dayLabel: p.dayLabel,
          isQuest: p.isQuest,
          accent,
          mapsQuery: `${p.name}, ${location}`,
        });
        infoWindowRef.current.setContent(minimalCard);
        infoWindowRef.current.setPosition(p.resolved);
        infoWindowRef.current.open({ map: mapRef.current });

        // Hydrate with Places data when available.
        const svc = placesServiceRef.current;
        if (!svc || !window.google?.maps?.places) return;
        svc.findPlaceFromQuery(
          { query: `${p.name}, ${location}`, fields: ['place_id'] },
          (results, status) => {
            if (status !== 'OK' || !results?.[0]?.place_id) return;
            svc.getDetails(
              {
                placeId: results[0].place_id,
                fields: ['name', 'rating', 'user_ratings_total', 'price_level', 'formatted_address', 'photos', 'opening_hours', 'url'],
              },
              (details, st2) => {
                if (st2 !== 'OK' || !details || !infoWindowRef.current) return;
                const photoUrl = details.photos?.[0]?.getUrl({ maxWidth: 320, maxHeight: 200 });
                const rich = renderCard({
                  name: details.name ?? p.name,
                  dayLabel: p.dayLabel,
                  isQuest: p.isQuest,
                  accent,
                  mapsQuery: `${p.name}, ${location}`,
                  rating: details.rating,
                  reviewCount: details.user_ratings_total,
                  priceLevel: details.price_level,
                  address: details.formatted_address,
                  photoUrl,
                  openNow: details.opening_hours?.isOpen?.(),
                  canonicalUrl: details.url,
                });
                infoWindowRef.current.setContent(rich);
              },
            );
          },
        );
      };

      for (const p of resolved) {
        if (!p.resolved) continue;
        const dayCount = (perDayCounter.get(p.dayNumber) ?? 0) + 1;
        perDayCounter.set(p.dayNumber, dayCount);
        // Quest pins override the day color with gold so the
        // monument-quest stops are unmistakable across the whole trip.
        const dayColor = DAY_COLORS[(p.dayNumber - 1) % DAY_COLORS.length];
        const color = p.isQuest ? QUEST_COLOR : dayColor;

        const marker = new window.google!.maps!.Marker({
          position: p.resolved,
          map: mapRef.current,
          label: { text: String(p.positionInDay), color: '#0a0a1f', fontSize: '12px', fontWeight: '700' },
          icon: {
            path: window.google!.maps!.SymbolPath.CIRCLE,
            scale: p.isQuest ? 14 : 12,
            fillColor: color,
            fillOpacity: 0.95,
            strokeColor: '#0a0a1f',
            strokeWeight: p.isQuest ? 3 : 2,
          },
          title: `${p.dayLabel} · ${p.name}${p.isQuest ? ' · Monument Quest' : ''}`,
          zIndex: p.isQuest ? 100 : 10,
        });
        marker.addListener('click', () => {
          openPlaceCard(p);
        });
        markersRef.current.push(marker);
        bounds.extend(p.resolved);
      }

      // ── Per-day route lines ─────────────────────────────────────────
      // Walk the resolved pins by day, fetch a Mapbox Directions route
      // per consecutive leg, and draw a polyline colored by the day.
      // Skipped when activeFilter === a single day (we still draw lines
      // for that day) or when consecutive pins are missing geo. All
      // requests fan out in parallel so this doesn't block first paint.
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (MAPBOX_TOKEN) {
        const byDay = new Map<number, typeof resolved>();
        for (const p of resolved) {
          if (!p.resolved) continue;
          if (!byDay.has(p.dayNumber)) byDay.set(p.dayNumber, []);
          byDay.get(p.dayNumber)!.push(p);
        }

        const legPromises: Promise<void>[] = [];
        for (const [dayNumber, dayPins] of byDay.entries()) {
          const dayColor = DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
          for (let i = 0; i < dayPins.length - 1; i++) {
            const from = dayPins[i].resolved!;
            const to = dayPins[i + 1].resolved!;
            const mode: LegMode = dayPins[i].legModeToNext ?? 'walking';
            // Color the leg by mode within the day's hue: quest legs
            // get a gold tint, otherwise use the day color.
            const legColor = dayPins[i].isQuest || dayPins[i + 1].isQuest ? QUEST_COLOR : dayColor;
            const url =
              `https://api.mapbox.com/directions/v5/mapbox/${mode}/` +
              `${from.lng},${from.lat};${to.lng},${to.lat}` +
              `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
            legPromises.push(
              fetch(url)
                .then((r) => r.ok ? r.json() : null)
                .then((d: { routes?: Array<{ geometry: { coordinates: [number, number][] } }> } | null) => {
                  if (cancelled || !d?.routes?.[0] || !mapRef.current || !window.google?.maps) return;
                  const path = d.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
                  const line = new window.google.maps.Polyline({
                    path,
                    map: mapRef.current,
                    strokeColor: legColor,
                    strokeOpacity: 0.85,
                    strokeWeight: 4,
                    geodesic: false,
                    zIndex: 5,
                  });
                  polylinesRef.current.push(line);
                })
                .catch(() => { /* swallow individual leg failures */ }),
            );
          }
        }
        // Don't await — let the bounds fit first, lines arrive over the next
        // few hundred ms and just appear over the map.
        Promise.all(legPromises);
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
        marginBottom: fillHeight ? 0 : 18,
        display: 'flex',
        flexDirection: 'column',
        height: fillHeight ? '100%' : 'auto',
        minHeight: 0,
      }}
    >
      <div
        ref={divRef}
        style={{
          width: '100%',
          height: fillHeight ? 'auto' : height,
          flex: fillHeight ? 1 : 'none',
          minHeight: fillHeight ? 0 : undefined,
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

// Google-Maps-style place card rendered inside the InfoWindow. Plain
// HTML string (InfoWindow expects markup, not React). Initial render
// uses just the name + day badge; once Places lookup completes we
// re-render with photo / rating / price / address / open-now / a real
// "Open in Google Maps" link to the canonical place URL.
function renderCard(opts: {
  name: string;
  dayLabel: string;
  isQuest: boolean;
  accent: string;
  mapsQuery: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  address?: string;
  photoUrl?: string;
  openNow?: boolean;
  canonicalUrl?: string;
}): string {
  const {
    name, dayLabel, isQuest, accent, mapsQuery,
    rating, reviewCount, priceLevel, address, photoUrl, openNow, canonicalUrl,
  } = opts;
  const url = canonicalUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`;
  const stars = typeof rating === 'number'
    ? `<span style="color:#fbbf24;font-weight:700">${rating.toFixed(1)} ★</span>${reviewCount ? `<span style="color:#94a3b8"> · ${reviewCount.toLocaleString()} reviews</span>` : ''}`
    : '';
  const price = typeof priceLevel === 'number' ? `<span style="color:#94a3b8"> · ${'$'.repeat(priceLevel)}</span>` : '';
  const openChip = openNow === true
    ? '<span style="background:#0f5132;color:#a7f3d0;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em">OPEN NOW</span>'
    : openNow === false
      ? '<span style="background:#7f1d1d;color:#fecaca;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em">CLOSED</span>'
      : '';
  const photo = photoUrl
    ? `<img src="${photoUrl}" alt="${escapeHtml(name)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px" />`
    : '';
  const addr = address ? `<div style="color:#94a3b8;font-size:11px;margin-top:4px">${escapeHtml(address)}</div>` : '';
  const questBadge = isQuest
    ? `<span style="background:${QUEST_COLOR};color:#0a0a1f;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em;margin-left:6px">QUEST</span>`
    : '';
  return `
    <div style="font-family:Inter,system-ui,sans-serif;color:#e2e8f0;background:#0a0a1f;padding:12px;border-radius:8px;min-width:260px;max-width:300px">
      ${photo}
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:${accent};letter-spacing:0.1em;font-weight:700;text-transform:uppercase;margin-bottom:4px">
        <span style="width:6px;height:6px;border-radius:50%;background:${accent};display:inline-block"></span>
        ${escapeHtml(dayLabel)} ${questBadge}
      </div>
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:6px;line-height:1.3">${escapeHtml(name)}</div>
      <div style="font-size:12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">${stars}${price} ${openChip}</div>
      ${addr}
      <div style="display:flex;gap:6px;margin-top:10px">
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="flex:1;text-align:center;background:linear-gradient(135deg,#a78bfa,#7dd3fc);color:#0a0a1f;font-weight:700;font-size:11px;padding:7px 10px;border-radius:8px;text-decoration:none">
          Open in Google Maps
        </a>
        <a href="${dirUrl}" target="_blank" rel="noopener noreferrer"
           style="text-align:center;background:rgba(255,255,255,0.08);color:#cbd5e1;font-weight:600;font-size:11px;padding:7px 10px;border-radius:8px;text-decoration:none">
          Directions
        </a>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
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
