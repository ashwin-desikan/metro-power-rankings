"""Roll the corporate rankings up by metro, year by year.

  python emit_metro_rollup.py   -> public/data/business/rankings-metros.json

THE JOIN IS PERIOD-CORRECT. A company's metro is taken from the era that CONTAINS
the ranking year, not from its last known address:

    company_rankings r
      join company_hq_spans s on s.company_key = r.company_key
                             and r.year between s.from_year and s.to_year

That is the whole reason the spans table exists. Chrysler's 1970 revenue belongs
to Detroit either way, but Atlantic Richfield's 1960 belongs to Philadelphia and
its 1980 to Los Angeles, and a single-address join would have put both in one.

Companies with no curated span fall back to `company_hq.metro`, the single value
Fortune published. That is marked in the output as `carried` so the board can be
honest that the early years of an uncurated company are its later address.

🔴 Rows whose metro is genuinely unknown are counted and reported, never dropped.
A metro total that silently excludes what it could not place reads as complete.
"""
import csv, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import log, select_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUTFILE = os.path.normpath(os.path.join(
    HERE, "..", "..", "public", "data", "business", "rankings-metros.json"))
# 🔴 The SAME era-name file the company table uses. Both boards sit on one page,
# so a company named one way in the table and another way in the metro rollup is
# the page contradicting itself: Chicago 1955 read "Esmark", a name not coined
# until 1973, directly under a table that read "Swift & Company".
NAMES = os.path.join(HERE, "curation", "era_names.csv")
BOARD_DEPTH = 100


def load_eras():
    """company_key -> sorted [(from_year, to_year, name)]. Same contract as
    emit_rankings.py: a filled era_name replaces the recorded name for the years
    it covers, and nothing else is touched."""
    eras = defaultdict(list)
    if not os.path.exists(NAMES):
        log("🔴 era_names.csv is missing; the metro board will use recorded names")
        return eras
    with open(NAMES, encoding="utf-8-sig") as f:
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
    return eras


def era_name(eras, k, y, recorded):
    for a, b, n in eras.get(k, ()):
        if a <= y <= b:
            return n
    return recorded


def main():
    spans = select_all("/rest/v1/company_hq_spans?select=company_key,from_year,"
                       "to_year,city,state,metro,metro_status", "company_key,from_year")
    by_company = defaultdict(list)
    for s in spans:
        by_company[s["company_key"]].append(s)
    log(f"{len(spans)} dated eras for {len(by_company)} companies")

    hq = {h["company_key"]: h for h in
          select_all("/rest/v1/company_hq?select=company_key,metro,hq_city,hq_state",
                     "company_key")
          if (h.get("metro") or "").strip()}
    log(f"{len(hq)} companies with a single-value metro fallback")

    rk = select_all(f"/rest/v1/company_rankings?select=company_key,company,year,rank,"
                    f"revenue_musd&rank=lte.{BOARD_DEPTH}", "year,rank,company_key")
    log(f"{len(rk)} board rows (rank <= {BOARD_DEPTH})")

    eras = load_eras()
    log(f"{sum(len(v) for v in eras.values())} authored name eras across "
        f"{len(eras)} companies")

    def cell():
        return {"companies": 0, "revenue": 0.0, "top": None, "top_rank": 10 ** 6,
                "carried": 0,
                # The city breakdown behind each metro. A metro row says Detroit;
                # the reader's next question is which places inside it, and the
                # answer (Highland Park, Auburn Hills, Southfield, Dearborn) is the
                # whole point of aggregating to a metro in the first place.
                "cities": defaultdict(lambda: {"companies": 0, "revenue": 0.0,
                                               "top": None, "top_rank": 10 ** 6})}

    years = defaultdict(lambda: defaultdict(cell))
    unplaced = defaultdict(lambda: {"rows": 0, "revenue": 0.0})
    stats = {"dated": 0, "carried": 0, "no_metro_ruled": 0, "unplaced": 0}

    for r in rk:
        y, k = int(r["year"]), r["company_key"]
        metro, how, city, state = None, None, None, None
        for s in by_company.get(k, ()):
            if int(s["from_year"]) <= y <= int(s["to_year"]):
                if s.get("metro"):
                    metro, how = s["metro"], "dated"
                    city, state = s.get("city"), s.get("state")
                elif s.get("metro_status") == "no_metro":
                    how = "no_metro_ruled"
                break
        if metro is None and how is None:
            h = hq.get(k)
            if h:
                metro, how = h["metro"], "carried"
                city, state = h.get("hq_city"), h.get("hq_state")
        if metro is None:
            stats[how or "unplaced"] = stats.get(how or "unplaced", 0) + 1
            if how != "no_metro_ruled":
                u = unplaced[k]
                u["rows"] += 1
                u["revenue"] += float(r.get("revenue_musd") or 0)
            continue

        stats[how] += 1
        c = years[y][metro]
        rev = float(r.get("revenue_musd") or 0)
        shown = era_name(eras, k, y, r["company"])
        c["companies"] += 1
        c["revenue"] += rev
        if how == "carried":
            c["carried"] += 1
        if int(r["rank"]) < c["top_rank"]:
            c["top_rank"], c["top"] = int(r["rank"]), shown

        label = (f"{city}, {state}" if city and state else (city or "—"))
        cc = c["cities"][label]
        cc["companies"] += 1
        cc["revenue"] += rev
        if int(r["rank"]) < cc["top_rank"]:
            cc["top_rank"], cc["top"] = int(r["rank"]), shown

    # Metro SLUGS, so the board can link to each metro's own page at
    # /rankings/<slug>. A board that names a metro without linking it is a dead
    # end, and the site's whole point is that every metro has a page.
    metros_json = os.path.normpath(os.path.join(
        HERE, "..", "..", "public", "data", "metros.json"))
    slug_of = {}
    for m in json.load(open(metros_json, encoding="utf-8")):
        if m.get("name") and m.get("slug"):
            slug_of.setdefault(m["name"], m["slug"])
    log(f"{len(slug_of)} metro name -> slug pairs from metros.json")

    out_years, unlinked = {}, set()
    for y in sorted(years):
        rows = []
        for metro, c in years[y].items():
            slug = slug_of.get(metro)
            if not slug:
                unlinked.add(metro)
            cities = sorted(
                ({"city": lbl, "companies": v["companies"],
                  "revenue": round(v["revenue"], 1), "top": v["top"],
                  "topRank": v["top_rank"]} for lbl, v in c["cities"].items()),
                key=lambda x: (-x["companies"], -x["revenue"]))
            rows.append({"metro": metro, "slug": slug, "companies": c["companies"],
                         "revenue": round(c["revenue"], 1), "top": c["top"],
                         "topRank": c["top_rank"], "carried": c["carried"],
                         "cities": cities})
        rows.sort(key=lambda r: (-r["companies"], -r["revenue"]))
        out_years[str(y)] = rows

    worst = sorted(unplaced.items(), key=lambda kv: -kv[1]["rows"])[:25]
    from datetime import datetime, timezone
    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": "company_rankings x company_hq_spans x company_hq (Supabase)",
            "boardDepth": BOARD_DEPTH,
            "years": [int(y) for y in sorted(out_years)],
            "rows": len(rk),
            "placedByDatedEra": stats["dated"],
            "placedByCarriedAddress": stats["carried"],
            "ruledNoMetro": stats["no_metro_ruled"],
            "unplaced": stats["unplaced"],
            "note": ("A company is placed in the metro of the HQ era containing that "
                     "year. Where no dated era exists the single published address "
                     "is carried across the company's whole run and counted in "
                     "`carried`."),
            "biggestUnplaced": [{"company_key": k, "rows": v["rows"]}
                                for k, v in worst],
        },
        "years": out_years,
    }
    os.makedirs(os.path.dirname(OUTFILE), exist_ok=True)
    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    tot = sum(stats.values())
    log(f"placed by dated era : {stats['dated']} ({stats['dated']/tot*100:.1f}%)")
    log(f"placed by carried   : {stats['carried']} ({stats['carried']/tot*100:.1f}%)")
    log(f"ruled no metro      : {stats['no_metro_ruled']}")
    log(f"UNPLACED            : {stats['unplaced']} ({stats['unplaced']/tot*100:.1f}%)")
    log(f"years {min(out_years)}-{max(out_years)}, "
        f"{sum(len(v) for v in out_years.values())} metro-year cells")
    if unlinked:
        log(f"🔴 {len(unlinked)} metro names have NO slug and will not link: "
            f"{', '.join(sorted(unlinked)[:8])}")
    log(f"-> {OUTFILE} ({os.path.getsize(OUTFILE)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
