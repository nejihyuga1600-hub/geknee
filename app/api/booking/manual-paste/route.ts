// Manual booking paste — last-mile catch-all for confirmations that
// didn't arrive via Gmail/Outlook/Calendar. User pastes the email
// text or drops in a screenshot; we run the same extractors and
// persist via the same InboundMessage path so the badge surfaces
// next to its matching hotel/flight card.
//
// Body shape: { kind: "text", text: string, tripId?: string }
//          OR { kind: "image", imageBase64: string, mimeType: string, tripId?: string }
//
// The text path goes straight to extractFlight + extractHotel.
// The image path first runs Claude vision to OCR the screenshot into
// plain text, then runs the same extractor pipeline.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { extractFlight, matchFlightToTrip } from "@/lib/flight-extractor";
import { extractHotel, matchHotelToTrip } from "@/lib/hotel-extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VISION_SYSTEM = `You are reading a screenshot of a travel booking confirmation. Transcribe the entire visible text verbatim — preserve sender names, dates, addresses, confirmation numbers, prices, hotel/flight details. Skip decorative elements (icons, logos). Do not summarize. Return plain text only.`;

interface TextBody {
  kind: "text";
  text: string;
  tripId?: string | null;
}
interface ImageBody {
  kind: "image";
  imageBase64: string;
  mimeType: string;
  tripId?: string | null;
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: TextBody | ImageBody;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid body" }, { status: 400 }); }

  let plain = "";

  if (body.kind === "text") {
    plain = (body.text ?? "").trim();
    if (plain.length < 50) {
      return Response.json({ error: "Text too short to parse" }, { status: 400 });
    }
  } else if (body.kind === "image") {
    if (!body.imageBase64 || !body.mimeType) {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }
    if (!body.mimeType.startsWith("image/")) {
      return Response.json({ error: "mimeType must be image/*" }, { status: 400 });
    }
    // OCR the screenshot. Claude vision is the simplest path here and
    // it produces text the extractors can consume directly.
    try {
      const ocr = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: VISION_SYSTEM,
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: {
              type: "base64",
              media_type: body.mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: body.imageBase64,
            },
          }],
        }],
      });
      plain = ocr.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { type: "text"; text: string }).text)
        .join("\n")
        .trim();
    } catch (err) {
      console.error("[manual-paste] OCR failed:", err);
      return Response.json({ error: "OCR failed" }, { status: 502 });
    }
    if (plain.length < 50) {
      return Response.json({ error: "OCR returned too little text" }, { status: 422 });
    }
  } else {
    return Response.json({ error: "kind must be 'text' or 'image'" }, { status: 400 });
  }

  // Synthetic message id so dedup works (a user can paste the same
  // email twice — second paste gets ignored). Hash of the first 256
  // chars + userId. RFC 822-style suffix keeps the @-style format.
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${plain.slice(0, 256)}`),
  );
  const hex = Array.from(new Uint8Array(hash))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const messageId = `paste-${hex}@geknee.local`;

  const seen = await prisma.inboundMessage.findUnique({
    where: { messageId },
    select: { id: true },
  });
  if (seen) {
    return Response.json({ ok: true, deduped: true });
  }

  const inbound = await prisma.inboundMessage.create({
    data: { messageId, userId, status: "received" },
  });

  // Same extraction order as the Gmail/Outlook scans.
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
    return Response.json({ ok: true, kind: "flight", matchedTripId });
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
          source: "manual-paste",
        }),
      },
    });
    if (matchedTripId) {
      await prisma.tripDraft.update({
        where: { id: matchedTripId },
        data: { flightBookingDetectedAt: new Date() },
      });
    }
    return Response.json({ ok: true, kind: "hotel", matchedTripId });
  }

  await prisma.inboundMessage.update({
    where: { id: inbound.id },
    data: { parsedAt: new Date(), status: "skipped", reason: "not-a-known-booking" },
  });
  return Response.json({ ok: true, kind: "unknown" });
}
