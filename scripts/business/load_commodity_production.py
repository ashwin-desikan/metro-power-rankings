#!/usr/bin/env python3
"""load_commodity_production.py - who actually produces the stuff, by year.

WHY. /business/markets/[symbol] currently answers "what did this cost", which
is the shallower half of the question. The site's subject is geography, and a
price chart with no producers on it is a finance page wearing our layout. Oil
production by country from 1900 carries the century's actual story: the United
States making two thirds of the world's oil in 1945, losing the lead to the
Soviet Union, and taking it back through shale after 2010.

SOURCE. Our World in Data's grapher CSVs, CC BY 4.0, built on the Energy
Institute Statistical Review and the US EIA. 1900 to 2025, by country.
Probed and rejected 2026-08-13 for the metals (gold, silver, copper):
  - World Mining Data XLS endpoints: 404, only the PDFs survive
  - USGS ScienceBase per-commodity releases: read timeout, then HTTP 503
  - USGS historical global statistics: six commodities, none of them precious,
    and copper ends in 2011
So this loads oil and gas only. That is deliberate: three commodity pages get a
properly sourced 125-year production section and three get nothing, which is
better than all six getting a five-year window from a source with no stated
terms of use.

AGGREGATES. OWID mixes continents, OPEC and the world into the same entity
column as countries. Their codes make this cheap to separate: a real country
has a 3-letter ISO3 code, an aggregate has an OWID_-prefixed one. The world
total is kept, under the reserved key 'WLD', because every share on the page
divides by it and recomputing it from the countries present would quietly
exclude whatever OWID reports only at the aggregate level.

usage:
  python scripts/business/load_commodity_production.py --self-test
  python scripts/business/load_commodity_production.py --dry
  python scripts/business/load_commodity_production.py
"""
import csv, io, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log, CHUNK  # noqa: E402

UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"
GRAPHER = ("https://ourworldindata.org/grapher/{slug}.csv"
           "?v=1&csvType=full&useColumnShortNames=true")

# commodity key -> (OWID grapher slug, value column, unit)
SETS = {
    "oil": ("oil-production-by-country", "oil_production_twh", "TWh"),
    "gas": ("gas-production-by-country", "gas_production_twh", "TWh"),
}

# OWID's own code for the world total, mapped onto the ISO3-ish key the rest of
# the site uses for it.
OWID_WORLD = "OWID_WRL"
WORLD = "WLD"


def fetch(slug):
    req = urllib.request.Request(GRAPHER.format(slug=slug), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        text = r.read().decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise SystemExit(f"FATAL: OWID returned no rows for {slug}.")
    # Columns are lower-case short names. If OWID switches back to title case
    # this silently yields zero rows, so assert instead of discovering it later.
    missing = {"entity", "code", "year"} - set(rows[0])
    if missing:
        raise SystemExit(f"FATAL: {slug} is missing {sorted(missing)}; got {list(rows[0])}. "
                         "Drop useColumnShortNames or fix the column names.")
    return rows


def parse(rows, commodity, col, unit):
    """-> [{commodity, iso3, year, value, unit}], countries plus the world."""
    if col not in rows[0]:
        raise SystemExit(f"FATAL: column {col!r} absent; got {list(rows[0])}.")
    out = []
    for r in rows:
        code = (r.get("code") or "").strip()
        if code == OWID_WORLD:
            iso3 = WORLD
        elif len(code) == 3 and not code.startswith("OWID"):
            iso3 = code
        else:
            continue  # continents, OPEC, income groups, unattributed regions
        try:
            year, value = int(r["year"]), float(r[col] or 0)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue  # a zero is "did not produce", not information worth storing
        out.append({"commodity": commodity, "iso3": iso3, "year": year,
                    "value": round(value, 4), "unit": unit})
    return out


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    allrows = []
    for commodity, (slug, col, unit) in SETS.items():
        rows = parse(fetch(slug), commodity, col, unit)
        years = sorted({r["year"] for r in rows})
        isos = {r["iso3"] for r in rows} - {WORLD}
        log(f"{commodity}: {len(rows):,} observations · {len(isos)} countries · "
            f"{years[0]}-{years[-1]}" + (" (DRY RUN)" if dry else ""))

        last = max(years)
        world = next((r["value"] for r in rows if r["iso3"] == WORLD and r["year"] == last), None)
        cur = sorted([r for r in rows if r["year"] == last and r["iso3"] != WORLD],
                     key=lambda r: -r["value"])[:6]
        if world:
            log("  " + str(last) + " leaders: " + ", ".join(
                f"{r['iso3']} {r['value'] / world * 100:.1f}%" for r in cur))
            covered = sum(r["value"] for r in rows if r["year"] == last and r["iso3"] != WORLD)
            # Countries will not sum to the world total, because OWID reports
            # some output only in regional aggregates. Say by how much rather
            # than let a page imply the country list is exhaustive.
            log(f"  named countries cover {covered / world * 100:.1f}% of the {last} world total")
        else:
            log(f"  WARNING no world total for {last}; page shares would be unavailable")
        allrows += rows

    if dry:
        return 0

    key = service_key()
    for i in range(0, len(allrows), CHUNK):
        rest("POST", "/rest/v1/commodity_production", body=allrows[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(allrows):,} rows into commodity_production")
    return 0


FIXTURE = [
    {"entity": "United States", "code": "USA", "year": "2024", "oil_production_twh": "8000.5"},
    {"entity": "World", "code": OWID_WORLD, "year": "2024", "oil_production_twh": "50000"},
    {"entity": "Africa", "code": "", "year": "2024", "oil_production_twh": "4000"},
    {"entity": "OPEC", "code": "OWID_OPC", "year": "2024", "oil_production_twh": "17000"},
    {"entity": "Ireland", "code": "IRL", "year": "2024", "oil_production_twh": "0"},
    {"entity": "Norway", "code": "NOR", "year": "1900", "oil_production_twh": ""},
]


def self_test():
    got = parse(FIXTURE, "oil", "oil_production_twh", "TWh")
    keys = {(r["iso3"], r["year"]) for r in got}
    assert keys == {("USA", 2024), ("WLD", 2024)}, got
    assert not any(r["iso3"].startswith("OWID") for r in got), "an OWID_ code is an aggregate"
    assert not any(r["iso3"] == "" for r in got), "a blank code is a region, not a country"
    usa = next(r for r in got if r["iso3"] == "USA")
    wld = next(r for r in got if r["iso3"] == WORLD)
    assert usa["value"] == 8000.5 and usa["unit"] == "TWh", usa
    # the share calculation every page cell depends on
    assert round(usa["value"] / wld["value"] * 100, 1) == 16.0
    try:
        parse(FIXTURE, "oil", "nope_twh", "TWh")
        raise AssertionError("a renamed value column must stop the load, not emit zero rows")
    except SystemExit:
        pass
    print("self-test: 7/7 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
