"""Read-only diagnostic for Monaco / Vatican / Belgrade polygon resolution.

Run from the project root: python scripts/verify-monaco-vatican.py
Reports exactly what the workbook contains for these three metros, what the
builder routing decides, and whether the polygon lookup would succeed.
"""
import sys, os, importlib.util
from collections import defaultdict

if not os.path.exists("MetroAreas.xlsx"):
    sys.exit("Run from project root (where MetroAreas.xlsx lives).")

spec = importlib.util.spec_from_file_location("bmb", "scripts/build-metro-boundaries.py")
bmb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bmb)

print(f"SCRIPT_VERSION_HASH = {bmb.SCRIPT_VERSION_HASH}")
print(f"COUNTRY_SHEET_MAP['Monaco']        = {bmb.COUNTRY_SHEET_MAP.get('Monaco')!r}")
print(f"COUNTRY_SHEET_MAP['Vatican City']  = {bmb.COUNTRY_SHEET_MAP.get('Vatican City')!r}")
print(f"'Monaco' in REGIONLESS              = {'Monaco' in bmb.REGIONLESS_COUNTRIES}")
print(f"'Vatican City' in REGIONLESS        = {'Vatican City' in bmb.REGIONLESS_COUNTRIES}")
print()

rows = bmb.load_workbook_rows("MetroAreas.xlsx")
sub = [r for r in rows if r["metro_display"] in {"Monaco", "Vatican City", "Belgrade"}]
print(f"Workbook member rows after filter: {len(sub)}")
print(f"  Monaco:       {len([r for r in sub if r['metro_display']=='Monaco'])}")
print(f"  Vatican City: {len([r for r in sub if r['metro_display']=='Vatican City'])}")
print(f"  Belgrade:     {len([r for r in sub if r['metro_display']=='Belgrade'])}")
print()
print("First Monaco row yielded by builder:")
mr = [r for r in sub if r["metro_display"]=="Monaco"]
print(f"  {mr[0] if mr else 'NONE'}")
print("Vatican row yielded by builder:")
vr = [r for r in sub if r["metro_display"]=="Vatican City"]
print(f"  {vr[0] if vr else 'NONE'}")
print()

metros_index = bmb.load_metros_index(bmb.METROS_JSON)
print(f"metros_index entries for our slugs:")
for slug_key in [("monaco","Monaco"), ("vatican city","Vatican City"), ("belgrade","Serbia")]:
    print(f"  {slug_key!r}: {metros_index.get(slug_key)}")
print()

by_slug = defaultdict(list)
for r in sub:
    info = bmb.resolve_slug_info(r, metros_index)
    if info:
        by_slug[info["slug"]].append((r, info))
print(f"Resolved slugs from workbook rows: {sorted(by_slug.keys())}")
for slug, items in by_slug.items():
    print(f"  {slug}: {len(items)} member(s)")

print()
print("Pipeline:")
rows_by_parquet = defaultdict(list)
for slug, items in by_slug.items():
    for r, _ in items:
        iso_pref = bmb._region_iso_prefix(r.get("region"))
        if iso_pref and iso_pref in bmb.CROSS_BORDER_PARQUET:
            p = bmb.CROSS_BORDER_PARQUET[iso_pref]
        else:
            p = bmb.COUNTRY_PARQUET_MAP.get(r["country"], bmb.SOURCE_PARQUET)
        rows_by_parquet[p].append(r)

for p in rows_by_parquet:
    print(f"  parquet: {p}")
    if not os.path.exists(p):
        print(f"    !! MISSING ON DISK")

by_a = defaultdict(list)
by_b = defaultdict(list)
for p, prs in rows_by_parquet.items():
    if not os.path.exists(p):
        continue
    keys = {(bmb._effective_region(r["region"]), r["subtype"], r["primary"]) for r in prs}
    keys_name = {(r["subtype"], r["primary"]) for r in prs if not r.get("region")}
    iso = set()
    for r in prs:
        ip = bmb._region_iso_prefix(r.get("region"))
        if ip:
            iso.add(ip)
        elif r["country"] in bmb.COUNTRY_TO_ISO:
            iso.add(bmb.COUNTRY_TO_ISO[r["country"]])
    _, pa, _, pna = bmb.load_overture(p, keys, keys_name, iso)
    for k,v in pa.items(): by_a[k].extend(v)
    for k,v in pna.items(): by_b[k].extend(v)

print()
print("Per-metro resolution:")
for slug, items in by_slug.items():
    polys = 0; misses = []
    for r, _ in items:
        key = (bmb._effective_region(r["region"]), r["subtype"], r["primary"])
        if by_a.get(key):
            polys += 1
        elif not r.get("region"):
            name_key = (r["subtype"], r["primary"])
            cands = by_b.get(name_key)
            if cands and len({c[0] for c in cands}) == 1:
                polys += 1
            else:
                misses.append(("Tier-B-fail", key, name_key))
        else:
            misses.append(("Tier-A-miss", key, None))
    print(f"  {slug}: {polys} polys resolved, {len(misses)} miss(es)")
    for m in misses:
        print(f"     {m}")
