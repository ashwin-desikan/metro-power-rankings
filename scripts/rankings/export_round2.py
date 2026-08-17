"""Emit the companies whose HQ spans could NOT be corroborated, for a second pass.

Round 1 asked Gemini for all 213. 105 of the 195 I had not drafted were then
confirmed against Wikipedia evidence Gemini never saw. This exports only what is
left: the rows where the independent check found nothing, found a contradiction,
or could not run because the article lookup failed.

  python export_round2.py   -> docs/Board A - HQ round 2.csv

The `why_unconfirmed` column is the point. It tells the reviewer what kind of
doubt applies, which is different for each bucket and changes what would settle it.
"""
import csv, json, os, re, sys
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402
from check_gemini_spans import norm, mentioned, article_matches  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.normpath(os.path.join(HERE, "..", "..", "docs"))
GEM = os.path.join(HERE, "curation", "gemini_hq_spans.csv")
MINE = os.path.join(HERE, "curation", "hq_spans.csv")
EXTRACTS = os.path.join(OUT, "wiki_hq_extracts.jsonl")
CSV_OUT = os.path.join(DOCS, "Board A - HQ round 2.csv")

FIELDS = ["company_key", "company", "listed_from", "listed_to", "board_rows",
          "your_round1_answer", "why_unconfirmed", "article_i_checked"]

# The two rows where I hold a source that contradicts round 1, carried in by hand.
DISPUTED = {
    "atlantic richfield":
        "DISPUTED. You gave Philadelphia 1955-1971 then Los Angeles 1972-2000 and "
        "marked it certain. Wikipedia states a New York City headquarters from 1966 "
        "to 1971, between the two. Please reconsider and cite.",
    "exxon mobil":
        "DISPUTED BY ONE YEAR. You gave Irving from 1990. Wikidata carries a DATED "
        "statement of Las Colinas 1989-1999 for the Exxon entity. Which is right?",
}


def main():
    gem = OrderedDict()
    with open(GEM, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            gem.setdefault(r["company_key"], []).append(r)

    drafted = set()
    with open(MINE, encoding="utf-8") as f:
        drafted = {r["company_key"] for r in csv.DictReader(f)}

    ext = {}
    with open(EXTRACTS, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            ext[r["company_key"]] = r

    out = []
    for k, rs in gem.items():
        e = ext.get(k, {})
        blob = norm(" ".join(list((e.get("infobox_hq") or {}).values())
                             + (e.get("sentences") or [])))
        cities = [r["city"] for r in rs if r["city"]]
        hits = [c for c in cities if mentioned(c, blob)] if blob else []
        title = e.get("title", "")

        if k in DISPUTED:
            why = DISPUTED[k]
        elif k in drafted:
            continue
        elif not blob:
            why = ("NO EVIDENCE. The Wikipedia article I checked says nothing about "
                   "a headquarters at all, so your answer is unverified rather than "
                   "wrong. A citation would settle it.")
        elif len(hits) == len(cities):
            continue
        elif not article_matches(title, e.get("company", "")):
            why = (f"I COULD NOT CHECK IT. My article lookup landed on '{title}', "
                   f"which is not this company. Tell me the correct Wikipedia "
                   f"article title as well as the headquarters.")
        elif hits:
            miss = [c for c in cities if c not in hits]
            why = (f"PARTLY UNCONFIRMED. The article supports {', '.join(hits)} but "
                   f"never mentions {', '.join(miss)}. Is that era right?")
        else:
            why = ("UNCONFIRMED. The article mentions a headquarters but never any "
                   f"city you named ({', '.join(cities)}). Please reconsider.")

        out.append({
            "company_key": k,
            "company": rs[0].get("company", "") or (ext.get(k, {}).get("company", "")),
            "listed_from": e.get("first_year", ""),
            "listed_to": e.get("last_year", ""),
            "board_rows": e.get("board_rows", ""),
            "your_round1_answer": " | ".join(
                f"{r['from_year']}-{r['to_year']} {r['city']}, {r['state']}" for r in rs),
            "why_unconfirmed": why,
            "article_i_checked": title,
        })

    out.sort(key=lambda r: -(r["board_rows"] or 0))
    os.makedirs(DOCS, exist_ok=True)
    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out)

    log(f"-> {CSV_OUT}")
    log(f"{len(out)} companies need a second look "
        f"({len(gem)} answered, {len(gem)-len(out)} settled)")
    kinds = {}
    for r in out:
        tag = r["why_unconfirmed"].split(".")[0]
        kinds[tag] = kinds.get(tag, 0) + 1
    for t, n in sorted(kinds.items(), key=lambda kv: -kv[1]):
        log(f"   {n:>3}  {t}")


if __name__ == "__main__":
    main()
