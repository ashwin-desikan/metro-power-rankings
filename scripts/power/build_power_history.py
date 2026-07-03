#!/usr/bin/env python3
"""
build_power_history.py — Historical national power ranking, 1789-present.

Three indices per entity per year:
  LATENT      = material mass / war potential (population, manpower, heavy industry, energy).
  RECOGNIZED  = actualised + recognised power (military spending, productive economic weight,
                projection reach, and a curated status layer: P5 seat, recognised nuclear
                status, Concert-of-powers recognition, Cold-War bloc leadership).
  POWER       = the headline hegemony-aware blend (unchanged); 1990-2026 glides into the
                site country score, exact at 2026. 1789-1815 are curated tiers.

The gap between LATENT and RECOGNIZED is the point: rising powers score latent > recognised
(China 1980, the US in the 1880s), fading ones recognised > latent (France/Britain mid-C20).
"""
import json, csv, os, collections
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INC  = os.path.join(ROOT, "data", "power-history", "_incoming")
OUT  = os.path.join(ROOT, "public", "data", "power-history.json")
XW   = os.path.join(ROOT, "data", "power-history", "cow_ccode_to_slug.json")
CDIR = os.path.join(ROOT, "public", "data")

def load_cinc():
    p=os.path.join(INC,"NMC-60-abridged.csv"); out=collections.defaultdict(dict)
    def num(x):
        try: return float(x)
        except: return 0.0
    for r in csv.DictReader(open(p)):
        out[int(r["ccode"])][int(r["year"])]={k:num(r[k]) for k in ["milex","milper","irst","pec","tpop","upop"]}
    return out

def load_maddison():
    cache=os.path.join(ROOT,"data","power-history","maddison_gdp.json")
    if os.path.exists(cache):
        d=json.load(open(cache))
        if d.get("v")==2: return d["gdp"], d["gdppc"], d["ussr"]
    import openpyxl
    wb=openpyxl.load_workbook(os.path.join(INC,"mpd2023_web.xlsx"), read_only=True, data_only=True)
    ws=wb["Full data"]; it=ws.iter_rows(values_only=True); hdr=next(it); ci={h:i for i,h in enumerate(hdr)}
    gdp=collections.defaultdict(dict); gdppc=collections.defaultdict(dict); ussr=None
    for r in it:
        code=r[ci["countrycode"]]; yr=r[ci["year"]]; gpc=r[ci["gdppc"]]; pop=r[ci["pop"]]
        if code is None or yr is None: continue
        if "USSR" in (r[ci["country"]] or ""): ussr=code
        if gpc is not None:
            gdppc[code][int(yr)]=gpc
            if pop is not None: gdp[code][int(yr)]=gpc*pop
    json.dump({"v":2,"gdp":gdp,"gdppc":gdppc,"ussr":ussr}, open(cache,"w"))
    return gdp, gdppc, ussr

S2I={'united-states':'USA','united-kingdom':'GBR','france':'FRA','germany':'DEU','russia':'RUS','china':'CHN',
'japan':'JPN','italy':'ITA','austria':'AUT','spain':'ESP','netherlands':'NLD','turkey':'TUR','india':'IND',
'brazil':'BRA','canada':'CAN','australia':'AUS','poland':'POL','mexico':'MEX','indonesia':'IDN','south-korea':'KOR',
'iran':'IRN','egypt':'EGY','sweden':'SWE','belgium':'BEL','portugal':'PRT','argentina':'ARG','saudi-arabia':'SAU',
'south-africa':'ZAF','switzerland':'CHE','malaysia':'MYS','thailand':'THA','nigeria':'NGA','pakistan':'PAK',
'bangladesh':'BGD','philippines':'PHL','vietnam':'VNM','colombia':'COL','chile':'CHL','greece':'GRC','romania':'ROU',
'hungary':'HUN','czech-republic':'CZE','ukraine':'UKR','norway':'NOR','denmark':'DNK','finland':'FIN','ireland':'IRL',
'israel':'ISR','peru':'PER','morocco':'MAR','algeria':'DZA','north-korea':'PRK','taiwan':'TWN'}

def interp_kf(kf, year):
    ys=sorted(kf)
    if year<=ys[0]: return kf[ys[0]]
    if year>=ys[-1]: return kf[ys[-1]]
    lo=max(y for y in ys if y<=year); hi=min(y for y in ys if y>=year)
    if lo==hi: return kf[lo]
    f=(year-lo)/(hi-lo); slugs=set(kf[lo])|set(kf[hi]); return {s:kf[lo].get(s,0)*(1-f)+kf[hi].get(s,0)*f for s in slugs}

REACH_KF={
1816:{'united-kingdom':.40,'france':.12,'russia':.12,'spain':.08,'netherlands':.07,'portugal':.06,'turkey':.06,'austria':.05,'china':.04},
1850:{'united-kingdom':.45,'france':.14,'russia':.11,'netherlands':.07,'spain':.05,'portugal':.05,'turkey':.04,'china':.04,'united-states':.03,'austria':.04},
1880:{'united-kingdom':.42,'france':.15,'russia':.11,'germany':.05,'netherlands':.05,'united-states':.05,'turkey':.04,'portugal':.04,'spain':.03,'austria':.04,'japan':.01},
1900:{'united-kingdom':.34,'france':.16,'russia':.10,'germany':.10,'united-states':.08,'netherlands':.05,'japan':.04,'italy':.04,'portugal':.03,'austria':.03,'belgium':.03},
1914:{'united-kingdom':.30,'france':.16,'germany':.12,'russia':.10,'united-states':.10,'japan':.05,'italy':.05,'netherlands':.04,'belgium':.03,'portugal':.03,'austria':.02},
1938:{'united-kingdom':.28,'france':.15,'united-states':.14,'germany':.10,'japan':.10,'italy':.06,'russia':.06,'netherlands':.04,'belgium':.03,'portugal':.02},
1945:{'united-states':.35,'united-kingdom':.22,'russia':.16,'france':.10,'china':.05,'netherlands':.03,'portugal':.02},
1960:{'united-states':.38,'russia':.24,'united-kingdom':.10,'france':.10,'china':.06,'portugal':.03},
1975:{'united-states':.36,'russia':.30,'united-kingdom':.07,'france':.07,'china':.07,'japan':.05,'india':.04},
1990:{'united-states':.42,'russia':.18,'united-kingdom':.07,'france':.07,'china':.08,'japan':.06,'germany':.05,'india':.04},
2000:{'united-states':.46,'china':.12,'russia':.08,'united-kingdom':.07,'france':.06,'japan':.05,'germany':.05,'india':.05},
2016:{'united-states':.40,'china':.18,'russia':.07,'united-kingdom':.06,'france':.06,'india':.05,'japan':.05,'germany':.04},
}
WKF={1816:(.22,.24,.10,.20,.24,.50),1940:(.22,.24,.10,.20,.24,.55),1945:(.30,.22,.09,.25,.14,.65),
1965:(.34,.20,.08,.26,.12,.70),1985:(.32,.16,.07,.30,.15,.72),2000:(.28,.12,.06,.34,.20,.74),2016:(.26,.10,.06,.34,.24,.75)}
def weights(year):
    ys=sorted(WKF)
    if year<=ys[0]: return WKF[ys[0]]
    if year>=ys[-1]: return WKF[ys[-1]]
    lo=max(y for y in ys if y<=year); hi=min(y for y in ys if y>=year)
    if lo==hi: return WKF[lo]
    f=(year-lo)/(hi-lo); return tuple(WKF[lo][i]*(1-f)+WKF[hi][i]*f for i in range(6))

# ---- Curated status layer (the interpretive half of RECOGNIZED) ----
NUCLEAR={"united-states":1945,"russia":1949,"united-kingdom":1952,"france":1960,"china":1964,
"israel":1967,"india":1974,"pakistan":1998,"north-korea":2006}
CONCERT={"united-kingdom":(1815,1945),"france":(1815,1945),"russia":(1815,1945),"austria":(1815,1918),
"germany":(1815,1945),"italy":(1861,1943),"united-states":(1898,1945),"japan":(1905,1945),"turkey":(1815,1856)}
G7={"united-states","japan","germany","united-kingdom","france","italy","canada"}
def status_points(slug, year):
    p=0.0
    if slug in {"united-states","united-kingdom","france","russia"} and year>=1946: p+=3
    if slug=="china" and year>=1971: p+=3
    if slug in NUCLEAR and year>=NUCLEAR[slug]: p+=2
    if slug in {"united-states","russia"} and 1949<=year<=1991: p+=3
    if slug=="united-states" and year>=1992: p+=3
    if slug=="china" and year>=2000: p+=1.5
    if slug in CONCERT:
        a,b=CONCERT[slug]
        if a<=year<=b: p+=3
    if slug in G7 and year>=1975: p+=1
    return p

def tier(share, leader):
    if leader<=0: return "Minor"
    r=share/leader
    if share>=0.14 and r>=0.60: return "Superpower"
    if r>=0.25: return "Great Power"
    if r>=0.10: return "Middle Power"
    if r>=0.035: return "Regional"
    return "Minor"

def main():
    cinc=load_cinc(); MG,MPC,USSR=load_maddison(); X={int(k):v for k,v in json.load(open(XW)).items()}
    cj=json.load(open(os.path.join(CDIR,"countries.json"))); crows=cj if isinstance(cj,list) else cj.get("countries",cj)
    DROP={'england','scotland','wales','northern-ireland','puerto-rico','guam','american-samoa','us-virgin-islands','northern-mariana-islands','hong-kong','greenland'}
    cs={r['slug']:r['scoreTotal'] for r in crows if isinstance(r,dict) and r.get('scoreTotal') and r['slug'] not in DROP}
    cst=sum(cs.values()); CS={k:v/cst for k,v in cs.items()}
    def gdp(slug,year):
        c=S2I.get(slug)
        if not c: return 0.0
        v=MG.get(c,{}).get(str(year)) or MG.get(c,{}).get(year)
        if (not v) and slug=='russia' and 1922<=year<=1990: v=MG.get(USSR,{}).get(str(year)) or MG.get(USSR,{}).get(year)
        return v or 0.0
    def gdppc(slug,year):
        c=S2I.get(slug)
        if not c: return 0.0
        v=MPC.get(c,{}).get(str(year)) or MPC.get(c,{}).get(year)
        if (not v) and slug=='russia' and 1922<=year<=1990: v=MPC.get(USSR,{}).get(str(year)) or MPC.get(USSR,{}).get(year)
        return v or 0.0
    def gather(year):
        my=min(year,2016); ents={}
        for cc,comp in cinc.items():
            s=X.get(cc); d=comp.get(my)
            if not s or not d: continue
            e=ents.setdefault(s,dict(milex=0,milper=0,irst=0,pec=0,tpop=0,upop=0))
            for k in e: e[k]+=d.get(k,0)
        tot={k:sum(e[k] for e in ents.values()) or 1 for k in ['milex','milper','irst','pec','tpop','upop']}
        return ents,tot
    def norm(d):
        t=sum(d.values()) or 1; return {k:v/t for k,v in d.items()}
    def headline(year):
        ents,tot=gather(year)
        if not ents: return {}
        ge=min(year,2022); gd={s:gdp(s,ge) for s in ents}; gt=sum(gd.values()) or 1
        rch=interp_kf(REACH_KF,min(year,2016)); rt=sum(rch.values()) or 1
        wMil,wInd,wDem,wEcon,wReach,milf=weights(year); hpi={}
        for s,e in ents.items():
            mil=milf*(e['milex']/tot['milex'])+(1-milf)*(e['milper']/tot['milper'])
            ind=((e['irst']/tot['irst'])+(e['pec']/tot['pec']))/2
            dem=0.4*(e['tpop']/tot['tpop'])+0.6*(e['upop']/tot['upop'])
            hpi[s]=wMil*mil+wInd*ind+wDem*dem+wEcon*(gd[s]/gt)+wReach*(rch.get(s,0)/rt)
        return norm(hpi)
    def latent(year):
        ents,tot=gather(year)
        if not ents: return {}
        lat={s:0.38*(e['tpop']/tot['tpop'])+0.24*(e['milper']/tot['milper'])+0.22*(e['irst']/tot['irst'])+0.16*(e['pec']/tot['pec']) for s,e in ents.items()}
        return norm(lat)
    def recognized(year):
        ents,tot=gather(year)
        if not ents: return {}
        ge=min(year,2022)
        econq={}; frontier=max((gdppc(s,ge) for s in ents), default=1) or 1
        for s in ents: econq[s]=gdp(s,ge)*(gdppc(s,ge)/frontier)
        eqt=sum(econq.values()) or 1
        rch=interp_kf(REACH_KF,min(year,2016)); rt=sum(rch.values()) or 1
        stat={s:status_points(s,year) for s in ents}; st=sum(stat.values()) or 1
        rec={s:0.30*(e['milex']/tot['milex'])+0.34*(econq[s]/eqt)+0.16*(rch.get(s,0)/rt)+0.20*(stat[s]/st) for s,e in ents.items()}
        return norm(rec)
    PRE={
    1789:{'Great Power':['united-kingdom','france','russia','austria','china'],'Middle Power':['spain','turkey','germany','india','netherlands'],'Regional':['portugal','sweden','two-sicilies','united-states','denmark','italy','poland','iran']},
    1800:{'Great Power':['france','united-kingdom','russia','austria','china'],'Middle Power':['germany','spain','turkey','united-states','india'],'Regional':['netherlands','portugal','sweden','two-sicilies','denmark','iran']},
    1812:{'Superpower':['france'],'Great Power':['united-kingdom','russia','austria','china'],'Middle Power':['germany','turkey','spain','united-states','india'],'Regional':['netherlands','portugal','sweden','two-sicilies','denmark','iran']},
    }
    byYear={}
    for year in range(1789,2027):
        if year<1816:
            arr=[]; kf=PRE[max(y for y in PRE if y<=year)]
            for tname,slugs in kf.items():
                for s in slugs: arr.append({"slug":s,"share":None,"rank":None,"tier":tname,"lat":None,"rec":None})
            byYear[year]=arr; continue
        comp=headline(year); lat=latent(min(year,2016)); rec=recognized(min(year,2016))
        b=max(0.0,min(1.0,(year-1990)/(2026-1990)))
        slugs=set(comp)|(set(CS) if b>0 else set())
        blend={s:(1-b)*comp.get(s,0)+b*CS.get(s,0) for s in slugs}
        tt=sum(blend.values()) or 1; sh={s:v/tt for s,v in blend.items() if v>0}
        rank=sorted(sh.items(),key=lambda x:-x[1]); leader=rank[0][1] if rank else 0
        arr=[]
        for i,(s,v) in enumerate(rank,1):
            arr.append({"slug":s,"share":round(v,5),"rank":i,"tier":tier(v,leader),
                        "lat":(round(lat[s],5) if s in lat else None),
                        "rec":(round(rec[s],5) if s in rec else None)})
        byYear[year]=arr
    out={"meta":{"generated":str(date.today()),
        "method":"Hegemony-aware CINC v6 + Maddison 2023 + reach; 1990-2026 blended into the country score (exact 2026). LATENT = material mass; RECOGNIZED = spending + productive economy + reach + curated status (P5 seat, nuclear, Concert recognition, bloc leadership).",
        "sources":["Correlates of War National Material Capabilities v6.0","Maddison Project Database 2023","site country score","curated status layer"],
        "tiers":["Superpower","Great Power","Middle Power","Regional","Minor"]},
        "years":list(range(1789,2027)),"byYear":{str(y):byYear[y] for y in byYear}}
    json.dump(out, open(OUT,"w"), separators=(",",":"))
    print("wrote", OUT, os.path.getsize(OUT)//1024, "KB")
if __name__=="__main__": main()
