'use client';

// Native Share Bridge — mirrors the session cookie + trip list into the
// App Group container so the iOS Share Extension (GekneeShare) can act
// as the logged-in user.
//
// Wired into app/layout.tsx alongside NativeAuthBridge. On mount + every
// foreground transition:
//   1. Read `authjs.session-token` from document.cookie
//   2. Fetch /api/trips (cached) for the user's saved trips
//   3. Push both into shared UserDefaults via the SharedGroup plugin
//
// The plugin is a no-op on the web + on Android (Android has its own share
// intent path, tbd). All calls go behind Capacitor.isNativePlatform().

import { useEffect } from 'react';

let installed = false;

export function NativeShareBridge() {
  useEffect(() => {
    console.log('[NativeShareBridge] mount', { installed });
    if (installed) return;
    installed = true;
    void install();
  }, []);
  return null;
}

async function install() {
  console.log('[NativeShareBridge] install() start');
  const [{ Capacitor }, { App }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/app'),
  ]);
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  console.log('[NativeShareBridge] platform', platform);
  if (!Capacitor.isNativePlatform()) return;

  // Fire an initial sync on mount, then whenever the app returns to
  // foreground. Session-token can rotate on the server so re-reading each
  // time keeps the extension current.
  await sync();
  console.log('[NativeShareBridge] sync done');
  if (platform === 'android') {
    console.log('[NativeShareBridge] android — poll + subscribe');
    await pollAndroidShare();
    await subscribeAndroidShareEvent();
    console.log('[NativeShareBridge] android — subscribe done');
  }

  await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return;
    void sync();
    if (platform === 'android') void pollAndroidShare();
  });

  // Also handle a share flow that punted back to the main app.
  await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith('geknee://share')) return;
    try {
      const u = new URL(url);
      const target = u.searchParams.get('url');
      if (target) {
        window.location.href = `/share/receive?url=${encodeURIComponent(target)}`;
      }
    } catch { /* malformed deep link */ }
  });
}

type SharedGroupPlugin = {
  setAuthCookie: (opts: { cookie: string }) => Promise<void>;
  setTrips: (opts: { trips: unknown[] }) => Promise<void>;
  readPendingShare: () => Promise<{ hasShare: boolean; url?: string; ts?: number }>;
};

async function sync() {
  await import('@capacitor/core');
  const global = window as unknown as {
    Capacitor?: { Plugins?: { SharedGroup?: SharedGroupPlugin } };
  };
  const plugin = global.Capacitor?.Plugins?.SharedGroup;
  if (!plugin) return;

  // Auth cookie — only mirror the geknee session cookie, not all cookies.
  const cookieHeader = extractSessionCookie();
  if (cookieHeader) {
    try { await plugin.setAuthCookie({ cookie: cookieHeader }); } catch { /* ignore */ }
  }

  // Trip list — thin projection so the extension's picker stays small.
  try {
    const res = await fetch('/api/trips', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json() as { trips?: Array<{ id: string; title: string; location?: string }> };
      const thin = (data.trips ?? []).slice(0, 25).map(t => ({
        id: t.id,
        title: t.title,
        location: t.location ?? '',
      }));
      await plugin.setTrips({ trips: thin });
    }
  } catch { /* ignore — extension shows "+ New trip" only when cache empty */ }
}

// Auth.js cookie name on production is `authjs.session-token` (host-only
// on www.geknee.com). Named exactly per memory `project-geknee-authjs-cookies`.
function extractSessionCookie(): string | null {
  const raw = document.cookie || '';
  const parts = raw.split(';').map(s => s.trim());
  const hit = parts.find(p => p.startsWith('authjs.session-token='));
  return hit ?? null;
}

// ── Android share intent ingest ─────────────────────────────────────────────
// The AndroidSharePlugin (Java) stashes any ACTION_SEND / SEND_MULTIPLE payload
// captured by MainActivity. We drain it on foreground and route the WebView
// to /share/receive — matching the iOS + Web Share Target flow.

type AndroidShareItem = {
  base64?: string;
  name?: string;
  size?: number;
  skipped?: boolean;
  skipReason?: string;
};

type AndroidPendingShare =
  | { hasShare: false }
  | { hasShare: true; kind: 'text'; text?: string; subject?: string }
  | { hasShare: true; kind: 'media'; mimeType?: string; caption?: string; items: AndroidShareItem[] };

type AndroidSharePlugin = {
  getPendingShare: () => Promise<AndroidPendingShare>;
  addListener: (event: 'pendingShareAvailable', cb: () => void) => Promise<{ remove: () => Promise<void> }>;
};

const URL_RE = /https?:\/\/[^\s]+/i;

// Capacitor 5+ requires custom plugins to be exposed via registerPlugin on
// the JS side — reading `window.Capacitor.Plugins.AndroidShare` returns
// undefined without it, even when the native plugin is registered on the
// Bridge. registerPlugin returns a proxy that dispatches to whichever native
// implementation exists for the current platform. On web / iOS this returns
// a stub plugin whose calls no-op (or the `noop` fallback we set).
let androidSharePluginProxy: AndroidSharePlugin | null = null;
async function loadAndroidSharePlugin(): Promise<AndroidSharePlugin | null> {
  if (androidSharePluginProxy) return androidSharePluginProxy;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    androidSharePluginProxy = registerPlugin<AndroidSharePlugin>('AndroidShare');
    return androidSharePluginProxy;
  } catch {
    return null;
  }
}

async function pollAndroidShare() {
  const plugin = await loadAndroidSharePlugin();
  if (!plugin) return;

  let payload: AndroidPendingShare;
  try {
    payload = await plugin.getPendingShare();
  } catch {
    return;
  }
  if (!payload.hasShare) return;

  // Guard against re-navigating if we already landed on the receive page.
  if (window.location.pathname.startsWith('/share/receive')) return;

  if (payload.kind === 'text') {
    const raw = (payload.text ?? '').trim() || (payload.subject ?? '').trim();
    if (!raw) return;
    const firstUrl = raw.match(URL_RE)?.[0];
    if (firstUrl) {
      window.location.href = `/share/receive?url=${encodeURIComponent(firstUrl)}`;
    } else {
      window.location.href = `/share/receive?text=${encodeURIComponent(raw)}`;
    }
    return;
  }

  // kind === 'media' — upload the first usable item to the vision endpoint,
  // stash the resolved venue in sessionStorage, and hand off to the picker.
  const first = payload.items.find(i => !i.skipped && i.base64);
  if (!first?.base64) {
    window.location.href = `/share/receive?error=empty`;
    return;
  }
  try {
    const bytes = base64ToBytes(first.base64);
    const blob = new Blob([bytes as unknown as ArrayBuffer], { type: payload.mimeType ?? 'image/jpeg' });
    const form = new FormData();
    form.append('file', blob, first.name ?? 'share');
    if (payload.caption) form.append('caption', payload.caption);
    const res = await fetch('/api/share/analyze-media', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      window.location.href = `/share/receive?error=${encodeURIComponent('analyze failed')}`;
      return;
    }
    const result = await res.json();
    const stashKey = `geknee:share:${Date.now()}`;
    sessionStorage.setItem(stashKey, JSON.stringify(result));
    window.location.href = `/share/receive?stash=${encodeURIComponent(stashKey)}`;
  } catch {
    window.location.href = `/share/receive?error=${encodeURIComponent('upload failed')}`;
  }
}

async function subscribeAndroidShareEvent() {
  const plugin = await loadAndroidSharePlugin();
  if (!plugin?.addListener) return;
  try {
    await plugin.addListener('pendingShareAvailable', () => {
      void pollAndroidShare();
    });
  } catch { /* older plugin — silent fail is fine, polling on foreground still works */ }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
