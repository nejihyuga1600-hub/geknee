// Spotify-Wrapped-style yearly recap of the user's monument collection.
//
// Server entry: pulls the signed-in user's CollectedMonument rows in
// chronological order, joins them with monument metadata (lat/lon, name,
// country) from the skins/info registries, and hands the timeline to
// WrappedClient for the paged cinematic.

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { MONUMENT_LATLON } from '@/app/plan/location/globe/skins';
import { INFO } from '@/app/plan/location/globe/info';
import { getRarity } from '@/app/plan/location/globe/quests';
import { currentIssueYear } from '@/lib/issue-year';
import { WrappedClient } from './WrappedClient';

export const dynamic = 'force-dynamic';

interface WrappedTimelineEntry {
  mk: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  skin: string;
  rarity: string;
  collectedAt: string; // ISO string
}

function extractCountry(location: string): string {
  // INFO.location is "City, Country" — naive split
  const parts = location.split(',').map((s) => s.trim());
  return parts[parts.length - 1] || location;
}

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    redirect('/?signin=1&redirect=/wrapped');
  }

  const yearParam = (await searchParams).year;
  // Default to the *active issue year*, which is the prior calendar year
  // during Jan 1–14 (extension window before the Jan 15 rollover).
  const year = yearParam ? Number(yearParam) : currentIssueYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  // Only the FIRST default-skin row per monument counts as a "collected"
  // event in the timeline. Skin claims after that are bonus.
  const rows = await prisma.collectedMonument.findMany({
    where: {
      userId,
      skin: 'default',
      collectedAt: { gte: start, lt: end },
    },
    orderBy: { collectedAt: 'asc' },
  });

  const timeline: WrappedTimelineEntry[] = rows
    .map((row) => {
      const meta = INFO[row.monumentId as keyof typeof INFO];
      const coords = MONUMENT_LATLON[row.monumentId];
      if (!meta || !coords) return null;
      return {
        mk: row.monumentId,
        name: meta.name,
        location: meta.location,
        lat: coords.lat,
        lon: coords.lon,
        skin: row.skin,
        rarity: String(getRarity(row.monumentId) ?? 'common'),
        collectedAt: row.collectedAt.toISOString(),
      };
    })
    .filter((x): x is WrappedTimelineEntry => x !== null);

  // Aggregate stats for the cards. Country counts give us "top country",
  // rarity counts give us the rarest skin highlight, total = monuments.
  const countryCounts = new Map<string, number>();
  let rarestEntry: WrappedTimelineEntry | null = null;
  const rarityOrder = ['common', 'rare', 'epic', 'legendary'];
  for (const entry of timeline) {
    const country = extractCountry(entry.location);
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    if (!rarestEntry || rarityOrder.indexOf(entry.rarity) > rarityOrder.indexOf(rarestEntry.rarity)) {
      rarestEntry = entry;
    }
  }
  const topCountry = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  return (
    <WrappedClient
      year={year}
      userName={session?.user?.name ?? 'Wanderer'}
      timeline={timeline}
      stats={{
        total: timeline.length,
        countryCount: countryCounts.size,
        topCountry: topCountry ? { country: topCountry[0], count: topCountry[1] } : null,
        rarest: rarestEntry,
      }}
    />
  );
}
