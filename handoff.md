# Session Handoff — 2026-05-26 → 2026-05-27

Latest commit on `main` (pushed, Vercel deploying): `2be065b city map: gradient-sweep pin, POI handoff, memory mitigations, globe canary`.

---

## What shipped this session

### Pin morph animation (CityMapView 2D map)
- **`lib/googleMaps/marker.ts`** — SVG teardrop pin (36×48) replaces the prior circle-on-top.
  - Per-pin `<linearGradient>` with `id="geknee-pin-gradient-${++_pinIdCounter}"` (unique-id bug fixed — every pin was sharing one gradient before).
  - Two SMIL `<animate>` nodes slide the gradient's `x1` (−40 → PIN_W) and `x2` (−4 → PIN_W+36) across the pin head over 900 ms with `keySplines="0.4 0 0.2 1"`. Sweep starts at 180 ms after the spring drop; `fill="freeze"` holds the end state.
  - Anchored bottom-centre so the tip lands ON the POI icon (no centring transform).
  - Inner white circle for depth; idle aura starts pulsing 1.4 s after morph completes.
  - Keyframe block ID is `geknee-pin-keyframes-v2`, **overwrite-on-mount** so HMR-stale keyframes get replaced.

### React StrictMode root-cause bug (the real one)
- `app/components/CityMapView.tsx:282` — `unmountedRef.current = false` at top of mount useEffect.
- StrictMode's mount → cleanup → remount left this `true` forever after the first cleanup, causing every POI click's async `place.fetchFields` path to bail at `if (unmountedRef.current) return;` before reaching `dropPin`. **That was the actual cause of "POI clicks do nothing."**
- Memory saved at `~/.claude/projects/-Users-geknee-geknee/memory/feedback_strictmode_refs.md`.

### POI handoff
- `clickableIcons: true` (was `false`) — Google's default infowindow stops being a blocker.
- Click handler captures `e.placeId`, calls `e.stop?.()`, resolves via `new google.maps.places.Place({ id })` + `fetchFields(['displayName','location'])`, drops a labeled pin.
- Falls back to raw click latLng on lookup failure.
- `lib/googleMapsLoader.ts` now requests `libraries=places,geometry,marker` (was missing `marker` → `AdvancedMarkerElement` undefined error earlier).

### Globe persistence (camera + rotation + 2D map)
- **`geknee:globe-camera-v1`** (`CameraPersister`): `{x,y,z}`, bounds-checked to `[10.5, 45]`.
- **`geknee:globe-rotation-v1`** (inside `GlobeScene` useFrame): `{x,y,z,w}` quaternion, `currentQ.normalize()` after restore.
- **`geknee:active-citymap-v1`**: `{name,lat,lon}`. Lazy `useState` restores on mount; removed on `setCityMap(null)`.
- All three: `Number.isFinite` validation, `try/catch`, **self-clear bad entries** on cold start so a corrupted value can't permanently break the next mount.
- Return-to-globe now calls `flyToGlobe(cm.lat, cm.lon, () => zoomCamera(20))` so the globe orients to the same city you were zoomed into.

### Memory mitigations (Safari memory budget)
- **Globe `frameloop` pauses while CityMapView is mounted** — `useEffect([cityMap !== null])` flips `renderPaused = true`. Resume only on CityMap close AND `document.visibilityState === 'visible'`.
- **On-map pin cap = 50** — `droppedMarkersRef` splices + `.remove()` once over.
- **`geknee:pins-all` cap 500 → 200** — FIFO trim. Affects radius-based trip-planner handoff.
- Documented in `CLAUDE.md` → "Memory budget" section with the active-mitigations list.

### WebGL context-loss recovery
- Desktop: register `webglcontextrestored` once; bump `glKey` to remount. 4 s timeout fallback if `restored` doesn't fire (Turbopack drops it on some HMR cycles).
- iOS stays on the safe static-backdrop path (prior OOM-crash-loop avoidance is real, do not change).

### Globe load canary (prod monitoring)
- 10 s watchdog on Canvas mount; if `globeReady` doesn't fire → `track('globe_load_failed', { glKey, path, userAgent })` + Sentry `captureError(new Error('Globe load watchdog tripped'))`.
- Loading overlay swaps to a retry panel calling `resetGlobe()`.
- Pair event `globe_load_recovered` fires if the texture lands AFTER the watchdog tripped — lets PostHog compute true "stuck globe" rate as `(failed − recovered) / pageviews`.
- New `AnalyticsEvent` union entries: `globe_load_failed`, `globe_load_recovered`.

### Escape hatch
- `window.__geknee.resetGlobe()` in DevTools → clears all 3 persistence keys, drops `cityMap`, bumps `glKey`. Documented in `CLAUDE.md` → "Recovery".

### Trip-planner radius handoff
- `SummaryView.tsx` — pins now flow into ANY trip within ~50 km of the click location (equirectangular distance, `/api/geocode` cached once).
- Each pin appended to global `geknee:pins-all` in addition to the per-city `geknee:pin-draft:<city>` key.

### Sparkles / fireflies removal
- `LocationClient.tsx` — ambient `<Sparkles>` fly-burst removed; `Sparkles` import dropped from drei.
- `landmark.tsx` — per-monument unlock-burst `<Sparkles>` removed; `sparkleGroupRef` deleted; `Sparkles` import dropped.
- `ua.sparkleActive` flag kept (no-op) for parity with the 4 s unlock-animation timer.

### Globe label tuning
- SDF `CityLabel` scale curve `pow(camDist/15, 1.4)` → `pow(camDist/20, 1.6)` (more aggressive shrink on zoom-in).
- States/cities overlays now use a two-sided fade band (states `[14, 28]`, cities `[11, 22]`) so labels don't billboard at extreme zoom.
- Small-cities `popMin` lowered so the 1K-pop dataset is reachable at camDist 11–12 (was only ≤ 11).

### Monument click → collection
- `landmark.tsx` dispatches `geknee:open-monument-shop` event on click of a collected monument.
- `LocationClient.tsx` + `AtlasShell.tsx` listen, call `setShopOpen(true)` + `setShopInitialMk(mk)`.
- `MonumentShop.tsx` — new `initialMk?: string | null` prop, pre-selects the tapped monument after `load()` resolves.
- `LANDMARK_BOOST = 2.925` (was 2.34, +25%).

### Misc
- City map header (`{name} + Return to globe`) moved from `top:18, left:50%, translateX(-50%)` to `top:18, right:18` so the search bar never overlaps it on narrow viewports.
- `ResizeObserver` on the Google Maps container triggers `google.maps.event.trigger(map, 'resize')` + recenter so tiles re-fill on viewport changes.
- Toast (bottom-centre purple chip) confirms "Pin saved to {city} trip" on drop; "Pin removed from trip" on right-click.

---

## Files touched (current state)

```
CLAUDE.md                                # memory budget, recovery, canary docs
app/components/CityMapView.tsx           # POI handler, gradient pin, caps, header layout, unmountedRef reset
app/components/MonumentShop.tsx          # initialMk prop
app/plan/location/LocationClient.tsx     # CameraPersister, GlobeScene quaternion, watchdog, frameloop pause, fireflies removal, escape hatch
app/plan/location/globe/landmark.tsx     # monument-click → shop event, +25% scale, Sparkles removed
app/plan/location/atlas/AtlasShell.tsx   # geknee:open-monument-shop listener
app/plan/summary/SummaryView.tsx         # radius-based pin import + live event listener
lib/analytics.ts                         # globe_load_{failed,recovered} events
lib/googleMaps/marker.ts                 # SVG teardrop, gradient shimmer, unique IDs, white halo
lib/googleMapsLoader.ts                  # libraries=places,geometry,marker
handoff.md                               # this file
```

Memories saved this session (`~/.claude/projects/-Users-geknee-geknee/memory/`):
- `feedback_verify_with_playwright.md` — verify UI work via logs + Playwright, not just typecheck
- `feedback_strictmode_refs.md` — reset unmount-flag refs at top of useEffect (StrictMode survives `useRef`)

---

## Verification

iPhone 17 Pro Simulator loaded `http://localhost:3000/plan/location` via mobile Safari (= same WKWebView the Capacitor app uses). Globe rendered, PWA install banner fired, no console errors.

Capacitor `server.url` still points at `https://www.geknee.com`, so the production app picks up all of these changes automatically once Vercel deploys.

Pin morph verified by Playwright:
- 5 pins dropped, each with unique gradient id (`geknee-pin-gradient-1..5`).
- 10 SMIL `<animate>` nodes (2 per pin) wired.
- Mid-flight screenshots show green→purple sweep at 40 ms / 160 ms / 380 ms / 700 ms.

---

## Update — 2026-05-27 second pass

Three follow-up commits shipped after audit revealed the original ranking was based on stale reads of the codebase:

- **`38b9f66`** — deleted `DayMap.tsx`, `RouteMap.tsx`, `PlanningMap.tsx` (2,458 LOC) + unused `PlanningMapDynamic` import. Audit found 3 of the "4 maps" had no consumers; only `UnifiedTripMap` actually mounts on summary, and only one instance at a time (planning XOR itinerary tab).
- **`40db6f9`** — mobile itinerary tab now renders `/api/og-trip-map/{savedTripId}` as a static thumbnail with "Tap to interact" CTA. Promotes to live `UnifiedTripMap` on click. Desktop unchanged (sticky sidebar is the active edit surface). `mapInteractive` state resets when `savedTripId` changes.
- **`727d1be`** — added 4 cleanup useEffects in `LocationClient.tsx` that dispose state-held textures (earth ~256 MB, bump ~16 MB, states + cities overlays ~50 MB) on value-change AND unmount. The IDB-cache-hit path previously had no cleanup; textures survived past unmount until next full GC.
- **`7d49cc3`** — deleted unused `HeroGlobe`/`HeroGlobeClient` pair (also pulled three.js into a chunk nothing rendered).

### Open / suggested for next session

Recalibrated ranking after this round's audit:

1. **Verify pin morph + static thumbnail on real iPhone.** Two unverified-on-device changes are now live: the SMIL gradient pin morph (from the prior session) and the mobile itinerary-tab static thumbnail (this session). Simulator metrics don't reflect real-device behavior. Test the golden path: open a saved trip on iPhone → confirm thumbnail loads → tap → confirm live map mounts smoothly. Use Activity Monitor to confirm the dispose change moves the needle when navigating away from `/plan/location`.
2. **Delete `/plan/style/page.tsx`** if confirmed dead. Comments in `app/plan/location/page.tsx`, `app/components/GlobalChat.tsx`, and `app/components/TripSocialPanel.tsx` describe it as "legacy UI" / "we don't router.push to /plan/style anymore." Still imports three.js. Risk: inbound bookmarks on the live route. Safer to add a redirect to `/plan/location` than delete outright.
3. **Add a generic `/api/staticmap` endpoint** if you want the mobile-thumbnail pattern for *unsaved* trips (currently falls through to live mount). Should accept `?location=...&pins=lat,lng;lat,lng&w=...&h=...&zoom=...`, apply 2dp lat/lng coalescing, use the same dark style as `og-trip-map`, cache 1d.
4. **App Store / Play Store publishing** — still blocked on credentials. Useful next step: write a `docs/PUBLISH_CHECKLIST.md` with the manual Xcode/Android Studio steps so the user can execute them without re-deriving the flow.

### App Store / Play Store publishing — user asked

Not automatable from this session. Requires:
- **Apple**: App Store Connect API key OR username+app-specific password; signing certs; existing app record with metadata + screenshots
- **Google**: Play Console service account JSON; upload signing key; existing app record

Suggested next step: write a manual publish checklist (commands + console steps) if user wants. No `fastlane/` directory and no `.github/workflows/` exist yet — any TestFlight/Play Internal Testing today is manual Xcode/Android Studio.

---

## Persistence keys (do not edit without bumping vN suffix)

```
geknee:globe-camera-v1         {x,y,z}                   CameraPersister
geknee:globe-rotation-v1       {x,y,z,w} (unit quat)     GlobeScene useFrame
geknee:active-citymap-v1       {name,lat,lon}            LocationClient lazy useState
geknee:pin-draft:<city-lower>  PinDraft[]                CityMapView
geknee:pins-all                GlobalPin[] (cap 200)     CityMapView + SummaryView radius lookup
geknee:bookmarks:<location>    Bookmark[]                SummaryView
geknee:bookmark-baseline:<…>   string[]                  SummaryView
geknee:citymap-recents:<name>  GeocodeFeature[]          CityMapView search
```

Schema changes → bump version suffix. Readers don't migrate; they silently miss the entry and start fresh.

---

## Recovery + monitoring quick-ref

```js
// DevTools on live or local:
window.__geknee.resetGlobe()
```

Clears all three persistence keys, drops `cityMap`, bumps `glKey` for a fresh Canvas.

**PostHog queries:**
- `globe_load_failed` per day — baseline single-digit per 1k page views; spike = ship-broke or CDN regression.
- True stuck rate: `(failed − recovered) / pageviews`. Alert if > 0.5% over rolling hour.

**Sentry:** search `Globe load watchdog tripped` — group by `glKey` extra to see if resets cluster around the same mount.

---

## Known caveats

- **Playwright headless cannot reliably dispatch clicks to Google Maps' synthetic event system** — about 1-in-3 `mouse.click` calls actually trigger the registered listener. Don't trust automated "no pin dropped" as a real bug; verify in a real browser first.
- Dev log routinely shows `THREE.WebGLRenderer: Context Lost.` on HMR cycles. Desktop recovery kicks in via the `webglcontextrestored` + 4 s fallback path. Not present in production.
- 21st.dev cards are JS-rendered — curl/WebFetch only sees the shell. To scrape, use Playwright with longer wait + scroll, OR use WebSearch and grab the URLs directly.

---

## Next-session prompt

> Read `handoff.md` at repo root for full context. Skim the "Update — 2026-05-27 second pass" section first; it overrides the original ranking. Highest-ROI next move is on-device verification of the new mobile thumbnail + dispose changes via iPhone (open a saved trip, watch Activity Monitor as you navigate away from `/plan/location`).
