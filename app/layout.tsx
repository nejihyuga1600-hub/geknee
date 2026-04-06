import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import GlobalChat from "./components/GlobalChat";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "AI Travel Planner",
  description: "Plan trips step-by-step with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          id="travelpayouts-em"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.createElement("script");s.async=1;s.src="https://tp-em.com/NTE1NTYz.js?t=515563";document.head.appendChild(s);})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <SessionProvider>{children}</SessionProvider>
        <GlobalChat />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
