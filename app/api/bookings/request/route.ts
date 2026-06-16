import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// POST /api/bookings/request — user submits a concierge booking request.
// Body: { kind: 'hotel'|'flight'|'activity', title, payload, estimatedCents?,
//         currency?, paymentMethodId?, tripId?, otaProvider? }
// Returns: { ok, id, queuePosition } where queuePosition is the count of
// older PENDING requests + 1 (so the user sees an honest "you're #N" status
// instead of an opaque "we're working on it"). User must have at least
// authenticated; card-on-file gate (paymentMethodId required) is enforced
// here so the queue never holds requests that can't actually be paid.

const ALLOWED_KINDS = new Set(['hotel', 'flight', 'activity']);

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    kind?: string;
    title?: string;
    payload?: unknown;
    estimatedCents?: number;
    currency?: string;
    paymentMethodId?: string;
    tripId?: string;
    otaProvider?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  const kind = String(body.kind ?? '').toLowerCase();
  if (!ALLOWED_KINDS.has(kind)) {
    return Response.json({ error: 'bad_kind' }, { status: 400 });
  }
  const title = String(body.title ?? '').trim().slice(0, 200);
  if (!title) return Response.json({ error: 'title_required' }, { status: 400 });
  if (!body.payload || typeof body.payload !== 'object') {
    return Response.json({ error: 'payload_required' }, { status: 400 });
  }
  if (!body.paymentMethodId) {
    return Response.json({ error: 'payment_method_required' }, { status: 400 });
  }

  // Create the row + compute queue position in a single transaction so a
  // burst of requests doesn't all report position #1.
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.bookingRequest.create({
      data: {
        userId,
        tripId: body.tripId || null,
        kind,
        title,
        payload: body.payload as object,
        estimatedCents: Number.isFinite(body.estimatedCents) ? body.estimatedCents! : null,
        currency: (body.currency ?? 'USD').toUpperCase().slice(0, 3),
        paymentMethodId: body.paymentMethodId,
        otaProvider: body.otaProvider ?? null,
      },
      select: { id: true, createdAt: true },
    });
    const olderPending = await tx.bookingRequest.count({
      where: { status: 'pending', createdAt: { lt: created.createdAt } },
    });
    return { id: created.id, queuePosition: olderPending + 1 };
  });

  return Response.json({ ok: true, ...result });
}
