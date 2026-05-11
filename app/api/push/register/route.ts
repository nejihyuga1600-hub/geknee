import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// POST /api/push/register
// Body: { token: string, platform: 'ios' | 'android' }
// Stores the device token so the daily cron can target this device.
// Idempotent: same token from same user is a no-op; same token under a
// new user (user reinstalled / signed in as someone else on the same
// device) is rebound to the new user. APNs/FCM tokens are device-scoped,
// not account-scoped, so the latest writer wins.
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null) as { token?: unknown; platform?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = body?.platform === 'ios' || body?.platform === 'android' ? body.platform : null;
  if (!token || !platform) {
    return Response.json({ error: 'token and platform are required' }, { status: 400 });
  }

  const row = await prisma.pushToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  });

  return Response.json({ ok: true, id: row.id });
}
