import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/presence — update the current user's lastSeen timestamp
export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: userId },
    data: { lastSeen: new Date() },
  });
  return Response.json({ ok: true });
}
