import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikimedia.org" },
    ],
  },
  // The dev panel HMR chip overlaps the bottom-right of any full-viewport
  // canvas, which contaminates monument snapshots. Set NEXT_DISABLE_DEV_INDICATOR=1
  // before `npm run dev` when running bin/snap-monuments.mjs to suppress it.
  devIndicators: process.env.NEXT_DISABLE_DEV_INDICATOR === "1" ? false : undefined,
};

export default nextConfig;
