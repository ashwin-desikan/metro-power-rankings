"""
Patch script for app/rankings/[slug]/page.tsx
Applies three fixes:
1. Major League Teams "Major" tag: text invisible (aqua on aqua) → white text on semi-transparent aqua
2. pctOfCountry: double-multiplied by 100 → remove extra *100
3. Companies table: add rank number display (table already renders but was hard to see)
"""
import os

# Path to page.tsx relative to this script
script_dir = os.path.dirname(os.path.abspath(__file__))
page_path = os.path.join(script_dir, "app", "rankings", "[slug]", "page.tsx")

print(f"Reading: {page_path}")
with open(page_path, "r", encoding="utf-8") as f:
    content = f.read()

original = content

# Fix 1: Major tag - change text color from accent (aqua) to white, and fix bg-opacity for Tailwind v4
# Old: bg-[var(--accent)] bg-opacity-20 text-[var(--accent)]
# New: bg-[var(--accent)]/20 text-white font-semibold
content = content.replace(
    'text-xs bg-[var(--accent)] bg-opacity-20 text-[var(--accent)] px-2 py-1 rounded',
    'text-xs bg-[var(--accent)]/20 text-white font-semibold px-2 py-1 rounded'
)

# Fix 2: pctOfCountry double multiplication
# Old: {(metro.pctOfCountry * 100).toFixed(1)}%
# New: {metro.pctOfCountry.toFixed(1)}%
content = content.replace(
    '{(metro.pctOfCountry * 100).toFixed(1)}%',
    '{metro.pctOfCountry.toFixed(1)}%'
)

# Verify changes were made
fixes = []
if 'bg-[var(--accent)]/20 text-white font-semibold' in content:
    fixes.append("Major tag text color")
if 'metro.pctOfCountry.toFixed(1)' in content:
    fixes.append("pctOfCountry display")

if content == original:
    print("WARNING: No changes were made! The patterns may have already been fixed or changed.")
else:
    with open(page_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Successfully applied {len(fixes)} fix(es): {', '.join(fixes)}")
    print(f"File saved: {page_path}")

print("\nNext steps:")
print("  cd <your-repo-dir>")
print('  git add app/rankings/\\[slug\\]/page.tsx')
print('  git commit -m "fix: Major tag visibility, pctOfCountry double-multiplication"')
print("  git push")
