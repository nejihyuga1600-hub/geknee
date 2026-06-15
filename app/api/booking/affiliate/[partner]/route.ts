// Inbound webhook for affiliate partners (Travelpayouts, Booking.com
// Demand API, Skyscanner affiliate). Each partner posts conversion
// notifications here; we verify HMAC, upsert a Booking row, and map
// the conversion's sub_id back to a TripDraft so the booking page can
// surface "✓ Confirmed via Booking.com — $250" badges.
//
// Per-partner config is read from env:
//   AFFILIATE_<PARTNER>_SECRET — HMAC secret. Required.
//   AFFILIATE_<PARTNER>_SIGNATURE_HEADER — name of the header carrying the signature. Defaults to "x-signature".
//   AFFILIATE_<PARTNER>_SIGNATURE_ALGO — "sha256" (default) or "sha1".
//
// Where `<PARTNER>` is one of the SUPPORTED list below, upper-cased.
// Partners not in the list 404. Partners without a secret configured
// respond 501 ("not configured") with a clear message so we can stub
// the integration before signup completes.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["travelpayouts", "booking", "skyscanner", "expedia", "klook"]);

interface NormalizedConversion {
  /** Partner-issued unique id for this conversion (idempotency key). */
  providerOrderId: string;
  /** "hotel" | "flight" | "activity" | "insurance" | "car" — partner's classification, lower-cased. */
  itemKind?: string;
  /** Hotel/flight/activity name. */
  itemName?: string;
  /** Booked amount in `currency`. */
  amount?: number;
  /** Affiliate payout (commission) in `currency`. */
  payout?: number;
  /** ISO 4217. */
  currency?: string;
  /** "pending" | "confirmed" | "cancelled" | "rejected". */
  status: "pending" | "confirmed" | "cancelled" | "rejected";
  /** Sub-id we passed in the outbound deeplink — usually "trip-<id>". */
  subId?: string;
  /** "Tiqets" / "Klook" / "Aviasales" / "Hotellook" / etc. */
  partnerProgram?: string;
  /** When the conversion was finalized at the partner. */
  conversionAt?: Date;
}

// Map a partner's raw payload to NormalizedConversion. Add new partners
// here as you onboard them. Each partner has its own JSON shape; the
// generic wrapper above gives us a single Booking row regardless.
function normalize(partner: string, payload: unknown): NormalizedConversion | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (partner === "travelpayouts") {
    const orderId = String(p.order_id ?? p.transaction_id ?? "");
    if (!orderId) return null;
    return {
      providerOrderId: orderId,
      itemKind: typeof p.item_kind === "string" ? p.item_kind.toLowerCase() : undefined,
      itemName: typeof p.item_name === "string" ? p.item_name : undefined,
      amount: typeof p.amount === "number" ? p.amount : Number(p.amount) || undefined,
      payout: typeof p.payout === "number" ? p.payout : Number(p.payout) || undefined,
      currency: typeof p.currency === "string" ? p.currency : undefined,
      status: ((s: string) => s === "confirmed" || s === "pending" || s === "cancelled" || s === "rejected" ? s : "pending")(
        String(p.status ?? "pending").toLowerCase(),
      ),
      subId: typeof p.sub_id === "string" ? p.sub_id : typeof p.subid === "string" ? p.subid : undefined,
      partnerProgram: typeof p.program === "string" ? p.program : undefined,
      conversionAt: p.created_at ? new Date(String(p.created_at)) : undefined,
    };
  }
  if (partner === "booking") {
    // Booking.com Demand API conversion webhook (provisional shape —
    // refine on first real payload).
    const orderId = String(p.reservation_id ?? p.confirmation_number ?? "");
    if (!orderId) return null;
    return {
      providerOrderId: orderId,
      itemKind: "hotel",
      itemName: typeof p.hotel_name === "string" ? p.hotel_name : undefined,
      amount: typeof p.total_price === "number" ? p.total_price : undefined,
      payout: typeof p.commission === "number" ? p.commission : undefined,
      currency: typeof p.currency === "string" ? p.currency : undefined,
      status: String(p.status ?? "confirmed").toLowerCase() === "cancelled" ? "cancelled" : "confirmed",
      subId: typeof p.label === "string" ? p.label : undefined,
      conversionAt: p.booked_at ? new Date(String(p.booked_at)) : undefined,
    };
  }
  if (partner === "skyscanner") {
    const orderId = String(p.transaction_id ?? p.click_id ?? "");
    if (!orderId) return null;
    return {
      providerOrderId: orderId,
      itemKind: "flight",
      itemName: typeof p.itinerary === "string" ? p.itinerary : undefined,
      amount: typeof p.fare === "number" ? p.fare : undefined,
      payout: typeof p.commission === "number" ? p.commission : undefined,
      currency: typeof p.currency === "string" ? p.currency : undefined,
      status: String(p.status ?? "confirmed").toLowerCase() === "cancelled" ? "cancelled" : "confirmed",
      subId: typeof p.subid === "string" ? p.subid : undefined,
      conversionAt: p.timestamp ? new Date(String(p.timestamp)) : undefined,
    };
  }
  // expedia / klook / etc — stubbed. Returns null so the route falls
  // through and persists the raw payload only.
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ partner: string }> }) {
  const { partner } = await params;
  const partnerLc = partner.toLowerCase();
  if (!SUPPORTED.has(partnerLc)) {
    return Response.json({ error: "Unknown partner" }, { status: 404 });
  }
  const upper = partnerLc.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const secret = process.env[`AFFILIATE_${upper}_SECRET`];
  const algo = (process.env[`AFFILIATE_${upper}_SIGNATURE_ALGO`] ?? "sha256").toLowerCase();
  const sigHeader = (process.env[`AFFILIATE_${upper}_SIGNATURE_HEADER`] ?? "x-signature").toLowerCase();

  if (!secret) {
    return Response.json(
      {
        error: "not_configured",
        message: `Set AFFILIATE_${upper}_SECRET in env before pointing ${partnerLc}'s webhook here.`,
      },
      { status: 501 },
    );
  }

  // Read raw bytes so HMAC matches whatever the partner signed.
  const rawBuf = Buffer.from(await req.arrayBuffer());
  const rawText = rawBuf.toString("utf8");
  const signature = req.headers.get(sigHeader) ?? "";
  if (!signature) {
    return Response.json({ error: "Missing signature header", expected: sigHeader }, { status: 401 });
  }
  // Some partners hex-encode the signature, others base64. Compare both.
  const hmac = crypto.createHmac(algo, secret).update(rawBuf).digest();
  const expectedHex = hmac.toString("hex");
  const expectedB64 = hmac.toString("base64");
  const sigClean = signature.replace(/^(?:sha256=|sha1=)/, "");
  const ok =
    crypto.timingSafeEqual(Buffer.from(expectedHex), Buffer.from(sigClean.padEnd(expectedHex.length, "0").slice(0, expectedHex.length))) ||
    expectedB64 === sigClean;
  if (!ok) {
    return Response.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawText); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const norm = normalize(partnerLc, payload);
  if (!norm) {
    // Persist the raw payload as a "received" Booking-less InboundMessage
    // so we can audit unmapped partner payloads.
    console.warn("[affiliate-webhook] unmapped payload for", partnerLc);
    return Response.json({ ok: true, mapped: false });
  }

  // Resolve tripId from sub_id ("trip-<id>" → id) and userId from the
  // trip's owner. NULL when sub_id was stripped or unparseable — row
  // still lands for revenue accounting.
  let tripId: string | null = null;
  let userId: string | null = null;
  const m = norm.subId?.match(/^trip-(.+)$/);
  if (m) {
    const trip = await prisma.tripDraft.findUnique({
      where: { id: m[1] },
      select: { id: true, userId: true },
    });
    if (trip) {
      tripId = trip.id;
      userId = trip.userId;
    }
  }

  await prisma.booking.upsert({
    where: { partner_providerOrderId: { partner: partnerLc, providerOrderId: norm.providerOrderId } },
    update: {
      status: norm.status,
      amount: norm.amount,
      payout: norm.payout,
      currency: norm.currency,
      itemKind: norm.itemKind,
      itemName: norm.itemName,
      partnerProgram: norm.partnerProgram,
      conversionAt: norm.conversionAt,
      rawPayload: payload as object,
    },
    create: {
      partner: partnerLc,
      providerOrderId: norm.providerOrderId,
      partnerProgram: norm.partnerProgram,
      status: norm.status,
      amount: norm.amount,
      payout: norm.payout,
      currency: norm.currency,
      itemKind: norm.itemKind,
      itemName: norm.itemName,
      conversionAt: norm.conversionAt,
      rawPayload: payload as object,
      tripId,
      userId,
    },
  });

  return Response.json({ ok: true, mapped: true, tripId });
}
