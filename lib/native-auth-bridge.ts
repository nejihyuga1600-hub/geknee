'use client';

import { useEffect } from 'react';

let bridgeInstalled = false;

export function NativeAuthBridge() {
  useEffect(() => {
    if (bridgeInstalled) return;
    bridgeInstalled = true;
    void install();
  }, []);
  return null;
}

async function install() {
  const [{ Capacitor }, { App }, { Browser }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/app'),
    import('@capacitor/browser'),
  ]);

  if (!Capacitor.isNativePlatform()) return;

  await App.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith('geknee://auth')) return;
    let token: string | null = null;
    try {
      token = new URL(url).searchParams.get('t');
    } catch {
      // ignore — malformed deep link
    }
    try {
      await Browser.close();
    } catch {
      // SFSafariViewController may already be dismissed
    }
    if (!token) {
      window.location.replace('/?signin=1&error=handoff_no_token');
      return;
    }
    window.location.replace(`/auth/mobile-cb?t=${encodeURIComponent(token)}`);
  });
}
