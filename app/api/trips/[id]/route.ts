import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTripAccess } from "@/lib/tripAccess";

async function getTripIfMember(id: string, userId: string) {
  const access = await getTripAccess(id, userId);
  if (!access) return null;
  const trip = await prisma.tripDraft.findUnique({ where: { id } });
  if (!trip) return null;
  return { trip, role: access.role };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTripIfMember(id, userId);
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ trip: access.trip });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const access = await getTripIfMember(id, userId);
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });
  const { trip, role } = access;

  const isOwner = role === "owner";

  const suggestionVoteModeValue: 'advisory' | 'auto_majority' | undefined =
    isOwner &&
    typeof body.suggestionVoteMode === 'string' &&
    (body.suggestionVoteMode === 'advisory' || body.suggestionVoteMode === 'auto_majority')
      ? body.suggestionVoteMode
      : undefined;

  const updated = await prisma.tripDraft.update({
    where: { id },
    data: {
      title:     isOwner && body.title !== undefined ? body.title : trip.title,
      notes:     body.notes     !== undefined ? body.notes     : trip.notes,
      itinerary: body.itinerary !== undefined ? body.itinerary : trip.itinerary,
      itineraryUpdatedAt: body.itinerary !== undefined ? new Date() : trip.itineraryUpdatedAt,
      // Owner-only: persist resolved IANA timezone (set once at destination-lock)
      ...(isOwner && typeof body.timezone === 'string' ? { timezone: body.timezone } : {}),
      ...(suggestionVoteModeValue !== undefined ? { suggestionVoteMode: suggestionVoteModeValue } : {}),
    },
  });
  return Response.json({ trip: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTripIfMember(id, userId);
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });
  if (access.role !== "owner") {
    return Response.json({ error: "Only the owner can delete a trip" }, { status: 403 });
  }

  await prisma.tripDraft.delete({ where: { id } });
  return Response.json({ ok: true });
}
