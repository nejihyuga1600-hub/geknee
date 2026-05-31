'use client';
import posthog from 'posthog-js';

// Five events we care about right now — if you need more, add here, not inline.
// The union is narrow on purpose: analytics debt starts when "event names" are free-form.
export type AnalyticsEvent =
  | 'signup'
  | 'first_unlock'
  | 'plan_saved'
  | 'upgrade_click'
  | 'share_click'
  // Booking-tab funnel — captures intent (the click), not the actual
  // completed booking (those'd come via a partner webhook).
  | 'book_intent'
  | 'add_to_itinerary'
  // PWA install funnel — every step so we can A/B the trigger threshold.
  // eligible: browser fired beforeinstallprompt (Android/Desktop only).
  // prompted: we showed our own UI (iOS sheet or Android CTA).
  // accepted/dismissed: user choice on our UI or the native chooser.
  // installed: appinstalled event fired (true conversion).
  | 'pwa_install_eligible'
  | 'pwa_install_prompted'
  | 'pwa_install_accepted'
  | 'pwa_install_dismissed'
  | 'pwa_installed'
  // Globe-load canary. `globe_load_failed` fires from a watchdog when the
  // earth texture hasn't applied within ~10s of Canvas mount — i.e. the user
  // is staring at a blank blue sphere. `globe_load_recovered` fires if the
  // texture lands AFTER the watchdog tripped (rare but happens on slow
  // connections); pair the two in PostHog to compute true "stuck globe" rate.
  | 'globe_load_failed'
  | 'globe_load_recovered'
  // Proactive memory-pressure guard tripped — swapped to the static backdrop
  // before Safari/Chrome killed the tab. Chromium-only (Safari has no
  // performance.memory). Pair with globe_load_failed to tell preemptive
  // bail-outs apart from "user actually stared at a blank sphere".
  | 'globe_preemptive_fallback';

let initialized = false;

/**
 * Idempotent client-side init. Called from PostHogProvider on mount.
 * No-op in SSR and when the key isn't set (local dev without NEXT_PUBLIC_POSTHOG_KEY).
 */
export function initAnalytics() {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  // Detect Capacitor's WKWebView — session recording's DOM-mutation buffer
  // overruns iOS's tighter per-process memory budget on the 3D globe page
  // (~2s buffer fill → WebKit process kill → page reload loop observed in
  // TestFlight; confirmed via PostHog $pageview cadence every 2-3s).
  // Mobile Safari has a higher budget so it tolerates the recording
  // overhead. Disable recording on the native shell only — pageviews +
  // explicit events still fire so funnel analytics are unaffected.
  const isCapacitor = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // opt into explicit events only — cheaper + easier to read
    disable_session_recording: isCapacitor,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-private]',
    },
    loaded: () => { initialized = true; },
  });
  initialized = true;
}

/**
 * Track one of the five canonical events. Silently no-ops if posthog isn't
 * configured — keeps local dev and CI untroubled.
 */
export function track(event: AnalyticsEvent, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

/**
 * Tie events to a user once they're authenticated. Call after sign-in succeeds.
 */
export function identify(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.identify(userId, traits);
}

/** Forget the user on sign-out. */
export function resetAnalytics() {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.reset();
}
