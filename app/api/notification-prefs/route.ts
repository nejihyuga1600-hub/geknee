import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const FIELDS = ['weatherTwoWeeks', 'packingPrep', 'dailyBriefing', 'tripUpdates', 'friendActivity'] as const;

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const pref = await prisma.notificationPref.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  return Response.json(pref);
}

export async function PATCH(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Partial<Record<(typeof FIELDS)[number], boolean>>;
  const data: Record<string, boolean> = {};
  for (const k of FIELDS) {
    if (typeof body[k] === 'boolean') data[k] = body[k] as boolean;
  }
  const pref = await prisma.notificationPref.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  return Response.json(pref);
}
