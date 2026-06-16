import type { Metadata } from 'next';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import PaymentMethodsClient from './PaymentMethodsClient';

export const metadata: Metadata = {
  title: 'Payment methods · geknee',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/settings/payment');
  return <PaymentMethodsClient />;
}
