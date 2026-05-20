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
