#!/usr/bin/env python3
"""Fix remaining TS errors in location/page.tsx."""

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# ── Fix 1: Add next/navigation import after THREE import ───────────────────────
if 'from "next/navigation"' not in content and "from 'next/navigation'" not in content:
    old1 = 'import * as THREE from "three";'
    new1 = ('import * as THREE from "three";\n'
            'import { useRouter } from "next/navigation";')
    assert old1 in content, "THREE import anchor not found!"
    content = content.replace(old1, new1, 1)
    print("Fix 1: added useRouter import")
else:
    print("Fix 1: next/navigation import already present, skipping")

# ── Fix 2: Add _lmNav / _setLmNav declarations before the Lm component ─────────
if 'let _lmNav' not in content:
    anchor2 = 'function Lm({ p, s = 0.8, info, mk, children }'
    nav_decl = (
        '// ─── Globe-click navigation bridge\n'
        'let _lmNav: ((loc: string) => void) | null = null;\n'
        'function _setLmNav(fn: (loc: string) => void) { _lmNav = fn; }\n\n'
    )
    assert anchor2 in content, f"Lm anchor not found!"
    content = content.replace(anchor2, nav_decl + anchor2, 1)
    print("Fix 2: added _lmNav / _setLmNav declarations")
else:
    print("Fix 2: _lmNav declaration already present, skipping")

# ── Fix 3: Add explicit `loc: string` type in useState initializer ─────────────
old3 = '_setLmNav((loc) => router.push('
new3 = '_setLmNav((loc: string) => router.push('
if old3 in content:
    content = content.replace(old3, new3, 1)
    print("Fix 3: added explicit loc: string annotation")
else:
    print("Fix 3: already typed or pattern not found, skipping")

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone.")
