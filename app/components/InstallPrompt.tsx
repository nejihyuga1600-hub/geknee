'use client';
import { useEffect, useState, useCallback } from 'react';
import { track } from '@/lib/analytics';

// Install conversion strategy:
// 1. Defer the prompt — never show on first visit, never within 20s of arrival.
//    Research consistently shows this 2x+ converts vs immediate prompts.
// 2. iOS branch — Safari has no `beforeinstallprompt`, so we render explicit
//    "Tap [share] then Add to Home Screen" instructions with the actual share
//    glyph. Without this, iOS install rate is effectively 0%.
// 3. Capture & defer the Android `beforeinstallprompt` event — fire prompt()
//    inside our own button click. The browser fires the event once and won't
//    re-fire it; we have to stash it.
// 4. Track full funnel so we can iterate the trigger threshold.
// 5. Honor dismissal — store in localStorage, suppress for 7 days.

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'geknee_pwa_dismissed_at';
const VISITS_KEY = 'geknee_visit_count';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_DWELL_MS = 20_000;
const MIN_VISITS = 2;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari uses navigator.standalone; everywhere else uses display-mode.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  return iosStandalone || displayStandalone;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports as Mac with touch — include it.
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < DISMISS_COOLDOWN_MS;
  } catch { return false; }
}

function bumpVisitCount(): number {
  try {
    const n = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
    localStorage.setItem(VISITS_KEY, String(n));
    return n;
  } catch { return 0; }
}

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor?.isNativePlatform?.();
  } catch { return false; }
}

export default function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  // Eligibility evaluated once on mount, then again on dwell timer.
  useEffect(() => {
    // Never prompt inside the Capacitor native shell — the app is already
    // installed by definition, and Capacitor's WKWebView doesn't set
    // navigator.standalone or match display-mode:standalone, so
    // isStandalone() misses this case. Without the guard, iOS users of
    // the native app see a persistent "Add to Home Screen" banner over
    // the globe (visible in every sim screenshot 2026-08-02) and pay
    // for the dwell timer + BIP listeners for nothing.
    if (isCapacitorNative()) return;
    if (isStandalone()) return; // already installed
    setIos(isIOS());
    const visits = bumpVisitCount();

    const onBIP = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
      track('pwa_install_eligible', { source: 'beforeinstallprompt' });
    };
    const onInstalled = () => {
      track('pwa_installed');
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    // Trigger condition: visit >= 2 (returning user) AND dwell >= 20s, OR
    // we've been here a while on the first visit (60s) — proves engagement.
    const dwellMs = visits >= MIN_VISITS ? MIN_DWELL_MS : 60_000;
    const t = window.setTimeout(() => {
      if (dismissedRecently()) return;
      // On Android we wait for BIP before showing; iOS shows always at the timer.
      if (ios || isIOS()) {
        setShow(true);
        track('pwa_install_prompted', { platform: 'ios', visits });
      }
    }, dwellMs);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When BIP arrives after the dwell timer, surface the Android CTA.
  useEffect(() => {
    if (!bip || show || dismissedRecently()) return;
    setShow(true);
    track('pwa_install_prompted', { platform: 'android' });
  }, [bip, show]);

  // Manual trigger from anywhere in the app (e.g. Settings → "Install app").
  // Bypasses the dwell timer and the dismiss cooldown — user explicitly asked.
  useEffect(() => {
    const onForce = () => {
      if (isStandalone()) return;
      setShow(true);
      track('pwa_install_prompted', { platform: ios || isIOS() ? 'ios' : 'android', source: 'manual' });
    };
    window.addEventListener('geknee:show-install', onForce);
    return () => window.removeEventListener('geknee:show-install', onForce);
  }, [ios]);

  const acceptAndroid = useCallback(async () => {
    if (!bip) return;
    try {
      await bip.prompt();
      const { outcome } = await bip.userChoice;
      track(outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed', {
        platform: 'android',
      });
    } catch {
      // user-agent errored or user dismissed before choice
    } finally {
      setBip(null);
      setShow(false);
    }
  }, [bip]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    track('pwa_install_dismissed', { platform: ios ? 'ios' : 'android' });
    setShow(false);
  }, [ios]);

  if (!show) return null;
  if (isStandalone()) return null;

  return (
    <div
      role="dialog"
      aria-label="Install geknee"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 9999,
        background: '#0a0a1f',
        color: '#f5f1e8',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        maxWidth: 480,
        margin: '0 auto',
        fontFamily: 'var(--font-ui), system-ui, sans-serif',
        animation: 'pageFadeIn .35s ease-out',
      }}
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        width={48}
        height={48}
        style={{ borderRadius: 12, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
          Install geknee
        </div>
        <div style={{ fontSize: 13, opacity: 0.78, marginTop: 4, lineHeight: 1.4 }}>
          {ios ? (
            <>
              Tap <ShareGlyph /> in Safari, then <b>Add to Home Screen</b>.
            </>
          ) : (
            <>One tap. Opens like a real app, works offline.</>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {!ios && bip && (
            <button
              onClick={acceptAndroid}
              style={{
                background: '#a78bfa',
                color: '#0a0a1f',
                border: 'none',
                borderRadius: 999,
                padding: '8px 16px',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            style={{
              background: 'transparent',
              color: '#f5f1e8',
              border: '1px solid rgba(245,241,232,.25)',
              borderRadius: 999,
              padding: '8px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// iOS Safari share glyph — inlined so it shows even when icon fonts haven't
// loaded. The recognizable shape is what makes the iOS instructions actionable.
function ShareGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline', verticalAlign: '-2px', margin: '0 2px' }}
    >
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}
