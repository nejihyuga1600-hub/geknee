// Returns the current user's uploaded trip photos that match a monument's
// destination. Called from MonumentShop's detail view so the "your photos"
// strip can render alongside the skin quests + collection metadata.
//
// Match rule: any TripDraft owned by the user (or where the user is a
// TripMember) whose `location` (lowercased) contains any of the
// monument's cityKeys. Then any TripFile with tag='photo' on those trips
// that the user is allowed to see (public files OR their own private).
//
// Query params:
//   cityKeys — CSV of lowercase substrings, e.g. "rome,roma".
//              Required; monument-specific.
//
// Response: { photos: [{ url, tripId, tripTitle, tripLocation,
//              uploadedAt, byMe }] }, newest first.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ photos: [] }, { status: 401 });

  const url = new URL(req.url);
  const cityKeys = (url.searchParams.get("cityKeys") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (cityKeys.length === 0) return NextResponse.json({ photos: [] });

  // Trips the user can see: their own drafts + trips where they're a
  // confirmed TripMember. Prisma doesn't do case-insensitive substring
  // across all backends; do the match in JS after pulling the filtered
  // candidate set (small — a single user has O(dozens) trips).
  const [ownTrips, memberTrips] = await Promise.all([
    prisma.tripDraft.findMany({
      where: { userId },
      select: { id: true, title: true, location: true },
    }),
    prisma.tripMember.findMany({
      where: { userId },
      select: { trip: { select: { id: true, title: true, location: true } } },
    }),
  ]);
  const allTrips = [
    ...ownTrips,
    ...memberTrips.map((m) => m.trip).filter((t): t is NonNullable<typeof t> => !!t),
  ];
  const matchedTripIds = allTrips
    .filter((t) => {
      const loc = (t.location || "").toLowerCase();
      return cityKeys.some((k) => loc.includes(k));
    })
    .map((t) => t.id);
  if (matchedTripIds.length === 0) return NextResponse.json({ photos: [] });

  const files = await prisma.tripFile.findMany({
    where: {
      tripId: { in: matchedTripIds },
      tag: "photo",
      // Public files are visible to every member; private only to the uploader.
      OR: [{ visibility: "public" }, { userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true, url: true, tripId: true, userId: true, createdAt: true,
      trip: { select: { title: true, location: true } },
    },
  });

  const photos = files.map((f) => ({
    id: f.id,
    url: f.url,
    tripId: f.tripId,
    tripTitle: f.trip.title,
    tripLocation: f.trip.location,
    uploadedAt: f.createdAt.toISOString(),
    byMe: f.userId === userId,
  }));
  return NextResponse.json({ photos });
}
