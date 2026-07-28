#!/usr/bin/env python3
"""Dump EurSummary rows with season/comp keys -> _eursummary_rows.json (+ print formats)."""
import openpyxl, os, json
from collections import Counter
WB = r"C:\Users\ashwi\OneDrive\Excel Files\Champions League-201516.xlsx"
wb = openpyxl.load_workbook(WB, read_only=True, data_only=True)
ws = wb["Eur Summary"]
it = ws.iter_rows(values_only=True)
hdr = [str(h).strip() if h is not None else "" for h in next(it)]
def idx(*names):
    for n in names:
        for i,h in enumerate(hdr):
            if h.lower()==n.lower(): return i
    return None
I = {k: idx(*v) for k,v in {
 "continent":["Continent"], "season":["Season"], "seas":["Seas"],
 "leagcomp":["Leag/Comp."], "comp":["Comp"], "league":["League"],
 "team":["Team"], "cur":["Cur. Name","Cur Name"]}.items()}
print("HDR", hdr)
print("IDX", I)
rows=[]
for r in it:
    def g(i): return r[i] if (i is not None and i < len(r)) else None
    team=g(I["team"]); cur=g(I["cur"])
    if not team or not cur: continue
    rows.append({"continent":g(I["continent"]), "season":g(I["season"]), "seas":g(I["seas"]),
                 "leagcomp":g(I["leagcomp"]), "comp":g(I["comp"]), "league":g(I["league"]),
                 "team":str(team).strip(), "cur":str(cur).strip()})
json.dump(rows, open(os.path.join(os.path.dirname(__file__),"_eursummary_rows.json"),"w",encoding="utf-8"), ensure_ascii=False)
print("rows", len(rows))
print("continents", Counter(str(x["continent"]) for x in rows).most_common())
print("comp values", Counter(str(x["comp"]) for x in rows).most_common(20))
print("season sample", [ (x["season"],x["seas"],x["leagcomp"],x["comp"]) for x in rows[:6] ])
