"""Pull Fortune 500 rankings for 1955-1995 from the cmusam/fortune500 mirror.

WHY A MIRROR
Fortune's own archive is gone: archive.fortune.com/.../fortune500_archive/ returns
HTTP 400 and the money.cnn.com mirror returns 503 (both checked 2026-08-16). The
Next.js data route only goes back to 1996. For the first 41 years this repo is the
only route, and it carries rank, company, revenue and profit — no HQ, no market
value, top 500 only.

⚠️ These rows are BACK-NAMED by Fortune's own archive: 1955's #2 is recorded as
"Exxon Mobil" though in 1955 it was Standard Oil of New Jersey, and #5 "Esmark" was
Swift. Good for identity resolution, wrong for period-correct display. Anything that
renders these names to a reader needs the era-name treatment the champions ledger
already uses; this script deliberately stores what the source says and does not
invent a period name.

  python fetch_legacy.py                  # 1955-1995 -> out/legacy_rankings.csv
  python fetch_legacy.py --years 1955-1960
"""
import argparse, csv, io, os, sys, time
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (RAW, OUT, ROW_FIELDS, company_key, fetch_url, log,  # noqa: E402
                    parse_money)

URL = "https://raw.githubusercontent.com/cmusam/fortune500/master/csv/fortune500-{year}.csv"
FIRST, LAST = 1955, 1995          # 1996+ comes from Fortune direct, at 1000-row depth
SOURCE = "fortune500-archive"
MIN_ROWS = 400                    # a real year is ~500; anything less is a broken pull


def year_rows(year, use_cache=True):
    path = os.path.join(RAW, f"legacy-{year}.csv")
    if use_cache and os.path.exists(path):
        raw = open(path, encoding="utf-8").read()
    else:
        raw = fetch_url(URL.format(year=year), timeout=60).decode("utf-8-sig", "replace")
        open(path, "w", encoding="utf-8").write(raw)

    rdr = csv.DictReader(io.StringIO(raw))
    hdr = [h.strip().lower() for h in (rdr.fieldnames or [])]
    def col(*names):
        for n in names:
            if n in hdr:
                return rdr.fieldnames[hdr.index(n)]
        sys.exit(f"FATAL: {year} CSV missing column {names}; header={hdr}")
    cR, cN = col("rank"), col("company")
    cV = col("revenue ($ millions)", "revenue", "revenues ($ millions)")
    cP = col("profit ($ millions)", "profits ($ millions)", "profit")

    out = []
    for r in rdr:
        name = (r.get(cN) or "").strip()
        rank = (r.get(cR) or "").strip()
        if not name or not rank.isdigit():
            continue
        out.append({"source": SOURCE, "year": year, "rank": int(rank),
                    "company_key": company_key(name), "company": name,
                    "revenue_musd": parse_money(r.get(cV)),
                    "profit_musd": parse_money(r.get(cP)),
                    "assets_musd": None, "market_value_musd": None, "employees": None,
                    "sector": None, "industry": None, "hq_city": None, "hq_state": None})
    if len(out) < MIN_ROWS:
        sys.exit(f"FATAL: {year} parsed {len(out)} rows (< {MIN_ROWS}). Treating a "
                 f"short year as a fetch/parse break, not a small Fortune 500.")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", help="e.g. 1955-1960")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--delay", type=float, default=0.3)
    a = ap.parse_args()

    if a.years:
        lo, _, hi = a.years.partition("-")
        want = list(range(int(lo), int(hi or lo) + 1))
    else:
        want = list(range(FIRST, LAST + 1))

    rows, missing = [], []
    for y in want:
        try:
            r = year_rows(y, use_cache=not a.no_cache)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                missing.append(y); log(f"{y}: 404 (no file in the mirror)"); continue
            raise
        log(f"{y}: {len(r)} rows")
        rows += r
        time.sleep(a.delay)

    if not rows:
        sys.exit("FATAL: zero rows harvested across every requested year.")
    path = os.path.join(OUT, "legacy_rankings.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ROW_FIELDS)
        w.writeheader(); w.writerows(rows)
    log(f"{len(rows)} rows across {len(want)-len(missing)} years -> {path}")
    if missing:
        log(f"years absent from the mirror: {missing}")


if __name__ == "__main__":
    main()
