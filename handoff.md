# Handoff â€” geknee.com / travel-ai

**Date:** 2026-05-25
**Branch:** `main` (in sync with `origin/main`)
**Live URL:** https://www.geknee.com

---

## Latest session - 2026-05-25 (mobile UI/perf + Safety feature)

Shipped to origin/main:
- `64cafc2` fix(ios): -webkit-backdrop-filter app-wide (Safari glass panels now blur) + 100vh->100svh (iOS URL-bar bug).
- `3cee9fc` feat(mobile): decluttered globe top nav. **The live chrome is `app/plan/location/atlas/AtlasShell.tsx`, NOT LocationClient** (which mounts chromeless inside it). Moved Collection/Go Pro into the Settings menu Quick Actions (mobile only); icon-pill tap targets ->40px; mobile avatar ->36px. Browser-verified at 390px.
- perf(globe) `3cee9fc`+`8fb8ee2`: low-end DPR floor (<=4GB RAM / <=4 cores -> DPR 1) + ambient Sparkles 60->24 on mobile. Existing infra already strong (DPR cap 1.5, antialias off mobile, pause-when-backgrounded, off-screen GLB disposal, ~2s cold load).
- **Safety card v1** (`40c69af`, `7462609`, `e664432`, `a3b3741`): live-trip Safety card. Offline emergency numbers (`lib/safety/emergencyNumbers.ts`, 112 fallback) + lost-docs checklist (`lib/safety/lostDocs.ts`) + on-demand pharmacy/hospital finder (`app/api/places/nearby/route.ts`, geolocation w/ anchor-city fallback, Basic field mask, session-cached). `/api/geocode` now also returns ISO country code. `SafetyCard.tsx` uses extracted `CardShell`; browser-verified in dark theme.

Decisions:
- **frameloop:demand REJECTED** - the globe's continuous ambient `<Sparkles>` would freeze under demand rendering (or negate any savings). Not worth it.
- Go Pro buttons stay as modal; `/pricing` is the shareable SEO URL.
- Meshy monument generation: still deferred (user confirmed).

Docs: spec `docs/superpowers/specs/2026-05-25-live-trip-safety-card-design.md`; plan `docs/superpowers/plans/2026-05-25-live-trip-safety-card.md`.

Real-time roadmap (each its own spec/plan, after v1, all approved): Right-now AI card -> Flight status + airport leave-by (reuse Gmail flight detection) -> Ticket/confirmation wallet -> "Closing soon" nudge. Deferred: Safety v2 embassy locator; Money & customs; Language & comms.

Standing prefs (saved to memory): use the `frontend-design` skill for any UI work + match GeKnee brand tokens; edit AtlasShell (not LocationClient) for the live globe chrome.

---

## TL;DR

- **Stripe is live and fully verified (2026-05-24).** End-to-end purchase was verified, then the test sub `sub_1TaKhUHJGVzPMnvW7RImPLoo` (customer `cus_UZJQrpIPSGgRTn`) was canceled and the $4.99 charge `ch_3TaKhVâ€¦` refunded (`re_3TaKhVâ€¦`).
- **Stripe webhook delivery is CONFIRMED WORKING.** Cancelling the live sub fired a real `customer.subscription.deleted` that reached `/api/stripe/webhook` and flipped the user DB row `proâ†’free`, `stripeSubscriptionIdâ†’null`. The old "brilliant splendor" delivery problem is resolved.
- **Pro welcome email is LIVE.** `RESEND_API_KEY` set in Vercel prod + `.env.local`; `geknee.com` verified in Resend (DKIM `resend._domainkey` + SPF/MX on `send` + `_dmarc` DMARC TXT). User confirmed receiving a live test from `hello@geknee.com`.
- **Google Workspace site-verification TXT** added to `geknee.com` DNS via Vercel CLI.
- **Meshy monument generation deferred** by user â€” pipeline is documented in memory.

---

## What shipped today

| Commit | What |
|--------|------|
| `9a006e7` | UpgradeModal price fix: $9â†’$4.99, $72â†’$39, SAVE 33%â†’35%, CTA copy |
| `252a0e2` | Pro welcome email: `lib/email/pro-welcome.ts` + wired into `app/api/stripe/webhook/route.ts` checkout.session.completed handler |

Both pushed to `origin/main`; Vercel auto-deployed.

Manual data fix (no commit):
```
UPDATE "User"
SET "stripeCustomerId" = NULL
WHERE id = 'cmo689cy80000jj045sossyvj';
-- (followed by live re-checkout, then:)
UPDATE "User"
SET "stripeSubscriptionId" = 'sub_1TaKhUHJGVzPMnvW7RImPLoo'
WHERE id = 'cmo689cy80000jj045sossyvj';
```
(Test-mode `cus_UUH2Q9f0nx3NtI` was rejected in live mode, hence the null + re-checkout.)

DNS via Vercel CLI:
- TXT `geknee.com` â†’ `google-site-verification=OLAF0VXe2FkG2-Fjom-EpDUrf-VHV8Y2ttH3012VZyk`

---

## Stripe — RESOLVED (2026-05-24)

All three former blockers are closed:

### 1. Webhook delivery — WORKING
- Verified end-to-end: cancelling `sub_1TaKhU…` via the Stripe API fired `customer.subscription.deleted`, which hit `/api/stripe/webhook` and updated the DB (`plan: pro->free`, `stripeSubscriptionId->null`). No more action needed.

### 2. Welcome email — LIVE
- `RESEND_API_KEY` (send-only) added to Vercel production + `.env.local`.
- `geknee.com` verified in Resend. DNS on Vercel: DKIM `resend._domainkey` TXT, SPF `send` TXT (`v=spf1 include:amazonses.com ~all`), MX `send` (`10 feedback-smtp.us-east-1.amazonses.com`), and `_dmarc` TXT (`v=DMARC1; p=none;`) — last one added this session.
- Confirmed: live test email delivered from `hello@geknee.com`. Webhook handler (unchanged) sends the Pro welcome on `checkout.session.completed`.
- Note: Resend send-only key cannot list domains; Google Workspace inbox MX is untouched (Resend MX lives on the `send` subdomain).

### 3. Test subscription — CANCELED + REFUNDED
- `sub_1TaKhU…` canceled; charge `ch_3TaKhV…` ($4.99) refunded via `re_3TaKhV…` (status succeeded).

### Go Pro buttons — decided: keep modal
- Header button (`LocationClient.tsx`) and nav pill (`atlas/AtlasShell.tsx`) intentionally open `UpgradeModal`; `/pricing` stays the shareable SEO URL. No change made.

---

## Welcome email preview

Rendered locally for design review:
- `welcome-email-preview.html` (4664 bytes) â€” open in browser
- `preview-welcome-email.mjs` â€” regenerate anytime with `node preview-welcome-email.mjs`

Email content matches `/pricing` copy verbatim: 5 core perks (unlimited trips, unlimited drafts, priority support, early skin access, Pro-only rarity tiers) + 2 yearly extras (exclusive Pro-Yearly skin, printed annual postcard). Sends from `hello@geknee.com`. Dark mode styling matches /pricing aesthetic.

---

## Deferred / paused

- **Meshy monument generation.** Pipeline (Nano Banana Pro â†’ Meshy `v1/image-to-3d` with coin-medallion style) is fully documented at `memory/reference_meshy_monument_pipeline.md`. 11 missing monuments queued in `bin/monuments_nano_banana_to_meshy.py` (not committed). User said "nevermind lets work on this later."
- **Phase 5 Mapboxâ†’Google Directions migration.** Hold per CLAUDE.md until 30 days of Routes API usage data.
- **Wave 3 Google Maps products** (Aerial View, Air Quality, Pollen, Roads, Distance Matrix, 3D Tiles) â€” each needs design pass.

---

## Working dir state at handoff

```
M app/plan/location/LocationClient.tsx        (zoom-smoothness + cities1000 work, already in 8 commits on origin/main)
M app/plan/location/layout.tsx                 (same series)
M bin/bake-overlays.mjs                        (border bake refactor)
M handoff.md                                   (this file)
?? public/baked/borders-overlay.webp           (generated artifact)
?? welcome-email-preview.html                  (4664-byte local preview, do not commit)
?? preview-welcome-email.mjs                   (preview generator, do not commit)
?? bin/monuments_nano_banana_to_meshy.py       (Meshy pipeline, paused)
```

Recent globe-perf commits (already pushed):
```
39d0b04 refactor(globe): borders baked into base alongside labels â€” no z-offset
4214515 fix(globe): label anchoring via pole-of-inaccessibility
2e44f78 fix(globe): borders on always-visible overlay, depth-test off
fd04bf2 perf(globe): cold-load 20s -> 2s via static prebake + IDB cache + WebP terrain
576d712 style(globe): snap city + state labels at Countryâ†”Local boundary
```

---

## Operational notes for next session

- **Production DB is Neon Postgres** via Vercel Marketplace (not Supabase â€” any docs/notes referring to Supabase are stale).
- **Vercel CLI env vars:** use `vercel env add NAME production --value X --yes --sensitive`. Do NOT pipe values via stdin in PowerShell â€” it prepends a UTF-16 BOM and silently breaks Stripe key validation.
- **`vercel env pull` returns empty for sensitive vars** in production scope. That's by design (sensitive-by-default), not a bug. Confirm presence via `vercel env ls`.
- **Stripe live secrets** (`sk_live_...`, `whsec_NcMJ...`, `pk_live_...`) stay in chat only â€” never persist to disk.
- **Session cookie** for testing as the logged-in user lives in chat only â€” `__Secure-authjs.session-token`.
- **Two-agent review system** (UX Scout + Dev Scout) is documented in CLAUDE.md â€” run via `.agents/run-{ux,dev}-agent.sh` in two side-by-side terminals.

---

## Observability quick-ref

| Need | Tool | Where |
|------|------|-------|
| Stack trace for a thrown error | Sentry MCP | `search_issues`, `search_events` |
| "User says X feels broken" (no exception) | PostHog MCP | `query-session-recordings-list` |
| Confirm webhook hit production | Vercel runtime logs | `mcp__claude_ai_Vercel__get_runtime_logs` |
| Confirm DB write landed | Prisma direct query | via `lib/prisma` |

---

## Open Q for user

All Stripe items closed this session (welcome email live, webhook verified, test sub canceled + refunded, Go Pro decided to stay modal). Remaining:

1. Resume Meshy monument generation, or keep deferred?
