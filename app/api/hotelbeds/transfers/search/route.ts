// /api/hotelbeds/transfers/search — wholesale airport transfer rates.
//
// Wholesale margins 2-3x the Kiwitaxi affiliate flow. Once configured,
// the Transport tab promotes Hotelbeds Transfers above the Kiwitaxi
// affiliate tile.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  searchTransfers,
  resolveDestinationCode,
  hotelbedsConfigured,
} from "@/lib/hotelbeds";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hotelbedsConfigured("transfers")) {
    return Response.json(
      { error: "HOTELBEDS_TRANSFERS_SECRET not set", transfers: [], configured: false },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const fromIata = searchParams.get("fromIata");
  const location = searchParams.get("location");
  const pickupDate = searchParams.get("pickup"); // YYYY-MM-DDTHH:mm:ss
  const adults = parseInt(searchParams.get("adults") ?? "2", 10);

  if (!fromIata || !location || !pickupDate) {
    return Response.json(
      { error: "missing required params: fromIata, location, pickup" },
      { status: 400 },
    );
  }

  // For airport→city transfers, use the Hotelbeds ATLAS zone code
  // of the destination city. Same cache as hotels.
  const toCode = resolveDestinationCode(location);
  if (!toCode) {
    return Response.json(
      { error: `no destination code mapped for "${location}"`, transfers: [] },
      { status: 200 },
    );
  }

  try {
    const transfers = await searchTransfers({
      fromIata: fromIata.toUpperCase(),
      toCode,
      toType: "ATLAS",
      pickupDate,
      adults: Math.max(1, Math.min(8, adults)),
    });
    return Response.json({ transfers, toCode, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "hotelbeds transfers search failed";
    console.error("[hotelbeds/transfers/search]", msg);
    return Response.json({ error: msg, transfers: [] }, { status: 502 });
  }
}
