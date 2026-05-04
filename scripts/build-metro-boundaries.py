"""Build metro boundary GeoJSON files using a per-country sheet routing.

The MetroAreas.xlsx workbook now carries the same four user-curated Overture
columns on BOTH the Counties sheet and the Municipality sheet:

  - Subtype           (Overture subtype, e.g. 'county', 'region', 'locality')
  - Admin Level       (e.g. 2)
  - Region            (ISO 3166-2, e.g. 'US-AL', 'CA-ON', 'MX-AGU', 'GB-SCT',
                       'FR-ARA')
  - Primary Name      (exact Overture primary name, e.g. 'Marshall County',
                       'Manicouagan', 'Aberdeen City', 'Abbeville')

Each country we support is mapped (via COUNTRY_SHEET_MAP) to exactly ONE
source sheet AND to one Overture parquet (via COUNTRY_PARQUET_MAP, which
falls back to SOURCE_PARQUET if a country isn't listed).

Initial routing:
  United States  -> counties      (SOURCE_PARQUET)
  Mexico         -> counties      (SOURCE_PARQUET)
  Canada         -> municipality  (SOURCE_PARQUET)
  United Kingdom -> municipality  (SOURCE_PARQUET)
  France         -> municipality  (SOURCE_PARQUET)

Incremental build (build cache):
  Each metro's polygon is the function of its sorted (region, subtype,
  primary) row set, its anchor (lat, lon) from metros.json, and a small
  set of script constants captured in SCRIPT_VERSION_HASH below. We hash
  those inputs per metro and store the hash in
  public/data/metro-boundaries/build-cache.json. (Filename intentionally
  has no leading dot - OneDrive and Defender on Windows treat dot-prefix
  files inconsistently and silently delete them in some configurations.)

  On each run, we compute the new input hashes BEFORE touching the
  parquet. Metros whose hash matches the cache AND whose GeoJSON is
  present on disk are skipped entirely. The parquet scan runs only over
  the keys needed by metros that actually need rebuilding. If no metros
  need rebuilding and no stale slugs need pruning, the script exits in
  seconds without scanning the parquet at all.

  Pass --force to bypass the cache and rebuild everything.

  Bump SCRIPT_VERSION_HASH manually (or change any constant it includes)
  to force a global rebuild from the next run on. The hash is derived
  from the constants automatically, so bumping OUTLIER_PART_MAX_KM (for
  example) invalidates all cached metros without manual intervention.

To extend to a new country:
  1. Pick the sheet that holds its rows (Counties or Municipality).
  2. Populate the four Overture columns by hand for those rows.
  3. Add one entry each to COUNTRY_SHEET_MAP, COUNTRY_TO_ISO,
     COUNTRY_PARQUET_MAP. If the workbook stores the country under
     multiple constituent names, add WORKBOOK_TO_CANONICAL_COUNTRY entries.
  4. Run scripts/extract-overture-parquet.py to produce the per-country
     runtime parquet.

Outlier-part trim:
  After unioning a metro's member polygons, parts of the resulting
  MultiPolygon whose minimum distance from the anchor exceeds
  OUTLIER_PART_MAX_KM are dropped. Trims off Honolulu's NWHI tail and
  Tokyo's Izu/Ogasawara without harming NYC-scale metros.

Behavior:
  - Reads build-cache.json; computes new hashes; skips unchanged metros.
  - Wipes only stale slugs (no longer in workbook) from
    public/data/metro-boundaries/.
  - Writes one GeoJSON per metro that actually rebuilt.
  - Writes the updated cache file at the end.

Dependencies:
  pip install geopandas openpyxl pyarrow

Source parquet path defaults to the user's local layout but is overridable
via the OVERTURE_DIVISION_AREA env var.
"""
from __future__ import annotations

import hashlib
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
BUILD_CACHE_FILE = OUT_DIR / "build-cache.json"
SIMPLIFY_TOLERANCE_DEG = 0.005
# Each member polygon is simplified to this tolerance BEFORE the per-metro
# unary_union. Cuts vertex count 5-10x on dense commune sets (Paris 1,563
# communes, Bordeaux 534, etc.) without visible quality loss at metro zoom.
# Set to 0 to disable pre-simplification.
MEMBER_SIMPLIFY_TOLERANCE_DEG = 0.001
OUTLIER_PART_MAX_KM = 200.0


# ---------- Per-country parquet routing ---------------------------------
COUNTRY_PARQUET_MAP = {
    # Per-country parquets keep heavy commune scans off the 5.8 GB global
    # file. Generate via scripts/extract-overture-parquet.py.
    "France":  r"C:\Users\ashwi\Desktop\Projects\MapData\overture-FR.parquet",
    "Germany": r"C:\Users\ashwi\Desktop\Projects\MapData\overture-DE.parquet",
    # Add additional per-country parquet entries here as you produce them:
    # "Italy":          r"C:\Users\ashwi\Desktop\Projects\MapData\overture-IT.parquet",
}


# ---------- Per-country sheet routing -----------------------------------
COUNTRY_SHEET_MAP = {
    "United States":  "counties",
    "Mexico":         "counties",
    "Canada":         "municipality",
    "United Kingdom": "municipality",
    "France":         "municipality",
    "Germany":        "municipality",
}

COUNTRY_TO_ISO = {
    "United States":  "US",
    "Mexico":         "MX",
    "Canada":         "CA",
    "United Kingdom": "GB",
    "France":         "FR",
    "Germany":        "DE",
}

WORKBOOK_TO_CANONICAL_COUNTRY = {
    "England":          "United Kingdom",
    "Scotland":         "United Kingdom",
    "Wales":            "United Kingdom",
    "Northern Ireland": "United Kingdom",
}

UK_CONSTITUENT_REGION = {
    "England":          "GB-ENG",
    "Scotland":         "GB-SCT",
    "Wales":            "GB-WLS",
    "Northern Ireland": "GB-NIR",
}

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


# ---------- Build-cache versioning --------------------------------------
#
# Hash of the script constants that affect output geometry. If any of
# these change, ALL cached metros are invalidated automatically on the
# next run. To force a global rebuild without changing a constant, bump
# the literal "logic_version" string below.
SCRIPT_VERSION_HASH = hashlib.sha256(json.dumps({
    "outlier_max_km":  OUTLIER_PART_MAX_KM,
    "simplify_tol":    SIMPLIFY_TOLERANCE_DEG,
    "logic_version":   "v2",
}, sort_keys=True).encode()).hexdigest()[:12]


# ---------- Geometry helpers --------------------------------------------

def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (sin(dlat / 2) ** 2
         + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2)
    return 2 * R * asin(sqrt(a))


def trim_outlier_parts(geom, anchor_lat, anchor_lon,
                       max_distance_km=OUTLIER_PART_MAX_KM):
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
    print(f"      Reading parquet: {parquet_path}")
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

        if sheet_key == "counties":
            if region_str == "US-DC" and subtype_str == "county":
                subtype_str = "region"
            if (region_str == "US-NC" and subtype_str == "county"
                    and primary_str == "Nash County"):
                subtype_str = "neighborhood"

        if sheet_key == "municipality":
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
    print(f"[1/5] Reading {path} (sheets: "
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


# ---------- Build cache --------------------------------------------------

def compute_input_hash(members, anchor):
    """Stable hash of the inputs that determine a metro's polygon."""
    keys = sorted([
        (m["region"], m["subtype"], m["primary"]) for m in members
    ])
    payload = json.dumps({
        "version": SCRIPT_VERSION_HASH,
        "keys":    keys,
        "anchor":  list(anchor) if anchor and anchor[0] is not None else None,
    }, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def load_build_cache():
    if not BUILD_CACHE_FILE.exists():
        return {"version": SCRIPT_VERSION_HASH, "hashes": {}}
    try:
        with open(BUILD_CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)
        if not isinstance(cache, dict) or "hashes" not in cache:
            return {"version": SCRIPT_VERSION_HASH, "hashes": {}}
        # If script version changed since cache was written, all entries
        # are invalid. Drop them but keep the file alive for the rewrite.
        if cache.get("version") != SCRIPT_VERSION_HASH:
            print(f"      cache: script version changed, invalidating "
                  f"{len(cache.get('hashes', {})):,} entries")
            return {"version": SCRIPT_VERSION_HASH, "hashes": {}}
        return cache
    except Exception as e:
        print(f"      cache: failed to read ({e}), starting fresh")
        return {"version": SCRIPT_VERSION_HASH, "hashes": {}}


def save_build_cache(cache):
    abs_path = BUILD_CACHE_FILE.resolve()
    print(f"      cache: writing to {abs_path}")
    print(f"      cache: entries to write: {len(cache.get('hashes', {})):,}")
    try:
        BUILD_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(BUILD_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, sort_keys=True)
        # Verify on disk
        if BUILD_CACHE_FILE.exists():
            sz = BUILD_CACHE_FILE.stat().st_size
            print(f"      cache: WROTE ok ({sz:,} bytes on disk)")
        else:
            print(f"      cache: ERROR wrote without exception but file does not exist on disk")
    except Exception as e:
        print(f"      cache: WRITE FAILED ({type(e).__name__}: {e})")
        raise


# ---------- Main ---------------------------------------------------------

def main():
    force = "--force" in sys.argv
    if force:
        print("FORCE rebuild requested; cache will be ignored.")

    rows = load_workbook_rows(WORKBOOK)
    metros_index = load_metros_index(METROS_JSON)

    print("[2/5] Resolving slugs and grouping members")
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

    print("[3/5] Computing input hashes and consulting cache")
    cache = load_build_cache() if not force else {
        "version": SCRIPT_VERSION_HASH, "hashes": {}
    }
    cached_hashes = cache.get("hashes", {})
    new_hashes = {}
    needs_rebuild = set()
    for slug, members in by_slug.items():
        h = compute_input_hash(members, slug_anchor.get(slug))
        new_hashes[slug] = h
        if cached_hashes.get(slug) != h:
            needs_rebuild.add(slug)
        else:
            # Cache hit only counts if the GeoJSON file actually exists
            if not (OUT_DIR / f"{slug}.geojson").exists():
                needs_rebuild.add(slug)
    print(f"      cached entries: {len(cached_hashes):,}")
    print(f"      cache hits: {len(by_slug) - len(needs_rebuild):,}")
    print(f"      need rebuild: {len(needs_rebuild):,}")

    print("[4/5] Pruning stale boundary files")
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

    if not needs_rebuild:
        print("[5/5] Nothing to rebuild; skipping parquet scan.")
        # Drop cache entries for slugs no longer in workbook so the file
        # stays clean.
        cache["version"] = SCRIPT_VERSION_HASH
        cache["hashes"] = {s: new_hashes[s] for s in keep_slugs}
        save_build_cache(cache)
        print()
        print("=" * 60)
        print(f"Boundaries written: 0 (all {len(by_slug):,} metros up to date)")
        print(f"Stale files removed: {deleted:,}")
        print("=" * 60)
        return

    print(f"[5/5] Rebuilding {len(needs_rebuild):,} metro(s)")

    # Group rebuild rows by parquet path
    rebuild_rows = [r for slug in needs_rebuild for r in by_slug[slug]]
    rows_by_parquet = defaultdict(list)
    for r in rebuild_rows:
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

    written = 0
    skipped_no_geom = 0
    skipped_no_anchor = 0
    derived_anchors = 0
    unmatched_per_metro = defaultdict(list)
    trim_audit = []
    successfully_built = set()
    for slug in needs_rebuild:
        members = by_slug[slug]
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

        # Pre-simplify each member to cut vertex count before union.
        # Massive speedup on heavy metros (Paris 1,563 communes).
        if MEMBER_SIMPLIFY_TOLERANCE_DEG > 0:
            polys = [
                p.simplify(MEMBER_SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
                for p in polys
            ]

        merged = unary_union(polys)

        anchor_lat, anchor_lon = slug_anchor.get(slug, (None, None))
        anchor_valid = (
            anchor_lat is not None and anchor_lon is not None
            and isinstance(anchor_lat, (int, float))
            and isinstance(anchor_lon, (int, float))
            and not (anchor_lat == 0 and anchor_lon == 0)
        )
        if not anchor_valid:
            # Derive anchor from the largest polygon part. This guarantees
            # the anchor lies inside the urban core for chains-of-islands
            # cases (Honolulu, Tokyo) since the mainland part dominates.
            try:
                if merged.geom_type == "MultiPolygon":
                    largest = max(merged.geoms, key=lambda p: p.area)
                else:
                    largest = merged
                rp = largest.representative_point()
                anchor_lat, anchor_lon = float(rp.y), float(rp.x)
                anchor_valid = True
                derived_anchors += 1
            except Exception:
                pass

        if anchor_valid:
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
                "input_hash": new_hashes[slug],
            },
            "geometry": mapping(merged),
        }
        out_path = OUT_DIR / f"{slug}.geojson"
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump({"type": "FeatureCollection", "features": [feature]}, f)
            written += 1
            successfully_built.add(slug)
        except PermissionError:
            import tempfile as _tf, shutil as _sh
            tfd, tname = _tf.mkstemp(dir=OUT_DIR, suffix=".geojson")
            os.close(tfd)
            with open(tname, "w", encoding="utf-8") as f:
                json.dump({"type": "FeatureCollection", "features": [feature]}, f)
            _sh.move(tname, out_path)
            written += 1
            successfully_built.add(slug)

    # Persist cache: keep only slugs still in workbook AND either rebuilt
    # successfully OR previously cached (which means their existing GeoJSON
    # is still valid).
    cache["version"] = SCRIPT_VERSION_HASH
    cache["hashes"] = {
        slug: new_hashes[slug]
        for slug in keep_slugs
        if slug in successfully_built or slug not in needs_rebuild
    }
    save_build_cache(cache)

    print()
    print("=" * 60)
    print(f"Boundaries written: {written:,}")
    print(f"Cache entries persisted: {len(cache['hashes']):,}")
    print(f"Stale files removed: {deleted:,}")
    print(f"Metros skipped (no geometry resolved): {skipped_no_geom:,}")
    if derived_anchors:
        print(f"Metros with anchor derived from largest polygon part: {derived_anchors:,}")
    if skipped_no_anchor:
        print(f"Metros built without outlier-trim (no anchor at all): {skipped_no_anchor:,}")
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
