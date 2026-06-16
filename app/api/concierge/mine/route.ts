import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// GET /api/concierge/mine — list this user's concierge booking requests,
// newest first. Optional ?tripId= filters to a single trip. Computes a
// per-row queue position for still-pending rows so the user sees an
// honest "you're #N" instead of an opaque "pending" forever.
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const tripId = new URL(req.url).searchParams.get('tripId');
  const rows = await prisma.bookingRequest.findMany({
    where: { userId, ...(tripId ? { tripId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, kind: true, title: true, status: true,
      estimatedCents: true, finalCents: true, currency: true,
      otaProvider: true, otaConfirmation: true, failureReason: true,
      createdAt: true, bookedAt: true, tripId: true,
    },
  });

  // Single query to grab all globally-pending requests with their createdAt
  // so we can compute queue positions client-side without N round-trips.
  const allPending = await prisma.bookingRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });
  const positionById = new Map<string, number>();
  allPending.forEach((p, i) => positionById.set(p.id, i + 1));

  const bookings = rows.map((r) =>
    r.status === 'pending'
      ? { ...r, queuePosition: positionById.get(r.id) ?? null }
      : r,
  );

  return Response.json({ bookings });
}
