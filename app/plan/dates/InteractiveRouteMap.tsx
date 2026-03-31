'use client';

import { useEffect, useRef } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

export interface RouteStop {
  label: string;
  kind: 'home' | 'dest' | 'stop';
  coords: [number, number] | null; // [lng, lat]
}

const COLORS: Record<RouteStop['kind'], string> = {
  home: '#22d3ee',
  dest: '#7CFC00',
  stop: '#fbbf24',
};

const DARK_MAP_STYLES: object[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3e50' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d5166' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1929' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
];

export default function InteractiveRouteMap({ stops }: { stops: RouteStop[] }) {
  const divRef      = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<google.maps.Map | null>(null);
  const markersRef  = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  const known = stops.filter(s => s.coords !== null) as (RouteStop & { coords: [number, number] })[];

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await loadGoogleMaps();
      if (cancelled || !divRef.current) return;

      const defaultCenter = known[0]?.coords ?? [0, 20];

      const map = new google.maps.Map(divRef.current, {
        zoom: 3,
        center: { lat: defaultCenter[1], lng: defaultCenter[0] },
        styles: DARK_MAP_STYLES as google.maps.MapTypeStyle[],
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      });
      mapRef.current = map;

      // Markers
      known.forEach(stop => {
        const color = COLORS[stop.kind];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="${color}" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/></svg>`;
        const marker = new google.maps.Marker({
          position: { lat: stop.coords[1], lng: stop.coords[0] },
          map,
          title: stop.label,
          icon: {
            url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
            scaledSize: new google.maps.Size(14, 14),
            anchor: new google.maps.Point(7, 7),
          },
        });
        markersRef.current.push(marker);
      });

      // Route line
      if (known.length > 1) {
        const poly = new google.maps.Polyline({
          path: known.map(s => ({ lat: s.coords[1], lng: s.coords[0] })),
          geodesic: true,
          strokeColor: '#7CFC00',
          strokeOpacity: 0.75,
          strokeWeight: 2.5,
        });
        poly.setMap(map);
        polylineRef.current = poly;
      }

      // Fit bounds
      if (known.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        known.forEach(s => bounds.extend({ lat: s.coords[1], lng: s.coords[0] }));
        map.fitBounds(bounds, 64);
      } else if (known.length === 1) {
        map.setCenter({ lat: known[0].coords[1], lng: known[0].coords[0] });
        map.setZoom(8);
      }
    }

    init();
    return () => {
      cancelled = true;
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
      <div ref={divRef} style={{ width: '100%', height: 280 }} />
    </div>
  );
}
