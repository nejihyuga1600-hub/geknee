import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }

  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Maps key not configured' }, { status: 503 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${key}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return NextResponse.json({ error: `timezone ${res.status}` }, { status: 502 });
    }
    const data = await res.json() as {
      status: string;
      timeZoneId?: string;
      rawOffset?: number;
      dstOffset?: number;
    };
    if (data.status !== 'OK' || !data.timeZoneId) {
      return NextResponse.json(null);
    }
    return NextResponse.json(
      {
        ianaId: data.timeZoneId,
        utcOffsetSec: data.rawOffset ?? 0,
        dstOffsetSec: data.dstOffset ?? 0,
      },
      { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      { error: isTimeout ? 'timezone timeout' : 'timezone failed' },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
