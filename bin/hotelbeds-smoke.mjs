import { createHash } from 'node:crypto';

const ENV = process.env.HOTELBEDS_ENV ?? 'test';
const BASE = ENV === 'live' ? 'https://api.hotelbeds.com' : 'https://api.test.hotelbeds.com';

function sign(apiKey, secret) {
  const ts = Math.floor(Date.now() / 1000);
  return createHash('sha256').update(apiKey + secret + ts).digest('hex');
}

async function hb(product, path, init = {}) {
  const apiKey = process.env[`HOTELBEDS_${product.toUpperCase()}_API_KEY`];
  const secret = process.env[`HOTELBEDS_${product.toUpperCase()}_SECRET`];
  if (!apiKey || !secret) throw new Error(`${product} creds missing`);
  const signature = sign(apiKey, secret);
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Api-key': apiKey,
      'X-Signature': signature,
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: resp.status, body };
}

console.log(`── env: ${ENV} → ${BASE}\n`);

// 1. Hotels availability
console.log('1. POST /hotel-api/1.0/hotels (PAR, 90d out)');
const today = new Date();
const ci = new Date(today.getTime() + 90*86400e3).toISOString().slice(0, 10);
const co = new Date(today.getTime() + 92*86400e3).toISOString().slice(0, 10);
const r1 = await hb('hotel', '/hotel-api/1.0/hotels', {
  method: 'POST',
  body: JSON.stringify({
    stay: { checkIn: ci, checkOut: co },
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
    destination: { code: 'PAR' },
  }),
});
console.log(`   HTTP ${r1.status}`);
if (r1.status === 200 && r1.body.hotels?.hotels?.length) {
  const h = r1.body.hotels.hotels[0];
  console.log(`   ✓ ${r1.body.hotels.total} hotels, top: ${h.name} ${h.currency} ${h.minRate}`);
  const rate = h.rooms?.[0]?.rates?.[0];
  if (rate) {
    console.log(`     rateType=${rate.rateType} rateCommentsId=${rate.rateCommentsId ?? 'none'}`);
    // 2. CheckRate if needed
    if (rate.rateType === 'RECHECK') {
      console.log('\n2. POST /hotel-api/1.0/checkrates');
      const r2 = await hb('hotel', '/hotel-api/1.0/checkrates', {
        method: 'POST',
        body: JSON.stringify({ rooms: [{ rateKey: rate.rateKey }] }),
      });
      console.log(`   HTTP ${r2.status}`);
      if (r2.status === 200) console.log('   ✓ CheckRate confirmed');
    } else {
      console.log('   (rate is BOOKABLE, skipping CheckRate)');
    }
  }
} else {
  console.log(`   ✗ ${JSON.stringify(r1.body).slice(0, 200)}`);
}

// 3. Activities
console.log('\n3. POST /activity-api/3.0/activities/availability (PAR)');
const r3 = await hb('activities', '/activity-api/3.0/activities/availability', {
  method: 'POST',
  body: JSON.stringify({
    filters: [{ searchFilterItems: [{ type: 'destination', value: 'PAR' }] }],
    from: ci, to: co,
    paxes: [{ age: 30 }],
    language: 'en',
  }),
});
console.log(`   HTTP ${r3.status}`);
if (r3.status === 200) console.log(`   ✓ ${r3.body.activities?.length ?? 0} activities`);
else console.log(`   ✗ ${JSON.stringify(r3.body).slice(0, 200)}`);

// 4. Transfers
console.log('\n4. GET /transfer-api/1.0/availability (CDG → PAR)');
const r4 = await hb('transfers', `/transfer-api/1.0/availability/en/from/IATA/CDG/to/ATLAS/PAR/${ci}T10:00:00?adults=2`);
console.log(`   HTTP ${r4.status}`);
if (r4.status === 200) console.log(`   ✓ ${r4.body.services?.length ?? 0} transfers`);
else console.log(`   ✗ ${JSON.stringify(r4.body).slice(0, 200)}`);
