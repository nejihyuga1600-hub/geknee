import type { Metadata } from 'next';
import WaitlistForm from './WaitlistForm';

export const metadata: Metadata = {
  title: 'iOS early access · geknee',
  description:
    "The geknee iOS app launches soon — 275 monuments, 7 rarity tiers, real-life check-in. Join the waitlist to get it first.",
  openGraph: {
    title: 'iOS early access · geknee',
    description:
      '275 monuments. 7 rarity tiers. The only travel app that knows you actually went. Join the waitlist.',
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <WaitlistForm />;
}
