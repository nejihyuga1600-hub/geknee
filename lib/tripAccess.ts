import { prisma } from "./prisma";

export type TripRole = "owner" | "member";

export interface TripAccess {
  tripId: string;
  userId: string;
  role: TripRole;
}

/**
 * Checks whether `userId` can access `tripId`. Returns the role (owner/member)
 * or null if they're not authorized. Use this in every API route that reads or
 * writes trip-scoped data (chat, suggestions, files, expenses, etc.).
 */
export async function getTripAccess(
  tripId: string,
  userId: string,
): Promise<TripAccess | null> {
  if (!tripId || !userId) return null;
  const m = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { role: true },
  });
  if (m) return { tripId, userId, role: m.role === "owner" ? "owner" : "member" };

  const t = await prisma.tripDraft.findUnique({
    where: { id: tripId },
    select: { userId: true },
  });
  if (t && t.userId === userId) {
    await prisma.tripMember.upsert({
      where: { tripId_userId: { tripId, userId } },
      update: { role: "owner" },
      create: { tripId, userId, role: "owner" },
    });
    return { tripId, userId, role: "owner" };
  }
  return null;
}

export async function isTripOwner(tripId: string, userId: string): Promise<boolean> {
  const a = await getTripAccess(tripId, userId);
  return a?.role === "owner";
}
