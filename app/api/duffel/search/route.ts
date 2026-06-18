// /api/duffel/search — proxy to Duffel offer-request API.
//
// Auth-gated. Returns a normalized list of bookable flight offers
// for the requested route + dates + cabin. Used by the Flights tab
// in BookView to show real prices with cabin selection.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchOffers, type DuffelCabin } from "@/lib/duffel";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_CABINS: DuffelCabin[] = ["economy", "premium_economy", "business", "first"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const origin = searchParams.get("origin")?.toUpperCase();
  const destination = searchParams.get("destination")?.toUpperCase();
  const departDate = searchParams.get("depart");
  const returnDate = searchParams.get("return");
  const cabinParam = searchParams.get("cabin") as DuffelCabin | null;
  const adults = parseInt(searchParams.get("adults") ?? "1", 10);

  if (!origin || !destination || !departDate) {
    return Response.json(
      { error: "missing required params: origin, destination, depart" },
      { status: 400 },
    );
  }

  const cabin: DuffelCabin = cabinParam && VALID_CABINS.includes(cabinParam) ? cabinParam : "economy";

  try {
    const offers = await searchOffers({
      origin,
      destination,
      departDate,
      returnDate: returnDate || null,
      cabin,
      adults: Math.max(1, Math.min(9, adults)),
    });
    return Response.json({ offers, cabin });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "duffel search failed";
    console.error("[duffel/search]", msg);
    return Response.json({ error: msg, offers: [] }, { status: 502 });
  }
}
