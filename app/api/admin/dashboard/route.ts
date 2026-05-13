import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin/auth';
import { buildDashboardSnapshot } from '@/lib/admin/aggregate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const snapshot = await buildDashboardSnapshot();
  return NextResponse.json(snapshot, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
