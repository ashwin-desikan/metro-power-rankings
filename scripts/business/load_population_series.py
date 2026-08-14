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
import csv, io, json, os, sys, urllib.parse, urllib.request, zipfile
from datetime import datetime, timezone

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

# The ceiling: THE CURRENT CALENDAR YEAR, and not one year further.
#
# OWID's projection column runs to 2100 and loading all of it would put 75
# years of forecast behind a chart captioned "population". But the first
# version of this line hardcoded 2025 and was already a year stale on the day
# it shipped, which is how /time-machine?year=2026 came to have no world
# population at all (Ashwin, 2026-08-14). A fixed ceiling for a series whose
# whole job is to reach the present is a bug with a scheduled fire date, so the
# rule is stated as a rule and computed: the line ends at the year we are
# actually in.
#
# 🔴 THIS DOES NOT MAKE PROJECTIONS INTO ESTIMATES. Everything past the WPP
# estimate boundary is still tagged kind="projection" and is still barred from
# setting a rank, a peak or a share downstream. The ceiling only decides how
# far the CHART reaches.
TO_YEAR = datetime.now(timezone.utc).year

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

# ---------------------------------------------------------------------------
# THE SECOND SOURCE, AND WHY THIS FILE NOW OWNS A SPLICE IT SPENT ITS DOCSTRING
# ARGUING AGAINST (Ashwin, 2026-08-14).
#
# The argument for taking OWID whole was one provenance story instead of a
# splice. That still holds for every living country. It fails for four of the
# nine defunct polities, and it fails badly:
#
#     East Germany   3 usable points across a 42-year life (1950, 1973, 1990)
#     West Germany   3 usable points across a 42-year life
#     North Yemen    NOTHING between 1962 and 1969, so the board rendered its
#                    1820 figure, labelled "as of 1820", on a 1965 view
#     South Yemen    NOTHING between 1967 and 1969
#
# OWID's series for those four are Maddison BENCHMARK years (1820, 1870, 1913,
# 1950, 1973) rather than the annual UN/Gapminder run every other entity gets.
# Czechoslovakia has 1920-1993 annual, the USSR has 1922-1991. The Germanies
# were never given the same treatment, and no amount of loading OWID more
# carefully produces years it does not publish.
#
# So this is a splice, declared as one. COW's National Material Capabilities
# carries annual total population for every state in its system, including all
# four of these, and it AGREES with OWID where they overlap:
#
#     West Germany 1973  +0.01%      East Germany 1973  +0.53%
#     West Germany 1990  +0.00%      East Germany 1990  +0.85%
#
# 🔴 GAP-FILL ONLY, NEVER WHOLESALE REPLACEMENT. COW is used strictly for years
# OWID does not publish for these codes. Two reasons, and the second is the
# real one:
#   1. Where OWID has a year it is the better-reconciled number, and it is what
#      every other row on the board is built from.
#   2. COW's own documentation warns that quality varies by state and by year,
#      and it does. Its South Yemen 1973 reads 1,950,000 between neighbours of
#      1,515,000 and 1,632,000 — a 21% spike against OWID's smooth 1,609,000,
#      and plainly wrong. Restricting COW to the gap years keeps that value out
#      by construction rather than by anyone spotting it. Widen a window here
#      and you invite it back in.
COW_URL = "https://correlatesofwar.org/wp-content/uploads/NMCv7.zip"
COW_SOURCE = ("Correlates of War National Material Capabilities v7.0 "
              "(Singer, Bremer and Stuckey 1972); annual total population, "
              "gap-filling years Our World in Data does not publish")
# iso3 code -> (COW ccode, first year, last year, label). The windows are the
# GAPS, not the entities' lifespans.
COW_FILL = {
    "OWID_GDR": ("265", 1954, 1989, "East Germany"),
    "OWID_GFR": ("260", 1955, 1989, "West Germany"),
    "OWID_YAR": ("678", 1962, 1969, "North Yemen"),
    "OWID_YPR": ("680", 1967, 1969, "South Yemen"),
}

# 🔴 VIETNAM IS AN APPORTIONMENT, NOT A MEASUREMENT, AND MUST KEEP SAYING SO.
# COW carries both halves annually (816 North, 817 South, and 816 becomes the
# unified country in 1976), but its levels sit 5-8% BELOW OWID's Vietnam. Taken
# raw, 1975 would read 43.97m across two rows and 1976 would read 47.68m as
# one: a 3.7m jump in a single year that did not happen, with the board
# contradicting itself in the reader's face.
#
# So COW supplies only the SHARE and OWID supplies the total. North's share in
# 1975 is 54.65%, which against OWID's 46,482,905 gives 25,403,706 and
# 21,079,199 — and the two halves add to OWID's Vietnam exactly, every year, so
# the 1975-to-1976 transition is continuous. That is a derived figure and the
# row has to say it is derived. It is not the same kind of number as the rest
# of this file and must never be quietly treated as one.
COW_SPLIT = {
    "COW_VDR": ("816", "North Vietnam"),
    "COW_VNS": ("817", "South Vietnam"),
}
COW_SPLIT_OF = "VNM"          # the OWID code whose total is apportioned
COW_SPLIT_FROM, COW_SPLIT_TO = 1954, 1975
COW_SPLIT_SOURCE = ("Apportioned: Correlates of War NMC v7.0 gives the North/South "
                    "share, Our World in Data gives the Vietnam total. Derived, "
                    "not measured; the two halves sum to the total exactly")


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


def fetch_cow(timeout=300):
    """-> {ccode: {year: population}} from the NMC v7 abridged CSV.

    The download is a zip of a zip. tpop is in THOUSANDS and uses negative
    sentinels for missing, which are dropped rather than coerced to zero: a
    zero population would sail through every downstream check and render as a
    country of nobody.
    """
    req = urllib.request.Request(COW_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        outer = zipfile.ZipFile(io.BytesIO(r.read()))
    inner_name = next(n for n in outer.namelist() if n.endswith("abridged.zip"))
    inner = zipfile.ZipFile(io.BytesIO(outer.read(inner_name)))
    csv_name = next(n for n in inner.namelist() if n.lower().endswith(".csv"))
    rows = list(csv.DictReader(io.StringIO(inner.read(csv_name).decode("utf-8", "replace"))))
    if not rows or "tpop" not in rows[0]:
        raise SystemExit(f"FATAL: COW NMC shape changed; got columns {list(rows[0]) if rows else []}")
    out = {}
    for r in rows:
        try:
            v = float(r["tpop"])
            y = int(r["year"])
        except (TypeError, ValueError, KeyError):
            continue
        if v < 0:                      # COW's missing-value sentinel
            continue
        out.setdefault(str(r["ccode"]).strip(), {})[y] = int(round(v * 1000))
    return out


def build_cow_rows(cow, owid_rows):
    """-> [row] filling declared gaps, plus the apportioned Vietnam pair.

    `owid_rows` is what parse_owid returned, so "gap" means a year OWID did not
    publish for that code IN THIS LOAD rather than a year someone believed was
    missing when they wrote the table down.
    """
    have = {(r["iso3"], r["year"]) for r in owid_rows}
    out, notes = [], []
    for code, (ccode, lo, hi, label) in sorted(COW_FILL.items()):
        series = cow.get(ccode) or {}
        if not series:
            raise SystemExit(f"FATAL: COW ccode {ccode} ({label}) returned no population; "
                             "the gap this fills would silently reopen.")
        added = 0
        for y in range(lo, hi + 1):
            v = series.get(y)
            if v is None or (code, y) in have:
                continue
            out.append({"iso3": code, "year": y, "population": v,
                        "source": COW_SOURCE, "kind": "estimate"})
            added += 1
        notes.append(f"{label} +{added}")

    # The apportionment. Refuses rather than guesses if either side is missing:
    # a year with only one half would put a country on the board holding the
    # other half's people.
    total = {r["year"]: r["population"] for r in owid_rows
             if r["iso3"] == COW_SPLIT_OF and r["kind"] == "estimate"}
    (a_code, (a_cc, a_label)), (b_code, (b_cc, b_label)) = sorted(COW_SPLIT.items())
    split_added = 0
    for y in range(COW_SPLIT_FROM, COW_SPLIT_TO + 1):
        a, b, t = cow.get(a_cc, {}).get(y), cow.get(b_cc, {}).get(y), total.get(y)
        if not (a and b and t):
            raise SystemExit(f"FATAL: cannot apportion {COW_SPLIT_OF} in {y}: "
                             f"north={a} south={b} total={t}. Refusing to publish "
                             "half a partition.")
        share = a / (a + b)
        av = int(round(t * share))
        out.append({"iso3": a_code, "year": y, "population": av,
                    "source": COW_SPLIT_SOURCE, "kind": "estimate"})
        out.append({"iso3": b_code, "year": y, "population": t - av,
                    "source": COW_SPLIT_SOURCE, "kind": "estimate"})
        split_added += 1
    notes.append(f"{a_label}/{b_label} {split_added}y apportioned")
    return out, notes


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    ents = parse_entities(fetch_entities())
    aggs = [e for e in ents if e["is_aggregate"]]
    log(f"wb_entity: {len(ents)} codes · {len(ents) - len(aggs)} countries · {len(aggs)} aggregates"
        + (" (DRY RUN)" if dry else ""))

    rows = parse_owid(fetch_owid())
    cow_rows, cow_notes = build_cow_rows(fetch_cow(), rows)
    rows += cow_rows
    log(f"  COW gap-fill: {len(cow_rows):,} row(s) — {', '.join(cow_notes)}")
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
    #
    # 🔴 THIS USED TO BE ONE `source=neq.<OWID>` DELETE, and it became a trap the
    # moment a second source existed: it would have wiped every COW row on the
    # next OWID-only run, silently, and the Germanies would have quietly
    # collapsed back to three points each. It is now an ALLOW-LIST, and it
    # deletes one source at a time after reading back what is actually in the
    # table, so an unexpected provenance is named in the log rather than being
    # swept by a filter nobody can eyeball. A single conditional DELETE across a
    # whole table is also the one shape of query where a typo costs everything.
    written = {r["source"] for r in rows}
    present = rest("GET", "/rest/v1/country_population?select=source", key=key) or []
    found = {r.get("source") or "" for r in present}
    for src in sorted(found - written):
        q = urllib.parse.quote(src, safe="")
        rest("DELETE", f"/rest/v1/country_population?source=eq.{q}", key=key)
        log(f"  swept rows from a source this load did not write: {src[:70]}")
    if not (found - written):
        log("  nothing to sweep: every row in the table came from this load")
    log(f"kept {len(written)} provenance(s): "
        + " | ".join(sorted(s.split(";")[0].split("(")[0].strip() for s in written)))
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
    # The ceiling year and one year above it, written RELATIVE to TO_YEAR
    # rather than as literals. TO_YEAR now moves with the calendar, so a
    # literal pair here would stop testing the boundary the first January after
    # it was written — which is the same class of bug that put the ceiling a
    # year behind the present in the first place. 2023 and 2024 stay literal
    # above because they pin the estimate/projection SEAM, which does not move.
    _f("United States", "USA", str(TO_YEAR), proj="347275809"),
    _f("United States", "USA", str(TO_YEAR + 1), proj="349000000"),
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
    assert ("USA", TO_YEAR + 1) not in got, "beyond TO_YEAR is forecast we did not ask for"
    assert ("USA", TO_YEAR) in got, "the ceiling year itself must load, or the line stops short of today"
    assert got[("USA", 1800)] == 6100000, got
    assert got[("USA", 2023)] == 343477330, got
    assert got[("USA", 2024)] == 345426566, "2024 comes from the projection column"
    assert got[("USA", TO_YEAR)] == 347275809, got

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

    # --- the COW splice ---------------------------------------------------
    # A toy COW table: the Germanies with one year OWID already has and one it
    # does not, and a Vietnam pair whose levels are deliberately far below the
    # total so the apportionment cannot accidentally pass by matching them.
    span = range(COW_SPLIT_FROM, COW_SPLIT_TO + 1)
    cow = {"265": {1973: 16_980_000, 1974: 16_925_000},
           "260": {1973: 61_987_000, 1974: 62_071_000},
           "678": {1965: 4_000_000}, "680": {1968: 1_400_000},
           # Deliberately 5-8% below the totals below, the way the real data is.
           "816": {y: 24_032_000 for y in span},
           "817": {y: 19_941_000 for y in span}}
    base = [{"iso3": "OWID_GDR", "year": 1973, "population": 16_890_000,
             "source": OWID_SOURCE, "kind": "estimate"},
            {"iso3": "OWID_GFR", "year": 1973, "population": 61_980_000,
             "source": OWID_SOURCE, "kind": "estimate"}]
    base += [{"iso3": "VNM", "year": y, "population": 46_482_905,
              "source": OWID_SOURCE, "kind": "estimate"} for y in span]
    made, _ = build_cow_rows(cow, base)
    by = {(r["iso3"], r["year"]): r for r in made}

    assert ("OWID_GDR", 1973) not in by and ("OWID_GFR", 1973) not in by, (
        "GAP-FILL ONLY: COW must never overwrite a year OWID published, or the "
        "series becomes a blend of two vintages nobody can reason about")
    assert by[("OWID_GDR", 1974)]["population"] == 16_925_000, "COW fills the years OWID lacks"
    assert by[("OWID_GDR", 1974)]["source"] == COW_SOURCE, "a spliced row says so"
    assert ("OWID_YAR", 1965) in by and ("OWID_YPR", 1968) in by, (
        "the Yemen gaps are the other half of this splice; without them a 1965 "
        "board renders North Yemen's 1820 figure")

    # The property the Vietnam apportionment exists to guarantee.
    n, s = by[("COW_VDR", 1975)]["population"], by[("COW_VNS", 1975)]["population"]
    assert n + s == 46_482_905, (
        "the two halves must sum to OWID's total EXACTLY, or 1975 and 1976 "
        "disagree about how many people lived in Vietnam")
    assert abs(n / (n + s) - 24_032_000 / (24_032_000 + 19_941_000)) < 1e-6, (
        "COW supplies the share and only the share")
    assert by[("COW_VDR", 1975)]["source"] == COW_SPLIT_SOURCE, (
        "an apportioned row must never wear a measured row's provenance")
    try:
        build_cow_rows({**cow, "817": {}}, base)
        raise AssertionError("apportioning with one half missing must be fatal")
    except SystemExit:
        pass

    assert not (set(COW_FILL) - set(OWID_DEFUNCT)), (
        "COW only ever gap-fills a polity OWID already publishes; a code that "
        "exists nowhere else would join to nothing")
    assert not (set(COW_SPLIT) & set(COW_FILL)), "a code is filled or split, never both"

    print("self-test: 38/38 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
