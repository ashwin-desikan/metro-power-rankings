"""Emit the /business read model from out/company_rankings.csv.

  public/data/business/rankings.json

Shape notes
- Rows are POSITIONAL arrays, not objects. 72 years x 100 companies as objects is
  roughly four times the bytes for zero extra information, and this file is fetched
  by the browser on a hub tab.
- `meta.generated_at` is mandatory: lib/business.ts `load()` prefers the GitHub-raw
  copy only when its generated_at is newer, so a file without one never updates
  without a build.
- Only the top `--per-year` of each list ships. `stats` carries the full-year totals
  so the page can say "top 100 of 500" honestly rather than implying the list is
  the whole year.

  python emit_rankings.py                 # top 100 per year
  python emit_rankings.py --per-year 50
"""
import argparse, csv, json, os, sys
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

HERE_DIR = os.path.dirname(os.path.abspath(__file__))

SRC = os.path.join(OUT, "company_rankings.csv")
ERAS = os.path.join(OUT, "era_worklist.csv")   # detector output (diagnosis)
# CURATION INPUT lives OUTSIDE out/. The root .gitignore has a bare `out/` rule,
# so anything under scripts/rankings/out/ is untracked — correct for generated
# artifacts, silent data loss for hand-authored editorial work.
CURATION = os.path.join(HERE_DIR, "curation")
NAMES = os.path.join(CURATION, "era_names.csv")
DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "public", "data", "business", "rankings.json")
FIELDS = ["rank", "company", "revenue_musd", "market_value_musd", "sector",
          "hq_city", "hq_state", "carried", "nameFlag", "metro", "metroSlug"]
# nameFlag: 0 = name as published, 1 = era-corrected from the curation file,
#           2 = proven anachronistic, not yet corrected,
#           3 = source-recorded name, not dated to this year (see below).


def num(v):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-year", type=int, default=100)
    ap.add_argument("--dest", default=DEST)
    a = ap.parse_args()

    if not os.path.exists(SRC):
        sys.exit(f"FATAL: {SRC} missing. Run build_rankings.py first.")
    with open(SRC, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("FATAL: company_rankings.csv is empty.")

    # Era layer. era_worklist.csv is the curation file: a filled era_name replaces the
    # recorded name up to and including era_to. A row that is flagged anachronistic
    # but NOT yet filled keeps its recorded name and is marked suspect, so the board
    # can say "this label is known wrong" instead of quietly asserting it.
    # A company can have several eras (Standard Oil of New Jersey, then Exxon), so
    # the curation file is one row per era, not one per company.
    eras = defaultdict(list)
    if os.path.exists(NAMES):
        with open(NAMES, encoding="utf-8") as f:
            for e in csv.DictReader(f):
                if not e.get("era_name") or not e.get("company_key"):
                    continue
                try:
                    eras[e["company_key"]].append(
                        (int(e["from_year"]), int(e["to_year"]), e["era_name"]))
                except (TypeError, ValueError):
                    log(f"WARNING: {e.get('company_key')!r} era row has no usable "
                        f"from_year/to_year; ignoring rather than guessing.")
    for k in eras:
        eras[k].sort()

    strayfile = os.path.join(OUT, "era_names.csv")
    if os.path.exists(strayfile) and not os.path.exists(NAMES):
        sys.exit(f"FATAL: era_names.csv is in out/, which is gitignored. Move it to "
                 f"{CURATION} or the curation work will never be committed.")

    suspect = set()
    if os.path.exists(ERAS):
        with open(ERAS, encoding="utf-8") as f:
            suspect = {e["company_key"] for e in csv.DictReader(f)
                       if e.get("verdict") == "anachronistic"}
    # The year from which a suspect company's MODERN name becomes correct: one past
    # the end of its last authored era. Curating "Allied Chemical 1955-1980,
    # Allied Corporation 1981-1985, AlliedSignal 1986-1995" therefore also says
    # that from 1996 the record's own label is no longer an anachronism.
    suspect_until = {k: max(t for _, t, _ in v) + 1 for k, v in eras.items() if v}
    log(f"era names authored: {sum(len(v) for v in eras.values())} rows across "
        f"{len(eras)} companies; proven-anachronistic labels: {len(suspect)}")

    # 🔴 THE CURATED HQ LAYERS. out/company_rankings.csv carries only what Fortune
    # PUBLISHED (2007+) plus the carry, which is why the board showed no HQ for
    # companies that had been mapped by hand. The curation lives in
    # company_hq_spans (dated eras, period-correct) and company_hq (single value),
    # and neither was ever read back here. Same join as the metro rollup: the era
    # CONTAINING the year wins, then the single address, then whatever the CSV had.
    from common import select_all
    spans = defaultdict(list)
    try:
        for s in select_all("/rest/v1/company_hq_spans?select=company_key,from_year,"
                            "to_year,city,state,metro,metro_status",
                            "company_key,from_year"):
            spans[s["company_key"]].append(s)
        hqmap = {h["company_key"]: h for h in
                 select_all("/rest/v1/company_hq?select=company_key,hq_city,hq_state,"
                            "metro", "company_key")}
        log(f"curated HQ: {sum(len(v) for v in spans.values())} dated eras for "
            f"{len(spans)} companies, {len(hqmap)} single-value rows")
    except Exception as e:
        hqmap = {}
        log(f"WARNING: could not read the curated HQ layers ({e}); "
            f"falling back to the CSV's published HQ only")

    # Metro slugs, so the company table can LINK each metro. This is a metro site;
    # the metro is the primary fact in that column and the street address is the
    # footnote, not the other way round.
    metros_json = os.path.join(os.path.dirname(DEST), "..", "metros.json")
    slug_of = {}
    for m in json.load(open(os.path.normpath(metros_json), encoding="utf-8")):
        if m.get("name") and m.get("slug"):
            slug_of.setdefault(m["name"], m["slug"])

    def curated_hq(k, y, r):
        """(city, state, metro, metro_slug, carried) for this company in this year."""
        def pack(city, state, metro, carried):
            return (city or None, state or None, metro or None,
                    slug_of.get(metro) if metro else None, carried)
        for s in spans.get(k, ()):
            if int(s["from_year"]) <= y <= int(s["to_year"]):
                return pack(s.get("city"), s.get("state"), s.get("metro"), 0)
        h = hqmap.get(k)
        if h and (h.get("hq_city") or "").strip():
            return pack(h["hq_city"], h.get("hq_state"), h.get("metro"), 1)
        return pack(r.get("hq_city"), r.get("hq_state"), None,
                    1 if (r.get("hq_source") or "").startswith("carried") else 0)

    by_year = defaultdict(list)
    for r in rows:
        by_year[int(r["year"])].append(r)
    LATEST = max(by_year)

    years, stats, keys = {}, {}, set()
    for y, rs in by_year.items():
        rs.sort(key=lambda r: int(r["rank"]))
        rev_total = sum(num(r["revenue_musd"]) or 0 for r in rs)
        stats[str(y)] = {
            "n": len(rs),
            "rev": round(rev_total, 1),
            "hq": sum(1 for r in rs if r.get("hq_city")),
            "src": rs[0]["source"],
        }
        out = []
        for r in rs[: a.per_year]:
            k = r["company_key"]
            keys.add(k)
            name, flag = r["company"], 0
            hit = next((n for f0, t0, n in eras.get(k, ()) if f0 <= y <= t0), None)
            if hit:
                # A curation row whose era name EQUALS the published name is a
                # CONFIRMATION, not a correction: someone checked that General
                # Motors really was called General Motors in 1962. Flagging that
                # as "corrected" would overstate the work and, worse, leave the
                # reader unable to tell a checked name from an unchecked one.
                name = hit
                flag = 0 if hit == r["company"] else 1
            elif k in suspect and y < suspect_until.get(k, 10**6):
                # 🔴 The detector flags a COMPANY, not a year. Left alone that marks
                # Citigroup as provably wrong in 2020 because the name is wrong in
                # 1996 — 129 rows of false alarm, which teaches a reader to ignore
                # the marker. A curated era says when the modern name STARTS being
                # right, and from that year the flag no longer applies.
                flag = 2                        # proven anachronistic, not yet fixed
            elif y < LATEST:
                # NEITHER source dates names. Measured 2026-08-16: of 2,995 modern
                # company records, 2,875 show exactly one name across their whole
                # span, and the 120 that vary do so only by punctuation ("ConAgra
                # Foods" vs "ConAgra Foods, Incorporated"). Both feeds stamp TODAY'S
                # name on every year of a record: GE Aerospace runs from 1996 though
                # the name dates to 2024, RTX from 1996 though it dates to 2023,
                # Truist from 1998, Meta Platforms from 2012, Walmart from 1996
                # though it was Wal-Mart Stores until 2018.
                # So only the newest year can be assumed current. Everything else is
                # source-recorded and undated until someone authors the era.
                flag = 3
            city, state, metro, mslug, carried = curated_hq(k, y, r)
            out.append([
                int(r["rank"]), name, num(r["revenue_musd"]),
                num(r["market_value_musd"]), r.get("sector") or None,
                city, state, carried, flag, metro, mslug,
            ])
        years[str(y)] = out

    # Longevity: the companies that kept showing up. A second panel, and the most
    # direct answer to "who was actually big for a long time".
    span = defaultdict(lambda: {"years": 0, "best": 10**6, "name": "", "last": 0})
    for r in rows:
        s = span[r["company_key"]]
        s["years"] += 1
        s["best"] = min(s["best"], int(r["rank"]))
        if int(r["year"]) >= s["last"]:
            s["last"] = int(r["year"]); s["name"] = r["company"]
    longest = sorted(span.values(), key=lambda s: (-s["years"], s["best"]))[:40]

    ys = sorted(by_year)
    gaps = [y for y in range(ys[0], ys[-1] + 1) if y not in by_year]
    doc = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "Fortune 500 / Fortune 1000, as published each year",
            "first_year": ys[0], "last_year": ys[-1], "years": len(ys),
            "per_year": a.per_year, "total_rows": len(rows), "companies": len(span),
            "gaps": gaps,
            "note": ("Point-in-time: each year is the list as published that year, so "
                     "companies that later merged, delisted or failed are present. "
                     "Ranked by revenue. Headquarters is supplied by Fortune from 2007 "
                     "and carried to a company's other years where possible."),
        },
        "fields": FIELDS,
        "years": years,
        "stats": stats,
        "longest": [[s["name"], s["years"], s["best"]] for s in longest],
    }

    os.makedirs(os.path.dirname(a.dest), exist_ok=True)
    with open(a.dest, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    kb = os.path.getsize(a.dest) / 1024
    log(f"{len(ys)} years ({ys[0]}-{ys[-1]}), top {a.per_year} each, "
        f"{len(keys)} distinct companies shown -> {a.dest} ({kb:.0f} KB)")
    if gaps:
        log(f"WARNING: year gaps {gaps}")
    if kb > 3000:
        log("WARNING: over 3 MB. Drop --per-year before shipping this to a hub tab.")


if __name__ == "__main__":
    main()
