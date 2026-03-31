import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/friends/[id] — accept a pending friend request
export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });

  if (!friendship || friendship.friendId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.friendship.update({
    where: { id },
    data: { status: "accepted" },
  });
  return Response.json({ friendship: updated });
}

// DELETE /api/friends/[id] — remove friend or decline/cancel request
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const friendship = await prisma.friendship.findUnique({ where: { id } });

  if (!friendship || (friendship.userId !== userId && friendship.friendId !== userId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id } });
  return Response.json({ ok: true });
}
