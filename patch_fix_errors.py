#!/usr/bin/env python3
"""Fix TS errors in location and style pages."""

# ── Fix 1: location/page.tsx broken onKeyDown ─────────────────────────────────
with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the broken onKeyDown line
content = content.replace(
    r"            onKeyDown={(e) => { if (e.key === 'Enter' && location.trim()) router.push(\); }}",
    "            onKeyDown={(e) => { if (e.key === 'Enter' && location.trim()) router.push(`/plan/style?location=${encodeURIComponent(location)}`); }}"
)

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('location/page.tsx fixed')

# ── Fix 2: style/page.tsx curly apostrophes → straight apostrophes ─────────────
with open('app/plan/style/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace curly/smart apostrophes with straight ones
content = content.replace('\u2019', "'")   # right single quotation mark '
content = content.replace('\u2018', "'")   # left  single quotation mark '
content = content.replace('\u201c', '"')   # left  double quotation mark "
content = content.replace('\u201d', '"')   # right double quotation mark "

# Also replace the em dash in stepSubs with regular dash if present
content = content.replace('\u2014', '--')

with open('app/plan/style/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('style/page.tsx fixed')
