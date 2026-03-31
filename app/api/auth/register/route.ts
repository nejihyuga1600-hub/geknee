import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json() as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Invalid email address.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const hashed = await hash(password, 12);
    await prisma.user.create({
      data: { name: name?.trim() || null, email, password: hashed },
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
