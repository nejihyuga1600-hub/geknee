// /api/duffel/order/payment-intent — create Stripe PI for a Duffel offer.
//
// Customer payment flow:
//   1. Client calls /quote to confirm offer still valid + get amount
//   2. Client calls this route → Stripe payment intent created server-side
//   3. Client confirms payment via Stripe Elements (clientSecret)
//   4. On success → client calls /create to issue the Duffel order
//
// Markup: optional flat % defined by DUFFEL_MARKUP_PCT (default 0).
// Customer is charged total_amount * (1 + markup); Duffel is paid
// total_amount from our balance; difference is our gross profit.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { quoteOffer } from "@/lib/duffel";
import Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 30;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" })
  : null;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!stripe) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    offerId?: string;
    tripId?: string;
  } | null;
  if (!body?.offerId) {
    return Response.json({ error: "offerId required" }, { status: 400 });
  }

  try {
    // Re-quote: never trust client-supplied amount; pull fresh from Duffel.
    const offer = await quoteOffer(body.offerId);
    const baseAmount = parseFloat(offer.totalAmount);
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return Response.json({ error: "invalid offer amount" }, { status: 502 });
    }
    const markupPct = parseFloat(process.env.DUFFEL_MARKUP_PCT ?? "0");
    const customerAmount = baseAmount * (1 + (Number.isFinite(markupPct) ? markupPct : 0));
    const amountCents = Math.round(customerAmount * 100);

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: offer.totalCurrency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: "duffel_flight",
        offerId: body.offerId,
        tripId: body.tripId ?? "",
        userId: session.user.id,
        duffelAmount: offer.totalAmount,
        duffelCurrency: offer.totalCurrency,
      },
      // Customer-friendly description on Stripe dashboard + receipts.
      description: `Flight: ${offer.slices.map((s) => `${s.origin}→${s.destination}`).join(" / ")}`,
    });

    return Response.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      amount: amountCents,
      currency: offer.totalCurrency,
      duffelAmount: offer.totalAmount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "payment intent failed";
    console.error("[duffel/order/payment-intent]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
