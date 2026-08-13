#!/usr/bin/env python3
"""load_population_series.py - annual population by country into Supabase.

WHY. Almost every number the site publishes is a total, and totals mostly rank
countries by how many people they contain. Market capitalisation, Fortune 500
employers, championships, skyscrapers: divide any of them by population and the
board reorders into something that is actually about a place rather than about
its size. Population is the denominator that makes the rest of the data mean
something.

TWO TABLES, ON PURPOSE. The World Bank's indicator endpoints hand back
aggregates (WLD, EUU, ARB, the income groups) sitting alongside real countries,
every one of them wearing a three-letter code that looks exactly like an ISO3.
Anything computing a per-capita figure has to exclude them, and a hardcoded
skip-list copied into each consumer is precisely how "World" ends up top of a
leaderboard. So the classification lives once, in wb_entity, sourced from the
World Bank's own country endpoint: region.id == "NA" is its marker for an
aggregate. That table also serves country_cpi and anything else keyed on ISO3.

SP.POP.TOTL starts in 1960 and that is a hard floor for this indicator. Longer
history needs a different source (Maddison, HYDE, Gapminder) with its own
awkward reconciliation of modern borders against historical ones; that is
deliberately not this script's problem.

usage:
  python scripts/business/load_population_series.py --self-test
  python scripts/business/load_population_series.py --dry
  python scripts/business/load_population_series.py
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log, CHUNK  # noqa: E402

WB = "https://api.worldbank.org/v2"
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"
WB_SOURCE = "World Bank SP.POP.TOTL"

# Taiwan is the one country this loader has to source elsewhere. The World Bank
# does not report it, for reasons that are political rather than statistical,
# and it is not a country this site can leave blank: 116 tracked companies and
# tenth in the world by market cap, so every per-head figure it appears in would
# be missing its most interesting entrant.
#
# UN World Population Prospects, served through Our World in Data's grapher CSV
# (CC BY), is the standard substitute and covers 1950 onward.
#
# ESTIMATES ONLY. OWID's projection column runs 2024-2100 and would let Taiwan's
# series end in 2025 like everyone else's. It is not used. Splicing a forecast
# onto a history and labelling the result "population" is the same quiet lie as
# an unmarked source seam, and this hub spent the day refusing to tell it.
# Taiwan's series therefore ends in 2023 and says so.
TAIWAN = {
    "iso3": "TWN",
    "url": ("https://ourworldindata.org/grapher/population.csv"
            "?v=1&csvType=full&useColumnShortNames=true&country=~TWN"),
    "source": "UN World Population Prospects via Our World in Data (CC BY)",
    "from_year": 1960,
}


def _get(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def fetch_entities():
    """The World Bank's own catalogue of what each code is."""
    payload = _get(f"{WB}/country?format=json&per_page=400")
    hdr = payload[0]
    if hdr.get("pages", 1) > 1:
        raise SystemExit(f"FATAL: /country now spans {hdr['pages']} pages; add paging.")
    return payload[1] or []


def parse_entities(rows):
    out = []
    for r in rows:
        iso3 = (r.get("id") or "").strip()
        if len(iso3) != 3:
            continue
        region = ((r.get("region") or {}).get("value") or "").strip()
        # "NA" is the World Bank's own marker that a row is an aggregate rather
        # than a country. Trusting their classification beats maintaining ours.
        agg = ((r.get("region") or {}).get("id") or "").strip() == "NA"

        def num(v):
            try:
                return round(float(v), 5)
            except (TypeError, ValueError):
                return None

        out.append({
            "iso3": iso3,
            "name": (r.get("name") or iso3).strip(),
            "region": region or None,
            "income_level": ((r.get("incomeLevel") or {}).get("value") or "").strip() or None,
            "capital": (r.get("capitalCity") or "").strip() or None,
            "lat": num(r.get("latitude")),
            "lon": num(r.get("longitude")),
            "is_aggregate": agg,
        })
    return out


def fetch_pop():
    payload = _get(f"{WB}/country/all/indicator/SP.POP.TOTL?format=json&per_page=25000&page=1")
    hdr = payload[0]
    if hdr.get("pages", 1) > 1:
        raise SystemExit(f"FATAL: World Bank now paginates SP.POP.TOTL ({hdr['pages']} pages); "
                         "this loader assumes one page. Add paging.")
    return payload[1] or []


def parse_pop(rows):
    """-> [{iso3, year, population}]. Population is stored as an integer: the
    World Bank reports whole people and a float would silently lose precision
    somewhere above 2^53 people, which is not a real risk but a bigint costs
    nothing and removes the question."""
    out = []
    for r in rows:
        v, iso3, yr = r.get("value"), (r.get("countryiso3code") or "").strip(), r.get("date")
        if v is None or len(iso3) != 3 or not yr:
            continue
        try:
            n = int(round(float(v)))
        except (TypeError, ValueError):
            continue
        if n <= 0:
            continue
        out.append({"iso3": iso3, "year": int(yr), "population": n,
                    "source": WB_SOURCE})
    return out


def fetch_taiwan():
    """Taiwan from UN WPP estimates. Returns the same row shape, so it upserts
    through exactly the same path and cannot drift into a special case."""
    import csv, io
    req = urllib.request.Request(TAIWAN["url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = r.read().decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise SystemExit("FATAL: OWID returned no rows for Taiwan.")
    col = next((c for c in rows[0] if c.startswith("population")), None)
    if not col:
        raise SystemExit(f"FATAL: no population column for Taiwan; got {list(rows[0])}.")
    out = []
    for r in rows:
        if (r.get("code") or "").strip() != TAIWAN["iso3"]:
            continue
        try:
            y, v = int(r["year"]), int(float(r[col] or 0))
        except (TypeError, ValueError):
            continue
        if y < TAIWAN["from_year"] or v <= 0:
            continue
        out.append({"iso3": TAIWAN["iso3"], "year": y, "population": v,
                    "source": TAIWAN["source"]})
    if len(out) < 50:
        raise SystemExit(f"FATAL: only {len(out)} Taiwan years from {TAIWAN['from_year']}; "
                         "expected 60+. OWID changed the dataset.")
    return out


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    ents = parse_entities(fetch_entities())
    aggs = [e for e in ents if e["is_aggregate"]]
    log(f"wb_entity: {len(ents)} codes · {len(ents) - len(aggs)} countries · {len(aggs)} aggregates"
        + (" (DRY RUN)" if dry else ""))
    log("  aggregates include: " + ", ".join(e["iso3"] for e in aggs[:12]))

    rows = parse_pop(fetch_pop())
    twn = fetch_taiwan()
    log(f"  Taiwan: {len(twn)} years {twn[0]['year']}-{twn[-1]['year']} "
        f"({twn[-1]['population']:,}) from {TAIWAN['source']}; "
        "estimates only, no projections")
    if any(r["iso3"] == TAIWAN["iso3"] for r in rows):
        raise SystemExit("FATAL: the World Bank now reports TWN. Remove the substitute "
                         "before both sources fight over the same primary key.")
    rows += twn
    if not any(e["iso3"] == TAIWAN["iso3"] for e in ents):
        # wb_entity is the name and aggregate lookup for everything downstream,
        # so a country present in country_population but absent here would join
        # to nothing and silently lose its name and its rank.
        ents.append({"iso3": "TWN", "name": "Taiwan", "region": "East Asia & Pacific",
                     "income_level": "High income", "capital": "Taipei",
                     "lat": 25.0330, "lon": 121.5654, "is_aggregate": False})
    known = {e["iso3"] for e in ents}
    orphan = sorted({r["iso3"] for r in rows} - known)
    years = sorted({r["year"] for r in rows})
    log(f"country_population: {len(rows):,} observations · "
        f"{len({r['iso3'] for r in rows})} codes · {years[0]}-{years[-1]}")
    if orphan:
        # Not fatal: a code the indicator knows and the catalogue does not is
        # still real data. But it would join to nothing, so it must be visible.
        log(f"  WARNING {len(orphan)} code(s) absent from wb_entity: {orphan[:12]}")

    for probe in ("WLD", "CHN", "IND", "USA", "NGA"):
        s = sorted([r for r in rows if r["iso3"] == probe], key=lambda r: r["year"])
        if not s:
            continue
        a, b = s[0], s[-1]
        log(f"  {probe}: {a['year']} {a['population']:>14,} .. {b['year']} {b['population']:>14,}"
            f"  ({b['population'] / a['population']:.2f}x)")

    if dry:
        return 0

    key = service_key()
    for i in range(0, len(ents), CHUNK):
        rest("POST", "/rest/v1/wb_entity", body=ents[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(ents)} rows into wb_entity")
    for i in range(0, len(rows), CHUNK):
        rest("POST", "/rest/v1/country_population", body=rows[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(rows):,} rows into country_population")
    return 0


ENT_FIXTURE = [
    {"id": "USA", "name": "United States", "region": {"id": "NAC", "value": "North America"},
     "incomeLevel": {"value": "High income"}, "capitalCity": "Washington D.C.",
     "latitude": "38.8895", "longitude": "-77.032"},
    {"id": "WLD", "name": "World", "region": {"id": "NA", "value": "Aggregates"},
     "incomeLevel": {"value": "Aggregates"}, "capitalCity": "",
     "latitude": "", "longitude": ""},
    {"id": "XK", "name": "too short", "region": {"id": "ECS", "value": "Europe"}},
]

POP_FIXTURE = [
    {"countryiso3code": "USA", "date": "1960", "value": 180671000},
    {"countryiso3code": "USA", "date": "2025", "value": 342034432.0},
    {"countryiso3code": "USA", "date": "2026", "value": None},
    {"countryiso3code": "", "date": "2024", "value": 8000000000},   # aggregate with no code
    {"countryiso3code": "WLD", "date": "2024", "value": 8161972572},
]


def self_test():
    ents = parse_entities(ENT_FIXTURE)
    assert len(ents) == 2, ents
    usa = next(e for e in ents if e["iso3"] == "USA")
    wld = next(e for e in ents if e["iso3"] == "WLD")
    assert usa["is_aggregate"] is False and wld["is_aggregate"] is True, (usa, wld)
    assert usa["lat"] == 38.8895 and usa["capital"] == "Washington D.C.", usa
    assert wld["capital"] is None and wld["lat"] is None, "blank strings must become NULL"

    pop = parse_pop(POP_FIXTURE)
    assert len(pop) == 3, pop
    assert {"iso3": "USA", "year": 1960, "population": 180671000,
            "source": WB_SOURCE} in pop, pop
    assert all(r["source"] == WB_SOURCE for r in pop), (
        "every World Bank row must carry its source, so Taiwan's substitute is "
        "distinguishable in the data rather than only in a comment")
    assert all(isinstance(r["population"], int) for r in pop), "population must be integral"
    assert not any(r["iso3"] == "" for r in pop), "a blank code is an aggregate row, drop it"
    # the join that makes any per-capita figure correct
    agg = {e["iso3"] for e in ents if e["is_aggregate"]}
    countries = [r for r in pop if r["iso3"] not in agg]
    assert {r["iso3"] for r in countries} == {"USA"}, countries
    print("self-test: 10/10 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
