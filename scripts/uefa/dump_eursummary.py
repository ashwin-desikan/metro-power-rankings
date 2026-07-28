#!/usr/bin/env python3
"""Extract Team-name -> Cur Name crosswalk from the CL workbook 'Eur Summary'
(and 'Eur RndbyRnd' as backup). Writes _eur_namecross.json next to this script."""
import openpyxl, os, json

WB = r"C:\Users\ashwi\OneDrive\Excel Files\Champions League-201516.xlsx"
wb = openpyxl.load_workbook(WB, read_only=True, data_only=True)

def hdr_idx(ws):
    it = ws.iter_rows(values_only=True)
    hdr = [str(h).strip() if h is not None else "" for h in next(it)]
    return hdr, it

def find(hdr, *names):
    for n in names:
        for i, h in enumerate(hdr):
            if h.lower() == n.lower():
                return i
    return None

def collect(sheet, cross, countcol=False):
    ws = wb[sheet]
    hdr, it = hdr_idx(ws)
    ti = find(hdr, "Team", "Team Name", "Name")
    ci = find(hdr, "Cur Name", "Cur. Name", "Canonical")
    coi = find(hdr, "Country")
    print(f"[{sheet}] hdr={hdr[:12]} team_idx={ti} cur_idx={ci} country_idx={coi}")
    n = 0
    for r in it:
        def g(i): return r[i] if (i is not None and i < len(r)) else None
        team = g(ti); cur = g(ci); ctry = g(coi)
        if not team or not cur: continue
        team = str(team).strip(); cur = str(cur).strip()
        ctry = str(ctry).strip() if ctry else None
        cross.setdefault(team, {})[(cur, ctry)] = cross.get(team, {}).get((cur, ctry), 0) + 1
        n += 1
    print(f"[{sheet}] rows collected={n}")
    return hdr

cross = {}
collect("Eur Summary", cross)
collect("Eur RndbyRnd", cross)

# flatten: team -> list of {cur, country, n}
out = {}
for team, m in cross.items():
    out[team] = [{"cur": cur, "country": ctry, "n": cnt} for (cur, ctry), cnt in m.items()]
path = os.path.join(os.path.dirname(__file__), "_eur_namecross.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
print("distinct team-names:", len(out))
print("wrote", path)
