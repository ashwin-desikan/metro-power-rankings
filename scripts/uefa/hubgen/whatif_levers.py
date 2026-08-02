#!/usr/bin/env python3
"""What-if sweep for TOP_TROPHY_BONUS / PED_WEIGHT without regenerating hubs.

Reconstructs each club's score from the components stored in the hub JSON:
  score = 0.65*form + 0.35*ped + 0.11*curN - pen + tb
so    curN_term = score - 0.65*form - 0.35*ped + pen - tb   (pen from winpct)
and a candidate (PW, TB) rescoring is exact:
  new = 0.65*form + PW*ped + curN_term - pen + tb + (TB-0.10 if UCL winner)

Prints, per candidate: how many of the 67 hubs now rank the winner #1, and
which seasons still miss (with the club that stays ahead).

Run from repo root: python scripts/uefa/hubgen/whatif_levers.py
"""
import glob
import io
import json
import os

# The TOP_TROPHY_BONUS actually baked into the CURRENT hub JSONs — keep in
# sync with gen_hub_early.TOP_TROPHY_BONUS after every regen, or the winner
# adjustment below is computed from the wrong baseline. 0.12 since 2026-08-02.
BASE_TB = 0.12

HUBS = []
for f in sorted(glob.glob(os.path.join("public", "data", "football", "hub-*.json"))):
    d = json.load(io.open(f, encoding="utf-8"))
    clubs = d.get("clubs") or []
    if not clubs:
        continue
    winner = None
    for comp in d.get("continental") or []:
        if comp.get("section") == "ucl":
            for e in comp.get("entries") or []:
                if e.get("trophy"):
                    winner = e.get("name")
    if not winner or winner not in {c["name"] for c in clubs}:
        continue
    HUBS.append((d.get("season"), winner, clubs))


def rescore(clubs, winner, PW, TB):
    out = []
    for c in clubs:
        pen = max(0.0, 0.5 - c.get("winpct", 0.5)) * 0.6
        curn = c["score"] - 0.65 * c["form"] - 0.35 * c["ped"] + pen - c.get("tb", 0)
        new = 0.65 * c["form"] + PW * c["ped"] + curn - pen + c.get("tb", 0)
        if c["name"] == winner:
            new += TB - BASE_TB
        out.append((new, c["name"]))
    out.sort(key=lambda x: -x[0])
    return out


for PW, TB in [(0.35, 0.10), (0.35, 0.15), (0.35, 0.20), (0.35, 0.25),
               (0.30, 0.15), (0.30, 0.20), (0.28, 0.20), (0.30, 0.25),
               (0.35, 0.45), (0.30, 0.45)]:
    miss = []
    for season, winner, clubs in HUBS:
        ranked = rescore(clubs, winner, PW, TB)
        if ranked[0][1] != winner:
            pos = next(i for i, (_, n) in enumerate(ranked) if n == winner) + 1
            miss.append((season, winner, pos, ranked[0][1], round(ranked[0][0] - ranked[pos - 1][0], 3)))
    print("PW=%.2f TB=%.2f -> winner #1 in %d/%d; misses: %d" % (PW, TB, len(HUBS) - len(miss), len(HUBS), len(miss)))
    for m in miss:
        print("    %-9s %-26s rank=%-3s behind %-26s by %.3f" % m)
