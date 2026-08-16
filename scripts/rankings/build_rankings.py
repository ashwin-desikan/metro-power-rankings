"""Merge the two fetches into one ranking table plus a reusable HQ seed, and report
exactly how much of the metro mapping is still unsolved.

TWO OUTPUTS, DELIBERATELY SEPARATE
- out/company_rankings.csv  facts as published that year. Never edited by hand.
- out/company_hq_seed.csv   one row per company_key: the HQ Fortune gave us, plus a
  blank metro column. This is the CURATION layer, it is reused by every later board
  (FT Global 500, Forbes private), and it is where the Wikidata backfill and your
  rulings land. Keeping it out of the rankings table is what stops a curation edit
  from silently rewriting a published fact.

HQ CARRY
Fortune supplies no HQ before 2007 and none for 2013-2014. Where a company appears
in a year that does have HQ, that value is carried to its other years, nearest
year first. Carried values are marked so a reader can tell a carried HQ from a
published one.

  python build_rankings.py
"""
import csv, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, ROW_FIELDS, log  # noqa: E402

RANKINGS = os.path.join(OUT, "company_rankings.csv")
HQ_SEED = os.path.join(OUT, "company_hq_seed.csv")
OUT_FIELDS = ROW_FIELDS + ["hq_source"]
HQ_FIELDS = ["company_key", "company", "hq_city", "hq_state", "first_year",
             "last_year", "years_listed", "peak_rank", "hq_source", "metro"]


def load(name):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        sys.exit(f"FATAL: {p} missing. Run the fetch scripts first.")
    with open(p, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    rows = load("fortune_rankings.csv") + load("legacy_rankings.csv")
    for r in rows:
        r["year"] = int(r["year"]); r["rank"] = int(r["rank"])
    rows.sort(key=lambda r: (r["year"], r["rank"]))

    # Neither (year, rank) nor (year, company_key) is unique in the source, and that
    # is the source telling the truth rather than a bug:
    #   - tied ranks are real (1997 #890: Allergan and Oryx Energy, both $1,147.0M),
    #     and some are Fortune archive errors (1997 #253 lists two different firms
    #     at different revenues). Either way we record what was published.
    #   - two listed entities can share a normalised name ("Genesis Energy, L.P."
    #     and "Genesis Energy" were separately listed for four straight years).
    # The identity of a row is therefore all four. A collision on THAT is a re-ingest.
    seen, ties, keyclash = set(), 0, 0
    at_rank, at_key = defaultdict(int), defaultdict(int)
    for r in rows:
        k = (r["source"], r["year"], r["rank"], r["company_key"])
        if k in seen:
            sys.exit(f"FATAL: duplicate {k}. A year was ingested twice — clear "
                     f"out/raw and re-run rather than loading this.")
        seen.add(k)
        at_rank[(r["source"], r["year"], r["rank"])] += 1
        at_key[(r["source"], r["year"], r["company_key"])] += 1
    ties = sum(n - 1 for n in at_rank.values() if n > 1)
    keyclash = sum(n - 1 for n in at_key.values() if n > 1)
    if not [r for r in rows if r["company_key"]] == rows:
        sys.exit("FATAL: a row has an empty company_key — the HQ layer would merge "
                 "unrelated companies into one bucket.")

    published = {}          # company_key -> {year: (city, state)}
    meta = defaultdict(lambda: {"years": set(), "best": 10**6, "name": ""})
    for r in rows:
        k = r["company_key"]
        m = meta[k]
        m["years"].add(r["year"])
        m["best"] = min(m["best"], r["rank"])
        if r["year"] >= max(m["years"]):
            m["name"] = r["company"]
        if r.get("hq_city"):
            published.setdefault(k, {})[r["year"]] = (r["hq_city"], r.get("hq_state") or "")

    carried = 0
    for r in rows:
        if r.get("hq_city"):
            r["hq_source"] = "published"
            continue
        by_year = published.get(r["company_key"])
        if not by_year:
            r["hq_source"] = ""
            continue
        near = min(by_year, key=lambda y: (abs(y - r["year"]), y))
        r["hq_city"], r["hq_state"] = by_year[near]
        r["hq_source"] = f"carried:{near}"
        carried += 1

    with open(RANKINGS, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        w.writeheader(); w.writerows(rows)

    hq_rows = []
    for k, m in sorted(meta.items()):
        by_year = published.get(k) or {}
        newest = max(by_year) if by_year else None
        city, state = by_year[newest] if newest else ("", "")
        hq_rows.append({"company_key": k, "company": m["name"],
                        "hq_city": city, "hq_state": state,
                        "first_year": min(m["years"]), "last_year": max(m["years"]),
                        "years_listed": len(m["years"]), "peak_rank": m["best"],
                        "hq_source": f"fortune:{newest}" if newest else "",
                        "metro": ""})
    with open(HQ_SEED, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HQ_FIELDS)
        w.writeheader(); w.writerows(hq_rows)

    years = sorted({r["year"] for r in rows})
    gaps = [y for y in range(min(years), max(years) + 1) if y not in years]
    solved = [h for h in hq_rows if h["hq_city"]]
    unsolved = [h for h in hq_rows if not h["hq_city"]]
    row_no_hq = sum(1 for r in rows if not r.get("hq_city"))

    log(f"rows            : {len(rows)}  ({min(years)}-{max(years)}, {len(years)} years)")
    log(f"shared ranks    : {ties} rows sit on a rank another row also holds "
        f"(real ties + Fortune archive slips; both preserved)")
    log(f"name collisions : {keyclash} rows share a company_key with another row in "
        f"the same year (separately listed entities, e.g. Genesis Energy vs L.P.)")
    if gaps:
        log(f"MISSING YEARS   : {gaps}")
    log(f"companies       : {len(hq_rows)} distinct company_key")
    log(f"HQ from Fortune : {len(solved)} ({len(solved)/len(hq_rows)*100:.1f}%)")
    log(f"HQ still needed : {len(unsolved)}")
    log(f"  last listed <2007: {sum(1 for h in unsolved if h['last_year'] < 2007)}")
    log(f"rows with HQ    : {len(rows)-row_no_hq}/{len(rows)} "
        f"({(len(rows)-row_no_hq)/len(rows)*100:.1f}%), {carried} of them carried")
    log(f"-> {RANKINGS}")
    log(f"-> {HQ_SEED}  (the curation layer; metro column is blank by design)")

    top = sorted(unsolved, key=lambda h: h["peak_rank"])[:10]
    log("biggest companies still needing an HQ:")
    for h in top:
        log(f"   #{h['peak_rank']:<4d} {h['first_year']}-{h['last_year']}  {h['company']}")


if __name__ == "__main__":
    main()
