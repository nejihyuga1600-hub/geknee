// /api/hotelbeds/hotels/content — fetch hotel description, photos, facilities.
//
// Cert §5.x: required for displaying hotel content. We hit Hotelbeds
// Content API which caches at the edge for 7 days. Used by the
// HotelDetailModal (next commit) when the user taps into a room
// from HotelbedsLiveRooms.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getHotelContent } from "@/lib/hotelbeds-content";
import { hotelbedsConfigured } from "@/lib/hotelbeds";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
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

  const code = parseInt(req.nextUrl.searchParams.get("code") ?? "", 10);
  if (!Number.isFinite(code) || code <= 0) {
    return Response.json({ error: "code (integer) required" }, { status: 400 });
  }

  try {
    const content = await getHotelContent(code);
    if (!content) {
      return Response.json({ error: "hotel not found" }, { status: 404 });
    }
    return Response.json({ content, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "content fetch failed";
    console.error("[hotelbeds/content]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
