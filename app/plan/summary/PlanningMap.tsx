'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { lookupKnownCoords } from '@/app/plan/lib/monument-coords';
// Same palette as page.tsx PLANNING_CATS — kept in sync manually because
// PlanningMap needs to render markers without taking a prop dependency.
const MARKER_COLORS: Record<string, string> = {
  food:       '#f97316',
  activities: '#a78bfa',
  hotels:     '#60a5fa',
  shopping:   '#fbbf24',
  other:      '#94a3b8',
};


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

interface PlaceSummary {
  placeId: string;
  name: string;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types: string[];
  photoUrl?: string;
  coords: [number, number];
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
  const bmMarkersRef      = useRef<Map<string, google.maps.Marker>>(new Map());
  const polylineRef       = useRef<google.maps.Polyline | null>(null);
  const searchMarkerRef   = useRef<google.maps.Marker | null>(null);
  const resultMarkersRef  = useRef<google.maps.Marker[]>([]);
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Thumbnail strip ref so we can auto-scroll the active thumb into view
  // when the user clicks prev/next on the hero — otherwise the highlight
  // disappears off the visible edge of the strip on photos 6–10.
  const thumbStripRef     = useRef<HTMLDivElement | null>(null);

  const [query, setQuery]           = useState('');
  const [lastQuery, setLastQuery]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [noResult, setNoResult]     = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detail, setDetail]         = useState<PlaceDetail | null>(null);
  const [searchResults, setSearchResults] = useState<PlaceSummary[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab]   = useState<'info' | 'reviews' | 'menu'>('info');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const clearResultMarkers = useCallback(() => {
    resultMarkersRef.current.forEach(m => m.setMap(null));
    resultMarkersRef.current = [];
  }, []);

  // ── Close panel ────────────────────────────────────────────────────────────
  // Keep the active thumbnail in view as the user pages through photos
  // via the prev/next hero arrows. Without this, photos 6+ stay
  // highlighted in DOM but are scrolled off the visible strip.
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-thumb-index="${activePhoto}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activePhoto]);

  const closePanel = useCallback(() => {
    setDetail(null);
    setNoResult(false);
    setSearchError(null);
    setSearchResults([]);
    setLastQuery('');
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;
    clearResultMarkers();
  }, [clearResultMarkers]);

  // ── Fetch place details ────────────────────────────────────────────────────
  const fetchDetail = useCallback((placeId: string, fallback?: google.maps.LatLng) => {
    if (!placesRef.current) return;
    setLoading(true);
    setNoResult(false);
    setSearchError(null);
    setDetail(null);
    setSearchResults([]);
    clearResultMarkers();
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
  }, [clearResultMarkers]);

  // ── Search by text ─────────────────────────────────────────────────────────
  // Bias results to where the user is looking on the map, not their IP location.
  // Prefer the current viewport (handles user panning anywhere); fall back to
  // the destination center; finally fall back to no bias.
  const handleSearch = useCallback(() => {
    const q = query.trim();
    if (!q || !placesRef.current) return;
    setSuggestions([]);
    setShowSuggestions(false);
    setLoading(true);
    setNoResult(false);
    setSearchError(null);
    setDetail(null);
    setSearchResults([]);
    clearResultMarkers();
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;

    const map = mapRef.current;
    const bounds = map?.getBounds();
    const center = map?.getCenter() ?? destinationCenter.current ?? null;
    const req: google.maps.places.TextSearchRequest = { query: q };
    if (bounds) {
      req.bounds = bounds;
    } else if (center) {
      req.location = center;
      req.radius = 50000;
    }

    const PSS = google.maps.places.PlacesServiceStatus;

    // Friendly mapping for surfacing real API failures (key denial, quota,
    // bad request) instead of the generic "no results" message — those have
    // very different remediation steps.
    const friendlyStatus = (s: google.maps.places.PlacesServiceStatus): string | null => {
      switch (s) {
        case PSS.REQUEST_DENIED:    return 'Search unavailable — Google Places API key is invalid or Places API isn\'t enabled.';
        case PSS.OVER_QUERY_LIMIT:  return 'Search quota exceeded. Try again in a minute.';
        case PSS.INVALID_REQUEST:   return 'Invalid search request.';
        case PSS.UNKNOWN_ERROR:     return 'Search failed (unknown error). Try again.';
        default:                    return null;
      }
    };

    const processResults = (results: google.maps.places.PlaceResult[]) => {
      const usable = results.filter(r => r.place_id && r.geometry?.location);
      if (usable.length === 1) {
        const r = usable[0];
        fetchDetail(r.place_id!, r.geometry?.location ?? undefined);
        return;
      }
      const allSummaries: PlaceSummary[] = usable.map(r => ({
        placeId: r.place_id!,
        name: r.name ?? '',
        address: r.formatted_address ?? r.vicinity,
        rating: r.rating,
        userRatingsTotal: r.user_ratings_total,
        priceLevel: r.price_level,
        types: r.types ?? [],
        photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 400, maxHeight: 300 }),
        coords: [r.geometry!.location!.lng(), r.geometry!.location!.lat()],
      }));

      // Distance helper (meters between two lat/lng points).
      const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const R = 6371000;
        const toRad = (x: number) => x * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
      };

      // Pick a ranking anchor:
      //  - The trip destination (if it sits inside the result cluster — i.e.
      //    at least one result is within 25km of it).
      //  - Otherwise the geographic MEDIAN of result coordinates. Median
      //    beats centroid here because it shrugs off outliers (legacy Places
      //    APIs often return one result in a different city sharing a name).
      const dest = destinationCenter.current;
      const destLatLng = dest ? { lat: dest.lat(), lng: dest.lng() } : null;
      const destInsideCluster =
        !!destLatLng &&
        allSummaries.some(s => haversineM(destLatLng, { lat: s.coords[1], lng: s.coords[0] }) <= 25_000);
      const anchorPt: { lat: number; lng: number } = (() => {
        if (destLatLng && destInsideCluster) return destLatLng;
        const lats = allSummaries.map(s => s.coords[1]).sort((a, b) => a - b);
        const lngs = allSummaries.map(s => s.coords[0]).sort((a, b) => a - b);
        return {
          lat: lats[Math.floor(lats.length / 2)],
          lng: lngs[Math.floor(lngs.length / 2)],
        };
      })();

      // Rank results by:
      //   quality   = rating × log10(reviewCount + 10)
      //               (rewards high ratings AND high review volume; the
      //                +10 stops 0-review places from going to -∞)
      //   distance  = 1 / (1 + km / 5)   (closer ⇒ closer to 1)
      // score = quality × distance.
      // Pure 5★/no-reviews places get less weight than 4.4★/3000-reviews.
      const scoreOf = (s: PlaceSummary): number => {
        const rating = s.rating ?? 0;
        const reviews = s.userRatingsTotal ?? 0;
        const quality = rating * Math.log10(reviews + 10);
        const distKm = haversineM(anchorPt, { lat: s.coords[1], lng: s.coords[0] }) / 1000;
        const distFactor = 1 / (1 + distKm / 5);
        return quality * distFactor;
      };
      allSummaries.sort((a, b) => scoreOf(b) - scoreOf(a));
      const summaries = allSummaries.slice(0, 20);

      setLoading(false);
      setSearchResults(summaries);
      setLastQuery(q);

      // Legacy `nearbySearch` returns "Lite" PlaceResults that often omit
      // `photos` even when Google does have photos for the place. Backfill
      // for the top few missing rows via a cheap getDetails(photos-only)
      // call so the result list isn't visually empty. Capped to limit cost.
      const PHOTO_BACKFILL_LIMIT = 5;
      const missingPhoto = summaries.filter(s => !s.photoUrl).slice(0, PHOTO_BACKFILL_LIMIT);
      missingPhoto.forEach(s => {
        placesRef.current!.getDetails(
          { placeId: s.placeId, fields: ['photos'] },
          (place, dStatus) => {
            if (dStatus !== PSS.OK || !place?.photos?.length) return;
            const url = place.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 });
            setSearchResults(prev =>
              prev.map(p => (p.placeId === s.placeId ? { ...p, photoUrl: url } : p))
            );
          }
        );
      });

      const m = mapRef.current;
      if (m) {
        summaries.forEach((s, i) => {
          const pos = { lat: s.coords[1], lng: s.coords[0] };
          const num = i + 1;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
            <path d="M17 2c-7.18 0-13 5.82-13 13 0 9.75 13 27 13 27s13-17.25 13-27c0-7.18-5.82-13-13-13z" fill="#38bdf8" stroke="#0a0f1e" stroke-width="2"/>
            <circle cx="17" cy="15" r="9" fill="#0a0f1e"/>
            <text x="17" y="19" text-anchor="middle" font-family="ui-sans-serif,system-ui,Arial" font-size="11" font-weight="800" fill="#38bdf8">${num}</text>
          </svg>`;
          const marker = new google.maps.Marker({
            position: pos,
            map: m,
            title: `${num}. ${s.name}`,
            icon: {
              url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
              scaledSize: new google.maps.Size(34, 44),
              anchor: new google.maps.Point(17, 44),
            },
            zIndex: 500 - i,
          });
          marker.addListener('click', () => fetchDetail(s.placeId, new google.maps.LatLng(pos.lat, pos.lng)));
          resultMarkersRef.current.push(marker);
        });

        // Camera framing: pick the 8 pins CLOSEST to the anchor. We sort
        // by raw distance (not by rank) because rank includes a distance
        // *penalty* but the rating component can still let a far pin
        // outscore a near one — using rank for framing risked widening
        // the bbox. Closest-to-anchor is guaranteed to be a tight cluster.
        const toFrame = [...summaries]
          .map(s => ({ s, d: haversineM(anchorPt, { lat: s.coords[1], lng: s.coords[0] }) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, Math.min(8, summaries.length))
          .map(x => x.s);
        const fit = new google.maps.LatLngBounds();
        toFrame.forEach(s => fit.extend({ lat: s.coords[1], lng: s.coords[0] }));
        if (!fit.isEmpty()) {
          // Pad a bit on the right to leave room for the parent's "Drop
          // pins" aside (~360 px) which sits over the map area in the
          // outer page grid. Padding only shifts framing — pins remain
          // inside the visible area regardless of side panels.
          m.fitBounds(fit, { top: 50, right: 60, bottom: 50, left: 50 });
          // Clamp max zoom — a 200 m cluster would otherwise zoom in to
          // building level and lose context. NO panTo here — fitBounds
          // already centers on the cluster bbox, which keeps pins on
          // screen. (Earlier panTo(anchorPt) experiment regressed when
          // anchorPt was the trip destination far from the pin cluster.)
          google.maps.event.addListenerOnce(m, 'idle', () => {
            const z = m.getZoom();
            if (z !== undefined && z > 15) m.setZoom(15);
          });
        }
      }
    };

    placesRef.current.textSearch(req, (results, status) => {
      if (status === PSS.OK && results && results.length > 0) {
        processResults(results);
        return;
      }

      if (status !== PSS.ZERO_RESULTS) {
        // Real API failure (denial / quota / etc.) — log it; we still try
        // nearbySearch in case it works (different endpoint, sometimes
        // succeeds when textSearch is throttled).
        console.warn('[PlanningMap] textSearch status:', status);
      }

      // Fallback: nearbySearch with `keyword`. Legacy textSearch is weak at
      // generic category queries like "hotels" or "restaurants"; nearbySearch
      // is built for that. Requires a center, not bounds, so we use the
      // viewport / destination / first-fix center we computed above.
      if (center && placesRef.current) {
        placesRef.current.nearbySearch(
          { location: center, radius: 50000, keyword: q },
          (nResults, nStatus) => {
            if (nStatus === PSS.OK && nResults && nResults.length > 0) {
              processResults(nResults);
              return;
            }
            setLoading(false);
            const txtFriendly = friendlyStatus(status);
            const nearFriendly = friendlyStatus(nStatus);
            if (txtFriendly) {
              // Prefer the textSearch error since it's the user's primary
              // intent; nearbySearch was just a rescue attempt.
              setSearchError(txtFriendly);
            } else if (nearFriendly) {
              console.warn('[PlanningMap] nearbySearch status:', nStatus);
              setSearchError(nearFriendly);
            } else {
              setNoResult(true);
            }
          }
        );
        return;
      }

      setLoading(false);
      const friendly = friendlyStatus(status);
      if (friendly) {
        setSearchError(friendly);
      } else {
        setNoResult(true);
      }
    });
  }, [query, fetchDetail, clearResultMarkers]);

  // ── Init map ───────────────────────────────────────────────────────────────
  // Effect deps: [location, extraStops]. Runs on first mount AND whenever
  // location resolves from null to a real value (trip fetch returns).
  // PREVIOUS BUG: when mapRef.current was set, the effect early-returned
  // before the auto-zoom block. So the camera was created at the global
  // (lat 20, lng 0) fallback on first run (location was null), then
  // when location updated the effect re-ran but bailed at the
  // mapRef.current check — auto-zoom never executed and the camera was
  // permanently stuck on Africa.
  // Now: split map creation from camera framing. Creation only runs once
  // (gated by mapRef.current). Framing runs on every invocation so
  // location → coords always lands.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadGoogleMaps();
      if (cancelled || !divRef.current) return;

      // ── 1. Create map (once) ──────────────────────────────────────
      let map = mapRef.current;
      if (!map) {
        map = new google.maps.Map(divRef.current, {
          zoom: 3,
          center: { lat: 20, lng: 0 },
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: true,
        });
        mapRef.current          = map;
        placesRef.current       = new google.maps.places.PlacesService(map);
        geocoderRef.current     = new google.maps.Geocoder();
        autocompleteRef.current = new google.maps.places.AutocompleteService();

        // POI click → show in panel. Only attach on creation; the
        // re-attach effect below handles fetchDetail ref changes.
        map.addListener('click', (e: google.maps.MapMouseEvent & { placeId?: string }) => {
          if (e.placeId) {
            (e as { stop?: () => void }).stop?.();
            fetchDetail(e.placeId);
          }
        });
      }

      // ── 2. Imperative control ref (always idempotent) ─────────────
      if (mapControlRef) {
        const m = map;
        mapControlRef.current = {
          panTo: (coords: [number, number]) => {
            m.panTo({ lat: coords[1], lng: coords[0] });
            m.setZoom(15);
          },
          openPlace: (placeId: string, coords: [number, number]) => {
            m.panTo({ lat: coords[1], lng: coords[0] });
            m.setZoom(15);
            fetchDetail(placeId);
          },
        };
      }

      // ── 3. Frame the camera on the trip's destination(s) ──────────
      // Resolve each city via the known-monument fast path first
      // (instant, no API call); fall back to Geocoder per-city only
      // when the fast path misses. Runs on every effect invocation so
      // a location null → "Taj Mahal" transition lands the camera on
      // the destination instead of leaving it on the global fallback.
      if (location && !cancelled) {
        const cities  = [location, ...(extraStops ?? [])].filter(Boolean);
        const isMulti = cities.length > 1;
        const latlngs = (await Promise.all(
          cities.map(city => {
            const known = lookupKnownCoords(city);
            if (known) {
              return Promise.resolve(new google.maps.LatLng(known.lat, known.lng));
            }
            return new Promise<google.maps.LatLng | null>(res =>
              geocoderRef.current!.geocode({ address: city }, (r, s) => {
                if (s !== 'OK' || !r?.[0]) { res(null); return; }
                res(r[0].geometry.location);
              })
            );
          })
        )).filter((c): c is google.maps.LatLng => c !== null);

        if (!cancelled && latlngs.length > 0) {
          destinationCenter.current = latlngs[0];
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

  // ── Sync bookmark markers + thread them with a polyline ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Drop stale markers
    const ids = new Set(bookmarks.map(b => b.id));
    bmMarkersRef.current.forEach((m, id) => {
      if (!ids.has(id)) { m.setMap(null); bmMarkersRef.current.delete(id); }
    });

    // Re-render every marker so position/index changes reflect immediately
    // (numbers depend on order in the bookmarks array).
    bookmarks.forEach((bm, i) => {
      const existing = bmMarkersRef.current.get(bm.id);
      if (existing) existing.setMap(null);

      const num = i + 1;
      const color = MARKER_COLORS[bm.category] ?? MARKER_COLORS.other;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
          </filter>
        </defs>
        <path d="M17 2c-7.18 0-13 5.82-13 13 0 9.75 13 27 13 27s13-17.25 13-27c0-7.18-5.82-13-13-13z" fill="${color}" stroke="#0a0f1e" stroke-width="2" filter="url(#shadow)"/>
        <circle cx="17" cy="15" r="9" fill="#0a0f1e"/>
        <text x="17" y="19" text-anchor="middle" font-family="ui-sans-serif,system-ui,Arial" font-size="11" font-weight="800" fill="${color}">${num}</text>
      </svg>`;
      const marker = new google.maps.Marker({
        position: { lat: bm.coords[1], lng: bm.coords[0] },
        map,
        title: `${num}. ${bm.name}`,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new google.maps.Size(34, 44),
          anchor: new google.maps.Point(17, 44),
        },
        zIndex: 1000 - i, // lower-numbered pins draw on top
      });
      marker.addListener('click', () => {
        if (bm.placeId) fetchDetail(bm.placeId);
        else map.panTo({ lat: bm.coords[1], lng: bm.coords[0] });
      });
      bmMarkersRef.current.set(bm.id, marker);
    });

    // Polyline threading the pins in order
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
    if (bookmarks.length >= 2) {
      polylineRef.current = new google.maps.Polyline({
        path: bookmarks.map(b => ({ lat: b.coords[1], lng: b.coords[0] })),
        geodesic: true,
        strokeColor: '#60a5fa',
        strokeOpacity: 0.85,
        strokeWeight: 3,
        map,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, mapRef.current, fetchDetail]);

  const handleBookmark = useCallback(() => {
    if (!detail) return;
    let category: BookmarkCategory = 'other';
    if (isRestaurantType(detail.types)) category = 'food';
    else if (detail.types.some(t => ['lodging','hotel','motel','resort','hostel'].includes(t))) category = 'hotels';
    else if (isActivityType(detail.types)) category = 'activities';
    else if (detail.types.some(t => ['shopping_mall','store','clothing_store','department_store','supermarket','convenience_store','book_store','jewelry_store','shoe_store','electronics_store','furniture_store','home_goods_store','hardware_store','pet_store','florist','pharmacy'].includes(t))) category = 'shopping';
    onAddBookmark({ id: `bm_${Date.now()}`, name: detail.name, coords: detail.coords, category, placeId: detail.placeId });
    // Clear the temporary search highlight (the new numbered pin takes its
    // place) but leave the detail panel open so the user can keep reading.
    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;
    setQuery('');
  }, [detail, onAddBookmark]);

  const isBookmarked = !!detail && bookmarks.some(b => b.name === detail.name);
  const showPanel    = loading || !!detail || searchResults.length > 0;

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
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
      <style>{`
        @keyframes gkShimmer { 0%,100%{opacity:.35} 50%{opacity:.8} }
      `}</style>

      {/* ── Search bar (absolute-positioned overlay over the map) ───────── */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 'min(560px, calc(100% - 24px))', zIndex: 50, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto', background: 'rgba(10,15,30,0.92)', WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)', padding: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 24px rgba(0,0,0,0.35)' }}>
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
                // Bias to current map viewport so panning the map shifts
                // results; fall back to the destination center / country if
                // bounds aren't ready yet.
                const map = mapRef.current;
                const viewport = map?.getBounds();
                const center = map?.getCenter() ?? destinationCenter.current ?? null;
                autocompleteRef.current.getPlacePredictions(
                  {
                    input: val,
                    types: [],
                    ...(viewport
                      ? { bounds: viewport }
                      : center
                      ? { location: center, radius: 50000, strictBounds: false }
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
            placeholder="Search a destination, or click any place on the map..."
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
      {searchError && <p style={{ margin: 0, fontSize: 12, color: '#fbbf24', paddingLeft: 2 }}>{searchError}</p>}

      {/* ── Map + side panel ────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', display: 'flex', gap: 0, alignItems: 'stretch', height: '100%', minHeight: 'min(80vh, 720px)' }}>

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

                  {/* Prev / Next arrows on the hero — the only nav that
                     reaches photos 6–10 when the thumbnail strip is wider
                     than the panel and can't be scrolled with a desktop
                     mouse. Cycle through detail.photos. */}
                  {detail.photos.length > 1 && (
                    <>
                      <button
                        onClick={() => setActivePhoto(p => (p - 1 + detail.photos.length) % detail.photos.length)}
                        aria-label="Previous photo"
                        title="Previous photo"
                        style={{
                          position: 'absolute', top: '50%', left: 8,
                          transform: 'translateY(-50%)',
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.55)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          color: '#fff', fontSize: 16, fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backdropFilter: 'blur(6px)',
                          WebkitBackdropFilter: 'blur(6px)',
                        }}
                      >
                        {String.fromCodePoint(0x2039)}
                      </button>
                      <button
                        onClick={() => setActivePhoto(p => (p + 1) % detail.photos.length)}
                        aria-label="Next photo"
                        title="Next photo"
                        style={{
                          position: 'absolute', top: '50%', right: 8,
                          transform: 'translateY(-50%)',
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.55)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          color: '#fff', fontSize: 16, fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backdropFilter: 'blur(6px)',
                          WebkitBackdropFilter: 'blur(6px)',
                        }}
                      >
                        {String.fromCodePoint(0x203A)}
                      </button>
                    </>
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
                      WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
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
                      WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
                    }}>
                      {activePhoto + 1} / {detail.photos.length}
                    </div>
                  )}
                </div>

                {/* ── Thumbnail strip ────────────────────────────────────── */}
                {detail.photos.length > 1 && (
                  <div
                    ref={thumbStripRef}
                    style={{
                      display: 'flex', gap: 3, padding: '5px 6px',
                      overflowX: 'auto',
                      // Was scrollbarWidth:'none' — but on a desktop mouse
                      // there's no native horizontal-scroll gesture, so
                      // hiding the scrollbar trapped users on thumbs 1–5.
                      // Thin visible scrollbar + the new prev/next arrows
                      // give two reliable nav paths.
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(255,255,255,0.22) transparent',
                      background: 'rgba(0,0,0,0.5)', flexShrink: 0,
                    }}
                  >
                    {detail.photos.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        data-thumb-index={i}
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
                  <h3 style={{
                    margin: '0 0 6px',
                    color: 'var(--brand-ink, #f1f5f9)',
                    fontFamily: 'var(--font-display), Georgia, serif',
                    fontSize: 22,
                    fontWeight: 400,
                    letterSpacing: '-0.015em',
                    lineHeight: 1.15,
                  }}>
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
                      width: '100%',
                      padding: '11px 0',
                      borderRadius: 10,
                      fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      background: isBookmarked
                        ? 'rgba(56,189,248,0.08)'
                        : 'rgba(56,189,248,0.14)',
                      border: `1px solid ${isBookmarked ? 'rgba(56,189,248,0.3)' : 'rgba(56,189,248,0.4)'}`,
                      color: 'var(--brand-accent, #38bdf8)',
                      cursor: isBookmarked ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'background 180ms ease',
                      marginBottom: 14,
                    }}
                  >
                    {isBookmarked
                      ? <>{String.fromCodePoint(0x2713)} Pinned</>
                      : <>{String.fromCodePoint(0x1F4CD)} Pin destination</>}
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
                          padding: '9px 12px',
                          fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: `2px solid ${activeTab === t.key ? 'var(--brand-accent, #38bdf8)' : 'transparent'}`,
                          color: activeTab === t.key ? 'var(--brand-accent, #38bdf8)' : 'rgba(255,255,255,0.45)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          marginBottom: -1,
                          transition: 'color 180ms ease',
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
                        <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Hours</p>
                        {detail.openingHours.map((h, i) => (
                          <p key={i} style={{ margin: '0 0 3px', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{h}</p>
                        ))}
                      </div>
                    )}
                    {detail.phone && (
                      <div>
                        <p style={{ margin: '0 0 3px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Phone</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#7dd3fc' }}>{detail.phone}</p>
                      </div>
                    )}
                    {detail.website && (
                      <div>
                        <p style={{ margin: '0 0 3px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Website</p>
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
                        <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
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
                          <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
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
            ) : searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <span style={{
                      color: 'var(--brand-accent-2, rgba(167,139,250,0.85))',
                      fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                    }}>
                      § {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                    </span>
                    <span style={{
                      color: 'var(--brand-ink, #f1f5f9)',
                      fontFamily: 'var(--font-display), Georgia, serif',
                      fontSize: 16,
                      fontWeight: 400,
                      letterSpacing: '-0.01em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {lastQuery}
                    </span>
                  </div>
                  <button
                    onClick={closePanel}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.06)', border: 'none',
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                    title="Close"
                  >
                    {String.fromCodePoint(0x00D7)}
                  </button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {searchResults.map((r, i) => (
                    <button
                      key={r.placeId}
                      onClick={() => fetchDetail(r.placeId, new google.maps.LatLng(r.coords[1], r.coords[0]))}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        width: '100%', padding: '10px 14px',
                        background: 'transparent', border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.07)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{
                        flexShrink: 0,
                        width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--brand-accent, #38bdf8)', color: '#0a0f1e',
                        fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                        fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginTop: 18,
                      }}>{i + 1}</span>
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt=""
                          style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                        />
                      ) : (
                        // Placeholder so rows without a Google photo still
                        // have visual weight and the layout doesn't shift.
                        <div style={{
                          width: 60, height: 60, borderRadius: 6, flexShrink: 0,
                          background: 'rgba(56,189,248,0.06)',
                          border: '1px solid rgba(56,189,248,0.14)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'rgba(56,189,248,0.55)',
                        }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 21h18" />
                            <path d="M5 21V7l7-4 7 4v14" />
                            <path d="M9 9h.01M9 13h.01M9 17h.01M14 9h.01M14 13h.01M14 17h.01" />
                          </svg>
                        </div>
                      )}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                        <span style={{
                          color: 'var(--brand-ink, #f1f5f9)',
                          fontFamily: 'var(--font-display), Georgia, serif',
                          fontSize: 14,
                          fontWeight: 400,
                          letterSpacing: '-0.005em',
                          lineHeight: 1.2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {r.name}
                        </span>
                        {r.rating !== undefined && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700 }}>{r.rating.toFixed(1)}</span>
                            <Stars rating={r.rating} size={10} />
                            {r.userRatingsTotal !== undefined && (
                              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
                                ({r.userRatingsTotal.toLocaleString()})
                              </span>
                            )}
                            {priceDollars(r.priceLevel) && (
                              <span style={{ color: '#a3e635', fontSize: 10, fontWeight: 700, marginLeft: 4 }}>
                                {priceDollars(r.priceLevel)}
                              </span>
                            )}
                          </span>
                        )}
                        {r.address && (
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {r.address}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
        </div>
      </div>

    </div>
  );
}
