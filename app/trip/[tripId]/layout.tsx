import type { Metadata } from 'next';

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
  return (
    <>
      {/* Hard-lock horizontal scroll for the whole /trip subtree
          2026-08-04. Users were getting stuck panned right because a
          descendant (day timeline, weather hourly) briefly reported
          content wider than the viewport before its own overflow-hidden
          took effect. Locking at layout-root guarantees the outer
          scroller can never pan sideways, so day stops + weather still
          scroll internally but the page frame stays put. */}
      <style>{`
        html, body {
          overflow-x: hidden !important;
          max-width: 100vw;
          overscroll-behavior-x: none;
        }
        html { scroll-behavior: auto; }
      `}</style>
      {children}
    </>
  );
}
