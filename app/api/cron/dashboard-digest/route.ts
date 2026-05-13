import { NextResponse } from 'next/server';
import { buildDashboardSnapshot } from '@/lib/admin/aggregate';
import { renderDigestHtml } from '@/lib/admin/digest-html';
import { sendEmail } from '@/lib/admin/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel cron — sends a daily snapshot of all dashboard cards to
// DIGEST_TO_EMAIL at the schedule defined in vercel.json. Falls back to
// the project owner's address if DIGEST_TO_EMAIL isn't set.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const to = process.env.DIGEST_TO_EMAIL ?? 'nghiaphan081301@gmail.com';
  const snapshot = await buildDashboardSnapshot();
  const html = renderDigestHtml(snapshot);
  const subject = `geknee · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;

  try {
    const result = await sendEmail({ to, subject, html });
    return NextResponse.json({ ok: true, sentTo: to, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
