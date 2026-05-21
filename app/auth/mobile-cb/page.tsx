// Server component wrapper for the mobile auth callback. The real UI
// lives in MobileCallbackClient (a 'use client' component).
//
// Why split: Next.js was classifying the prior client-only page.tsx as
// ○ Static (the only dynamic bit, useSearchParams, was wrapped in
// Suspense). Vercel's build pipeline then errored with "Unable to find
// lambda for route: /auth/mobile-cb" — its routing config expects a
// lambda for the route even though the page would have worked fine as
// pure client-side rendering. `export const dynamic` is ignored when
// emitted from a 'use client' file, so we declare it here on the server
// wrapper to force a lambda into the build manifest.

import MobileCallbackClient from './MobileCallbackClient';

export const dynamic = 'force-dynamic';

export default function MobileCallbackPage() {
  return <MobileCallbackClient />;
}
