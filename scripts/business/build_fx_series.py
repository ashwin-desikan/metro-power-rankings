#!/usr/bin/env python3
"""build_fx_series.py - per-currency USD-rate history for /business/currencies/[code].

Seeds public/data/business/fx-series/{code}.json (one file per fx.json major)
from a long-run historical dataset (usd_to_xxx_by_day.json - month-end
snapshots from 1940, near-daily from 1971; NOT in git, ~12MB, pass via --src),
then splices in the site's own fx-history.json snapshots on top. After
seeding, build_fx.py appends each day's rate during the daily refresh, so
this script only reruns if the deep history is ever re-imported.

Cleaning applied to the source (all hit in the real file, 2026-08-03):
  - non-date keys (a literal "undefined") and future-dated rows are dropped
  - non-positive / non-numeric values are dropped
  - each currency starts at its CURATED era start (introduction or latest
    redenomination) - the source backfills rebased values into modern codes,
    which is technically continuous but editorially absurd (BRL shows
    1.9e-11 per USD in 1980 in rebased Plano Real units; "EUR" before 1999
    is a legacy series that jumps 1.68 -> 0.88 at the changeover)

Downsampling keeps files light without losing shape: native month-ends up to
1970, weekly (last observation per ISO week) until five years before the
newest date, daily inside the final five years.

usage: build_fx_series.py --src path/to/usd_to_xxx_by_day.json [--out DIR]
       build_fx_series.py --self-test
"""
import argparse
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT_DIR_DEFAULT = os.path.join(ROOT, "public", "data", "business", "fx-series")
FX_HISTORY = os.path.join(ROOT, "public", "data", "business", "fx-history.json")

# The 20 cards on /business/currencies (build_fx.py MAJORS).
MAJORS = ["EUR", "GBP", "JPY", "CNY", "INR", "CHF", "CAD", "AUD", "KRW", "BRL",
          "MXN", "SGD", "HKD", "SEK", "NOK", "ZAR", "TRY", "PLN", "AED", "SAR"]

# Curated era starts: currency introduction or latest redenomination. A date
# here means "the modern unit begins now"; anything earlier in the source is
# a rebased or legacy series and is dropped. No entry = full source history
# is genuinely the same unit.
ERA_START = {
    "EUR": "1999-01-01",  # euro launch; earlier "EUR" rows are a legacy series
    "AUD": "1966-02-14",  # decimalization (pound -> dollar)
    "ZAR": "1961-02-14",  # rand introduced
    "KRW": "1962-06-10",  # won redenomination
    "BRL": "1994-07-01",  # Plano Real
    "MXN": "1993-01-01",  # nuevo peso
    "PLN": "1995-01-01",  # złoty redenomination
    "TRY": "2005-01-01",  # new lira
    "AED": "1973-05-19",  # dirham introduced
    "SGD": "1967-06-12",  # Singapore dollar introduced
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def iso_week_key(date_str):
    y, m, d = (int(x) for x in date_str.split("-"))
    iy, iw, _ = datetime.date(y, m, d).isocalendar()
    return (iy, iw)


def clean_source(raw, today):
    """{date: {code: rate}} -> sorted [(date, {code: rate})], junk dropped."""
    out = []
    for k in sorted(raw.keys()):
        if not DATE_RE.match(k) or k > today:
            continue
        row = {}
        for code, v in raw[k].items():
            if isinstance(v, (int, float)) and v > 0:
                row[code] = float(v)
        if row:
            out.append((k, row))
    return out


def build_series(rows, code, today):
    """Era-clamped, downsampled [[date, rate], ...] for one currency."""
    start = ERA_START.get(code, "0000-00-00")
    pts = [(d, row[code]) for d, row in rows if code in row and d >= start]
    if not pts:
        return []
    latest = pts[-1][0]
    y, m, d = (int(x) for x in latest.split("-"))
    daily_from = datetime.date(y - 5, m, min(d, 28)).isoformat()
    kept = []
    by_week = {}
    for date, rate in pts:
        if date <= "1970-12-31" or date >= daily_from:
            kept.append((date, rate))
        else:
            by_week[iso_week_key(date)] = (date, rate)  # last obs of the week wins
    kept.extend(by_week.values())
    kept.sort()
    dedup = {}
    for date, rate in kept:
        dedup[date] = round(float(f"{rate:.6g}"), 12)
    return [[date, rate] for date, rate in sorted(dedup.items())]


def splice_site_history(series, site_snapshots, code):
    """Overlay the site's own daily snapshots (they win on date collision)."""
    merged = dict((d, r) for d, r in series)
    for snap in site_snapshots:
        rate = (snap.get("rates") or {}).get(code)
        if isinstance(rate, (int, float)) and rate > 0 and DATE_RE.match(snap.get("date", "")):
            merged[snap["date"]] = round(float(f"{rate:.6g}"), 12)
    return [[d, merged[d]] for d in sorted(merged)]


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--src")
    ap.add_argument("--out", default=OUT_DIR_DEFAULT)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.src:
        sys.exit("FATAL: --src path/to/usd_to_xxx_by_day.json is required (file is not in git)")

    today = datetime.date.today().isoformat()
    raw = json.load(open(args.src, encoding="utf-8"))
    rows = clean_source(raw, today)
    print(f"source: {len(raw)} raw keys -> {len(rows)} clean snapshots "
          f"({rows[0][0]} -> {rows[-1][0]})")

    try:
        site = json.load(open(FX_HISTORY, encoding="utf-8")).get("snapshots", [])
    except (OSError, ValueError):
        site = []

    os.makedirs(args.out, exist_ok=True)
    gen = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for code in MAJORS:
        series = splice_site_history(build_series(rows, code, today), site, code)
        if len(series) < 100:
            print(f"WARN: {code} has only {len(series)} points - skipped")
            continue
        out = {
            "meta": {
                "code": code, "base": "USD", "generated_at": gen,
                "start": series[0][0], "end": series[-1][0], "points": len(series),
                "era_start": ERA_START.get(code),
                "source": "long-run historical dataset (monthly to 1970, near-daily after), "
                          "extended daily by the site's own exchangerate-api snapshots",
            },
            "series": series,
        }
        path = os.path.join(args.out, f"{code.lower()}.json")
        json.dump(out, open(path, "w", encoding="utf-8"), separators=(",", ":"))
        print(f"{code}: {len(series)} pts {series[0][0]} -> {series[-1][0]} "
              f"({os.path.getsize(path) // 1024}KB)")
    return 0


def self_test():
    today = "2026-08-03"
    raw = {
        "undefined": {"EUR": 0.87},               # junk key -> dropped
        "2027-03-31": {"EUR": 0.99},              # future row -> dropped
        "1998-12-31": {"EUR": 1.6751},            # pre-era EUR -> dropped
        "1999-01-29": {"EUR": 0.8794, "BAD": -1}, # kept; negative dropped
        "1999-02-01": {"EUR": "x"},               # non-numeric -> dropped
        "2026-07-30": {"EUR": 0.8611},
        "2026-07-31": {"EUR": 0.8678295582747547},
    }
    rows = clean_source(raw, today)
    # junk key, future row and non-numeric dropped; pre-era row survives here
    # (the era clamp is build_series' job) and negatives are stripped per-code
    assert [d for d, _ in rows] == ["1998-12-31", "1999-01-29", "2026-07-30", "2026-07-31"], rows
    assert "BAD" not in rows[1][1], rows
    s = build_series(rows, "EUR", today)
    assert s[0][0] == "1999-01-29" and s[-1] == ["2026-07-31", 0.86783], s
    # site snapshot wins on collision and extends the tail
    spliced = splice_site_history(s, [{"date": "2026-07-31", "rates": {"EUR": 0.868}},
                                      {"date": "2026-08-02", "rates": {"EUR": 0.8702}}], "EUR")
    assert spliced[-1] == ["2026-08-02", 0.8702] and ["2026-07-31", 0.868] in spliced, spliced
    # weekly downsample keeps last-of-week in the middle era
    mid = {f"1980-03-{d:02d}": {"GBP": 0.44 + d / 1000} for d in (3, 4, 5, 6, 7)}  # Mon-Fri one week
    mid["2026-07-31"] = {"GBP": 0.7439}
    rows2 = clean_source(mid, today)
    s2 = build_series(rows2, "GBP", today)
    assert ["1980-03-07", 0.447] in s2 and len([p for p in s2 if p[0].startswith("1980-03")]) == 1, s2
    print("self-test: 4/4 PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
