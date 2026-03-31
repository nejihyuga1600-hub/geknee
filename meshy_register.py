"""
meshy_register.py
==================
Scans public/models/ for .glb files, checks which ones are missing
from the MODELS registry in app/plan/location/page.tsx, and patches
them in automatically.

Usage:
  python meshy_register.py
"""

import re
from pathlib import Path

PAGE = Path(__file__).parent / "app" / "plan" / "location" / "page.tsx"
MODELS_DIR = Path(__file__).parent / "public" / "models"


def filename_to_camel(stem: str) -> str:
    """great_wall → greatWall"""
    parts = stem.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def get_existing_paths(source: str) -> set[str]:
    """Return all /models/xxx.glb paths already in the registry."""
    return set(re.findall(r'path:\s*"(/models/[^"]+\.glb)"', source))


def get_registry_end(source: str) -> int:
    """Find the line index just before the closing }; of the MODELS block."""
    # Find the MODELS = { opening
    start = source.find("const MODELS")
    if start == -1:
        raise RuntimeError("Could not find MODELS registry in page.tsx")
    # Find the matching closing };
    depth = 0
    for i, ch in enumerate(source[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i  # position of the closing }
    raise RuntimeError("Could not find end of MODELS registry")


def main():
    source = PAGE.read_text(encoding="utf-8")
    existing_paths = get_existing_paths(source)

    glb_files = sorted(MODELS_DIR.glob("*.glb"))
    if not glb_files:
        print("No .glb files found in public/models/ — run npm run meshy first.")
        return

    new_entries = []
    for glb in glb_files:
        path = f"/models/{glb.name}"
        if path in existing_paths:
            print(f"  [OK]     {glb.name} already registered")
        else:
            key = filename_to_camel(glb.stem)
            entry = f'  {key:<24}{{ path: "{path}", scale: 0.01 }},'
            new_entries.append(entry)
            print(f"  [ADD]    {glb.name} → {key}")

    if not new_entries:
        print("\nAll models already registered — nothing to do.")
        return

    # Insert new entries just before the closing } of MODELS
    insert_pos = get_registry_end(source)
    block = "\n  // ── Auto-registered by meshy_register.py ──\n"
    block += "\n".join(new_entries) + "\n"
    new_source = source[:insert_pos] + block + source[insert_pos:]

    PAGE.write_text(new_source, encoding="utf-8")
    print(f"\n✓ Added {len(new_entries)} entries to MODELS registry in page.tsx")
    print("  Restart `npm run dev` to pick up the changes.")


if __name__ == "__main__":
    main()
