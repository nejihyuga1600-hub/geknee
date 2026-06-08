"use client";
// Pending-unlock bridge — module-level singleton + React subscriber hook.
//
// Extracted out of landmark.tsx so non-Three.js consumers (MonumentShop,
// UnlockShareToast, the share toast bridge) can import the bridge without
// pulling the whole R3F/drei/three module graph into their chunks. On
// WKWebView (no JIT) parsing that graph mid-session pegs CPU long enough
// for iOS's WebKit watchdog to kill the WebView — Capacitor auto-reloads,
// blink loop. Keep this file free of three / r3f / drei imports.

import { useEffect, useState } from "react";

export type PendingUnlock = {
  mk: string;
  skin: string;
  photoUrl?: string;
  ts: number;
};

let _pendingUnlock: PendingUnlock | null = null;
const _pendingUnlockListeners = new Set<() => void>();

export function _setPendingUnlock(
  u: { mk: string; skin: string; photoUrl?: string } | null,
) {
  _pendingUnlock = u ? { ...u, ts: Date.now() } : null;
  _pendingUnlockListeners.forEach((fn) => fn());
}

// Lm uses this to avoid clobbering a richer (photoUrl-bearing) pending unlock
// the MonumentShop already set for the same monument.
export function _hasPendingUnlockFor(mk: string): boolean {
  return _pendingUnlock?.mk === mk;
}

export function usePendingUnlock(): PendingUnlock | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((t) => t + 1);
    _pendingUnlockListeners.add(cb);
    return () => {
      _pendingUnlockListeners.delete(cb);
    };
  }, []);
  return _pendingUnlock;
}
