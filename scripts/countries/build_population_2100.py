"""Population to 2100, per country, from the UN's World Population Prospects.

WHAT THIS IS. The country hubs draw population from 1800 to the last estimate
(public/data/country-population.json, OWID's splice of WPP, Gapminder and
HYDE). This builder adds the other end: the UN's PROBABILISTIC projection for
every country to 2100, median with 80% and 95% prediction intervals, the UN's
own scenario variants (high and low fertility, zero migration, constant
fertility), the drivers behind the median (births, deaths, net migration,
fertility, life expectancy, crude rates, median age), and the facts the
projection implies (peak year and size, 2050 and 2100 with their bands, the
multiple on today, the year natural change turns negative).

WHY NOT OUR OWN MODEL (Ashwin's ruling, 2026-09-10). A 75-year projection is
an age-structure calculation: cohort-component with age-specific fertility,
mortality and migration, which the UN runs with Bayesian hierarchical models
across 237 countries and re-estimates every two years. Crude birth and death
rates carry no age structure, so an extrapolation of them would look like a
forecast and be wrong in a way nobody could grade for decades. The site's
job is the instrument around the published projections: the band, the
drivers, the disagreement between sources, and (v2) the grading of earlier
WPP vintages against what happened.

INPUTS (downloaded on the Windows box from population.un.org, CC BY 3.0 IGO;
the container cannot reach the site):
  data/wpp/WPP2024_Demographic_Indicators_Medium.csv.gz         1950-2100, medium
  data/wpp/WPP2024_Demographic_Indicators_OtherVariants.csv.gz  2024-2100, variants
                                                                 and the PI series
Units in the files: population, births, deaths and migration in THOUSANDS;
TFR in children per woman; LEx in years; CBR, CDR per thousand.

OUTPUT
  public/data/countries/pop2100/index.json   one row per country for the board
  public/data/countries/pop2100/<slug>.json  the series for one hub

JOIN. WPP ISO3_code to the site's country slugs by iso3, which lives in
public/data/country-population.json (countries.json carries no iso3). Kosovo and the territories the UN folds into a parent are absent and
listed in the index under `unmatched`, never invented.

  python scripts/countries/build_population_2100.py --self-test
  python scripts/countries/build_population_2100.py --dry
  python scripts/countries/build_population_2100.py --write
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(ROOT, "data", "wpp")
MED = os.path.join(SRC, "WPP2024_Demographic_Indicators_Medium.csv.gz")
OTH = os.path.join(SRC, "WPP2024_Demographic_Indicators_OtherVariants.csv.gz")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "countries", "pop2100")

REVISION = "WPP 2024"
SOURCE_CREDIT = ("United Nations, DESA, Population Division. World Population Prospects 2024. "
                 "Licensed under CC BY 3.0 IGO.")
LAST_ESTIMATE = 2023   # WPP 2024's estimates run to 2023; 2024 on is projection
END = 2100
BASE_YEAR = 2025       # "today" for the multiples on the board
PATH_START = 1950      # the board's path reaches back to the first UN estimate, so a bloc's peak is its real one (Ashwin, 2026-09-10)

# The PI series and the scenario variants we keep, by the file's Variant label.
PI = {"Median PI": "med", "Lower 80 PI": "lo80", "Upper 80 PI": "hi80",
      "Lower 95 PI": "lo95", "Upper 95 PI": "hi95"}
SCENARIOS = {"High": "high", "Low": "low", "Zero migration": "zero_migration",
             "Constant fertility": "constant_fertility"}
DRIVERS = {"Births": "births", "Deaths": "deaths", "NetMigrations": "netmig",
           "TFR": "tfr", "LEx": "lex", "CBR": "cbr", "CDR": "cdr", "MedianAgePop": "median_age"}


def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def read_medium(path=MED):
    """iso3 -> {name, pop: {year: persons}, drivers: {key: {year: value}}}."""
    out = {}
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            iso = r.get("ISO3_code") or ""
            if not iso or r.get("LocTypeName") != "Country/Area":
                continue
            y = int(r["Time"])
            if y > END:
                continue
            c = out.setdefault(iso, {"name": r["Location"], "pop": {}, "drivers": defaultdict(dict)})
            p = fnum(r.get("TPopulation1July"))
            if p is not None:
                c["pop"][y] = p * 1000.0
            for col, key in DRIVERS.items():
                v = fnum(r.get(col))
                if v is None:
                    continue
                if key in ("births", "deaths", "netmig"):
                    v *= 1000.0
                c["drivers"][key][y] = v
    return out


def read_variants(path=OTH, isos=None):
    """iso3 -> {pi: {year: {med, lo80, hi80, lo95, hi95}}, scen: {key: {year: persons}}}."""
    out = {}
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            var = r.get("Variant") or ""
            if var not in PI and var not in SCENARIOS:
                continue
            iso = r.get("ISO3_code") or ""
            if not iso or (isos is not None and iso not in isos):
                continue
            y = int(r["Time"])
            if y > END:
                continue
            p = fnum(r.get("TPopulation1July"))
            if p is None:
                continue
            c = out.setdefault(iso, {"pi": defaultdict(dict), "scen": defaultdict(dict)})
            if var in PI:
                c["pi"][y][PI[var]] = p * 1000.0
            else:
                c["scen"][SCENARIOS[var]][y] = p * 1000.0
    return out


def load_site_countries(path=COUNTRIES, pop_path=None):
    """iso3 -> (slug, name) for the site's countries. countries.json carries
    no iso3; country-population.json does, keyed by the same slug."""
    pop_path = pop_path or os.path.join(os.path.dirname(path), "country-population.json")
    with open(path, encoding="utf-8") as fh:
        doc = json.load(fh)
    rows = doc["countries"] if isinstance(doc, dict) and "countries" in doc else doc
    names = {c["slug"]: c.get("name") or c["slug"] for c in rows if c.get("slug")}
    with open(pop_path, encoding="utf-8") as fh:
        pops = json.load(fh)["countries"]
    out = {}
    for slug, c in pops.items():
        iso = (c.get("iso3") or "").upper()
        if iso:
            out[iso] = (slug, names.get(slug, slug))
    return out


def facts(pop, pi, drivers):
    """What the median implies, computed once here so every surface agrees.

    pop: {year: persons} medium 1950-2100 (estimates then medium projection).
    pi:  {year: {med, lo80, hi80, lo95, hi95}} 2024-2100.
    """
    years = sorted(pop)
    peak_y = max(years, key=lambda y: pop[y])
    base = pop.get(BASE_YEAR)
    at = lambda y: pi.get(y, {})  # noqa: E731
    # The first year natural change (births minus deaths) turns negative and
    # stays negative to 2100 on the medium path, if it does.
    nat_neg = None
    b, d = drivers.get("births", {}), drivers.get("deaths", {})
    for y in years:
        if y < 1950 or y not in b or y not in d:
            continue
        if b[y] < d[y] and all(b.get(z, 0) < d.get(z, 1) for z in range(y, END + 1) if z in b and z in d):
            nat_neg = y
            break
    # The first year of sustained decline on the median: population below
    # the previous year from here to 2100.
    decline = None
    for y in years:
        if y <= LAST_ESTIMATE:
            continue
        if all(pop.get(z, 0) <= pop.get(z - 1, 0) for z in range(y, END + 1) if z in pop and z - 1 in pop):
            decline = y
            break
    return {
        "peak": {"year": peak_y, "value": round(pop[peak_y]), "past": peak_y <= LAST_ESTIMATE},
        "base": {"year": BASE_YEAR, "value": round(base) if base else None},
        "y2050": {"med": round(at(2050).get("med", pop.get(2050, 0))),
                  "lo80": round(at(2050).get("lo80", 0)) or None, "hi80": round(at(2050).get("hi80", 0)) or None,
                  "lo95": round(at(2050).get("lo95", 0)) or None, "hi95": round(at(2050).get("hi95", 0)) or None},
        "y2100": {"med": round(at(2100).get("med", pop.get(2100, 0))),
                  "lo80": round(at(2100).get("lo80", 0)) or None, "hi80": round(at(2100).get("hi80", 0)) or None,
                  "lo95": round(at(2100).get("lo95", 0)) or None, "hi95": round(at(2100).get("hi95", 0)) or None},
        "multiple2100": round(pop[2100] / base, 3) if base and 2100 in pop else None,
        "declineFrom": decline,
        "naturalDeclineFrom": nat_neg,
    }


def build(med_path=MED, oth_path=OTH, countries_path=COUNTRIES):
    site = load_site_countries(countries_path)
    medium = read_medium(med_path)
    variants = read_variants(oth_path, set(medium))
    files, index, unmatched = {}, [], []
    for iso, m in sorted(medium.items()):
        if iso not in site:
            unmatched.append({"iso3": iso, "name": m["name"]})
            continue
        slug, name = site[iso]
        v = variants.get(iso, {"pi": {}, "scen": {}})
        pop = m["pop"]
        pi = v["pi"]
        f = facts(pop, pi, m["drivers"])
        est = [[y, round(pop[y])] for y in sorted(pop) if y <= LAST_ESTIMATE]
        proj = [[y, round(pi[y].get("med", pop.get(y, 0))), round(pi[y].get("lo80", 0)), round(pi[y].get("hi80", 0)),
                 round(pi[y].get("lo95", 0)), round(pi[y].get("hi95", 0))]
                for y in sorted(pi) if y > LAST_ESTIMATE]
        scen = {k: [[y, round(s[y])] for y in sorted(s)] for k, s in v["scen"].items()}
        drv = {k: [[y, round(val, 3 if k in ("tfr", "lex", "cbr", "cdr", "median_age") else 0)]
                   for y, val in sorted(series.items())] for k, series in m["drivers"].items()}
        files[slug] = {
            "slug": slug, "iso3": iso, "name": name, "un_name": m["name"],
            "revision": REVISION, "last_estimate": LAST_ESTIMATE, "end": END,
            "source_credit": SOURCE_CREDIT,
            "estimates": est, "projection": proj, "scenarios": scen, "drivers": drv, "facts": f,
        }
        # The board carries the whole path, one integer per year from
        # PATH_START (estimates, then the median) to 2100, so /countries/2100 can draw every country as a
        # line rather than three points a quarter-century apart (Ashwin,
        # 2026-09-10). Bands stay in the per-country file: a multi-country
        # chart cannot carry them legibly.
        # Estimates to LAST_ESTIMATE, the median after; one integer per year from PATH_START.
        path = [round(pi[y].get("med", pop.get(y, 0))) if (y > LAST_ESTIMATE and y in pi) else round(pop.get(y, 0)) for y in range(PATH_START, END + 1)]
        index.append({"slug": slug, "iso3": iso, "name": name,
                      **{k: f[k] for k in ("peak", "base", "y2050", "y2100", "multiple2100", "declineFrom", "naturalDeclineFrom")},
                      "path": path})
    return files, index, unmatched


def self_test():
    """Pure decision logic on a hand-built country: a peak in the past, a
    natural decline that starts and holds, and a band read off the PI rows."""
    pop = {y: 1000.0 - 5.0 * max(0, y - 2010) + 20.0 * min(y - 1950, 60) for y in range(1950, 2101)}
    # Peaks in 2010 (growth stops), then falls 5 a year: decline from 2011.
    pi = {y: {"med": pop[y], "lo80": pop[y] * 0.9, "hi80": pop[y] * 1.1, "lo95": pop[y] * 0.8, "hi95": pop[y] * 1.2}
          for y in range(2024, 2101)}
    drivers = {"births": {y: 30.0 for y in range(1950, 2101)},
               "deaths": {y: (20.0 if y < 2030 else 40.0) for y in range(1950, 2101)}}
    f = facts(pop, pi, drivers)
    assert f["peak"]["year"] == 2010 and f["peak"]["past"] is True, f["peak"]
    assert f["declineFrom"] == 2024, f["declineFrom"]          # first projected year of a fall that holds
    assert f["naturalDeclineFrom"] == 2030, f["naturalDeclineFrom"]
    assert f["y2100"]["lo95"] == round(pop[2100] * 0.8) and f["y2100"]["hi80"] == round(pop[2100] * 1.1)
    assert abs(f["multiple2100"] - pop[2100] / pop[2025]) < 1e-3
    # A rising country has no decline year and a peak at 2100
    pop2 = {y: 100.0 + y for y in range(1950, 2101)}
    f2 = facts(pop2, {}, {"births": {}, "deaths": {}})
    assert f2["peak"]["year"] == 2100 and f2["declineFrom"] is None and f2["naturalDeclineFrom"] is None
    # Units: the reader multiplies thousands into persons exactly once
    assert fnum("41454.762") == 41454.762 and fnum("") is None
    print("build_population_2100 self-test: OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return 0
    if not (a.dry or a.write):
        ap.error("pass --self-test, --dry or --write")
    files, index, unmatched = build()
    print("%d countries joined, %d UN locations unmatched" % (len(files), len(unmatched)))
    for u in unmatched[:15]:
        print("   unmatched: %s %s" % (u["iso3"], u["name"]))
    peaks_past = sum(1 for r in index if r["peak"]["past"])
    print("peak already passed: %d; median declining by 2100: %d" % (peaks_past, sum(1 for r in index if r["declineFrom"])))
    for slug in ("nigeria", "china", "india", "japan", "united-states", "united-kingdom"):
        r = next((x for x in index if x["slug"] == slug), None)
        if r:
            print("  %-15s 2025 %5.0fm  2050 %5.0fm  2100 %5.0fm [95%%: %5.0f-%5.0fm]  peak %d%s  x%.2f" % (
                slug, (r["base"]["value"] or 0) / 1e6, r["y2050"]["med"] / 1e6, r["y2100"]["med"] / 1e6,
                (r["y2100"]["lo95"] or 0) / 1e6, (r["y2100"]["hi95"] or 0) / 1e6, r["peak"]["year"],
                " (past)" if r["peak"]["past"] else "", r["multiple2100"] or 0))
    if not a.write:
        print("--dry: nothing written")
        return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, doc in files.items():
        with open(os.path.join(OUT_DIR, "%s.json" % slug), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(doc, fh, separators=(",", ":"), ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"_meta": {"asOf": "2024-07-11", "revision": REVISION, "last_estimate": LAST_ESTIMATE,
                             "end": END, "base_year": BASE_YEAR, "path_start": PATH_START, "source_credit": SOURCE_CREDIT,
                             "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")},
                   "countries": sorted(index, key=lambda r: -(r["base"]["value"] or 0)),
                   "unmatched": unmatched}, fh, separators=(",", ":"), ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR))
    print("wrote %d files to %s (%.1f MB)" % (len(files) + 1, OUT_DIR, total / 1e6))
    return 0


if __name__ == "__main__":
    sys.exit(main())
