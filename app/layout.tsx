import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Design-handoff tokens (see .design/design_handoff_geknee_polish/prototype/shared.jsx):
//   Fraunces       = editorial serif for titles / magic moments
//   Inter Tight    = geometric sans for UI
//   JetBrains Mono = small SHOUTY uppercase labels (9–10px, 0.14–0.22em tracking)
// Exposed at the root so any route can opt in via CSS vars. Geist stays the
// default for body copy; individual routes upgrade by referencing
// var(--font-display), var(--font-ui), or var(--font-mono-display). Non-breaking.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800", "900"],
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ui",
  weight: ["300", "400", "500", "600", "700", "800"],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-display",
  weight: ["400", "500", "600", "700"],
});
import { SessionProvider } from "next-auth/react";
import GlobalChat from "./components/GlobalChat";
import { ToastProvider } from "./components/Toast";
import PostHogProvider from "./components/PostHogProvider";
import TravelpayoutsScript from "./components/TravelpayoutsScript";
import InstallPrompt from "./components/InstallPrompt";
import PushPermissionPrompt from "./components/PushPermissionPrompt";
import RegisterSW from "./components/RegisterSW";
import { AuroraBorealis } from "./components/animations/AuroraBorealis";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { NativeAuthBridge } from "@/lib/native-auth-bridge";
import { NativeShareBridge } from "@/lib/native-share-bridge";

export const metadata: Metadata = {
  title: "geknee — go there. prove it.",
  description: "60 monuments. 7 rarity tiers. Your phone checks you are actually there.",
  applicationName: "geknee",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "geknee",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Hard-disable user zoom across the app. iOS Safari's keyboard
  // auto-zoom (focused input < 16 px font-size) + accidental pinch
  // were both stranding the trip page mid-zoom with no clean way
  // out. maximumScale: 1 + userScalable: false block every path.
  // This is the standard mobile-app pattern; geknee runs full-bleed
  // and never needs OS-level zoom (we own all the affordances).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a1f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning>
        <TravelpayoutsScript />
        <SessionProvider>
          <PostHogProvider>
            <ToastProvider>
              <div style={{ animation: 'pageFadeIn 0.35s ease-out' }}>{children}</div>
            </ToastProvider>
          </PostHogProvider>
          <PushPermissionPrompt />
        </SessionProvider>
        <GlobalChat />
        <InstallPrompt />
        <RegisterSW />
        <NativeAuthBridge />
        <NativeShareBridge />
        <AuroraBorealis />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
