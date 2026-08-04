// Weekly markets + local festivals for the live-now page's "Today"
// card. Keyed by lowercased city name (accents stripped). Kept small and
// hand-curated so each entry earns its place — no scraped junk.
//
// Two shapes of "happening":
//   • dayOfWeek 0-6 (Sun-Sat) → recurring weekly
//   • dateRange MM-DD → annual festival window
// A single card can include several kinds; renderer filters by today.

export type HappeningKind =
  | 'market'      // farmers/produce
  | 'flea'        // antique + vintage
  | 'food'        // street-food night
  | 'festival'    // annual event
  | 'music'       // concerts / opera series
  | 'nightlife';  // regular late-night ritual

export interface LocalHappening {
  name: string;
  kind: HappeningKind;
  when: {
    dayOfWeek?: number; // 0=Sun … 6=Sat
    dateRange?: { start: string; end: string }; // "MM-DD"
  };
  hours: string;
  place: string;
  lat?: number;
  lng?: number;
  note?: string;
}

// Normalize city name → lookup key. Strips diacritics, lowercases, trims.
// "Praha" and "prague" are separate keys — add both if a city has aliases.
function keyFor(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const CITY_HAPPENINGS: Record<string, LocalHappening[]> = {
  prague: [
    {
      name: 'Havelské tržiště (Havel\'s Market)',
      kind: 'market',
      when: {},
      hours: '9 AM – 6 PM daily',
      place: 'Havelská, Old Town',
      lat: 50.0855, lng: 14.4231,
      note: 'Fruit + souvenir stalls in the heart of Old Town.',
    },
    {
      name: 'Náplavka Farmers Market',
      kind: 'market',
      when: { dayOfWeek: 6 }, // Saturday
      hours: '8 AM – 2 PM',
      place: 'Rašínovo nábřeží (Vltava riverside)',
      lat: 50.0708, lng: 14.4148,
      note: 'Cheese, sourdough, mulled wine — locals only.',
    },
    {
      name: 'Signal Festival (light art)',
      kind: 'festival',
      when: { dateRange: { start: '10-10', end: '10-13' } },
      hours: '7 PM – midnight',
      place: 'Old Town + Malá Strana',
      note: 'Buildings become projection canvases; free.',
    },
    {
      name: 'Christmas Market · Old Town Square',
      kind: 'festival',
      when: { dateRange: { start: '11-30', end: '01-06' } },
      hours: '10 AM – 10 PM',
      place: 'Staroměstské náměstí',
      lat: 50.0875, lng: 14.4213,
      note: 'Trdelník, svařák, wooden toys.',
    },
  ],
  paris: [
    {
      name: 'Marché Bastille',
      kind: 'market',
      when: { dayOfWeek: 4 }, // Thursday
      hours: '7 AM – 2:30 PM',
      place: 'Blvd Richard Lenoir, 11e',
      lat: 48.8567, lng: 2.3705,
      note: 'Biggest open-air market in Paris; oysters at Stand Denis.',
    },
    {
      name: 'Marché Bastille (Sunday)',
      kind: 'market',
      when: { dayOfWeek: 0 },
      hours: '7 AM – 3 PM',
      place: 'Blvd Richard Lenoir, 11e',
      lat: 48.8567, lng: 2.3705,
    },
    {
      name: 'Marché aux Puces de Saint-Ouen',
      kind: 'flea',
      when: { dayOfWeek: 6 },
      hours: '9 AM – 6 PM',
      place: 'Porte de Clignancourt',
      lat: 48.9033, lng: 2.3411,
      note: '2,000 vintage stalls — arrive by 10 AM for pickings.',
    },
    {
      name: 'Nuit Blanche (all-night art)',
      kind: 'festival',
      when: { dateRange: { start: '10-04', end: '10-05' } },
      hours: '7 PM – 7 AM',
      place: 'City-wide installations',
      note: 'Free; museums + venues open all night.',
    },
    {
      name: 'Fête de la Musique',
      kind: 'festival',
      when: { dateRange: { start: '06-21', end: '06-21' } },
      hours: 'All day + night',
      place: 'Every street corner',
      note: 'Free concerts everywhere; the loudest night of the year.',
    },
  ],
  rome: [
    {
      name: 'Campo de\' Fiori Market',
      kind: 'market',
      when: {},
      hours: '7 AM – 2 PM (Mon-Sat)',
      place: 'Piazza Campo de\' Fiori',
      lat: 41.8955, lng: 12.4722,
      note: 'Flowers + produce; tourist prices but atmospheric.',
    },
    {
      name: 'Porta Portese Flea Market',
      kind: 'flea',
      when: { dayOfWeek: 0 }, // Sunday
      hours: '6 AM – 2 PM',
      place: 'Via Portuense, Trastevere',
      lat: 41.8802, lng: 12.4728,
      note: 'Everything from records to gilded mirrors; haggle.',
    },
    {
      name: 'Estate Romana (summer festival)',
      kind: 'festival',
      when: { dateRange: { start: '06-15', end: '09-15' } },
      hours: 'Evenings',
      place: 'Riverbanks + villas + squares',
      note: 'Open-air cinema, jazz, opera. Free-to-cheap.',
    },
    {
      name: 'Testaccio Nightlife',
      kind: 'nightlife',
      when: { dayOfWeek: 5 }, // Fri
      hours: '10 PM – 3 AM',
      place: 'Rione Testaccio',
      note: 'Locals\' club district — post-dinner around midnight.',
    },
  ],
  barcelona: [
    {
      name: 'La Boqueria Market',
      kind: 'market',
      when: {},
      hours: '8 AM – 8:30 PM (Mon-Sat)',
      place: 'La Rambla, 91',
      lat: 41.3819, lng: 2.1717,
      note: 'Best pintxos + fresh juice on the left side, away from Rambla.',
    },
    {
      name: 'Els Encants Vells (flea)',
      kind: 'flea',
      when: { dayOfWeek: 1 }, // Mon (also Wed/Fri/Sat)
      hours: '9 AM – 8 PM',
      place: 'Plaça de les Glòries',
      lat: 41.4001, lng: 2.1888,
      note: 'Mirrored ceiling — Insta shot from below is the move.',
    },
    {
      name: 'La Mercè Festival',
      kind: 'festival',
      when: { dateRange: { start: '09-20', end: '09-24' } },
      hours: 'All day',
      place: 'City-wide',
      note: 'Human towers (castells), fire runs, free concerts.',
    },
    {
      name: 'Sant Antoni Sunday Book Market',
      kind: 'market',
      when: { dayOfWeek: 0 },
      hours: '8:30 AM – 2:30 PM',
      place: 'C/ Comte d\'Urgell',
      lat: 41.3803, lng: 2.1614,
      note: 'Second-hand books + vintage comics + trading cards.',
    },
  ],
  london: [
    {
      name: 'Borough Market',
      kind: 'market',
      when: { dayOfWeek: 5 }, // Fri (also Wed/Thu/Sat)
      hours: '10 AM – 5 PM',
      place: '8 Southwark St, SE1',
      lat: 51.5054, lng: -0.0906,
      note: 'Full traders on Wed-Sat; food stalls open Tue.',
    },
    {
      name: 'Portobello Road Market',
      kind: 'flea',
      when: { dayOfWeek: 6 }, // Sat
      hours: '9 AM – 7 PM',
      place: 'Notting Hill',
      lat: 51.5148, lng: -0.2058,
      note: 'Antiques day is Saturday. Go early — chaos by 11 AM.',
    },
    {
      name: 'Columbia Road Flower Market',
      kind: 'market',
      when: { dayOfWeek: 0 }, // Sun
      hours: '8 AM – 3 PM',
      place: 'Columbia Rd, E2',
      lat: 51.5296, lng: -0.0700,
      note: 'Best prices after 2 PM; free bagels next door at Beigel.',
    },
    {
      name: 'Notting Hill Carnival',
      kind: 'festival',
      when: { dateRange: { start: '08-25', end: '08-26' } },
      hours: 'All day',
      place: 'Ladbroke Grove',
      note: 'Europe\'s biggest street party. Bring cash.',
    },
  ],
  'new york': [
    {
      name: 'Union Square Greenmarket',
      kind: 'market',
      when: { dayOfWeek: 6 }, // Sat
      hours: '8 AM – 6 PM',
      place: 'Union Square, Manhattan',
      lat: 40.7359, lng: -73.9906,
      note: 'Also Mon/Wed/Fri; Sat is the flagship day.',
    },
    {
      name: 'Smorgasburg (food market)',
      kind: 'food',
      when: { dayOfWeek: 6 },
      hours: '11 AM – 6 PM',
      place: 'Marsha P. Johnson State Park, Williamsburg',
      lat: 40.7229, lng: -73.9683,
      note: '100+ vendors; Sunday version at Prospect Park.',
    },
    {
      name: 'Brooklyn Flea',
      kind: 'flea',
      when: { dayOfWeek: 6 },
      hours: '10 AM – 5 PM',
      place: '80 Pearl St, DUMBO',
      lat: 40.7028, lng: -73.9891,
      note: 'Sunday too. Vintage clothing + records.',
    },
    {
      name: 'SummerStage (free concerts)',
      kind: 'music',
      when: { dateRange: { start: '06-01', end: '09-30' } },
      hours: 'Afternoons + evenings',
      place: 'Central Park + city-wide',
      note: 'Free. Check calendar day-of.',
    },
  ],
  nyc: [], // alias resolved below
  tokyo: [
    {
      name: 'Tsukiji Outer Market',
      kind: 'market',
      when: {},
      hours: '5 AM – 2 PM (closed Sun + Wed)',
      place: 'Chuo City',
      lat: 35.6654, lng: 139.7707,
      note: 'Inner wholesale market moved to Toyosu; outer is the tourist play.',
    },
    {
      name: 'Ameyoko Street Market',
      kind: 'market',
      when: {},
      hours: '10 AM – 8 PM daily',
      place: 'Ueno',
      lat: 35.7100, lng: 139.7745,
      note: 'Fish + dried goods + cheap sneakers under the JR tracks.',
    },
    {
      name: 'Sanja Matsuri',
      kind: 'festival',
      when: { dateRange: { start: '05-15', end: '05-17' } },
      hours: 'All day',
      place: 'Asakusa (Senso-ji area)',
      note: 'Tokyo\'s wildest festival. 100 portable shrines.',
    },
    {
      name: 'Golden Gai (bar row)',
      kind: 'nightlife',
      when: {},
      hours: '9 PM – 5 AM daily',
      place: 'Shinjuku',
      lat: 35.6944, lng: 139.7043,
      note: '200 tiny bars, 4-6 seats each. Cover charges vary.',
    },
  ],
};

// City aliases — different names should share the same happenings list.
CITY_HAPPENINGS['nyc'] = CITY_HAPPENINGS['new york'];
CITY_HAPPENINGS['praha'] = CITY_HAPPENINGS['prague'];
CITY_HAPPENINGS['barna'] = CITY_HAPPENINGS['barcelona'];
CITY_HAPPENINGS['roma'] = CITY_HAPPENINGS['rome'];

// Parses "MM-DD" into a comparable [month, day] tuple.
function parseMD(md: string): [number, number] | null {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

// True if today's [month, day] falls within [start, end] inclusive.
// Handles year-wrapping ranges (e.g. Prague Christmas market 11-30 → 01-06).
function inRange(today: [number, number], start: [number, number], end: [number, number]): boolean {
  const t = today[0] * 100 + today[1];
  const s = start[0] * 100 + start[1];
  const e = end[0] * 100 + end[1];
  if (s <= e) return t >= s && t <= e;
  // Wraps across new year.
  return t >= s || t <= e;
}

// Returns happenings that are ACTIVE right now for the given city.
// `now` is injected so callers can pass a trip-local date if we later
// wire in TZ conversion; for today, `new Date()` is fine.
export function todaysHappenings(city: string | null, now: Date = new Date()): LocalHappening[] {
  if (!city) return [];
  const list = CITY_HAPPENINGS[keyFor(city)];
  if (!list?.length) return [];

  const dow = now.getDay();
  const md: [number, number] = [now.getMonth() + 1, now.getDate()];

  return list.filter((h) => {
    // Undated weekly entry (e.g. Havelské Market) counts as "any day".
    if (!h.when.dayOfWeek && !h.when.dateRange) return true;
    if (h.when.dayOfWeek !== undefined && h.when.dayOfWeek === dow) return true;
    if (h.when.dateRange) {
      const s = parseMD(h.when.dateRange.start);
      const e = parseMD(h.when.dateRange.end);
      if (s && e && inRange(md, s, e)) return true;
    }
    return false;
  });
}

// Introspection helper for tooling / tests.
export function citiesWithLocalColor(): string[] {
  return Object.keys(CITY_HAPPENINGS);
}
