import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isDevAccount } from '@/lib/plan';
import { put } from '@vercel/blob';

// Quest-photo upload. Mission completions arrive with photoUrl as a base64
// data URL (small previews captured client-side). We persist them to Blob so:
//   1. The DB row stays small (URL string instead of multi-MB base64)
//   2. The share-card OG route can render the proof photo via a Blob URL
//      without exploding the share URL past Twitter/Discord caps
// Returns null on any failure — the mission still completes, just without
// a hosted photo. The DB column keeps the original base64 in that case so
// no proof is lost.
async function persistQuestPhoto(
  userId: string,
  missionId: string,
  base64DataUrl: string,
): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const m = base64DataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return null;
  const [, contentType, b64] = m;
  const ext = contentType.split('/')[1].replace('+xml', '').slice(0, 4);
  const bytes = Buffer.from(b64, 'base64');
  try {
    const uploaded = await put(
      `quests/${userId}/${missionId}_${Date.now()}.${ext}`,
      bytes,
      {
        access: 'public',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      },
    );
    return uploaded.url;
  } catch {
    return null;
  }
}

// Haversine distance in km between two lat/lon points
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Monument city coordinates for geolocation verification
const MONUMENT_COORDS: Record<string, { lat: number; lon: number; radiusKm: number }> = {
  eiffelTower:    { lat: 48.86, lon: 2.29,    radiusKm: 50 },
  colosseum:      { lat: 41.89, lon: 12.49,   radiusKm: 50 },
  tajMahal:       { lat: 27.17, lon: 78.04,   radiusKm: 50 },
  greatWall:      { lat: 40.43, lon: 116.57,  radiusKm: 80 },
  statueLiberty:  { lat: 40.69, lon: -74.04,  radiusKm: 50 },
  sagradaFamilia: { lat: 41.40, lon: 2.17,    radiusKm: 50 },
  machuPicchu:    { lat: -13.16, lon: -72.54, radiusKm: 50 },
  christRedeem:   { lat: -22.95, lon: -43.21, radiusKm: 50 },
  angkorWat:      { lat: 13.41, lon: 103.87,  radiusKm: 50 },
  pyramidGiza:    { lat: 29.98, lon: 31.13,   radiusKm: 50 },
  goldenGate:     { lat: 37.82, lon: -122.48, radiusKm: 50 },
  bigBen:         { lat: 51.50, lon: -0.12,   radiusKm: 50 },
  acropolis:      { lat: 37.97, lon: 23.73,   radiusKm: 50 },
  sydneyOpera:    { lat: -33.86, lon: 151.21, radiusKm: 50 },
  neuschwanstein: { lat: 47.56, lon: 10.75,   radiusKm: 80 },
  stonehenge:     { lat: 51.18, lon: -1.83,   radiusKm: 80 },
  iguazuFalls:    { lat: -25.69, lon: -54.44, radiusKm: 80 },
  tokyoSkytree:   { lat: 35.71, lon: 139.81,  radiusKm: 50 },
  victoriaFalls:  { lat: -17.92, lon: 25.86,  radiusKm: 80 },
  machuPicchu2:   { lat: 36.06, lon: -112.11, radiusKm: 80 },
};

// GET — returns user's collected monuments + completed missions + active skins
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [collected, missions, trips, isDev] = await Promise.all([
      // Order by collectedAt so the client can render chronological journey
      // arcs on the main globe without re-querying.
      prisma.collectedMonument.findMany({
        where: { userId },
        orderBy: { collectedAt: 'asc' },
      }),
      prisma.completedMission.findMany({ where: { userId } }),
      prisma.tripDraft.findMany({ where: { userId }, select: { location: true } }),
      isDevAccount(userId),
    ]);

    // Build active skins map: monumentId → skin id
    const activeSkins: Record<string, string> = {};
    for (const c of collected) {
      if (c.active && c.skin !== 'default') {
        activeSkins[c.monumentId] = c.skin;
      }
    }

    return Response.json({
      collected,
      missions,
      tripLocations: trips.map(t => t.location.toLowerCase()),
      isDev,
      activeSkins,
    });
  } catch (err) {
    console.error('GET /api/monuments error:', err);
    return Response.json({ error: 'Internal error', detail: String(err) }, { status: 500 });
  }
}

// POST — unlock a monument, complete a mission, or set active skin
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const isDev = await isDevAccount(userId);

  const body = await req.json() as {
    action: 'unlock' | 'mission' | 'set_skin';
    monumentId: string;
    missionId?: string;
    skin?: string;
    lat?: number;
    lon?: number;
    photoUrl?: string;
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
    const hasMonument = await prisma.collectedMonument.findUnique({
      where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: 'default' } },
    });
    if (!hasMonument) return Response.json({ error: 'Collect the monument first' }, { status: 400 });

    const alreadyDone = await prisma.completedMission.findUnique({
      where: { userId_missionId: { userId, missionId: body.missionId } },
    });
    if (alreadyDone) return Response.json({ error: 'Mission already completed' }, { status: 400 });

    // Geolocation verification — user must be near the monument's city
    if (!isDev) {
      if (typeof body.lat !== 'number' || typeof body.lon !== 'number') {
        return Response.json({ error: 'Location required — enable location services to complete missions' }, { status: 400 });
      }
      const coords = MONUMENT_COORDS[body.monumentId];
      if (coords) {
        const dist = haversineKm(body.lat, body.lon, coords.lat, coords.lon);
        if (dist > coords.radiusKm) {
          return Response.json({
            error: `You must be within ${coords.radiusKm}km of this monument to complete missions (you are ${Math.round(dist)}km away)`,
          }, { status: 400 });
        }
      }
    }

    // Upload base64 photo to Blob → store the URL on the row instead of a
    // multi-MB inline payload. Falls back to base64 if Blob is unavailable
    // so the column is never empty when a photo was provided.
    const persistedPhotoUrl = body.photoUrl?.startsWith('data:image/')
      ? (await persistQuestPhoto(userId, body.missionId, body.photoUrl)) ?? body.photoUrl
      : body.photoUrl;

    const [mission] = await Promise.all([
      prisma.completedMission.create({
        data: { userId, monumentId: body.monumentId, missionId: body.missionId, photoUrl: persistedPhotoUrl },
      }),
      prisma.collectedMonument.upsert({
        where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: body.skin } },
        create: { userId, monumentId: body.monumentId, skin: body.skin, active: true },
        update: {},
      }),
    ]);

    // Deactivate other skins for this monument, activate the new one
    await prisma.$transaction([
      prisma.collectedMonument.updateMany({
        where: { userId, monumentId: body.monumentId, skin: { not: body.skin } },
        data: { active: false },
      }),
      prisma.collectedMonument.update({
        where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: body.skin } },
        data: { active: true },
      }),
    ]);

    return Response.json({ mission });
  }

  // Set active skin for a monument
  if (body.action === 'set_skin' && body.skin) {
    const hasSkin = await prisma.collectedMonument.findUnique({
      where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: body.skin } },
    });
    if (!hasSkin) return Response.json({ error: 'You have not earned this skin' }, { status: 400 });

    await prisma.$transaction([
      prisma.collectedMonument.updateMany({
        where: { userId, monumentId: body.monumentId },
        data: { active: false },
      }),
      prisma.collectedMonument.update({
        where: { userId_monumentId_skin: { userId, monumentId: body.monumentId, skin: body.skin } },
        data: { active: true },
      }),
    ]);

    return Response.json({ success: true, activeSkin: body.skin });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
