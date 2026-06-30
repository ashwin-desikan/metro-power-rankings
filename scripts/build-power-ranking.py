#!/usr/bin/env python3
"""build-power-ranking.py - Top 50 most powerful people. PowerScore = jurisdiction
metro score x office-base x V-Dem regime factor (national execs) / discount (billionaires).
Reads the leader feeds + public/data/power-inputs.json (V-Dem, org heads, central banks).
Tunable weights in the W dict. Writes public/data/power-ranking.json."""
import json,time
def rj(p):
    for _ in range(15):
        try: return json.load(open(p,encoding="utf-8"))
        except Exception: time.sleep(0.4)
    raise RuntimeError("read "+p)

# ---------------- TUNABLE WEIGHTS ----------------
W = dict(
  natl_min=0.50, natl_max=1.00,     # national exec: 0.5 (full democracy) -> 1.0 (autocrat)
  vp=0.10, speaker=0.14, sen_maj=0.13, house_min=0.02, sen_min=0.02,
  subnatl=0.55, party_sec=0.80, mayor=0.72,
  org=0.025, central_bank=0.35,
  billion_factor=0.6,               # power per $1B net worth (after discount)
)
# Geopolitical multiplier on NATIONAL leaders: clout beyond metro footprint
# (energy swing producers, nuclear/military powers, regional hegemons).
GEO={"saudi-arabia":3.0,"russia":2.0,"iran":3.0,"north-korea":2.5,"israel":3.5,
     "ukraine":4.0,"qatar":2.5,"united-arab-emirates":1.6,"pakistan":1.6,"egypt":1.3,
     "india":1.5,"indonesia":1.4,"brazil":1.3,"mexico":1.2,"nigeria":1.6}
FLOOR={"north-korea":60}
# -------------------------------------------------

CBW={"CN":0.18}
ORGW={"UN":0.030,"EU":0.130,"IMF":0.022,"WORLD_BANK":0.017,"WTO":0.012}
inp=rj("public/data/power-inputs.json")
vdem=inp["vdem"]; ORGH=inp["orgs"]; CB=inp["central_banks"]
cj=rj("public/data/countries.json"); crows=cj if isinstance(cj,list) else cj.get("countries") or list(cj.values())[0]
cscore={r["slug"]:(r.get("scoreTotal") or 0.0) for r in crows if isinstance(r,dict)}
cname={r["slug"]:r.get("name") for r in crows if isinstance(r,dict)}
current=rj("public/data/leaders/_current.json")
sscore={k:v["score"] for k,v in rj("public/data/state-metro-scores.json").items()}
sleaders=rj("public/data/state-leaders.json")
govs=rj("public/data/governors.json")["states"]
sname={s["slug"]:s["name"] for s in rj("public/data/states.json")}
mayors=rj("public/data/mayors.json")
mrows=rj("public/data/metros.json"); mrows=mrows if isinstance(mrows,list) else mrows.get("metros",mrows)
mscore={m["slug"]:(m.get("score") or 0.0) for m in mrows}
orgL=rj("public/data/org-leaders.json")
corgs=rj("public/data/country-orgs.json")
bz=rj("public/data/billionaires.json")["billionaires"]
cong=rj("public/data/us-congress.json")

E=[]
def add(name,role,cat,jur,jscore,weight):
    if jscore and weight: E.append(dict(name=name,role=role,category=cat,jurisdiction=jur,
        jscore=round(jscore,1),weight=round(weight,3),power=round(jscore*weight,1)))

# national leaders
def regime(slug):
    ld=vdem.get(slug,0.5)
    return W["natl_max"]-(W["natl_max"]-W["natl_min"])*ld
for slug,ld in current.items():
    cs=max(cscore.get(slug,0), FLOOR.get(slug,0))
    if not cs: continue
    add(ld["name"], f'{ld.get("role","")}, {cname.get(slug,slug)}',"National",cname.get(slug,slug),cs,regime(slug)*GEO.get(slug,1.0))

# US congress (jurisdiction = US score)
US=cscore["united-states"]
ex=cong["executive"]
add(ex["vicePresident"]["name"],"US Vice President","US federal","United States",US,W["vp"])
for l in cong["house"]["leadership"]:
    if "Speaker" in l["office"]: add(l["name"],"Speaker of the House","US federal","United States",US,W["speaker"])
    elif l["office"]=="Minority Leader": add(l["name"],"House Minority Leader","US federal","United States",US,W["house_min"])
add("John Thune","Senate Majority Leader","US federal","United States",US,W["sen_maj"])
add("Chuck Schumer","Senate Minority Leader","US federal","United States",US,W["sen_min"])

# sub-national
for slug,sc in sscore.items():
    if slug in sleaders:
        l=sleaders[slug]; base=W["party_sec"] if "Party Secretary" in l.get("title","") else W["subnatl"]
        add(l["name"], f'{l.get("title","")}, {sname.get(slug,slug)}',"Sub-national",sname.get(slug,slug),sc,base)
    elif slug in govs:
        g=govs[slug]; add(g["name"], f'Governor, {sname.get(slug,slug)}',"Sub-national",sname.get(slug,slug),sc,W["subnatl"])

# mayors
for ms,m in mayors.items():
    add(m["mayor"], f'Mayor of {m.get("city",ms)}',"Mayor",m.get("city",ms),mscore.get(ms,0),W["mayor"])

# orgs
def memsum(org): return sum(cscore.get(s,0) for s,o in corgs.items() if o.get(org)=="Member")
world=sum(cscore.values()); eu=memsum("EU")
for org in ("NATO","UN","EU"):
    c=orgL[org]["current"]; add(c["name"], f'{org} {c["role"]}',"Org",org,memsum(org),ORGW.get(org,W["org"]))
add(ORGH["IMF"]["name"],"IMF Managing Director","Org","IMF",world,ORGW["IMF"])
add(ORGH["WORLD_BANK"]["name"],"World Bank President","Org","World Bank",world,ORGW["WORLD_BANK"])
add(ORGH["WTO"]["name"],"WTO Director-General","Org","WTO",world,ORGW["WTO"])
add(ORGH["ECB"]["name"],"ECB President","Central bank","Eurozone",eu,W["central_bank"])
# central banks
CBJ={"US":"united-states","UK":"united-kingdom","JP":"japan","CN":"china","IN":"india"}
for k,info in CB.items():
    add(info["name"],info["title"],"Central bank",cname.get(CBJ[k]),cscore.get(CBJ[k],0),CBW.get(k,W["central_bank"]))

# billionaires (net worth in $M -> $B)
for b in bz[:60]:
    nb=(b.get("networth") or 0)/1000.0
    E.append(dict(name=b["name"],role=f'Billionaire ({", ".join(b.get("industries") or [])})',category="Billionaire",
        jurisdiction=b.get("countryName"),jscore=round(nb,1),weight=W["billion_factor"],power=round(nb*W["billion_factor"],1)))

E.append(dict(name="Pope Leo XIV",role="Pope, Catholic Church (~1.3B faithful)",category="Faith",jurisdiction="Holy See",jscore=260.0,weight=1.0,power=260.0))
import re
E.sort(key=lambda x:-x["power"])
seen=set(); top=[]
for e in E:
    bare=re.sub(r"^[\u26a0\ufe0f\U0001f451\s]+","",e["name"]).strip().lower()
    if bare in seen: continue
    seen.add(bare); top.append(e)
    if len(top)>=50: break
json.dump({"weights":W,"ranking":top}, open("public/data/power-ranking.json","w"), indent=2, ensure_ascii=False)
print(f"{'#':>3} {'POWER':>7}  {'CAT':12} NAME — role")
for i,e in enumerate(top,1):
    print(f"{i:>3} {e['power']:>7.0f}  {e['category']:12} {e['name']} — {e['role'][:46]}")
