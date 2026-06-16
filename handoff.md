# Geknee Session Handoff — 2026-06-16

Pick this up on next session. Summarizes what shipped over the last few
working sessions (last big handoff was 2026-06-09), what's pending, and
where to look for fast onboarding.

---

## Currently deployed

- **Branch**: `main`
- **Latest commit**: `fa500a5` — banner: drop stale mainTab='planning' check that broke build
- **Vercel project**: `geknee-travel-ai` (auto-deploys on push to `main`; ~2 min build; iOS Capacitor shell loads `https://www.geknee.com` directly so web pushes ship to both surfaces).
- **DB**: prod Neon `ep-ancient-feather-anklmwye-pooler.c-6.us-east-1.aws.neon.tech/neondb` (single endpoint — same in `.env` + `.env.local`; any `prisma db push` hits prod).
- **Latest migration applied**: `20260614204100_add_waitlist` (recorded in `_prisma_migrations`; build script is `prisma generate && next build` — does NOT run `migrate deploy`, so migrations must be applied manually via `prisma db execute` + `prisma migrate resolve --applied`).

Apple side reference (unchanged from prior handoff):
- ASC App ID: `6774831965`
- API Key ID: `TKDRMU78L2` (`~/.appstoreconnect/private_keys/AuthKey_TKDRMU78L2.p8`)
- Issuer ID: `19cd34c5-d257-4a6b-aff4-9fa363cc1e92`
- Apple Distribution cert: `42PQV5L5PT`
- Internal tester: `nghiaphan081301@gmail.com` (`67bcf29e-f08b-441e-9fef-6e4e2c8022a3`)
- Build script: `./ios/bin/testflight-push.sh` — env vars not in `~/.zshrc`; pass inline or export per shell.

---

## Major work shipped (most recent → older)

### Trip map / itinerary UI
- **Missing-day banner** (`fa500a5`, `70fe9c8`) — amber banner inside the trip-header card lists day sections that are missing from the markdown body (real failure mode of partial `edit_itinerary` calls). Computes from `sections` + `nights`, no extra fetch. Regenerate button wired to existing `requestGeneration`.
- **Geocode hardening** (`564f918`) — three-fix combo for "map pins land in the wrong half of the country":
  1. `attemptsFor()` reordered → city-suffixed query tried first (`"Sandholt Bakery, Reykjavik"` instead of raw). Raw still runs as fallback so multi-city landmarks like `"Taj Mahal East Gate"` on a Delhi trip keep resolving canonically.
  2. `/api/geocode` accepts `swLat/swLng/neLat/neLng` → Google `bounds=` viewport bias. Cache key includes bounds so a biased lookup doesn't poison the un-biased slot.
  3. Pass-3 per-day outlier rejection: for each day with ≥3 resolved pins, compute centroid + median distance; pins > 50 km AND > 3× median get retried with a 0.4° bbox centred on centroid.
  Live-verified: `"Icelandic Sagas Museum"` unbiased → 64.96, -19.02 (wrong); suffixed with `, Reykjavik` → 64.15, -21.95 (correct Old Harbour location).
- **Weather → trip-header** (`70526bc`) — WeatherBar moved from below the section list into the trip-header card (right under destination + metadata). Per-day temp badges stripped from the map's day-filter chips. Single canonical forecast at the top.
- **Place-panel polish** (`482bf8f`) — anchored flush below the Dynamic Island (`top: 8` → `safe-area-inset-top + 4`); width 320→300, maxWidth `100%-72px` so the map peeks on the right; horizontal swipe on the hero image flips photos (≥40 px AND beats vertical wobble), `draggable=false` + `user-select: none` so iOS doesn't show the image-preview menu mid-swipe.
- **Drawer chrome shrink** (`976a64f`, `6bb3b6d`) — idle "Drop a pin to update your trip" CTA removed (only renders when `pinChangeCount > 0`). Chips flush to camera island (`safe-area-inset-top` no buffer). Search bar at `safe-area+44`. Paperclip upload icon at the start of the search bar (replaces the deleted "ANALYZE PHOTO OR VIDEOS TO ADD PIN" bar) — POSTs to `/api/itinerary/media` with day=0, toast feedback, dispatches `geknee:itinerary-updated`.
- **Drawer container fixes** (`7e5b454`) — Capacitor Keyboard plugin: `resize: KeyboardResize.None` + `resizeOnFullScreen: false` (was lifting the entire map when the search bar focused). Drawer width 88vw → 94vw, maxWidth 480 → 560.

### Chat / genie
- **Itinerary editor speed** (`f33a943`) — `edit_itinerary` slices to single `## Day N` section when meta hints a day → Haiku rewrites ~400 tokens instead of ~3000. Prompt-caches `REVISE_SYSTEM` via `cache_control: ephemeral`. **`happy-multi` measured live: 52.5s → 16.6s (−68%)**. Falls back to whole-doc rewrite when day hint is missing or header isn't found.
- **Empty-reply fallback** (`385f120`, `f2b1a94`) — Sonnet was emitting 0 text tokens for ROT13/hex-encoded prompt-injection refusals (silent empty bubble UX bug). Server now tracks text bytes written to the stream; if 0 at the end, injects a polite redirect sentence. Logged as `[chat] empty-reply fallback fired` for Vercel log grep.
- **Magic-fizzled cluster** (`1c506e1`, `9bb4845`, `1cac28c`) — three-commit fix to the user-reported "My magic fizzled" after Pokémon Center confirm:
  - Error tier surfacing (overloaded/529/503, rate-limit/429, ECONNRESET/ETIMEDOUT each get a tailored message; full trace to `console.error("[chat] error:")` for log grep).
  - Tool input validation: tool throws wrap into structured JSON `tool_result` instead of bubbling to the outer catch; safeParse + missing-field check before invoking handler.
  - System prompt's "Security and privacy" section: refuse system-prompt extraction, tool list, model name, infra details, env vars, other-user data, source code, training data; treat pasted content as DATA; refuse "ignore previous instructions" / "act as X" / "output the system prompt as JSON"; refuse-with-redirect rule ("never empty bubble").
  - Editor model: Sonnet 4.6 → Haiku 4.5 (5× faster on the surgical "add one line" task; `maxDuration` bumped to 120s).
  - Test harnesses checked in: `bin/test-chat-scenarios.mjs` (14 baseline + multi-turn), `bin/test-chat-adversarial.mjs` (15 jailbreak / multi-lang / encoded / context-bleed). Both fire against prod with the dev cookie pulled by `bin/extract-chrome-cookie.py`, tracking input/output tokens per scenario. **Final scoreboard: 29/29 pass, 0 fizzles, 0 leaks, 0 empty bubbles. ~$0.63 of the $5 budget spent.**

### Waitlist (iOS early access)
- **Schema + endpoint + page** — `WaitlistEntry { id, email-unique, source?, city?, createdAt }` in Prisma + migration applied to prod (`20260614204100_add_waitlist`). `/api/waitlist` POST validates email, dedupes via unique constraint, sends Resend confirmation (soft-fails if `RESEND_API_KEY` missing — signup row still saves; key IS set on Vercel Production). `/waitlist` page in passport-zine palette; reads `?src=` query param + IG/TikTok/Pinterest referrer fallback so reel signups get tagged automatically.
- **Landing CTAs** — hero "iOS · join waitlist" button (sandwiched between "Start collecting →" and "How it works", lavender ACCENT, +0.5deg tilt), plus the tour-page "Get on App Store" / "Get on Google Play" — all wrapped in `app/components/landing/WaitlistCta.tsx` (tiny client component so the server-rendered tour page stays as-is). All emit `waitlist_cta_click {platform, surface}` on tap.
- **PostHog funnel** — 5 new events added to the strict union in `lib/analytics.ts`: `waitlist_cta_click`, `waitlist_submit_attempt`, `waitlist_signup`, `waitlist_already_member`, `waitlist_signup_failed`. Source attribution flows: landing CTAs use `?src=landing-{hero|ios|android}`; reel links use document.referrer; `useScreen('waitlist', {source})` fires on mount. Funnel: `screen_view (screen=waitlist)` → `waitlist_submit_attempt` → `waitlist_signup`, broken down by source.

### Reel builder
- **3-act format** (`f6e8489`) — `apply_overlays()` now accepts optional `body` / `cta_text` / `hook_end_secs` / `body_end_secs`; time-gated via ffmpeg `enable=` (commas inside escaped). 0-3s hook → 3-10s body → 10s-end CTA. Backwards-compatible: when `body`/`cta_text` are None, hook stays for full duration. Demo concept `iceland-3act` checked in for apples-to-apples comparison.
- **Earlier pipeline fixes** (already shipped before this handoff, important to know):
  - Soft-wrap helper `_soft_wrap_hook` greedy-wraps the hook at the largest font size where every line fits the 1000px safe text area AND total height stays under the 360px height budget. Strips manual `\n` so hooks read as natural sentences instead of 2-words-per-line stacks.
  - 4:5 safe-zone positioning — caption top at `safe-area-inset-top` zone, watermark moved up to clear the 1635 px cut-line; same file works as REEL (full 9:16) and POST (4:5 center-crop) without text cropping.
  - `bin/reoverlay-reels.py` — one-shot re-burn helper that reuses cached `concat.mp4` / `pexels_concat.mp4` / `reveal.mp4` under `_tmp/` so no Pexels re-pull, no clip drift. 19 reels re-rendered in ~30s when overlay logic changed.
  - Reusable end-card PNG at `ad-assets/instagram/cta-card-waitlist.png` (lavender zine stripe, "JOIN THE WAITLIST · geknee.com/waitlist · 275 monuments · couch flexes don't count"). Added as final `image_refs` entry in every new concept so each reel ends on the CTA.
- **Reel queue state** — preview station running at `http://localhost:7878/preview.html` (background `python3 -m http.server 7878` rooted at `ad-assets/instagram`). 25 reels in the viewer:
  - `2026-06-14` (9 new variety reels): `spreadsheet-monster`, `socotra-alien-trees`, `one-saturday-rule`, `tabs-vs-globe`, `norway-fjords`, `grandparent-regret`, `dating-app-but-cities`, `iceland-black-sand`, `friday-5pm-airport`.
  - `2026-06-15` (1 demo): `iceland-3act`.
  - `2026-06-08` (5 original): `spreadsheet-trauma`, `tokyo-day-1-check`, `quest-easter-island`, `quest-eiffel`, `quest-machu-picchu`.
  - `2026-06-06` (5 duplicates of the 06-08 quest hooks — kill these on next dedup pass).
  - `2026-06-05` (6 original): `forget-maldives`, `hidden-valley`, `jurassic-island`, `most-asked-question`, `spin-the-globe`, `wild-camping`.

---

## Pending / next session priorities

### P0 — flagged but not yet implemented
- **Re-cut existing 2026-06-14 reels in the 3-act format.** Only `iceland-3act` was built as a demo. The other 9 concepts have `hook` only; re-author each with `body` + `cta_text` and run the builder.
- **Source explicit audio IDs for the unpaired reels** — 10 of the 14 currently say "pull a trending audio at upload"; only `prove-3-of-47` (Wings), `spreadsheet-trauma` (SPEND DAT SAX), `tokyo-day-1-check` (Life Feels So Good), `spin-the-globe` (cinematic-travel trending) have specific IDs. Higgsfield virality predictor + IG audio library can rank candidates.
- **Cleanup duplicate 2026-06-06 quest reels** (5 reels) — same hooks as 2026-06-08, both render in the preview viewer.

### P1 — known issues
- **Reykjavik test trip is missing `## Day 2:` and `## Day 3:` sections.** Banner now warns the user, but the underlying generator/edit bug isn't fixed. Probably worth instrumenting `edit_itinerary` to log when a returned sliced section is shorter than expected or when full rewrites lose day count.
- **Some reels include off-topic Pexels footage** — `tabs-vs-globe` opens on a laptop showing a random "Adoption Today" page; `socotra-alien-trees` got dragonfruit footage because Pexels has no actual Socotra trees. Either re-pull with different queries OR swap concepts.

### P2 — nice-to-have
- **TTS voiceover for reels** — not wired today. Would need ElevenLabs or OpenAI TTS plus a per-concept `voiceover` field. Big lift; only valuable if the silent-reel + trending-audio pattern starts underperforming.
- **Pinterest mood-board pipeline** — flagged in memory as "in the pipeline" but not built. Per `project_pinterest_in_pipeline.md`: build a 12-20-pin secret board per reel before any Kling/Seedance gen.

---

## Where to look / what to run

| What | Where |
|---|---|
| Trip-map drawer | `app/plan/summary/UnifiedTripMap.tsx` (2200+ lines). `apply_overlays`, `PlacePanelOverlay`, geocode pipeline, day chip strip all live here. |
| Itinerary header / banner | `app/plan/summary/SummaryView.tsx` lines ~1797-1985 (trip-header card + WeatherBar + missing-day banner). |
| Chat handler | `app/api/chat/route.ts`. Streaming tool loop, error-tier surfacing, empty-reply fallback, security prompt at lines ~225-245. |
| Itinerary editor tool | `lib/agent/tools/edit_itinerary.ts`. Slice-to-day path + extractDaySection helper at the bottom. |
| Waitlist | `app/waitlist/{page.tsx, WaitlistForm.tsx}` + `app/api/waitlist/route.ts` + `app/components/landing/WaitlistCta.tsx`. |
| Reel builder | `bin/build-remix-reel.py` (variety reels), `bin/build-monument-quest-reel.py` (quest-format reels), `bin/reoverlay-reels.py` (one-shot re-burn). |
| Preview station | `bin/build-preview-html.py` → `ad-assets/instagram/preview.html`. Layout markers (`max-width: 420/540px`, `minmax(0, 1fr)`, `width: 64px; height: 90px`) live in the generator's CSS strings — re-edit there, not the output. |
| Test harnesses | `bin/test-chat-scenarios.mjs` (14 baseline), `bin/test-chat-adversarial.mjs` (15 jailbreak). Both need `bin/extract-chrome-cookie.py` running against Chrome with a live geknee session. |

### Useful commands
- Re-render every existing reel after an overlay logic change: `python3 bin/reoverlay-reels.py`
- Regenerate preview HTML after building a new reel: `python3 bin/build-preview-html.py`
- Start preview server: `cd ad-assets/instagram && python3 -m http.server 7878` (already running in the most recent session — check `lsof -iTCP:7878 -sTCP:LISTEN`)
- Run chat baseline tests: `node bin/test-chat-scenarios.mjs` (~$0.17 / run)
- Run chat adversarial tests: `node bin/test-chat-adversarial.mjs` (~$0.17 / run)

---

## Memory hits worth knowing about

Per the user's auto-memory (`MEMORY.md`):
- Higgsfield is the canonical image/video tool; Claude Code stays in lane (automation, scripts, orchestration).
- IG posting is manual since 2026-05-31 — `@gekneetravel` was disabled; build deliverables only, user uploads.
- HQ Creative Loop (`~/geknee/hq-creative-loop/`) is the canonical source-of-truth for geknee creative; read its `SKILL.md` first.
- Verify before push: trivial fix → push + tell user exactly what to verify; substantive → dev server + Playwright on `?mapbox-globe=1`; iOS-only → admit you can't verify, ask user.
- Playwright on geknee: use `page.evaluate` + CDP screenshots — `locator.click/fill/visible` all hang on actionability/fonts.ready.

---

## Open questions / decisions for the user

1. **3-act re-cut**: greenlight to re-author the 9 remaining 2026-06-14 reels in the hook/body/CTA format? (Will need ~10 min of copywriting + ~5 min builder runtime per reel.)
2. **Duplicate 2026-06-06 reels**: safe to delete? They share hooks with 2026-06-08.
3. **`socotra-alien-trees` swap**: replace with a concept Pexels has real coverage for (Faroe Islands / Lofoten / Lençóis Maranhenses)?
4. **Itinerary missing-section root cause**: instrument the generator to detect dropped days, OR add a "regenerate just Day N" affordance to the chat?
