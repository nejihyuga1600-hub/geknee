// /api/duffel/order/create — finalize a Duffel order after Stripe payment.
//
// Server-side flow:
//   1. Verify the payment intent succeeded
//   2. Re-quote the offer one more time (price-changed defense)
//   3. Call duffel.orders.create with passengers + balance payment
//   4. Persist to Booking model
//   5. Send confirmation email (fire-and-forget)
//
// Gated behind DUFFEL_BOOKING_ENABLED=true — without that flag,
// lib/duffel.ts::createOrder throws before hitting Duffel.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { createOrder, quoteOffer, type DuffelPassenger } from "@/lib/duffel";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 90;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

interface CreateRequest {
  offerId: string;
  paymentIntentId: string;
  passengers: DuffelPassenger[];
  tripId?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!stripe) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as CreateRequest | null;
  if (!body?.offerId || !body?.paymentIntentId || !Array.isArray(body?.passengers) || body.passengers.length === 0) {
    return Response.json(
      { error: "offerId, paymentIntentId, passengers[] required" },
      { status: 400 },
    );
  }

  // Step 1: confirm Stripe payment succeeded.
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(body.paymentIntentId);
  } catch {
    return Response.json({ error: "payment intent not found" }, { status: 400 });
  }
  if (paymentIntent.status !== "succeeded") {
    return Response.json(
      { error: `payment intent status is ${paymentIntent.status}, not succeeded` },
      { status: 400 },
    );
  }
  if (paymentIntent.metadata?.userId !== session.user.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (paymentIntent.metadata?.offerId !== body.offerId) {
    return Response.json(
      { error: "payment intent offerId mismatch" },
      { status: 400 },
    );
  }

  // Step 2: re-quote one more time before issuing the order.
  let offer;
  try {
    offer = await quoteOffer(body.offerId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "quote failed";
    // If offer expired AFTER customer paid, we're in a refund situation.
    // Capture this as a separate state for ops to handle.
    if (msg.toLowerCase().includes("expired")) {
      console.error("[duffel/order/create] offer EXPIRED after payment — refund needed", {
        paymentIntentId: body.paymentIntentId,
        userId: session.user.id,
      });
      return Response.json(
        {
          error: "offer expired after payment — your payment will be refunded within 5 business days",
          needsRefund: true,
        },
        { status: 410 },
      );
    }
    return Response.json({ error: msg }, { status: 502 });
  }

  // Step 3: create the Duffel order. createOrder throws if the feature
  // flag is off — useful safety belt against accidental prod use.
  let order;
  try {
    order = await createOrder({
      offerId: body.offerId,
      passengers: body.passengers,
      amount: offer.totalAmount,
      currency: offer.totalCurrency,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "order create failed";
    console.error("[duffel/order/create] order failed AFTER payment — refund needed", {
      msg,
      paymentIntentId: body.paymentIntentId,
    });
    return Response.json(
      {
        error: `${msg}. Your payment will be refunded within 5 business days.`,
        needsRefund: true,
      },
      { status: 502 },
    );
  }

  // Step 4: persist to Booking model.
  await prisma.booking.upsert({
    where: {
      partner_providerOrderId: { partner: "duffel", providerOrderId: order.id },
    },
    update: {
      status: "confirmed",
      rawPayload: order as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
    create: {
      tripId: body.tripId ?? null,
      userId: session.user.id,
      partner: "duffel",
      partnerProgram: "Duffel Flights",
      providerOrderId: order.id,
      itemKind: "flight",
      itemName: `${offer.slices[0].origin} → ${offer.slices[0].destination}`,
      amount: new Prisma.Decimal(offer.totalAmount),
      currency: offer.totalCurrency,
      status: "confirmed",
      rawPayload: order as unknown as Prisma.InputJsonValue,
      conversionAt: new Date(),
    },
  });

  return Response.json({ order, bookingReference: order.booking_reference });
}
