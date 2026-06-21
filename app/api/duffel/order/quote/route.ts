// /api/duffel/order/quote — re-fetch a Duffel offer to confirm price.
//
// Offers expire within minutes of the original search. Before showing
// the booking modal we re-quote to: (a) confirm the offer hasn't gone
// stale, (b) catch price drift, (c) pull the passenger IDs Duffel
// assigned at offer-request time (needed for orders.create).

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { quoteOffer } from "@/lib/duffel";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { offerId?: string } | null;
  if (!body?.offerId) {
    return Response.json({ error: "offerId required" }, { status: 400 });
  }
  try {
    const offer = await quoteOffer(body.offerId);
    return Response.json({ offer });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "quote failed";
    if (msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("not found")) {
      return Response.json({ error: msg }, { status: 410 });
    }
    console.error("[duffel/order/quote]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
