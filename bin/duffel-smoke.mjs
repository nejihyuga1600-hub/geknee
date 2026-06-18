// Direct call to Duffel API using the live key to confirm it returns offers.
// This bypasses our route's auth — testing the API integration itself.
import { Duffel } from '@duffel/api';

const token = process.env.DUFFEL_API_KEY;
if (!token) {
  console.error('DUFFEL_API_KEY not set');
  process.exit(1);
}

const duffel = new Duffel({ token });

console.log('── Testing JFK → NRT, 3 months out, economy');
const start = Date.now();
try {
  const req = await duffel.offerRequests.create({
    slices: [
      { origin: 'JFK', destination: 'NRT', departure_date: '2026-09-15' },
      { origin: 'NRT', destination: 'JFK', departure_date: '2026-09-22' },
    ],
    passengers: [{ type: 'adult' }],
    cabin_class: 'economy',
    return_offers: true,
  });
  const offers = req.data.offers ?? [];
  const elapsed = Date.now() - start;
  console.log(`✓ ${offers.length} offers in ${elapsed}ms`);
  if (offers.length > 0) {
    const o = offers[0];
    console.log(`  cheapest: ${o.owner.name} ${o.total_currency} ${o.total_amount}, ${o.slices[0].segments.length} segments`);
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  if (err.errors) {
    for (const e of err.errors) console.error(`  - ${e.title}: ${e.message}`);
  }
}
