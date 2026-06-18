// /api/hotelbeds/hotels/search — wholesale hotel availability lookup.
//
// Auth-gated. Returns bookable rooms with rates for the given
// destination + date range + occupancy. Used by the Stays tab in
// BookView to show real bookable inventory above the AI-generated
// hotel cards.
//
// Sandbox mode (HOTELBEDS_ENV=test, default) returns Hotelbeds' test
// dataset — realistic shape, fake hotels. Switch to "live" only after
// completing the Get Certified step in Hotelbeds dashboard.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  searchHotels,
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

  if (!hotelbedsConfigured("hotel")) {
    return Response.json(
      {
        error:
          "Hotelbeds shared secret not set — integration code ready but waiting on HOTELBEDS_HOTEL_SECRET env var.",
        hotels: [],
        configured: false,
      },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const location = searchParams.get("location");
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const adults = parseInt(searchParams.get("adults") ?? "2", 10);
  const rooms = parseInt(searchParams.get("rooms") ?? "1", 10);

  if (!location || !checkIn || !checkOut) {
    return Response.json(
      { error: "missing required params: location, checkIn, checkOut" },
      { status: 400 },
    );
  }

  const destinationCode = resolveDestinationCode(location);
  if (!destinationCode) {
    return Response.json(
      { error: `no Hotelbeds destination code mapped for "${location}"`, hotels: [] },
      { status: 200 },
    );
  }

  try {
    const hotels = await searchHotels({
      destinationCode,
      checkIn,
      checkOut,
      adults: Math.max(1, Math.min(8, adults)),
      rooms: Math.max(1, Math.min(4, rooms)),
    });
    return Response.json({ hotels, destinationCode, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "hotelbeds search failed";
    console.error("[hotelbeds/hotels/search]", msg);
    return Response.json({ error: msg, hotels: [] }, { status: 502 });
  }
}
