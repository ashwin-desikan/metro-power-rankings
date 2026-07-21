#!/usr/bin/env python3
"""One-off diagnostic: why did discover_positions_by_sitelinks() find ZERO
candidates for Majority Whip / Minority Whip / Republican Conference Chair /
Democratic Caucus Chair (2026-07-21 live run), unlike Speaker/Majority
Leader/Minority Leader which resolved fine?

First attempt at this diagnostic dropped the P1001 jurisdiction filter and
left `FILTER(CONTAINS(LCASE(?label), "..."))` as the only constraint on
`?position rdfs:label ?label` -- with no indexed triple pattern to bound the
scan, that forces WDQS to walk every English label in Wikidata and times out.
That was a query-design bug, not a Wikidata problem.

This version uses Wikidata's own text-search index (the `wikibase:mwapi`
EntitySearch service) instead of a raw label scan, so each lookup is a fast,
bounded query -- same approach Wikidata's own query examples use for
free-text item lookup.

Usage: python3 scripts/civic/diag_house_positions.py
Safe to delete after use -- not part of the refresh pipeline.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sparql, qid  # noqa

SEARCHES = [
    "Majority Whip",
    "Minority Whip",
    "Majority Whip of the United States House of Representatives",
    "Minority Whip of the United States House of Representatives",
    "Whip United States House of Representatives",
]

def main():
    for term in SEARCHES:
        q = f'''SELECT ?position ?positionLabel ?sitelinks WHERE {{
          SERVICE wikibase:mwapi {{
            bd:serviceParam wikibase:api "EntitySearch" .
            bd:serviceParam wikibase:endpoint "www.wikidata.org" .
            bd:serviceParam mwapi:search "{term}" .
            bd:serviceParam mwapi:language "en" .
            ?position wikibase:apiOutputItem mwapi:item .
          }}
          OPTIONAL {{ ?position wikibase:sitelinks ?sitelinks }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        LIMIT 15'''
        rows = sparql(q, timeout=60, retries=2)
        print(f"--- {term!r}: {len(rows)} matches ---")
        ranked = sorted(rows, key=lambda r: -int(r.get("sitelinks", {}).get("value", "0")))
        for r in ranked:
            pos = qid(r.get("position", {}).get("value", ""))
            lbl = r.get("positionLabel", {}).get("value", "")
            links = r.get("sitelinks", {}).get("value", "0")
            print(f"  {pos}  {lbl!r}  sitelinks={links}")

if __name__ == "__main__":
    main()
