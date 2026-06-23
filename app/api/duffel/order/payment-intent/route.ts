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
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
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
    paymentMethodId?: string; // pm_xxx — when provided, charges off_session immediately
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

    // Always attach to a Stripe customer — supports both "save card" + "use saved card"
    // patterns without code-fork in the modal.
    const customerId = await getOrCreateStripeCustomer(session.user.id);

    const metadata = {
      kind: "duffel_flight",
      offerId: body.offerId,
      tripId: body.tripId ?? "",
      userId: session.user.id,
      duffelAmount: offer.totalAmount,
      duffelCurrency: offer.totalCurrency,
    };
    const description = `Flight: ${offer.slices.map((s) => `${s.origin}→${s.destination}`).join(" / ")}`;

    // Saved-card path — charge off_session immediately. Returns either
    // succeeded (no 3DS needed) or requires_action (front-end handles 3DS).
    if (body.paymentMethodId) {
      const pi = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: offer.totalCurrency.toLowerCase(),
        customer: customerId,
        payment_method: body.paymentMethodId,
        off_session: true,
        confirm: true,
        metadata,
        description,
      });
      return Response.json({
        paymentIntentId: pi.id,
        status: pi.status,
        clientSecret: pi.client_secret,
        amount: amountCents,
        currency: offer.totalCurrency,
        duffelAmount: offer.totalAmount,
      });
    }

    // New-card path — create a PI the client confirms via Stripe Elements.
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: offer.totalCurrency.toLowerCase(),
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      setup_future_usage: "off_session", // saves the card for next booking
      metadata,
      description,
    });

    return Response.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      status: pi.status,
      amount: amountCents,
      currency: offer.totalCurrency,
      duffelAmount: offer.totalAmount,
    });
  } catch (err: unknown) {
    // Stripe.errors.StripeCardError when off_session card fails — surface
    // the decline reason to the user, e.g. "Your card was declined" or
    // "Your card has insufficient funds".
    if (err && typeof err === "object" && "type" in err && (err as { type: string }).type === "StripeCardError") {
      const stripeErr = err as unknown as { message: string; code?: string; decline_code?: string };
      return Response.json(
        { error: stripeErr.message, code: stripeErr.code, declineCode: stripeErr.decline_code },
        { status: 402 },
      );
    }
    const msg = err instanceof Error ? err.message : "payment intent failed";
    console.error("[duffel/order/payment-intent]", msg);
    return Response.json({ error: msg }, { status: 502 });
  }
}
