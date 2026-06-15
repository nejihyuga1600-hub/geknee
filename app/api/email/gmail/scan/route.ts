// Gmail scan endpoint — pulls new booking-confirmation emails from
// the signed-in user's Gmail and records them in InboundMessage. V0
// only logs receipt; extraction + filing land in a follow-up.
//
// Triggered by:
//  - User-initiated "Scan Gmail" button (POST without body)
//  - Future: cron worker, or hook on plan-summary page mount
//
// Pre-req: user signed in via Google with the gmail.readonly scope
// (auth.ts requests it). If they signed in before that scope was
// added, getGoogleAccessToken() returns null and we surface a
// re-auth-required error.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getGoogleAccessToken,
  listBookingConfirmations,
  fetchGmailMessage,
  getRfc822MessageId,
  extractMessageBody,
} from "@/lib/gmail-client";
import { extractFlight, matchFlightToTrip } from "@/lib/flight-extractor";
import { extractHotel, matchHotelToTrip } from "@/lib/hotel-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) {
    return Response.json(
      {
        error: "gmail_not_connected",
        message:
          "Sign in again with Google to grant the Gmail readonly permission. Existing sessions don't have it yet.",
      },
      { status: 412 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastGmailSyncAt: true },
  });
  // Convert the high-water mark to epoch seconds for Gmail's `after:`
  // operator. First-ever scan: fall back to the last 30 days
  // (handled inside listBookingConfirmations).
  const afterEpochSec = user?.lastGmailSyncAt
    ? Math.floor(user.lastGmailSyncAt.getTime() / 1000)
    : undefined;

  const entries = await listBookingConfirmations(accessToken, {
    afterEpochSec,
    maxResults: 50,
  });

  let newCount = 0;
  let dedupCount = 0;
  let errorCount = 0;
  let latestInternalDate = user?.lastGmailSyncAt?.getTime() ?? 0;

  for (const entry of entries) {
    try {
      const msg = await fetchGmailMessage(accessToken, entry.id);
      if (!msg) {
        errorCount += 1;
        continue;
      }
      const messageId = getRfc822MessageId(msg);
      if (!messageId) {
        errorCount += 1;
        continue;
      }
      const internalDateMs = msg.internalDate ? Number(msg.internalDate) : 0;
      if (internalDateMs > latestInternalDate) latestInternalDate = internalDateMs;

      const seen = await prisma.inboundMessage.findUnique({
        where: { messageId },
        select: { id: true },
      });
      if (seen) {
        dedupCount += 1;
        continue;
      }

      const inbound = await prisma.inboundMessage.create({
        data: { messageId, userId, status: "received" },
      });
      newCount += 1;

      // ── Flight extraction (Phase 0) ────────────────────────────────────
      // Inline best-effort. Failures don't break the scan — we just leave
      // parsedAt null and the record can be retried by a future worker.
      // We use claude-haiku-4-5 (small, cheap, fast — flight extraction
      // is well within its capability envelope).
      try {
        const body = extractMessageBody(msg);
        const flight = await extractFlight(body);
        if (flight) {
          // Persist extracted flight fields onto the InboundMessage row.
          const arrives = new Date(flight.arrivesAt);
          const returns = flight.returnsAt ? new Date(flight.returnsAt) : null;
          await prisma.inboundMessage.update({
            where: { id: inbound.id },
            data: {
              flightDest: flight.destinationIata ?? flight.destinationCity,
              flightDestCity: flight.destinationCity,
              flightArrivesAt: isNaN(arrives.getTime()) ? null : arrives,
              flightReturnsAt: returns && !isNaN(returns.getTime()) ? returns : null,
              parsedAt: new Date(),
              status: "extracted",
            },
          });

          // Match against existing trip drafts — destination + arrival date
          // within ±1 day flags the trip as "flight detected".
          const trips = await prisma.tripDraft.findMany({
            where: { userId },
            select: { id: true, location: true, startDate: true },
          });
          const matchedTripId = matchFlightToTrip(flight, trips);
          if (matchedTripId) {
            await prisma.tripDraft.update({
              where: { id: matchedTripId },
              data: { flightBookingDetectedAt: new Date() },
            });
          }
        } else {
          // Not a flight — try the hotel extractor before giving up.
          // Hotel data is persisted as JSON in the `reason` text column
          // (rather than dedicated columns) so we don't need a Prisma
          // migration to land this. A follow-up should promote the most
          // common fields to proper columns once usage is validated.
          const hotel = await extractHotel(body);
          if (hotel) {
            const trips = await prisma.tripDraft.findMany({
              where: { userId },
              select: { id: true, location: true, startDate: true, endDate: true },
            });
            const matchedTripId = matchHotelToTrip(hotel, trips);
            await prisma.inboundMessage.update({
              where: { id: inbound.id },
              data: {
                parsedAt: new Date(),
                status: "extracted",
                reason: JSON.stringify({
                  type: "hotel",
                  hotelName: hotel.hotelName,
                  city: hotel.city,
                  checkinAt: hotel.checkinAt,
                  checkoutAt: hotel.checkoutAt,
                  bookingRef: hotel.bookingRef,
                  totalDisplay: hotel.totalDisplay,
                  confidence: hotel.confidence,
                  matchedTripId,
                }),
              },
            });
            // Flag the trip as having a hotel booking — reuses the
            // existing flightBookingDetectedAt pattern. (We deliberately
            // don't introduce a new column tonight; a future migration
            // can split flight + hotel detection if both can coexist on
            // the same trip.)
            if (matchedTripId) {
              await prisma.tripDraft.update({
                where: { id: matchedTripId },
                data: { flightBookingDetectedAt: new Date() },
              });
            }
          } else {
            // Neither flight nor hotel. Mark parsed so we don't retry.
            await prisma.inboundMessage.update({
              where: { id: inbound.id },
              data: { parsedAt: new Date(), status: "skipped", reason: "not-a-known-booking" },
            });
          }
        }
      } catch (parseErr) {
        console.error("[email/gmail/scan] flight extraction failed:", parseErr);
        // Leave parsedAt null — eligible for retry.
      }
    } catch (err) {
      console.error("[email/gmail/scan] per-message error:", err);
      errorCount += 1;
    }
  }

  // Bump the high-water mark only if we made it through the loop.
  // Using the most-recent internalDate (not now()) ensures we pick up
  // anything that arrived during the scan on the next run.
  if (latestInternalDate > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastGmailSyncAt: new Date(latestInternalDate) },
    });
  }

  return Response.json({
    ok: true,
    fetched: entries.length,
    new: newCount,
    deduped: dedupCount,
    errors: errorCount,
    lastSyncAt: latestInternalDate ? new Date(latestInternalDate).toISOString() : null,
  });
}
