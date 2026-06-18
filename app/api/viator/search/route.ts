// /api/viator/search — proxy to Viator Partner API.
//
// Auth-gated. Returns normalized list of bookable activity products
// for the destination + date range. Used by the Activities tab in
// BookView to show real product cards above the AI-generated ones.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchProducts } from "@/lib/viator";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const location = searchParams.get("location");
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");
  const limit = parseInt(searchParams.get("limit") ?? "12", 10);

  if (!location) {
    return Response.json({ error: "missing required param: location" }, { status: 400 });
  }

  try {
    const products = await searchProducts({
      location,
      startDate,
      endDate,
      limit: Math.max(1, Math.min(24, limit)),
    });
    return Response.json({ products });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "viator search failed";
    console.error("[viator/search]", msg);
    return Response.json({ error: msg, products: [] }, { status: 502 });
  }
}
