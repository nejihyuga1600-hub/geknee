'use client';
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { createPurpleMarker } from '@/lib/googleMaps/marker';
import type { PurpleMarker } from '@/lib/googleMaps/marker';

type GeocodeFeature = {
  id: string;
  place_name: string;
  center: [number, number] | null;
  text: string;
  place_type: string[];
  /** Carried from Places API (New) for toPlace() resolution; absent on recents. */
  _prediction?: google.maps.places.PlacePrediction;
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

// Google Maps zoom 7 ≈ country level — mirrors the Mapbox-era close threshold.
const RETURN_TO_GLOBE_ZOOM = 7;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? 'DEMO_MAP_ID';

export default function CityMapView({ name, lat, lon, monuments, onClose, embedded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const droppedMarkersRef = useRef<PurpleMarker[]>([]);
  const unmountedRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monumentCirclesRef = useRef<google.maps.Circle[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Inline toast confirming a pin was saved to the trip handoff. Cleared
  // ~2.4s after the latest drop so consecutive taps just bump the message.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flashToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }
  // M1 — session token: reused across autocomplete→fetchFields pairs to collapse
  // per-request SKU charges into one session SKU charge (~$970/mo savings at 6k trips/mo).
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  function makeNewSession() {
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
  }
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

  // Per-city pin draft — persisted to localStorage so the user can leave
  // the map, come back, and find their pins still placed. The trip planner
  // also reads this key when the user opens a trip for the same city, so
  // map pins surface as candidate stops without an explicit save step.
  // Schema { lat, lon, label?, addedAt } is shared with the planner — do
  // not change the key name or field names without updating both sides.
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

    // Also append to the global pin list so a trip planned for a *nearby*
    // city (within the radius SummaryView applies) can still surface this
    // pin. Per-city localStorage above stays the canonical store for the
    // exact-city handoff; this is purely the geographic-radius escape hatch.
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('geknee:pins-all');
      type GlobalPin = PinDraft & { city: string };
      const list = raw ? (JSON.parse(raw) as GlobalPin[]) : [];
      if (list.some(p => round(p.lat) === round(pin.lat) && round(p.lon) === round(pin.lon))) return;
      const next = list.concat([{ ...pin, city: name }]);
      // Cap at the most recent 500 to keep the entry under the 5 MB
      // localStorage budget — older pins age out FIFO.
      // Halved from 500 → 200 entries. The trip-planner geographic-radius
      // lookup only needs recent pins (and the user can always re-add).
      // Keeping this list bounded matters because it's restored to memory
      // on every CityMapView mount on every city visit.
      const trimmed = next.length > 200 ? next.slice(next.length - 200) : next;
      localStorage.setItem('geknee:pins-all', JSON.stringify(trimmed));
    } catch { /* quota / private mode — per-city handoff still works */ }
  }
  function removeDraft(pinLat: number, pinLon: number) {
    const round = (n: number) => Math.round(n * 1e5) / 1e5;
    writeDraft(readDraft().filter(p => round(p.lat) !== round(pinLat) || round(p.lon) !== round(pinLon)));
  }

  // Debounced Places API (New) Autocomplete, proximity-biased to current city.
  // M1: session token passed to each fetchAutocompleteSuggestions call so that
  // the subsequent fetchFields call closes the session under one billing event.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setActiveIdx(-1);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const map = mapRef.current;
      const center = map ? map.getCenter() : null;
      const locationBias = center
        ? { center: { lat: center.lat(), lng: center.lng() }, radius: 50000 }
        : { center: { lat, lng: lon }, radius: 50000 };

      // Ensure a session token exists before the first fetch.
      if (!sessionTokenRef.current) makeNewSession();

      try {
        const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current!,
          locationBias,
        });

        const predictions = suggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => !!p);

        const features: GeocodeFeature[] = predictions.map((p) => {
          const types: string[] = (p.types as string[] | undefined) ?? [];
          const placeType = types.includes('establishment') ? ['poi']
            : types.includes('street_address') || types.includes('route') ? ['address']
            : ['place'];
          return {
            id: p.placeId,
            place_name: p.text.text,
            center: null,
            text: p.mainText?.text ?? p.text.text,
            place_type: placeType,
            // Carry prediction ref so handleResultClick can call toPlace().
            _prediction: p,
          };
        });
        setResults(features);
        setActiveIdx(-1);
      } catch {
        setResults([]);
        setActiveIdx(-1);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, lat, lon]);

  function dropPin(pinLng: number, pinLat: number, label?: string, opts?: { skipPersist?: boolean }) {
    const map = mapRef.current;
    if (!map) return;
    const pm = createPurpleMarker(map, { lat: pinLat, lng: pinLng }, {
      label,
      onRightClick: () => {
        pm.remove();
        droppedMarkersRef.current = droppedMarkersRef.current.filter(m => m !== pm);
        removeDraft(pinLat, pinLng);
        flashToast('Pin removed from trip');
      },
    });
    droppedMarkersRef.current.push(pm);
    // Cap the on-map marker count to keep Safari memory under control.
    // Each AdvancedMarkerElement carries an SVG + gradient + 2 SMIL animate
    // nodes — at 100+ pins on-screen Safari's tab gets aggressive about
    // reclaiming memory and reloads the page. 50 is plenty for a single
    // city's trip plan; older drops fall off but stay in localStorage so
    // they re-import for the trip planner via the geographic-radius path.
    const MAX_ON_MAP = 50;
    if (droppedMarkersRef.current.length > MAX_ON_MAP) {
      const toRemove = droppedMarkersRef.current.splice(0, droppedMarkersRef.current.length - MAX_ON_MAP);
      for (const m of toRemove) m.remove();
    }
    if (!opts?.skipPersist) {
      appendDraft({ lat: pinLat, lon: pinLng, label, addedAt: Date.now() });
      flashToast(label ? `"${label}" saved to ${name} trip` : `Pin saved to ${name} trip`);
      // Broadcast for any live trip planner mounted in another route/window
      // so it can hot-import this pin without waiting for a route remount.
      // SummaryView's localStorage scan still handles the cold-load path.
      try {
        window.dispatchEvent(new CustomEvent('geknee:pin-added', {
          detail: { city: name, lat: pinLat, lon: pinLng, label, addedAt: Date.now() },
        }));
      } catch { /* SSR-safe; window may be undefined in edge cases */ }
    }
  }

  function handleResultClick(f: GeocodeFeature) {
    const map = mapRef.current;
    if (!map) return;

    // Already resolved (from recents) — use immediately.
    if (f.center) {
      const [lng, latitude] = f.center;
      map.panTo({ lat: latitude, lng });
      map.setZoom(14);
      dropPin(lng, latitude, f.text);
      pushRecent(f);
      setQuery(''); setResults([]); setSearchOpen(false); setActiveIdx(-1);
      inputRef.current?.blur();
      return;
    }

    // Resolve place → lat/lng via Places API (New) toPlace().fetchFields().
    // M1: same session token from the autocomplete call closes the billing session.
    // M2: field mask restricted to Basic Data only (displayName + location — free tier).
    const prediction = f._prediction;
    if (!prediction) return;
    (async () => {
      try {
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'location'] });
        if (unmountedRef.current || !mapRef.current) return;
        const loc = place.location as google.maps.LatLng | null;
        if (!loc) return;
        const lng = loc.lng();
        const latitude = loc.lat();
        const label: string = (place.displayName as string | undefined) ?? f.text;
        const enriched: GeocodeFeature = { ...f, center: [lng, latitude], text: label };
        map.panTo({ lat: latitude, lng });
        map.setZoom(14);
        dropPin(lng, latitude, enriched.text);
        pushRecent(enriched);
        setQuery(''); setResults([]); setSearchOpen(false); setActiveIdx(-1);
        inputRef.current?.blur();
        // Session closes after fetchFields — start a fresh one for the next typeahead.
        makeNewSession();
      } catch { /* silently drop failed resolution */ }
    })();
  }

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAP_ID || MAP_ID === 'DEMO_MAP_ID') {
      console.warn('[CityMapView] NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID not set — using DEMO_MAP_ID.');
    }
    // CRITICAL: reset unmountedRef on each mount. React StrictMode (dev) mounts
    // → cleans up → remounts the same useRef object, so without this line the
    // ref stays `true` forever after the first StrictMode cleanup and EVERY
    // POI click silently short-circuits at the `if (unmountedRef.current)`
    // guard below. The async Place.fetchFields path was the user-visible
    // symptom: clicking a green POI did nothing because the handler bailed
    // before reaching dropPin.
    unmountedRef.current = false;

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
          // 'greedy' lets single-finger touch drag pan the map (instead of
          // scrolling the page), matching the prior Mapbox touch-action:none parity.
          gestureHandling: 'greedy',
          // POIs ARE clickable so we can capture their placeId + name, then
          // suppress Google's default info bubble via e.stop() in the click
          // listener below and drop our own purple pin at that exact spot.
          // The "claim" animation on the purple pin gives the visual sense
          // of converting Google's green POI label into the user's pin.
          clickableIcons: true,
          zoomControl: true,
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP },
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
        mapRef.current = map;

        // Hide Google's built-in locality + POI markers. They render as small
        // white dots with the city/place name and end up sitting on top of
        // our monument rings (e.g. "London" dot inside the Big Ben circle,
        // "Paris" dot inside Eiffel's). The viewer is already inside this
        // city via the title overlay, so the redundant pin is just noise.
        // Uses the FeatureLayer API which requires a vector mapId (we set
        // one above), so the style override is silently a no-op if mapId
        // isn't applied.
        try {
          const FT = (google.maps as unknown as { FeatureType?: Record<string, string> }).FeatureType;
          if (FT) {
            const hidden: google.maps.FeatureStyleOptions = {
              strokeOpacity: 0, fillOpacity: 0, strokeWeight: 0,
            };
            for (const key of ['POINT_OF_INTEREST', 'LOCALITY']) {
              const t = FT[key];
              if (!t) continue;
              const layer = map.getFeatureLayer(t as google.maps.FeatureType);
              if (layer) layer.style = hidden;
            }
          }
        } catch { /* style API absent on older builds — leave default markers */ }

        // Google Maps caches its initial container size and doesn't always
        // reflow on viewport changes (rotate, devtools open, sheet expand).
        // Observe the container and trigger a resize so tiles re-fill and
        // controls stay aligned after every layout change.
        if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
          const ro = new ResizeObserver(() => {
            if (!mapRef.current) return;
            const c = mapRef.current.getCenter();
            google.maps.event.trigger(mapRef.current, 'resize');
            if (c) mapRef.current.setCenter(c);
          });
          ro.observe(containerRef.current);
          resizeObserverRef.current = ro;
        }

        // Places API (New) needs no service object — calls are static methods / instance methods.

        zoomListener = map.addListener('zoom_changed', () => {
          const z = map.getZoom();
          if (z !== undefined && z < RETURN_TO_GLOBE_ZOOM) onCloseRef.current();
        });

        clickListener = map.addListener('click', (e: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
          if (!e.latLng) return;
          // POI clicks expose placeId on IconMouseEvent. Stop the default
          // Google infowindow so our purple pin "claims" the POI instead.
          const placeId = (e as google.maps.IconMouseEvent).placeId;
          if (placeId) {
            (e as google.maps.IconMouseEvent).stop?.();
            // Resolve the POI's display name (free under Basic field mask).
            // Reuses the same session token so autocomplete + this resolution
            // collapse into one SKU billing event.
            (async () => {
              try {
                if (!sessionTokenRef.current) makeNewSession();
                const place = new google.maps.places.Place({ id: placeId });
                await place.fetchFields({ fields: ['displayName', 'location'] });
                if (unmountedRef.current) return;
                const loc = place.location as google.maps.LatLng | null;
                const lng = loc?.lng() ?? e.latLng!.lng();
                const latitude = loc?.lat() ?? e.latLng!.lat();
                const name = (place.displayName as string | undefined) ?? undefined;
                dropPin(lng, latitude, name);
              } catch {
                // Fall back to the raw click location if the lookup fails.
                dropPin(e.latLng!.lng(), e.latLng!.lat());
              }
            })();
            return;
          }
          dropPin(e.latLng.lng(), e.latLng.lat());
        });

        google.maps.event.addListenerOnce(map, 'idle', () => {
          if (cancelled) return;
          addMonumentRings(map, monuments, monumentCirclesRef);
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
      unmountedRef.current = true;
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (clickListener) google.maps.event.removeListener(clickListener);
      if (zoomListener) google.maps.event.removeListener(zoomListener);
      droppedMarkersRef.current.forEach(m => m.remove());
      droppedMarkersRef.current = [];
      monumentCirclesRef.current.forEach(c => c.setMap(null));
      monumentCirclesRef.current = [];
      mapRef.current = null;
      sessionTokenRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, monuments]);

  return (
    <div style={{
      position: embedded ? 'absolute' : 'fixed', inset: 0, zIndex: embedded ? 0 : 1000,
      background: '#060816',
      animation: 'mapFadeIn 0.3s ease-out',
    }}>
      <style>{`@keyframes mapFadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes geknee-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute', bottom: 32, left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(167,139,250,0.95)',
            color: '#fff', fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
            fontSize: 13, fontWeight: 600,
            padding: '10px 18px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            animation: 'geknee-toast-in 0.18s ease-out',
            pointerEvents: 'none', zIndex: 5,
            maxWidth: 'calc(100vw - 48px)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >{toast}</div>
      )}

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
        // Anchored to the top-right so it never collides with the search bar
        // (which can grow to nearly the full viewport width on narrow screens).
        // The city name truncates instead of pushing the close button off-screen.
        position: 'absolute', top: 18, right: 18,
        background: 'rgba(6,8,22,0.85)', border: '1px solid rgba(100,210,255,0.4)',
        WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)', borderRadius: 10,
        color: '#fff', fontSize: 13, fontWeight: 700,
        padding: '8px 8px 8px 16px', display: 'flex', gap: 10, alignItems: 'center',
        maxWidth: 'calc(100vw - 36px)', minWidth: 0,
      }}>
        <span style={{
          pointerEvents: 'none',
          minWidth: 0, maxWidth: 180,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</span>
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
              WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)',
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
                onBlur={() => {
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
                  blurTimerRef.current = setTimeout(() => setSearchOpen(false), 180);
                }}
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
                WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)',
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

// Monument rings drawn as Google Maps Circles around collected landmarks.
// Radius 100m is visible at typical city zoom (12-18) and scales with zoom.
function addMonumentRings(
  map: google.maps.Map,
  monuments: MonumentMarker[],
  circlesRef: { current: google.maps.Circle[] },
) {
  // Clear any previously drawn circles before drawing fresh ones.
  circlesRef.current.forEach(c => c.setMap(null));
  circlesRef.current = [];
  if (monuments.length === 0) return;
  for (const mon of monuments) {
    const circle = new google.maps.Circle({
      map,
      center: { lat: mon.lat, lng: mon.lon },
      radius: 100, // metres — visible at zoom 12–18
      strokeColor: mon.ringColor,
      strokeOpacity: 0.9,
      strokeWeight: 3,
      fillOpacity: 0,
      clickable: false,
    });
    circlesRef.current.push(circle);
  }
}
