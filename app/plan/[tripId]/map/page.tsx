'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { lookupKnownCoords } from '@/app/plan/lib/monument-coords';

// ─── E1 · Plan map · Google Maps drop-pin UX ────────────────────────────────
// Dark-navy Google Maps. Click anywhere to drop a pin in the active category.
// On pin select we use Places Service to fetch a photo + rating + review
// snippet, surfaced in a floating info card. Type-ahead in the top search
// bar uses Places Autocomplete and drops the selected place as a pin.
//
// Pins persist to localStorage keyed by tripId; a /api/trips/[id]/places db
// backing is a clean follow-up.

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

type Category = 'food' | 'activities' | 'hotels' | 'shopping' | 'monument';
const CATEGORIES: Category[] = ['food', 'activities', 'hotels', 'shopping', 'monument'];
const CATEGORY_COLOR: Record<Category, string> = {
  food:       '#fb923c',
  activities: '#a78bfa',
  hotels:     '#7dd3fc',
  shopping:   '#fbbf24',
  monument:   '#f5f1e8',
};
const CATEGORY_LABEL: Record<Category, string> = {
  food: 'Food', activities: 'Activities', hotels: 'Hotels', shopping: 'Shopping', monument: 'Monument',
};

interface PlaceDetails {
  photos?: string[];           // up to ~6 photo URLs
  rating?: number;
  reviewCount?: number;
  reviewList?: { author: string; rating: number; text: string; relative: string }[];
  address?: string;
  phone?: string;
  website?: string;
  openNow?: boolean;
  hoursToday?: string;
  hoursWeek?: string[];
  priceLevel?: number;         // 0–4
  types?: string[];
}

interface Pin {
  id: string;
  category: Category;
  label: string;
  lat: number;
  lon: number;
  place?: PlaceDetails;
}

interface TripData { id: string; location: string | null }

const STORAGE = (tripId: string) => `geknee_plan_pins_${tripId}`;

// Dark-navy Google Maps style — matches the design handoff (#0d1525 land,
// #1a1f3a districts, #1e3a5f water).
const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#0d1525' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1525' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#6d7aa8' }] },
  { featureType: 'administrative',     elementType: 'geometry',           stylers: [{ color: '#1a1f3a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a78bfa' }] },
  { featureType: 'poi',                elementType: 'geometry',           stylers: [{ color: '#191e35' }] },
  { featureType: 'poi',                elementType: 'labels.text.fill',   stylers: [{ color: '#7d8aa8' }] },
  { featureType: 'poi.park',           elementType: 'geometry',           stylers: [{ color: '#1f3d2c' }] },
  { featureType: 'poi.park',           elementType: 'labels.text.fill',   stylers: [{ color: '#5fa676' }] },
  { featureType: 'road',               elementType: 'geometry',           stylers: [{ color: '#2a3050' }] },
  { featureType: 'road.arterial',      elementType: 'geometry',           stylers: [{ color: '#3d4570' }] },
  { featureType: 'road.highway',       elementType: 'geometry',           stylers: [{ color: '#3d4570' }] },
  { featureType: 'transit',            elementType: 'geometry',           stylers: [{ color: '#2a3050' }] },
  { featureType: 'water',              elementType: 'geometry',           stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'water',              elementType: 'labels.text.fill',   stylers: [{ color: '#5b8fb8' }] },
];

export default function PlanMapPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? '';
  const router = useRouter();

  const [trip, setTrip] = useState<TripData | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>('activities');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load trip + restore pins
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${encodeURIComponent(tripId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d?.trip) {
          console.log('[plan/map] trip loaded — location =', JSON.stringify(d.trip.location));
          setTrip({ id: d.trip.id, location: d.trip.location ?? null });
        }
      });
    try {
      const raw = localStorage.getItem(STORAGE(tripId));
      if (raw) setPins(JSON.parse(raw));
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [tripId]);

  // Persist on change
  useEffect(() => {
    if (!tripId) return;
    try { localStorage.setItem(STORAGE(tripId), JSON.stringify(pins)); } catch { /* ignore */ }
  }, [tripId, pins]);

  const addPin = (lat: number, lon: number, label?: string, place?: PlaceDetails) => {
    const id = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPins(p => [...p, {
      id,
      category: activeCategory,
      label: label || `Pin ${p.length + 1}`,
      lat, lon,
      place,
    }]);
    setSelectedPinId(id);
    return id;
  };
  const removePin = (id: string) => {
    setPins(p => p.filter(x => x.id !== id));
    if (selectedPinId === id) setSelectedPinId(null);
  };
  const renamePin = (id: string, label: string) => {
    setPins(p => p.map(x => x.id === id ? { ...x, label } : x));
  };
  const recategorise = (id: string, category: Category) => {
    setPins(p => p.map(x => x.id === id ? { ...x, category } : x));
  };
  const updatePinPlace = (id: string, place: PlaceDetails) => {
    setPins(p => p.map(x => x.id === id ? { ...x, place: { ...x.place, ...place } } : x));
  };

  const grouped = useMemo(() => {
    const out: Record<Category, Pin[]> = { food: [], activities: [], hotels: [], shopping: [], monument: [] };
    for (const p of pins) out[p.category].push(p);
    return out;
  }, [pins]);

  const generateItinerary = () => {
    const stops = pins.map(p => ({ city: p.label, lat: p.lat, lon: p.lon, category: p.category }));
    const q = new URLSearchParams({ savedTripId: tripId, stops: JSON.stringify(stops) });
    if (trip?.location) q.set('location', trip.location);
    router.push(`/plan/summary?${q.toString()}`);
  };

  const tokenMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const selectedPin = pins.find(p => p.id === selectedPinId) ?? null;

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--brand-bg)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, sans-serif',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 360px',
    }}>
      {/* Map column */}
      <div style={{ position: 'relative', minHeight: '100svh' }}>
        {/* Top app bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          height: 64, padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(5,5,15,0.85)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--brand-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/plan" style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '6px 12px', borderRadius: 999,
              border: '1px solid rgba(167,139,250,0.35)',
              background: 'rgba(167,139,250,0.08)',
              color: 'var(--brand-accent)',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700,
              textDecoration: 'none',
            }}>
              {String.fromCodePoint(0x2190)} BACK TO GLOBE
            </Link>
            <div style={{ fontFamily: DISPLAY, fontSize: 17, color: 'var(--brand-ink)' }}>
              {trip?.location ?? '—'} · <span style={{ color: 'var(--brand-accent)', fontStyle: 'italic' }}>plan your stops</span>
            </div>
          </div>
          <button
            onClick={generateItinerary}
            disabled={pins.length === 0}
            style={{
              padding: '8px 14px', borderRadius: 999,
              background: pins.length === 0 ? 'rgba(167,139,250,0.2)' : 'var(--brand-accent)',
              color: 'var(--brand-bg)',
              border: 'none', fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit',
              cursor: pins.length === 0 ? 'not-allowed' : 'pointer',
              opacity: pins.length === 0 ? 0.55 : 1,
            }}
          >
            Generate itinerary {String.fromCodePoint(0x2192)}
          </button>
        </div>

        {/* Search input — wired to Google Places Autocomplete via PlanMap */}
        <div style={{
          position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 18, width: 'min(440px, calc(100% - 32px))',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(13,13,36,0.92)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
            border: '1px solid var(--brand-border)', borderRadius: 12,
            padding: '0 12px',
          }}>
            <span style={{ color: 'var(--brand-ink-mute)', fontSize: 14, marginRight: 8 }}>
              {String.fromCodePoint(0x2315)}
            </span>
            <input
              id="plan-map-search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search a place to add to your trip"
              style={{
                flex: 1, padding: '10px 0',
                background: 'transparent', border: 'none',
                color: 'var(--brand-ink)', fontFamily: 'inherit', fontSize: 14,
                outline: 'none',
              }}
            />
            <span style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
              color: 'var(--brand-ink-mute)',
              padding: '3px 8px', border: '1px solid var(--brand-border)', borderRadius: 6,
            }}>ENTER</span>
          </div>
        </div>

        {/* Category filter */}
        <div style={{
          position: 'absolute', top: 80, right: 24, zIndex: 18,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {CATEGORIES.map(c => {
            const active = activeCategory === c;
            return (
              <button key={c} onClick={() => setActiveCategory(c)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999,
                background: active ? `${CATEGORY_COLOR[c]}22` : 'rgba(13,13,36,0.85)',
                WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
                border: `1px solid ${active ? CATEGORY_COLOR[c] : 'var(--brand-border)'}`,
                color: active ? CATEGORY_COLOR[c] : 'var(--brand-ink-dim)',
                fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLOR[c] }} />
                {CATEGORY_LABEL[c]}
              </button>
            );
          })}
        </div>

        {/* Map */}
        <PlanMap
          location={trip?.location ?? null}
          pins={pins}
          activeCategory={activeCategory}
          selectedPinId={selectedPinId}
          onAddPin={addPin}
          onSelectPin={setSelectedPinId}
          onUpdatePinPlace={updatePinPlace}
        />

        {/* Selected-pin info card — Google Places photo + rating + review */}
        {selectedPin && (
          <PinInfoCard
            pin={selectedPin}
            onClose={() => setSelectedPinId(null)}
            onRename={(label) => renamePin(selectedPin.id, label)}
          />
        )}

        {tokenMissing && (
          <div style={{
            position: 'absolute', inset: 64,
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-ink-mute)', fontSize: 12,
            background: 'var(--brand-bg2)',
          }}>
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — map preview disabled.
          </div>
        )}
      </div>

      {/* Right rail */}
      <aside style={{
        borderLeft: '1px solid var(--brand-border)',
        background: 'var(--brand-bg2)',
        padding: '24px 20px',
        overflowY: 'auto',
        maxHeight: '100svh',
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
          color: 'var(--brand-accent-2)', marginBottom: 12, fontWeight: 600,
        }}>
          {String.fromCodePoint(0x00A7)} YOUR PINS · {pins.length}
        </div>
        <h2 style={{
          margin: '0 0 16px',
          fontFamily: DISPLAY, fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em',
        }}>
          Drop, label, <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>generate.</em>
        </h2>
        <p style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 0, lineHeight: 1.5 }}>
          Click the map to drop a pin in the active category. Search above to add by name. Click any pin to see Google place details.
        </p>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {CATEGORIES.map(c => grouped[c].length > 0 && (
            <div key={c}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
                color: CATEGORY_COLOR[c], textTransform: 'uppercase', marginBottom: 8,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLOR[c] }} />
                {CATEGORY_LABEL[c]} · {grouped[c].length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {grouped[c].map(p => (
                  <PinRow
                    key={p.id}
                    pin={p}
                    selected={selectedPinId === p.id}
                    onSelect={() => setSelectedPinId(p.id)}
                    onRemove={() => removePin(p.id)}
                    onRename={label => renamePin(p.id, label)}
                    onRecategorise={cat => recategorise(p.id, cat)}
                  />
                ))}
              </div>
            </div>
          ))}
          {pins.length === 0 && (
            <div style={{
              padding: 24, textAlign: 'center',
              border: '1.5px dashed var(--brand-border)', borderRadius: 12,
              color: 'var(--brand-ink-mute)', fontSize: 12,
            }}>
              No pins yet. Drop one to get started.
            </div>
          )}
        </div>

        {pins.length > 0 && (
          <div style={{
            position: 'sticky', bottom: 0,
            marginTop: 24, marginInline: -20, padding: '16px 20px',
            background: 'linear-gradient(180deg, rgba(13,13,36,0), rgba(13,13,36,0.95) 30%)',
            WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
            borderTop: '1px solid var(--brand-border)',
          }}>
            <div style={{
              padding: 16, borderRadius: 14,
              background: 'rgba(167,139,250,0.10)',
              border: '1px solid var(--brand-border-hi)',
            }}>
              <div style={{
                fontFamily: DISPLAY, fontSize: 15, fontWeight: 400,
                color: 'var(--brand-ink)', marginBottom: 6,
              }}>
                Ready to plan?
              </div>
              <div style={{
                fontSize: 12, color: 'var(--brand-ink-dim)',
                lineHeight: 1.5, marginBottom: 12,
              }}>
                We&apos;ll order your {pins.length} stop{pins.length === 1 ? '' : 's'} into a daily route, with timing and walking distance.
              </div>
              <button
                onClick={generateItinerary}
                style={{
                  width: '100%',
                  padding: '10px 14px', borderRadius: 10,
                  background: 'var(--brand-accent)',
                  color: 'var(--brand-bg)',
                  border: 'none',
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(167,139,250,0.35)',
                }}
              >
                + Generate itinerary
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Map component ──────────────────────────────────────────────────────────

function PlanMap({
  location, pins, activeCategory, selectedPinId,
  onAddPin, onSelectPin, onUpdatePinPlace,
}: {
  location: string | null;
  pins: Pin[];
  activeCategory: Category;
  selectedPinId: string | null;
  onAddPin: (lat: number, lon: number, label?: string, place?: PlaceDetails) => string;
  onSelectPin: (id: string | null) => void;
  onUpdatePinPlace: (id: string, place: PlaceDetails) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const placesRef = useRef<google.maps.places.PlacesService | null>(null);
  const markerMap = useRef<Map<string, google.maps.Marker>>(new Map());
  const onAddPinRef = useRef(onAddPin);
  onAddPinRef.current = onAddPin;
  const onSelectPinRef = useRef(onSelectPin);
  onSelectPinRef.current = onSelectPin;
  const onUpdatePinPlaceRef = useRef(onUpdatePinPlace);
  onUpdatePinPlaceRef.current = onUpdatePinPlace;
  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;

  // Track when the Google Maps Map instance has been created. The map
  // creation effect runs once on mount, but `location` may still be null
  // at that point (trip fetch hasn't returned yet). The recenter effect
  // depends on BOTH `location` and `mapReady` so it fires correctly
  // regardless of which arrived second.
  const [mapReady, setMapReady] = useState(false);

  // Mount once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current) return;
      // Fast path: if the trip's destination is already known at the
      // moment Google Maps loads, use those coords as the initial center
      // so the map lands on Taj Mahal / Eiffel / etc. immediately.
      // Otherwise fall back to a wide global view (zoom 2) and the
      // recenter effect snaps in once `location` resolves from the trip
      // fetch (mapReady flips true now, that effect's deps trigger).
      const known = lookupKnownCoords(location);
      const map = new google.maps.Map(containerRef.current, {
        center: known ?? { lat: 20, lng: 0 },
        zoom: known ? 13 : 2,
        styles: DARK_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      });
      mapRef.current = map;
      placesRef.current = new google.maps.places.PlacesService(map);
      setMapReady(true);

      // Click → drop pin. Use nearby PlacesService to look up the closest
      // place; if a match is found, attach photo/rating/review snippet.
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        const lat = e.latLng?.lat();
        const lng = e.latLng?.lng();
        if (lat === undefined || lng === undefined) return;
        const id = onAddPinRef.current(lat, lng);
        // Defer the place lookup so the pin shows up immediately.
        if (placesRef.current) {
          placesRef.current.nearbySearch(
            { location: { lat, lng }, radius: 60 },
            (results, status) => {
              if (status !== google.maps.places.PlacesServiceStatus.OK) return;
              const top = results?.[0];
              if (!top?.place_id) return;
              hydratePinFromPlace(id, top.place_id);
            }
          );
        }
      });

      // Wire up Places Autocomplete on the search input.
      const input = document.getElementById('plan-map-search') as HTMLInputElement | null;
      if (input) {
        const ac = new google.maps.places.Autocomplete(input, {
          fields: [
            'name', 'geometry', 'place_id',
            'photos', 'rating', 'user_ratings_total', 'reviews',
            'formatted_address', 'formatted_phone_number',
            'website', 'opening_hours', 'price_level', 'types',
          ],
        });
        ac.bindTo('bounds', map);
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place.geometry?.location) return;
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          onAddPinRef.current(lat, lng, place.name, placeToDetails(place));
          map.panTo({ lat, lng });
          if (input) input.value = '';
        });
      }
    }).catch(() => { /* ignore — no key */ });

    return () => {
      cancelled = true;
      markerMap.current.forEach(m => m.setMap(null));
      markerMap.current.clear();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hydratePinFromPlace(pinId: string, placeId: string) {
    if (!placesRef.current) return;
    placesRef.current.getDetails(
      {
        placeId,
        fields: [
          'name', 'photos', 'rating', 'user_ratings_total', 'reviews',
          'formatted_address', 'formatted_phone_number',
          'website', 'opening_hours', 'price_level', 'types',
        ],
      },
      (res, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !res) return;
        const details = placeToDetails(res);
        if (details) onUpdatePinPlaceRef.current(pinId, details);
      }
    );
  }

  // Recenter the map on the trip's destination as soon as BOTH the
  // location string and the Google Maps instance are available.
  //
  // Three-tier resolution chain (each tier independently logged so a
  // user with the camera stuck at the global fallback can always
  // diagnose which tier failed by opening the browser console):
  //
  //   1. lookupKnownCoords(location)  — synchronous, fuzzy substring
  //      match against the MONUMENT_LATLON table. Zero API calls.
  //   2. Google Maps client-side Geocoder  — covers locations outside
  //      the monument table (cities, custom destinations).
  //   3. /api/geocode  — server-side proxy as a last resort. If the
  //      client-side Geocoder is throttled or the JS API key has been
  //      restricted in a way that blocks the Geocoder service but not
  //      the server-side Geocoding key, this still works.
  //
  // Without the mapReady dep there's a race: if `location` updates
  // BEFORE the SDK finishes loading, the effect fires once with
  // mapRef=null, bails, never re-runs — leaving the camera at the
  // (lat 20, lng 0) global fallback. Both deps mean whichever resolves
  // last triggers the recenter.
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map || !location) return;
    let cancelled = false;
    const apply = (coords: { lat: number; lng: number } | google.maps.LatLng) => {
      if (cancelled) return;
      map.setCenter(coords);
      map.setZoom(13);
    };

    const known = lookupKnownCoords(location);
    if (known) {
      console.log('[plan/map] tier-1 monument hit for', location, '→', known);
      apply(known);
      return;
    }

    loadGoogleMaps().then(() => {
      if (cancelled) return;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: location }, (results, status) => {
        if (cancelled) return;
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          console.log('[plan/map] tier-2 client geocoder hit for', location);
          apply(results[0].geometry.location);
          return;
        }
        console.warn('[plan/map] tier-2 client geocoder failed for', location, 'status:', status, '— trying server fallback');
        // Tier 3: server-side geocode endpoint (separate API key /
        // quota path; survives client-side restrictions).
        fetch(`/api/geocode?address=${encodeURIComponent(location)}`)
          .then(r => (r.ok ? r.json() : Promise.reject(new Error(`http ${r.status}`))))
          .then((d: { lat?: number; lng?: number } | null) => {
            if (cancelled) return;
            if (d && typeof d.lat === 'number' && typeof d.lng === 'number') {
              console.log('[plan/map] tier-3 server geocoder hit for', location);
              apply({ lat: d.lat, lng: d.lng });
            } else {
              console.error('[plan/map] all 3 tiers failed for', location, '(server returned)', d);
            }
          })
          .catch(e => {
            if (cancelled) return;
            console.error('[plan/map] tier-3 server geocoder error for', location, e);
          });
      });
    });

    return () => { cancelled = true; };
  }, [location, mapReady]);

  // Sync markers with pins state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    pins.forEach((p, i) => {
      seen.add(p.id);
      const existing = markerMap.current.get(p.id);
      const icon = pinSvgIcon(i + 1, p.category, p.id === selectedPinId);
      if (existing) {
        existing.setPosition({ lat: p.lat, lng: p.lon });
        existing.setIcon(icon);
        existing.setZIndex(p.id === selectedPinId ? 1000 : 100);
      } else {
        const marker = new google.maps.Marker({
          position: { lat: p.lat, lng: p.lon },
          map,
          icon,
          zIndex: p.id === selectedPinId ? 1000 : 100,
        });
        marker.addListener('click', () => {
          onSelectPinRef.current(p.id);
        });
        markerMap.current.set(p.id, marker);
      }
    });
    Array.from(markerMap.current.entries()).forEach(([id, marker]) => {
      if (!seen.has(id)) {
        marker.setMap(null);
        markerMap.current.delete(id);
      }
    });
  }, [pins, selectedPinId]);

  // Manual recenter — gives the user an explicit escape hatch when the
  // automatic 3-tier resolution chain doesn't land on the right spot.
  // Click reproduces the same logic as the recenter effect.
  const recenterOnDestination = () => {
    const map = mapRef.current;
    if (!map || !location) return;
    const known = lookupKnownCoords(location);
    if (known) {
      console.log('[plan/map] manual recenter — tier-1 hit for', location, '→', known);
      map.setCenter(known);
      map.setZoom(13);
      return;
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: location }, (results, status) => {
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        console.log('[plan/map] manual recenter — tier-2 hit for', location);
        map.setCenter(results[0].geometry.location);
        map.setZoom(13);
        return;
      }
      console.warn('[plan/map] manual recenter — tier-2 failed, trying tier-3');
      fetch(`/api/geocode?address=${encodeURIComponent(location)}`)
        .then(r => (r.ok ? r.json() : null))
        .then((d: { lat?: number; lng?: number } | null) => {
          if (d && typeof d.lat === 'number' && typeof d.lng === 'number') {
            console.log('[plan/map] manual recenter — tier-3 hit for', location);
            map.setCenter({ lat: d.lat, lng: d.lng });
            map.setZoom(13);
          } else {
            console.error('[plan/map] manual recenter — all tiers failed for', location);
          }
        });
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100svh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#0d1525' }} />
      {location && (
        <button
          onClick={recenterOnDestination}
          aria-label={`Center map on ${location}`}
          title={`Center map on ${location}`}
          style={{
            position: 'absolute', bottom: 24, left: 24, zIndex: 18,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 999,
            background: 'rgba(13,13,36,0.92)',
            border: '1px solid rgba(56,189,248,0.4)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#38bdf8',
            fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <span aria-hidden>{String.fromCodePoint(0x1F4CD)}</span>
          Center on {location}
        </button>
      )}
    </div>
  );
}

function pinSvgIcon(num: number, category: Category, selected: boolean): google.maps.Icon {
  const color = CATEGORY_COLOR[category];
  const ring = selected ? '#a78bfa' : '#0a0a1f';
  const size = selected ? 36 : 28;
  const r = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${r}" cy="${r}" r="${r - 2}" fill="${color}" stroke="${ring}" stroke-width="2.5"/>
    <text x="${r}" y="${r + Math.round(size * 0.16)}" text-anchor="middle"
          font-family="ui-monospace,monospace" font-size="${Math.round(size * 0.42)}" font-weight="800"
          fill="#0a0a1f">${num}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(r, r),
  };
}

function placeToDetails(p: google.maps.places.PlaceResult): PlaceDetails | undefined {
  const photos = (p.photos ?? [])
    .slice(0, 6)
    .map(ph => ph.getUrl({ maxWidth: 800, maxHeight: 600 }));
  const reviewList = (p.reviews ?? []).slice(0, 3).map(r => ({
    author: r.author_name ?? 'Anonymous',
    rating: r.rating ?? 0,
    text: r.text ?? '',
    relative: r.relative_time_description ?? '',
  }));
  // Today's hours via opening_hours.weekday_text + the new index from
  // Date#getDay() (0=Sun … 6=Sat). The Google `weekday_text` array is
  // Mon–Sun ordered.
  const weekdayText = (p.opening_hours as { weekday_text?: string[] } | undefined)?.weekday_text ?? undefined;
  const today = new Date().getDay();
  const idx = today === 0 ? 6 : today - 1;
  const hoursToday = weekdayText?.[idx]?.split(': ')[1];
  // open_now is on the legacy field; use isOpen() on the Place when available
  // (some maps versions strip open_now from the result).
  let openNow: boolean | undefined;
  try {
    const oh = p.opening_hours as { isOpen?: () => boolean; open_now?: boolean } | undefined;
    if (oh) {
      if (typeof oh.isOpen === 'function') openNow = oh.isOpen();
      else if (typeof oh.open_now === 'boolean') openNow = oh.open_now;
    }
  } catch { /* ignore */ }
  return {
    photos,
    rating: p.rating,
    reviewCount: p.user_ratings_total,
    reviewList,
    address: p.formatted_address,
    phone: p.formatted_phone_number,
    website: p.website,
    openNow,
    hoursToday,
    hoursWeek: weekdayText,
    priceLevel: p.price_level,
    types: p.types,
  };
}

// ─── Selected-pin info card ─────────────────────────────────────────────────

function PinInfoCard({ pin, onClose, onRename }: {
  pin: Pin;
  onClose: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pin.label);
  const [activePhoto, setActivePhoto] = useState(0);
  const [hoursOpen, setHoursOpen] = useState(false);
  useEffect(() => { setDraft(pin.label); setActivePhoto(0); setHoursOpen(false); }, [pin.id, pin.label]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== pin.label) onRename(t);
    setEditing(false);
  };

  const photos = pin.place?.photos ?? [];
  const heroPhoto = photos[activePhoto];

  return (
    <div style={{
      position: 'absolute', left: 24, bottom: 24, zIndex: 25,
      width: 'min(380px, calc(100% - 48px))',
      maxHeight: 'calc(100% - 96px)',
      overflow: 'auto',
      background: 'rgba(13,13,36,0.96)',
      WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--brand-border-hi)',
      borderRadius: 14,
      boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
    }}>
      {heroPhoto ? (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9' }}>
          <img src={heroPhoto} alt={pin.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <button onClick={onClose} style={{
            position: 'absolute', top: 10, right: 10,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(10,10,31,0.7)',
            border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
          }}>{String.fromCodePoint(0x00D7)}</button>
          {photos.length > 1 && (
            <div style={{
              position: 'absolute', left: 10, bottom: 10, right: 10,
              display: 'flex', gap: 6, overflowX: 'auto',
            }}>
              {photos.map((url, i) => (
                <button key={i} onClick={() => setActivePhoto(i)} style={{
                  flexShrink: 0,
                  width: 56, height: 38, borderRadius: 4,
                  border: i === activePhoto ? '2px solid var(--brand-accent)' : '1px solid rgba(255,255,255,0.2)',
                  padding: 0, cursor: 'pointer', background: 'transparent', overflow: 'hidden',
                  opacity: i === activePhoto ? 1 : 0.7,
                }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'flex-end',
          borderBottom: '1px solid var(--brand-border)' }}>
          <button onClick={onClose} style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'transparent', border: '1px solid var(--brand-border)',
            color: 'var(--brand-ink-mute)', cursor: 'pointer',
            fontSize: 14, lineHeight: 1,
          }}>{String.fromCodePoint(0x00D7)}</button>
        </div>
      )}

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Category + price + open-now chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
            color: CATEGORY_COLOR[pin.category],
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLOR[pin.category] }} />
            {CATEGORY_LABEL[pin.category].toUpperCase()}
          </span>
          {pin.place?.priceLevel !== undefined && pin.place.priceLevel > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--brand-ink-dim)', fontWeight: 700 }}>
              {'$'.repeat(pin.place.priceLevel)}
            </span>
          )}
          {pin.place?.openNow !== undefined && (
            <span style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700,
              padding: '2px 8px', borderRadius: 999,
              color: pin.place.openNow ? 'var(--brand-success)' : 'var(--brand-warn)',
              background: pin.place.openNow ? 'rgba(124,255,151,0.10)' : 'rgba(251,146,60,0.10)',
              border: `1px solid ${pin.place.openNow ? 'rgba(124,255,151,0.4)' : 'rgba(251,146,60,0.4)'}`,
            }}>{pin.place.openNow ? 'OPEN NOW' : 'CLOSED'}</span>
          )}
        </div>

        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(pin.label); setEditing(false); } }}
            style={{
              fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
              letterSpacing: '-0.01em', color: 'var(--brand-ink)',
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--brand-border)', outline: 'none', padding: '2px 0',
            }} />
        ) : (
          <div onClick={() => setEditing(true)}
            style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
              letterSpacing: '-0.01em', color: 'var(--brand-ink)', cursor: 'text' }}>
            {pin.label}
          </div>
        )}

        {pin.place?.rating !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stars value={Math.round(pin.place.rating)} />
            <span style={{ fontSize: 12, color: 'var(--brand-ink-dim)' }}>
              {pin.place.rating.toFixed(1)}
              {pin.place.reviewCount ? ` · ${pin.place.reviewCount.toLocaleString()} reviews` : ''}
            </span>
          </div>
        )}

        {pin.place?.address && (
          <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', lineHeight: 1.5 }}>
            {pin.place.address}
          </div>
        )}

        {/* Hours toggle — today's hours visible, click to expand week */}
        {(pin.place?.hoursToday || pin.place?.hoursWeek?.length) && (
          <div>
            <button onClick={() => setHoursOpen(o => !o)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--brand-border)',
              color: 'var(--brand-ink)', fontFamily: 'inherit', fontSize: 12,
              cursor: 'pointer',
            }}>
              <span>{String.fromCodePoint(0x25F7)} {pin.place?.hoursToday ?? 'See hours'}</span>
              <span style={{ color: 'var(--brand-ink-mute)' }}>{hoursOpen ? '▴' : '▾'}</span>
            </button>
            {hoursOpen && pin.place?.hoursWeek?.length && (
              <div style={{ marginTop: 6, padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                fontSize: 11, color: 'var(--brand-ink-dim)', lineHeight: 1.7 }}>
                {pin.place.hoursWeek.map((d, i) => <div key={i}>{d}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Action row: phone + website (helpful for menus) */}
        {(pin.place?.phone || pin.place?.website) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pin.place?.phone && (
              <a href={`tel:${pin.place.phone.replace(/\s+/g, '')}`}
                style={{
                  flex: '1 1 0', minWidth: 120, textAlign: 'center',
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--brand-border)',
                  color: 'var(--brand-ink)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                  textDecoration: 'none',
                }}>
                {String.fromCodePoint(0x260E)} {pin.place.phone}
              </a>
            )}
            {pin.place?.website && (
              <a href={pin.place.website} target="_blank" rel="noopener noreferrer"
                style={{
                  flex: '1 1 0', minWidth: 120, textAlign: 'center',
                  padding: '7px 10px', borderRadius: 8,
                  background: 'rgba(167,139,250,0.10)',
                  border: '1px solid var(--brand-border-hi)',
                  color: 'var(--brand-accent)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                  textDecoration: 'none',
                }}>
                {String.fromCodePoint(0x2197)} Website / menu
              </a>
            )}
          </div>
        )}

        {/* Reviews — top 3 from Google */}
        {pin.place?.reviewList?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
              color: 'var(--brand-ink-mute)',
            }}>
              REVIEWS · {pin.place.reviewCount?.toLocaleString() ?? pin.place.reviewList.length}
            </div>
            {pin.place.reviewList.map((r, i) => (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(167,139,250,0.05)',
                borderLeft: '2px solid var(--brand-accent)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Stars value={Math.round(r.rating)} />
                  <span style={{ fontSize: 11, color: 'var(--brand-ink)', fontWeight: 600 }}>{r.author}</span>
                  {r.relative && <span style={{ fontSize: 10, color: 'var(--brand-ink-mute)' }}>· {r.relative}</span>}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
                  display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>{r.text}</div>
              </div>
            ))}
          </div>
        ) : null}

        {!pin.place?.rating && !pin.place?.address && !pin.place?.reviewList?.length && (
          <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', fontStyle: 'italic' }}>
            No Google place match for this pin yet. Try the search bar to pin a named place instead of an empty patch of map.
          </div>
        )}
      </div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2, color: 'var(--brand-gold)' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ fontSize: 13, opacity: n <= value ? 1 : 0.3 }}>
          {String.fromCodePoint(0x2605)}
        </span>
      ))}
    </span>
  );
}

// ─── Sidebar pin row ────────────────────────────────────────────────────────

function PinRow({
  pin, selected, onSelect, onRemove, onRename, onRecategorise,
}: {
  pin: Pin;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (label: string) => void;
  onRecategorise: (c: Category) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pin.label);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== pin.label) onRename(t);
    setEditing(false);
  };

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8,
        background: selected ? 'rgba(167,139,250,0.10)' : 'transparent',
        border: `1px solid ${selected ? 'var(--brand-border-hi)' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <span style={{
        flexShrink: 0,
        width: 8, height: 8, borderRadius: '50%',
        background: CATEGORY_COLOR[pin.category],
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(pin.label); setEditing(false); } }}
            style={{
              width: '100%',
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--brand-ink)', fontFamily: 'inherit', fontSize: 13,
            }}
          />
        ) : (
          <div
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(pin.label); }}
            style={{
              fontSize: 13, color: 'var(--brand-ink)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >{pin.label}</div>
        )}
        <select
          value={pin.category}
          onClick={e => e.stopPropagation()}
          onChange={e => onRecategorise(e.target.value as Category)}
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--brand-ink-mute)', fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
            textTransform: 'uppercase', padding: 0, cursor: 'pointer',
          }}
        >
          {CATEGORIES.map(c => <option key={c} value={c} style={{ color: '#000' }}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove pin"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--brand-ink-mute)', fontSize: 16, padding: 0,
        }}
      >{String.fromCodePoint(0x00D7)}</button>
    </div>
  );
}
