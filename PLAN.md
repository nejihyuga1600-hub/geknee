# GeKnee Travel App — Implementation Plan

> Tracks what's built, what's next, and why. Update as work completes.
> See PRD.md for full feature specs. See ARCHITECTURE.md for code structure.

---

## Status Legend
- ✅ Done & deployed
- 🔧 Done but needs polish
- 🔲 Not started
- 🚧 In progress

---

## Phase 0 — Foundation (Complete ✅)

| # | Feature | Status | Notes |
|---|---|---|---|
| 0.1 | Interactive 3D globe with ~275 landmarks | ✅ | LocationClient.tsx |
| 0.2 | Animal models on globe (Whale, Lion, etc.) | ✅ | AllAnimals() in LocationClient |
| 0.3 | Landmark click → Genie confirmation panel | ✅ | geknee:globeselect custom event |
| 0.4 | Globe background click → open Genie input | ✅ | _globeClick bridge |
| 0.5 | 5-step style/preferences form | ✅ | /plan/style |
| 0.6 | Date picker page | ✅ | /plan/dates |
| 0.7 | AI itinerary generation + summary page | ✅ | /plan/summary |
| 0.8 | Per-day maps with Google Maps | ✅ | DayMap.tsx, RouteMap.tsx |
| 0.9 | Google OAuth + credentials auth | ✅ | auth.ts + NextAuth v5 |
| 0.10 | Supabase PostgreSQL via Prisma | ✅ | lib/prisma.ts |
| 0.11 | Save/load trips | ✅ | /api/trips |
| 0.12 | Group chat (TripMessage) | ✅ | TripSocialPanel + /api/trip-messages |
| 0.13 | Friends system | ✅ | /api/friends |
| 0.14 | Genie AI chat (GlobalChat) | ✅ | GlobalChat.tsx + /api/chat |
| 0.15 | Deployed to geknee.com via Vercel | ✅ | Auto-deploy from GitHub main |
| 0.16 | Vercel Analytics + Speed Insights | ✅ | layout.tsx |
| 0.17 | GLB model error boundaries | ✅ | ModelErrorBoundary in LocationClient |

---

## Phase 1 — Smart Planning Tools (Next Up)

Goal: Make trip planning more intelligent and personalized.

### 1A — Trip Inspiration AI  (PRD §5.2: INS-01 to INS-08)

Users upload inspiration images/videos → Claude Vision analyzes → suggests itinerary additions.

| # | Task | Status | File(s) |
|---|---|---|---|
| 1A.1 | Supabase Storage bucket `inspiration` | 🔲 | Supabase dashboard |
| 1A.2 | `/api/inspiration/upload` — signed URL generator | 🔲 | app/api/inspiration/upload/route.ts |
| 1A.3 | `/api/inspiration/analyze` — Claude Vision endpoint | 🔲 | app/api/inspiration/analyze/route.ts |
| 1A.4 | InspirationUpload component (drag-drop, preview) | 🔲 | app/components/InspirationUpload.tsx |
| 1A.5 | Wire into summary page as new "Inspiration" tab | 🔲 | app/plan/summary/page.tsx |
| 1A.6 | Persist analyzed results to Trip.preferences JSON | 🔲 | /api/trips/[id] PATCH |

**API used**: Anthropic Vision (existing key, ~$0.005/image)

---

### 1B — Group Trip File Vault  (PRD §5.10: FV-01 to FV-09)

Upload and tag trip documents (passports, bookings, insurance) visible to all trip members.

| # | Task | Status | File(s) |
|---|---|---|---|
| 1B.1 | Supabase Storage bucket `trip-files` | 🔲 | Supabase dashboard |
| 1B.2 | DB model: TripFile (id, tripId, userId, url, name, type, tag) | 🔲 | prisma/schema.prisma |
| 1B.3 | `/api/trips/[id]/files` GET/POST | 🔲 | app/api/trips/[id]/files/route.ts |
| 1B.4 | `/api/trips/[id]/files/[fileId]` DELETE | 🔲 | app/api/trips/[id]/files/[fileId]/route.ts |
| 1B.5 | FileVault component (upload, list, tag filter) | 🔲 | app/components/FileVault.tsx |
| 1B.6 | Add "Files" tab to TripSocialPanel | 🔲 | app/components/TripSocialPanel.tsx |

**API used**: Supabase Storage (free tier: 1GB)

---

### 1C — Performance Quick Wins

| # | Task | Status | File(s) |
|---|---|---|---|
| 1C.1 | sessionStorage cache for geocoded places (skip re-geocoding) | 🔲 | app/plan/summary/DayMap.tsx |
| 1C.2 | IntersectionObserver lazy-load DayMap (geocode only when visible) | 🔲 | app/plan/summary/DayMap.tsx |
| 1C.3 | Genie 15-message cap per trip session | 🔲 | app/components/GlobalChat.tsx |
| 1C.4 | Audit /api/flight-prices — disable if unused in UI | 🔲 | app/api/flight-prices/route.ts |

---

## Phase 2 — Active Trip Companion (Core)  (PRD §5.11)

Goal: Real-time guidance while the user is traveling.

### 2A — Morning Briefing (TC-01 to TC-06)

| # | Task | Status | File(s) |
|---|---|---|---|
| 2A.1 | Vercel Cron job — runs daily at 6 AM per user timezone | 🔲 | app/api/cron/morning-briefing/route.ts |
| 2A.2 | Claude generates briefing: weather, first activity, transport tip | 🔲 | same route |
| 2A.3 | Store briefing in TripMessage with `type: 'briefing'` | 🔲 | prisma/schema.prisma |
| 2A.4 | Briefing card UI in TripSocialPanel | 🔲 | app/components/TripSocialPanel.tsx |

### 2B — Departure Alerts (TC-07 to TC-12)

| # | Task | Status | File(s) |
|---|---|---|---|
| 2B.1 | Google Distance Matrix API setup | 🔲 | lib/distanceMatrix.ts |
| 2B.2 | `/api/companion/departure-check` — travel time to airport | 🔲 | app/api/companion/departure-check/route.ts |
| 2B.3 | Push notification (Web Push + VAPID) | 🔲 | lib/webpush.ts |
| 2B.4 | Service Worker (`public/sw.js`) | 🔲 | public/sw.js |
| 2B.5 | Push subscription UI (enable notifications button) | 🔲 | app/components/GlobalChat.tsx |

**API used**: Google Distance Matrix (~$0.005/request, budget $5/month)

### 2C — Weather Conflict Alerts (TC-13 to TC-16)

| # | Task | Status | File(s) |
|---|---|---|---|
| 2C.1 | Compare itinerary activities vs weather forecast | 🔲 | app/api/companion/weather-check/route.ts |
| 2C.2 | Suggest indoor alternatives via Claude | 🔲 | same route |

### 2D — At-Destination Tips (TC-17 to TC-22)

| # | Task | Status | File(s) |
|---|---|---|---|
| 2D.1 | Geofence trigger (browser Geolocation API) | 🔲 | app/components/TripCompanion.tsx |
| 2D.2 | Claude generates: cash tips, cultural norms, local phrases | 🔲 | app/api/companion/destination-tips/route.ts |

---

## Phase 3 — Social & Discovery Enhancements

| # | Task | Status | File(s) |
|---|---|---|---|
| 3.1 | User profile page `/profile/[username]` | 🔲 | app/profile/[username]/page.tsx |
| 3.2 | Public trip sharing (shareable link) | 🔲 | app/trips/[id]/share/page.tsx |
| 3.3 | GLB models CDN hosting (currently all fallback to shapes) | 🔲 | Upload to Supabase Storage or R2 |
| 3.4 | Logo / favicon update | 🔲 | public/favicon.ico, app/layout.tsx metadata |
| 3.5 | Closest airport auto-detection for all destinations | 🔲 | lib/airports.ts |

---

## Phase 4 — Polish & Scale

| # | Task | Status | File(s) |
|---|---|---|---|
| 4.1 | Geocoding DB cache (store resolved coords server-side) | 🔲 | prisma/schema.prisma + /api/geocode |
| 4.2 | Rate limiting on AI routes (Upstash Redis or Vercel KV) | 🔲 | middleware.ts |
| 4.3 | E2E tests (Playwright) for planning flow | 🔲 | tests/ |
| 4.4 | Accessibility audit (keyboard nav, ARIA) | 🔲 | All pages |

---

## Current Sprint

**Focus**: Phase 1 — pick one:
- **1A (Inspiration AI)** — visual/creative, uses existing Anthropic key, no new DB schema
- **1B (File Vault)** — practical, needs DB migration + Supabase Storage setup

Recommendation: start with **1B (File Vault)** — it's self-contained, unblocks inspiration upload infra, and is the fastest user-visible win.

---

## Deferred / Backlog

- Video analysis for inspiration (requires video frame extraction, more complex)
- Offline mode / PWA caching
- Multi-city trip planning (currently single destination)
- AI-suggested packing list
- Currency converter widget
- Real-time flight delay alerts
