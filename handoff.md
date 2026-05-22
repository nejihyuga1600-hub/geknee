# Handoff — geknee.com / travel-ai

**Date:** 2026-05-21
**Branch:** `main` (clean, pushed to `origin/main`)
**Last commit:** `576d712`

---

## Where things stand

Working tree is clean. Latest pushed commit (`576d712`) tightens the city/state label opacity fade band on the globe so labels snap on cleanly at the Country↔Local zoom boundary instead of ghosting at country zoom.

Vercel auto-deploy was kicked off but **not explicitly verified to Ready** in the last turn. User should hard-refresh geknee.com once the deploy lands and confirm:
- No half-opacity ghost city labels at Country tier (`camDist ≥ 13`)
- City + state labels fully readable the moment the right-side zoom badge flips to "Local"

---

## Recently shipped (this session)

### Globe labels overhaul
- `feat(globe): label overlay sphere — state + city labels fade in at "Local" zoom tier` — `73c85e4`
- `style(globe): country labels 25% bigger (MAX_FONT 22 → 27)` — `a7069cc`
- `style(globe): snap city + state labels at Country↔Local boundary` — `576d712`

All landmark/city/country labels now bake into a canvas-baked equirectangular texture pair returned by `createEarthTexture` in `app/plan/location/LocationClient.tsx`:
- **Base** sphere: country labels (always visible)
- **Overlay** sphere (`R * 1.0008`, `meshBasicMaterial`, transparent): state + city labels, opacity driven per-frame from `camDistRef`

**Opacity formula** (see `useFrame` in `GlobeScene`):
```ts
if (d <= 12.7) opacity = 1;
else if (d >= 13.0) opacity = 0;
else opacity = (13.0 - d) / 0.3;
```
Tweak knobs: `12.7` and `13.0`. Country/Local tier boundary in `AtlasShell` is `camDist = 13`.

**Cleanup pending:** dead `if (false as boolean && statesGeo)` block still in `createEarthTexture` — kept for diff review in `73c85e4`. Safe to delete next pass.

### Google Maps Platform — Waves 1+2
- Routes API v2 migration (`31cbc1a`)
- Places API (New) with session tokens + Basic field mask (`0ad42b7`)
- Maps Static OG share cards (`a6b79fb`)
- StreetViewThumb wired into ActivityBlock, BookView hotels/restaurants, RecPanel chips (`cc768b3`, `d3d90e4`, `4408299`)
- `useGeocode` hook with mem+session+API cache (`9d43aff`)
- Wave 3 design notes in `d6fd118`

Still deferred: `lib/agent/tools/route_between.ts` calls Mapbox Directions server-side. Plan: migrate after 30 days of Routes API v2 usage data.

### Auth / account switching
- Cross-email NextAuth linking footgun fixed; `auth.ts` `signIn` callback blocks linking different Google accounts to the same User row
- Mislinked Account row repaired in DB via `bin/repair-mislinked-account.mjs`
- Removed `accounts.google.com/Logout?continue=` chain (Google rejects external `continue` URLs → 400)

### Trip social features
- Per-item voting (thumbs up/down) on hotels, activities, itinerary stops → auto-posts to group chat
- `app/components/VoteButtons.tsx`, `app/api/trips/[id]/item-vote/route.ts`
- `TripItemVote` Prisma model: `(tripId, userId, itemKey)` unique
- Invite friends pill (`InviteFriendsPill.tsx`) persistent in tab header
- Vault visibility: `TripFile.visibility` defaults `"public"`, can be `"private"`
- AI suggestions feature flag now defaults ON in `lib/suggestions/featureFlag.ts`
- Group chat fix: `openGroup` uses real `TripDraft.id`, not `hashStr(location)`

### Deploy unblock
- 11-hour Vercel deploy outage fixed in `d667fa3`
- `next.config.ts` `outputFileTracingExcludes` trims Prisma engine orphans (was blowing 250MB lambda cap)
- `app/plan/layout.tsx` cascades `export const dynamic = 'force-dynamic'` — fixes "Unable to find lambda for route: /plan/..." misclassification of static client pages
- `app/auth/mobile-cb` split into server wrapper + `MobileCallbackClient.tsx` so `dynamic` is honored (the directive is ignored in `'use client'` files)

---

## Open / deferred

| Item | Notes |
|---|---|
| Delete dead `if (false as boolean && statesGeo)` block in `createEarthTexture` | Kept for diff review per `73c85e4`. Safe to remove next pass. |
| Migrate `lib/agent/tools/route_between.ts` off Mapbox Directions | Wait until 30 days of Routes API v2 usage data is in. |
| Wave 3 Google Maps products | Design notes only (`d6fd118`). Each needs a design pass: Maps Grounding Lite, Aerial View, Air Quality + Pollen, Roads API, Distance Matrix, Photorealistic 3D Tiles. |
| Verify `576d712` deploy on geknee.com | Hard-refresh, watch the Country↔Local boundary, confirm cities snap on rather than ghost. |

---

## Critical gotchas / landmines

1. **`LocationClient.tsx` is ~6000 lines.** Grep before Read. Use small atomic edits with grep verification between — concurrent cloud-agent edits have reverted changes mid-session before.
2. **File state hygiene:** Always verify Edit landed (grep for the new string) and that the diff has content **before** committing. Empty commits have happened. See `memory/feedback_check_work_before_done.md`.
3. **Fetch before work:** Cloud agent pushes to `main`. Always `git fetch && git log origin/main..HEAD` (or compare) before starting work.
4. **`'use client' + export const dynamic` is silently ignored.** If a page needs `force-dynamic`, the page file itself must be a server component — split client logic into a sibling `*Client.tsx`.
5. **DB is Neon Postgres via Vercel Marketplace** — not Supabase. Any stale references to Supabase in older docs are wrong.
6. **Meshy GLB models are user assets.** Never replace or texture-compress without explicit OK.
7. **NextAuth JWT mode + Google `allowDangerousEmailAccountLinking: true`** is set. The `signIn` callback in `auth.ts` is the only thing blocking cross-email linking — don't loosen it.
8. **API budget alarms are live on Google Cloud.** Warn before any change that could push an API past $10/mo expected spend.

---

## Files most-touched this session

- `app/plan/location/LocationClient.tsx` — globe + labels
- `app/components/TripSocialPanel.tsx` — group chat + suggestions inline
- `app/components/VoteButtons.tsx` — new
- `app/api/trips/[id]/item-vote/route.ts` — new
- `app/api/trips/[id]/files/route.ts` + `[fileId]/route.ts` — vault
- `auth.ts` — cross-email link blocking
- `prisma/schema.prisma` — `TripItemVote`, `TripFile.visibility`, `rhel-openssl-3.0.x` binary target
- `next.config.ts` — Prisma trim
- `app/plan/layout.tsx` — `force-dynamic` cascade

---

## Quick-start for the next session

```bash
git fetch
git log --oneline origin/main..HEAD   # should be empty (working tree clean)
git status                            # should be clean
```

Then ask the user whether they're happy with how the labels snap on at the Local tier, or if they want the band tuned further (e.g. `12.95 → 13.0` for a sharper snap, `12.0 → 13.0` for a softer fade).
