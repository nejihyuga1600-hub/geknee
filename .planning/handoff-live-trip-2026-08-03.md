# Handoff — Live-Trip Page — 2026-08-03

Prior session made major upgrades to `/trip/[tripId]/live/`. Full commit
trail on `main`, all deployed to prod via Vercel.

---

## Where things stand

### Files touched
- `app/trip/[tripId]/live/page.tsx` — most changes
- `app/trip/[tripId]/live/GoogleLiveMap.tsx` — routes-by-mode, coord dedupe
- `app/trip/[tripId]/live/SafetyCard.tsx` — unified emergency number layout
- `app/trip/[tripId]/live/CardShell.tsx` — accent-tinted gradient
- `app/api/weather/route.ts` — hourly forecast endpoint
- `lib/googleMaps/weatherClient.ts` — `hourly` field + `hours` param
- `lib/countryCheatsheet.ts` — NEW; ~30 countries hardcoded

### Card render order on the page (top → bottom)

1. Sticky top bar (LIVE / DAY N-M · city  ·  clock)
2. Sticky day-pill row (horizontal scroll, snap-to-today)
3. Offline-cached pill row
4. **Fullscreen map** (`height: calc(100dvh - env(safe-area-inset-top) - 148px)`)
5. **LEAVE-BY hero** (rich geknee gradient + glow)
6. **Destination insight** (Wikipedia summary + thumb)
7. **Money & basics** (country cheat-sheet)
8. **At this place** (activity-type tips)
9. **Pack for today** (weather-driven items)
10. **Next 3 hours** (micro-forecast)
11. **Golden hour** (sunrise/sunset + photo-light window)
12. **Say it now** (time-of-day greeting)
13. **Say it local** (hello/thanks/bathroom phrases)
14. NEXT / WEATHER / CROWDS grid
15. Day timeline (horizontal scroll, snap-to-NOW)
16. Live budget
17. **Safety** (moved to bottom — was in the fold)

---

## User-approved additions NOT yet built

Priority order the user picked from the brainstorm. **All were approved
via `/AskUserQuestion`.** Ship in this order:

### 1. Today's local color
Weekly market days + local festivals happening TODAY near the trip
city. **Implementation:** static per-city JSON at `lib/localColorByCity.ts`.
Fields: `{ dayOfWeek: 0-6, name: string, hours: string, place: string,
locationLat: number, locationLng: number }[]`. Card filters by
`new Date().getDay()` and shows all matches. Silent when city has no
entry. Seed with Prague, Paris, Rome, Barcelona, London, NYC first.

### 2. Live crowd prediction
"Crowds peak at 2 PM. You'll arrive 2:15, expect ~20-min wait." Uses
Google Places `populartimes`. `CrowdsCard` already partly fetches this
via `/api/places-nearby`; need to extend to `Place Details`
(`populartimes` field). Combine with the `etaMin` we already compute
for LEAVE-BY to project the arrival slot's crowd level. Fallback to
current-hour crowd when ETA is unknown.

### 3. Text guide per landmark
Static curated landmark descriptions (~1 paragraph + 2-3 fun facts) at
`lib/landmarkGuides.ts`. Keyed by lowercase place name (fuzzy match).
User specifically deferred audio — text-only for MVP. Falls back
silently when no entry. Extend with Places `editorial_summary` field if
we ever pay for that tier.

### 4. Skip-the-line ticket link
Static curated `lib/skipLineTickets.ts` mapping landmark name →
`{ url, price, currency, bookByHour? }`. Card shows a button when the
next stop is in the map; deep-links out. Seed with Prague Castle,
Louvre, Colosseum, Eiffel Tower first.

### 5. Inline photo/note capture
Pinned camera + note buttons on the LEAVE-BY card. Photo → device
picker → upload to Vercel Blob (existing pattern in
`lib/blobUpload.ts`?) or the trip-vault route. Note → text input,
saved to `TripDraft.notes[]` field. Auto-tag with `{ time, place,
weather.tempC }`. Backend: verify `/api/trip/[id]/note` route exists
or add.

### 6. End-of-day journal prompt
Evening trigger (18:00 local trip TZ). New card at the top of the
LEAVE-BY area asking "Note one thing that surprised you today." Text
+ optional photo. Saves to `TripDraft.journal[]`. Card dismisses for
today after submit or explicit skip; state in `localStorage['geknee:
journal-dismissed-{tripId}-{yyyy-mm-dd}']`.

### 7. Daily trip pulse
"Day 5 · walked 4.2 km · 12,300 steps · ~$45 spent." Steps via
`DeviceMotionEvent` / iOS Pedometer (needs the Capacitor Motion
plugin already? check `capacitor.config.ts`). Spend from
`BudgetTracker` state — bubble the "today" total up so a sibling
card can read it. Web fallback: hide the steps row when no
motion API.

---

## Known bugs / gotchas the next session should verify

- **Directions cost.** New per-leg route fetches (commit `e9cb89c`) fire
  once per pair of stops per day toggle. Verify `/api/directions` is
  KV-cached; if a user pans between 7 days repeatedly they can rack up
  Google Directions calls. Add per-`{origin,dest,mode}` key cache in
  a ref if this bites.
- **Wikipedia CORS.** `PlaceInsightCard` fetches
  `en.wikipedia.org/api/rest_v1/page/summary/…` client-side. Works in
  browser + Capacitor WKWebView per manual testing but if this ever
  breaks add a proxy at `/api/wiki-summary`.
- **Hourly weather rate limit.** `?hours=24` adds one Google Weather
  API call per page load. Already CDN-cached at 1 hour per weather
  route header; verify the Vercel edge cache is working.
- **Pin dedupe over-collapse.** Coord dedupe is 15 m radius. If two
  legitimate close stops (e.g. two restaurants across a plaza)
  collapse to one pin, widen to > 25 m or gate on same-name.

---

## Full commit trail (this session, newest first)

```
8cb043f  live-trip: golden hour + micro-forecast + contextual greeting
34dc205  live-trip: pack-for-today + at-this-place tips
46acd77  live-trip: country cheat-sheet + local phrases
10e7dc7  live-trip: coord-level pin dedupe + broader parse dedupe
54d5101  live-trip: dedupe day activities + geknee-brand hero card polish
621cac8  live-trip: destination insights, hourly weather strip, card gradients
e9cb89c  live-trip: mode-aware route lines + fix missing pins
f45a7b0  live-trip: expand page horizontally + safety card at the bottom
927f348  live-trip: fix TS error — wrap requestGeolocation in an arrow
b9e3481  live-trip: sticky day pills + persistent geo permission + map minus chrome
a8ee475  live-trip: fill-screen inline map + single-row day pills
c16e1fb  live-trip: font trim + stop numbers + descriptive weather + fullscreen map + location prompt
cf2f5d1  live-trip: redesign top bar, strip markdown, scroll timeline, dedupe safety
```

Plus map / crash / label / border work under `app/plan/location/atlas/*`,
`app/components/MonumentShop.tsx`, and `public/monument-cards/*` earlier
in the session. Sentry issue `JAVASCRIPT-NEXTJS-1K` last event was on
`5acba88` (pre-cap revert); nothing tagged to newer commits at time of
handoff — but the cap fix was reverted at user request, so watch for
mount-time respawns to reappear as the WKWebView budget tightens.
