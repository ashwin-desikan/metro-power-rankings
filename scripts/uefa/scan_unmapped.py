#!/usr/bin/env python3
"""Scan _kassiesa_all_rows.json.gz for club slots that did not map to a canonical
club. Prints the match rate and the distinct (raw name, country code) still unmapped,
most-frequent first, so the Lookup gaps are easy to see."""
import json, gzip, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "_kassiesa_all_rows.json.gz")

with gzip.open(OUT, "rt", encoding="utf-8") as f:
    rows = json.load(f)

slots = 2 * len(rows)
un = Counter()
for r in rows:
    if r.get("home_canon") is None:
        un[(r.get("home_raw"), r.get("home_cc"))] += 1
    if r.get("away_canon") is None:
        un[(r.get("away_raw"), r.get("away_cc"))] += 1

unslots = sum(un.values())
print(f"rows={len(rows)} slots={slots} matched={slots-unslots}/{slots} "
      f"({100*(slots-unslots)/slots:.2f}%) distinct_unmapped={len(un)}")
print("---- distinct unmapped (raw | cc | occurrences) ----")
for (name, cc), n in un.most_common():
    print(f"{name} | {cc} | {n}")
