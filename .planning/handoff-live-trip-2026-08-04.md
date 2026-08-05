# Handoff — Live-Trip + Itinerary — 2026-08-04

Session 3 in the live-trip series. Continues from
`.planning/handoff-live-trip-2026-08-03.md` (Round 1-3 build)
and `.planning/handoff-live-trip-2026-08-03-p2.md` (Round 4-7).

---

## What shipped this session

### Map surface

| Commit | Change |
|---|---|
| `af26fa7` | Removed "+ Add stop" and "Full map" overlay pills, removed SAY IT NOW section, hardened `place_changed` handler against Google's partial place objects (unwrapped `opening_hours.isOpen()` crash), added tap-a-pin card hydration (numbered destination pins now open the same info card as search), added "+ Add to trip" button to the info card. |
| `f88dee3` | Search bar on the map with Places Autocomplete → drops a sky-blue pin + shows photos, rating, top-3 reviews, address, open-now chip. |
| `a391eee` | Pinned search bar and SearchedPlaceCard to `top: 8px` / `top: 68px` inside the map wrapper (was `bottom: 12`). |

### Layout / density / scroll containment

| Commit | Change |
|---|---|
| `92c6690` | Wrapped stop-schedule + weather + after-that in a `minmax(0, 1fr)` grid so their horizontally-scrolling children don't push the whole page wider than the viewport. |
| `fa4a820` | Layout-root scroll lock + auto-unstick on mount (later replaced by `f0ac31d`). |
| `f0ac31d` | Definitive fix: new `TripHorizontalLock` client component stamps `.geknee-x-lock` on `html + body` on mount. Matching rule in `globals.css` (`overflow-x: hidden !important; max-width: 100vw; overscroll-behavior-x: none`). Replaced two `scrollIntoView({inline:'center'})` calls (day-pill row + DayTimeline) with direct `scrollLeft` assignment so they can't bubble to the outer viewport. |
| `8612e14` | Day pills back to single-line horizontal scroll (dropped `flex-wrap`); map height calc tightened. |
| `156be92` | Locked outer horizontal scroll (initial attempt, later superseded by `f0ac31d`). |
| `09c1153` | Promoted schedule/weather/after-that below the map. |
| `3e90214` | Shrunk top chrome: top-bar padding 12→8, gap 10→6, chip padding 8/12→5/10, chip font 11→10; day-pill row padding 10→6, pill padding 6/14→4/12, font 12→11, minHeight 32→26. Net +32px map. |

### Content cards

| Commit | Change |
|---|---|
| `6cd3a45` | Monument-quest UI: gold "🏆 QUEST · UNLOCKS <MONUMENT>" pill on LEAVE-BY hero + gold-outlined day-timeline tiles when the next stop is a curated monument. Detection in new `lib/monumentQuest.ts` (imports `INFO` + `MONUMENT_LATLON` from `app/plan/location/globe/`). |
| `86c7ded` | Tightened matcher — removed single-word aliases (`taj`, `fuji`, `giza`, `burj`, `petra`, `eiffel`…). Aliases must be ≥ 8 chars AND ≥ 2 words. Second-tier match uses full-phrase word-boundary containment (no raw substring, no reverse direction). |
| `ea0937e` | AFTER THAT card expanded — removed 2-line clamp, moved time into header label, added mono `@ PLACE` subtitle, wired quest pill. |
| `789eb6c` | Reordered below-map: DAY STOPS → SKIP THE LINE → LEAVE-BY → AFTER THAT → WEATHER → PACK FOR TODAY → QUICK CAPTURE. Added `ITINERARY` chip to top nav (route: `/plan/[id]/itinerary?stay=1`). SkipLineCard checks the trip's file vault; when a `booking`-tagged file mentions the current place, it swaps buy links for a green TICKET READY panel with a direct "Open ticket" URL. |

### Itinerary page

| Commit | Change |
|---|---|
| `9daee26` | Renamed live-page PLAN chip to LIVE. Itinerary page now reads `?stay=1` from the URL and skips the in-flight-trip auto-redirect to `/live` — explicit taps land on the AI plan; deep links / email tabs (no `?stay`) still bounce during a live trip. |
| `73a6bc7` | Sticky `← BACK TO LIVE` bar at top of itinerary page when `?stay=1` present. z-index 9500 puts it above the SummaryView modal so users can always get back. |
| `29fd7fa` | Itinerary day-step thumbs cycle through `/api/place-images` array instead of always using `images[0]`. New module-scoped `imagePool` + `variantSeq` counter in `ActivityBlock.tsx`. Falls back to single photo when pool has one; null when Google returns nothing. |

---

## Files touched this session

```
app/globals.css                                             (added .geknee-x-lock rule)
app/plan/[tripId]/(tabs)/itinerary/page.tsx                 (stay=1 + Back to Live bar)
app/plan/summary/components/ActivityBlock.tsx               (photo rotation)
app/trip/[tripId]/layout.tsx                                (TripHorizontalLock)
app/trip/[tripId]/TripHorizontalLock.tsx                    (NEW — client component)
app/trip/[tripId]/live/page.tsx                             (bulk of the reorg)
app/trip/[tripId]/live/GoogleLiveMap.tsx                    (search + tap-a-pin)
lib/monumentQuest.ts                                        (NEW — quest detector)
```

---

## Current page layout (live-trip, top → bottom)

1. Sticky top bar (Row 1: live-dot + DAY / TOTAL · city ← → clock. Row 2: OFFLINE READY chip + LIVE / ITINERARY / BOOK / VAULT chips)
2. Sticky day-pill row (single-line horizontal scroll)
3. Offline-download status pill row (when applicable)
4. **Map** (`calc(100dvh - env(safe-area-inset-top) - 112px)`, with floating search bar + SearchedPlaceCard at top)
5. **DAY STOPS** (day timeline, horizontal scroll)
6. **SKIP THE LINE** (activities ticket monitoring; swaps to TICKET READY when vault file matches)
7. **LEAVE IN X MIN** hero card
8. **AFTER THAT**
9. **WEATHER** (with 24h hourly scroll strip)
10. PACK FOR TODAY (dismissible per-day)
11. QUICK CAPTURE row
12. Destination insight (Wikipedia)
13. LANDMARK GUIDE
14. Country cheat-sheet
15. AT THIS PLACE (activity-type tips)
16. TODAY IN TOWN (local color)
17. PHOTO WINDOW (rare hero card)
18. SAY IT LOCAL (phrases)
19. CROWDS (arrival-slot aware)
20. TODAY'S PULSE (day + spend + captures)
21. Live budget
22. Safety
23. TONIGHT'S CAPTURE (evening journal, 18:00+ trigger)

Note: MEAL CADENCE, NEXT 3 HOURS, GOLDEN HOUR, SAY IT NOW were removed this session per user requests.

---

## Rules currently baked in

- **Horizontal scroll**: locked at `html + body` via `.geknee-x-lock`. Only day-stops timeline and weather-hourly strip can scroll left/right. Day-pill row also scrolls, but internally.
- **Photo rotation**: `ActivityBlock.PlaceThumb` picks `images[seq % length]` where `seq` bumps per mount for that `place||city` key.
- **Quest detection** (`lib/monumentQuest.ts`): only fires on curated INFO monuments; alias must be ≥ 8 chars AND ≥ 2 words; word-boundary containment only, no substring or reverse-direction match.
- **Skip-the-line vs Vault**: SkipLineCard fetches `/api/trips/:id/files`, filters for `tag=booking` whose `name` contains a ≥5-char token from the current activity's place. Booked → TICKET READY panel; otherwise → curated vendor links filtered by `bookByHour`.
- **PLAN chip** anchors to `/trip/[id]/live` (renamed to LIVE). **ITINERARY chip** goes to `/plan/[id]/itinerary?stay=1`.

---

## Known bugs / things next session should verify

- **Vercel build reliability**: two builds in this session timed out at 45-46m before eventually landing. Empty-commit push always kicks the queue back to life. The 3.3GB `public/` (2.6GB monument GLBs) may finally be hitting Vercel's build-machine limits — long-term move GLBs to Blob storage. Vercel CLI 51.1.0 is silently failing direct-CLI deploys; recommend `npm i -g vercel@latest` (58.4.4).
- **Screen-recording glitch**: user reported "keeps on glitching and won't let me back out of this map" on the itinerary page. Fixed the missing "back to live" affordance via the sticky bar (`73a6bc7`), but the underlying "glitch" (visual re-render loop?) wasn't rooted — verify on next look.
- **BackButton in trip tabs layout** still goes to `/plan/location`. When a user lands on ITINERARY from LIVE, the sticky Back-to-Live bar handles the return; but Booking/Vault tabs still route back to the globe. If that's confusing, apply the same `?stay=1` treatment to those chips.
- **Photo pool cache lives forever** in the client (module-scoped Map). Fine for a single session; if it grows too large for extremely-long trips consider capping to ~200 entries. Not urgent.
- **Search-bar Autocomplete billing**: each `place_changed` costs a Basic + Contact + Atmosphere fields call. Might want to session-token-scope like the plan/[id]/map page does if traffic scales. Current setup matches the plan/map surface.

---

## Full commit trail this session (newest first)

```
29fd7fa itinerary: rotate through place photos, don't reuse image[0]
73a6bc7 itinerary: sticky "Back to Live" bar when arrived from live trip
9daee26 live-trip: fix ITINERARY bounce + rename PLAN chip to LIVE
3e90214 live-trip: shrink top chrome, grow the map ~32px
789eb6c live-trip: reorder cards, add ITINERARY tab, deep-link vault
b8f7321 chore: trigger vercel rebuild after cancel
72bb78b chore: trigger vercel redeploy
8612e14 live-trip: day pills back to single-line scroll, grow the map
ea0937e live-trip: expand AFTER THAT card to show full activity
f0ac31d live-trip: nail the horizontal-scroll lock and unstick users
fa4a820 live-trip: layout-root scroll lock + auto-unstick on mount
92c6690 live-trip: contain page width — day stops + weather scroll internally
156be92 live-trip: lock horizontal scroll except day stops + weather
09c1153 live-trip: promote schedule/weather/after-that below the map
86c7ded live-trip: tighten monument-quest detection
6cd3a45 live-trip: flag monument-quest stops with gold hero styling
a391eee live-trip: pin search bar and info card to top of the map
f88dee3 live-trip: search bar on map with photos + reviews
af26fa7 live-trip: remove overlay pills, harden search, tap-a-pin cards
```

## Deferred / next-session candidates

Carried over from `-p2.md` still open:

1. Server-persist tripNotes (bridge `lib/tripNotes.ts` localStorage → DB).
2. Bathroom finder (Google Places nearby, `type=public_toilet`).
3. eSIM/Wifi card (Airalo + Travelpayouts marker 716767).
4. Trip stream export ("download today's captures as .zip").
5. Closing-soon warning card (needs Google Places `opening_hours`).
6. Air Quality chip (Google Air Quality API).
7. Altitude sickness warning for high-altitude cities.

New in this session:

8. **Vercel deploy stability** — investigate why long-duration builds fail; consider blob-hosting GLBs to shrink the deploy tarball.
9. **Update Vercel CLI** to 58.4.4 so direct-CLI deploys work as a fallback when GitHub webhook queue is jammed.
10. **BookView / Vault chips → `?stay=1`** treatment if users report the same "trapped on tab" issue there.
11. **Glitch root cause** — user's screen recording showed visual re-render loops; verify with the browse skill after refresh.

---

## Deployment state at handoff

- Latest commit: `29fd7fa` (photo rotation)
- Vercel prod alias: pending build settle — last confirmed on `9daee26` (`e3uqp6792`); `73a6bc7` and `29fd7fa` were pushed after that and should alias when their builds finish.
