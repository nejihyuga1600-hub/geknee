# geknee — session handoff

Last updated: 2026-06-24
HEAD: `37ae0ce` on `main` (Vercel auto-deploys on push)

---

## What shipped this session (+ recent sessions)

### Real-API integrations (replacing affiliate-only deeplinks)

| Integration | Status | Smoke test |
|---|---|---|
| **Duffel** flights | ✅ Live offers + card-on-file booking modal | 620 offers / 8s on JFK→NRT, confirmed via `bin/duffel-smoke.mjs` |
| **Duffel Phase 2** order creation | ✅ Code complete, gated by `DUFFEL_BOOKING_ENABLED` env (default off) | Card-on-file flow saves card via SetupIntent, charges off_session |
| **Hotelbeds Hotels** | ✅ Live in sandbox | `bin/hotelbeds-smoke.mjs` confirms 727 Paris hotels |
| **Hotelbeds Activities** | ✅ Live in sandbox | 24 activities returned for Paris |
| **Hotelbeds Transfers** | ⏸ 404 on every endpoint | Account-level not provisioned — email apitude@hotelbeds.com |
| **Viator** | ⏸ Key rejected (wrong tier) | User has Affiliate ID, needs Partner API key from `https://partners.viator.com/` → Tools → Affiliate API |
| **Travelpayouts affiliate** | ✅ Marker `716767` live, wraps Aviasales + Kiwitaxi + GetRentACar + EconomyBookings + Airalo + BikesBooking | Bookings credited to TP account |

### Card-on-file architecture

Picked **architecture B** (Duffel Stripe Connect, zero capital). What's in code:
- `/api/payments/setup-intent` + `/api/payments/payment-methods` GET/DELETE (pre-existing)
- `/settings/payment` UI (pre-existing, 247 lines)
- `/api/duffel/order/payment-intent` accepts optional `paymentMethodId` for off_session charge
- `DuffelBookingModal` shows saved-card picker + "use different card" fallback
- Duffel order create currently uses `payment: 'balance'` — **swap to `'stripe'` when Duffel approves Connect onboarding** (single-line change)

### UI fixes this session (most recent first)

| Commit | What |
|---|---|
| `37ae0ce` | "⚠ Permanently closed" chip on activities when Google business_status returns CLOSED_* |
| `95e46b6` | Cost chip rolls in local currency `$18-22 · 2,500 ISK`, prose strips both |
| `bee0b87` | Crop Google watermark out of Street View day-step thumbs (108% scale + offset) |
| `89e1afe` | Tap activity → in-app trip map drawer (was Google Maps tab) |
| `5a5f893` | Single-finger pan on trip map + route map (`gestureHandling: 'greedy'`) |
| `2c2d9e4` | Removed redundant bottom-right group-chat launcher |
| `2007564` | Removed 💬 avatar pill inside TripChatDock collapsed view |
| `54a74f0` | Removed inline ✦ star edit button + long transit chips wrap |
| `0a5fde4` | File-vault Dynamic Island clearance + brand SVG icons + "Passport (backup)" honest label |
| `51e4f23` | Chat AI cross-city guard (Reykjavik + Tokyo refusal) + Google-only photos + 50% larger day thumbs |

---

## User-side blockers (action by Nghia, in priority order)

| Task | Action | Time | Unblocks |
|---|---|---|---|
| **Email apitude@hotelbeds.com** | Request Transfers sandbox activation; send certification email when ready (template in earlier session) | 5 min + 24h wait | Hotelbeds Transfers + Hotels Go Live |
| **Email support@duffel.com** | Request Stripe Connect onboarding (architecture B) | 5 min + ~1-2 wk approval | Duffel Phase 2 with zero capital |
| **Stripe LLC upgrade** | https://dashboard.stripe.com/settings/account → enter EIN `42-3280661` | 10 min | LLC entity for Duffel + Hotelbeds payouts |
| **Viator API key** | https://partners.viator.com/ → Tools → Affiliate API → "Start your development" | 5 min | Live Viator activity availability |
| **Hotelbeds profile** | https://apitude.hotelbeds.com/ → complete profile + paste EIN | 10 min | Hotelbeds certification path |
| **TP affiliate signups** | Hotellook, WayAway, GetYourGuide via Travelpayouts dashboard | 30 min per | Affiliate commission on existing deeplinks |
| **Vercel preview env** | `TRAVELPAYOUTS_MARKER=716767` on preview branches (CLI bug; use dashboard) | 2 min | Preview deploys earn commission |

---

## Open code tasks (next session)

### Task #24 — closed-place filter at AI generation time (HIGH PRIORITY)
**Why deferred:** ~2-3 hr refactor touching 5 generation routes (`/api/agent`, `/api/itinerary`, `/api/itinerary/adjust`, `/api/itinerary/replan`, `/api/agent/edit`). Started this session, stopped at 79% context to avoid half-baked refactor.

**Approach:**
1. Build `lib/places-validate.ts` — batch-checks Google Places `business_status` for a list of place names, returns `{ name → status }` map. Cache by name+city for 24h.
2. After every itinerary-generating AI call, extract place names via existing `extractPlace()` from `lib/itinerary-parse.ts`.
3. For closed places: either re-prompt the AI with `"replace these closed venues: X, Y, Z"` (max 1 round to avoid loops) OR strip the day-step and let downstream UI handle the gap.
4. Smoke-test against the Reykjavik trip where Bergsson Mathús (permanently closed) was generated.

**Today's safety net:** the `37ae0ce` chip warning is shipped — users see "⚠ Permanently closed" on the card. Root fix is preventing generation in the first place.

### Task #25 — screenshot → iOS share sheet (LOWER PRIORITY)
**Why deferred:** Requires Capacitor native plugin (web JS can't detect screenshots on iOS). ~1-2 hr work: install/write `@capacitor-community/screenshot-detector`-style plugin, hook `UIApplication.userDidTakeScreenshotNotification`, bridge to web JS that calls `navigator.share()`.

---

## Critical context for next session

### Architecture decisions made
- **Stripe Connect via Duffel** (no capital) — confirmed by user 2026-06-22. All code paths assume this; balance-payment branch in `lib/duffel.ts::createOrder` is the placeholder until Duffel approves Connect.
- **Card on file is universal** — same `paymentMethodId` shape will plug into Hotelbeds + Viator booking modals when those ship.
- **EIN `42-3280661`** lives in user's records only — NOT in any code/env. Use in partner dashboards, never persist.

### Env vars set (Vercel prod + .env.local)
- `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER=716767`
- `HOTELBEDS_{HOTEL,ACTIVITIES,TRANSFERS}_API_KEY` + `_SECRET` + `HOTELBEDS_ENV=test`
- `DUFFEL_API_KEY` (live key — careful), `DUFFEL_BOOKING_ENABLED=false`, `DUFFEL_MARKUP_PCT` (optional)
- `VIATOR_API_KEY` (wrong tier — needs replacement)

### Memory entries added/updated this session
- `feedback_send_action_links.md` — always include URL when asking user to act
- `feedback_pill_targeting.md` — "remove the X pill behind Y" = X inside Y, not Y itself

### Smoke-test scripts available
- `bin/duffel-smoke.mjs` — `node bin/duffel-smoke.mjs` after sourcing `.env.local`
- `bin/hotelbeds-smoke.mjs` — same pattern
- `bin/viator-smoke.mjs` — currently returns 401 (key tier issue)

### Known UI surfaces touched
- `app/components/GlobalChat.tsx` — floating GeKnee mascot (kept everywhere — user's AI access point)
- `app/plan/[tripId]/(tabs)/TripChatDock.tsx` — bottom group-chat dock
- `app/plan/summary/SummaryView.tsx` — main trip page, owns `mapDrawerOpen` state + `geknee:focus-map-pin` listener
- `app/plan/summary/UnifiedTripMap.tsx` — Google Maps inside the drawer (greedy gesture, listens for focus event)
- `app/plan/summary/components/ActivityBlock.tsx` — day-step rendering, owns business_status warning chip
- `app/plan/summary/components/DuffelBookingModal.tsx` — 3-step booking flow with saved-card picker

---

## Deployment

Vercel auto-deploys on push to `main`. Last verified deploy is current. The Vercel CLI is on 51 (outdated — latest is 54+); `vercel ls --limit` errors but `vercel ls` works. Manual deploy via `vercel --prod --yes` fails on "Upload aborted" — push to git instead.

---

## How to verify what shipped

```bash
git log --oneline -10              # see recent commits
vercel ls                          # confirm prod deploy is Ready
```

Live URL: `https://www.geknee.com` (www canonical, geknee.com 307s to www).

Dev account for testing: `nghiaphan081301@gmail.com` (signed in via Chrome — pull cookie with `python3 bin/extract-chrome-cookie.py --host www.geknee.com --name authjs.session-token` if doing authenticated curls).
