'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { track } from '@/lib/analytics';

interface Props {
  platform: 'ios' | 'android';
  href?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}

// Wraps a Next Link so we can emit `waitlist_cta_click` on tap WITHOUT
// flipping the whole LandingTour to a client component. The href carries
// `?src=landing-{platform}` so the waitlist page can tag the visit (and
// downstream signup) with the same attribution string PostHog uses.
export default function WaitlistCta({ platform, href, style, children }: Props) {
  const target = href ?? `/waitlist?src=landing-${platform}`;
  return (
    <Link
      href={target}
      style={style}
      onClick={() => {
        track('waitlist_cta_click', { platform, surface: 'landing' });
      }}
    >
      {children}
    </Link>
  );
}
