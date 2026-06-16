import { auth } from '@/auth';
import { stripe, getOrCreateStripeCustomer } from '@/lib/stripe/customer';

// POST /api/payments/setup-intent
// Returns { clientSecret } for the Stripe Elements card form to confirm
// off-session card-on-file. We mark usage as off_session so we can later
// charge this PaymentMethod from a concierge approval flow (BookingRequest
// → complete) without re-prompting the user. Stripe handles SCA / 3DS at
// setup time so the future off-session charge succeeds without friction.
export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const customerId = await getOrCreateStripeCustomer(userId);
  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: { userId, purpose: 'card_on_file' },
  });

  return Response.json({
    clientSecret: setupIntent.client_secret,
    customerId,
  });
}
