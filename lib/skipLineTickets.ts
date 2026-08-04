// Skip-the-line ticket deep-links for the live-now page. When the next
// stop matches a curated landmark we surface a one-tap Buy button.
//
// URLs point to GetYourGuide + Viator + Tiqets — all Travelpayouts-eligible
// where possible so the affiliate marker (716767) can be layered on later.
// Not paying yet? Fine — the value here is saving the traveler a 2-hour
// standing queue at the door, not affiliate revenue.

import { normalizeLandmarkKey } from '@/lib/landmarkGuides';

// Vendor tag drives the color chip on the button so travelers who trust
// a specific vendor can eyeball which one they're buying from.
export type SkipLineVendor = 'getyourguide' | 'viator' | 'tiqets' | 'official';

export interface SkipLineTicket {
  vendor: SkipLineVendor;
  label: string;                 // e.g. "Priority entrance + audio guide"
  url: string;
  priceUsd?: number;             // best-known starting price
  bookByHour?: number;           // 0-23; cutoff for same-day booking
  currency?: string;             // display currency at booking site
  note?: string;                 // "Skip-the-line only" | "Includes escort"
}

const SKIP_LINE: Record<string, SkipLineTicket[]> = {
  'eiffel tower': [
    {
      vendor: 'getyourguide',
      label: 'Summit access · reserved timeslot',
      url: 'https://www.getyourguide.com/paris-l16/eiffel-tower-tickets-c22326/',
      priceUsd: 76,
      bookByHour: 19,
    },
    {
      vendor: 'tiqets',
      label: '2nd floor entry — skip the line',
      url: 'https://www.tiqets.com/en/paris-attractions-c66748/tickets-for-eiffel-tower-p973986/',
      priceUsd: 42,
      bookByHour: 20,
    },
  ],
  'colosseum': [
    {
      vendor: 'getyourguide',
      label: 'Arena Floor + Underground + Forum',
      url: 'https://www.getyourguide.com/rome-l33/colosseum-tickets-c22279/',
      priceUsd: 84,
      bookByHour: 18,
      note: 'The upgrade over general admission that everyone regrets skipping.',
    },
    {
      vendor: 'tiqets',
      label: 'Skip-the-line general admission',
      url: 'https://www.tiqets.com/en/rome-attractions-c69168/tickets-for-colosseum-p974083/',
      priceUsd: 34,
      bookByHour: 19,
    },
  ],
  'sagrada familia': [
    {
      vendor: 'official',
      label: 'Basilica + tower access · official ticket',
      url: 'https://sagradafamilia.org/en/tickets',
      priceUsd: 44,
      bookByHour: 20,
      note: 'Buy from the official site — third-party markups don\'t come with tower access.',
    },
    {
      vendor: 'getyourguide',
      label: 'Fast-track w/ audio guide',
      url: 'https://www.getyourguide.com/barcelona-l45/sagrada-familia-tickets-c22364/',
      priceUsd: 52,
      bookByHour: 19,
    },
  ],
  'louvre': [
    {
      vendor: 'official',
      label: 'Timed entry (mandatory) · official',
      url: 'https://www.ticketlouvre.fr/louvre/b2c/index.cfm',
      priceUsd: 24,
      bookByHour: 20,
      note: 'Even the Louvre requires a timed slot now — walk-ups usually turned away.',
    },
    {
      vendor: 'getyourguide',
      label: 'Guided 2-hour tour of highlights',
      url: 'https://www.getyourguide.com/paris-l16/louvre-museum-tickets-c22201/',
      priceUsd: 86,
      bookByHour: 18,
    },
  ],
  'prague castle': [
    {
      vendor: 'getyourguide',
      label: '2-hour guided tour · skip the line',
      url: 'https://www.getyourguide.com/prague-l10/prague-castle-tickets-c22366/',
      priceUsd: 40,
      bookByHour: 19,
    },
    {
      vendor: 'official',
      label: 'Circuit B · self-guided (cheapest)',
      url: 'https://www.hrad.cz/en/prague-castle-for-visitors/entrance-fee-opening-hours-visit-conditions',
      priceUsd: 15,
      bookByHour: 21,
    },
  ],
  'taj mahal': [
    {
      vendor: 'getyourguide',
      label: 'Sunrise entry with private guide',
      url: 'https://www.getyourguide.com/agra-l1002/taj-mahal-tickets-c122225/',
      priceUsd: 55,
      bookByHour: 20,
      note: 'Get inside before the coach tours arrive at 8 AM.',
    },
  ],
  'machu picchu': [
    {
      vendor: 'official',
      label: 'Government entry ticket (mandatory)',
      url: 'https://www.machupicchu.gob.pe/',
      priceUsd: 45,
      bookByHour: 12,
      note: 'Book DAYS ahead — 5,940-visitor daily cap sells out.',
    },
    {
      vendor: 'viator',
      label: 'From Cusco · train + entry + guide',
      url: 'https://www.viator.com/tours/Cusco/Machu-Picchu-Full-Day-Tour-by-Train-from-Cusco/d915-6067MP',
      priceUsd: 480,
      bookByHour: 12,
    },
  ],
  'petra': [
    {
      vendor: 'official',
      label: 'Jordan Pass (Petra + visa)',
      url: 'https://www.jordanpass.jo/',
      priceUsd: 100,
      bookByHour: 20,
      note: 'Cheapest way — bundles Petra + visa + other sites.',
    },
    {
      vendor: 'getyourguide',
      label: 'Guided walk · Treasury + Monastery',
      url: 'https://www.getyourguide.com/petra-l732/petra-tours-tc10032/',
      priceUsd: 65,
      bookByHour: 20,
    },
  ],
  'burj khalifa': [
    {
      vendor: 'official',
      label: 'At The Top SKY · Level 148',
      url: 'https://tickets.atthetop.ae/',
      priceUsd: 105,
      bookByHour: 18,
      note: 'Sunset slots book out days ahead.',
    },
    {
      vendor: 'getyourguide',
      label: 'At The Top · Level 124-125',
      url: 'https://www.getyourguide.com/dubai-l173/burj-khalifa-tickets-c22335/',
      priceUsd: 48,
      bookByHour: 20,
    },
  ],
  'hagia sophia': [
    {
      vendor: 'getyourguide',
      label: 'Fast-track w/ historian guide',
      url: 'https://www.getyourguide.com/istanbul-l67/hagia-sophia-tickets-c22297/',
      priceUsd: 32,
      bookByHour: 19,
    },
  ],
  'statue of liberty': [
    {
      vendor: 'official',
      label: 'Reserve ferry · crown access',
      url: 'https://www.statuecruises.com/',
      priceUsd: 24,
      bookByHour: 12,
      note: 'Crown access sells out 3+ months ahead. Book NOW if you want it.',
    },
    {
      vendor: 'viator',
      label: 'Liberty + Ellis Island + Manhattan cruise',
      url: 'https://www.viator.com/tours/New-York-City/Statue-of-Liberty-and-Ellis-Island-Tour-Priority-Access/d687-3731P57',
      priceUsd: 89,
      bookByHour: 20,
    },
  ],
  'pyramid of giza': [
    {
      vendor: 'getyourguide',
      label: 'Pyramids + Sphinx + camel · half day',
      url: 'https://www.getyourguide.com/giza-l1173/pyramids-of-giza-tickets-c68829/',
      priceUsd: 55,
      bookByHour: 20,
    },
  ],
  'grand canyon': [
    {
      vendor: 'getyourguide',
      label: 'South Rim helicopter tour',
      url: 'https://www.getyourguide.com/grand-canyon-national-park-l32651/',
      priceUsd: 279,
      bookByHour: 12,
    },
  ],
  'great wall china': [
    {
      vendor: 'viator',
      label: 'Mutianyu Great Wall · full day',
      url: 'https://www.viator.com/tours/Beijing/Mutianyu-Great-Wall-Bus-Tour/d321-42395P26',
      priceUsd: 95,
      bookByHour: 20,
    },
  ],
  'angkor wat': [
    {
      vendor: 'official',
      label: '1/3/7-day Angkor pass · official counter',
      url: 'https://www.angkorenterprise.gov.kh/',
      priceUsd: 37,
      bookByHour: 18,
      note: 'Only sold at the official ticket counter in Siem Reap. Bring passport.',
    },
    {
      vendor: 'getyourguide',
      label: 'Sunrise tour w/ guide + transport',
      url: 'https://www.getyourguide.com/siem-reap-l740/angkor-wat-tours-tc3402/',
      priceUsd: 45,
      bookByHour: 21,
    },
  ],
  'stonehenge': [
    {
      vendor: 'official',
      label: 'Stone Circle Access · early morning',
      url: 'https://www.english-heritage.org.uk/visit/places/stonehenge/stone-circle-access-visits/',
      priceUsd: 72,
      bookByHour: 12,
      note: 'The £57 upgrade over general — walk among the stones.',
    },
    {
      vendor: 'getyourguide',
      label: 'From London · half-day bus',
      url: 'https://www.getyourguide.com/london-l57/stonehenge-half-day-tour-from-london-t102213/',
      priceUsd: 89,
      bookByHour: 18,
    },
  ],
};

// Uses the same fuzzy normalization as landmarkGuides so lookups agree.
export function ticketsFor(placeName: string | null | undefined): SkipLineTicket[] {
  if (!placeName) return [];
  const q = normalizeLandmarkKey(placeName);
  if (!q) return [];
  const direct = SKIP_LINE[q];
  if (direct) return direct;
  for (const [k, v] of Object.entries(SKIP_LINE)) {
    if (k.length >= 4 && (q.includes(k) || k.includes(q))) return v;
  }
  return [];
}

// True when we can still book for a visit at `arrivalHour` today. Used
// to hide the ticket card the moment it's too late to help (e.g. Louvre
// timed entry cuts off at 8 PM the night before).
export function stillBookable(ticket: SkipLineTicket, arrivalHour: number): boolean {
  if (ticket.bookByHour === undefined) return true;
  return arrivalHour <= ticket.bookByHour;
}
