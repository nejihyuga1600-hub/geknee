import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkTripSaveLimit } from "@/lib/plan";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const trips = await prisma.tripDraft.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return Response.json({ trips });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, location, startDate, endDate, nights, style, notes } = body;

  if (!title || !location) {
    return Response.json({ error: "title and location are required" }, { status: 400 });
  }

  const limitError = await checkTripSaveLimit(userId);
  if (limitError) {
    return Response.json({ error: limitError, code: "TRIP_LIMIT" }, { status: 403 });
  }

  const trip = await prisma.tripDraft.create({
    data: { userId, title, location, startDate, endDate, nights, style, notes },
  });
  return Response.json({ trip });
}
