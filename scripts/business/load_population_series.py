#!/usr/bin/env python3
"""load_population_series.py - annual population by country into Supabase.

WHY. Almost every number the site publishes is a total, and totals mostly rank
countries by how many people they contain. Market capitalisation, Fortune 500
employers, championships, skyscrapers: divide any of them by population and the
board reorders into something that is actually about a place rather than about
its size. Population is the denominator that makes the rest of the data mean
something.

WHY OWID AND NOT THE WORLD BANK (changed 2026-08-14). SP.POP.TOTL starts in
1960, and 1960 is not a historical floor, it is an administrative one: it is
when the World Bank started collecting, not when the data runs out. Our World
in Data publishes a single reconciled series that is UN World Population
Prospects from 1950, Gapminder v7 for 1800-1949 and HYDE 3.3 before that, all
of it stated on TODAY'S borders, under CC BY. Taking it whole buys 160 extra
years of annual history for one source swap, and it buys them with ONE
provenance story instead of a splice this repo would have had to own itself.

THREE THINGS THAT FELL OUT OF THE SWAP, none of them incidental:
  1. Taiwan stops being a special case. The World Bank does not report it, for
     reasons that are political rather than statistical, so this loader used to
     carry a separate OWID fetch just for TWN. OWID's own series covers it like
     everyone else, so the substitute is gone rather than ported. The guard
     against the World Bank suddenly reporting TWN went with it.
  2. Defunct states arrive free. OWID ships the USSR, Yugoslavia,
     Czechoslovakia, both Germanies, both Yemens and Serbia and Montenegro as
     entities in their own right, and they RECONCILE: USSR 1989 is 289,122,632
     and the sum of its fifteen successors that year is 289,122,632, to the
     person. That is not a coincidence, it is what "stated on today's borders"
     means, and it is what lets a polity view and a country view sit on the
     same page without ever contradicting each other.
  3. Estimates and projections are now different KINDS, not different sources.
     UN WPP's estimates stop at 2023 and everything after is a projection.
     Rather than lose 2024-2025 (Ashwin's call, 2026-08-14) or splice the World
     Bank's own forward numbers onto a WPP series, both come from the same OWID
     file: `population_historical` for 1800-2023 and
     `population_projection__projected` for 2024-2025, tagged `kind`. One
     publisher, one fetch, and the estimate/projection boundary is DATA the
     page can act on rather than a comment nobody can enforce.

     This is not a downgrade on the World Bank numbers it replaces. The old
     self-test fixture in this file carried the World Bank's world total for
     2024 as 8,161,972,572; OWID's UN WPP projection for the same year is
     8,161,972,574. Two people apart, because the World Bank's recent years
     were largely WPP-derived anyway. The difference is that these ones say so.

WHY 1800 IS THE FLOOR HERE. OWID's file reaches 10,000 BCE, but only 41 sparse
steps sit below 1800 (millennia, then centuries, then a scatter of 1555/1640/
1785/1788) while 1800-2023 is 224 contiguous annual years. Everything
downstream assumes an annual series: peak detection, growth multiples, the
chart's x-axis. Loading the sparse tail would silently corrupt all three, so
the floor is 1800 and the deep tail is a separate problem for a separate page.

TWO TABLES, ON PURPOSE. OWID hands back aggregates (World, the continents, the
income groups, EU27) wearing codes that sit alongside real ones. Anything
computing a per-capita figure has to exclude them, and a hardcoded skip-list
copied into each consumer is precisely how "World" ends up top of a
leaderboard. So the classification lives once, in wb_entity, which also still
serves country_cpi and anything else keyed on ISO3.

usage:
  python scripts/business/load_population_series.py --self-test
  python scripts/business/load_population_series.py --dry
  python scripts/business/load_population_series.py
"""
import csv, io, json, os, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log, CHUNK  # noqa: E402

WB = "https://api.worldbank.org/v2"
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"

OWID_URL = ("https://ourworldindata.org/grapher/population-with-projections.csv"
            "?v=1&csvType=full&useColumnShortNames=true")
OWID_SOURCE = ("Our World in Data population (CC BY): UN WPP 2024 from 1950, "
               "Gapminder v7 1800-1949, HYDE 3.3 earlier; today's borders")

# The two value columns in that file. Their year ranges do not overlap, which
# is asserted below rather than assumed: if OWID ever extends the estimates
# past 2023 the overlap would otherwise be resolved by dict-insertion order.
COL_ESTIMATE = "population_historical"
COL_PROJECTION = "population_projection__projected"

# The floor. See the module docstring: below this OWID's steps stop being
# annual and every downstream derivation that assumes one year per point
# (peak, multiple, the chart axis) would quietly start lying.
FROM_YEAR = 1800

# The ceiling. OWID's projection column runs to 2100 and loading all of it
# would put 75 years of forecast behind a chart captioned "population". Two
# years is what the World Bank used to supply and what the site already showed.
TO_YEAR = 2025

WORLD = "WLD"

# Codes OWID spells differently from the ISO3 the rest of this site keys on.
# Not cosmetic: country-indicators.json gives Kosovo the World Bank's XKX, so
# loading it as OWID_KOS would leave the slug joining to nothing and blank the
# population section on a live country page. Found by diffing the old table
# against the new one, not by reading, which is the argument for doing that
# diff before any source swap.
OWID_RENAME = {
    "OWID_WRL": WORLD,   # share-of-world denominator; every consumer knows WLD
    "OWID_KOS": "XKX",   # Kosovo
}

# Aggregates: real rows, real numbers, but not countries. Listed explicitly
# rather than pattern-matched on the OWID_ prefix, because that prefix is ALSO
# worn by Kosovo, Akrotiri and Dhekelia and every defunct state below. A prefix
# test here would have silently deleted the USSR.
OWID_AGGREGATES = {
    "OWID_AFR", "OWID_ASI", "OWID_EUR", "OWID_NAM", "OWID_OCE", "OWID_SAM",
    "OWID_EU27", "OWID_HIC", "OWID_LIC", "OWID_LMC", "OWID_UMC",
}

# States that existed, ended, and whose territory is now shared out among
# codes that still exist. They are loaded, because a polity view needs them,
# and they are NOT countries, because ranking them against the living would put
# a country that stopped existing in 1991 into a 2023 league table.
# Entities OWID publishes with NO code at all. There are exactly two, and only
# one is useful: "Ireland (whole island)" carries 1800-1920, which is the only
# place in this file the Great Famine is visible. IRL itself starts in 1950,
# because the Republic is 26 counties and did not exist before 1922, so the two
# are DIFFERENT TERRITORIES and must never be spliced into one line. It is
# loaded under a synthetic code, joins to no site slug, and is attached to
# Ireland's page as a separate, separately-labelled series.
#
# The other uncoded entity is "Americas (UN)", an aggregate, deliberately absent.
OWID_UNCODED = {
    "Ireland (whole island)": "IRL_WHOLE",
}

OWID_DEFUNCT = {
    "OWID_USS": "USSR",
    "OWID_YGS": "Yugoslavia",
    "OWID_CZS": "Czechoslovakia",
    "OWID_SRM": "Serbia and Montenegro",
    "OWID_GDR": "East Germany",
    "OWID_GFR": "West Germany",
    "OWID_YAR": "Yemen Arab Republic",
    "OWID_YPR": "Yemen People's Republic",
    "OWID_ERE": "Ethiopia (former)",
}


def _get_json(url, timeout=180):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def fetch_entities():
    """The World Bank's own catalogue of what each code is. Still the source of
    names, regions and the aggregate flag even though the population numbers no
    longer come from it, because OWID's CSV carries no such classification."""
    payload = _get_json(f"{WB}/country?format=json&per_page=400")
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


def fetch_owid(timeout=300):
    req = urllib.request.Request(OWID_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        text = r.read().decode("utf-8", "replace")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise SystemExit("FATAL: OWID returned no rows.")
    return rows


def parse_owid(rows):
    """-> [{iso3, year, population, source}]. Population is stored as an
    integer: a float would silently lose precision somewhere above 2^53 people,
    which is not a real risk but a bigint costs nothing and removes the
    question."""
    if not rows:
        raise SystemExit("FATAL: OWID returned no rows.")
    for col in (COL_ESTIMATE, COL_PROJECTION):
        if col not in rows[0]:
            raise SystemExit(f"FATAL: no {col!r} column; got {list(rows[0])}. "
                             "OWID changed the dataset shape.")
    out, seen = [], set()
    for r in rows:
        code = (r.get("code") or "").strip()
        if not code:
            code = OWID_UNCODED.get((r.get("entity") or "").strip(), "")
        if not code or code in OWID_AGGREGATES:
            continue
        code = OWID_RENAME.get(code, code)
        # Everything else is either a 3-letter code or a kept OWID_ entity.
        if (len(code) != 3 and code not in OWID_DEFUNCT
                and code not in OWID_UNCODED.values() and not code.startswith("OWID_")):
            continue
        try:
            y = int(r["year"])
        except (TypeError, ValueError, KeyError):
            continue
        if y < FROM_YEAR or y > TO_YEAR:
            continue
        for col, kind in ((COL_ESTIMATE, "estimate"), (COL_PROJECTION, "projection")):
            raw = (r.get(col) or "").strip()
            if not raw:
                continue
            try:
                v = int(round(float(raw)))
            except (TypeError, ValueError):
                continue
            if v <= 0:
                continue
            if (code, y) in seen:
                # Both columns populated for one code-year. Silently keeping
                # one would make the series depend on column order, so refuse.
                raise SystemExit(f"FATAL: {code} {y} has BOTH an estimate and a "
                                 "projection; OWID's ranges now overlap and the "
                                 "estimate/projection boundary is ambiguous.")
            seen.add((code, y))
            out.append({"iso3": code, "year": y, "population": v,
                        "source": OWID_SOURCE, "kind": kind})
    return out


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    ents = parse_entities(fetch_entities())
    aggs = [e for e in ents if e["is_aggregate"]]
    log(f"wb_entity: {len(ents)} codes · {len(ents) - len(aggs)} countries · {len(aggs)} aggregates"
        + (" (DRY RUN)" if dry else ""))

    rows = parse_owid(fetch_owid())
    codes = {r["iso3"] for r in rows}
    years = sorted({r["year"] for r in rows})
    defunct = sorted(codes & set(OWID_DEFUNCT))
    est = [r for r in rows if r["kind"] == "estimate"]
    prj = [r for r in rows if r["kind"] == "projection"]
    log(f"country_population: {len(rows):,} observations · {len(codes)} codes · "
        f"{years[0]}-{years[-1]} · {len(defunct)} defunct polities")
    log(f"  {len(est):,} estimates to {max(r['year'] for r in est)} · "
        f"{len(prj):,} projections {min(r['year'] for r in prj)}-"
        f"{max(r['year'] for r in prj)} (UN WPP medium variant, tagged not blended)")
    log(f"  source: {OWID_SOURCE}")
    log(f"  defunct: {', '.join(OWID_DEFUNCT[c] for c in defunct)}")

    missing = sorted(set(OWID_DEFUNCT) - codes)
    if missing:
        # Not fatal, but it means the polity view lost an entity it expects.
        log(f"  WARNING expected defunct polity absent from OWID: {missing}")

    if WORLD not in codes:
        raise SystemExit("FATAL: no world row after mapping; shares would be unavailable.")

    # Defunct states must not appear in wb_entity as countries, or they would
    # join into ranks. They are deliberately left out: build-country-population
    # keys on country-indicators.json slugs, which none of them have.
    known = {e["iso3"] for e in ents}
    orphan = sorted(c for c in codes if c not in known and c not in OWID_DEFUNCT and c != WORLD)
    if orphan:
        log(f"  {len(orphan)} code(s) absent from wb_entity: {orphan[:12]}")

    for probe in (WORLD, "CHN", "IND", "USA", "NGA", "TWN"):
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
    # Upsert FIRST, sweep second. A delete-then-insert would leave the table
    # empty for the length of the reload, and anything reading it in that
    # window sees a site with no population data rather than stale numbers.
    for i in range(0, len(rows), CHUNK):
        rest("POST", "/rest/v1/country_population", body=rows[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(rows):,} rows into country_population")
    # Now remove anything this load did not write: the old World Bank rows for
    # codes OWID does not carry (43 of its aggregates, ARB/EUU/LDC and friends)
    # and any year that has since dropped out. Keyed on provenance rather than
    # on a year literal, so a future source change cleans up after itself.
    stale = urllib.parse.quote(OWID_SOURCE, safe="")
    rest("DELETE", f"/rest/v1/country_population?source=neq.{stale}", key=key)
    log("swept rows not written by this source")
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

def _f(entity, code, year, hist="", proj=""):
    return {"entity": entity, "code": code, "year": year,
            COL_ESTIMATE: hist, COL_PROJECTION: proj}


OWID_FIXTURE = [
    _f("United States", "USA", "1799", "5000000"),
    _f("United States", "USA", "1800", "6100000"),
    _f("United States", "USA", "2023", "343477330"),
    _f("United States", "USA", "2024", proj="345426566"),
    _f("United States", "USA", "2025", proj="347275809"),
    _f("United States", "USA", "2026", proj="349000000"),
    _f("World", "OWID_WRL", "1800", "989000000"),
    _f("World", "OWID_WRL", "2023", "8091734933"),
    _f("World", "OWID_WRL", "2024", proj="8161972574"),
    _f("Europe", "OWID_EUR", "2023", "746966209"),
    _f("High-income countries", "OWID_HIC", "2023", "1416794460"),
    _f("USSR", "OWID_USS", "1989", "289122632"),
    _f("Taiwan", "TWN", "2023", "23400220"),
    _f("Kosovo", "OWID_KOS", "2023", "1700039"),
    _f("Americas (UN)", "", "2023", "1000000000"),
    _f("Ireland (whole island)", "", "1841", "8148395"),
    _f("Ireland", "IRL", "1950", "2912656"),
    _f("Nowhere", "NOW", "2023", "0"),
]


def self_test():
    ents = parse_entities(ENT_FIXTURE)
    assert len(ents) == 2, ents
    usa = next(e for e in ents if e["iso3"] == "USA")
    wld = next(e for e in ents if e["iso3"] == "WLD")
    assert usa["is_aggregate"] is False and wld["is_aggregate"] is True, (usa, wld)
    assert usa["lat"] == 38.8895 and usa["capital"] == "Washington D.C.", usa
    assert wld["capital"] is None and wld["lat"] is None, "blank strings must become NULL"

    pop = parse_owid(OWID_FIXTURE)
    got = {(r["iso3"], r["year"]): r["population"] for r in pop}

    assert ("USA", 1799) not in got, "1799 is below the annual floor and must be dropped"
    assert ("USA", 2026) not in got, "beyond TO_YEAR is forecast we did not ask for"
    assert got[("USA", 1800)] == 6100000, got
    assert got[("USA", 2023)] == 343477330, got
    assert got[("USA", 2024)] == 345426566, "2024 comes from the projection column"
    assert got[("USA", 2025)] == 347275809, got

    kind = {(r["iso3"], r["year"]): r["kind"] for r in pop}
    assert kind[("USA", 2023)] == "estimate" and kind[("USA", 2024)] == "projection", (
        "the estimate/projection boundary must survive as data; a page that "
        "cannot see it will draw a forecast as history")
    assert {k for k in kind.values()} <= {"estimate", "projection"}, kind

    try:
        parse_owid([_f("Dup", "DUP", "2024", "1", "2")])
    except SystemExit:
        pass
    else:
        raise AssertionError("a code-year carrying BOTH columns is ambiguous and must "
                             "hard-fail, not resolve by column order")

    assert ("WLD", 2023) in got and ("OWID_WRL", 2023) not in got, (
        "OWID's world code must be mapped onto WLD, or every share-of-world "
        "figure downstream silently loses its denominator")

    assert not any(r["iso3"].startswith("OWID_") and r["iso3"] in OWID_AGGREGATES for r in pop), (
        "continents and income groups are aggregates and must never be loaded")
    assert ("OWID_EUR", 2023) not in got and ("OWID_HIC", 2023) not in got, got

    assert got[("OWID_USS", 1989)] == 289122632, (
        "defunct states ARE loaded; a prefix test on OWID_ would have deleted "
        "them along with the aggregates, which is why the two lists are explicit")

    assert ("TWN", 2023) in got, (
        "Taiwan comes from the same series as everyone else now; if this ever "
        "fails the World Bank substitute has to come back")

    assert got[("IRL_WHOLE", 1841)] == 8148395, (
        "the pre-partition whole-island series is the only place the Famine is "
        "visible; it is loaded under a synthetic code because it is a DIFFERENT "
        "territory from IRL and must never be spliced onto it")
    assert got[("IRL", 1950)] == 2912656 and ("IRL", 1841) not in got, (
        "IRL is the 26 counties and starts in 1950; the two series stay apart")
    assert ("", 2023) not in got, "Americas (UN) is an uncoded aggregate and stays dropped"

    assert not any(r["iso3"] == "" for r in pop), "a blank code is an unjoinable row, drop it"
    assert ("NOW", 2023) not in got, "a zero population is missing data, not a fact"
    assert all(isinstance(r["population"], int) for r in pop), "population must be integral"
    assert all(r["source"] == OWID_SOURCE for r in pop), "every row carries its provenance"

    assert got[("XKX", 2023)] == 1700039, (
        "Kosovo is OWID_KOS but XKX everywhere else on this site; without the "
        "rename its country page silently loses its population section")

    # The property the whole two-view design rests on.
    assert not (set(OWID_RENAME) & OWID_AGGREGATES), (
        "the world is renamed, not dropped; putting it in the aggregate set "
        "would remove the denominator instead of renaming it")
    assert not (OWID_AGGREGATES & set(OWID_DEFUNCT)), (
        "a code cannot be both an aggregate and a defunct state")

    print("self-test: 27/27 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
