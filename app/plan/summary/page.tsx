import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import SummaryView from './SummaryView';

// Legacy /plan/summary route. With a savedTripId/tripId we route into
// the canonical tab shell, picking the right tab based on whether the
// trip already has an itinerary:
//   - has itinerary ⇒ /plan/<id>/itinerary (show day cards)
//   - empty itinerary ⇒ /plan/<id>/planning (curate pins → Generate)
// Without an id we fall through to SummaryView so the pre-trip flow
// (no DB row yet) still works.
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ savedTripId?: string; tripId?: string }>;
}) {
  const sp = await searchParams;
  const id = sp.savedTripId ?? sp.tripId;
  if (id) {
    const session = await auth();
    const userId = (session?.user as { id?: string })?.id;
    if (userId) {
      const trip = await prisma.tripDraft.findUnique({
        where: { id },
        select: { itinerary: true, userId: true, startDate: true, endDate: true },
      });
      if (trip && trip.userId === userId) {
        // ISO YYYY-MM-DD strings compare lexicographically.
        const today = new Date().toISOString().slice(0, 10);
        const onTrip = !!(trip.startDate && trip.endDate && today >= trip.startDate && today <= trip.endDate);
        // Itinerary status decides the route — same-day trips with no
        // itinerary need to generate first; jumping straight to /live
        // shortcuts the AI step and leaves the user with an empty trip.
        if (trip.itinerary) {
          redirect(onTrip ? `/trip/${id}/live` : `/plan/${id}/itinerary`);
        }
      }
    }
    redirect(`/plan/${id}/planning`);
  }
  return <SummaryView />;
}
