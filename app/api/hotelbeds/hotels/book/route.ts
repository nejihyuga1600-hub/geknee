// /api/hotelbeds/hotels/book — confirm a hotel booking.
//
// Cert §3.11: response timeout must be ≥60s (maxDuration set below).
// Cert §6.1: must demonstrate a successful live booking. The booking
// is saved to our existing Booking model (prisma:198) for tracking +
// later voucher delivery.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createBooking, hotelbedsConfigured, type BookingPax } from "@/lib/hotelbeds";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 90;

interface BookRequest {
  rateKey: string;
  holder: { name: string; surname: string };
  paxes: BookingPax[];
  tripId?: string;
  clientReference?: string;
  remark?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hotelbedsConfigured("hotel")) {
    return Response.json(
      { error: "HOTELBEDS_HOTEL_SECRET not set", configured: false },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as BookRequest | null;
  if (!body?.rateKey || !body.holder?.name || !body.holder?.surname || !Array.isArray(body.paxes) || body.paxes.length === 0) {
    return Response.json(
      { error: "rateKey, holder.{name,surname}, paxes[] required" },
      { status: 400 },
    );
  }
  // Cert §4.3: children require age.
  for (const p of body.paxes) {
    if (p.type === "CH" && typeof p.age !== "number") {
      return Response.json({ error: "child pax missing age" }, { status: 400 });
    }
  }

  const clientReference =
    body.clientReference ?? `gk-${body.tripId ?? session.user.id}-${Date.now()}`;

  try {
    const booking = await createBooking({
      rateKey: body.rateKey,
      holder: body.holder,
      paxes: body.paxes,
      clientReference,
      remark: body.remark,
    });

    // Persist to Booking model for /api/bookings/list + voucher resend.
    await prisma.booking.upsert({
      where: {
        partner_providerOrderId: {
          partner: "hotelbeds",
          providerOrderId: booking.reference,
        },
      },
      update: {
        status: booking.status.toLowerCase(),
        rawPayload: booking as unknown as Prisma.InputJsonValue,
        amount: new Prisma.Decimal(booking.totalNet),
        currency: booking.currency,
        updatedAt: new Date(),
      },
      create: {
        tripId: body.tripId ?? null,
        userId: session.user.id,
        partner: "hotelbeds",
        partnerProgram: "Hotelbeds Hotels",
        providerOrderId: booking.reference,
        itemKind: "hotel",
        itemName: booking.hotel.name,
        amount: new Prisma.Decimal(booking.totalNet),
        currency: booking.currency,
        status: booking.status.toLowerCase(),
        rawPayload: booking as unknown as Prisma.InputJsonValue,
        conversionAt: new Date(),
      },
    });

    return Response.json({ booking, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "booking failed";
    console.error("[hotelbeds/book]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
