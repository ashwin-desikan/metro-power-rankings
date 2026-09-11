#!/usr/bin/env python3
"""build_prices.py - the Prices tab of /business/economy (queue brief
"Macro hub Prices tab", session 2026-09-11).

WHAT IT READS
  _scratch/macro/prices/cpiai.csv    BLS CPI-U (CUUR0000SA0), monthly, all
    items, 1913 on, via datahub.io's core/cpi-us package
    (raw.githubusercontent.com/datasets/cpi-us/main/data/cpiai.csv,
    columns Date,Index,Inflation; downloaded on the Windows box, which
    reaches GitHub raw; the cloud container does not).
  _scratch/macro/prices/ons_cpih.json   ONS CPIH, monthly index (series
    L522, dataset MM23), fetched once with --fetch-ons and cached
    (api.beta.ons.gov.uk/v1/data; the plain api.ons.gov.uk timeseries path
    404s from this box as of 2026-09-11, the beta v1 endpoint answers).
  _scratch/macro/prices/wb_cpi_all.json  World Bank annual CPI index
    (FP.CPI.TOTL, 2010=100) for every country, fetched once with
    --fetch-wb and cached (api.worldbank.org/v2/country/all/indicator,
    one page, ~17,500 rows - same endpoint scripts/business/load_cpi_series.py
    uses for the real-terms deflator, but that script upserts to Supabase
    for /business/markets; this one writes a static file for the Prices
    board, so the fetch is repeated here rather than shared).
  public/data/countries.json           the site's country list (slug, name)
  public/data/country-indicators.json  slug -> iso3/iso2, from
    scripts/build-country-indicators.py; used only to join the World
    Bank's iso3 rows back to a site slug and a flag code.

WHAT IT WRITES (only with --write)
  public/data/business/economy/prices/index.json
    US and UK monthly summaries (latest index/month, YoY, MoM, the last 30
    years of [year, month, index, yoy] trimmed for the chart) plus the
    annual World Bank table (latest value/year, 5- and 10-year annualised
    inflation) for every country the site holds a slug for.
  public/data/business/economy/prices/history/us.json
  public/data/business/economy/prices/history/uk.json
    the full monthly history for each, [[year, month, index], ...].

THE RULE THE PAGE PROMISES
  Both monthly series treat "the annual rate" the same way: YoY = this
  month's index over the index twelve months earlier, computed here from
  the index levels rather than trusting either source's own published
  rate, so the US and UK lines on the chart are computed identically.

usage
  python scripts/macro/prices/build_prices.py --self-test
  python scripts/macro/prices/build_prices.py --fetch-ons   # once, needs egress
  python scripts/macro/prices/build_prices.py --fetch-wb    # once, needs egress
  python scripts/macro/prices/build_prices.py                # dry run
  python scripts/macro/prices/build_prices.py --write
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
SCRATCH = os.path.join(ROOT, "_scratch", "macro", "prices")
US_CSV = os.path.join(SCRATCH, "cpiai.csv")
ONS_JSON = os.path.join(SCRATCH, "ons_cpih.json")
WB_JSON = os.path.join(SCRATCH, "wb_cpi_all.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "business", "economy", "prices")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")
INDICATORS = os.path.join(ROOT, "public", "data", "country-indicators.json")

UA = "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; +https://rankings.citizenofnowhere.org)"
US_URL = "https://raw.githubusercontent.com/datasets/cpi-us/main/data/cpiai.csv"
ONS_URL = "https://api.beta.ons.gov.uk/v1/data?uri=/economy/inflationandpriceindices/timeseries/l522/mm23"
WB_URL = "https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL?format=json&per_page=20000&page=1"

MONTH_NUM = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}

WINDOW_YEARS = 30


def parse_us_csv(text: str) -> list[tuple[int, int, float]]:
    """'Date,Index,Inflation' rows -> [(year, month, index), ...] sorted.
    The Inflation column (BLS's own MoM) is ignored: both countries' rates
    are computed here, in yoy_mom_series, from the index levels alone."""
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        d = row.get("Date", "")
        idx = row.get("Index", "")
        if len(d) < 7 or not idx:
            continue
        try:
            y, m = int(d[0:4]), int(d[5:7])
            out.append((y, m, float(idx)))
        except ValueError:
            continue
    out.sort()
    return out


def parse_ons_months(months: list[dict]) -> list[tuple[int, int, float]]:
    """ONS 'months' rows -> [(year, month, index), ...] sorted. `month` is
    the full name ("July"); `date` ("2026 JUL") is not used, month+year are."""
    out = []
    for row in months:
        mn = MONTH_NUM.get((row.get("month") or "").strip())
        yr = row.get("year")
        v = row.get("value")
        if mn is None or not yr or v in (None, "", "."):
            continue
        try:
            out.append((int(yr), mn, float(v)))
        except ValueError:
            continue
    out.sort()
    return out


def yoy_mom_series(series: list[tuple[int, int, float]]) -> list[tuple[int, int, float, float | None, float | None]]:
    """[(y, m, index)] -> [(y, m, index, yoy_pct|None, mom_pct|None)].
    Both rates are looked up by (year, month) key, not list offset, so a
    gap in the source data cannot silently misalign the comparison (the
    month-boundary case: January's MoM must read December of the PRIOR
    year, and a missing December must yield None rather than the wrong
    row)."""
    by_key = {(y, m): v for y, m, v in series}
    out = []
    for y, m, v in series:
        py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
        mom = round((v / by_key[(py, pm)] - 1) * 100, 2) if (py, pm) in by_key else None
        prev = by_key.get((y - 1, m))
        yoy = round((v / prev - 1) * 100, 2) if prev else None
        out.append((y, m, v, yoy, mom))
    return out


def parse_wb(rows: list[dict]) -> dict[str, dict[int, float]]:
    """World Bank FP.CPI.TOTL rows -> {iso3: {year: value}}. Aggregates
    (regions, income groups) carry a blank or non-3-letter countryiso3code
    and are dropped, same filter as load_cpi_series.py."""
    out: dict[str, dict[int, float]] = {}
    for r in rows:
        v = r.get("value")
        iso3 = (r.get("countryiso3code") or "").strip()
        yr = r.get("date")
        if v is None or len(iso3) != 3 or not yr:
            continue
        try:
            out.setdefault(iso3, {})[int(yr)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def annualised(series: dict[int, float], years_back: int) -> float | None:
    """CAGR over the trailing `years_back` years, ending at the series'
    latest year. None when the base year is missing or non-positive."""
    if not series:
        return None
    latest_year = max(series)
    base_year = latest_year - years_back
    base = series.get(base_year)
    latest = series[latest_year]
    if not base or base <= 0 or years_back <= 0:
        return None
    return round(((latest / base) ** (1 / years_back) - 1) * 100, 2)


def trim_window(rows: list[tuple], years: int = WINDOW_YEARS) -> list[tuple]:
    if not rows:
        return rows
    cutoff_y = rows[-1][0] - years
    return [r for r in rows if r[0] > cutoff_y or (r[0] == cutoff_y and r[1] >= rows[-1][1])]


def monthly_summary(series: list[tuple[int, int, float]], source: str) -> dict:
    full = yoy_mom_series(series)
    y, m, v, yoy, mom = full[-1]
    windowed = trim_window(full)
    return {
        "source": source,
        "latest_month": f"{y:04d}-{m:02d}",
        "latest_index": v,
        "yoy": yoy,
        "mom": mom,
        "series_30y": [[yy, mm, vv, yy2] for (yy, mm, vv, yy2, _mm2) in windowed],
    }


def fetch_ons(path: str = ONS_JSON) -> dict:
    req = urllib.request.Request(ONS_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        payload = json.loads(r.read())
    months = payload.get("months") or []
    if len(months) < 40:
        raise RuntimeError("ONS CPIH answer too short: {} months".format(len(months)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    return payload


def fetch_wb(path: str = WB_JSON) -> list[dict]:
    req = urllib.request.Request(WB_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        payload = json.loads(r.read())
    hdr = payload[0]
    if hdr.get("pages", 1) > 1:
        raise RuntimeError("World Bank now paginates FP.CPI.TOTL ({} pages); this loader assumes one page.".format(hdr["pages"]))
    rows = payload[1] or []
    if len(rows) < 5000:
        raise RuntimeError("World Bank CPI answer too short: {} rows".format(len(rows)))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    return rows


def build_annual(wb_by_iso3: dict[str, dict[int, float]], countries: list[dict], iso3_by_slug: dict[str, dict]) -> list[dict]:
    """One row per site country whose slug has a World Bank iso3 match AND
    at least one CPI observation. Never guessed: a country with a slug but
    no World Bank series is simply absent from the board."""
    rows = []
    for c in countries:
        slug = c["slug"]
        info = iso3_by_slug.get(slug)
        if not info:
            continue
        series = wb_by_iso3.get(info["iso3"])
        if not series:
            continue
        latest_year = max(series)
        rows.append({
            "slug": slug,
            "name": c["name"],
            "iso2": info["iso2"].lower(),
            "iso3": info["iso3"],
            "latest_value": round(series[latest_year], 2),
            "latest_year": latest_year,
            "cagr5": annualised(series, 5),
            "cagr10": annualised(series, 10),
        })
    rows.sort(key=lambda r: r["name"])
    return rows


def self_test():
    # US CSV parsing: header + a short run, an empty Index row skipped
    csv_text = "Date,Index,Inflation\n1913-01-01,9.8,\n2024-01-01,308.417,\n2024-02-01,310.326,0.62\n2025-01-01,315.605,\n"
    us = parse_us_csv(csv_text)
    assert us == [(1913, 1, 9.8), (2024, 1, 308.417), (2024, 2, 310.326), (2025, 1, 315.605)], us

    # ONS months parsing: full month name + year, a "." placeholder skipped
    months = [
        {"date": "2024 JAN", "value": "126.0", "year": "2024", "month": "January"},
        {"date": "2024 FEB", "value": ".", "year": "2024", "month": "February"},
        {"date": "2025 JAN", "value": "130.0", "year": "2025", "month": "January"},
    ]
    uk = parse_ons_months(months)
    assert uk == [(2024, 1, 126.0), (2025, 1, 130.0)], uk

    # YoY/MoM: the month-boundary case. January's MoM reads December of the
    # PRIOR year (index -1 in the list, not "month 0"), and a series with a
    # gap must return None rather than compare across it.
    s = [(2023, 11, 100.0), (2023, 12, 101.0), (2024, 1, 102.0), (2024, 12, 106.0), (2025, 1, 108.0)]
    ym = yoy_mom_series(s)
    jan24 = next(r for r in ym if r[:2] == (2024, 1))
    assert jan24[3] is None, jan24          # no Jan 2023 to compare against
    assert jan24[4] == round((102.0 / 101.0 - 1) * 100, 2), jan24  # Dec 2023, not "month 0"
    jan25 = next(r for r in ym if r[:2] == (2025, 1))
    assert jan25[3] == round((108.0 / 102.0 - 1) * 100, 2), jan25  # YoY vs Jan 2024
    assert jan25[4] == round((108.0 / 106.0 - 1) * 100, 2), jan25  # MoM vs Dec 2024
    # a gap: no 2022 data at all, so 2023's YoY must be None
    s2 = [(2023, 6, 100.0), (2024, 6, 110.0)]
    ym2 = yoy_mom_series(s2)
    assert ym2[0][3] is None and ym2[1][3] == 10.0, ym2

    # World Bank parsing drops aggregates (blank/short iso3), keeps countries
    wb_rows = [
        {"countryiso3code": "USA", "date": "2015", "value": 100.0},
        {"countryiso3code": "USA", "date": "2020", "value": 110.0},
        {"countryiso3code": "USA", "date": "2025", "value": 121.0},
        {"countryiso3code": "", "date": "2025", "value": 999.0},
        {"countryiso3code": "GBR", "date": "2025", "value": 130.0},
    ]
    wb = parse_wb(wb_rows)
    assert set(wb.keys()) == {"USA", "GBR"}, wb
    assert wb["USA"][2015] == 100.0 and wb["USA"][2025] == 121.0

    # annualised: exact CAGR over an exact-year window; None with no base year
    assert annualised({2015: 100.0, 2020: 110.0, 2025: 121.0}, 5) == round((121.0 / 110.0) ** 0.2 * 100 - 100, 2)
    assert annualised({2015: 100.0, 2025: 121.0}, 5) is None  # no 2020

    print("build_prices self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fetch-ons", action="store_true")
    ap.add_argument("--fetch-wb", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test(); return
    if args.fetch_ons:
        payload = fetch_ons()
        rows = parse_ons_months(payload.get("months") or [])
        print("ONS CPIH fetched: {} months, {}..{}".format(len(rows), rows[0][:2], rows[-1][:2])); return
    if args.fetch_wb:
        rows = fetch_wb()
        wb = parse_wb(rows)
        print("World Bank CPI fetched: {} countries, {} rows".format(len(wb), len(rows))); return

    if not os.path.exists(US_CSV):
        sys.exit("missing {} (curl {} on a machine with egress)".format(US_CSV, US_URL))
    if not os.path.exists(ONS_JSON):
        sys.exit("missing {} (run --fetch-ons once on a machine with egress)".format(ONS_JSON))
    if not os.path.exists(WB_JSON):
        sys.exit("missing {} (run --fetch-wb once on a machine with egress)".format(WB_JSON))

    with open(US_CSV, encoding="utf-8") as f:
        us_series = parse_us_csv(f.read())
    with open(ONS_JSON, encoding="utf-8") as f:
        ons_payload = json.load(f)
    uk_series = parse_ons_months(ons_payload.get("months") or [])
    with open(WB_JSON, encoding="utf-8") as f:
        wb_rows = json.load(f)
    wb_by_iso3 = parse_wb(wb_rows)

    with open(COUNTRIES, encoding="utf-8") as f:
        countries = json.load(f)
    with open(INDICATORS, encoding="utf-8") as f:
        indicators = json.load(f)
    iso3_by_slug = {
        slug: {"iso3": info["iso3"], "iso2": info["iso2"]}
        for slug, info in indicators.get("countries", {}).items()
        if info.get("iso3") and info.get("iso2")
    }

    us = monthly_summary(us_series, "BLS CPI-U (CUUR0000SA0) via datahub.io core/cpi-us")
    uk = monthly_summary(uk_series, "ONS CPIH, all items (series L522, dataset MM23)")
    annual = build_annual(wb_by_iso3, countries, iso3_by_slug)

    print("US: latest {} index {} · YoY {}% · MoM {}% · {} months".format(
        us["latest_month"], us["latest_index"], us["yoy"], us["mom"], len(us_series)))
    print("UK: latest {} index {} · YoY {}% · MoM {}% · {} months".format(
        uk["latest_month"], uk["latest_index"], uk["yoy"], uk["mom"], len(uk_series)))
    print("World Bank annual: {} countries matched of {} site countries, {} with a WB series".format(
        len(annual), len(countries), len(wb_by_iso3)))

    if not args.write:
        print("dry run: nothing written (pass --write)"); return

    os.makedirs(os.path.join(OUT_DIR, "history"), exist_ok=True)
    built = __import__("datetime").date.today().isoformat()
    index = {
        "_meta": {"asOf": built},
        "built": built,
        "source": "BLS CPI-U via datahub.io; ONS CPIH (MM23); World Bank CPI index (FP.CPI.TOTL)",
        "us": us,
        "uk": uk,
        "annual": annual,
    }
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "history", "us.json"), "w", encoding="utf-8") as f:
        json.dump([[y, m, v] for (y, m, v) in us_series], f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "history", "uk.json"), "w", encoding="utf-8") as f:
        json.dump([[y, m, v] for (y, m, v) in uk_series], f, separators=(",", ":"))
    print("wrote {} and 2 history files".format(os.path.join(OUT_DIR, "index.json")))


if __name__ == "__main__":
    main()
