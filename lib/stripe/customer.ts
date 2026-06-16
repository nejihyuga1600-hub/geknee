import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

// Resolve a user's Stripe Customer id, creating one on first call. Mirrors
// the inline pattern from app/api/stripe/checkout/route.ts so subscription
// + setup-intent flows share the same Customer per user. Stripe metadata
// keeps the userId so the dashboard + webhooks can match a Customer back.
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, stripeCustomerId: true, name: true },
  });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}
