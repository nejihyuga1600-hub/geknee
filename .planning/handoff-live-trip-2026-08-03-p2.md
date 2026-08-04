# Handoff — Live-Trip Page — 2026-08-03 (session 2)

Continuation of `.planning/handoff-live-trip-2026-08-03.md` (dcd3df9).
All 7 approved cards shipped + 3 bonus round-2 cards + 1 audit closed.

---

## What shipped this session

### Round 1 — 4 curated-data cards (commit `4f3f3c2`, deployed)

| Card | File | Behavior |
|---|---|---|
| `TODAY IN TOWN` | `lib/localColorByCity.ts` | Weekly markets + annual festivals, 7 cities (Prague, Paris, Rome, Barcelona, London, NYC, Tokyo). Filters by weekday + date-range so only what's happening TODAY shows. Silent-on-miss. |
| `CROWDS` (extended) | in-file | Now accepts `etaMin`, projects arrival hour, colors arrival bar sky-blue (vs current green). Actionable rec: "Off-peak arrival" / "Try 2h earlier — ~30%" / "Peak — rush hits 2 PM". |
| `GUIDE` | `lib/landmarkGuides.ts` | 16 curated landmarks with ~1-paragraph intro + 2-3 facts + best-time + insider tip. Fuzzy name match strips diacritics + articles. Read-more expander. |
| `SKIP THE LINE` | `lib/skipLineTickets.ts` | Vendor deep-links (GetYourGuide / Viator / Tiqets / official). Filters by `bookByHour` so we don't dangle late-night bookings past timed-entry cutoffs. |

### Round 2 — 3 interactive cards (commit `fd2eea7`, deployed)

| Card | File | Behavior |
|---|---|---|
| `QUICK CAPTURE` | in-file + `lib/tripNotes.ts` | Camera + note buttons pinned under LEAVE-BY hero. Photo → canvas-scaled JPEG (1200 px / q0.72). Auto-tag time + place + tempC + coords. localStorage-backed (200-entry soft cap). Expandable "N today" strip with inline delete. |
| `TONIGHT'S CAPTURE` | in-file | 18:00-local prompt above the LEAVE-BY hero: "One thing that surprised you today?" Text + optional photo. Auto-hides once a journal entry exists for the day OR user dismisses. 60s tick so the 18:00 threshold fires without reload. |
| `TODAY'S PULSE` | in-file | Day X of N + stage-vibe copy ("Halfway through"). Three tiles: spend today (from `/api/trips/[id]/expenses`), captures + photos (from tripNotes), trip progress %. |

### Round 3 — brainstorm bonus (commit `3b31862`, deployed)

| Card | File | Behavior |
|---|---|---|
| `PACK FOR TODAY` (intensified) | in-file | Heat >34 °C → "avoid sun 12–3 PM". Cold <-5 °C → thermal base advice. Rain >75 % → "consider a cab". Wind added via `currentWeather.current.windKph` (25 / 45 km/h tiers). |
| `PHOTO WINDOW` | in-file | Rare hero-tier alert. Fires only when (a) golden hour is inside 90 min, (b) sky isn't overcast/rainy/foggy, (c) next stop is a curated landmark. Says "perfect timing" when ETA lands inside window. |
| `MEAL CADENCE` | `lib/mealCadenceByCountry.ts` | Country meal windows (10 countries seeded). State machine: `active` (with `minsUntilCloses`) / `next` (with `minsUntilOpens`) / `closed_all`. 5-min tick so "lunch closes in 22 min" ticks down. |

### Audits closed

- **Directions API cache** — verified 24h KV/mem + CDN, keyed at 4-decimal precision. Handoff-noted per-day-panning cost concern is a non-issue.

---

## Files added this session

```
lib/localColorByCity.ts        362 lines · markets + festivals per city
lib/landmarkGuides.ts          224 lines · 16 landmarks + fuzzy match
lib/skipLineTickets.ts         278 lines · vendor deep-links
lib/tripNotes.ts               138 lines · localStorage-first storage
lib/mealCadenceByCountry.ts    106 lines · meal windows
```

## Files modified

```
app/trip/[tripId]/live/page.tsx    +1130 lines (10 new components)
```

## Card render order after this session (top → bottom)

1. Sticky top bar
2. Sticky day pills
3. Offline-cached pill row
4. **Fullscreen map**
5. **TONIGHT'S CAPTURE** (18:00+ evening only) ← NEW
6. **LEAVE-BY hero**
7. **QUICK CAPTURE row** ← NEW
8. **Destination insight** (Wikipedia)
9. **GUIDE** (landmark write-up) ← NEW
10. **SKIP THE LINE** ← NEW
11. **Money & basics** (country cheat-sheet)
12. **At this place** (activity tips)
13. **TODAY IN TOWN** ← NEW
14. **Next 3 hours** (micro-forecast)
15. **Golden hour**
16. **PHOTO WINDOW** ← NEW
17. **Say it now** (greeting)
18. **Pack for today** (intensified)
19. **Say it local** (phrases)
20. **MEAL CADENCE** ← NEW
21. NEXT / WEATHER / CROWDS grid (crowds now ETA-aware)
22. Day timeline
23. **TODAY'S PULSE** ← NEW
24. Live budget
25. Safety

---

## Deployment state

- `4f3f3c2` — Ready (Round 1)
- `fd2eea7` — Ready (Round 2)
- `3b31862` — Ready (Round 3)

`git push` to `main` was the trigger for each; no manual deploy needed.

---

## Deferred / next-session candidates

Curated brainstorm items NOT built this round — good starting points for
the next iteration:

1. **Server-persist tripNotes** — bridge `lib/tripNotes.ts` localStorage
   to a real DB. Schema needs a `TripNote` model (photoUrl to Vercel
   Blob, text, tags JSON). Would unlock cross-device sync.
2. **Bathroom finder** — universal traveler need. Google Places nearby
   search for `type=public_toilet` or fallback to `type=cafe` w/ big
   chains. One-tap directions.
3. **eSIM/Wifi card** — Travelpayouts affiliate revenue. Show best
   Airalo plan for the country w/ marker `716767`.
4. **Trip stream export** — one-tap "download today's captures as
   .zip" from the QuickCaptureRow. High-value trip-book seed.
5. **Closing-soon warning** — needs Google Places `opening_hours` on
   the next stop. Would say "Colosseum closes in 45 min, your ETA is
   40 min — cutting it close." High safety/planning value.
6. **Air Quality chip** — Google Air Quality API (in the Wave-3
   deferred list per CLAUDE.md). Small AQI dot on the WeatherCard.
7. **AtThisPlace activity search** — link out to GetYourGuide
   category search for the current activity type.
8. **Altitude sickness warning** — for high-altitude cities (Cusco,
   La Paz, Machu Picchu): "You're at 3,400 m — take it slow, hydrate,
   avoid alcohol day 1."

## Known good patterns (reuse for future cards)

- **Silent-on-miss**: every card returns `null` when its data source is
  empty. Prevents empty rows on unsupported destinations.
- **Fuzzy landmark key**: `normalizeLandmarkKey()` exported from
  `lib/landmarkGuides.ts` — reuse when adding new landmark-keyed maps
  so they share the same key space.
- **CardShell**: shared `./CardShell.tsx` with `accent` + `label` for
  the mono uppercase header pill. Use `var(--brand-*)` tokens for
  colors.
- **useMemo on parsed data**: all lookups (`todaysHappenings`,
  `guideFor`, `ticketsFor`, `currentMealContext`) wrapped in `useMemo`
  keyed on the input.
- **localStorage soft-cap + quota fallback**: `saveNote` in tripNotes
  is the pattern — try full write, on QuotaExceeded halve and retry.

## Full commit trail (this session, newest first)

```
3b31862  live-trip: photo window + meal cadence + weather intensifiers
fd2eea7  live-trip: quick capture + evening journal + daily pulse
4f3f3c2  live-trip: today-in-town + landmark guides + skip-the-line + crowd ETA
dcd3df9  handoff: 2026-08-03 live-trip session — 7 approved cards queued
```
