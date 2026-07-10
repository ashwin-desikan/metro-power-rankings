#!/usr/bin/env python3
"""build-states-directory.py - global per-state population-weighted metro scores
(Municipality-sourced countries use the Municipality sheet, the rest use Counties;
full-credit fallback where population is missing) + the slim states-directory.json
feeding /states. Usage: python scripts/build-states-directory.py [path/to/MetroAreas.xlsx]"""
import json
from collections import defaultdict
from python_calamine import CalamineWorkbook

import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
WB = sys.argv[1] if len(sys.argv) > 1 else str(ROOT.parent / "MetroAreas.xlsx")

def _load(name):
    # Prefer the committed public/data output (the Windows workbook-sync flow);
    # fall back to the /tmp staging used by the sandbox pipeline.
    for p in (ROOT / "public" / "data" / name, Path("/tmp") / name):
        if p.exists():
            return json.load(open(p, encoding="utf-8"))
    raise FileNotFoundError(f"{name} not found in public/data or /tmp")

metros = _load("metros.json")
mrows = metros if isinstance(metros, list) else metros.get("metros", metros)
# (country, metroName) -> (slug, score)
metro_cn = {}
for m in mrows:
    metro_cn[(m.get("country","").strip(), m.get("name","").strip())] = (m["slug"], m.get("score") or 0.0)

states = _load("states.json")
# (country, stateName) -> slug   (country = immediate parent in states.json)
state_slug = {}
meta = {}
for s in states:
    state_slug[(s.get("country","").strip(), s.get("name","").strip())] = s["slug"]
    meta[s["slug"]] = s

wb = CalamineWorkbook.from_path(WB)
muni = wb.get_sheet_by_name("Municipality").to_python(skip_empty_area=True)
cnty = wb.get_sheet_by_name("Counties").to_python(skip_empty_area=True)

# Municipality-sourced countries = those with >=1 muni row carrying a Metro Area
MUNI_C, mC, mST, mPOP, mMET = set(), 1, 4, 5, 6
for r in muni[1:]:
    if str(r[mMET]).strip():
        MUNI_C.add(str(r[mC]).strip())

# aggregate (country, metro, state) -> pop, routed by country
SOV = {"England":"United Kingdom","Scotland":"United Kingdom","Wales":"United Kingdom","Northern Ireland":"United Kingdom"}
ms_pop = defaultdict(float)
def add(country, state, metro, pop):
    if not (country and state and metro): return
    ms_pop[(country, metro, state)] += pop if isinstance(pop,(int,float)) else 0
for r in muni[1:]:
    c=str(r[mC]).strip()
    if c in MUNI_C: add(c, str(r[mST]).strip(), str(r[mMET]).strip(), r[mPOP])
cC,cST,cPOP,cMET = 0,2,5,7
for r in cnty[1:]:
    c=str(r[cC]).strip()
    if c not in MUNI_C: add(c, str(r[cST]).strip(), str(r[cMET]).strip(), r[cPOP])

# metro totals
metro_total = defaultdict(float)
for (c,metro,st),p in ms_pop.items():
    metro_total[(c,metro)] += p

weighted = defaultdict(float); wcount = defaultdict(int)
unmatched_metro=set(); unmatched_state=set()
for (c,metro,st),p in ms_pop.items():
    ms = metro_cn.get((c,metro)) or metro_cn.get((SOV.get(c,c), metro))
    if not ms: unmatched_metro.add((c,metro)); continue
    slug = state_slug.get((c,st))
    if not slug: unmatched_state.add((c,st)); continue
    tot = metro_total[(c,metro)]
    if tot<=0: continue
    weighted[slug] += ms[1]*(p/tot)
    wcount[slug]+=1

# scores json (weighted where available, else full-credit scoreTotal fallback)
scores={}
for slug,s in meta.items():
    if slug in weighted:
        scores[slug]={"score":round(weighted[slug],2),"metros":wcount[slug],"weighted":True}
    else:
        scores[slug]={"score":round(s.get("scoreTotal") or 0.0,2),"metros":s.get("metroCount") or 0,"weighted":False}

# directory rows (slim)
directory=[]
for slug,s in meta.items():
    sc=scores[slug]
    directory.append({"slug":slug,"name":s["name"],
        "country":s.get("mainCountry") or s.get("country"),
        "countrySlug":s.get("mainCountrySlug") or s.get("countrySlug"),
        "type":s.get("type"),"continent":s.get("continent"),
        "pop":s.get("pop"),"metroCount":s.get("metroCount") or 0,
        "score":sc["score"],"weighted":sc["weighted"]})

json.dump(scores, open(str(ROOT / "public/data/state-metro-scores.json"),"w",encoding="utf-8"), indent=2, sort_keys=True)
directory.sort(key=lambda r:-(r["score"] or 0))
for i,r in enumerate(directory,1): r["rank"]=i
json.dump(directory, open(str(ROOT / "public/data/states-directory.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=0)
print("states scored:",len(scores)," weighted:",sum(1 for v in scores.values() if v['weighted']))
print("US check texas:",scores.get("texas"),"| florida:",scores.get("florida-united-states"),"| california:",scores.get("california"))
print("unmatched metros (sheet name not in metros.json):",len(unmatched_metro))
print("directory rows:",len(directory))
