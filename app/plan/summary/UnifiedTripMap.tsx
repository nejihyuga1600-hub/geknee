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
import type { Section } from './lib/itinerary-parse';
import { extractActivityCandidates, extractActivityPlace, extractTransitMode } from './lib/places';

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
    cb: (results: Array<{ place_id?: string; geometry?: { location?: { lat: () => number; lng: () => number } }; name?: string }> | null, status: string) => void,
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
  const [ready, setReady] = useState(false);
  const [keyMissing, setKeyMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | number>('all');
  const [panel, setPanel] = useState<PlacePanelData | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [activeTab, setActiveTab] = useState<'info' | 'reviews'>('info');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // Pull day sections only. /^Day\s*\d+\b/ accepts "Day 4: Title",
  // "Day 4 - Title", and "Day 4 Title" while rejecting "Day 41". The
  // tighter "must have separator" version was dropping legit sections
  // where the AI omitted the colon/dash. Phantom days (sections that
  // open with "Day N" but have no content) are filtered out at the
  // chip step because dayChips derives from pins, not sections.
  const daySections = useMemo(() => {
    return sections
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => /^Day\s*\d+\b/i.test(s.heading ?? ''));
  }, [sections]);

  // Build the candidate place list per day, in chronological order.
  // Walk lines in order so we can capture each activity's transit-mode-
  // to-next (the emoji line that follows the headline). That lets the
  // route polylines pick the right Mapbox profile per leg.
  const pins = useMemo<PlacePin[]>(() => {
    const out: PlacePin[] = [];
    daySections.forEach((entry, dayIdx) => {
      const dayNum = parseInt(((entry.s.heading ?? '').match(/Day\s*(\d+)/i) ?? [])[1] ?? `${dayIdx + 1}`, 10);
      let pos = 0;
      let pendingTransit: LegMode | null = null;
      for (const line of entry.s.lines as string[]) {
        if (/\*\*[^*]+\*\*/.test(line)) {
          // Activity headline. The transit line we last saw applies to
          // the previous activity's leg-to-this one — assign it back.
          if (pendingTransit && out.length > 0) {
            const prev = out[out.length - 1];
            if (prev.dayIdx === dayIdx && prev.legModeToNext === null) {
              prev.legModeToNext = pendingTransit;
            }
          }
          pendingTransit = null;
          const candidates = extractActivityCandidates(line, []);
          const primary = extractActivityPlace(line, []);
          if (!candidates.length || !primary) continue;
          pos += 1;
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
      let handler: (() => void) | undefined;
      if (typeof day === 'number' && typeof pos === 'number') {
        handler = pinHandlersByDayPosRef.current.get(`${day}:${pos}`);
      }
      if (!handler) {
        const key = normalizePinKey(ce.detail?.name ?? '');
        if (key) handler = pinHandlersRef.current.get(key);
      }
      if (handler) {
        ce.preventDefault();
        handler();
      }
    };
    window.addEventListener('geknee:focus-map-pin', onFocus);
    return () => window.removeEventListener('geknee:focus-map-pin', onFocus);
  }, []);

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
          styles: DARK_MAP_STYLE,
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

    (bookmarks ?? []).forEach((b, i) => {
      const marker = new gmaps.Marker({
        position: { lat: b.coords[1], lng: b.coords[0] },
        map: mapRef.current,
        label: { text: String(i + 1), color: '#0a0a1f', fontSize: '12px', fontWeight: '700' },
        icon: {
          path: gmaps.SymbolPath.CIRCLE,
          scale: 12,
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
  }, [ready, planningEnabled, bookmarks]);

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

    const visible = pins.filter((p) => activeFilter === 'all' || p.dayNumber === activeFilter);

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

      const firstPass = await Promise.all(
        visible.map(async (p) => ({ ...p, resolved: (await tryCandidates(p, defaultBbox)) ?? undefined })),
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
      let perDayCounter = new Map<number, number>();

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
          { query: `${p.name}, ${location}`, fields: ['place_id'] },
          (results, status) => {
            if (status !== 'OK' || !results?.[0]?.place_id) {
              setPanel({ pin: p, loading: false });
              return;
            }
            svc.getDetails(
              {
                placeId: results[0].place_id,
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

      for (const p of resolved) {
        if (!p.resolved) continue;
        const dayCount = (perDayCounter.get(p.dayNumber) ?? 0) + 1;
        perDayCounter.set(p.dayNumber, dayCount);
        // Quest pins override the day color with gold so the
        // monument-quest stops are unmistakable across the whole trip.
        const dayColor = DAY_COLORS[(p.dayNumber - 1) % DAY_COLORS.length];
        const color = p.isQuest ? QUEST_COLOR : dayColor;

        const marker = new window.google!.maps!.Marker({
          position: p.resolved,
          map: mapRef.current,
          label: { text: String(p.positionInDay), color: '#0a0a1f', fontSize: '12px', fontWeight: '700' },
          icon: {
            path: window.google!.maps!.SymbolPath.CIRCLE,
            scale: p.isQuest ? 14 : 12,
            fillColor: color,
            fillOpacity: 0.95,
            strokeColor: '#0a0a1f',
            strokeWeight: p.isQuest ? 3 : 2,
          },
          title: `${p.dayLabel} · ${p.name}${p.isQuest ? ' · Monument Quest' : ''}`,
          zIndex: p.isQuest ? 100 : 10,
        });
        marker.addListener('click', () => {
          openPlaceCard(p);
        });
        // Register a handler so the in-itinerary number-circle click
        // can resolve to this exact marker. Pan first, then open.
        const handler = () => {
          if (mapRef.current && p.resolved) mapRef.current.panTo(p.resolved);
          openPlaceCard(p);
        };
        pinHandlersRef.current.set(normalizePinKey(p.name), handler);
        pinHandlersByDayPosRef.current.set(`${p.dayNumber}:${p.positionInDay}`, handler);
        markersRef.current.push(marker);
        bounds.extend(p.resolved);
      }

      // ── Per-day route lines ─────────────────────────────────────────
      // Walk the resolved pins by day, fetch a Mapbox Directions route
      // per consecutive leg, and draw a polyline colored by the day.
      // Skipped when activeFilter === a single day (we still draw lines
      // for that day) or when consecutive pins are missing geo. All
      // requests fan out in parallel so this doesn't block first paint.
      const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (MAPBOX_TOKEN) {
        const byDay = new Map<number, typeof resolved>();
        for (const p of resolved) {
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
            const mode: LegMode = dayPins[i].legModeToNext ?? 'walking';
            // Color the leg by mode within the day's hue: quest legs
            // get a gold tint, otherwise use the day color.
            const legColor = dayPins[i].isQuest || dayPins[i + 1].isQuest ? QUEST_COLOR : dayColor;
            const url =
              `https://api.mapbox.com/directions/v5/mapbox/${mode}/` +
              `${from.lng},${from.lat};${to.lng},${to.lat}` +
              `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
            legPromises.push(
              fetch(url)
                .then((r) => r.ok ? r.json() : null)
                .then((d: { routes?: Array<{ geometry: { coordinates: [number, number][] } }> } | null) => {
                  if (cancelled || !d?.routes?.[0] || !mapRef.current || !window.google?.maps) return;
                  const path = d.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
                  const line = new window.google.maps.Polyline({
                    path,
                    map: mapRef.current,
                    strokeColor: legColor,
                    strokeOpacity: 0.85,
                    strokeWeight: 4,
                    geodesic: false,
                    zIndex: 5,
                  });
                  polylinesRef.current.push(line);
                })
                .catch(() => { /* swallow individual leg failures */ }),
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
        flexDirection: 'column',
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchQuery.trim();
              const svc = placesServiceRef.current;
              if (!q || !svc || !mapRef.current) return;
              setSearching(true);
              svc.textSearch({ query: q }, (results, status) => {
                setSearching(false);
                if (status !== 'OK' || !results?.length) return;
                const first = results[0];
                if (!first.place_id || !first.geometry?.location) return;
                openPlaceFromPlaceId(first.place_id, first.name, {
                  lat: first.geometry.location.lat(),
                  lng: first.geometry.location.lng(),
                });
              });
            }}
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 40,
              display: 'flex', gap: 6,
              background: 'rgba(13,17,23,0.92)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: 4,
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              maxWidth: 'min(320px, calc(100% - 16px))',
            }}
          >
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search places, restaurants, sights…"
              style={{
                flex: 1, minWidth: 0,
                background: 'transparent', border: 'none', outline: 'none',
                color: '#e2e8f0', fontSize: 12, padding: '6px 8px',
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
        )}
        {recsEnabled && (
          <>
            <button
              type="button"
              onClick={toggleRecs}
              aria-expanded={recsOpen}
              style={{
                position: 'absolute', top: 8, left: 8, zIndex: 40,
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
                  top: 56, left: 8, zIndex: 40,
                  width: 'min(340px, calc(100% - 16px))',
                  maxHeight: 'calc(100% - 80px)',
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
            dayAssignment={activeFilter === 'all' ? null : activeFilter}
          />
        )}
        {/* Day-filter chips strip — top-centered, sits below the
            search/Find-recs row so all map controls cluster at the
            top of the map. */}
        {dayChips.length > 0 && (
          <div
            role="tablist"
            aria-label="Filter map by day"
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              top: 56,
              zIndex: 35,
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: 6,
              background: 'rgba(13,17,23,0.78)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              maxWidth: 'calc(100% - 24px)',
              boxShadow: '0 6px 22px rgba(0,0,0,0.35)',
              justifyContent: 'center',
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
                  onClick={() => setActiveFilter(d)}
                  style={chipStyle(activeFilter === d, color)}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />
                  Day {d} ({count})
                </button>
              );
            })}
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
      {onRegenerate && (
        <button
          type="button"
          onClick={pinChangeCount > 0 ? onRegenerate : undefined}
          disabled={pinChangeCount === 0}
          aria-label={pinChangeCount > 0
            ? `Regenerate itinerary — ${pinChangeCount} pin change${pinChangeCount === 1 ? '' : 's'} pending`
            : 'Itinerary in sync with pins'
          }
          style={{
            marginTop: 10, width: '100%',
            padding: '14px 18px', borderRadius: 12,
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
              width: 24, height: 24, borderRadius: '50%',
              background: pinChangeCount > 0 ? 'var(--brand-accent)' : 'rgba(255,255,255,0.06)',
              color: pinChangeCount > 0 ? 'var(--brand-bg)' : 'rgba(255,255,255,0.45)',
              fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
              fontSize: 11, fontWeight: 800,
            }}>
              {pinChangeCount > 0 ? pinChangeCount : '✓'}
            </span>
            <span style={{ textAlign: 'left' }}>
              <span style={{
                display: 'block',
                fontSize: 11, fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
                color: pinChangeCount > 0 ? 'var(--brand-accent)' : 'rgba(255,255,255,0.4)',
                marginBottom: 1,
              }}>
                {pinChangeCount > 0 ? '§ Pin changes detected' : '§ Itinerary in sync'}
              </span>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: 15, fontWeight: 400, letterSpacing: '-0.01em',
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

// Dark Mapbox-equivalent style for Google Maps. Pulled from Google's
// Snazzy Maps "Midnight Commander" preset, trimmed to essentials.
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
];
