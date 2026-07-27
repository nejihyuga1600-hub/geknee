// Session-continuity telemetry — detects WKWebView content-process kills
// and fires a Sentry event that tells us WHICH phase of the CapacitorGlobe
// mount is pinning the WebKit main thread.
//
// How it works:
//   1. A rAF-driven beacon writes { ts, phase } to sessionStorage every 4s.
//   2. On page mount, we read the previous beacon. If ts is < 12s ago, the
//      previous session died in a crash-reload (not a clean navigation) —
//      we fire a Sentry "webview_respawn" event with the last known phase.
//   3. CapacitorGlobe calls markMountPhase("mapbox-init"|"style-load"|...
//      as it progresses so we can pin down where the CPU spike lands.
//
// This runs BESIDE crash-loop-guard.ts:
//   - crash-loop-guard breaks the loop (arms the static-backdrop fallback)
//   - session-continuity tells us WHY the loop happened (Sentry event)
// Both use sessionStorage so a hard app-kill resets state cleanly.

import { captureError, breadcrumb } from "./sentry";

const BEACON_KEY = "geknee:continuity-beacon-v1";
const RESPAWN_WINDOW_MS = 12_000;
const BEACON_INTERVAL_MS = 4_000;

type Beacon = { ts: number; phase: string; url: string };

let beaconTimer: ReturnType<typeof setInterval> | null = null;
let currentPhase = "idle";

function readBeacon(): Beacon | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BEACON_KEY);
    return raw ? (JSON.parse(raw) as Beacon) : null;
  } catch { return null; }
}

function writeBeacon() {
  if (typeof window === "undefined") return;
  try {
    const b: Beacon = {
      ts: Date.now(),
      phase: currentPhase,
      url: window.location.pathname + window.location.search,
    };
    sessionStorage.setItem(BEACON_KEY, JSON.stringify(b));
  } catch { /* ignore */ }
}

/**
 * Call once at the top of the app / AtlasShell mount. Reads the previous
 * beacon; if it fired < RESPAWN_WINDOW_MS ago, fires a Sentry event
 * describing the crash. Then arms the 4s heartbeat.
 */
export function initSessionContinuity() {
  if (typeof window === "undefined") return;
  const prev = readBeacon();
  const now = Date.now();
  if (prev && now - prev.ts < RESPAWN_WINDOW_MS) {
    // Crash-reload detected. Fire a Sentry event tagged so we can group
    // and see mount-phase distribution over time.
    const gap = now - prev.ts;
    const isNative = !!(window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor?.isNativePlatform?.();
    try {
      captureError(new Error(`webview_respawn: mount died in phase "${prev.phase}" (gap ${gap}ms)`), {
        respawn: true,
        gap_ms: gap,
        last_phase: prev.phase,
        last_url: prev.url,
        current_url: window.location.pathname + window.location.search,
        native: isNative,
        ua: navigator.userAgent,
      });
    } catch { /* ignore */ }
    try {
      breadcrumb("webview", `respawn from phase=${prev.phase} after ${gap}ms`);
    } catch { /* ignore */ }
  }

  // Arm the heartbeat. Cleared automatically if the page cleanly unloads
  // (pagehide/beforeunload). If the process is killed, the interval dies
  // with it and the next mount sees the last-written beacon.
  if (beaconTimer) clearInterval(beaconTimer);
  writeBeacon();
  beaconTimer = setInterval(writeBeacon, BEACON_INTERVAL_MS);

  // Clean up on real unload so we don't false-positive across intended
  // navigations. pagehide fires for both same-doc and cross-doc unloads.
  const onPageHide = () => {
    try {
      if (typeof window !== "undefined") sessionStorage.removeItem(BEACON_KEY);
    } catch { /* ignore */ }
    if (beaconTimer) { clearInterval(beaconTimer); beaconTimer = null; }
  };
  window.addEventListener("pagehide", onPageHide, { once: true });
}

/**
 * Update the mount-phase label so the beacon captures where we are. The
 * next crash-respawn Sentry event tags this as `last_phase`, telling us
 * which piece of CapacitorGlobe (or elsewhere) pinned the CPU.
 *
 * Examples: "capacitor-globe:mapbox-init", "capacitor-globe:style-load",
 * "capacitor-globe:monument-fetch", "capacitor-globe:idle".
 */
export function markMountPhase(phase: string) {
  currentPhase = phase;
  // Write immediately so the phase is captured even if the crash happens
  // between beacon ticks.
  writeBeacon();
}
