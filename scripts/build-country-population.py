#!/usr/bin/env python3
"""build-country-population.py - annual population history per country page.

WHY A SECOND POPULATION NUMBER. The workbook is already ground truth for a
country's current population and stays that way; nothing here overwrites it.
What the site has never had is the SHAPE: Japan peaked in 2009 and has been
shrinking since, Nigeria is 5.3x its 1960 self, and Ukraine has lost a fifth of
its people this century. A single current figure cannot say any of that, and
the shape is the part that explains the metro rankings underneath it.

Reads Supabase's country_population (loaded by
scripts/business/load_population_series.py from World Bank SP.POP.TOTL) and
joins it to the site's country slugs through country-indicators.json, which
already carries the iso3 for each slug. Writes a single local JSON, because
this changes once a year and has no business going through the GH-raw ISR path
that exists for daily data.

usage:
  python scripts/build-country-population.py --self-test
  python scripts/build-country-population.py --dry
  python scripts/build-country-population.py
"""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "business"))
from load_market_series import service_key, rest, log  # noqa: E402

INDICATORS = os.path.join(ROOT, "public", "data", "country-indicators.json")
OUT = os.path.join(ROOT, "public", "data", "country-population.json")
WORLD = "WLD"
PAGE = 1000


def slug_to_iso3():
    doc = json.load(open(INDICATORS, encoding="utf-8"))
    out = {}
    for slug, c in (doc.get("countries") or {}).items():
        iso = (c.get("iso3") or "").strip()
        if len(iso) == 3:
            out[slug] = iso
    if len(out) < 100:
        raise SystemExit(f"FATAL: only {len(out)} slug->iso3 pairs from country-indicators.json; "
                         "run scripts/build-country-indicators.py first.")
    return out


def fetch_population(key):
    rows, off = [], 0
    while True:
        page = rest("GET", f"/rest/v1/country_population?select=iso3,year,population,source"
                           f"&order=iso3.asc,year.asc&limit={PAGE}&offset={off}", key=key)
        rows += page
        if len(page) < PAGE:
            break
        off += PAGE
    by, src = {}, {}
    for r in rows:
        by.setdefault(r["iso3"], {})[int(r["year"])] = int(r["population"])
        src[r["iso3"]] = r.get("source") or ""
    return by, src


def build(by_iso, s2i, aggregates, sources=None):
    """slug -> {series, rank, peak, share}. Ranks are computed over REAL
    countries only; wb_entity's aggregate flag is what keeps World and the
    income groups from taking the top three places."""
    world = by_iso.get(WORLD) or {}
    if not world:
        raise SystemExit("FATAL: no WLD row in country_population; shares would be unavailable.")
    last = max(world)

    real = {i: s for i, s in by_iso.items() if i not in aggregates and i != WORLD}

    def latest_value(s):
        """The common year where a country has it, otherwise that country's own
        most recent. Taiwan's substitute source ends in 2023 while the World
        Bank runs to 2025, and ranking strictly on the common year would drop
        the world's 57th largest country out of the ranking entirely, which is a
        worse error than comparing a 2023 figure against 2025 ones for a
        population that moves under half a percent a year."""
        return s.get(last) or (s[max(s)] if s else 0)

    ranked = sorted(real.items(), key=lambda kv: -latest_value(kv[1]))
    rank_of = {i: n + 1 for n, (i, s) in enumerate(ranked) if latest_value(s)}

    out = {}
    for slug, iso in sorted(s2i.items()):
        s = by_iso.get(iso)
        if not s:
            continue
        years = sorted(s)
        peak = max(years, key=lambda y: s[y])
        first, latest = years[0], years[-1]

        def share(y):
            return round(s[y] / world[y] * 100, 3) if world.get(y) and s.get(y) else None

        out[slug] = {
            "iso3": iso,
            # Carried per country, not stated once in _meta, because Taiwan's
            # rows do not come from the World Bank and a page that shows a
            # mixed-provenance series without saying so is doing the same thing
            # as an unlabelled source seam.
            "source": (sources or {}).get(iso, ""),
            "first": first, "latest": latest,
            "value": s[latest],
            "rank": rank_of.get(iso),
            # A country past its peak is the single most interesting thing this
            # dataset knows about it, and no current-population figure can say
            # it. Held as data so the page does not have to re-derive it.
            "peakYear": peak, "peakValue": s[peak],
            "declineFromPeak": round((s[peak] - s[latest]) / s[peak] * 100, 2) if peak != latest else 0.0,
            "multiple": round(s[latest] / s[first], 3) if s[first] else None,
            "share": share(latest), "shareFirst": share(first),
            "series": [[y, s[y]] for y in years],
        }
    return out, world, last, len(rank_of)


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    s2i = slug_to_iso3()
    key = service_key()
    by_iso, sources = fetch_population(key)
    ents = rest("GET", "/rest/v1/wb_entity?select=iso3&is_aggregate=is.true", key=key)
    aggregates = {e["iso3"] for e in ents}
    log(f"{len(by_iso)} coded series · {len(aggregates)} aggregates excluded from ranks · "
        f"{len(s2i)} site countries carry an iso3")
    alt = sorted({s for s in sources.values() if s and "World Bank" not in s})
    for a in alt:
        log(f"  non-World-Bank source in use: {a} "
            f"({', '.join(i for i, s in sources.items() if s == a)})")

    countries, world, last, ranked = build(by_iso, s2i, aggregates, sources)
    missing = sorted(set(s2i) - set(countries))
    log(f"matched {len(countries)} of {len(s2i)} site countries; {ranked} ranked at {last}")
    if missing:
        # Expected for microstates and dependencies the World Bank does not
        # report separately. Named rather than swallowed so the count can be
        # sanity-checked rather than trusted.
        log(f"  no World Bank population for {len(missing)}: {missing[:14]}")

    shrinking = sorted(((v["declineFromPeak"], s) for s, v in countries.items()
                        if v["declineFromPeak"] > 0.5), reverse=True)[:8]
    log("  past peak: " + ", ".join(f"{s} -{d:.1f}% since {countries[s]['peakYear']}"
                                    for d, s in shrinking))

    if dry:
        return 0

    doc = {
        "_meta": {
            "source": "World Bank Open Data, SP.POP.TOTL",
            "license": "CC BY 4.0",
            "fetchedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "first": min(world), "last": last, "countries": len(countries),
            "note": ("Ranks cover World Bank reporting economies only and exclude its "
                     "aggregates. The workbook remains ground truth for a country's "
                     "current population; this file is the history."),
        },
        "world": [[y, world[y]] for y in sorted(world)],
        "countries": countries,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    log(f"wrote country-population.json: {len(countries)} countries, "
        f"{os.path.getsize(OUT) / 1024:.0f} KB")
    return 0


def self_test():
    by_iso = {
        "WLD": {1960: 100, 2025: 400},
        "JPN": {1960: 20, 2009: 40, 2025: 36},   # past peak
        "NGA": {1960: 5, 2025: 60},              # still growing
        "EUU": {1960: 30, 2025: 90},             # aggregate: must not be ranked
        # A country whose substitute source stops short of the common year, as
        # Taiwan's does. It must still be ranked, on its own latest figure.
        "TWN": {1960: 11, 2023: 38},
    }
    s2i = {"japan": "JPN", "nigeria": "NGA", "european-union": "EUU",
           "taiwan": "TWN", "nowhere": "XXX"}
    srcs = {"JPN": "World Bank SP.POP.TOTL", "NGA": "World Bank SP.POP.TOTL",
            "EUU": "World Bank SP.POP.TOTL", "TWN": "UN World Population Prospects"}
    out, world, last, ranked = build(by_iso, s2i, {"EUU"}, srcs)
    assert out["japan"]["source"] == "World Bank SP.POP.TOTL", (
        "each country carries its own source, so a substitute like Taiwan's is "
        "visible on the page rather than only in a script comment")

    assert "nowhere" not in out, "a slug with no World Bank series is dropped, not zero-filled"
    jp = out["japan"]
    assert jp["peakYear"] == 2009 and jp["declineFromPeak"] == 10.0, jp
    assert out["nigeria"]["declineFromPeak"] == 0.0, "a country at its peak is not in decline"
    assert out["nigeria"]["multiple"] == 12.0, out["nigeria"]
    # ranks: NGA 60, TWN 38 on its own 2023 figure, JPN 36; the aggregate is out
    assert (out["nigeria"]["rank"], out["taiwan"]["rank"], out["japan"]["rank"]) == (1, 2, 3), (
        "a country whose source stops short of the common year must still rank, "
        "on its own latest figure, or the world's 57th largest vanishes")
    assert ranked == 3, "the EU aggregate must not occupy a rank"
    assert out["european-union"]["rank"] is None, "an aggregate still renders, it just has no rank"
    assert jp["share"] == 9.0 and jp["shareFirst"] == 20.0, jp
    print("self-test: 9/9 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
