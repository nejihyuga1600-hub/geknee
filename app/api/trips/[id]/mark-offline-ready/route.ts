// POST /api/trips/[id]/mark-offline-ready
//
// Called by the client after the SW tile cache has been populated for a
// trip's city (or — once Phase 1 native lands — after the native offline
// region download completes). Flips TripDraft.offlineMapPrefetched true
// so the UI can suppress the "Download offline" CTA on subsequent visits.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const trip = await prisma.tripDraft.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
  if (trip.userId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 });

  await prisma.tripDraft.update({
    where: { id },
    data: { offlineMapPrefetched: true },
  });

  return Response.json({ ok: true });
}
