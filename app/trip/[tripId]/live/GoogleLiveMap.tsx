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
  /** Fired when the user clicks an empty spot on the map. Coords are passed
      so the parent can open the add-stop modal pre-seeded with a reverse-
      geocoded place suggestion. */
  onMapClick?: (coords: { lat: number; lon: number }) => void;
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

export function GoogleLiveMap({ city, activities, dayKey, onMapClick }: GoogleLiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  // Ref the click callback so we don't have to re-init the map when the
  // parent's onMapClick identity changes. The listener reads .current.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

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
          styles: DARK_STYLE,
          backgroundColor: '#0c0c1f',
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
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      mapRef.current = null;
    };
  }, []);

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
        const q = a.place ? `${a.place}, ${city}` : null;
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
              const marker = new google.maps.Marker({
                position: coords[i]!,
                map,
                icon: pinIcon(i + 1),
                title: `${a.display} · ${a.place ?? a.name}`,
                zIndex: 100 + i,
              });
              markersRef.current.push(marker);
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
        // Connect stops with a brand-coloured polyline. Geodesic=false
        // because the distances are short (within-city) so straight chords
        // are visually accurate; geodesic arcs would distort.
        polylineRef.current = new google.maps.Polyline({
          path: cleaned,
          geodesic: false,
          strokeColor: '#a78bfa',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map,
        });
      }
    }
    // Empty cleanup — markers/polyline cleared at the top of every run.
  }, [city, activities, dayKey]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 360,
        background: '#0c0c1f',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    />
  );
}
