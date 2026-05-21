'use client';
import { useMemo } from 'react';

/**
 * Returns the IANA timezone string to use for rendering trip activity times.
 * Priority:
 *  1. The trip's persisted timezone (resolved from destination lat/lng at lock time).
 *  2. The browser's local timezone (Intl.DateTimeFormat fallback).
 *  3. 'UTC' as a last resort.
 */
export function useTripTimezone(tripTimezone: string | null | undefined): string {
  return useMemo(() => {
    if (tripTimezone) return tripTimezone;
    if (typeof Intl !== 'undefined') return Intl.DateTimeFormat().resolvedOptions().timeZone;
    return 'UTC';
  }, [tripTimezone]);
}
