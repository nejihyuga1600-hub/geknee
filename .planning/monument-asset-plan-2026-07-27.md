# Monument asset gap + meshy generation plan
Generated: 2026-07-27

## As-is

| Storage | Purpose | Base GLBs | Skin variants |
|---|---|---|---|
| `MONUMENT_LATLON` (declared) | Ground truth | 97 monuments | 97 declared skin sets |
| `MONUMENT_FILE_PREFIX` (mapping) | camelCase → snake_case file prefix | 58 mapped | — |
| `public/models/mapbox/` | Served under `/models/mapbox/*` — used by CapacitorGlobe (iOS app + unified web) | 57 base + variants | 57 prefixes with variants |
| Vercel Blob `models/*` | Used by legacy web Three.js globe (`LocationClient` / `landmark.tsx`) via `BLOB_BASE` | variants only, no bases | 69 prefixes with variants |

## Gap A — 40 monuments have lat/lon but no base GLB

These render as invisible pins: declared in `MONUMENT_LATLON`, but no `public/models/mapbox/<prefix>.glb` exists, and 39 of the 40 also have no `MONUMENT_FILE_PREFIX` entry (fell through the mk → filename lookup and 404'd on camelCase URL).

### By region

**Europe (11)**
- `charlesBridge` – Prague, Czechia
- `matterhorn` – Zermatt/Cervinia
- `chateauChambord` – Loire Valley
- `treviFountain` – Rome
- `pantheonRome` – Rome
- `leaningTower` – Pisa
- `versailles` – Île-de-France
- `giantsCauseway` – Antrim
- `branCastle` – Transylvania
- `kinkakuji` – Kyoto (Japan monument, grouped here for meshy batching)
- `himejiCastle` – Hyōgo (Japan)

**Asia (12)**
- `mountEverest` – Nepal/Tibet border
- `halongBay` – Vietnam
- `goldenTemple` – Amritsar
- `watArun` – Bangkok
- `prambanan` – Java
- `ayutthaya` – Thailand
- `konarkTemple` – Odisha
- `terracottaArmy` – Xi'an
- `sensoji` – Tokyo
- `meenakshiTemple` – Madurai
- `palenque` – Chiapas (grouped with Asia batch for pacing)
- `genghisKhanStatue` – Mongolia

**Middle East / Africa (7)**
- `kaaba` – Mecca
- `cappadocia` – Turkey
- `kilimanjaro` – Tanzania
- `tableMountain` – Cape Town
- `abuSimbel` – Egypt
- `karnakTemple` – Luxor
- `greatSphinx` – Giza

**Americas (10)**
- `grandCanyon` – Arizona
- `devilsTower` – Wyoming
- `monumentValley` – Utah/Arizona
- `alcatraz` – San Francisco
- `torresDelPaine` – Patagonia
- `peritoMoreno` – Argentina
- `halfDome` – Yosemite
- `delicateArch` – Utah
- `lakeBled` – Slovenia (rounding error — actually Europe, drop here)
- `milfordSound` – New Zealand (Oceania batch by itself)

## Gap B — Mission-earned skins have no GLB variant

Missions in `MonumentShop.tsx` reward skins (`sakura`, `neon`, `celestial`, etc.) that don't exist as `<prefix>_<tier>.glb` in either storage layer. When the user equips one, the loader falls back to the base tier (fixed in `2d11cea`), so the rare skin never visualizes.

Priority skin variants to generate, by monument tier:

**Tier 2 — common (stone / silver / gold)**
- Nice-to-have. Adds visual progression for casually-collected monuments.
- Cost: cheap in meshy (parameter tweaks on base).

**Tier 3 — rare (diamond / aurora / celestial / damascus)**
- Payoff for mission completion.
- Cost: expensive — bespoke shader/material per monument in meshy.
- Prioritize monuments that already have active missions in the shop catalog.

## Recommended batching

| Batch | What | Meshy jobs | ETA |
|---|---|---|---|
| **0 — Prefix wiring** | Add 39 missing `MONUMENT_FILE_PREFIX` entries in `skins.ts` | 0 (code change) | 20 min |
| **1 — Base GLBs, Europe** | 11 base monuments via `meshy_batch.py` | 11 | ~1 day |
| **2 — Base GLBs, Asia** | 12 base | 12 | ~1 day |
| **3 — Base GLBs, Middle East / Africa** | 7 base | 7 | ~1 day |
| **4 — Base GLBs, Americas + Oceania** | 10 base | 10 | ~1 day |
| **5 — Common skins for the 40 new bases** | `stone / silver / gold` × 40 (skip stone if base ≡ stone) | ~120 | ~3 days |
| **6 — Rare skins for mission monuments** | `celestial / aurora / diamond` for the ~15 monuments whose active missions reward these | ~45 | ~3-5 days |
| **7 — Fix sensoji** | Missing base + all planned variants | ~5 | ~1 day |

## Pipeline hooks (already in the repo)

- `bin/meshy-batch.py` (or similar) — base generation
- `bin/meshy_skins.py` — variant generation
- `bin/meshy-ship.mjs` — upload GLB → `public/models/mapbox/` + Vercel Blob
- `bin/blob-upload-models.mjs` — mirror `public/models/preview` → blob
- `bin/blob-sync-available-skins.mjs` — regenerate `AVAILABLE_SKINS` block from what's actually shipped
- `bin/blob-audit-monuments.mjs` — this audit (rerun after every batch)

## Order of operations for each batch

1. Run `bin/meshy-batch.py` with the list of missing prefixes
2. When jobs complete, `bin/meshy-ship.mjs --apply` copies GLBs into `public/models/mapbox/`
3. `bin/blob-upload-models.mjs` mirrors variants to Vercel Blob
4. `bin/blob-sync-available-skins.mjs > /tmp/skins.txt` — paste the block back into `skins.ts`
5. `bin/blob-audit-monuments.mjs` — confirm the batch closed the gap
6. Commit + push

## What NOT to do

- Don't generate rare-skin variants BEFORE the base GLB exists — the fallback will keep showing base anyway.
- Don't add lat/lon entries for monuments without a base GLB — that just adds more silent-404 pins.
- Don't retire the `OVERSIZED_SKIPLIST` (`montSaintMichel`, `cologneCathedral`, `stBasils`, `borobudur`, `persepolis`) until they're re-compressed via glTF-transform + Draco (separate work stream).
