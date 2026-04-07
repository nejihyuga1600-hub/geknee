import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// GET — fetch notifications for current user (most recent 30)
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const unreadCount = notifications.filter(n => !n.read).length;
  return Response.json({ notifications, unreadCount });
}

// PATCH — mark all as read (or specific id via body)
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };

  if (id) {
    await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  } else {
    await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  }

  return Response.json({ ok: true });
}
