// Native offline-map bridge.
//
// Phase 1 design — the actual plugin install + iOS/Android wiring lands
// in a focused native session. This file holds the interface the
// product code talks to, so the live-trip page + trip-detail toggle can
// already wire to a stable API.
//
// Web: every call no-ops. The SW static-tile cache (Phase 2) handles
// the offline experience for non-native users.
//
// Native (Capacitor): downloadOfflineRegion will call into the chosen
// SDK (Mapbox `OfflineManager.createPack` or MapLibre Native's
// equivalent — TBD when the plugin is installed). The interface below
// is shaped to match both.
//
// Why a stub now: lets us ship Phase 3 (UI controls + status banner)
// against a stable contract. Replacing the implementation later doesn't
// require touching the product code.

import { Capacitor } from '@capacitor/core';

export interface OfflineBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OfflineRegionStatus {
  /** True if the region is fully downloaded and ready for offline use. */
  cached: boolean;
  /** Bytes on disk for this region (0 if not cached). */
  sizeBytes: number;
  /** Download progress when in-flight, 0..1. -1 when idle. */
  progress: number;
}

/** Whether native offline downloads are available on the current runtime. */
export function isNativeOfflineSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Initiate a download of the offline region. Web returns immediately
 * with a `not-supported` resolved promise so callers can early-exit.
 */
export async function downloadOfflineRegion(
  regionId: string,
  bounds: OfflineBounds,
  opts?: { minZoom?: number; maxZoom?: number },
): Promise<{ ok: boolean; reason?: string }> {
  if (!isNativeOfflineSupported()) {
    return { ok: false, reason: 'not-supported' };
  }
  // TODO(phase-1-native): once @capacitor-community/maplibre-native (or
  // equivalent) is installed, call its createOfflinePack API here.
  // Expected shape, roughly:
  //   await OfflineManager.createPack({
  //     name: regionId,
  //     styleURL: 'https://tiles.maplibre.org/styles/v1/dark.json',
  //     bounds: [[west, south], [east, north]],
  //     minZoom: opts?.minZoom ?? 11,
  //     maxZoom: opts?.maxZoom ?? 16,
  //   });
  console.warn('[native-offline-maps] download stub — native plugin not yet installed', {
    regionId, bounds, opts,
  });
  return { ok: false, reason: 'stub-not-yet-implemented' };
}

/** Status of a previously downloaded region. */
export async function getRegionStatus(_regionId: string): Promise<OfflineRegionStatus> {
  return { cached: false, sizeBytes: 0, progress: -1 };
}

/** Delete a downloaded region — used by the UI's "remove offline copy" toggle. */
export async function deleteOfflineRegion(_regionId: string): Promise<void> {
  if (!isNativeOfflineSupported()) return;
  console.warn('[native-offline-maps] delete stub');
}
