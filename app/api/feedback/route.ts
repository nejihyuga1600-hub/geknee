import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const MAX_LEN = 5000;

export async function POST(req: Request) {
  let body: { message?: string; page?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const message = (body.message ?? '').trim().slice(0, MAX_LEN);
  if (!message) return Response.json({ error: 'Message required' }, { status: 400 });

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const email  = (session?.user as { email?: string })?.email ?? null;
  const page   = typeof body.page === 'string' ? body.page.slice(0, 200) : null;

  const fb = await prisma.feedback.create({
    data: { userId, email, message, page },
  });

  return Response.json({ ok: true, id: fb.id });
}
