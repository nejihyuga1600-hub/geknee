import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe/customer';

// DELETE /api/payments/payment-methods/[id]
// Detach a saved card. We check ownership by confirming the PaymentMethod
// belongs to this user's Stripe Customer — Stripe doesn't enforce this
// itself (the secret key can detach any PaymentMethod), so we have to.
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });
  if (!user.stripeCustomerId) return Response.json({ error: 'No customer' }, { status: 404 });

  const pm = await stripe.paymentMethods.retrieve(id);
  if (pm.customer !== user.stripeCustomerId) {
    return Response.json({ error: 'Not your card' }, { status: 403 });
  }

  await stripe.paymentMethods.detach(id);
  return Response.json({ ok: true });
}
