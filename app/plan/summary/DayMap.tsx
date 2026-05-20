'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { DARK_STYLE } from '@/lib/googleMaps/darkStyle';
import { createPurpleMarker, type PurpleMarker } from '@/lib/googleMaps/marker';
import { drawRoute, modeUsesDirections, type RouteMode } from '@/lib/googleMaps/route';
import { fetchDirections } from '@/lib/googleMaps/directionsClient';

// Google Maps per-day map. Replaces the previous Mapbox implementation
// (dark-v11 style, custom HTML markers, Mapbox Directions for walking route
// lines, Mapbox Geocoding for address fallback) with the shared Google Maps
// helpers: DARK_STYLE, createPurpleMarker, drawRoute, fetchDirections, and
// server-cached geocode lookups via /api/geocode. The route is computed
// client-side from the resolved waypoints and falls back to a straight
// dashed polyline if the directions call fails.

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

const GENERIC_WORDS = new Set([
  'Morning', 'Afternoon', 'Evening', 'Night', 'Midnight',
  'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Brunch',
  'Day', 'Week', 'Weekend', 'Hour', 'Time',
  'Overview', 'Summary', 'Introduction', 'Highlights', 'Highlight',
  'Tips', 'Tip', 'Note', 'Notes', 'Important', 'Reminder',
  'Transportation', 'Transport', 'Getting', 'Travel', 'Traveling',
  'Budget', 'Cost', 'Price', 'Money', 'Currency',
  'Option', 'Optional', 'Alternative', 'Recommendation',
  'Activities', 'Accommodation', 'Hotel', 'Hostel',
]);

function extractPlaces(lines: string[]): Array<{ name: string }> {
  const seen = new Set<string>();
  const results: Array<{ name: string }> = [];
  for (const line of lines) {
    const boldMatches = [...line.matchAll(/\*\*([A-Z][^*]{1,50})\*\*/g)];
    for (const m of boldMatches) {
      const name = m[1].trim();
      if (GENERIC_WORDS.has(name.split(/[\s(]/)[0])) continue;
      if (!seen.has(name)) {
        seen.add(name);
        results.push({ name });
      }
    }
    if (results.length >= 12) break;
  }
  return results;
}

// coords: [lng, lat] — Mapbox convention preserved internally so dedup/spread
// math and console logs don't need to change.
interface Place { name: string; coords: [number, number] }  // [lng, lat]

interface DayMapProps {
  heading: string;
  lines: string[];
  location: string;
  height?: number;
  namedPlaces?: string[];
  // Optional fallback candidate names per activity, in priority order. The
  // geocoder tries each candidate until one resolves inside the city bbox.
  // Used when the LLM invents a fictional venue ("Joe's Mythical Café") —
  // the broader neighbourhood candidate carries the pin.
  placeCandidates?: string[][];
  // Mode of transit per leg (length = namedPlaces.length - 1). Each entry
  // tells DayMap which profile to use for that segment.
  // null skips routing for that leg and falls back to a straight dashed line
  // — appropriate for flights and ferries.
  legModes?: Array<'walking' | 'cycling' | 'driving' | null>;
  onPlacesResolved?: (names: string[]) => void;
}

export default function DayMap({
  heading, lines, location, height = 220, namedPlaces, placeCandidates, legModes, onPlacesResolved,
}: DayMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<PurpleMarker[]>([]);
  const routeRef = useRef<google.maps.Polyline[]>([]);
  const unmountedRef = useRef(false);
  const loadKeyRef = useRef('');

  const [isVisible, setIsVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [ready, setReady] = useState(false);

  // Safety timeout: even if geocode and map idle both stall, never
  // leave the "Loading map…" overlay visible for more than 6 s. The dark
  // base map is preferable to an indefinite spinner.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 6000);
    return () => clearTimeout(t);
  }, [ready]);

  // Diagnostic counters surfaced as a small overlay badge so the user can
  // see at a glance how many pins resolved and how many legs successfully
  // upgraded from straight line to a routed walking/driving path.
  const [pinCount, setPinCount] = useState(0);
  const [legCount, setLegCount] = useState(0);
  const [legRoutedCount, setLegRoutedCount] = useState(0);

  // Lazy-mount: only init the map when the card scrolls into view.
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); } },
      { threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Init map once visible.
  useEffect(() => {
    if (!isVisible || mapRef.current || !divRef.current) return;
    let cancelled = false;

    loadGoogleMaps().then(() => {
      if (cancelled || !divRef.current) return;
      const map = new google.maps.Map(divRef.current, {
        // Neutral world-view center until geocode resolves the trip city.
        center: { lat: 20, lng: 0 },
        zoom: 2,
        styles: DARK_STYLE,
        mapId: MAP_ID,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        // 'greedy' lets single-finger touch drag pan the map (instead of
        // scrolling the page), matching the prior Mapbox touch-action:none parity.
        gestureHandling: 'greedy',
      });
      mapRef.current = map;
      setMapReady(true);
    }).catch(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      unmountedRef.current = true;
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      routeRef.current.forEach(p => p.setMap(null));
      routeRef.current = [];
      mapRef.current = null;
    };
  }, [isVisible]);

  // Geocode + render route + markers.
  useEffect(() => {
    if (!mapReady) return;

    const placeTokens = namedPlaces ?? lines.filter(l => /\*\*[A-Z]/.test(l)).slice(0, 20);
    const loadKey = JSON.stringify({ heading, location, placeTokens, placeCandidates });
    if (loadKey === loadKeyRef.current) return;
    loadKeyRef.current = loadKey;

    let cancelled = false;

    // Clear previous markers and route lines.
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    routeRef.current.forEach(p => p.setMap(null));
    routeRef.current = [];

    async function geocode(address: string): Promise<[number, number] | null> {
      const cacheKey = `geo:${address}`;
      try {
        const hit = sessionStorage.getItem(cacheKey);
        if (hit) {
          const c = JSON.parse(hit) as { lat: number; lng: number };
          return [c.lng, c.lat];
        }
      } catch { /* sessionStorage unavailable */ }
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
        if (res.ok) {
          const c = await res.json() as { lat: number; lng: number } | null;
          if (c) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify(c)); } catch { /* ignore */ }
            return [c.lng, c.lat];
          }
        }
      } catch { /* network */ }
      return null;
    }

    async function loadData() {
      const anchor = await geocode(location);
      if (cancelled || !mapRef.current) return;
      if (!anchor) { setReady(true); return; }
      const center = anchor;
      const city = location;

      const rawPlaces = namedPlaces
        ? namedPlaces.map(n => ({ name: n }))
        : extractPlaces(lines);

      function inBbox(coords: [number, number]): boolean {
        return Math.abs(coords[1] - center[1]) < 0.6 && Math.abs(coords[0] - center[0]) < 0.9;
      }
      async function resolvePlace(name: string): Promise<[number, number] | null> {
        const tries: string[] = [];
        const cleaned = name.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        tries.push(`${name}, ${city}`);
        if (cleaned !== name) tries.push(`${cleaned}, ${city}`);
        const noArticle = cleaned.replace(/^(?:the|a|an)\s+/i, '');
        if (noArticle !== cleaned) tries.push(`${noArticle}, ${city}`);
        const chunks = cleaned.split(/[,]| (?:in|at|near|by) /i).map(s => s.trim()).filter(Boolean);
        for (let i = 1; i < chunks.length; i++) {
          tries.push(`${chunks[i]}, ${city}`);
        }
        const stripped = cleaned.replace(/\s+(restaurant|hotel|cafe|café|bar|lounge|bistro|eatery|inn|motel)\s*$/i, '').trim();
        if (stripped && stripped !== cleaned) tries.push(`${stripped}, ${city}`);
        const seen = new Set<string>();
        for (const q of tries) {
          if (seen.has(q.toLowerCase())) continue;
          seen.add(q.toLowerCase());
          const c = await geocode(q);
          if (c && inBbox(c)) return c;
        }
        return null;
      }
      const results = await Promise.all(rawPlaces.map(async (p, i) => {
        const candidates = placeCandidates?.[i] ?? [p.name];
        for (const c of candidates) {
          const coords = await resolvePlace(c);
          if (coords) return { name: p.name, coords } as Place;
        }
        return { name: p.name, coords: center } as Place;
      }));
      if (cancelled || !mapRef.current) return;

      const resolvedRaw = results.filter((p): p is Place => !!p);
      console.log(`[DayMap "${heading}"] ${rawPlaces.length} candidates → ${resolvedRaw.length} resolved`,
        resolvedRaw.map(r => ({ name: r.name, lng: r.coords[0].toFixed(5), lat: r.coords[1].toFixed(5) })));

      const groups = new Map<string, Place[]>();
      for (const p of resolvedRaw) {
        const key = `${Math.round(p.coords[0] * 1e2)}/${Math.round(p.coords[1] * 1e2)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }
      const resolved: Place[] = [];
      for (const p of resolvedRaw) {
        const key = `${Math.round(p.coords[0] * 1e2)}/${Math.round(p.coords[1] * 1e2)}`;
        const grp = groups.get(key)!;
        if (grp.length === 1) {
          resolved.push(p);
        } else {
          const idx = grp.indexOf(p);
          const angle = (idx / grp.length) * Math.PI * 2;
          const r = 0.001 + grp.length * 0.0004;
          resolved.push({
            name: p.name,
            coords: [p.coords[0] + Math.cos(angle) * r, p.coords[1] + Math.sin(angle) * r],
          });
        }
      }
      const stackedCount = Array.from(groups.values()).filter(g => g.length > 1).length;
      if (stackedCount > 0) {
        console.log(`[DayMap "${heading}"] ${stackedCount} location bucket(s) had multiple pins — spread on a 250m ring`);
      }
      if (!cancelled) {
        setPinCount(resolved.length);
        setLegCount(Math.max(0, resolved.length - 1));
        setLegRoutedCount(0);
      }
      onPlacesResolved?.(resolved.map(p => p.name));

      const map = mapRef.current;
      if (!map) return;

      if (resolved.length === 0) {
        map.panTo({ lat: center[1], lng: center[0] });
        map.setZoom(11);
        if (!cancelled) setReady(true);
        return;
      }

      // Add numbered pin markers. Gold for monument-ish names so the visual
      // matches the per-row gold treatment in ActivityBlock.
      resolved.forEach((p, i) => {
        const isMonument = /monument|quest|⚠|temple|shrine|cathedral|landmark|tower|palace|castle/i.test(p.name);
        const isFirst = i === 0;
        // Smaller + semi-transparent so overlapping pins stay readable
        // through each other. First pin (next-up) gets a subtle size +
        // opacity bump so it's still spottable. Quest stops keep the
        // gold tint; everything else stays in the purple theme.
        const baseRGB = isMonument ? '251, 191, 36' : '167, 139, 250';
        const fillAlpha = isFirst ? 0.92 : 0.72;
        const borderAlpha = isFirst ? 0.95 : 0.55;
        const size = isFirst ? 22 : 18;

        const el = document.createElement('div');
        el.style.cssText = `
          width: ${size}px; height: ${size}px; border-radius: 50%;
          background: rgba(${baseRGB}, ${fillAlpha});
          color: #0a0a1f;
          border: 1.5px solid rgba(10, 10, 31, ${borderAlpha});
          box-shadow: 0 1px 6px rgba(0,0,0,0.35);
          font-size: ${isFirst ? 11 : 10}px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, monospace;
        `;
        el.textContent = String(i + 1);

        // createPurpleMarker accepts { lat, lng } — convert from [lng, lat].
        const pm = createPurpleMarker(map, { lat: p.coords[1], lng: p.coords[0] }, { label: p.name });
        // Override the default dot element with our numbered circle.
        pm.marker.content = el;
        markersRef.current.push(pm);
      });

      // Route line — one segment per leg. For flight/ferry legs (legModes[i]
      // === null) draw a geodesic dashed straight line. For routable modes,
      // call fetchDirections and draw the decoded polyline; fall back to a
      // dashed straight line if the request fails.
      // unmountedRef guards the async loop so we don't write to a torn-down
      // map after the component unmounts mid-iteration.
      async function drawLegs() {
        for (let i = 0; i < resolved.length - 1; i++) {
          if (cancelled || unmountedRef.current || !mapRef.current) return;

          const a = { lat: resolved[i].coords[1], lng: resolved[i].coords[0] };
          const b = { lat: resolved[i + 1].coords[1], lng: resolved[i + 1].coords[0] };
          const rawMode = legModes?.[i] ?? null;

          if (rawMode === null) {
            // Flight / ferry: geodesic dashed straight line.
            const seg = drawRoute(mapRef.current, [a, b], { dashed: true, geodesic: true });
            routeRef.current.push(seg.polyline);
            continue;
          }

          const routeMode = rawMode as RouteMode;

          if (!modeUsesDirections(routeMode)) {
            const seg = drawRoute(mapRef.current, [a, b], { dashed: true, geodesic: true });
            routeRef.current.push(seg.polyline);
            continue;
          }

          const directions = await fetchDirections(
            a, b,
            routeMode as Exclude<RouteMode, 'flight' | 'ferry'>,
          );

          if (cancelled || unmountedRef.current || !mapRef.current) return;

          if (directions && directions.points.length > 0) {
            const seg = drawRoute(mapRef.current, directions.points);
            routeRef.current.push(seg.polyline);
            setLegRoutedCount(c => c + 1);
            console.log(`[DayMap] leg ${i} ${routeMode} → routed (${directions.points.length} points)`);
          } else {
            const seg = drawRoute(mapRef.current, [a, b], { dashed: true });
            routeRef.current.push(seg.polyline);
            console.warn(`[DayMap] leg ${i} ${routeMode} → no route returned, using straight line`);
          }
        }
      }
      drawLegs();
      // Fit bounds to markers.
      const bounds = new google.maps.LatLngBounds();
      resolved.forEach(p => bounds.extend({ lat: p.coords[1], lng: p.coords[0] }));
      bounds.extend({ lat: center[1], lng: center[0] });
      if (!bounds.isEmpty()) map.fitBounds(bounds);

      if (!cancelled) setReady(true);
    }

    loadData();
    return () => { cancelled = true; };
  }, [heading, lines, location, namedPlaces, placeCandidates, legModes, mapReady, onPlacesResolved]);

  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      <div ref={divRef} style={{ width: '100%', height }} />

      {!ready && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(10,10,31,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '5px 10px',
          color: 'rgba(255,255,255,0.6)', fontSize: 10.5,
          fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#a78bfa', animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          Loading
        </div>
      )}

      {ready && pinCount > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, right: 10,
          background: 'rgba(10,10,31,0.85)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '5px 10px',
          color: 'rgba(255,255,255,0.7)', fontSize: 10,
          fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
          pointerEvents: 'none',
        }}>
          {pinCount} stop{pinCount === 1 ? '' : 's'} · {legRoutedCount}/{legCount} routed
        </div>
      )}
    </div>
  );
}




