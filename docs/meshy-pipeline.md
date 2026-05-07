# Meshy → Globe Pipeline

End-to-end flow for adding new monument skin GLBs to the live globe.

## TL;DR

```bash
node bin/meshy-ship.mjs              # show what would change
node bin/meshy-ship.mjs --apply      # auto-patch skins.ts
git diff app/plan/location/globe/skins.ts
git commit -am "globe: ship new skin tiers"
git push
```

## The 4 stages

1. **Generate** via Meshy AI
   - `bin/meshy-batch-from-bronze.mjs` — generate full tier set (silver/gold/diamond/aurora/celestial/damascus) from a bronze reference
   - `bin/meshy-new-skin.mjs` — generate one tier
   - Output lands in `public/models/preview/<prefix>_<tier>.glb`

2. **Upload to blob** (Vercel Blob storage)
   - `bin/blob-upload-models.mjs` — mirrors `public/models/preview/*.glb` → `models/*.glb` in blob
   - Idempotent: skips files where blob size already matches local
   - GLBs at `https://mrfgpxw07gmgmriv.public.blob.vercel-storage.com/models/<filename>`

3. **Sync AVAILABLE_SKINS**
   - `bin/blob-sync-available-skins.mjs` — reads blob inventory, emits a regenerated `AVAILABLE_SKINS` block keyed off `MONUMENT_FILE_PREFIX` from `app/plan/location/globe/skins.ts`
   - Surfaces orphan blob prefixes (skin GLBs in blob with no `MONUMENT_FILE_PREFIX` entry — they need to be added before the globe will render them)

4. **Patch skins.ts**
   - `bin/meshy-ship.mjs --apply` writes the new block into `app/plan/location/globe/skins.ts`
   - Or copy the printed block manually and replace the existing `AVAILABLE_SKINS` object

## Orchestrator: `bin/meshy-ship.mjs`

Wraps stages 2–4 into one command.

| Flag | Behaviour |
|---|---|
| `--dry-run` | Show what would change. Upload nothing, patch nothing. |
| (default) | Upload missing GLBs, regenerate AVAILABLE_SKINS, print diff. Stop short of patching skins.ts. |
| `--apply` | Same as default + auto-patch skins.ts. |
| `--no-images` | Skip the `images/` upload step (GLBs only — useful when only globe surfaces matter). |

## Adding a brand-new monument (not just a new tier)

If your Meshy output uses a prefix that's not in `MONUMENT_FILE_PREFIX`, the globe won't render it even after upload. Add three things:

1. **`MONUMENT_FILE_PREFIX[<key>]`** in `app/plan/location/globe/skins.ts` — maps the in-app monument key (camelCase) to the blob filename prefix (snake_case)
2. **`MONUMENT_LATLON[<key>]`** in same file — lat/lon of the monument
3. **`<Lm mk="<key>" ...>`** in `app/plan/location/globe/AllLandmarks.tsx` — places it on the 3D globe

Then re-run `bin/meshy-ship.mjs` and the new monument will surface.

## Why this exists

Before this pipeline, only the Eiffel Tower had its skin GLBs wired to the globe. 100+ skin GLBs sat in `public/models/preview/` (1.3GB) without ever shipping. Two reasons they never made it:

- The dir is gitignored (correctly — too big for git)
- `AVAILABLE_SKINS` was hand-maintained and only one entry was ever added

This pipeline closes both gaps: blob handles the storage, the sync script keeps `AVAILABLE_SKINS` in lock-step with what's actually live.

## Pre-flight checklist

```bash
echo "$BLOB_READ_WRITE_TOKEN" | head -c 8         # token must be present
ls public/models/preview/ | head                  # source GLBs exist
node bin/meshy-ship.mjs --dry-run                 # preview the diff
```

## Cleanup

`bin/blob-prune.mjs` removes preview/scratch prefixes from blob without touching live `models/<prefix>_<skin>.glb`. Run it occasionally to keep blob storage costs in check.
