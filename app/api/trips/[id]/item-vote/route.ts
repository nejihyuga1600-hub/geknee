// Per-item voting on a trip. Used by BookView (booking cards) and
// SummaryView (itinerary stops). Same endpoint, distinguished by `kind`
// and `itemKey` from the client.
//
// POST   /api/trips/[id]/item-vote        — create or change a vote, also
//                                           drops a concise message into
//                                           the trip group chat.
// DELETE /api/trips/[id]/item-vote        — remove the caller's vote on
//                                           the given itemKey (no chat ping).
// GET    /api/trips/[id]/item-vote        — return tallies + the caller's
//                                           current vote per itemKey.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTripAccess } from "@/lib/tripAccess";

interface VoteBody {
  itemKey?: string;
  direction?: 1 | -1;
  kind?: 'booking' | 'stop';
  day?: number | null;
  label?: string;
}

function authorName(session: { user?: { name?: string | null; email?: string | null; username?: string | null } } | null): string {
  const u = session?.user ?? {};
  return u.name ?? u.username ?? (u.email ? u.email.split('@')[0] : 'Someone');
}

function buildPing(name: string, direction: 1 | -1, kind: 'booking' | 'stop', day: number | null | undefined, label: string): string {
  // Concise format per user choice in the scope question:
  //   "👍 Alice voted up on Day 3: Eiffel Tower"
  // For bookings the prefix becomes 'Booking' instead of 'Day N'.
  const thumb = direction === 1 ? '👍' : '👎';
  const verb  = direction === 1 ? 'voted up on'  : 'voted down on';
  const prefix = kind === 'stop' && typeof day === 'number'
    ? `Day ${day}`
    : 'Booking';
  return `${thumb} ${name} ${verb} ${prefix}: ${label}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.tripItemVote.findMany({
    where: { tripId },
    select: { itemKey: true, userId: true, direction: true },
  });
  // Tally by itemKey: { up, down, mine }
  const tallies: Record<string, { up: number; down: number; mine: number }> = {};
  for (const r of rows) {
    const t = tallies[r.itemKey] ?? (tallies[r.itemKey] = { up: 0, down: 0, mine: 0 });
    if (r.direction === 1) t.up += 1; else t.down += 1;
    if (r.userId === userId) t.mine = r.direction;
  }
  return NextResponse.json({ tallies });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: VoteBody;
  try { body = (await req.json()) as VoteBody; }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const itemKey   = (body.itemKey ?? '').trim();
  const direction = body.direction;
  const kind      = body.kind;
  const day       = typeof body.day === 'number' ? body.day : null;
  const label     = (body.label ?? '').trim().slice(0, 120);
  if (!itemKey) return NextResponse.json({ error: 'itemKey required' }, { status: 400 });
  if (direction !== 1 && direction !== -1) {
    return NextResponse.json({ error: 'direction must be 1 or -1' }, { status: 400 });
  }
  if (kind !== 'booking' && kind !== 'stop') {
    return NextResponse.json({ error: "kind must be 'booking' or 'stop'" }, { status: 400 });
  }
  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 });

  // Toggle behavior: voting the same direction twice removes the vote.
  // Voting the opposite direction switches it.
  const existing = await prisma.tripItemVote.findUnique({
    where: { tripId_userId_itemKey: { tripId, userId, itemKey } },
  });
  let pingMessage: string | null = null;
  if (existing && existing.direction === direction) {
    await prisma.tripItemVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.tripItemVote.upsert({
      where: { tripId_userId_itemKey: { tripId, userId, itemKey } },
      update: { direction, kind, day, label },
      create: { tripId, userId, itemKey, direction, kind, day, label },
    });
    pingMessage = buildPing(authorName(session), direction, kind, day, label);
  }

  // Auto-post to the trip chat so the rest of the group sees the vote
  // without polling a separate endpoint. Best-effort — chat-write failure
  // shouldn't 500 the vote.
  if (pingMessage) {
    try {
      await prisma.tripMessage.create({
        data: {
          tripId,
          authorId: userId,
          author: authorName(session),
          content: pingMessage,
        },
      });
    } catch (e) {
      console.warn('[item-vote] chat ping failed:', (e as Error).message);
    }
  }

  // Return fresh tally so the UI can update without a follow-up GET.
  const fresh = await prisma.tripItemVote.findMany({
    where: { tripId, itemKey },
    select: { userId: true, direction: true },
  });
  let up = 0, down = 0, mine: 0 | 1 | -1 = 0;
  for (const v of fresh) {
    if (v.direction === 1) up += 1; else down += 1;
    if (v.userId === userId) mine = v.direction as 1 | -1;
  }
  return NextResponse.json({ tally: { up, down, mine }, pinged: !!pingMessage });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await getTripAccess(tripId, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const itemKey = (url.searchParams.get('itemKey') ?? '').trim();
  if (!itemKey) return NextResponse.json({ error: 'itemKey required' }, { status: 400 });

  await prisma.tripItemVote.deleteMany({
    where: { tripId, userId, itemKey },
  });
  return NextResponse.json({ ok: true });
}
