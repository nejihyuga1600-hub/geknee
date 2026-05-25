# Live-Trip Safety Card — Design Spec

**Date:** 2026-05-25
**Status:** Approved design, pending spec review → implementation plan
**Surface:** `app/trip/[tripId]/live/` (the in-trip companion)

## Problem

The live-trip companion already covers leave-by, next stop, weather, crowds,
budget, directions, and offline map tiles. It does **not** cover the things a
traveler panic-searches abroad: the local emergency number, the nearest open
pharmacy/hospital, and what to do if a passport/wallet is lost. This feature
adds a **Safety card** that surfaces those in-the-moment, working offline for
the critical pieces.

## Scope (v1)

In scope:
1. **Emergency numbers** — country-aware police / ambulance / fire, tap-to-call.
2. **Lost docs / passport steps** — static checklist.
3. **Nearest pharmacy/hospital** — on-demand only (never auto-fetched).

Out of scope (later):
- Embassy/consulate locator (v2 — needs the user's home country).
- Money & customs, Language & comms, Timing & access (separate specs; see Roadmap).

## Approach

A new **Safety card** in the live view's existing context-card row (shield
icon), consistent with the weather/crowds cards. Tapping expands a **Safety
panel** with the three sections. Rejected alternative: a persistent floating
SOS button — more anxiety-inducing and heavier; not needed when the card is one
tap away.

## Components

### 1. Emergency numbers (static, offline, zero cost)
- Data: `lib/safety/emergencyNumbers.ts` — a `Record<ISO3166-1-alpha2, {
  police: string; ambulance: string; fire: string; universal?: string }>`
  seeded from the ITU/EENA public dataset (~200 countries; most are 112, with
  US 911, UK 999, AU 000, etc.). Universal `112` shown as a fallback when a
  country is missing.
- Country source: derived from the trip's **destination country code**. The
  live page already geocodes the anchor city; extract the `country` short_name
  from the Geocoding `address_components` (or persist `destinationCountryCode`
  on the trip if cheaper). No new API call — reuse the existing anchor-city
  geocode result.
- UI: three rows, each a `tel:` link (`<a href="tel:112">`), with a clear
  "Calls your phone's dialer" affordance. Works with no network.

### 2. Lost docs / passport steps (static, offline, zero cost)
- Data: `lib/safety/lostDocs.ts` — an ordered checklist:
  1. Get to a safe place; report to the **local police** (get a written report —
     needed for insurance/replacement).
  2. Contact your **embassy/consulate** (placeholder until v2 locator ships —
     link to the country's foreign-ministry "lost passport" page if known).
  3. **Freeze cards** (link to your bank app / card hotlines if the user has
     added them — otherwise generic guidance).
  4. Use your **ticket/confirmation wallet** (cross-link once that roadmap item
     ships) for digital copies.
- UI: collapsible checklist; purely static, offline.

### 3. Nearest pharmacy / hospital (on-demand, network-gated)
- **Never auto-loaded.** Renders as two buttons: "Find nearest open pharmacy"
  and "Find nearest hospital".
- On tap:
  1. Request **device geolocation** once (`navigator.geolocation`). If denied
     or unavailable, **fall back to the trip's anchor-city center** (already in
     state) and label results "near {city}".
  2. Call Places Nearby Search server-side for `type: pharmacy` / `hospital`,
     `rankby: distance` (or location+radius), filtered to `opening_hours.open_now`
     when available. Reuse the existing server Places integration; if a route
     doesn't exist yet, add `app/api/places/nearby/route.ts` following the
     `/api/weather` pattern (auth-gated, **session token**, **Basic field mask**
     per the Google Maps cost rules in CLAUDE.md).
  3. Render top 3: name, distance, open/closed, **tap-to-call** + **Directions**
     (reuse `fetchDirections`).
- **Session cache:** results cached in component state for the session so
  re-taps don't re-bill.
- **Offline:** if `useOnlineStatus()` reports offline, the buttons show a
  "needs connection" disabled state; sections 1–2 remain fully functional.

## Data flow

```
trip.destinationCountryCode  ──▶ emergencyNumbers[CC]  (instant, offline)
static lostDocs               ──▶ checklist            (instant, offline)
user taps "find nearest" ─▶ geolocation (or anchor fallback)
                          ─▶ /api/places/nearby (session token, Basic mask)
                          ─▶ top-3 list (+ tel:, + directions); cached for session
```

## Error handling
- Missing country in map → show universal `112` + a note.
- Geolocation denied/timeout → anchor-city fallback, labeled.
- Places call fails / offline → inline error + retry; never blocks sections 1–2.
- No open results → show nearest regardless of open-now, labeled "may be closed".

## Cost
- Sections 1–2: zero (static, bundled).
- Section 3: a handful of Places calls **only on explicit tap, only when a user
  needs care**, session-cached. Far under the $10/mo warning threshold and the
  Google Maps budget alarms in CLAUDE.md.

## Testing
- Unit: `emergencyNumbers` lookup (known country, missing country → 112),
  `lostDocs` ordering, country-code extraction from a geocode fixture.
- Component: Safety card renders sections 1–2 with no network; section 3 button
  triggers geolocation → mocked Places → top-3; denied geolocation → anchor
  fallback path.
- Manual: airplane-mode check that emergency numbers + lost-docs render and
  `tel:` links work; on-tap pharmacy finder with location granted and denied.

## Files (anticipated)
- `lib/safety/emergencyNumbers.ts` (new, static data)
- `lib/safety/lostDocs.ts` (new, static data)
- `app/trip/[tripId]/live/SafetyCard.tsx` (new)
- `app/api/places/nearby/route.ts` (new, if no equivalent route exists)
- `app/trip/[tripId]/live/page.tsx` (wire the card into the context-card row;
  pass destination country + anchor center)

## Roadmap (each its own spec → plan → build, after v1)
Approved standouts, in suggested order:
1. **"Right now" AI card** — one context-aware suggestion from time + weather +
   location (Anthropic + Places + weather).
2. **Flight status + airport leave-by** — reuse Gmail flight detection; live
   status/gate + a departure-day leave-by card.
3. **Ticket/confirmation wallet** — parse hotel/restaurant/tour confirmations
   from Gmail, offline-accessible; cross-links from lost-docs step 4.
4. **"Closing soon" nudge** — alert when a *planned itinerary stop* closes within
   ~1hr (Places hours, itinerary stops only → no extra quota).

Deferred: Safety v2 embassy locator; Money & customs; Language & comms;
point-to-translate (camera OCR); eSIM/data usage; live transit wait-times.
