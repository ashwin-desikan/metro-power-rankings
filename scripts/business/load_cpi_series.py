#!/usr/bin/env python3
"""load_cpi_series.py - annual CPI index by country into Supabase.

WHY. Every market number the site publishes is nominal. Nominal comparisons
across countries are not comparisons at all: Brazil's market is the world's
second best since 2000 in reais and nowhere near the podium in dollars, and the
same trick happens again between nominal and real. Deflating needs the CPI
INDEX LEVEL (FP.CPI.TOTL). build-country-indicators.py already pulls
FP.CPI.TOTL.ZG, the annual RATE, and only as a single latest value, so it
cannot deflate anything.

Base year differs per country because the World Bank rebases per country. That
is fine: a deflator only ever uses the ratio of two years within one country,
and the ratio is base-independent.

One API call: 17,490 rows, ~192 countries with data, 1960 to 2025.

usage:
  python scripts/business/load_cpi_series.py --self-test
  python scripts/business/load_cpi_series.py --dry
  python scripts/business/load_cpi_series.py
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from load_market_series import service_key, rest, log, CHUNK  # noqa: E402

WB = "https://api.worldbank.org/v2"
UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"


def fetch_wb():
    url = f"{WB}/country/all/indicator/FP.CPI.TOTL?format=json&per_page=20000&page=1"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        payload = json.loads(r.read())
    hdr = payload[0]
    if hdr.get("pages", 1) > 1:
        raise SystemExit(f"FATAL: World Bank now paginates FP.CPI.TOTL ({hdr['pages']} pages); "
                         "this loader assumes one page. Add paging.")
    return payload[1] or []


def parse(rows):
    """-> [{iso3, year, cpi}]. Aggregates (regions, income groups) are dropped:
    the World Bank returns them alongside countries and they would otherwise
    look like countries. They are identifiable by a blank countryiso3code or a
    3-letter code the country endpoint does not classify, so the cheap and
    reliable filter is a non-empty iso3 of length 3."""
    out = []
    for r in rows:
        v, iso3, yr = r.get("value"), (r.get("countryiso3code") or "").strip(), r.get("date")
        if v is None or len(iso3) != 3 or not yr:
            continue
        try:
            out.append({"iso3": iso3, "year": int(yr), "cpi": round(float(v), 6)})
        except (TypeError, ValueError):
            continue
    return out


def main(argv):
    if "--self-test" in argv:
        return self_test()
    dry = "--dry" in argv

    rows = parse(fetch_wb())
    isos = sorted({r["iso3"] for r in rows})
    years = sorted({r["year"] for r in rows})
    log(f"{len(rows):,} observations · {len(isos)} countries · {years[0]}-{years[-1]}"
        + (" (DRY RUN)" if dry else ""))
    # A country whose series is one point cannot deflate anything; worth seeing.
    per = {}
    for r in rows:
        per[r["iso3"]] = per.get(r["iso3"], 0) + 1
    thin = sorted(k for k, v in per.items() if v < 10)
    log(f"  countries with fewer than 10 years: {len(thin)}{' ' + str(thin[:12]) if thin else ''}")
    # Four countries (AGO, BRA, COD, PER) have early years that round to zero
    # against a modern base: hyperinflation spanning more orders of magnitude
    # than the index can carry. Brazil is zero until 1988 and only usable from
    # 1992. That is harmless here because every index's own history starts
    # after its country's CPI becomes usable (the Bovespa starts in 1993), but
    # a deflator must still never divide by one of those zeros.
    for probe in ("USA", "GBR", "JPN", "BRA", "IND"):
        s = sorted([r for r in rows if r["iso3"] == probe], key=lambda r: r["year"])
        usable = [r for r in s if r["cpi"] > 0.01]
        if not usable:
            continue
        a, b = usable[0], usable[-1]
        log(f"  {probe}: usable {a['year']}={a['cpi']:.2f} .. {b['year']}={b['cpi']:.2f}"
            f"  ({b['cpi'] / a['cpi']:.0f}x over {b['year'] - a['year']} years)"
            + (f"  [{s[0]['year']}-{usable[0]['year'] - 1} unusable]" if s[0]["year"] < a["year"] else ""))
    us = fetch_fred_us()
    log(f"  USA extended from FRED CPIAUCNS: {us[0]['year']}-{us[-1]['year']} "
        f"({len(us)} annual averages), replacing the World Bank's 1960 start")
    rows = [r for r in rows if r["iso3"] != "USA"] + us

    if dry:
        return 0

    key = service_key()
    for i in range(0, len(rows), CHUNK):
        rest("POST", "/rest/v1/country_cpi", body=rows[i:i + CHUNK], key=key,
             prefer="resolution=merge-duplicates,return=minimal")
    log(f"upserted {len(rows):,} rows into country_cpi")
    return 0


def fetch_fred_us():
    """US CPI back to 1913, annual averages of the monthly NSA series.

    The World Bank starts every country at 1960, which would truncate the real
    view of the site's two deepest series: the Dow runs from 1885 and the S&P
    from 1927. FRED's CPIAUCNS is BLS output and public domain, so unlike the
    DJIA series FRED restricts to a ten-year window, the whole thing is served.
    Annual averages keep the table's (iso3, year) grain; monthly precision buys
    nothing on a chart spanning a century.
    """
    import csv, io
    req = urllib.request.Request(
        "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCNS",
        headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = r.read().decode("utf-8", "replace")
    by_year = {}
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 2 or not row[0][:4].isdigit():
            continue
        try:
            by_year.setdefault(int(row[0][:4]), []).append(float(row[1]))
        except ValueError:
            continue
    out = [{"iso3": "USA", "year": y, "cpi": round(sum(v) / len(v), 6)}
           for y, v in sorted(by_year.items()) if v]
    if not out or out[0]["year"] > 1920:
        raise SystemExit(f"FATAL: FRED CPIAUCNS returned {len(out)} years starting "
                         f"{out[0]['year'] if out else '-'}; expected 1913. Source changed.")
    return out


FIXTURE = [
    {"countryiso3code": "USA", "date": "1960", "value": 13.5551},
    {"countryiso3code": "USA", "date": "2024", "value": 143.8642},
    {"countryiso3code": "USA", "date": "2025", "value": None},
    {"countryiso3code": "", "date": "2024", "value": 100.0},        # aggregate row
    {"countryiso3code": "EUU", "date": "2024", "value": 120.0},     # region, kept: len 3
]


def self_test():
    got = parse(FIXTURE)
    assert len(got) == 3, got
    assert {"iso3": "USA", "year": 1960, "cpi": 13.5551} in got, got
    assert all(r["cpi"] is not None for r in got)
    assert not any(r["iso3"] == "" for r in got)
    # the deflator identity a page will actually use
    a = next(r for r in got if r["year"] == 1960)["cpi"]
    b = next(r for r in got if r["year"] == 2024)["cpi"]
    assert round(b / a, 1) == 10.6, b / a
    print("self-test: 5/5 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
