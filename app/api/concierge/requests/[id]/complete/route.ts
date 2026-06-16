import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/admin/email';

// POST /api/concierge/requests/[id]/complete — admin marks a request
// `booked`. Body: { otaConfirmation, finalCents, conciergeNotes? }. The
// caller is expected to have charged the user's saved PaymentMethod
// (Stripe PaymentIntent.create with off_session=true) BEFORE hitting
// this endpoint so we never persist a `booked` row without a payment
// trail — that's safer than racing both writes here. stripePaymentId is
// optional so admin can paste the pi_… id from Stripe Dashboard.
//
// Sends the user a confirmation email via Resend (soft-fails so a
// transient Resend outage doesn't roll back the status update).
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  let body: { otaConfirmation?: string; finalCents?: number; stripePaymentId?: string; conciergeNotes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const otaConfirmation = String(body.otaConfirmation ?? '').trim().slice(0, 120);
  if (!otaConfirmation) {
    return Response.json({ error: 'ota_confirmation_required' }, { status: 400 });
  }

  const adminUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const updated = await prisma.bookingRequest.update({
    where: { id },
    data: {
      status: 'booked',
      otaConfirmation,
      finalCents: Number.isFinite(body.finalCents) ? body.finalCents! : undefined,
      stripePaymentId: body.stripePaymentId ?? undefined,
      conciergeNotes: body.conciergeNotes ?? undefined,
      conciergeUserId: adminUserId,
      bookedAt: new Date(),
    },
    include: { user: { select: { email: true, name: true } } },
  });

  if (updated.user.email) {
    sendEmail({
      to: updated.user.email,
      subject: `Booked: ${updated.title}`,
      html: confirmationHtml({
        firstName: updated.user.name?.split(' ')[0] ?? null,
        title: updated.title,
        kind: updated.kind,
        otaConfirmation,
        finalCents: updated.finalCents,
        currency: updated.currency,
        otaProvider: updated.otaProvider,
      }),
    }).catch((err) => console.error('[concierge:complete] resend failed', err));
  }

  return Response.json({ ok: true, request: updated });
}

function confirmationHtml(args: {
  firstName: string | null;
  title: string;
  kind: string;
  otaConfirmation: string;
  finalCents: number | null;
  currency: string;
  otaProvider: string | null;
}) {
  const greeting = args.firstName ? `${args.firstName},` : 'Hey,';
  const amount = args.finalCents != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: args.currency }).format(args.finalCents / 100)
    : null;
  const verb = args.kind === 'flight' ? 'flight is ticketed' : args.kind === 'hotel' ? 'hotel is booked' : 'activity is booked';
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#f5f1e8;color:#1a1a1a;margin:0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #1a1a1a;border-radius:6px;padding:28px 32px">
    <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#7a6f5e;margin-bottom:14px">geknee · concierge</div>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${greeting} your ${verb}.</h1>
    <p style="font-size:14px;line-height:1.55;margin:0 0 12px"><strong>${escapeHtml(args.title)}</strong></p>
    <div style="background:#f5f1e8;border:1px solid rgba(0,0,0,0.08);border-radius:6px;padding:14px 16px;margin:14px 0">
      <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#7a6f5e;margin-bottom:4px">Confirmation</div>
      <div style="font-family:ui-monospace,monospace;font-size:15px;font-weight:700">${escapeHtml(args.otaConfirmation)}</div>
      ${args.otaProvider ? `<div style="font-size:12px;color:#7a6f5e;margin-top:4px">via ${escapeHtml(args.otaProvider)}</div>` : ''}
      ${amount ? `<div style="font-size:13px;margin-top:6px"><strong>${amount}</strong> charged to your saved card</div>` : ''}
    </div>
    <p style="font-size:14px;line-height:1.55;margin:14px 0 12px">You handle the check-in — airport, hotel front desk, activity meeting point. Bring an ID and the confirmation code above.</p>
    <p style="font-size:12px;line-height:1.55;color:#7a6f5e;margin:24px 0 0">Questions? Reply to this email and a human will get back to you.</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
