# -*- coding: utf-8 -*-
"""Splice the (Copa-Libertadores-corrected) continental_rbr.json into every hub-*.json, replacing
only hub['continental']. Everything else (clubs/leagues/countries/cups) is untouched."""
import json, os
R = r"C:\Users\ashwi\Desktop\Projects\Metro Area Project"
F = os.path.join(R, "public", "data", "football")
HG = os.path.join(R, "scripts", "uefa", "hubgen")
cr = json.load(open(os.path.join(HG, "continental_rbr.json"), encoding="utf-8"))
SEASONS = [f"{y}-{str(y+1)[2:]}" for y in range(2010, 2025)] + ["2025-26"]
for key in SEASONS:
    p = os.path.join(F, f"hub-{key}.json")
    h = json.load(open(p, encoding="utf-8"))
    before = len(h["continental"])
    h["continental"] = cr[key]
    with open(p, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False)
    lib = next((c for c in cr[key] if "Libertadores" in c.get("comp", "")), None)
    libw = next((e["name"] for e in (lib.get("entries") or []) if e.get("trophy")), None) if lib else None
    print(f"{key}: continental {before}->{len(cr[key])} | Libertadores winner: {libw or '(none)'}")
