'use client';
// 2D Google Maps view for the live-trip page. Centered on the selected day's
// stops (not the user's geolocation), with numbered pin markers for each
// activity and a polyline connecting them in chronological order.
//
// Why a custom component instead of an embed iframe: the planner already
// needs multiple markers + a route, and we want consistent brand styling
// (dark base map, lavender pins). The embed API only supports one marker /
// one directions request, so we drop down to the JS API via the existing
// `loadGoogleMaps` loader (which is already used by the planning views).
//
// Geocoding strategy: for each activity, build a query like
// "<place name>, <city>" and resolve via `PlacesService.findPlaceFromQuery`.
// Falls back to "<city>" centering when no activity has a geocodable place.

import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { useColorScheme } from '@/lib/useColorScheme';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { fetchDirections } from '@/lib/googleMaps/directionsClient';

// Haversine distance in kilometres between two lat/lng points. Used to
// pick the best transport mode per leg without a live API call.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Pick a travel mode from leg distance. Tuned to the reality that within
// a city walking is nicer at short range, transit is the local commute,
// driving takes over between suburbs, and rail is faster than driving
// once you cross a hundred km (city-to-city).
function pickModeForLeg(distKm: number): 'walking' | 'driving' | 'transit' {
  if (distKm < 1.2) return 'walking';
  if (distKm < 5.0) return 'transit';   // urban core
  if (distKm < 100) return 'driving';
  return 'transit';                     // inter-city rail
}

// Per-mode polyline styling. Dashed for walking (breadcrumb), thicker
// solid green for transit so a train leg stands out from a driving leg.
const MODE_STYLE: Record<'walking' | 'driving' | 'transit', {
  color: string; weight: number; dashed: boolean; label: string;
}> = {
  walking: { color: '#a78bfa', weight: 4, dashed: true,  label: 'WALK' },
  driving: { color: '#6366f1', weight: 5, dashed: false, label: 'DRIVE' },
  transit: { color: '#22c55e', weight: 5, dashed: false, label: 'TRANSIT' },
};

interface Activity {
  time: string;
  display: string;
  name: string;
  place: string | null;
}

interface GoogleLiveMapProps {
  city: string | null;
  activities: Activity[];
  /** Day number being shown — used as a remount key so each day's geocoding
      pass starts clean. */
  dayKey?: number;
  /** User's current geolocation. When provided, a pulsing "You are here"
      marker is shown and the map re-centers on it. */
  geo?: { lat: number; lon: number } | null;
  /** Fired when the user clicks an empty spot on the map. Coords are passed
      so the parent can open the add-stop modal pre-seeded with a reverse-
      geocoded place suggestion. */
  onMapClick?: (coords: { lat: number; lon: number }) => void;
  /** Optional map surface height. Defaults to 360 (inline card mode).
      Pass a CSS length like "100dvh" (or a number in px) to make the map
      take over the full viewport. */
  height?: number | string;
  /** True when the map is rendering as a takeover page (position:fixed
      inset:0). Drops the border-radius so the map bleeds edge-to-edge.
      When false (default) the map keeps its inline-card radius even at
      full viewport height, because the parent still has horizontal padding. */
  fullscreen?: boolean;
}

// Dark map style — terse Google Maps Styled Map array tuned for the dark
// trip-page chrome. Reduces POI noise and tints water + roads to brand-on
// values. Keep concise; long style arrays balloon bundle size.
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0c0c1f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a8a8c0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0c0c1f' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a3a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b85' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050514' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7dd3fc' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#15152a' }] },
];

// Light-mode counterpart — paper / parchment palette matching the
// --brand-bg light token. Same POI/transit suppression as dark so the
// activity pins are the only visual emphasis on the surface.
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#efece2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a4a66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f5ee' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6b6b85' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c4dcef' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2e92c4' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#e8e5d9' }] },
];

// Branded numbered pin — small SVG data URL so each marker can have a
// per-stop number on a lavender disc with a white border. Faster than
// drawing custom DivIcon overlays.
function pinIcon(n: number): google.maps.Icon {
  const svg = `
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36' width='36' height='36'>
      <circle cx='18' cy='18' r='15' fill='#a78bfa' stroke='#fff' stroke-width='2.5'/>
      <text x='18' y='23' text-anchor='middle' fill='#0a0a1f' font-family='Inter,system-ui,sans-serif' font-size='15' font-weight='700'>${n}</text>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

export function GoogleLiveMap({ city, activities, dayKey, geo, onMapClick, height = 360, fullscreen = false }: GoogleLiveMapProps) {
  // Border-radius follows the fullscreen flag, not the height. That way
  // an inline "100dvh" map still keeps its 14-px card radius (parent has
  // horizontal padding), and only the true takeover mode goes edge-to-edge.
  const mapRadius = fullscreen ? 0 : 14;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  // Per-leg polylines drawn from real Google Directions results (one
  // segment per pair of consecutive stops, styled by transport mode).
  // The single polylineRef above is a legacy fallback used only if
  // Directions returns nothing for the whole day.
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  // "You are here" pulsing marker, moved / created as geo arrives.
  const youAreHereRef = useRef<google.maps.Marker | null>(null);
  // Ref the click callback so we don't have to re-init the map when the
  // parent's onMapClick identity changes. The listener reads .current.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  // Follow the user's color-scheme preference. Both the map's styled tiles
  // and the polyline color flip when this changes — see the effect below.
  const colorScheme = useColorScheme();
  // When offline, swap the interactive Google Maps JS API for a static
  // <img> map served from /api/map-tile. The Service Worker caches those
  // responses (Phase 2) so users see the trip area instead of a broken
  // map. Pinch-zoom + pan are lost, but the user gets their bearings.
  const online = useOnlineStatus();

  // One-time map init. Centers on a generic default until the activity-
  // resolution effect below pans to the day's first stop.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: 35.0116, lng: 135.768 }, // Kyoto fallback, matches old LiveMap
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          styles: colorScheme === 'light' ? LIGHT_STYLE : DARK_STYLE,
          backgroundColor: colorScheme === 'light' ? '#efece2' : '#0c0c1f',
        });
        mapRef.current = map;

        // Surface map clicks to the parent so the add-stop modal can
        // pre-seed with a reverse-geocoded label. Wrapped in a function
        // declaration (not arrow) so the listener receives the LatLng.
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          const ll = e.latLng;
          if (ll && onMapClickRef.current) {
            onMapClickRef.current({ lat: ll.lat(), lon: ll.lng() });
          }
        });
      })
      .catch(() => {
        /* loader failure surfaces via empty map area — silent */
      });
    return () => {
      cancelled = true;
      youAreHereRef.current?.setMap(null);
      youAreHereRef.current = null;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      mapRef.current = null;
    };
  }, []);

  // Re-style the map when the user's OS color-scheme flips mid-session.
  // setOptions on an existing map avoids the destroy/recreate cost (the
  // init effect runs once on mount).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setOptions({
      styles: colorScheme === 'light' ? LIGHT_STYLE : DARK_STYLE,
      backgroundColor: colorScheme === 'light' ? '#efece2' : '#0c0c1f',
    });
    // Re-tint the active polyline too so the route line matches.
    polylineRef.current?.setOptions({
      strokeColor: colorScheme === 'light' ? '#7c5cf0' : '#a78bfa',
    });
  }, [colorScheme]);

  // Recenter and place/move the pulsing "You are here" marker whenever the
  // browser geolocation updates. The animation is a CSS keyframe injected
  // once via a <style> tag on the marker element's ownerDocument.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo) return;
    map.panTo({ lat: geo.lat, lng: geo.lon });

    if (!youAreHereRef.current) {
      const el = document.createElement('div');
      el.style.cssText = [
        'width:18px', 'height:18px', 'border-radius:50%',
        'background:var(--brand-success,#7cff97)',
        'box-shadow:0 0 0 4px rgba(124,255,151,0.25),0 0 18px rgba(124,255,151,0.55)',
        'animation:livePulse 1.6s ease-in-out infinite',
      ].join(';');
      // Inject keyframes once into the document so the CSS animation works.
      if (!document.getElementById('__glm-pulse-kf')) {
        const s = document.createElement('style');
        s.id = '__glm-pulse-kf';
        s.textContent = '@keyframes livePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:0.5}}';
        document.head.appendChild(s);
      }
      youAreHereRef.current = new google.maps.Marker({
        position: { lat: geo.lat, lng: geo.lon },
        map,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
            '<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'24\' height=\'24\'>' +
            '<circle cx=\'12\' cy=\'12\' r=\'9\' fill=\'rgba(124,255,151,0.9)\' stroke=\'#fff\' stroke-width=\'2\'/>' +
            '<circle cx=\'12\' cy=\'12\' r=\'3\' fill=\'#0a1f12\'/>' +
            '</svg>'),
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 12),
        },
        title: 'You are here',
        zIndex: 200,
      });
    } else {
      youAreHereRef.current.setPosition({ lat: geo.lat, lng: geo.lon });
    }
  }, [geo]);

  // Re-geocode + re-render markers whenever the day or activities list
  // changes. Each iteration clears the previous markers/polyline first so
  // we don't accumulate visuals across day toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      // Map not ready yet — try again after loader settles.
      const id = setTimeout(() => {
        // useEffect re-fires whenever deps change; this timeout retries
        // once the map has initialised on first mount.
        if (mapRef.current) renderStops();
      }, 200);
      return () => clearTimeout(id);
    }
    renderStops();

    function renderStops() {
      const map = mapRef.current!;
      // Clear previous overlays.
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;

      const service = new google.maps.places.PlacesService(map);

      // No activities or no city → center on the city (or stay on fallback).
      if (activities.length === 0 || !city) {
        if (city) {
          service.findPlaceFromQuery(
            { query: city, fields: ['geometry'] },
            (results, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                results?.[0]?.geometry?.location
              ) {
                map.setCenter(results[0].geometry.location);
                map.setZoom(13);
              }
            },
          );
        }
        return;
      }

      // Geocode each activity's place in parallel. Coords sparsely fill
      // by index because some queries may not resolve — that's fine; the
      // polyline + numbered pins skip null entries.
      const coords: Array<google.maps.LatLng | null> = activities.map(() => null);
      let pending = activities.length;

      activities.forEach((a, i) => {
        // Missing-pin fix 2026-08-03: previously we skipped any activity
        // whose `place` field failed extraction, leaving numbered gaps
        // on the day map (user reported missing pins). Now we fall back
        // to the first clause of the activity name as the search query.
        // Google Places is decent at pulling a landmark out of prose
        // ("Explore Lucerna Palace" → "Lucerna Palace, Prague").
        const fallback = a.name
          ? a.name.split(/[.,;—]/)[0].trim().slice(0, 60)
          : null;
        const q = a.place ? `${a.place}, ${city}`
                : fallback ? `${fallback}, ${city}`
                : null;
        if (!q) {
          pending--;
          if (pending === 0) finalize();
          return;
        }
        service.findPlaceFromQuery(
          { query: q, fields: ['geometry'] },
          (results, status) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              results?.[0]?.geometry?.location
            ) {
              const loc = results[0].geometry.location;
              // Coord-level dedupe (2026-08-03): if a prior activity in
              // this day already geocoded within ~15 m of this one, treat
              // them as the same real-world spot and skip the second pin.
              // Fixes user-reported "duplicate numbers on map" cases the
              // name-based dedupe upstream misses (e.g. two differently-
              // worded activities that Places resolves to the same
              // landmark). We still keep the activity in the array so
              // it shows in the LEAVE-BY / timeline; only the pin is
              // suppressed.
              const duplicateOf = coords.findIndex((c, j) => {
                if (j >= i || !c) return false;
                const dLat = (c.lat() - loc.lat()) * 111000;
                const dLng = (c.lng() - loc.lng()) * 111000 * Math.cos(loc.lat() * Math.PI / 180);
                return Math.hypot(dLat, dLng) < 15;
              });
              if (duplicateOf === -1) {
                coords[i] = loc;
                const marker = new google.maps.Marker({
                  position: loc,
                  map,
                  icon: pinIcon(i + 1),
                  title: `${a.display} · ${a.place ?? a.name}`,
                  zIndex: 100 + i,
                });
                markersRef.current.push(marker);
              }
              // else: leave coords[i] null so the polyline path skips this
              // node — otherwise we'd draw a zero-length leg to the
              // already-visible pin.
            }
            pending--;
            if (pending === 0) finalize();
          },
        );
      });

      function finalize() {
        const map = mapRef.current!;
        const cleaned = coords.filter((c): c is google.maps.LatLng => c !== null);
        if (cleaned.length === 0) {
          // No activity resolved — fall back to the city center.
          service.findPlaceFromQuery(
            { query: city!, fields: ['geometry'] },
            (results, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                results?.[0]?.geometry?.location
              ) {
                map.setCenter(results[0].geometry.location);
                map.setZoom(13);
              }
            },
          );
          return;
        }
        // Fit all stops in the viewport. Single stop → fixed zoom.
        if (cleaned.length === 1) {
          map.setCenter(cleaned[0]);
          map.setZoom(15);
        } else {
          const bounds = new google.maps.LatLngBounds();
          cleaned.forEach((c) => bounds.extend(c));
          map.fitBounds(bounds, 60);
        }
        // Per-leg routes 2026-08-03. Previous behaviour drew ONE polyline
        // with straight chords between every stop, which the user
        // correctly noted looked unrealistic ("shouldn't be a straight
        // line from each destination"). Now for each consecutive pair we
        // (a) pick a transport mode from the leg distance,
        // (b) ask Google Directions for the actual road/walk/transit
        //     polyline, and
        // (c) render it in a mode-specific style.
        //
        // Failure modes: if Directions returns null (no route, transit
        // unavailable, offline) we fall back to a straight chord in the
        // dashed WALK style so the leg is still visible. Fetches run in
        // parallel — even a 10-stop day only pays one round-trip latency.
        const pairs: Array<[google.maps.LatLng, google.maps.LatLng]> = [];
        for (let i = 0; i < cleaned.length - 1; i++) {
          pairs.push([cleaned[i], cleaned[i + 1]]);
        }
        Promise.all(pairs.map(async ([a, b]) => {
          const origin = { lat: a.lat(), lng: a.lng() };
          const dest = { lat: b.lat(), lng: b.lng() };
          const mode = pickModeForLeg(haversineKm(origin, dest));
          const dir = await fetchDirections(origin, dest, mode);
          return { origin, dest, mode, dir };
        })).then((legs) => {
          for (const { origin, dest, mode, dir } of legs) {
            const style = MODE_STYLE[mode];
            const path = dir && dir.points.length > 1
              ? dir.points.map((p) => new google.maps.LatLng(p.lat, p.lng))
              : [new google.maps.LatLng(origin.lat, origin.lng), new google.maps.LatLng(dest.lat, dest.lng)];
            // For dashed lines: stroke transparent, and stamp a dot symbol
            // along the path at 12-px intervals (Google Maps convention).
            const dashed = style.dashed || !dir; // fallback chord is dashed
            const pl = new google.maps.Polyline({
              path,
              geodesic: false,
              strokeColor: style.color,
              strokeOpacity: dashed ? 0 : 0.9,
              strokeWeight: style.weight,
              icons: dashed ? [{
                icon: {
                  path: 'M 0,-1 0,1',
                  strokeOpacity: 1,
                  strokeColor: style.color,
                  scale: style.weight - 1,
                },
                offset: '0',
                repeat: '12px',
              }] : undefined,
              map,
              zIndex: 40,
            });
            polylinesRef.current.push(pl);
          }
        }).catch(() => {
          // Directions failed for the whole day — fall back to the old
          // straight-line polyline so users see SOMETHING connecting
          // their stops. Better than an empty map.
          polylineRef.current = new google.maps.Polyline({
            path: cleaned,
            geodesic: false,
            strokeColor: colorScheme === 'light' ? '#7c5cf0' : '#a78bfa',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            map,
          });
        });
      }
    }
    // Empty cleanup — markers/polyline cleared at the top of every run.
  }, [city, activities, dayKey]);

  // Offline fallback: when the user has no network, render a static map
  // image instead of trying to spin up the interactive JS API (which
  // requires loading maps.googleapis.com — fails offline). The SW
  // intercepts /api/map-tile and serves cached PNGs from Phase 2 prewarm.
  if (!online && city) {
    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--brand-bg2)',
        borderRadius: mapRadius,
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/map-tile?center=${encodeURIComponent(city)}&zoom=13&size=640x400&scale=2`}
          alt={`${city} map (cached, offline)`}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div style={{
          position: 'absolute', left: 14, top: 14,
          padding: '6px 10px', borderRadius: 999,
          background: 'rgba(5,5,15,0.78)',
          color: 'var(--brand-warn)',
          border: '1px solid rgba(251,146,60,0.35)',
          fontFamily: 'var(--font-mono-display, monospace)',
          fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
          fontWeight: 700,
        }}>
          Offline · cached
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        // Matches the styled-map backgroundColor so the wrapper doesn't
        // flash a dark band before tiles load when the user is in light mode.
        background: 'var(--brand-bg2)',
        borderRadius: mapRadius,
        overflow: 'hidden',
      }}
    />
  );
}
