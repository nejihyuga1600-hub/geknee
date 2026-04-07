import Stripe from 'stripe';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { priceId } = await req.json() as { priceId: string };
  if (!priceId) return Response.json({ error: 'priceId required' }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, stripeCustomerId: true },
  });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customerId },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.geknee.com';
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?upgrade=success`,
    cancel_url: `${appUrl}/?upgrade=cancelled`,
    subscription_data: { metadata: { userId } },
  });

  return Response.json({ url: checkoutSession.url });
}
