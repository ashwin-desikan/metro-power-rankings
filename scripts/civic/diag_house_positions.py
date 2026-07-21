#!/usr/bin/env python3
"""One-off diagnostic, round 2: label-guessing for the House Whip positions
failed entirely -- neither raw-scan CONTAINS (round 1, timed out) nor
wikibase:mwapi EntitySearch (round 1 fix) turned up a federal item for
"Majority Whip"/"Minority Whip" combined with "United States House of
Representatives" in any phrasing tried. EntitySearch only surfaced the
generic concept item ("whip") and several *state legislature* whip
positions (Ohio Senate/House), never a federal one.

Rather than keep guessing label phrasings, this queries FROM the known
current officeholder: find their Wikidata item by name, then read off every
wdt:P39 (position held) statement and its label. Whichever position label
contains "whip" is the actual QID + label Wikidata uses for this office --
no guessing required.

Usage: python3 scripts/civic/diag_house_positions.py
Safe to delete after use -- not part of the refresh pipeline.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from civic_common import sparql, qid  # noqa

# Current (as of 2026-07-21) House Majority Whip and Minority Whip.
NAMES = ["Tom Emmer", "Katherine Clark"]

def main():
    for name in NAMES:
        q = f'''SELECT ?position ?positionLabel ?jurisdiction ?jurisdictionLabel ?start ?end WHERE {{
          SERVICE wikibase:mwapi {{
            bd:serviceParam wikibase:api "EntitySearch" .
            bd:serviceParam wikibase:endpoint "www.wikidata.org" .
            bd:serviceParam mwapi:search "{name}" .
            bd:serviceParam mwapi:language "en" .
            ?person wikibase:apiOutputItem mwapi:item .
          }}
          ?person wdt:P39 ?position .
          OPTIONAL {{ ?position wdt:P1001 ?jurisdiction . }}
          OPTIONAL {{ ?person p:P39 ?stmt . ?stmt ps:P39 ?position .
                      OPTIONAL {{ ?stmt pq:P580 ?start . }}
                      OPTIONAL {{ ?stmt pq:P582 ?end . }} }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        LIMIT 40'''
        rows = sparql(q, timeout=60, retries=2)
        print(f"--- {name!r}: {len(rows)} P39 (position held) statements ---")
        for r in rows:
            pos = qid(r.get("position", {}).get("value", ""))
            lbl = r.get("positionLabel", {}).get("value", "")
            jur = r.get("jurisdictionLabel", {}).get("value", "")
            start = r.get("start", {}).get("value", "")[:10]
            end = r.get("end", {}).get("value", "")[:10]
            print(f"  {pos}  {lbl!r}  jurisdiction={jur!r}  start={start}  end={end}")

if __name__ == "__main__":
    main()
