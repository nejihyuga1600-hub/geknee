'use client';
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
};

type MonumentMarker = {
  mk: string;
  name: string;
  lat: number;
  lon: number;
  ringColor: string;
};

type Props = {
  name: string;
  lat: number;
  lon: number;
  monuments: MonumentMarker[];
  onClose: () => void;
  // When true, renders inside a parent container instead of fullscreen.
  // Used by the Atlas shell to embed the map in the bottom sheet's full state.
  embedded?: boolean;
};

// Mapbox zoom 0 = whole earth, 7 ≈ country, 10 ≈ city, 14 ≈ neighbourhood.
const RETURN_TO_GLOBE_ZOOM = 7;

export default function CityMapView({ name, lat, lon, monuments, onClose, embedded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const droppedMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeFeature[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  // Debounced geocoding lookup against the Mapbox places API. Proximity-biased
  // to the current map center so "park" returns the nearby park, not Park City.
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const map = mapRef.current;
        const c = map?.getCenter();
        const proximity = c ? `&proximity=${c.lng},${c.lat}` : '';
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=6&types=place,locality,neighborhood,address,poi${proximity}`;
        const res = await fetch(url);
        if (!res.ok) { setResults([]); return; }
        const data = await res.json() as { features: GeocodeFeature[] };
        setResults(data.features ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  function dropPin(lng: number, latitude: number, label?: string) {
    const map = mapRef.current;
    if (!map) return;
    const el = document.createElement('div');
    el.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#a78bfa;border:2px solid #fff;box-shadow:0 0 8px rgba(167,139,250,0.8);cursor:pointer;';
    const popup = label
      ? new mapboxgl.Popup({ offset: 16, closeButton: false, className: 'geknee-popup' }).setHTML(
          `<div style="font-family:var(--font-ui),Inter,system-ui,sans-serif;color:#fff;font-size:12px;font-weight:600;padding:6px 10px;background:rgba(13,13,36,0.95);border:1px solid rgba(167,139,250,0.4);border-radius:8px;">${label.replace(/</g, '&lt;')}</div>`
        )
      : undefined;
    const marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, latitude]);
    if (popup) marker.setPopup(popup);
    marker.addTo(map);
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      marker.remove();
      droppedMarkersRef.current = droppedMarkersRef.current.filter(m => m !== marker);
    });
    droppedMarkersRef.current.push(marker);
  }

  function handleResultClick(f: GeocodeFeature) {
    const map = mapRef.current;
    if (!map) return;
    const [lng, latitude] = f.center;
    map.flyTo({ center: [lng, latitude], zoom: 14, speed: 1.2 });
    dropPin(lng, latitude, f.text);
    setQuery('');
    setResults([]);
    setSearchOpen(false);
  }

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !containerRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [lon, lat],
      zoom: 12,
      pitch: 45,
      bearing: 0,
      antialias: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    const onZoom = () => {
      if (map.getZoom() < RETURN_TO_GLOBE_ZOOM) onCloseRef.current();
    };
    map.on('zoomend', onZoom);

    // Click on empty map area drops a pin. Right-click on a pin removes it
    // (handler set in dropPin).
    const onMapClick = (e: mapboxgl.MapMouseEvent) => {
      dropPin(e.lngLat.lng, e.lngLat.lat);
    };
    map.on('click', onMapClick);

    map.on('style.load', () => {
      map.setFog({
        color: 'rgb(6, 8, 22)',
        'horizon-blend': 0.25,
        'space-color': 'rgb(6, 8, 22)',
        'star-intensity': 0.3,
      });

      // Surveying a continent at zoom <5 should only show country labels —
      // mapbox/satellite-streets-v12 starts pulling in regions, states, and
      // mid-tier cities around zoom 3 which clutters the view at this scale.
      const COUNTRY_ONLY_BELOW = 5;
      const layers = map.getStyle().layers ?? [];
      for (const layer of layers) {
        if (layer.type !== 'symbol') continue;
        if (layer.id === 'country-label' || layer.id === 'continent-label') continue;
        if (
          layer.id === 'state-label' ||
          layer.id.startsWith('settlement-') ||
          layer.id === 'place-label'
        ) {
          const currentMin = (layer as { minzoom?: number }).minzoom ?? 0;
          const currentMax = (layer as { maxzoom?: number }).maxzoom ?? 24;
          map.setLayerZoomRange(layer.id, Math.max(currentMin, COUNTRY_ONLY_BELOW), currentMax);
        }
      }

      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#cbd5e1',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'height']],
            'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, ['get', 'min_height']],
            'fill-extrusion-opacity': 0.85,
          },
        });
      }

      addMonumentRings(map, monuments);
    });

    return () => {
      map.off('zoomend', onZoom);
      map.off('click', onMapClick);
      droppedMarkersRef.current.forEach(m => m.remove());
      droppedMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, monuments]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <div style={{
      position: embedded ? 'absolute' : 'fixed', inset: 0, zIndex: embedded ? 0 : 1000,
      background: '#060816',
      animation: 'mapFadeIn 0.3s ease-out',
    }}>
      <style>{`@keyframes mapFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {!token && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: 'system-ui', textAlign: 'center', padding: 32,
        }}>
          <div style={{ maxWidth: 520, background: 'rgba(6,8,22,0.85)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Mapbox token required</h2>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c0ecff' }}>
              Add <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to your Vercel environment variables.
            </p>
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(6,8,22,0.85)', border: '1px solid rgba(100,210,255,0.4)',
        backdropFilter: 'blur(12px)', borderRadius: 10,
        color: '#fff', fontSize: 13, fontWeight: 700,
        padding: '8px 8px 8px 16px', display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <span style={{ pointerEvents: 'none' }}>{name}</span>
        <button
          type="button"
          onClick={onCloseRef.current}
          aria-label="Return to globe"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(100,210,255,0.12)',
            border: '1px solid rgba(100,210,255,0.4)',
            color: '#fff', fontSize: 11, fontWeight: 600,
            padding: '6px 12px', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{String.fromCodePoint(0x2190)}</span>
          Return to globe
        </button>
      </div>

      <div style={{
        position: 'absolute', top: 18, left: 18,
        width: 'min(360px, calc(100vw - 36px))',
        fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(6,8,22,0.85)',
          border: `1px solid ${searchOpen ? 'rgba(167,139,250,0.6)' : 'rgba(100,210,255,0.4)'}`,
          backdropFilter: 'blur(12px)',
          borderRadius: results.length > 0 && searchOpen ? '10px 10px 0 0' : 10,
          padding: '8px 12px',
          transition: 'border-color 0.15s ease',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(199,210,254,0.8)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search places · click map to drop pin"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); }}
              aria-label="Clear search"
              style={{
                background: 'transparent', border: 'none', color: 'rgba(199,210,254,0.7)',
                cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, fontFamily: 'inherit',
              }}
            >×</button>
          )}
        </div>
        {searchOpen && results.length > 0 && (
          <div style={{
            background: 'rgba(6,8,22,0.95)',
            border: '1px solid rgba(167,139,250,0.45)',
            borderTop: 'none',
            backdropFilter: 'blur(12px)',
            borderRadius: '0 0 10px 10px',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {results.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleResultClick(f)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  borderTop: '1px solid rgba(167,139,250,0.15)',
                  color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '10px 12px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(167,139,250,0.12)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f2f2f8', marginBottom: 2 }}>{f.text}</div>
                <div style={{ fontSize: 11, color: '#a8a8c0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.place_name}</div>
              </button>
            ))}
          </div>
        )}
        {searching && query.length >= 2 && results.length === 0 && (
          <div style={{
            background: 'rgba(6,8,22,0.95)', border: '1px solid rgba(167,139,250,0.45)', borderTop: 'none',
            borderRadius: '0 0 10px 10px', padding: '10px 12px',
            color: 'rgba(199,210,254,0.7)', fontSize: 12,
          }}>Searching…</div>
        )}
      </div>
    </div>
  );
}

// Ground-plane circle rendered by Mapbox natively. Marks collected monuments
// with their skin-rarity colour — Mapbox's own building extrusions show the
// actual landmark geometry, so we don't double up with our own GLB.
function addMonumentRings(map: mapboxgl.Map, monuments: MonumentMarker[]) {
  if (monuments.length === 0) return;
  const features = monuments.map((mon) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [mon.lon, mon.lat] },
    properties: { mk: mon.mk, name: mon.name, ringColor: mon.ringColor },
  }));
  if (!map.getSource('monument-points')) {
    map.addSource('monument-points', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  }
  if (!map.getLayer('monument-rings')) {
    map.addLayer({
      id: 'monument-rings',
      type: 'circle',
      source: 'monument-points',
      paint: {
        'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 10, 10, 18, 80],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-width': 3,
        'circle-stroke-color': ['get', 'ringColor'],
        'circle-stroke-opacity': 0.9,
        'circle-pitch-alignment': 'map',
      },
    });
  }
}
