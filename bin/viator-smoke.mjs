// Direct Viator API call to confirm the key returns real products.
const token = process.env.VIATOR_API_KEY;
if (!token) { console.error('VIATOR_API_KEY not set'); process.exit(1); }

console.log('── Testing Tokyo (dest 334), 3 months out');
const start = Date.now();
const resp = await fetch('https://api.viator.com/partner/products/search', {
  method: 'POST',
  headers: {
    'exp-api-key': token,
    Accept: 'application/json;version=2.0',
    'Accept-Language': 'en-US',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    filtering: { destination: 334, startDate: '2026-09-15', endDate: '2026-09-22' },
    sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    pagination: { start: 1, count: 6 },
    currency: 'USD',
  }),
});
const elapsed = Date.now() - start;
console.log(`HTTP ${resp.status} in ${elapsed}ms`);
if (!resp.ok) {
  console.log(await resp.text());
  process.exit(1);
}
const data = await resp.json();
const products = data.products ?? [];
console.log(`✓ ${products.length} products`);
if (products[0]) {
  const p = products[0];
  console.log(`  top: ${p.title}`);
  console.log(`       ${p.reviews?.combinedAverageRating?.toFixed(1)}★ (${p.reviews?.totalReviews} reviews), from $${p.pricing?.summary?.fromPrice}`);
}
