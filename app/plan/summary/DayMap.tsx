'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

// ── Types & constants ──────────────────────────────────────────────────────────
type TransportMode = 'walking' | 'cycling' | 'driving' | 'transit' | 'flight';

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

const MODE_STYLE: Record<TransportMode, { color: string; label: string; gmMode: string | null }> = {
  walking: { color: '#16a34a', label: 'Walking route',  gmMode: 'WALKING'   },
  cycling: { color: '#ea580c', label: 'Cycling route',  gmMode: 'BICYCLING' },
  transit: { color: '#d97706', label: 'Transit route',  gmMode: 'TRANSIT'   },
  driving: { color: '#4f46e5', label: 'Driving route',  gmMode: 'DRIVING'   },
  flight:  { color: '#9333ea', label: 'Flight path',    gmMode: null        },
};

// ── Step icon SVGs ─────────────────────────────────────────────────────────────
function stepIconSvg(gmMode: string, vehicleType?: string): string {
  const S = 26;
  const bg = '#fff';
  let strokeColor = '#4f46e5';
  let shape = '';

  if (gmMode === 'WALKING') {
    strokeColor = '#16a34a';
    shape = `
      <circle cx="13" cy="5.5" r="2" fill="${strokeColor}"/>
      <line x1="13" y1="7.5" x2="13" y2="14" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="13" y1="10" x2="10" y2="13" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="13" y1="10" x2="16" y2="13" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="13" y1="14" x2="10.5" y2="19" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="13" y1="14" x2="15.5" y2="19" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>`;
  } else if (gmMode === 'BICYCLING') {
    strokeColor = '#ea580c';
    shape = `
      <circle cx="8"  cy="16" r="3.5" fill="none" stroke="${strokeColor}" stroke-width="1.6"/>
      <circle cx="18" cy="16" r="3.5" fill="none" stroke="${strokeColor}" stroke-width="1.6"/>
      <path d="M13 8 L18 16 M13 8 L8 16 M13 8 L15 12 L8 16" fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="11" y1="8" x2="15" y2="8" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round"/>`;
  } else if (gmMode === 'TRANSIT') {
    if (vehicleType === 'FERRY') {
      strokeColor = '#0284c7';
      shape = `
        <path d="M5 15 Q13 20 21 15 L20 17 Q13 22 6 17 Z" fill="${strokeColor}"/>
        <rect x="9" y="11" width="8" height="4" rx="1.5" fill="${strokeColor}"/>
        <line x1="13" y1="7" x2="13" y2="11" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round"/>`;
    } else if (vehicleType === 'BUS' || vehicleType === 'TROLLEYBUS') {
      strokeColor = '#d97706';
      shape = `
        <rect x="6" y="8" width="14" height="11" rx="2" fill="none" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="8"  cy="10" x="8"  y="10" width="4" height="3" rx="0.8" fill="${strokeColor}"/>
        <rect x="14" y="10" width="4" height="3" rx="0.8" fill="${strokeColor}"/>
        <circle cx="9"  cy="20.5" r="1.8" fill="${strokeColor}"/>
        <circle cx="17" cy="20.5" r="1.8" fill="${strokeColor}"/>`;
    } else {
      // SUBWAY / RAIL / TRAM / default transit = train
      strokeColor = '#d97706';
      shape = `
        <rect x="7" y="7" width="12" height="11" rx="2.5" fill="none" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="9"  y="9"  width="3" height="2.5" rx="0.6" fill="${strokeColor}"/>
        <rect x="14" y="9"  width="3" height="2.5" rx="0.6" fill="${strokeColor}"/>
        <line x1="7" y1="14" x2="19" y2="14" stroke="${strokeColor}" stroke-width="1.2"/>
        <circle cx="9.5"  cy="19.5" r="2"   fill="${strokeColor}"/>
        <circle cx="16.5" cy="19.5" r="2"   fill="${strokeColor}"/>`;
    }
  } else if (gmMode === 'FLIGHT') {
    strokeColor = '#9333ea';
    shape = `
      <path d="M13 5 L15 11 L21 13 L15 15 L13 21 L11 15 L5 13 L11 11 Z" fill="${strokeColor}"/>`;
  } else {
    // DRIVING / default — small car
    strokeColor = '#4f46e5';
    shape = `
      <rect x="6" y="12" width="14" height="7" rx="2" fill="none" stroke="${strokeColor}" stroke-width="1.6"/>
      <path d="M8 12 L10 8 L16 8 L18 12" fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="9.5"  cy="20" r="2" fill="${strokeColor}"/>
      <circle cx="16.5" cy="20" r="2" fill="${strokeColor}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    <circle cx="${S/2}" cy="${S/2}" r="${S/2-1}" fill="${bg}" stroke="${strokeColor}" stroke-width="2"/>
    ${shape}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function detectMode(lines: string[]): TransportMode {
  const text = lines.join(' ').toLowerCase();
  // Only treat as flight if the day is explicitly a travel/transit day between cities.
  // Mentioning "airport" or "flight" in passing (e.g. "arrive at airport") on a day
  // that also has local activities should not trigger inter-continental flight paths.
  const flightKeywords = /\b(take.*flight|board.*plane|depart.*airport|fly from|flight from|fly to)\b/;
  if (flightKeywords.test(text)) return 'flight';
  if (/\b(subway|metro|tube|underground|tram|train|rail|bus|transit|shuttle)\b/.test(text)) return 'transit';
  if (/\b(bike|cycling|cycle|bicycle|scooter)\b/.test(text)) return 'cycling';
  if (/\b(walk|stroll|on foot|hike|hiking|pedestrian|wander|wanders|strolling)\b/.test(text)) return 'walking';
  return 'driving';
}

function extractPlaces(lines: string[]): Array<{ name: string; snippet: string }> {
  const seen = new Set<string>();
  const results: Array<{ name: string; snippet: string }> = [];
  for (const line of lines) {
    const boldMatches = [...line.matchAll(/\*\*([A-Z][^*]{1,50})\*\*/g)];
    for (const m of boldMatches) {
      const name = m[1].trim();
      if (GENERIC_WORDS.has(name.split(/[\s(]/)[0])) continue;
      if (!seen.has(name)) {
        seen.add(name);
        results.push({ name, snippet: line.replace(/\*\*/g, '').slice(0, 120) });
      }
    }
    if (results.length >= 12) break;
  }
  return results;
}

function pinSvgUrl(index: number, color: string, large: boolean): string {
  const size = large ? 36 : 28;
  const r = size / 2;
  const h = size + 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${h}" viewBox="0 0 ${size} ${h}">
    <circle cx="${r}" cy="${r}" r="${r - 1.5}" fill="${color}" stroke="white" stroke-width="2.5"/>
    <text x="${r}" y="${r + Math.round(size * 0.16)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.round(size * 0.42)}" font-weight="bold" fill="#fff">${index + 1}</text>
    <path d="M${r - 6},${size - 2} L${r},${h} L${r + 6},${size - 2}" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function infoHtml(name: string, snippet: string, color: string, photo?: string): string {
  const photoBlock = photo
    ? `<div style="margin:-12px -12px 10px;overflow:hidden;border-radius:10px 10px 0 0;height:150px;">
         <img src="${photo}" style="width:calc(100% + 24px);height:150px;object-fit:cover;display:block;margin-left:-12px;" />
       </div>`
    : '';
  return `<div style="background:#0d1117;padding:12px;color:#fff;font-family:system-ui,-apple-system,sans-serif;min-width:200px;max-width:260px;box-sizing:border-box;">
    ${photoBlock}
    <p style="font-weight:700;color:${color};margin:0 0 5px;font-size:13px;">${name}</p>
    <p style="margin:0;color:rgba(255,255,255,0.6);font-size:11px;line-height:1.5;">${snippet}</p>
  </div>`;
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Place { name: string; coords: { lat: number; lng: number }; snippet: string; }

interface DayMapProps {
  heading: string;
  lines: string[];
  location: string;
  height?: number;
  namedPlaces?: string[];
  onPlacesResolved?: (names: string[]) => void;
}

export default function DayMap({ heading, lines, location, height = 220, namedPlaces, onPlacesResolved }: DayMapProps) {
  const divRef         = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<google.maps.Map | null>(null);
  const geocoderRef    = useRef<google.maps.Geocoder | null>(null);
  const placesRef      = useRef<google.maps.places.PlacesService | null>(null);
  const dirSvcRef      = useRef<google.maps.DirectionsService | null>(null);
  const dirRdrRef      = useRef<google.maps.DirectionsRenderer | null>(null);
  const flightPolyRef  = useRef<google.maps.Polyline | null>(null);
  const markersRef     = useRef<google.maps.Marker[]>([]);
  const stepMarkersRef = useRef<google.maps.Marker[]>([]);
  const infoWinRef     = useRef<google.maps.InfoWindow | null>(null);
  const photoCacheRef  = useRef<Map<string, string>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [ready, setReady]       = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const hasLoadedOnce           = useRef(false);
  const loadKeyRef              = useRef('');
  const [mode, setMode]         = useState<TransportMode>('driving');
  const [places, setPlaces]     = useState<Place[]>([]);

  // ── IntersectionObserver — only geocode when scrolled into view ───────────
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); } },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Init map once ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadGoogleMaps();
      if (cancelled || !divRef.current) return;

      if (mapRef.current) { if (!cancelled) setMapReady(true); return; }

      // Geocode the destination so the map opens centered on it immediately
      let initialCenter: google.maps.LatLngLiteral = { lat: 35.6895, lng: 139.6917 };
      if (location) {
        try {
          const geo = new google.maps.Geocoder();
          const res = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) =>
            geo.geocode({ address: location }, (results, status) =>
              status === 'OK' && results ? resolve(results) : reject(status)
            )
          );
          if (res[0]) {
            initialCenter = {
              lat: res[0].geometry.location.lat(),
              lng: res[0].geometry.location.lng(),
            };
          }
        } catch { /* fall back to Tokyo */ }
      }

      const map = new google.maps.Map(divRef.current!, {
        zoom: 12,
        center: initialCenter,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      });

      mapRef.current      = map;
      geocoderRef.current = new google.maps.Geocoder();
      placesRef.current   = new google.maps.places.PlacesService(map);
      dirSvcRef.current   = new google.maps.DirectionsService();

      const rdr = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#4f46e5', strokeWeight: 4, strokeOpacity: 0.85 },
      });
      rdr.setMap(map);
      dirRdrRef.current  = rdr;
      infoWinRef.current = new google.maps.InfoWindow({ disableAutoPan: false });

      if (!cancelled) setMapReady(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // ── Load data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !isVisible) return;

    // Stable content key — skip re-load if geocoding inputs haven't actually changed
    const placeTokens = namedPlaces ?? lines.filter(l => /\*\*[A-Z]/.test(l)).slice(0, 20);
    const loadKey = JSON.stringify({ heading, location, placeTokens });
    if (loadKey === loadKeyRef.current) return;
    loadKeyRef.current = loadKey;

    let cancelled = false;

    // Clear previous overlays
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    stepMarkersRef.current.forEach(m => m.setMap(null));
    stepMarkersRef.current = [];
    if (dirRdrRef.current) { dirRdrRef.current.setMap(null); dirRdrRef.current.setMap(mapRef.current!); }
    flightPolyRef.current?.setMap(null);
    flightPolyRef.current = null;
    infoWinRef.current?.close();
    if (!hasLoadedOnce.current) setReady(false);

    async function geocode(address: string, _bounds?: google.maps.LatLngBoundsLiteral): Promise<{ lat: number; lng: number } | null> {
      // Layer 1: sessionStorage (instant, client-only)
      const cacheKey = `geo:${address}`;
      try {
        const hit = sessionStorage.getItem(cacheKey);
        if (hit) return JSON.parse(hit) as { lat: number; lng: number };
      } catch { /* unavailable */ }

      // Layer 2: server-side cached route (free re-use across all users)
      try {
        const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
        if (res.ok) {
          const coords = await res.json() as { lat: number; lng: number } | null;
          if (coords) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify(coords)); } catch { /* ignore */ }
            return coords;
          }
        }
      } catch { /* fallback to client geocoder */ }

      // Layer 3: client-side Geocoder fallback
      return new Promise(resolve => {
        geocoderRef.current!.geocode({ address }, (results, status) => {
          if (status === 'OK' && results?.[0]) {
            const loc = results[0].geometry.location;
            const coords = { lat: loc.lat(), lng: loc.lng() };
            try { sessionStorage.setItem(cacheKey, JSON.stringify(coords)); } catch { /* ignore */ }
            resolve(coords);
          } else resolve(null);
        });
      });
    }

    function addPlaceModeIcons(places: Place[], gmMode: string) {
      // One transport icon per destination — anchored above each numbered pin
      places.forEach(place => {
        const marker = new google.maps.Marker({
          position: place.coords,
          map: mapRef.current!,
          icon: {
            url: stepIconSvg(gmMode),
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 44), // sits just above the numbered pin tip
          },
          zIndex: 6,
        });
        stepMarkersRef.current.push(marker);
      });
    }

    async function loadData() {
      const detectedMode = detectMode(lines);
      if (!cancelled) setMode(detectedMode);

      // Always anchor to the destination (e.g. "Houston") — never the departure city
      const anchor = await geocode(location);
      if (!anchor || cancelled) return;

      // Extract city from heading (e.g. "Day 1: Houston" → "Houston")
      // Fall back to location prop so we never lose the destination context
      const cityMatch = heading.match(/:\s*([^—–\-|,\n]+)/);
      const rawCity   = cityMatch ? cityMatch[1].trim() : '';
      const city      = rawCity || location;

      let center = anchor;
      // Only re-geocode if heading city is meaningfully different from location
      if (rawCity && rawCity.toLowerCase() !== location.toLowerCase()) {
        // Tight bias: within 8° of destination so we never jump continents
        const bias: google.maps.LatLngBoundsLiteral = { north: anchor.lat + 8, south: anchor.lat - 8, east: anchor.lng + 8, west: anchor.lng - 8 };
        const cc = await geocode(city, bias);
        if (cc) center = cc;
      }
      if (cancelled) return;

      const rawPlaces = namedPlaces
        ? namedPlaces.map(n => ({ name: n, snippet: n }))
        : extractPlaces(lines);

      // Very tight bias: 0.5° (~55km) around the destination city center
      // This prevents "Space Needle" geocoding to somewhere in Europe
      const bias: google.maps.LatLngBoundsLiteral = {
        north: center.lat + 0.5, south: center.lat - 0.5,
        east:  center.lng + 0.5, west:  center.lng - 0.5,
      };

      // Geocode all places in parallel — much faster than sequential awaits
      const geocodeResults = await Promise.all(
        rawPlaces.map(async p => {
          const query = `${p.name}, ${city}`;
          const coords = await geocode(query, bias);
          // Reject results more than 1.5°/2.0° outside center — continent guard
          if (coords && Math.abs(coords.lat - center.lat) < 1.5 && Math.abs(coords.lng - center.lng) < 2.0) {
            return { name: p.name, coords, snippet: p.snippet } as Place;
          }
          return null;
        })
      );
      if (cancelled) return;
      const resolved = geocodeResults.filter((p): p is Place => p !== null);

      setPlaces(resolved);
      onPlacesResolved?.(resolved.map(p => p.name));

      const ms = MODE_STYLE[detectedMode];

      // Add numbered place markers
      resolved.forEach((place, i) => {
        const large = i === 0;
        const size = large ? 36 : 28;
        const marker = new google.maps.Marker({
          position: place.coords,
          map: mapRef.current!,
          icon: {
            url: pinSvgUrl(i, ms.color, large),
            scaledSize: new google.maps.Size(size, size + 12),
            anchor: new google.maps.Point(size / 2, size + 12),
          },
          zIndex: large ? 10 : 5,
        });

        marker.addListener('click', async () => {
          const iw = infoWinRef.current!;
          const cached = photoCacheRef.current.get(place.name);
          iw.setContent(infoHtml(place.name, place.snippet, ms.color, cached));
          iw.open(mapRef.current!, marker);

          if (!cached && placesRef.current) {
            placesRef.current.textSearch(
              { query: place.name, location: place.coords, radius: 2000 },
              (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results?.[0]?.photos?.[0]) {
                  const url = results[0].photos[0].getUrl({ maxWidth: 300, maxHeight: 200 });
                  photoCacheRef.current.set(place.name, url);
                  iw.setContent(infoHtml(place.name, place.snippet, ms.color, url));
                }
              }
            );
          }
        });

        markersRef.current.push(marker);
      });

      // Route / flight path
      if (resolved.length >= 2) {
        if (detectedMode === 'flight') {
          // Dashed flight polyline + plane icon at midpoint
          const path = resolved.map(p => p.coords);
          const poly = new google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: ms.color,
            strokeOpacity: 0,
            strokeWeight: 2,
            icons: [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, scale: 3, strokeColor: ms.color },
              offset: '0', repeat: '14px',
            }],
          });
          poly.setMap(mapRef.current!);
          flightPolyRef.current = poly;

          addPlaceModeIcons(resolved, 'FLIGHT');
        } else if (ms.gmMode && dirSvcRef.current && dirRdrRef.current) {
          const waypts = resolved.slice(1, -1).map(p => ({
            location: new google.maps.LatLng(p.coords.lat, p.coords.lng),
            stopover: true,
          }));

          const tryRoute = (travelMode: google.maps.TravelMode, color: string) => {
            if (!dirSvcRef.current || !dirRdrRef.current) return;
            const req: google.maps.DirectionsRequest = {
              origin: resolved[0].coords,
              destination: resolved[resolved.length - 1].coords,
              waypoints: waypts,
              travelMode,
              provideRouteAlternatives: false,
            };
            if (travelMode === google.maps.TravelMode.TRANSIT) {
              req.transitOptions = { departureTime: new Date() };
            }
            dirSvcRef.current.route(req, (result, status) => {
              if (status === 'OK' && result && dirRdrRef.current) {
                dirRdrRef.current.setOptions({
                  polylineOptions: { strokeColor: color, strokeWeight: 4, strokeOpacity: 0.85 },
                });
                dirRdrRef.current.setDirections(result);
                addPlaceModeIcons(resolved, travelMode as unknown as string);
              } else if (status !== 'OK' && travelMode !== google.maps.TravelMode.DRIVING) {
                tryRoute(google.maps.TravelMode.DRIVING, MODE_STYLE.driving.color);
              }
            });
          };

          tryRoute(ms.gmMode as google.maps.TravelMode, ms.color);
        }
      }

      // Fit bounds
      const bounds = new google.maps.LatLngBounds();
      resolved.forEach(p => bounds.extend(p.coords));
      bounds.extend(center);
      if (resolved.length > 0) {
        mapRef.current!.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
        if (resolved.length <= 1) mapRef.current!.setZoom(14);
      } else {
        mapRef.current!.setCenter(center);
        mapRef.current!.setZoom(12);
      }

      if (!cancelled) { hasLoadedOnce.current = true; setReady(true); }
    }

    loadData();
    return () => { cancelled = true; };
  }, [heading, lines, location, namedPlaces, mapReady, isVisible]);

  const ms = MODE_STYLE[mode];

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
      <div ref={divRef} style={{ width: '100%', height }} />

      {ready && places.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 10, left: 10,
          background: 'rgba(255,255,255,0.92)', border: `1.5px solid ${ms.color}`,
          borderRadius: 6, padding: '3px 10px', color: ms.color,
          fontSize: 11, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          pointerEvents: 'none',
        }}>
          {ms.label}
        </div>
      )}

      {!ready && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.55)', pointerEvents: 'none',
        }}>
          <span style={{ color: 'rgba(0,0,0,0.4)', fontSize: 12 }}>{'Loading map\u2026'}</span>
        </div>
      )}
    </div>
  );
}
