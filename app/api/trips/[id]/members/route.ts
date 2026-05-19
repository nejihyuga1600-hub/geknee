import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTripAccess, isTripOwner } from "@/lib/tripAccess";

// GET /api/trips/[id]/members — list members of a trip. Any member can see the list.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getTripAccess(tripId, userId);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.tripMember.findMany({
    where: { tripId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true, username: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ members });
}

// POST /api/trips/[id]/members — owner-only, invite by email OR username.
// Body: { email?: string, username?: string }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await isTripOwner(tripId, userId))) {
    return NextResponse.json({ error: "Only the trip owner can invite" }, { status: 403 });
  }

  let body: { email?: string; username?: string };
  try {
    body = (await req.json()) as { email?: string; username?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const username = (body.username ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!email && !username) {
    return NextResponse.json({ error: "Provide email or username" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: email ? { email } : { username },
    select: { id: true, name: true, email: true, image: true, username: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (target.id === userId) {
    return NextResponse.json({ error: "You are already on this trip" }, { status: 400 });
  }

  const member = await prisma.tripMember.upsert({
    where: { tripId_userId: { tripId, userId: target.id } },
    update: {},
    create: { tripId, userId: target.id, role: "member" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, image: true, username: true } },
    },
  });

  await prisma.notification
    .create({
      data: {
        userId: target.id,
        type: "trip_invite",
        title: "Added to a trip",
        body: `${session?.user?.name ?? "Someone"} added you to a trip`,
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ member });
}

// DELETE /api/trips/[id]/members — remove a member. Owner can remove anyone (not themselves).
// Members can remove themselves (leave). Body: { userId: string }
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { userId?: string };
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targetUserId = (body.userId ?? "").trim();
  if (!targetUserId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 400 });
  }

  const isSelf = targetUserId === userId;
  const isOwner = await isTripOwner(tripId, userId);
  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.tripMember.delete({
    where: { tripId_userId: { tripId, userId: targetUserId } },
  });

  return NextResponse.json({ ok: true });
}
