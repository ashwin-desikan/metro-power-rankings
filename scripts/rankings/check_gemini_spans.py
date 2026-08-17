"""Cross-check Gemini's HQ spans against the Wikipedia evidence it never saw.

Gemini answered from its own knowledge. `out/wiki_hq_extracts.jsonl` was built
independently from article text. Where the two agree the claim has two sources;
where Gemini names a city that appears NOWHERE in the article, that is the row
worth a human minute.

This does not decide anything on its own — an article can simply omit a true
headquarters, and the extractor keeps only eight sentences. It is a TRIAGE that
turns "spot-check a random dozen" into "read the fifteen that disagree".

  python check_gemini_spans.py                  # triage all of them
  python check_gemini_spans.py --sample 12      # a seeded random dozen as well
  python check_gemini_spans.py --key borden chemical
"""
import argparse, csv, json, os, re, sys
from collections import Counter, OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GEM = os.path.join(HERE, "curation", "gemini_hq_spans.csv")
MINE = os.path.join(HERE, "curation", "hq_spans.csv")
EXTRACTS = os.path.join(OUT, "wiki_hq_extracts.jsonl")

# Cities whose name will not appear verbatim because the article uses the metro,
# the county or the building instead. Matching these loosely would hide real
# misses, so they are listed explicitly rather than handled by a fuzzy rule.
ALSO = {
    "new york city": ["new york", "manhattan", "nyc", "rockefeller"],
    "st. louis": ["st louis", "saint louis"],
    "winston-salem": ["winston salem"],
    "washington": ["washington, d.c", "washington dc"],
    "dakota city": ["dakota city"],
}


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", (s or "").lower())).strip()


def mentioned(city, evidence):
    c = norm(city)
    if not c:
        return False
    if c in evidence:
        return True
    for alt in ALSO.get(city.lower().strip(), []):
        if norm(alt) in evidence:
            return True
    # "Los Angeles" should match "Los Angeles (Century City)"; a single rare token
    # is enough, but a common one like "city" or "new" is not.
    toks = [t for t in c.split() if len(t) > 4]
    return bool(toks) and all(t in evidence for t in toks)


_NOISE = {"company", "corporation", "corp", "inc", "the", "of", "and", "co",
          "group", "industries", "intl", "international", "holdings", "companies"}


def article_matches(title, company):
    """Does the article I fetched plausibly describe the company Fortune listed?

    Token overlap on the distinctive words only. 'NCR' against 'North Central
    Railway zone' shares nothing; 'Georgia-Pacific' against 'Georgia-Pacific'
    shares everything. Deliberately crude — its job is to sort a miss into
    'Gemini may be wrong' or 'my lookup was wrong', not to grade titles."""
    t = {w for w in norm(title).split() if w not in _NOISE and len(w) > 2}
    c = {w for w in norm(company).split() if w not in _NOISE and len(w) > 2}
    if not t or not c:
        return True          # cannot judge; do not blame either side
    return bool(t & c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--key", nargs="*", default=None)
    a = ap.parse_args()

    gem = OrderedDict()
    with open(GEM, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            gem.setdefault(r["company_key"], []).append(r)

    drafted = set()
    if os.path.exists(MINE):
        with open(MINE, encoding="utf-8") as f:
            drafted = {r["company_key"] for r in csv.DictReader(f)}

    ext = {}
    with open(EXTRACTS, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            ext[r["company_key"]] = r

    if a.key:
        keys = [" ".join(a.key)]
    else:
        keys = [k for k in gem if k not in drafted]

    verdicts, flagged, bad_article = Counter(), [], []
    for k in keys:
        e = ext.get(k, {})
        blob = norm(" ".join(list((e.get("infobox_hq") or {}).values())
                             + (e.get("sentences") or [])))
        cities = [r["city"] for r in gem[k] if r["city"]]
        if not blob:
            verdicts["no_evidence"] += 1
            continue
        hits = [c for c in cities if mentioned(c, blob)]
        # 🔴 Separate the two causes of a miss. A miss can mean Gemini is wrong, OR
        # that MY article lookup landed on the acquirer or a namesake — NCR resolved
        # to an Indian railway zone, Continental Group to Irish Continental Group,
        # Bestfoods to Unilever. Reporting those together would blame Gemini for my
        # own resolution failures, which is the opposite of what this check is for.
        # ORDER MATTERS. Check the cities FIRST. A renamed-but-correct article
        # (Wal-Mart Stores -> Walmart, Federal National Mortgage Association ->
        # Fannie Mae) shares no title tokens with the Fortune name and would be
        # thrown out as a bad lookup even though it confirms every city. Testing
        # the title first counted 37 bad articles when most were successors of the
        # SAME company reporting the SAME headquarters. A title mismatch only
        # means anything when the evidence ALSO fails.
        if len(hits) == len(cities):
            verdicts["all_confirmed"] += 1
        elif not article_matches(e.get("title", ""), e.get("company", "")):
            verdicts["MY_ARTICLE_IS_WRONG"] += 1
            bad_article.append((k, e))
        elif hits:
            verdicts["partly_confirmed"] += 1
            flagged.append((k, cities, hits, e))
        else:
            verdicts["none_confirmed"] += 1
            flagged.append((k, cities, hits, e))

    log(f"cross-checked {len(keys)} companies Gemini answered and I did not draft")
    for v, n in verdicts.most_common():
        log(f"  {v:<18} {n}")

    print("\n" + "=" * 78)
    print("MY ARTICLE LOOKUP LANDED ON THE WRONG COMPANY — re-fetch these, do not")
    print("hold them against Gemini's answer")
    print("=" * 78)
    for k, e in bad_article:
        print(f"  {k:<34} -> {e.get('title','?')}")

    if a.key:
        flagged = [(k, [r['city'] for r in gem[k]], [], ext.get(k, {})) for k in keys]

    print("\n" + "=" * 78)
    print("ROWS WORTH A HUMAN MINUTE (a city Gemini names that the article never does)")
    print("=" * 78)
    for k, cities, hits, e in flagged:
        miss = [c for c in cities if c not in hits]
        print(f"\n--- {k}   [{e.get('title', '?')}]")
        for r in gem[k]:
            mark = " " if r["city"] in hits else "?"
            print(f"  {mark} {r['from_year']}-{r['to_year']} {r['city']}, "
                  f"{r['state']}  ({r['confidence']})")
        ib = "; ".join((e.get("infobox_hq") or {}).values())[:110]
        print(f"    infobox : {ib or '-'}")
        for s in (e.get("sentences") or [])[:3]:
            print(f"    * {s[:190]}")
        if not e.get("sentences"):
            print("    * (no headquarters sentence in the article)")

    if a.sample:
        import random
        pool = [k for k in keys if k not in {f[0] for f in flagged}]
        random.Random(1955).shuffle(pool)
        print("\n" + "=" * 78)
        print(f"SEEDED RANDOM SAMPLE OF {a.sample} THAT THE TRIAGE PASSED")
        print("=" * 78)
        for k in pool[:a.sample]:
            e = ext.get(k, {})
            print(f"\n--- {k}   [{e.get('title','?')}]")
            for r in gem[k]:
                print(f"    {r['from_year']}-{r['to_year']} {r['city']}, {r['state']}")
            for s in (e.get("sentences") or [])[:2]:
                print(f"    * {s[:190]}")


if __name__ == "__main__":
    main()
