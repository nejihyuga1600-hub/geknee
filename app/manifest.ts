import type { MetadataRoute } from 'next';

// Web App Manifest. Next 16 serves this at /manifest.webmanifest automatically.
// Icons live in /public/icons/ — generated from public/brand/geknee-logo.jpg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'geknee — go there. prove it.',
    short_name: 'geknee',
    description:
      '60 monuments. 7 rarity tiers. Your phone checks you are actually there.',
    start_url: '/plan/location',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f1e8',
    theme_color: '#0a0a1f',
    categories: ['travel', 'lifestyle', 'games'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Web Share Target — registers geknee as a share destination in Chrome
    // (and any other browser that supports the API) once the PWA is installed.
    // Users on Android / desktop Chrome can hit Share → geknee → the payload
    // POSTs to /api/share/receive which stashes it and redirects the user to
    // the picker page.
    //
    // Note: MetadataRoute.Manifest doesn't yet type share_target, so we widen
    // with `as` on the return.
    share_target: {
      action: '/api/share/receive',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'media',
            accept: ['image/*', 'video/*'],
          },
        ],
      },
    },
  } as MetadataRoute.Manifest;
}
