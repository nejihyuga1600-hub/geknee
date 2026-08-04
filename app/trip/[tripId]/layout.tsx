import type { Metadata } from 'next';
import { TripHorizontalLock } from './TripHorizontalLock';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tripId: string }>;
}): Promise<Metadata> {
  const { tripId } = await params;
  const ogImage = `/api/og-trip-map/${tripId}`;
  return {
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  };
}

export default function TripLayout({ children }: { children: React.ReactNode }) {
  // TripHorizontalLock stamps html+body with .geknee-x-lock as soon as
  // it mounts, driving the CSS rule in globals.css that hard-locks
  // horizontal scroll for the whole /trip subtree. Also proactively
  // snaps scrollLeft to 0 across mount, RAF, 100ms, 500ms, resize,
  // and orientationchange so any late scrollIntoView from a nested
  // component can't leave the viewport panned right.
  return (
    <>
      <TripHorizontalLock />
      {children}
    </>
  );
}
