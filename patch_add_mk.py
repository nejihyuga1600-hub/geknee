"""
patch_add_mk.py
===============
Adds mk="key" props to Lm components that have downloaded GLBs
but are missing the mk attribute. Also fixes two MODELS path mismatches.
"""

from pathlib import Path
import re

PAGE = Path(__file__).parent / "app" / "plan" / "location" / "page.tsx"
src = PAGE.read_text(encoding="utf-8")

# ── 1. Fix MODELS path mismatches ────────────────────────────────────────────
# Downloaded file is neuschwanstein.glb, registry points to neuschwanstein_castle.glb
src = src.replace(
    'neuschwanstein:        { path: "/models/neuschwanstein_castle.glb", scale: 0.01 },',
    'neuschwanstein:        { path: "/models/neuschwanstein.glb", scale: 0.01 },',
)
# Downloaded file is morocco_mar.glb, registry points to marrakech_medina.glb
src = src.replace(
    'moroccoMar:            { path: "/models/marrakech_medina.glb", scale: 0.01 },',
    'moroccoMar:            { path: "/models/morocco_mar.glb", scale: 0.01 },',
)
# Add edinCastle entry (downloaded edin_castle.glb)
src = src.replace(
    '  burjKhalifa:           { path: "/models/burj_khalifa.glb", scale: 0.01 },',
    '  edinCastle:            { path: "/models/edin_castle.glb", scale: 0.01 },\n'
    '  burjKhalifa:           { path: "/models/burj_khalifa.glb", scale: 0.01 },',
)

# ── 2. Add mk props to Lm components ─────────────────────────────────────────
# Map: exact Lm string (no mk) → mk key to use
FIXES = [
    # (landmark key in L/INFO, mk key)
    ("bigBen",           "bigBen"),
    ("edinburghCastle",  "edinCastle"),
    ("neuschwanstein",   "neuschwanstein"),
    ("matterhorn",       "matterhorn"),
    ("petronasTowers",   "petronas"),
    ("burjKhalifa",      "burjKhalifa"),
    ("westernWall",      "westernWall"),
    ("hagiaSophia",      "hagiaSophia"),
    ("cappadocia",       "cappadocia"),
    ("tigersNestBhutan", "tigersNest"),
    ("greatWall",        "greatWall"),
    ("petra",            "petra"),
    ("christRedeem",     "christRedeem"),
    ("machuPicchu",      "machuPicchu"),
    ("chichenItza",      "chichenItza"),
    ("colosseum",        "colosseum"),
    ("tajMahal",         "tajMahal"),
    ("eiffelTower",      "eiffelTower"),
    ("acropolis",        "acropolis"),
    ("stonehenge",       "stonehenge"),
    ("sagradaFamilia",   "sagradaFamilia"),
    ("angkorWat",        "angkorWat"),
    ("borobudur",        "borobudur"),
    ("tokyoSkytree",     "tokyoSkytree"),
    ("tableMountain",    "tableMountain"),
    ("statueLiberty",    "statueLiberty"),
    ("mtRushmore",       "mtRushmore"),
    ("goldenGate",       "goldenGate"),
    ("grandCanyon",      "grandCanyon"),
    ("iguazuFalls",      "iguazuFalls"),
    ("galapagos",        "galapagos"),
    ("victoriaFalls",    "victoriaFalls"),
    ("cliffsMoher",      "cliffsMoher"),
    ("tigersNest",       "tigersNest"),
    ("westernWall",      "westernWall"),
]

changed = 0
for lm_key, mk_key in FIXES:
    # Match <Lm p={L.KEY} info={INFO.KEY}> or <Lm p={L.KEY} info={INFO.KEY} s={...}>
    # that does NOT already have mk=
    pattern = rf'(<Lm\s+p={{L\.{re.escape(lm_key)}}}\s+info={{INFO\.{re.escape(lm_key)}}}(?:\s+s={{[^}}]+}})?)(?!\s+mk=)(\s*>)'
    replacement = rf'\1 mk="{mk_key}"\2'
    new_src, n = re.subn(pattern, replacement, src)
    if n:
        print(f"  [OK] Added mk=\"{mk_key}\" to {lm_key} ({n} occurrence{'s' if n>1 else ''})")
        src = new_src
        changed += n
    else:
        print(f"  [--] {lm_key} — already has mk or not found")

PAGE.write_text(src, encoding="utf-8")
print(f"\nDone. {changed} mk props added / updated.")
