# geknee — globe gesture tutorial (2026-05-20)

Reference doc for the globe interaction model on **geknee.com**, a travel-AI
app built on a 3D globe (Next.js 16 + React 19 + Three.js, Prisma, Stripe,
Google Maps). GitHub repo: `nejihyuga1600-hub/geknee` (branch `main`).

This document covers the **single-click vs double-click portal gesture**
shipped on 2026-05-20. Use it as a briefing for any future Claude design
session that needs to extend or restyle the globe interaction layer.

## The gesture model

The home globe at `app/plan/location/LocationClient.tsx` uses two distinct
gestures to separate **placing the trip-starting portal** from **zooming
in to commit.**

| Gesture | Surface | Result |
|---|---|---|
| **Single click / tap** | desktop + mobile | Drops the purple portal at the hit lat/lon and rotates the globe so the portal faces the camera. **No camera zoom.** Nearby city pins render around the portal. |
| **Double click** | desktop | Drops the portal AND zooms the camera in to distance 14 (close-in view). Works on cities and non-city land. |
| **Long press (~500ms)** | mobile / touch (Capacitor iOS + Android) | Same effect as desktop double-click — drops the portal + fly + zoom. iOS Haptic Touch and Android long-press both resolve through the underlying `pointerdown` event. |

Mental model: **tap to look, double-tap (or hold on touch) to dive in.**

The long-press is implemented in `LocationClient.tsx` via mesh-level
`onPointerDown` / `onPointerMove` / `onPointerUp` handlers, gated on
`e.pointerType === 'touch'` so a held mouse on desktop does NOT trigger
it (desktop keeps the double-click gesture). A move of >8px during the
hold cancels — that's a drag-to-rotate, not a press. The trailing
`onClick` that fires when the user releases after a long-press is
suppressed via `longPressFiredRef` so the portal isn't re-placed without
zoom right after the hold.

## What changed (vs the prior behavior)

Before 2026-05-20: a single click always did both — drop portal AND
auto-zoom. The forced zoom kicked in even when users were just exploring
open land (mountains, coastlines, terrain), which removed their agency
to look around first.

After 2026-05-20: zoom is opt-in via double-click. The portal-drop is
the cheap, reversible exploratory action; the zoom is the commit.

## File pointers (where the code lives)

- **Click handlers:** `<Sphere ...>` inside the `GlobeScene` component
  in `app/plan/location/LocationClient.tsx`.
  - `onClick` — single-click. Calls `setStarPos(...)` and
    `flyToGlobe(lat, lon, () => {})` — rotate only. Early-returns if
    `longPressFiredRef.current` was just set, to suppress the trailing
    click after a long-press.
  - `onDoubleClick` — desktop double-click. Calls `setStarPos(...)` and
    `flyToGlobe(lat, lon, () => zoomCamera(14))` — rotate + zoom.
  - `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerLeave`
    — touch long-press detector. Starts a 500ms timer on touch-only
    pointer-down; cancels on move >8px or release; on timer fire,
    triggers the same place + fly + zoom as `onDoubleClick`.
  - Long-press refs (`longPressTimerRef`, `longPressStartRef`,
    `longPressFiredRef`) are declared next to `dragRef` near the top of
    `GlobeScene`.
- **Lat/lon conversion:** done inline in each handler — world-space hit
  point → globe-local → spherical coords. The math is duplicated across
  the two handlers (about 4 lines) because pulling it into a helper
  inside the R3F render scope wasn't worth the indirection.
- **Portal visual:** `DroppedStar` component at `LocationClient.tsx:2085-2110`.
  Two concentric purple torus rings on the globe surface, spinning at
  ~0.4 rad/s.
- **Nearby city pins:** `NearbyCities` component at
  `LocationClient.tsx:2053-2082`. Rendered whenever `starPos` is set
  (the previous `zoomLevel >= 1` gate was dropped — see Design choices).
- **Camera helpers:**
  - `flyToGlobe(lat, lon, onDone)` from `lib/globeAnim.ts` — rotates
    the globe quaternion so (lat, lon) faces the camera; calls `onDone`
    when the animation finishes. `onDone` is required (not optional).
  - `zoomCamera(distance, onDone?)` from the same file — animates the
    camera position to the given distance from origin.
- **Drag guard:** `dragRef.current?.didDrag` (set up in the pointer
  handlers around `LocationClient.tsx:2128-2170`). Both `onClick` and
  `onDoubleClick` check this first to ignore events that were actually
  rotation drags.

## Design choices made

These are the calls the implementation locked in. Future design work
can revisit them, but they're the defaults today:

1. **Single click always re-places the portal**, even if a portal is
   already on the globe. Earlier drafts considered a "if portal already
   exists, skip the move" branch, but the simpler model is more
   predictable and the user is clicking somewhere on purpose anyway.
2. **Double click runs the full place+fly+zoom sequence**, regardless
   of whether a portal exists. If the user double-taps where a portal
   already sits, it re-places at the same spot (no visible change) and
   zooms — net effect: "zoom in here."
3. **Click handlers fire in order on a double-tap**: `onClick` (×2)
   fires first, then `onDoubleClick`. We accept this — the portal-drop
   is idempotent, the fly target gets overwritten by each call (only
   the latest `_pending` survives in `globeAnim.ts`), and the user sees
   immediate feedback on the first tap. No debounce.
4. **`NearbyCities` is no longer gated on `zoomLevel >= 1`.** Without
   the auto-zoom on single click, the camera stays far and `zoomLevel`
   stays at 0. The city pins now render whenever a portal is placed,
   regardless of zoom. Pins are visible from any altitude.
5. **Water hits are allowed** (no land-mask check). Clicking the ocean
   drops the portal there. Without nearby cities, the user just gets a
   bare portal — natural signal that there's nothing to commit to.
6. **Touch parity via long-press, not double-tap-only.** Mobile users
   get a 500ms long-press as the equivalent of desktop double-click.
   Double-tap on touch also works (R3F resolves it through the
   browser's `dblclick`), but holding is the dominant pattern on iOS
   Haptic Touch + Android, so we implemented both. Long-press is gated
   to `e.pointerType === 'touch'` so a held mouse on desktop is a no-op.

## Acceptance criteria (verified at ship)

- Single click on the globe lands the purple portal at the correct
  lat/lon and rotates the globe so the portal faces the camera. No
  camera distance change.
- Double click on the globe triggers `zoomCamera(14)` — close-in view
  — and works whether or not a portal is already placed.
- Long-press (~500ms) on touch devices triggers the same place + fly +
  zoom as desktop double-click. A move of >8px during the press cancels
  (treated as a drag).
- The post-release click that follows a long-press does NOT re-place
  the portal without zoom — suppressed via `longPressFiredRef`.
- `NearbyCities` city-pin selection appears after portal placement
  regardless of camera distance.
- The drag guard still suppresses click events that were actually
  globe-rotation drags.
- Works on touch (iOS + Android via Capacitor).

## Out of scope (intentionally NOT done)

- **Mapbox → Google Maps migration** is a separate, parallel workstream
  spec'd at `docs/superpowers/specs/2026-05-20-mapbox-to-google-maps-design.md`.
  Don't conflate it with this gesture change.
- The route-into-`/plan/style?location=…` flow after a user picks a
  city pin is unchanged.
- The portal visual (two concentric purple torus rings) is unchanged.
- Mobile-specific gesture tuning beyond what the browser provides for
  `dblclick`.

## Tech context (for fresh Claude design sessions)

- **Framework:** Next.js 16 App Router + React 19, TypeScript throughout.
- **3D:** `@react-three/fiber` + `@react-three/drei` Sphere/Stars; the
  globe is a `THREE.Mesh` inside a `<group ref={globeRef}>` at
  `LocationClient.tsx:2453`.
- **Camera:** OrbitControls; helpers `flyToGlobe` and `zoomCamera`
  already exist in `lib/globeAnim.ts` — reuse them, don't reinvent.
- **Mobile:** the canvas has `touch-action: none` and the page is
  `100svh` for Safari. Don't change those.
- **Large file warning:** `LocationClient.tsx` is ~3000 lines. Prefer
  surgical edits over restructuring. If a new helper is needed, put it
  in `app/plan/location/globe/` alongside `skins.ts`, `geo.ts`, etc.

## Done state

The globe now feels like **look first, commit second.** Tap to place,
double-tap (desktop) or hold (mobile) to dive in.
