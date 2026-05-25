# Live-Trip Safety Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DESIGN SUB-SKILL:** When building/styling `SafetyCard.tsx` (Task 5), invoke the `frontend-design` skill and match the GeKnee theme — reuse `CardShell`, the brand tokens (`--brand-ink`/`-dim`/`-mute`, `--brand-warn`, `--brand-accent`, `--brand-border`), and the `DISPLAY` font const already in `page.tsx`. Do not introduce a new visual language.

**Goal:** Add a Safety card to the in-trip live view with country-aware emergency numbers, lost-document steps (both offline/static), and an on-demand "nearest pharmacy/hospital" finder.

**Architecture:** Two static data modules (`lib/safety/*`) render instantly and offline. A new auth-gated `app/api/places/nearby/route.ts` (modeled on `/api/weather`) backs the on-demand finder, called only on explicit user tap with a session token + Basic field mask. A `SafetyCard` component composes these inside the existing live-view card row using `CardShell`.

**Tech Stack:** Next.js 16 App Router (route handlers), React 19 client components, Google Places API (server-side via `GOOGLE_PLACES_API_KEY`), existing `fetchDirections` client.

**Verification note:** This repo has **no unit-test runner**. Each task is verified with `npx tsc --noEmit` (must exit 0) plus, where UI-visible, a Playwright browser check at 390px on a logged-in trip. Do **not** add a test framework — it's out of scope.

---

### Task 1: Emergency-numbers data + lookup

**Files:**
- Create: `lib/safety/emergencyNumbers.ts`

- [ ] **Step 1: Create the data module**

```ts
// lib/safety/emergencyNumbers.ts
// Country-aware emergency numbers. Seeded from the public EENA/ITU dataset.
// Most of the world uses 112; this map captures the common exceptions plus
// top travel destinations. Expand as needed — the lookup always falls back
// to 112 so a missing country still produces a usable number.

export interface EmergencyNumbers {
  /** General/universal emergency number, shown first. */
  universal: string;
  police: string;
  ambulance: string;
  fire: string;
}

// Keyed by ISO 3166-1 alpha-2 (uppercase).
const NUMBERS: Record<string, EmergencyNumbers> = {
  US: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  CA: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  GB: { universal: '999', police: '999', ambulance: '999', fire: '999' },
  IE: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  AU: { universal: '000', police: '000', ambulance: '000', fire: '000' },
  NZ: { universal: '111', police: '111', ambulance: '111', fire: '111' },
  JP: { universal: '110', police: '110', ambulance: '119', fire: '119' },
  CN: { universal: '110', police: '110', ambulance: '120', fire: '119' },
  IN: { universal: '112', police: '100', ambulance: '102', fire: '101' },
  MX: { universal: '911', police: '911', ambulance: '911', fire: '911' },
  BR: { universal: '190', police: '190', ambulance: '192', fire: '193' },
  FR: { universal: '112', police: '17', ambulance: '15', fire: '18' },
  DE: { universal: '112', police: '110', ambulance: '112', fire: '112' },
  ES: { universal: '112', police: '091', ambulance: '112', fire: '080' },
  IT: { universal: '112', police: '113', ambulance: '118', fire: '115' },
  PT: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  NL: { universal: '112', police: '112', ambulance: '112', fire: '112' },
  CH: { universal: '112', police: '117', ambulance: '144', fire: '118' },
  AT: { universal: '112', police: '133', ambulance: '144', fire: '122' },
  GR: { universal: '112', police: '100', ambulance: '166', fire: '199' },
  TR: { universal: '112', police: '155', ambulance: '112', fire: '110' },
  AE: { universal: '999', police: '999', ambulance: '998', fire: '997' },
  TH: { universal: '191', police: '191', ambulance: '1669', fire: '199' },
  ID: { universal: '112', police: '110', ambulance: '118', fire: '113' },
  SG: { universal: '999', police: '999', ambulance: '995', fire: '995' },
  KR: { universal: '112', police: '112', ambulance: '119', fire: '119' },
  ZA: { universal: '112', police: '10111', ambulance: '10177', fire: '10111' },
  EG: { universal: '122', police: '122', ambulance: '123', fire: '180' },
};

const FALLBACK: EmergencyNumbers = { universal: '112', police: '112', ambulance: '112', fire: '112' };

/** Look up emergency numbers by ISO alpha-2 code; falls back to 112 (GSM universal). */
export function emergencyNumbersFor(countryCode: string | null | undefined): {
  numbers: EmergencyNumbers;
  isFallback: boolean;
} {
  const cc = (countryCode ?? '').toUpperCase();
  const hit = NUMBERS[cc];
  return hit ? { numbers: hit, isFallback: false } : { numbers: FALLBACK, isFallback: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/safety/emergencyNumbers.ts
git commit -m "feat(safety): country-aware emergency-numbers data + lookup"
```

---

### Task 2: Lost-documents checklist data

**Files:**
- Create: `lib/safety/lostDocs.ts`

- [ ] **Step 1: Create the data module**

```ts
// lib/safety/lostDocs.ts
// Static, offline checklist shown in the Safety card. Order matters.

export interface LostDocStep {
  title: string;
  detail: string;
}

export const LOST_DOC_STEPS: LostDocStep[] = [
  {
    title: 'Get somewhere safe, then report it to local police',
    detail: 'Ask for a written police report — insurers and embassies require it to replace documents.',
  },
  {
    title: 'Contact your embassy or consulate',
    detail: 'They issue emergency travel documents. (An in-app embassy locator is coming; until then search "<your country> embassy <city>".)',
  },
  {
    title: 'Freeze your cards',
    detail: 'Call your bank or use its app to freeze/cancel lost cards immediately.',
  },
  {
    title: 'Use your digital copies',
    detail: 'Open your ticket/confirmation wallet for digital copies of bookings and IDs.',
  },
];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/safety/lostDocs.ts
git commit -m "feat(safety): lost-documents checklist data"
```

---

### Task 3: Places "nearby" API route (on-demand only)

**Files:**
- Create: `app/api/places/nearby/route.ts`
- Reference: `app/api/weather/route.ts` (auth gate + key usage pattern), `app/api/popular-times/route.ts` (Places usage)

- [ ] **Step 1: Read the reference route**

Run: `sed -n '1,60p' app/api/weather/route.ts` (mirror its auth gate, key env var `GOOGLE_PLACES_API_KEY`, error shape, and `export const dynamic`).

- [ ] **Step 2: Create the route**

```ts
// app/api/places/nearby/route.ts
// On-demand nearest-of-type search (pharmacy | hospital) for the Safety card.
// Called ONLY when the user taps "find nearest" — never on page load.
// Uses Places Nearby Search (New) with a Basic field mask to stay in the
// cheapest SKU, per the Google Maps cost rules in CLAUDE.md.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['pharmacy', 'hospital']);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? '';
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!ALLOWED.has(type) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'misconfigured' }, { status: 500 });

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        // Basic-SKU field mask only.
        'X-Goog-FieldMask':
          'places.displayName,places.location,places.nationalPhoneNumber,places.currentOpeningHours.openNow,places.formattedAddress',
      },
      body: JSON.stringify({
        includedTypes: [type],
        maxResultCount: 5,
        rankPreference: 'DISTANCE',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: 'places_failed' }, { status: 502 });
    const data = await res.json();
    const places = (data.places ?? []).map((p: {
      displayName?: { text?: string };
      location?: { latitude: number; longitude: number };
      nationalPhoneNumber?: string;
      currentOpeningHours?: { openNow?: boolean };
      formattedAddress?: string;
    }) => ({
      name: p.displayName?.text ?? 'Unknown',
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      phone: p.nationalPhoneNumber ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      address: p.formattedAddress ?? null,
    }));
    return NextResponse.json({ places });
  } catch {
    return NextResponse.json({ error: 'places_failed' }, { status: 502 });
  }
}
```

> If `@/auth` is not the correct import for `auth()` in this repo, copy the exact auth import used at the top of `app/api/weather/route.ts`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (Fix the `auth` import path if it errors — see note above.)

- [ ] **Step 4: Commit**

```bash
git add app/api/places/nearby/route.ts
git commit -m "feat(safety): on-demand Places nearby route (pharmacy/hospital, Basic mask)"
```

---

### Task 4: Client helper for the nearby finder

**Files:**
- Create: `lib/googleMaps/placesNearbyClient.ts`
- Reference: `lib/googleMaps/weatherClient.ts` (fetch-client shape)

- [ ] **Step 1: Create the client**

```ts
// lib/googleMaps/placesNearbyClient.ts
export interface NearbyPlace {
  name: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  openNow: boolean | null;
  address: string | null;
}

export async function fetchNearby(
  type: 'pharmacy' | 'hospital',
  lat: number,
  lng: number,
): Promise<NearbyPlace[]> {
  const params = new URLSearchParams({ type, lat: String(lat), lng: String(lng) });
  const res = await fetch(`/api/places/nearby?${params.toString()}`);
  if (!res.ok) throw new Error(`nearby ${type} failed: ${res.status}`);
  const data = await res.json();
  return (data.places ?? []) as NearbyPlace[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/googleMaps/placesNearbyClient.ts
git commit -m "feat(safety): client helper for on-demand nearby finder"
```

---

### Task 5: SafetyCard component

**Files:**
- Create: `app/trip/[tripId]/live/SafetyCard.tsx`
- Reference: `app/trip/[tripId]/live/page.tsx` (CardShell usage in `CrowdsCard`/`WeatherAlertCard`, the `DISPLAY` font const, brand tokens)

> **Invoke `frontend-design` for this task.** Match the theme: use `CardShell` (import/extract it if it's local to `page.tsx` — if local, lift `CardShell` into its own file `app/trip/[tripId]/live/CardShell.tsx` and re-import in both places as a first sub-step, committing that refactor separately). Use brand tokens only; no new colors beyond a safety-red accent.

- [ ] **Step 0 (if needed): Extract `CardShell`**

If `CardShell` is defined inside `page.tsx`, move it to `app/trip/[tripId]/live/CardShell.tsx` (export it), import it in `page.tsx`, run `npx tsc --noEmit`, and commit: `refactor(live): extract CardShell into its own module`.

- [ ] **Step 1: Create the component**

```tsx
// app/trip/[tripId]/live/SafetyCard.tsx
'use client';
import { useState } from 'react';
import { CardShell } from './CardShell';
import { emergencyNumbersFor } from '@/lib/safety/emergencyNumbers';
import { LOST_DOC_STEPS } from '@/lib/safety/lostDocs';
import { fetchNearby, type NearbyPlace } from '@/lib/googleMaps/placesNearbyClient';

const DISPLAY = 'var(--font-display), Georgia, serif';
const ACCENT = 'var(--brand-danger, #f87171)';

export function SafetyCard({
  countryCode,
  anchor,
  online,
}: {
  countryCode: string | null;
  anchor: { lat: number; lng: number } | null;
  online: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { numbers, isFallback } = emergencyNumbersFor(countryCode);
  const [finding, setFinding] = useState<'pharmacy' | 'hospital' | null>(null);
  const [results, setResults] = useState<NearbyPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function findNearest(type: 'pharmacy' | 'hospital') {
    setFinding(type);
    setError(null);
    setResults(null);
    // One-time geolocation; fall back to the trip anchor city if denied.
    const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(anchor);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(anchor),
        { timeout: 8000 },
      );
    });
    if (!coords) { setError('No location available'); setFinding(null); return; }
    try {
      setResults(await fetchNearby(type, coords.lat, coords.lng));
    } catch {
      setError('Could not search right now. Try again.');
    } finally {
      setFinding(null);
    }
  }

  return (
    <CardShell accent={ACCENT} label="SAFETY">
      {/* Emergency numbers */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {(['universal', 'ambulance', 'fire'] as const).map((k) => (
          <a
            key={k}
            href={`tel:${numbers[k]}`}
            style={{
              flex: 1, textAlign: 'center', textDecoration: 'none',
              padding: '8px 6px', borderRadius: 10,
              background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
              minHeight: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 18, color: 'var(--brand-ink)' }}>{numbers[k]}</div>
            <div className="brand-mono-label" style={{ marginTop: 2 }}>
              {k === 'universal' ? 'EMERGENCY' : k.toUpperCase()}
            </div>
          </a>
        ))}
      </div>
      {isFallback && (
        <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)', marginTop: 6 }}>
          Showing the universal GSM number (112). Confirm locally.
        </div>
      )}

      {/* On-demand nearest finder */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {(['pharmacy', 'hospital'] as const).map((t) => (
          <button
            key={t}
            onClick={() => findNearest(t)}
            disabled={!online || finding !== null}
            title={!online ? 'Needs connection' : undefined}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 10, minHeight: 44,
              background: 'var(--brand-surface)', border: '1px solid var(--brand-border)',
              color: online ? 'var(--brand-ink)' : 'var(--brand-ink-mute)',
              fontSize: 12, fontWeight: 600, cursor: online ? 'pointer' : 'not-allowed',
            }}
          >
            {finding === t ? 'Searching…' : !online ? `${t} (offline)` : `Nearest ${t}`}
          </button>
        ))}
      </div>
      {error && <div style={{ fontSize: 12, color: ACCENT, marginTop: 6 }}>{error}</div>}
      {results && results.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--brand-ink-dim)', marginTop: 6 }}>No results nearby.</div>
      )}
      {results && results.slice(0, 3).map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--brand-ink)' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)' }}>
              {p.openNow === true ? 'Open now' : p.openNow === false ? 'May be closed' : ''}{p.address ? ` · ${p.address}` : ''}
            </div>
          </div>
          {p.phone && (
            <a href={`tel:${p.phone}`} className="brand-mono-label" style={{ textDecoration: 'none', color: 'var(--brand-accent)' }}>CALL</a>
          )}
          {p.lat != null && p.lng != null && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
              target="_blank" rel="noopener noreferrer"
              className="brand-mono-label" style={{ textDecoration: 'none', color: 'var(--brand-accent)' }}
            >GO</a>
          )}
        </div>
      ))}

      {/* Lost-docs checklist */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 10, width: '100%', textAlign: 'left', minHeight: 44,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--brand-ink-dim)', fontSize: 12, padding: 0,
        }}
      >
        {expanded ? '▾' : '▸'} Lost passport or wallet?
      </button>
      {expanded && (
        <ol style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--brand-ink)' }}>
          {LOST_DOC_STEPS.map((s, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--brand-ink-dim)' }}>{s.detail}</div>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `--brand-danger` token doesn't exist, the `var(--brand-danger, #f87171)` fallback still renders red — fine.)

- [ ] **Step 3: Commit**

```bash
git add app/trip/[tripId]/live/SafetyCard.tsx
git commit -m "feat(safety): SafetyCard component (emergency numbers, on-demand finder, lost-docs)"
```

---

### Task 6: Wire SafetyCard into the live view

**Files:**
- Modify: `app/trip/[tripId]/live/page.tsx`

- [ ] **Step 1: Capture the destination country code**

In the existing anchor-city geocode effect (near line 150, where `gd` is obtained and `fetchWeather(gd.lat, gd.lng, 7)` is called), capture the country. If the geocode result exposes `address_components`, extract the `country` `short_name`; otherwise add a state field populated from the trip record. Add:

```tsx
const [countryCode, setCountryCode] = useState<string | null>(null);
// inside the geocode effect, after `gd` is resolved:
setCountryCode(
  (gd as { country?: string }).country
    ?? (gd as { addressComponents?: { types: string[]; shortText?: string; short_name?: string }[] })
        .addressComponents?.find(c => c.types.includes('country'))?.shortText
    ?? null,
);
```

> If `gd` carries no country, instead read it from the trip fetch (`d.trip.destinationCountryCode` or reverse-geocode `geo` once). Pick whichever the existing data already provides; do not add a new geocode call just for this.

- [ ] **Step 2: Import and render the card**

At the top of `page.tsx` with the other imports:

```tsx
import { SafetyCard } from './SafetyCard';
```

In the card row (after `<CrowdsCard ... />` around line 589), add:

```tsx
<SafetyCard
  countryCode={countryCode}
  anchor={geo ? { lat: geo.lat, lng: geo.lon } : null}
  online={isOnline}
/>
```

> Use the existing online-status value from `useOnlineStatus()` (named `isOnline` or similar in this file — match the existing variable). `geo` is the anchor center already in scope; map its `lon` field to `lng`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/trip/[tripId]/live/page.tsx
git commit -m "feat(safety): wire SafetyCard into live-trip card row"
```

---

### Task 7: Browser verification + design polish

**Files:** none (verification) — plus any polish edits to `SafetyCard.tsx`.

- [ ] **Step 1: Run the app**

Run: `npm run dev` (background). Open a logged-in trip's live view: `http://localhost:3000/trip/<realTripId>/live` at 390px via Playwright. (A real trip + auth session is required; use the dev session cookie.)

- [ ] **Step 2: Verify**

- Safety card appears in the card row, styled consistently with the weather/crowds cards (brand tokens, mono labels).
- Emergency numbers render instantly and are `tel:` links; in airplane mode they still render and the finder buttons show "(offline)".
- Tapping "Nearest pharmacy" prompts for location; granting → top-3 list with CALL/GO; denying → falls back to anchor city.
- "Lost passport or wallet?" expands the checklist.

- [ ] **Step 3: Polish with `frontend-design`**

Invoke `frontend-design` to refine spacing/typography/accent so the card is visually indistinguishable in quality from the existing cards. Keep all brand tokens.

- [ ] **Step 4: Commit any polish**

```bash
git add app/trip/[tripId]/live/SafetyCard.tsx
git commit -m "polish(safety): visual refinement to match GeKnee card theme"
```

---

## Self-Review

**Spec coverage:** Emergency numbers (Task 1, 5) ✓ · lost-docs (Task 2, 5) ✓ · on-demand pharmacy/hospital with geolocation + anchor fallback + offline gating (Task 3, 4, 5) ✓ · Basic field mask + auth gate + session-only results (Task 3, 5) ✓ · card placement in live row (Task 6) ✓ · theme match via CardShell + frontend-design (Task 5, 7) ✓. Embassy correctly deferred to v2 (not in any task).

**Placeholder scan:** No TBD/TODO; every code step has complete code. The two hedged spots (auth import path in Task 3, country-code source in Task 6) give explicit fallback instructions rather than leaving it open.

**Type consistency:** `NearbyPlace` defined in Task 4 and consumed in Task 5 (`fetchNearby` return). `emergencyNumbersFor` returns `{ numbers, isFallback }` (Task 1) consumed identically in Task 5. `CardShell(accent, label, children)` matches existing usage. `geo.lon` → `lng` mapping called out explicitly in Task 6.
