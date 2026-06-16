'use client';

// Single Google Maps view that aggregates pins from every day section
// of an itinerary. Day-filter chips at the top let the user toggle
// which day's pins are visible. Numbered pins; click opens the place
// in the native Google Maps app/site for directions + reviews.
//
// Replaces the previous per-day Mapbox DayMap pattern (one map per
// section). One sticky map gives users cross-day geographic context
// at a glance and is much lighter on the page.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { DARK_STYLE } from '@/lib/googleMaps/darkStyle';
import { fetchDirections } from '@/lib/googleMaps/directionsClient';
import { modeUsesDirections, type RouteMode } from '@/lib/googleMaps/route';
import { extractDayNumber, isTimeLine, type Section } from './lib/itinerary-parse';
import { extractActivityCandidates, extractActivityPlace, extractTransitMode } from './lib/places';
import { fetchWeather, type WeatherResult } from '@/lib/googleMaps/weatherClient';

const QUEST_RE = /\[\s*MONUMENT\s*QUEST\s*\]/i;

// Map a rec's editorial category to the planner's saved bookmark
// taxonomy. SummaryView keeps a strict 5-bucket union for filters; recs
// have 5 different buckets — collapse the rec set into the nearest match.
function recCategoryToBookmarkCategory(c: MapRec['category']): string {
  switch (c) {
    case 'restaurant':   return 'food';
    case 'sight':        return 'activities';
    case 'experience':   return 'activities';
    case 'off-beat':     return 'activities';
    case 'neighborhood': return 'other';
  }
}

// Per-category tint for rec cards in the on-map panel. Mirrors the
// RecPanel sidebar palette so users get the same colour-coding whether
// they see recs in the sidebar (legacy) or on the master map.
const REC_TINT: Record<MapRec['category'], { fg: string; bg: string }> = {
  restaurant:   { fg: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  sight:        { fg: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
  experience:   { fg: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  'off-beat':   { fg: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  neighborhood: { fg: '#7dd3fc', bg: 'rgba(125,211,252,0.10)' },
};

type LegMode = 'walking' | 'cycling' | 'driving';

interface PlacePin {
  dayIdx: number;          // 0 = first day section, 1 = second, ...
  dayNumber: number;       // human-facing 1-based
  dayLabel: string;        // "Day 1", "Day 2"
  positionInDay: number;   // 1-based — drives the marker badge label
  name: string;            // primary display name
  candidates: string[];    // fallback names for geocoding
  isQuest: boolean;        // [MONUMENT QUEST] marker → gold pin
  legModeToNext: LegMode | null; // transit mode used to reach the next stop
  resolved?: { lat: number; lng: number };
}

const QUEST_COLOR = '#fbbf24'; // gold — matches monument-quest pill in ActivityBlock

interface Bookmark {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  category?: string;
  placeId?: string;
  // When the pin was dropped while a specific day chip was active, the
  // day number the user wants this stop assigned to. Null = "any day"
  // (AI picks the most convenient day during update). Undefined = a
  // legacy bookmark from before this field existed; treated as null.
  dayAssignment?: number | null;
}

interface Props {
  sections: Section[];
  location: string;        // trip city (anchors map view + biases geocoding)
  height?: number;
  sticky?: boolean;
  topOffset?: number;      // px from top when sticky
  fillHeight?: boolean;    // when true, map fills its parent's height (split layout)
  // Optional planning-mode integration. When provided, the map shows
  // bookmark markers, lets the user click any Google POI to open its
  // detail panel, and the panel surfaces a "Pin destination" CTA that
  // calls onAddBookmark. Without these props the map is read-only
  // (itinerary-only mode).
  bookmarks?: Bookmark[];
  onAddBookmark?: (b: Bookmark) => void;
  onRemoveBookmark?: (id: string) => void;
  // Pin-change tracker for the footer regenerate button. The parent
  // computes the diff between current bookmarks and the snapshot taken
  // when the itinerary was last generated; when non-zero, the footer
  // button lights up "X new pins · Regenerate itinerary".
  pinChangeCount?: number;
  onRegenerate?: () => void;
  // When a tripId is provided AND planning is enabled (bookmarks +
  // onAddBookmark), the map exposes a "✦ Find recs" affordance that
  // fetches Claude-curated picks from /api/recommendations and lets
  // the user pin them directly. Replaces the separate Recs sidebar.
  tripId?: string;
}

interface MapRec {
  id: string;
  name: string;
  category: 'restaurant' | 'sight' | 'experience' | 'off-beat' | 'neighborhood';
  blurb: string;
  whyItFits: string;
}

declare global {
  // Minimal Google Maps type surface — the SDK is loaded at runtime.
  interface Window {
    google?: {
      maps?: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
        Marker: new (opts: Record<string, unknown>) => GoogleMarker;
        Polyline: new (opts: Record<string, unknown>) => GooglePolyline;
        InfoWindow: new (opts?: Record<string, unknown>) => GoogleInfoWindow;
        LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void; isEmpty: () => boolean };
        Size: new (w: number, h: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        SymbolPath: { CIRCLE: number };
        event: { clearInstanceListeners: (i: unknown) => void };
        places?: {
          PlacesService: new (m: GoogleMap | HTMLElement) => PlacesService;
          PlacesServiceStatus: { OK: string };
        };
      };
    };
  }
}

interface GoogleInfoWindow {
  open: (opts: Record<string, unknown>) => void;
  close: () => void;
  setContent: (s: string | HTMLElement) => void;
  setPosition: (p: { lat: number; lng: number }) => void;
}

interface PlacePhoto {
  getUrl: (opts: { maxWidth?: number; maxHeight?: number }) => string;
}

interface PlaceDetails {
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  formatted_address?: string;
  photos?: PlacePhoto[];
  opening_hours?: { isOpen?: () => boolean; weekday_text?: string[] };
  url?: string;
  website?: string;
  formatted_phone_number?: string;
  editorial_summary?: { overview?: string };
  reviews?: Array<{ author_name?: string; rating?: number; text?: string }>;
}

interface PlacePanelData {
  pin: PlacePin;
  loading: boolean;
  // When the panel was opened from a POI click (rather than an
  // itinerary pin), this carries the placeId + coords needed to wire
  // the "Pin destination" CTA. Itinerary-pin opens leave it undefined.
  poi?: { placeId: string; coords?: { lat: number; lng: number } };
  details?: {
    name: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    priceLevel?: number;
    photos: string[];
    openingHours?: string[];
    phone?: string;
    website?: string;
    summary?: string;
    reviews: Array<{ author: string; rating: number; text: string }>;
    canonicalUrl?: string;
  };
}

interface PlacesService {
  findPlaceFromQuery: (
    req: { query: string; fields: string[]; locationBias?: unknown },
    cb: (results: Array<{ place_id?: string }> | null, status: string) => void,
  ) => void;
  getDetails: (
    req: { placeId: string; fields: string[] },
    cb: (place: PlaceDetails | null, status: string) => void,
  ) => void;
  textSearch: (
    req: { query: string; bounds?: unknown; location?: unknown; radius?: number },
    cb: (results: Array<{
      place_id?: string;
      geometry?: { location?: { lat: () => number; lng: () => number } };
      name?: string;
      formatted_address?: string;
      rating?: number;
      photos?: Array<{ getUrl: (opts: { maxWidth: number; maxHeight: number }) => string }>;
    }> | null, status: string) => void,
  ) => void;
}

interface GooglePolyline {
  setMap: (m: GoogleMap | null) => void;
}

interface GoogleMap {
  setCenter: (p: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: unknown, padding?: number) => void;
  panTo: (p: { lat: number; lng: number }) => void;
  getBounds: () => unknown | undefined;
  getCenter: () => { lat: () => number; lng: () => number } | undefined;
}

interface GoogleMarker {
  setMap: (m: GoogleMap | null) => void;
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
}

const DAY_COLORS = [
  '#a78bfa', '#7dd3fc', '#fbbf24', '#34d399', '#f472b6',
  '#fb923c', '#60a5fa', '#facc15', '#4ade80', '#c084fc',
];

export default function UnifiedTripMap({
  sections,
  location,
  height = 360,
  sticky = true,
  topOffset = 16,
  fillHeight = false,
  bookmarks,
  onAddBookmark,
  onRemoveBookmark,
  pinChangeCount = 0,
  onRegenerate,
  tripId,
}: Props) {
  const recsEnabled = !!(tripId && bookmarks && onAddBookmark);
  const [recs, setRecs] = useState<MapRec[]>([]);
  const [recsOpen, setRecsOpen] = useState(false);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  // Per-card pinning state so each card can show its own pending spinner.
  const [pinningRecId, setPinningRecId] = useState<string | null>(null);
  // Track which rec ids have been pinned this session so they fade out of
  // the panel after success.
  const [pinnedRecIds, setPinnedRecIds] = useState<Set<string>>(new Set());

  // Fetch 7-day forecast once on mount — geocode the anchor city first
  // then call /api/weather. Render nothing if either step fails.
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    (async () => {
      try {
        const gr = await fetch(`/api/geocode?address=${encodeURIComponent(location)}`);
        if (!gr.ok || cancelled) return;
        const gd = await gr.json() as { lat?: number; lng?: number } | null;
        if (!gd?.lat || !gd?.lng || cancelled) return;
        const w = await fetchWeather(gd.lat, gd.lng, 7);
        if (!cancelled) setWeatherData(w);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [location]);

  async function fetchRecs(opts?: { force?: boolean }) {
    if (!tripId) return;
    const cacheKey = `geknee:recs:${tripId}`;
    if (!opts?.force && typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { recs: MapRec[] };
          if (Array.isArray(parsed.recs) && parsed.recs.length > 0) {
            setRecs(parsed.recs);
            return;
          }
        }
      } catch { /* fall through */ }
    }
    setRecsLoading(true);
    setRecsError(null);
    try {
      const r = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tripId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const j = await r.json() as { recommendations: MapRec[] };
      setRecs(j.recommendations);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ recs: j.recommendations }));
      } catch { /* storage full — silent */ }
    } catch (e) {
      setRecsError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setRecsLoading(false);
    }
  }

  function toggleRecs() {
    if (!recsEnabled) return;
    if (!recsOpen && recs.length === 0) {
      void fetchRecs();
    }
    setRecsOpen(o => !o);
  }

  // Resolve a rec to coordinates via Google Places textSearch, biased to
  // the trip destination, then add it as a bookmark. Lets the user pin
  // a Claude pick straight from the map panel — no detour through the
  // sidebar.
  async function pinRec(rec: MapRec) {
    if (!onAddBookmark || !location) return;
    setPinningRecId(rec.id);
    try {
      const svc = placesServiceRef.current;
      if (!svc) throw new Error('Places service not ready');
      const query = `${rec.name}, ${location}`;
      const result = await new Promise<{ lat: number; lng: number; name: string } | null>((resolve) => {
        svc.textSearch({ query }, (results, status) => {
          if (status !== 'OK' || !results?.length) { resolve(null); return; }
          const first = results[0];
          if (!first.geometry?.location) { resolve(null); return; }
          resolve({
            lat: first.geometry.location.lat(),
            lng: first.geometry.location.lng(),
            name: first.name ?? rec.name,
          });
        });
      });
      if (!result) { setPinningRecId(null); return; }
      onAddBookmark({
        id: `rec:${rec.id}`,
        name: result.name,
        coords: [result.lng, result.lat],
        category: recCategoryToBookmarkCategory(rec.category),
      });
      setPinnedRecIds(prev => new Set(prev).add(rec.id));
      // Pan the map to the new pin so the user sees where it landed.
      if (mapRef.current?.panTo) {
        mapRef.current.panTo({ lat: result.lat, lng: result.lng });
      }
    } catch {
      // Failure is non-fatal — user can retry.
    } finally {
      setPinningRecId(null);
    }
  }
  const planningEnabled = !!bookmarks && !!onAddBookmark;
  const bookmarkMarkersRef = useRef<GoogleMarker[]>([]);
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const polylinesRef = useRef<GooglePolyline[]>([]);
  const infoWindowRef = useRef<GoogleInfoWindow | null>(null);
  const placesServiceRef = useRef<PlacesService | null>(null);
  // name (lower-cased, normalized) → handler that pans + opens the
  // place card. Populated as markers are created. Lets the in-itinerary
  // step-number click resolve to a specific pin via window event.
  const pinHandlersRef = useRef<Map<string, () => void>>(new Map());
  const [weatherData, setWeatherData] = useState<WeatherResult | null>(null);
  const [ready, setReady] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'quest' | number>('all');
  const [panel, setPanel] = useState<PlacePanelData | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab] = useState<'info' | 'reviews'>('info');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  // Paperclip-icon upload — replaces the old "Analyze photo or videos
  // to add pin" bar that lived below the map. Picking a file POSTs to
  // /api/itinerary/media (same endpoint PhotoToItinerary used) and lets
  // the vision model slot the place into the itinerary. Day=0 → server
  // picks the best slot ("Any day" behaviour).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  // Results dropdown — when the query returns multiple matches we
  // surface a list instead of opening the first match. Cleared on
  // selection, escape, or empty query.
  const [searchResults, setSearchResults] = useState<Array<{
    placeId: string;
    name: string;
    address?: string;
    lat: number;
    lng: number;
    rating?: number;
    photoUrl?: string;
  }>>([]);

  // Pull day sections only. /^Day\s*\d+\b/ accepts "Day 4: Title",
  // "Day 4 - Title", and "Day 4 Title" while rejecting "Day 41". The
  // tighter "must have separator" version was dropping legit sections
  // where the AI omitted the colon/dash. Phantom days (sections that
  // open with "Day N" but have no content) are filtered out at the
  // chip step because dayChips derives from pins, not sections.
  const daySections = useMemo(() => {
    // Use the canonical extractDayNumber so headings with leading
    // markdown markers ("**Day 4** — Farewell"), word-form numbers
    // ("Day Four"), or hyphen separators ("Day-4") all match.
    return sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => extractDayNumber(s.heading ?? '') !== null);
  }, [sections]);

  // Build the candidate place list per day, in chronological order.
  // Walk lines in order so we can capture each activity's transit-mode-
  // to-next (the emoji line that follows the headline). That lets the
  // route polylines pick the right Google Directions mode per leg.
  const pins = useMemo<PlacePin[]>(() => {
    const out: PlacePin[] = [];
    daySections.forEach((entry, dayIdx) => {
      const dayNum = extractDayNumber(entry.s.heading ?? '') ?? (dayIdx + 1);
      let pos = 0;
      let pendingTransit: LegMode | null = null;
      for (const line of entry.s.lines as string[]) {
        if (isTimeLine(line)) {
          // Activity headline (must be a **HH:MM AM** time-stamped line
          // so positionInDay aligns with SectionCard's activityNumber —
          // otherwise non-time bolds like **Cost: $50** would inflate
          // pos here and the (day,pos) lookup from the number-circle
          // click would resolve to the wrong pin).
          if (pendingTransit && out.length > 0) {
            const prev = out[out.length - 1];
            if (prev.dayIdx === dayIdx && prev.legModeToNext === null) {
              prev.legModeToNext = pendingTransit;
            }
          }
          pendingTransit = null;
          // Increment pos BEFORE the early-return so position counting
          // matches even when this activity has no resolvable place
          // (the next activity's pos still aligns with what the user
          // sees in the itinerary card).
          pos += 1;
          const candidates = extractActivityCandidates(line, []);
          const primary = extractActivityPlace(line, []);
          if (!candidates.length || !primary) continue;
          out.push({
            dayIdx,
            dayNumber: dayNum,
            dayLabel: `Day ${dayNum}`,
            positionInDay: pos,
            name: primary,
            candidates,
            isQuest: QUEST_RE.test(line),
            legModeToNext: null,
          });
        } else {
          const m = extractTransitMode(line);
          if (m) pendingTransit = m;
        }
      }
    });
    return out;
  }, [daySections]);

  // Two parallel handler registries. byKey is the legacy name-based
  // lookup. byDayPos is the canonical (dayNumber, positionInDay) map —
  // ActivityBlock's number-circle click ships those values straight
  // through, so we resolve to the exact pin even when name strings
  // diverge between the parser inside ActivityBlock and the geocoder
  // inside this component.
  const pinHandlersByDayPosRef = useRef<Map<string, () => void>>(new Map());

  // Listen for the in-itinerary number-circle click. ActivityBlock
  // dispatches geknee:focus-map-pin with { name, city, dayNumber,
  // positionInDay }; we resolve via (day,pos) first, then fall back
  // to the name key. preventDefault() tells ActivityBlock we handled
  // it (else it falls back to opening Google Maps in a new tab).
  useEffect(() => {
    const onFocus = (e: Event) => {
      const ce = e as CustomEvent<{
        name: string;
        city: string | null;
        dayNumber?: number | null;
        positionInDay?: number | null;
      }>;
      const day = ce.detail?.dayNumber;
      const pos = ce.detail?.positionInDay;
      const name = ce.detail?.name ?? '';
      const cityHint = ce.detail?.city ?? location;

      // Tier 1: registered handler by (day,pos) — exact match for any
      // pin in the parsed itinerary.
      let handler: (() => void) | undefined;
      if (typeof day === 'number' && typeof pos === 'number') {
        handler = pinHandlersByDayPosRef.current.get(`${day}:${pos}`);
      }
      // Tier 2: handler by normalized place name.
      if (!handler) {
        const key = normalizePinKey(name);
        if (key) handler = pinHandlersRef.current.get(key);
      }
      if (handler) {
        ce.preventDefault();
        handler();
        return;
      }

      // Tier 3: live Places lookup. Reaches here when the pin's
      // geocode failed (so no marker, no handler) but the activity
      // text still has a place name. Places.findPlaceFromQuery is
      // more permissive than the Geocoder for landmark names — it
      // resolves "Kinari Bazaar" where "Kinari Bazaar, Agra" via
      // geocode might miss. Open the in-page panel directly with
      // the resolved place_id instead of falling through to a
      // Google-Maps tab.
      if (!name) return;
      const svc = placesServiceRef.current;
      if (!svc || !window.google?.maps?.places) return;
      ce.preventDefault();
      const query = cityHint ? `${name}, ${cityHint}` : name;
      svc.findPlaceFromQuery(
        { query, fields: ['place_id', 'geometry'] },
        (results, status) => {
          if (status !== 'OK') return;
          const r = results?.[0] as
            | { place_id?: string; geometry?: { location?: { lat: () => number; lng: () => number } } }
            | undefined;
          const placeId = r?.place_id;
          const loc = r?.geometry?.location;
          if (!placeId) return;
          openPlaceFromPlaceId(
            placeId,
            name,
            loc ? { lat: loc.lat(), lng: loc.lng() } : undefined,
          );
        },
      );
    };
    window.addEventListener('geknee:focus-map-pin', onFocus);
    return () => window.removeEventListener('geknee:focus-map-pin', onFocus);
    // openPlaceFromPlaceId is component-scope and doesn't change
    // identity across renders. location is captured by closure but
    // re-creating the listener every location change is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Init map once.
  useEffect(() => {
    if (!divRef.current) return;
    const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!KEY) { setKeyMissing(true); return; }
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !divRef.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(divRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'cooperative',
          styles: DARK_STYLE,
        });
        mapRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow({ maxWidth: 320 });
        if (window.google.maps.places?.PlacesService) {
          placesServiceRef.current = new window.google.maps.places.PlacesService(map);
        }
        setReady(true);
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load Google Maps'));
    return () => { cancelled = true; };
  }, []);

  // ── Bookmark markers + POI click handler (planning mode) ────────────────
  // When bookmarks are passed in, render them as sky-blue numbered
  // markers distinct from the day-colored itinerary pins. Also wire a
  // click handler on the map so any tap on a Google POI opens the
  // place panel with a "Pin destination" CTA.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    if (!planningEnabled) return;
    const gmaps = window.google.maps;

    // Clear and re-render bookmark markers from scratch.
    bookmarkMarkersRef.current.forEach((m) => m.setMap(null));
    bookmarkMarkersRef.current = [];

    // Filter bookmarks by the same chip the user has active.
    // - 'all'   → show all bookmarks
    // - 'quest' → bookmarks have no quest concept; hide them so the
    //             quest filter shows only quest activity pins
    // - number  → show only bookmarks assigned to that day, plus
    //             unassigned ones (dayAssignment == null) so the user
    //             can still see free-floating pins they haven't
    //             routed yet.
    const visibleBookmarks = (bookmarks ?? []).filter((b) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'quest') return false;
      return b.dayAssignment === activeFilter || b.dayAssignment == null;
    });

    visibleBookmarks.forEach((b) => {
      const marker = new gmaps.Marker({
        position: { lat: b.coords[1], lng: b.coords[0] },
        map: mapRef.current,
        // No numeric label — bookmark numbering used to collide with
        // activity numbers (a Day-2 activity #1 and a bookmark #1
        // looked identical on the map). Use a small star symbol so
        // bookmarks read as "user-pinned" at a glance.
        label: { text: '★', color: '#0a0a1f', fontSize: '11px', fontWeight: '700' },
        icon: {
          // Diamond (rotated square) so bookmarks visually disambiguate
          // from the round activity pins.
          path: 'M 0,-12 L 12,0 L 0,12 L -12,0 Z',
          scale: 1,
          fillColor: '#7dd3fc',
          fillOpacity: 0.95,
          strokeColor: '#0a0a1f',
          strokeWeight: 2,
        },
        title: `Pinned: ${b.name}`,
        zIndex: 50,
      });
      marker.addListener('click', () => {
        if (b.placeId) {
          openPlaceFromPlaceId(b.placeId, b.name, { lat: b.coords[1], lng: b.coords[0] });
        }
      });
      bookmarkMarkersRef.current.push(marker);
    });
    // POI click → fetch detail, open panel.
    const listener = (mapRef.current as unknown as {
      addListener: (e: string, h: (ev: { placeId?: string; latLng?: { lat: () => number; lng: () => number }; stop?: () => void }) => void) => unknown;
    }).addListener('click', (e) => {
      if (e.placeId && e.latLng) {
        e.stop?.();
        openPlaceFromPlaceId(e.placeId, undefined, { lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });
    return () => {
      gmaps.event.clearInstanceListeners(listener as object);
      bookmarkMarkersRef.current.forEach((m) => m.setMap(null));
      bookmarkMarkersRef.current = [];
    };
  }, [ready, planningEnabled, bookmarks, activeFilter]);

  // Open the place panel given a Place ID (POI click or bookmark click).
  // No day context — panel surfaces the "Pin destination" CTA instead.
  function openPlaceFromPlaceId(placeId: string, fallbackName?: string, coords?: { lat: number; lng: number }) {
    const svc = placesServiceRef.current;
    const synth: PlacePin = {
      dayIdx: -1,
      dayNumber: 0,
      dayLabel: '',
      positionInDay: 0,
      name: fallbackName ?? 'Loading…',
      candidates: [fallbackName ?? ''],
      isQuest: false,
      legModeToNext: null,
      resolved: coords,
    };
    setActivePhoto(0);
    setActiveTab('info');
    setPanel({ pin: synth, loading: true, poi: { placeId, coords } });
    if (coords && mapRef.current) mapRef.current.panTo(coords);
    if (!svc) return;
    svc.getDetails(
      {
        placeId,
        fields: [
          'name', 'rating', 'user_ratings_total', 'price_level',
          'formatted_address', 'photos', 'opening_hours',
          'website', 'formatted_phone_number', 'editorial_summary',
          'reviews', 'url', 'geometry',
        ],
      },
      (d, st) => {
        if (st !== 'OK' || !d) {
          setPanel({ pin: synth, loading: false, poi: { placeId, coords } });
          return;
        }
        setPanel({
          pin: { ...synth, name: d.name ?? synth.name },
          loading: false,
          poi: { placeId, coords },
          details: {
            name: d.name ?? synth.name,
            address: d.formatted_address,
            rating: d.rating,
            reviewCount: d.user_ratings_total,
            priceLevel: d.price_level,
            photos: (d.photos ?? []).slice(0, 8).map((ph) => ph.getUrl({ maxWidth: 800, maxHeight: 600 })),
            openingHours: d.opening_hours?.weekday_text,
            phone: d.formatted_phone_number,
            website: d.website,
            summary: d.editorial_summary?.overview,
            reviews: (d.reviews ?? []).slice(0, 5).map((r) => ({
              author: r.author_name ?? 'Anonymous',
              rating: r.rating ?? 0,
              text: r.text ?? '',
            })),
            canonicalUrl: d.url,
          },
        });
      },
    );
  }

  // Geocode + render markers whenever pins or filter changes.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    let cancelled = false;

    // Clear existing markers + polylines + per-pin handler index.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    pinHandlersRef.current.clear();
    pinHandlersByDayPosRef.current.clear();
    infoWindowRef.current?.close();

    const visible = pins.filter((p) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'quest') return p.isQuest;
      return p.dayNumber === activeFilter;
    });

    // Reject candidate names that are obviously generic activity verbs
    // (geocoding "Lunch" returns a random Lunch, NJ; "Breakfast" returns
    // a Breakfast, ID, etc). Without this, the unified map sprays pins
    // worldwide for any trip whose itinerary mentions meals or generic
    // activities by category instead of by specific place.
    const GENERIC_REJECTS = new Set([
      'lunch', 'dinner', 'breakfast', 'brunch', 'snack', 'snacks', 'meal',
      'check-in', 'check in', 'checkout', 'check-out', 'arrival', 'departure',
      'transfer', 'transit', 'rest', 'free time', 'optional', 'overview',
      'restaurant', 'hotel', 'cafe', 'bar', 'shop', 'market', 'museum',
    ]);
    const isGeneric = (name: string) => {
      const n = name.toLowerCase().replace(/[^a-z\s-]/g, '').trim();
      return n.length === 0 || GENERIC_REJECTS.has(n);
    };

    async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
      const cacheKey = `geo:${query}`;
      try {
        const hit = sessionStorage.getItem(cacheKey);
        if (hit) return JSON.parse(hit) as { lat: number; lng: number };
      } catch { /* sessionStorage unavailable */ }
      try {
        const r = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`);
        if (r.ok) {
          const c = (await r.json()) as { lat: number; lng: number } | null;
          if (c) {
            try { sessionStorage.setItem(cacheKey, JSON.stringify(c)); } catch { /* ignore */ }
            return c;
          }
        }
      } catch { /* network */ }
      return null;
    }

    // Build a per-pin attempt list. Raw queries first so specific
    // landmarks ("Taj Mahal East Gate") resolve to their actual city
    // instead of being forced into the trip's primary city via a
    // ", New Delhi" suffix that Google can't reconcile.
    function attemptsFor(c: string): string[] {
      const stripped = c.replace(/\([^)]*\)/g, '').trim();
      const out: string[] = [];
      const push = (q: string) => { if (q && !out.includes(q)) out.push(q); };
      push(c);                          // raw
      push(stripped);                   // raw, parens stripped
      push(`${c}, ${location}`);        // suffixed (legacy)
      push(`${stripped}, ${location}`); // suffixed + stripped
      return out;
    }

    async function tryCandidates(
      p: PlacePin,
      accept: (c: { lat: number; lng: number }) => boolean,
    ): Promise<{ lat: number; lng: number } | null> {
      for (const c of p.candidates) {
        if (isGeneric(c)) continue;
        for (const q of attemptsFor(c)) {
          const hit = await geocode(q);
          if (hit && accept(hit)) return hit;
        }
      }
      return null;
    }

    (async () => {
      // Geocode the trip's primary city to seed the bbox.
      const anchor = await geocode(location);

      // Pass 1 — geocode every visible pin with a generous default bbox
      // (±3° from anchor, ~330km) so multi-city itineraries (Delhi →
      // Agra, London → Cambridge, NYC → Boston) all pass. The tight
      // 1.5°/2° box dropped legit Day-N pins in adjacent cities and
      // emptied entire days from the map.
      const defaultBbox = (c: { lat: number; lng: number }) =>
        !anchor || (Math.abs(c.lat - anchor.lat) < 3 && Math.abs(c.lng - anchor.lng) < 3);

      // Geocode EVERY pin (not just the active filter's subset) so the
      // (day,pos) handler registry below covers the full itinerary.
      // Otherwise filtering to "Day 2" would un-register Day-3's
      // handlers, and clicking step 5 of Day 3 in the itinerary card
      // would silently fall through to a Google-Maps-tab fallback.
      const firstPass = await Promise.all(
        pins.map(async (p) => ({ ...p, resolved: (await tryCandidates(p, defaultBbox)) ?? undefined })),
      );
      if (cancelled) return;

      // Pass 2 — derive a dynamic trip bbox from successful pass-1 hits
      // (with 0.5° padding) and retry any pin that didn't resolve. Lets
      // a third city far from the anchor still resolve once two pins in
      // that city land via raw queries.
      const successCoords = firstPass.map((p) => p.resolved).filter((c): c is { lat: number; lng: number } => !!c);
      let dynamicBbox: ((c: { lat: number; lng: number }) => boolean) | null = null;
      if (successCoords.length >= 2) {
        const lats = successCoords.map((c) => c.lat);
        const lngs = successCoords.map((c) => c.lng);
        const minLat = Math.min(...lats) - 0.5;
        const maxLat = Math.max(...lats) + 0.5;
        const minLng = Math.min(...lngs) - 0.5;
        const maxLng = Math.max(...lngs) + 0.5;
        dynamicBbox = (c) => c.lat >= minLat && c.lat <= maxLat && c.lng >= minLng && c.lng <= maxLng;
      }

      const resolved = dynamicBbox
        ? await Promise.all(
            firstPass.map(async (p) => {
              if (p.resolved) return p;
              const hit = await tryCandidates(p, dynamicBbox!);
              return { ...p, resolved: hit ?? undefined };
            }),
          )
        : firstPass;
      if (cancelled) return;

      const bounds = new window.google!.maps!.LatLngBounds();

      // Register handlers for EVERY resolved pin first — independent of
      // the active day filter. The map then renders markers + polylines
      // only for the filtered subset, but a click on any pin from the
      // itinerary card still finds its handler.
      for (const p of resolved) {
        if (!p.resolved) continue;
        const captured = p;
        const handler = () => {
          if (mapRef.current && captured.resolved) mapRef.current.panTo(captured.resolved);
          openPlaceCard(captured);
        };
        pinHandlersRef.current.set(normalizePinKey(captured.name), handler);
        pinHandlersByDayPosRef.current.set(`${captured.dayNumber}:${captured.positionInDay}`, handler);
      }

      // Open the rich React side panel for a pin. Mirrors the planning
      // map's place panel: photo carousel, rating + price + address,
      // tabs for info/reviews, hours, phone, website, "Open in Google
      // Maps" + "Directions" buttons. Loads progressively — minimal
      // shell shown immediately, hydrated by Places.getDetails.
      const openPlaceCard = (p: PlacePin) => {
        if (!p.resolved || !mapRef.current) return;
        mapRef.current.panTo(p.resolved);
        setActivePhoto(0);
        setActiveTab('info');
        setPanel({ pin: p, loading: true });

        const svc = placesServiceRef.current;
        if (!svc || !window.google?.maps?.places) {
          setPanel({ pin: p, loading: false });
          return;
        }
        svc.findPlaceFromQuery(
          { query: `${p.name}, ${location}`, fields: ['place_id', 'geometry'] },
          (results, status) => {
            const r = results?.[0] as
              | { place_id?: string; geometry?: { location?: { lat: () => number; lng: () => number } } }
              | undefined;
            if (status !== 'OK' || !r?.place_id) {
              setPanel({ pin: p, loading: false });
              return;
            }
            // Pan to the Places result's coords if Geocoder fell back
            // to a less-specific location (e.g. Geocoder returned the
            // street "Sadar Bazaar" but Places resolved the actual
            // restaurant "Mama Chicken"). Otherwise the map shows the
            // wrong dot for the panel.
            const placeLoc = r.geometry?.location;
            if (placeLoc && mapRef.current) {
              mapRef.current.panTo({ lat: placeLoc.lat(), lng: placeLoc.lng() });
            }
            svc.getDetails(
              {
                placeId: r.place_id,
                fields: [
                  'name', 'rating', 'user_ratings_total', 'price_level',
                  'formatted_address', 'photos', 'opening_hours',
                  'website', 'formatted_phone_number', 'editorial_summary',
                  'reviews', 'url',
                ],
              },
              (d, st2) => {
                if (st2 !== 'OK' || !d) {
                  setPanel({ pin: p, loading: false });
                  return;
                }
                setPanel({
                  pin: p,
                  loading: false,
                  details: {
                    name: d.name ?? p.name,
                    address: d.formatted_address,
                    rating: d.rating,
                    reviewCount: d.user_ratings_total,
                    priceLevel: d.price_level,
                    photos: (d.photos ?? []).slice(0, 8).map((ph) => ph.getUrl({ maxWidth: 800, maxHeight: 600 })),
                    openingHours: d.opening_hours?.weekday_text,
                    phone: d.formatted_phone_number,
                    website: d.website,
                    summary: d.editorial_summary?.overview,
                    reviews: (d.reviews ?? []).slice(0, 5).map((r) => ({
                      author: r.author_name ?? 'Anonymous',
                      rating: r.rating ?? 0,
                      text: r.text ?? '',
                    })),
                    canonicalUrl: d.url,
                  },
                });
              },
            );
          },
        );
      };

      // Marker rendering — only the filtered subset gets a marker on
      // the map. Handlers for the FULL itinerary are already registered
      // above so click-to-open works for any pin even when filtered out.
      const visibleResolved = resolved.filter((p) => {
        if (!p.resolved) return false;
        if (activeFilter === 'all') return true;
        if (activeFilter === 'quest') return p.isQuest;
        return p.dayNumber === activeFilter;
      });

      // 5-point star path centered at (0,0) — used for quest pins so
      // they're distinguishable by SHAPE not just color (the gold
      // QUEST_COLOR happened to match Day 3's day color, which made
      // a Day-2 quest look like a leaked Day-3 pin).
      const STAR_PATH = 'M 0,-13 L 3.5,-4.2 L 12.4,-4 L 5.4,1.8 L 7.9,10.5 L 0,5.6 L -7.9,10.5 L -5.4,1.8 L -12.4,-4 L -3.5,-4.2 Z';

      const PointCtor = (window.google!.maps as unknown as { Point: new (x: number, y: number) => unknown }).Point;

      for (const p of visibleResolved) {
        if (!p.resolved) continue;
        const dayColor = DAY_COLORS[(p.dayNumber - 1) % DAY_COLORS.length];
        const color = p.isQuest ? QUEST_COLOR : dayColor;

        const marker = new window.google!.maps!.Marker({
          position: p.resolved,
          map: mapRef.current,
          // Quest pins put the position number BELOW the star so the
          // star's silhouette stays clean. Regular pins keep the
          // number centered inside the circle.
          label: p.isQuest
            ? { text: String(p.positionInDay), color: '#fde68a', fontSize: '11px', fontWeight: '700' }
            : { text: String(p.positionInDay), color: '#0a0a1f', fontSize: '12px', fontWeight: '700' },
          icon: p.isQuest
            ? {
                path: STAR_PATH,
                scale: 1.4,
                fillColor: color,
                fillOpacity: 1,
                strokeColor: '#0a0a1f',
                strokeWeight: 2,
                labelOrigin: new PointCtor(0, 22),
              }
            : {
                path: window.google!.maps!.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: color,
                fillOpacity: 0.95,
                strokeColor: '#0a0a1f',
                strokeWeight: 2,
              },
          title: `${p.dayLabel} · ${p.name}${p.isQuest ? ' · Monument Quest' : ''}`,
          zIndex: p.isQuest ? 100 : 10,
        });
        marker.addListener('click', () => openPlaceCard(p));
        markersRef.current.push(marker);
        bounds.extend(p.resolved);
      }

      // ── Per-day route lines ─────────────────────────────────────────
      // Walk the resolved pins by day, fetch a Google Directions route
      // per consecutive leg, and draw a polyline colored by the day.
      // Skipped when consecutive pins are missing geo. All requests fan
      // out in parallel so this doesn't block first paint.
      {
        const byDay = new Map<number, typeof visibleResolved>();
        for (const p of visibleResolved) {
          if (!p.resolved) continue;
          if (!byDay.has(p.dayNumber)) byDay.set(p.dayNumber, []);
          byDay.get(p.dayNumber)!.push(p);
        }

        const legPromises: Promise<void>[] = [];
        for (const [dayNumber, dayPins] of byDay.entries()) {
          const dayColor = DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length];
          for (let i = 0; i < dayPins.length - 1; i++) {
            const from = dayPins[i].resolved!;
            const to = dayPins[i + 1].resolved!;
            const mode: RouteMode = dayPins[i].legModeToNext ?? 'walking';
            // Color the leg by mode within the day's hue: quest legs
            // get a gold tint, otherwise use the day color.
            const legColor = dayPins[i].isQuest || dayPins[i + 1].isQuest ? QUEST_COLOR : dayColor;
            legPromises.push(
              (async () => {
                let polylinePath: Array<{ lat: number; lng: number }>;
                if (!modeUsesDirections(mode)) {
                  // flight/ferry: straight-line fallback
                  polylinePath = [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
                } else {
                  const dr = await fetchDirections(
                    { lat: from.lat, lng: from.lng },
                    { lat: to.lat, lng: to.lng },
                    mode as Exclude<RouteMode, 'flight' | 'ferry'>,
                  );
                  polylinePath = dr?.points ?? [{ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }];
                }
                if (cancelled || !mapRef.current || !window.google?.maps) return;
                const line = new window.google.maps.Polyline({
                  path: polylinePath,
                  map: mapRef.current,
                  strokeColor: legColor,
                  strokeOpacity: 0.85,
                  strokeWeight: 4,
                  geodesic: false,
                  zIndex: 5,
                });
                polylinesRef.current.push(line);
              })().catch(() => { /* swallow individual leg failures */ }),
            );
          }
        }
        // Don't await — let the bounds fit first, lines arrive over the next
        // few hundred ms and just appear over the map.
        Promise.all(legPromises);
      }

      if (!bounds.isEmpty()) {
        mapRef.current?.fitBounds(bounds, 64);
      } else if (anchor && mapRef.current) {
        // No resolved pins (or none in current filter) — anchor on the
        // city so the user sees the right region instead of a world view.
        mapRef.current.setCenter(anchor);
        mapRef.current.setZoom(11);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, pins, activeFilter, location]);

  if (keyMissing) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
        Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  const dayChips = Array.from(new Set(pins.map((p) => p.dayNumber))).sort((a, b) => a - b);

  return (
    <div
      style={{
        position: sticky ? 'sticky' : 'static',
        top: sticky ? topOffset : undefined,
        zIndex: 5,
        marginBottom: fillHeight ? 0 : 18,
        display: 'flex',
        // column-reverse so the "Confirm and regenerate" action bar
        // renders at the TOP of the itinerary drawer (user feedback —
        // it lived at the bottom and was easy to miss). Order of the
        // children in the JSX is preserved (map first, button second);
        // flex visually flips them so the button is on top.
        flexDirection: 'column-reverse',
        height: fillHeight ? '100%' : 'auto',
        minHeight: 0,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: fillHeight ? 'auto' : height,
          flex: fillHeight ? 1 : 'none',
          minHeight: fillHeight ? 0 : undefined,
        }}
      >
        <div
          ref={divRef}
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--brand-border)',
            background: '#0a0a1f',
          }}
        />
        {planningEnabled && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchQuery.trim();
                const svc = placesServiceRef.current;
                if (!q || !svc || !mapRef.current) return;
                setSearching(true);
                setSearchResults([]);
                // Bias by map CENTER + 50km radius rather than getBounds().
                // When the user has the map zoomed out wide, getBounds()
                // covers half the planet and Google falls back to the
                // user's IP geolocation. A center+radius forces Google
                // to stay near where the map is looking. Plus suffix
                // the trip city in the query as belt-and-suspenders.
                const ctr = mapRef.current.getCenter?.();
                const center = ctr ? { lat: ctr.lat(), lng: ctr.lng() } : null;
                const biasedQuery = location ? `${q} ${location}` : q;
                svc.textSearch(
                  {
                    query: biasedQuery,
                    ...(center ? { location: center, radius: 50000 } : {}),
                  },
                  (results, status) => {
                    setSearching(false);
                    if (status !== 'OK' || !results?.length) return;
                    // Build the candidate list. If the first hit is a
                    // landslide match (the user's query == the result
                    // name, case-insensitive), open it directly. Else
                    // show a scrollable dropdown so the user picks.
                    const candidates = results
                      .filter((r) => r.place_id && r.geometry?.location)
                      .slice(0, 8)
                      .map((r) => ({
                        placeId: r.place_id!,
                        name: r.name ?? '',
                        address: r.formatted_address,
                        lat: r.geometry!.location!.lat(),
                        lng: r.geometry!.location!.lng(),
                        rating: r.rating,
                        photoUrl: r.photos?.[0]?.getUrl({ maxWidth: 120, maxHeight: 120 }),
                      }));
                    if (!candidates.length) return;
                    const first = candidates[0];
                    const exact = first.name.trim().toLowerCase() === q.toLowerCase();
                    if (exact || candidates.length === 1) {
                      openPlaceFromPlaceId(first.placeId, first.name, { lat: first.lat, lng: first.lng });
                    } else {
                      setSearchResults(candidates);
                    }
                  },
                );
              }}
              style={{
                // Full-width search row below the day chips. Previously
                // sat at right:8 with maxWidth:320 which collided with
                // the chat genie bubble in the top-right corner — the
                // user couldn't read the placeholder. Now spans the full
                // width so the placeholder + input are always legible.
                position: 'absolute',
                // Chips strip top:safe-area+0 with ~40px height → search
                // bar sits at safe-area+44 (4px gap) so the two rows read
                // as one stacked control cluster anchored to the notch.
                top: 'calc(env(safe-area-inset-top, 0px) + 44px)',
                left: 8, right: 8, zIndex: 40,
                display: 'flex', gap: 6,
                background: 'rgba(13,17,23,0.92)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: 4,
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              {/* Paperclip — opens the file picker. Same flow as the
                  retired ANALYZE PHOTO bar: vision model picks the day,
                  /api/itinerary/media slots the activity in. Hidden
                  input is triggered programmatically. */}
              <button
                type="button"
                aria-label="Analyze photo or video to add a pin"
                title="Analyze photo or video"
                disabled={!tripId || uploadingMedia}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: '0 0 auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: 6, padding: 0,
                  background: 'transparent', border: 'none',
                  color: uploadingMedia ? 'rgba(167,139,250,0.55)' : 'rgba(167,139,250,0.95)',
                  cursor: !tripId || uploadingMedia ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {uploadingMedia ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
                    </path>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  // Reset value so the same file can be re-picked.
                  if (e.target) e.target.value = '';
                  if (!f || !tripId) return;
                  setUploadingMedia(true);
                  setUploadToast('Analyzing…');
                  try {
                    const form = new FormData();
                    form.set('tripId', tripId);
                    form.set('day', '0'); // "Any day" — server picks via vision
                    form.set('file', f);
                    const res = await fetch('/api/itinerary/media', { method: 'POST', body: form });
                    if (!res.ok) {
                      const j = await res.json().catch(() => null);
                      throw new Error(j?.error ?? `HTTP ${res.status}`);
                    }
                    const j = await res.json() as { addedActivity?: { name: string; time: string } };
                    setUploadToast(j.addedActivity ? `Added ${j.addedActivity.name} (${j.addedActivity.time})` : 'Added to itinerary');
                    window.dispatchEvent(new CustomEvent('geknee:itinerary-updated'));
                  } catch (err) {
                    console.error('[trip-map] media upload failed', err);
                    setUploadToast(err instanceof Error ? err.message : 'Upload failed');
                  } finally {
                    setUploadingMedia(false);
                    // Auto-dismiss the toast after 4s so it doesn't sit forever.
                    setTimeout(() => setUploadToast(null), 4000);
                  }
                }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearchResults([]); setSearchQuery(''); } }}
                placeholder="Search hotels, restaurants, sights…"
                style={{
                  flex: 1, minWidth: 0,
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#e2e8f0',
                  // 16px MIN — iOS Safari auto-zooms on inputs with
                  // font-size <16, and there's no graceful way to zoom
                  // back out inside the modal context. Bumping here
                  // kills the zoom-trap on map search without
                  // disabling pinch-zoom elsewhere on the page.
                  fontSize: 16,
                  padding: '6px 8px',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                style={{
                  padding: '6px 12px', borderRadius: 6,
                  background: searchQuery.trim() ? 'linear-gradient(135deg,#a78bfa,#7dd3fc)' : 'rgba(255,255,255,0.06)',
                  color: searchQuery.trim() ? '#0a0a1f' : 'rgba(255,255,255,0.4)',
                  border: 'none', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >{searching ? '…' : 'Search'}</button>
            </form>
            {uploadToast && (
              <div
                role="status"
                style={{
                  position: 'absolute',
                  top: 'calc(env(safe-area-inset-top, 0px) + 92px)',
                  left: 8, right: 8, zIndex: 41,
                  padding: '8px 12px',
                  background: 'rgba(13,17,23,0.96)',
                  border: '1px solid rgba(167,139,250,0.45)',
                  borderRadius: 10, color: '#e2e8f0',
                  fontSize: 12, fontFamily: 'inherit',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                }}
              >
                {uploadToast}
              </div>
            )}
            {searchResults.length > 0 && (
              <div
                role="listbox"
                aria-label="Search results"
                style={{
                  position: 'absolute',
                  // Search results sit just under the full-width search
                  // bar at top:safe+56 — bar height ~40px + 8px gap.
                  top: 'calc(env(safe-area-inset-top, 0px) + 92px)',
                  right: 8, zIndex: 40,
                  width: 'min(340px, calc(100% - 16px))',
                  maxHeight: 'calc(100% - 128px)',
                  overflowY: 'auto',
                  background: 'rgba(13,13,36,0.96)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
                  padding: 6,
                  display: 'flex', flexDirection: 'column', gap: 4,
                  color: '#e2e8f0',
                }}
              >
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px',
                }}>
                  <div style={{
                    fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                    fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: '#94a3b8', fontWeight: 700,
                  }}>{searchResults.length} results</div>
                  <button
                    type="button"
                    onClick={() => setSearchResults([])}
                    aria-label="Close results"
                    style={{
                      width: 22, height: 22, borderRadius: '50%', border: 'none',
                      background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
                      cursor: 'pointer', fontSize: 12, lineHeight: 1,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                </div>
                {searchResults.map((r) => (
                  <button
                    key={r.placeId}
                    type="button"
                    role="option"
                    onClick={() => {
                      openPlaceFromPlaceId(r.placeId, r.name, { lat: r.lat, lng: r.lng });
                      setSearchResults([]);
                    }}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: 8, borderRadius: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: '#e2e8f0', textAlign: 'left',
                      cursor: 'pointer', fontFamily: 'inherit',
                      width: '100%',
                    }}
                  >
                    {r.photoUrl ? (
                      <img
                        src={r.photoUrl}
                        alt=""
                        style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(167,139,250,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: 'rgba(167,139,250,0.7)',
                      }}>📍</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                      </div>
                      {typeof r.rating === 'number' && (
                        <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 2 }}>
                          ★ {r.rating.toFixed(1)}
                        </div>
                      )}
                      {r.address && (
                        <div style={{
                          fontSize: 10, color: '#94a3b8', lineHeight: 1.4,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>{r.address}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {/* Find recs lives in the genie chat now as a "TRY ASKING" suggestion
            chip — moved out of the map per user feedback (the FAB was eating
            map space and the genie already has find_places + geocode tools
            to surface recommendations conversationally). Set this back to
            `recsEnabled` if we ever want the inline panel back. */}
        {false && recsEnabled && (
          <>
            <button
              type="button"
              onClick={toggleRecs}
              aria-expanded={recsOpen}
              style={{
                // Find recs button — third row (below day chips + search bar).
                // Search bar took over the top:56 row so it could span full
                // width; this drops to top:108 so it's still one tap away
                // without competing for space.
                position: 'absolute', top: 108, left: 8, zIndex: 40,
                padding: '8px 12px',
                background: recsOpen
                  ? 'linear-gradient(135deg, rgba(167,139,250,0.95), rgba(125,211,252,0.85))'
                  : 'rgba(13,17,23,0.92)',
                border: '1px solid',
                borderColor: recsOpen ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.12)',
                borderRadius: 10,
                color: recsOpen ? '#0a0a1f' : '#e2e8f0',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.02em',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }}>{recsOpen ? '×' : '✦'}</span>
              <span>{recsOpen ? 'Hide recs' : 'Find recs'}</span>
            </button>
            {recsOpen && (
              <div
                role="region"
                aria-label="Curated recommendations"
                style={{
                  position: 'absolute',
                  top: 156, left: 8, zIndex: 40,
                  width: 'min(340px, calc(100% - 16px))',
                  maxHeight: 'calc(100% - 128px)',
                  overflowY: 'auto',
                  background: 'rgba(13,13,36,0.96)',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
                  padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 10,
                  color: '#e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                    fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    fontWeight: 700, color: 'rgba(167,139,250,0.95)',
                  }}>§ Curated for you</div>
                  <button
                    type="button"
                    onClick={() => void fetchRecs({ force: true })}
                    disabled={recsLoading}
                    aria-label="Refresh recommendations"
                    style={{
                      fontSize: 10, fontFamily: 'inherit', fontWeight: 700,
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.6)',
                      padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                    }}
                  >{recsLoading ? '…' : 'Refresh'}</button>
                </div>
                {recsLoading && recs.length === 0 && (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Curating picks for your trip…
                  </div>
                )}
                {recsError && (
                  <div style={{ padding: '12px', fontSize: 11, color: '#fbbf24',
                    background: 'rgba(251,191,36,0.08)', borderRadius: 8 }}>
                    {recsError}
                  </div>
                )}
                {recs.map(rec => {
                  const tint = REC_TINT[rec.category];
                  const pinned = pinnedRecIds.has(rec.id);
                  const pinning = pinningRecId === rec.id;
                  return (
                    <div
                      key={rec.id}
                      style={{
                        opacity: pinned ? 0.45 : 1,
                        padding: 10,
                        borderRadius: 10,
                        background: `${tint.bg}`,
                        border: `1px solid ${tint.fg}33`,
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
                        textTransform: 'uppercase', color: tint.fg,
                        marginBottom: 3,
                      }}>{rec.category === 'off-beat' ? 'Off-beat' : rec.category}</div>
                      <div style={{
                        fontFamily: 'var(--font-display, Georgia, serif)',
                        fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em',
                        color: '#f2f2f8', marginBottom: 4,
                      }}>{rec.name}</div>
                      <div style={{
                        fontSize: 11, color: 'rgba(245,241,232,0.65)',
                        lineHeight: 1.45, fontStyle: 'italic',
                        marginBottom: 8,
                      }}>{rec.whyItFits}</div>
                      <button
                        type="button"
                        onClick={() => !pinned && !pinning && pinRec(rec)}
                        disabled={pinned || pinning}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 10px', borderRadius: 6,
                          background: pinned ? 'transparent' : tint.fg,
                          color: pinned ? tint.fg : '#0a0a1f',
                          border: pinned ? `1px solid ${tint.fg}55` : 'none',
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          fontFamily: 'inherit',
                          cursor: (pinned || pinning) ? 'default' : 'pointer',
                        }}
                      >
                        {pinned ? '✓ Pinned' : pinning ? 'Pinning…' : '+ Pin to trip'}
                      </button>
                    </div>
                  );
                })}
                {!recsLoading && recs.length === 0 && !recsError && (
                  <div style={{ padding: '8px 4px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    No recs yet. Tap refresh to ask the genie.
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {panel && (
          <PlacePanelOverlay
            data={panel}
            location={location}
            activePhoto={activePhoto}
            setActivePhoto={setActivePhoto}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onClose={() => setPanel(null)}
            bookmarks={bookmarks}
            onAddBookmark={onAddBookmark}
            dayAssignment={typeof activeFilter === 'number' ? activeFilter : null}
          />
        )}
        {/* Day-filter chips strip — top row. Horizontal-scrolls
            (single row, no wrap) so the strip never grows tall enough
            to crowd the map at narrow widths. Find recs + search bar
            sit on the row below at top:56. */}
        {dayChips.length > 0 && (
          <div
            role="tablist"
            aria-label="Filter map by day"
            style={{
              position: 'absolute',
              // The floating close × is gone — reclaim the left edge.
              left: 8, right: 8,
              // Flush with the Dynamic Island — env(safe-area-inset-top)
              // already accounts for the island's height; no extra px
              // means the chips read as "anchored to the camera notch"
              // instead of floating below it.
              top: 'env(safe-area-inset-top, 0px)',
              zIndex: 35,
              display: 'flex', flexWrap: 'nowrap', gap: 6,
              padding: 6,
              background: 'rgba(13,17,23,0.78)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 6px 22px rgba(0,0,0,0.35)',
              justifyContent: 'flex-start',
              overflowX: 'auto',
              scrollbarWidth: 'thin',
            }}
          >
            <button
              role="tab"
              aria-selected={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
              style={chipStyle(activeFilter === 'all', null)}
            >
              All ({pins.length})
            </button>
            {dayChips.map((d) => {
              const count = pins.filter((p) => p.dayNumber === d).length;
              const color = DAY_COLORS[(d - 1) % DAY_COLORS.length];
              return (
                <button
                  key={d}
                  role="tab"
                  aria-selected={activeFilter === d}
                  onClick={() => setActiveFilter(activeFilter === d ? 'all' : d)}
                  style={chipStyle(activeFilter === d, color)}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />
                  Day {d} ({count})
                  {weatherData?.forecast[d - 1] && (
                    <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, opacity: 0.85 }}>
                      {weatherData.forecast[d - 1].iconUrl && (
                        <img src={weatherData.forecast[d - 1].iconUrl!} alt="" width={14} height={14} style={{ display: 'block' }} />
                      )}
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
                        {weatherData.forecast[d - 1].highC != null ? Math.round(weatherData.forecast[d - 1].highC!) : '--'}°/{weatherData.forecast[d - 1].lowC != null ? Math.round(weatherData.forecast[d - 1].lowC!) : '--'}°
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
            {(() => {
              const questCount = pins.filter((p) => p.isQuest).length;
              if (questCount === 0) return null;
              const active = activeFilter === 'quest';
              return (
                <button
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveFilter(active ? 'all' : 'quest')}
                  style={{
                    ...chipStyle(active, QUEST_COLOR),
                    // Shiny gold gradient when active; subtle gold tint
                    // when inactive so the chip always reads as "quest".
                    background: active
                      ? `linear-gradient(135deg, ${QUEST_COLOR} 0%, #fde68a 50%, ${QUEST_COLOR} 100%)`
                      : `linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(253,230,138,0.28) 50%, rgba(251,191,36,0.18) 100%)`,
                    backgroundSize: '200% 200%',
                    animation: active ? 'gk-shine 2.4s ease-in-out infinite' : undefined,
                    color: active ? '#0a0a1f' : '#fde68a',
                    border: `1px solid ${active ? '#0a0a1f' : 'rgba(251,191,36,0.55)'}`,
                    boxShadow: active ? '0 0 14px rgba(251,191,36,0.55)' : '0 0 6px rgba(251,191,36,0.18)',
                    fontWeight: 700,
                  }}
                >
                  <span aria-hidden style={{ marginRight: 6 }}>★</span>
                  Quest ({questCount})
                </button>
              );
            })()}
          </div>
        )}
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#fbbf24' }}>
          Map error: {error}
        </div>
      )}
      {/* Bottom action bar — dim when no pin changes vs. the last-
          generated baseline, lights up when the diff is non-zero. Gives
          the user one obvious place to "confirm changes → regenerate
          itinerary". The AI handles day-assignment for new pins not
          dropped under an active day filter. */}
      {/* Drop-a-pin / regenerate CTA only renders when there are pending
          pin changes. The idle "Drop a pin to update your trip" copy was
          eating ~50 px at the top of the drawer for no real CTA — user
          feedback was that it pushed the map down without earning the
          space. When changes ARE pending, the active regen state still
          appears (now as the ONLY state of this control). */}
      {onRegenerate && pinChangeCount > 0 && (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label={pinChangeCount > 0
            ? `Regenerate itinerary — ${pinChangeCount} pin change${pinChangeCount === 1 ? '' : 's'} pending`
            : 'Itinerary in sync with pins'
          }
          style={{
            // In-sync state is informational only — shrink the
            // padding hard so the row reclaims pixels for the map.
            // Active state (pin changes detected) keeps the larger
            // tap target since it's now the primary CTA.
            marginTop: pinChangeCount > 0 ? 10 : 6, width: '100%',
            padding: pinChangeCount > 0 ? '14px 18px' : '8px 12px',
            borderRadius: pinChangeCount > 0 ? 12 : 8,
            border: '1px solid',
            borderColor: pinChangeCount > 0 ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.08)',
            background: pinChangeCount > 0
              ? 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(125,211,252,0.10))'
              : 'rgba(255,255,255,0.03)',
            color: pinChangeCount > 0 ? 'var(--brand-ink)' : 'rgba(255,255,255,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12,
            cursor: pinChangeCount > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit',
            transition: 'background 200ms ease, border-color 200ms ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              // 24→18 when in-sync so the bullet doesn't dominate the
              // compact one-line row; active state stays at 24 so the
              // count badge reads clearly.
              width: pinChangeCount > 0 ? 24 : 18,
              height: pinChangeCount > 0 ? 24 : 18,
              borderRadius: '50%',
              background: pinChangeCount > 0 ? 'var(--brand-accent)' : 'rgba(255,255,255,0.06)',
              color: pinChangeCount > 0 ? 'var(--brand-bg)' : 'rgba(255,255,255,0.45)',
              fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
              fontSize: 10, fontWeight: 800,
            }}>
              {pinChangeCount > 0 ? pinChangeCount : '✓'}
            </span>
            <span style={{ textAlign: 'left' }}>
              {/* Eyebrow only rendered when there are pin changes —
                  in-sync state collapses to a single line, saving
                  ~14 px for the map. */}
              {pinChangeCount > 0 && (
                <span style={{
                  display: 'block',
                  fontSize: 11, fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
                  color: 'var(--brand-accent)',
                  marginBottom: 1,
                }}>
                  § Pin changes detected
                </span>
              )}
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-display), Georgia, serif',
                // Same shrink logic as the outer button: in-sync is
                // informational copy that can sit at 12 px; active
                // state needs the larger size so it reads as the
                // primary action.
                fontSize: pinChangeCount > 0 ? 15 : 12,
                fontWeight: 400, letterSpacing: '-0.01em',
                color: pinChangeCount > 0 ? 'var(--brand-ink)' : 'rgba(255,255,255,0.55)',
              }}>
                {pinChangeCount > 0
                  ? `Confirm and regenerate the itinerary`
                  : `Drop a pin to update your trip`}
              </span>
            </span>
          </span>
          {pinChangeCount > 0 && (
            <span style={{
              fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              color: 'var(--brand-accent)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              Regenerate →
            </span>
          )}
        </button>
      )}
    </div>
  );
}

// Place detail panel that slides over the left edge of the map when a
// pin (or in-itinerary number circle) is clicked. Mirrors the planning
// map's panel — photo carousel, name + rating + price + address,
// info/reviews tabs, hours, contact, "Open in Google Maps" + Directions.
function PlacePanelOverlay(props: {
  data: PlacePanelData;
  location: string;
  activePhoto: number;
  setActivePhoto: (n: number | ((p: number) => number)) => void;
  activeTab: 'info' | 'reviews';
  setActiveTab: (t: 'info' | 'reviews') => void;
  onClose: () => void;
  bookmarks?: Bookmark[];
  onAddBookmark?: (b: Bookmark) => void;
  // Day to attach to the new bookmark when the user pins. Comes from
  // the parent's active day-filter chip. Null = "any day" (AI picks).
  dayAssignment: number | null;
}) {
  const { data, location, activePhoto, setActivePhoto, activeTab, setActiveTab, onClose, bookmarks, onAddBookmark, dayAssignment } = props;
  const { pin, loading, details, poi } = data;
  const isFromPOI = !!poi;
  const placeName = details?.name ?? pin.name;
  const isAlreadyPinned = !!(
    bookmarks &&
    (bookmarks.some((b) => poi?.placeId && b.placeId === poi.placeId) ||
      bookmarks.some((b) => b.name.toLowerCase() === placeName.toLowerCase()))
  );
  const canPin = isFromPOI && onAddBookmark && !isAlreadyPinned;
  const handlePin = () => {
    if (!onAddBookmark || !poi) return;
    const coords: [number, number] = poi.coords
      ? [poi.coords.lng, poi.coords.lat]
      : pin.resolved
        ? [pin.resolved.lng, pin.resolved.lat]
        : [0, 0];
    onAddBookmark({
      id: `bm_${Date.now()}`,
      name: placeName,
      coords,
      category: 'other',
      placeId: poi.placeId,
      // dayAssignment passed in via prop so the panel doesn't have to
      // know about the parent's filter state.
      dayAssignment: dayAssignment ?? null,
    });
  };
  const dayColor = DAY_COLORS[(pin.dayNumber - 1) % DAY_COLORS.length];
  const accent = pin.isQuest ? QUEST_COLOR : dayColor;
  const mapsQuery = `${pin.name}, ${location}`;
  const url = details?.canonicalUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`;
  const photos = details?.photos ?? [];
  const photoIdx = photos.length ? activePhoto % photos.length : 0;

  return (
    <div
      style={{
        position: 'absolute', top: 8, left: 8, bottom: 8,
        width: 320, maxWidth: 'calc(100% - 16px)',
        background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
        zIndex: 50,
        fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
        color: '#e2e8f0',
      }}
    >
      {/* Hero image + close + photo nav */}
      <div style={{ position: 'relative', height: 200, background: '#000', flexShrink: 0 }}>
        {photos.length > 0 ? (
          <img
            src={photos[photoIdx]} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
            {loading ? 'Loading photos…' : 'No photos'}
          </div>
        )}
        {photos.length > 1 && (
          <>
            <button
              onClick={() => setActivePhoto((p) => (p - 1 + photos.length) % photos.length)}
              aria-label="Previous photo"
              style={navArrowStyle('left')}
            >‹</button>
            <button
              onClick={() => setActivePhoto((p) => (p + 1) % photos.length)}
              aria-label="Next photo"
              style={navArrowStyle('right')}
            >›</button>
            <div style={{
              position: 'absolute', bottom: 8, right: 8,
              background: 'rgba(0,0,0,0.6)', borderRadius: 999,
              padding: '2px 8px', color: '#fff', fontSize: 10, fontWeight: 600,
            }}>{photoIdx + 1} / {photos.length}</div>
          </>
        )}
        <button
          onClick={onClose} aria-label="Close panel"
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)', border: 'none',
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* Body — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '14px 16px 0' }}>
          {pin.dayLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: accent, letterSpacing: '0.1em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, display: 'inline-block' }} />
              {pin.dayLabel}
              {pin.isQuest && (
                <span style={{ background: QUEST_COLOR, color: '#0a0a1f', padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, marginLeft: 6 }}>QUEST</span>
              )}
            </div>
          )}
          <h3 style={{
            margin: '0 0 6px', fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 20, fontWeight: 400, lineHeight: 1.2, color: '#fff',
          }}>{details?.name ?? pin.name}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontSize: 12 }}>
            {typeof details?.rating === 'number' && (
              <>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>{details.rating.toFixed(1)} ★</span>
                {details.reviewCount && <span style={{ color: 'rgba(255,255,255,0.4)' }}>({details.reviewCount.toLocaleString()})</span>}
              </>
            )}
            {typeof details?.priceLevel === 'number' && (
              <span style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '1px 7px', color: '#a3e635', fontWeight: 600 }}>
                {'$'.repeat(details.priceLevel)}
              </span>
            )}
          </div>
          {details?.address && (
            <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 1.4 }}>{details.address}</p>
          )}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={ctaPrimary()}>Open in Google Maps</a>
            <a href={dirUrl} target="_blank" rel="noopener noreferrer" style={ctaSecondary()}>Directions</a>
          </div>
          {isFromPOI && onAddBookmark && (
            <button
              type="button"
              onClick={canPin ? handlePin : undefined}
              disabled={!canPin}
              style={{
                width: '100%', marginBottom: 12,
                padding: '10px 0', borderRadius: 10,
                fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                background: isAlreadyPinned ? 'rgba(56,189,248,0.08)' : 'rgba(56,189,248,0.18)',
                border: `1px solid ${isAlreadyPinned ? 'rgba(56,189,248,0.3)' : 'rgba(56,189,248,0.5)'}`,
                color: '#7dd3fc',
                cursor: isAlreadyPinned ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {isAlreadyPinned
                ? '✓ Pinned'
                : `📍 Pin to ${dayAssignment ? `Day ${dayAssignment}` : 'best-fit day'}`}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {(['info', 'reviews'] as const).map((t) => {
            const label = t === 'reviews'
              ? `Reviews${details?.reviews.length ? ` (${details.reviews.length})` : ''}`
              : 'Info';
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  padding: '9px 14px',
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab === t ? accent : 'transparent'}`,
                  color: activeTab === t ? accent : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >{label}</button>
            );
          })}
        </div>

        {activeTab === 'info' ? (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Loading details…</p>}
            {details?.summary && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{details.summary}</p>
            )}
            {details?.openingHours && details.openingHours.length > 0 && (
              <PanelGroup label="Hours">
                {details.openingHours.map((h, i) => (
                  <p key={i} style={{ margin: '0 0 3px', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{h}</p>
                ))}
              </PanelGroup>
            )}
            {details?.phone && (
              <PanelGroup label="Phone">
                <a href={`tel:${details.phone}`} style={{ fontSize: 12, color: '#7dd3fc', textDecoration: 'none' }}>{details.phone}</a>
              </PanelGroup>
            )}
            {details?.website && (
              <PanelGroup label="Website">
                <a href={details.website} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#38bdf8', wordBreak: 'break-all', textDecoration: 'none' }}>
                  {details.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </PanelGroup>
            )}
            {!loading && !details?.summary && !details?.openingHours && !details?.phone && !details?.website && (
              <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No additional details available.</p>
            )}
          </div>
        ) : (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!details?.reviews.length && (
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 8 }}>
                {loading ? 'Loading reviews…' : 'No reviews available.'}
              </p>
            )}
            {details?.reviews.map((r, i) => (
              <div key={i} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingTop: i > 0 ? 12 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{r.author}</span>
                  <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>{r.rating.toFixed(1)} ★</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{
        margin: '0 0 4px', fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
        fontSize: 10, fontWeight: 700, color: 'rgba(167,139,250,0.85)',
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>{label}</p>
      {children}
    </div>
  );
}

function navArrowStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', [side]: 8, transform: 'translateY(-50%)',
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function ctaPrimary(): React.CSSProperties {
  return {
    flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 8,
    background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
    color: '#0a0a1f', fontWeight: 700, fontSize: 11, textDecoration: 'none',
  };
}
function ctaSecondary(): React.CSSProperties {
  return {
    textAlign: 'center', padding: '8px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,0.08)', color: '#cbd5e1',
    fontWeight: 600, fontSize: 11, textDecoration: 'none',
  };
}

function chipStyle(active: boolean, color: string | null): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 999,
    background: active ? (color ? `${color}33` : 'rgba(167,139,250,0.22)') : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? (color ?? 'rgba(167,139,250,0.5)') : 'rgba(255,255,255,0.12)'}`,
    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  };
}

// Google-Maps-style place card rendered inside the InfoWindow. Plain
// HTML string (InfoWindow expects markup, not React). Initial render
// uses just the name + day badge; once Places lookup completes we
// re-render with photo / rating / price / address / open-now / a real
// "Open in Google Maps" link to the canonical place URL.
function renderCard(opts: {
  name: string;
  dayLabel: string;
  isQuest: boolean;
  accent: string;
  mapsQuery: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  address?: string;
  photoUrl?: string;
  openNow?: boolean;
  canonicalUrl?: string;
}): string {
  const {
    name, dayLabel, isQuest, accent, mapsQuery,
    rating, reviewCount, priceLevel, address, photoUrl, openNow, canonicalUrl,
  } = opts;
  const url = canonicalUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;
  const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`;
  const stars = typeof rating === 'number'
    ? `<span style="color:#fbbf24;font-weight:700">${rating.toFixed(1)} ★</span>${reviewCount ? `<span style="color:#94a3b8"> · ${reviewCount.toLocaleString()} reviews</span>` : ''}`
    : '';
  const price = typeof priceLevel === 'number' ? `<span style="color:#94a3b8"> · ${'$'.repeat(priceLevel)}</span>` : '';
  const openChip = openNow === true
    ? '<span style="background:#0f5132;color:#a7f3d0;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em">OPEN NOW</span>'
    : openNow === false
      ? '<span style="background:#7f1d1d;color:#fecaca;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em">CLOSED</span>'
      : '';
  const photo = photoUrl
    ? `<img src="${photoUrl}" alt="${escapeHtml(name)}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px" />`
    : '';
  const addr = address ? `<div style="color:#94a3b8;font-size:11px;margin-top:4px">${escapeHtml(address)}</div>` : '';
  const questBadge = isQuest
    ? `<span style="background:${QUEST_COLOR};color:#0a0a1f;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.04em;margin-left:6px">QUEST</span>`
    : '';
  return `
    <div style="font-family:Inter,system-ui,sans-serif;color:#e2e8f0;background:#0a0a1f;padding:12px;border-radius:8px;min-width:260px;max-width:300px">
      ${photo}
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;color:${accent};letter-spacing:0.1em;font-weight:700;text-transform:uppercase;margin-bottom:4px">
        <span style="width:6px;height:6px;border-radius:50%;background:${accent};display:inline-block"></span>
        ${escapeHtml(dayLabel)} ${questBadge}
      </div>
      <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:6px;line-height:1.3">${escapeHtml(name)}</div>
      <div style="font-size:12px;display:flex;flex-wrap:wrap;align-items:center;gap:6px">${stars}${price} ${openChip}</div>
      ${addr}
      <div style="display:flex;gap:6px;margin-top:10px">
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           style="flex:1;text-align:center;background:linear-gradient(135deg,#a78bfa,#7dd3fc);color:#0a0a1f;font-weight:700;font-size:11px;padding:7px 10px;border-radius:8px;text-decoration:none">
          Open in Google Maps
        </a>
        <a href="${dirUrl}" target="_blank" rel="noopener noreferrer"
           style="text-align:center;background:rgba(255,255,255,0.08);color:#cbd5e1;font-weight:600;font-size:11px;padding:7px 10px;border-radius:8px;text-decoration:none">
          Directions
        </a>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

// Pin index key. Lower-case + strip diacritics + collapse non-alnum so
// "Café Trinité" and "Cafe Trinite" both resolve to the same pin.
function normalizePinKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

