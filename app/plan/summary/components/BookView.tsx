'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BookTabProps } from '../lib/types';
import { fetchPlaceImage, imgCache } from '../lib/places';
import {
  loadUserHome, saveUserHome, hasAskedForHome,
  captureUserHomeFromGeolocation, type UserHome,
} from '@/lib/userHome';
import { AIRPORT_COORDS } from '@/lib/airport-coords';
import { track } from '@/lib/analytics';
import VoteButtons from '@/app/components/VoteButtons';
import StreetViewThumb from '@/app/components/StreetViewThumb';
import { useGeocode } from '@/app/hooks/useGeocode';
import {
  aviasalesUrl, wrapTP,
  airaloUrl, kiwitaxiUrl, getrentacarUrl, economybookingsUrl,
} from '@/lib/affiliate';

// Locale → ISO 4217 currency map. Mirrors the SummaryView logic; kept
// inline rather than shared because BookView is its own dynamic import
// chunk and dragging in the bigger file's export would balloon it.
const LOCALE_TO_CURRENCY: Record<string, string> = {
  'en-US': 'USD', 'en-GB': 'GBP', 'en-CA': 'CAD', 'en-AU': 'AUD',
  'en-NZ': 'NZD', 'en-IN': 'INR', 'en-IE': 'EUR', 'en-ZA': 'ZAR',
  'ja': 'JPY', 'ja-JP': 'JPY',
  'zh': 'CNY', 'zh-CN': 'CNY', 'zh-TW': 'TWD', 'zh-HK': 'HKD',
  'ko': 'KRW', 'ko-KR': 'KRW', 'hi': 'INR', 'hi-IN': 'INR',
  'es': 'EUR', 'es-ES': 'EUR', 'es-MX': 'MXN', 'es-AR': 'ARS',
  'pt': 'EUR', 'pt-BR': 'BRL', 'pt-PT': 'EUR',
  'fr': 'EUR', 'fr-FR': 'EUR', 'fr-CA': 'CAD',
  'de': 'EUR', 'de-DE': 'EUR', 'de-CH': 'CHF',
  'it': 'EUR', 'nl': 'EUR', 'sv': 'SEK', 'no': 'NOK', 'da': 'DKK',
  'pl': 'PLN', 'tr': 'TRY', 'ru': 'RUB',
  'ar': 'AED', 'th': 'THB', 'id': 'IDR', 'ms': 'MYR', 'vi': 'VND',
};
function detectUserCurrency(): string {
  if (typeof navigator === 'undefined') return 'USD';
  const lang = navigator.language || 'en-US';
  return LOCALE_TO_CURRENCY[lang] ?? LOCALE_TO_CURRENCY[lang.split('-')[0]] ?? 'USD';
}

// ISO 4217 → display symbol. Used to render partner-booking amounts
// (which arrive as ISO codes) in the same compact form as AI suggestions
// (which already use unicode symbols).
const ISO_TO_SYMBOL: Record<string, string> = {
  USD: '$', GBP: '£', EUR: '€', JPY: '¥', CNY: '¥', CHF: 'CHF',
  AUD: 'A$', CAD: 'C$', NZD: 'NZ$', INR: '₹', KRW: '₩', THB: '฿',
  SGD: 'S$', HKD: 'HK$', TWD: 'NT$', MYR: 'RM', IDR: 'Rp', VND: '₫',
  PHP: '₱', BRL: 'R$', MXN: 'MX$', RUB: '₽', TRY: '₺',
};

// Locale → country name. Used as a fallback origin when the user
// didn't fill in `travelingFrom` during trip planning. Without this,
// the AI defaults to domestic flights at the destination (e.g. DEL→AGR
// for a US user planning Taj Mahal) instead of an international trip
// from a hub in the user's home country.
const LOCALE_TO_ORIGIN: Record<string, string> = {
  'en-US': 'United States', 'en-GB': 'United Kingdom', 'en-CA': 'Canada',
  'en-AU': 'Australia', 'en-NZ': 'New Zealand', 'en-IN': 'India',
  'en-IE': 'Ireland', 'en-ZA': 'South Africa',
  'ja': 'Japan', 'ja-JP': 'Japan',
  'zh': 'China', 'zh-CN': 'China', 'zh-TW': 'Taiwan', 'zh-HK': 'Hong Kong',
  'ko': 'South Korea', 'ko-KR': 'South Korea', 'hi': 'India', 'hi-IN': 'India',
  'es': 'Spain', 'es-ES': 'Spain', 'es-MX': 'Mexico', 'es-AR': 'Argentina',
  'pt': 'Portugal', 'pt-BR': 'Brazil', 'pt-PT': 'Portugal',
  'fr': 'France', 'fr-FR': 'France', 'fr-CA': 'Canada',
  'de': 'Germany', 'de-DE': 'Germany', 'de-CH': 'Switzerland',
  'it': 'Italy', 'nl': 'Netherlands', 'sv': 'Sweden', 'no': 'Norway', 'da': 'Denmark',
  'pl': 'Poland', 'tr': 'Turkey', 'ru': 'Russia',
  'th': 'Thailand', 'id': 'Indonesia', 'ms': 'Malaysia', 'vi': 'Vietnam',
  'ar': 'United Arab Emirates',
};
function detectUserOrigin(): string {
  if (typeof navigator === 'undefined') return 'United States';
  const lang = navigator.language || 'en-US';
  return LOCALE_TO_ORIGIN[lang] ?? LOCALE_TO_ORIGIN[lang.split('-')[0]] ?? 'United States';
}

// Pull bold place names out of the streamed itinerary text so we can
// tell the booking AI which suggestions overlap with what the user
// already plans to visit. Filters obvious non-place tokens (Day 1,
// Morning, Tips, etc.) and dedupes case-insensitively.
const _ITIN_GENERIC = new Set([
  'morning', 'afternoon', 'evening', 'night', 'breakfast', 'lunch', 'dinner',
  'day', 'overview', 'tips', 'highlights', 'note', 'budget', 'cost',
  'total', 'estimated', 'optional', 'practical', 'transport', 'activities',
  'monument quest',
]);
function extractItineraryPlaces(text?: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\*\*([A-Z][^*]{2,60})\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1].trim();
    const key = raw.toLowerCase();
    if (_ITIN_GENERIC.has(key.split(/[\s(]/)[0])) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= 30) break;
  }
  return out;
}

// Carrier → real-deep-link booking URL builders. Each rule matches the
// AI-emitted carrier name and produces a URL that lands on the airline's
// own booking page with origin/dest/dates pre-filled. When no rule
// matches we fall through to Google Flights as a search aggregator.
const CARRIER_BOOK_RULES: Array<{
  match: RegExp;
  display: string;
  build: (from: string, to: string, depart: string, ret: string) => string;
}> = [
  {
    match: /\b(united\s*airlines?|^united$|^ua$)\b/i, display: 'United',
    build: (f, t, d, r) => `https://www.united.com/en-us/book/search?f=${f}&t=${t}&d=${d}${r ? `&r=${r}&tt=1` : '&tt=2'}&px=1`,
  },
  {
    match: /\b(delta(\s+air(\s*lines?)?)?|^dl$)\b/i, display: 'Delta',
    build: (f, t, d, r) => `https://www.delta.com/flight-search/book-a-flight?tripType=ROUND_TRIP&originCity=${f}&destinationCity=${t}&departureDate=${d}&returnDate=${r}&passengerCount=1`,
  },
  {
    match: /\b(american(\s+airlines?)?|^aa$)\b/i, display: 'American',
    build: (f, t, d, r) => `https://www.aa.com/booking/find-flights?tripType=roundTrip&adult=1&originAirport=${f}&destinationAirport=${t}&departDate=${d}&returnDate=${r}`,
  },
  {
    match: /\b(jetblue|^b6$)\b/i, display: 'JetBlue',
    build: (f, t, d, r) => `https://www.jetblue.com/booking/flights?from=${f}&to=${t}&depart=${d}&return=${r}&isMultiCity=false&adults=1`,
  },
  {
    match: /\b(southwest|^wn$)\b/i, display: 'Southwest',
    build: (f, t, d, r) => `https://www.southwest.com/air/booking/select-depart.html?adultPassengersCount=1&departureDate=${d}&destinationAirportCode=${t}&originationAirportCode=${f}&returnDate=${r}&tripType=roundtrip`,
  },
  {
    match: /\b(alaska(\s+airlines?)?|^as$)\b/i, display: 'Alaska',
    build: (f, t, d, r) => `https://www.alaskaair.com/search/results?A=1&O=${f}&D=${t}&OD=${d}&RD=${r}&RT=true`,
  },
  {
    match: /\b(emirates|^ek$)\b/i, display: 'Emirates',
    build: (f, t, d, r) => `https://www.emirates.com/english/book-a-flight/results.aspx?Origin=${f}&Destination=${t}&DepartureDate=${d}&ReturnDate=${r}&Adults=1`,
  },
  {
    match: /\b(qatar(\s+airways)?|^qr$)\b/i, display: 'Qatar Airways',
    build: (f, t, d, r) => `https://www.qatarairways.com/en-us/homepage.html?origin=${f}&destination=${t}&departureDate=${d}&returnDate=${r}&tripType=R&adults=1`,
  },
  {
    match: /\b(etihad|^ey$)\b/i, display: 'Etihad',
    build: (f, t, d, r) => `https://www.etihad.com/en-us/book/flights?travelType=R&from=${f}&to=${t}&departureDate=${d}&returnDate=${r}&adults=1`,
  },
  {
    match: /\b(british\s*airways|^ba$)\b/i, display: 'British Airways',
    build: (f, t, d, r) => `https://www.britishairways.com/travel/redeem/execclub/_gf/en_us?from=${f}&to=${t}&dep=${d}&ret=${r}&adults=1`,
  },
  {
    match: /\b(lufthansa|^lh$)\b/i, display: 'Lufthansa',
    build: (f, t, d, r) => `https://www.lufthansa.com/us/en/flight-search?travelers=ADT-1&origin=${f}&destination=${t}&outboundDate=${d}&returnDate=${r}&tripType=R`,
  },
  {
    match: /\b(air\s*france|^af$)\b/i, display: 'Air France',
    build: (f, t, d, r) => `https://wwws.airfrance.us/search/advanced?bookingFlow=LEISURE&from=${f}&to=${t}&forwardDate=${d}&returnDate=${r}&adults=1`,
  },
  {
    match: /\b(klm|^kl$)\b/i, display: 'KLM',
    build: (f, t, d, r) => `https://www.klm.com/search/advanced?bookingFlow=LEISURE&origin=${f}&destination=${t}&departureDate=${d}&returnDate=${r}&adults=1`,
  },
  {
    match: /\b(iberia|^ib$)\b/i, display: 'Iberia',
    build: (f, t, d, r) => `https://www.iberia.com/us/?market=ES&from=${f}&to=${t}&fromDate=${d}&toDate=${r}&pax=1`,
  },
  {
    match: /\b(swiss(\s+international)?|^lx$)\b/i, display: 'SWISS',
    build: (f, t, d, r) => `https://www.swiss.com/us/en/flights?travelers=ADT-1&origin=${f}&destination=${t}&outboundDate=${d}&returnDate=${r}&tripType=R`,
  },
  {
    match: /\b(turkish(\s+airlines?)?|^tk$)\b/i, display: 'Turkish Airlines',
    build: (f, t, d, r) => `https://www.turkishairlines.com/en-us/flights/booking/index.html?bookerCode=01&adultNumber=1&departureDate=${d}&returnDate=${r}&fromAirportCode=${f}&toAirportCode=${t}&tripKind=2`,
  },
  {
    match: /\b(singapore\s*airlines?|^sq$)\b/i, display: 'Singapore Airlines',
    build: (f, t, d, r) => `https://www.singaporeair.com/en_UK/us/plan-travel/book-a-flight/?TripType=R&Adults=1&FromCode=${f}&ToCode=${t}&DepartDate=${d}&ReturnDate=${r}`,
  },
  {
    match: /\b(cathay\s*pacific|^cx$)\b/i, display: 'Cathay Pacific',
    build: (f, t, d, r) => `https://book.cathaypacific.com/CathayPacific/dyn/air/booking/availability?TRIP_TYPE=R&ADT=1&DEPART_AIRPORT_0=${f}&ARRIVE_AIRPORT_0=${t}&DEPART_DATE_0=${d}&DEPART_AIRPORT_1=${t}&ARRIVE_AIRPORT_1=${f}&DEPART_DATE_1=${r}`,
  },
  {
    match: /\b(jal|japan\s*airlines?|^jl$)\b/i, display: 'Japan Airlines',
    build: (f, t, d, r) => `https://www.jal.co.jp/en/inter/book/?org=${f}&dst=${t}&out=${d}&ret=${r}&pax=1`,
  },
  {
    match: /\b(ana|^nh$|all\s*nippon)\b/i, display: 'ANA',
    build: (f, t, d, r) => `https://www.ana.co.jp/en/us/book-plan/book/?from=${f}&to=${t}&dep=${d}&ret=${r}`,
  },
  {
    match: /\b(korean\s*air|^ke$)\b/i, display: 'Korean Air',
    build: (f, t, d, r) => `https://www.koreanair.com/us/en/booking/booking-gate?from=${f}&to=${t}&depart=${d}&return=${r}&pax=1`,
  },
  {
    match: /\b(asiana|^oz$)\b/i, display: 'Asiana',
    build: (f, t, d, r) => `https://flyasiana.com/C/US/EN/index?from=${f}&to=${t}&depart=${d}&return=${r}`,
  },
  {
    match: /\b(air\s*india|^ai$)\b/i, display: 'Air India',
    build: (f, t, d, r) => `https://www.airindia.com/in/en/book-flight.html?from=${f}&to=${t}&departure=${d}&return=${r}&adults=1`,
  },
  {
    match: /\b(indigo|^6e$)\b/i, display: 'IndiGo',
    build: (f, t, d, r) => `https://www.goindigo.in/?#?origin=${f}&destination=${t}&departureDate=${d}&returnDate=${r}&adults=1`,
  },
  {
    match: /\b(vistara|^uk$)\b/i, display: 'Vistara',
    build: (f, t, d, r) => `https://www.airvistara.com/in/en/book/flights?origin=${f}&destination=${t}&departure=${d}&return=${r}`,
  },
  {
    match: /\b(qantas|^qf$)\b/i, display: 'Qantas',
    build: (f, t, d, r) => `https://www.qantas.com/au/en/book-a-trip/flights.html?from=${f}&to=${t}&departure=${d}&return=${r}&adults=1`,
  },
  {
    match: /\b(virgin\s*atlantic|virgin\s*airways|^vs$)\b/i, display: 'Virgin Atlantic',
    build: (f, t, d, r) => `https://flights.virginatlantic.com/en-us/flights?origin=${f}&destination=${t}&departure=${d}&return=${r}&adults=1`,
  },
  {
    match: /\b(aer\s*lingus|^ei$)\b/i, display: 'Aer Lingus',
    build: (f, t, d, r) => `https://www.aerlingus.com/booking/?origin=${f}&destination=${t}&departureDate=${d}&returnDate=${r}&adults=1`,
  },
  {
    match: /\b(air\s*canada|^ac$)\b/i, display: 'Air Canada',
    build: (f, t, d, r) => `https://www.aircanada.com/en-us/aco/home.html#/bound=&trip-type=roundtrip&origin=${f}&destination=${t}&departure=${d}&return=${r}&adults=1`,
  },
];

function carrierBookingLink(carrier: string, from: string, to: string, depart: string, ret: string) {
  if (!carrier) return null;
  for (const rule of CARRIER_BOOK_RULES) {
    if (rule.match.test(carrier)) return { name: rule.display, href: rule.build(from, to, depart, ret) };
  }
  return null;
}

// Build a Google Flights deep-link that populates origin / destination
// AND dates. Google's q= parser is finicky:
//   - ISO dates ("2026-04-28") often get dropped or misread
//   - "on / through" connectors are unreliable
//   - The phrasing that works: "departing <Month Day> returning <Month
//     Day>" with full month names. This matches Google's own query-
//     understanding training set.
//   - Word order matters: "to <dest> from <origin>" parses better
//     than the reverse.
//   - Carrier name omitted — when present, Google drops date filters
//     entirely and searches the airline's home page.
function formatLongDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}
function buildGoogleFlightsHref(
  from: string, to: string, isoStart: string, isoEnd: string,
): string {
  const parts = [`flights to ${to} from ${from}`];
  const departLong = formatLongDate(isoStart);
  const returnLong = formatLongDate(isoEnd);
  if (departLong) parts.push(`departing ${departLong}`);
  if (returnLong) parts.push(`returning ${returnLong}`);
  parts.push('1 adult');
  return `https://www.google.com/travel/flights?hl=en&q=${encodeURIComponent(parts.join(' '))}`;
}

// Design-handoff booking surface: tabbed layout (Stays / Flights / Activities
// / Transport / Insurance) with badge counts, 3-column hotel cards, wide
// flight card. Built as a parallel implementation alongside the legacy
// BookTab.tsx — this is the v0 design port; real booking data wiring stays
// with the existing per-section logic in BookTab.tsx until that file is
// retired.

const MONO = 'var(--font-mono-display), ui-monospace, monospace';
const DISPLAY = 'var(--font-display), Georgia, serif';

// Partner-confirmed booking row from /api/bookings — sourced from
// Travelpayouts conversion postbacks via the cron poller. itemName
// is the partner brand (e.g. "Booking.com", "Hotellook"), not the
// hotel/flight name, so we can't reliably per-card-flip; we surface
// these as a trip-level banner instead.
interface PartnerBooking {
  id: string;
  partner: string;
  partnerProgram: string | null;
  itemKind: string | null;
  itemName: string | null;
  amount: number | null;
  payout: number | null;
  currency: string | null;
  status: string;
  conversionAt: string | null;
}

type Tab = 'stays' | 'flights' | 'activities' | 'transport' | 'insurance';
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'stays',      label: 'Stays',      glyph: String.fromCodePoint(0x25EC) },
  { id: 'flights',    label: 'Flights',    glyph: String.fromCodePoint(0x2708) },
  { id: 'activities', label: 'Activities', glyph: String.fromCodePoint(0x25C9) },
  { id: 'transport',  label: 'Transport',  glyph: String.fromCodePoint(0x25D0) },
  { id: 'insurance',  label: 'Insurance',  glyph: String.fromCodePoint(0x2695) },
];

type Currency = '¥' | '$' | '€' | '£' | '₹';

interface Hotel {
  tier: "EDITORS' PICK" | 'LOCAL' | 'BUDGET';
  district: string;
  tag: 'HOTEL' | 'RYOKAN' | 'HOSTEL' | 'INN' | 'BNB' | 'RIAD' | 'RESORT';
  name: string;
  rating: number;
  features: string[];
  price: number;
  currency: Currency;
  booked?: boolean;
  fromItinerary?: boolean;
}

interface Flight {
  date: string;
  segments: {
    from: string;
    to: string;
    departTime: string;
    arriveTime: string;
    duration: string;
    via?: string; // optional connecting city; falls back to "Direct"
  }[];
  carrier: string;
  total: number;
  currency: Currency;
  status?: 'CONFIRMED' | 'PENDING';
}

// Rich flight option shape — used by the in-site flight-deal UI.
// AI emits 3 of these per trip, each with a different trade-off
// highlighted by `dealBadge`.
type DealBadge = 'BEST PRICE' | 'FASTEST' | 'GREENEST' | 'BEST VALUE';
interface Layover {
  airport: string;  // IATA
  city: string;
  duration: string; // "2h 15m"
}
interface FlightLeg {
  from: string;
  to: string;
  date?: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  layovers: Layover[];
}
interface FlightOption {
  carrier: string;
  flightNumbers: string[];
  totalPrice: number;
  currency: Currency;
  totalDuration: string;
  cabin?: 'economy' | 'premium' | 'business' | 'first';
  co2Kg?: number;
  dealBadge?: DealBadge;
  outbound: FlightLeg;
  return: FlightLeg;
}

interface Activity {
  tag: 'TEA' | 'CULTURE' | 'FOOD' | 'NATURE' | 'NIGHTLIFE';
  name: string;
  meta: string;
  price: number;
  currency: Currency;
  booked?: boolean;
  fromItinerary?: boolean;
}

// Booking suggestions are now generated per-trip by /api/booking-suggestions
// (Anthropic). The previous hardcoded MOCK_* data was Kyoto-specific and
// rendered the same Park Hyatt Kyoto cards regardless of destination —
// the user reported the bug for a Taj Mahal trip.

export interface EmailHotelConfirmation {
  hotelName: string;
  city: string;
  checkinAt: string;
  checkoutAt: string;
  bookingRef: string | null;
  totalDisplay: string | null;
}
export interface EmailConfirmations {
  flightDetectedAt: string | null;
  hotels: EmailHotelConfirmation[];
}

export default function BookView(props: BookTabProps) {
  const [tab, setTab] = useState<Tab>('stays');
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [flight, setFlight] = useState<Flight | null>(null);
  // Gmail-parsed booking confirmations for this trip. Hydrated on mount
  // from /api/email/gmail/confirmations and refreshed by ScanInboxPill
  // after a successful scan. Drives the "✓ BOOKED · ref" badges on the
  // matching hotel + flight cards.
  const [emailConfirmations, setEmailConfirmations] = useState<EmailConfirmations | null>(null);
  useEffect(() => {
    if (!props.tripId) return;
    let cancelled = false;
    fetch(`/api/email/gmail/confirmations?tripId=${encodeURIComponent(props.tripId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d) setEmailConfirmations(d as EmailConfirmations); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [props.tripId]);
  const [flightOptions, setFlightOptions] = useState<FlightOption[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Active home airport — persisted in localStorage. Editable by the
  // user via the "Change" pill in the Flights section so they can
  // override what geolocation picked (or set one if they skipped the
  // permission banner).
  const [homeAirport, setHomeAirport] = useState<UserHome | null>(null);
  // Partner-confirmed bookings for this trip — populated by the
  // Travelpayouts cron via /api/bookings. Distinct from the AI-mock
  // `hotel.booked` / `activity.booked` flags above; this is the
  // source-of-truth attribution layer. Only signed-in users with a
  // tripId see this layer (the GET endpoint requires auth).
  const [partnerBookings, setPartnerBookings] = useState<PartnerBooking[]>([]);
  useEffect(() => {
    if (!props.tripId) return;
    let cancelled = false;
    fetch(`/api/bookings?tripId=${encodeURIComponent(props.tripId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.bookings) return;
        setPartnerBookings(d.bookings as PartnerBooking[]);
      })
      .catch(() => { /* silent — banner just won't render */ });
    return () => { cancelled = true; };
  }, [props.tripId]);
  useEffect(() => {
    const h = loadUserHome();
    if (h) { setHomeAirport(h); return; }
    // Auto-prompt the browser for geolocation when arriving on the
    // Flights tab without a captured home airport — saves the user
    // from manually clicking Change. The hasAskedForHome flag ensures
    // we never re-prompt after a previous denial.
    if (hasAskedForHome()) return;
    let cancelled = false;
    captureUserHomeFromGeolocation().then(rec => {
      if (cancelled) return;
      if (rec) setHomeAirport(rec);
    });
    return () => { cancelled = true; };
  }, []);
  function changeHomeAirport(rec: { iata: string; city: string; country: string; countryCode: string; lat: number; lng: number }) {
    const home: UserHome = { ...rec, capturedAt: Date.now() };
    saveUserHome(home);
    setHomeAirport(home);
  }

  // Fetch trip-specific suggestions on mount (and any time the destination
  // or dates change). Cached server-side so navigating away and back is
  // instant. The previous version hardcoded Kyoto data so the cards never
  // matched the trip.
  useEffect(() => {
    if (!props.location) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch('/api/booking-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // tripId enables persistence — server caches the result on
        // TripDraft.bookingSuggestions so the next visit is instant.
        tripId: props.tripId,
        location: props.location,
        startDate: props.startDate,
        endDate: props.endDate,
        nights: props.nights,
        budget: props.budget,
        style: props.style,
        travelingFrom: props.travelingFrom,
        // Strongest origin signal first: a captured home airport (set
        // when user grants location on the globe page → resolves to
        // nearest IATA via lib/airport-coords). Server-side this beats
        // travelingFrom and userHomeCountry when present.
        userHomeAirport: homeAirport
          ? { iata: homeAirport.iata, city: homeAirport.city, country: homeAirport.country }
          : undefined,
        // Locale-derived country fallback when geolocation wasn't given.
        userHomeCountry: detectUserOrigin(),
        currency: detectUserCurrency(),
        // Pull the bold place names out of the streamed itinerary so
        // the AI can mark hotel/activity suggestions as fromItinerary
        // when they overlap with what the user already plans to visit.
        itineraryPlaces: extractItineraryPlaces(props.fullItinerary).slice(0, 24),
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d?.hotels && d?.flight && d?.activities) {
          setHotels(d.hotels);
          setFlight(d.flight);
          setActivities(d.activities);
          if (Array.isArray(d.flightOptions)) setFlightOptions(d.flightOptions);
        } else {
          setLoadError(d?.error ?? 'No suggestions returned');
        }
      })
      .catch(() => { if (!cancelled) setLoadError('Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [props.location, props.startDate, props.endDate, props.nights, props.budget, props.style, props.travelingFrom, homeAirport?.iata]);

  // Header counter: how many of the 5 booking categories the user has
  // an actual partner-confirmed booking in. Uses the Travelpayouts
  // postback data (real conversions) — not the AI's pre-set mock
  // `booked` flags, which never become real. Dedupes on itemKind so
  // booking two hotels still counts as 1 of 5 (a *category* booked),
  // not 2.
  const confirmedByCategory = useMemo(() => {
    const seen = new Set<Tab>();
    for (const b of partnerBookings) {
      if (b.status !== 'confirmed') continue;
      const k = (b.itemKind ?? '').toLowerCase();
      if (k.includes('hotel') || k.includes('stay'))                    seen.add('stays');
      else if (k.includes('flight') || k.includes('air'))               seen.add('flights');
      else if (k.includes('activity') || k.includes('tour') || k.includes('experience')) seen.add('activities');
      else if (k.includes('transport') || k.includes('car') || k.includes('rail') || k.includes('train')) seen.add('transport');
      else if (k.includes('insurance'))                                  seen.add('insurance');
    }
    return seen;
  }, [partnerBookings]);
  const totalBookings = confirmedByCategory.size;
  const totalSpent = useMemo(() => {
    return partnerBookings
      .filter(b => b.status === 'confirmed' && b.amount != null)
      .reduce((s, b) => s + (b.amount ?? 0), 0);
  }, [partnerBookings]);
  // Currency symbol for the header pill: prefer the AI's hotel/flight
  // currency (already a unicode symbol), fall back to mapping the
  // partner booking's ISO code, then '$' as the last resort.
  const headerCurrency: string = useMemo(() => {
    const aiCcy = flight?.currency ?? hotels[0]?.currency;
    if (aiCcy) return aiCcy;
    const partnerIso = partnerBookings.find(b => b.status === 'confirmed' && b.currency)?.currency;
    return (partnerIso && ISO_TO_SYMBOL[partnerIso]) ?? partnerIso ?? '$';
  }, [partnerBookings, flight, hotels]);

  return (
    <div style={{
      color: 'var(--brand-ink)',
      fontFamily: 'var(--font-ui), system-ui, sans-serif',
    }}>
      {/* Top status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
            color: 'var(--brand-accent-2)', fontWeight: 600,
          }}>
            {String.fromCodePoint(0x00A7)} BOOKING · {(props.location || 'TRIP').toUpperCase()}
          </div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400,
            letterSpacing: '-0.025em', lineHeight: 1.05, marginTop: 6,
          }}>
            Pin it down.
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em',
            color: 'var(--brand-ink-dim)', fontWeight: 700,
          }}>
            {headerCurrency}{totalSpent.toLocaleString()} · {totalBookings} OF 5 BOOKED
          </div>
          {props.tripId && (
            <>
              <ScanInboxPill tripId={props.tripId} onConfirmationsChange={setEmailConfirmations} />
              <ManualPasteButton tripId={props.tripId} onConfirmationsChange={setEmailConfirmations} />
            </>
          )}
        </div>
      </div>

      {/* Partner-confirmed bookings banner. Surfaces conversions the
          Travelpayouts cron has attributed to this trip via sub_id. */}
      {partnerBookings.length > 0 && (
        <PartnerBookingsBanner bookings={partnerBookings} />
      )}

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 28, overflowX: 'auto',
        paddingBottom: 4,
      }}>
        {TABS.map(t => {
          const active = t.id === tab;
          const c = confirmedByCategory.has(t.id) ? 1 : 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999,
              background: active ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
              color: active ? 'var(--brand-accent)' : 'var(--brand-ink-dim)',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              <span style={{ opacity: 0.8 }}>{t.glyph}</span>
              <span>{t.label}</span>
              {c > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, padding: '0 5px',
                  borderRadius: 999,
                  background: active ? 'var(--brand-accent)' : 'rgba(167,139,250,0.6)',
                  color: 'var(--brand-bg)',
                  fontFamily: MONO, fontSize: 10, fontWeight: 800,
                }}>{c}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <div style={{
          padding: '40px 24px', borderRadius: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--brand-border)',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--brand-ink-dim)',
          textAlign: 'center',
        }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: 'var(--brand-accent)', marginRight: 8,
            animation: 'pulse 1.4s ease-in-out infinite', verticalAlign: 'middle',
          }} />
          Generating booking options for {props.location}…
        </div>
      )}
      {!loading && loadError && (
        <div style={{
          padding: '24px', borderRadius: 16,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#fca5a5', fontSize: 13,
        }}>
          Couldn&apos;t load booking suggestions ({loadError}). Try again in a moment.
        </div>
      )}
      {!loading && !loadError && tab === 'stays'      && <StaysSection hotels={hotels} location={props.location} startDate={props.startDate} endDate={props.endDate} nights={props.nights} tripId={props.tripId} onItineraryAdjusted={props.onItineraryAdjusted} emailHotels={emailConfirmations?.hotels ?? []} />}
      {!loading && !loadError && tab === 'flights' && (
        flightOptions.length > 0
          ? <FlightOptionsSection options={flightOptions} startDate={props.startDate} endDate={props.endDate} homeAirport={homeAirport} onChangeHome={changeHomeAirport} tripId={props.tripId} />
          : (flight && <FlightsSection flight={flight} startDate={props.startDate} endDate={props.endDate} />)
      )}
      {!loading && !loadError && tab === 'activities' && <ActivitiesSection activities={activities} location={props.location} startDate={props.startDate} endDate={props.endDate} tripId={props.tripId} onItineraryAdjusted={props.onItineraryAdjusted} />}
      {tab === 'transport'  && <TransportSection location={props.location} startDate={props.startDate} endDate={props.endDate} tripId={props.tripId} />}
      {!loading && !loadError && tab === 'insurance' && (
        <InsuranceSection
          location={props.location}
          startDate={props.startDate}
          endDate={props.endDate}
          travelingFrom={props.travelingFrom}
        />
      )}
    </div>
  );
}

// ─── Stays ─────────────────────────────────────────────────────────────────

type SortKey = 'price' | 'rating';
type SortDir = 'asc' | 'desc';
// Defaults: cheapest first for price, best first for rating. Clicking
// the active chip flips direction.
const DEFAULT_DIR: Record<SortKey, SortDir> = { price: 'asc', rating: 'desc' };

function StaysSection({ hotels, location, startDate, endDate, nights, tripId, onItineraryAdjusted, emailHotels }: {
  hotels: Hotel[]; location: string; startDate: string; endDate: string; nights: string;
  tripId?: string;
  onItineraryAdjusted?: (next: string) => void;
  emailHotels: EmailHotelConfirmation[];
}) {
  const datesLabel = startDate && endDate
    ? `APR ${new Date(startDate).getDate()}–${new Date(endDate).getDate()}`
    : 'YOUR DATES';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Guests / rooms control. Flows into:
  //   - Booking.com deeplink (group_adults, no_rooms)
  //   - "Stays for N" header label
  //   - "Avg per night" price math on each card (split N rooms)
  // Default 2 + 1 matches the previous hardcoded value so existing
  // sessions don't see prices jump on first render.
  const [guests, setGuests] = useState(2);
  const [rooms,  setRooms]  = useState(1);
  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  }
  const sortedHotels = useMemo(() => {
    if (!sortKey) return hotels;
    const sign = sortDir === 'asc' ? 1 : -1;
    const get = sortKey === 'price' ? (h: Hotel) => h.price : (h: Hotel) => h.rating;
    return [...hotels].sort((a, b) => sign * (get(a) - get(b)));
  }, [hotels, sortKey, sortDir]);
  return (
    <section>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
          color: 'var(--brand-ink-mute)', fontWeight: 700,
        }}>
          {String.fromCodePoint(0x00A7)} {(location || 'STAYS').toUpperCase()} · {nights || '–'} NIGHT{nights === '1' ? '' : 'S'} · {datesLabel} · {guests} GUEST{guests === 1 ? '' : 'S'} · {rooms} ROOM{rooms === 1 ? '' : 'S'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StepperChip label="Guests" value={guests} min={1} max={8} onChange={setGuests} />
          <StepperChip label="Rooms"  value={rooms}  min={1} max={4} onChange={setRooms} />
          <SortChip label="Price"  active={sortKey === 'price'}  dir={sortDir} onClick={() => toggleSort('price')} />
          <SortChip label="Rating" active={sortKey === 'rating'} dir={sortDir} onClick={() => toggleSort('rating')} />
        </div>
      </div>

      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 20px',
      }}>
        Where will you sleep?
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {sortedHotels.map((h, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <HotelCard hotel={h} city={location} startDate={startDate} endDate={endDate} guests={guests} rooms={rooms} tripId={tripId} onItineraryAdjusted={onItineraryAdjusted} emailConfirmation={emailHotels.find(eh => eh.hotelName.toLowerCase().includes(h.name.toLowerCase()) || h.name.toLowerCase().includes(eh.hotelName.toLowerCase())) ?? null} />
            {tripId && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px' }}>
                <VoteButtons tripId={tripId} itemKey={`hotel:${h.name}`} kind="booking" label={`Hotel: ${h.name}`} compact />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Triggers /api/email/gmail/scan to pull booking confirmations from
// the user's inbox, then re-fetches /api/email/gmail/confirmations so
// the matched hotel/flight cards light up with their refs immediately.
// 412 = gmail.readonly scope missing → tells the user to re-sign-in.
function ScanInboxPill({ tripId, onConfirmationsChange }: {
  tripId: string;
  onConfirmationsChange: (c: EmailConfirmations) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'done' | 'error' | 'needs_auth'>('idle');
  const [summary, setSummary] = useState<string>('');

  async function scan() {
    if (status === 'scanning') return;
    setStatus('scanning'); setSummary('');
    track('book_intent', { kind: 'inbox-scan', tripId });
    // Scan both Gmail AND Outlook so the user doesn't have to know
    // which mailbox holds their confirmation. Each returns 412 when
    // the corresponding OAuth scope isn't connected — we tolerate
    // that and only flag "needs auth" if BOTH are disconnected.
    type ScanResult = { new?: number; deduped?: number };
    async function callOne(url: string): Promise<{ ok: boolean; needsAuth: boolean; data?: ScanResult }> {
      try {
        const r = await fetch(url, { method: 'POST' });
        if (r.status === 412) return { ok: false, needsAuth: true };
        if (!r.ok) return { ok: false, needsAuth: false };
        return { ok: true, needsAuth: false, data: await r.json() as ScanResult };
      } catch { return { ok: false, needsAuth: false }; }
    }
    const [gmail, outlook, gcal] = await Promise.all([
      callOne('/api/email/gmail/scan'),
      callOne('/api/email/outlook/scan'),
      callOne('/api/email/gcal/scan'),
    ]);
    if (gmail.needsAuth && outlook.needsAuth && gcal.needsAuth) {
      setStatus('needs_auth');
      setSummary('Sign in with Google or Microsoft to grant inbox/calendar read access.');
      return;
    }
    if (!gmail.ok && !outlook.ok && !gcal.ok) {
      setStatus('error');
      setSummary('Scan failed. Try again later.');
      return;
    }
    const newCount = (gmail.data?.new ?? 0) + (outlook.data?.new ?? 0) + (gcal.data?.new ?? 0);
    const dedupCount = (gmail.data?.deduped ?? 0) + (outlook.data?.deduped ?? 0) + (gcal.data?.deduped ?? 0);
    setStatus('done');
    setSummary(
      newCount > 0
        ? `Found ${newCount} new booking${newCount === 1 ? '' : 's'}.`
        : dedupCount > 0
          ? 'No new bookings since last scan.'
          : 'No booking emails in the last 30 days.',
    );
    const refresh = await fetch(`/api/email/gmail/confirmations?tripId=${encodeURIComponent(tripId)}`);
    if (refresh.ok) onConfirmationsChange(await refresh.json() as EmailConfirmations);
  }

  const label =
    status === 'scanning' ? 'Scanning inbox…' :
    status === 'needs_auth' ? 'Connect Gmail' :
    'Scan inbox';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={scan}
        disabled={status === 'scanning'}
        style={{
          padding: '6px 12px', borderRadius: 999,
          background: status === 'scanning'
            ? 'rgba(167,139,250,0.10)'
            : 'rgba(167,139,250,0.16)',
          border: '1px solid var(--brand-border-hi)',
          color: 'var(--brand-accent)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
          textTransform: 'uppercase', fontWeight: 700,
          cursor: status === 'scanning' ? 'wait' : 'pointer',
        }}
      >
        ✦ {label}
      </button>
      {summary && status !== 'idle' && status !== 'scanning' && (
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em',
          color: status === 'error' || status === 'needs_auth'
            ? 'var(--brand-warn, #f59e0b)'
            : 'var(--brand-ink-dim)',
        }}>{summary}</div>
      )}
    </div>
  );
}

// Opens a sheet for the user to paste a confirmation email's text OR
// drop a screenshot of one. Sends to /api/booking/manual-paste which
// runs the same extractors as the Gmail/Outlook scan. Refreshes the
// confirmations endpoint on success so badges light up immediately.
function ManualPasteButton({ tripId, onConfirmationsChange }: {
  tripId: string;
  onConfirmationsChange: (c: EmailConfirmations) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string>('');

  function close() {
    setOpen(false);
    setText(''); setImageFile(null); setResult(''); setSubmitting(false);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true); setResult('');
    track('book_intent', { kind: 'manual-paste', tripId, mode: imageFile ? 'image' : 'text' });
    try {
      let body: Record<string, unknown>;
      if (imageFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(imageFile);
        });
        body = { kind: 'image', imageBase64: base64, mimeType: imageFile.type, tripId };
      } else if (text.trim().length >= 50) {
        body = { kind: 'text', text, tripId };
      } else {
        setResult('Paste at least a few lines of the confirmation, or upload an image.');
        setSubmitting(false);
        return;
      }
      const r = await fetch('/api/booking/manual-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json() as { ok?: boolean; kind?: string; deduped?: boolean; matchedTripId?: string | null; error?: string };
      if (!r.ok) {
        setResult(data.error ?? 'Failed to parse.');
      } else if (data.deduped) {
        setResult('Already added — same confirmation as before.');
      } else if (data.kind === 'unknown') {
        setResult('Could not detect a flight or hotel in that text. Try a different paste.');
      } else {
        setResult(
          data.matchedTripId
            ? `✓ Matched a ${data.kind} to this trip — badge updated.`
            : `Parsed a ${data.kind}, but it didn't match this trip's city + dates.`,
        );
        const refresh = await fetch(`/api/email/gmail/confirmations?tripId=${encodeURIComponent(tripId)}`);
        if (refresh.ok) onConfirmationsChange(await refresh.json() as EmailConfirmations);
      }
    } catch {
      setResult('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '6px 12px', borderRadius: 999,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--brand-border)',
          color: 'var(--brand-ink-dim)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
          textTransform: 'uppercase', fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ✦ Paste confirmation
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Paste a booking confirmation"
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 9500,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0a0a1f',
              border: '1px solid var(--brand-border-hi)',
              borderRadius: 16,
              padding: 20,
              width: 'min(560px, 100%)',
              maxHeight: '90vh',
              display: 'flex', flexDirection: 'column', gap: 14,
              overflow: 'auto',
            }}
          >
            <div style={{
              fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
              color: 'var(--brand-ink)',
            }}>
              Add a booking
            </div>
            <p style={{ fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.55, margin: 0 }}>
              Paste a confirmation email or drop a screenshot. I&apos;ll pull out the hotel / flight / dates and match it to this trip.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the body of your booking confirmation email here…"
              rows={8}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--brand-border)',
                borderRadius: 10,
                color: 'var(--brand-ink)',
                fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                padding: 12, resize: 'vertical',
                minHeight: 140,
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <label style={{
                padding: '7px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--brand-border)',
                color: 'var(--brand-ink-dim)',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', fontWeight: 700,
                cursor: 'pointer',
              }}>
                {imageFile ? `📷 ${imageFile.name}` : '📷 Or upload a screenshot'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {imageFile && (
                <button
                  type="button"
                  onClick={() => setImageFile(null)}
                  style={{
                    padding: '4px 10px', borderRadius: 999,
                    background: 'transparent',
                    border: '1px solid var(--brand-border)',
                    color: 'var(--brand-ink-dim)',
                    fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {result && (
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(167,139,250,0.10)',
                border: '1px solid var(--brand-border-hi)',
                color: 'var(--brand-ink)',
                fontSize: 12, lineHeight: 1.5,
              }}>{result}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                type="button"
                onClick={close}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid var(--brand-border)',
                  color: 'var(--brand-ink-dim)',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || (text.trim().length < 50 && !imageFile)}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'var(--brand-accent)',
                  border: 'none',
                  color: 'var(--brand-bg)',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: (text.trim().length < 50 && !imageFile) ? 0.4 : 1,
                }}
              >
                {submitting ? 'Parsing…' : 'Add booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Inline pill stepper: "Guests 2 - +". Used for Guests + Rooms so the
// user can dial in occupancy without leaving the Stays page. Value
// flows through to the Booking.com deeplink (group_adults / no_rooms).
function StepperChip({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const tone = value > min
    ? { bg: 'rgba(167,139,250,0.16)', border: 'var(--brand-border-hi)', ink: 'var(--brand-accent)' }
    : { bg: 'rgba(255,255,255,0.04)', border: 'var(--brand-border)', ink: 'var(--brand-ink-dim)' };
  const btnStyle = {
    width: 22, height: 22, borderRadius: 999, padding: 0,
    background: 'transparent',
    border: 'none',
    color: tone.ink,
    cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    lineHeight: 1,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } as const;
  return (
    <div style={{
      padding: '3px 4px 3px 12px', borderRadius: 999,
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      color: tone.ink,
      fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <span>{label}</span>
      <button type="button" aria-label={`Decrease ${label}`} onClick={dec} disabled={value <= min} style={{ ...btnStyle, opacity: value <= min ? 0.35 : 1 }}>−</button>
      <span style={{ minWidth: 12, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <button type="button" aria-label={`Increase ${label}`} onClick={inc} disabled={value >= max} style={{ ...btnStyle, opacity: value >= max ? 0.35 : 1 }}>+</button>
    </div>
  );
}

function SortChip({ label, active, dir, onClick }: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  // ▲ asc, ▼ desc when active; ↕ when inactive.
  const arrow = active
    ? (dir === 'asc' ? String.fromCodePoint(0x25B2) : String.fromCodePoint(0x25BC))
    : String.fromCodePoint(0x21C5);
  return (
    <button onClick={onClick} aria-pressed={active} style={{
      padding: '5px 12px', borderRadius: 999,
      background: active ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
      color: active ? 'var(--brand-accent)' : 'var(--brand-ink-dim)',
      fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
      cursor: 'pointer',
    }}>
      {arrow} {label}
    </button>
  );
}

const TIER_COLOR: Record<Hotel['tier'], string> = {
  'EDITORS\' PICK': 'var(--brand-accent)',
  'LOCAL':          'var(--brand-accent-2)',
  'BUDGET':         'var(--brand-ink-dim)',
};

// Module-scoped gallery cache so re-mounting a HotelCard during the
// session doesn't re-hit /api/place-images. Keyed on "<name>||<city>".
const galleryCache = new Map<string, string[]>();

function HotelCard({ hotel, city, startDate, endDate, guests = 2, rooms = 1, tripId, onItineraryAdjusted, emailConfirmation = null }: {
  hotel: Hotel; city: string; startDate?: string; endDate?: string;
  guests?: number;
  rooms?: number;
  tripId?: string;
  onItineraryAdjusted?: (next: string) => void;
  emailConfirmation?: EmailHotelConfirmation | null;
}) {
  // Slot-in to itinerary state. fromItinerary cards already match
  // something in the plan so the button hides; everything else can
  // be added with a single round-trip.
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const { coord: svCoord } = useGeocode(hotel.name, city);
  async function addToItinerary() {
    if (!tripId || adjusting) return;
    setAdjusting(true); setAdjustError(null);
    track('add_to_itinerary', { kind: 'hotel', name: hotel.name, tripId });
    try {
      const r = await fetch('/api/itinerary/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          kind: 'hotel',
          name: hotel.name,
          district: hotel.district,
          price: `${hotel.currency}${hotel.price.toLocaleString()} / night`,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.itinerary) {
        setAdjustError(data?.error ?? 'Failed to update itinerary');
      } else {
        onItineraryAdjusted?.(data.itinerary);
        setAdjusted(true);
      }
    } catch {
      setAdjustError('Network error');
    } finally {
      setAdjusting(false);
    }
  }
  // Booking.com search URL — works for any hotel name. Booking's search
  // engine fuzzy-matches `ss=` to known properties, so a real hotel
  // lands on its detail page; an unknown name lands on a results list
  // for the city. Either way the user can complete the booking.
  const bookingHref = (() => {
    const params = new URLSearchParams({
      ss: `${hotel.name}, ${city}`,
      group_adults: String(guests),
      no_rooms: String(rooms),
    });
    if (startDate) params.set('checkin', startDate);
    if (endDate)   params.set('checkout', endDate);
    // Booking.com's sub-id equivalent is `label`; Travelpayouts also
    // honors `sub_id` on Travelpayouts-rewritten outbound clicks. We
    // pass both — partners ignore the one they don't use.
    if (tripId) {
      params.set('label', `trip-${tripId}`);
      params.set('sub_id', `trip-${tripId}`);
    }
    // Route through TP's redirector so commission attributes when the
    // user books on Booking.com (TP partner). Non-partner destinations
    // pass through unchanged. See lib/affiliate.ts.
    const raw = `https://www.booking.com/searchresults.html?${params}`;
    return wrapTP(raw, tripId ? `trip-${tripId}` : `hotel_${hotel.name.slice(0, 24)}`);
  })();
  const tierColor = TIER_COLOR[hotel.tier];
  const cacheKey = `${hotel.name}||${city}`;
  // Eagerly fetch the full image set on mount (up to 5 photos via
  // /api/place-images) so the card can render a Google-Maps-style
  // slideshow with prev/next arrows + dot indicators. Caches in-memory
  // so re-mounts during the session are instant.
  const cachedGallery = galleryCache.get(cacheKey);
  const [gallery, setGallery] = useState<string[] | null>(cachedGallery ?? null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (gallery !== null) return;
    let cancelled = false;
    (async () => {
      // Layer 1: /api/place-images (Google Places, up to 5 photos)
      try {
        const params = new URLSearchParams({ name: hotel.name, location: city });
        const r = await fetch(`/api/place-images?${params}`);
        if (r.ok) {
          const d = await r.json() as { images?: string[] };
          if (!cancelled && d.images && d.images.length > 0) {
            galleryCache.set(cacheKey, d.images);
            setGallery(d.images);
            if (!imgCache.has(cacheKey)) imgCache.set(cacheKey, d.images[0]);
            return;
          }
        }
      } catch { /* network */ }
      // Layer 2: fetchPlaceImage chain (Wikidata → Wikipedia → Commons)
      // returns a single image; promote to a one-element gallery.
      try {
        const single = await fetchPlaceImage(hotel.name, city);
        if (cancelled) return;
        if (single) {
          galleryCache.set(cacheKey, [single]);
          imgCache.set(cacheKey, single);
          setGallery([single]);
        } else {
          galleryCache.set(cacheKey, []);
          setGallery([]);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [cacheKey, hotel.name, city, gallery]);

  // Lightbox keyboard + body-scroll handling. Arrow keys also advance
  // the slideshow when the lightbox is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'ArrowLeft'  && gallery && gallery.length > 1) setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length);
      if (e.key === 'ArrowRight' && gallery && gallery.length > 1) setGalleryIdx(i => (i + 1) % gallery.length);
    };
    const prev = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, gallery]);

  const currentImg = gallery && gallery.length > 0 ? gallery[galleryIdx % gallery.length] : null;
  const hasMultiple = !!gallery && gallery.length > 1;

  function nudge(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!gallery || gallery.length < 2) return;
    setGalleryIdx(i => (i + delta + gallery.length) % gallery.length);
  }
  function openLightbox() {
    if (!currentImg) return;
    setOpen(true);
  }

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${hotel.booked ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Image area — Google-Maps-style slideshow. The frame itself is
          a button (click → lightbox). Prev/next arrows and dot
          indicators sit on top with stopPropagation so they only
          advance the slide without opening the lightbox. */}
      <div style={{
        position: 'relative',
        aspectRatio: '16/10',
        background: currentImg
          ? '#0a0a1f'
          : 'linear-gradient(135deg, rgba(167,139,250,0.10), rgba(125,211,252,0.06))',
        overflow: 'hidden',
      }}>
        <button
          type="button"
          onClick={openLightbox}
          disabled={!currentImg}
          aria-label={currentImg ? `View photos of ${hotel.name}` : hotel.name}
          style={{
            position: 'absolute', inset: 0,
            display: 'grid', placeItems: 'center',
            color: 'rgba(167,139,250,0.4)', fontSize: 28,
            fontFamily: DISPLAY,
            padding: 0, border: 'none',
            background: 'transparent',
            cursor: currentImg ? 'zoom-in' : 'default',
          }}
        >
          {currentImg ? (
            <img
              key={currentImg}
              src={currentImg} alt={hotel.name} loading="lazy"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                transition: 'opacity 200ms ease',
              }}
            />
          ) : svCoord ? (
            <div style={{ position: 'absolute', inset: 0 }}>
              <StreetViewThumb
                lat={svCoord.lat}
                lng={svCoord.lng}
                alt={hotel.name}
                aspectRatio="16/10"
              />
            </div>
          ) : (
            String.fromCodePoint(0x25EC)
          )}
        </button>

        {/* Tier pill */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
          padding: '4px 10px', borderRadius: 4,
          background: 'rgba(10,10,31,0.78)', color: tierColor,
          border: `1px solid ${tierColor}`, fontWeight: 700,
          WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
          pointerEvents: 'none',
        }}>{hotel.tier}</div>

        {/* Booked / From-itinerary badge — top-right. fromItinerary
            takes precedence (it's the "this matches your day plan"
            signal); booked only relevant once that flow exists. */}
        {hotel.fromItinerary ? (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
            padding: '4px 10px', borderRadius: 4,
            background: 'rgba(251,191,36,0.18)',
            color: 'var(--brand-gold, #fbbf24)',
            border: '1px solid var(--brand-gold, #fbbf24)', fontWeight: 700,
            pointerEvents: 'none',
          }}>★ FROM ITINERARY</div>
        ) : hotel.booked || emailConfirmation ? (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
            padding: '4px 10px', borderRadius: 4,
            background: 'rgba(125,211,252,0.18)',
            color: 'var(--brand-accent-2)',
            border: '1px solid var(--brand-accent-2)', fontWeight: 700,
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 24px)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {String.fromCodePoint(0x2713)} BOOKED{emailConfirmation?.bookingRef ? ` · ${emailConfirmation.bookingRef}` : ''}
          </div>
        ) : null}

        {/* Slideshow controls — rendered only when there's >1 image. */}
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={e => nudge(-1, e)}
              aria-label="Previous photo"
              style={{
                position: 'absolute', top: '50%', left: 8,
                transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(10,10,31,0.7)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer',
                WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
              }}
            >‹</button>
            <button
              type="button"
              onClick={e => nudge(1, e)}
              aria-label="Next photo"
              style={{
                position: 'absolute', top: '50%', right: 8,
                transform: 'translateY(-50%)',
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(10,10,31,0.7)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer',
                WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)',
              }}
            >›</button>
            {/* Dot indicators */}
            <div style={{
              position: 'absolute', bottom: 10, left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: 5,
              pointerEvents: 'none',
            }}>
              {gallery!.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === galleryIdx ? 16 : 6,
                    height: 6, borderRadius: 3,
                    background: i === galleryIdx ? '#fff' : 'rgba(255,255,255,0.45)',
                    transition: 'width 180ms ease, background 180ms ease',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lightbox carousel — rendered through createPortal so the sticky
          tab nav and any transformed ancestors don't clip it. */}
      {open && gallery && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label={`Photos of ${hotel.name}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.94)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '5vh 5vw', cursor: 'zoom-out',
          }}
        >
          <img
            src={gallery[galleryIdx]} alt={hotel.name}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
              borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              cursor: 'default',
            }}
          />
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setGalleryIdx(i => (i - 1 + gallery.length) % gallery.length); }}
                aria-label="Previous photo"
                style={{
                  position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)', border: 'none',
                  color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1,
                }}
              >‹</button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setGalleryIdx(i => (i + 1) % gallery.length); }}
                aria-label="Next photo"
                style={{
                  position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)', border: 'none',
                  color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1,
                }}
              >›</button>
              <div style={{
                position: 'absolute', bottom: 24, left: 0, right: 0,
                textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12,
                fontFamily: MONO, letterSpacing: '0.12em',
              }}>
                {galleryIdx + 1} / {gallery.length} · {hotel.name.toUpperCase()}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              position: 'absolute', top: 'max(20px, env(safe-area-inset-top))', right: 20,
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)', border: 'none',
              color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1,
            }}
          >×</button>
        </div>,
        document.body,
      )}

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
          color: 'var(--brand-ink-mute)', fontWeight: 700,
        }}>
          {hotel.district.toUpperCase()} · {hotel.tag}
        </div>
        <div style={{
          fontFamily: DISPLAY, fontSize: 18, fontWeight: 400,
          letterSpacing: '-0.005em', lineHeight: 1.2,
          color: 'var(--brand-ink)',
        }}>
          {hotel.name}
        </div>
        <Stars value={hotel.rating} />
        <ul style={{
          margin: 0, padding: 0, listStyle: 'none',
          fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.6,
        }}>
          {hotel.features.map((f, i) => (
            <li key={i} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--brand-ink-mute)' }}>·</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div style={{
          marginTop: 4, paddingTop: 12,
          borderTop: '1px solid var(--brand-border)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8,
        }}>
          <div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
              letterSpacing: '-0.015em', color: 'var(--brand-ink)', lineHeight: 1,
            }}>
              {hotel.currency}{hotel.price.toLocaleString()}
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
              color: 'var(--brand-ink-mute)', marginTop: 4, fontWeight: 700,
            }}>
              PER NIGHT
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
            <a
              href={bookingHref}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => track('book_intent', { kind: 'hotel', provider: 'booking.com', name: hotel.name, district: hotel.district, price: hotel.price })}
              style={{
                padding: '8px 14px', borderRadius: 10,
                background: hotel.booked ? 'transparent' : 'var(--brand-accent)',
                color: hotel.booked ? 'var(--brand-accent)' : 'var(--brand-bg)',
                border: hotel.booked ? '1px solid var(--brand-border-hi)' : 'none',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
                textDecoration: 'none', display: 'inline-block',
              }}
            >
              {hotel.booked ? 'Manage' : `Book ${String.fromCodePoint(0x2192)}`}
            </a>
            {tripId && onItineraryAdjusted && !hotel.fromItinerary && (
              <button
                type="button"
                onClick={addToItinerary}
                disabled={adjusting || adjusted}
                title="Slot this hotel into the existing itinerary"
                style={{
                  padding: '5px 11px', borderRadius: 999,
                  background: adjusted ? 'rgba(34,197,94,0.12)' : 'transparent',
                  border: `1px solid ${adjusted ? 'rgba(34,197,94,0.5)' : 'rgba(167,139,250,0.32)'}`,
                  color: adjusted ? '#86efac' : 'var(--brand-accent)',
                  fontFamily: MONO, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: adjusting || adjusted ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}
              >
                {adjusting && (
                  <span style={{ width: 8, height: 8, border: '1.4px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                )}
                {adjusted ? '✓ Added' : adjusting ? 'Adding…' : '+ Add to itinerary'}
              </button>
            )}
            {adjustError && (
              <span style={{ fontSize: 9, color: '#fca5a5', fontFamily: MONO, letterSpacing: '0.06em' }}>
                {adjustError}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', gap: 2, color: 'var(--brand-gold)' }}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ fontSize: 13, opacity: n <= value ? 1 : 0.25 }}>
          {String.fromCodePoint(0x2605)}
        </span>
      ))}
    </div>
  );
}

// ─── Flights ───────────────────────────────────────────────────────────────

function FlightsSection({ flight, startDate, endDate }: {
  flight: Flight; startDate?: string; endDate?: string;
}) {
  return (
    <section>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 14,
      }}>
        {String.fromCodePoint(0x00A7)} FLIGHTS · ROUND TRIP · {flight.status === 'CONFIRMED' ? '1' : '0'} BOOKED
      </div>
      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 20px',
      }}>
        How will you get there?
      </h2>

      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${flight.status === 'CONFIRMED' ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
        borderRadius: 14, padding: '20px 22px',
        display: 'grid',
        gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {flight.segments.map((s, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center', gap: 18,
            }}>
              {/* From */}
              <div>
                <div style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
                  color: 'var(--brand-ink-mute)', fontWeight: 700,
                }}>
                  {flight.date.split('–')[i]?.trim() ?? flight.date} · {i === 0 ? 'OUTBOUND' : 'RETURN'}
                </div>
                <div style={{
                  fontFamily: DISPLAY, fontSize: 32, fontWeight: 400,
                  letterSpacing: '-0.02em', color: 'var(--brand-ink)', marginTop: 4,
                }}>
                  {s.from}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 11,
                  color: 'var(--brand-ink-dim)', marginTop: 2,
                }}>
                  {s.departTime}
                </div>
              </div>

              {/* Center: arrow + via city or "Direct" + duration */}
              <div style={{ textAlign: 'center', color: 'var(--brand-ink-mute)' }}>
                <div style={{ fontSize: 14 }}>
                  {String.fromCodePoint(0x2192)} {s.via && s.via.trim() ? s.via : 'Direct'} · {s.duration}
                </div>
                <div style={{ height: 1, background: 'var(--brand-border)', marginTop: 6 }} />
              </div>

              {/* To */}
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: DISPLAY, fontSize: 32, fontWeight: 400,
                  letterSpacing: '-0.02em', color: 'var(--brand-ink)',
                }}>
                  {s.to}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: 11,
                  color: 'var(--brand-ink-dim)', marginTop: 2,
                }}>
                  {s.arriveTime}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total + status */}
        <div style={{ textAlign: 'right', borderLeft: '1px solid var(--brand-border)', paddingLeft: 24, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <div style={{
            fontFamily: DISPLAY, fontSize: 28, fontWeight: 400,
            letterSpacing: '-0.015em', color: 'var(--brand-ink)', lineHeight: 1,
          }}>
            {flight.currency}{flight.total.toLocaleString()}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
            color: flight.status === 'CONFIRMED' ? 'var(--brand-success)' : 'var(--brand-ink-mute)',
            fontWeight: 700,
          }}>
            {flight.carrier} · {flight.status}
          </div>
        </div>
      </div>

      {/* Aggregator search row — like Wanderlog/TripAdvisor patterns,
          one-click handoff to the major flight engines with the trip's
          dates + IATA codes pre-filled. The price the AI suggested is
          an estimate; users actually book on the partner site. */}
      <FlightAggregatorButtons flight={flight} startDate={startDate} endDate={endDate} />
    </section>
  );
}

function FlightAggregatorButtons({ flight, startDate, endDate }: {
  flight: Flight; startDate?: string; endDate?: string;
}) {
  const out = flight.segments[0];
  const ret = flight.segments[1];
  const from = out?.from ?? '';
  const to   = out?.to   ?? '';
  if (!from || !to) return null;

  // Normalize dates to the formats each provider expects.
  const isoStart = startDate || '';
  const isoEnd   = endDate   || '';
  const skyDate = (iso: string) =>
    iso ? iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10) : '';
  const ymdStart = isoStart;
  const ymdEnd   = isoEnd;
  const skyStart = skyDate(isoStart);
  const skyEnd   = skyDate(isoEnd);

  // Search URLs — all accept query params we know to encode.
  // Google Flights `q=` parsing prefers "to <dest> from <origin>" over
  // "from X to Y", and parses ISO YYYY-MM-DD reliably. We DON'T add the
  // carrier here — the parser misclassifies trailing airline names and
  // sometimes drops the date filters entirely. Carrier filtering is a
  // 1-click on the destination page.
  const googleHref = buildGoogleFlightsHref(from, to, isoStart, isoEnd);
  const skyscannerHref =
    `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/` +
    `${skyStart || ''}${skyEnd ? `/${skyEnd}` : ''}/?adults=1&rtn=${ret ? 1 : 0}`;
  const kayakHref =
    `https://www.kayak.com/flights/${from}-${to}` +
    `${ymdStart ? `/${ymdStart}` : ''}${ymdEnd ? `/${ymdEnd}` : ''}`;
  const expediaHref =
    `https://www.expedia.com/Flights-Search?` +
    new URLSearchParams({
      trip: ret ? 'roundtrip' : 'oneway',
      'leg1': `from:${from},to:${to}${isoStart ? `,departure:${isoStart}TANYT` : ''}`,
      ...(ret && isoEnd ? { 'leg2': `from:${to},to:${from},departure:${isoEnd}TANYT` } : {}),
      passengers: 'adults:1',
      mode: 'search',
    }).toString();

  // Aviasales first — TP-attributed, earns commission on bookings.
  // The others are unaffiliated fallbacks until each gets its own
  // partner program. See lib/affiliate.ts.
  const aviasalesHref = aviasalesUrl(from, to, isoStart || null, isoEnd || null, `agg_${from}_${to}`);
  const buttons = [
    { name: 'Aviasales',       href: aviasalesHref, accent: '#a78bfa', icon: '🎫' },
    { name: 'Google Flights',  href: googleHref,    accent: '#93c5fd', icon: '✈️' },
    { name: 'Skyscanner',      href: skyscannerHref, accent: '#7dd3fc', icon: '🔍' },
    { name: 'Kayak',           href: kayakHref,     accent: '#fbbf24', icon: '🛬' },
    { name: 'Expedia',         href: expediaHref,   accent: '#fcd34d', icon: '🌐' },
  ];

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 10,
        textTransform: 'uppercase',
      }}>
        Search live prices · {from} → {to}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {buttons.map(b => (
          <a
            key={b.name}
            href={b.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 999,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: b.accent, textDecoration: 'none',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              transition: 'border-color 150ms, background 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = b.accent;
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            }}
          >
            <span style={{ fontSize: 14 }}>{b.icon}</span>
            {b.name}
            <span style={{ opacity: 0.55, fontSize: 11 }}>↗</span>
          </a>
        ))}
      </div>
      <div style={{
        marginTop: 10, fontSize: 11, color: 'var(--brand-ink-dim)', lineHeight: 1.5,
      }}>
        The {flight.carrier && `${flight.carrier} ${flight.currency}${flight.total.toLocaleString()}`} estimate above is from public schedules — actual fare and availability depend on dates, class, and aggregator. Click any provider to compare live.
      </div>
    </div>
  );
}

// ─── Activities ────────────────────────────────────────────────────────────

// ─── Flight options (rich, multi-card deal UI) ────────────────────────────

const DEAL_BADGE_COLOR: Record<DealBadge, string> = {
  'BEST PRICE': '#fbbf24',  // gold
  'FASTEST':    '#7dd3fc',  // sky
  'GREENEST':   '#86efac',  // green
  'BEST VALUE': '#a78bfa',  // lavender
};

function FlightOptionsSection({ options, startDate, endDate, homeAirport, onChangeHome, tripId }: {
  options: FlightOption[]; startDate?: string; endDate?: string;
  homeAirport: UserHome | null;
  onChangeHome: (rec: { iata: string; city: string; country: string; countryCode: string; lat: number; lng: number }) => void;
  tripId?: string;
}) {
  return (
    <section>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 14,
      }}>
        {String.fromCodePoint(0x00A7)} FLIGHTS · {options.length} OPTIONS · ROUND TRIP
      </div>
      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 8px',
      }}>
        How will you get there?
      </h2>
      <p style={{
        fontSize: 13, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
        maxWidth: 640, margin: '0 0 18px',
      }}>
        Three options ranked on the trade-offs that matter — price,
        speed, and emissions. Click any card to compare live fares
        across Google Flights, Skyscanner, Kayak, or Expedia.
      </p>
      <OriginPicker homeAirport={homeAirport} onChange={onChangeHome} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {options.map((o, i) => (
          <FlightOptionCard key={i} option={o} startDate={startDate} endDate={endDate} tripId={tripId} />
        ))}
      </div>
    </section>
  );
}

function OriginPicker({ homeAirport, onChange }: {
  homeAirport: UserHome | null;
  onChange: (rec: { iata: string; city: string; country: string; countryCode: string; lat: number; lng: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AIRPORT_COORDS.slice(0, 8); // first 8 as default
    return AIRPORT_COORDS.filter(a =>
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [query]);

  return (
    <div style={{
      marginBottom: 22, padding: '12px 14px',
      borderRadius: 12, background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--brand-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em',
          color: 'var(--brand-ink-mute)', fontWeight: 700, textTransform: 'uppercase',
        }}>
          Departing from
        </span>
        {homeAirport ? (
          <span style={{
            fontFamily: MONO, fontSize: 12, color: 'var(--brand-ink)', fontWeight: 700,
          }}>
            {homeAirport.iata} · {homeAirport.city}, {homeAirport.country}
          </span>
        ) : (
          <span style={{
            fontFamily: MONO, fontSize: 11, color: 'var(--brand-ink-dim)', fontStyle: 'italic',
          }}>
            Not set — using your locale&apos;s default hub
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            marginLeft: 'auto',
            padding: '5px 12px', borderRadius: 999,
            background: 'transparent', border: '1px solid rgba(167,139,250,0.4)',
            color: 'var(--brand-accent)', fontSize: 10, fontWeight: 700,
            fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {open ? 'Cancel' : 'Change'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by IATA / city / country (e.g. SFO, Tokyo, Germany)"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '9px 12px', borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(167,139,250,0.3)',
              color: 'var(--brand-ink)', fontSize: 12,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          {filtered.length === 0 && (
            <div style={{
              padding: 12, fontSize: 11, color: 'var(--brand-ink-dim)',
              fontFamily: MONO, fontStyle: 'italic',
            }}>
              No airport matches. Try a different IATA code or city name.
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{
              marginTop: 8, display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6,
              maxHeight: 240, overflow: 'auto',
            }}>
              {filtered.map(a => (
                <button
                  key={a.iata}
                  type="button"
                  onClick={() => { onChange(a); setOpen(false); setQuery(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8, textAlign: 'left',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--brand-ink)', fontSize: 12,
                    fontFamily: 'inherit', cursor: 'pointer',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)';
                    e.currentTarget.style.background = 'rgba(167,139,250,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ fontFamily: MONO, fontWeight: 700, color: 'var(--brand-accent)' }}>
                    {a.iata}
                  </span>
                  <span style={{ color: 'var(--brand-ink-dim)' }}>
                    {a.city} · {a.country}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlightOptionCard({ option, startDate, endDate, tripId }: {
  option: FlightOption; startDate?: string; endDate?: string; tripId?: string;
}) {
  const badgeColor = option.dealBadge ? DEAL_BADGE_COLOR[option.dealBadge] : null;
  const co2 = typeof option.co2Kg === 'number' ? Math.round(option.co2Kg) : null;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${badgeColor ?? 'var(--brand-border)'}`,
      borderRadius: 14, padding: '20px 22px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 24, alignItems: 'stretch',
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top metadata strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em',
          color: 'var(--brand-ink-mute)', fontWeight: 700, textTransform: 'uppercase',
        }}>
          <span style={{ color: 'var(--brand-ink)' }}>{option.carrier}</span>
          {option.flightNumbers?.length ? <span>· {option.flightNumbers.join(' / ')}</span> : null}
          {option.cabin && <span>· {option.cabin}</span>}
          {option.dealBadge && (
            <span style={{
              padding: '3px 10px', borderRadius: 4,
              background: 'rgba(10,10,31,0.7)',
              color: badgeColor!, border: `1px solid ${badgeColor!}`,
              fontSize: 9, letterSpacing: '0.18em',
            }}>
              {option.dealBadge}
            </span>
          )}
        </div>

        {/* Outbound + Return legs */}
        <FlightLegRow label="OUTBOUND" leg={option.outbound} />
        <FlightLegRow label="RETURN"   leg={option.return} />

        {/* Bottom chips strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          <FlightChip icon="⏱" label={option.totalDuration} />
          {co2 !== null && (
            <FlightChip
              icon="🌱"
              label={`${co2} kg CO₂`}
              accent={co2 < 400 ? '#86efac' : co2 < 900 ? '#fbbf24' : '#fb7185'}
              hint="Estimated round-trip emissions per passenger"
            />
          )}
          <FlightChip
            icon={layoverCount(option) === 0 ? '✈' : '🔁'}
            label={layoverSummary(option)}
            accent={layoverCount(option) === 0 ? '#86efac' : undefined}
          />
        </div>
      </div>

      {/* Right rail: price + book button + aggregator search */}
      <div style={{
        textAlign: 'right',
        borderLeft: '1px solid var(--brand-border)',
        paddingLeft: 24,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        gap: 12, minWidth: 180,
      }}>
        <div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 32, fontWeight: 400,
            letterSpacing: '-0.015em', color: 'var(--brand-ink)', lineHeight: 1,
          }}>
            {option.currency}{option.totalPrice.toLocaleString()}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
            color: 'var(--brand-ink-mute)', marginTop: 6, fontWeight: 700,
          }}>
            ROUND TRIP · TOTAL
          </div>
        </div>
        <FlightOptionAggregator option={option} startDate={startDate} endDate={endDate} tripId={tripId} />
      </div>
    </div>
  );
}

function FlightLegRow({ label, leg }: { label: string; leg: FlightLeg }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 1fr auto',
      alignItems: 'center', gap: 14,
    }}>
      <div style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
        color: 'var(--brand-ink-mute)', fontWeight: 700,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div>
          <div style={{
            fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
            color: 'var(--brand-ink)', lineHeight: 1,
          }}>
            {leg.from}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
            {leg.departTime}
          </div>
        </div>
        {/* Arrow + layovers visualization */}
        <div style={{ flex: 1, position: 'relative', minWidth: 60, paddingTop: 6 }}>
          <div style={{ height: 1, background: 'var(--brand-border)' }} />
          {leg.layovers && leg.layovers.length > 0 && (
            <div style={{
              position: 'absolute', top: 1, left: 0, right: 0,
              display: 'flex', justifyContent: 'space-around',
              transform: 'translateY(-50%)',
            }}>
              {leg.layovers.map((l, i) => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--brand-accent-2)',
                  border: '1.5px solid var(--brand-bg)',
                }} title={`${l.duration} in ${l.airport}`} />
              ))}
            </div>
          )}
          <div style={{
            position: 'absolute', top: 8, left: 0, right: 0,
            textAlign: 'center',
            fontFamily: MONO, fontSize: 9, color: 'var(--brand-ink-mute)',
            fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {leg.duration}
            {leg.layovers && leg.layovers.length > 0 && (
              <span style={{ marginLeft: 6 }}>
                · {leg.layovers.map(l => `${l.airport} ${l.duration}`).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
            color: 'var(--brand-ink)', lineHeight: 1,
          }}>
            {leg.to}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--brand-ink-dim)', marginTop: 4 }}>
            {leg.arriveTime}
          </div>
        </div>
      </div>
      <div />
    </div>
  );
}

function FlightChip({ icon, label, accent, hint }: {
  icon: string; label: string; accent?: string; hint?: string;
}) {
  return (
    <span title={hint} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, lineHeight: 1.4,
      color: accent ?? 'rgba(255,255,255,0.62)',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent ? `${accent}66` : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 6, padding: '3px 8px',
      fontFamily: MONO, letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function layoverCount(o: FlightOption): number {
  return (o.outbound.layovers?.length ?? 0) + (o.return.layovers?.length ?? 0);
}
function layoverSummary(o: FlightOption): string {
  const out = o.outbound.layovers?.length ?? 0;
  const ret = o.return.layovers?.length ?? 0;
  if (out === 0 && ret === 0) return 'Direct both ways';
  const cities = new Set<string>();
  for (const l of o.outbound.layovers ?? []) cities.add(l.airport);
  for (const l of o.return.layovers ?? []) cities.add(l.airport);
  const total = out + ret;
  return `${total} stop${total === 1 ? '' : 's'} · ${[...cities].join(' / ')}`;
}

function FlightOptionAggregator({ option, startDate, endDate, tripId }: {
  option: FlightOption; startDate?: string; endDate?: string; tripId?: string;
}) {
  const from = option.outbound.from;
  const to   = option.outbound.to;
  if (!from || !to) return null;

  const isoStart = startDate || '';
  const isoEnd   = endDate   || '';
  const skyDate  = (iso: string) => iso ? iso.slice(2,4) + iso.slice(5,7) + iso.slice(8,10) : '';
  // Append sub_id (and clickref / aff_sub for partner variations) so
  // when Travelpayouts' rewriter intercepts the click, the conversion
  // postback comes back tagged with our tripId.
  const withSub = (url: string): string => {
    if (!tripId) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}sub_id=trip-${tripId}&clickref=trip-${tripId}`;
  };

  // Primary booking link — direct to the carrier's own booking page
  // when we know it. Falls back to Google Flights search if the
  // carrier isn't in CARRIER_BOOK_RULES. The user can always pick
  // an aggregator from the secondary row.
  // Aviasales is TP-attributed (earns commission). Prefer carrier
  // deeplink when known (best UX), otherwise Aviasales is the primary.
  // Either way Aviasales appears in the aggregators row as a backup.
  const aviasalesHref = aviasalesUrl(
    from, to, isoStart || null, isoEnd || null,
    tripId ? `trip-${tripId}` : `opt_${from}_${to}`,
  );
  const carrierLink = carrierBookingLink(option.carrier, from, to, isoStart, isoEnd);
  const primary = carrierLink
    ? { name: carrierLink.name, href: withSub(carrierLink.href) }
    : { name: 'Aviasales', href: aviasalesHref };

  const aggregators = [
    ...(carrierLink ? [{ name: 'Aviasales', href: aviasalesHref }] : []),
    {
      name: 'Skyscanner',
      href: withSub(
        `https://www.skyscanner.com/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/` +
        `${skyDate(isoStart) || ''}${skyDate(isoEnd) ? `/${skyDate(isoEnd)}` : ''}/?adults=1&rtn=1`
      ),
    },
    {
      name: 'Kayak',
      href: withSub(
        `https://www.kayak.com/flights/${from}-${to}` +
        `${isoStart ? `/${isoStart}` : ''}${isoEnd ? `/${isoEnd}` : ''}`
      ),
    },
    // Always include Google as a backup if the primary is the carrier
    // (so users still have a price-comparison option in the list).
    ...(carrierLink ? [{
      name: 'Google',
      href: withSub(buildGoogleFlightsHref(from, to, isoStart, isoEnd)),
    }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <a
        href={primary.href}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => track('book_intent', { kind: 'flight', provider: primary.name, carrier: option.carrier, from, to, price: option.totalPrice })}
        style={{
          padding: '10px 16px', borderRadius: 999,
          background: 'var(--brand-accent)', color: 'var(--brand-bg)',
          textDecoration: 'none',
          fontFamily: MONO, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          textAlign: 'center', whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(167,139,250,0.28)',
        }}
      >
        Book on {primary.name} →
      </a>
      <div style={{
        fontSize: 9, color: 'var(--brand-ink-mute)', textAlign: 'right',
        fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase',
        marginTop: -2,
      }}>
        {carrierLink ? 'Direct on airline' : 'Compare aggregator'}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {aggregators.map(l => (
          <a
            key={l.name}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            style={{
              padding: '6px 10px', borderRadius: 6,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--brand-ink-dim)',
              textDecoration: 'none',
              fontFamily: MONO, fontSize: 9, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {l.name}
          </a>
        ))}
      </div>
    </div>
  );
}

function ActivitiesSection({ activities, location, startDate, endDate, tripId, onItineraryAdjusted }: {
  activities: Activity[];
  location: string;
  startDate: string;
  endDate: string;
  tripId?: string;
  onItineraryAdjusted?: (next: string) => void;
}) {
  return (
    <section>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 14,
      }}>
        {String.fromCodePoint(0x00A7)} ACTIVITIES · {activities.filter(a => a.booked).length} OF {activities.length} BOOKED
      </div>
      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 20px',
      }}>
        What will you do?
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
      }}>
        {activities.map((a, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ActivityCard activity={a} location={location} startDate={startDate} endDate={endDate} tripId={tripId} onItineraryAdjusted={onItineraryAdjusted} />
            {tripId && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px' }}>
                <VoteButtons tripId={tripId} itemKey={`activity:${a.name}`} kind="booking" label={`Activity: ${a.name}`} compact />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// Per-card slot-in handler. Extracted from the inline render so each
// card can carry its own adjusting/adjusted/error state.
function ActivityCard({ activity: a, location, startDate, endDate, tripId, onItineraryAdjusted }: {
  activity: Activity;
  location: string;
  startDate: string;
  endDate: string;
  tripId?: string;
  onItineraryAdjusted?: (next: string) => void;
}) {
  // GetYourGuide search URL: pre-fills the activity name + destination
  // city so the user lands on a result list scoped to their trip. Date
  // range comes through via `from_date` / `to_date` (GetYourGuide's
  // standard query keys). If the trip's location is "Tokyo, Japan",
  // we strip the country so the city is the search anchor.
  const cityOnly = location.split(',')[0]?.trim() || location;
  const gygQuery = `${a.name} ${cityOnly}`.trim();
  const gygParams = new URLSearchParams({ q: gygQuery });
  if (startDate) gygParams.set('from_date', startDate);
  if (endDate)   gygParams.set('to_date', endDate);
  if (tripId)    gygParams.set('partner_id', `geknee-${tripId}`);
  const bookHref = `https://www.getyourguide.com/s/?${gygParams.toString()}`;
  const [adjusting, setAdjusting] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  async function addToItinerary() {
    if (!tripId || adjusting) return;
    setAdjusting(true); setAdjustError(null);
    track('add_to_itinerary', { kind: 'activity', name: a.name, tripId });
    try {
      const r = await fetch('/api/itinerary/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          kind: 'activity',
          name: a.name,
          meta: a.meta,
          price: `${a.currency}${a.price.toLocaleString()}`,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.itinerary) {
        setAdjustError(data?.error ?? 'Failed to update itinerary');
      } else {
        onItineraryAdjusted?.(data.itinerary);
        setAdjusted(true);
      }
    } catch {
      setAdjustError('Network error');
    } finally {
      setAdjusting(false);
    }
  }
  return (
    <div style={{
      padding: '16px 18px',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${a.booked ? 'var(--brand-border-hi)' : 'var(--brand-border)'}`,
      borderRadius: 14,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
          color: 'var(--brand-accent-2)', fontWeight: 700,
        }}>
          {a.tag}
        </div>
        {a.fromItinerary ? (
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
            color: 'var(--brand-gold, #fbbf24)', fontWeight: 700,
          }}>★ FROM ITINERARY</div>
        ) : a.booked ? (
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
            color: 'var(--brand-success)', fontWeight: 700,
          }}>{String.fromCodePoint(0x2713)} BOOKED</div>
        ) : null}
      </div>
      <div style={{
        fontFamily: DISPLAY, fontSize: 18, fontWeight: 400,
        letterSpacing: '-0.005em', lineHeight: 1.25, color: 'var(--brand-ink)',
      }}>
        {a.name}
      </div>
      <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.5 }}>
        {a.meta}
      </div>
      <div style={{
        marginTop: 6, paddingTop: 10,
        borderTop: '1px solid var(--brand-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{
          fontFamily: DISPLAY, fontSize: 18, fontWeight: 400,
          color: 'var(--brand-ink)',
        }}>
          {a.currency}{a.price.toLocaleString()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <a
            href={bookHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('book_intent', { kind: 'activity', provider: 'getyourguide', name: a.name, location })}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: a.booked ? 'transparent' : 'var(--brand-accent)',
              color: a.booked ? 'var(--brand-accent)' : 'var(--brand-bg)',
              border: a.booked ? '1px solid var(--brand-border-hi)' : 'none',
              fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            {a.booked ? 'Manage' : 'Book'}
          </a>
          {tripId && onItineraryAdjusted && !a.fromItinerary && (
            <button
              type="button"
              onClick={addToItinerary}
              disabled={adjusting || adjusted}
              title="Slot this activity into the existing itinerary"
              style={{
                padding: '4px 10px', borderRadius: 999,
                background: adjusted ? 'rgba(34,197,94,0.12)' : 'transparent',
                border: `1px solid ${adjusted ? 'rgba(34,197,94,0.5)' : 'rgba(167,139,250,0.32)'}`,
                color: adjusted ? '#86efac' : 'var(--brand-accent)',
                fontFamily: MONO, fontSize: 9, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: adjusting || adjusted ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}
            >
              {adjusting && (
                <span style={{ width: 8, height: 8, border: '1.4px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
              )}
              {adjusted ? '✓ Added' : adjusting ? 'Adding…' : '+ Add'}
            </button>
          )}
          {adjustError && (
            <span style={{ fontSize: 9, color: '#fca5a5', fontFamily: MONO, letterSpacing: '0.06em' }}>
              {adjustError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Insurance ─────────────────────────────────────────────────────────────
// Trip-specific quote links to the four major travel-insurance providers.
// Each URL is built around `location` + `startDate` + `endDate` + the
// origin country (when known). Where a provider's URL accepts deep-link
// params we pass them; otherwise we link to the quote-start page so the
// user only has to confirm once they land on the partner site.

function formatMMDDYYYY(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  if (isNaN(d.getTime())) return '';
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${m}/${day}/${d.getUTCFullYear()}`;
}

interface InsuranceProvider {
  name: string;
  tag: string;
  blurb: string;
  href: string;
  accent: string;
}

function buildInsuranceProviders(
  location: string,
  startDate: string,
  endDate: string,
  travelingFrom: string,
): InsuranceProvider[] {
  const dest = encodeURIComponent(location || '');
  const fromCountry = encodeURIComponent(travelingFrom || '');
  const departMD = formatMMDDYYYY(startDate);
  const returnMD = formatMMDDYYYY(endDate);
  return [
    {
      name: 'World Nomads',
      tag: 'ADVENTURE',
      blurb: 'Adventure-friendly cover that travels with you. Strong on activities like trekking, diving, and high-altitude.',
      // Their quote tool is interactive; the destination param seeds the
      // first dropdown when they recognize it. Falls through cleanly
      // when they don't.
      href: `https://www.worldnomads.com/travel-insurance?destination=${dest}&utm_source=geknee`,
      accent: '#34d399',
    },
    {
      name: 'SafetyWing Nomad',
      tag: 'LONG-TERM',
      blurb: 'Subscription medical + travel insurance. Best for digital nomads or trips longer than a few weeks.',
      href: `https://safetywing.com/nomad-insurance?utm_source=geknee&country=${dest}`,
      accent: '#7dd3fc',
    },
    {
      name: 'Allianz Travel',
      tag: 'CLASSIC',
      blurb: 'Trip cancellation, medical, baggage. Strong claims handling — the default for full-service plans.',
      // Allianz's quote URL accepts depart/return + destination on the
      // get-quote landing; if any param is unknown they show the form.
      href: `https://www.allianztravelinsurance.com/get-quote.htm?destination=${dest}${departMD ? `&depart=${departMD}` : ''}${returnMD ? `&return=${returnMD}` : ''}`,
      accent: '#a78bfa',
    },
    {
      name: 'InsureMyTrip',
      tag: 'COMPARE',
      blurb: 'Aggregator. Quotes 30+ plans side-by-side so you can compare excess and coverage limits in one view.',
      href: `https://www.insuremytrip.com/quote/?destination=${dest}${departMD ? `&depart=${departMD}` : ''}${returnMD ? `&return=${returnMD}` : ''}${fromCountry ? `&residence=${fromCountry}` : ''}`,
      accent: '#fbbf24',
    },
  ];
}

function InsuranceSection({
  location, startDate, endDate, travelingFrom = '',
}: {
  location: string; startDate: string; endDate: string; travelingFrom?: string;
}) {
  const providers = buildInsuranceProviders(location, startDate, endDate, travelingFrom);
  return (
    <section>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 14,
      }}>
        {String.fromCodePoint(0x00A7)} INSURANCE · {(location || 'TRIP').toUpperCase()} · {startDate || '—'} → {endDate || '—'}
      </div>
      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 8px',
      }}>
        Got you covered.
      </h2>
      <p style={{
        fontSize: 13, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
        maxWidth: 640, margin: '0 0 22px',
      }}>
        Quotes pre-filled with your destination and dates. Each link opens
        the provider&apos;s site in a new tab — review the policy details
        before you buy.
      </p>
      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      }}>
        {providers.map(p => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => track('book_intent', { kind: 'insurance', provider: p.name, location })}
            style={{
              display: 'flex', flexDirection: 'column', gap: 10,
              padding: '20px 22px', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--brand-border)',
              color: 'var(--brand-ink)', textDecoration: 'none',
              transition: 'border-color 150ms, transform 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = p.accent; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--brand-border)'; }}
          >
            <div style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
              color: p.accent, fontWeight: 700,
            }}>
              {p.tag}
            </div>
            <div style={{
              fontFamily: DISPLAY, fontSize: 20, fontWeight: 400,
              letterSpacing: '-0.01em', lineHeight: 1.2,
            }}>
              {p.name}
            </div>
            <p style={{
              margin: 0, fontSize: 12, color: 'var(--brand-ink-dim)',
              lineHeight: 1.55,
            }}>
              {p.blurb}
            </p>
            <div style={{
              marginTop: 6, paddingTop: 12,
              borderTop: '1px solid var(--brand-border)',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em',
              color: p.accent, fontWeight: 700, textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Get quote {String.fromCodePoint(0x2192)}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

// ─── Placeholder ───────────────────────────────────────────────────────────

function PartnerBookingsBanner({ bookings }: { bookings: PartnerBooking[] }) {
  // Group by status — confirmed gets prominence, pending shown muted.
  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const pending   = bookings.filter(b => b.status === 'pending');
  const visible   = [...confirmed, ...pending];
  if (visible.length === 0) return null;

  // Sum payout (in mixed currencies — we display each line's own
  // currency rather than collapsing). For the headline count we just
  // show how many confirmations are attributed to this trip.
  const headline = confirmed.length > 0
    ? `${confirmed.length} booking${confirmed.length === 1 ? '' : 's'} confirmed`
    : `${pending.length} booking${pending.length === 1 ? '' : 's'} pending confirmation`;

  return (
    <div style={{
      marginBottom: 16,
      padding: '12px 16px', borderRadius: 12,
      background: 'rgba(167,139,250,0.08)',
      border: '1px solid rgba(167,139,250,0.32)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em',
        color: 'var(--brand-accent)', fontWeight: 700,
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        <span aria-hidden="true">{String.fromCodePoint(0x2713)}</span>
        <span>{headline}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map(b => {
          const label = [b.partnerProgram ?? b.itemName ?? b.partner, b.itemKind].filter(Boolean).join(' · ');
          const money = b.payout != null && b.currency
            ? `${b.currency} ${b.payout.toLocaleString()}`
            : null;
          return (
            <div key={b.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 12, color: 'var(--brand-ink-dim)',
              opacity: b.status === 'pending' ? 0.6 : 1,
            }}>
              <span>{label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em' }}>
                {b.status === 'pending' ? 'PENDING' : money ?? 'CONFIRMED'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Transport ─────────────────────────────────────────────────────────────
// Region-aware list of transit-pass deeplinks. Detection is substring
// match against the trip's destination string — coarse but enough to
// surface the right city/country pass before the user even leaves the
// app. Dates are passed through where the partner site supports them.
//
// Adding a region: add a new entry with `match: /substring/i` and a
// list of options. The first match wins; the generic Klook fallback
// always renders so the user is never stuck without an option.
interface TransportOption {
  name: string;
  description: string;
  href: string;
  accent: string;
}

function regionalTransportOptions(
  location: string,
  startDate: string,
  endDate: string,
): TransportOption[] {
  const loc = location.toLowerCase();
  const dateRange = startDate && endDate
    ? `${startDate}+to+${endDate}` : '';

  // Japan — Suica IC + JR Pass.
  if (/\b(tokyo|kyoto|osaka|japan|nagoya|hokkaido|okinawa|fukuoka)\b/i.test(loc)) {
    return [
      {
        name: 'Suica IC card',
        description: 'Tap-to-ride on every train, bus, and convenience store across Japan. Pre-loaded with ¥1,500.',
        href: 'https://www.klook.com/activity/16031-japan-welcome-suica-tokyo/?aid=geknee',
        accent: '#34d399',
      },
      {
        name: 'JR Pass · 7-day',
        description: 'Unlimited bullet-train rides nationwide for 7 consecutive days. Most cost-effective for multi-city trips.',
        href: `https://www.jrpass.com/?utm_source=geknee${dateRange ? `&dates=${dateRange}` : ''}`,
        accent: '#f59e0b',
      },
      {
        name: 'Tokyo Subway · 72hr',
        description: 'Tokyo Metro + Toei Subway, unlimited for 3 days. Worth it from ~6 rides.',
        href: 'https://www.klook.com/activity/2031-tokyo-subway-pass-tokyo/?aid=geknee',
        accent: '#7dd3fc',
      },
    ];
  }

  // UK — Oyster card + BritRail.
  if (/\b(london|uk|united kingdom|england|britain|edinburgh|manchester)\b/i.test(loc)) {
    return [
      {
        name: 'Visitor Oyster card',
        description: 'Tap-to-ride on London Tube, bus, Overground. Pre-loaded with £15.',
        href: 'https://www.klook.com/activity/30135-visitor-oyster-card-london/?aid=geknee',
        accent: '#34d399',
      },
      {
        name: 'BritRail · 8-day Flexi',
        description: 'Travel UK-wide on any 8 days within a month. Best for multi-city itineraries.',
        href: `https://www.britrail.com/?utm_source=geknee${dateRange ? `&dates=${dateRange}` : ''}`,
        accent: '#f59e0b',
      },
    ];
  }

  // France / Western Europe — Navigo + Eurail.
  if (/\b(paris|france|nice|lyon|marseille|bordeaux)\b/i.test(loc)) {
    return [
      {
        name: 'Navigo Easy card',
        description: 'Paris metro, RER, bus, tram. Top up week-by-week, no photo required.',
        href: 'https://www.klook.com/activity/57108-paris-navigo-easy-card/?aid=geknee',
        accent: '#34d399',
      },
      {
        name: 'Eurail · France Pass',
        description: 'TGV + intercity rail across France for chosen travel days within 1 month.',
        href: `https://www.eurail.com/en/eurail-passes/one-country-pass/france?utm_source=geknee${dateRange ? `&dates=${dateRange}` : ''}`,
        accent: '#f59e0b',
      },
    ];
  }

  // Italy.
  if (/\b(rome|italy|venice|florence|milan|naples)\b/i.test(loc)) {
    return [
      {
        name: 'Rome 72h Tourist Card',
        description: 'Unlimited Rome metro + bus + tram for 3 days.',
        href: 'https://www.klook.com/activity/16127-roma-pass-rome/?aid=geknee',
        accent: '#34d399',
      },
      {
        name: 'Eurail · Italy Pass',
        description: 'Frecciarossa + intercity rail across Italy on chosen travel days within 1 month.',
        href: `https://www.eurail.com/en/eurail-passes/one-country-pass/italy?utm_source=geknee${dateRange ? `&dates=${dateRange}` : ''}`,
        accent: '#f59e0b',
      },
    ];
  }

  // South Korea.
  if (/\b(seoul|korea|busan|jeju)\b/i.test(loc)) {
    return [
      {
        name: 'T-money card',
        description: 'Seoul subway + bus + KTX top-ups. Tap-to-ride across the entire transit network.',
        href: 'https://www.klook.com/activity/15828-t-money-card-seoul/?aid=geknee',
        accent: '#34d399',
      },
      {
        name: 'Korea Rail Pass',
        description: 'Unlimited KTX + standard train rides nationwide for chosen consecutive days.',
        href: `https://www.letskorail.com/ebizbf/EbizBfKrPassAction.do?utm_source=geknee${dateRange ? `&dates=${dateRange}` : ''}`,
        accent: '#f59e0b',
      },
    ];
  }

  // Singapore / SEA hubs.
  if (/\b(singapore|hong kong|bangkok|thailand|kuala lumpur|malaysia)\b/i.test(loc)) {
    return [
      {
        name: 'Local IC card',
        description: 'Pre-loaded contactless card for metro + bus on day one.',
        href: `https://www.klook.com/search?query=${encodeURIComponent(location)}+IC+card&aid=geknee`,
        accent: '#34d399',
      },
      {
        name: 'Klook day passes',
        description: 'Tourist passes, airport express, day rides — region-specific options.',
        href: `https://www.klook.com/search?query=${encodeURIComponent(location)}+transport+pass&aid=geknee`,
        accent: '#7dd3fc',
      },
    ];
  }

  // Generic fallback — Klook covers most destinations worldwide for
  // transport passes; we drop the search term in so the result list
  // lands on something usable instead of an empty landing page.
  return [
    {
      name: 'Klook · Transport passes',
      description: `Curated transit + day-pass options for ${location}.`,
      href: `https://www.klook.com/search?query=${encodeURIComponent(location + ' transport pass')}&aid=geknee`,
      accent: '#7dd3fc',
    },
    {
      name: 'Omio',
      description: 'Train, bus, and ferry tickets across Europe + global routes.',
      href: `https://www.omio.com/search-frontend/results?to=${encodeURIComponent(location)}${startDate ? `&departureDate=${startDate}` : ''}`,
      accent: '#34d399',
    },
  ];
}

function TransportSection({ location, startDate, endDate, tripId }: {
  location: string;
  startDate: string;
  endDate: string;
  tripId?: string;
}) {
  // Universal TP-attributed options that work for any destination.
  // Sub-id carries the tripId so conversions get tagged in TP reports.
  const sub = tripId ? `trip-${tripId}` : 'transport';
  const universal = [
    {
      name: 'Kiwitaxi · Airport transfer',
      description: 'Pre-book a private car from the airport to your hotel. Works in 100+ countries.',
      href: kiwitaxiUrl(sub),
      accent: '#fbbf24',
    },
    {
      name: 'GetRentACar · Rental cars',
      description: 'Compare 800+ rental suppliers worldwide. Free cancellation on most pickups.',
      href: getrentacarUrl(sub),
      accent: '#7dd3fc',
    },
    {
      name: 'EconomyBookings · Budget cars',
      description: 'Same global inventory pool, often cheaper on long rentals. Worth comparing.',
      href: economybookingsUrl(sub),
      accent: '#a78bfa',
    },
    {
      name: 'Airalo · eSIM data',
      description: 'Stay online abroad without roaming fees. Install in 5 min, pay-as-you-go plans.',
      href: airaloUrl(sub),
      accent: '#34d399',
    },
  ];
  const options = [...universal, ...regionalTransportOptions(location, startDate, endDate)];
  const dateLabel = startDate && endDate
    ? `${startDate} → ${endDate}`
    : 'dates not set';
  return (
    <section>
      <div style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em',
        color: 'var(--brand-ink-mute)', fontWeight: 700, marginBottom: 14,
      }}>
        {String.fromCodePoint(0x00A7)} TRANSPORT · {options.length} OPTIONS · {dateLabel}
      </div>
      <h2 style={{
        fontFamily: DISPLAY, fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 400,
        letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 8px',
      }}>
        How will you get around?
      </h2>
      <p style={{
        fontSize: 13, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
        margin: '0 0 20px', maxWidth: 540,
      }}>
        Tap-to-ride IC cards, multi-day passes, and intercity rail — links pre-fill with your destination
        {startDate && endDate ? ` and travel dates` : ''}.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
      }}>
        {options.map((opt) => (
          <a
            key={opt.name}
            href={opt.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('book_intent', { kind: 'transport', provider: opt.name, location, tripId })}
            style={{
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--brand-border)',
              borderLeft: `3px solid ${opt.accent}`,
              borderRadius: 14,
              display: 'flex', flexDirection: 'column', gap: 8,
              textDecoration: 'none', color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <div style={{
              fontFamily: DISPLAY, fontSize: 18, fontWeight: 400,
              letterSpacing: '-0.005em', color: 'var(--brand-ink)',
            }}>{opt.name}</div>
            <div style={{
              fontSize: 12, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
            }}>{opt.description}</div>
            <div style={{
              marginTop: 4, paddingTop: 10,
              borderTop: '1px solid var(--brand-border)',
              fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
              color: opt.accent, fontWeight: 700, textTransform: 'uppercase',
            }}>
              Buy &rarr;
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function PlaceholderSection({ title, detail }: { title: string; detail: string }) {
  return (
    <section>
      <div style={{
        padding: '40px 24px', textAlign: 'center',
        border: '1.5px dashed var(--brand-border)',
        borderRadius: 14,
      }}>
        <div style={{
          fontFamily: DISPLAY, fontSize: 22, fontWeight: 400,
          color: 'var(--brand-ink)', marginBottom: 8,
        }}>
          {title}
        </div>
        <p style={{
          fontSize: 13, color: 'var(--brand-ink-dim)', lineHeight: 1.55,
          maxWidth: 460, margin: '0 auto',
        }}>
          {detail}
        </p>
      </div>
    </section>
  );
}
