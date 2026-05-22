import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

// Force-dynamic so the month-aware terrain preload below picks the right
// asset per request instead of being baked into the static prerender.
// Without this, every visit gets whichever month was current at build time.
export const dynamic = 'force-dynamic';

export default function LocationLayout({ children }: { children: React.ReactNode }) {
  // Resource hints for the cold-load critical path. The browser kicks off
  // these fetches as soon as the document head streams in — well before
  // the LocationClient JS bundle has parsed and run its useEffect loads.
  // Saves ~1-2s of wall-clock on a typical home connection.
  //   • Current month's terrain JPG (~9MB). Loader cycles through fallbacks
  //     if absent, but the happy path preloads correctly.
  //   • ne_110m countries (820KB) — needed for the initial canvas bake.
  // states JSON is intentionally NOT preloaded: 40MB and slated for
  // replacement by pre-baked overlays. Bump map is small and lazy.
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return (
    <>
      {/* Terrain WebP — fetched (not loaded as <img>) so `as="fetch"` matches
          the consumer. The LocationClient terrain loader uses
          fetch() + createImageBitmap(), not THREE.TextureLoader. */}
      <link rel="preload" href={`/earth_terrain_${month}.webp`} as="fetch" type="image/webp" crossOrigin="anonymous" />
      <link rel="preload" href="/ne_110m_admin_0_countries.json" as="fetch" crossOrigin="anonymous" />
      {/* Pre-baked overlays produced by bin/bake-overlays.mjs:
            • borders-overlay.webp — country + state border strokes,
              halo + white. drawImage'd into the BASE canvas at runtime
              (no separate sphere → no parallax with terrain/labels).
              Lets us skip the 40 MB states JSON on every cold load.
            • states-overlay.webp / cities-overlay.webp — tier-gated
              label text on their own transparent spheres.
          All three use fetch() (not <img>) so they can be passed as
          Blob → THREE.Texture, hence `as="fetch"` + crossOrigin to
          match the consumer (else Chromium warns "preloaded but not
          used"). Total ~4-5 MB combined; saves ~500 ms off first-paint
          for users with empty IDB. */}
      <link rel="preload" href="/baked/borders-overlay.webp" as="fetch" type="image/webp" crossOrigin="anonymous" />
      <link rel="preload" href="/baked/states-overlay.webp"  as="fetch" type="image/webp" crossOrigin="anonymous" />
      <link rel="preload" href="/baked/cities-overlay.webp"  as="fetch" type="image/webp" crossOrigin="anonymous" />
      {children}
    </>
  );
}
