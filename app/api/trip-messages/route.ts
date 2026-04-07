// Simple file-based friends chat for a trip.
// Messages stored at data/trip-chats/<tripId>.json
// tripId = caller-supplied hash of the trip params.

import { promises as fs } from 'fs';
import path from 'path';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const DATA_DIR = path.join(process.cwd(), 'data', 'trip-chats');

interface TripMessage {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

async function readMessages(tripId: string): Promise<TripMessage[]> {
  const file = path.join(DATA_DIR, `${tripId}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as TripMessage[];
  } catch {
    return [];
  }
}

async function writeMessages(tripId: string, messages: TripMessage[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${tripId}.json`);
  await fs.writeFile(file, JSON.stringify(messages, null, 2), 'utf-8');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get('tripId') ?? '';
  if (!tripId) return Response.json({ messages: [] });
  const messages = await readMessages(tripId);
  return Response.json({ messages });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get('tripId') ?? '';
  if (!tripId) return Response.json({ ok: false }, { status: 400 });

  const body = await req.json() as { author?: string; content?: string; location?: string };
  const content  = (body.content  ?? '').trim();
  const author   = (body.author   ?? 'Friend').trim() || 'Friend';
  const location = (body.location ?? 'your trip').trim();
  if (!content) return Response.json({ ok: false }, { status: 400 });

  const messages = await readMessages(tripId);
  const msg: TripMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    author,
    content,
    timestamp: Date.now(),
  };
  messages.push(msg);
  const trimmed = messages.slice(-200);
  await writeMessages(tripId, trimmed);

  // Notify friends of the sender
  try {
    const session = await auth();
    const senderId = (session?.user as { id?: string })?.id;
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

  return Response.json({ ok: true, message: msg });
}
