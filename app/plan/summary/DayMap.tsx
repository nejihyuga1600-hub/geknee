'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Mapbox-based per-day map. Replaces the previous Google Maps implementation
// (Geocoder + DirectionsService + PlacesService + InfoWindow) with a much
// lighter pipeline: server-cached geocode lookups via /api/geocode, numbered
// HTML markers, and a Mapbox Directions walking route line. The route is
// computed client-side from the resolved waypoints and falls back to a
// straight polyline if the directions call fails.

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

interface Place { name: string; coords: [number, number] }  // [lng, lat]

interface DayMapProps {
  heading: string;
  lines: string[];
  location: string;
  height?: number;
  namedPlaces?: string[];
  // Mode of transit per leg (length = namedPlaces.length - 1). Each entry
  // tells DayMap which Mapbox Directions profile to use for that segment
  // ('walking' | 'cycling' | 'driving' | null). null skips routing for
  // that leg and falls back to a straight line — appropriate for flights
  // and ferries that Mapbox Directions can't handle.
  legModes?: Array<'walking' | 'cycling' | 'driving' | null>;
  onPlacesResolved?: (names: string[]) => void;
}

export default function DayMap({
  heading, lines, location, height = 220, namedPlaces, legModes, onPlacesResolved,
}: DayMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const loadKeyRef = useRef('');

  const [isVisible, setIsVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [ready, setReady] = useState(false);

  // Safety timeout: even if geocode and map.on('load') both stall, never
  // leave the "Loading map…" overlay visible for more than 6 s. The dark
  // base map is preferable to an indefinite spinner.
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setReady(true), 6000);
    return () => clearTimeout(t);
  }, [ready]);
  const [tokenMissing, setTokenMissing] = useState(false);

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
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) { setTokenMissing(true); return; }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: divRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [139.6917, 35.6895],
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: true,
    });

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        // FeatureCollection so each leg can carry its own 'mode' property
        // and the line layer can color it via a match expression.
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // Color per leg by transit mode: walking=purple, cycling=green,
          // driving=orange, unknown=neutral lavender. Reads the 'mode'
          // property each LineString carries so multi-leg days can mix.
          'line-color': [
            'match',
            ['coalesce', ['get', 'mode'], 'unknown'],
            'walking',  '#a78bfa',
            'cycling',  '#34d399',
            'driving',  '#fbbf24',
            /* default */ '#a78bfa',
          ],
          'line-width': 4,
          'line-opacity': 0.9,
        },
      });
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      try { map.remove(); } catch { /* already gone */ }
      mapRef.current = null;
    };
  }, [isVisible]);

  // Geocode + render route + markers.
  useEffect(() => {
    if (!mapReady) return;

    const placeTokens = namedPlaces ?? lines.filter(l => /\*\*[A-Z]/.test(l)).slice(0, 20);
    const loadKey = JSON.stringify({ heading, location, placeTokens });
    if (loadKey === loadKeyRef.current) return;
    loadKeyRef.current = loadKey;

    let cancelled = false;

    // Clear previous markers and route line.
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const src = mapRef.current?.getSource('route') as mapboxgl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: [] });

    async function geocode(address: string): Promise<[number, number] | null> {
      const cacheKey = `geo:${address}`;
      // Layer 1: sessionStorage — instant, client-only.
      try {
        const hit = sessionStorage.getItem(cacheKey);
        if (hit) {
          const c = JSON.parse(hit) as { lat: number; lng: number };
          return [c.lng, c.lat];
        }
      } catch { /* sessionStorage unavailable */ }
      // Layer 2: server-cached /api/geocode (Google Geocoding under the
      // hood). Auth-gated, so silently fails for unauthed sessions or
      // when the Google key is missing — that's fine, we have a backup.
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
      // Layer 3: Mapbox Geocoding API direct, using the same public
      // token already in use for the map tiles. Free up to ~100K
      // req/month, no auth boundary, so it works even when /api/geocode
      // is failing (auth lapse, missing Google key, etc.). This is the
      // fix for the "map stuck in Tokyo (Shinjuku)" bug — without it,
      // the map's hardcoded fallback center stayed visible.
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (token) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${token}&limit=1`;
          const r = await fetch(url);
          if (r.ok) {
            const d = await r.json() as { features?: Array<{ center: [number, number] }> };
            const center = d.features?.[0]?.center;
            if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
              try { sessionStorage.setItem(cacheKey, JSON.stringify({ lat: center[1], lng: center[0] })); } catch { /* ignore */ }
              return center;
            }
          }
        } catch { /* network */ }
      }
      return null;
    }

    async function loadData() {
      // Always anchor to the destination passed in. The previous
      // heading-regex fallback was matching descriptive day titles
      // ("Day 1: Arrival & The Iconic Sunrise at the Taj") and treating
      // them as cities — which sent geocoding all over the country and
      // produced the "3 cities in one day" pin spread the user saw.
      // SectionCard already passes the right city via `location` for
      // both single-stop and per-city sections, so trust it.
      const anchor = await geocode(location);
      if (cancelled || !mapRef.current) return;
      if (!anchor) {
        // Geocode failed (auth lapse, missing API key, network blip).
        // Don't leave the user staring at "Loading map…" forever — flip
        // ready so the overlay clears and the dark base map shows
        // through. Pins won't render but at least the UI moves on.
        setReady(true);
        return;
      }
      const center = anchor;
      const city = location;

      const rawPlaces = namedPlaces
        ? namedPlaces.map(n => ({ name: n }))
        : extractPlaces(lines);

      // Multi-strategy geocoding. The LLM frequently invents specific
      // restaurant names ("Shankara Vegis Restaurant") that don't exist
      // in any POI database; without fallbacks, those activities never
      // get a pin. Try a chain of progressively broader queries until
      // one resolves inside the city bbox.
      function inBbox(coords: [number, number]): boolean {
        return Math.abs(coords[1] - center[1]) < 0.6 && Math.abs(coords[0] - center[0]) < 0.9;
      }
      async function resolvePlace(name: string): Promise<[number, number] | null> {
        const tries: string[] = [];
        const cleaned = name.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        // 1. Exact name + city.
        tries.push(`${name}, ${city}`);
        if (cleaned !== name) tries.push(`${cleaned}, ${city}`);
        // 2. Strip leading qualifiers ("the X", "a X").
        const noArticle = cleaned.replace(/^(?:the|a|an)\s+/i, '');
        if (noArticle !== cleaned) tries.push(`${noArticle}, ${city}`);
        // 3. If the name has commas or "in/at/near", split and try the
        //    later (broader) chunks too — often a neighborhood/area.
        const chunks = cleaned.split(/[,]| (?:in|at|near|by) /i).map(s => s.trim()).filter(Boolean);
        for (let i = 1; i < chunks.length; i++) {
          tries.push(`${chunks[i]}, ${city}`);
        }
        // 4. Drop generic suffixes that often kill the match
        //    ("Restaurant", "Hotel", "Cafe").
        const stripped = cleaned.replace(/\s+(restaurant|hotel|cafe|café|bar|lounge|bistro|eatery|inn|motel)\s*$/i, '').trim();
        if (stripped && stripped !== cleaned) tries.push(`${stripped}, ${city}`);
        // De-dupe.
        const seen = new Set<string>();
        for (const q of tries) {
          if (seen.has(q.toLowerCase())) continue;
          seen.add(q.toLowerCase());
          const c = await geocode(q);
          if (c && inBbox(c)) return c;
        }
        return null;
      }
      const results = await Promise.all(rawPlaces.map(async p => {
        const coords = await resolvePlace(p.name);
        return coords ? ({ name: p.name, coords } as Place) : null;
      }));
      if (cancelled || !mapRef.current) return;

      const resolved = results.filter((p): p is Place => !!p);
      onPlacesResolved?.(resolved.map(p => p.name));

      if (resolved.length === 0) {
        // Center on city, no markers.
        mapRef.current.flyTo({ center, zoom: 11, duration: 400 });
        if (!cancelled) setReady(true);
        return;
      }

      // Add numbered pin markers. Gold for monument-ish names so the visual
      // matches the per-row gold treatment in ActivityBlock.
      resolved.forEach((p, i) => {
        const isMonument = /monument|quest|⏚|temple|shrine|cathedral|landmark|tower|palace|castle/i.test(p.name);
        const isFirst = i === 0;
        const color = isMonument ? '#fbbf24' : '#a78bfa';
        const size = isFirst ? 32 : 26;

        const el = document.createElement('div');
        el.style.cssText = `
          width: ${size}px; height: ${size}px; border-radius: 50%;
          background: ${color}; color: #0a0a1f;
          border: 2px solid #0a0a1f;
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
          font-size: ${isFirst ? 13 : 11}px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-family: ui-monospace, monospace;
        `;
        el.textContent = String(i + 1);

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat(p.coords)
          .addTo(mapRef.current!);
        markersRef.current.push(marker);
      });

      // Route line — one feature per leg, each carrying the transit mode
      // ('walking' | 'cycling' | 'driving' | null) so the line layer can
      // color-code by mode of transit. Synchronously paint straight legs
      // first (always visible), then fire per-leg directions fetches and
      // swap each leg in as it returns.
      type LegFeature = GeoJSON.Feature<GeoJSON.LineString, { mode: string; legIdx: number }>;
      const lineSrc = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource | undefined;
      const features: LegFeature[] = [];
      for (let i = 0; i < resolved.length - 1; i++) {
        features.push({
          type: 'Feature',
          properties: { mode: legModes?.[i] ?? 'walking', legIdx: i },
          geometry: {
            type: 'LineString',
            coordinates: [resolved[i].coords, resolved[i + 1].coords],
          },
        });
      }
      lineSrc?.setData({ type: 'FeatureCollection', features });

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (token && features.length > 0) {
        // One Directions request per leg with that leg's specific profile.
        // Mapbox doesn't have a transit profile, so subway/bus/train modes
        // collapse to 'driving' (which still routes along roads). Flights
        // and ferries (mode === null) skip the request and keep the
        // straight-line leg.
        for (let i = 0; i < features.length; i++) {
          const mode = legModes?.[i];
          if (mode === null) continue; // flight / ferry — straight line is best we can do
          const profile = mode ?? 'walking';
          const a = resolved[i].coords, b = resolved[i + 1].coords;
          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${a[0]},${a[1]};${b[0]},${b[1]}?access_token=${token}&geometries=geojson&overview=full`;
          fetch(url)
            .then(res => res.ok ? res.json() as Promise<{ routes?: { geometry: { coordinates: [number, number][] } }[] }> : null)
            .then(data => {
              if (cancelled) return;
              const routed = data?.routes?.[0]?.geometry?.coordinates;
              if (!routed || routed.length === 0) return;
              const stillSrc = mapRef.current?.getSource('route') as mapboxgl.GeoJSONSource | undefined;
              if (!stillSrc) return;
              // Update only THIS leg's geometry, keep other legs intact.
              features[i] = {
                type: 'Feature',
                properties: { mode: profile, legIdx: i },
                geometry: { type: 'LineString', coordinates: routed },
              };
              stillSrc.setData({ type: 'FeatureCollection', features: [...features] });
            })
            .catch(() => { /* keep straight leg */ });
        }
      }

      // Fit bounds to all markers + city anchor with generous padding.
      const bounds = new mapboxgl.LngLatBounds();
      resolved.forEach(p => bounds.extend(p.coords));
      bounds.extend(center);
      mapRef.current.fitBounds(bounds, {
        padding: { top: 40, right: 40, bottom: 50, left: 40 },
        maxZoom: 14, duration: 600,
      });

      if (!cancelled) setReady(true);
    }

    loadData();
    return () => { cancelled = true; };
  }, [heading, lines, location, namedPlaces, legModes, mapReady, onPlacesResolved]);

  if (tokenMissing) {
    return (
      <div style={{
        height, borderRadius: 12, padding: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.5)', fontSize: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        Map unavailable — set <code style={{ color: '#a78bfa' }}>NEXT_PUBLIC_MAPBOX_TOKEN</code>.
      </div>
    );
  }

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
    </div>
  );
}
