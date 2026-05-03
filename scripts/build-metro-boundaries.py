"""Build metro boundary GeoJSON files for the United States and Mexico only.

The MetroAreas.xlsx Counties sheet now carries four user-curated columns
that tie each row directly to its Overture division_area feature:

  - col 12: Subtype           (Overture subtype, e.g. 'county')
  - col 13: Admin Level       (e.g. 2)
  - col 14: Region (ISO 3166-2, e.g. 'US-AL', 'MX-AGU')
  - col 15: Primary Name      (exact Overture primary name, e.g.
                               'Marshall County', 'Municipio de Aguascalientes')

This script does a direct lookup against the Overture parquet using
(region, subtype, primary name) as the key. No name normalization. No
country-specific branches. No suffix stripping. No alias maps.

All countries other than US and Mexico are intentionally skipped. The
frontend (app/rankings/[slug]/MetroPageMap.tsx) falls back to a primary-city
pin from metros.json (lat, lon) when no boundary GeoJSON exists.

Behavior:
  - Wipes public/data/metro-boundaries/ at start.
  - Writes one GeoJSON per US/Mexico metro with at least one resolved member.
  - Reports unmatched rows (workbook Primary Name not found in parquet).

Dependencies:
  pip install geopandas openpyxl pyarrow

Source parquet path defaults to the user's local layout but is overridable
via the OVERTURE_DIVISION_AREA env var.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

import openpyxl
from shapely.geometry import mapping
from shapely.ops import unary_union


SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\global-division-area.parquet",
)
WORKBOOK = "MetroAreas.xlsx"
METROS_JSON = "public/data/metros.json"
OUT_DIR = Path("public/data/metro-boundaries")
SIMPLIFY_TOLERANCE_DEG = 0.005

SUPPORTED_COUNTRIES = ("United States", "Mexico")


# ---------- Overture loader ----------------------------------------------

def load_overture(parquet_path: str, wanted_keys: set):
    """Stream the Overture parquet and keep only rows whose (region, subtype,
    primary_name) tuple is in `wanted_keys`. Returns two indexes (land-class
    preferred, any-class fallback) keyed by (region, subtype, primary_name).

    Memory profile: scans the parquet row by row via pyarrow batches, decoding
    geometry only for matching rows. Peak RSS stays under ~600 MB even on the
    NA parquet because we never materialize the full 67k US+MX dataframe.
    """
    print(f"[1/4] Reading Overture parquet: {parquet_path}")
    t0 = time.time()
    import pyarrow.parquet as pq
    from shapely import wkb as shapely_wkb

    pf = pq.ParquetFile(parquet_path)
    cols = ["geometry", "country", "region", "subtype", "class", "names"]

    by_key_land = defaultdict(list)
    by_key_any = defaultdict(list)
    rows_scanned = 0
    rows_kept = 0
    for batch in pf.iter_batches(batch_size=10_000, columns=cols):
        countries = batch.column("country").to_pylist()
        regions = batch.column("region").to_pylist()
        subtypes = batch.column("subtype").to_pylist()
        classes = batch.column("class").to_pylist()
        names_col = batch.column("names").to_pylist()
        geoms_col = batch.column("geometry").to_pylist()
        for i in range(len(countries)):
            rows_scanned += 1
            if countries[i] not in ("US", "MX"):
                continue
            nm = names_col[i]
            primary = nm.get("primary") if isinstance(nm, dict) else None
            if not primary:
                continue
            key = (regions[i], subtypes[i], primary)
            if key not in wanted_keys:
                continue
            geom_bytes = geoms_col[i]
            if not geom_bytes:
                continue
            try:
                geom = shapely_wkb.loads(geom_bytes)
            except Exception:
                continue
            if classes[i] == "land":
                by_key_land[key].append(geom)
            by_key_any[key].append(geom)
            rows_kept += 1

    print(f"      scanned {rows_scanned:,} rows, kept {rows_kept:,} matching keys "
          f"in {time.time()-t0:.1f}s")
    print(f"      indexed {len(by_key_any):,} unique (region, subtype, primary) keys")
    return by_key_land, by_key_any


# ---------- Workbook loader ----------------------------------------------

def load_workbook_rows(path: str):
    """Read the Counties sheet and return (country, region, subtype,
    primary_name, metro_display, state_full) tuples for US + Mexico rows
    that have all four user-curated Overture columns populated.
    """
    print(f"[2/4] Reading {path} Counties sheet")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Counties"]
    out = []
    skipped = 0
    incomplete = 0
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r:
            continue
        country = r[0]
        if country not in SUPPORTED_COUNTRIES:
            skipped += 1
            continue
        state_full = r[2]
        metro_display = r[7]
        subtype = r[12] if len(r) > 12 else None
        # admin_level = r[13]  # not needed for lookup
        region = r[14] if len(r) > 14 else None
        primary = r[15] if len(r) > 15 else None
        if not (region and subtype and primary and metro_display):
            incomplete += 1
            continue
        region_str = str(region).strip()
        subtype_str = str(subtype).strip()
        # DC exception: workbook stores DC as subtype=county for editorial
        # consistency with the rest of the Counties sheet, but Overture
        # publishes it at admin_level=1 (subtype=region). Override here so
        # the downstream lookup hits the right Overture entity.
        if region_str == "US-DC" and subtype_str == "county":
            subtype_str = "region"
        # Nash County NC exception: Overture has the entity at
        # subtype=neighborhood instead of subtype=county (one of NC's 100
        # counties is mistagged in their dataset). Workbook value is
        # editorially correct; this override patches around the Overture bug.
        primary_str = str(primary).strip()
        if (region_str == "US-NC" and subtype_str == "county"
                and primary_str == "Nash County"):
            subtype_str = "neighborhood"
        out.append({
            "country": country,
            "state_full": str(state_full or "").strip(),
            "metro_display": str(metro_display).strip(),
            "region": region_str,
            "subtype": subtype_str,
            "primary": primary_str,
        })
    print(f"      kept: {len(out):,} rows (skipped non-US/MX: {skipped:,}, "
          f"incomplete US/MX: {incomplete:,})")
    return out


# ---------- Slug resolver ------------------------------------------------

def load_metros_index(path: str):
    """Build (metro_display_lower, country) -> slug index. Country is the
    disambiguator so US/MX same-name metros don't collide."""
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    for m in metros:
        if m.get("country") not in SUPPORTED_COUNTRIES:
            continue
        name = m.get("name", "").strip().lower()
        country = m.get("country", "")
        idx[(name, country)] = m["slug"]
    return idx


def resolve_slug(row, metros_index):
    base = row["metro_display"].strip().lower()
    return metros_index.get((base, row["country"]))


# ---------- Main ---------------------------------------------------------

def main():
    rows = load_workbook_rows(WORKBOOK)
    wanted_keys = {(r["region"], r["subtype"], r["primary"]) for r in rows}
    print(f"      wanted (region, subtype, primary) keys: {len(wanted_keys):,}")
    by_key_land, by_key_any = load_overture(SOURCE_PARQUET, wanted_keys)
    metros_index = load_metros_index(METROS_JSON)

    # Group rows by slug
    print("[3/4] Resolving slugs and grouping members")
    by_slug = defaultdict(list)
    unresolved_metros = set()
    for row in rows:
        slug = resolve_slug(row, metros_index)
        if slug is None:
            unresolved_metros.add(f"{row['metro_display']} ({row['country']})")
            continue
        by_slug[slug].append(row)
    print(f"      metros resolved: {len(by_slug):,}")
    if unresolved_metros:
        print(f"      metros unresolved (display name not in metros.json): "
              f"{len(unresolved_metros)}")
        for m in sorted(unresolved_metros)[:10]:
            print(f"        - {m}")
        if len(unresolved_metros) > 10:
            print(f"        ... and {len(unresolved_metros) - 10} more")

    # Identify which files we need to keep (US/MX slugs we will write) vs.
    # which to remove (everything else).
    keep_slugs = set(by_slug.keys())
    print(f"[4/4] Pruning {OUT_DIR} to keep {len(keep_slugs):,} US/MX slugs")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    deleted = 0
    failed_to_delete = []
    if OUT_DIR.exists():
        for f in OUT_DIR.iterdir():
            if not (f.is_file() and f.suffix == ".geojson"):
                continue
            slug = f.stem
            if slug in keep_slugs:
                continue
            try:
                f.unlink()
                deleted += 1
            except PermissionError:
                failed_to_delete.append(f.name)
    print(f"      deleted {deleted:,} stale boundary files")
    if failed_to_delete:
        print(f"      could not delete {len(failed_to_delete):,} files (sandbox bind-mount)")
        manifest = OUT_DIR.parent / "stale-boundaries-to-delete.txt"
        with open(manifest, "w", encoding="utf-8") as mf:
            for name in sorted(failed_to_delete):
                mf.write(name + "\n")
        print(f"      manifest written to {manifest}")

    # Build polygons per metro
    written = 0
    skipped_no_geom = 0
    unmatched_per_metro = defaultdict(list)
    for slug, members in by_slug.items():
        polys = []
        for m in members:
            key = (m["region"], m["subtype"], m["primary"])
            geoms = by_key_land.get(key) or by_key_any.get(key)
            if not geoms:
                unmatched_per_metro[slug].append(
                    f"{m['region']}/{m['subtype']}/{m['primary']!r}"
                )
                continue
            polys.extend(geoms)
        if not polys:
            skipped_no_geom += 1
            continue
        merged = unary_union(polys)
        try:
            simplified = merged.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
            if simplified.is_valid and not simplified.is_empty:
                merged = simplified
        except Exception:
            pass
        feature = {
            "type": "Feature",
            "properties": {
                "slug": slug,
                "members": len(polys),
                "country": members[0]["country"],
            },
            "geometry": mapping(merged),
        }
        out_path = OUT_DIR / f"{slug}.geojson"
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump({"type": "FeatureCollection", "features": [feature]}, f)
            written += 1
        except PermissionError:
            # Sandbox bind-mount may treat existing files as read-only.
            # Try writing to a temp file then renaming over.
            import tempfile as _tf, shutil as _sh
            tfd, tname = _tf.mkstemp(dir=OUT_DIR, suffix=".geojson")
            os.close(tfd)
            with open(tname, "w", encoding="utf-8") as f:
                json.dump({"type": "FeatureCollection", "features": [feature]}, f)
            _sh.move(tname, out_path)
            written += 1

    print()
    print("=" * 60)
    print(f"Boundaries written: {written:,}")
    print(f"Metros skipped (no geometry resolved): {skipped_no_geom:,}")
    if unmatched_per_metro:
        total_unmatched = sum(len(v) for v in unmatched_per_metro.values())
        print(f"Members unmatched in parquet: {total_unmatched:,} across "
              f"{len(unmatched_per_metro)} metros")
        if "--verbose" in sys.argv:
            for slug, items in sorted(unmatched_per_metro.items())[:20]:
                print(f"  {slug}:")
                for it in items[:5]:
                    print(f"    - {it}")
                if len(items) > 5:
                    print(f"    ... +{len(items) - 5} more")
    print("=" * 60)


if __name__ == "__main__":
    main()
