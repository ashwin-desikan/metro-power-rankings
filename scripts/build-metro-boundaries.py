"""Build metro boundary GeoJSON files using a per-country sheet routing.

The MetroAreas.xlsx workbook now carries the same four user-curated Overture
columns on BOTH the Counties sheet and the Municipality sheet:

  - Subtype           (Overture subtype, e.g. 'county', 'region', 'locality')
  - Admin Level       (e.g. 2)
  - Region            (ISO 3166-2, e.g. 'US-AL', 'CA-ON', 'MX-AGU', 'GB-SCT')
  - Primary Name      (exact Overture primary name, e.g. 'Marshall County',
                       'Manicouagan', 'Municipio de Aguascalientes',
                       'Aberdeen City')

The two sheets store these columns at slightly different positions because
the Municipality sheet has two extra leading columns. The SHEET_SCHEMAS dict
below records the exact column offsets per sheet so the loader can pull the
same logical fields out of either one.

Each country we support is mapped (via COUNTRY_SHEET_MAP) to exactly ONE
source sheet AND to one Overture parquet (via COUNTRY_PARQUET_MAP, which
falls back to SOURCE_PARQUET if a country isn't listed). Any row whose
country is in the map but appears in the wrong sheet is silently skipped,
which prevents double-coverage. Any row whose country is not in the map is
also skipped: the frontend then falls back to a primary-city pin from
metros.json (lat, lon).

Initial routing:
  United States  -> counties      (SOURCE_PARQUET)
  Mexico         -> counties      (SOURCE_PARQUET)
  Canada         -> municipality  (SOURCE_PARQUET)
  United Kingdom -> municipality  (SOURCE_PARQUET)

Workbook-country normalization:
  The UK is split across four constituent country values in the workbook
  (England / Scotland / Wales / Northern Ireland). metros.json uses a
  single canonical "United Kingdom" value. WORKBOOK_TO_CANONICAL_COUNTRY
  collapses constituents to the canonical name before slug resolution.
  Add new entries here whenever a country in the workbook appears under
  multiple names but should share a single metros.json identity.

To extend to a new country:
  1. Pick the sheet that holds its rows (Counties or Municipality).
  2. Populate the four Overture columns by hand for those rows.
  3. Add one entry to COUNTRY_SHEET_MAP and one to COUNTRY_TO_ISO.
  4. Add one entry to COUNTRY_PARQUET_MAP pointing at a country-scoped
     Overture extract (do NOT add new countries to the global parquet -
     scanning a 5.8 GB file per added country is wasteful). Per-country
     extracts typically run 10-500 MB and scan in seconds.
  5. If the workbook stores the country under multiple names that should
     map to a single metros.json identity, add entries to
     WORKBOOK_TO_CANONICAL_COUNTRY.

The script picks the new country up on the next run with no other code
changes required.

Outlier-part trim:
  After unioning a metro's member polygons, the result is decomposed and
  any disjoint MultiPolygon parts whose minimum distance from the metro's
  anchor point exceeds OUTLIER_PART_MAX_KM are dropped. This trims off
  remote oceanic outposts (Honolulu's Northwestern Hawaiian Islands,
  Tokyo's Izu/Ogasawara chains) without harming legitimate large
  contiguous metros (NYC, LA, etc.) since those are single polygons or
  have all parts within the threshold of the anchor.

Behavior:
  - Wipes public/data/metro-boundaries/ at start (only files for currently
    routed slugs are kept).
  - Writes one GeoJSON per metro with at least one resolved member.
  - Reports unmatched rows (workbook Primary Name not found in parquet)
    and per-metro outlier trim audit.

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
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

import openpyxl
from shapely.geometry import MultiPolygon, Point, mapping
from shapely.ops import nearest_points, unary_union


SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\global-division-area.parquet",
)
WORKBOOK = "MetroAreas.xlsx"
METROS_JSON = "public/data/metros.json"
OUT_DIR = Path("public/data/metro-boundaries")
SIMPLIFY_TOLERANCE_DEG = 0.005

# Maximum distance (km) any disjoint multipolygon part may be from the
# metro's anchor point. Parts beyond this are dropped before simplify.
#
# 200 km is calibrated against the largest legitimate metro footprints:
# New York's eastern Long Island fragments reach ~175 km from Manhattan
# (kept), LA's Channel-Islands-side parts reach ~145 km (kept), Tokyo's
# Izu Oshima sits ~110 km south (will be kept when JP ships). Honolulu's
# Northwestern Hawaiian Islands start at 461 km (dropped), Tokyo's
# Hachijōjima ~290 km and Ogasawara ~1,000 km (dropped). Tune by editing
# this single value.
OUTLIER_PART_MAX_KM = 200.0


# ---------- Per-country parquet routing ---------------------------------
#
# COUNTRY_PARQUET_MAP lets each country pull from its OWN Overture parquet
# extract. Countries not listed fall back to SOURCE_PARQUET above.
#
# Why this matters: the global Overture division-area parquet is ~5.8 GB.
# Scanning it once for US+MX+CA+GB is fine (the existing arrangement),
# but every additional country we add would re-scan the same 5.8 GB.
# Per-country extracts are typically 10-500 MB, scan in seconds, and keep
# memory low.
#
# How to extend: produce a per-country parquet (use Overture's release CLI
# to extract `division_area` filtered by country), drop it into
# C:\Users\ashwi\Desktop\Projects\MapData\, and add an entry below. The
# loader will scan it exactly once with that country's wanted keys.
#
# US/MX/CA/GB intentionally omitted: they continue to use SOURCE_PARQUET
# (the existing global file). Don't move them unless you have a reason.
COUNTRY_PARQUET_MAP = {
    # Examples for future use:
    # "France":         r"C:\Users\ashwi\Desktop\Projects\MapData\overture-FR.parquet",
    # "Germany":        r"C:\Users\ashwi\Desktop\Projects\MapData\overture-DE.parquet",
}


# ---------- Per-country sheet routing -----------------------------------
#
# COUNTRY_SHEET_MAP is the single source of truth for which workbook sheet
# holds the boundary-source rows for each country (using the CANONICAL
# country name, post WORKBOOK_TO_CANONICAL_COUNTRY normalization).
COUNTRY_SHEET_MAP = {
    "United States":  "counties",
    "Mexico":         "counties",
    "Canada":         "municipality",
    "United Kingdom": "municipality",
}

# COUNTRY_TO_ISO maps the canonical country name to the ISO 3166-1 alpha-2
# code that Overture uses in its `country` column. Used to narrow the
# parquet scan.
COUNTRY_TO_ISO = {
    "United States":  "US",
    "Mexico":         "MX",
    "Canada":         "CA",
    "United Kingdom": "GB",
}

# WORKBOOK_TO_CANONICAL_COUNTRY normalizes workbook country values that
# differ from the canonical name used in metros.json and downstream maps.
# Every key here must map to a country also present in COUNTRY_SHEET_MAP.
WORKBOOK_TO_CANONICAL_COUNTRY = {
    "England":          "United Kingdom",
    "Scotland":         "United Kingdom",
    "Wales":            "United Kingdom",
    "Northern Ireland": "United Kingdom",
}

# UK_CONSTITUENT_REGION corrects the Region column for UK rows. The
# workbook stores 'GB-ENG' as a fill-down across all four constituents
# (an editorial shortcut). Overture publishes UK admin entities under the
# proper constituent ISO 3166-2 code, so we re-derive it from the original
# workbook constituent name (col 1, BEFORE canonical normalization).
UK_CONSTITUENT_REGION = {
    "England":          "GB-ENG",
    "Scotland":         "GB-SCT",
    "Wales":            "GB-WLS",
    "Northern Ireland": "GB-NIR",
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


# ---------- Geometry helpers --------------------------------------------

def _haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometers between two (lat, lon) points."""
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (sin(dlat / 2) ** 2
         + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2)
    return 2 * R * asin(sqrt(a))


def trim_outlier_parts(geom, anchor_lat, anchor_lon,
                       max_distance_km=OUTLIER_PART_MAX_KM):
    """For MultiPolygon geometries, drop disjoint parts whose minimum
    distance from the anchor (lat, lon) exceeds `max_distance_km`.

    Returns (trimmed_geom, dropped_count, dropped_distances_km). Single
    polygons and small multis (one part) are returned unchanged with an
    empty drop list.
    """
    if geom is None or geom.is_empty:
        return geom, 0, []
    if geom.geom_type != "MultiPolygon":
        return geom, 0, []

    parts = list(geom.geoms)
    if len(parts) <= 1:
        return geom, 0, []

    anchor = Point(anchor_lon, anchor_lat)

    kept = []
    dropped = []
    for p in parts:
        try:
            near_on_part, _ = nearest_points(p, anchor)
            d_km = _haversine_km(anchor_lat, anchor_lon,
                                 near_on_part.y, near_on_part.x)
        except Exception:
            kept.append(p)
            continue
        if d_km <= max_distance_km:
            kept.append(p)
        else:
            dropped.append((p, d_km))

    if not kept:
        largest = max(parts, key=lambda p: p.area)
        return largest, len(parts) - 1, [d for _, d in dropped]

    if len(kept) == 1:
        result = kept[0]
    else:
        result = MultiPolygon(kept)

    return result, len(dropped), [d for _, d in dropped]


# ---------- Overture loader ----------------------------------------------

def load_overture(parquet_path: str, wanted_keys: set, wanted_iso_codes: set):
    """Stream the Overture parquet and keep only rows whose (region, subtype,
    primary_name) tuple is in `wanted_keys` AND whose country is in
    `wanted_iso_codes`. Returns two indexes (land-class preferred, any-class
    fallback) keyed by (region, subtype, primary_name).
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
        country (canonical), state_full, metro_display, region, subtype,
        primary, sheet_key (audit trail).
    Only rows whose canonical country routes to THIS sheet via
    COUNTRY_SHEET_MAP are kept. Rows whose country routes to a different
    sheet are silently skipped here (they'll be picked up by that sheet's
    pass).
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
    uk_region_overrides = 0
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or len(r) <= max_needed:
            continue
        country_workbook = r[cc]
        # Normalize for routing/slug lookup. Pre-normalization name is
        # kept around so per-constituent overrides still work.
        country_canonical = WORKBOOK_TO_CANONICAL_COUNTRY.get(
            country_workbook, country_workbook)
        if country_canonical not in COUNTRY_SHEET_MAP:
            not_routed += 1
            continue
        if COUNTRY_SHEET_MAP[country_canonical] != sheet_key:
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

        # ---- Municipality-only inline overrides ----
        if sheet_key == "municipality":
            # UK constituent fill-down correction. Workbook has
            # region='GB-ENG' on every UK row across all four constituents;
            # Overture indexes UK admin entities under the proper
            # constituent ISO. Re-derive from col 1 (constituent name).
            if (country_workbook in UK_CONSTITUENT_REGION
                    and region_str == "GB-ENG"):
                corrected = UK_CONSTITUENT_REGION[country_workbook]
                if corrected != region_str:
                    uk_region_overrides += 1
                region_str = corrected

        kept += 1
        yield {
            "country":       country_canonical,
            "state_full":    str(state_full or "").strip(),
            "metro_display": str(metro_display).strip(),
            "region":        region_str,
            "subtype":       subtype_str,
            "primary":       primary_str,
            "sheet_key":     sheet_key,
        }

    extra = ""
    if uk_region_overrides:
        extra = f"  uk-region-overrides {uk_region_overrides:,}"
    print(f"      [{sheet_name}] kept {kept:,}  routed-elsewhere {routed_elsewhere:,}  "
          f"unrouted-country {not_routed:,}  incomplete {incomplete:,}{extra}")


def load_workbook_rows(path: str):
    """Read both sheets, applying COUNTRY_SHEET_MAP routing. Returns one flat
    list of row dicts."""
    print(f"[2/4] Reading {path} (sheets: "
          f"{', '.join(SHEET_SCHEMAS[s]['sheet_name'] for s in SHEET_SCHEMAS)})")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

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
    """Build (metro_display_lower, country) -> {slug, lat, lon} index,
    restricted to the countries currently routed in COUNTRY_SHEET_MAP."""
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    routed = set(COUNTRY_SHEET_MAP)
    for m in metros:
        if m.get("country") not in routed:
            continue
        name = m.get("name", "").strip().lower()
        country = m.get("country", "")
        idx[(name, country)] = {
            "slug": m["slug"],
            "lat":  m.get("lat"),
            "lon":  m.get("lon"),
        }
    return idx


def resolve_slug_info(row, metros_index):
    base = row["metro_display"].strip().lower()
    return metros_index.get((base, row["country"]))


# ---------- Main ---------------------------------------------------------

def main():
    rows = load_workbook_rows(WORKBOOK)

    rows_by_parquet = defaultdict(list)
    for r in rows:
        parquet = COUNTRY_PARQUET_MAP.get(r["country"], SOURCE_PARQUET)
        rows_by_parquet[parquet].append(r)
    print(f"      parquet routing: {len(rows_by_parquet)} distinct parquet(s)")
    for p, rs in rows_by_parquet.items():
        countries = sorted({r["country"] for r in rs})
        print(f"        {p}")
        print(f"          {len(rs):,} rows, countries: {countries}")

    by_key_land = defaultdict(list)
    by_key_any = defaultdict(list)
    for parquet_path, parquet_rows in rows_by_parquet.items():
        parquet_keys = {(r["region"], r["subtype"], r["primary"])
                        for r in parquet_rows}
        parquet_iso = {COUNTRY_TO_ISO[r["country"]]
                       for r in parquet_rows
                       if r["country"] in COUNTRY_TO_ISO}
        print(f"      wanted keys for {parquet_path}: {len(parquet_keys):,}")
        pl, pa = load_overture(parquet_path, parquet_keys, parquet_iso)
        for k, v in pl.items():
            by_key_land[k].extend(v)
        for k, v in pa.items():
            by_key_any[k].extend(v)

    metros_index = load_metros_index(METROS_JSON)

    print("[3/4] Resolving slugs and grouping members")
    by_slug = defaultdict(list)
    slug_anchor = {}
    unresolved_metros = set()
    for row in rows:
        info = resolve_slug_info(row, metros_index)
        if info is None:
            unresolved_metros.add(f"{row['metro_display']} ({row['country']})")
            continue
        slug = info["slug"]
        by_slug[slug].append(row)
        slug_anchor[slug] = (info["lat"], info["lon"])
    print(f"      metros resolved: {len(by_slug):,}")
    if unresolved_metros:
        print(f"      metros unresolved (display name not in metros.json): "
              f"{len(unresolved_metros)}")
        for m in sorted(unresolved_metros)[:10]:
            print(f"        - {m}")
        if len(unresolved_metros) > 10:
            print(f"        ... and {len(unresolved_metros) - 10} more")

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

    written = 0
    skipped_no_geom = 0
    skipped_no_anchor = 0
    unmatched_per_metro = defaultdict(list)
    trim_audit = []
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

        anchor_lat, anchor_lon = slug_anchor.get(slug, (None, None))
        if (anchor_lat is not None and anchor_lon is not None
                and isinstance(anchor_lat, (int, float))
                and isinstance(anchor_lon, (int, float))
                and not (anchor_lat == 0 and anchor_lon == 0)):
            merged, n_dropped, dropped_dists = trim_outlier_parts(
                merged, float(anchor_lat), float(anchor_lon))
            if n_dropped > 0:
                trim_audit.append((slug, n_dropped, max(dropped_dists)))
        else:
            skipped_no_anchor += 1

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
    if skipped_no_anchor:
        print(f"Metros built without outlier-trim (no anchor lat/lon): {skipped_no_anchor:,}")
    if trim_audit:
        print(f"Outlier-trim applied to {len(trim_audit)} metro(s):")
        for slug, n, max_d in sorted(trim_audit, key=lambda x: -x[2]):
            print(f"  {slug}: dropped {n} part(s), furthest {max_d:,.0f} km")
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
