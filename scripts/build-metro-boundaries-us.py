"""
US metro boundary GeoJSON generator.

Reads:
  - Overture Maps division_area Parquet (filtered to US counties + DC region)
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

Editorial decisions baked in:

1. Virginia / Maryland city-vs-county collisions. VA has 41 independent
   cities tagged subtype=county in Overture (matches FIPS). Some collide
   on bare name with a same-named county: Fairfax County vs Fairfax (city),
   Franklin / Richmond / Roanoke. Maryland has the same shape with
   Baltimore (city, no suffix) vs Baltimore County. The script keys
   Overture rows on (region, base_name, has_county_suffix) so these
   distinguish; the Counties sheet's Type column ("County" vs "City")
   chooses which bucket to look up.

2. District of Columbia. DC has no subtype=county row in Overture; it
   appears as subtype=region with primary "District of Columbia". The
   Counties sheet rows it as type="Federal District" with name "Washington".
   A special branch routes Federal District lookups to the DC region polygon.

3. Connecticut planning regions. CT abolished its 8 traditional counties
   in 2022. Both the Counties sheet (rows tagged type="Planning Region")
   and Overture (subtype=county with " Planning Region" name suffix)
   carry the new regions. The script treats " Planning Region" as just
   another county-style admin suffix; that's enough to make the join
   work without any hardcoded crosswalk.
"""

import os
import json
import re
import sys
import unicodedata
from pathlib import Path
from collections import defaultdict

import geopandas as gpd
import openpyxl
from shapely.ops import unary_union
from shapely.geometry import mapping

SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\us-conus-division-area.parquet",
)
WORKBOOK = "MetroAreas.xlsx"
METROS_JSON = "public/data/metros.json"
OUT_DIR = Path("public/data/metro-boundaries")

SIMPLIFY_TOLERANCE_DEG = 0.005

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

# County-style admin suffixes. Stripped during normalization; presence is
# also used to distinguish Fairfax County (with suffix) from Fairfax (the
# Virginia independent city, without suffix).
COUNTY_SUFFIXES = (
    " County", " Parish", " Borough", " Census Area",
    " Municipality", " Municipio", " Planning Region",
)

# Editorial aliases for counties whose Overture name differs from the
# Counties sheet. RI Washington County is colloquially "South County" and
# Overture chose the colloquial form.
COUNTY_ALIASES = {
    ("US-RI", "washington"): "south",
}


def has_county_suffix(name: str) -> bool:
    if not name:
        return False
    return any(name.endswith(s) for s in COUNTY_SUFFIXES)


def strip_admin_suffixes(name: str) -> str:
    """Strip County / Parish / Planning Region / etc. Does NOT strip ' City'
    because some real county names contain it (James City County VA,
    Charles City County VA). City-suffixed workbook entries get pre-stripped
    in load_counties_sheet based on the Type column instead.
    """
    if not name:
        return ""
    s = str(name).strip()
    for suffix in COUNTY_SUFFIXES:
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
            break
    return s


def normalize_base(name: str) -> str:
    s = strip_admin_suffixes(name)
    # ASCII-fold so Coös matches Coos (NH), Doña Ana matches Dona Ana (NM).
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower().replace(".", "").replace("'", "").replace("’", "")
    s = re.sub(r"\s+", " ", s).strip()
    # Canonicalize abbreviation pairs that diverge across data sources.
    s = re.sub(r"^saint\s+", "st ", s)
    s = re.sub(r"^sainte\s+", "ste ", s)
    s = re.sub(r"^fort\s+", "ft ", s)
    s = re.sub(r"^mount\s+", "mt ", s)
    # Collapse French-origin compound prefixes that diverge in spacing:
    # "De Witt" / "DeWitt", "La Salle" / "LaSalle", etc.
    s = re.sub(r"^(de|la|le|du|des)\s+", lambda m: m.group(1), s)
    return s


def strip_disambiguator(metro_name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", metro_name).strip()


def load_overture(path):
    print(f"[1/5] Reading Overture Parquet: {path}")
    gdf = gpd.read_parquet(path, columns=["country", "subtype", "region", "names", "geometry"])
    us = gdf[gdf["country"] == "US"].copy()
    us["primary"] = us["names"].apply(lambda n: n.get("primary") if isinstance(n, dict) else None)
    us = us[us["primary"].notna() & us["region"].notna()].copy()

    counties = us[us["subtype"] == "county"].copy()
    counties["base"] = counties["primary"].apply(normalize_base)
    counties["has_suffix"] = counties["primary"].apply(has_county_suffix)
    print(f"      US county-subtype rows: {len(counties)}")

    poly_index = {}
    for _, row in counties.iterrows():
        key = (row["region"], row["base"], row["has_suffix"])
        # First-write-wins: rare duplicate Overture rows (e.g. MD Baltimore
        # County appears twice) shouldn't multiply geometry in the dissolve.
        poly_index.setdefault(key, row["geometry"])

    # Fallback: county-name-suffixed neighborhood rows. Overture mis-tags
    # some real counties (e.g. Nash County NC) as subtype=neighborhood.
    # Only fills keys the primary county index doesn't already cover.
    fallback = us[
        (us["subtype"] == "neighborhood")
        & us["primary"].apply(has_county_suffix)
    ].copy()
    fallback["base"] = fallback["primary"].apply(normalize_base)
    added = 0
    for _, row in fallback.iterrows():
        key = (row["region"], row["base"], True)
        if key not in poly_index:
            poly_index[key] = row["geometry"]
            added += 1
    print(f"      mis-tagged county-named neighborhoods recovered: {added}")

    dc_region = us[(us["region"] == "US-DC") & (us["subtype"] == "region")]
    dc_poly = dc_region.iloc[0]["geometry"] if len(dc_region) > 0 else None
    print(f"      DC region polygon: {'found' if dc_poly is not None else 'MISSING'}")

    return poly_index, dc_poly


def load_counties_sheet(path):
    print(f"[2/5] Reading Counties sheet from {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Counties"]
    rows = list(ws.iter_rows(values_only=True))
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
            "type": str(county_type or "").strip(),
            "metro_display": str(metro_area).strip(),
            "norm": normalize_base(str(county).strip()),
            "iso": US_STATE_TO_ISO.get(str(state_full).strip()),
        })
    print(f"      US rows with metro assignment: {len(out)}")
    return out


def load_metros_index(path):
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    for m in metros:
        if m.get("country") != "United States":
            continue
        name_norm = strip_disambiguator(m.get("name", "")).lower().strip()
        state = m.get("primaryState") or ""
        idx[(name_norm, state)] = m["slug"]
        idx.setdefault((name_norm, None), m["slug"])
    return idx


def resolve_slug(metro_display, state_full, metros_index):
    base = strip_disambiguator(metro_display).lower().strip()
    return metros_index.get((base, state_full)) or metros_index.get((base, None))


def lookup_polygon(c, poly_index, dc_poly):
    """Resolve a Counties-sheet row to a polygon. Returns (geom_or_None, fail_label_or_None)."""
    iso = c["iso"]
    norm = c["norm"]
    type_l = c["type"].lower() if c["type"] else ""
    label = f"{c['county']} ({iso or '???'}, type={c['type']!r})"

    # Federal District (DC)
    if "federal district" in type_l or iso == "US-DC":
        if dc_poly is not None:
            return dc_poly, None
        return None, label + " [no DC region polygon]"

    if not iso:
        return None, label + " [state not in ISO map]"

    # Apply editorial alias when workbook name differs from Overture's.
    alias_key = (iso, norm)
    if alias_key in COUNTY_ALIASES:
        norm = COUNTY_ALIASES[alias_key]

    # City vs County disambiguation. type='City' usually means an independent
    # city (Baltimore City MD, Alexandria VA), where Overture stores a bare
    # name with no " County" suffix. Try the bare key first.
    is_city_type = type_l == "city"
    primary_key = (iso, norm, not is_city_type)
    fallback_key = (iso, norm, is_city_type)

    if primary_key in poly_index:
        return poly_index[primary_key], None
    if fallback_key in poly_index:
        return poly_index[fallback_key], None

    # If type='City' and the workbook name ends with " city" (e.g. "Baltimore
    # City"), retry with " city" stripped — Overture stores the bare form
    # ("Baltimore"). But places where "City" is actually part of the name
    # (Carson City NV is the canonical example) match the unstripped form
    # above and skip this branch entirely.
    if is_city_type and norm.endswith(" city"):
        stripped = norm[: -len(" city")].strip()
        for k in [(iso, stripped, False), (iso, stripped, True)]:
            if k in poly_index:
                return poly_index[k], None

    return None, label


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    poly_index, dc_poly = load_overture(SOURCE_PARQUET)
    counties = load_counties_sheet(WORKBOOK)
    metros_index = load_metros_index(METROS_JSON)

    print("[3/5] Grouping by metro slug")
    by_slug = defaultdict(list)
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

    print("[4/5] Resolving polygons + dissolving per metro")
    written = 0
    skipped = 0
    unmatched_total = 0
    for slug, members in by_slug.items():
        polys = []
        unmatched_local = []
        for c in members:
            geom, fail = lookup_polygon(c, poly_index, dc_poly)
            if geom is not None:
                polys.append(geom)
            if fail:
                unmatched_local.append(fail)
        if not polys:
            skipped += 1
            continue
        unmatched_total += len(unmatched_local)
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
        with open(OUT_DIR / f"{slug}.geojson", "w", encoding="utf-8") as f:
            json.dump(fc, f, separators=(",", ":"))
        written += 1

    print()
    print("[5/5] Done")
    print("=== Summary ===")
    print(f"Metros written:                {written}")
    print(f"Metros skipped (no polygons):  {skipped}")
    print(f"Total unmatched counties:      {unmatched_total}")
    print(f"Output dir:                    {OUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
