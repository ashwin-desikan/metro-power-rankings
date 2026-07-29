#!/usr/bin/env python3
"""Extract level-1 domestic league fixtures (one row per match, home perspective) from
Ashwin's 85MB results93_23_primary.txt into a compact per-season bundle used to feed the
club power-ranking FORM term for the older season hubs. Canonical names are already in the
export (Cur. Name / Opp. Name). Emits scripts/uefa/data/domfix_<lo>_<hi>.json."""
import csv, json, os
SRC = r"C:\Users\ashwi\Desktop\New folder (2)\results93_23_primary.txt"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "domfix_2007_2013.json")
WANT = {"2007", "2008", "2009", "2010", "2011", "2012", "2013"}
out = {s: [] for s in WANT}
with open(SRC, encoding="utf-8", errors="replace") as f:
    r = csv.reader(f, delimiter="\t")
    hdr = next(r); idx = {h.strip(): i for i, h in enumerate(hdr)}
    def g(row, name):
        i = idx.get(name); return (row[i] if (i is not None and i < len(row)) else "").strip()
    for row in r:
        s = g(row, "Seas")
        if s not in WANT: continue
        if g(row, "Lg. Games") != "Y" or g(row, "H/A") != "Home" or g(row, "Level") != "1": continue
        try: hg, ag = int(g(row, "For")), int(g(row, "Ag"))
        except ValueError: continue
        out[s].append({"home": g(row, "Cur. Name"), "away": g(row, "Opp. Name"), "hg": hg, "ag": ag,
                       "country": g(row, "Cur. Country"), "league": g(row, "Leag/Comp.")})
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
for s in sorted(WANT):
    cc = {}
    for m in out[s]: cc[m["country"]] = cc.get(m["country"], 0) + 1
    print(f"{s}: {len(out[s])} matches  {cc}")
print("wrote", OUT, round(os.path.getsize(OUT)/1e6, 2), "MB")
