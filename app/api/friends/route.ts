import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

function isOnline(lastSeen: Date | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

const USER_SELECT = { id: true, name: true, email: true, image: true, username: true, lastSeen: true };

// GET /api/friends — list accepted friends + pending incoming/outgoing
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [sent, received] = await Promise.all([
    prisma.friendship.findMany({ where: { userId },   include: { friend: { select: USER_SELECT } } }),
    prisma.friendship.findMany({ where: { friendId: userId }, include: { user: { select: USER_SELECT } } }),
  ]);

  const friends = [
    ...sent
      .filter(f => f.status === "accepted")
      .map(f => ({ ...f.friend, online: isOnline(f.friend.lastSeen), friendshipId: f.id })),
    ...received
      .filter(f => f.status === "accepted")
      .map(f => ({ ...f.user,   online: isOnline(f.user.lastSeen),   friendshipId: f.id })),
  ];

  const pendingIncoming = received
    .filter(f => f.status === "pending")
    .map(f => ({ ...f.user, friendshipId: f.id }));

  const pendingOutgoing = sent
    .filter(f => f.status === "pending")
    .map(f => ({ ...f.friend, friendshipId: f.id }));

  return Response.json({ friends, pendingIncoming, pendingOutgoing });
}

// POST /api/friends — send a friend request by username OR email
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { query } = await req.json(); // accepts @username, username, or email
  if (!query) return Response.json({ error: "username or email required" }, { status: 400 });

  const cleaned = query.trim().toLowerCase().replace(/^@/, "");

  // Try username first, then email
  const target = await prisma.user.findFirst({
    where: { OR: [{ username: cleaned }, { email: cleaned }] },
  });

  if (!target) return Response.json({ error: "No user found with that username or email" }, { status: 404 });
  if (target.id === userId) return Response.json({ error: "Cannot add yourself" }, { status: 400 });

  const existing = await prisma.friendship.findFirst({
    where: { OR: [{ userId, friendId: target.id }, { userId: target.id, friendId: userId }] },
  });
  if (existing) return Response.json({ error: "Request already exists" }, { status: 409 });

  const friendship = await prisma.friendship.create({
    data: { userId, friendId: target.id, status: "pending" },
  });
  return Response.json({ friendship });
}
