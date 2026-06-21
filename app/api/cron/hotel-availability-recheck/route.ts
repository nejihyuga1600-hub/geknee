// Daily Hotelbeds availability re-check for un-booked stays.
//
// Runs at 06:00 UTC (configured in vercel.json). Walks every TripDraft
// where:
//   - startDate is between today and +365d
//   - userId is set (not an anonymous draft)
//   - no Booking row exists for that trip with itemKind='hotel'
//
// For each match, calls /hotel-api/1.0/hotels with the trip's
// destination + dates. Result lands in the Next.js fetch cache
// (5min revalidate set in lib/hotelbeds) so when the user opens
// /book/stays, the response is already warm — no spinner.
//
// We do NOT persist snapshots (cron stays simple, no schema migration
// needed). Logged counts feed monitoring; future enhancement can
// add a HotelAvailabilitySnapshot model for price-drop detection.

import { prisma } from "@/lib/prisma";
import {
  searchHotels,
  resolveDestinationCode,
  hotelbedsConfigured,
} from "@/lib/hotelbeds";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET> header.
  const header = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return !!process.env.CRON_SECRET && header === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hotelbedsConfigured("hotel")) {
    return Response.json(
      { error: "HOTELBEDS_HOTEL_SECRET not set", checked: 0 },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 365 * 86400e3).toISOString().slice(0, 10);

  // Find unbooked future trips. Excludes drafts with no startDate /
  // no userId and trips that already have a hotel Booking row.
  const candidates = await prisma.tripDraft.findMany({
    where: {
      userId: { not: null as unknown as string },
      startDate: { gte: today, lte: horizon },
      endDate: { not: null },
      // Negation via raw — Prisma's `none` on relation works but we
      // also want to skip Hotelbeds-specific bookings only, not flight
      // bookings. Filter further in code.
    },
    select: {
      id: true,
      userId: true,
      location: true,
      startDate: true,
      endDate: true,
    },
    // Bound to avoid runaway cost in test mode quota (50/day sandbox).
    take: 40,
  });

  // Drop trips that already have a hotel booking.
  const tripIds = candidates.map((c) => c.id);
  const booked = await prisma.booking.findMany({
    where: {
      tripId: { in: tripIds },
      itemKind: "hotel",
      status: { in: ["confirmed", "pending"] },
    },
    select: { tripId: true },
  });
  const bookedIds = new Set(booked.map((b) => b.tripId));
  const toCheck = candidates.filter((c) => !bookedIds.has(c.id));

  let success = 0;
  let skipped = 0;
  let failed = 0;
  const errors: Array<{ tripId: string; error: string }> = [];

  for (const trip of toCheck) {
    const destCode = resolveDestinationCode(trip.location);
    if (!destCode || !trip.startDate || !trip.endDate) {
      skipped++;
      continue;
    }
    try {
      await searchHotels({
        destinationCode: destCode,
        checkIn: trip.startDate,
        checkOut: trip.endDate,
      });
      success++;
    } catch (err) {
      failed++;
      errors.push({
        tripId: trip.id,
        error: err instanceof Error ? err.message : "unknown",
      });
      // 50/day sandbox quota — if we hit 429/403 stop early.
      if (err instanceof Error && /\b(403|429)\b/.test(err.message)) break;
    }
  }

  const elapsed = Date.now() - startedAt;
  console.log(
    `[cron:hotel-recheck] ${toCheck.length} unbooked trips → ` +
      `${success} warmed / ${skipped} skipped (no dest code) / ${failed} failed in ${elapsed}ms`,
  );

  return Response.json({
    candidates: candidates.length,
    alreadyBooked: bookedIds.size,
    checked: toCheck.length,
    success,
    skipped,
    failed,
    elapsedMs: elapsed,
    errors: errors.slice(0, 5),
  });
}
