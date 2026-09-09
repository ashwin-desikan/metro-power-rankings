#!/usr/bin/env python3
"""build_housing.py - the Housing tab of /business/economy (scoping note
"Macro Hub - scoping 2026-09-08.md", section 4; session prompt 2026-09-09
item A).

WHAT IT READS
  _scratch/macro/housing/HPI_master.csv   FHFA's all-series master file
    (https://www.fhfa.gov/hpi/download/monthly/hpi_master.csv, 17 MB, quarterly
    at MSA level; downloaded on the Windows box 2026-09-09, 186,011 rows).
    Three flavors exist at MSA level: purchase-only (the 100 largest MSAs,
    SA and NSA), all-transactions (every MSA, NSA only) and expanded-data.
  _scratch/macro/housing/cpi_us.json      US CPI, annual index, from the
    World Bank API (FP.CPI.TOTL, country USA), fetched once with --fetch-cpi
    and cached. The deflator only ever uses the ratio of two years, so the
    base year does not matter (scripts/business/load_cpi_series.py).
  public/data/metros.json                 the 596 US metros; the crosswalk
    joins FHFA's "City-City, ST-ST" place names to metro name + state.

WHAT IT WRITES (only with --write)
  public/data/business/economy/housing/index.json
    one row per matched or unmatched FHFA MSA: cbsa, name, flavor, division
    flag, metro slug, latest index, growth over 1/5/10/25 years and since
    2000 in nominal AND real terms, the 2007-2012 drawdown, plus the US and
    Census-division rows, the CPI deflator by year and the crosswalk stats.
  public/data/business/economy/housing/msa/<cbsa>.json
    the full quarterly series for that MSA: [yr, q, nsa, sa|null, real_nsa].

THE RULES THE PAGE PROMISES
  - Purchase-only where FHFA publishes it (the 100 largest), all-transactions
    as the fallback for the rest, and every row says which it is showing.
  - Real terms by default (deflated by CPI, annual), nominal as the toggle;
    both are precomputed here so the page has nothing to derive.
  - The eleven largest metros exist in FHFA only as their principal
    METROPOLITAN DIVISION (New York-Jersey City-White Plains, Los Angeles-Long
    Beach-Glendale, and so on); those rows carry `division: true` and the page
    says "principal division" rather than pretending it is the whole metro.
  - The crosswalk is auto-matched by principal city and state and then
    corrected by OVERRIDES below; a metro that matches nothing is simply not
    in the file. Never guessed.

usage
  python scripts/macro/housing/build_housing.py --self-test
  python scripts/macro/housing/build_housing.py --fetch-cpi      # once, needs egress
  python scripts/macro/housing/build_housing.py                  # dry run: counts, no write
  python scripts/macro/housing/build_housing.py --write
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SCRATCH = os.path.join(ROOT, "_scratch", "macro", "housing")
HPI_CSV = os.path.join(SCRATCH, "HPI_master.csv")
CPI_JSON = os.path.join(SCRATCH, "cpi_us.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "business", "economy", "housing")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

WB_CPI = "https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL?format=json&per_page=200"
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"

STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC",
    "DC": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
    "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
    "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
    "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "Puerto Rico": "PR",
}

# Metro slug -> FHFA place_id, for the metros the name match cannot settle.
# Each one was checked against the FHFA place name by hand on 2026-09-09.
OVERRIDES = {
    "new-york": "35614",               # New York-Jersey City-White Plains, NY-NJ (MSAD)
    "san-francisco-san-jose": "41884", # San Francisco-San Mateo-Redwood City, CA (MSAD); San Jose is 41940 and stays separate
    "los-angeles": "31084",            # Los Angeles-Long Beach-Glendale, CA (MSAD)
    "washington-baltimore": "47764",   # Washington, DC-MD (MSAD)
    "chicago": "16984",                # Chicago-Naperville-Schaumburg, IL (MSAD)
    "boston": "14454",                 # Boston, MA (MSAD)
    "miami": "33124",                  # Miami-Miami Beach-Kendall, FL (MSAD)
    "philadelphia": "37964",           # Philadelphia, PA (MSAD)
    "seattle": "42644",                # Seattle-Bellevue-Kent, WA (MSAD)
    "dallas": "19124",                 # Dallas-Plano-Irving, TX (MSAD)
    "atlanta": "12054",                # Atlanta-Sandy Springs-Roswell, GA (MSAD)
    "detroit": "19804",                # Detroit-Dearborn-Livonia, MI (MSAD)
    "tampa": "45294",                  # Tampa, FL (MSAD)
    "honolulu": "46520",               # Urban Honolulu, HI
    "monterey": "41500",               # Salinas, CA (Monterey County)
}

DRAWDOWN_FROM, DRAWDOWN_TO = 2007, 2012


def norm(s: str) -> str:
    s = s.lower().replace("saint ", "st ").replace("st. ", "st ")
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"[^a-z]", "", s)


def parse_place(place_name: str):
    """'New York-Jersey City-White Plains, NY-NJ (MSAD)' -> (['newyork', ...], ['NY','NJ'], True)"""
    division = "(MSAD)" in place_name
    name = place_name.replace("(MSAD)", "").strip()
    city_part, _, state_part = name.rpartition(", ")
    cities = [norm(c) for c in city_part.split("-")]
    states = [s.strip() for s in state_part.split("-") if s.strip()]
    return cities, states, division


def read_hpi(path=HPI_CSV):
    """MSA rows only, grouped by (place_id, flavor) -> list of (yr, q, nsa, sa)."""
    series = defaultdict(list)
    names = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            # 🔴 hpi_type MUST be filtered. The master file carries a
            # "distress-free" purchase-only series for 14 MSAs and a
            # "manufactured" series at the national level under the SAME
            # place_id and flavor; without this filter those rows interleave
            # with the traditional index and the USA row read a 39% year and
            # a 55% crash (measured 2026-09-09 before the filter existed).
            if r["hpi_type"] != "traditional" or r["level"] != "MSA" or r["frequency"] != "quarterly":
                continue
            pid = r["place_id"]
            names[pid] = r["place_name"]
            nsa = float(r["index_nsa"]) if r["index_nsa"] else None
            sa = float(r["index_sa"]) if r["index_sa"] else None
            if nsa is None:
                continue
            series[(pid, r["hpi_flavor"])].append((int(r["yr"]), int(r["period"]), nsa, sa))
    for k in series:
        series[k].sort()
    return names, series


def crosswalk(metros, names):
    """metro slug -> place_id. Auto match on principal city + state, MSAD only
    as a fallback, then OVERRIDES. Returns (mapping, unmatched_metros)."""
    by_state = defaultdict(list)
    parsed = {}
    for pid, pn in names.items():
        cities, states, division = parse_place(pn)
        parsed[pid] = (cities, states, division)
        for st in states:
            by_state[st].append(pid)
    mapping, unmatched = {}, []
    used = set()
    for m in metros:
        slug = m["slug"]
        if slug in OVERRIDES:
            mapping[slug] = OVERRIDES[slug]
            used.add(OVERRIDES[slug])
            continue
        st = STATE_ABBR.get(m.get("primaryState") or "")
        n = norm(m["name"])
        pc = norm(m.get("primaryCity") or m["name"])
        cands = [p for p in by_state.get(st, []) if p not in used]
        plain = [p for p in cands if not parsed[p][2]]
        hit = next((p for p in plain if n in parsed[p][0] or pc in parsed[p][0]), None)
        if hit is None:
            hit = next((p for p in plain if parsed[p][0] and (parsed[p][0][0].startswith(n) or n.startswith(parsed[p][0][0]))), None)
        if hit is None:
            hit = next((p for p in cands if parsed[p][2] and (n in parsed[p][0] or pc in parsed[p][0])), None)
        if hit is None:
            unmatched.append(slug)
            continue
        mapping[slug] = hit
        used.add(hit)
    return mapping, unmatched


def load_cpi(path=CPI_JSON):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    return {int(k): float(v) for k, v in d.items()}


def fetch_cpi(path=CPI_JSON):
    req = urllib.request.Request(WB_CPI, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        payload = json.loads(r.read())
    out = {}
    for row in payload[1]:
        if row.get("value") is not None:
            out[int(row["date"])] = float(row["value"])
    if len(out) < 40:
        raise RuntimeError("World Bank CPI answer too short: {} years".format(len(out)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(out.items())), f)
    return out


def deflator(cpi, year, base_year):
    """Multiply a nominal index in `year` by this to state it in base-year
    dollars. A year past the last CPI print uses the last print (flagged in
    the index as `cpi_last_year`), never an extrapolation."""
    last = max(cpi)
    y = min(year, last)
    return cpi[base_year] / cpi[y]


def pct_change(series, years_back, latest):
    """% change from the same quarter `years_back` years before the latest."""
    yr, q, v = latest
    target = (yr - years_back, q)
    for row in series:
        if (row[0], row[1]) == target:
            return round((v / row[2] - 1) * 100, 1) if row[2] else None
    return None


def since_year(series, year, latest):
    yr, q, v = latest
    first = next((r for r in series if r[0] == year and r[1] == 1), None)
    return round((v / first[2] - 1) * 100, 1) if first and first[2] else None


def drawdown(series, y0=DRAWDOWN_FROM, y1=DRAWDOWN_TO):
    """Largest peak-to-trough fall inside [y0, y1], as (peak_label, trough_label, pct)."""
    window = [r for r in series if y0 <= r[0] <= y1]
    if len(window) < 2:
        return None
    best = None
    peak = None
    for r in window:
        if peak is None or r[2] > peak[2]:
            peak = r
        fall = (r[2] / peak[2] - 1) * 100
        if best is None or fall < best[2]:
            best = (peak, r, fall)
    if best is None or best[2] >= 0:
        return None
    (py, pq, _, _), (ty, tq, _, _), fall = best
    return {"peak": "{}Q{}".format(py, pq), "trough": "{}Q{}".format(ty, tq), "pct": round(fall, 1)}


def build_rows(names, series, mapping, cpi, base_year):
    slug_by_pid = {pid: slug for slug, pid in mapping.items()}
    rows = []
    per_msa = {}
    for pid, pn in sorted(names.items(), key=lambda kv: kv[1]):
        flavor = "purchase-only" if (pid, "purchase-only") in series else "all-transactions"
        nominal = series.get((pid, flavor))
        if not nominal:
            continue
        real = [(yr, q, round(nsa * deflator(cpi, yr, base_year), 2), sa) for (yr, q, nsa, sa) in nominal]
        latest_n = (nominal[-1][0], nominal[-1][1], nominal[-1][2])
        latest_r = (real[-1][0], real[-1][1], real[-1][2])
        cities, states, division = parse_place(pn)
        row = {
            "cbsa": pid,
            "name": pn.replace(" (MSAD)", ""),
            "states": states,
            "division": division,
            "flavor": flavor,
            "metro": slug_by_pid.get(pid),
            "first": "{}Q{}".format(nominal[0][0], nominal[0][1]),
            "latest": "{}Q{}".format(nominal[-1][0], nominal[-1][1]),
            "index": nominal[-1][2],
            "index_sa": nominal[-1][3],
            "nominal": {
                "y1": pct_change(nominal, 1, latest_n), "y5": pct_change(nominal, 5, latest_n),
                "y10": pct_change(nominal, 10, latest_n), "y25": pct_change(nominal, 25, latest_n),
                "since2000": since_year(nominal, 2000, latest_n),
                "drawdown": drawdown(nominal),
            },
            "real": {
                "y1": pct_change(real, 1, latest_r), "y5": pct_change(real, 5, latest_r),
                "y10": pct_change(real, 10, latest_r), "y25": pct_change(real, 25, latest_r),
                "since2000": since_year(real, 2000, latest_r),
                "drawdown": drawdown(real),
            },
        }
        rows.append(row)
        per_msa[pid] = {
            "cbsa": pid, "name": row["name"], "flavor": flavor, "division": division,
            "metro": row["metro"], "base_year": base_year,
            "series": [[yr, q, nsa, sa, r[2]] for (yr, q, nsa, sa), r in zip(nominal, real)],
        }
    return rows, per_msa


def national(series_all_levels_path, cpi, base_year):
    """USA and Census-division rows (purchase-only, quarterly, SA and NSA)."""
    out = []
    with open(series_all_levels_path, newline="", encoding="utf-8") as f:
        by = defaultdict(list)
        for r in csv.DictReader(f):
            if r["hpi_type"] == "traditional" and r["level"] == "USA or Census Division" and r["hpi_flavor"] == "purchase-only" and r["frequency"] == "quarterly" and r["index_nsa"]:
                by[(r["place_id"], r["place_name"])].append((int(r["yr"]), int(r["period"]), float(r["index_nsa"]), float(r["index_sa"]) if r["index_sa"] else None))
    for (pid, pn), rows in by.items():
        rows.sort()
        real = [(yr, q, round(nsa * deflator(cpi, yr, base_year), 2), sa) for (yr, q, nsa, sa) in rows]
        ln = (rows[-1][0], rows[-1][1], rows[-1][2]); lr = (real[-1][0], real[-1][1], real[-1][2])
        out.append({
            "id": pid, "name": pn, "latest": "{}Q{}".format(rows[-1][0], rows[-1][1]), "index": rows[-1][2],
            "nominal": {"y1": pct_change(rows, 1, ln), "y10": pct_change(rows, 10, ln), "since2000": since_year(rows, 2000, ln), "drawdown": drawdown(rows)},
            "real": {"y1": pct_change(real, 1, lr), "y10": pct_change(real, 10, lr), "since2000": since_year(real, 2000, lr), "drawdown": drawdown(real)},
            "series": [[yr, q, nsa, sa, r[2]] for (yr, q, nsa, sa), r in zip(rows, real)],
        })
    out.sort(key=lambda r: (r["id"] != "USA", r["name"]))
    return out


def self_test():
    # place-name parsing, including a division and a two-state name
    assert parse_place("New York-Jersey City-White Plains, NY-NJ (MSAD)") == (["newyork", "jerseycity", "whiteplains"], ["NY", "NJ"], True)
    assert parse_place("St. Louis, MO-IL")[0] == ["stlouis"]
    assert parse_place("Urban Honolulu, HI") == (["urbanhonolulu"], ["HI"], False)
    # deflator: ratio of two years, base-independent; a year past the last print uses the last print
    cpi = {2000: 100.0, 2010: 125.0, 2020: 150.0}
    assert abs(deflator(cpi, 2000, 2020) - 1.5) < 1e-9
    assert abs(deflator(cpi, 2035, 2020) - 1.0) < 1e-9
    # growth from the same quarter N years back, and None when that quarter is absent
    s = [(2000, 1, 100.0, None), (2001, 1, 110.0, None), (2005, 1, 150.0, None)]
    assert pct_change(s, 5, (2005, 1, 150.0)) == 50.0
    assert pct_change(s, 4, (2005, 1, 150.0)) == 36.4
    assert pct_change(s, 3, (2005, 1, 150.0)) is None
    assert since_year(s, 2000, (2005, 1, 150.0)) == 50.0
    # drawdown inside the window, peak before trough, the deepest fall
    s2 = [(2006, 4, 200.0, None), (2007, 1, 210.0, None), (2008, 1, 180.0, None), (2009, 2, 147.0, None), (2011, 1, 150.0, None), (2012, 4, 160.0, None), (2013, 1, 170.0, None)]
    d = drawdown(s2)
    assert d == {"peak": "2007Q1", "trough": "2009Q2", "pct": -30.0}, d
    assert drawdown([(2007, 1, 100.0, None), (2012, 4, 120.0, None)]) is None
    # crosswalk: an override beats the name match, a plain MSA beats a division, no double use
    metros = [{"slug": "new-york", "name": "New York", "primaryState": "New York"},
              {"slug": "akron", "name": "Akron", "primaryState": "Ohio"},
              {"slug": "canton", "name": "Canton", "primaryState": "Ohio"},
              {"slug": "nowhere", "name": "Nowhere", "primaryState": "Ohio"}]
    names = {"35614": "New York-Jersey City-White Plains, NY-NJ (MSAD)", "10420": "Akron, OH", "15940": "Canton-Massillon, OH"}
    mp, un = crosswalk(metros, names)
    assert mp == {"new-york": "35614", "akron": "10420", "canton": "15940"} and un == ["nowhere"], (mp, un)
    # read_hpi keeps only the traditional index: a distress-free row for the
    # same MSA and quarter must not land in the series
    import tempfile
    tmp = os.path.join(tempfile.mkdtemp(), "hpi.csv")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["hpi_type", "hpi_flavor", "frequency", "level", "place_name", "place_id", "yr", "period", "index_nsa", "index_sa", "rstderr", "note"])
        w.writerow(["traditional", "purchase-only", "quarterly", "MSA", "Akron, OH", "10420", "2020", "1", "200.0", "199.0", "", ""])
        w.writerow(["distress-free", "purchase-only", "quarterly", "MSA", "Akron, OH", "10420", "2020", "1", "300.0", "", "", ""])
        w.writerow(["traditional", "all-transactions", "quarterly", "MSA", "Akron, OH", "10420", "2020", "1", "150.0", "", "", ""])
    nm, sr = read_hpi(tmp)
    assert sr[("10420", "purchase-only")] == [(2020, 1, 200.0, 199.0)], sr
    assert sr[("10420", "all-transactions")] == [(2020, 1, 150.0, None)]
    print("build_housing self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fetch-cpi", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--base-year", type=int, default=None, help="real-terms base year (default: last CPI year)")
    args = ap.parse_args()
    if args.self_test:
        self_test(); return
    if args.fetch_cpi:
        cpi = fetch_cpi()
        print("CPI fetched: {} years, {}..{}".format(len(cpi), min(cpi), max(cpi))); return
    if not os.path.exists(HPI_CSV):
        sys.exit("missing {} (download FHFA's hpi_master.csv on a machine with egress)".format(HPI_CSV))
    if not os.path.exists(CPI_JSON):
        sys.exit("missing {} (run --fetch-cpi once on a machine with egress)".format(CPI_JSON))
    cpi = load_cpi()
    base_year = args.base_year or max(cpi)
    with open(METROS, encoding="utf-8") as f:
        metros = [m for m in json.load(f) if m.get("country") == "United States"]
    names, series = read_hpi()
    mapping, unmatched = crosswalk(metros, names)
    rows, per_msa = build_rows(names, series, mapping, cpi, base_year)
    nat = national(HPI_CSV, cpi, base_year)
    po = sum(1 for r in rows if r["flavor"] == "purchase-only")
    print("FHFA MSAs: {} ({} purchase-only, {} all-transactions, {} divisions)".format(len(rows), po, len(rows) - po, sum(1 for r in rows if r["division"])))
    print("crosswalk: {} of {} US metros matched, {} FHFA MSAs without a metro".format(len(mapping), len(metros), sum(1 for r in rows if not r["metro"])))
    print("unmatched metros by rank (first 20): {}".format(", ".join(unmatched[:20])))
    print("real terms: base year {}, CPI {}..{}".format(base_year, min(cpi), max(cpi)))
    latest = max(r["latest"] for r in rows)
    print("latest quarter in the file: {}".format(latest))
    if not args.write:
        print("dry run: nothing written (pass --write)"); return
    os.makedirs(os.path.join(OUT_DIR, "msa"), exist_ok=True)
    built = __import__("datetime").date.today().isoformat()
    index = {
        # _meta.asOf is what scripts/check-data-currency.mjs reads
        "_meta": {"asOf": built},
        "built": built,
        "source": "FHFA House Price Index, hpi_master.csv (quarterly, MSA level); purchase-only where published, all-transactions otherwise",
        "latest": latest,
        "base_year": base_year,
        "cpi_last_year": max(cpi),
        "cpi": {str(k): v for k, v in sorted(cpi.items())},
        "crosswalk": {"matched": len(mapping), "us_metros": len(metros), "unmatched": unmatched},
        "national": nat,
        "msas": rows,
    }
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"))
    for pid, d in per_msa.items():
        with open(os.path.join(OUT_DIR, "msa", "{}.json".format(pid)), "w", encoding="utf-8") as f:
            json.dump(d, f, separators=(",", ":"))
    print("wrote {} and {} MSA files".format(os.path.join(OUT_DIR, "index.json"), len(per_msa)))


if __name__ == "__main__":
    main()
