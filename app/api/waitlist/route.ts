import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/admin/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let body: { email?: string; source?: string; city?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'bad_email' }, { status: 400 });
  }
  const source = (body.source ?? '').toString().slice(0, 64) || null;
  const city = (body.city ?? '').toString().slice(0, 128) || null;

  let alreadyOnList = false;
  try {
    await prisma.waitlistEntry.create({ data: { email, source, city } });
  } catch (e: unknown) {
    // Unique violation = email already signed up; treat as success (idempotent)
    const code = (e as { code?: string })?.code;
    if (code === 'P2002') {
      alreadyOnList = true;
    } else {
      console.error('[waitlist] db error', e);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
  }

  if (!alreadyOnList) {
    sendEmail({
      to: email,
      subject: "you're on the geknee waitlist",
      html: confirmationHtml(),
    }).catch((err) => {
      console.error('[waitlist] resend failed (signup still recorded)', err);
    });
  }

  return NextResponse.json({ ok: true, alreadyOnList });
}

function confirmationHtml() {
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#f5f1e8;color:#1a1a1a;margin:0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:2px solid #1a1a1a;border-radius:6px;padding:28px 32px">
    <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#7a6f5e;margin-bottom:14px">geknee · early access</div>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">you're on the list.</h1>
    <p style="font-size:14px;line-height:1.55;margin:0 0 12px">we'll email you the moment the iOS app drops in the App Store.</p>
    <p style="font-size:14px;line-height:1.55;margin:0 0 12px">in the meantime — spin earth on the web at <a href="https://geknee.com" style="color:#7c3aed;text-decoration:none">geknee.com</a>. 275 monuments, 7 rarity tiers, real-life check-in.</p>
    <p style="font-size:12px;line-height:1.55;color:#7a6f5e;margin:24px 0 0">if you didn't sign up, ignore this email — we'll drop you from the list automatically.</p>
  </div>
</body></html>`;
}
