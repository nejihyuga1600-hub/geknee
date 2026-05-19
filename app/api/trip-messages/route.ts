// Trip group chat — persisted in Postgres via Prisma (TripMessage model).
// Replaces the prior data/trip-chats/<tripId>.json disk store, which didn't
// survive serverless cold starts or scale-out.

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const MAX_PER_TRIP = 200;
const MAX_CONTENT_LEN = 4000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get('tripId') ?? '';
  if (!tripId) return Response.json({ messages: [] });

  const rows = await prisma.tripMessage.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_TRIP,
  });

  const messages = rows.map(m => ({
    id: m.id,
    author: m.author,
    content: m.content,
    timestamp: m.createdAt.getTime(),
  }));

  return Response.json({ messages });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get('tripId') ?? '';
  if (!tripId) return Response.json({ ok: false }, { status: 400 });

  const body = await req.json() as { author?: string; content?: string; location?: string };
  const content  = (body.content  ?? '').trim().slice(0, MAX_CONTENT_LEN);
  const author   = ((body.author  ?? 'Friend').trim() || 'Friend').slice(0, 80);
  const location = (body.location ?? 'your trip').trim().slice(0, 120);
  if (!content) return Response.json({ ok: false }, { status: 400 });

  const session = await auth();
  const senderId = (session?.user as { id?: string })?.id ?? null;

  const msg = await prisma.tripMessage.create({
    data: { tripId, authorId: senderId, author, content },
  });

  // Cap room size: trim oldest if we just crossed the per-trip limit.
  const overflow = await prisma.tripMessage.count({ where: { tripId } });
  if (overflow > MAX_PER_TRIP) {
    const oldest = await prisma.tripMessage.findMany({
      where: { tripId },
      orderBy: { createdAt: 'asc' },
      take: overflow - MAX_PER_TRIP,
      select: { id: true },
    });
    if (oldest.length) {
      await prisma.tripMessage.deleteMany({ where: { id: { in: oldest.map(o => o.id) } } });
    }
  }

  // Notify friends of the sender (best-effort).
  try {
    if (senderId) {
      const friendships = await prisma.friendship.findMany({
        where: { status: 'accepted', OR: [{ userId: senderId }, { friendId: senderId }] },
        select: { userId: true, friendId: true },
      });
      const friendIds = friendships.map(f => f.userId === senderId ? f.friendId : f.userId);
      if (friendIds.length > 0) {
        await prisma.notification.createMany({
          data: friendIds.map(fId => ({
            userId: fId,
            type: 'friend_message',
            title: `${author} sent a message`,
            body: `In ${location} trip chat: "${content.slice(0, 80)}${content.length > 80 ? '…' : ''}"`,
          })),
        });
      }
    }
  } catch { /* non-critical */ }

  return Response.json({
    ok: true,
    message: {
      id: msg.id,
      author: msg.author,
      content: msg.content,
      timestamp: msg.createdAt.getTime(),
    },
  });
}
