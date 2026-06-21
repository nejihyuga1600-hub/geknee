// DuffelBookingModal — multi-step flight booking flow.
//
// Steps:
//   1. Passenger details (one form per adult, child age if applicable)
//   2. Stripe Elements payment (PaymentIntent created server-side)
//   3. Confirmation (Duffel order issued, ticket reference shown)
//
// Opens from a Duffel offer card in FlightLiveOffers. Gated by the
// server-side DUFFEL_BOOKING_ENABLED env — the "Book now" CTA in the
// card only renders when NEXT_PUBLIC_DUFFEL_BOOKING_ENABLED is true,
// so we don't tease a feature that will fail at the order-create step.

"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { track } from "@/lib/analytics";

const STRIPE_PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
let stripePromise: Promise<StripeJs | null> | null = null;
function getStripe(): Promise<StripeJs | null> {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PK);
  return stripePromise;
}

export interface DuffelOfferForBooking {
  id: string;
  totalAmount: string;
  totalCurrency: string;
  cabin: string;
  carrierName: string;
  slices: Array<{
    origin: string;
    destination: string;
    segments: Array<{
      from: string; to: string;
      departAt: string; arriveAt: string;
      durationMin: number;
    }>;
  }>;
  // Passenger IDs that Duffel assigned at offer-request time; we need
  // these on orders.create. Fetched fresh from /quote in step 1.
  passengerIds?: string[];
}

interface PassengerForm {
  id: string; // Duffel's passenger ID from the offer
  title: "mr" | "ms" | "mrs" | "miss" | "dr";
  given_name: string;
  family_name: string;
  born_on: string;
  email: string;
  phone_number: string;
  gender: "m" | "f";
}

export function DuffelBookingModal({
  offer,
  tripId,
  onClose,
}: {
  offer: DuffelOfferForBooking;
  tripId?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"passengers" | "payment" | "confirmation">("passengers");
  const [passengers, setPassengers] = useState<PassengerForm[]>([]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize empty passenger forms based on Duffel's passenger IDs.
  useEffect(() => {
    if (passengers.length > 0) return;
    const ids = offer.passengerIds ?? ["pas_0"];
    setPassengers(
      ids.map((id) => ({
        id,
        title: "mr",
        given_name: "",
        family_name: "",
        born_on: "",
        email: "",
        phone_number: "",
        gender: "m",
      })),
    );
  }, [offer.passengerIds, passengers.length]);

  // Step 1 → Step 2: validate passengers + create payment intent.
  async function continueToPayment() {
    setError(null);
    for (const p of passengers) {
      if (!p.given_name || !p.family_name || !p.born_on || !p.email || !p.phone_number) {
        setError("Please fill out every passenger field.");
        return;
      }
    }
    setCreating(true);
    try {
      const resp = await fetch("/api/duffel/order/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.id, tripId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Could not start payment.");
        setCreating(false);
        return;
      }
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setStep("payment");
      track("book_intent", { kind: "flight", step: "payment", offerId: offer.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  // Step 2 → Step 3 handler (called by the embedded PaymentForm).
  async function onPaymentSucceeded() {
    if (!paymentIntentId) return;
    setCreating(true);
    setError(null);
    try {
      const resp = await fetch("/api/duffel/order/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offer.id,
          paymentIntentId,
          passengers: passengers.map((p) => ({ ...p, type: "adult" })),
          tripId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error ?? "Order could not be issued. We'll process a refund.");
        setCreating(false);
        return;
      }
      setBookingRef(data.bookingReference);
      setStep("confirmation");
      track("book_intent", { kind: "flight", step: "complete", offerId: offer.id, bookingRef: data.bookingReference });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(10,10,31,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--brand-bg)", color: "var(--brand-ink)",
          borderRadius: 16, padding: 24, maxWidth: 560, width: "100%",
          maxHeight: "90vh", overflowY: "auto",
          border: "1px solid var(--brand-border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Book this flight</h2>
            <div style={{ fontSize: 12, color: "var(--brand-ink-dim)", marginTop: 4 }}>
              {offer.carrierName} · {offer.slices.map((s) => `${s.origin}→${s.destination}`).join(" / ")}
              <br />
              {offer.totalCurrency} {Math.round(parseFloat(offer.totalAmount))} · {offer.cabin.replace("_", " ")}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--brand-ink-dim)",
            fontSize: 20, cursor: "pointer", padding: 0,
          }}>×</button>
        </div>

        {step === "passengers" && (
          <PassengerStep
            passengers={passengers}
            onChange={setPassengers}
            onContinue={continueToPayment}
            creating={creating}
            error={error}
          />
        )}

        {step === "payment" && clientSecret && STRIPE_PK && (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            <PaymentStep
              onSuccess={onPaymentSucceeded}
              creating={creating}
              error={error}
            />
          </Elements>
        )}
        {step === "payment" && !STRIPE_PK && (
          <div style={{ padding: 16, color: "#fca5a5" }}>
            Stripe is not configured (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing).
          </div>
        )}

        {step === "confirmation" && bookingRef && (
          <ConfirmationStep bookingRef={bookingRef} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function PassengerStep({ passengers, onChange, onContinue, creating, error }: {
  passengers: PassengerForm[];
  onChange: (p: PassengerForm[]) => void;
  onContinue: () => void;
  creating: boolean;
  error: string | null;
}) {
  function updatePax(i: number, patch: Partial<PassengerForm>) {
    onChange(passengers.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  return (
    <div>
      {passengers.map((p, i) => (
        <fieldset key={p.id} style={{
          border: "1px solid var(--brand-border)", borderRadius: 8,
          padding: 12, marginBottom: 12,
        }}>
          <legend style={{ padding: "0 6px", fontSize: 12 }}>Passenger {i + 1}</legend>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 8 }}>
            <select value={p.title} onChange={(e) => updatePax(i, { title: e.target.value as PassengerForm["title"] })} style={inputStyle}>
              <option value="mr">Mr</option>
              <option value="ms">Ms</option>
              <option value="mrs">Mrs</option>
              <option value="miss">Miss</option>
              <option value="dr">Dr</option>
            </select>
            <input placeholder="First name" value={p.given_name} onChange={(e) => updatePax(i, { given_name: e.target.value })} style={inputStyle} />
            <input placeholder="Last name" value={p.family_name} onChange={(e) => updatePax(i, { family_name: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <input type="date" placeholder="Date of birth" value={p.born_on} onChange={(e) => updatePax(i, { born_on: e.target.value })} style={inputStyle} />
            <select value={p.gender} onChange={(e) => updatePax(i, { gender: e.target.value as "m" | "f" })} style={inputStyle}>
              <option value="m">Male</option>
              <option value="f">Female</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <input type="email" placeholder="Email" value={p.email} onChange={(e) => updatePax(i, { email: e.target.value })} style={inputStyle} />
            <input placeholder="Phone (+1...)" value={p.phone_number} onChange={(e) => updatePax(i, { phone_number: e.target.value })} style={inputStyle} />
          </div>
        </fieldset>
      ))}
      {error && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <button onClick={onContinue} disabled={creating} style={ctaStyle}>
        {creating ? "Preparing payment..." : "Continue to payment →"}
      </button>
    </div>
  );
}

function PaymentStep({ onSuccess, creating, error }: {
  onSuccess: () => void;
  creating: boolean;
  error: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setStripeErr(null);
    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      // We handle the redirect-back step ourselves via onSuccess.
      redirect: "if_required",
      confirmParams: { return_url: typeof window !== "undefined" ? window.location.href : "" },
    });
    if (confirmErr) {
      setStripeErr(confirmErr.message ?? "Payment failed.");
      setPaying(false);
      return;
    }
    setPaying(false);
    onSuccess();
  }

  return (
    <div>
      <PaymentElement />
      {(error || stripeErr) && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 8 }}>{error ?? stripeErr}</div>}
      <button onClick={pay} disabled={paying || creating || !stripe || !elements} style={{ ...ctaStyle, marginTop: 12 }}>
        {paying || creating ? "Processing..." : "Pay & book"}
      </button>
    </div>
  );
}

function ConfirmationStep({ bookingRef, onClose }: { bookingRef: string; onClose: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎫</div>
      <h3 style={{ margin: 0 }}>Booking confirmed</h3>
      <p style={{ fontSize: 13, color: "var(--brand-ink-dim)", marginTop: 8 }}>
        Reference: <strong>{bookingRef}</strong>
      </p>
      <p style={{ fontSize: 12, color: "var(--brand-ink-dim)" }}>
        We've emailed your e-ticket. Check your inbox in the next few minutes.
      </p>
      <button onClick={onClose} style={{ ...ctaStyle, marginTop: 16 }}>Done</button>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--brand-border)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--brand-ink)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
};

const ctaStyle = {
  padding: "12px 18px",
  borderRadius: 999,
  background: "var(--brand-accent)",
  color: "var(--brand-bg)",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  width: "100%",
};
