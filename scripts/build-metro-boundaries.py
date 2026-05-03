"""
Multi-country metro boundary GeoJSON generator.

Reads:
  - Overture Maps division_area Parquet (filtered to US + CA + MX)
  - MetroAreas.xlsx Counties sheet (rows with Metro Area assignment)
  - public/data/metros.json (for slug resolution)

Writes:
  - public/data/metro-boundaries/{slug}.geojson (one per metro)

Reports unmatched Metro Areas + counties for editorial follow-up.

Dependencies:
  pip install geopandas openpyxl pyarrow

Run from project root:
  python scripts/build-metro-boundaries.py
  python scripts/build-metro-boundaries.py --verbose

Source Parquet path defaults to the user's local layout but is overridable
via the OVERTURE_DIVISION_AREA env var.

Editorial decisions baked in:

US:
1. VA / MD city-vs-county collisions: Fairfax County vs Fairfax (city),
   Baltimore County vs Baltimore. Keyed by (region, base, has_county_suffix).
2. DC: subtype=region, not subtype=county. Special branch routes
   type=Federal District lookups to it.
3. CT planning regions: " Planning Region" treated as a county-style
   admin suffix (CT abolished its 8 counties in 2022).
4. RI Washington County: aliased to Overture's colloquial "South County".
5. NH Coös County: ASCII-fold normalization.
6. NC Nash County: subtype=neighborhood mis-tag fallback.
7. James City / Charles City VA: " City" preserved as part of name.
8. Carson City NV: same — preserved as part of name.

CA:
9. Provincial admin systems vary widely. Census Division (AB/SK/MB/NL),
   County (NB/NS/PEI/ON), Regional District (BC), Regional Municipality
   (ON), District (ON), Region (NT/NU), United Counties (ON), Territory
   equivalent (QC). Suffixes and prefixes stripped to a common base.

MX:
10. 2,453 Municipios + 16 CDMX boroughs ("alcaldías"). All bare-named
    in Overture. ASCII-fold handles accents (Yucatán, Querétaro, etc.).
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
    r"C:\Users\ashwi\Desktop\Projects\MapData\north-america-division-area.parquet",
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

CA_STATE_TO_ISO = {
    "Alberta": "CA-AB", "British Columbia": "CA-BC", "Manitoba": "CA-MB",
    "New Brunswick": "CA-NB", "Newfoundland and Labrador": "CA-NL",
    "Newfoundland": "CA-NL", "Nova Scotia": "CA-NS", "Northwest Territories": "CA-NT",
    "Nunavut": "CA-NU", "Ontario": "CA-ON",
    "Prince Edward Island": "CA-PE", "Quebec": "CA-QC", "Québec": "CA-QC",
    "Saskatchewan": "CA-SK", "Yukon": "CA-YT",
}

MX_STATE_TO_ISO = {
    "Aguascalientes": "MX-AGU", "Baja California": "MX-BCN",
    "Baja California Sur": "MX-BCS", "Campeche": "MX-CAM",
    "Chiapas": "MX-CHP", "Chihuahua": "MX-CHH",
    "Mexico City": "MX-CMX", "Ciudad de México": "MX-CMX", "Distrito Federal": "MX-CMX",
    "Coahuila": "MX-COA", "Colima": "MX-COL", "Durango": "MX-DUR",
    "Guanajuato": "MX-GUA", "Guerrero": "MX-GRO", "Hidalgo": "MX-HID",
    "Jalisco": "MX-JAL", "México": "MX-MEX", "State of Mexico": "MX-MEX",
    "Mexico State": "MX-MEX", "Michoacán": "MX-MIC", "Michoacan": "MX-MIC",
    "Morelos": "MX-MOR", "Nayarit": "MX-NAY",
    "Nuevo León": "MX-NLE", "Nuevo Leon": "MX-NLE",
    "Oaxaca": "MX-OAX", "Puebla": "MX-PUE",
    "Querétaro": "MX-QUE", "Queretaro": "MX-QUE",
    "Quintana Roo": "MX-ROO",
    "San Luis Potosí": "MX-SLP", "San Luis Potosi": "MX-SLP",
    "Sinaloa": "MX-SIN", "Sonora": "MX-SON", "Tabasco": "MX-TAB",
    "Tamaulipas": "MX-TAM", "Tlaxcala": "MX-TLA",
    "Veracruz": "MX-VER", "Yucatán": "MX-YUC", "Yucatan": "MX-YUC",
    "Zacatecas": "MX-ZAC",
}

# Workbook Country column → state-to-ISO map
COUNTRY_TO_STATE_MAP = {
    "United States": US_STATE_TO_ISO,
    "Canada": CA_STATE_TO_ISO,
    "Mexico": MX_STATE_TO_ISO,
}

# County-style admin suffixes. Stripped during normalization. Presence is
# also used to distinguish suffixed counties (Fairfax County) from bare-name
# independent cities (Fairfax) within the same region.
COUNTY_SUFFIXES = (
    " County", " Counties", " Parish", " Borough", " Census Area",
    " Municipality", " Municipio", " Planning Region",
    # CA-specific:
    " Regional District", " Regional Municipality", " District Municipality",
    " United Counties", " Region", " Rural District", " District",
)

# CA-specific prefix patterns. Stripped to leave just the place name.
# "Rural Municipality of Stuartburn" -> "Stuartburn"
# "Village of Elnora" -> "Elnora"
# "Town of Grand Bay-Westfield" -> "Grand Bay-Westfield"
# "Regional Municipality of Niagara" -> "Niagara"
# "Municipality of the County of Richmond" -> "Richmond" (NS oddity)
# Prefix patterns to strip. Covers CA "Rural Municipality of X" /
# "Village of X" forms and MX "Municipio de X" form.
ADMIN_PREFIX_PATTERN = re.compile(
    r"^(rural municipality of|summer village of|regional municipality of|"
    r"municipio de|region of|"
    r"municipality of(?: the county of)?|village of|town of|city of|"
    r"district of|county of|"
    r"ville de|paroisse de)\s+",
    re.IGNORECASE,
)

# Editorial aliases for counties whose Overture name differs from the
# Counties sheet. RI Washington County is colloquially "South County".
COUNTY_ALIASES = {
    ("US-RI", "washington"): "south",
    # BC: Greater Vancouver Regional District is published by Overture as
    # "Metro Vancouver Regional District". Both names are in current use.
    ("CA-BC", "greater vancouver"): "metro vancouver",
    # QC: Workbook uses old MRC name; Overture uses current rebranded form.
    ("CA-QC", "le saguenay-et-son-fjord"): "le fjord-du-saguenay",
    # ON: Haldimand-Norfolk was split into separate counties in 2001;
    # Overture has just "Haldimand County" now.
    ("CA-ON", "haldimand-norfolk"): "haldimand",
    # MX: Fortín de las Flores is the formal name; workbook abbreviates.
    ("MX-VER", "fortin"): "fortin de las flores",
}


def has_county_suffix(name: str) -> bool:
    if not name:
        return False
    return any(name.endswith(s) for s in COUNTY_SUFFIXES)


def strip_admin_suffixes(name: str) -> str:
    """Strip County / Parish / Planning Region / Regional District / etc.
    Does NOT strip ' City' (some real names contain it: James City County
    VA, Carson City NV). City-suffixed workbook entries get pre-stripped
    in lookup based on the Type column.
    """
    if not name:
        return ""
    s = str(name).strip()
    # Try the longest suffixes first so " Regional Municipality" beats
    # " Municipality" when both could match.
    for suffix in sorted(COUNTY_SUFFIXES, key=len, reverse=True):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
            break
    return s


def strip_admin_prefixes(name: str) -> str:
    """Strip 'Rural Municipality of', 'Village of', etc. (CA patterns)."""
    return ADMIN_PREFIX_PATTERN.sub("", str(name).strip())


def normalize_base(name: str) -> str:
    # Strip trailing parenthetical / bracketed alt-names. Handles
    # MX "Benito Juárez (Cancún)", QC "L'Assomption (MRC)",
    # "Playas de Rosarito [Rosarito Beach]" (BCN), "X (← Y)" arrow notation.
    name = str(name)
    name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
    name = re.sub(r"\s*\[[^\]]*\]\s*$", "", name).strip()
    # Take everything before " / " separator. Handles ON "Greater Sudbury /
    # Grand Sudbury" by keeping the English form on the left side.
    if " / " in name:
        name = name.split(" / ", 1)[0].strip()
    s = strip_admin_suffixes(name)
    s = strip_admin_prefixes(s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.lower().replace(".", "").replace("'", "").replace("’", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"^saint\s+", "st ", s)
    s = re.sub(r"^sainte\s+", "ste ", s)
    s = re.sub(r"^fort\s+", "ft ", s)
    s = re.sub(r"^mount\s+", "mt ", s)
    s = re.sub(r"^(de|la|le|du|des)\s+", lambda m: m.group(1), s)
    return s


def strip_disambiguator(metro_name: str) -> str:
    return re.sub(r"\s*\([^)]*\)\s*$", "", metro_name).strip()


def load_overture(path):
    print(f"[1/5] Reading Overture Parquet: {path}")
    gdf = gpd.read_parquet(path, columns=["country", "subtype", "region", "names", "geometry"])
    nam = gdf[gdf["country"].isin(["US", "CA", "MX"])].copy()
    nam["primary"] = nam["names"].apply(lambda n: n.get("primary") if isinstance(n, dict) else None)
    nam = nam[nam["primary"].notna() & nam["region"].notna()].copy()

    counties = nam[nam["subtype"] == "county"].copy()
    counties["base"] = counties["primary"].apply(normalize_base)
    counties["has_suffix"] = counties["primary"].apply(has_county_suffix)
    print(f"      county-subtype rows (US/CA/MX): {len(counties):,}")

    poly_index = {}
    for _, row in counties.iterrows():
        key = (row["region"], row["base"], row["has_suffix"])
        poly_index.setdefault(key, row["geometry"])

    # Fallback: subtype=neighborhood rows with county-style suffix.
    # Catches Overture mis-tags like Nash County NC.
    fallback = nam[
        (nam["subtype"] == "neighborhood")
        & nam["primary"].apply(has_county_suffix)
    ].copy()
    fallback["base"] = fallback["primary"].apply(normalize_base)
    added = 0
    for _, row in fallback.iterrows():
        key = (row["region"], row["base"], True)
        if key not in poly_index:
            poly_index[key] = row["geometry"]
            added += 1
    print(f"      mis-tagged county-named neighborhoods recovered: {added}")

    # DC: only tagged subtype=region. Special-cased on lookup.
    dc_region = nam[(nam["region"] == "US-DC") & (nam["subtype"] == "region")]
    dc_poly = dc_region.iloc[0]["geometry"] if len(dc_region) > 0 else None
    print(f"      DC region polygon: {'found' if dc_poly is not None else 'MISSING'}")

    # Quebec amalgamated cities (Montréal, Laval, etc. tagged Type='Territory'
    # in workbook) are subtype=locality in Overture, not subtype=county.
    # Build a separate locality index scoped to CA-QC for fallback lookup.
    qc_locality = nam[(nam["region"] == "CA-QC") & (nam["subtype"] == "locality")].copy()
    qc_locality["base"] = qc_locality["primary"].apply(normalize_base)
    qc_locality_index = {}
    for _, row in qc_locality.iterrows():
        qc_locality_index.setdefault(row["base"], row["geometry"])
    print(f"      QC locality fallback index: {len(qc_locality_index)} entries")

    # Metro-level fallback locality index. Catches metros where the workbook
    # county doesn't exist in Overture but the metro lead-city does. Examples:
    # Calgary (workbook says "Division No. 6", Overture has "Calgary"
    # subtype=county), Bethel AK (workbook says "Bethel" type=Census Area,
    # Overture has "Bethel" subtype=locality).
    locality = nam[nam["subtype"] == "locality"].copy()
    locality["base"] = locality["primary"].apply(normalize_base)
    locality_index = {}
    for _, row in locality.iterrows():
        locality_index.setdefault((row["region"], row["base"]), row["geometry"])
    print(f"      locality fallback index: {len(locality_index):,} entries")

    return poly_index, dc_poly, qc_locality_index, locality_index


def load_counties_sheet(path):
    print(f"[2/5] Reading Counties sheet from {path}")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Counties"]
    rows = list(ws.iter_rows(values_only=True))
    out = []
    skipped_country = defaultdict(int)
    for r in rows[1:]:
        if not r:
            continue
        country = r[0]
        if country not in COUNTRY_TO_STATE_MAP:
            if country:
                skipped_country[country] += 1
            continue
        county = r[1]
        state_full = r[2]
        county_type = r[6]
        metro_area = r[7]
        if not (county and state_full and metro_area):
            continue
        state_map = COUNTRY_TO_STATE_MAP[country]
        out.append({
            "country": country,
            "county": str(county).strip(),
            "state_full": str(state_full).strip(),
            "type": str(county_type or "").strip(),
            "metro_display": str(metro_area).strip(),
            "norm": normalize_base(str(county).strip()),
            "iso": state_map.get(str(state_full).strip()),
        })
    print(f"      rows kept (US/CA/MX with metro): {len(out):,}")
    by_country = defaultdict(int)
    for c in out:
        by_country[c["country"]] += 1
    for k, v in by_country.items():
        print(f"        {k}: {v:,}")
    if skipped_country:
        print(f"      countries skipped (not yet supported):")
        for k, v in sorted(skipped_country.items(), key=lambda x: -x[1])[:10]:
            print(f"        {k}: {v}")
    return out


def load_metros_index(path):
    """Build (norm_name, country) -> slug index. Country is used as
    disambiguator so 'York' UK doesn't collide with 'York' (PA, US).
    """
    with open(path, "r", encoding="utf-8") as f:
        metros = json.load(f)
    idx = {}
    for m in metros:
        country = m.get("country", "")
        if country not in COUNTRY_TO_STATE_MAP:
            continue
        name_norm = strip_disambiguator(m.get("name", "")).lower().strip()
        state = m.get("primaryState") or ""
        idx[(name_norm, state, country)] = m["slug"]
        # Fallback: name + country (no state) for metros where state is missing
        idx.setdefault((name_norm, None, country), m["slug"])
    return idx


def resolve_slug(c, metros_index):
    base = strip_disambiguator(c["metro_display"]).lower().strip()
    return (
        metros_index.get((base, c["state_full"], c["country"]))
        or metros_index.get((base, None, c["country"]))
    )


def lookup_polygon(c, poly_index, dc_poly, qc_locality_index):
    iso = c["iso"]
    norm = c["norm"]
    type_l = c["type"].lower() if c["type"] else ""
    label = f"{c['county']} ({iso or '???'}, type={c['type']!r})"

    # DC special case
    if "federal district" in type_l or iso == "US-DC":
        if dc_poly is not None:
            return dc_poly, None
        return None, label + " [no DC region polygon]"

    if not iso:
        return None, label + " [state not in ISO map]"

    # QC amalgamated cities (Type='Territory'): consult locality index first.
    # These are single-city merged municipalities (Montréal, Laval, Longueuil,
    # Gatineau, Quebec, Lévis, Sherbrooke, etc.) that exist in Overture as
    # subtype=locality rather than subtype=county.
    if iso == "CA-QC" and "territory" in type_l:
        if norm in qc_locality_index:
            return qc_locality_index[norm], None

    # Editorial aliases (e.g. RI Washington -> South)
    alias_key = (iso, norm)
    if alias_key in COUNTY_ALIASES:
        norm = COUNTY_ALIASES[alias_key]

    is_city_type = type_l == "city"
    primary_key = (iso, norm, not is_city_type)
    fallback_key = (iso, norm, is_city_type)

    if primary_key in poly_index:
        return poly_index[primary_key], None
    if fallback_key in poly_index:
        return poly_index[fallback_key], None

    # type='City' fallback: try with " city" suffix stripped
    if is_city_type and norm.endswith(" city"):
        stripped = norm[: -len(" city")].strip()
        for k in [(iso, stripped, False), (iso, stripped, True)]:
            if k in poly_index:
                return poly_index[k], None

    return None, label


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    poly_index, dc_poly, qc_locality_index, locality_index = load_overture(SOURCE_PARQUET)
    counties = load_counties_sheet(WORKBOOK)
    metros_index = load_metros_index(METROS_JSON)

    print("[3/5] Grouping by metro slug")
    by_slug = defaultdict(list)
    unmatched_metros = set()
    for c in counties:
        slug = resolve_slug(c, metros_index)
        if slug is None:
            unmatched_metros.add(f"{c['metro_display']} ({c['country']})")
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
    skipped_metros = []
    unmatched_total = 0
    metro_fallback_count = 0
    for slug, members in by_slug.items():
        polys = []
        unmatched_local = []
        for c in members:
            geom, fail = lookup_polygon(c, poly_index, dc_poly, qc_locality_index)
            if geom is not None:
                polys.append(geom)
            if fail:
                unmatched_local.append(fail)

        # Metro-level fallback: when no member counties match, try the metro's
        # display name as a county or locality lookup. Catches CA Census
        # Divisions (Calgary, Edmonton, Saskatoon, etc.) that don't exist in
        # Overture but where the lead city does.
        if not polys and members:
            iso = members[0]["iso"]
            metro_display = members[0]["metro_display"]
            if iso and metro_display:
                norm_metro = normalize_base(strip_disambiguator(metro_display))
                # Try county index in both has-suffix flavors
                fallback_geom = None
                for k in [(iso, norm_metro, True), (iso, norm_metro, False)]:
                    if k in poly_index:
                        fallback_geom = poly_index[k]
                        break
                # Try locality index
                if fallback_geom is None:
                    fallback_geom = locality_index.get((iso, norm_metro))
                if fallback_geom is not None:
                    polys.append(fallback_geom)
                    metro_fallback_count += 1
                    # Replace per-member misses with a single "recovered" note
                    # so the boundary file's unmatched array reads cleanly.
                    unmatched_local = [f"[recovered via metro-name fallback: {metro_display}]"]

        if not polys:
            skipped += 1
            skipped_metros.append((slug, members[0]["metro_display"] if members else "?", members[0]["country"] if members else "?"))
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
    print(f"  via metro-name fallback:     {metro_fallback_count}")
    print(f"Metros skipped (no polygons):  {skipped}")
    print(f"Total unmatched counties:      {unmatched_total}")
    print(f"Output dir:                    {OUT_DIR.resolve()}")
    if skipped_metros and "--verbose" in sys.argv:
        print("\nSkipped metros:")
        for slug, display, country in skipped_metros:
            print(f"  {slug:40s} ({country}) - {display}")


if __name__ == "__main__":
    main()
