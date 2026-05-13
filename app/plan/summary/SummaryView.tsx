'use client';

import Link from 'next/link';
import {
  Suspense, useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Design-faithful booking surface (Stays / Flights / Activities / Transport
// / Insurance with badge counts). The legacy BookTab.tsx remains in the
// codebase for reference; it'll be retired once BookView absorbs its data
// fetches. The shared BookTabProps shape from BookTab.tsx is what the page
// already passes — BookView accepts the same prop interface.
const BookTabDynamic = dynamic(() => import('./components/BookView'), { ssr: false });
const UpgradeModal   = dynamic(() => import('@/app/components/UpgradeModal'), { ssr: false });
import { track } from '@/lib/analytics';
import {
  parseLines, isTimeLine, groupLines, extractDayNumber, stripDayPrefix,
  type Section, type ActivityGroup,
} from './lib/itinerary-parse';
import { extractPlace, fetchPlaceImage, imgCache } from './lib/places';
import { RecPanel } from './RecPanel';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { PhotoToItinerary } from '@/app/plan/[tripId]/(tabs)/itinerary/PhotoToItinerary';
import { MarkdownLine, renderInline } from './components/MarkdownLine';
import { WeatherBar, type DayWeather } from './components/WeatherBar';
import { DayImages } from './components/DayImages';
import { PlaceImage } from './components/PlaceImage';
import { GenieCharacter } from './components/GenieCharacter';
import { EditableLine, type EditableLineProps } from './components/EditableLine';
import { ActivityBlock } from './components/ActivityBlock';
import { ChatPanel } from './components/ChatPanel';
import { SectionCard } from './components/SectionCard';
import type { EditTarget, RouteStop, ChatMessage } from './lib/types';
import { Sparkle } from '@/lib/icons';

// Unified trip map (one Google Map for all days, with day-filter chips).
// Lazy-loaded so the maps SDK doesn't ship until the itinerary tab opens.
const UnifiedTripMap = dynamic(() => import('./UnifiedTripMap'), { ssr: false });

const PlanningMapDynamic = dynamic(() => import('./PlanningMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 460, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
  ),
});

// ── Types ──────────────────────────────────────────────────────────────────────
// `Section` and `ActivityGroup` now live in lib/itinerary-parse.ts so the
// Live trip surface can reuse the same parser without pulling the summary
// client bundle.

// EditTarget, RouteStop, ChatMessage — moved to lib/types.ts (re-imported above).

// DayWeather — moved to components/WeatherBar.tsx (re-exported via the import above).

type BookmarkCategory = 'food' | 'activities' | 'hotels' | 'shopping' | 'other';
interface Bookmark {
  id: string;
  name: string;
  coords: [number, number]; // [lng, lat]
  category: BookmarkCategory;
  placeId?: string;
}

// Category palette used by the planning sidebar + map pin renderer.
// Colors are hand-tuned to read on the dark planning canvas.
const PLANNING_CATS: { key: BookmarkCategory; label: string; color: string }[] = [
  { key: 'food',       label: 'Food',       color: '#f97316' },
  { key: 'activities', label: 'Activities', color: '#a78bfa' },
  { key: 'hotels',     label: 'Hotels',     color: '#60a5fa' },
  { key: 'shopping',   label: 'Shopping',   color: '#fbbf24' },
  { key: 'other',      label: 'Monument',   color: '#94a3b8' },
];

// ── parseLines ─────────────────────────────────────────────────────────────────
// parseLines — moved to lib/itinerary-parse.ts

// renderInline, MarkdownLine — moved to components/MarkdownLine.tsx


// GenieCharacter — moved to components/GenieCharacter.tsx

// ── Chat panel — moved to components/ChatPanel.tsx ──
// (the inline definition that lived here has been removed; see import above.)
// ── Editable line ──────────────────────────────────────────────────────────────
// EditableLine — moved to components/EditableLine.tsx
// EditableLineProps re-exported there for ActivityBlock's prop signature.

// ── Day image strip ────────────────────────────────────────────────────────────
// DayImages — moved to components/DayImages.tsx

// ── Weather bar ────────────────────────────────────────────────────────────────
// WeatherBar, DayWeather — moved to components/WeatherBar.tsx

// isTimeLine, groupLines, ActivityGroup — moved to lib/itinerary-parse.ts

// ── Place extraction (module-level, shared by ActivityBlock + SectionCard) ─────
// extractPlace, imgCache, fetchPlaceImage — moved to lib/places.ts
// PlaceImage — moved to components/PlaceImage.tsx

// ActivityBlock — moved to components/ActivityBlock.tsx
// ── Main content ───────────────────────────────────────────────────────────────
// Accepts an optional `tripIdOverride` so the new tab route at
// /plan/[tripId]/itinerary can pass its path-based tripId in. The legacy
// /plan/summary route omits the prop and continues to read `?savedTripId=`
// from the URL, behavior unchanged.
export interface SummaryViewProps {
  tripIdOverride?: string;
  // The new tabbed routes pass this so the planning tab boots in
  // mainTab='planning' (pin destinations) and the itinerary tab boots
  // in mainTab='itinerary' (day cards), keeping URL semantics aligned
  // with what the user sees on first paint.
  initialMainTab?: 'planning' | 'itinerary' | 'book';
  // Whether to auto-fire /api/itinerary generation when the trip has
  // no saved itinerary yet. The planning tab passes false so users get
  // to curate pins before triggering generation manually. The itinerary
  // tab leaves it true (default) so deep-linking to itinerary on a
  // brand-new trip Just Works.
  autoGenerate?: boolean;
}

function SummaryContent({ tripIdOverride, initialMainTab, autoGenerate = true }: SummaryViewProps) {
  const params = useSearchParams();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768);
  }, []);

  // Fallback: when URL params are missing (e.g. an email link or a saved
  // bookmark that only carries ?savedTripId=…), we fill in from the loaded
  // trip below so the masthead and downstream logic still render properly.
  const [loadedTrip, setLoadedTrip] = useState<{
    location?: string;
    startDate?: string | null;
    endDate?: string | null;
    nights?: number | null;
    style?: string | null;
  } | null>(null);
  const stylePrefs = useMemo(() => {
    if (!loadedTrip?.style) return null;
    try {
      const parsed = JSON.parse(loadedTrip.style);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    } catch { /* not json */ }
    return { style: loadedTrip.style } as Record<string, string>;
  }, [loadedTrip]);

  const location    = params.get('location')    || loadedTrip?.location || '';
  const purpose     = params.get('purpose')     || stylePrefs?.purpose || '';
  const travelStyle = params.get('style')       || stylePrefs?.style || '';
  const budget      = params.get('budget')      || stylePrefs?.budget || '';
  const interests   = params.get('interests')   || stylePrefs?.interests || '';
  const constraints = params.get('constraints') || stylePrefs?.constraints || '';
  const startDate   = params.get('startDate')   || loadedTrip?.startDate || '';
  const endDate     = params.get('endDate')     || loadedTrip?.endDate || '';
  const nights        = params.get('nights')      || (loadedTrip?.nights ? String(loadedTrip.nights) : '');
  const stopsRaw      = params.get('stops')       ?? '';
  const travelingFrom = params.get('travelingFrom') ?? '';
  const travelingTo   = params.get('travelingTo')   ?? '';

  // ── Route / multi-stop ───────────────────────────────────────────────────────
  const parsedStops: RouteStop[] = useMemo(() => {
    try { return stopsRaw ? JSON.parse(stopsRaw) : []; } catch { return []; }
  }, [stopsRaw]);
  const allStops: RouteStop[] = useMemo(() => [
    { city: location, startDate, endDate },
    ...parsedStops,
  ], [location, startDate, endDate, parsedStops]);
  const isMultiStop = parsedStops.length > 0;

  // ── Saved trip DB state ───────────────────────────────────────────────────────
  const savedTripDbId  = tripIdOverride ?? params.get('savedTripId') ?? null;  // set when loaded from DB
  const [savedTripId,  setSavedTripId]  = useState<string | null>(savedTripDbId);
  const [saveState,    setSaveState]    = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveItineraryRef = useRef<(() => void) | null>(null);
  const loadedFromSave = useRef(!!savedTripDbId);

  // ── Weather state ─────────────────────────────────────────────────────────────
  const [weatherByCity,  setWeatherByCity]  = useState<Map<string, DayWeather[]>>(new Map());
  // Always start at 'C' on both server AND client so hydration matches.
  // Effect below upgrades to 'F' on US-timezone clients post-mount. The brief
  // flash of 'C' before 'F' is acceptable; previously this lazy initializer
  // ran on every render and caused a confirmed hydration mismatch warning
  // (caught via headless audit 2026-04-24).
  const [weatherUnit, setWeatherUnit] = useState<'C'|'F'>('C');
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Detroit|Boise|Juneau|Nome|Sitka|Yakutat|Metlakatla|Unalaska|Indiana|Kentucky|North_Dakota)|Pacific\/Honolulu)/.test(tz)) {
        setWeatherUnit('F');
      }
    } catch { /* ignore */ }
  }, []);
  const weatherFetchedRef = useRef(false);

  // ── Replan state ──────────────────────────────────────────────────────────────
  const [replanningSection, setReplanningSection] = useState<number | null>(null);

  // ── Streaming state ──────────────────────────────────────────────────────────
  const [lines, setLines]         = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false); // only true once user triggers generation
  const [itineraryRequested, setItineraryRequested] = useState(loadedFromSave.current);
  const [error, setError]         = useState('');
  // Tracks the true stage of the load/generate pipeline so the UI can show
  // what's actually happening instead of a single static "Crafting…" line.
  // Stages:
  //   loading-trip : GET /api/trips/<id> in flight
  //   requesting   : POST /api/itinerary sent, awaiting first byte
  //   streaming    : chunks arriving from the streaming response
  //   no-itinerary : trip exists but DB itinerary is empty (transient — we
  //                  auto-promote to `requesting` immediately)
  //   idle / done  : nothing in flight
  const [loadingStage, setLoadingStage] = useState<
    'idle' | 'loading-trip' | 'requesting' | 'streaming' | 'no-itinerary' | 'done'
  >(loadedFromSave.current ? 'loading-trip' : 'idle');
  const requestStartRef = useRef<number>(0);
  // Live wall-clock seconds since the active load began. Drives both the
  // "12s" suffix on the status line AND the slow-warning / retry CTA that
  // surfaces if a request hangs.
  const [elapsedSec, setElapsedSec] = useState(0);
  // Bumped to retrigger the generate-effect when the user clicks "Try again"
  // — useEffect deps need a reference change to re-run.
  const [retryNonce, setRetryNonce] = useState(0);
  // Visible toast surface for the auto-retry safety net so users notice
  // the system recovered for them. Auto-clears after 6 s so it doesn't
  // linger over the actual content.
  const [retryToast, setRetryToast] = useState<string | null>(null);
  useEffect(() => {
    if (!retryToast) return;
    const id = setTimeout(() => setRetryToast(null), 6000);
    return () => clearTimeout(id);
  }, [retryToast]);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature?: string; reason?: string }>({ open: false });
  const bufferRef = useRef('');
  const [inFlightTail, setInFlightTail] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // ── Interactive state ────────────────────────────────────────────────────────
  const [sections, setSections] = useState<Section[]>([]);

  // Confirm-before-clobber: if the user clicks Generate when an
  // itinerary already exists, surface a modal that offers either a
  // smart edit (free-text prompt → /api/agent/edit) or a full
  // regenerate. Avoids accidentally throwing away a curated trip.
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [smartEditPrompt, setSmartEditPrompt] = useState('');
  const [smartEditing, setSmartEditing] = useState(false);

  // Live status surfaced under the loading message during the dead-air
  // window before first itinerary text arrives. Server emits side-
  // channel "STATUS:..." lines as it geocodes, fetches weather, calls
  // tools, etc. Cleared between generation runs by startGeneration.
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue]   = useState('');

  // ── Genie state ──────────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen]           = useState(false);
  const [chatTab, setChatTab]             = useState<'genie' | 'friends'>('genie');
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]         = useState('');
  const [chatStreaming, setChatStreaming]  = useState(false);
  const [genieSpeak, setGenieSpeak]       = useState(false);
  const [geniePrefill, setGeniePrefill]   = useState('');
  const genieRef = useRef<HTMLDivElement>(null);

  // ── Inspiration image state ──────────────────────────────────────────────────
  const [inspImageFile,    setInspImageFile]    = useState<File | null>(null);
  const [inspImagePreview, setInspImagePreview] = useState('');
  const [inspIsVideo,      setInspIsVideo]      = useState(false);
  const inspFileRef = useRef<HTMLInputElement>(null);

  const handleInspFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const isVid = file.type.startsWith('video/');
    setInspIsVideo(isVid);
    if (isVid) {
      const videoEl = document.createElement('video');
      const objUrl  = URL.createObjectURL(file);
      videoEl.src = objUrl; videoEl.currentTime = 1; videoEl.muted = true; videoEl.playsInline = true;
      videoEl.onloadeddata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth || 640; canvas.height = videoEl.videoHeight || 360;
        canvas.getContext('2d')?.drawImage(videoEl, 0, 0);
        URL.revokeObjectURL(objUrl);
        canvas.toBlob(blob => {
          if (!blob) return;
          setInspImageFile(new File([blob], 'frame.jpg', { type: 'image/jpeg' }));
          setInspImagePreview(canvas.toDataURL('image/jpeg', 0.8));
        }, 'image/jpeg', 0.8);
      };
      videoEl.onerror = () => URL.revokeObjectURL(objUrl);
    } else {
      setInspImageFile(file);
      setInspImagePreview(URL.createObjectURL(file));
    }
  }, []);

  const clearInspImage = useCallback(() => {
    if (inspImagePreview && !inspImagePreview.startsWith('data:')) URL.revokeObjectURL(inspImagePreview);
    setInspImageFile(null); setInspImagePreview(''); setInspIsVideo(false);
  }, [inspImagePreview]);

  // ── Friends chat state ───────────────────────────────────────────────────────
  const [friendMessages, setFriendMessages] = useState<{id:string;author:string;content:string;timestamp:number}[]>([]);
  const [friendInput, setFriendInput]       = useState('');
  const [friendAuthor, setFriendAuthor]     = useState('');
  const friendPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Share / privacy state ────────────────────────────────────────────────────
  const [privacy, setPrivacy]       = useState<'public'|'friends'|'private'>('friends');
  const [shareOpen, setShareOpen]   = useState(false);
  const [copyDone, setCopyDone]     = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // Stable trip ID (hash of key params) — same trip always gets same ID
  const tripId = useMemo(() => {
    const raw = `${location}|${startDate}|${endDate}|${nights}|${travelStyle}`;
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = Math.imul(31, h) + raw.charCodeAt(i) | 0; }
    return Math.abs(h).toString(36);
  }, [location, startDate, endDate, nights, travelStyle]);

  // ── Planning tab ──────────────────────────────────────────────────────────────
  // Default to planning so users land on the map first and choose what to
  // include before generating an itinerary. Itinerary tab populates after the
  // planning tab's "Generate Itinerary" CTA fires.
  // Default mainTab in priority order:
  //   1. Explicit initialMainTab prop (new tabbed routes pass this)
  //   2. tripIdOverride present ⇒ user asked for itinerary semantically
  //   3. Otherwise 'planning' (legacy /plan/summary entry, pre-generate)
  const [mainTab, setMainTab]         = useState<'itinerary' | 'planning' | 'book'>(
    initialMainTab ?? (tripIdOverride ? 'itinerary' : 'planning')
  );
  const [bookmarks, setBookmarks]     = useState<Bookmark[]>([]);
  const [planningFilter, setPlanningFilter] = useState<'all' | BookmarkCategory>('all');
  // Pin-panel sub-tab toggle: Pins (existing) vs Recs (new). Recs no longer
  // sit in a giant rail at the top of the page — they're a quieter sub-tab
  // here, and clicking a rec opens it on the planning map via openPlace.
  const [panelTab, setPanelTab] = useState<'pins' | 'recs'>('pins');
  const [optimizingItinerary, setOptimizingItinerary] = useState(false);
  const [lastOptimized, setLastOptimized] = useState<Date | null>(null);
  const mapControlRef = useRef<{ panTo: (coords: [number, number]) => void; openPlace: (placeId: string, coords: [number, number]) => void } | null>(null);

  // Persist pins across refresh, keyed by destination so each trip has its
  // own pin set. Hydrate on mount / when location changes; save on every
  // bookmarks change (after hydration has run for the current key).
  const bookmarksKey = `geknee:bookmarks:${location || 'default'}`;
  // Pin-draft handoff: the globe → city Mapbox view writes to
  // geknee:pin-draft:<cityname-lowercase>. Pull those in as bookmarks the
  // first time the user lands on the planner for that city. Each draft
  // pin becomes a single 'other'-category bookmark, prefixed in the id so
  // we don't re-import the same pin if the user later removes it from the
  // planner.
  const draftKey = `geknee:pin-draft:${(location || '').toLowerCase()}`;
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(bookmarksKey);
      const parsed = raw ? (JSON.parse(raw) as Bookmark[]) : [];
      let next: Bookmark[] = Array.isArray(parsed) ? parsed : [];

      // Auto-import any pin-draft entries the user hasn't already declined.
      try {
        const draftRaw = window.localStorage.getItem(draftKey);
        if (draftRaw) {
          type Draft = { lat: number; lon: number; label?: string; addedAt: number };
          const drafts = JSON.parse(draftRaw) as Draft[];
          const seen = new Set(next.map(b => b.id));
          for (const d of drafts) {
            const id = `pin-draft:${d.lat.toFixed(5)}:${d.lon.toFixed(5)}`;
            if (seen.has(id)) continue;
            next = next.concat([{
              id,
              name: d.label || 'Pinned location',
              coords: [d.lon, d.lat],
              category: 'other',
            }]);
          }
        }
      } catch { /* ignore handoff failures — bookmarks still load */ }

      setBookmarks(next);
    } catch {
      setBookmarks([]);
    }
    hydratedKeyRef.current = bookmarksKey;
  }, [bookmarksKey, draftKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedKeyRef.current !== bookmarksKey) return;
    try {
      window.localStorage.setItem(bookmarksKey, JSON.stringify(bookmarks));
    } catch {
      // Quota exceeded or storage disabled — fail silently rather than crash.
    }
  }, [bookmarks, bookmarksKey]);

  // ── Auto-retry safety net ───────────────────────────────────────────────────
  // If the page sits in a load/generate state for 90 s without any chunks
  // arriving, kick off one automatic retry. Catches transient upstream
  // hiccups (Anthropic/OpenAI gateway blips, dropped connections) without
  // requiring the user to find and click the "Try again" button. Strictly
  // ONE auto-retry per page lifetime — a stuck-after-retry state still
  // surfaces the manual button and stops trying so we don't loop.
  const autoRetriedRef = useRef(false);
  useEffect(() => {
    if (autoRetriedRef.current) return;
    if (elapsedSec < 90) return;
    if (lines.length > 0) return; // chunks are arriving, not stuck
    if (loadingStage !== 'requesting' && loadingStage !== 'no-itinerary' && loadingStage !== 'streaming') return;
    autoRetriedRef.current = true;
    console.warn('[itinerary] auto-retrying after', elapsedSec, 's stuck at stage:', loadingStage);
    setRetryToast('Connection looked stuck — retrying automatically.');
    loadedFromSave.current = false;
    setItineraryRequested(true);
    setStreaming(true);
    setLines([]);
    setSections([]);
    setError('');
    setLoadingStage('requesting');
    requestStartRef.current = Date.now();
    setRetryNonce(n => n + 1);
  }, [elapsedSec, loadingStage, lines.length]);

  // ── Elapsed-time tick — drives status line + slow-warning / retry CTA ───────
  useEffect(() => {
    const isActive =
      loadingStage === 'loading-trip' ||
      loadingStage === 'no-itinerary' ||
      loadingStage === 'requesting' ||
      loadingStage === 'streaming';
    if (!isActive) {
      setElapsedSec(0);
      requestStartRef.current = 0;
      return;
    }
    // Anchor the start time on the first active tick. Keep it across
    // intra-flow transitions (loading-trip → requesting → streaming) so
    // the seconds counter doesn't reset mid-load.
    if (!requestStartRef.current) requestStartRef.current = Date.now();
    const tick = () => setElapsedSec(Math.floor((Date.now() - requestStartRef.current) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loadingStage]);

  // ── Load itinerary from saved trip (if ?savedTripId= param present) ──────────
  useEffect(() => {
    if (!savedTripDbId) return;
    let cancelled = false;
    setLoadingStage('loading-trip');
    fetch(`/api/trips/${savedTripDbId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d.trip) return;
        // Seed the fallback so the masthead can render even when URL params
        // are absent (email links, bookmarks, deep-links).
        setLoadedTrip({
          location:  d.trip.location  ?? '',
          startDate: d.trip.startDate ?? null,
          endDate:   d.trip.endDate   ?? null,
          nights:    d.trip.nights    ?? null,
          style:     d.trip.style     ?? null,
        });
        if (d.trip.itinerary) {
          const parsed = parseLines(d.trip.itinerary.split('\n'));
          setSections(parsed);
          setStreaming(false);
          setLoadingStage('done');
        } else if (autoGenerate) {
          // Trip exists but no itinerary saved yet (e.g. just-created
          // trip routed in via savedTripId) AND the caller wants
          // generation to fire automatically (itinerary tab).
          // Reset loadedFromSave so the generate-effect's early-return
          // is bypassed, bump retryNonce so the effect's deps actually
          // change (itineraryRequested is true at mount, so a plain
          // setItineraryRequested(true) would be a React no-op).
          loadedFromSave.current = false;
          setItineraryRequested(true);
          setStreaming(true);
          setLines([]);
          setSections([]);
          setLoadingStage('no-itinerary');
          setRetryNonce(n => n + 1);
        } else {
          // Planning tab: trip has no itinerary yet, but user is here
          // to curate pins first. Don't auto-fire generation; clear
          // loading state and let the explicit "Generate Itinerary"
          // button in the planning surface drive things.
          loadedFromSave.current = false;
          setStreaming(false);
          setLoadingStage('idle');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load saved itinerary.');
          setLoadingStage('idle');
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTripDbId]);

  // ── Fetch itinerary ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!itineraryRequested) return; // wait until user clicks "Generate"
    if (loadedFromSave.current) return; // skip — loading from DB instead
    let cancelled = false;
    setLoadingStage('requesting');
    requestStartRef.current = Date.now();
    async function fetch_() {
      try {
        const mustVisit = bookmarks.map(b => ({ name: b.name, category: b.category }));

        // Build the monument-quest payload by name-matching destination
        // and bookmarks against info.ts, then pulling the top quests
        // for any matched monument from the quests engine. The AI uses
        // these to integrate quest objectives into the activity for
        // that monument, prefixing the line with [MONUMENT QUEST].
        const { findMonumentKey } = await import('./lib/monument-match');
        const { getQuests } = await import('@/app/plan/location/globe/quests');
        type MonumentQuestPayload = { name: string; quests: string[] };
        const monumentQuests: MonumentQuestPayload[] = [];
        const seenMonumentKeys = new Set<string>();
        const tryAdd = (name: string) => {
          const key = findMonumentKey(name);
          if (!key || seenMonumentKeys.has(key)) return;
          seenMonumentKeys.add(key);
          const quests = getQuests(key).slice(0, 3).map(q => q.label);
          if (quests.length > 0) monumentQuests.push({ name, quests });
        };
        tryAdd(location);
        for (const v of mustVisit) tryAdd(v.name);
        // Read language preference from localStorage
        let userLang = 'en';
        try { userLang = JSON.parse(localStorage.getItem('geknee_settings') ?? '{}').language ?? 'en'; } catch { /* ignore */ }
        // Detect user's home currency from browser locale so the AI can
        // include their currency next to local prices ("₹650 (~£6.30)").
        const LOCALE_TO_CURRENCY: Record<string, string> = {
          'en-US': 'USD', 'en-GB': 'GBP', 'en-CA': 'CAD', 'en-AU': 'AUD',
          'en-NZ': 'NZD', 'en-IN': 'INR', 'en-IE': 'EUR', 'en-ZA': 'ZAR',
          'ja': 'JPY', 'ja-JP': 'JPY',
          'zh': 'CNY', 'zh-CN': 'CNY', 'zh-TW': 'TWD', 'zh-HK': 'HKD',
          'ko': 'KRW', 'ko-KR': 'KRW',
          'hi': 'INR', 'hi-IN': 'INR',
          'es': 'EUR', 'es-ES': 'EUR', 'es-MX': 'MXN', 'es-AR': 'ARS',
          'pt': 'EUR', 'pt-BR': 'BRL', 'pt-PT': 'EUR',
          'fr': 'EUR', 'fr-FR': 'EUR', 'fr-CA': 'CAD',
          'de': 'EUR', 'de-DE': 'EUR', 'de-CH': 'CHF',
          'it': 'EUR', 'nl': 'EUR', 'sv': 'SEK', 'no': 'NOK', 'da': 'DKK',
          'pl': 'PLN', 'tr': 'TRY', 'ru': 'RUB',
          'ar': 'AED', 'th': 'THB', 'id': 'IDR', 'ms': 'MYR', 'vi': 'VND',
        };
        const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
        const userCurrency =
          LOCALE_TO_CURRENCY[lang]
          ?? LOCALE_TO_CURRENCY[lang.split('-')[0]]
          ?? 'USD';
        const res = await fetch('/api/itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location, purpose, style: travelStyle, budget,
            interests, constraints, startDate, endDate, nights,
            stops: stopsRaw ? JSON.parse(stopsRaw) : undefined,
            mustVisit: mustVisit.length > 0 ? mustVisit : undefined,
            monumentQuests: monumentQuests.length > 0 ? monumentQuests : undefined,
            language: userLang !== 'en' ? userLang : undefined,
            currency: userCurrency,
            // Server-side persistence: with tripId set, the API saves
            // the accumulated itinerary to TripDraft.itinerary on
            // completion, so disconnects/navigates don't lose work.
            tripId: savedTripId ?? undefined,
          }),
        });
        if (!res.ok || !res.body) {
          if (res.status === 403) {
            const data = await res.json().catch(() => ({}));
            if (data.code === 'GENERATION_LIMIT') {
              track('upgrade_click', { surface: 'ai_limit', feature: 'generations' }); setUpgradeModal({ open: true, feature: 'Unlimited geknee agent generations', reason: data.error });
              setStreaming(false);
              setLoadingStage('idle');
              return;
            }
          }
          setError('Failed to generate itinerary. Check your API key and try again.');
          setStreaming(false);
          setLoadingStage('idle');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let firstChunk = true;
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (firstChunk) {
            // First byte from the AI — flip to "streaming" so the UI swaps
            // from "Reaching the AI…" to live progress messaging.
            setLoadingStage('streaming');
            firstChunk = false;
          }
          bufferRef.current += decoder.decode(value, { stream: true });
          const all = bufferRef.current.split('\n');
          bufferRef.current = all.pop() ?? '';
          // Pull status side-channel lines (zero-width space + sparkle +
          // "STATUS:") out before they hit the itinerary content. They
          // drive the live "Looking up Paris…" status under the loading
          // message so the dead-air window before first text isn't
          // silent.
          const STATUS_PREFIX = '​✨STATUS:';
          const visible: string[] = [];
          for (const line of all) {
            if (line.startsWith(STATUS_PREFIX)) {
              setCurrentStatus(line.slice(STATUS_PREFIX.length).trim());
            } else {
              visible.push(line);
            }
          }
          if (visible.length) setLines(prev => [...prev, ...visible]);
          // Surface the unfinished trailing line so users see Anthropic's
          // tokens arrive char-by-char instead of waiting for the next \n.
          setInFlightTail(bufferRef.current);
        }
        if (bufferRef.current) {
          setLines(prev => [...prev, bufferRef.current]);
          bufferRef.current = '';
        }
        setInFlightTail('');
      } catch {
        if (!cancelled) {
          setError('Network error. Please try again.');
          setLoadingStage('idle');
        }
      } finally {
        if (!cancelled) {
          setStreaming(false);
          setLoadingStage(prev => (prev === 'streaming' ? 'done' : prev));
        }
      }
    }
    fetch_();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryRequested, retryNonce]);


  // ── Section-boundary detection — count ## headings to know when to commit ────
  //    Only re-parse & update sections when a new ## heading appears OR streaming
  //    ends. This avoids re-rendering every SectionCard on every streamed line.
  const headingCount = useMemo(
    () => lines.filter(l =>
      l.startsWith('## ') ||
      l.startsWith('### ') ||
      /^\*\*(Day\s+\d+[^*]*)\*\*\s*:?\s*$/i.test(l.trim())
    ).length,
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) return;
    const parsed = parseLines(lines);
    if (!streaming) {
      setSections(parsed);
    } else {
      setSections(parsed.length > 1 ? parsed.slice(0, -1) : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headingCount, streaming]);

  // ── Live streaming text — derived cheaply without re-parsing entire tree ─────
  //    These update on every line but only drive the lightweight raw text box.
  const streamingHeading = useMemo((): string | null => {
    if (!streaming) return null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('## ')) return lines[i].slice(3).trim();
    }
    return null;
  }, [lines, streaming]);

  const streamingLines = useMemo((): string[] => {
    if (!streaming) return [];
    let lastIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('## ')) { lastIdx = i; break; }
    }
    return lastIdx >= 0 ? lines.slice(lastIdx + 1) : lines;
  }, [lines, streaming]);

  // ── Track user scroll intent ──────────────────────────────────────────────────
  useEffect(() => {
    function onScroll() {
      const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
      userScrolledRef.current = !nearBottom;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Auto-scroll during streaming (only if user hasn't scrolled up) ────────────
  useEffect(() => {
    if (streaming && !userScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, streaming]);

  // ── Close chat on outside click ──────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (genieRef.current && !genieRef.current.contains(e.target as Node)) {
        setChatOpen(false);
      }
    }
    if (chatOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [chatOpen]);

  // ── Consume geniePrefill ─────────────────────────────────────────────────────
  useEffect(() => {
    if (geniePrefill) {
      setChatOpen(true);
      setChatTab('genie');
      setChatInput(geniePrefill);
      setGeniePrefill('');
    }
  }, [geniePrefill]);

  // ── Share dropdown outside click ─────────────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    }
    if (shareOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [shareOpen]);

  // ── Load privacy from localStorage ───────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(`geknee_privacy_${tripId}`);
    if (saved === 'public' || saved === 'friends' || saved === 'private') setPrivacy(saved);
  }, [tripId]);

  // ── Friends chat — poll for new messages ─────────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch(`/api/trip-messages?tripId=${tripId}`);
        const d = await r.json() as { messages: typeof friendMessages };
        setFriendMessages(d.messages);
      } catch {}
    }
    poll();
    if (chatOpen && chatTab === 'friends') {
      friendPollRef.current = setInterval(poll, 3000);
    }
    return () => { if (friendPollRef.current) clearInterval(friendPollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatTab, tripId]);

  // ── Friends chat — send ───────────────────────────────────────────────────────
  const sendFriendMessage = useCallback(async () => {
    const content = friendInput.trim();
    const author  = friendAuthor.trim() || 'You';
    if (!content) return;
    setFriendInput('');
    try {
      const r = await fetch(`/api/trip-messages?tripId=${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content }),
      });
      const d = await r.json() as { ok: boolean; message: typeof friendMessages[0] };
      if (d.ok) setFriendMessages(prev => [...prev, d.message]);
    } catch {}
  }, [friendInput, friendAuthor, tripId]);

  // ── Fetch weather for each stop once streaming ends ───────────────────────────
  useEffect(() => {
    if (streaming || weatherFetchedRef.current || allStops.length === 0) return;
    weatherFetchedRef.current = true;
    for (const stop of allStops) {
      // Guard against stops with no city — was hitting /api/weather?city= and
      // burning a 400 per missing-city stop. Found via headless audit.
      if (!stop.city || !stop.city.trim()) continue;
      // Pass the trip's per-stop dates so the API can switch to climate
      // normals (3-year averages) when the trip is more than 14 days
      // out or in the past — gives users a real "what's it usually
      // like?" answer instead of "Weather unavailable".
      const params = new URLSearchParams({ city: stop.city });
      if (stop.startDate) params.set('start', stop.startDate);
      if (stop.endDate)   params.set('end',   stop.endDate);
      fetch(`/api/weather?${params}`)
        .then(r => r.json())
        .then(d => {
          if (d.days) setWeatherByCity(prev => new Map(prev).set(stop.city, d.days));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // ── Full itinerary string for chat context ────────────────────────────────────
  const fullItinerary = useMemo(() => {
    if (sections.length > 0) {
      return sections.map(s => {
        const h = s.heading ? `## ${s.heading}\n` : '';
        return h + s.lines.join('\n');
      }).join('\n\n');
    }
    return lines.join('\n');
  }, [sections, lines]);

  // ── Edit handlers ────────────────────────────────────────────────────────────
  const handleStartEdit = useCallback((sectionIdx: number, lineIdx: number, current: string) => {
    setEditTarget({ sectionIdx, lineIdx });
    setEditValue(current);
  }, []);

  const handleCommit = useCallback(() => {
    if (!editTarget) return;
    setSections(prev => prev.map((s, si) =>
      si !== editTarget.sectionIdx ? s : {
        ...s,
        lines: s.lines.map((l, li) => li !== editTarget.lineIdx ? l : editValue),
      }
    ));
    setEditTarget(null);
    setEditValue('');
    // Debounced auto-save (only if trip was already saved to DB)
    if (savedTripId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveItineraryRef.current?.(), 2000);
    }
  }, [editTarget, editValue, savedTripId]);

  const handleCancel = useCallback(() => {
    setEditTarget(null);
    setEditValue('');
  }, []);

  function formatDate(d: string) {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  // ── Save itinerary to DB ──────────────────────────────────────────────────────
  const saveItinerary = useCallback(async () => {
    if (!fullItinerary) return;
    setSaveState('saving');
    try {
      if (!savedTripId) {
        const r = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${location}${startDate ? ' \u2013 ' + formatDate(startDate) : ''}`,
            location, startDate, endDate,
            nights: nights ? parseInt(nights) : null,
            style: JSON.stringify({ purpose, style: travelStyle, budget, interests, constraints }),
            itinerary: fullItinerary,
          }),
        });
        const d = await r.json();
        if (d.trip?.id) setSavedTripId(d.trip.id);
      } else {
        await fetch(`/api/trips/${savedTripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itinerary: fullItinerary }),
        });
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [fullItinerary, savedTripId, location, startDate, endDate, nights, purpose, travelStyle, budget, interests, constraints]);

  // Keep ref current so handleCommit debounce can call latest version
  useEffect(() => { saveItineraryRef.current = saveItinerary; }, [saveItinerary]);

  // ── Replan a section with AI ──────────────────────────────────────────────────
  const handleReplan = useCallback(async (sectionIdx: number) => {
    const section = sections[sectionIdx];
    if (!section || replanningSection !== null) return;
    setReplanningSection(sectionIdx);
    const sectionText = `## ${section.heading}\n${section.lines.join('\n')}`;
    try {
      const res = await fetch('/api/itinerary/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: sectionText,
          itinerary: fullItinerary,
          tripInfo: { location, nights, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = parseLines(acc.split('\n'));
        if (parsed.length > 0) {
          setSections(prev => prev.map((s, i) =>
            i !== sectionIdx ? s : { ...s, lines: parsed[0].lines }
          ));
        }
      }
    } catch {}
    finally { setReplanningSection(null); }
  }, [sections, replanningSection, fullItinerary, location, nights, purpose, travelStyle, budget]);

  const handleAskGenie = useCallback((rawLine: string) => {
    const clean = rawLine.replace(/\*\*/g, '').replace(/^[-*]\s/, '').replace(/^#+\s/, '').trim();
    setGeniePrefill(`Suggest 3 alternatives for: "${clean}"`);
  }, []);

  const handleOptimizeItinerary = useCallback(async () => {
    if (bookmarks.length === 0 || optimizingItinerary) return;
    setOptimizingItinerary(true);
    setMainTab('itinerary');
    try {
      const res = await fetch('/api/itinerary/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary: fullItinerary,
          bookmarks: bookmarks.map(b => ({ name: b.name, coords: b.coords })),
          tripInfo: { location, nights, startDate, endDate, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const parsed = parseLines(acc.split('\n'));
        if (parsed.length > 0) setSections(parsed);
      }
      setBookmarks([]);
      setLastOptimized(new Date());
    } catch { /* silent — itinerary stays as-is */ }
    finally { setOptimizingItinerary(false); }
  }, [bookmarks, optimizingItinerary, fullItinerary, location, nights, startDate, endDate, purpose, travelStyle, budget]);

  // ── Chat send ────────────────────────────────────────────────────────────────
  const GENIE_MSG_LIMIT = 15;
  const sendChat = useCallback(async () => {
    if ((!chatInput.trim() && !inspImageFile) || chatStreaming) return;

    // ── Image inspiration flow ──
    if (inspImageFile) {
      const caption = chatInput.trim() || 'How does this relate to my trip? What should I add or change?';
      setChatMessages(prev => [...prev,
        { role: 'user', content: `${String.fromCodePoint(0x1F4F8)} ${caption}` },
        { role: 'assistant', content: '' },
      ]);
      setChatInput(''); clearInspImage(); setChatStreaming(true); setGenieSpeak(true);
      try {
        const form = new FormData();
        form.append('image', inspImageFile);
        form.append('prompt', caption);
        const res = await fetch('/api/inspiration', { method: 'POST', body: form });
        if (!res.body) throw new Error('no body');
        const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = '';
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          acc += dec.decode(value, { stream: true });
          setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: acc }]);
        }
      } catch {
        setChatMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'Could not analyze the image. Please try again.' }]);
      } finally { setChatStreaming(false); setGenieSpeak(false); }
      return;
    }

    if (!chatInput.trim() || chatStreaming) return;
    const userCount = chatMessages.filter(m => m.role === 'user').length;
    if (userCount >= GENIE_MSG_LIMIT) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `You\u2019ve reached the ${GENIE_MSG_LIMIT}-message limit for this trip session. Start a new trip to keep chatting! \u2728`,
      }]);
      setChatInput('');
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const next = [...chatMessages, userMsg];
    setChatMessages([...next, { role: 'assistant', content: '' }]);
    setChatInput('');
    setChatStreaming(true);
    setGenieSpeak(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          itinerary: fullItinerary,
          tripInfo: { location, nights, purpose, style: travelStyle, budget },
        }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setChatMessages(prev => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: acc },
        ]);
      }
    } catch {
      setChatMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'My magic fizzled! Please try again.' },
      ]);
    } finally {
      setChatStreaming(false);
      setGenieSpeak(false);
    }
  }, [chatInput, chatStreaming, chatMessages, fullItinerary, location, nights, purpose, travelStyle, budget]);

  const showGenie = !streaming || lines.length > 8;
  const STAR = String.fromCodePoint(0x2726);

  // ── Generate / smart-edit handlers ─────────────────────────────────────────
  // Both legacy "Generate" buttons used the same 7-line block. Hoisting
  // it once keeps them in sync and lets the regen-confirm modal reuse
  // the exact same behavior on "Generate from scratch".
  function startGeneration() {
    loadedFromSave.current = false;
    setItineraryRequested(true);
    setStreaming(true);
    setLines([]);
    setSections([]);
    setError('');
    setCurrentStatus(null);
    setMainTab('itinerary');
    setLoadingStage('requesting');
    requestStartRef.current = Date.now();
  }

  function requestGeneration() {
    // If an itinerary already exists, ask whether the user wants a
    // surgical edit (cheap, fast) or a full regen (expensive, throws
    // the curated trip away). Without this, an accidental click here
    // wipes the planned trip.
    if (sections.length > 0 || (savedTripId && lines.length > 0)) {
      setSmartEditPrompt('');
      setRegenConfirmOpen(true);
      return;
    }
    startGeneration();
  }

  async function applySmartEdit(prompt: string) {
    if (!savedTripId || !prompt.trim() || smartEditing) return;
    setSmartEditing(true);
    setRegenConfirmOpen(false);
    setStreaming(true);
    setLines([]);
    setSections([]);
    setError('');
    setMainTab('itinerary');
    setLoadingStage('streaming');
    requestStartRef.current = Date.now();

    try {
      const res = await fetch('/api/agent/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: savedTripId, prompt }),
      });
      if (!res.ok || !res.body) {
        setError('Smart edit failed. Try again or pick "Generate from scratch".');
        setStreaming(false);
        setLoadingStage('idle');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        // Drain whole SSE blocks (separated by \n\n). Leave any partial
        // tail in `raw` for the next iteration.
        const blocks = raw.split('\n\n');
        raw = blocks.pop() ?? '';
        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(6)) as { type?: string; delta?: string };
            if (ev.type === 'text' && typeof ev.delta === 'string') {
              accumulated += ev.delta;
              setLines(accumulated.split('\n'));
            }
          } catch { /* ignore non-JSON keepalives */ }
        }
      }

      const parsed = parseLines(accumulated.split('\n'));
      setSections(parsed);
      setStreaming(false);
      setLoadingStage('done');

      // Persist the edited itinerary back to the trip row so reloads
      // pick it up. Best-effort; UI already shows the new content.
      try {
        await fetch(`/api/trips/${savedTripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itinerary: accumulated }),
        });
      } catch { /* swallow */ }
    } catch {
      setError('Smart edit failed.');
      setStreaming(false);
      setLoadingStage('idle');
    } finally {
      setSmartEditing(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100vh', background: '#060816' }}>
      <UpgradeModal
        open={upgradeModal.open}
        feature={upgradeModal.feature}
        reason={upgradeModal.reason}
        onClose={() => setUpgradeModal({ open: false })}
      />

      {/* Regen-confirm modal — fires when the user clicks Generate on a
          trip that already has an itinerary. Two paths: smart edit
          (surgical, ~$0.02) or full regenerate (current behavior, ~$0.05). */}
      {regenConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setRegenConfirmOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(6,8,22,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(13,13,36,0.96)',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 480, width: '100%',
              fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
              color: '#e2e8f0',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: 11, color: '#a8a8c0', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
              You already have an itinerary
            </div>
            <div style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontSize: 18, marginBottom: 14, lineHeight: 1.3 }}>
              Tweak it, or start over from scratch?
            </div>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
              For small changes (swap a restaurant, move an activity), describe what you want and we&apos;ll edit only that part. For a fundamentally different trip, regenerate.
            </p>
            <textarea
              value={smartEditPrompt}
              onChange={(e) => setSmartEditPrompt(e.target.value)}
              placeholder="e.g. swap the Day 3 dinner for a sushi spot · add a museum on Day 1 · make Day 2 less packed"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(167,139,250,0.25)',
                borderRadius: 10, padding: '10px 12px',
                color: '#fff', fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', minHeight: 60, marginBottom: 14,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setRegenConfirmOpen(false)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#a8a8c0', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setRegenConfirmOpen(false); startGeneration(); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid rgba(167,139,250,0.4)',
                  color: '#c7d2fe', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                }}
              >
                Regenerate
              </button>
              <button
                onClick={() => applySmartEdit(smartEditPrompt)}
                disabled={!smartEditPrompt.trim() || smartEditing}
                style={{
                  flex: 2, padding: '9px 0', borderRadius: 10,
                  background: smartEditPrompt.trim() ? 'linear-gradient(135deg,#a78bfa,#7dd3fc)' : 'rgba(167,139,250,0.2)',
                  border: 'none',
                  color: smartEditPrompt.trim() ? '#0a0a1f' : '#6b6b85',
                  cursor: smartEditPrompt.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                {smartEditing ? 'Editing…' : 'Apply edit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-retry toast — surfaces when the safety net detects a stuck
          load and kicks a retry. Auto-clears after 6 s. Sits top-center so
          it doesn't fight with the masthead or sidebars. */}
      {retryToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 10,
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.35)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: 'var(--brand-accent, #38bdf8)',
            fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            animation: 'retryToastIn 240ms ease-out',
          }}
        >
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1.4s ease-in-out infinite' }} />
          {retryToast}
        </div>
      )}

      {/* Background gradient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 40% 20%, rgba(30,70,200,0.35) 0%, rgba(6,8,22,0.96) 60%, #030510 100%)',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: mainTab === 'planning' ? '100%' : 1720,
        margin: '0 auto',
        padding: isMobile
          ? '16px 14px 120px'
          : (mainTab === 'planning' ? '20px 24px 60px' : '36px 40px 140px'),
      }}>

        {/* Top nav — design handoff: ← Plan left, trip · N days center label,
            Share / Book on the right. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24, gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            {/* "← Back to globe" / "← Plan" masthead link removed — the
                tabs layout above already exposes a persistent
                "Back to globe" pill, no need to repeat it here. */}
            <span style={{
              fontFamily: 'var(--font-display), Georgia, serif',
              fontSize: 16, color: 'var(--brand-ink)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {location || 'Trip'}
              {mainTab === 'planning'
                ? <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)', marginLeft: 8 }}>· plan your stops</em>
                : (nights ? ` · ${nights} day${nights === '1' ? '' : 's'}` : '')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Compact photo attacher — sits in the empty space next to the
                "plan your stops" title. Only renders on the planning tab,
                only when an itinerary already exists (pre-generation, a
                photo→activity has nowhere to land). Click → modal picker. */}
            {mainTab === 'planning' && savedTripId && fullItinerary && nights && (
              <PhotoToItinerary
                tripId={savedTripId}
                dayCount={(parseInt(nights, 10) || 0) + 1}
                compact
              />
            )}
            {/* Map / Share / Book hidden on planning tab — that view's CTA is the
                top-right "Generate itinerary →" button below. */}
            {mainTab !== 'planning' && savedTripId && (
              <Link
                href={`/plan/${encodeURIComponent(savedTripId)}/map`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--brand-border)',
                  color: 'var(--brand-ink)', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', textDecoration: 'none',
                }}
              >
                {String.fromCodePoint(0x2315)} Map
              </Link>
            )}
            {mainTab !== 'planning' && (
              <button
                onClick={async () => {
                  if (typeof navigator !== 'undefined' && navigator.share) {
                    try { await navigator.share({ title: `Trip to ${location}`, url: window.location.href }); } catch { /* dismissed */ }
                  } else {
                    try { await navigator.clipboard.writeText(window.location.href); } catch {}
                  }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--brand-border)',
                  color: 'var(--brand-ink)', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {String.fromCodePoint(0x2197)} Share
              </button>
            )}
            {mainTab !== 'planning' && (
              <button
                onClick={() => setMainTab(mainTab === 'book' ? 'itinerary' : 'book')}
                style={{
                  padding: '7px 14px', borderRadius: 10,
                  background: mainTab === 'book' ? 'transparent' : 'var(--brand-ink)',
                  color: mainTab === 'book' ? 'var(--brand-ink)' : 'var(--brand-bg)',
                  border: `1px solid ${mainTab === 'book' ? 'var(--brand-border)' : 'var(--brand-ink)'}`,
                  fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                {mainTab === 'book' ? 'Itinerary' : 'Book'}
              </button>
            )}
            {mainTab === 'planning' && (
              <button
                onClick={requestGeneration}
                style={{
                  padding: '8px 16px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 100%)',
                  color: '#0a0f1e', border: 'none',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(167,139,250,0.35)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                Generate itinerary {String.fromCodePoint(0x2192)}
              </button>
            )}
          </div>
        </div>

        {/* Trip header \u2014 hidden on planning tab so the map gets the
            full canvas; the compact top bar above is enough context. */}
        {mainTab !== 'planning' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          borderRadius: 20,
          padding: isMobile ? '20px 18px' : '32px 32px 28px',
          marginBottom: 28,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--brand-accent-2)',
            marginBottom: 12,
          }}>
            {String.fromCodePoint(0x00A7)} ITINERARY{startDate ? ` \u00b7 ${formatDate(startDate).toUpperCase()}` : ''}{endDate ? ` \u2192 ${formatDate(endDate).toUpperCase()}` : ''}
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: isMobile ? 'clamp(32px, 8vw, 44px)' : 'clamp(40px, 5vw, 56px)',
            fontWeight: 400,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            margin: 0,
            color: 'var(--brand-ink)',
          }}>
            <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>{location}</em>
          </h1>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            marginTop: 14,
            color: 'var(--brand-ink-dim)',
            fontSize: 12,
          }}>
            {[
              startDate && nights && `${nights} night${nights === '1' ? '' : 's'}`,
              purpose && purpose.charAt(0).toUpperCase() + purpose.slice(1),
              travelStyle && travelStyle.charAt(0).toUpperCase() + travelStyle.slice(1),
              budget,
            ].filter(Boolean).map((tag, i, arr) => (
              <span key={i}>{tag}{i < arr.length - 1 ? ' \u00b7' : ''}</span>
            ))}
          </div>

          {/* Legacy weather toggle + privacy/invite row hidden during the
              design pass. The top-bar Share button now covers invite, and
              weather defaults to the user's locale unit (US-timezone clients
              get °F via the existing useEffect, others stay on °C). */}
          {false && (
          <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['C', 'F'] as const).map(u => (
              <button key={u} onClick={() => setWeatherUnit(u)} style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                border: `1px solid ${weatherUnit === u ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background: weatherUnit === u ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: weatherUnit === u ? '#38bdf8' : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
              }}>&deg;{u}</button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>

            {/* Privacy selector */}
            {(['public','friends','private'] as const).map(p => (
              <button key={p} onClick={() => {
                setPrivacy(p);
                localStorage.setItem(`geknee_privacy_${tripId}`, p);
              }} style={{
                padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                border: `1px solid ${privacy === p ? 'rgba(167,139,250,0.6)' : 'rgba(255,255,255,0.12)'}`,
                background: privacy === p ? 'rgba(167,139,250,0.15)' : 'transparent',
                color: privacy === p ? '#c4b5fd' : 'rgba(255,255,255,0.4)',
                cursor: 'pointer', textTransform: 'capitalize',
              }}>
                {p === 'public' ? String.fromCodePoint(0x1F310) : p === 'friends' ? String.fromCodePoint(0x1F465) : String.fromCodePoint(0x1F512)} {p}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            {/* Invite / share dropdown */}
            <div ref={shareRef} style={{ position: 'relative' }}>
              <button onClick={() => setShareOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8', cursor: 'pointer',
              }}>
                {String.fromCodePoint(0x1F517)} Invite friends
              </button>
              {shareOpen && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 40,
                  width: 300, background: 'rgba(6,8,22,0.97)', backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(56,189,248,0.25)', borderRadius: 14,
                  padding: '16px', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                  animation: 'chatSlideUp 0.18s ease-out',
                }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 10, letterSpacing: 0.3 }}>
                    SHARE THIS ITINERARY
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      readOnly
                      value={typeof window !== 'undefined' ? window.location.href : ''}
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: 'rgba(255,255,255,0.6)',
                        fontSize: 11, padding: '7px 10px', outline: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    />
                    <button onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      setCopyDone(true);
                      setTimeout(() => setCopyDone(false), 2000);
                    }} style={{
                      padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: copyDone ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.15)',
                      border: `1px solid ${copyDone ? 'rgba(34,197,94,0.4)' : 'rgba(56,189,248,0.3)'}`,
                      color: copyDone ? '#86efac' : '#38bdf8', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                      {copyDone ? String.fromCodePoint(0x2713) + ' Copied' : 'Copy'}
                    </button>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
                    Friends with this link can view {privacy === 'private' ? '— set to Private, change above to share' : 'and chat on this itinerary'}.
                  </p>
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </div>
        )}

        {/* Compact Planning ⇄ Itinerary mode toggle. Sits inside the
            merged tab so users can flip between curating pins and
            viewing the day plan without leaving the page. Shown
            whenever both modes have something to render — sections
            present (itinerary exists) or bookmarks present (user has
            been pinning). */}
        {(sections.length > 0 || bookmarks.length > 0) && mainTab !== 'book' && (
          <div role="tablist" aria-label="Trip view mode" style={{
            display: 'inline-flex', gap: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 999, padding: 3,
            marginBottom: 16,
          }}>
            {(['planning', 'itinerary'] as const).map((m) => {
              const active = mainTab === m;
              const label = m === 'planning' ? '📍 Pin destinations' : '🗺 View itinerary';
              return (
                <button
                  key={m}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMainTab(m)}
                  style={{
                    padding: '6px 16px', borderRadius: 999,
                    background: active ? 'var(--brand-accent)' : 'transparent',
                    color: active ? 'var(--brand-bg)' : 'rgba(255,255,255,0.65)',
                    border: 'none',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >{label}</button>
              );
            })}
          </div>
        )}

        {/* ── Main tab switcher (legacy — hidden during the design pass) ─── */}
        {false && (
        <div style={{
          display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          marginBottom: 20,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: -1, flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
            {(['planning', 'itinerary', 'book'] as const).map(tab => (
              <button key={tab} onClick={() => setMainTab(tab)} style={{
                padding: isMobile ? '9px 14px' : '10px 24px',
                fontSize: isMobile ? 12 : 13, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${mainTab === tab ? '#38bdf8' : 'transparent'}`,
                color: mainTab === tab ? '#38bdf8' : 'rgba(255,255,255,0.38)',
                transition: 'color 0.15s, border-color 0.15s',
                flex: isMobile ? '1 0 auto' : undefined,
              }}>
                {tab === 'itinerary'
                  ? String.fromCodePoint(0x1F5FA) + '\u00A0 Itinerary'
                  : tab === 'planning'
                  ? String.fromCodePoint(0x1F4CD) + '\u00A0 Planning'
                  : String.fromCodePoint(0x1F4CB) + '\u00A0 Book'}
                {tab === 'planning' && bookmarks.length > 0 && (
                  <span style={{
                    marginLeft: 6, background: '#f59e0b', color: '#000',
                    borderRadius: 999, padding: '1px 6px', fontSize: 10, fontWeight: 800,
                  }}>
                    {bookmarks.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Right side — optimize button + last optimized timestamp (itinerary tab only) */}
          {mainTab === 'itinerary' && <div style={{ marginLeft: isMobile ? 0 : 'auto', marginTop: isMobile ? 6 : 0, display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 4 }}>
            {lastOptimized && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                color: 'rgba(245,158,11,0.7)', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
              }}>
                {String.fromCodePoint(0x23F1)} Last optimized{' '}
                {lastOptimized!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                at {lastOptimized!.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {bookmarks.length > 0 && (
              <button
                onClick={handleOptimizeItinerary}
                disabled={optimizingItinerary}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: optimizingItinerary
                    ? 'rgba(245,158,11,0.06)'
                    : 'linear-gradient(135deg, rgba(245,158,11,0.22) 0%, rgba(234,88,12,0.16) 100%)',
                  border: '1.5px solid rgba(245,158,11,0.5)',
                  color: '#fcd34d', cursor: optimizingItinerary ? 'not-allowed' : 'pointer',
                  opacity: optimizingItinerary ? 0.65 : 1,
                  whiteSpace: 'nowrap',
                  boxShadow: optimizingItinerary ? 'none' : '0 0 16px rgba(245,158,11,0.15)',
                  transition: 'all 0.2s ease',
                }}
              >
                {optimizingItinerary ? (
                  <>
                    <div style={{
                      width: 12, height: 12,
                      border: '2px solid rgba(245,158,11,0.3)', borderTopColor: '#f59e0b',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                    }} />
                    Optimizing\u2026
                  </>
                ) : (
                  <>{String.fromCodePoint(0x2728)} Optimize with {bookmarks.length} destination{bookmarks.length !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>}
        </div>
        )}

        {/* ── Planning tab ──────────────────────────────────────────────────── */}
        {mainTab === 'planning' && (() => {
          const filtered = planningFilter === 'all'
            ? bookmarks
            : bookmarks.filter(b => b.category === planningFilter);
          const counts = PLANNING_CATS.map(c => ({
            ...c,
            count: bookmarks.filter(b => b.category === c.key).length,
          })).filter(c => c.count > 0);
          const handleGenerate = requestGeneration;
          return (
            <div style={{
              // 40% sidebar (bookmarks list) / 60% map. Same proportion
              // as the itinerary view so the merged tab feels consistent.
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(0, 3fr)',
              gap: 20,
              alignItems: 'start',
            }}>
              {/* ── Sidebar column ─────────────────────────────────────────── */}
              <aside style={{
                background: 'transparent',
                borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.08)',
                borderTop: isMobile ? '1px solid rgba(255,255,255,0.08)' : 'none',
                padding: 18,
                display: 'flex', flexDirection: 'column', gap: 16,
                minHeight: isMobile ? 'auto' : 'min(80vh, 720px)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                    fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: 'var(--brand-accent-2, rgba(167,139,250,0.85))', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {String.fromCodePoint(0x00A7)} Your Stops{location ? ` · ${location}` : ''}
                  </div>
                  <div style={{
                    flexShrink: 0,
                    fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.55)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999, padding: '3px 9px',
                  }}>
                    {String.fromCodePoint(0x00A7)} {bookmarks.length} {bookmarks.length === 1 ? 'PIN' : 'PINS'}
                  </div>
                </div>

                {/* Panel sub-tab toggle — Pins vs Recs. Pins is the
                    canonical curate-then-thread surface; Recs swaps in a
                    Claude-curated list filtered by saved trip style. */}
                <div role="tablist" aria-label="Planning panel" style={{
                  display: 'flex', gap: 4,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 999, padding: 3,
                  alignSelf: 'flex-start',
                }}>
                  {([
                    { key: 'pins', label: 'Pins' },
                    { key: 'recs', label: 'Recs' },
                  ] as const).map(t => {
                    const active = panelTab === t.key;
                    return (
                      <button
                        key={t.key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPanelTab(t.key)}
                        style={{
                          padding: '5px 14px', borderRadius: 999,
                          background: active ? 'var(--brand-accent)' : 'transparent',
                          color: active ? 'var(--brand-bg)' : 'var(--brand-ink-dim)',
                          border: 'none',
                          fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                          letterSpacing: '0.02em', cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <p style={{
                  margin: 0,
                  fontFamily: 'var(--font-display), Georgia, serif',
                  fontSize: 22, lineHeight: 1.15, fontWeight: 400,
                  letterSpacing: '-0.015em', color: 'var(--brand-ink)',
                }}>
                  {panelTab === 'pins' ? (
                    <>Drop pins.{' '}
                      <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>
                        We&apos;ll thread them together.
                      </em>
                    </>
                  ) : (
                    <><em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>Curated</em> for your style.</>
                  )}
                </p>

                {panelTab === 'recs' && savedTripId && (
                  <RecPanel
                    tripId={savedTripId}
                    onPick={async (rec) => {
                      // Resolve the rec name on the planning map, biased to
                      // the trip destination — NOT the user's geolocation.
                      // Without explicit locationBias, Google Places defaults
                      // to IP-based bias which surfaces results near where
                      // the user physically is, not where they're planning
                      // to go. Geocode the destination city first to get a
                      // bias center, then pass it through.
                      try {
                        await loadGoogleMaps();
                        const tmpDiv = document.createElement('div');
                        const tmpMap = new google.maps.Map(tmpDiv);
                        const svc = new google.maps.places.PlacesService(tmpMap);
                        const query = location ? `${rec.name}, ${location}` : rec.name;

                        // Step 1: geocode destination → center for the bias.
                        // Cached per-session so successive rec clicks don't
                        // re-geocode the same city.
                        const cacheKey = `geknee:destcenter:${location ?? ''}`;
                        let center: google.maps.LatLng | null = null;
                        const cached = location && typeof window !== 'undefined'
                          ? sessionStorage.getItem(cacheKey)
                          : null;
                        if (cached) {
                          try {
                            const { lat, lng } = JSON.parse(cached) as { lat: number; lng: number };
                            center = new google.maps.LatLng(lat, lng);
                          } catch { /* fall through to live geocode */ }
                        }
                        if (!center && location) {
                          const geocoder = new google.maps.Geocoder();
                          await new Promise<void>((resolve) => {
                            geocoder.geocode({ address: location }, (results, status) => {
                              if (status === 'OK' && results?.[0]?.geometry?.location) {
                                center = results[0].geometry.location;
                                try {
                                  sessionStorage.setItem(cacheKey, JSON.stringify({
                                    lat: center.lat(), lng: center.lng(),
                                  }));
                                } catch { /* silent */ }
                              }
                              resolve();
                            });
                          });
                        }

                        // Step 2: findPlaceFromQuery WITH locationBias so
                        // results stay anchored to the destination city.
                        const req: google.maps.places.FindPlaceFromQueryRequest = {
                          query,
                          fields: ['place_id', 'geometry'],
                        };
                        if (center) {
                          // 50km circle around destination covers most
                          // intra-city queries without leaking to neighbours.
                          req.locationBias = { center, radius: 50000 };
                        }

                        svc.findPlaceFromQuery(req, (results, status) => {
                          if (
                            status === google.maps.places.PlacesServiceStatus.OK &&
                            results?.[0]?.place_id && results[0].geometry?.location
                          ) {
                            const loc = results[0].geometry.location;
                            mapControlRef.current?.openPlace(
                              results[0].place_id,
                              [loc.lat(), loc.lng()],
                            );
                          }
                        });
                      } catch { /* silent — falls back to no-op */ }
                    }}
                  />
                )}

                {panelTab === 'pins' && bookmarks.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {([{ key: 'all' as const, label: 'All', color: '#e2e8f0' }, ...counts.map(c => ({ key: c.key as 'all' | BookmarkCategory, label: c.label, color: c.color }))]).map(p => {
                      const active = planningFilter === p.key;
                      return (
                        <button
                          key={p.key}
                          onClick={() => setPlanningFilter(p.key)}
                          style={{
                            padding: '5px 12px', borderRadius: 999,
                            fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
                            cursor: 'pointer', fontFamily: 'inherit',
                            background: active ? p.color : 'rgba(255,255,255,0.05)',
                            color: active ? '#0a0f1e' : 'rgba(255,255,255,0.7)',
                            border: `1px solid ${active ? p.color : 'rgba(255,255,255,0.1)'}`,
                            transition: 'background 0.12s, color 0.12s',
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div style={{
                  display: panelTab === 'pins' ? 'flex' : 'none',
                  flexDirection: 'column', gap: 6,
                  overflowY: 'auto', minHeight: 0, flex: '1 1 auto',
                }}>
                  {filtered.length === 0 ? (
                    <div style={{
                      padding: '28px 12px', textAlign: 'center',
                      color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5,
                    }}>
                      {bookmarks.length === 0
                        ? 'No stops yet. Search the map or click a place to add it.'
                        : 'No stops match this filter.'}
                    </div>
                  ) : (
                    filtered.map(bm => {
                      const cat = PLANNING_CATS.find(c => c.key === bm.category) ?? PLANNING_CATS[PLANNING_CATS.length - 1];
                      const num = bookmarks.indexOf(bm) + 1;
                      const openPin = () => {
                        if (bm.placeId) mapControlRef.current?.openPlace(bm.placeId, bm.coords);
                        else mapControlRef.current?.panTo(bm.coords);
                      };
                      return (
                        <div
                          key={bm.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                        >
                          <button
                            onClick={openPin}
                            style={{
                              flexShrink: 0,
                              width: 26, height: 26, borderRadius: '50%',
                              background: cat.color, color: '#0a0f1e',
                              fontSize: 12, fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: 'none', cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {num}
                          </button>
                          <button
                            onClick={openPin}
                            style={{
                              flex: 1, minWidth: 0,
                              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                              padding: 0, background: 'transparent', border: 'none',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <span style={{
                              fontSize: 13, fontWeight: 600, color: '#e2e8f0',
                              maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              fontFamily: 'inherit',
                            }}>
                              {bm.name}
                            </span>
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                              color: cat.color, fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                            }}>
                              {cat.label}
                            </span>
                          </button>
                          <button
                            onClick={() => setBookmarks(prev => prev.filter(b => b.id !== bm.id))}
                            aria-label={`Remove ${bm.name}`}
                            style={{
                              flexShrink: 0, width: 22, height: 22, borderRadius: 6,
                              background: 'transparent',
                              border: '1px solid rgba(239,68,68,0.18)',
                              color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'inherit',
                            }}
                          >
                            {String.fromCodePoint(0x00D7)}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div style={{
                  padding: 14, borderRadius: 12,
                  background: 'rgba(167,139,250,0.06)',
                  border: '1px solid rgba(167,139,250,0.2)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div>
                    <p style={{ margin: '0 0 3px', fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                      Ready to plan?
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>
                      {bookmarks.length > 0
                        ? `We'll order your ${bookmarks.length} stop${bookmarks.length === 1 ? '' : 's'} into a daily route, with timing and walking distance.`
                        : "We'll generate a day-by-day plan based on your travel style."}
                    </p>
                    {/* Reassurance: the AI will autofill more stops if the
                        user's curated set doesn't cover their declared
                        travel style (e.g. they pinned 2 sights but their
                        style says "deep-dive culture"). Soft signal — not
                        a warning — so users feel safe even with sparse pins. */}
                    <p style={{
                      margin: '6px 0 0', fontSize: 10, lineHeight: 1.45,
                      color: 'rgba(167,139,250,0.85)',
                      fontFamily: 'var(--font-mono-display), monospace',
                      letterSpacing: '0.08em',
                    }}>
                      <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Light on pins? The agent fills the gaps to match your travel style.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerate}
                    style={{
                      padding: '10px 14px', borderRadius: 10,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: 'linear-gradient(135deg, #a78bfa 0%, #818cf8 100%)',
                      border: 'none', color: '#0a0f1e',
                      boxShadow: '0 4px 14px rgba(167,139,250,0.35)',
                      fontFamily: 'inherit',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    + Generate Itinerary
                  </button>
                </div>
              </aside>
              {/* ── Map column (right) ─────────────────────────────────── */}
              <div
                style={{
                  position: isMobile ? 'static' : 'sticky',
                  top: isMobile ? undefined : 16,
                  alignSelf: 'start',
                  height: isMobile ? 320 : 'calc(100vh - 32px)',
                }}
              >
                <UnifiedTripMap
                  sections={[]}
                  location={location}
                  sticky={false}
                  height={isMobile ? 320 : undefined}
                  fillHeight={!isMobile}
                  bookmarks={bookmarks}
                  onAddBookmark={(b) => setBookmarks((prev) => [...prev, {
                    id: b.id,
                    name: b.name,
                    coords: b.coords,
                    placeId: b.placeId,
                    category: (b.category && PLANNING_CATS.some(c => c.key === b.category)
                      ? b.category
                      : 'other') as BookmarkCategory,
                  }])}
                  onRemoveBookmark={(id) => setBookmarks((prev) => prev.filter((bm) => bm.id !== id))}
                />
              </div>
            </div>
          );
        })()}

        {/* ── Itinerary tab ─────────────────────────────────────────────────── */}
        {mainTab === 'itinerary' && (<>

        {/* Section nav — appears once we have committed sections */}
        {sections.length > 0 && sections.some(s => s.heading) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20,
          }}>
            {sections.filter(s => s.heading).map(s => (
              <button
                key={s.id}
                onClick={() => {
                  const el = document.getElementById(s.id);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                  color: '#7dd3fc', cursor: 'pointer', letterSpacing: 0.2,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(56,189,248,0.1)')}
              >
                {s.heading}
              </button>
            ))}
          </div>
        )}

        {/* Not yet requested — prompt user to visit planning tab */}
        {/* Empty state — show whenever there's no itinerary content yet, not
            just on a fresh page. A saved trip without a stored itinerary
            (loadedFromSave + sections.length === 0) used to leave the page
            blank under the masthead; now it lands here. */}
        {sections.length === 0 && !streaming && !error && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 16, padding: '60px 32px',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
              fontSize: 10, letterSpacing: '0.22em',
              color: 'var(--brand-accent-2)', fontWeight: 600,
            }}>
              {String.fromCodePoint(0x00A7)} NO ITINERARY YET
            </div>
            <p style={{
              margin: 0, fontFamily: 'var(--font-display), Georgia, serif',
              fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em',
              color: 'var(--brand-ink)',
            }}>
              Drop pins, then <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>build it.</em>
            </p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--brand-ink-dim)', maxWidth: 380, lineHeight: 1.6 }}>
              Mark the places you want to visit on the map, then we&apos;ll arrange them into a day-by-day plan.
            </p>
            <p style={{
              margin: '4px 0 0', fontSize: 11, lineHeight: 1.5,
              color: 'rgba(167,139,250,0.85)', maxWidth: 380,
              fontFamily: 'var(--font-mono-display), monospace',
              letterSpacing: '0.06em',
            }}>
              <Sparkle size={10} style={{ verticalAlign: '-1px', marginRight: 4 }} /> Don&apos;t worry about coverage — if your pins don&apos;t fill the days, the agent
              suggests more stops that match your travel style.
            </p>
            <Link
              href={savedTripId ? `/plan/${encodeURIComponent(savedTripId)}/map` : '/plan'}
              style={{
                padding: '11px 28px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: 'var(--brand-accent)', color: 'var(--brand-bg)',
                border: 'none', cursor: 'pointer', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(167,139,250,0.35)',
              }}
            >
              {String.fromCodePoint(0x2315)} Open the map
            </Link>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            color: '#f87171', padding: '18px 22px',
            background: 'rgba(239,68,68,0.1)', borderRadius: 12,
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            {error}
          </div>
        )}

        {/* Trip-wide weather strip — once at the top, replacing the
            per-day WeatherBar that used to live inside each SectionCard.
            Aggregates days across all stops, dedupes by date, sorts. */}
        {(() => {
          const merged: DayWeather[] = [];
          const seen = new Set<string>();
          for (const stop of allStops) {
            const days = weatherByCity.get(stop.city);
            if (!days) continue;
            for (const d of days) {
              if (seen.has(d.date)) continue;
              seen.add(d.date);
              merged.push(d);
            }
          }
          merged.sort((a, b) => a.date.localeCompare(b.date));
          return merged.length > 0 ? (
            <div style={{ marginBottom: 22 }}>
              <WeatherBar days={merged} unit={weatherUnit} />
            </div>
          ) : null;
        })()}

        {/* Committed sections — shown as interactive SectionCards as soon as each day is complete */}
        {!error && sections.length > 0 && (
          <>
            {!streaming && (
              <div style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 11, marginBottom: 14,
                textAlign: 'right', letterSpacing: 0.3,
              }}>
                Click any line to edit &nbsp;&middot;&nbsp; Hover for {STAR} genie suggestions
              </div>
            )}
            {/* Split layout: itinerary list scrolls on the left, the
                unified Google Map stays put on the right. Map is sticky
                so as the user scrolls through day cards it remains
                visible. Stacks vertically on mobile. */}
            <div
              style={{
                display: 'grid',
                // 40% itinerary / 60% map on desktop, reactive to viewport.
                // Stacks 1-col on mobile (Capacitor app + narrow web).
                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 2fr) minmax(0, 3fr)',
                gap: 20,
                alignItems: 'start',
              }}
            >
              <div style={{ minWidth: 0 }}>
                {sections.map((section, sectionIdx) => {
                  const isDay  = /day\s*\d/i.test(section.heading);
                  const isCity = !isDay && allStops.some(s => section.heading.toLowerCase().includes(s.city.toLowerCase()));
                  let weatherDays: DayWeather[] | undefined;
                  if (isDay) {
                    weatherDays = weatherByCity.get(allStops[0]?.city ?? location);
                  } else if (isCity) {
                    const matchedStop = allStops.find(s => section.heading.toLowerCase().includes(s.city.toLowerCase()));
                    if (matchedStop) weatherDays = weatherByCity.get(matchedStop.city);
                  }
                  return (
                    <SectionCard
                      key={section.id}
                      section={section}
                      sectionIdx={sectionIdx}
                      editTarget={editTarget}
                      editValue={editValue}
                      onStartEdit={handleStartEdit}
                      onEditChange={setEditValue}
                      onCommit={handleCommit}
                      onCancel={handleCancel}
                      onAskGenie={handleAskGenie}
                      location={location}
                      allStops={allStops}
                      weatherDays={weatherDays}
                      weatherUnit={weatherUnit}
                      replanning={replanningSection === sectionIdx}
                      onReplan={() => handleReplan(sectionIdx)}
                    />
                  );
                })}
              </div>
              {sections.length > 0 && (
                <div
                  style={{
                    position: isMobile ? 'static' : 'sticky',
                    top: isMobile ? undefined : 16,
                    alignSelf: 'start',
                    height: isMobile ? 'auto' : 'calc(100vh - 32px)',
                  }}
                >
                  <UnifiedTripMap
                    sections={sections}
                    location={location}
                    sticky={false}
                    height={isMobile ? 320 : undefined}
                    fillHeight={!isMobile}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* In-progress section — raw streaming text for the day currently being written */}
        {!error && streaming && (
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '28px 32px', minHeight: streamingHeading ? 0 : 200,
          }}>
            {lines.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[60, 90, 80, 70, 50].map((w, i) => (
                  <div key={i} style={{ width: `${w}%`, height: i === 0 ? 22 : 14, borderRadius: i === 0 ? 8 : 6, background: 'linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 75%)', backgroundSize: '800px 100%', animation: `shimmer 1.5s infinite linear ${i * 0.1}s` }} />
                ))}
                {/* Stage-aware status. Replaces the old static "Crafting…"
                   line so the user sees what's actually happening — and we
                   can spot stuck states (no transition for 30 s ⇒ surface
                   a hint). */}
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: 'var(--font-mono-display), ui-monospace, monospace', letterSpacing: '0.04em' }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1.4s ease-in-out infinite' }} />
                  <span>
                    {loadingStage === 'loading-trip'  ? 'Loading saved trip…'
                    : loadingStage === 'no-itinerary' ? 'Trip loaded · starting geknee agent…'
                    : loadingStage === 'requesting'   ? 'Reaching geknee agent · request in flight…'
                    : loadingStage === 'streaming'    ? 'Receiving itinerary from geknee agent…'
                    : 'Crafting your personalized itinerary…'}
                    {elapsedSec > 0 && <span style={{ opacity: 0.55 }}> · {elapsedSec}s</span>}
                  </span>
                </div>
                {currentStatus && (
                  <div
                    aria-live="polite"
                    style={{
                      marginTop: 6, marginLeft: 16,
                      color: 'rgba(167,139,250,0.85)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {currentStatus}
                  </div>
                )}
                {/* Slow-load surface: warn at 30 s, offer a retry at 60 s.
                   The /api/itinerary stream can legitimately take that long
                   for a multi-day trip, but if it hangs the user otherwise
                   has no escape hatch from the skeleton. */}
                {elapsedSec >= 30 && (
                  <div style={{
                    marginTop: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(251,191,36,0.06)',
                    border: '1px solid rgba(251,191,36,0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}>
                    <p style={{
                      margin: 0,
                      color: '#fbbf24',
                      fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                      fontSize: 11,
                      letterSpacing: '0.04em',
                    }}>
                      {elapsedSec >= 60
                        ? 'Taking longer than usual. The geknee agent may be stuck — retry?'
                        : 'Taking longer than usual · the geknee agent is working through your trip…'}
                    </p>
                    {elapsedSec >= 60 && (
                      <button
                        onClick={() => {
                          loadedFromSave.current = false;
                          setItineraryRequested(true);
                          setStreaming(true);
                          setLines([]);
                          setSections([]);
                          setError('');
                          setLoadingStage('requesting');
                          requestStartRef.current = Date.now();
                          setRetryNonce(n => n + 1);
                        }}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          background: 'rgba(251,191,36,0.14)',
                          border: '1px solid rgba(251,191,36,0.4)',
                          color: '#fbbf24',
                          fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Live progress badge: how many day-headings we've parsed
                   so far. Gives the user concrete proof the AI is making
                   progress instead of just a blinking cursor. */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#38bdf8',
                  background: 'rgba(56,189,248,0.08)',
                  border: '1px solid rgba(56,189,248,0.22)',
                  padding: '5px 10px', borderRadius: 999, marginBottom: 14,
                }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1.4s ease-in-out infinite' }} />
                  {(() => {
                    const dayCount = lines.filter(l => /^##\s/.test(l)).length;
                    const totalDays = parseInt(nights || '0', 10) + 1;
                    if (dayCount === 0) return 'Receiving from geknee agent…';
                    if (totalDays > 0 && dayCount <= totalDays) return `Streaming day ${dayCount} of ${totalDays}`;
                    return `Streaming day ${dayCount}`;
                  })()}
                </div>
                {streamingHeading && (
                  <h2 style={{ color: '#38bdf8', fontSize: 20, fontWeight: 700, marginBottom: 14 }}>
                    {streamingHeading}
                  </h2>
                )}
                {streamingLines.map((line, i) => <MarkdownLine key={i} line={line} />)}
                {inFlightTail.trim() && <MarkdownLine line={inFlightTail} />}
                <span style={{
                  display: 'inline-block', width: 2, height: 16,
                  background: '#38bdf8', marginLeft: 2,
                  animation: 'blink 0.9s step-end infinite', verticalAlign: 'text-bottom',
                }} />
                <div ref={bottomRef} />
              </>
            )}
          </div>
        )}

        {/* Action buttons — shown after streaming completes */}
        {!error && !streaming && sections.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => router.push('/')}
                style={{
                  padding: '11px 18px', borderRadius: 999,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                ← Plan another trip
              </button>
              <button
                onClick={saveItinerary}
                disabled={saveState === 'saving'}
                style={{
                  padding: '11px 18px', borderRadius: 999, cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                  fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  border: `1px solid ${saveState === 'saved' ? 'rgba(34,197,94,0.4)' : saveState === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(167,139,250,0.35)'}`,
                  background: 'transparent',
                  color: saveState === 'saved' ? '#86efac' : saveState === 'error' ? '#f87171' : 'rgba(167,139,250,0.85)',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                {saveState === 'saving' && (
                  <span style={{ width: 9, height: 9, border: '1.5px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                )}
                {saveState === 'saved'  ? String.fromCodePoint(0x2713) + ' Saved' :
                 saveState === 'error'  ? 'Retry save' :
                 saveState === 'saving' ? 'Saving\u2026' :
                 savedTripId            ? 'Save changes' : 'Save itinerary'}
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  padding: '11px 18px', borderRadius: 999,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Print / PDF
              </button>
              <div style={{ flex: 1 }} />
              {/* Primary CTA — lavender pill matching the rest of the
                  site's accent treatment (Generate, Replan, Save). One
                  button to take the user from itinerary → booking. */}
              <button
                onClick={() => setMainTab('book')}
                style={{
                  padding: '12px 24px', borderRadius: 999,
                  background: 'var(--brand-accent)',
                  border: 'none', color: 'var(--brand-bg)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'var(--font-mono-display), ui-monospace, monospace',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  boxShadow: '0 4px 18px rgba(167,139,250,0.32)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                Continue to booking →
              </button>
            </div>

            {/* "Ready to book?" affiliate banner removed — those same
                links live in the Booking tab. The "Continue to booking"
                button above is the single CTA. */}
          </>
        )}

        </>)}

        {/* ── Book tab — always mounted to preserve state across tab switches ── */}
        <div style={{ display: mainTab === 'book' ? 'block' : 'none' }}>
          <BookTabDynamic
            location={location}
            purpose={purpose}
            style={travelStyle}
            budget={budget}
            interests={interests}
            startDate={startDate}
            endDate={endDate}
            nights={nights}
            stops={stopsRaw}
            travelingFrom={travelingFrom}
            fullItinerary={fullItinerary}
            tripId={savedTripId ?? undefined}
            onItineraryAdjusted={(newItinerary) => {
              // Splice the freshly-edited itinerary into the line buffer
              // so the day-card view re-renders in place. Keep the same
              // line-by-line shape the streaming pipeline produces.
              setLines(newItinerary.split('\n'));
            }}
          />
        </div>

      </div>

      {/* In-page genie chat removed during the design pass — the GlobalChat
          mounted in app/layout.tsx provides the floating AI assistant
          globally, so duplicating it here added a second character in the
          bottom-right corner. ChatPanel + GenieCharacter remain available
          as exported components for future use. */}

      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes blink       { 0%,100% { opacity:1; } 50% { opacity:0; } }
        @keyframes pulse       { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.7); } }
        @keyframes genieFloat  { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
        @keyframes genieSpark  { 0%,100% { opacity:0; transform:scale(0.5); } 50% { opacity:1; transform:scale(1.2); } }
        @keyframes chatSlideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer     { 0% { background-position:-800px 0; } 100% { background-position:800px 0; } }
        @keyframes retryToastIn { from { opacity:0; transform:translate(-50%,-12px); } to { opacity:1; transform:translate(-50%,0); } }
        @media print { [style*="position: fixed"] { display:none !important; } }
      `}</style>
    </main>
  );
}

export default function SummaryView(props: SummaryViewProps) {
  return (
    <Suspense>
      <SummaryContent {...props} />
    </Suspense>
  );
}
