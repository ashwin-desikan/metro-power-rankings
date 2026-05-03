"""
US metro boundary GeoJSON generator.

Reads:
  - Overture Maps division_area Parquet (filtered to US counties)
  - MetroAreas.xlsx Counties sheet (US rows with Metro Area assignment)
  - public/data/metros.json (for slug resolution)

Writes:
  - public/data/metro-boundaries/{slug}.geojson (one per US metro)

Reports unmatched Metro Areas + counties for editorial follow-up.

Dependencies:
  pip install geopandas openpyxl pyarrow

Run from project root:
  python scripts/build-metro-boundaries-us.py

The Overture Parquet path defaults to the user's local layout but is
overridable via the OVERTURE_DIVISION_AREA env var.
"""

import os
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

import geopandas as gpd
import openpyxl
from shapely.ops import unary_union
from shapely.geometry import mapping

# Configuration
SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\us-conus-division-area.parquet",
)
WORKBOOK = "MetroAreas.xlsx"
METROS_JSON = "public/data/metros.json"
OUT_DIR = Path("public/data/metro-boundaries")

# Simplification tolerance in degrees. ~0.005 deg ≈ 500m at mid-latitudes.
# Keeps file sizes small without visibly distorting county outlines at the
# zoom levels we render maps at on metro pages.
SIMPLIFY_TOLERANCE_DEG = 0.005

# US state full name → ISO 3166-2 two-letter code (sans US- prefix because
# Overture's region field includes it: "US-AL"). The Counties sheet uses
# full names; Overture uses ISO 3166-2.
US_STATE_TO_ISO = {
    "Alabama": "US-AL", "Alaska": "US-AK", "Arizona": "US-AZ", "Arkansas": "US-AR",
    "California": "US-CA", "Colorado": "US-CO", "Connecticut": "US-CT",
    "Delaware": "US-DE", "DC": "US-DC", "District of Columbia": "US-DC",
    "Florida": "US-FL", "Georgia": "US-GA", "Hawaii": "US-HI", "Idaho": "US-ID",
    "Illinois": "US-IL", "Indiana": "US-IN", "Iowa": "US-IA", "Kansas": "US-KS",
    "Kentucky": "US-KY", "Louisiana": "US-LA", "Maine": "US-ME", "Maryland": "US-MD",
    "Massachusetts": "US-MA", "Michigan": "US-MI", "Minnesota": "US-MN",
    "Mississippi": "US-MS", "Missouri": "US-MO", "Montana": "US-MT",
    "Nebraska": "US-NE", "Nevada": "US-NV", "New Hampshire": "US-NH",
    "New Jersey": "US-NJ", "New Mexico": "US-NM", "New York": "US-NY",
    "North Carolina": "US-NC", "North Dakota": "US-ND", "Ohio": "US-OH",
    "Oklahoma": "US-OK", "Oregon": "US-OR", "Pennsylvania": "US-PA",
    "Rhode Island": "US-RI", "South Carolina": "US-SC", "South Dakota": "US-SD",
    "Tennessee": "US-TN", "Texas": "US-TX", "Utah": "US-UT", "Vermont": "US-VT",
    "Virginia": "US-VA", "Washington": "US-WA", "West Virginia": "US-WV",
    "Wisconsin": "US-WI", "Wyoming": "US-WY",
}


def normalize_county_name(name: str) -> str:
    """Lowercase and strip suffixes so 'St. Clair' matches 'St. Clair County'."""
    if not name:
        return ""
    s = str(name).strip()
    # Strip any trailing administrative suffix that one side has and the other doesn't
    for suffix in [
        " County", " Parish", " Borough", " Census Area",
        " Municipality", " Municipio", " (city)", " city",
    ]:
        if s.lower().endswith(suffix.lower()):
            s = s[: -len(suffix)].strip()
            break
    # Normalize: lowercase, drop punctuation, collapse spaces
    s = s.lower().replace(".", "").replace("'", "").replace("’", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def strip_disambiguator(metro_name: str) -> str:
    """Strip the trailing '(XX)' disambiguator. 'Birmingham (AL)' -> 'Birmingham'."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", metro_name).strip()


def load_overture_us_counties(path: str) -> gpd.GeoDataFrame:
    """Read Overture division_area Parquet, filter to US counties."""
    print(f"[1/5] Reading Overture Parquet: {path}")
    gdf = gpd.read_parquet(path, columns=["country", "subtype", "region", "names", "geometry"])
    us = gdf[(gdf["country"] == "US") & (gdf["subtype"] == "county")].copy()
    # Extract primary name from the names struct (it's a dict with 'primary' key)
    us["primary_name"] = us["names"].apply(
        lambda n: n.get("primary") if isinstance(n, dict) else None
    )
    us = us[us["primary_name"].notna() & us["region"].notna()].copy()
    us["norm"] = us["primary_name"].apply(normalize_county_name)
    print(f"      US county rows with name + region: {len(us)}")
    return us


def load_counties_sheet(path: str) -> list:
    """Read MetroAreas.xlsx Counties sheet, return US rows with metro assignment."""
    print(f"[2/5] Reading Counties sheet from {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Counties"]
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    out = []
    for r in rows[1:]:
        if not r or r[0] != "United States":
            continue
        county = r[1]
        state_full = r[2]
        county_type = r[6]
        metro_area = r[7]
        if not (county and state_full and metro_area):
            continue
        out.append({
            "county": str(county).strip(),
            "state_full": str(state_full).strip(),
            "type": county_type,
            "metro_display": str(metro_area).strip(),
            "norm": normalize_county_name(county),
            "iso": US_STATE_TO_ISO.get(str(state_full).strip()),
        })
    print(f"      US rows with metro assignment: {len(out)}")
    return out


def load_metros_index(path: str) -> dict:
    """Build (norm_name_no_paren, primary_state) -> slug index for US metros."""
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    for m in metros:
        if m.get("country") != "United States":
            continue
        name_norm = strip_disambiguator(m.get("name", "")).lower().strip()
        state = m.get("primaryState") or ""
        idx[(name_norm, state)] = m["slug"]
        # Fallback: name alone (only if unique)
        idx.setdefault((name_norm, None), m["slug"])
    return idx


def resolve_slug(metro_display: str, state_full: str, metros_index: dict):
    """Resolve a Metro Area display name + state to a metros.json slug."""
    base = strip_disambiguator(metro_display).lower().strip()
    # Try (name, state) first; fall back to (name, None) if unique
    return metros_index.get((base, state_full)) or metros_index.get((base, None))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    overture = load_overture_us_counties(SOURCE_PARQUET)
    counties = load_counties_sheet(WORKBOOK)
    metros_index = load_metros_index(METROS_JSON)

    # Build (region_iso, county_norm) -> polygon lookup
    print("[3/5] Indexing Overture polygons by (region, county_norm)")
    poly_index = {}
    for _, row in overture.iterrows():
        key = (row["region"], row["norm"])
        poly_index[key] = row["geometry"]
    print(f"      Indexed {len(poly_index)} unique county polygons")

    # Group Counties sheet by metro slug
    print("[4/5] Grouping Counties sheet by metro slug")
    by_slug: dict[str, list] = defaultdict(list)
    unmatched_metros = set()
    for c in counties:
        slug = resolve_slug(c["metro_display"], c["state_full"], metros_index)
        if slug is None:
            unmatched_metros.add(c["metro_display"])
            continue
        by_slug[slug].append(c)
    print(f"      Metros resolved to slugs: {len(by_slug)}")
    print(f"      Metros unmatched (display name not in metros.json): {len(unmatched_metros)}")
    if unmatched_metros and "--verbose" in sys.argv:
        for m in sorted(unmatched_metros)[:20]:
            print(f"        - {m}")
        if len(unmatched_metros) > 20:
            print(f"        ... and {len(unmatched_metros) - 20} more")

    # For each metro: dissolve member county polygons, simplify, write GeoJSON
    print("[5/5] Building per-metro GeoJSON files")
    written = 0
    skipped_no_polys = 0
    unmatched_counties_total = 0
    for slug, members in by_slug.items():
        polys = []
        unmatched_local = []
        for c in members:
            if not c["iso"]:
                unmatched_local.append(f"{c['county']} (state '{c['state_full']}' not mapped)")
                continue
            p = poly_index.get((c["iso"], c["norm"]))
            if p is None:
                unmatched_local.append(f"{c['county']} ({c['iso']})")
                continue
            polys.append(p)
        if not polys:
            skipped_no_polys += 1
            continue
        unmatched_counties_total += len(unmatched_local)
        # Dissolve into single MultiPolygon, simplify
        dissolved = unary_union(polys)
        simplified = dissolved.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
        feature = {
            "type": "Feature",
            "properties": {
                "slug": slug,
                "member_count": len(members),
                "matched_count": len(polys),
                "unmatched": unmatched_local,
                "source": "Overture Maps division_area (CC-BY 4.0)",
            },
            "geometry": mapping(simplified),
        }
        fc = {"type": "FeatureCollection", "features": [feature]}
        out_path = OUT_DIR / f"{slug}.geojson"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(fc, f, separators=(",", ":"))
        written += 1

    print()
    print("=== Summary ===")
    print(f"Metros written:                {written}")
    print(f"Metros skipped (no polygons):  {skipped_no_polys}")
    print(f"Total unmatched counties:      {unmatched_counties_total}")
    print(f"Output dir:                    {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
