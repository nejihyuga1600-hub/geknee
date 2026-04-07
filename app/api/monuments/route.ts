import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// GET — returns user's collected monuments + completed missions
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [collected, missions, trips] = await Promise.all([
    prisma.collectedMonument.findMany({ where: { userId } }),
    prisma.completedMission.findMany({ where: { userId } }),
    prisma.tripDraft.findMany({ where: { userId }, select: { location: true } }),
  ]);

  return Response.json({
    collected,
    missions,
    tripLocations: trips.map(t => t.location.toLowerCase()),
  });
}

// POST — unlock a monument or complete a mission
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    action: 'unlock' | 'mission';
    monumentId: string;
    missionId?: string;
    skin?: string;
  };

  if (body.action === 'unlock') {
    const existing = await prisma.collectedMonument.findUnique({
      where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: 'default' } },
    });
    if (existing) return Response.json({ error: 'Already collected' }, { status: 400 });

    const monument = await prisma.collectedMonument.create({
      data: { userId, monumentId: body.monumentId, skin: 'default' },
    });
    return Response.json({ monument });
  }

  if (body.action === 'mission' && body.missionId && body.skin) {
    // Verify monument is already collected first
    const hasMonument = await prisma.collectedMonument.findUnique({
      where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: 'default' } },
    });
    if (!hasMonument) return Response.json({ error: 'Collect the monument first' }, { status: 400 });

    const alreadyDone = await prisma.completedMission.findUnique({
      where: { userId_missionId: { userId, missionId: body.missionId } },
    });
    if (alreadyDone) return Response.json({ error: 'Mission already completed' }, { status: 400 });

    const [mission] = await Promise.all([
      prisma.completedMission.create({
        data: { userId, monumentId: body.monumentId, missionId: body.missionId },
      }),
      prisma.collectedMonument.upsert({
        where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: body.skin } },
        create: { userId, monumentId: body.monumentId, skin: body.skin },
        update: {},
      }),
    ]);
    return Response.json({ mission });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
