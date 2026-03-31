'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';

export type BookmarkCategory = 'food' | 'activities' | 'hotels' | 'shopping' | 'other';

export interface Bookmark {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  category: BookmarkCategory;
  placeId?: string;
}

interface PlaceDetail {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;           // 0–4
  types: string[];
  openingHours?: string[];       // formatted weekday strings
  website?: string;
  phone?: string;
  editorialSummary?: string;
  coords: [number, number];
  photos: string[];
  reviews: Array<{ author: string; rating: number; text: string }>;
}

export interface MapControl {
  panTo: (coords: [number, number]) => void;
  openPlace: (placeId: string, coords: [number, number]) => void;
}

interface PlanningMapProps {
  bookmarks: Bookmark[];
  onAddBookmark: (b: Bookmark) => void;
  onRemoveBookmark: (id: string) => void;
  location?: string;
  extraStops?: string[];
  mapControlRef?: React.MutableRefObject<MapControl | null>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isRestaurantType(types: string[]) {
  const FOOD = ['restaurant','food','cafe','bar','bakery','meal_delivery',
                'meal_takeaway','fast_food','coffee','night_club','liquor_store'];
  return types.some(t => FOOD.includes(t));
}

function isActivityType(types: string[]) {
  const ACTIVITY = ['tourist_attraction','amusement_park','museum','park','zoo',
                    'aquarium','art_gallery','stadium','casino','movie_theater',
                    'bowling_alley','spa','gym','lodging','natural_feature',
                    'place_of_worship','point_of_interest'];
  return types.some(t => ACTIVITY.includes(t));
}

function priceDollars(level?: number) {
  if (level === undefined || level === null) return null;
  if (level === 0) return 'Free';
  return '$'.repeat(level);
}

function priceLabel(level?: number) {
  const labels = ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very Expensive'];
  return level !== undefined ? labels[level] ?? null : null;
}

function Stars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24">
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={s <= Math.round(rating) ? '#fbbf24' : 'rgba(255,255,255,0.15)'}
          />
        </svg>
      ))}
    </span>
  );
}

function Shimmer() {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[180, 140, 220, 100, 160].map((w, i) => (
        <div key={i} style={{
          height: 13, width: w, borderRadius: 6,
          background: 'rgba(255,255,255,0.07)',
          animation: 'gkShimmer 1.4s ease infinite',
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PlanningMap({
  bookmarks, onAddBookmark, onRemoveBookmark, location, extraStops, mapControlRef,
}: PlanningMapProps) {
  const divRef          = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<google.maps.Map | null>(null);
  const placesRef       = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef     = useRef<google.maps.Geocoder | null>(null);
  const autocompleteRef    = useRef<google.maps.places.AutocompleteService | null>(null);
  const destinationCenter  = useRef<google.maps.LatLng | null>(null);
  const destinationCountry = useRef<string | null>(null);
  const bmMarkersRef      = useRef<Map<string, google.maps.Marker>>(new Map());
  const searchMarkerRef   = useRef<google.maps.Marker | null>(null);
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [noResult, setNoResult]     = useState(false);
  const [detail, setDetail]         = useState<PlaceDetail | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab]   = useState<'info' | 'reviews' | 'menu'>('info');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ── Close panel ────────────────────────────────────────────────────────────
  const closePanel = useCallback(() => {
    setDetail(null);
    setNoResult(false);
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;
  }, []);

  // ── Fetch place details ────────────────────────────────────────────────────
  const fetchDetail = useCallback((placeId: string, fallback?: google.maps.LatLng) => {
    if (!placesRef.current) return;
    setLoading(true);
    setNoResult(false);
    setDetail(null);
    setActivePhoto(0);
    setActiveTab('info');

    placesRef.current.getDetails(
      {
        placeId,
        fields: [
          'place_id','name','formatted_address','rating','user_ratings_total',
          'price_level','types','opening_hours','website','formatted_phone_number',
          'editorial_summary','photos','reviews','geometry',
        ],
      },
      (place, status) => {
        setLoading(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          setNoResult(true);
          return;
        }
        const loc = place.geometry?.location ?? fallback;
        if (!loc) { setNoResult(true); return; }

        const coords: [number, number] = [loc.lng(), loc.lat()];
        const photos  = (place.photos  ?? []).slice(0, 12).map(p => p.getUrl({ maxWidth: 800, maxHeight: 600 }));
        const reviews = (place.reviews ?? []).slice(0, 5).map(r => ({
          author: r.author_name, rating: r.rating ?? 0, text: r.text,
        }));

        setDetail({
          placeId,
          name:             place.name ?? '',
          address:          place.formatted_address ?? '',
          rating:           place.rating,
          userRatingsTotal: place.user_ratings_total,
          priceLevel:       place.price_level,
          types:            place.types ?? [],
          openingHours:     place.opening_hours?.weekday_text,
          website:          place.website,
          phone:            place.formatted_phone_number,
          editorialSummary: (place as { editorial_summary?: { overview?: string } }).editorial_summary?.overview,
          coords,
          photos,
          reviews,
        });

        searchMarkerRef.current?.setMap(null);
        searchMarkerRef.current = new google.maps.Marker({
          position: { lat: loc.lat(), lng: loc.lng() },
          map: mapRef.current!,
          title: place.name,
          animation: google.maps.Animation.DROP,
        });
        mapRef.current?.panTo({ lat: loc.lat(), lng: loc.lng() });
        mapRef.current?.setZoom(15);
      }
    );
  }, []);

  // ── Search by text ─────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const q = query.trim();
    if (!q || !placesRef.current) return;
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    setNoResult(false);
    setDetail(null);
    placesRef.current.textSearch({ query: q }, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.[0]?.place_id) {
        setLoading(false);
        setNoResult(true);
        return;
      }
      fetchDetail(results[0].place_id!, results[0].geometry?.location ?? undefined);
    });
  }, [query, fetchDetail]);

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadGoogleMaps();
      if (cancelled || !divRef.current) return;
      if (mapRef.current) {
        // Strict-mode double-fire: map already exists, just wire up the control ref
        if (mapControlRef) {
          const m = mapRef.current;
          mapControlRef.current = {
            panTo: (coords: [number, number]) => { m.panTo({ lat: coords[1], lng: coords[0] }); m.setZoom(15); },
            openPlace: (placeId: string, coords: [number, number]) => { m.panTo({ lat: coords[1], lng: coords[0] }); m.setZoom(15); fetchDetail(placeId); },
          };
        }
        return;
      }

      const map = new google.maps.Map(divRef.current!, {
        zoom: 3,
        center: { lat: 20, lng: 0 },
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      mapRef.current        = map;
      placesRef.current     = new google.maps.places.PlacesService(map);
      geocoderRef.current   = new google.maps.Geocoder();
      autocompleteRef.current = new google.maps.places.AutocompleteService();
      if (mapControlRef) {
        mapControlRef.current = {
          panTo: (coords: [number, number]) => {
            map.panTo({ lat: coords[1], lng: coords[0] });
            map.setZoom(15);
          },
          openPlace: (placeId: string, coords: [number, number]) => {
            map.panTo({ lat: coords[1], lng: coords[0] });
            map.setZoom(15);
            fetchDetail(placeId);
          },
        };
      }

      // POI click → show in panel
      map.addListener('click', (e: google.maps.MapMouseEvent & { placeId?: string }) => {
        if (e.placeId) {
          (e as { stop?: () => void }).stop?.();
          fetchDetail(e.placeId);
        }
      });

      // Auto-zoom
      if (location && !cancelled) {
        const cities  = [location, ...(extraStops ?? [])].filter(Boolean);
        const isMulti = cities.length > 1;
        type GeoResult = { latlng: google.maps.LatLng; country: string | null };
        const geoResults = (await Promise.all(
          cities.map(city =>
            new Promise<GeoResult | null>(res =>
              geocoderRef.current!.geocode({ address: city }, (r, s) => {
                if (s !== 'OK' || !r?.[0]) { res(null); return; }
                const country = r[0].address_components
                  .find(c => c.types.includes('country'))?.short_name ?? null;
                res({ latlng: r[0].geometry.location, country });
              })
            )
          )
        )).filter((c): c is GeoResult => c !== null);
        const latlngs = geoResults.map(g => g.latlng);

        if (!cancelled && latlngs.length > 0) {
          destinationCenter.current  = latlngs[0];
          destinationCountry.current = geoResults[0].country;
          if (isMulti && latlngs.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            latlngs.forEach(c => bounds.extend(c));
            map.fitBounds(bounds, 80);
          } else {
            map.setCenter(latlngs[0]);
            map.setZoom(12);
          }
        }
      }
    }
    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, extraStops]);

  // Re-register POI listener when fetchDetail reference changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent & { placeId?: string }) => {
      if (e.placeId) { (e as { stop?: () => void }).stop?.(); fetchDetail(e.placeId); }
    });
    return () => google.maps.event.removeListener(listener);
  }, [fetchDetail]);

  // ── Sync bookmark markers ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ids = new Set(bookmarks.map(b => b.id));
    bmMarkersRef.current.forEach((m, id) => {
      if (!ids.has(id)) { m.setMap(null); bmMarkersRef.current.delete(id); }
    });
    bookmarks.forEach(bm => {
      if (bmMarkersRef.current.has(bm.id)) return;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
        <circle cx="15" cy="14" r="12" fill="#f59e0b" stroke="white" stroke-width="2.5"/>
        <text x="15" y="19" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#000">\u2605</text>
        <path d="M9,24 L15,40 L21,24" fill="#f59e0b" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>`;
      const marker = new google.maps.Marker({
        position: { lat: bm.coords[1], lng: bm.coords[0] },
        map,
        title: bm.name,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new google.maps.Size(30, 40),
          anchor: new google.maps.Point(15, 40),
        },
      });
      bmMarkersRef.current.set(bm.id, marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, mapRef.current]);

  const handleBookmark = useCallback(() => {
    if (!detail) return;
    let category: BookmarkCategory = 'other';
    if (isRestaurantType(detail.types)) category = 'food';
    else if (detail.types.some(t => ['lodging','hotel','motel','resort','hostel'].includes(t))) category = 'hotels';
    else if (isActivityType(detail.types)) category = 'activities';
    else if (detail.types.some(t => ['shopping_mall','store','clothing_store','department_store','supermarket','convenience_store','book_store','jewelry_store','shoe_store','electronics_store','furniture_store','home_goods_store','hardware_store','pet_store','florist','pharmacy'].includes(t))) category = 'shopping';
    onAddBookmark({ id: `bm_${Date.now()}`, name: detail.name, coords: detail.coords, category, placeId: detail.placeId });
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;
    setDetail(null);
    setQuery('');
  }, [detail, onAddBookmark]);

  const isBookmarked = !!detail && bookmarks.some(b => b.name === detail.name);
  const showPanel    = loading || !!detail;

  const isFood     = detail ? isRestaurantType(detail.types) : false;
  const isActivity = detail ? isActivityType(detail.types)   : false;
  const menuTabLabel = isFood ? 'Menu & Prices' : 'Admission';

  // Which tabs to show
  const tabs: { key: 'info' | 'reviews' | 'menu'; label: string }[] = [
    { key: 'info',    label: 'Overview' },
    { key: 'reviews', label: `Reviews${detail?.reviews.length ? ` (${detail.reviews.length})` : ''}` },
    ...(isFood || isActivity ? [{ key: 'menu' as const, label: menuTabLabel }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        @keyframes gkShimmer { 0%,100%{opacity:.35} 50%{opacity:.8} }
      `}</style>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={query}
            onChange={e => {
              const val = e.target.value;
              setQuery(val);
              setNoResult(false);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
              debounceRef.current = setTimeout(() => {
                if (!autocompleteRef.current) return;
                autocompleteRef.current.getPlacePredictions(
                  {
                    input: val,
                    types: [],
                    ...(destinationCenter.current
                      ? { location: destinationCenter.current, radius: 50000, strictBounds: false }
                      : {}),
                    ...(destinationCountry.current
                      ? { componentRestrictions: { country: destinationCountry.current } }
                      : {}),
                  },
                  (preds, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && preds?.length) {
                      setSuggestions(preds.slice(0, 6));
                      setShowSuggestions(true);
                    } else {
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }
                  }
                );
              }, 280);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { setShowSuggestions(false); handleSearch(); }
              if (e.key === 'Escape') setShowSuggestions(false);
            }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search a destination, or click any place on the map\u2026"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.13)', borderRadius: 10,
              color: '#fff', fontSize: 14, padding: '10px 14px', outline: 'none',
            }}
          />
          <button onClick={() => { setShowSuggestions(false); handleSearch(); }} disabled={loading || !query.trim()} style={{
            padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.3)',
            color: '#38bdf8', cursor: loading ? 'wait' : 'pointer', opacity: !query.trim() ? 0.45 : 1,
          }}>
            {loading ? '\u2026' : 'Search'}
          </button>
        </div>

        {/* ── Autocomplete dropdown ─────────────────────────────────────────── */}
        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            right: 0, zIndex: 999,
            background: '#0d1117', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            {suggestions.map((pred, i) => (
              <button
                key={pred.place_id}
                onMouseDown={e => {
                  e.preventDefault();
                  setQuery(pred.structured_formatting.main_text);
                  setSuggestions([]);
                  setShowSuggestions(false);
                  fetchDetail(pred.place_id);
                }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  width: '100%', background: 'transparent', border: 'none',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 14, marginTop: 1, opacity: 0.5, flexShrink: 0 }}>
                  {String.fromCodePoint(0x1F4CD)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pred.structured_formatting.main_text}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {pred.structured_formatting.secondary_text}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {noResult && <p style={{ margin: 0, fontSize: 12, color: '#f87171', paddingLeft: 2 }}>No results found. Try a different name.</p>}

      {/* ── Map + side panel ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 560, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* ── Side panel ──────────────────────────────────────────────────── */}
        {showPanel && (
          <div style={{
            width: 340, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
            background: '#0d1117', borderRight: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', flexDirection: 'column',
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent',
          }}>
            {loading ? <Shimmer /> : detail ? (
              <>
                {/* ── Hero photo + close ─────────────────────────────────── */}
                <div style={{ position: 'relative', flexShrink: 0, background: '#000', minHeight: 200 }}>
                  {detail.photos.length > 0 ? (
                    <img
                      src={detail.photos[activePhoto]}
                      alt=""
                      style={{ width: '100%', height: 210, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>No photos</span>
                    </div>
                  )}

                  {/* Close button */}
                  <button
                    onClick={closePanel}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none',
                      color: '#fff', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backdropFilter: 'blur(4px)',
                    }}
                    title="Close"
                  >
                    \u00D7
                  </button>

                  {/* Photo count */}
                  {detail.photos.length > 1 && (
                    <div style={{
                      position: 'absolute', bottom: 8, right: 8,
                      background: 'rgba(0,0,0,0.6)', borderRadius: 999,
                      padding: '2px 8px', color: '#fff', fontSize: 10, fontWeight: 600,
                      backdropFilter: 'blur(4px)',
                    }}>
                      {activePhoto + 1} / {detail.photos.length}
                    </div>
                  )}
                </div>

                {/* ── Thumbnail strip ────────────────────────────────────── */}
                {detail.photos.length > 1 && (
                  <div style={{
                    display: 'flex', gap: 3, padding: '5px 6px',
                    overflowX: 'auto', scrollbarWidth: 'none',
                    background: 'rgba(0,0,0,0.5)', flexShrink: 0,
                  }}>
                    {detail.photos.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        onClick={() => setActivePhoto(i)}
                        style={{
                          height: 46, width: 68, objectFit: 'cover', borderRadius: 5,
                          flexShrink: 0, cursor: 'pointer',
                          outline: i === activePhoto ? '2px solid #38bdf8' : '2px solid transparent',
                          opacity: i === activePhoto ? 1 : 0.5,
                          transition: 'opacity 0.15s',
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* ── Name + rating + bookmark ───────────────────────────── */}
                <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
                  <h3 style={{ margin: '0 0 5px', color: '#fff', fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
                    {detail.name}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    {detail.rating !== undefined && (
                      <>
                        <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>{detail.rating.toFixed(1)}</span>
                        <Stars rating={detail.rating} size={12} />
                        {detail.userRatingsTotal !== undefined && (
                          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                            ({detail.userRatingsTotal.toLocaleString()})
                          </span>
                        )}
                      </>
                    )}
                    {priceDollars(detail.priceLevel) && (
                      <span style={{
                        background: 'rgba(255,255,255,0.07)', borderRadius: 6,
                        padding: '1px 7px', fontSize: 11, color: '#a3e635', fontWeight: 600,
                      }}>
                        {priceDollars(detail.priceLevel)}
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 1.4 }}>
                    {detail.address}
                  </p>

                  <button
                    onClick={isBookmarked ? undefined : handleBookmark}
                    style={{
                      width: '100%', padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      background: isBookmarked ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.17)',
                      border: `1.5px solid ${isBookmarked ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.5)'}`,
                      color: isBookmarked ? '#86efac' : '#fcd34d',
                      cursor: isBookmarked ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      boxShadow: isBookmarked ? 'none' : '0 0 18px rgba(245,158,11,0.12)',
                      marginBottom: 12,
                    }}
                  >
                    {isBookmarked
                      ? <>{String.fromCodePoint(0x2713)} Bookmarked</>
                      : <>{String.fromCodePoint(0x2B50)} Bookmark this destination</>}
                  </button>

                  {/* ── Tabs ────────────────────────────────────────────── */}
                  <div style={{
                    display: 'flex', gap: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    marginLeft: -16, marginRight: -16, paddingLeft: 16,
                  }}>
                    {tabs.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        style={{
                          padding: '7px 12px', fontSize: 11, fontWeight: 600,
                          background: 'transparent', border: 'none',
                          borderBottom: `2px solid ${activeTab === t.key ? '#38bdf8' : 'transparent'}`,
                          color: activeTab === t.key ? '#38bdf8' : 'rgba(255,255,255,0.35)',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                          marginBottom: -1, transition: 'color 0.15s',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Tab: Overview ─────────────────────────────────────── */}
                {activeTab === 'info' && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.editorialSummary && (
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                        {detail.editorialSummary}
                      </p>
                    )}
                    {detail.openingHours && (
                      <div>
                        <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.1, textTransform: 'uppercase' }}>Hours</p>
                        {detail.openingHours.map((h, i) => (
                          <p key={i} style={{ margin: '0 0 3px', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{h}</p>
                        ))}
                      </div>
                    )}
                    {detail.phone && (
                      <div>
                        <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.1, textTransform: 'uppercase' }}>Phone</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#7dd3fc' }}>{detail.phone}</p>
                      </div>
                    )}
                    {detail.website && (
                      <div>
                        <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.1, textTransform: 'uppercase' }}>Website</p>
                        <a href={detail.website} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: '#38bdf8', wordBreak: 'break-all', textDecoration: 'none' }}>
                          {detail.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab: Reviews ──────────────────────────────────────── */}
                {activeTab === 'reviews' && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {detail.reviews.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 20 }}>No reviews available</p>
                    ) : detail.reviews.map((r, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: `hsl(${(r.author.charCodeAt(0) * 47) % 360},42%,34%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 13, fontWeight: 700,
                          }}>
                            {r.author[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div>
                            <p style={{ margin: '0 0 2px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 600 }}>{r.author}</p>
                            <Stars rating={r.rating} size={11} />
                          </div>
                        </div>
                        <p style={{
                          margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65,
                          display: '-webkit-box', WebkitLineClamp: 5,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        } as React.CSSProperties}>
                          {r.text}
                        </p>
                        {i < detail.reviews.length - 1 && (
                          <div style={{ marginTop: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Tab: Menu & Prices / Admission ────────────────────── */}
                {activeTab === 'menu' && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Price level */}
                    {detail.priceLevel !== undefined ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                        background: 'rgba(163,230,53,0.07)', border: '1px solid rgba(163,230,53,0.2)',
                        borderRadius: 10,
                      }}>
                        <div>
                          <p style={{ margin: '0 0 3px', fontSize: 22, fontWeight: 800, color: '#a3e635', letterSpacing: 1 }}>
                            {priceDollars(detail.priceLevel)}
                          </p>
                          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            {priceLabel(detail.priceLevel)}
                          </p>
                        </div>
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                          {isFood
                            ? 'Typical price range per person based on Google\u2019s rating.'
                            : 'Estimated cost based on Google\u2019s rating.'}
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        padding: '14px 16px', background: 'rgba(255,255,255,0.04)',
                        borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                          No price information available from Google.
                        </p>
                      </div>
                    )}

                    {/* Hours (useful for planning) */}
                    {detail.openingHours && (
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                          {isFood ? 'Opening Hours' : 'Visiting Hours'}
                        </p>
                        {detail.openingHours.map((h, i) => (
                          <p key={i} style={{ margin: '0 0 4px', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{h}</p>
                        ))}
                      </div>
                    )}

                    {/* Price context from reviews */}
                    {(() => {
                      const priceReviews = detail.reviews.filter(r =>
                        /\$|price|cost|expensive|cheap|worth|value|fee|ticket|admission|entry|menu|dish|meal/i.test(r.text)
                      );
                      if (priceReviews.length === 0) return null;
                      return (
                        <div>
                          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                            From reviews
                          </p>
                          {priceReviews.slice(0, 2).map((r, i) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{r.author}</p>
                              <p style={{
                                margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55,
                                display: '-webkit-box', WebkitLineClamp: 4,
                                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              } as React.CSSProperties}>
                                {r.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* View on Google Maps CTA */}
                    {detail.website && (
                      <a
                        href={detail.website}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '9px 0', borderRadius: 9, fontSize: 12, fontWeight: 600,
                          background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                          color: '#38bdf8', textDecoration: 'none',
                        }}
                      >
                        {isFood ? 'View Full Menu \u2192' : 'Official Website \u2192'}
                      </a>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div ref={divRef} style={{ width: '100%', height: '100%', minHeight: 560 }} />
        </div>
      </div>

    </div>
  );
}
