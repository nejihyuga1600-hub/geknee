import re

with open(r'app\plan\location\page.tsx', 'r', encoding='utf-8') as f:
    src = f.read()

# Only match s={number} when preceded by whitespace (standalone JSX prop).
# This avoids substrings inside "roughness={...}", "metalness={...}" etc.
def halve(m):
    val = round(float(m.group(1)) * 0.5, 4)
    # Format cleanly: strip trailing zeros but keep at least one decimal
    s = f'{val:.4f}'.rstrip('0').rstrip('.')
    if '.' not in s:
        s += '.0'
    return f's={{{s}}}'

new_src = re.sub(r'(?<=[ \t\n])s=\{([0-9]+(?:\.[0-9]*)?)\}', halve, src)

changed = sum(1 for a, b in zip(
    re.findall(r'(?<=[ \t\n])s=\{[0-9.]+\}', src),
    re.findall(r'(?<=[ \t\n])s=\{[0-9.]+\}', new_src)
) if a != b)
print(f"Changed {changed} explicit s= values")

with open(r'app\plan\location\page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_src)

# Verify no metalness/roughness were touched
for line in new_src.split('\n'):
    if ('roughness' in line or 'metalness' in line) and 's={' in line:
        # Check if it's a false positive (s={ should only be standalone)
        if re.search(r'(?<![a-z])s=\{', line):
            print("WARNING:", line.strip())
print("Done")
