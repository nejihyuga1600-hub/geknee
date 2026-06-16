import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/admin/email';

// POST /api/concierge/requests/[id]/fail — admin marks a request `failed`.
// Body: { failureReason, conciergeNotes? }. Sends a "we couldn't book this"
// email so the user isn't left in queue-purgatory. Refund (if any charge
// already happened) is handled out-of-band in the Stripe dashboard —
// admins are trusted to refund before flipping this status.
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  let body: { failureReason?: string; conciergeNotes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const failureReason = String(body.failureReason ?? '').trim().slice(0, 500);
  if (!failureReason) {
    return Response.json({ error: 'failure_reason_required' }, { status: 400 });
  }

  const adminUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const updated = await prisma.bookingRequest.update({
    where: { id },
    data: {
      status: 'failed',
      failureReason,
      conciergeNotes: body.conciergeNotes ?? undefined,
      conciergeUserId: adminUserId,
    },
    include: { user: { select: { email: true, name: true } } },
  });

  if (updated.user.email) {
    sendEmail({
      to: updated.user.email,
      subject: `Could not book: ${updated.title}`,
      html: failHtml({
        firstName: updated.user.name?.split(' ')[0] ?? null,
        title: updated.title,
        failureReason,
      }),
    }).catch((err) => console.error('[concierge:fail] resend failed', err));
  }

  return Response.json({ ok: true, request: updated });
}

function failHtml(args: { firstName: string | null; title: string; failureReason: string }) {
  const greeting = args.firstName ? `${args.firstName},` : 'Hey,';
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;background:#f5f1e8;color:#1a1a1a;margin:0;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #1a1a1a;border-radius:6px;padding:28px 32px">
    <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#7a6f5e;margin-bottom:14px">geknee · concierge</div>
    <h1 style="font-size:22px;line-height:1.25;margin:0 0 14px">${greeting} we couldn't book this one.</h1>
    <p style="font-size:14px;line-height:1.55;margin:0 0 12px"><strong>${escapeHtml(args.title)}</strong></p>
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:14px 16px;margin:14px 0;font-size:13px;line-height:1.5">
      ${escapeHtml(args.failureReason)}
    </div>
    <p style="font-size:14px;line-height:1.55;margin:0 0 12px">No charge ran (or if it did, you'll see the refund within 5-10 business days). Hop back into the app and pick a different option, or reply here and a human will help you find something close.</p>
    <p style="font-size:12px;line-height:1.55;color:#7a6f5e;margin:24px 0 0">— the geknee concierge</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
