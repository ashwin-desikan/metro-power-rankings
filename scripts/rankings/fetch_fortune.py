"""Pull the Fortune 1000 rankings, 1996 to the current year, from Fortune's own site.

WHY THIS PATH AND NOT THE OBVIOUS ONE
`fortune.com/ranking/fortune500/<YYYY>/` returns **HTTP 200 with the CURRENT list**
for every historical year. Verified 2026-08-16: 2010 through 2024 all came back
byte-identical, Amazon at #1, 1,000 rows, looking perfectly healthy. A scraper
pointed at those URLs writes this year's data thirty-one times and reports success.
The Next.js data route below is the only year-correct one, and every fetch asserts
the payload's own `year` matches what was asked for.

`buildId` changes on every Fortune deploy, so it is scraped live each run. A stale
hardcoded buildId 404s, which is at least loud.

  python fetch_fortune.py                 # all years -> out/fortune_rankings.csv
  python fetch_fortune.py --years 2020-2026
  python fetch_fortune.py --no-cache      # ignore out/raw, re-fetch everything
"""
import argparse, csv, json, os, re, sys, time
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (RAW, OUT, FIELD_PATTERNS, ROW_FIELDS, company_key, fetch_url,  # noqa: E402
                    log, parse_int, parse_money, pick)

INDEX = "https://fortune.com/ranking/fortune500/"
DATA = "https://fortune.com/_next/data/{bid}/ranking/fortune500/{year}.json"
NEXT_RE = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)
FIRST_YEAR = 1996
SOURCE = "fortune1000"


def build_id():
    m = NEXT_RE.search(fetch_url(INDEX, timeout=90).decode("utf-8", "replace"))
    if not m:
        sys.exit("FATAL: no __NEXT_DATA__ on the Fortune index — layout changed.")
    d = json.loads(m.group(1))
    bid = d.get("buildId")
    if not bid:
        sys.exit("FATAL: __NEXT_DATA__ carries no buildId.")
    years = (d.get("props", {}).get("pageProps", {})
              .get("franchiseSearch", {}).get("years") or [])
    return bid, sorted(int(y) for y in years if str(y).isdigit())


def year_payload(bid, year, use_cache=True):
    path = os.path.join(RAW, f"fortune-{year}.json")
    if use_cache and os.path.exists(path):
        raw = open(path, encoding="utf-8").read()
    else:
        raw = fetch_url(DATA.format(bid=bid, year=year), timeout=120).decode("utf-8", "replace")
        open(path, "w", encoding="utf-8").write(raw)
    fs = json.loads(raw).get("pageProps", {}).get("franchiseSearch", {})
    got = str(fs.get("year") or "")
    if got != str(year):
        # Do not write a single row. This is the silent-redirect failure mode.
        sys.exit(f"FATAL: asked Fortune for {year}, payload says year={got!r}. "
                 f"Refusing to write. Delete {path} and re-run; if it repeats, the "
                 f"data route has changed shape.")
    items = fs.get("items") or []
    if not items:
        sys.exit(f"FATAL: {year} returned zero items — that is a break, not a year "
                 f"with no companies.")
    return items


def to_rows(year, items):
    rows, census = [], {}
    for it in items:
        name = (it.get("name") or "").strip()
        rank = it.get("rank")
        if not name or rank in (None, ""):
            continue
        data = it.get("data") or {}
        for k in data:
            census[k] = census.get(k, 0) + 1
        r = {"source": SOURCE, "year": year, "rank": int(rank),
             "company_key": company_key(name), "company": name}
        for field, pats in FIELD_PATTERNS.items():
            v = pick(data, pats)
            r[field] = (parse_int(v) if field == "employees"
                        else parse_money(v) if field.endswith("_musd")
                        else (str(v).strip() if v not in (None, "") else None))
        rows.append(r)
    return rows, census


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="e.g. 2020-2026 or 2021")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--delay", type=float, default=0.4)
    a = ap.parse_args()

    bid, advertised = build_id()
    log(f"buildId {bid}; Fortune advertises {min(advertised)}..{max(advertised)}")

    if a.years:
        lo, _, hi = a.years.partition("-")
        want = list(range(int(lo), int(hi or lo) + 1))
    else:
        want = [y for y in advertised if y >= FIRST_YEAR]

    all_rows, census, hq_years = [], {}, []
    for y in want:
        try:
            items = year_payload(bid, y, use_cache=not a.no_cache)
        except urllib.error.HTTPError as e:
            sys.exit(f"FATAL: {y} -> HTTP {e.code}. If this is 404 the buildId went "
                     f"stale mid-run; re-run to pick up the new one.")
        rows, c = to_rows(y, items)
        for k, n in c.items():
            census[k] = census.get(k, 0) + n
        hq = sum(1 for r in rows if r["hq_city"])
        mv = sum(1 for r in rows if r["market_value_musd"] is not None)
        if hq:
            hq_years.append(y)
        log(f"{y}: {len(rows):4d} rows  hq={hq:4d}  mktval={mv:4d}")
        all_rows += rows
        time.sleep(a.delay)

    path = os.path.join(OUT, "fortune_rankings.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ROW_FIELDS)
        w.writeheader(); w.writerows(all_rows)
    log(f"{len(all_rows)} rows -> {path}")

    missing = [y for y in want if y not in hq_years]
    if missing:
        log(f"NOTE: no HQ city in {missing} — known holes (pre-2007, plus 2013/2014). "
            f"build_rankings.py carries HQ across years for the same company_key.")
    unmatched = sorted(k for k in census
                       if not any(pick({k: 1}, p) for p in FIELD_PATTERNS.values()))
    if unmatched:
        log(f"unmapped Fortune fields (dropped, listed so drift is visible): {unmatched}")


if __name__ == "__main__":
    main()
