# Wave 3 — Design Notes (deferred)

**Date:** 2026-05-21
**Status:** Design notes; each item needs its own spec → plan → execute pass before code.

## Why this doc

Wave 1 (Street View, Weather, Time Zone) and Wave 2 (Places API New, Routes API, Maps Static OG cards) shipped under `docs/superpowers/specs/2026-05-20-google-maps-platform-waves-design.md`. This doc captures the Wave 3 items that were intentionally deferred because each one needs upstream product decisions before code can be specified meaningfully.

The user has enabled all the relevant APIs on `GOOGLE_PLACES_API_KEY`, so any of these can be turned on with zero infra setup once the product UX is decided.

---

## W3.1 — Maps Grounding Lite (AI agent upgrade) 🟢 most-actionable

**One-line:** Replace `lib/agent/tools/find_places.ts` (and possibly `geocode.ts`) with calls to Maps Grounding Lite, an API designed for LLM consumption with place data already shaped for agent reasoning.

**Why now:**
- The agent (Anthropic Claude in `app/api/chat/route.ts`) already uses three Google-backed tools: `find_places`, `geocode`, `route_between`. Of those, `find_places` is the one most often used in trip planning, and the legacy Places API returns a lot of noise for LLM context (Places shape vs LLM-friendly shape).
- Grounding Lite is structured for LLM grounding: returns descriptions, salient attributes, and structured location refs that fit naturally into a tool result without further filtering.
- Could subsume Phase 5 (server-side `route_between.ts` Mapbox migration) since Grounding Lite handles place + route grounding together.

**Open product questions before spec:**
1. Does Grounding Lite return the fields the agent currently consumes (name, lat/lng, type, rating, photos)? Need an API exploration spike (curl a real query, inspect the response shape).
2. Pricing tier? Grounding Lite has separate billing from the legacy Places APIs.
3. Should we keep `find_places` as a fallback when Grounding Lite returns zero results, or fail closed?
4. The chat already injects weather context (Phase B.2). Does Grounding Lite duplicate that? Or do we replace the weather injection with Grounding Lite's grounding output entirely?

**Suggested next step:** 30-minute API exploration spike. Curl the Grounding Lite endpoint with a representative trip-planning query ("things to do near Tokyo Station"), compare the response shape to what `find_places` currently returns, decide whether the migration is a 1-to-1 swap or a bigger refactor.

**Estimated cost impact:** unknown (new product, beta pricing not yet stable as of 2026-05). Could be net-positive if Grounding Lite is cheaper than per-place Places API calls.

**Estimated effort:** small if the response shape maps cleanly (~1 day implementation); medium if the agent tool interface needs a refactor (~3 days).

**Files that would change:**
- `lib/agent/tools/find_places.ts` — body rewrite
- Possibly `lib/agent/tools/geocode.ts` — body rewrite
- `app/api/chat/route.ts` — system prompt context injection might simplify

---

## W3.2 — Aerial View API (cinematic flyover videos) 🟡

**One-line:** When a user drops the purple portal on a new destination, request a cinematic 30-second flyover video from Aerial View API and play it as the destination's "hero" intro.

**Why interesting:** Major UX wow factor. Travel decisions are emotional; a flyover viscerally answers "what's this place like?" better than a static map.

**Open product questions before spec:**
1. **Trigger UX:** auto-play on first portal-drop? Or behind a "preview" button? Auto-play has discoverability + delight but also bandwidth + uncanny-when-it-fails.
2. **Async UX:** Aerial View returns a polling-based job. Median latency is reportedly 30-60 seconds for video generation. What does the user see during that window? Loading skeleton? Static map fallback? Notification when ready?
3. **Caching:** videos generated for one user could be reused for everyone targeting the same coordinate. Server-side storage (Vercel Blob) for global cache.
4. **Mobile/data:** auto-playing video on cellular is a real cost concern. Per-user setting? Detect connection type?

**Suggested next step:** product/design brainstorm to nail down the trigger UX. Then API exploration spike to understand polling latency in practice.

**Estimated cost impact:** Aerial View pricing is per-video-generation (~$0.50-2 per video at current rates). With per-coordinate caching at scale, marginal cost is low; without caching, this is expensive fast.

**Estimated effort:** medium-high. Video player, polling state machine, server-side video URL cache (likely Vercel Blob), CDN distribution.

**Files that would change:**
- New `/api/aerial-view/[lat]/[lng]/route.ts` (polling endpoint)
- New `<AerialFlyover>` component
- `app/plan/location/LocationClient.tsx` — wire to portal-drop event
- `lib/cache/aerialViewCache.ts` — server-side blob URL cache

---

## W3.3 — Air Quality + Pollen APIs (health-conscious filters) 🟡

**One-line:** Surface AQI and pollen data so users can filter hotels by neighborhood air quality and get pollen warnings if they're allergy-prone.

**Why interesting:** Genuine differentiation for a travel app — most competitors don't surface this. Also opens the door to a "health profile" feature on user accounts.

**Open product questions before spec:**
1. **Where does it surface?** Trip summary day cards (forecast pollen)? Hotel cards (current AQI of the neighborhood)? AI chat context ("Tokyo's AQI is 95 today, you might prefer indoor activities")?
2. **User personalization:** does GeKnee collect allergy/sensitivity profiles in User settings? If yes, this becomes user-aware ("you've marked yourself sensitive to grass pollen, and Tokyo is high today"). If no, generic warnings only.
3. **Filtering:** does the booking surface gain a "low-AQI hotels" filter? That requires shipping AQI data through the hotel search results.

**Suggested next step:** decide whether health-conscious traveler is a target persona. If yes, design a health-profile UI in account settings + decide one surface to ship first (probably AI chat context — lowest UX risk).

**Estimated cost impact:** Air Quality + Pollen APIs are ~$5/1k requests. With aggressive caching (per-city, 1h TTL) costs stay <$30/mo at 6k trips/mo.

**Estimated effort:** small for chat-context injection (~1 day). Medium for booking-surface filtering. Large if shipping a full health-profile UI.

**Files that would change:**
- `/api/air-quality/route.ts` (new)
- `/api/pollen/route.ts` (new)
- `app/api/chat/route.ts` — add to system prompt injection (alongside existing weather)
- Possibly `app/plan/summary/components/BookView.tsx` — AQI badge on hotel cards
- Possibly `prisma/schema.prisma` — User.healthProfile field

---

## W3.4 — Roads API (snap-to-road for breadcrumb trails) 🔴 needs upstream feature

**One-line:** When the user walks during an active trip, snap their GPS breadcrumbs to actual roads so the displayed path is smooth rather than noisy.

**Why this is blocked:** Geknee doesn't currently persist or render a walked-path trail on the live trip page. The live page shows current position, not history. Until breadcrumb-trail rendering is a feature, Roads API has nothing to snap.

**Prerequisite feature:** "Walked path trail" on the live trip page.
- Background GPS collection (already partially implemented via geolocation effects)
- Persist breadcrumbs in localStorage OR a new `TripBreadcrumb` Prisma model
- Render trail as a polyline on `GoogleLiveMap.tsx`

Once that feature ships, snap-to-road is a 1-day add: pipe the polyline through Roads API's `snapToRoads` endpoint, render the snapped polyline instead.

**Estimated effort (for both features together):** medium (~3-5 days).

**Files that would change:**
- New `/api/roads/snap/route.ts`
- `app/trip/[tripId]/live/page.tsx` — breadcrumb collection
- `app/trip/[tripId]/live/GoogleLiveMap.tsx` — trail render
- Possibly `prisma/schema.prisma` — new `TripBreadcrumb` model

---

## W3.5 — Distance Matrix API (multi-stop optimization) 🟡 prefer Routes API equivalent

**One-line:** "Best order for 5 stops" — given a list of destinations, return the optimal visit order.

**Why interesting:** Trip planning's classic NP-hard pain point. Saves users from manually reordering activities to minimize transit time.

**Where this lives:** itinerary tab → "Optimize my day" button → reorders activities for that day.

**Important note:** Routes API (already in use after Wave 2) has a `computeRouteMatrix` endpoint that does the same thing with newer pricing. **Don't enable Distance Matrix specifically** — use Routes API's matrix variant when implementing.

**Open product questions before spec:**
1. **Optimization criteria:** shortest travel time, shortest distance, or scheduled-time-aware (preserve user's morning-vs-afternoon ordering)?
2. **Surface:** silent "auto-optimize" toggle, OR explicit "Optimize this day" button?
3. **What does the user see?** A diff before applying ("Move Lunch from 12pm to 1pm to save 25 min")? Or a silent in-place reorder?

**Suggested next step:** product brainstorm to nail down the UX (button vs auto-toggle vs preview-diff). Once UX is settled, implementation is small (~1-2 days).

**Estimated cost impact:** ~$5/1k matrix elements. A 5-stop matrix = 25 elements = $0.13. Marginal at any reasonable scale.

**Estimated effort:** small (~1-2 days) once UX is decided.

**Files that would change:**
- New `/api/routes/optimize-matrix/route.ts` (uses Routes API `computeRouteMatrix`)
- New "Optimize" button + diff modal in itinerary surface

---

## W3.6 — Photorealistic 3D Tiles ⚪ recommend skip

**One-line:** Swap the cartoon Mario-Galaxy globe for Google's real photorealistic 3D city tiles via three.js.

**Recommendation: SKIP.** The cartoon globe is core brand identity. The whole product personality leans into the playful, Geknee character. Photorealistic 3D would feel like every other travel app's map and erode that differentiation.

**Only revisit if:** user research shows the cartoon style is hurting trust or conversion at scale (i.e., users assume "if it's cartoony, the trip data must be made up").

---

## Prioritization recommendation

If you ship one Wave 3 item next, ship **W3.1 (Maps Grounding Lite)**. It's the most self-contained, has clear technical scope (after a 30-min API exploration spike), and unlocks the most user-perceived AI quality improvement. Could also subsume Phase 5 (server `route_between` migration).

If you ship two, add **W3.5 (Distance Matrix via Routes API)** since the infra is already in place (Routes API is wired) and the UX brainstorm is light.

The other three (W3.2 Aerial View, W3.3 Air Quality+Pollen, W3.4 Roads) all need upstream product decisions or prerequisite features. Don't start coding them blind.

## Out of scope for this doc

- Implementation specs (each item gets its own spec → plan after the open product questions are answered).
- Actual code. This is design notes only.
- Phase 5 (server `route_between.ts` Mapbox migration) — already deferred, separately tracked.
- The B.1.5 (geocode-at-source) work that shipped as a follow-up to Wave 1.
