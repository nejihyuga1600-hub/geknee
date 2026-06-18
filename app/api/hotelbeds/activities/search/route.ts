// /api/hotelbeds/activities/search — wholesale activity availability.
//
// Wholesale margins on activities are typically 2-3x affiliate
// commission (Viator), so this is the higher-revenue source when both
// are live. Render order in the Activities tab: Hotelbeds first
// (better margin), Viator second (better catalog breadth).

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  searchActivities,
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

  if (!hotelbedsConfigured("activities")) {
    return Response.json(
      {
        error: "HOTELBEDS_ACTIVITIES_SECRET not set",
        activities: [],
        configured: false,
      },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const location = searchParams.get("location");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const adults = parseInt(searchParams.get("adults") ?? "1", 10);

  if (!location || !from || !to) {
    return Response.json(
      { error: "missing required params: location, from, to" },
      { status: 400 },
    );
  }

  const destinationCode = resolveDestinationCode(location);
  if (!destinationCode) {
    return Response.json(
      { error: `no destination code mapped for "${location}"`, activities: [] },
      { status: 200 },
    );
  }

  try {
    const activities = await searchActivities({
      destinationCode,
      from,
      to,
      adults: Math.max(1, Math.min(8, adults)),
    });
    return Response.json({ activities, destinationCode, configured: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "hotelbeds activities search failed";
    console.error("[hotelbeds/activities/search]", msg);
    return Response.json({ error: msg, activities: [] }, { status: 502 });
  }
}
