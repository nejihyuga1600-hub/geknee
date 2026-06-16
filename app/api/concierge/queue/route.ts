import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin/auth';
import { prisma } from '@/lib/prisma';

// GET /api/concierge/queue — admin-only. Lists pending booking requests,
// oldest-first (so the concierge works FIFO). Joins user email + name so
// the admin can identify who they're booking for without a separate
// lookup. ?status= overrides default 'pending' (use ?status=booked to
// audit recent completions).
export async function GET(req: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'pending';

  const rows = await prisma.bookingRequest.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: {
      user: { select: { id: true, email: true, name: true, stripeCustomerId: true } },
    },
  });

  return Response.json({ requests: rows });
}
