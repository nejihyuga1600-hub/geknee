// Shared signal between GlobalChat (outside Canvas) and GlobeScene/CameraZoomHandler (inside Canvas).
// Module-level so it crosses the R3F Canvas boundary without prop-drilling.

export type GlobeTarget = { lat: number; lon: number; onDone: () => void };
export type ZoomTarget  = { distance: number; onDone?: () => void };

let _pending:     GlobeTarget | null = null;
let _pendingZoom: ZoomTarget  | null = null;
let _pendingReset: boolean = false;

/** Called by Initialize button — de-rolls globe to upright without changing facing longitude. */
export function resetGlobeTilt() { _pendingReset = true; }

/** Called each frame by GlobeScene. */
export function consumeResetTilt(): boolean {
  const v = _pendingReset; _pendingReset = false; return v;
}

/** Called by GlobalChat when user submits a destination. */
export function flyToGlobe(lat: number, lon: number, onDone: () => void) {
  _pending = { lat, lon, onDone };
}

/** Called by GlobalChat to animate camera zoom after globe rotation. */
export function zoomCamera(distance: number, onDone?: () => void) {
  _pendingZoom = { distance, onDone };
}

/** Called each frame by GlobeScene — clears after reading. */
export function consumeGlobeTarget(): GlobeTarget | null {
  const t = _pending;
  _pending = null;
  return t;
}

/** Called each frame by CameraZoomHandler — clears after reading. */
export function consumeCameraZoom(): ZoomTarget | null {
  const t = _pendingZoom;
  _pendingZoom = null;
  return t;
}
