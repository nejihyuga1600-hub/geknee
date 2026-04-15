import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');
  if (!sig) return new Response('No signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;
        const userId = (session as unknown as { subscription_data?: { metadata?: { userId?: string } } }).subscription_data?.metadata?.userId
          ?? session.metadata?.userId;
        if (!userId) {
          console.warn('checkout.session.completed: missing userId in metadata', { sessionId: session.id });
          return new Response('Missing userId in metadata', { status: 400 });
        }
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        await prisma.user.update({
          where: { id: userId },
          data: { plan: 'pro', stripeSubscriptionId: sub.id, planExpiresAt: null },
        });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) {
          console.warn('customer.subscription.updated: missing userId in metadata', { subId: sub.id });
          return new Response('Missing userId in metadata', { status: 400 });
        }
        const active = sub.status === 'active' || sub.status === 'trialing';
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: active ? 'pro' : 'free',
            planExpiresAt: active ? null : periodEnd ? new Date(periodEnd * 1000) : null,
          },
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) {
          console.warn('customer.subscription.deleted: missing userId in metadata', { subId: sub.id });
          return new Response('Missing userId in metadata', { status: 400 });
        }
        const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: 'free',
            stripeSubscriptionId: null,
            planExpiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
          },
        });
        break;
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
