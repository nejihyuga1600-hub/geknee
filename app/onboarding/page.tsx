import type { Metadata } from 'next';
import OnboardingFlow from './OnboardingFlow';

export const metadata: Metadata = {
  title: 'Welcome · geknee',
  description: 'Sixty monuments. Seven rarity tiers. The only way to earn the rare ones is to go there.',
  openGraph: {
    title: 'Welcome to geknee',
    description: 'The world is a collection.',
    type: 'website',
  },
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
