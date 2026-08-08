#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Scan every metro page's title list for duplicates, across all sports.

A duplicate is the SAME trophy rendered twice. It is not two trophies won by the
same club in the same year, which is common and must survive:

  * Real Madrid 2024: Champions League, La Liga and Liga ACB
  * Saracens 2016: Champions Cup and the Premiership
  * River Plate 1975: Argentine Metropolitano and Argentine Nacional
  * CF America 2024: Mexican Apertura and Clausura
  * Palmeiras 1967: Taca Brasil and Torneio Roberto Gomes Pedrosa

So the key includes eraName. Dropping it is what nearly deleted 88 real
championships during the migration.

    python scripts/champions/check_dupes.py
"""

import collections
import io
import json
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

H = json.load(io.open("public/data/champions-history.json", encoding="utf-8"))
X = json.load(io.open("public/data/champions-metro-extra.json", encoding="utf-8"))
print("history {:,}   extras {:,}".format(len(H), len(X)))


def union_key(r):
    """Exactly what lib/championsHistory.ts uses to fold the two sources."""
    return (r.get("compSlug") or "", str(r.get("season") or ""),
            (r.get("canonical") or r.get("champion") or "").strip().lower())


def rendered_key(r):
    """What the reader actually sees on a metro page: year, club, trophy."""
    return (str(r.get("year")),
            (r.get("canonical") or r.get("champion") or "").strip().lower(),
            (r.get("eraName") or r.get("competition") or "").strip().lower())


seen = {union_key(r) for r in H}
clash = [r for r in X if union_key(r) in seen]
print("\nextras rows the lib de-dup will drop: {}".format(len(clash)))
for r in clash[:10]:
    print("    {} {} {}".format(r["year"], r["competition"], r["champion"]))

# The union, as the site assembles it: history wins, extras fill the gaps.
merged = list(H) + [r for r in X if union_key(r) not in seen]

per_metro = collections.defaultdict(list)
for r in merged:
    if r.get("metroSlug"):
        per_metro[r["metroSlug"]].append(r)

bad = []
for slug, rows in per_metro.items():
    c = collections.Counter(rendered_key(r) for r in rows)
    bad += [(slug, k, n) for k, n in c.items() if n > 1]

print("\nmetros: {:,}   duplicate lines: {}".format(len(per_metro), len(bad)))
for slug, k, n in sorted(bad)[:30]:
    print("    {}: {} {} - {} x{}".format(slug, k[0], k[1], k[2], n))
sys.exit(1 if bad else 0)
