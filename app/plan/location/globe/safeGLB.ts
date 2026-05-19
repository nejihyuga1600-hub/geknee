// Wrapper around drei's useGLTF.preload that probes a URL with a HEAD request
// once and remembers the result. Known-bad URLs (403, 404, CORS, etc.) are
// permanently blacklisted for the session so the globe doesn't spam the
// console or burn bandwidth on re-mount / HMR / state churn.
//
// Use safePreloadGLB(url) instead of useGLTF.preload(url) everywhere.
//
// Does NOT replace the actual useGLTF(url) hook call inside a component —
// that's intentionally still allowed so a ModelErrorBoundary can fall back
// to a primitive when a 403 ships from prod. We just stop the proactive
// fire-and-forget preload from making 50 noise requests on page load.

import { useGLTF } from "@react-three/drei";

const _checked = new Map<string, boolean>();           // url → reachable?
const _inflight = new Map<string, Promise<boolean>>(); // url → probe promise

async function probe(url: string): Promise<boolean> {
  const cached = _checked.get(url);
  if (cached !== undefined) return cached;
  const existing = _inflight.get(url);
  if (existing) return existing;

  const p = fetch(url, { method: "HEAD", cache: "force-cache" })
    .then(r => r.ok)
    .catch(() => false)
    .then(ok => {
      _checked.set(url, ok);
      _inflight.delete(url);
      return ok;
    });
  _inflight.set(url, p);
  return p;
}

export function safePreloadGLB(url: string): void {
  if (typeof window === "undefined") return;
  probe(url).then(ok => {
    // Pass `true` for useMeshopt so gltfpack-compressed GLBs preload correctly.
    if (ok) useGLTF.preload(url, undefined, true);
  });
}

export function isKnownBadGLB(url: string): boolean {
  return _checked.get(url) === false;
}

// Used by tests/diagnostics to inspect probe cache.
export function _probeCacheSize(): number {
  return _checked.size;
}
