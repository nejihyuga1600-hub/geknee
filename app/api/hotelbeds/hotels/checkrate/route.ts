// /api/hotelbeds/hotels/checkrate — verify rates before booking.
//
// Cert §2.5: only call when rateType="RECHECK" on the Availability
// response. Cert §2.6: group up to 10 rateKeys per call.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { checkRates, hotelbedsConfigured } from "@/lib/hotelbeds";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hotelbedsConfigured("hotel")) {
    return Response.json(
      { error: "HOTELBEDS_HOTEL_SECRET not set", rates: [], configured: false },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null) as { rateKeys?: string[] } | null;
  if (!body || !Array.isArray(body.rateKeys) || body.rateKeys.length === 0) {
    return Response.json({ error: "rateKeys[] required" }, { status: 400 });
  }
  if (body.rateKeys.length > 10) {
    return Response.json({ error: "max 10 rateKeys per call" }, { status: 400 });
  }

  try {
    const rates = await checkRates({ rateKeys: body.rateKeys });
    return Response.json({ rates, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "checkrate failed";
    console.error("[hotelbeds/checkrate]", msg);
    return Response.json({ error: msg, rates: [] }, { status: 502 });
  }
}
