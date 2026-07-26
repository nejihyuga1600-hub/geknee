'use client';
import { useEffect, useState, type ReactNode } from 'react';

// True inside the Capacitor WKWebView (iOS) or WebView (Android). The
// detection runs client-side after mount to avoid SSR hydration mismatch —
// the server always renders as if `false`, then the effect flips it if the
// Capacitor bridge is present.
//
// Used to gate the pro subscription paywall inside the native app so we
// comply with App Store Guideline 3.1.1 (IAP required for digital
// subscriptions). Web users still see the full paywall.
export function useIsNative(): boolean {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    const cap = (window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    if (cap?.isNativePlatform?.()) setIsNative(true);
  }, []);
  return isNative;
}

export function HideOnNative({ children }: { children: ReactNode }) {
  const isNative = useIsNative();
  if (isNative) return null;
  return <>{children}</>;
}
