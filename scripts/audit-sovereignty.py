#!/usr/bin/env python3
"""audit-sovereignty.py - which territories claim to be countries, and when.

WHY. The /countries Time Machine renders a territory with no rule attached as
an ordinary sovereign row, ranked beside France. That makes the ABSENCE of a
rule indistinguishable from a positive claim of independence, and the only way
that error surfaces is a human reading a board and recognising a country that
should not be there. Ashwin found Ukraine in 1914, Guam in 1818, Poland with
one occupier and Papua New Guinea in 1942 that way, one at a time, and said
plainly that he does not have the bandwidth to check every country every year.

So this asks the question for him. For each benchmark year it lists every
territory the board would show as a plain sovereign state, against the year it
actually became independent. Anything claiming sovereignty before its own
independence date is a finding.

INDEPENDENCE DATES come from the site's own leaders layer where it has them,
and from a curated list where it does not. The point is not that this file is
authoritative - it is that a wrong entry here is one line to fix, whereas a
wrong board is invisible.

usage:
  python scripts/audit-sovereignty.py --self-test
  python scripts/audit-sovereignty.py            # all benchmark years
  python scripts/audit-sovereignty.py 1942       # one year, verbose
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "public", "data")

BENCHMARKS = [1800, 1850, 1900, 1914, 1930, 1942, 1960, 1990, 2020]

# 🔴 WINDOWS, not a single independence date.
#
# The first version of this file held one "independent since" year per country
# and cried wolf constantly: it flagged Burma and Vietnam in 1850, when both
# were sovereign kingdoms that would not be colonised for decades. Sovereignty
# is not a one-way door. A country can be a state, lose it, and get it back,
# and an audit that cannot say so produces noise a human then has to filter -
# which is the work this file exists to remove.
#
# Each entry is a span during which the territory was NOT a sovereign state.
# A finding is a year inside one of these where the board still shows it as an
# ordinary country. Getting an entry wrong here costs one line; getting the
# board wrong is invisible.
#
# 🔴 THE SPAN IS HALF-OPEN: (a, b) means NOT SOVEREIGN FROM a UNTIL b, and b
# ITSELF IS SOVEREIGN. b is the year independence arrived, so Poland (1795,
# 1918) is a country in 1918 and Norway (1537, 1905) is a country in 1905.
# The first version treated both ends as inclusive and the full 1800-2025 sweep
# duly reported Germany as a non-country in 1871, Italy in 1861 and Iceland in
# 1944 - eleven findings that were all the same off-by-one. An audit that cries
# wolf on its own boundary condition trains you to skim its output, which is
# the one failure mode it cannot afford.
NOT_SOVEREIGN = {
    "palestine": [(1517, 1988)],
    "israel": [(1517, 1948)],
    "namibia": [(1884, 1990)],
    "iceland": [(1262, 1944)],
    "ireland": [(1801, 1922)],
    "norway": [(1537, 1905)],
    "finland": [(1809, 1917)],
    "poland": [(1795, 1918), (1939, 1945)],
    "czech-republic": [(1620, 1918), (1939, 1945)],
    "slovakia": [(1000, 1939), (1945, 1993)],
    "hungary": [(1526, 1918)],
    "austria": [(1938, 1945)],
    "estonia": [(1710, 1918), (1940, 1991)],
    "latvia": [(1710, 1918), (1940, 1991)],
    "lithuania": [(1795, 1918), (1940, 1991)],
    "ukraine": [(1795, 1991)],
    "belarus": [(1795, 1991)],
    "moldova": [(1812, 1991)],
    "azerbaijan": [(1813, 1918), (1920, 1991)], "georgia": [(1801, 1918), (1921, 1991)],
    "kazakhstan": [(1847, 1991)], "kyrgyzstan": [(1876, 1991)],
    "tajikistan": [(1868, 1991)], "turkmenistan": [(1885, 1991)],
    "uzbekistan": [(1868, 1991)],
    "croatia": [(1102, 1991)], "slovenia": [(1335, 1991)],
    "north-macedonia": [(1371, 1991)],
    "romania": [(1417, 1877)],
    "bulgaria": [(1396, 1878)], "albania": [(1479, 1912)],
    "iraq": [(1534, 1932)], "syria": [(1516, 1946)], "lebanon": [(1516, 1943)],
    "jordan": [(1516, 1946)], "kuwait": [(1516, 1961)],
    "germany": [(1806, 1871)], "italy": [(1000, 1861)],
    "south-korea": [(1910, 1948)], "north-korea": [(1910, 1948)],
    "taiwan": [(1683, 1945)],
    "mongolia": [(1691, 1912)],
    "philippines": [(1565, 1946)], "indonesia": [(1800, 1945)],
    "myanmar": [(1886, 1948)],
    "india": [(1858, 1947)], "pakistan": [(1858, 1947)],
    "bangladesh": [(1858, 1971)], "sri-lanka": [(1815, 1948)],
    "malaysia": [(1511, 1957)],
    "egypt": [(1517, 1922)], "eritrea": [(1890, 1993)],
    "zimbabwe": [(1890, 1980)], "malta": [(1530, 1964)], "cyprus": [(1571, 1960)],
    "samoa": [(1900, 1962)], "vanuatu": [(1906, 1980)],
    "morocco": [(1912, 1956)], "tunisia": [(1881, 1956)],

    # --- added after the 1818 sweep, which the benchmark years had missed ---
    # The audit is only as good as this table: a territory absent from it can
    # claim sovereignty in any year and nothing objects. Nine of the entries
    # below were rows the board printed as countries in 1818 with a flag, a
    # population and a rank, and the audit said nothing because it had never
    # been told they were not states.
    # 🔴 THESE THREE END ONE YEAR LATER THAN THEY USED TO, and the reason is a
    # seam worth understanding before touching any other row here. This table is
    # HALF-OPEN — (a, b) means sovereign AT b — while the curated windows in
    # build-colonisers.py are INCLUSIVE, so `to: 1830` means held through 1830.
    # Written against each other, the two describe the transition year
    # differently, and nothing catches it: this audit only reports territories
    # rendered sovereign that should not be, so a territory held one year too
    # LONG passes silently.
    #
    # Which one is right depends on the MONTH, and for the Benelux the curated
    # data was right and this table was early. Belgian independence was
    # recognised on 20 December 1830; French rule in the Netherlands collapsed
    # in November 1813; William III died on 23 November 1890. In all three the
    # old order held for most of the year, so the year belongs to it.
    #
    # ⚠️ 50 OTHER TERRITORIES STILL DISAGREE BY EXACTLY ONE YEAR — India 1947,
    # Ghana 1957, Israel 1948 and the rest of the decolonisation wave, where the
    # transition fell early in the year and this table is likely the RIGHT one.
    # They are deliberately untouched: reconciling them is a per-territory
    # editorial pass on the actual date, not a global off-by-one to sweep.
    "belgium": [(1795, 1831)],       # French, then the United Kingdom of the Netherlands
    "luxembourg": [(1795, 1891)],    # French, then in personal union to the 1890 succession
    "netherlands": [(1795, 1814)],   # Batavian Republic, Kingdom of Holland, then annexed
    "greece": [(1458, 1830)],
    "algeria": [(1516, 1962)],       # Ottoman regency, then French from 1830
    "libya": [(1551, 1951)],
    "cambodia": [(1800, 1953)],      # Siamese and Vietnamese tribute, then French
    "laos": [(1800, 1953)],
    "vietnam": [(1800, 1802), (1862, 1945)],  # the Tay Son split, then the French conquest
    "kazakhstan": [(1731, 1991)],
    "armenia": [(1639, 1918), (1920, 1991)],
    "liberia": [(1800, 1847)],       # no such polity before the republic
    "uruguay": [(1680, 1828)],
    "belize": [(1800, 1981)],
    "equatorial-guinea": [(1778, 1968)],
    "senegal": [(1800, 1960)],
    "ghana": [(1874, 1957)],
    "somalia": [(1888, 1960)],
    "solomon-islands": [(1885, 1978)],
    "federated-states-of-micronesia": [(1800, 1986)],
    "palau": [(1800, 1994)],
    "marshall-islands": [(1885, 1986)],
    "nauru": [(1888, 1968)],
    "papua-new-guinea": [(1884, 1975)],
    "hong-kong": [(1800, 2026)],
    "macau": [(1800, 2026)],
    "american-samoa": [(1800, 2026)],
    "new-caledonia": [(1800, 2026)],
    "guam": [(1668, 2026)],
    "northern-mariana-islands": [(1668, 2026)],
    "south-sudan": [(1821, 2011)],
    "montenegro": [(1800, 1877), (1918, 2006)],
    "serbia": [(1459, 1877)],
    "bosnia-herzegovina": [(1463, 1992)],
    "kosovo": [(1455, 2008)],
    "dominica": [(1763, 1978)],
    "seychelles": [(1794, 1976)],
    "singapore": [(1826, 1965)],
    "bahrain": [(1861, 1971)], "qatar": [(1868, 1971)],
    "united-arab-emirates": [(1820, 1971)],
    "madagascar": [(1896, 1960)],
    "zanzibar": [(1890, 1963)],
    "brunei": [(1888, 1984)],
    "maldives": [(1887, 1965)],
    "tonga": [(1900, 1970)],
    "fiji": [(1874, 1970)],
    "kiribati": [(1892, 1979)], "tuvalu": [(1892, 1978)],
}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def claimed_sovereign(year, pop, col):
    """Territories the board would render as a plain sovereign state."""
    countries = pop["countries"]
    absorbed = set()

    for p in pop.get("polities", []):
        if not (p["from"] <= year <= p["to"]):
            continue
        if any(a <= year <= b for a, b in (p.get("gaps") or [])):
            continue
        mw = p.get("memberWindows")
        members = ([m[0] for m in mw if m[1] <= year <= m[2]] if mw else p["replaces"])
        absorbed.update(members)
        if p.get("partitionOf"):
            absorbed.add(p["partitionOf"])

    tagged = set()
    for slug, runs in col["colonisers"].items():
        if any(a <= year <= b for a, b, _n in runs):
            tagged.add(slug)
    for h in col.get("extraHoldings", []):
        if h["from"] <= year <= h["to"]:
            tagged.add(h["slug"])
    for d in pop.get("partitioned", []):
        if d["from"] <= year <= d["to"]:
            tagged.add(d["slug"])
    for f in col.get("fragmented", []):
        if f["from"] <= year <= f["to"]:
            tagged.add(f["slug"])
    for slug, parent in col.get("dependencies", {}).items():
        since = col.get("dependencySince", {}).get(slug)
        if since is None or year >= since:
            tagged.add(slug)
    for o in col.get("dependencyOverrides", []):
        if o["from"] <= year <= o["to"]:
            tagged.add(o["slug"])

    out = []
    for slug, c in countries.items():
        if slug in absorbed or slug in tagged:
            continue
        if not any(y <= year for y, _v in c["series"]):
            continue
        out.append(slug)
    return sorted(out)


def findings(year, pop, col):
    """Territories the board calls a country during a span when they were not."""
    out = []
    for slug in claimed_sovereign(year, pop, col):
        for a, b in NOT_SOVEREIGN.get(slug, []):
            if a <= year < b:
                out.append((slug, f"{a}-{b}"))
                break
    return out


def sovereign_spans(pop, col, lo=1800, hi=2025):
    """-> {slug: [(from, to)]} for every year the board calls it a country.

    🔴 THE BENCHMARK YEARS WERE THE HOLE. Nine sample years cannot see a gap
    that opens in 1818 and closes in 1853, and that is exactly the shape of the
    errors left: Senegal between two colonial runs, Belgium between France and
    the Netherlands, Vietnam between the conquest and the Union indochinoise.
    Ashwin said he does not have the bandwidth to check every country every
    year. Neither does a nine-year sample. This walks all 226.
    """
    out = {}
    for y in range(lo, hi + 1):
        for slug in claimed_sovereign(y, pop, col):
            runs = out.setdefault(slug, [])
            if runs and runs[-1][1] == y - 1:
                runs[-1][1] = y
            else:
                runs.append([y, y])
    return {k: [(a, b) for a, b in v] for k, v in sorted(out.items())}


def sweep(pop, col):
    """Every year, every territory, against NOT_SOVEREIGN. Prints one line per
    offending SPAN rather than per year, so 226 years fit on a screen."""
    spans = sovereign_spans(pop, col)
    bad = 0
    for slug, runs in spans.items():
        for a, b in runs:
            for x, z in NOT_SOVEREIGN.get(slug, []):
                lo, hi = max(a, x), min(b, z - 1)
                if lo <= hi:
                    bad += 1
                    print(f"  ⚠️  {slug:<32} shown as a country {lo}-{hi} "
                          f"(not a sovereign state {x}-{z})")
    # A territory with NO entry at all cannot be caught. Name the ones that
    # claim sovereignty from 1800, since those are where a missing entry hides.
    silent = sorted(s for s, r in spans.items()
                    if r and r[0][0] <= 1800 and s not in NOT_SOVEREIGN)
    print(f"\n{bad} offending span(s) across {len(spans)} territories, 1800-2025.")
    print(f"{len(silent)} territor(ies) claim sovereignty from 1800 with no entry in "
          f"NOT_SOVEREIGN, so nothing here can contradict them:")
    print("  " + ", ".join(silent))
    return 1 if bad else 0


def main(argv):
    if "--self-test" in argv:
        return self_test()
    pop, col = load("country-population.json"), load("country-colonisers.json")
    if "--sweep" in argv:
        return sweep(pop, col)
    years = [int(a) for a in argv if a.isdigit()] or BENCHMARKS
    total = 0
    for y in years:
        bad = findings(y, pop, col)
        shown = claimed_sovereign(y, pop, col)
        total += len(bad)
        print(f"\n=== {y}: {len(shown)} sovereign rows, {len(bad)} suspect ===")
        for slug, span in bad:
            print(f"  ⚠️  {slug:<26} not a sovereign state {span}")
        if len(years) == 1:
            print("  --- all rows claiming sovereignty ---")
            print("  " + ", ".join(shown))
    print(f"\n{total} finding(s) across {len(years)} year(s).")
    return 1 if total else 0


def self_test():
    pop = {
        "countries": {
            "france": {"series": [[1800, 1]]},
            "ukraine": {"series": [[1800, 1]]},
            "poland": {"series": [[1800, 1]]},
            "papua-new-guinea": {"series": [[1800, 1]]},
        },
        "polities": [{"code": "X", "name": "USSR", "from": 1922, "to": 1991,
                      "replaces": ["ukraine"], "gaps": []}],
        "partitioned": [{"slug": "poland", "from": 1800, "to": 1918, "between": ["a"]}],
    }
    col = {"colonisers": {}, "extraHoldings": [], "fragmented": [],
           "dependencies": {}, "dependencySince": {}, "dependencyOverrides": []}

    assert claimed_sovereign(1950, pop, col) == ["france", "papua-new-guinea", "poland"], (
        "a member of a live polity is absorbed and must not be listed",
        claimed_sovereign(1950, pop, col))
    assert "ukraine" not in claimed_sovereign(1950, pop, col)
    assert "poland" not in claimed_sovereign(1900, pop, col), (
        "a partitioned territory is tagged, so it is not claiming sovereignty")

    f = dict(findings(1942, pop, col))
    assert "papua-new-guinea" in f, (
        "the whole point: a territory shown as a country decades before it "
        "became one is the finding a human should not have to spot", f)
    assert "france" not in f, "a real state in its own era is not a finding"

    # The reason this file holds spans rather than dates: Burma was a sovereign
    # kingdom in 1850 and a British province in 1900. One number cannot say both.
    pop3 = {"countries": {"myanmar": {"series": [[1800, 1]]}}, "polities": [], "partitioned": []}
    assert not findings(1850, pop3, col), "a state in its sovereign era is not a finding"
    assert findings(1900, pop3, col), "the same state after annexation is"

    pop2 = dict(pop, polities=[dict(pop["polities"][0], gaps=[[1939, 1945]])])
    assert "ukraine" in claimed_sovereign(1942, pop2, col), (
        "a polity in a gap year does not absorb its members")
    print("self-test: 9/9 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
