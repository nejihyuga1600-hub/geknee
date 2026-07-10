// GET /api/saves — every SavedPlace for the current user, aggregated across
// trips, with optional search (?q=) and category filter (?category=).
//
// Used by:
//   - /saves page — the "Your saves" search + filter grid
//   - /api/geofence/register — pulls all with lat/lon set
//
// Response:
// {
//   count: number,
//   categories: [{ key, label, emoji, count }],
//   places: [{ id, venueName, city, country, lat, lon, category,
//              thumbnail, source, sourceUrl, savedAt, tripId, tripTitle }]
// }

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  CATEGORY_DEFS,
  categoryEmoji,
  categoryLabel,
  type SavedPlaceCategory,
} from "@/lib/places-categories";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const category = (url.searchParams.get("category") ?? "").trim();
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));

  const where: {
    userId: string;
    category?: string;
    OR?: Array<Record<string, unknown>>;
  } = { userId };

  if (category && category !== "all") {
    where.category = category;
  }

  if (q) {
    where.OR = [
      { venueName: { contains: q, mode: "insensitive" } },
      { city:      { contains: q, mode: "insensitive" } },
      { country:   { contains: q, mode: "insensitive" } },
      { notes:     { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, allCategories] = await Promise.all([
    prisma.savedPlace.findMany({
      where,
      orderBy: { savedAt: "desc" },
      take: limit,
      include: {
        trip: { select: { id: true, title: true } },
      },
    }),
    // Category counts across ALL of user's saves (ignore active filter) so
    // the chip row can show badges + hide empty categories.
    prisma.savedPlace.groupBy({
      by: ["category"],
      where: { userId },
      _count: { category: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const r of allCategories) counts.set(r.category, r._count.category);

  const categories = CATEGORY_DEFS
    .map(def => ({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      count: counts.get(def.key) ?? 0,
    }))
    .concat(
      counts.has("other") && !CATEGORY_DEFS.find(d => d.key === "other")
        ? [{ key: "other" as SavedPlaceCategory, label: categoryLabel("other"), emoji: categoryEmoji("other"), count: counts.get("other") ?? 0 }]
        : []
    );

  const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);

  return Response.json({
    count: total,
    filteredCount: rows.length,
    categories,
    places: rows.map(r => ({
      id: r.id,
      venueName: r.venueName,
      city: r.city,
      country: r.country,
      lat: r.lat,
      lon: r.lon,
      category: r.category,
      thumbnail: r.thumbnail,
      source: r.source,
      sourceUrl: r.sourceUrl,
      savedAt: r.savedAt.toISOString(),
      tripId: r.tripId,
      tripTitle: r.trip?.title ?? null,
    })),
  });
}
