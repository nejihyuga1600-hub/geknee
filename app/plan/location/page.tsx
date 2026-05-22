'use client';

import dynamic from 'next/dynamic';

// Loading skeleton — same radial gradient as AtlasShell's StaticGlobeBackdrop
// so the transition from "JS still parsing" to "WebGL canvas mounted" is
// visually seamless instead of a blank-screen flash. Without this, users
// see ~1-2s of blank white on cold load before AtlasShell's JS arrives.
function GlobeSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        background:
          'radial-gradient(circle at 50% 45%, #1e3a8a 0%, #0c1e4a 40%, #050818 75%, #02030a 100%)',
      }}
    />
  );
}

// Atlas shell is now the planner. The chromeless LocationClient mounts
// inside AtlasShell as the globe layer, so the live R3F planet (country
// borders, monuments, click-to-fly) still renders behind the new chrome.
// Destination submit routes to /plan/style — same as the old planner —
// until Atlas's step bodies are wired.
const AtlasShell = dynamic(() => import('./atlas/AtlasShell'), {
  ssr: false,
  loading: () => <GlobeSkeleton />,
});

export default function LocationPage() {
  return <AtlasShell />;
}
