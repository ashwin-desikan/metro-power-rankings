#!/usr/bin/env python3
"""Dump canonical team names from the CL workbook 'Totals' sheet -> _totals_canon.json"""
import openpyxl, os, json
WB = r"C:\Users\ashwi\OneDrive\Excel Files\Champions League-201516.xlsx"
wb = openpyxl.load_workbook(WB, read_only=True, data_only=True)
ws = wb["Totals"]
it = ws.iter_rows(values_only=True)
hdr = [str(h).strip() if h is not None else "" for h in next(it)]
print("HDR", hdr[:15])
def find(*names):
    for n in names:
        for i, h in enumerate(hdr):
            if h.lower() == n.lower(): return i
    return None
ci = find("Cur Name", "Cur. Name", "Team", "Canonical", "Name")
coi = find("Country")
print("canon_idx", ci, "country_idx", coi)
out = []
for r in it:
    def g(i): return r[i] if (i is not None and i < len(r)) else None
    nm = g(ci)
    if not nm: continue
    out.append({"canon": str(nm).strip(), "country": (str(g(coi)).strip() if g(coi) else None)})
path = os.path.join(os.path.dirname(__file__), "_totals_canon.json")
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False)
print("canonical names:", len(out), "sample:", out[:3])
print("wrote", path)
