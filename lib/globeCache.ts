// IndexedDB-backed cache for the globe's pre-baked label overlay
// textures. Goal: skip the ~40 MB states JSON fetch + the canvas bake
// on returning visitors (~95% of traffic). First visit pays the full
// cost; afterward, the two overlay WebP blobs sit in the user's local
// IDB and load in ~50 ms instead of ~15-20 s.
//
// Bump OVERLAY_CACHE_VERSION any time the bake output would change
// (label sizes, tier rules, terrain blending, etc.) so stale caches
// get invalidated rather than served. The version is part of the IDB
// key, so old entries quietly fall out of use and get GC'd by the
// browser when storage pressure hits.

const DB_NAME = "geknee-globe-cache";
const STORE = "overlays";
const DB_VERSION = 1;

// Versions of the bake output that callers gate on. Bump whenever
// createEarthTexture's overlay paint behavior changes in a visible way.
// (Format: yyyy-mm-dd-N when convenient, but any unique string works.)
// 2026-05-22-1: split borders into a 3rd "always-visible" overlay
// (was previously fused with state labels on a single tier-gated
// sphere — caused country borders to look sunken into the terrain).
// 2026-05-22-2: label anchoring switched from shoelace centroid to
// pole-of-inaccessibility (ringLabelAnchor). Fixes country labels
// landing in the ocean for concave shapes (Chile, Norway, Italy).
// 2026-05-22-3: borders moved BACK into the base canvas with a
// two-pass dark-halo + white-line stroke (matches the technique
// country labels use). Keeps borders on the same "no z-offset"
// plane as the labels so the continent + border read stays
// coherent at every zoom — no parallax between sphere radii.
export const OVERLAY_CACHE_VERSION = "2026-05-22-3";

type Stored = {
  blob: Blob;
  version: string;
  // Source data fingerprints. If the upstream GeoJSON or curated city
  // list changes, callers can compare and invalidate without bumping
  // the version constant manually. Optional — empty string means "any".
  countriesEtag?: string;
  statesEtag?: string;
};

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function getOverlayBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const stored = req.result as Stored | undefined;
        if (!stored) return resolve(null);
        if (stored.version !== OVERLAY_CACHE_VERSION) return resolve(null);
        resolve(stored.blob);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

export async function setOverlayBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const stored: Stored = { blob, version: OVERLAY_CACHE_VERSION };
      const req = tx.objectStore(STORE).put(stored, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* IDB can fail in Safari private mode and on quota pressure — both
       are non-fatal here, just means next visit re-bakes. */
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

// Convenience helpers for the canonical overlay keys.
export const STATES_OVERLAY_KEY = "states-overlay";
export const CITIES_OVERLAY_KEY = "cities-overlay";

export async function getCachedOverlays(): Promise<{ states: Blob; cities: Blob } | null> {
  const [states, cities] = await Promise.all([
    getOverlayBlob(STATES_OVERLAY_KEY),
    getOverlayBlob(CITIES_OVERLAY_KEY),
  ]);
  if (states && cities) return { states, cities };
  return null;
}

export async function saveCachedOverlays(states: Blob, cities: Blob): Promise<void> {
  await Promise.all([
    setOverlayBlob(STATES_OVERLAY_KEY, states),
    setOverlayBlob(CITIES_OVERLAY_KEY, cities),
  ]);
}

// Load a Blob into an HTMLImageElement we can turn into a Three.js
// CanvasTexture / Texture without re-running the canvas bake. Resolves
// to null if the browser can't decode (corrupt cache → invalidate).
export function blobToImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); /* keep URL alive — Image holds the decoded data */ };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
