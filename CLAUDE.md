# geknee.com — Claude Code

Next.js 16 + React 19 travel AI app. Globe-first UI with Three.js, Prisma + PostgreSQL, Stripe, Google Maps Platform. AI agent's `lib/agent/tools/route_between.ts` still calls Mapbox Directions server-side; client surfaces are all Google Maps.

## Key directories
- `app/` — Next.js App Router pages and API routes
- `app/plan/location/` — main globe page (home)
- `app/components/` — shared components
- `lib/` — prisma client, i18n, globe animation helpers
- `.agents/` — autonomous review agents (see below)

## Two-agent review system

Two Claude Code agents run in separate VS Code terminals to continuously audit the site:

| Agent | Terminal | Role |
|-------|----------|------|
| UX Scout | `.agents/run-ux-agent.sh` | User experience, navigation, mobile, flows |
| Dev Scout | `.agents/run-dev-agent.sh` | Performance, security, TypeScript, APIs |

**Shared workspace:** `.agents/shared/`
- `ux-findings.md` — UX Scout writes here
- `dev-findings.md` — Dev Scout writes here
- `PLAN.md` — both agents contribute; **user approves here**

### To run a review cycle
1. Open two VS Code terminals side by side
2. Terminal 1: `bash .agents/run-ux-agent.sh`
3. Terminal 2: `bash .agents/run-dev-agent.sh`
4. Tell each agent: `Start your review`
5. Both agents run their checklists and cross-read each other's findings
6. Review `.agents/shared/PLAN.md` when they're done
7. In this terminal: `implement the approved plan` to execute approved items

### To implement an approved plan
When you've reviewed `PLAN.md` and want changes implemented, tell this Claude session:
> "implement the approved plan"

Claude will read `PLAN.md`, implement all `[APPROVED]` items, and commit the changes.

## Tech notes
- Globe: `app/plan/location/` with OrbitControls, pointer-event drag, pinch-zoom
- Globe scene is split: `app/plan/location/globe/` holds `skins.ts`, `geo.ts`, `info.ts`, `locations.ts`, `landmark.tsx`, `AllLandmarks.tsx`. Edit those first — `LocationClient.tsx` is the glue.
- Auth: NextAuth v5 beta (`app/api/auth/`)
- Payments: Stripe webhook at `app/api/stripe/webhook/`
- AI: Anthropic SDK at `app/api/chat/`
- Mobile: `touch-action: none` on canvas, `100svh` for Safari

## Globe state persistence

Three localStorage keys carry the user's view across refresh/back-nav. All three are read defensively (try/catch, bounds checks, quaternion normalize) and bad entries self-clear on the next mount. **Bump the `vN` suffix when you change the payload shape** — the readers do not migrate.

| Key | Owner | Shape |
|---|---|---|
| `geknee:globe-camera-v1` | `CameraPersister` | `{x,y,z}` camera position, clamped to OrbitControls min/maxDistance |
| `geknee:globe-rotation-v1` | `GlobeScene` quaternion useFrame | `{x,y,z,w}` globe rotation, normalized before applying |
| `geknee:active-citymap-v1` | `LocationClient.cityMap` state | `{name,lat,lon}` — restored on cold start, removed on Return-to-globe |

## Recovery

- **Stuck globe / static backdrop / weird saved view** → call `window.__geknee.resetGlobe()` in DevTools. Clears all three persistence keys, drops any active 2D map, and bumps the Canvas key so the scene rebuilds from defaults. Wired in `LocationClient.tsx`.
- **WebGL context loss** is handled in two paths: iOS gets the safe fallback (static backdrop, no remount — prior iOS-OOM crash loop) and desktop attempts recovery via `webglcontextrestored` + a 4s timeout fallback to bump `glKey`.

## Memory budget — keep Safari from auto-reloading

Safari (Mac + iOS) reloads tabs that exceed its memory budget with the banner *"This webpage was reloaded because it was using significant memory."* The geknee planner is right at the edge because it stacks:

- A WebGL 3D globe with an 8K earth texture (~256 MB GPU)
- A second WebGL canvas (Google Maps via CityMapView)
- AdvancedMarkerElement DOM trees (SVG + gradient + SMIL nodes)
- The persistence layer (camera, rotation, draft pins, global pin list)

**Active mitigations (do not undo without measuring):**

1. **Globe frame loop pauses when CityMapView is mounted.** `LocationClient.tsx` flips `renderPaused=true` while `cityMap !== null` so R3F's `useFrame` stops ticking under the fully-occluding 2D map. Resume only fires on CityMap close AND `document.visibilityState === 'visible'` to avoid fighting the existing visibilitychange handler.
2. **On-map marker cap of 50.** `CityMapView.dropPin` truncates `droppedMarkersRef` once it exceeds 50; older drops are removed from the map but stay in `geknee:pin-draft:<city>` localStorage for the trip-planner cold-load path.
3. **Global pin list cap of 200.** `geknee:pins-all` is FIFO-trimmed at 200 entries (was 500). The trip-planner radius lookup only needs recent pins.
4. **Texture cap on mobile.** `createEarthTexture` uses 4096 px on mobile (vs 8192 on desktop) per the existing logic in `LocationClient.tsx`.

**Signals you broke the budget:**

- Safari banner: "was using significant memory."
- `THREE.WebGLRenderer: Context Lost.` in the dev log paired with the `geknee:webgl-fallback` event.
- `globe_load_failed` PostHog event spike.

When debugging, prefer Activity Monitor (or Web Inspector → Timelines → Memory) over guessing — the 8K texture is the single biggest consumer and easy to mistake for something subtle.

## Globe load canary (prod)

A 10s watchdog in `LocationClient.tsx` flags users whose earth texture never resolved — typically a stalled JSON fetch, blocked CDN asset, or a WebGL context that died without firing `restored`. The watchdog:

1. Fires a PostHog `globe_load_failed` event with `{ glKey, path, userAgent }`.
2. Sends the same incident to Sentry via `captureError` with `{ glKey, isMobile, isLowEnd }` for grouping.
3. Swaps the in-page loading spinner for a retry panel that calls `resetGlobe()` in one click.
4. If the texture eventually arrives, fires `globe_load_recovered` so you can compute true "stuck globe" rate as `failed - recovered`.

**Monitoring queries:**

- PostHog → Insights → `globe_load_failed` count per day; expected baseline is single-digit per 1k page views. Spike = ship-broke or CDN regression.
- Sentry → search `Globe load watchdog tripped` (groups by error message). Use the `glKey` extra to see whether resets clustered around the same Canvas mount.
- Pair the two events: `(failed - recovered) / pageviews` is the "user stayed stuck" rate. Alert if it exceeds 0.5% over a rolling hour.

## Observability MCPs — use these before guessing at production bugs

Both are installed in Claude Code's MCP config. They cover different halves of the triage story:

| MCP | What it's good for |
|-----|---|
| **Sentry** (`mcp.sentry.dev`) | Stack traces, release tagging, Seer AI fix suggestions. Start here for any reported exception. Tools: `search_issues`, `search_events`, issue retrieval. |
| **PostHog** (`mcp.posthog.com`) | Session replay, funnel/conversion impact, user-behavior context. Start here for "users say X feels broken" with no stack trace. Tools: `error-tracking-issues-*`, `query-session-recordings-list`, `query-run` (HogQL/SQL). |

**When to reach for them proactively (without being asked):**
- User reports a production bug → query Sentry first for the stack trace, then PostHog for a replay of the affected session.
- You see "intermittent" or "can't reproduce" → PostHog replay is almost always faster than local repro attempts.
- Before shipping a fix for a reported issue → check Sentry for how widespread it is; a one-off may not need a hotfix.

**Don't use them for:**
- Local development bugs (no prod data for these).
- Anything pre-deploy — both only see what's shipped.

Session recording is enabled in `lib/analytics.ts` with `maskAllInputs: true`. Tag any DOM node holding PII with `data-private` to extend masking. Before sharing a replay externally, skim it for anything the mask missed.

Two error sources (Sentry + PostHog error tracking) overlap. **Treat Sentry as the source of truth for exceptions**; PostHog's error view is useful for correlating with behavior but shouldn't drive independent triage.

## Google Maps Platform — ops

- **Budget alarms** (set in Google Cloud Console → Billing → Budgets):
  - 50% of $200 free credit → email
  - 100% of free credit → email + Slack
  - $500/mo absolute → page on-call
  - $1k/mo absolute → API key auto-disable
- **Two keys:**
  - `GOOGLE_PLACES_API_KEY` (server-only): no app restriction, IP-restricted to Vercel egress where possible. Enables: Directions, Geocoding, Places, Weather, Time Zone, Street View Static, Maps Static.
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client): HTTP-referrer restricted to geknee.com + *.vercel.app + localhost. Enables: Maps JS, Places (client autocomplete).
- **Cost mitigations in code** (all live as of 2026-05-20):
  - Session tokens on Places Autocomplete
  - Field masking on Places getDetails (Basic only)
  - KV (or in-memory) cache on /api/directions
  - 1-week immutable CDN cache on /api/streetview
  - lat/lng coalescing to 2-decimal precision on /api/weather
- **Live server routes** (all auth-gated except OG):
  - `/api/streetview` — Street View Static proxy, 302 → Google CDN
  - `/api/weather` — current + 7-day forecast via Google Weather API
  - `/api/timezone` — IANA timezone resolver, 1-year immutable cache
  - `/api/directions` — Routes API v2 (`v2:computeRoutes`), KV-cached
  - `/api/geocode` — Geocoding API (already in use)
  - `/api/og-trip-map/[tripId]` — Maps Static OG share card (no auth, public-link previewable)
- **Wave 3 deferred** (each needs design pass): Maps Grounding Lite, Aerial View, Air Quality + Pollen, Roads API, Distance Matrix, Photorealistic 3D Tiles.
- **Phase 5 deferred**: server `lib/agent/tools/route_between.ts` still calls Mapbox Directions. Migrate to Google Directions after 30 days of Routes API usage data.
