import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe/customer';

// GET /api/payments/payment-methods
// Lists the user's saved cards from Stripe. Returns null on the array
// when the user has no Stripe Customer yet (haven't added a card ever)
// so the client renders an empty state instead of an error.
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user.stripeCustomerId) return Response.json({ paymentMethods: [] });

  const list = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: 'card',
    limit: 20,
  });

  // Shape down to the fields the UI actually needs — never ship the raw
  // PaymentMethod object (lots of irrelevant metadata + future Stripe
  // schema changes leaking through).
  const paymentMethods = list.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? 'card',
    last4: pm.card?.last4 ?? '••••',
    expMonth: pm.card?.exp_month ?? null,
    expYear: pm.card?.exp_year ?? null,
    createdAt: pm.created,
  }));

  return Response.json({ paymentMethods });
}
