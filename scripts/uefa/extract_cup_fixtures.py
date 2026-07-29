#!/usr/bin/env python3
"""Extract level-1 cup matches (domestic major/minor cups, super cups) PLUS the international
one-off competitions (UEFA Super Cup, FIFA Club World Cup, Intercontinental Cup) from Ashwin's
cupresults93_23_primary.txt into a per-season bundle that feeds the club power-ranking FORM term
(top-8 first divisions), so those clubs' cup runs count toward their W/D/L exactly like their league
and European matches. One row per club-match (each club's own result). Covers season-end years
2007..2023 (hubs 2006-07 .. 2022-23). Emits scripts/uefa/data/cupfix_2007_2023.json.

The international competitions carry a blank/uneven Level in the source but every such row is already
a top-8 club (the file is 'primary'), so they are kept regardless of Level. Their W/D/L is taken from
the file's own 'W/D/L' column, which encodes penalty-shootout finals as a win for the trophy winner
and a loss for the runner-up (per Ashwin's preference); domestic cups keep the goals-based result."""
import csv, json, os
SRC = r"C:\Users\ashwi\Desktop\New folder (2)\cupresults93_23_primary.txt"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "cupfix_2007_2023.json")
WANT = {str(y) for y in range(2007, 2024)}
INTL = {"UEFA Super Cup", "FIFA Club World Cup", "Intercontinental Cup"}
out = {s: [] for s in WANT}
with open(SRC, encoding="utf-8", errors="replace") as f:
    r = csv.reader(f, delimiter="\t")
    hdr = next(r); idx = {h.strip(): i for i, h in enumerate(hdr)}
    def g(row, name):
        i = idx.get(name); return (row[i] if (i is not None and i < len(row)) else "").strip()
    for row in r:
        s = g(row, "Seas")
        if s not in WANT: continue
        if g(row, "Cup Games") != "Y": continue
        comp = g(row, "Leag/Comp.")
        is_intl = comp in INTL
        if not is_intl and g(row, "Level") != "1": continue   # domestic cups: first division only
        try: gf, ga = int(g(row, "For")), int(g(row, "Ag"))
        except ValueError: continue
        e = {"cur": g(row, "Cur. Name"), "opp": g(row, "Opp. Name"), "gf": gf, "ga": ga,
             "comp": comp, "country": g(row, "Cur. Country")}
        if is_intl:
            wdl = g(row, "W/D/L").upper()
            if wdl in ("W", "D", "L"): e["wdl"] = wdl   # honour penalty-decided finals as W/L
        out[s].append(e)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
from collections import Counter
for s in sorted(WANT):
    comps = Counter(m["comp"] for m in out[s])
    intl = sum(1 for m in out[s] if "wdl" in m)
    print(f"{s}: {len(out[s])} club-matches ({intl} international) | {len(comps)} comps")
print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB")
