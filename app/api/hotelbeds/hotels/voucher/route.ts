// /api/hotelbeds/hotels/voucher — retrieve or resend a hotel voucher.
//
// Cert §4.1: voucher must be retrievable by the client. This route
// supports both:
//   GET ?ref=<bookingRef>  → returns the rendered HTML (for viewing)
//   POST { ref, resend: true } → re-sends the voucher email
//
// The voucher is normally sent automatically by the /book route on
// successful confirmation; this endpoint exists for resends and
// for the in-app "view voucher" link.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { renderVoucher } from "@/lib/hotelbeds-voucher";
import type { ConfirmedBooking } from "@/lib/hotelbeds";
import { sendEmail } from "@/lib/admin/email";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });

  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) return Response.json({ error: "ref required" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { partner_providerOrderId: { partner: "hotelbeds", providerOrderId: ref } },
  });
  if (!booking || booking.userId !== session.user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const payload = booking.rawPayload as unknown as ConfirmedBooking;
  const voucher = await renderVoucher({
    booking: payload,
    guestEmail: session.user.email ?? "",
    agencyReference: booking.tripId ?? undefined,
  });
  return new Response(voucher.html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ref?: string } | null;
  if (!body?.ref) return Response.json({ error: "ref required" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { partner_providerOrderId: { partner: "hotelbeds", providerOrderId: body.ref } },
  });
  if (!booking || booking.userId !== session.user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!session.user.email) {
    return Response.json({ error: "no email on user account" }, { status: 400 });
  }

  const payload = booking.rawPayload as unknown as ConfirmedBooking;
  const voucher = await renderVoucher({
    booking: payload,
    guestEmail: session.user.email,
    agencyReference: booking.tripId ?? undefined,
  });

  await sendEmail({
    to: voucher.to,
    subject: voucher.subject,
    html: voucher.html,
  });

  return Response.json({ ok: true, sentTo: voucher.to });
}
