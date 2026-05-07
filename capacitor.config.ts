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
    url: 'https://geknee.com',
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
      'js.stripe.com',
      '*.stripe.com',
      'checkout.stripe.com',
      'accounts.google.com',
      '*.googleusercontent.com',
      'login.microsoftonline.com',
      'appleid.apple.com',
    ],
  },

  ios: {
    // Use the same brand color as the manifest theme_color for the splash
    // background so launch feels seamless into the cream-paper landing.
    backgroundColor: '#f5f1e8',
    // contentInset 'always' makes the WebView respect iOS safe areas the
    // same way native apps do — same env(safe-area-inset-*) we use on web.
    contentInset: 'always',
  },

  android: {
    backgroundColor: '#f5f1e8',
    // Pulls the WebView the same way Android Chrome does — needed so the
    // 3D globe and pinch-zoom don't fight Android's default touch handling.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
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
