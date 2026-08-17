"""Condense the Wikipedia extracts into a drafting sheet a human can work in bulk.

The extracts carry up to eight sentences each; reading all 213 raw would cost
more context than the drafting itself. This emits one compact block per company,
ordered by board impact, so a curator can work in batches of 25.

  python digest_wiki_hq.py                # everything
  python digest_wiki_hq.py --start 0 --count 25
  python digest_wiki_hq.py --todo         # skip companies already in hq_spans.csv

  -> stdout (redirect to a file if you want one)
"""
import argparse, csv, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT  # noqa: E402

EXTRACTS = os.path.join(OUT, "wiki_hq_extracts.jsonl")
SPANS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "curation", "hq_spans.csv")
YEAR = re.compile(r"\b(1[89]\d{2}|20[0-2]\d)\b")


def curated_keys():
    if not os.path.exists(SPANS):
        return set()
    with open(SPANS, encoding="utf-8") as f:
        return {r["company_key"] for r in csv.DictReader(f)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int, default=0)
    ap.add_argument("--todo", action="store_true")
    a = ap.parse_args()

    rows = [json.loads(l) for l in open(EXTRACTS, encoding="utf-8")]
    rows.sort(key=lambda r: -r.get("board_rows", 0))
    if a.todo:
        done = curated_keys()
        rows = [r for r in rows if r["company_key"] not in done]
    total = len(rows)
    if a.count:
        rows = rows[a.start:a.start + a.count]

    print(f"### {len(rows)} of {total} companies "
          f"(offset {a.start}); span = the years the company was LISTED\n")
    for r in rows:
        hq = r.get("infobox_hq") or {}
        life = r.get("infobox_life") or {}
        hq_s = "; ".join(f"{v}" for k, v in hq.items() if v)[:150] or "-"
        life_s = "; ".join(f"{k}={v}" for k, v in life.items()
                           if k in ("founded", "foundation", "defunct", "dissolved",
                                    "fate", "parent"))[:170] or "-"
        print(f"--- {r['company_key']}")
        print(f"    {r['company']}  | listed {r['first_year']}-{r['last_year']} "
              f"| {r['board_rows']} board rows | {r.get('title') or 'NO ARTICLE'}")
        print(f"    infobox HQ : {hq_s}")
        print(f"    life       : {life_s}")
        if r.get("error"):
            print(f"    ERROR      : {r['error']}")
        dated = [s for s in r.get("sentences", []) if YEAR.search(s)]
        undated = [s for s in r.get("sentences", []) if not YEAR.search(s)]
        for s in (dated[:3] or undated[:1]):
            print(f"    * {s[:230]}")
        if not r.get("sentences"):
            print("    * (no headquarters sentence found)")
        print()


if __name__ == "__main__":
    main()
