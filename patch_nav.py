#!/usr/bin/env python3
"""Fix the navigation in LocationPage."""

with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the useState(() => {...}) that got corrupted — replace with correct version
content = content.replace(
    'useState(() => { _setLmNav((loc) => router.push(\\)); });',
    'useState(() => { _setLmNav((loc) => router.push(`/plan/style?location=${encodeURIComponent(loc)}`)); });'
)

# Fix the href on the Next button
content = content.replace(
    "href={`/plan/dates?location=${encodeURIComponent(location)}`}",
    "href={`/plan/style?location=${encodeURIComponent(location)}`}"
)

# Also fix possible single-quote version from shell mangling
content = content.replace(
    "href={`/plan/dates?location=${encodeURIComponent(location)'",
    "href={`/plan/style?location=${encodeURIComponent(location)}`}"
)

with open('app/plan/location/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open('app/plan/location/page.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
print('/plan/style ->', 'FOUND' if '/plan/style' in c else 'MISSING')
print('nav fn ->', 'FOUND' if 'encodeURIComponent(loc)' in c else 'MISSING')
