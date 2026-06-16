import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/admin/auth';
import ConciergeQueue from './ConciergeQueue';

export const metadata: Metadata = {
  title: 'Concierge queue · geknee admin',
  robots: { index: false, follow: false },
};

export default async function Page() {
  if (!(await isAdminRequest())) redirect('/');
  return <ConciergeQueue />;
}
