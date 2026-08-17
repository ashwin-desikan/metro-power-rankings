"""Load curation/hq_spans_master.csv into public.company_hq_spans.

  python load_hq_spans.py            # validate and report, send nothing
  python load_hq_spans.py --write    # upsert on (company_key, from_year)

VALIDATES BEFORE IT SENDS. A span file that overlaps itself would double-count a
company's revenue across two metros in the same year, and that error is invisible
once it is inside a rollup. Every check below has to pass or nothing is sent.

The `metro` column belongs to the metro-assignment step and to Ashwin. This loader
reads existing metro values back and never blanks one, exactly as
load_rankings.py does for company_hq.
"""
import argparse, csv, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, rest, select_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(HERE, "curation", "hq_spans_master.csv")
WORKLIST = os.path.join(OUT, "hq_curation_worklist.csv")
CHUNK = 500
COLS = ["company_key", "company", "from_year", "to_year", "city", "state",
        "country", "provenance", "basis", "note"]


def validate(rows, span):
    """Returns a list of problems. Empty means safe to load."""
    bad = []
    by = {}
    for r in rows:
        if not r["city"].strip():
            bad.append(f"{r['company_key']}: era {r['from_year']}-{r['to_year']} "
                       f"has no city")
        if int(r["to_year"]) < int(r["from_year"]):
            bad.append(f"{r['company_key']}: {r['from_year']}-{r['to_year']} ends "
                       f"before it starts")
        by.setdefault(r["company_key"], []).append(r)

    for k, rs in by.items():
        rs.sort(key=lambda r: int(r["from_year"]))
        seen = set()
        for r in rs:
            if r["from_year"] in seen:
                bad.append(f"{k}: two eras start in {r['from_year']} — the primary "
                           f"key would collide and one would be silently dropped")
            seen.add(r["from_year"])
        for i in range(1, len(rs)):
            prev, cur = rs[i - 1], rs[i]
            if int(cur["from_year"]) <= int(prev["to_year"]):
                bad.append(f"{k}: {prev['from_year']}-{prev['to_year']} OVERLAPS "
                           f"{cur['from_year']}-{cur['to_year']} — a year in two "
                           f"metros double-counts in any rollup")
            elif int(cur["from_year"]) > int(prev["to_year"]) + 1:
                bad.append(f"{k}: GAP {prev['to_year']} -> {cur['from_year']}")
        if k in span:
            lo, hi = span[k]
            if int(rs[0]["from_year"]) != lo or int(rs[-1]["to_year"]) != hi:
                bad.append(f"{k}: covers {rs[0]['from_year']}-{rs[-1]['to_year']} "
                           f"but was listed {lo}-{hi}")
    return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    with open(MASTER, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    span = {}
    if os.path.exists(WORKLIST):
        with open(WORKLIST, encoding="utf-8") as f:
            span = {r["company_key"]: (int(r["first_year"]), int(r["last_year"]))
                    for r in csv.DictReader(f)}

    companies = {r["company_key"] for r in rows}
    log(f"{len(rows)} eras across {len(companies)} companies")
    multi = sum(1 for k in companies
                if sum(1 for r in rows if r["company_key"] == k) > 1)
    log(f"{multi} companies have more than one era")

    problems = validate(rows, span)
    if problems:
        log(f"🔴 {len(problems)} PROBLEMS — nothing will be sent:")
        for p in problems[:25]:
            log(f"   {p}")
        sys.exit(1)
    log("validation clean: no overlaps, no gaps, no key collisions, "
        "every company covers its listed span")

    body = []
    for r in rows:
        body.append({c: (int(r[c]) if c in ("from_year", "to_year")
                         else (r[c].strip() or None)) for c in COLS})

    if not a.write:
        log("dry run (no --write); nothing sent to Supabase")
        return

    existing = {}
    try:
        for r in select_all("/rest/v1/company_hq_spans?select=company_key,from_year,metro",
                            "company_key,from_year"):
            if (r.get("metro") or "").strip():
                existing[(r["company_key"], r["from_year"])] = r["metro"]
    except Exception as e:
        log(f"could not read existing metros ({e}); continuing")
    # 🔴 EVERY row must carry the metro key, even when the value is null.
    # PostgREST rejects a batch whose objects have different key sets with
    # "All object keys must match", so setting `metro` only on the rows that
    # already had one broke the load the moment a single new uncurated era was
    # added. A null here cannot blank an existing ruling: absent from `existing`
    # means the row has no metro in the table either.
    kept = 0
    for b in body:
        m = existing.get((b["company_key"], b["from_year"]))
        b["metro"] = m or None
        if m:
            kept += 1
    if kept:
        log(f"preserving {kept} existing metro rulings")

    hdr = {"Prefer": "resolution=merge-duplicates,return=minimal"}
    for i in range(0, len(body), CHUNK):
        rest("POST", "/rest/v1/company_hq_spans?on_conflict=company_key,from_year",
             body=body[i:i + CHUNK], headers=hdr)
        log(f"company_hq_spans: {min(i + CHUNK, len(body))}/{len(body)}")
    log("loaded")


if __name__ == "__main__":
    main()
