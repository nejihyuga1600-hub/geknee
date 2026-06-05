import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the live web app at https://geknee.com inside a native
// shell (iOS WKWebView / Android WebView) and exposes JS bridges to native
// plugins (camera, geolocation, push). Loading from the live URL means we
// don't ship a static export and don't have to keep the app bundle in sync
// with web releases — the app picks up every Vercel deploy automatically.
//
// When we want offline / faster cold start later, we'd swap to a hybrid:
// ship a minimal static shell + load the rest from network.
const config: CapacitorConfig = {
  appId: 'com.geknee.app',
  appName: 'geknee',
  // webDir is required by Capacitor even when we're loading from a server URL.
  // It points at a folder that holds a fallback index.html for offline / first
  // run. We'll generate this in Phase 2.
  webDir: 'capacitor-shell',

  server: {
    // Live remote URL — the WebView loads geknee.com directly.
    // www. is canonical: bare geknee.com 307s to www, and a redirect mid-OAuth
    // breaks NextAuth's same-origin callbackUrl check (Server error). Loading
    // the canonical host directly skips that detour.
    url: 'https://www.geknee.com',
    // Allow https + the app:// scheme. cleartext stays false (no http://).
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
    // Domains the WebView is allowed to navigate to without launching the
    // system browser. Stripe and Auth providers need to be in here so the
    // user stays inside the app for checkout / OAuth.
    allowNavigation: [
      'geknee.com',
      '*.geknee.com',
      // Explicit www even though *.geknee.com should glob-match it. Capacitor's
      // host glob has historically been finicky on first navigations from a
      // cold WKWebView, and www.geknee.com is the canonical host (server.url),
      // so an exact entry is belt-and-suspenders.
      'www.geknee.com',
      'js.stripe.com',
      '*.stripe.com',
      'checkout.stripe.com',
      // pay.stripe.com is hit when Stripe Checkout invokes Apple Pay flows.
      // Without this, Apple Pay redirects bounce out of the WKWebView mid-checkout.
      'pay.stripe.com',
      'accounts.google.com',
      '*.googleusercontent.com',
      'login.microsoftonline.com',
      'appleid.apple.com',
    ],
  },

  ios: {
    // Dark space-themed surface — matches the planner globe and the
    // SplashScreen plugin's '#0a0a1f'. Cream '#f5f1e8' previously bled
    // into the iOS safe-area regions as "white banners" above and below
    // the planner UI (user feedback 2026-06-04 iPhone 15 Pro in light mode).
    backgroundColor: '#0a0a1f',
    // 'never' lets the WebView extend BEHIND the status bar / home
    // indicator so its dark background fills those regions. The web
    // content uses env(safe-area-inset-*) padding to keep interactive
    // content out of the system chrome zones. Previously 'always' inset
    // the WebView and exposed ios.backgroundColor in the safe areas.
    contentInset: 'never',
  },

  android: {
    backgroundColor: '#0a0a1f',
    // Pulls the WebView the same way Android Chrome does — needed so the
    // 3D globe and pinch-zoom don't fight Android's default touch handling.
    allowMixedContent: false,
    captureInput: true,
    // Off — Play Store flags release builds that ship this on. Flip to true
    // locally when you need chrome://inspect on a connected device, then
    // re-run `npx cap sync android`. Do not commit the `true` value.
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0a0a1f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      // We register tokens on launch and post them to /api/push/register so
      // the server can target users for trip / deal notifications. Wiring
      // happens in Phase 2.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      // Match the dark globe/planning chrome.
      style: 'DARK',
      backgroundColor: '#0a0a1f',
    },
  },
};

export default config;
