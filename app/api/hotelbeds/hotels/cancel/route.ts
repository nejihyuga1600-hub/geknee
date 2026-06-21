// /api/hotelbeds/hotels/cancel — cancel a Hotelbeds booking.
//
// Cert §6.2: must demonstrate cancellation on the live test booking.
// Supports `simulate=true` to preview cancellation fees without
// actually cancelling — useful in the UI when showing "Cancel fee will be $X".

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { cancelBooking, hotelbedsConfigured } from "@/lib/hotelbeds";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hotelbedsConfigured("hotel")) {
    return Response.json({ error: "HOTELBEDS_HOTEL_SECRET not set" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    reference?: string;
    simulate?: boolean;
  } | null;
  if (!body?.reference) {
    return Response.json({ error: "reference required" }, { status: 400 });
  }

  // Verify the booking belongs to this user before allowing cancel.
  const existing = await prisma.booking.findUnique({
    where: {
      partner_providerOrderId: {
        partner: "hotelbeds",
        providerOrderId: body.reference,
      },
    },
    select: { userId: true },
  });
  if (existing && existing.userId !== session.user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await cancelBooking(body.reference, body.simulate ?? false);
    if (!body.simulate) {
      await prisma.booking.update({
        where: {
          partner_providerOrderId: {
            partner: "hotelbeds",
            providerOrderId: body.reference,
          },
        },
        data: { status: "cancelled", updatedAt: new Date() },
      }).catch(() => null); // booking may not exist in our DB (e.g. cert test)
    }
    return Response.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "cancel failed";
    console.error("[hotelbeds/cancel]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
