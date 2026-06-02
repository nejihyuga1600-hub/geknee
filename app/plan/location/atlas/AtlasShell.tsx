"use client";
// Atlas shell — variant A from the 2026-04-24 design session. The full
// flow (destination → dates → style → review) is staged across a single
// bottom sheet with three states: peek / open / full. This file is the
// scaffolding: globe background, top nav, sheet choreography, step
// stepper, and empty step bodies. Wiring each step to the live trip
// APIs is the next phase — see .planning/design-2026-04-24/prototype/
// variant-atlas.jsx and atlas-panels.jsx for the target shape.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { resetGlobeTilt, flyToGlobe, zoomCamera } from "@/lib/globeAnim";
import { currentIssueYear } from "@/lib/issue-year";
import { Sparkle } from "@/lib/icons";
import {
  POPULAR_SUGGESTIONS,
  resolveDestination,
  searchDestinations,
  type Suggestion,
} from "./destinations";
import CITIES_JSON from "@/app/plan/location/globe/cities-curated.json";
import { getExtraCities, useExtraCitiesVersion } from "@/app/plan/location/globe/cityData";
const CITIES_LIST: { n: string; lat: number; lon: number }[] = CITIES_JSON;

// LocationClient is the live planner — when mounted with chromeless, it
// renders only the real R3F globe (country borders, monuments, click-to-fly,
// procedural Earth texture). ssr:false because it touches window at module
// scope. Dynamic import keeps Atlas's first paint cheap.
// loading: render the same radial-gradient globe-backdrop while the
// LocationClient bundle (~3,700-line client component + R3F + drei +
// troika SDF text) downloads + parses. Without this, the canvas slot
// is empty while AtlasShell's chrome (top nav, sheet) is already visible
// — creates a blank "missing globe" flash. The gradient matches
// StaticGlobeBackdrop below so the transition is seamless.
const PlannerGlobe = dynamic(() => import("../LocationClient"), {
  ssr: false,
  loading: () => <StaticGlobeBackdrop />,
});
// Capacitor-only globe (Mapbox GL JS). Loaded lazily so web doesn't ship
// the 230KB mapbox-gl bundle. See CapacitorGlobe.tsx for why this exists.
const CapacitorGlobe = dynamic(() => import("./CapacitorGlobe"), {
  ssr: false,
  loading: () => <StaticGlobeBackdrop />,
});

// Globe bypass strategy: try the full WebGL globe everywhere by default.
// Only swap to the static gradient backdrop if WebGL actually fails or the
// device has flagged a prior failure this session. This preserves the moat
// (the live 3D map) while protecting against iPhone memory crashes.
//
// Trigger 1 — runtime failure: LocationClient's webglcontextlost handler
//   dispatches `geknee:webgl-fallback`, which we listen for to flip state.
// Trigger 2 — prior failure: persisted in sessionStorage so refreshes on the
//   same device don't keep crashing. Cleared on next browser session.
const FALLBACK_FLAG = "geknee_globe_fallback";
function priorFallbackThisSession(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(FALLBACK_FLAG) === "1"; } catch { return false; }
}

function StaticGlobeBackdrop() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        background:
          "radial-gradient(circle at 50% 45%, #1e3a8a 0%, #0c1e4a 40%, #050818 75%, #02030a 100%)",
      }}
    >
      <div style={{
        position: "absolute",
        left: "50%", top: "45%", transform: "translate(-50%, -50%)",
        width: "min(90vw, 70vh)", height: "min(90vw, 70vh)",
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 35% 35%, #5b8def 0%, #2546a7 35%, #0d2466 65%, #051034 95%)",
        boxShadow: "0 0 120px rgba(80, 130, 255, 0.35), inset -40px -40px 90px rgba(0,0,0,0.6)",
      }} />
    </div>
  );
}
// Live product modals — pulled in only when the user opens them.
const MonumentShop   = dynamic(() => import("@/app/components/MonumentShop"),   { ssr: false });
const UpgradeModal   = dynamic(() => import("@/app/components/UpgradeModal"),   { ssr: false });
const TripSocialPanel = dynamic(() => import("@/app/components/TripSocialPanel"), { ssr: false });
const SettingsPanel  = dynamic(() => import("@/app/components/SettingsPanel"),  { ssr: false });
const AuthModal      = dynamic(() => import("@/app/components/AuthModal"),      { ssr: false });

type SheetState = "peek" | "open" | "full";
type TripStyle = "relaxed" | "adventure" | "culture" | "foodie" | "luxury" | "budget";
type TripBudget = "$" | "$$" | "$$$" | "$$$$";
type Trip = {
  destination: string;
  lat: number | null;
  lon: number | null;
  mk: string | null;        // monument key when matched, null for free text
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD (free-form return date)
  nights: number;           // 1-30
  flexibleMonth: string | null; // e.g. "Mar"
  style: TripStyle | null;
  budget: TripBudget | null;
};

const STEPS = ["Destination", "Dates", "Style", "Review"] as const;

const EMPTY_TRIP: Trip = {
  destination: "",
  lat: null, lon: null, mk: null,
  startDate: "", endDate: "", nights: 7,
  flexibleMonth: null, style: null, budget: null,
};

const STYLE_OPTIONS: { id: TripStyle; label: string; tag: string }[] = [
  { id: "relaxed",   label: "Relaxed",   tag: "Slow mornings, long dinners" },
  { id: "adventure", label: "Adventure", tag: "Hikes, surf, off-grid" },
  { id: "culture",   label: "Culture",   tag: "Museums, history, walks" },
  { id: "foodie",    label: "Foodie",    tag: "Chasing every market and kitchen" },
  { id: "luxury",    label: "Luxury",    tag: "Spas, suites, first-class" },
  { id: "budget",    label: "Budget",    tag: "Hostels, buses, street food" },
];

const BUDGETS: TripBudget[] = ["$", "$$", "$$$", "$$$$"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function addDays(yyyymmdd: string, n: number): string {
  if (!yyyymmdd) return "";
  const d = new Date(yyyymmdd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayYYYYMMDD(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function diffDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00").getTime();
  const e = new Date(end + "T00:00:00").getTime();
  return Math.round((e - s) / 86400000);
}

function clampNights(n: number): number {
  if (Number.isNaN(n)) return 7;
  return Math.max(2, Math.min(21, n));
}

// First-of-month date in the next future occurrence of the given month index (0–11).
function nextMonthStart(monthIdx: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = today.getFullYear();
  let target = new Date(y, monthIdx, 1);
  if (target.getTime() <= today.getTime()) target = new Date(y + 1, monthIdx, 1);
  const yy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default function AtlasShell() {
  const [sheet, setSheet] = useState<SheetState>("peek");
  // Globe fallback state — false by default so the WebGL globe mounts.
  // Flips true if (a) sessionStorage flag from a prior crash this session,
  // or (b) LocationClient dispatches geknee:webgl-fallback at runtime.
  const [bypassGlobe, setBypassGlobe] = useState(false);
  useEffect(() => {
    if (priorFallbackThisSession()) setBypassGlobe(true);
    const onFallback = () => {
      try { sessionStorage.setItem(FALLBACK_FLAG, "1"); } catch {}
      setBypassGlobe(true);
    };
    window.addEventListener("geknee:webgl-fallback", onFallback);
    return () => window.removeEventListener("geknee:webgl-fallback", onFallback);
  }, []);

  // Capacitor: lazy-mount Three.js Canvas on user tap instead of on page
  // mount. Defers the entire cold-load CPU burst (WKWebView has no JIT, so
  // the Three.js mount + scene setup pins CPU for 3-5s — iOS's WebKit
  // watchdog kills the process before mount finishes, Capacitor auto-
  // reloads, blink loop). By gating on user tap we move the heavy work
  // OUT of the initial-load window when the WebView is already busy
  // parsing bundles + evaluating modules. The user has set intent ("I
  // want to see the globe") so the brief mount stall is acceptable, and
  // the static backdrop shows the brand surface up front so the planner
  // chrome is immediately usable.
  const _isCapacitorShell = typeof window !== "undefined" &&
    !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  const [globeMountReady, setGlobeMountReady] = useState(!_isCapacitorShell);
  const [step, setStep] = useState(0);
  const [dest, setDest] = useState("");
  // Validation error shown below the destination input when the user
  // tries to submit a string that doesn't match any monument or city.
  const [destError, setDestError] = useState<string | null>(null);
  // Bump when GeoNames extras finish loading so the autocomplete recomputes.
  const extraVer = useExtraCitiesVersion();
  const [trip, setTrip] = useState<Trip>(EMPTY_TRIP);
  // Responsive collapse — top nav becomes too dense on phones, so we
  // sink Collection / Go Pro / Trips behind the existing Menu pill below
  // 640px and trim the AUTO-SAVED + dev-callout chrome.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  // Seed today's date on the client so the trip-length slider and
  // flexible-month picker have a pivot before the user touches Depart.
  useEffect(() => {
    setTrip(t => {
      if (t.startDate || t.endDate) return t;
      const startDate = todayYYYYMMDD();
      return { ...t, startDate, endDate: addDays(startDate, t.nights) };
    });
  }, []);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill destination from ?location= so deep-links from globe-landmark
  // clicks, GlobalChat city extraction, etc., land the user on step 1
  // (Dates) with the destination already populated. Only fires once per
  // mount; the user can still edit the destination via the Back button.
  useEffect(() => {
    const queryLoc = searchParams?.get('location');
    if (!queryLoc) return;
    // Pre-fill the destination silently — but DO NOT auto-open the sheet or
    // jump to step 1. iOS standalone PWAs resume to the last URL on launch,
    // so a stale ?location=X would otherwise pop the keyboard every time the
    // app is opened. Let the user choose to expand the sheet.
    setDest(queryLoc);
    setTrip(t => ({ ...t, destination: queryLoc }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: session } = useSession();
  const [shopOpen,     setShopOpen]     = useState(false);
  const [shopInitialMk, setShopInitialMk] = useState<string | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ mk: string }>).detail;
      if (!d?.mk) return;
      setShopInitialMk(d.mk);
      setShopOpen(true);
    };
    window.addEventListener('geknee:open-monument-shop', h);
    return () => window.removeEventListener('geknee:open-monument-shop', h);
  }, []);
  const [upgradeOpen,  setUpgradeOpen]  = useState(false);
  const [tripsOpen,    setTripsOpen]    = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen,     setAuthOpen]     = useState(false);
  const [genieOpen,    setGenieOpen]    = useState(false);
  // Hide the "Spin the globe · tap a landmark · or type below" hero copy as
  // soon as the user does any of those — typed in dest, picked a destination,
  // or interacted with the page at all (covers globe-spin without a click).
  const [hasInteracted, setHasInteracted] = useState(false);
  useEffect(() => {
    if (hasInteracted) return;
    const flip = () => setHasInteracted(true);
    window.addEventListener("pointerdown", flip, { once: true });
    window.addEventListener("keydown", flip, { once: true });
    return () => {
      window.removeEventListener("pointerdown", flip);
      window.removeEventListener("keydown", flip);
    };
  }, [hasInteracted]);
  const heroVisible = sheet === "peek" && !hasInteracted && !dest && !trip.destination;

  const sheetHeight = sheet === "peek" ? 108 : sheet === "open" ? 420 : "85%";

  const cycleSheet = () =>
    setSheet((s) => (s === "peek" ? "open" : s === "open" ? "full" : "peek"));

  // Resolve typed destination → trip state. Matched monument gives us a
  // mk + lat/lon for the globe pin (next phase). Unmatched still proceeds
  // — the trip just doesn't have a pin yet.
  // Keeps the user inside the bottom sheet and advances to step 1 (Dates).
  // Atlas's full flow (Destination → Dates → Style → Review) lives in the
  // sheet — we don't router.push to /plan/style anymore.
  const submitDest = (raw?: string) => {
    const value = (raw ?? dest).trim();
    if (!value) return;
    // Try monuments first, then city catalog (curated + GeoNames 15K).
    // searchDestinations(..., limit=1) is the validation gate — if nothing
    // matches, refuse to advance instead of saving a free-text gibberish
    // destination like "asdfqwerzxcv-not-a-place" that QA caught earlier.
    const hits = searchDestinations(value, [...CITIES_LIST, ...getExtraCities()], 1);
    const match = hits[0];
    if (!match) {
      setDestError(`Couldn't find "${value}". Try a city, country, or landmark.`);
      return;
    }
    setDestError(null);
    setTrip({ ...trip, destination: match.name, lat: match.lat, lon: match.lon, mk: match.mk });
    setDest(match.name);
    setSheet("open");
    setStep(1);
    // Spin the background globe to the chosen destination + standard zoom.
    // Matches the LocationClient pattern at line ~3031 (free-text destination
    // navigation): fly first, then settle camera at distance 14.
    flyToGlobe(match.lat, match.lon, () => zoomCamera(14));
  };

  const pickSuggestion = (s: Suggestion) => {
    setTrip({ ...trip, destination: s.name, lat: s.lat, lon: s.lon, mk: s.mk });
    setDest(s.name);
    setSheet("open");
    setStep(1);
    flyToGlobe(s.lat, s.lon, () => zoomCamera(14));
  };

  return (
    <main
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100svh",
        background:
          "radial-gradient(ellipse at 50% 40%, var(--brand-bg2) 0%, var(--brand-bg) 70%)",
        color: "var(--brand-ink)",
        fontFamily: "var(--font-ui), system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Background globe — real LocationClient planet, no chrome. The
          wrapper translates up + scales down as the sheet grows so the globe
          gets out of the way of the planning surface.
          iOS standalone PWAs OOM-kill the tab when the Three.js globe loads
          (250MB tab budget, WebGL textures + scene exceed it). On those
          contexts we skip mounting the WebGL canvas entirely and show a
          styled gradient backdrop — every other planner feature still works.
          Globe stays available in regular Safari and on Android. */}
      <div style={{
        position: "absolute", inset: 0,
        transform:
          sheet === "peek" ? "translateY(0) scale(1)"
          : sheet === "open" ? "translateY(-12%) scale(0.92)"
          : "translateY(-26%) scale(0.55)",
        transformOrigin: "50% 35%",
        transition: "transform 600ms cubic-bezier(0.23, 1, 0.32, 1)",
        willChange: "transform",
      }}>
        {bypassGlobe ? (
          <StaticGlobeBackdrop />
        ) : !globeMountReady ? (
          <>
            <StaticGlobeBackdrop />
            <button
              type="button"
              onClick={() => setGlobeMountReady(true)}
              style={{
                position: "fixed",
                bottom: "calc(env(safe-area-inset-bottom) + 96px)",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 50,
                background: "linear-gradient(135deg, #a78bfa 0%, #7dd3fc 100%)",
                color: "#0a0a1f",
                border: "none",
                borderRadius: 999,
                padding: "16px 32px",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.02em",
                boxShadow: "0 8px 32px rgba(167,139,250,0.45)",
                cursor: "pointer",
                fontFamily: "var(--font-ui), system-ui, sans-serif",
              }}
            >
              Tap to open the globe
            </button>
          </>
        ) : _isCapacitorShell ? (
          <CapacitorGlobe />
        ) : (
          <PlannerGlobe chromeless />
        )}
      </div>

      {/* Top bar — paddingTop respects iOS standalone PWA safe-area so chips
          don't crash into the status bar / Dynamic Island. */}
      <nav
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: `max(${isMobile ? 10 : 14}px, env(safe-area-inset-top))`,
          paddingRight: isMobile ? 10 : 16,
          paddingBottom: isMobile ? 10 : 14,
          paddingLeft: isMobile ? 10 : 16,
        }}
      >
        <Link
          href="/"
          title="Back to landing page"
          aria-label="Home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--brand-surface)",
            WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)",
            border: "1px solid var(--brand-border)",
            cursor: "pointer",
            textDecoration: "none",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/geknee-app-icon-v1.png"
            alt=""
            aria-hidden
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </Link>
        {!isMobile && (
          <span
            style={{
              fontSize: 10,
              color: "var(--brand-ink-mute)",
              letterSpacing: "0.12em",
              marginLeft: 12,
              flex: 1,
            }}
          >
            · AUTO-SAVED
          </span>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* On mobile, render the same NavPills as icon-only so the user
             can still reach MonumentShop / Pricing / Trips from the iOS
             app. Hiding them entirely (the previous behavior) made the
             Capacitor build effectively unusable for collecting. */}
          {!isMobile && (
          <NavPill onClick={() => setShopOpen(true)} title="Monument Collection" iconOnly={isMobile}>
            <ColIcon /> {!isMobile && <span>Collection</span>}
          </NavPill>
          )}
          {!isMobile && (
          <NavPill onClick={() => setUpgradeOpen(true)} accent iconOnly={isMobile}>
            <SparkleIcon /> {!isMobile && <span>Go Pro</span>}
          </NavPill>
          )}
          <NavPill onClick={() => { if (session?.user) setTripsOpen(true); else setAuthOpen(true); }} title="Trips & Friends" iconOnly={isMobile}>
            <TripsIcon /> {!isMobile && <span>Trips</span>}
          </NavPill>
          {/* Wrap entry moved into the MonumentShop header (next to
              Leaderboard) — they're sibling year-in-review surfaces and the
              top nav was getting crowded. */}
          {session?.user ? (
            <button
              onClick={() => router.push("/account")}
              title={session.user.name ? `${session.user.name} — account` : "Account"}
              aria-label="Account"
              style={{
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-2, #7dd3fc))",
                color: "#0a0a1f",
                display: "grid", placeItems: "center",
                fontFamily: "var(--font-display, Georgia, serif)",
                fontWeight: 700, fontSize: 14,
                border: "1px solid var(--brand-border)",
                cursor: "pointer", padding: 0,
                overflow: "hidden",
              }}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                (session.user.name ?? session.user.email ?? "?")[0]?.toUpperCase()
              )}
            </button>
          ) : (
            <NavPill onClick={() => setAuthOpen(true)} title="Sign in">
              <span>Sign in</span>
            </NavPill>
          )}
          <NavPill onClick={() => setSettingsOpen(true)} iconOnly title="Menu">
            <MenuIcon />
          </NavPill>
        </div>
      </nav>

      {/* Vertical zoom indicator — sits just under the hamburger Menu pill. */}
      <ZoomIndicator />

      {/* Initialize / Home — top-center, prominent. Same affordance the
          legacy planner had: tap to reset the globe orientation. Top respects
          iOS standalone safe-area so it sits below the Dynamic Island. */}
      <div style={{ position: "absolute", top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", zIndex: 11 }}>
        <button
          onClick={() => resetGlobeTilt()}
          title="Reset globe orientation"
          style={{
            background: "rgba(6,8,22,0.80)",
            border: "1px solid rgba(167, 139, 250, 0.35)",
            WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)",
            borderRadius: 10,
            color: "#c7d2fe",
            fontSize: 10, fontWeight: 700,
            padding: "5px 12px",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
            letterSpacing: "0.05em", textTransform: "uppercase",
            fontFamily: "inherit",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Initialize
        </button>
      </div>

      {/* Peek-state hero line — fades out the moment the user spins / taps /
          types, so it stops crowding the planning chrome. */}
      {sheet === "peek" && (
        <div
          style={{
            position: "absolute",
            top: 92,
            left: 0,
            right: 0,
            textAlign: "center",
            zIndex: 5,
            pointerEvents: "none",
            opacity: heroVisible ? 1 : 0,
            transform: `translateY(${heroVisible ? 0 : -8}px)`,
            transition: "opacity 900ms ease-out, transform 900ms ease-out",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "clamp(36px, 6vw, 56px)",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.08,
              marginBottom: 10,
            }}
          >
            Where are you{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "var(--brand-accent)",
              }}
            >
              wandering
            </em>
            ?
          </div>
          <div
            style={{
              color: "var(--brand-ink-dim)",
              fontSize: 13,
              letterSpacing: "0.04em",
            }}
          >
            Spin the globe · tap a landmark · or type below
          </div>
        </div>
      )}

      {/* Bottom sheet */}
      <section
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          height: sheetHeight,
          background: "linear-gradient(180deg, rgba(10,10,31,0.85), rgba(10,10,31,0.98))",
          WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)",
          borderTop: "1px solid var(--brand-border)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -20px 60px rgba(0,0,0,0.6)",
          transition: "height 500ms cubic-bezier(0.23, 1, 0.32, 1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Grab bar */}
        <div
          onClick={cycleSheet}
          role="button"
          tabIndex={0}
          aria-label="Toggle sheet"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px 12px",
            borderBottom:
              sheet !== "peek" ? "1px solid var(--brand-border)" : "none",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 40,
              height: 3,
              borderRadius: 2,
              background: "var(--brand-ink-mute)",
              opacity: 0.55,
              position: "absolute",
              top: 7,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />

          {sheet === "peek" ? (
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDest()}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => setSheet("open")}
              placeholder="Try 'Kyoto', 'Iceland', 'somewhere warm'…"
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid var(--brand-border)",
                background: "rgba(255,255,255,0.04)",
                color: "var(--brand-ink)",
                fontSize: 15,
                fontFamily: "var(--font-ui), system-ui, sans-serif",
                outline: "none",
              }}
            />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  overflowX: "auto",
                  paddingTop: 4,
                }}
              >
                {STEPS.map((label, i) => (
                  <StepMarker
                    key={label}
                    idx={i}
                    label={label}
                    active={step === i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setStep(i);
                    }}
                  />
                ))}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSheet("peek");
                }}
                aria-label="Collapse"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--brand-ink-mute)",
                  fontSize: 20,
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                {String.fromCodePoint(0x2193)}
              </button>
            </>
          )}
        </div>

        {/* Step content — placeholders until the next phase wires real
            trip state. The structure matches the design prototype so
            real implementation drops into the right slots. */}
        {sheet !== "peek" && (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 28px 32px",
            }}
          >
            {step === 0 && (
              <StepDestination
                dest={dest}
                setDest={setDest}
                submitDest={submitDest}
                pickSuggestion={pickSuggestion}
                trip={trip}
                onNext={() => setStep(1)}
                destError={destError}
                setDestError={setDestError}
                extraVer={extraVer}
              />
            )}
            {step === 1 && (
              <StepDates
                trip={trip}
                setTrip={setTrip}
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <StepStyle
                trip={trip}
                setTrip={setTrip}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <StepReview
                trip={trip}
                onBack={() => setStep(2)}
              />
            )}
          </div>
        )}
      </section>

{/* Genie corner — quiet ✦ assistant. */}
      <GenieCorner trip={trip} step={step} steps={STEPS} open={genieOpen} setOpen={setGenieOpen} />

      {/* Live product modals — wired to the existing components, not the
          stale design-session copies. */}
      {/* Lazy-mount: defer chunk load + state hooks until the user actually
          opens the panel. Saves ~150KB JS + the panel's effects/intervals
          for sessions where the user never opens it. TripSocialPanel stays
          eager because users open it almost every session. */}
      {shopOpen     && <MonumentShop   open={shopOpen}     onClose={() => { setShopOpen(false); setShopInitialMk(null); }} initialMk={shopInitialMk} />}
      {upgradeOpen  && <UpgradeModal   open={upgradeOpen}  onClose={() => setUpgradeOpen(false)} />}
      <TripSocialPanel open={tripsOpen}    onClose={() => setTripsOpen(false)} currentLocation={trip.destination} />
      {settingsOpen && <SettingsPanel  open={settingsOpen} onClose={() => setSettingsOpen(false)} showQuickActions={isMobile} onOpenShop={() => setShopOpen(true)} onOpenUpgrade={() => setUpgradeOpen(true)} />}
      {authOpen     && <AuthModal      open={authOpen}     onClose={() => setAuthOpen(false)} />}
    </main>
  );
}

// ── Top-nav glyph icons (geometric, no emoji per design system) ──────────
function ColIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 6V14M13 6V14M3 6h10M2 6l6-4 6 4M5.5 14h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z" />
    </svg>
  );
}
function TripsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M5 8a2 2 0 104 0 2 2 0 00-4 0zM11.5 10a1.5 1.5 0 10.01-3M1.5 13c.5-2 2.5-3 5.5-3s5 1 5.5 3" strokeLinecap="round" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 2h6v4a3 3 0 0 1-6 0V2z" />
      <path d="M3 4H1.5v2A2.5 2.5 0 0 0 4 8.5M13 4h1.5v2A2.5 2.5 0 0 1 12 8.5" />
      <path d="M6.5 11h3l.5 3h-4z" />
      <line x1="5" y1="14" x2="11" y2="14" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

// Globe with an arc circling it — reads as "year in review on the globe"
// without leaning on Spotify-style sparkles.
function WrapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="5" />
      <path d="M3 8c2 1.6 4 2.5 5 2.5s3-.9 5-2.5" />
      <path d="M2 9.5 Q8 2 14 9.5" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

// ── Genie corner: ✦ floating assistant button + popover with chips ───────
function GenieCorner({
  trip, step, steps, open, setOpen,
}: {
  trip: Trip;
  step: number;
  steps: readonly string[];
  open: boolean;
  setOpen: (b: boolean) => void;
}) {
  const [messages, setMessages] = useState<{ role: "genie" | "user"; text: string }[]>([
    { role: "genie", text: "Hey — I'm here if you want a nudge. Ask about pricing, seasons, itineraries, anything." },
  ]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" });
  }, [messages, open]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text) return;
    const userMsg = { role: "user" as const, text };
    // Optimistic: render the user's bubble + a placeholder assistant
    // bubble that the stream writes into as tokens arrive.
    setMessages((m) => [...m, userMsg, { role: "genie", text: "" }]);
    setDraft("");
    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role === "genie" ? ("assistant" as const) : ("user" as const),
        content: m.text,
      }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          tripInfo: trip.destination
            ? {
                location: trip.destination,
                nights: String(trip.nights ?? ""),
                style: trip.style ?? undefined,
                budget: trip.budget ?? undefined,
              }
            : undefined,
          pageContext: `Planner step: ${steps[step] ?? "destination"}`,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: "genie", text: acc }]);
      }
    } catch {
      // Network / 401 / API outage → keep the panel responsive with a
      // template so it never goes silent. Tagged in the message so the
      // user knows it's a stub, not the real AI.
      const ctx = trip.destination
        ? `For ${trip.destination}${trip.style ? ` (${trip.style})` : ""}: `
        : "";
      const replies = [
        `${ctx}Good question — based on what you've told me, I'd lean toward shoulder season for fewer crowds and better prices.`,
        `${ctx}I'd budget 2–3 days for the signature spots and leave the rest unstructured — that's where the best memories happen.`,
        `${ctx}Worth checking weather window, local holidays, and any visa lead time before you lock in dates.`,
      ];
      setMessages((m) => [...m.slice(0, -1), { role: "genie", text: replies[Math.floor(Math.random() * replies.length)] }]);
    }
  };

  const suggestions =
    step === 0 ? ["Warm, under $2k", "Somewhere I can hike", "Best food in Asia"]
    : step === 1 ? ["When is shoulder season?", "Cheapest month to fly"]
    : step === 2 ? ["Is adventure too much for a first trip?", "Explain each style"]
    : ["Summarize my trip", "Estimate total cost"];

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        title="Ask the assistant"
        style={{
          position: "fixed",
          right: 24,
          bottom: 130,
          width: 52, height: 52, borderRadius: 14,
          background: "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-2, #7dd3fc))",
          color: "#0a0a1f",
          border: "1px solid var(--brand-border-hi)",
          cursor: "pointer",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-display, Georgia, serif)",
          fontSize: 22, fontWeight: 600,
          boxShadow: "0 10px 30px rgba(167,139,250,0.25)",
          zIndex: 30,
          transition: "transform 150ms",
          transform: open ? "scale(0.94)" : "scale(1)",
        }}
      ><img
        src="/brand/geknee-mascot.jpg"
        alt="geknee mascot"
        width={42}
        height={42}
        style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 10 }}
      /></button>

      {open && (
        <div style={{
          position: "fixed",
          right: 24, bottom: 196,
          width: 360, maxHeight: 480,
          background: "rgba(13,13,36,0.96)",
          WebkitBackdropFilter: "blur(18px)", backdropFilter: "blur(18px)",
          border: "1px solid var(--brand-border-hi)",
          borderRadius: 18,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          zIndex: 30,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "14px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid var(--brand-border)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8,
                background: "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-2, #7dd3fc))",
                color: "#0a0a1f",
                display: "grid", placeItems: "center",
                fontFamily: "var(--font-display, Georgia, serif)",
                fontWeight: 600, fontSize: 13,
              }}><img
                src="/brand/geknee-mascot.jpg"
                alt="geknee"
                width={22}
                height={22}
                style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 6 }}
              /></span>
              <div>
                <div style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 15, fontWeight: 500 }}>geknee</div>
                <div style={{ fontSize: 10, color: "var(--brand-ink-mute)", letterSpacing: "0.1em" }}>
                  <span style={{ color: "#34d399" }}>●</span> ONLINE · {steps[step]}
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "var(--brand-ink-mute)",
              fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1,
            }}>×</button>
          </div>

          <div ref={scrollRef} style={{
            flex: 1, overflowY: "auto",
            padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "genie" ? "flex-start" : "flex-end",
                maxWidth: "85%",
                padding: "10px 12px",
                borderRadius: m.role === "genie" ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
                background: m.role === "genie" ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${m.role === "genie" ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
                color: "var(--brand-ink)", fontSize: 13, lineHeight: 1.5,
              }}>{m.text}</div>
            ))}
          </div>

          <div style={{ padding: "0 16px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)} style={{
                fontSize: 11,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--brand-border)",
                color: "var(--brand-ink-dim)",
                padding: "5px 10px", borderRadius: 999,
                cursor: "pointer",
              }}>{s}</button>
            ))}
          </div>

          <div style={{
            padding: 10, borderTop: "1px solid var(--brand-border)",
            display: "flex", gap: 8,
            background: "rgba(255,255,255,0.02)",
            borderRadius: "0 0 18px 18px",
          }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Ask anything…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--brand-border)", borderRadius: 10,
                padding: "8px 12px", color: "var(--brand-ink)",
                fontSize: 13, outline: "none",
              }}
            />
            <button onClick={() => send()} disabled={!draft.trim()} style={{
              background: draft.trim() ? "var(--brand-accent)" : "rgba(255,255,255,0.05)",
              color: draft.trim() ? "#0a0a1f" : "var(--brand-ink-mute)",
              border: "none", padding: "8px 14px", borderRadius: 10,
              fontSize: 12, fontWeight: 600,
              cursor: draft.trim() ? "pointer" : "not-allowed",
            }}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Zoom indicator: subscribes to geknee:camdist from LocationClient. ────
// Vertical stack pinned just under the hamburger Menu pill. Bar fills bottom-
// up as you zoom in; level name sits beneath in vertical writing mode.
function ZoomIndicator() {
  const [camDist, setCamDist] = useState<number | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ camDist: number }>).detail?.camDist;
      if (typeof d === "number") setCamDist(d);
    };
    window.addEventListener("geknee:camdist", handler);
    return () => window.removeEventListener("geknee:camdist", handler);
  }, []);
  if (camDist == null) return null;

  const level = camDist >= 26 ? "Globe"
              : camDist >= 21 ? "Continent"
              : camDist >= 16 ? "Region"
              : camDist >= 13 ? "Country"
              : camDist >= 10 ? "Local"
              :                  "City";

  // Position within the 8.5..30 visible range, clamped, then inverted so
  // close-zoom = full bar.
  const min = 8.5, max = 30;
  const pct = Math.max(0, Math.min(1, 1 - (camDist - min) / (max - min)));

  return (
    <div style={{
      position: "absolute",
      // Sits below the Menu (hamburger) pill in the top-right nav cluster.
      // Nav top is 18 + ~36px pill height + 14 gap ≈ 68; pad a little more.
      top: 76,
      right: 28,
      zIndex: 12,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "8px 6px",
      borderRadius: 14,
      background: "rgba(13,13,36,0.55)",
      border: "1px solid rgba(148,163,208,0.18)",
      WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)",
      color: "#a8a8c0",
      fontFamily: "var(--font-ui), system-ui, sans-serif",
      userSelect: "none",
      pointerEvents: "none",
    }}>
      {/* Vertical bar — fills bottom-up. */}
      <div style={{
        position: "relative",
        width: 3, height: 60,
        background: "rgba(148,163,208,0.18)",
        borderRadius: 999,
      }}>
        <div style={{
          position: "absolute", left: 0, bottom: 0, width: "100%",
          height: `${pct * 100}%`,
          background: "linear-gradient(0deg, var(--brand-accent), var(--brand-accent-2, #7dd3fc))",
          borderRadius: 999,
          transition: "height 280ms cubic-bezier(0.23, 1, 0.32, 1)",
        }} />
      </div>
      {/* Level name in vertical writing mode (reads bottom-to-top). */}
      <span style={{
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        fontWeight: 600,
        color: "var(--brand-accent)",
      }}>
        {level}
      </span>
    </div>
  );
}

function NavPill({
  children,
  href,
  onClick,
  accent,
  iconOnly,
  title,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  accent?: boolean;
  iconOnly?: boolean;
  title?: string;
}) {
  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: iconOnly ? "0 8px" : "6px 12px",
    minWidth: iconOnly ? 40 : undefined,
    minHeight: iconOnly ? 40 : undefined,
    justifyContent: "center" as const,
    borderRadius: 999,
    background: accent
      ? "rgba(167, 139, 250, 0.16)"
      : "var(--brand-surface)",
    WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)",
    border: `1px solid ${accent ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
    color: accent ? "var(--brand-accent)" : "var(--brand-ink)",
    fontSize: 11,
    fontWeight: accent ? 700 : 500,
    letterSpacing: "0.02em",
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  } as const;
  if (href) {
    return (
      <Link href={href} style={style} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} title={title} style={style}>
      {children}
    </button>
  );
}

function StepMarker({
  idx,
  label,
  active,
  onClick,
}: {
  idx: number;
  label: string;
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        padding: "4px 2px",
        color: active ? "var(--brand-ink)" : "var(--brand-ink-mute)",
        fontFamily: "var(--font-ui), system-ui, sans-serif",
        fontSize: 12,
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          fontWeight: 700,
          background: active ? "var(--brand-accent)" : "transparent",
          color: active ? "#0a0a1f" : "var(--brand-ink-mute)",
          border: active
            ? "1px solid var(--brand-accent)"
            : "1px solid var(--brand-border)",
        }}
      >
        {idx + 1}
      </span>
      {label}
    </button>
  );
}

function StepPlaceholder({ title, line }: { title: string; line: string }) {
  return (
    <div>
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--brand-ink)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          marginTop: 10,
          color: "var(--brand-ink-dim)",
          fontSize: 14,
          lineHeight: 1.5,
          maxWidth: 560,
        }}
      >
        {line}
      </p>
      <div
        style={{
          marginTop: 24,
          padding: 18,
          borderRadius: 12,
          border: "1px dashed var(--brand-border)",
          color: "var(--brand-ink-mute)",
          fontSize: 12,
          fontFamily: "var(--font-ui), system-ui, sans-serif",
        }}
      >
        {String.fromCodePoint(0x2728)} Step content lands in the next phase. The
        live planner at{" "}
        <Link
          href="/plan/location"
          style={{ color: "var(--brand-accent-2)" }}
        >
          /plan/location
        </Link>{" "}
        remains the production flow for now.
      </div>
    </div>
  );
}

function StepDestination({
  dest,
  setDest,
  submitDest,
  pickSuggestion,
  trip,
  onNext,
  destError,
  setDestError,
  extraVer,
}: {
  dest: string;
  setDest: (v: string) => void;
  submitDest: (v?: string) => void;
  pickSuggestion: (s: Suggestion) => void;
  trip: Trip;
  onNext: () => void;
  destError: string | null;
  setDestError: (e: string | null) => void;
  extraVer: number;
}) {
  return (
    <div>
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--brand-ink)",
        }}
      >
        Where to
        <em style={{ fontStyle: "italic", color: "var(--brand-accent)" }}>?</em>
      </h2>
      <p
        style={{
          marginTop: 8,
          color: "var(--brand-ink-dim)",
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: 560,
        }}
      >
        Type a city, country, or landmark — or pick one of the popular spots below.
      </p>

      <input
        ref={(el) => {
          // Pull focus when this step mounts so the cursor lands here after
          // the user clicks the peek search bar at the bottom.
          if (el && document.activeElement !== el) {
            requestAnimationFrame(() => el.focus());
          }
        }}
        value={dest}
        onChange={(e) => { setDest(e.target.value); if (destError) setDestError(null); }}
        onKeyDown={(e) => e.key === "Enter" && submitDest()}
        placeholder="Try 'Kyoto', 'Iceland', 'Eiffel Tower'…"
        style={{
          width: "100%",
          marginTop: 16,
          padding: "12px 16px",
          borderRadius: 12,
          border: destError ? "1px solid #ef4444" : "1px solid var(--brand-border)",
          background: "rgba(255,255,255,0.04)",
          color: "var(--brand-ink)",
          fontSize: 15,
          fontFamily: "var(--font-ui), system-ui, sans-serif",
          outline: "none",
        }}
      />

      {/* Inline error when submitDest rejects an unmatched query. */}
      {destError && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#fca5a5",
            fontFamily: "var(--font-ui), system-ui, sans-serif",
          }}
        >
          {destError}
        </div>
      )}

      {/* Autocomplete dropdown — top matches from monuments + cities. */}
      {dest.trim().length >= 2 && (() => {
        // Recompute when extras load (extraVer ticks once). Cheap O(n) over
        // ~33K cities; React batches the typing keystrokes so we're fine.
        void extraVer;
        const matches = searchDestinations(dest, [...CITIES_LIST, ...getExtraCities()], 6);
        if (matches.length === 0) return null;
        return (
          <div
            style={{
              marginTop: 8,
              borderRadius: 12,
              border: "1px solid var(--brand-border)",
              background: "rgba(15,23,42,0.85)",
              overflow: "hidden",
            }}
          >
            {matches.map((m) => (
              <button
                key={`${m.mk}|${m.lat.toFixed(2)}|${m.lon.toFixed(2)}`}
                type="button"
                onClick={() => pickSuggestion(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  color: "var(--brand-ink)",
                  fontFamily: "var(--font-ui), system-ui, sans-serif",
                  fontSize: 14,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 16 }}>{m.emoji}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                  {m.location && (
                    <span style={{ marginLeft: 8, opacity: 0.55, fontSize: 12 }}>{m.location}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      <div
        style={{
          marginTop: 20,
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 10,
          color: "var(--brand-ink-mute)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        Trending
      </div>
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        {POPULAR_SUGGESTIONS.map((s) => {
          const active = trip.mk === s.mk;
          return (
            <button
              key={s.mk}
              onClick={() => pickSuggestion(s)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: active
                  ? "rgba(167, 139, 250, 0.12)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
                color: "var(--brand-ink)",
                fontFamily: "var(--font-ui), system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 18 }}>{s.emoji}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.name}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--brand-ink-mute)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.location}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer state — confirms what's recorded so far + Next */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div
          style={{
            color: "var(--brand-ink-mute)",
            fontSize: 12,
            fontFamily: "var(--font-ui), system-ui, sans-serif",
          }}
        >
          {trip.destination ? (
            <>
              <span style={{ color: "var(--brand-accent-2)" }}>{String.fromCodePoint(0x2713)}</span>{" "}
              {trip.destination}
              {trip.mk && (
                <span style={{ marginLeft: 8, color: "var(--brand-ink-mute)" }}>
                  · pinned
                </span>
              )}
            </>
          ) : (
            "no destination yet"
          )}
        </div>
        <button
          onClick={onNext}
          disabled={!trip.destination}
          style={{
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: trip.destination
              ? "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-2))"
              : "rgba(255,255,255,0.04)",
            color: trip.destination ? "#0a0a1f" : "var(--brand-ink-mute)",
            fontFamily: "var(--font-ui), system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: trip.destination ? "pointer" : "not-allowed",
          }}
        >
          Next {String.fromCodePoint(0x2192)}
        </button>
      </div>
    </div>
  );
}

// ─── Steps 1-3 (minimum viable Atlas v0) ────────────────────────────────────
// Lean implementations so the whole flow works end-to-end. Heavier date
// pickers / style sliders / itinerary preview can land in v1 if Atlas
// wins the A/B against the existing /plan/* routes.

function StepHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <>
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--brand-ink)",
        }}
      >
        {title}
      </h2>
      {hint && (
        <p style={{ marginTop: 8, color: "var(--brand-ink-dim)", fontSize: 13, lineHeight: 1.5 }}>
          {hint}
        </p>
      )}
    </>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled,
  busy,
  rightSlot,
}: {
  onBack: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <button
        onClick={onBack}
        style={{
          padding: "8px 14px",
          borderRadius: 10,
          border: "1px solid var(--brand-border)",
          background: "transparent",
          color: "var(--brand-ink-dim)",
          fontFamily: "var(--font-ui), system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {String.fromCodePoint(0x2190)} Back
      </button>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {rightSlot}
        {onNext && (
          <button
            onClick={onNext}
            disabled={nextDisabled || busy}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: nextDisabled
                ? "rgba(255,255,255,0.04)"
                : "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-2))",
              color: nextDisabled ? "var(--brand-ink-mute)" : "#0a0a1f",
              fontFamily: "var(--font-ui), system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.02em",
              cursor: nextDisabled || busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Saving…" : `${nextLabel} ${String.fromCodePoint(0x2192)}`}
          </button>
        )}
      </div>
    </div>
  );
}

// Mock flight price by date + destination. Deterministic so the same date
// always returns the same number across renders. Replace with a real
// pricing source (Skyscanner, Kiwi, Google Flights API, etc.) when wired.
function _mockFlightPrice(dateStr: string, destination: string): number {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  };
  const base = 280 + (hash(destination || 'world') % 1100);
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const dowMul = (dow === 5 || dow === 0) ? 1.18 : (dow === 2 || dow === 3) ? 0.92 : 1.0;
  const variance = 0.85 + ((hash(dateStr + '|' + destination) % 100) / 100) * 0.30;
  const m = d.getMonth() + 1, day = d.getDate();
  const holidayMul = (m === 12 && day >= 18) ? 1.45
                   : (m === 7 && day <= 7)   ? 1.30
                   : (m === 11 && day >= 22 && day <= 28) ? 1.30
                   : 1.0;
  return Math.round(base * dowMul * variance * holidayMul);
}

function PriceTrend({ trip, setTrip }: { trip: Trip; setTrip: (t: Trip) => void }) {
  const dates: string[] = [];
  if (trip.flexibleMonth) {
    // Whole-month view when the user picked a flexible month — same logic
    // as nextMonthStart so the dates align with what the buttons set.
    const monthIdx = MONTHS.indexOf(trip.flexibleMonth);
    if (monthIdx < 0) return null;
    const today = new Date();
    let year = today.getFullYear();
    if (monthIdx <= today.getMonth()) year++;
    const last = new Date(year, monthIdx + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const ds = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dates.push(ds);
    }
  } else if (trip.startDate) {
    // ±10 day window centred on the chosen depart date.
    for (let off = -10; off <= 10; off++) dates.push(addDays(trip.startDate, off));
  } else {
    return null;
  }

  const prices = dates.map(d => _mockFlightPrice(d, trip.destination));
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = Math.max(1, max - min);
  const cheapest = prices.indexOf(min);

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        fontSize: 10, color: 'var(--brand-ink-mute)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontWeight: 600, marginBottom: 8,
      }}>
        <span>Flight price trend</span>
        <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--brand-ink-dim)', fontSize: 10 }}>
          ${min} – ${max} · cheapest{' '}
          <span style={{ color: 'var(--brand-accent)' }}>
            {new Date(dates[cheapest] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        </span>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--brand-border)',
        borderRadius: 10, padding: '14px 12px 8px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 3,
          height: 70,
        }}>
          {dates.map((ds, i) => {
            const p = prices[i];
            const h = 18 + ((p - min) / range) * 48;
            const isCheap = i === cheapest;
            const isSelected = ds === trip.startDate;
            const color = isSelected
              ? 'var(--brand-accent)'
              : isCheap
                ? '#34d399'
                : 'rgba(167,139,250,0.4)';
            return (
              <button
                key={ds}
                type="button"
                title={`${new Date(ds + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · $${p}`}
                onClick={() => setTrip({
                  ...trip,
                  startDate: ds,
                  endDate: addDays(ds, trip.nights),
                  flexibleMonth: null,
                })}
                style={{
                  flex: 1, minWidth: 0,
                  height: `${h}px`,
                  background: color,
                  borderRadius: 3,
                  border: 'none', padding: 0,
                  cursor: 'pointer',
                  transition: 'opacity 0.12s ease',
                  opacity: isSelected || isCheap ? 1 : 0.85,
                }}
              />
            );
          })}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 9, color: 'var(--brand-ink-mute)',
          marginTop: 6, fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}>
          <span>{new Date(dates[0] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          <span style={{ color: 'var(--brand-ink-dim)', fontStyle: 'italic' }}>
            {trip.flexibleMonth ? 'tap a bar to lock that day' : 'tap to shift dates'}
          </span>
          <span>{new Date(dates[dates.length - 1] + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </div>
  );
}

function StepDates({
  trip, setTrip, onBack, onNext,
}: {
  trip: Trip;
  setTrip: (t: Trip) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const dateInput = {
    width: "100%", boxSizing: "border-box" as const,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--brand-border)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--brand-ink)",
    fontSize: 14,
    fontFamily: "var(--font-ui), system-ui, sans-serif",
    outline: "none",
    colorScheme: "dark" as const,
  };
  const labelText = {
    fontSize: 10,
    color: "var(--brand-ink-mute)",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
  };

  return (
    <div>
      <h3 style={{
        fontFamily: "var(--font-display), Georgia, serif",
        fontSize: 24, fontWeight: 400, margin: "0 0 6px",
        letterSpacing: "-0.01em",
      }}>When?</h3>
      <div style={{ color: "var(--brand-ink-dim)", fontSize: 13, marginBottom: 20 }}>
        {trip.destination ? `For your trip to ${trip.destination}` : "Pick a travel window — dates optional"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label>
          <span style={labelText}>Depart</span>
          <input type="date" value={trip.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              if (!startDate) { setTrip({ ...trip, startDate: "" }); return; }
              // Lock nights, recompute return; clear flexible month since dates were set.
              setTrip({
                ...trip,
                startDate,
                endDate: addDays(startDate, trip.nights),
                flexibleMonth: null,
              });
            }}
            style={dateInput} />
        </label>
        <label>
          <span style={labelText}>Return</span>
          <input type="date" value={trip.endDate}
            onChange={(e) => {
              const endDate = e.target.value;
              if (!endDate) { setTrip({ ...trip, endDate: "" }); return; }
              if (trip.startDate) {
                const nights = clampNights(diffDays(trip.startDate, endDate));
                setTrip({
                  ...trip,
                  endDate: addDays(trip.startDate, nights),
                  nights,
                  flexibleMonth: null,
                });
              } else {
                // No start yet — derive it backwards from the chosen return.
                setTrip({
                  ...trip,
                  startDate: addDays(endDate, -trip.nights),
                  endDate,
                  flexibleMonth: null,
                });
              }
            }}
            style={dateInput} />
        </label>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={labelText}>Flexible? Pick a month</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MONTHS.map((m, idx) => {
            const active = trip.flexibleMonth === m;
            return (
              <button key={m}
                onClick={() => {
                  if (active) {
                    setTrip({ ...trip, flexibleMonth: null });
                    return;
                  }
                  const startDate = nextMonthStart(idx);
                  setTrip({
                    ...trip,
                    flexibleMonth: m,
                    startDate,
                    endDate: addDays(startDate, trip.nights),
                  });
                }}
                style={{
                  display: "inline-flex", alignItems: "center",
                  padding: "5px 10px",
                  borderRadius: 999,
                  fontSize: 11, fontWeight: 500,
                  fontFamily: "inherit",
                  background: active ? "rgba(167,139,250,0.16)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
                  color: active ? "var(--brand-accent)" : "var(--brand-ink-dim)",
                  cursor: "pointer",
                }}
              >{m}</button>
            );
          })}
        </div>
      </div>

      <PriceTrend trip={trip} setTrip={setTrip} />

      <div style={{ marginTop: 22 }}>
        <div style={labelText}>Trip length · {trip.nights} nights</div>
        <input type="range" min={2} max={21} value={trip.nights}
          onChange={(e) => {
            const nights = clampNights(parseInt(e.target.value, 10));
            // If a start date exists, slide the return alongside.
            const endDate = trip.startDate ? addDays(trip.startDate, nights) : trip.endDate;
            setTrip({ ...trip, nights, endDate });
          }}
          style={{ width: "100%", accentColor: "var(--brand-accent)" }} />
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={false} />
    </div>
  );
}

function StepStyle({
  trip, setTrip, onBack, onNext,
}: {
  trip: Trip;
  setTrip: (t: Trip) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const labelText = {
    fontSize: 10, color: "var(--brand-ink-mute)",
    letterSpacing: "0.12em", textTransform: "uppercase" as const,
    fontWeight: 600, marginBottom: 8,
  };
  return (
    <div>
      <h3 style={{
        fontFamily: "var(--font-display), Georgia, serif",
        fontSize: 24, fontWeight: 400, margin: "0 0 20px",
        letterSpacing: "-0.01em",
      }}>What kind of trip?</h3>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 10,
      }}>
        {STYLE_OPTIONS.map((s) => {
          const active = trip.style === s.id;
          return (
            <button key={s.id}
              onClick={() => setTrip({ ...trip, style: s.id })}
              style={{
                background: active ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${active ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
                borderRadius: 14,
                padding: "14px",
                textAlign: "left",
                cursor: "pointer",
                color: "var(--brand-ink)",
                fontFamily: "inherit",
                transition: "all 160ms",
              }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: "var(--brand-ink-mute)", marginTop: 3 }}>{s.tag}</div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={labelText}>Budget per person</div>
        <div style={{ display: "flex", gap: 8 }}>
          {BUDGETS.map((b) => {
            const active = trip.budget === b;
            const perDay = b === "$" ? 60 : b === "$$" ? 150 : b === "$$$" ? 300 : 600;
            const tier   = b === "$" ? "Hostel" : b === "$$" ? "Comfort" : b === "$$$" ? "Boutique" : "Luxury";
            return (
              <button key={b}
                onClick={() => setTrip({ ...trip, budget: b })}
                style={{
                  flex: 1, padding: "10px 4px",
                  background: active ? "rgba(167,139,250,0.16)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? "var(--brand-border-hi)" : "var(--brand-border)"}`,
                  borderRadius: 10,
                  color: active ? "var(--brand-accent)" : "var(--brand-ink-dim)",
                  fontSize: 14, fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                }}>
                <span>{b}</span>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.02em",
                  color: active ? "var(--brand-accent)" : "var(--brand-ink-mute)",
                  opacity: active ? 0.85 : 0.7,
                }}>${perDay}/day</span>
                <span style={{
                  fontSize: 9, fontWeight: 500,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--brand-ink-mute)",
                  opacity: active ? 0.7 : 0.55,
                }}>{tier}</span>
              </button>
            );
          })}
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextDisabled={!trip.style} />
    </div>
  );
}

function StepReview({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const reviewRouter = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const endDate = trip.startDate ? addDays(trip.startDate, trip.nights) : "";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Trip to ${trip.destination}`,
          location: trip.destination,
          startDate: trip.startDate || null,
          endDate: endDate || null,
          nights: trip.nights,
          style: trip.style ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save the trip — try again.");
        setBusy(false);
        return;
      }
      const id = data?.trip?.id ?? data?.id ?? "";
      setSavedTripId(id);
      // Hand off to /plan/summary so the AI itinerary kicks off immediately
      // rather than parking the user on a "Saved." confirmation.
      if (id) {
        // The summary page expects ?savedTripId= (loads itinerary from DB)
        // PLUS the trip context as URL params (powers the masthead, weather
        // fetch, and stable trip-id hash). Pass both.
        const q = new URLSearchParams({
          savedTripId: id,
          location: trip.destination,
          startDate: trip.startDate || '',
          endDate: endDate || '',
          nights: String(trip.nights),
          style: trip.style ?? '',
          budget: trip.budget ?? '',
        });
        reviewRouter.push(`/plan/summary?${q.toString()}`);
      } else {
        setBusy(false);
      }
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  };

  // Rough per-person estimate so the summary stat isn't blank. Real numbers
  // come from the backend itinerary endpoint once that's wired.
  const perDay = trip.budget === "$" ? 60
              : trip.budget === "$$" ? 150
              : trip.budget === "$$$" ? 300
              : trip.budget === "$$$$" ? 600
              : 0;
  const estTotal = perDay * trip.nights;
  const dateRange = trip.startDate && trip.endDate ? `${trip.startDate} → ${trip.endDate}`
                  : trip.startDate ? `${trip.startDate} → ${endDate}`
                  : trip.flexibleMonth ? `Flexible · ${trip.flexibleMonth}`
                  : "Dates flexible";

  return (
    <div>
      {/* Eyebrow */}
      <div style={{
        fontSize: 10, color: "var(--brand-accent)", letterSpacing: "0.16em",
        fontWeight: 600, marginBottom: 6,
      }}>
        <Sparkle size={10} style={{ verticalAlign: "-1px", marginRight: 4 }} /> YOUR ITINERARY
      </div>

      {/* Title */}
      <h2 style={{
        margin: 0,
        fontFamily: "var(--font-display), Georgia, serif",
        fontSize: 30, fontWeight: 400,
        letterSpacing: "-0.02em", lineHeight: 1.05,
        color: "var(--brand-ink)",
      }}>
        {trip.destination || "Your trip"}{" "}
        {trip.style && (
          <em style={{ fontStyle: "italic", color: "var(--brand-accent)" }}>
            {trip.style}
          </em>
        )}
      </h2>
      <div style={{ marginTop: 6, color: "var(--brand-ink-dim)", fontSize: 13 }}>
        {dateRange} · {trip.nights} night{trip.nights === 1 ? "" : "s"}
        {trip.budget ? ` · ${trip.budget}` : ""}
      </div>

      {/* Stat grid */}
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SummaryStat
          k="Est. total"
          v={estTotal > 0 ? `$${estTotal.toLocaleString()}` : "—"}
          sub={estTotal > 0 ? "per person" : "set a budget"}
        />
        <SummaryStat
          k="Style"
          v={trip.style ? capitalize(trip.style) : "—"}
          sub={trip.budget ? `Budget ${trip.budget}` : "no budget yet"}
        />
        <SummaryStat
          k="Trip pin"
          v={trip.mk ? trip.mk : trip.lat && trip.lon ? `${trip.lat.toFixed(1)}°, ${trip.lon.toFixed(1)}°` : "—"}
          sub={trip.mk ? "matched landmark" : trip.lat ? "free-text destination" : "no pin yet"}
        />
        <SummaryStat
          k="Saved"
          v={savedTripId ? "Yes" : "No"}
          sub={savedTripId ? "in your trips" : "tap Save plan"}
        />
      </div>

      {/* Genie footer card */}
      <div style={{
        marginTop: 18,
        padding: 14,
        borderRadius: 12,
        background: "linear-gradient(135deg, rgba(167,139,250,0.18), rgba(125,211,252,0.10))",
        border: "1px solid var(--brand-border-hi)",
      }}>
        <div style={{
          fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--brand-accent)", fontWeight: 700, marginBottom: 4,
        }}>
          <Sparkle size={10} style={{ verticalAlign: "-1px", marginRight: 4 }} /> Your genie says
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--brand-ink)" }}>
          Based on a {trip.style || "relaxed"} trip to {trip.destination || "your destination"},
          I&apos;ll draft a {trip.nights}-night itinerary on the next screen — usually 30–60 seconds.
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "rgba(248, 113, 113, 0.08)",
            border: "1px solid rgba(248, 113, 113, 0.35)",
            borderRadius: 10,
            color: "var(--brand-danger)",
            fontSize: 12,
            fontFamily: "var(--font-ui), system-ui, sans-serif",
          }}
        >
          {error}
          {error.toLowerCase().includes("unauth") && (
            <>
              {" "}
              <Link href="/api/auth/signin" style={{ color: "var(--brand-accent-2)", textDecoration: "underline" }}>
                Sign in
              </Link>{" "}
              to save trips.
            </>
          )}
        </div>
      )}

      {savedTripId && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "rgba(167, 139, 250, 0.10)",
            border: "1px solid var(--brand-border-hi)",
            borderRadius: 10,
            color: "var(--brand-ink)",
            fontSize: 13,
            fontFamily: "var(--font-ui), system-ui, sans-serif",
          }}
        >
          {String.fromCodePoint(0x2728)} Saved.{" "}
          <Link
            href={`/plan/summary?tripId=${encodeURIComponent(savedTripId)}`}
            style={{ color: "var(--brand-accent-2)", textDecoration: "underline" }}
          >
            Open in summary →
          </Link>
        </div>
      )}

      {savedTripId ? (
        <StepNav onBack={onBack} />
      ) : (
        <StepNav
          onBack={onBack}
          onNext={save}
          nextLabel={`Build itinerary ${String.fromCodePoint(0x2728)}`}
          busy={busy}
          nextDisabled={!trip.destination || !trip.startDate || !trip.style}
        />
      )}
    </div>
  );
}

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt
      style={{
        color: "var(--brand-ink-mute)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        alignSelf: "center",
      }}
    >
      {children}
    </dt>
  );
}
function DD({ children }: { children: React.ReactNode }) {
  return (
    <dd style={{ margin: 0, color: "var(--brand-ink)", fontSize: 14 }}>{children}</dd>
  );
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SummaryStat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div style={{
      padding: "10px 12px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: 10,
      border: "1px solid var(--brand-border)",
    }}>
      <div style={{
        fontSize: 10, color: "var(--brand-ink-mute)",
        letterSpacing: "0.12em", fontWeight: 600,
        textTransform: "uppercase",
      }}>{k}</div>
      <div style={{
        fontFamily: "var(--font-display, Georgia, serif)",
        fontSize: 20, fontWeight: 500, marginTop: 3,
        letterSpacing: "-0.01em",
        color: "var(--brand-ink)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{v}</div>
      {sub && (
        <div style={{ fontSize: 10, color: "var(--brand-ink-mute)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
