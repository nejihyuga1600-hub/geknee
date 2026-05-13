import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/admin/auth';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Mission Control · geknee' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  if (!(await isAdminRequest())) redirect('/');
  return <DashboardClient />;
}
