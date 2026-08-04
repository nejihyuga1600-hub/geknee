'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import BudgetTracker from './BudgetTracker';
import { GoogleLiveMap } from './GoogleLiveMap';
import { AddStopModal } from './AddStopModal';
import { useTilePrewarm, useExplicitOfflineDownload } from '@/lib/useTilePrewarm';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { fetchDirections } from '@/lib/googleMaps/directionsClient';
import { fetchWeather, type WeatherResult, type WeatherDay, type WeatherHour } from '@/lib/googleMaps/weatherClient';
import { useTripTimezone } from '@/app/hooks/useTripTimezone';
import { CardShell } from './CardShell';
import { SafetyCard } from './SafetyCard';
import { factsFor, type CountryFacts } from '@/lib/countryCheatsheet';
import { todaysHappenings, type LocalHappening } from '@/lib/localColorByCity';
import { guideFor, type LandmarkGuide } from '@/lib/landmarkGuides';
import { ticketsFor, stillBookable, type SkipLineTicket } from '@/lib/skipLineTickets';
import { currentMealContext } from '@/lib/mealCadenceByCountry';
import { matchMonumentQuest } from '@/lib/monumentQuest';
import {
  loadNotes, saveNote, deleteNote, newNoteId,
  isJournalDismissedToday, dismissJournalForToday, fileToScaledDataUrl,
  todayIsoDate,
  type NoteEntry,
} from '@/lib/tripNotes';

// ─── E5 · Live Trip · in-the-field companion ────────────────────────────────
// In-trip companion: glanceable LEAVE-BY card on top of a focused city map,
// flanked by next-stop / weather / crowds context cards and a horizontal
// day-timeline strip. v0: shipping the visual surface with realistic mock
// data; geolocation, Google Directions ETA, and Google Places popular-times
// hookups land in follow-ups.

interface TripData {
  id: string;
  title: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  // Phase 0/2: when populated, this trip had a flight detected via Gmail
  // scan — kicks the tile-prewarm hook so the SW caches static maps for
  // the trip city ahead of any network loss.
  flightBookingDetectedAt?: string | null;
  // Phase 3: flipped true after the offline tile prewarm has completed
  // for this trip (either auto on flight detection or explicit via the
  // "Download offline" CTA). UI suppresses the CTA when this is set.
  offlineMapPrefetched?: boolean;
  timezone?: string | null;
}

interface Geo { lat: number; lon: number }

interface Activity {
  // 24-hour absolute clock for "today" (HH:MM). Comparable across the day.
  time: string;
  // Display string straight from the markdown ("1:00 PM").
  display: string;
  // Activity body: "Tea ceremony at Camellia."
  name: string;
  // Best-effort extracted place name for geocoding ("Camellia").
  place: string | null;
}

// ─── Itinerary parsing helpers ──────────────────────────────────────────────

// "**1:00 PM**" or "**12:30 PM**" prefix at the start of an activity line.
const TIME_RE = /^\*\*(\d{1,2}):(\d{2})\s*(AM|PM)\*\*\s*[-–:]?\s*(.*)$/i;
const DAY_HEADING_RE = /day[\s\-]*(\d+)/i;

// Strip markdown emphasis + list dashes + trailing punctuation from an
// activity body so it renders as clean prose. The itinerary is authored
// as markdown ("Stroll through **Vinohrady** *(~1 hr)* — Prague's...")
// and prior versions were dumping that raw into the live-trip cards
// with `**` and `*` and stray dashes visible on-screen (user video
// 2026-08-03 10:34). Removes: **bold**, *italic*, _underscore_,
// `code`, leading `—`/`-`/`–`/`:`, and collapses runs of whitespace.
function stripMd(s: string): string {
  return s
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^[\s\-–—:•]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function to24h(h: number, m: number, ampm: string): string {
  let hh = h % 12;
  if (ampm.toUpperCase() === 'PM') hh += 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Pull a likely place name out of an activity body. Heuristics — looks for
// "at <Place>", "to <Place>", or capitalised phrases. Returns null when
// nothing useful surfaces.
function extractPlaceName(body: string): string | null {
  const cleaned = body.replace(/[*`]/g, '').trim();
  const m = cleaned.match(/\b(?:at|to|in|visit|see)\s+([A-Z][\wÀ-ſ'’\- ]{2,40})/);
  if (m) return m[1].trim().replace(/[.,;:!?]+$/, '');
  // Fallback: first capitalised noun-phrase up to 4 words.
  const cap = cleaned.match(/[A-Z][\wÀ-ſ'’\-]+(?:\s+[A-Z][\wÀ-ſ'’\-]+){0,3}/);
  return cap?.[0] ?? null;
}

function parseTodayActivities(itinerary: string, dayNumber: number): Activity[] {
  if (!itinerary) return [];
  const lines = itinerary.split('\n');
  let inDay = false;
  let currentDay = -1;
  const activities: Activity[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/) ?? line.match(/^\*\*(Day\s+\d+[^*]*)\*\*/i);
    const headingText = headingMatch?.[1] ?? '';
    if (headingText) {
      const dm = headingText.match(DAY_HEADING_RE);
      if (dm) {
        currentDay = parseInt(dm[1], 10);
        inDay = currentDay === dayNumber;
        continue;
      }
      // Non-day heading inside the active day signals the section ended.
      if (inDay && /^[#]/.test(line)) inDay = false;
    }
    if (!inDay) continue;
    const tm = line.match(TIME_RE);
    if (tm) {
      const [, hStr, mStr, ampm, body] = tm;
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const time = to24h(h, m, ampm);
      const display = `${h}:${String(m).padStart(2, '0')} ${ampm.toUpperCase()}`;
      // stripMd + strip leading list dashes so the rendered name is clean
      // prose (was showing raw "**Vinohrady** *(~1 hr)* — Prague's..." in
      // the LEAVE-BY / timeline cards).
      const name = stripMd(body);
      activities.push({ time, display, name, place: extractPlaceName(name) });
    }
  }
  // Dedupe by (time, name) — sometimes the source itinerary lists the
  // same activity twice (once in the day summary, once in the schedule
  // block), which showed up as duplicate numbered pins on the map
  // (user report 2026-08-03: two 3s + two 5s). Same-time + same-name is
  // a safe signal these are the same event.
  const seen = new Set<string>();
  const deduped = activities.filter((a) => {
    // Broadened from 40 → 20 chars 2026-08-03 to catch itinerary
    // variants like "Breakfast at Café Louvre" vs "Café Louvre for
    // breakfast" — same 20-char prefix after normalization treats
    // them as the same slot.
    const key = `${a.time}::${a.name.slice(0, 20).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => a.time.localeCompare(b.time));
}

function nowHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

export default function LiveTripPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params?.tripId ?? '';
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [now, setNow] = useState<Date>(() => new Date());
  const [currentWeather, setCurrentWeather] = useState<WeatherResult | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  // Location permission — persisted in localStorage as GEO_PREF so the
  // browser prompt only fires the FIRST time the user opens a live trip.
  // Subsequent opens: 'granted' silently re-fetches; 'denied' skips the
  // prompt entirely (user can still tap the chip to try again).
  const GEO_PREF = 'geknee:geo-permission-v1';
  const [geoStatus, setGeoStatus] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const requestGeolocation = (opts?: { silent?: boolean }) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('denied');
      try { localStorage.setItem(GEO_PREF, 'denied'); } catch {}
      return;
    }
    if (!opts?.silent) setGeoStatus('pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoStatus('granted');
        try { localStorage.setItem(GEO_PREF, 'granted'); } catch {}
      },
      () => {
        setGeoStatus('denied');
        try { localStorage.setItem(GEO_PREF, 'denied'); } catch {}
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };
  // Fire-once on first mount: if the user has previously said yes, silently
  // refresh their location; if they said no, do nothing. First-ever open
  // fires the prompt automatically so the map can route from where they
  // actually are (user request 2026-08-03: "ask once, remember").
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(GEO_PREF); } catch {}
    if (stored === 'granted') {
      requestGeolocation({ silent: true });
    } else if (stored === 'denied') {
      setGeoStatus('denied');
    } else {
      // First-ever open — a small delay so the map paint has time to land
      // before the OS prompt sheet slides in.
      const t = setTimeout(() => requestGeolocation(), 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Fullscreen map takeover — a "view map" chip flips this on and the map
  // section becomes position:fixed at inset:0 covering everything else.
  const mapFull = false; // legacy no-op — the fullscreen toggle was removed 2026-08-04
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Geolocation removed per privacy directive — only flight departure
  // detection requests location. Live trip view falls back to the
  // trip's anchor city for the mock map center; no GPS recenter.

  // Current-conditions banner above the live map.
  // Geocode the anchor city then call /api/weather?days=7 so we get both current (banner) and forecast (alert card).
  // Re-fetches when the trip location changes. Falls back silently on any error.
  useEffect(() => {
    if (!trip?.location) return;
    let cancelled = false;
    (async () => {
      try {
        const gr = await fetch(`/api/geocode?address=${encodeURIComponent(trip.location!)}`);
        if (!gr.ok || cancelled) return;
        const gd = await gr.json() as { lat?: number; lng?: number; country?: string | null } | null;
        if (!gd?.lat || !gd?.lng || cancelled) return;
        if (!cancelled) setCountryCode(gd.country ?? null);
        // 24-hour hourly forecast alongside the 7-day daily rollup so
        // the WeatherAlertCard can show a scrollable per-hour strip
        // (user asked for whole-day hourly weather 2026-08-03).
        const w = await fetchWeather(gd.lat, gd.lng, 7, 24);
        if (!cancelled) setCurrentWeather(w);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [trip?.location]);

  const [itinerary, setItinerary] = useState<string>('');
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${encodeURIComponent(tripId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.trip) return;
        setTrip({
          id: d.trip.id,
          title: d.trip.title,
          location: d.trip.location ?? null,
          startDate: d.trip.startDate ?? null,
          endDate: d.trip.endDate ?? null,
          nights: d.trip.nights ?? null,
          flightBookingDetectedAt: d.trip.flightBookingDetectedAt ?? null,
          offlineMapPrefetched: !!d.trip.offlineMapPrefetched,
        });
        if (typeof d.trip.itinerary === 'string') setItinerary(d.trip.itinerary);
      })
      .finally(() => { if (!cancelled) setLoadingTrip(false); });
    return () => { cancelled = true; };
  }, [tripId]);

  // Trip-day calculation — what day are we on out of total nights+1?
  const dayInfo = (() => {
    if (!trip?.startDate || !trip?.nights) return { day: 1, total: 1 };
    const start = new Date(trip.startDate + 'T00:00:00');
    const today = new Date(now.toISOString().slice(0, 10) + 'T00:00:00');
    const diff = Math.floor((today.getTime() - start.getTime()) / 86400000);
    const total = trip.nights + 1;
    const day = Math.max(1, Math.min(total, diff + 1));
    return { day, total };
  })();

  const cityName = (trip?.location ?? 'YOUR CITY').toUpperCase();
  const tripTz = useTripTimezone(trip?.timezone);
  const clockText = new Intl.DateTimeFormat(undefined, {
    timeZone: tripTz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  // The user can toggle which day they're previewing — defaults to the
  // calendar-current day. Map + activity list both flip when this changes,
  // so the map centers on Day N's stops instead of the user's geolocation.
  const [selectedDay, setSelectedDay] = useState<number>(dayInfo.day);
  // Add-stop modal state. coords are populated when the user clicks the
  // map; null = launched from the "+ Add stop" button (no pre-seed).
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [addStopCoords, setAddStopCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Offline tile prewarm — only kicks for trips with a Gmail-detected
  // flight. The SW caches /api/map-tile responses; this fires a handful
  // of background fetches to populate the cache for the trip city so
  // when network drops mid-trip, GoogleLiveMap's offline fallback works.
  useTilePrewarm({
    city: trip?.location ?? null,
    enabled: !!trip?.flightBookingDetectedAt,
  });

  const online = useOnlineStatus();

  // Explicit "Download offline" — wider grid than the automatic prewarm.
  // Surfaces as a button; user gets a progress fraction while it runs.
  const explicitDownload = useExplicitOfflineDownload();
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  useEffect(() => {
    // When the calendar advances (new day on a running trip), follow along
    // — but don't override an explicit user choice. Heuristic: if the user
    // hasn't deviated from the previous "today", track it.
    setSelectedDay(dayInfo.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayInfo.day]);

  // Selected-day activities. The map + day-on-rails copy + LEAVE-BY card
  // all read off this list, so toggling re-renders the whole strip cleanly.
  const activities = useMemo(
    () => parseTodayActivities(itinerary, selectedDay),
    [itinerary, selectedDay],
  );

  // Next activity = first one whose time is later than now.
  const currentClock = nowHHMM(now);
  const nextIdx = activities.findIndex(a => a.time > currentClock);
  const nextActivity = nextIdx >= 0 ? activities[nextIdx] : null;

  // ETA from user → next activity. Uses /api/geocode + Google Directions.
  // Throttled: fires at most every 60 s AND only if user moved >50 m.
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [nextCoords, setNextCoords] = useState<Geo | null>(null);
  const lastEtaCallRef = useRef<number>(0);
  const lastEtaPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Inline haversine helper (metres) — no extra deps needed.
  function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6_371_000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const sin2 = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(sin2));
  }

  useEffect(() => {
    setEtaMin(null);
    setNextCoords(null);
    if (!geo || !nextActivity?.place) return;
    let cancelled = false;
    const placeQuery = trip?.location
      ? `${nextActivity.place} ${trip.location}`
      : nextActivity.place;
    const userPos = { lat: geo.lat, lng: geo.lon };

    // Throttle: skip if called within 60 s or user hasn't moved 50 m.
    const now = Date.now();
    if (now - lastEtaCallRef.current < 60_000) return;
    if (lastEtaPosRef.current && haversineMeters(lastEtaPosRef.current, userPos) < 50) return;
    lastEtaCallRef.current = now;
    lastEtaPosRef.current = userPos;

    (async () => {
      const gRes = await fetch(`/api/geocode?address=${encodeURIComponent(placeQuery)}`);
      if (cancelled || !gRes.ok) return;
      const place = await gRes.json() as { lat: number; lng: number } | null;
      if (cancelled || !place) return;
      setNextCoords({ lat: place.lat, lon: place.lng });
      const dr = await fetchDirections(
        { lat: userPos.lat, lng: userPos.lng },
        { lat: place.lat, lng: place.lng },
        'walking',
      );
      if (cancelled || !dr) return;
      if (dr.durationSec != null) setEtaMin(Math.round(dr.durationSec / 60));
    })().catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [geo, nextActivity?.place, trip?.location]);

  // "Leave by" = activity time minus walking ETA minus a 5-min buffer.
  const leaveByText = (() => {
    if (!nextActivity) return null;
    const [h, m] = nextActivity.time.split(':').map(Number);
    const target = new Date(now); target.setHours(h, m, 0, 0);
    const offset = (etaMin ?? 0) + 5;
    const leaveAt = new Date(target.getTime() - offset * 60_000);
    const minsToLeave = Math.max(0, Math.round((leaveAt.getTime() - now.getTime()) / 60_000));
    return { leaveAt, minsToLeave };
  })();

  return (
    <div style={{
      minHeight: '100svh',
      background: 'var(--brand-bg)',
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, sans-serif',
      paddingBottom: 80,
      // Lock horizontal scrolling on the page root 2026-08-04 per user
      // request — the DAY STOPS timeline and WEATHER hourly strip are
      // the only surfaces that should scroll left/right; everything
      // else stays locked so accidental swipes don't reveal the
      // outside-viewport gutter.
      overflowX: 'hidden',
      maxWidth: '100vw',
    }}>
      {/* ── Offline status banner (Phase 3) ───────────────────────────── */}
      {!online && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          // Push below the iOS Dynamic Island / status bar; background
          // extends INTO the safe area so the body underneath stays hidden.
          padding: 'calc(env(safe-area-inset-top) + 8px) 22px 8px',
          background: 'rgba(251, 146, 60, 0.18)',
          borderBottom: '1px solid rgba(251, 146, 60, 0.45)',
          color: 'var(--brand-warn)',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em',
          textTransform: 'uppercase', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>● Offline</span>
          <span style={{ color: 'var(--brand-ink-dim)', letterSpacing: '0.06em', textTransform: 'none' }}>
            — using cached map data. Itinerary edits will retry when you reconnect.
          </span>
        </div>
      )}
      {/* ── Top app bar ─────────────────────────────────────────────────
          Two-row layout (redesigned 2026-08-03 per user feedback that the
          prior single row was "cramped and poorly designed"):
            Row 1  ·  live-dot + LIVE / DAY N OF TOTAL / city  ←→  clock
            Row 2  ·  offline-map chip  ←→  nav chips (itin / book / vault)
          Every chip is 44 pt tall so the whole bar is a real touch surface
          instead of a text ribbon. Font size bumped from 10 → 11–12 so
          labels are legible without squinting. */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        display: 'flex', flexDirection: 'column', gap: 10,
        paddingTop: online ? 'calc(env(safe-area-inset-top) + 12px)' : '12px',
        paddingBottom: 12, paddingLeft: 10, paddingRight: 10,
        background: 'rgba(5,5,15,0.9)', WebkitBackdropFilter: 'blur(18px)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--brand-border)',
      }}>
        {/* Row 1 — live badge + clock */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <span style={{
              flexShrink: 0,
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: 'var(--brand-success)',
              boxShadow: '0 0 12px var(--brand-success)',
              animation: 'livePulse 1.6s ease-in-out infinite',
            }} />
            <span style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em',
              color: 'var(--brand-ink)', fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              DAY {dayInfo.day} / {dayInfo.total} · {cityName}
            </span>
          </div>
          <span style={{
            flexShrink: 0,
            fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums',
            color: 'var(--brand-ink)', fontWeight: 600,
          }}>{clockText}</span>
        </div>
        {/* Row 2 — offline status (left) + nav chips (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span
            title={online ? 'Offline maps ready' : 'Offline mode'}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              padding: '6px 10px', borderRadius: 999,
              border: `1px solid ${online ? 'var(--brand-border)' : 'color-mix(in srgb, var(--brand-warning, #f59e0b) 45%, transparent)'}`,
              color: online ? 'var(--brand-ink-mute)' : 'var(--brand-warning, #f59e0b)',
              background: online ? 'transparent' : 'color-mix(in srgb, var(--brand-warning, #f59e0b) 12%, transparent)',
              whiteSpace: 'nowrap',
            }}>
            {String.fromCodePoint(0x25D0)} {online ? 'OFFLINE READY' : 'OFFLINE'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link href={`/plan/${tripId}/itinerary`}
              title="Itinerary" aria-label="Itinerary"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-accent)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border-hi)',
                background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              PLAN
            </Link>
            <Link href={`/plan/${tripId}/booking`}
              title="Booking" aria-label="Booking"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-ink-dim)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              BOOK
            </Link>
            <Link href={`/plan/${tripId}/vault`}
              title="Vault" aria-label="Vault"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', fontWeight: 700,
                color: 'var(--brand-ink-dim)', textDecoration: 'none',
                padding: '8px 12px', borderRadius: 999,
                border: '1px solid var(--brand-border)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              VAULT
            </Link>
          </div>
        </div>
      </div>

      {/* ── Day toggle pills ─────────────────────────────────────────────
          One-row horizontal-scroll strip (redesigned 2026-08-03 per user
          feedback: prior wrap layout burned a 2nd row on 8-day trips).
          "View day" label removed — the row itself + the active TODAY
          pill are enough visual signal that these are day selectors.
          Today's chip is scrolled into view on mount so users land on
          the right day even for 14-day trips. */}
      <div
        ref={(el) => {
          if (!el) return;
          const activeIdx = dayInfo.day - 1;
          const target = el.children[activeIdx] as HTMLElement | undefined;
          if (target) target.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
        }}
        style={{
          // Sticky, sitting directly below the top app bar (2026-08-03
          // per user request). Top-bar height varies with the safe-area
          // inset; use the same env() plumbing so the day row locks
          // flush against it on every device.
          position: 'sticky',
          top: 'calc(env(safe-area-inset-top) + 88px)',
          zIndex: 29,
          background: 'rgba(5,5,15,0.9)',
          WebkitBackdropFilter: 'blur(18px)', backdropFilter: 'blur(18px)',
          borderBottom: '1px solid var(--brand-border)',
          padding: '10px 8px',
          // Wrapping row (no horizontal scroll) 2026-08-04 per user
          // request. Longer trips (8+ days) now stack onto a second row
          // instead of scrolling — matches the "only day stops + weather
          // scroll horizontally" rule.
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          overflowX: 'hidden',
        }}
      >
        {Array.from({ length: dayInfo.total }).map((_, i) => {
          const d = i + 1;
          const isActive = selectedDay === d;
          const isToday = dayInfo.day === d;
          return (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              style={{
                flexShrink: 0,
                scrollSnapAlign: 'center',
                padding: '6px 14px', borderRadius: 999,
                border: `1px solid ${isActive ? 'var(--brand-accent)' : 'var(--brand-border)'}`,
                background: isActive ? 'rgba(167,139,250,0.18)' : 'transparent',
                color: isActive ? 'var(--brand-ink)' : 'var(--brand-ink-dim)',
                fontFamily: MONO, fontSize: 12, fontWeight: 600,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                minHeight: 32,
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              <span>{d}</span>
              {isToday && (
                <span style={{
                  fontSize: 8, color: 'var(--brand-success)',
                  letterSpacing: '0.12em',
                }}>● TODAY</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Offline-download status pill row — split out from the day pills
          so its variable-width content (progress %, "Saved offline"
          confirmation) can't push day chips into a second row on smaller
          screens. Renders directly under the day chips. */}
      <div style={{ padding: '4px 8px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Offline-download status pill. Three states:
            (a) flight detected + not yet cached + not downloading → CTA
            (b) downloading → progress text
            (c) cached → green "Saved offline" stamp */}
        {trip?.flightBookingDetectedAt && !trip.offlineMapPrefetched && !downloadDone && !downloadProgress && (
          <button
            onClick={async () => {
              if (!trip?.location || !tripId) return;
              setDownloadProgress({ done: 0, total: 1 });
              await explicitDownload(trip.location, tripId, {
                onProgress: (done, total) => setDownloadProgress({ done, total }),
              });
              setDownloadProgress(null);
              setDownloadDone(true);
            }}
            style={{
              marginLeft: 'auto',
              padding: '5px 12px', borderRadius: 999,
              border: '1px solid var(--brand-accent)',
              background: 'rgba(167,139,250,0.18)',
              color: 'var(--brand-ink)',
              fontFamily: MONO, fontSize: 11, fontWeight: 600,
              letterSpacing: '0.08em', cursor: 'pointer',
            }}
          >
            ⤓ Save offline
          </button>
        )}
        {downloadProgress && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em',
            color: 'var(--brand-accent)',
          }}>
            ⤓ Caching {downloadProgress.done}/{downloadProgress.total}…
          </span>
        )}
        {(downloadDone || trip?.offlineMapPrefetched) && (
          <span style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 999,
            border: '1px solid var(--brand-success)',
            background: 'rgba(124,255,151,0.12)',
            color: 'var(--brand-success)',
            fontFamily: MONO, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.08em',
          }}>
            ✓ Saved offline
          </span>
        )}
      </div>

      {/* ── Map area (2D Google Maps, centered on selected day) ───────────
          When mapFull is true this container escapes the scroll flow and
          takes over the whole viewport as a full-screen map "page", per
          user request 2026-08-03. Inline mode is unchanged. */}
      <div style={{ padding: '0 8px', position: 'relative' }}>
        {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'grid', placeItems: 'center',
            color: 'var(--brand-ink-mute)', fontSize: 12, padding: 24, textAlign: 'center',
            background: 'var(--brand-bg2)',
          }}>
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set — map preview disabled.
          </div>
        )}
        <GoogleLiveMap
          city={trip?.location ?? null}
          activities={activities}
          dayKey={selectedDay}
          geo={geo}
          // Fill the remaining viewport height below the sticky chrome
          // (top-bar ~96 px + day-pill row ~52 px) so the map fits the
          // screen minus the locked header, per user request 2026-08-03.
          // 100dvh keeps it responsive to iOS Safari's dynamic toolbar.
          height="calc(100dvh - env(safe-area-inset-top) - 148px)"
          fullscreen={false}
          // Add-stop from the search-hydrated info card, which now hands
          // us pre-resolved coords + a place label — no need for the
          // map-click seeding path the old "+ Add stop" pill used.
          onAddStopFromSearch={(coords, label) => {
            setAddStopCoords(coords);
            setAddStopOpen(true);
            // Pre-seed the modal title so the user doesn't retype the
            // place they just searched for. Read by AddStopModal.
            if (label && typeof window !== 'undefined') {
              try { window.sessionStorage.setItem('geknee:add-stop-seed-label', label); } catch {}
            }
          }}
        />
        {/* "Enable location" chip — appears when we don't have a fix.
            Powers walk-time ETAs and centers the route on where you are.
            Sits along the bottom so it doesn't collide with the top pills. */}
        {geoStatus !== 'granted' && (
          <button
            onClick={() => requestGeolocation()}
            disabled={geoStatus === 'pending'}
            aria-label="Use my current location for routing"
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: mapFull ? 'calc(env(safe-area-inset-bottom) + 20px)' : 20,
              background: geoStatus === 'denied' ? 'rgba(248,113,113,0.16)' : 'rgba(125,211,252,0.16)',
              color: geoStatus === 'denied' ? 'var(--brand-danger, #f87171)' : 'var(--brand-accent-2, #7dd3fc)',
              border: `1px solid ${geoStatus === 'denied' ? 'rgba(248,113,113,0.55)' : 'rgba(125,211,252,0.55)'}`,
              borderRadius: 999,
              padding: '10px 16px',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: geoStatus === 'pending' ? 'wait' : 'pointer',
              WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              opacity: geoStatus === 'pending' ? 0.7 : 1,
              zIndex: 3,
            }}
          >
            {String.fromCodePoint(0x1F4CD)}
            {geoStatus === 'pending' ? ' Locating…' : geoStatus === 'denied' ? ' Location denied — enable in Settings' : ' Use my location for routing'}
          </button>
        )}
        {/* Save-for-offline CTA. Web/PWA can't programmatically download
            Google Maps tiles (Google TOS), so this deep-links into the
            Google Maps app on iOS/Android — once open, the user taps
            "Download" on the area card to save offline. On desktop the
            link opens maps.google.com with the destination preselected.
            True automatic download triggered by a Gmail-detected flight
            booking is queued for the native (Capacitor) build. */}
        {trip?.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trip.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              right: 36, bottom: 14,
              background: 'rgba(10, 10, 31, 0.92)',
              color: 'var(--brand-ink)',
              border: '1px solid var(--brand-border-hi)',
              borderRadius: 10,
              padding: '8px 12px',
              fontFamily: MONO, fontSize: 10, fontWeight: 600,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            ⤓ Save offline
          </a>
        )}
      </div>

      {/* ── Pack for today — pinned above the LEAVE-BY hero because
          "what should I bring today" is the first question every
          morning. Dismissible per-day so travelers close it once
          they've left the hotel. */}
      {/* ── Stop schedule + weather + after-that. Moved directly below
          the map 2026-08-04 per user feedback so the three glanceable
          "what's-next" cards are the first thing under the map.
          gridTemplateColumns:minmax(0,1fr) plus per-row min-width:0
          keeps the horizontally-scrolling day timeline + weather
          hourly strips from pushing the whole page wider than the
          viewport — they scroll INSIDE their own row instead. */}
      <div style={{
        padding: '18px 8px 0',
        display: 'grid', gap: 14,
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <DayTimeline activities={activities} currentClock={currentClock} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <WeatherAlertCard
            day={currentWeather?.forecast?.[0] ?? null}
            current={currentWeather?.current ?? null}
            hourly={currentWeather?.hourly ?? null}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <NextStopCard next={activities[nextIdx + 1] ?? null} />
        </div>
      </div>

      <div style={{ padding: '18px 8px 0' }}>
        <PackForTodayCard
          tripId={tripId ?? ''}
          day={currentWeather?.forecast?.[0] ?? null}
          windKph={currentWeather?.current?.windKph ?? null}
        />
      </div>

      {/* ── Hero LEAVE-BY card ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 8px 0' }}>
        <LeaveByCard
          next={nextActivity}
          etaMin={etaMin}
          leaveBy={leaveByText}
          coords={nextCoords}
          tripTimezone={trip?.timezone}
        />
      </div>

      {/* ── Quick capture (photo + note) pinned to the hero card. Auto-
          tags with time, place, temperature. Persists to localStorage
          for MVP; server backfill lands in a follow-up. */}
      <div style={{ padding: '10px 8px 0' }}>
        <QuickCaptureRow
          tripId={tripId ?? ''}
          place={nextActivity?.place ?? nextActivity?.name ?? null}
          tempC={currentWeather?.current?.tempC ?? null}
          lat={nextCoords?.lat ?? geo?.lat ?? null}
          lng={nextCoords?.lon ?? geo?.lon ?? null}
        />
      </div>

      {/* ── Destination insight (Wikipedia-backed history/context) ─── */}
      <div style={{ padding: '20px 8px 0' }}>
        <PlaceInsightCard place={nextActivity?.place ?? null} city={trip?.location ?? null} />
      </div>

      {/* ── Curated landmark guide (offline-safe, deeper than Wikipedia
          summaries — voice + tips + best-time). Silent when we don't
          have an entry for the landmark. */}
      <div style={{ padding: '14px 8px 0' }}>
        <LandmarkGuideCard place={nextActivity?.place ?? null} />
      </div>

      {/* ── Skip-the-line ticket links for the next stop. Only renders
          when we have curated ticket data AND at least one ticket is
          still bookable for today. */}
      <div style={{ padding: '14px 8px 0' }}>
        <SkipLineCard place={nextActivity?.place ?? null} etaMin={etaMin} />
      </div>

      {/* ── Country cheat-sheet: money + tipping + tap water + power ─
          Priority-2 for a traveler in-the-moment. Silent when we don't
          have a curated entry for the country (keeps unsupported markets
          from showing "—" placeholders). */}
      <div style={{ padding: '14px 8px 0' }}>
        <CountryQuickFactsCard facts={factsFor(countryCode)} />
      </div>

      {/* ── At-this-place: activity-type-aware etiquette + tips. */}
      <div style={{ padding: '14px 8px 0' }}>
        <AtThisPlaceCard activity={nextActivity} />
      </div>

      {/* ── Today's local color: markets / festivals happening RIGHT NOW.
          Silent when we have no curated data for the city so unsupported
          markets don't get a lonely empty state. */}
      <div style={{ padding: '14px 8px 0' }}>
        <LocalColorCard city={trip?.location ?? null} />
      </div>

      {/* ── Photo-window fusion — fires only when golden hour aligns with
          a clear-sky forecast AND the next stop is a curated landmark.
          The rare confluence makes this a "drop everything and go" card. */}
      <div style={{ padding: '14px 8px 0' }}>
        <PhotoWindowCard
          lat={nextCoords?.lat ?? geo?.lat ?? null}
          lng={nextCoords?.lon ?? geo?.lon ?? null}
          place={nextActivity?.place ?? null}
          conditions={currentWeather?.current?.conditionsText ?? null}
          etaMin={etaMin}
          now={new Date()}
        />
      </div>
      {/* ── Three phrases every traveler should know. */}
      <div style={{ padding: '14px 8px 0' }}>
        <LocalPhrasesCard facts={factsFor(countryCode)} />
      </div>

      {/* ── Crowds (arrival-slot aware) — stays down here since it's a
          "should we go" nudge, not a schedule glance. */}
      <div style={{ padding: '20px 8px 0' }}>
        <CrowdsCard placeName={nextActivity?.place ?? null} placeCoords={nextCoords ?? geo} etaMin={etaMin} />
      </div>

      {/* ── Daily pulse — trip day + spend + captures. Above the budget
          tracker because it's the glanceable summary; the tracker
          itself is the drill-down. */}
      {tripId && (
        <div style={{ padding: '20px 8px 0' }}>
          <DailyPulseCard tripId={tripId} dayInfo={dayInfo} />
        </div>
      )}

      {/* ── Live budget tracker ────────────────────────────────────────── */}
      {tripId && (
        <div style={{ padding: '14px 8px 0' }}>
          <BudgetTracker tripId={tripId} />
        </div>
      )}

      {/* ── Safety (moved to the bottom 2026-08-03 per user feedback —
          it's a break-glass utility, not something you glance at on
          every session; belongs after the day plan + spend, not
          competing with NEXT / WEATHER / CROWDS above the fold). */}
      <div style={{ padding: '20px 8px 0' }}>
        <SafetyCard
          countryCode={countryCode}
          anchor={geo ? { lat: geo.lat, lng: geo.lon } : null}
          online={online}
        />
      </div>

      {/* ── Evening journal prompt — moved to the very bottom 2026-08-04
          per user feedback. Reflective content belongs after the day's
          done, not fighting for space with morning-glance widgets. */}
      <div style={{ padding: '20px 8px 24px' }}>
        <JournalPromptCard
          tripId={tripId ?? ''}
          place={nextActivity?.place ?? nextActivity?.name ?? trip?.location ?? null}
          tempC={currentWeather?.current?.tempC ?? null}
          lat={nextCoords?.lat ?? geo?.lat ?? null}
          lng={nextCoords?.lon ?? geo?.lon ?? null}
        />
      </div>

      {loadingTrip && (
        <div style={{ padding: '24px 22px', color: 'var(--brand-ink-mute)', fontSize: 12 }}>
          Loading trip…
        </div>
      )}

      {/* AI re-plan modal. Single write to TripDraft.itinerary updates both
          this live page and the /plan/[tripId]/itinerary page (both read
          the same field). */}
      {addStopOpen && tripId && (
        <AddStopModal
          tripId={tripId}
          city={trip?.location ?? null}
          day={selectedDay}
          initialCoords={addStopCoords}
          // Pre-seeded from the search-hydrated info card via
          // sessionStorage so we don't have to thread state up + down.
          // Cleared on read so it only applies once.
          initialPlaceName={(() => {
            if (typeof window === 'undefined') return undefined;
            try {
              const seed = window.sessionStorage.getItem('geknee:add-stop-seed-label');
              if (seed) window.sessionStorage.removeItem('geknee:add-stop-seed-label');
              return seed ?? undefined;
            } catch { return undefined; }
          })()}
          onSaved={(newItinerary) => {
            setItinerary(newItinerary);
            setAddStopOpen(false);
            setAddStopCoords(null);
          }}
          onClose={() => { setAddStopOpen(false); setAddStopCoords(null); }}
        />
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.6); opacity: 0.5; }
        }
        @keyframes routeDash {
          to { stroke-dashoffset: -32; }
        }
        /* Hard-lock body + html against horizontal scroll while the
           live-trip page is mounted 2026-08-04. Any inner scrollable
           strip (day stops, weather hourly) still scrolls its own
           overflow — this just prevents the whole viewport from ever
           panning right when a child accidentally reports wide. */
        html, body { overflow-x: hidden !important; max-width: 100vw; }
      `}</style>
    </div>
  );
}


function MiniTransitCard() {
  const [mode, setMode] = useState<'walk' | 'bus'>('walk');
  return (
    <div style={{
      pointerEvents: 'auto',
      background: 'rgba(13,13,36,0.85)', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--brand-border)', borderRadius: 12,
      padding: '10px 14px', minWidth: 160,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--brand-ink-mute)', marginBottom: 6 }}>
        TRANSIT
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['walk', 'bus'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            background: mode === m ? 'rgba(167,139,250,0.16)' : 'transparent',
            border: `1px solid ${mode === m ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
            color: mode === m ? 'var(--brand-accent)' : 'var(--brand-ink-dim)',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
            textTransform: 'capitalize', cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
        {mode === 'walk' ? '14 min · 1.1 km' : '6 min · bus 5 line'}
      </div>
    </div>
  );
}

// ─── Hero LEAVE-BY card ─────────────────────────────────────────────────────

function LeaveByCard({
  next, etaMin, leaveBy, coords, tripTimezone,
}: {
  next: Activity | null;
  etaMin: number | null;
  leaveBy: { leaveAt: Date; minsToLeave: number } | null;
  coords: Geo | null;
  tripTimezone?: string | null;
}) {
  const tripTz = useTripTimezone(tripTimezone);
  // Pull a clean place-name pair out of the activity body so we can render
  // "<verb> at <Place>" with the place in italic accent.
  const split = (() => {
    if (!next) return null;
    const m = next.name.match(/^(.*?)(?:\s+(?:at|in)\s+)([A-Z][\wÀ-ſ'’\- ]{2,40})\.?$/);
    if (m) return { lead: m[1].trim(), place: m[2].trim() };
    return { lead: next.name.replace(/[.]$/, ''), place: '' };
  })();

  const quest = next ? matchMonumentQuest(next.place ?? next.name) : null;

  const stamp = (() => {
    if (!next) return 'WAITING ON NEXT STOP';
    if (leaveBy && leaveBy.minsToLeave > 0) {
      return `${String.fromCodePoint(0x2728)} LEAVE IN ${leaveBy.minsToLeave} MIN · TO MAKE ${next.display}`;
    }
    if (leaveBy && leaveBy.minsToLeave === 0) {
      return `${String.fromCodePoint(0x2728)} LEAVE NOW · ${next.display}`;
    }
    return `${String.fromCodePoint(0x2728)} NEXT · ${next.display}`;
  })();

  const detail = (() => {
    if (!next) return 'No more activities scheduled for today. Soak it in.';
    const eta = etaMin != null ? `${etaMin} min walk` : 'walk time pending';
    const leaveAt = leaveBy
      ? new Intl.DateTimeFormat(undefined, {
          timeZone: tripTz,
          hour: 'numeric',
          minute: '2-digit',
        }).format(leaveBy.leaveAt)
      : null;
    return leaveAt
      ? `${eta} from your current spot. Leaving by ${leaveAt} gives you a ~5 min buffer.`
      : `${eta} from your current spot.`;
  })();

  const navHref = coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lon}&travelmode=walking`
    : null;

  return (
    <div style={{
      // Richer geknee-brand hero surface (2026-08-03 polish per user
      // feedback that the page looked plain). Two-stop diagonal gradient
      // from lavender → sky, an outer purple glow ring, a fine white
      // 1-px inner highlight along the top, and a hairline accent line
      // on the left rail so the card reads like a distinct feature card
      // rather than a plain outlined box.
      position: 'relative',
      background: `linear-gradient(135deg,
        rgba(167,139,250,0.28) 0%,
        rgba(125,211,252,0.18) 55%,
        rgba(52,211,153,0.10) 100%)`,
      border: '1px solid var(--brand-border-hi)',
      borderRadius: 20,
      padding: '22px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 18, flexWrap: 'wrap',
      boxShadow: `
        0 0 0 1px rgba(255,255,255,0.05) inset,
        0 20px 40px -20px rgba(167,139,250,0.55),
        0 8px 24px rgba(0,0,0,0.4)
      `,
      overflow: 'hidden',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {quest && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999,
            background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 22%, transparent)',
            border: '1.5px solid color-mix(in srgb, var(--brand-gold, #f59e0b) 55%, transparent)',
            boxShadow: '0 0 24px color-mix(in srgb, var(--brand-gold, #f59e0b) 35%, transparent)',
            marginBottom: 10,
          }}>
            <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{String.fromCodePoint(0x1F3C6)}</span>
            <span style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
              color: 'var(--brand-gold, #f59e0b)', fontWeight: 800,
              textTransform: 'uppercase',
            }}>QUEST · UNLOCKS {quest.name.toUpperCase()}</span>
          </div>
        )}
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
          color: 'var(--brand-accent)', fontWeight: 700, marginBottom: 8,
        }}>
          {stamp}
        </div>
        <h2 style={{
          margin: 0,
          // Downsized from clamp(28px, 4vw, 44px) 2026-08-03. On a 393-px
          // iPhone the 4vw floor still hit 28 px and long activity names
          // wrapped 15+ lines, pushing everything else off-screen.
          // clamp(19px, 4.6vw, 24px) keeps display prominence on wide
          // devices while staying under 3 lines for typical activity
          // names on mobile. Line-clamp: 3 lines with ellipsis — full
          // detail already lives in the subtitle just below.
          fontFamily: DISPLAY,
          fontSize: 'clamp(19px, 4.6vw, 24px)',
          fontWeight: 500, letterSpacing: '-0.015em', lineHeight: 1.2,
          color: 'var(--brand-ink)',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {!split ? 'Day on rails.' : (
            <>
              {split.lead}{' '}
              {split.place && <em style={{ fontStyle: 'italic', color: 'var(--brand-accent)' }}>{split.place}</em>}.
            </>
          )}
        </h2>
        <div style={{
          marginTop: 10, fontSize: 13, lineHeight: 1.5,
          color: 'var(--brand-ink-dim)', maxWidth: 480,
        }}>
          {detail}
        </div>
      </div>
      {navHref ? (
        <a href={navHref} target="_blank" rel="noopener noreferrer" style={{
          flexShrink: 0,
          background: 'var(--brand-accent)',
          color: 'var(--brand-bg)',
          border: 'none', borderRadius: 14,
          padding: '14px 22px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'pointer', textDecoration: 'none',
          boxShadow: '0 8px 24px rgba(167,139,250,0.35)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {String.fromCodePoint(0x2197)} Navigate
        </a>
      ) : (
        <button disabled style={{
          flexShrink: 0,
          background: 'rgba(167,139,250,0.25)',
          color: 'var(--brand-bg)',
          border: 'none', borderRadius: 14,
          padding: '14px 22px',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'not-allowed', opacity: 0.55,
        }}>
          {String.fromCodePoint(0x2197)} Navigate
        </button>
      )}
    </div>
  );
}

// ─── Context cards ──────────────────────────────────────────────────────────

// PlaceInsightCard — pulls a short history/description of the next stop
// from the free Wikipedia REST summary endpoint. No API key, generous
// rate limits, works globally. Adds real editorial context ("St. Ludmila
// Church, Neo-Gothic church consecrated 1892, Peter Parler's disciple
// designed the twin spires...") to a page that was mostly "leave in 18
// min" chrome. Silent + hidden when no article matches.
function PlaceInsightCard({ place, city }: { place: string | null; city: string | null }) {
  const [data, setData] = useState<{
    title: string; extract: string; description: string | null; thumb: string | null; url: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!place && !city) return;
    // Prefer the specific place; fall back to the trip city so a card
    // still renders when the itinerary uses a poetic activity name.
    const query = (place || city || '').trim();
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
        if (!res.ok) { if (!cancelled) { setData(null); setLoading(false); } return; }
        const j = await res.json() as {
          title?: string; extract?: string; description?: string;
          thumbnail?: { source?: string };
          content_urls?: { desktop?: { page?: string } };
        };
        if (cancelled) return;
        setData({
          title: j.title || query,
          extract: j.extract || '',
          description: j.description || null,
          thumb: j.thumbnail?.source ?? null,
          url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        });
      } catch { if (!cancelled) setData(null); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [place, city]);
  if (loading && !data) {
    return (
      <CardShell accent="var(--brand-accent-2, #7dd3fc)" label="DESTINATION FACTS">
        <div style={{ fontSize: 13, color: 'var(--brand-ink-dim)' }}>Loading history and context…</div>
      </CardShell>
    );
  }
  if (!data || !data.extract) return null;
  return (
    <CardShell accent="var(--brand-accent-2, #7dd3fc)" label={`ABOUT · ${data.title.toUpperCase()}`}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {data.thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumb} alt=""
            loading="lazy" decoding="async"
            style={{
              flexShrink: 0,
              width: 88, height: 88, borderRadius: 10,
              objectFit: 'cover',
              border: '1px solid var(--brand-border)',
            }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          {data.description && (
            <div style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: 'var(--brand-ink-mute)', textTransform: 'uppercase', marginBottom: 6,
            }}>
              {data.description}
            </div>
          )}
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: 'var(--brand-ink)',
            display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {data.extract}
          </div>
          <a href={data.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block', marginTop: 8,
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em',
              color: 'var(--brand-accent-2, #7dd3fc)', textDecoration: 'none',
              padding: '4px 0',
            }}>
            READ MORE {String.fromCodePoint(0x2197)}
          </a>
        </div>
      </div>
    </CardShell>
  );
}

// Priority-2 card added 2026-08-03: local money + tipping. Static
// country cheat-sheet — no API call — so it lands instantly. Rendering
// gated: hidden when no cheat-sheet entry exists (avoids showing "—"
// placeholders for unsupported countries).
function CountryQuickFactsCard({ facts }: { facts: CountryFacts | null }) {
  if (!facts) return null;
  const { currency, tipping, cashVsCard, waterSafe, plug } = facts;
  return (
    <CardShell accent="var(--brand-gold, #f59e0b)" label={`MONEY & BASICS · ${facts.name.toUpperCase()}`}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, color: 'var(--brand-ink)', lineHeight: 1 }}>
          {currency.symbol}1 <span style={{ color: 'var(--brand-ink-mute)', fontSize: 12 }}>=</span>{' '}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            ${(currency.usdRate).toFixed(currency.usdRate < 0.01 ? 5 : 2)}
          </span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--brand-ink-mute)', letterSpacing: '0.12em' }}>
          {currency.code}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 6, fontSize: 12, lineHeight: 1.4 }}>
        <div><span style={{ color: 'var(--brand-ink-mute)' }}>Tipping · </span><span style={{ color: 'var(--brand-ink)' }}>{tipping}</span></div>
        <div><span style={{ color: 'var(--brand-ink-mute)' }}>Payment · </span><span style={{ color: 'var(--brand-ink)' }}>{cashVsCard}</span></div>
        <div>
          <span style={{ color: 'var(--brand-ink-mute)' }}>Tap water · </span>
          <span style={{ color: waterSafe ? 'var(--brand-success)' : 'var(--brand-danger, #f87171)' }}>
            {waterSafe ? 'Safe to drink' : 'Do not drink — bottled only'}
          </span>
        </div>
        <div><span style={{ color: 'var(--brand-ink-mute)' }}>Power · </span><span style={{ color: 'var(--brand-ink)' }}>{plug}</span></div>
      </div>
      {facts.cultureNote && (
        <div style={{
          marginTop: 10, padding: '8px 10px',
          borderRadius: 8,
          background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-gold, #f59e0b) 30%, transparent)',
          fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)',
        }}>
          {String.fromCodePoint(0x1F4A1)} {facts.cultureNote}
        </div>
      )}
    </CardShell>
  );
}

// Priority-3 phrase card. Three phrases every traveler should know
// (hello, thanks, where's the bathroom). Grouped in a mono monospace
// pill row so the syllables read as pronunciation prompts.
function LocalPhrasesCard({ facts }: { facts: CountryFacts | null }) {
  if (!facts) return null;
  return (
    <CardShell accent="var(--brand-accent-2, #7dd3fc)" label={`SAY IT LOCAL · ${facts.name.toUpperCase()}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {([
          ['HELLO', facts.phrases.hello],
          ['THANK YOU', facts.phrases.thanks],
          ['BATHROOM?', facts.phrases.bathroom],
        ] as const).map(([label, phrase]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em',
              color: 'var(--brand-ink-mute)', minWidth: 78, textAlign: 'right',
            }}>{label}</div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 16, color: 'var(--brand-ink)', lineHeight: 1.25,
            }}>{phrase}</div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// PackForTodayCard — turns the daily weather forecast into a concrete
// packing suggestion. Zero API cost (uses the WeatherDay we already
// have) and answers the "what should I bring today" question every
// traveler asks around 8 AM before heading out.
function PackForTodayCard({ tripId, day, windKph }: { tripId: string; day: WeatherDay | null; windKph: number | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);
  const dismissKey = tripId ? `geknee:pack-dismissed:${tripId}:${todayIsoDate()}` : null;

  // Hydrate dismiss state on mount so SSR doesn't render a card the
  // user has already closed today.
  useEffect(() => {
    if (!dismissKey || typeof window === 'undefined') { setReady(true); return; }
    try { setDismissed(window.localStorage.getItem(dismissKey) === '1'); } catch {}
    setReady(true);
  }, [dismissKey]);

  function handleDismiss() {
    if (!dismissKey || typeof window === 'undefined') { setDismissed(true); return; }
    try { window.localStorage.setItem(dismissKey, '1'); } catch {}
    setDismissed(true);
  }

  if (!day || !ready || dismissed) return null;
  const hi = day.highC ?? null;
  const lo = day.lowC ?? null;
  const rain = day.precipPct;
  const cond = day.conditionsText.toLowerCase();
  const items: Array<{ icon: string; text: string }> = [];

  // Rain intensity ladder — precipPct is Google's chance-of-rain, so we
  // use it as a proxy for severity when other data is missing.
  if (rain >= 75) items.push({ icon: String.fromCodePoint(0x1F327), text: 'Heavy rain likely — full rain shell + waterproof shoes. Consider a cab.' });
  else if (rain >= 40) items.push({ icon: String.fromCodePoint(0x2602), text: 'Umbrella or light rain jacket' });
  // Heat ladder
  if (hi != null && hi >= 34) items.push({ icon: String.fromCodePoint(0x1F975), text: 'Extreme heat — avoid direct sun 12-3 PM, seek shade every 20 min.' });
  else if (hi != null && hi >= 28) items.push({ icon: String.fromCodePoint(0x1F31E), text: 'Sunscreen SPF 30+, hat, sunglasses' });
  if (hi != null && hi >= 24) items.push({ icon: String.fromCodePoint(0x1F4A7), text: 'Refillable water bottle (1 L+)' });
  // Cold ladder
  if (lo != null && lo <= -5) items.push({ icon: String.fromCodePoint(0x1F976), text: 'Brutal cold — thermal base layer + hat + gloves + covered ears.' });
  else if (lo != null && lo <= 2) items.push({ icon: String.fromCodePoint(0x1F9E4), text: 'Gloves + insulated jacket' });
  else if (lo != null && lo <= 10) items.push({ icon: String.fromCodePoint(0x1F9E5), text: 'Warm layer for evening' });
  // Snow
  if (/snow/i.test(cond)) items.push({ icon: String.fromCodePoint(0x1F97E), text: 'Waterproof boots with grip' });
  // Wind (using measured windKph, not conditions string)
  if (windKph != null && windKph >= 45) items.push({ icon: String.fromCodePoint(0x1F32C), text: `Gale-force wind (${Math.round(windKph)} km/h) — hats off, hoods up, avoid exposed viewpoints.` });
  else if (windKph != null && windKph >= 25) items.push({ icon: String.fromCodePoint(0x1F343), text: `Windy (${Math.round(windKph)} km/h) — hair-ties + tie down loose items.` });
  // Walking shoes: default suggestion for good weather
  if (/wind/i.test(cond) || (hi != null && hi >= 20 && rain < 30))
    items.push({ icon: String.fromCodePoint(0x1F45F), text: 'Comfortable walking shoes' });
  // Universal small kit
  items.push({ icon: String.fromCodePoint(0x1F4F1), text: 'Portable charger + charging cable' });
  if (items.length === 0) return null;
  return (
    <div style={{ position: 'relative' }}>
      <CardShell accent="var(--brand-accent, #a78bfa)" label="PACK FOR TODAY">
        <div style={{ display: 'grid', gap: 6 }}>
          {items.slice(0, 6).map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: 'var(--brand-ink)' }}>
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{it.icon}</span>
              <span>{it.text}</span>
            </div>
          ))}
        </div>
      </CardShell>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss for today"
        style={{
          position: 'absolute', top: 8, right: 10,
          background: 'transparent', border: 'none', padding: 4,
          color: 'var(--brand-ink-dim)', cursor: 'pointer',
          fontSize: 16, lineHeight: 1,
        }}
      >×</button>
    </div>
  );
}

// AtThisPlaceCard — activity-type-aware etiquette + practical tips.
// Pattern-matches keywords in the activity name against a small tip
// table and shows the top 3 matches. When nothing matches, hidden.
function AtThisPlaceCard({ activity }: { activity: Activity | null }) {
  if (!activity) return null;
  const name = (activity.name + ' ' + (activity.place ?? '')).toLowerCase();
  const rules: Array<{ match: RegExp; icon: string; text: string }> = [
    { match: /church|cathedral|basilica|chapel|mosque|synagogue|temple|shrine/, icon: String.fromCodePoint(0x1F9E3), text: 'Modest dress — shoulders + knees covered. Remove hats indoors.' },
    { match: /mosque/, icon: String.fromCodePoint(0x1F45E), text: 'Shoes off at the entrance. Women often provided a headscarf.' },
    { match: /museum|gallery|exhibit/, icon: String.fromCodePoint(0x1F392), text: 'Coat check + free bag storage; anything > 15 L usually must be checked.' },
    { match: /museum|gallery|palace|castle/, icon: String.fromCodePoint(0x1F4F5), text: 'Flash + tripods usually banned. Phone photos OK in most rooms.' },
    { match: /park|garden|hill|viewpoint|forest|trail|hike/, icon: String.fromCodePoint(0x1F6B0), text: 'Bring water — indoor cafés often the only refill points inside.' },
    { match: /market|bazaar|souk/, icon: String.fromCodePoint(0x1F4B5), text: 'Cash preferred. Haggle only where prices aren\'t posted.' },
    { match: /castle|fort|fortress/, icon: String.fromCodePoint(0x1F45F), text: 'Rough cobbles + stairs. Wear grippy shoes; slippery when wet.' },
    { match: /café|coffee|espresso|coffeehouse/, icon: String.fromCodePoint(0x2615), text: 'Sit down = table service. Standing at the bar is usually cheaper.' },
    { match: /restaurant|dinner|lunch|dine|trattoria|bistro/, icon: String.fromCodePoint(0x1F37D), text: 'Ask for the bill — servers don\'t bring it unprompted in most of Europe.' },
    { match: /bridge|pont|puente|brücke/, icon: String.fromCodePoint(0x1F304), text: 'Best photo light: golden hour, 30 min before sunset.' },
    { match: /viewpoint|lookout|observation|belvedere/, icon: String.fromCodePoint(0x1F576), text: 'Morning = clearer air; afternoon = warmer light.' },
    { match: /river|canal|lake|beach|coast|sea|ocean/, icon: String.fromCodePoint(0x1F97D), text: 'Layered clothing — wind off the water drops perceived temp 5-8°.' },
    { match: /night|nightlife|club|bar|pub/, icon: String.fromCodePoint(0x1F511), text: 'Cover charges common after 11 PM. Keep an ID copy on your phone.' },
    { match: /train|station|metro|subway|tram|bus/, icon: String.fromCodePoint(0x1F39F), text: 'Tap-to-pay contactless usually works. Validate paper tickets at platform machines.' },
    { match: /walk|stroll|explore|wander|neighborhood/, icon: String.fromCodePoint(0x1F45F), text: 'Comfortable shoes, phone map cached offline. 5-10 km is easy to underestimate.' },
    { match: /vinohrady/, icon: String.fromCodePoint(0x1F338), text: 'Elegant late-19th-century district — best around the Riegrovy Sady sunset lawn.' },
  ];
  const matches = rules.filter((r) => r.match.test(name)).slice(0, 3);
  if (matches.length === 0) return null;
  return (
    <CardShell accent="var(--brand-success, #7cff97)" label={`AT THIS PLACE · ${(activity.place ?? activity.name).slice(0, 30).toUpperCase()}`}>
      <div style={{ display: 'grid', gap: 8 }}>
        {matches.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13, lineHeight: 1.4, color: 'var(--brand-ink)' }}>
            <span aria-hidden style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{m.icon}</span>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// LandmarkGuideCard — hand-curated ~1-paragraph write-up + fun facts +
// best-time-to-visit for landmarks in lib/landmarkGuides.ts. Text-only
// (audio deferred). Silent when the landmark isn't in the guide list, so
// off-list stops don't get an empty card.
function LandmarkGuideCard({ place }: { place: string | null }) {
  const guide: LandmarkGuide | null = useMemo(() => guideFor(place), [place]);
  const [expanded, setExpanded] = useState(false);
  if (!guide || !place) return null;

  const introShort = guide.intro.length > 220 && !expanded
    ? guide.intro.slice(0, 210).trimEnd() + '…'
    : guide.intro;

  return (
    <CardShell accent="var(--brand-accent-2, #7dd3fc)" label={`GUIDE · ${place.slice(0, 30).toUpperCase()}`}>
      <div style={{
        fontSize: 13, lineHeight: 1.5, color: 'var(--brand-ink)',
      }}>{introShort}</div>
      {guide.intro.length > 220 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            marginTop: 6, padding: 0, background: 'transparent', border: 'none',
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
            color: 'var(--brand-accent-2, #7dd3fc)', cursor: 'pointer',
            textTransform: 'uppercase', fontWeight: 700,
          }}
        >
          {expanded ? '— Read less' : '+ Read more'}
        </button>
      )}
      <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
        {guide.facts.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, lineHeight: 1.45, color: 'var(--brand-ink)' }}>
            <span aria-hidden style={{ fontSize: 10, lineHeight: 1, color: 'var(--brand-accent-2, #7dd3fc)', flexShrink: 0 }}>◆</span>
            <span>{f}</span>
          </div>
        ))}
      </div>
      {(guide.bestTime || guide.tip) && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {guide.bestTime && (
            <div style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-gold, #f59e0b) 30%, transparent)',
              fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)',
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
                color: 'var(--brand-gold, #f59e0b)', fontWeight: 700, marginRight: 6,
              }}>BEST TIME</span>
              {guide.bestTime}
            </div>
          )}
          {guide.tip && (
            <div style={{
              padding: '6px 10px', borderRadius: 8,
              background: 'color-mix(in srgb, var(--brand-success, #7cff97) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-success, #7cff97) 30%, transparent)',
              fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)',
            }}>
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
                color: 'var(--brand-success, #7cff97)', fontWeight: 700, marginRight: 6,
              }}>INSIDER</span>
              {guide.tip}
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
}

// DailyPulseCard — glanceable "how's the trip going" summary. Trip day
// number + today's spend + captures. Steps + distance are intentionally
// omitted for MVP — no motion plugin installed and web-fallback wants us
// to hide rows we can't populate rather than fake them.
function DailyPulseCard({ tripId, dayInfo }: {
  tripId: string;
  dayInfo: { day: number; total: number };
}) {
  const [todaySpend, setTodaySpend] = useState<{ amount: number; count: number } | null>(null);
  const [captures, setCaptures] = useState<{ notes: number; photos: number }>({ notes: 0, photos: 0 });

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    fetch(`/api/trips/${tripId}/expenses`)
      .then(r => r.ok ? r.json() : { expenses: [] })
      .then((d: { expenses?: Array<{ date: string; amount: number }> }) => {
        if (cancelled) return;
        const today = new Date().toISOString().slice(0, 10);
        const rows = (d.expenses ?? []).filter(e => e.date === today);
        setTodaySpend({
          amount: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
          count: rows.length,
        });
      })
      .catch(() => { if (!cancelled) setTodaySpend({ amount: 0, count: 0 }); });
    return () => { cancelled = true; };
  }, [tripId]);

  useEffect(() => {
    if (!tripId) return;
    const notes = loadNotes(tripId);
    const today = new Date().toDateString();
    const todays = notes.filter(n => new Date(n.createdAtMs).toDateString() === today);
    setCaptures({
      notes: todays.length,
      photos: todays.filter(n => !!n.photoDataUrl).length,
    });
  }, [tripId]);

  const dayLabel = dayInfo.total > 1
    ? `Day ${dayInfo.day} of ${dayInfo.total}`
    : `Day ${dayInfo.day}`;

  // Vibe copy for the trip stage.
  const vibe = (() => {
    if (dayInfo.total <= 1) return null;
    const pct = dayInfo.day / dayInfo.total;
    if (dayInfo.day === 1) return 'Day one. Fresh eyes.';
    if (dayInfo.day === dayInfo.total) return 'Last day. Squeeze it.';
    if (Math.abs(pct - 0.5) < 0.15) return 'Halfway through.';
    if (pct < 0.35) return 'Early days.';
    if (pct > 0.7) return 'The home stretch.';
    return null;
  })();

  return (
    <CardShell accent="var(--brand-accent, #a78bfa)" label="TODAY'S PULSE">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 26, color: 'var(--brand-ink)', lineHeight: 1 }}>
          {dayLabel}
        </div>
        {vibe && (
          <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', lineHeight: 1.3 }}>
            {vibe}
          </div>
        )}
      </div>

      <div style={{
        marginTop: 14,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 10,
      }}>
        <PulseStat
          label="SPENT TODAY"
          value={todaySpend == null ? '…' : (todaySpend.amount > 0 ? `$${todaySpend.amount.toFixed(0)}` : '—')}
          sublabel={todaySpend && todaySpend.count > 0 ? `${todaySpend.count} ${todaySpend.count === 1 ? 'entry' : 'entries'}` : 'No expenses yet'}
          tone="var(--brand-gold, #f59e0b)"
        />
        <PulseStat
          label="CAPTURES"
          value={captures.notes > 0 ? String(captures.notes) : '—'}
          sublabel={captures.photos > 0
            ? `${captures.photos} ${captures.photos === 1 ? 'photo' : 'photos'}`
            : captures.notes > 0 ? 'text only' : 'Nothing yet — capture something.'}
          tone="var(--brand-accent, #a78bfa)"
        />
        <PulseStat
          label="TRIP PROGRESS"
          value={dayInfo.total > 1 ? `${Math.round((dayInfo.day / dayInfo.total) * 100)}%` : '—'}
          sublabel={dayInfo.total > 1 ? `${Math.max(0, dayInfo.total - dayInfo.day)} days left` : 'Solo day'}
          tone="var(--brand-accent-2, #7dd3fc)"
        />
      </div>
    </CardShell>
  );
}

function PulseStat({ label, value, sublabel, tone }: {
  label: string;
  value: string;
  sublabel: string;
  tone: string;
}) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: `color-mix(in srgb, ${tone} 8%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 25%, transparent)`,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em',
        color: tone, fontWeight: 700, marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 22, color: 'var(--brand-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-mute)', marginTop: 3, lineHeight: 1.3 }}>
        {sublabel}
      </div>
    </div>
  );
}

// JournalPromptCard — evening (18:00+) prompt asking for one memorable
// moment from the day. Same storage as QuickCaptureRow but tagged
// kind='journal'. Dismissible per day so we don't nag.
function JournalPromptCard({ tripId, place, tempC, lat, lng }: {
  tripId: string;
  place: string | null;
  tempC: number | null;
  lat: number | null;
  lng: number | null;
}) {
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState(false);
  const [alreadyJournaled, setAlreadyJournaled] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tick the clock so the 6 PM threshold can fire without a page reload.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    setDismissed(isJournalDismissedToday(tripId, now));
    // Also consider "already journaled today" a soft dismiss — no need
    // to prompt again once the entry exists.
    const journaledToday = loadNotes(tripId).some(n => {
      const ts = new Date(n.createdAtMs);
      return n.kind === 'journal' && ts.toDateString() === now.toDateString();
    });
    setAlreadyJournaled(journaledToday);
  }, [tripId, now]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToScaledDataUrl(f);
    setPhoto(dataUrl);
    e.target.value = '';
  }

  function handleDismiss() {
    dismissJournalForToday(tripId, now);
    setDismissed(true);
  }

  async function handleSave() {
    const t = text.trim();
    if (!t && !photo) return;
    setSaving(true);
    const entry: NoteEntry = {
      id: newNoteId(),
      kind: 'journal',
      text: t || null,
      photoDataUrl: photo,
      createdAtMs: Date.now(),
      place, tempC, lat, lng,
    };
    saveNote(tripId, entry);
    setSaving(false);
    setDone(true);
    // Reset composer state after a short beat so the "Saved" flash reads.
    setTimeout(() => {
      setText(''); setPhoto(null); setDone(false);
    }, 1200);
  }

  const hour = now.getHours();
  // Show 18:00 – 23:59. Hide once dismissed or already journaled today.
  if (!tripId || hour < 18 || dismissed || alreadyJournaled) return null;

  return (
    <div style={{
      background: `linear-gradient(160deg,
        color-mix(in srgb, var(--brand-gold, #f59e0b) 14%, transparent) 0%,
        color-mix(in srgb, var(--brand-accent, #a78bfa) 8%, transparent) 60%,
        rgba(255,255,255,0.03) 100%)`,
      border: '1px solid var(--brand-border)',
      borderLeft: '3px solid var(--brand-gold, #f59e0b)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'grid', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{String.fromCodePoint(0x1F319)}</span>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
          color: 'var(--brand-gold, #f59e0b)', fontWeight: 700,
        }}>TONIGHT'S CAPTURE</div>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={handleDismiss}
          style={{
            background: 'transparent', border: 'none', padding: 2,
            color: 'var(--brand-ink-dim)', cursor: 'pointer', fontSize: 14,
            lineHeight: 1,
          }}
          aria-label="Dismiss for today"
        >×</button>
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 18, lineHeight: 1.3, color: 'var(--brand-ink)' }}>
        One thing that surprised you today?
      </div>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', lineHeight: 1.4 }}>
        Small moments fade fastest. A line here + a photo → your trip book writes itself.
      </div>
      {photo && (
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--brand-border)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A small moment, a stranger, a smell, a light…"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--brand-surface, rgba(255,255,255,0.06))',
          border: '1px solid var(--brand-border)',
          borderRadius: 8, padding: '10px 12px',
          color: 'var(--brand-ink)',
          fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45,
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={() => fileInputRef.current?.click()} style={secondaryBtnStyle}>
          <span aria-hidden style={{ marginRight: 6 }}>{String.fromCodePoint(0x1F4F7)}</span>
          {photo ? 'Retake' : 'Add photo'}
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || done || (!text.trim() && !photo)}
          style={{
            ...captureBtnStyle,
            background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 18%, transparent)',
            opacity: done ? 0.8 : (!text.trim() && !photo) ? 0.5 : 1,
          }}
        >
          {done ? `${String.fromCodePoint(0x2713)} Saved` : saving ? 'Saving…' : 'Add to journal'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFilePick}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}

// QuickCaptureRow — camera + note buttons pinned under the LEAVE-BY hero.
// Both actions auto-tag with time, place, temperature, and coords so
// entries are searchable/exportable later without asking the user to
// tag anything. Text-only when no photo, silent when both are blank.
function QuickCaptureRow({ tripId, place, tempC, lat, lng }: {
  tripId: string;
  place: string | null;
  tempC: number | null;
  lat: number | null;
  lng: number | null;
}) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [composing, setComposing] = useState<null | 'note' | 'photo'>(null);
  const [draftText, setDraftText] = useState('');
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate notes on mount.
  useEffect(() => {
    if (!tripId) return;
    setNotes(loadNotes(tripId));
  }, [tripId]);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setComposing('photo');
    const dataUrl = await fileToScaledDataUrl(f);
    setDraftPhoto(dataUrl);
    e.target.value = '';
  }

  async function commit(kind: 'quick' | 'journal' = 'quick') {
    const text = draftText.trim();
    if (!text && !draftPhoto) return;
    setSaving(true);
    const entry: NoteEntry = {
      id: newNoteId(),
      kind,
      text: text || null,
      photoDataUrl: draftPhoto,
      createdAtMs: Date.now(),
      place, tempC, lat, lng,
    };
    const next = saveNote(tripId, entry);
    setNotes(next);
    setDraftText('');
    setDraftPhoto(null);
    setComposing(null);
    setSaving(false);
  }

  function cancel() {
    setDraftText('');
    setDraftPhoto(null);
    setComposing(null);
  }

  function handleDelete(id: string) {
    setNotes(deleteNote(tripId, id));
  }

  const todayCount = notes.filter(n => {
    const ts = new Date(n.createdAtMs);
    return ts.toDateString() === new Date().toDateString();
  }).length;

  if (!tripId) return null;

  return (
    <div style={{
      background: 'linear-gradient(160deg, color-mix(in srgb, var(--brand-accent, #a78bfa) 6%, transparent) 0%, rgba(255,255,255,0.02) 60%)',
      borderRadius: 12,
      border: '1px solid var(--brand-border)',
      padding: 12,
      display: 'grid', gap: 10,
    }}>
      {/* Row of primary actions */}
      {!composing && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={captureBtnStyle}
          >
            <span aria-hidden style={{ marginRight: 6 }}>{String.fromCodePoint(0x1F4F7)}</span>
            Snap
          </button>
          <button
            type="button"
            onClick={() => setComposing('note')}
            style={captureBtnStyle}
          >
            <span aria-hidden style={{ marginRight: 6 }}>{String.fromCodePoint(0x270F, 0xFE0F)}</span>
            Note
          </button>
          <div style={{ flex: 1 }} />
          {todayCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              style={{
                background: 'transparent', border: 'none', padding: 4,
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
                color: 'var(--brand-ink-mute)', cursor: 'pointer',
              }}
            >
              {todayCount} TODAY {expanded ? '▲' : '▼'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilePick}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Composer */}
      {composing && (
        <div style={{ display: 'grid', gap: 8 }}>
          {draftPhoto && (
            <div style={{
              position: 'relative', borderRadius: 8, overflow: 'hidden',
              border: '1px solid var(--brand-border)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draftPhoto} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }} />
            </div>
          )}
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder={draftPhoto ? 'Caption (optional)…' : 'What just happened?'}
            rows={2}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--brand-surface, rgba(255,255,255,0.04))',
              border: '1px solid var(--brand-border)',
              borderRadius: 8, padding: '8px 10px',
              color: 'var(--brand-ink)',
              fontFamily: 'inherit', fontSize: 14, lineHeight: 1.4,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={cancel} style={secondaryBtnStyle}>Cancel</button>
            <div style={{ flex: 1 }} />
            {place && (
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: 'var(--brand-ink-mute)' }}>
                @ {place.slice(0, 20).toUpperCase()}
              </span>
            )}
            <button
              type="button"
              onClick={() => commit('quick')}
              disabled={saving || (!draftText.trim() && !draftPhoto)}
              style={{
                ...captureBtnStyle,
                opacity: (!draftText.trim() && !draftPhoto) ? 0.5 : 1,
                cursor: (!draftText.trim() && !draftPhoto) ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Today's captured entries (collapsed by default) */}
      {expanded && todayCount > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
          {notes.filter(n => new Date(n.createdAtMs).toDateString() === new Date().toDateString()).map((n) => (
            <NotePreview key={n.id} note={n} onDelete={() => handleDelete(n.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

const captureBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand-border)',
  background: 'color-mix(in srgb, var(--brand-accent, #a78bfa) 15%, transparent)',
  color: 'var(--brand-ink)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand-border)',
  background: 'transparent',
  color: 'var(--brand-ink-mute)',
  fontFamily: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

function NotePreview({ note, onDelete }: { note: NoteEntry; onDelete: () => void }) {
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(note.createdAtMs));
  return (
    <div style={{
      display: 'grid', gap: 6,
      padding: 10, borderRadius: 8,
      background: 'var(--brand-surface, rgba(255,255,255,0.03))',
      border: '1px solid var(--brand-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, color: 'var(--brand-ink-mute)' }}>
        <span style={{ fontFamily: MONO, letterSpacing: '0.14em' }}>{note.kind === 'journal' ? 'JOURNAL' : 'NOTE'} · {time}</span>
        <div style={{ flex: 1 }} />
        <button
          type="button" onClick={onDelete}
          style={{ background: 'transparent', border: 'none', color: 'var(--brand-ink-dim)', cursor: 'pointer', fontSize: 11 }}
          aria-label="Delete note"
        >×</button>
      </div>
      {note.photoDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={note.photoDataUrl} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
      )}
      {note.text && (
        <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--brand-ink)' }}>{note.text}</div>
      )}
      {(note.place || note.tempC != null) && (
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--brand-ink-mute)' }}>
          {note.place && `@ ${note.place.slice(0, 30).toUpperCase()}`}
          {note.place && note.tempC != null && ' · '}
          {note.tempC != null && `${Math.round(note.tempC)}°C`}
        </div>
      )}
    </div>
  );
}

// SkipLineCard — surfaces curated skip-the-line ticket links for the
// next landmark. Filters by `stillBookable(arrivalHour)` so we don't
// dangle a Louvre timed-entry link at 11 PM. Silent when no matches.
function SkipLineCard({ place, etaMin }: { place: string | null; etaMin: number | null }) {
  const tickets: SkipLineTicket[] = useMemo(() => ticketsFor(place), [place]);
  const arrivalHour = useMemo(() => {
    const now = new Date();
    if (etaMin != null && etaMin >= 0) {
      return new Date(now.getTime() + etaMin * 60 * 1000).getHours();
    }
    return now.getHours();
  }, [etaMin]);

  const bookable = useMemo(() => tickets.filter(t => stillBookable(t, arrivalHour)), [tickets, arrivalHour]);
  if (!bookable.length || !place) return null;

  const VENDOR_COLORS: Record<SkipLineTicket['vendor'], string> = {
    getyourguide: '#ff5533',
    viator:       '#328e28',
    tiqets:       '#0055ff',
    official:     '#a78bfa',
  };
  const VENDOR_LABELS: Record<SkipLineTicket['vendor'], string> = {
    getyourguide: 'GetYourGuide',
    viator:       'Viator',
    tiqets:       'Tiqets',
    official:     'Official',
  };

  return (
    <CardShell accent="var(--brand-danger, #f87171)" label={`SKIP THE LINE · ${place.slice(0, 24).toUpperCase()}`}>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-mute)', marginBottom: 10, lineHeight: 1.4 }}>
        Book ahead so you’re not the family standing in a two-hour queue.
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {bookable.map((t, i) => {
          const chipColor = VENDOR_COLORS[t.vendor];
          const priceStr = t.priceUsd != null ? `~$${t.priceUsd}` : null;
          return (
            <a
              key={i}
              href={t.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'grid', gap: 4,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid color-mix(in srgb, ${chipColor} 40%, var(--brand-border))`,
                background: `color-mix(in srgb, ${chipColor} 6%, transparent)`,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <div style={{
                  fontFamily: DISPLAY, fontSize: 14, lineHeight: 1.25,
                  color: 'var(--brand-ink)', flex: 1, minWidth: 0,
                }}>{t.label}</div>
                {priceStr && (
                  <div style={{
                    fontFamily: DISPLAY, fontSize: 15, color: 'var(--brand-ink)',
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>{priceStr}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
                  padding: '2px 6px', borderRadius: 4,
                  color: chipColor,
                  background: `color-mix(in srgb, ${chipColor} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${chipColor} 40%, transparent)`,
                  fontWeight: 700, textTransform: 'uppercase',
                }}>{VENDOR_LABELS[t.vendor]}</span>
                <span aria-hidden style={{ color: 'var(--brand-ink-dim)', fontSize: 11 }}>→</span>
                <span style={{ fontSize: 11, color: 'var(--brand-ink-mute)' }}>Book on {new URL(t.url).hostname.replace(/^www\./, '')}</span>
              </div>
              {t.note && (
                <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)' }}>
                  {t.note}
                </div>
              )}
            </a>
          );
        })}
      </div>
    </CardShell>
  );
}

// LocalColorCard — markets + festivals happening in the trip city TODAY.
// Reads from the hand-curated lib/localColorByCity.ts. Silent when the city
// has no entries so unsupported destinations don't render an empty row.
function LocalColorCard({ city }: { city: string | null }) {
  const items = useMemo(() => todaysHappenings(city, new Date()), [city]);
  if (!items.length) return null;

  const KIND_META: Record<LocalHappening['kind'], { icon: string; label: string }> = {
    market:    { icon: String.fromCodePoint(0x1F345), label: 'MARKET' },   // 🍅
    flea:      { icon: String.fromCodePoint(0x1F5FF), label: 'FLEA' },     // 🗿
    food:      { icon: String.fromCodePoint(0x1F374), label: 'FOOD' },     // 🍴
    festival:  { icon: String.fromCodePoint(0x1F389), label: 'FESTIVAL' }, // 🎉
    music:     { icon: String.fromCodePoint(0x1F3B7), label: 'MUSIC' },    // 🎷
    nightlife: { icon: String.fromCodePoint(0x1F303), label: 'NIGHTLIFE' },// 🌃
  };

  const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date()).toUpperCase();

  return (
    <CardShell accent="var(--brand-accent, #a78bfa)" label={`TODAY IN TOWN · ${dayName}`}>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((h, i) => {
          const meta = KIND_META[h.kind];
          const hasCoords = typeof h.lat === 'number' && typeof h.lng === 'number';
          const mapsUrl = hasCoords
            ? `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.place + ', ' + (city ?? ''))}`;
          return (
            <div key={i} style={{
              display: 'grid', gap: 4,
              paddingBottom: i === items.length - 1 ? 0 : 10,
              borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--brand-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>{meta.icon}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
                  color: 'var(--brand-accent, #a78bfa)', fontWeight: 700,
                }}>{meta.label}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 15, color: 'var(--brand-ink)', lineHeight: 1.25 }}>
                  {h.name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--brand-ink-mute)' }}>
                <span>{h.hours}</span>
                <span aria-hidden>·</span>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                  color: 'var(--brand-ink)', textDecoration: 'underline',
                  textDecorationColor: 'color-mix(in srgb, var(--brand-accent, #a78bfa) 45%, transparent)',
                  textUnderlineOffset: 2,
                }}>{h.place}</a>
              </div>
              {h.note && (
                <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)', marginTop: 2 }}>
                  {h.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

// GoldenHourCard — sunrise/sunset + best photo light window.
// NOAA / USNO solar-position math, no API. Accurate to a couple of
// minutes anywhere between latitudes ±65°.
function GoldenHourCard({ lat, lng, now }: { lat: number | null; lng: number | null; now: Date }) {
  if (lat == null || lng == null) return null;
  const events = solarEvents(now, lat, lng);
  if (!events) return null;
  const { sunrise, sunset, goldenPmStart, goldenPmEnd } = events;
  const fmt = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  const untilSunset = Math.max(0, Math.round((sunset.getTime() - now.getTime()) / 60000));
  const hoursUntil = Math.floor(untilSunset / 60);
  const minsUntil = untilSunset % 60;
  const nowInGolden = now >= goldenPmStart && now <= goldenPmEnd;
  const untilLine = untilSunset > 0
    ? `Sunset in ${hoursUntil ? `${hoursUntil}h ${minsUntil}m` : `${minsUntil} min`}`
    : `Sun set at ${fmt(sunset)}`;
  return (
    <CardShell accent="var(--brand-gold, #f59e0b)" label="GOLDEN HOUR">
      <div style={{ fontFamily: DISPLAY, fontSize: 20, color: 'var(--brand-ink)', lineHeight: 1.1 }}>
        {untilLine}
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
        color: 'var(--brand-ink-mute)', marginTop: 6,
      }}>
        SUNRISE {fmt(sunrise)} · SUNSET {fmt(sunset)}
      </div>
      <div style={{
        marginTop: 10, padding: '8px 10px', borderRadius: 8,
        background: nowInGolden ? 'color-mix(in srgb, var(--brand-gold, #f59e0b) 20%, transparent)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${nowInGolden ? 'color-mix(in srgb, var(--brand-gold, #f59e0b) 55%, transparent)' : 'var(--brand-border)'}`,
        fontSize: 12, color: 'var(--brand-ink)', lineHeight: 1.4,
      }}>
        {nowInGolden
          ? `${String.fromCodePoint(0x1F31E)} Golden hour is happening now — best photo light until ${fmt(goldenPmEnd)}.`
          : `${String.fromCodePoint(0x1F4F8)} Best photo light: ${fmt(goldenPmStart)}–${fmt(goldenPmEnd)}.`}
      </div>
    </CardShell>
  );
}

// Solar-position helpers. Approximate NOAA algorithm — accurate ~±2 min.
// MealCadenceCard — ambient "when do locals eat" nudge. Answers the
// classic "wait, is it too early/too late" question travelers hit on
// day one. Silent when we don't have meal windows for the country.
function MealCadenceCard({ countryCode }: { countryCode: string | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60_000); // 5min tick
    return () => clearInterval(t);
  }, []);

  const ctx = useMemo(() => currentMealContext(countryCode, now), [countryCode, now]);
  if (!ctx) return null;

  const MEAL_ICON: Record<'breakfast'|'lunch'|'dinner', string> = {
    breakfast: String.fromCodePoint(0x1F950), // 🥐
    lunch:     String.fromCodePoint(0x1F35D), // 🍝
    dinner:    String.fromCodePoint(0x1F374), // 🍴
  };

  if (ctx.state === 'closed_all') {
    return (
      <CardShell accent="var(--brand-warn, #f59e0b)" label="MEAL CADENCE">
        <div style={{ fontFamily: DISPLAY, fontSize: 16, color: 'var(--brand-ink)', lineHeight: 1.3 }}>
          Restaurants likely closed for the night.
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--brand-ink-mute)', lineHeight: 1.4 }}>
          Late-night: hotel room service, convenience stores, kebab shops in tourist zones.
        </div>
      </CardShell>
    );
  }

  const meal = ctx.window.meal;
  const icon = MEAL_ICON[meal];
  const headline = ctx.state === 'active'
    ? `${meal.toUpperCase()} · closes in ${ctx.minsUntilCloses} min`
    : `${meal.toUpperCase()} starts in ${ctx.minsUntilOpens > 60 ? `${Math.floor(ctx.minsUntilOpens/60)}h ${ctx.minsUntilOpens%60}m` : `${ctx.minsUntilOpens} min`}`;

  const tone = ctx.state === 'active'
    ? (ctx.minsUntilCloses < 30 ? 'var(--brand-danger, #f87171)' : 'var(--brand-success, #7cff97)')
    : 'var(--brand-accent-2, #7dd3fc)';

  return (
    <CardShell accent={tone} label="MEAL CADENCE">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, color: 'var(--brand-ink)', lineHeight: 1.25 }}>
          {headline}
        </div>
      </div>
      {ctx.window.note && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--brand-ink)', lineHeight: 1.4 }}>
          {ctx.window.note}
        </div>
      )}
    </CardShell>
  );
}

// PhotoWindowCard — high-signal, low-frequency alert. Only renders when
// ALL three land: (a) we're inside or approaching golden hour, (b) sky
// is clear-ish (no heavy overcast/rain in the conditions string), and
// (c) the next stop is a curated landmark. Silent 95% of the time —
// which is what makes it feel special when it DOES fire.
function PhotoWindowCard({ lat, lng, place, conditions, etaMin, now }: {
  lat: number | null;
  lng: number | null;
  place: string | null;
  conditions: string | null;
  etaMin: number | null;
  now: Date;
}) {
  if (lat == null || lng == null || !place) return null;
  const guide = guideFor(place);
  if (!guide) return null; // Only surface for landmarks in our guide list.

  // Reject on obviously bad photo conditions. Google's conditionsText is
  // strings like "Partly cloudy", "Heavy rain", "Overcast".
  const cond = (conditions ?? '').toLowerCase();
  const badSky = /overcast|heavy rain|thunderstorm|fog|mist|haze|snow shower/.test(cond);
  if (badSky) return null;

  const solar = solarEvents(now, lat, lng);
  if (!solar) return null;
  const { goldenPmStart, goldenPmEnd, sunset } = solar;

  const minsToGolden = Math.round((goldenPmStart.getTime() - now.getTime()) / 60000);
  const minsToEnd = Math.round((goldenPmEnd.getTime() - now.getTime()) / 60000);
  // Skip when golden hour is > 90 min away (too abstract) or already over.
  if (minsToGolden > 90 || minsToEnd < 0) return null;

  const eta = etaMin ?? 0;
  const arrivesInsideWindow = eta >= minsToGolden - 5 && eta <= minsToEnd;

  const fmt = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);

  const headline = minsToGolden <= 0
    ? `${String.fromCodePoint(0x1F31F)} Golden hour NOW at ${place}`
    : `${String.fromCodePoint(0x1F31F)} Photo window in ${minsToGolden} min · ${place}`;

  const subline = arrivesInsideWindow
    ? `Your ETA (${eta} min) lands you inside the window — perfect timing.`
    : eta > 0
      ? `Head over now: ${eta} min ETA lands you ${eta < minsToGolden ? `${minsToGolden - eta} min early` : `${eta - minsToEnd} min late`}.`
      : `Golden light ${fmt(goldenPmStart)} – ${fmt(goldenPmEnd)}. Sunset ${fmt(sunset)}.`;

  return (
    <div style={{
      background: `linear-gradient(160deg,
        color-mix(in srgb, var(--brand-gold, #f59e0b) 22%, transparent) 0%,
        color-mix(in srgb, var(--brand-danger, #f87171) 10%, transparent) 55%,
        rgba(255,255,255,0.03) 100%)`,
      border: '1px solid var(--brand-border)',
      borderLeft: '3px solid var(--brand-gold, #f59e0b)',
      borderRadius: 12,
      padding: '14px 16px',
      boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.30)',
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
        color: 'var(--brand-gold, #f59e0b)', fontWeight: 700, marginBottom: 8,
      }}>PHOTO WINDOW</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 20, lineHeight: 1.25, color: 'var(--brand-ink)', marginBottom: 6 }}>
        {headline}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--brand-ink)' }}>
        {subline}
      </div>
      {guide.tip && (
        <div style={{
          marginTop: 10, padding: '6px 10px', borderRadius: 8,
          background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 12%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-gold, #f59e0b) 30%, transparent)',
          fontSize: 12, lineHeight: 1.4, color: 'var(--brand-ink)',
        }}>
          <span style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
            color: 'var(--brand-gold, #f59e0b)', fontWeight: 700, marginRight: 6,
          }}>INSIDER</span>
          {guide.tip}
        </div>
      )}
    </div>
  );
}

function solarEvents(date: Date, lat: number, lng: number) {
  try {
    const N = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
    const lngHour = lng / 15;
    // Rise
    const tRise = N + (6 - lngHour) / 24;
    const sunrise = calcSunTime(tRise, lat, lng, true);
    // Set
    const tSet = N + (18 - lngHour) / 24;
    const sunset = calcSunTime(tSet, lat, lng, false);
    if (!sunrise || !sunset) return null;
    // Return same-day Dates (calcSunTime returns UTC hours; we build a
    // Date at that UTC moment on the input date).
    const mk = (hours: number) => {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      d.setUTCMinutes(Math.round(hours * 60));
      return d;
    };
    const riseD = mk(sunrise);
    const setD = mk(sunset);
    // Golden hour: last ~45 min before sunset.
    const goldenPmStart = new Date(setD.getTime() - 45 * 60000);
    const goldenPmEnd = setD;
    return { sunrise: riseD, sunset: setD, goldenPmStart, goldenPmEnd };
  } catch { return null; }
}
function calcSunTime(t: number, lat: number, lng: number, rising: boolean): number | null {
  const zenith = 90.833; // official
  const M = (0.9856 * t) - 3.289;
  const trueLng = (M + (1.916 * Math.sin(M * Math.PI / 180)) + (0.020 * Math.sin(2 * M * Math.PI / 180)) + 282.634) % 360;
  const RA = (180 / Math.PI) * Math.atan(0.91764 * Math.tan(trueLng * Math.PI / 180));
  let RAadj = RA + ((Math.floor(trueLng / 90)) * 90 - (Math.floor(RA / 90)) * 90);
  RAadj = RAadj / 15;
  const sinDec = 0.39782 * Math.sin(trueLng * Math.PI / 180);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(zenith * Math.PI / 180) - (sinDec * Math.sin(lat * Math.PI / 180))) / (cosDec * Math.cos(lat * Math.PI / 180));
  if (cosH > 1 || cosH < -1) return null;
  const H = rising ? 360 - (180 / Math.PI) * Math.acos(cosH) : (180 / Math.PI) * Math.acos(cosH);
  const Hhours = H / 15;
  const T = Hhours + RAadj - (0.06571 * t) - 6.622;
  let UT = T - lng / 15;
  UT = ((UT % 24) + 24) % 24;
  return UT;
}

// MicroForecastCard — 3-hour advisory built from the hourly data we
// already fetch. Detects rain/cool/hot swings and phrases them as one
// concrete sentence.
function MicroForecastCard({ hourly, now }: { hourly: WeatherHour[] | null; now: Date }) {
  if (!hourly || hourly.length === 0) return null;
  const next3 = hourly
    .map((h) => ({ ...h, date: h.time ? new Date(h.time) : null }))
    .filter((h) => h.date && h.date.getTime() >= now.getTime())
    .slice(0, 3);
  if (next3.length === 0) return null;
  const fmt = (d: Date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(d);
  const rainy = next3.find((h) => h.precipPct >= 40);
  const temps = next3.map((h) => h.tempC).filter((t): t is number => t != null);
  const swing = temps.length >= 2 ? Math.max(...temps) - Math.min(...temps) : 0;
  const advisory = rainy && rainy.date
    ? `${String.fromCodePoint(0x2602)} Rain likely around ${fmt(rainy.date)} (${rainy.precipPct}%). Pack an umbrella.`
    : swing >= 5
      ? `${String.fromCodePoint(0x1F321)} Temp swing coming — ${Math.round(Math.min(...temps))}° → ${Math.round(Math.max(...temps))}° over the next 3 hours. Bring a layer.`
      : `${String.fromCodePoint(0x2600)} Steady conditions for the next 3 hours — no swings expected.`;
  return (
    <CardShell accent="var(--brand-accent-2, #7dd3fc)" label="NEXT 3 HOURS">
      <div style={{ fontSize: 13, color: 'var(--brand-ink)', lineHeight: 1.45 }}>{advisory}</div>
      <div style={{
        display: 'flex', gap: 8, marginTop: 10,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', color: 'var(--brand-ink-mute)',
      }}>
        {next3.map((h, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span>{h.date ? fmt(h.date) : ''}</span>
            <span style={{ color: 'var(--brand-ink)', fontVariantNumeric: 'tabular-nums' }}>
              {h.tempC != null ? `${Math.round(h.tempC)}°` : '—'}
            </span>
            {h.precipPct > 0 && <span style={{ color: 'var(--brand-accent-2, #7dd3fc)' }}>{h.precipPct}%</span>}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// GreetingHintCard — time-of-day-appropriate local greeting. Wraps
// the country cheat-sheet with a small AM/PM/evening dictionary so the
// suggestion feels contextual ("Say 'Dobré ráno' at the café — perfect
// for 8 AM"). Silent when we don't have a curated country.
function GreetingHintCard({ facts, now }: { facts: CountryFacts | null; now: Date }) {
  if (!facts) return null;
  const h = now.getHours();
  // Country-specific time-of-day greetings. Fall back to the generic
  // hello from the cheat-sheet when we don't have a variant.
  const TIME_GREETINGS: Record<string, { morning?: string; evening?: string }> = {
    CZ: { morning: 'Dobré ráno', evening: 'Dobrý večer' },
    FR: { morning: 'Bonjour', evening: 'Bonsoir' },
    IT: { morning: 'Buongiorno', evening: 'Buonasera' },
    ES: { morning: 'Buenos días', evening: 'Buenas noches' },
    DE: { morning: 'Guten Morgen', evening: 'Guten Abend' },
    GB: { morning: 'Good morning', evening: 'Good evening' },
    US: { morning: 'Good morning', evening: 'Good evening' },
    JP: { morning: 'おはようございます (Ohayō gozaimasu)', evening: '今晩は (Konbanwa)' },
    KR: { morning: '좋은 아침 (Joeun achim)', evening: '좋은 저녁 (Joeun jeonyeok)' },
    PT: { morning: 'Bom dia', evening: 'Boa noite' },
    NL: { morning: 'Goedemorgen', evening: 'Goedenavond' },
    GR: { morning: 'Kaliméra', evening: 'Kalispéra' },
    TR: { morning: 'Günaydın', evening: 'İyi akşamlar' },
  };
  const cc = Object.keys(TIME_GREETINGS).find((k) => facts.name.toLowerCase().includes(k.toLowerCase()))
    ?? (facts.name === 'Czech Republic' ? 'CZ' : facts.name === 'France' ? 'FR' : '');
  const variants = TIME_GREETINGS[cc];
  const phrase = h < 12
    ? (variants?.morning ?? facts.phrases.hello)
    : h >= 17
      ? (variants?.evening ?? facts.phrases.hello)
      : facts.phrases.hello;
  const bucket = h < 12 ? 'this morning' : h >= 17 ? 'this evening' : 'right now';
  return (
    <CardShell accent="var(--brand-accent, #a78bfa)" label="SAY IT NOW">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, color: 'var(--brand-ink)', lineHeight: 1.1 }}>
          {phrase}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--brand-ink-mute)' }}>
          — perfect for {bucket}
        </div>
      </div>
    </CardShell>
  );
}

function NextStopCard({ next }: { next: Activity | null }) {
  if (!next) {
    return (
      <CardShell accent="var(--brand-accent-2)" label="AFTER THAT">
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>
          Open evening
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          Nothing else on the books today.
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell accent="var(--brand-accent-2)" label="AFTER THAT">
      <div style={{
        fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)',
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {next.name}
      </div>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
        {next.display}
      </div>
    </CardShell>
  );
}

function WeatherAlertCard({ day, current, hourly }: {
  day: WeatherDay | null;
  current: WeatherResult['current'] | null;
  hourly: WeatherHour[] | null;
}) {
  if (!day) {
    return (
      <CardShell accent="var(--brand-gold)" label="WEATHER">
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>Loading…</div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          Pulling the local forecast.
        </div>
      </CardShell>
    );
  }
  const popPct = day.precipPct;
  const cond = day.conditionsText || 'Clear';
  const nowTemp = current?.tempC != null ? Math.round(current.tempC) : null;
  const wind = current?.windKph != null ? Math.round(current.windKph) : null;
  const hi = day.highC != null ? Math.round(day.highC) : null;
  const lo = day.lowC != null ? Math.round(day.lowC) : null;

  // Advice tuned per condition + temperature. Stronger + more specific than
  // the prior single line so users know what to actually bring/wear.
  const advice = (() => {
    const bits: string[] = [];
    if (popPct >= 60) bits.push('Pack a rain shell — showers likely');
    else if (popPct >= 30) bits.push(`Light rain possible (${popPct}%) — grab a layer`);
    if (hi != null && hi >= 30) bits.push('Hot afternoon — hydrate, seek shade');
    else if (hi != null && hi <= 5) bits.push('Bundle up — insulated layers');
    else if (hi != null && hi <= 14) bits.push('Cool day — jacket over a mid-layer');
    if (wind != null && wind >= 30) bits.push(`Windy (${wind} km/h) — secure loose items`);
    if (/snow/i.test(cond)) bits.push('Snow expected — waterproof boots');
    if (/thunder|storm/i.test(cond)) bits.push('Thunderstorms — avoid open ridges');
    if (bits.length === 0 && hi != null && hi >= 20) bits.push('Great outdoor conditions');
    return bits.join(' · ') || 'Clear conditions — enjoy the day.';
  })();

  return (
    <CardShell accent="var(--brand-gold)" label="WEATHER">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          fontFamily: DISPLAY, fontSize: 32, fontWeight: 400, color: 'var(--brand-ink)',
          lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {nowTemp != null ? `${nowTemp}°` : (hi != null ? `${hi}°` : '—')}
        </div>
        <div style={{
          fontFamily: DISPLAY, fontSize: 15, color: 'var(--brand-ink)', textTransform: 'capitalize', flex: 1,
        }}>
          {cond}
        </div>
      </div>
      {/* Numeric strip — high/low, precip, wind. Data-dense but small so it
          reads as a subtitle, not a table. */}
      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8,
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em',
        color: 'var(--brand-ink-dim)',
      }}>
        {hi != null && lo != null && <span>HI {hi}° / LO {lo}°</span>}
        <span>RAIN {popPct}%</span>
        {wind != null && <span>WIND {wind} km/h</span>}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--brand-ink-dim)', marginTop: 8 }}>
        {advice}
      </div>
      {/* Hourly strip — a scrollable per-hour glimpse of the day.
          Snap-scroll keeps ticks landing on whole hours; each cell
          shows time + temp + a small precip percentage when > 0.
          Added 2026-08-03 per user request for whole-day hourly weather. */}
      {hourly && hourly.length > 0 && (
        <div style={{
          display: 'flex', gap: 8,
          overflowX: 'auto', overflowY: 'hidden',
          marginTop: 12, paddingBottom: 4,
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        }}>
          {hourly.slice(0, 24).map((h, i) => {
            const d = h.time ? new Date(h.time) : null;
            const label = d && !isNaN(d.getTime())
              ? new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(d)
              : `+${i}h`;
            const t = h.tempC != null ? Math.round(h.tempC) : null;
            return (
              <div key={i} style={{
                flex: '0 0 58px',
                scrollSnapAlign: 'start',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 4px', borderRadius: 10,
                background: i === 0 ? 'color-mix(in srgb, var(--brand-gold, #f59e0b) 12%, transparent)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${i === 0 ? 'color-mix(in srgb, var(--brand-gold, #f59e0b) 35%, transparent)' : 'var(--brand-border)'}`,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--brand-ink-mute)', letterSpacing: '0.06em' }}>
                  {label}
                </div>
                <div style={{ fontSize: 16, color: 'var(--brand-ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
                  {t != null ? `${t}°` : '—'}
                </div>
                {h.precipPct > 0 && (
                  <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--brand-accent-2, #7dd3fc)' }}>
                    {h.precipPct}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardShell>
  );
}

function CrowdsCard({ placeName, placeCoords, etaMin }: { placeName: string | null; placeCoords: Geo | null; etaMin: number | null }) {
  const [hours, setHours] = useState<number[] | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!placeName) { setHours(null); setResolvedName(null); setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    const params = new URLSearchParams({ place: placeName });
    if (placeCoords) {
      params.set('lat', String(placeCoords.lat));
      params.set('lon', String(placeCoords.lon));
    }
    fetch(`/api/popular-times?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        setHours(Array.isArray(d?.hours) && d.hours.some((h: number) => h > 0) ? d.hours : null);
        setResolvedName(d?.name ?? placeName);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [placeName, placeCoords?.lat, placeCoords?.lon]);

  const now = new Date();
  const current = now.getHours();
  const label = (resolvedName ?? placeName ?? 'NEXT STOP').toUpperCase();

  // Project arrival hour from ETA. If eta is 25 min and it's 1:50 PM,
  // arrival slot is 2 PM. We floor to the whole hour (Google's bars are
  // hourly bins). Only meaningful if the arrival is at least +30 min from
  // now — otherwise "current" and "arrival" collapse to the same bar.
  const arrivalHour = etaMin != null && etaMin >= 30
    ? new Date(now.getTime() + etaMin * 60 * 1000).getHours()
    : null;

  if (!hours) {
    // No place yet, no popular-times data, or fetch failed — show a quiet
    // placeholder rather than the synthetic mock curve.
    return (
      <CardShell accent="var(--brand-warn)" label={`CROWDS · ${label.slice(0, 24)}`}>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, color: 'var(--brand-ink)' }}>
          {!placeName ? 'No next stop yet' : !loaded ? 'Reading busyness…' : 'No popular-times data'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
          {!placeName
            ? 'A crowd forecast appears here once your next stop is set.'
            : !loaded
              ? 'Pulling Google Maps popular times.'
              : 'Google doesn’t publish hourly busyness for this place.'}
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell accent="var(--brand-warn)" label={`CROWDS · ${label.slice(0, 24)}`}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 36, marginTop: 4 }}>
        {hours.map((h, i) => {
          const isCurrent = i === current;
          const isArrival = arrivalHour !== null && i === arrivalHour && arrivalHour !== current;
          return (
            <div key={i} style={{
              flex: 1,
              height: `${Math.max(6, h)}%`,
              borderRadius: 1,
              background: isCurrent
                ? 'var(--brand-success)'
                : isArrival
                  ? 'var(--brand-accent-2, #7dd3fc)'
                  : 'var(--brand-warn)',
              opacity: isCurrent || isArrival ? 1 : 0.55,
              outline: isArrival ? '1px solid var(--brand-accent-2, #7dd3fc)' : 'none',
              outlineOffset: isArrival ? 1 : 0,
            }} />
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
        {hours[current] > 0 ? `Now ${hours[current]}%` : 'Now quiet'}
        {arrivalHour !== null && (() => {
          const arr = hours[arrivalHour] ?? 0;
          const ampm = arrivalHour >= 12 ? 'PM' : 'AM';
          const display = ((arrivalHour + 11) % 12) + 1;
          return ` · arrive ${display} ${ampm} · ${arr}%`;
        })()}
        {' · '}
        {(() => {
          const peakHour = hours.indexOf(Math.max(...hours));
          const ampm = peakHour >= 12 ? 'PM' : 'AM';
          const display = ((peakHour + 11) % 12) + 1;
          return `peak ${display} ${ampm}`;
        })()}
      </div>
      {(() => {
        // Actionable recommendation line. We use the arrival slot when we
        // have an ETA, otherwise the current hour.
        const slotHour = arrivalHour ?? current;
        const slot = hours[slotHour] ?? 0;
        const peak = Math.max(...hours);
        const peakHour = hours.indexOf(peak);
        const ratio = peak > 0 ? slot / peak : 0;

        let tone = 'var(--brand-success, #7cff97)';
        let msg = '';
        if (peak === 0) return null;
        if (ratio <= 0.4) {
          msg = arrivalHour !== null
            ? `${String.fromCodePoint(0x1F7E2)} Off-peak arrival — good timing.`
            : `${String.fromCodePoint(0x1F7E2)} Quieter than usual right now.`;
        } else if (ratio <= 0.7) {
          tone = 'var(--brand-warn, #f59e0b)';
          msg = `${String.fromCodePoint(0x1F7E1)} Moderately busy. Expect small waits.`;
        } else {
          tone = 'var(--brand-danger, #f87171)';
          // Suggest a quieter slot within ±2h if one exists.
          let bestDelta = 0;
          let bestBusy = slot;
          for (let d = -2; d <= 2; d++) {
            const h = (slotHour + d + 24) % 24;
            if (hours[h] < bestBusy) { bestBusy = hours[h]; bestDelta = d; }
          }
          if (bestDelta !== 0 && bestBusy < slot * 0.7) {
            const shift = bestDelta > 0 ? `${bestDelta}h later` : `${-bestDelta}h earlier`;
            msg = `${String.fromCodePoint(0x1F534)} Peak crowd. Try ${shift} — ~${bestBusy}%.`;
          } else {
            const ampm = peakHour >= 12 ? 'PM' : 'AM';
            const display = ((peakHour + 11) % 12) + 1;
            msg = `${String.fromCodePoint(0x1F534)} Peak crowd. Rush hits ${display} ${ampm}.`;
          }
        }
        return (
          <div style={{
            marginTop: 8, padding: '6px 10px',
            borderRadius: 8,
            background: `color-mix(in srgb, ${tone} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)`,
            fontSize: 12, lineHeight: 1.35, color: 'var(--brand-ink)',
          }}>{msg}</div>
        );
      })()}
    </CardShell>
  );
}

// ─── Day timeline ───────────────────────────────────────────────────────────

function DayTimeline({ activities, currentClock }: { activities: Activity[]; currentClock: string }) {
  if (activities.length === 0) {
    return (
      <div style={{
        padding: 18, borderRadius: 12,
        border: '1.5px dashed var(--brand-border)',
        color: 'var(--brand-ink-mute)', fontSize: 12, textAlign: 'center',
      }}>
        No activities parsed for today. Add stops to your itinerary to see them here.
      </div>
    );
  }
  const nextIdx = activities.findIndex(a => a.time > currentClock);
  // Horizontal-scroll strip (redesigned 2026-08-03): the prior
  // grid-template `repeat(N, minmax(0, 1fr))` split the day into N
  // equal columns, which meant a 7-activity day on a 393px iPhone gave
  // each tile ~46px — every name truncated after 3 characters. Now
  // each tile is a fixed 156px wide (comfortably 2 lines of 13px
  // display), the strip scrolls horizontally with scroll-snap so users
  // land on a card, and the "NOW" tile is scrollIntoView'd on mount.
  return (
    <div
      ref={(el) => {
        // Center the NOW card on first paint (or DONE if the day is over).
        if (!el) return;
        const targetIdx = nextIdx === -1 ? activities.length - 1 : nextIdx;
        const target = el.children[targetIdx] as HTMLElement | undefined;
        if (target) target.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
      }}
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        paddingBottom: 6,
        // Hide native scrollbar on WebKit — the strip is discoverable
        // via the peeking next tile so a bar is just chrome.
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}
    >
      {activities.map((a, i) => {
        const status: 'done' | 'now' | 'future' =
          nextIdx === -1                     ? 'done'
          : i < nextIdx                       ? 'done'
          : i === nextIdx                     ? 'now'
                                              : 'future';
        // Quest detection — is this stop a monument that unlocks a
        // globe skin/badge? Quest tiles override the normal accent
        // with gold + a trophy chip so they can't be missed.
        const quest = matchMonumentQuest(a.place ?? a.name);
        const color = quest ? 'var(--brand-gold, #f59e0b)'
                    : status === 'done'   ? 'var(--brand-success)'
                    : status === 'now'    ? 'var(--brand-accent)'
                                          : 'var(--brand-ink-mute)';
        const opacity = status === 'future' && !quest ? 0.65 : 1;
        return (
          <div key={i} style={{
            flex: '0 0 168px',
            scrollSnapAlign: 'center',
            borderTop: `${quest ? 3 : 2}px solid ${color}`,
            paddingTop: 10,
            opacity,
            // Subtle gold glow around quest tiles so they read as a
            // "hero" stop even in the peripheral vision of a scrolling
            // day timeline.
            ...(quest ? {
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--brand-gold, #f59e0b) 14%, transparent) 0%, transparent 60%)',
              borderRadius: '0 0 8px 8px',
              padding: '10px 8px 6px',
              margin: '0 -8px -6px',
              boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand-gold, #f59e0b) 25%, transparent) inset',
            } : {}),
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color,
                boxShadow: status === 'now' || quest ? `0 0 10px ${color}` : 'none',
              }} />
              {quest && (
                <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
                  {String.fromCodePoint(0x1F3C6)}
                </span>
              )}
            </div>
            {quest && (
              <div style={{
                display: 'inline-block',
                fontFamily: MONO, fontSize: 8, letterSpacing: '0.16em',
                color: 'var(--brand-gold, #f59e0b)', fontWeight: 800,
                padding: '2px 6px', borderRadius: 4,
                background: 'color-mix(in srgb, var(--brand-gold, #f59e0b) 16%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand-gold, #f59e0b) 40%, transparent)',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}>
                QUEST · UNLOCKS SKIN
              </div>
            )}
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
              color: quest ? 'var(--brand-gold, #f59e0b)'
                : status === 'now' ? 'var(--brand-accent)'
                : 'var(--brand-ink-mute)',
              marginBottom: 4, fontWeight: 700,
            }}>
              STOP {i + 1}/{activities.length} · {status.toUpperCase()} · {a.display}
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 14, color: 'var(--brand-ink)',
              lineHeight: 1.3,
              fontWeight: quest ? 600 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {a.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
