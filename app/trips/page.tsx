import { redirect } from 'next/navigation';

// The "Trips" entry surface is a modal panel inside /plan/location, not a
// separate route. We keep this page only to stop /trips from 404'ing —
// shared/copy-pasted URLs (and external nav assumptions) bounce to the
// globe where the user can open the panel from the top nav.
export default function TripsRedirect() {
  redirect('/plan/location');
}
