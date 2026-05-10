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
  onPlacesResolved?: (names: string[]) => void;
}

export default function DayMap({
  heading, lines, location, height = 220, namedPlaces, onPlacesResolved,
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
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a78bfa',
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
    src?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: {},
    });

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

      const results = await Promise.all(rawPlaces.map(async p => {
        const coords = await geocode(`${p.name}, ${city}`);
        // Tight bias: reject anything more than ~0.6° lat / 0.9° lng off
        // the city anchor (~65 km radius). A single day's stops should
        // fit within that — anything outside is almost certainly a
        // wrong-city geocode hit and would visually destroy the day map.
        if (coords && Math.abs(coords[1] - center[1]) < 0.6 && Math.abs(coords[0] - center[0]) < 0.9) {
          return { name: p.name, coords } as Place;
        }
        return null;
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

      // Route line — paint a straight-line polygon SYNCHRONOUSLY so the user
      // always sees the connections immediately, then asynchronously upgrade
      // to a Mapbox Directions walking route that follows actual streets.
      // Earlier version awaited the directions call inline, so a slow or
      // failed fetch (or a re-render that flipped `cancelled` mid-await) left
      // the line empty.
      const lineSrc = mapRef.current.getSource('route') as mapboxgl.GeoJSONSource | undefined;
      const straightCoords: [number, number][] = resolved.map(p => p.coords);
      lineSrc?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: straightCoords },
        properties: {},
      });
      if (resolved.length >= 2 && resolved.length <= 25) {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (token) {
          const coordStr = resolved.map(p => `${p.coords[0]},${p.coords[1]}`).join(';');
          const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordStr}?access_token=${token}&geometries=geojson&overview=full`;
          // Fire-and-forget: when the route comes back, swap the line in.
          // Guarded by `cancelled` so a re-render won't paint stale data.
          fetch(url)
            .then(res => res.ok ? res.json() as Promise<{ routes?: { geometry: { coordinates: [number, number][] } }[] }> : null)
            .then(data => {
              if (cancelled) return;
              const routed = data?.routes?.[0]?.geometry?.coordinates;
              if (routed && routed.length > 0) {
                const stillSrc = mapRef.current?.getSource('route') as mapboxgl.GeoJSONSource | undefined;
                stillSrc?.setData({
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: routed },
                  properties: {},
                });
              }
            })
            .catch(() => { /* keep straight line */ });
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
  }, [heading, lines, location, namedPlaces, mapReady, onPlacesResolved]);

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
