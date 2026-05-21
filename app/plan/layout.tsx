// Force every page under /plan out of static prerendering. Next.js 16's
// build was classifying 'use client' pages that use useSearchParams
// inside a Suspense boundary as ○ Static, but Vercel's Build Output
// API adapter still expected a route lambda for them and failed the
// deploy with "Unable to find lambda for route: /plan/..." — cascading
// to a different page on each retry as we fixed them one by one.
//
// Declaring force-dynamic at the /plan segment ensures every descendant
// gets a route lambda. Dynamic-segment pages (e.g. /plan/[tripId]) were
// already dynamic by virtue of their params, so this is effectively a
// no-op for them; the static-classified ones (/plan, /plan/dates,
// /plan/style, /plan/location, /plan/location/atlas) all get lambdas
// now and the deploy goes through.

export const dynamic = 'force-dynamic';

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
