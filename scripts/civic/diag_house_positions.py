#!/usr/bin/env python3
"""One-off diagnostic: why did discover_positions_by_sitelinks() find ZERO
candidates for Majority Whip / Minority Whip / Republican Conference Chair /
Democratic Caucus Chair (2026-07-21 live run), unlike Speaker/Majority
Leader/Minority Leader which resolved fine? Hypothesis: these narrower
party-caucus roles may not have Wikidata's P1001 (jurisdiction) property set
the way full constitutional offices do, so the P1001=Q30 filter excludes them
entirely. This queries WITHOUT the jurisdiction filter to check.

Usage: python3 scripts/civic/diag_house_positions.py
Safe to delete after use -- not part of the refresh pipeline.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sparql, qid  # noqa

KEYWORDS = ["majority whip", "minority whip", "republican conference", "democratic caucus"]

def main():
    for kw in KEYWORDS:
        q = f'''SELECT ?position ?label ?sitelinks WHERE {{
          ?position rdfs:label ?label . FILTER(LANG(?label) = "en")
          FILTER(CONTAINS(LCASE(?label), "{kw}"))
          OPTIONAL {{ ?position wikibase:sitelinks ?sitelinks }}
        }}'''
        rows = sparql(q, timeout=60, retries=2)
        print(f"--- {kw!r}: {len(rows)} matches ---")
        ranked = sorted(rows, key=lambda r: -int(r.get("sitelinks", {}).get("value", "0")))
        for r in ranked[:8]:
            pos = qid(r.get("position", {}).get("value", ""))
            lbl = r.get("label", {}).get("value", "")
            links = r.get("sitelinks", {}).get("value", "0")
            print(f"  {pos}  {lbl!r}  sitelinks={links}")

if __name__ == "__main__":
    main()
