import { prisma } from '@/lib/prisma';
import { buildWeatherForecastNotif, buildPackingPrepNotif, buildDailyBriefingNotif } from '@/lib/notifications/content';

// Daily cron — Vercel hits this once a day. Walks every user's trips,
// emits notifications that come due today (weather/packing 14 days before
// startDate; daily briefing on every day of the trip). Idempotent via
// NotificationLog so a re-run won't double-send.
export async function GET(req: Request) {
  // Vercel signs cron requests with this header. Reject everything else
  // so the endpoint can't be hit publicly to spam users.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const trips = await prisma.tripDraft.findMany({
    where: { startDate: { not: null }, endDate: { not: null } },
    select: { id: true, userId: true, title: true, location: true, startDate: true, endDate: true, itinerary: true },
  });

  let emitted = 0;
  let skipped = 0;

  for (const trip of trips) {
    if (!trip.startDate || !trip.endDate) continue;
    const pref = await prisma.notificationPref.findUnique({ where: { userId: trip.userId } });
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    const daysUntilStart = Math.floor((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    async function fire(type: string, key: string, content: { title: string; body: string } | null) {
      if (!content) return;
      try {
        await prisma.notificationLog.create({ data: { userId: trip.userId, key } });
      } catch {
        skipped++; return; // unique constraint hit — already sent
      }
      await prisma.notification.create({
        data: { userId: trip.userId, type, title: content.title, body: content.body },
      });
      emitted++;
    }

    // 14 days before trip — weather forecast
    if (daysUntilStart === 14 && (pref?.weatherTwoWeeks ?? true)) {
      await fire('weather_forecast', `weather_forecast:${trip.id}`, await buildWeatherForecastNotif(trip));
    }
    // 14 days before trip — packing prep
    if (daysUntilStart === 14 && (pref?.packingPrep ?? true)) {
      await fire('packing_prep', `packing_prep:${trip.id}`, buildPackingPrepNotif(trip));
    }
    // Each morning of the trip — daily briefing
    if (now >= start && now <= end && (pref?.dailyBriefing ?? true)) {
      const dayNumber = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      await fire('daily_briefing', `daily_briefing:${trip.id}:${today}`, buildDailyBriefingNotif(trip, dayNumber));
    }
  }

  return Response.json({ ok: true, trips: trips.length, emitted, skipped });
}
