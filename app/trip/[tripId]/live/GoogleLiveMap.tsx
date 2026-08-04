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

import { useEffect, useRef, useState } from 'react';
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
  /** Fired when the user clicks the "Add to trip" button on the search-
      hydrated info card. Coords + label come from the resolved place, no
      reverse-geocoding needed. */
  onAddStopFromSearch?: (coords: { lat: number; lon: number }, label: string | null) => void;
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

// Info surfaced by the search-hydrated pin. Kept narrow — anything
// beyond photos + rating + top reviews + address adds render load
// without much travel-in-the-moment value.
interface SearchedPlace {
  name: string;
  address: string | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
  photos: string[];
  reviews: Array<{ author: string; rating: number; text: string; relative: string }>;
}

export function GoogleLiveMap({ city, activities, dayKey, geo, onAddStopFromSearch, height = 360, fullscreen = false }: GoogleLiveMapProps) {
  // Border-radius follows the fullscreen flag, not the height. That way
  // an inline "100dvh" map still keeps its 14-px card radius (parent has
  // horizontal padding), and only the true takeover mode goes edge-to-edge.
  const mapRadius = fullscreen ? 0 : 14;
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const [searchedPlace, setSearchedPlace] = useState<SearchedPlace | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
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
  // Ref the callback so we don't have to re-init the map when its
  // identity changes on the parent.
  const onAddStopRef = useRef(onAddStopFromSearch);
  onAddStopRef.current = onAddStopFromSearch;
  // Track the coords the searched place resolved to so the "Add to trip"
  // button on the info card can forward them without another geocode.
  const searchedCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
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

        // Map-tap add-stop was removed 2026-08-04 in favor of the
        // search-hydrated info card's "Add to trip" button (clearer UX,
        // no accidental drops).

        // Places Autocomplete on the search input — mirrors the pattern
        // from app/plan/[tripId]/map/page.tsx so users get the same
        // "type-a-place → drop pin → see reviews + photos" flow they
        // know from the planner map. Bounds-bound to the current map
        // viewport so results bias toward the trip area.
        placesServiceRef.current = new google.maps.places.PlacesService(map);
        const input = searchInputRef.current;
        if (input) {
          const ac = new google.maps.places.Autocomplete(input, {
            fields: [
              'name', 'geometry', 'place_id', 'formatted_address',
              'photos', 'rating', 'user_ratings_total', 'reviews',
              'opening_hours', 'price_level', 'types',
            ],
          });
          ac.bindTo('bounds', map);
          ac.addListener('place_changed', () => {
            // Everything inside this listener is user-triggered async work
            // against the third-party Google Maps SDK. A single unhandled
            // throw here surfaces to the user as "the map crashed" (React
            // error boundary tears the map component down). Wrap the whole
            // body so a bad place object degrades to "search returned
            // nothing" instead of a blank map.
            try {
              const place = ac.getPlace();
              if (!place || !place.geometry || !place.geometry.location) return;
              const loc = place.geometry.location;
              // Drop / replace the search pin.
              if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
              searchMarkerRef.current = new google.maps.Marker({
                position: loc,
                map,
                icon: {
                  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\' width=\'32\' height=\'32\'>' +
                    '<circle cx=\'16\' cy=\'16\' r=\'11\' fill=\'#7dd3fc\' stroke=\'#0c0c1f\' stroke-width=\'2\'/>' +
                    '<circle cx=\'16\' cy=\'16\' r=\'4\' fill=\'#0c0c1f\'/>' +
                    '</svg>'),
                  scaledSize: new google.maps.Size(32, 32),
                  anchor: new google.maps.Point(16, 16),
                },
                title: place.name ?? '',
                zIndex: 300,
              });
              // Store the resolved coords so the info card's "Add to
              // trip" button doesn't need to re-geocode.
              searchedCoordsRef.current = { lat: loc.lat(), lon: loc.lng() };
              map.panTo(loc);
              const z = map.getZoom();
              if (typeof z === 'number' && z < 15) map.setZoom(16);
              // Hydrate the info card with photos + reviews. Each field
              // guarded because Places can return partial objects.
              const photos = (Array.isArray(place.photos) ? place.photos : [])
                .slice(0, 6)
                .map((p) => {
                  try { return p.getUrl({ maxWidth: 900 }); }
                  catch { return null; }
                })
                .filter((u): u is string => !!u);
              const reviews = (Array.isArray(place.reviews) ? place.reviews : [])
                .slice(0, 3)
                .map((r) => ({
                  author: r.author_name ?? 'Anonymous',
                  rating: typeof r.rating === 'number' ? r.rating : 0,
                  text: r.text ?? '',
                  relative: r.relative_time_description ?? '',
                }));
              // opening_hours.isOpen() is being deprecated in the JS SDK
              // and throws in some builds when called without an argument.
              // Isolate it so a throw here doesn't crash the whole card.
              let openNow: boolean | null = null;
              try {
                const oh = place.opening_hours as (google.maps.places.PlaceOpeningHours & { isOpen?: () => boolean }) | undefined;
                if (oh && typeof oh.isOpen === 'function') {
                  openNow = oh.isOpen() ?? null;
                }
              } catch { openNow = null; }
              setSearchedPlace({
                name: place.name ?? 'Unnamed place',
                address: place.formatted_address ?? null,
                rating: typeof place.rating === 'number' ? place.rating : null,
                reviewCount: typeof place.user_ratings_total === 'number' ? place.user_ratings_total : null,
                openNow,
                photos,
                reviews,
              });
              setActivePhoto(0);
              if (input) input.value = '';
            } catch (err) {
              // Never let the map die from a search click.
              // eslint-disable-next-line no-console
              console.error('[GoogleLiveMap] place_changed handler failed:', err);
              setSearchedPlace(null);
              if (searchMarkerRef.current) {
                searchMarkerRef.current.setMap(null);
                searchMarkerRef.current = null;
              }
            }
          });
        }
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
      searchMarkerRef.current?.setMap(null);
      searchMarkerRef.current = null;
      placesServiceRef.current = null;
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
              coords[i] = results[0].geometry.location;
            }
            pending--;
            if (pending === 0) finalize();
          },
        );
      });

      function finalize() {
        const map = mapRef.current!;
        // Coord-level dedupe (2026-08-04): run AFTER all geocodes resolve
        // so we can compare against the fully-populated coords array,
        // not the racy partial version. Previously the dedupe fired
        // inline in each callback — parallel geocodes meant a later
        // activity's callback would run before its earlier duplicate
        // had populated coords[j], missing the match and letting both
        // pins land at the same lat/lng with different numbers.
        //
        // First-index wins: we keep the earliest activity that resolves
        // to a spot and null-out later duplicates so the polyline path
        // skips them.
        const R = 15; // meters — collapse only truly-same locations
        for (let i = 0; i < coords.length; i++) {
          const ci = coords[i];
          if (!ci) continue;
          for (let j = i + 1; j < coords.length; j++) {
            const cj = coords[j];
            if (!cj) continue;
            const dLat = (ci.lat() - cj.lat()) * 111000;
            const dLng = (ci.lng() - cj.lng()) * 111000 * Math.cos(ci.lat() * Math.PI / 180);
            if (Math.hypot(dLat, dLng) < R) {
              coords[j] = null;
            }
          }
        }

        // Build markers for the survivors. Number them 1..N in visit
        // order (using original index preserves the "which stop number
        // is this" meaning in the tooltip; the pin label uses a
        // sequential rank so users don't see holes like 1, 3, 4).
        let rank = 0;
        for (let i = 0; i < coords.length; i++) {
          const loc = coords[i];
          if (!loc) continue;
          rank += 1;
          const a = activities[i];
          const marker = new google.maps.Marker({
            position: loc,
            map,
            icon: pinIcon(rank),
            title: `${a.display} · ${a.place ?? a.name}`,
            zIndex: 100 + i,
          });
          // Tap → hydrate the info card with photos/reviews for this
          // stop. Uses PlacesService.findPlaceFromQuery to resolve the
          // place_id, then getDetails to pull the same fields we surface
          // for a search result. Silent-fail so a broken lookup doesn't
          // kill the marker.
          const placeQuery = a.place ? `${a.place}, ${city ?? ''}` : (a.name ?? '');
          const stopLoc = loc;
          marker.addListener('click', () => {
            const svc = placesServiceRef.current;
            if (!svc) return;
            try {
              svc.findPlaceFromQuery(
                { query: placeQuery, fields: ['place_id'] },
                (results, status) => {
                  if (status !== google.maps.places.PlacesServiceStatus.OK) return;
                  const placeId = results?.[0]?.place_id;
                  if (!placeId) return;
                  svc.getDetails(
                    {
                      placeId,
                      fields: [
                        'name', 'formatted_address', 'photos',
                        'rating', 'user_ratings_total', 'reviews',
                        'opening_hours',
                      ],
                    },
                    (details, s) => {
                      if (s !== google.maps.places.PlacesServiceStatus.OK || !details) return;
                      hydrateSearchedFromDetails(details, stopLoc);
                    },
                  );
                },
              );
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[GoogleLiveMap] pin click hydrate failed:', err);
            }
          });
          markersRef.current.push(marker);
        }

        // Shared hydration: mirrors the search flow so tap-a-pin and
        // search-a-place render the exact same info card.
        function hydrateSearchedFromDetails(
          details: google.maps.places.PlaceResult,
          markerLoc: google.maps.LatLng,
        ) {
          try {
            const photos = (Array.isArray(details.photos) ? details.photos : [])
              .slice(0, 6)
              .map((p) => { try { return p.getUrl({ maxWidth: 900 }); } catch { return null; } })
              .filter((u): u is string => !!u);
            const reviews = (Array.isArray(details.reviews) ? details.reviews : [])
              .slice(0, 3)
              .map((r) => ({
                author: r.author_name ?? 'Anonymous',
                rating: typeof r.rating === 'number' ? r.rating : 0,
                text: r.text ?? '',
                relative: r.relative_time_description ?? '',
              }));
            let openNow: boolean | null = null;
            try {
              const oh = details.opening_hours as (google.maps.places.PlaceOpeningHours & { isOpen?: () => boolean }) | undefined;
              if (oh && typeof oh.isOpen === 'function') openNow = oh.isOpen() ?? null;
            } catch { openNow = null; }
            searchedCoordsRef.current = { lat: markerLoc.lat(), lon: markerLoc.lng() };
            setSearchedPlace({
              name: details.name ?? 'Stop',
              address: details.formatted_address ?? null,
              rating: typeof details.rating === 'number' ? details.rating : null,
              reviewCount: typeof details.user_ratings_total === 'number' ? details.user_ratings_total : null,
              openNow,
              photos,
              reviews,
            });
            setActivePhoto(0);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[GoogleLiveMap] hydrate failed:', err);
          }
        }

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
    <div style={{
      position: 'relative',
      width: '100%',
      height,
      background: 'var(--brand-bg2)',
      borderRadius: mapRadius,
      overflow: 'hidden',
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating search bar — mirrors the plan/[tripId]/map look so users
          get consistent UX across map surfaces. Sits below any sticky
          chrome the parent renders (top-bar + day pills). */}
      <div style={{
        position: 'absolute',
        // Pinned to the very top of the map wrapper 2026-08-04 per user
        // request. Safe-area is already handled by the parent's sticky
        // top-bar, so no extra inset here.
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        width: 'min(440px, calc(100% - 24px))',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(13,13,36,0.92)',
          WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
          border: '1px solid var(--brand-border)',
          borderRadius: 12,
          padding: '0 12px',
          pointerEvents: 'auto',
          boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}>
          <span aria-hidden style={{ color: 'var(--brand-ink-mute)', fontSize: 14 }}>
            {String.fromCodePoint(0x1F50D)}
          </span>
          <input
            ref={searchInputRef}
            placeholder="Search a place — reviews + photos"
            aria-label="Search a place on the map"
            style={{
              flex: 1, padding: '10px 0',
              background: 'transparent', border: 'none',
              color: 'var(--brand-ink)', fontFamily: 'inherit', fontSize: 14,
              outline: 'none', minWidth: 0,
            }}
          />
        </div>
      </div>

      {searchedPlace && (
        <SearchedPlaceCard
          place={searchedPlace}
          activePhoto={activePhoto}
          onPhotoSelect={setActivePhoto}
          onAddToTrip={() => {
            const coords = searchedCoordsRef.current;
            if (coords && onAddStopRef.current) {
              onAddStopRef.current(coords, searchedPlace.name ?? null);
            }
          }}
          onClose={() => {
            setSearchedPlace(null);
            if (searchMarkerRef.current) {
              searchMarkerRef.current.setMap(null);
              searchMarkerRef.current = null;
            }
          }}
        />
      )}
    </div>
  );
}

// SearchedPlaceCard — floating info card that appears when the user
// selects a place from the search bar's Places Autocomplete. Photos,
// rating, and up to 3 top reviews.
function SearchedPlaceCard({ place, activePhoto, onPhotoSelect, onAddToTrip, onClose }: {
  place: SearchedPlace;
  activePhoto: number;
  onPhotoSelect: (i: number) => void;
  onAddToTrip: () => void;
  onClose: () => void;
}) {
  const heroPhoto = place.photos[activePhoto];
  return (
    <div style={{
      // Docked to the TOP of the map wrapper 2026-08-04 per user request
      // (was bottom). The search bar sits above it; the card starts just
      // below with an ~68px offset so the search input stays reachable
      // even when the card is open.
      position: 'absolute', left: 12, right: 12, top: 68, zIndex: 22,
      maxWidth: 420, margin: '0 auto',
      maxHeight: 'calc(100% - 96px)',
      overflow: 'auto',
      background: 'rgba(13,13,36,0.96)',
      WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--brand-border)',
      borderRadius: 14,
      boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
    }}>
      {heroPhoto ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroPhoto} alt={place.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <button onClick={onClose} aria-label="Close" style={{
            position: 'absolute', top: 10, right: 10,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(10,10,31,0.7)',
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
          }}>×</button>
          {place.photos.length > 1 && (
            <div style={{
              position: 'absolute', left: 10, right: 10, bottom: 10,
              display: 'flex', gap: 6, overflowX: 'auto',
            }}>
              {place.photos.map((url, i) => (
                <button key={i} onClick={() => onPhotoSelect(i)} aria-label={`Photo ${i + 1}`} style={{
                  flexShrink: 0,
                  width: 56, height: 38, borderRadius: 4,
                  border: i === activePhoto ? '2px solid var(--brand-accent)' : '1px solid rgba(255,255,255,0.2)',
                  padding: 0, cursor: 'pointer', background: 'transparent', overflow: 'hidden',
                  opacity: i === activePhoto ? 1 : 0.7,
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid var(--brand-border)' }}>
          <button onClick={onClose} aria-label="Close" style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'transparent', border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink-mute)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
          }}>×</button>
        </div>
      )}
      <div style={{ padding: '14px 16px 16px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {place.openNow !== null && (
            <span style={{
              fontFamily: 'var(--font-mono-display, monospace)',
              fontSize: 9, letterSpacing: '0.14em', fontWeight: 700,
              padding: '2px 8px', borderRadius: 999,
              color: place.openNow ? 'var(--brand-success)' : 'var(--brand-warn)',
              background: place.openNow ? 'rgba(124,255,151,0.10)' : 'rgba(251,146,60,0.10)',
              border: `1px solid ${place.openNow ? 'rgba(124,255,151,0.4)' : 'rgba(251,146,60,0.4)'}`,
            }}>{place.openNow ? 'OPEN NOW' : 'CLOSED'}</span>
          )}
        </div>
        <div style={{
          fontFamily: 'var(--font-display, serif)', fontSize: 22, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--brand-ink)', lineHeight: 1.2,
        }}>{place.name}</div>
        {place.rating !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--brand-ink-dim)' }}>
            <span style={{ letterSpacing: 1, color: 'var(--brand-gold, #f59e0b)' }} aria-hidden>
              {'★'.repeat(Math.round(place.rating)) + '☆'.repeat(5 - Math.round(place.rating))}
            </span>
            <span>{place.rating.toFixed(1)}{place.reviewCount ? ` · ${place.reviewCount.toLocaleString()} reviews` : ''}</span>
          </div>
        )}
        {place.address && (
          <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', lineHeight: 1.5 }}>
            {place.address}
          </div>
        )}
        <button
          type="button"
          onClick={onAddToTrip}
          style={{
            marginTop: 4,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(167,139,250,0.92)',
            color: 'var(--brand-bg, #0c0c1f)',
            border: 'none',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            letterSpacing: '0.02em',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 6px 18px rgba(167,139,250,0.35)',
          }}
        >
          + Add to trip
        </button>
        {place.reviews.length > 0 && (
          <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
            {place.reviews.map((r, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--brand-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-ink)' }}>{r.author}</span>
                  <span style={{ fontSize: 11, letterSpacing: 1, color: 'var(--brand-gold, #f59e0b)' }} aria-hidden>
                    {'★'.repeat(Math.round(r.rating))}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginLeft: 'auto' }}>{r.relative}</span>
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--brand-ink)' }}>
                  {r.text.length > 240 ? r.text.slice(0, 235).trimEnd() + '…' : r.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
