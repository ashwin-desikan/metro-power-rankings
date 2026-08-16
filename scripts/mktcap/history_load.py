"""Load out/cmc_annual.csv into Supabase mktcap_annual (upsert on slug+year).

Deliberately NOT delete-then-insert. The country_population load learned this the
hard way: upsert first, then sweep rows this load did not touch, so a partial run
can never blank a series that is fine.

  python history_load.py                 # dry run: parse, validate, report
  python history_load.py --write         # upsert
  python history_load.py --write --sweep # + deactivate rows no longer sourced
"""
import argparse, csv, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log, rest, select  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ANNUAL_CSV = os.path.join(HERE, "out", "cmc_annual.csv")
CHUNK = 500
MIN_YEAR, MAX_YEAR = 1970, 2100


def load_csv():
    if not os.path.exists(ANNUAL_CSV):
        sys.exit(f"FATAL: {ANNUAL_CSV} missing. Run history_fetch.py first.")
    rows, bad = [], 0
    with open(ANNUAL_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                year, mc = int(r["year"]), float(r["marketcap"])
            except (TypeError, ValueError):
                bad += 1; continue
            if not (MIN_YEAR <= year <= MAX_YEAR) or mc <= 0:
                bad += 1; continue
            pct = r.get("change_pct") or ""
            rows.append({
                "slug": r["slug"], "symbol": r["symbol"], "year": year,
                "marketcap": mc, "change_pct": float(pct) if pct else None,
                "source": "companiesmarketcap",
            })
    if bad:
        log(f"skipped {bad} malformed/implausible rows")
    return rows


def report(rows):
    by_slug = defaultdict(list)
    for r in rows:
        by_slug[r["slug"]].append(r["year"])
    years = [r["year"] for r in rows]
    log(f"{len(rows)} observations across {len(by_slug)} companies, "
        f"{min(years)}..{max(years)}")
    spans = sorted((len(v) for v in by_slug.values()))
    log(f"years per company: min {spans[0]}, median {spans[len(spans)//2]}, max {spans[-1]}")
    # A duplicated (slug, year) means the parser matched two tables, not one.
    seen, dupes = set(), 0
    for r in rows:
        k = (r["slug"], r["year"])
        if k in seen:
            dupes += 1
        seen.add(k)
    if dupes:
        sys.exit(f"FATAL: {dupes} duplicate (slug, year) pairs — the parser picked up "
                 f"more than the End-of-year table. Fix history_fetch.py, do not load.")


def upsert(rows):
    hdr = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), CHUNK):
        rest("POST", "/rest/v1/mktcap_annual?on_conflict=slug,year",
             body=rows[i:i + CHUNK], headers=hdr)
        log(f"upserted {min(i + CHUNK, len(rows))}/{len(rows)}")


def sweep(rows):
    """Delete only rows whose slug we just loaded but whose year is gone from the
    source. Never touches a slug this run did not see."""
    loaded = defaultdict(set)
    for r in rows:
        loaded[r["slug"]].add(r["year"])
    live = select("/rest/v1/mktcap_annual?select=slug,year&limit=100000")
    stale = [(r["slug"], r["year"]) for r in live
             if r["slug"] in loaded and r["year"] not in loaded[r["slug"]]]
    if not stale:
        log("sweep: nothing stale"); return
    log(f"sweep: deleting {len(stale)} rows superseded by this load")
    for slug, year in stale:
        rest("DELETE", f"/rest/v1/mktcap_annual?slug=eq.{slug}&year=eq.{year}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--sweep", action="store_true")
    a = ap.parse_args()

    rows = load_csv()
    report(rows)
    if not a.write:
        log("dry run (no --write); nothing sent to Supabase"); return
    upsert(rows)
    if a.sweep:
        sweep(rows)
    log("mktcap_annual loaded")


if __name__ == "__main__":
    main()
