#!/usr/bin/env node
// Live cross-check for what booking prices we show vs public aggregators.
//
// Runs three probes:
//   1. flights  — Duffel round-trip for a chosen route/dates/cabin
//   2. stays    — Hotelbeds availability for a city + check-in/out
//   3. activities — Hotelbeds Activities API for the same city
//
// For each probe we print our live prices AND generate the equivalent
// search URLs on Skyscanner, Google Flights, Booking.com, Google Hotels,
// Viator, GetYourGuide — one-click opens so you can eyeball the delta.
//
// Env required: DUFFEL_API_KEY, HOTELBEDS_HOTEL_API_KEY + _SECRET,
//   HOTELBEDS_ACTIVITIES_API_KEY + _SECRET, HOTELBEDS_ENV=test|live.
// All read from .env.local (loaded manually — no dotenv dep needed).
//
// Usage examples:
//   node bin/verify-pricing.mjs                                  # PHX-KEF, 60→65d out
//   node bin/verify-pricing.mjs LAX LHR 2026-11-01 2026-11-08
//   node bin/verify-pricing.mjs --origin JFK --dest NRT --depart 2026-10-15 --return 2026-10-25
//
// Positional args order: origin destination departDate returnDate
// Missing origin/destination default to PHX/KEF; missing dates default
// to today + 60 days and today + 65 days.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ENV = {};
try {
  const raw = fs.readFileSync(path.join(process.env.HOME || '.', 'geknee/.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* not a fatal — we'll just skip probes without creds */ }

const args = process.argv.slice(2);
function argVal(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const positional = args.filter(a => !a.startsWith('--')).filter((_, i, arr) => {
  // filter out values immediately after --flag
  return true;
});
const positionalOnly = args.filter((v, i, a) => !v.startsWith('--') && !(i > 0 && a[i - 1]?.startsWith('--')));

const daysOut = (n) => {
  const d = new Date(Date.now() + n * 86400 * 1000);
  return d.toISOString().slice(0, 10);
};

const ORIGIN  = (argVal('origin')  ?? positionalOnly[0] ?? 'PHX').toUpperCase();
const DEST    = (argVal('dest')    ?? positionalOnly[1] ?? 'KEF').toUpperCase();
const DEPART  = argVal('depart')   ?? positionalOnly[2] ?? daysOut(60);
const RETURN  = argVal('return')   ?? positionalOnly[3] ?? daysOut(65);
const CITY    = argVal('city')     ?? 'Reykjavik';
const CABIN   = argVal('cabin')    ?? 'economy';

// ── shared helpers ─────────────────────────────────────────────────────────
const line = (c = '─') => c.repeat(72);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim  = (s) => `\x1b[2m${s}\x1b[0m`;

// ── 1. FLIGHTS via Duffel ──────────────────────────────────────────────────
async function probeFlights() {
  console.log('\n' + bold(`✈  FLIGHTS  ${ORIGIN} → ${DEST}  ${DEPART} → ${RETURN}  (${CABIN}, 1 adult)`));
  console.log(line());
  if (!ENV.DUFFEL_API_KEY) {
    console.log(dim('  (DUFFEL_API_KEY not set — skipping our-price probe)'));
  } else {
    try {
      const res = await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ENV.DUFFEL_API_KEY}`,
          'Duffel-Version': 'v2',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            slices: [
              { origin: ORIGIN, destination: DEST, departure_date: DEPART },
              { origin: DEST, destination: ORIGIN, departure_date: RETURN },
            ],
            passengers: [{ type: 'adult' }],
            cabin_class: CABIN,
            return_offers: true,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok || body.errors) {
        console.log('  Duffel error:', body.errors ?? res.status);
      } else {
        const offers = body.data?.offers ?? [];
        const sorted = [...offers].sort((a, b) => Number(a.total_amount) - Number(b.total_amount));
        console.log(dim(`  Duffel returned ${offers.length} offers`));
        console.log('  Our top-5 cheapest (what the app shows):');
        for (const o of sorted.slice(0, 5)) {
          const carrier = o.owner?.iata_code ?? '??';
          const stopsOut = (o.slices?.[0]?.segments?.length ?? 1) - 1;
          const stopsRet = (o.slices?.[1]?.segments?.length ?? 1) - 1;
          console.log(`    ${carrier}  ${o.total_currency}${Number(o.total_amount).toFixed(2)}  out:${stopsOut}stops  ret:${stopsRet}stops`);
        }
      }
    } catch (e) {
      console.log('  Duffel fetch failed:', e.message);
    }
  }
  const ymd = (d) => d.replaceAll('-', '');
  const skDate = (d) => d.slice(2).replaceAll('-', '');
  console.log('\n  Compare in browser (open + eyeball cheapest):');
  console.log(`    Skyscanner:     https://www.skyscanner.com/transport/flights/${ORIGIN.toLowerCase()}/${DEST.toLowerCase()}/${skDate(DEPART)}/${skDate(RETURN)}/?adults=1&cabinclass=${CABIN}`);
  console.log(`    Google Flights: https://www.google.com/travel/flights?q=Flights+to+${DEST}+from+${ORIGIN}+on+${DEPART}+returning+${RETURN}`);
  console.log(`    Kayak:          https://www.kayak.com/flights/${ORIGIN}-${DEST}/${DEPART}/${RETURN}`);
  console.log(`    Aviasales:      https://www.aviasales.com/search/${ORIGIN}${skDate(DEPART).slice(0,4)}${DEST}${skDate(RETURN).slice(0,4)}1`);
}

// ── 2. STAYS via Hotelbeds ─────────────────────────────────────────────────
async function probeStays() {
  console.log('\n' + bold(`⌂  STAYS  ${CITY}  ${DEPART} → ${RETURN}  (2 adults, 1 room)`));
  console.log(line());
  const HB_KEY = ENV.HOTELBEDS_HOTEL_API_KEY;
  const HB_SEC = ENV.HOTELBEDS_HOTEL_SECRET;
  const HB_ENV = ENV.HOTELBEDS_ENV ?? 'test';
  if (!HB_KEY || !HB_SEC) {
    console.log(dim('  (HOTELBEDS_HOTEL_API_KEY / _SECRET not set — skipping our-price probe)'));
  } else {
    const base = HB_ENV === 'live'
      ? 'https://api.hotelbeds.com/hotel-api/1.0'
      : 'https://api.test.hotelbeds.com/hotel-api/1.0';
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHash('sha256').update(HB_KEY + HB_SEC + ts).digest('hex');
    try {
      // Hotelbeds needs destination code, not free-form city. For the
      // common case (Reykjavik) the demo API lets you post with
      // destination.name + geolocation as a filter. For a repeatable
      // probe we use the country=IS+city name pattern via their v1
      // availability endpoint with a lat/lng box.
      const cityCoords = {
        Reykjavik: { lat: 64.1466, lng: -21.9426, radius: 20 },
        Tokyo:     { lat: 35.6762, lng: 139.6503, radius: 30 },
        London:    { lat: 51.5074, lng: -0.1278,  radius: 25 },
        Paris:     { lat: 48.8566, lng: 2.3522,   radius: 25 },
        Rome:      { lat: 41.9028, lng: 12.4964,  radius: 25 },
      };
      const geo = cityCoords[CITY] ?? { lat: 64.1466, lng: -21.9426, radius: 20 };
      const body = {
        stay: { checkIn: DEPART, checkOut: RETURN },
        occupancies: [{ rooms: 1, adults: 2, children: 0 }],
        geolocation: { latitude: geo.lat, longitude: geo.lng, radius: geo.radius, unit: 'km' },
      };
      const res = await fetch(`${base}/hotels`, {
        method: 'POST',
        headers: {
          'Api-Key': HB_KEY,
          'X-Signature': sig,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || j.error) {
        console.log('  Hotelbeds error:', j.error ?? res.status);
      } else {
        const hotels = j.hotels?.hotels ?? [];
        const sorted = [...hotels].sort((a, b) => (a.minRate ?? 99999) - (b.minRate ?? 99999));
        console.log(dim(`  Hotelbeds returned ${hotels.length} properties`));
        console.log('  Our top-5 cheapest:');
        for (const h of sorted.slice(0, 5)) {
          console.log(`    ${(h.name || 'Unnamed').padEnd(48)} ${h.currency || ''}${h.minRate ?? '?'}  ${h.categoryName ?? ''}`);
        }
      }
    } catch (e) {
      console.log('  Hotelbeds fetch failed:', e.message);
    }
  }
  console.log('\n  Compare in browser:');
  console.log(`    Booking.com:  https://www.booking.com/searchresults.html?ss=${encodeURIComponent(CITY)}&checkin=${DEPART}&checkout=${RETURN}&group_adults=2&no_rooms=1`);
  console.log(`    Google Hotels: https://www.google.com/travel/hotels?q=${encodeURIComponent(CITY)}&checkin=${DEPART}&checkout=${RETURN}&adults=2`);
  console.log(`    Hotels.com:   https://www.hotels.com/Hotel-Search?destination=${encodeURIComponent(CITY)}&startDate=${DEPART}&endDate=${RETURN}&rooms=1&adults=2`);
}

// ── 3. ACTIVITIES via Hotelbeds ────────────────────────────────────────────
async function probeActivities() {
  console.log('\n' + bold(`◉  ACTIVITIES  ${CITY}  ${DEPART}`));
  console.log(line());
  const A_KEY = ENV.HOTELBEDS_ACTIVITIES_API_KEY;
  const A_SEC = ENV.HOTELBEDS_ACTIVITIES_SECRET;
  const HB_ENV = ENV.HOTELBEDS_ENV ?? 'test';
  if (!A_KEY || !A_SEC) {
    console.log(dim('  (HOTELBEDS_ACTIVITIES_API_KEY / _SECRET not set — skipping our-price probe)'));
  } else {
    const base = HB_ENV === 'live'
      ? 'https://api.hotelbeds.com/activity-api/3.0'
      : 'https://api.test.hotelbeds.com/activity-api/3.0';
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHash('sha256').update(A_KEY + A_SEC + ts).digest('hex');
    try {
      // Hotelbeds Activities expects a 3-letter destination CODE
      // (not city name). Ship a tiny lookup for the popular ones; on
      // unknown cities we bail with a hint so the user knows to add
      // the code rather than seeing a raw "max: 3" error.
      const CITY_CODE = {
        Reykjavik: 'RVK', Tokyo: 'TYO', London: 'LON', Paris: 'PAR',
        Rome: 'ROM', 'New York': 'NYC', 'Los Angeles': 'LAX',
        Barcelona: 'BCN', Amsterdam: 'AMS', Berlin: 'BER',
      };
      const dest = CITY_CODE[CITY];
      if (!dest) {
        console.log(`  (skip: no Hotelbeds destination code known for "${CITY}" — add it to CITY_CODE map)`);
        return;
      }
      const res = await fetch(`${base}/activities`, {
        method: 'POST',
        headers: {
          'Api-Key': A_KEY,
          'X-Signature': sig,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: [{ searchFilterItems: [{ type: 'destination', value: dest }] }],
          from: DEPART, to: RETURN,
          language: 'en',
          pagination: { itemsPerPage: 10, page: 1 },
        }),
      });
      const j = await res.json();
      if (!res.ok || j.errors) {
        console.log('  Hotelbeds error:', j.errors ?? res.status);
      } else {
        const acts = j.activities ?? [];
        console.log(dim(`  Hotelbeds returned ${acts.length} activities`));
        console.log('  Our sample (first 5):');
        for (const a of acts.slice(0, 5)) {
          const amt = a.amountsFrom?.[0]?.amount ?? a.minPrice ?? '?';
          const cur = a.amountsFrom?.[0]?.currency ?? '';
          console.log(`    ${(a.name || 'Unnamed').padEnd(48)} ${cur}${amt}`);
        }
      }
    } catch (e) {
      console.log('  Hotelbeds Activities fetch failed:', e.message);
    }
  }
  console.log('\n  Compare in browser:');
  console.log(`    Viator:       https://www.viator.com/searchResults/all?text=${encodeURIComponent(CITY)}&startDate=${DEPART}&endDate=${RETURN}`);
  console.log(`    GetYourGuide: https://www.getyourguide.com/s/?q=${encodeURIComponent(CITY)}&date_from=${DEPART}&date_to=${RETURN}`);
  console.log(`    Klook:        https://www.klook.com/search/?query=${encodeURIComponent(CITY)}`);
  console.log(`    TripAdvisor:  https://www.tripadvisor.com/Attractions-g-Activities-a_offset.0-${encodeURIComponent(CITY)}.html`);
}

console.log(bold('geknee pricing verify probe'));
console.log(dim(`route: ${ORIGIN}↔${DEST}  city: ${CITY}  dates: ${DEPART} → ${RETURN}`));

await probeFlights();
await probeStays();
await probeActivities();

console.log('\n' + line('═'));
console.log(bold('Interpretation:'));
console.log('  • Duffel prices are pulled from GDS + airline NDC — they should match');
console.log('    airline-direct fares within ~$5. If Skyscanner shows a fare $30+');
console.log('    lower, it\'s usually an OTA channel (Priceline, Chase Travel) that');
console.log('    Duffel doesn\'t index.');
console.log('  • Hotelbeds is a wholesaler — prices are usually competitive with or');
console.log('    LOWER than Booking.com public rates. If we\'re systematically higher,');
console.log('    check HOTELBEDS_ENV (test vs live returns different inventory).');
console.log('  • Hotelbeds Activities is the same wholesaler; Viator/GYG are the retail.');
console.log('    Expect our prices to be at or under retail; retail sees higher volume');
console.log('    inventory + last-minute deals we won\'t.');
