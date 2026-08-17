"""Emit the HQ curation worklist in a form a second model can answer usefully.

Two files into docs/:
  Board A - HQ brief for Gemini.md    the brief, the traps, the return format
  Board A - HQ worklist.csv           the 213 companies, one row each

The CSV deliberately carries what Wikipedia's infobox says TODAY, in its own
column and clearly labelled as such, because for most of these companies that
value is the successor's address and is wrong for the whole listing span.
Showing it is what lets a reviewer see the trap rather than fall into it.
"""
import csv, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))          # scripts/rankings
DOCS = os.path.normpath(os.path.join(HERE, "..", "..", "docs"))
EXTRACTS = os.path.join(OUT, "wiki_hq_extracts.jsonl")
SPANS = os.path.join(HERE, "curation", "hq_spans.csv")
CSV_OUT = os.path.join(DOCS, "Board A - HQ worklist.csv")

FIELDS = ["company_key", "company", "listed_from", "listed_to", "span_years",
          "board_rows", "wikipedia_title", "wikipedia_url",
          "infobox_says_today_MAY_BE_WRONG", "already_drafted"]


def main():
    os.makedirs(DOCS, exist_ok=True)
    rows = [json.loads(l) for l in open(EXTRACTS, encoding="utf-8")]
    rows.sort(key=lambda r: -r.get("board_rows", 0))

    drafted = set()
    if os.path.exists(SPANS):
        with open(SPANS, encoding="utf-8") as f:
            drafted = {r["company_key"] for r in csv.DictReader(f)}

    out = []
    for r in rows:
        hq = r.get("infobox_hq") or {}
        out.append({
            "company_key": r["company_key"],
            "company": r["company"],
            "listed_from": r["first_year"],
            "listed_to": r["last_year"],
            "span_years": r["last_year"] - r["first_year"],
            "board_rows": r.get("board_rows", 0),
            "wikipedia_title": r.get("title", ""),
            "wikipedia_url": r.get("url", ""),
            "infobox_says_today_MAY_BE_WRONG":
                "; ".join(v for v in hq.values() if v)[:120],
            "already_drafted": "yes" if r["company_key"] in drafted else "",
        })

    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)

    log(f"-> {CSV_OUT}")
    log(f"{len(out)} companies; {sum(1 for r in out if r['already_drafted'])} already drafted")
    log(f"{sum(1 for r in out if r['span_years'] > 20)} span more than 20 years")


if __name__ == "__main__":
    main()
