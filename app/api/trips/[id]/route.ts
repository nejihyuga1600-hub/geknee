import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getVerifiedTrip(id: string, userId: string) {
  const trip = await prisma.tripDraft.findUnique({ where: { id } });
  if (!trip || trip.userId !== userId) return null;
  return trip;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const trip = await getVerifiedTrip(id, userId);
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ trip });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const trip = await getVerifiedTrip(id, userId);
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.tripDraft.update({
    where: { id },
    data: {
      notes:     body.notes     !== undefined ? body.notes     : trip.notes,
      itinerary: body.itinerary !== undefined ? body.itinerary : trip.itinerary,
      itineraryUpdatedAt: body.itinerary !== undefined ? new Date() : trip.itineraryUpdatedAt,
    },
  });
  return Response.json({ trip: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const trip = await getVerifiedTrip(id, userId);
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.tripDraft.delete({ where: { id } });
  return Response.json({ ok: true });
}
