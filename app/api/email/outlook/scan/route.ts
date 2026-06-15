// Microsoft Graph (Outlook/Hotmail/Live/O365) scan endpoint — same
// shape as /api/email/gmail/scan. Pulls new booking-confirmation
// emails from the signed-in user's inbox and records them in
// InboundMessage. V0 only logs receipt; extraction + filing land in
// the shared follow-up commit that targets all three inbound
// surfaces (Postmark forwarding, Gmail, Outlook).

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getOutlookAccessToken,
  listBookingConfirmations,
  fetchOutlookMessage,
} from "@/lib/outlook-client";
import { extractFlight, matchFlightToTrip } from "@/lib/flight-extractor";
import { extractHotel, matchHotelToTrip } from "@/lib/hotel-extractor";

// Strip HTML tags + collapse whitespace so the extractor sees readable
// plain text. Matches Gmail's extractMessageBody behavior — Microsoft
// Graph returns body.content as HTML by default for most senders.
function bodyFromOutlook(msg: { body?: { content?: string; contentType?: "text" | "html" }; bodyPreview?: string }): string {
  const raw = msg.body?.content ?? msg.bodyPreview ?? "";
  if (!raw) return "";
  if (msg.body?.contentType === "html") {
    return raw
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw.replace(/\s+/g, " ").trim();
}

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getOutlookAccessToken(userId);
  if (!accessToken) {
    return Response.json(
      {
        error: "outlook_not_connected",
        message:
          "Sign in with Microsoft (or re-auth) to grant the Mail.Read permission. Existing sessions don't have it yet.",
      },
      { status: 412 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastOutlookSyncAt: true },
  });
  const afterIso = user?.lastOutlookSyncAt?.toISOString();

  const messages = await listBookingConfirmations(accessToken, {
    afterIso,
    maxResults: 50,
  });

  let newCount = 0;
  let dedupCount = 0;
  let errorCount = 0;
  let latest = user?.lastOutlookSyncAt?.getTime() ?? 0;

  for (const msg of messages) {
    try {
      const messageId = msg.internetMessageId;
      if (!messageId) {
        errorCount += 1;
        continue;
      }
      const receivedMs = new Date(msg.receivedDateTime).getTime();
      if (receivedMs > latest) latest = receivedMs;

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

      // ── Extraction (parallel to gmail scan). Best-effort: failures
      // leave parsedAt null so a future retry can pick it up. ────────
      try {
        const full = await fetchOutlookMessage(accessToken, msg.id);
        if (!full) {
          await prisma.inboundMessage.update({
            where: { id: inbound.id },
            data: { parsedAt: new Date(), status: "skipped", reason: "outlook-fetch-failed" },
          });
          continue;
        }
        const body = bodyFromOutlook(full);
        const flight = await extractFlight(body);
        if (flight) {
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
                  source: "outlook",
                }),
              },
            });
            if (matchedTripId) {
              await prisma.tripDraft.update({
                where: { id: matchedTripId },
                data: { flightBookingDetectedAt: new Date() },
              });
            }
          } else {
            await prisma.inboundMessage.update({
              where: { id: inbound.id },
              data: { parsedAt: new Date(), status: "skipped", reason: "not-a-known-booking" },
            });
          }
        }
      } catch (parseErr) {
        console.error("[email/outlook/scan] extraction failed:", parseErr);
        // Leave parsedAt null — eligible for retry.
      }
    } catch (err) {
      console.error("[email/outlook/scan] per-message error:", err);
      errorCount += 1;
    }
  }

  if (latest > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastOutlookSyncAt: new Date(latest) },
    });
  }

  return Response.json({
    ok: true,
    fetched: messages.length,
    new: newCount,
    deduped: dedupCount,
    errors: errorCount,
    lastSyncAt: latest ? new Date(latest).toISOString() : null,
  });
}
