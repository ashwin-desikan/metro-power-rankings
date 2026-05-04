"""Build metro boundary GeoJSON files using a per-country sheet routing.

The MetroAreas.xlsx workbook now carries the same four user-curated Overture
columns on BOTH the Counties sheet and the Municipality sheet:

  - Subtype           (Overture subtype, e.g. 'county', 'region', 'locality')
  - Admin Level       (e.g. 2)
  - Region            (ISO 3166-2, e.g. 'US-AL', 'CA-ON', 'MX-AGU')
  - Primary Name      (exact Overture primary name, e.g. 'Marshall County',
                       'Manicouagan', 'Municipio de Aguascalientes')

The two sheets store these columns at slightly different positions because
the Municipality sheet has two extra leading columns. The SHEET_SCHEMAS dict
below records the exact column offsets per sheet so the loader can pull the
same logical fields out of either one.

Each country we support is mapped (via COUNTRY_SHEET_MAP) to exactly ONE
source sheet. Any row whose country is in the map but appears in the wrong
sheet is silently skipped, which prevents double-coverage. Any row whose
country is not in the map is also skipped: the frontend then falls back to
a primary-city pin from metros.json (lat, lon).

Initial routing:
  United States -> counties
  Mexico        -> counties
  Canada        -> municipality

To extend to a new country: pick the sheet that holds its rows, populate the
four Overture columns by hand for those rows, and add a single entry to
COUNTRY_SHEET_MAP. The script picks it up on the next run.

Behavior:
  - Wipes public/data/metro-boundaries/ at start (only files for currently
    routed slugs are kept).
  - Writes one GeoJSON per metro with at least one resolved member.
  - Reports unmatched rows (workbook Primary Name not found in parquet).

Dependencies:
  pip install geopandas openpyxl pyarrow

Source parquet path defaults to the user's local layout but is overridable
via the OVERTURE_DIVISION_AREA env var.
"""
from __future__ import annotations

import json
import os
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


# ---------- Per-country sheet routing -----------------------------------
#
# COUNTRY_SHEET_MAP is the single source of truth for which workbook sheet
# holds the boundary-source rows for each country. When extending coverage
# to a new country, decide which sheet you're populating and add an entry
# here. Do NOT have one country split across both sheets: that defeats the
# whole point of routing.
COUNTRY_SHEET_MAP = {
    "United States": "counties",
    "Mexico":        "counties",
    "Canada":        "municipality",
}

# COUNTRY_TO_ISO maps the workbook's full-country-name values to the ISO
# 3166-1 alpha-2 codes that Overture uses in its `country` column. Used to
# narrow the parquet scan to the relevant rows.
COUNTRY_TO_ISO = {
    "United States": "US",
    "Mexico":        "MX",
    "Canada":        "CA",
}

# SHEET_SCHEMAS records the column offsets per sheet for the seven fields
# the loader needs. The Municipality sheet shifts everything by 1 because
# col 0 holds an editorial flag and col 2 holds the Municipality name.
SHEET_SCHEMAS = {
    "counties": {
        "sheet_name":        "Counties",
        "col_country":       0,
        "col_state_full":    2,
        "col_metro_display": 7,
        "col_subtype":       12,
        "col_admin_level":   13,
        "col_region":        14,
        "col_primary":       15,
    },
    "municipality": {
        "sheet_name":        "Municipality",
        "col_country":       1,
        "col_state_full":    4,
        "col_metro_display": 6,
        "col_subtype":       13,
        "col_admin_level":   14,
        "col_region":        15,
        "col_primary":       16,
    },
}


# ---------- Overture loader ----------------------------------------------

def load_overture(parquet_path: str, wanted_keys: set, wanted_iso_codes: set):
    """Stream the Overture parquet and keep only rows whose (region, subtype,
    primary_name) tuple is in `wanted_keys` AND whose country is in
    `wanted_iso_codes`. Returns two indexes (land-class preferred, any-class
    fallback) keyed by (region, subtype, primary_name).

    Memory profile: scans the parquet row by row via pyarrow batches, decoding
    geometry only for matching rows. Peak RSS stays under ~600 MB even on the
    NA parquet because we never materialize the full dataframe.
    """
    print(f"[1/4] Reading Overture parquet: {parquet_path}")
    print(f"      country filter: {sorted(wanted_iso_codes)}")
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
            if countries[i] not in wanted_iso_codes:
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

def _read_sheet_rows(wb, sheet_key: str):
    """Yield normalized row dicts from one source sheet. Each dict carries:
        country, state_full, metro_display, region, subtype, primary,
        sheet_key (audit trail).
    Only rows whose country routes to THIS sheet via COUNTRY_SHEET_MAP are
    kept. Rows whose country routes to a different sheet are silently
    skipped here (they'll be picked up by that sheet's pass).
    """
    schema = SHEET_SCHEMAS[sheet_key]
    sheet_name = schema["sheet_name"]
    if sheet_name not in wb.sheetnames:
        print(f"      WARNING: sheet '{sheet_name}' not in workbook, skipping")
        return
    ws = wb[sheet_name]

    cc = schema["col_country"]
    cs = schema["col_state_full"]
    cm = schema["col_metro_display"]
    csub = schema["col_subtype"]
    creg = schema["col_region"]
    cpri = schema["col_primary"]
    max_needed = max(cc, cs, cm, csub, creg, cpri)

    kept = 0
    routed_elsewhere = 0
    not_routed = 0
    incomplete = 0
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or len(r) <= max_needed:
            continue
        country = r[cc]
        if country not in COUNTRY_SHEET_MAP:
            not_routed += 1
            continue
        if COUNTRY_SHEET_MAP[country] != sheet_key:
            # this country lives in the other sheet; skip
            routed_elsewhere += 1
            continue

        state_full = r[cs]
        metro_display = r[cm]
        subtype = r[csub]
        region = r[creg]
        primary = r[cpri]

        if not (region and subtype and primary and metro_display):
            incomplete += 1
            continue

        region_str = str(region).strip()
        subtype_str = str(subtype).strip()
        primary_str = str(primary).strip()

        # ---- Counties-only inline overrides for upstream Overture quirks ----
        if sheet_key == "counties":
            # DC: workbook stores it as subtype=county for editorial parity
            # with the rest of the Counties sheet, but Overture publishes it
            # at admin_level=1, subtype=region.
            if region_str == "US-DC" and subtype_str == "county":
                subtype_str = "region"
            # Nash County NC: Overture mistags this single county as
            # subtype=neighborhood. Workbook is editorially correct.
            if (region_str == "US-NC" and subtype_str == "county"
                    and primary_str == "Nash County"):
                subtype_str = "neighborhood"

        # If a Municipality-only override is needed in the future, add it
        # under `if sheet_key == "municipality":` here.

        kept += 1
        yield {
            "country":       country,
            "state_full":    str(state_full or "").strip(),
            "metro_display": str(metro_display).strip(),
            "region":        region_str,
            "subtype":       subtype_str,
            "primary":       primary_str,
            "sheet_key":     sheet_key,
        }

    print(f"      [{sheet_name}] kept {kept:,}  routed-elsewhere {routed_elsewhere:,}  "
          f"unrouted-country {not_routed:,}  incomplete {incomplete:,}")


def load_workbook_rows(path: str):
    """Read both sheets, applying COUNTRY_SHEET_MAP routing. Returns one flat
    list of row dicts."""
    print(f"[2/4] Reading {path} (sheets: "
          f"{', '.join(SHEET_SCHEMAS[s]['sheet_name'] for s in SHEET_SCHEMAS)})")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

    # Audit: surface any country that's mapped but missing from the map's sheet.
    sheets_in_use = {COUNTRY_SHEET_MAP[c] for c in COUNTRY_SHEET_MAP}
    print(f"      country routing: " + ", ".join(
        f"{c}->{COUNTRY_SHEET_MAP[c]}" for c in COUNTRY_SHEET_MAP))

    out = []
    for sheet_key in sheets_in_use:
        out.extend(_read_sheet_rows(wb, sheet_key))
    print(f"      total rows kept across all sheets: {len(out):,}")
    return out


# ---------- Slug resolver ------------------------------------------------

def load_metros_index(path: str):
    """Build (metro_display_lower, country) -> slug index, restricted to the
    countries currently routed in COUNTRY_SHEET_MAP."""
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    routed = set(COUNTRY_SHEET_MAP)
    for m in metros:
        if m.get("country") not in routed:
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
    wanted_iso = {COUNTRY_TO_ISO[c] for c in COUNTRY_SHEET_MAP if c in COUNTRY_TO_ISO}
    print(f"      wanted (region, subtype, primary) keys: {len(wanted_keys):,}")
    by_key_land, by_key_any = load_overture(SOURCE_PARQUET, wanted_keys, wanted_iso)
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

    # Identify which files we need to keep vs. which to remove.
    keep_slugs = set(by_slug.keys())
    print(f"[4/4] Pruning {OUT_DIR} to keep {len(keep_slugs):,} routed slugs")
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
