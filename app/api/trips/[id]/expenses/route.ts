import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const CATEGORIES = new Set(['food', 'lodging', 'transport', 'activities', 'shopping', 'other']);

async function gate(tripId: string) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return { err: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const trip = await prisma.tripDraft.findFirst({ where: { id: tripId, userId } });
  if (!trip) return { err: Response.json({ error: 'Not found' }, { status: 404 }) };
  return { userId, trip };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ('err' in g) return g.err;
  const expenses = await prisma.tripExpense.findMany({
    where: { userId: g.userId, tripId: id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return Response.json({ expenses });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ('err' in g) return g.err;
  const body = await req.json().catch(() => ({})) as Partial<{ date: string; amount: number; category: string; note: string }>;
  if (!body.date || typeof body.amount !== 'number' || !body.category || !CATEGORIES.has(body.category)) {
    return Response.json({ error: 'Invalid expense' }, { status: 400 });
  }
  const expense = await prisma.tripExpense.create({
    data: {
      userId: g.userId,
      tripId: id,
      date: body.date,
      amount: body.amount,
      category: body.category,
      note: body.note?.slice(0, 200) || null,
    },
  });
  return Response.json(expense);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ('err' in g) return g.err;
  const url = new URL(req.url);
  const expenseId = url.searchParams.get('expenseId');
  if (!expenseId) return Response.json({ error: 'expenseId required' }, { status: 400 });
  await prisma.tripExpense.deleteMany({ where: { id: expenseId, userId: g.userId, tripId: id } });
  return Response.json({ ok: true });
}
