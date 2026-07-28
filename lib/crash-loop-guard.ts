// Detects a Capacitor / WKWebView crash-reload loop and short-circuits
// the interactive globe to break it.
//
// The pattern: on iOS, if a page's mount work pins the WebKit main thread
// too long, the OS watchdog kills the content process. Capacitor's default
// handler auto-reloads the initial URL. If the same mount work pins the
// thread again on the reload, we loop — user sees a full-page refresh
// every ~5 seconds forever.
//
// Signal: 2+ page mounts within CRASH_LOOP_WINDOW_MS = the current mount
// is at least the second in a crash-loop. Flip the existing globe-fallback
// flag so AtlasShell renders the static backdrop instead of CapacitorGlobe.
//
// Recovery: user fully kills and relaunches the app → fresh sessionStorage
// → interactive globe returns on the next attempt. The flag deliberately
// uses sessionStorage (per-tab, cleared on hard app kill) so the guard
// doesn't persist beyond a single blink-loop incident.
//
// Called once from AtlasShell's first useEffect. Idempotent within a mount.

const MOUNT_TIMESTAMPS_KEY = "geknee:mount-timestamps-v1";
const FALLBACK_FLAG = "geknee_globe_fallback"; // must match AtlasShell.tsx
const CRASH_LOOP_WINDOW_MS = 12_000;
const CRASH_LOOP_THRESHOLD = 2;

/**
 * Records this mount's timestamp and returns true if we detected a
 * crash-reload loop (≥ CRASH_LOOP_THRESHOLD mounts within the window).
 * When it returns true, the caller should also observe that FALLBACK_FLAG
 * has been set in sessionStorage — AtlasShell reads that on next render.
 */
/**
 * Manual escape hatch — clears the crash-loop state so the next mount
 * gets a fresh chance at the interactive globe. Called by the INITIALIZE
 * button + the fallback-screen "Try again" button. If the underlying
 * crash cause hasn't been fixed, the user just re-arms the fallback on
 * the next crash — no worse off, but at least not stuck.
 */
export function escapeCrashLoop(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MOUNT_TIMESTAMPS_KEY);
    sessionStorage.removeItem(FALLBACK_FLAG);
  } catch { /* ignore */ }
}

export function detectCrashLoopAndArmFallback(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(MOUNT_TIMESTAMPS_KEY);
    const prior: number[] = raw ? JSON.parse(raw) : [];
    const recent = prior.filter((t) => now - t < CRASH_LOOP_WINDOW_MS);
    recent.push(now);
    sessionStorage.setItem(MOUNT_TIMESTAMPS_KEY, JSON.stringify(recent));

    if (recent.length >= CRASH_LOOP_THRESHOLD) {
      sessionStorage.setItem(FALLBACK_FLAG, "1");
      try {
        (window as unknown as { __geknee_crash_loop?: { mounts: number; windowMs: number } }).__geknee_crash_loop = {
          mounts: recent.length,
          windowMs: CRASH_LOOP_WINDOW_MS,
        };
      } catch { /* ignore */ }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
