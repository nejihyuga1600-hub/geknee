import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET — return current user's username
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  return Response.json({ username: user?.username ?? null });
}

// PUT — set or update username
export async function PUT(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { username } = await req.json();

  if (!username || typeof username !== "string") {
    return Response.json({ error: "username required" }, { status: 400 });
  }

  // Normalise: lowercase, strip spaces, allow letters/numbers/underscores/hyphens only
  const clean = username.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
  if (clean.length < 3)  return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  if (clean.length > 24) return Response.json({ error: "Username must be 24 characters or less" }, { status: 400 });

  // Check taken
  const existing = await prisma.user.findUnique({ where: { username: clean } });
  if (existing && existing.id !== userId) {
    return Response.json({ error: "Username already taken" }, { status: 409 });
  }

  const user = await prisma.user.update({ where: { id: userId }, data: { username: clean } });
  return Response.json({ username: user.username });
}
