"""Upsert out/company_rankings.csv and out/company_hq_seed.csv into Supabase.

  python load_rankings.py                  # dry run: validate + report
  python load_rankings.py --write          # upsert both tables
  python load_rankings.py --write --rankings-only

company_hq is the CURATION table and is upserted with a merge that never clobbers a
non-empty metro with a blank one. The seed only ever supplies hq_city/hq_state; the
metro column belongs to you and to the Wikidata backfill, and a re-run of the whole
pipeline must not wipe a ruling you already made.
"""
import argparse, csv, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, rest, select_all  # noqa: E402

CHUNK = 500
NUM = ("revenue_musd", "profit_musd", "assets_musd", "market_value_musd")


def read(name):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        sys.exit(f"FATAL: {p} missing. Run build_rankings.py first.")
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def blank_to_none(r, keys):
    for k in keys:
        if r.get(k) in ("", None):
            r[k] = None
    return r


def upsert(path_with_conflict, rows, label):
    hdr = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(rows), CHUNK):
        rest("POST", path_with_conflict, body=rows[i:i + CHUNK], headers=hdr)
        log(f"{label}: {min(i + CHUNK, len(rows))}/{len(rows)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--rankings-only", action="store_true")
    a = ap.parse_args()

    rk = []
    for r in read("company_rankings.csv"):
        r["year"] = int(r["year"]); r["rank"] = int(r["rank"])
        r["employees"] = int(r["employees"]) if r.get("employees") else None
        for k in NUM:
            r[k] = float(r[k]) if r.get(k) not in ("", None) else None
        rk.append(blank_to_none(r, ("sector", "industry", "hq_city", "hq_state", "hq_source")))

    years = sorted({r["year"] for r in rk})
    log(f"rankings: {len(rk)} rows, {min(years)}-{max(years)}, {len(years)} years")
    if len(years) != max(years) - min(years) + 1:
        log(f"WARNING: year gaps present: "
            f"{[y for y in range(min(years), max(years)+1) if y not in years]}")

    hq = [blank_to_none(dict(h), ("hq_city", "hq_state", "hq_source", "metro"))
          for h in read("company_hq_seed.csv")]
    for h in hq:
        for k in ("first_year", "last_year", "years_listed", "peak_rank"):
            h[k] = int(h[k]) if h.get(k) else None
    log(f"hq seed : {len(hq)} companies, "
        f"{sum(1 for h in hq if h['hq_city'])} carrying an HQ city")

    if not a.write:
        log("dry run (no --write); nothing sent to Supabase"); return

    upsert("/rest/v1/company_rankings?on_conflict=source,year,rank,company_key",
           rk, "rankings")

    if a.rankings_only:
        log("--rankings-only: company_hq untouched"); return

    # Preserve every metro ruling already in the table.
    existing = {r["company_key"]: r for r in
                select_all("/rest/v1/company_hq?select=company_key,metro,hq_source", "company_key")}
    kept = 0
    for h in hq:
        prev = existing.get(h["company_key"])
        if prev and (prev.get("metro") or "").strip():
            h["metro"] = prev["metro"]; kept += 1
    log(f"preserving {kept} existing metro rulings")
    upsert("/rest/v1/company_hq?on_conflict=company_key", hq, "company_hq")
    log("loaded")


if __name__ == "__main__":
    main()
