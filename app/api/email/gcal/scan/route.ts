// Google Calendar scan endpoint — pulls events with hotel/flight
// keywords from the user's primary calendar and runs the same
// flight + hotel extractors as the Gmail scan. Calendar entries are
// often auto-created by OTAs (Booking.com, Airbnb, airline carriers)
// with the confirmation number in the description, so they're a
// high-yield source of "did this booking actually land".
//
// Auth: same Google OAuth account row as Gmail. The token must have
// calendar.readonly scope (granted alongside gmail.readonly in
// auth.ts). Users who signed in before that scope was added will
// get 412 just like the existing Gmail flow.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/gmail-client";
import { extractFlight, matchFlightToTrip } from "@/lib/flight-extractor";
import { extractHotel, matchHotelToTrip } from "@/lib/hotel-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface CalendarEvent {
  id: string;
  iCalUID?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
}

// Keywords that strongly suggest a booking. Used as the `q` param on
// Calendar.list. Booking.com and Airbnb tag their auto-created events
// with those exact strings; airlines use the carrier name or the
// flight number ("flight to", "confirmation").
const KEYWORDS = "booking OR reservation OR confirmation OR flight OR hotel OR Airbnb OR Booking.com";

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
        error: "google_not_connected",
        message:
          "Sign in again with Google to grant the Calendar readonly permission. Existing sessions don't have it yet.",
      },
      { status: 412 },
    );
  }

  // Window: from 60 days ago to 365 days ahead. Captures booked-but-
  // past stays the user might still want surfaced AND upcoming trips.
  const now = new Date();
  const timeMin = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("q", KEYWORDS);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "100");

  let events: CalendarEvent[] = [];
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) {
      const txt = await r.text();
      console.error("[email/gcal/scan] Calendar list failed:", r.status, txt.slice(0, 200));
      return Response.json({ error: "calendar_list_failed", status: r.status }, { status: 502 });
    }
    const data = await r.json() as { items?: CalendarEvent[] };
    events = data.items ?? [];
  } catch (err) {
    console.error("[email/gcal/scan] network:", err);
    return Response.json({ error: "Network error" }, { status: 502 });
  }

  let newCount = 0;
  let dedupCount = 0;
  let errorCount = 0;

  for (const ev of events) {
    try {
      const messageId = ev.iCalUID ? `gcal-${ev.iCalUID}` : `gcal-${ev.id}`;
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

      // Build the extractor input from title + description + location.
      // Plain text already — no HTML stripping needed.
      const plain = [
        ev.summary ? `Title: ${ev.summary}` : null,
        ev.location ? `Location: ${ev.location}` : null,
        ev.start?.dateTime ?? ev.start?.date ? `Starts: ${ev.start.dateTime ?? ev.start.date}` : null,
        ev.end?.dateTime ?? ev.end?.date ? `Ends: ${ev.end.dateTime ?? ev.end.date}` : null,
        ev.description ?? null,
      ].filter(Boolean).join("\n\n");

      if (plain.length < 30) {
        await prisma.inboundMessage.update({
          where: { id: inbound.id },
          data: { parsedAt: new Date(), status: "skipped", reason: "calendar-event-too-thin" },
        });
        continue;
      }

      const flight = await extractFlight(plain);
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
        continue;
      }
      const hotel = await extractHotel(plain);
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
              source: "gcal",
            }),
          },
        });
        if (matchedTripId) {
          await prisma.tripDraft.update({
            where: { id: matchedTripId },
            data: { flightBookingDetectedAt: new Date() },
          });
        }
        continue;
      }
      await prisma.inboundMessage.update({
        where: { id: inbound.id },
        data: { parsedAt: new Date(), status: "skipped", reason: "not-a-known-booking" },
      });
    } catch (err) {
      console.error("[email/gcal/scan] per-event error:", err);
      errorCount += 1;
    }
  }

  return Response.json({
    ok: true,
    fetched: events.length,
    new: newCount,
    deduped: dedupCount,
    errors: errorCount,
  });
}
