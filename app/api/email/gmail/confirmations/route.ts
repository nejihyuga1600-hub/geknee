// Returns the user's parsed booking confirmations for a given trip.
// Consumed by the booking page so the Stays + Flights sections can show
// "✓ BOOKED · Confirmation #ABC123" badges next to matching cards.
//
// Sources:
//   - TripDraft.flightBookingDetectedAt → flight confirmation flag.
//     (We don't currently break out separate flight/hotel detection
//     columns; the Gmail scan currently flips this for either kind.
//     Promote to separate fields if both can coexist on one trip.)
//   - InboundMessage rows where reason is a JSON blob with type="hotel"
//     and matchedTripId === tripId → hotel confirmations with details.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  if (!tripId) {
    return Response.json({ error: "tripId required" }, { status: 400 });
  }

  const trip = await prisma.tripDraft.findUnique({
    where: { id: tripId },
    select: { userId: true, flightBookingDetectedAt: true },
  });
  if (!trip || trip.userId !== userId) {
    return Response.json({ error: "Trip not found" }, { status: 404 });
  }

  // Hotel confirmations — InboundMessage rows whose reason JSON
  // matches this trip. We pull recently-extracted ones first.
  const messages = await prisma.inboundMessage.findMany({
    where: {
      userId,
      status: "extracted",
      reason: { startsWith: '{"type":"hotel"' },
    },
    select: { reason: true, receivedAt: true },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  const hotels: Array<{
    hotelName: string;
    city: string;
    checkinAt: string;
    checkoutAt: string;
    bookingRef: string | null;
    totalDisplay: string | null;
  }> = [];

  for (const m of messages) {
    if (!m.reason) continue;
    try {
      const data = JSON.parse(m.reason) as {
        type?: string;
        hotelName?: string;
        city?: string;
        checkinAt?: string;
        checkoutAt?: string;
        bookingRef?: string | null;
        totalDisplay?: string | null;
        matchedTripId?: string | null;
      };
      if (data.type !== "hotel") continue;
      if (data.matchedTripId !== tripId) continue;
      if (!data.hotelName || !data.city || !data.checkinAt || !data.checkoutAt) continue;
      hotels.push({
        hotelName: data.hotelName,
        city: data.city,
        checkinAt: data.checkinAt,
        checkoutAt: data.checkoutAt,
        bookingRef: data.bookingRef ?? null,
        totalDisplay: data.totalDisplay ?? null,
      });
    } catch {
      // Malformed JSON — skip.
    }
  }

  return Response.json({
    flightDetectedAt: trip.flightBookingDetectedAt
      ? trip.flightBookingDetectedAt.toISOString()
      : null,
    hotels,
  });
}
