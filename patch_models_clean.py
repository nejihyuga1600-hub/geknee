"""
patch_models_clean.py
======================
Rebuilds the MODELS registry in page.tsx so it only contains entries
for GLB files that actually exist in public/models/.
Also strips mk="..." from any Lm component whose key is no longer in MODELS.
"""

import re
from pathlib import Path

PAGE      = Path(__file__).parent / "app" / "plan" / "location" / "page.tsx"
MODELS_DIR = Path(__file__).parent / "public" / "models"

src = PAGE.read_text(encoding="utf-8")

# ── 1. Collect actual files (lowercase for matching) ──────────────────────────
actual = { f.name.lower(): f.name for f in MODELS_DIR.glob("*.glb") }
print(f"Found {len(actual)} GLB files in public/models/")

# ── 2. Parse existing MODELS entries ─────────────────────────────────────────
# Match:  key  { path: "/models/foo.glb", scale: 0.01 },
entry_re = re.compile(
    r'(\s+)(\w+)\s*:\s*\{\s*path:\s*"(/models/[^"]+\.glb)"\s*,\s*scale:\s*([\d.]+)\s*\},?',
)

kept = []    # (key, path, scale) for entries whose file exists
removed = set()  # keys whose file is missing

for m in entry_re.finditer(src):
    indent, key, path, scale = m.group(1), m.group(2), m.group(3), m.group(4)
    filename = path.split("/")[-1].lower()
    if filename in actual:
        # Use the canonical on-disk filename (preserves capitalisation)
        canonical = "/models/" + actual[filename]
        kept.append((key, canonical, scale))
        print(f"  [KEEP]   {key} → {canonical}")
    else:
        removed.add(key)
        print(f"  [REMOVE] {key} → {path}  (file missing)")

print(f"\nKeeping {len(kept)}, removing {len(removed)}")

# ── 3. Build replacement MODELS block ─────────────────────────────────────────
lines = ["const MODELS: Record<string, { path: string; scale: number }> = {"]
for key, path, scale in kept:
    lines.append(f'  {key:<22} {{ path: "{path}", scale: {scale} }},')
lines.append("};")
new_models_block = "\n".join(lines)

# ── 4. Replace the entire MODELS block in source ──────────────────────────────
models_block_re = re.compile(
    r'const MODELS: Record<string,.*?^\};',
    re.DOTALL | re.MULTILINE,
)
if not models_block_re.search(src):
    print("ERROR: Could not find MODELS block — aborting.")
    raise SystemExit(1)

src = models_block_re.sub(new_models_block, src, count=1)

# ── 5. Strip mk="key" from Lm components whose key was removed ────────────────
stripped = 0
for key in removed:
    pattern = rf'\s+mk="{re.escape(key)}"'
    new_src, n = re.subn(pattern, "", src)
    if n:
        print(f"  [MK-RM]  removed mk=\"{key}\" ({n}x)")
        src = new_src
        stripped += n

print(f"Stripped {stripped} orphaned mk props")

# ── 6. Write result ───────────────────────────────────────────────────────────
PAGE.write_text(src, encoding="utf-8")
print("\nDone — page.tsx updated.")
