'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

// First-launch push permission flow for the Capacitor native shell.
// We show our own soft prompt explaining value before triggering the OS
// permission dialog — once you decline the native dialog, iOS will not
// re-prompt, so warming users up first is the only chance we get.
//
// Web build: this component is a no-op; the dynamic imports of
// @capacitor/* never run because Capacitor.isNativePlatform() returns
// false on web.

const DISMISS_KEY = 'geknee:push-prompted';
const SOFT_DELAY_MS = 3000;

export default function PushPermissionPrompt() {
  const { data: session, status } = useSession();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [native, setNative] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        if (typeof window === 'undefined') return;
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch { return; }

      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const platform = Capacitor.getPlatform();
      if (platform !== 'ios' && platform !== 'android') return;

      if (cancelled) return;
      setNative(platform);
      timer = setTimeout(() => { if (!cancelled) setShow(true); }, SOFT_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setShow(false);
  }

  async function enable() {
    if (!native || busy) return;
    setBusy(true);
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // The registration event can fire before requestPermissions resolves
      // on Android, so wire listeners first then ask.
      const regHandle = await PushNotifications.addListener('registration', async (token) => {
        try {
          await fetch('/api/push/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token.value, platform: native }),
          });
        } catch { /* swallow — user can retry next launch */ }
        regHandle.remove();
      });
      const errHandle = await PushNotifications.addListener('registrationError', () => {
        errHandle.remove();
      });

      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === 'granted') {
        await PushNotifications.register();
      }
    } catch { /* swallow — never block UI on push wiring */ }

    dismiss();
    setBusy(false);
  }

  if (!show || !native || !session?.user) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 10000,
        background: 'rgba(13,13,36,0.85)',
        border: '1px solid rgba(167,139,250,0.25)',
        borderRadius: 14,
        padding: 18,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        fontFamily: 'var(--font-ui), Inter, system-ui, sans-serif',
        color: '#e2e8f0',
        maxWidth: 420,
        margin: '0 auto',
        animation: 'pushPromptIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
      }}
    >
      <style>{`
        @keyframes pushPromptIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ fontSize: 11, color: '#a8a8c0', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
        Stay ahead of your trip
      </div>
      <div id="push-prompt-title" style={{ fontSize: 20, fontWeight: 600, fontFamily: 'var(--font-display, Georgia, serif)', marginBottom: 10, lineHeight: 1.2 }}>
        Turn on notifications?
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 6, fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>
        <li>· Weather forecast 2 weeks before you fly</li>
        <li>· Packing prep the week of your trip</li>
        <li>· Daily morning briefings on the road</li>
      </ul>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={dismiss}
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 10,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#a8a8c0',
            cursor: busy ? 'default' : 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: 500,
          }}
        >
          Not now
        </button>
        <button
          onClick={enable}
          disabled={busy}
          style={{
            flex: 2,
            padding: '10px 0',
            borderRadius: 10,
            background: 'linear-gradient(135deg,#a78bfa,#7dd3fc)',
            color: '#0a0a1f',
            border: 'none',
            cursor: busy ? 'default' : 'pointer',
            fontWeight: 700,
            fontSize: 13,
            fontFamily: 'inherit',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
      </div>
    </div>
  );
}
