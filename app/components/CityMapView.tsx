'use client';
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number] | null;
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
  embedded?: boolean;
};

const RETURN_TO_GLOBE_ZOOM = 7;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

export default function CityMapView({ name, lat, lon, monuments, onClose, embedded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeFeature[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [recents, setRecents] = useState<GeocodeFeature[]>([]);
  const [mapsError, setMapsError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = `geknee:citymap-recents:${name}`;
      const raw = localStorage.getItem(key);
      if (raw) setRecents(JSON.parse(raw) as GeocodeFeature[]);
    } catch { /* ignore */ }
  }, [name]);

  function pushRecent(f: GeocodeFeature) {
    setRecents((prev) => {
      const next = [f, ...prev.filter(p => p.id !== f.id)].slice(0, 5);
      try { localStorage.setItem(`geknee:citymap-recents:${name}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  type PinDraft = { lat: number; lon: number; label?: string; addedAt: number };
  function draftKey(): string { return `geknee:pin-draft:${name.toLowerCase()}`; }
  function readDraft(): PinDraft[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(draftKey());
      return raw ? (JSON.parse(raw) as PinDraft[]) : [];
    } catch { return []; }
  }
  function writeDraft(pins: PinDraft[]) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(draftKey(), JSON.stringify(pins)); }
    catch { /* quota / private mode */ }
  }
  function appendDraft(pin: PinDraft) {
    const cur = readDraft();
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    if (cur.some(p => round(p.lat) === round(pin.lat) && round(p.lon) === round(pin.lon))) return;
    writeDraft([...cur, pin]);
  }
  function removeDraft(pinLat: number, pinLon: number) {
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    writeDraft(readDraft().filter(p => round(p.lat) !== round(pinLat) || round(p.lon) !== round(pinLon)));
  }

  // Placeholder geocoding — replaced in task 1.3
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setActiveIdx(-1); }
  }, [query]);

  function dropPin(pinLng: number, pinLat: number, label?: string, opts?: { skipPersist?: boolean }) {
    const map = mapRef.current;
    if (!map) return;
    // Placeholder — replaced in task 1.2
    void label; void opts;
    appendDraft({ lat: pinLat, lon: pinLng, label, addedAt: Date.now() });
  }

  function handleResultClick(f: GeocodeFeature) {
    const map = mapRef.current;
    if (!map || !f.center) return;
    const [lng, latitude] = f.center;
    map.panTo({ lat: latitude, lng });
    map.setZoom(14);
    dropPin(lng, latitude, f.text);
    pushRecent(f);
    setQuery(''); setResults([]); setSearchOpen(false); setActiveIdx(-1);
    inputRef.current?.blur();
  }

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAP_ID || MAP_ID === 'DEMO_MAP_ID') {
      console.warn('[CityMapView] NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID not set — using DEMO_MAP_ID.');
    }

    let map: google.maps.Map;
    let clickListener: google.maps.MapsEventListener;
    let zoomListener: google.maps.MapsEventListener;
    let cancelled = false;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        map = new google.maps.Map(containerRef.current, {
          center: { lat, lng: lon },
          zoom: 12,
          tilt: 45,
          mapId: MAP_ID,
          mapTypeId: 'hybrid',
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
        mapRef.current = map;

        zoomListener = map.addListener('zoom_changed', () => {
          const z = map.getZoom();
          if (z !== undefined && z < RETURN_TO_GLOBE_ZOOM) onCloseRef.current();
        });

        clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          dropPin(e.latLng.lng(), e.latLng.lat());
        });

        google.maps.event.addListenerOnce(map, 'idle', () => {
          if (cancelled) return;
          // Monument rings added in task 1.4; pin restore added in task 1.2
          void monuments;
          for (const pin of readDraft()) {
            dropPin(pin.lon, pin.lat, pin.label, { skipPersist: true });
          }
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setMapsError(err instanceof Error ? err.message : 'Google Maps failed to load');
      });

    return () => {
      cancelled = true;
      if (clickListener) google.maps.event.removeListener(clickListener);
      if (zoomListener) google.maps.event.removeListener(zoomListener);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, monuments]);

  return (
    <div style={{
      position: embedded ? 'absolute' : 'fixed', inset: 0, zIndex: embedded ? 0 : 1000,
      background: '#060816',
      animation: 'mapFadeIn 0.3s ease-out',
    }}>
      <style>{`@keyframes mapFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {mapsError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: 'system-ui', textAlign: 'center', padding: 32,
        }}>
          <div style={{ maxWidth: 520, background: 'rgba(6,8,22,0.85)', border: '1px solid rgba(100,210,255,0.3)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Map failed to load</h2>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c0ecff' }}>
              Check that <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> is set and the Maps JavaScript API is enabled.
            </p>
            <p style={{ fontSize: 11, color: '#a8a8c0', marginTop: 8 }}>{mapsError}</p>
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
          onClick={() => onCloseRef.current()}
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

      {(() => {
        const showRecents = searchOpen && query.trim().length < 2 && recents.length > 0;
        const showResults = searchOpen && results.length > 0;
        const items: GeocodeFeature[] = showResults ? results : showRecents ? recents : [];
        const dropdownOpen = items.length > 0;

        function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
          if (!dropdownOpen) {
            if (e.key === 'Escape') { setQuery(''); setResults([]); inputRef.current?.blur(); }
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(-1, i - 1)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = activeIdx >= 0 ? items[activeIdx] : items[0];
            if (pick) handleResultClick(pick);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (query) { setQuery(''); setResults([]); setActiveIdx(-1); }
            else inputRef.current?.blur();
          }
        }

        return (
          <div style={{
            position: 'absolute', top: 18, left: 18,
            width: 'min(380px, calc(100vw - 36px))',
            fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(6,8,22,0.92)',
              border: `1px solid ${searchOpen ? 'rgba(167,139,250,0.65)' : 'rgba(100,210,255,0.35)'}`,
              backdropFilter: 'blur(14px)',
              borderRadius: dropdownOpen ? '14px 14px 0 0' : 14,
              padding: '11px 14px',
              boxShadow: searchOpen ? '0 6px 24px rgba(0,0,0,0.45)' : '0 2px 12px rgba(0,0,0,0.35)',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease, border-radius 0.15s ease',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: searchOpen ? '#c4b5fd' : 'rgba(199,210,254,0.8)', flexShrink: 0, transition: 'color 0.15s ease' }}>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); setActiveIdx(-1); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
                onKeyDown={onKeyDown}
                placeholder="Search places · click map to drop pin"
                aria-label="Search places"
                aria-autocomplete="list"
                aria-expanded={dropdownOpen}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: 14, fontWeight: 500, fontFamily: 'inherit',
                  minWidth: 0, padding: '2px 0',
                }}
              />
              {searching && query.length >= 2 && (
                <div aria-hidden style={{
                  width: 12, height: 12, borderRadius: '50%',
                  border: '2px solid rgba(167,139,250,0.25)',
                  borderTopColor: '#a78bfa',
                  animation: 'geknee-spin 0.7s linear infinite',
                }} />
              )}
              {query && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setQuery(''); setResults([]); setActiveIdx(-1); inputRef.current?.focus(); }}
                  aria-label="Clear search"
                  style={{
                    background: 'rgba(167,139,250,0.12)',
                    border: '1px solid rgba(167,139,250,0.25)',
                    color: 'rgba(199,210,254,0.85)',
                    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, lineHeight: 1,
                  }}
                >{'×'}</button>
              )}
            </div>
            <style>{`@keyframes geknee-spin { to { transform: rotate(360deg); } }`}</style>
            {dropdownOpen && (
              <div role="listbox" style={{
                background: 'rgba(6,8,22,0.97)',
                border: '1px solid rgba(167,139,250,0.45)',
                borderTop: 'none',
                backdropFilter: 'blur(14px)',
                borderRadius: '0 0 14px 14px',
                overflow: 'hidden',
                boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
                maxHeight: 360, overflowY: 'auto',
              }}>
                {showRecents && (
                  <div style={{
                    padding: '6px 14px',
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: '#a8a8c0',
                    background: 'rgba(167,139,250,0.06)',
                    borderBottom: '1px solid rgba(167,139,250,0.15)',
                  }}>Recent</div>
                )}
                {items.map((f, i) => {
                  const isPoi = f.place_type?.includes('poi');
                  const isAddr = f.place_type?.includes('address');
                  const icon = isPoi ? '📍' : isAddr ? '🏠' : '🌐';
                  const active = i === activeIdx;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIdx(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleResultClick(f)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', textAlign: 'left',
                        background: active ? 'rgba(167,139,250,0.18)' : 'transparent',
                        border: 'none',
                        borderTop: i > 0 ? '1px solid rgba(167,139,250,0.1)' : 'none',
                        color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                        padding: '11px 14px',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <span aria-hidden style={{ fontSize: 14, flexShrink: 0, opacity: 0.9 }}>{icon}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#f2f2f8', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.text}</span>
                        <span style={{ display: 'block', fontSize: 11, color: '#a8a8c0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.place_name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {searchOpen && searching && query.length >= 2 && results.length === 0 && (
              <div style={{
                background: 'rgba(6,8,22,0.97)', border: '1px solid rgba(167,139,250,0.45)', borderTop: 'none',
                borderRadius: '0 0 14px 14px', padding: '11px 14px',
                color: 'rgba(199,210,254,0.7)', fontSize: 12,
              }}>Searching…</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
