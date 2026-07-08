#!/usr/bin/env python3
"""
build_power_history.py — Historical national power ranking, 1789-present.

Three indices per entity per year:
  LATENT      = material mass / war potential (population, manpower, heavy industry, energy).
  RECOGNIZED  = actualised + recognised power (military spending, productive economic weight,
                projection reach, and a curated status layer: P5 seat, recognised nuclear
                status, Concert-of-powers recognition, Cold-War bloc leadership).
  POWER       = the headline hegemony-aware blend (unchanged); 1990-2026 glides into the
                site country score, exact at 2026. 1500-1815 are benchmark-interpolated shares.

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
    # ---- Pre-CINC benchmark shares (1500-1815, interpolated between benchmarks). ----
    # Derived by scripts/power/derive_pre1789_benchmarks.py from Maddison 2023 benchmark
    # population/GDP + curated military & reach overlays + curated entity allocation
    # (colonial GDP to the imperial ruler, Iberian Union 1580-1640, HRE/Prussia carve,
    # Ottoman & Habsburg population adders, Napoleonic keyframes 1800/1812/1815 with
    # era-correct annexations). Wide error bars; latent/recognised stays 1816+ (CINC).
    PREB={
    1500:{'china':0.24386,'vijayanagara-empire':0.09252,'delhi-sultanate':0.07766,'spain':0.07571,'france':0.0747,'turkey':0.07085,'holy-roman-empire':0.06807,'portugal':0.05209,'republic-of-venice':0.04384,'japan':0.03909,'england':0.03118,'russia':0.02753,'poland':0.0202,'mamluk-sultanate':0.01802,'republic-of-genoa':0.01107,'hungary':0.0102,'kingdom-of-naples':0.01,'aztec-empire':0.00995,'inca-empire':0.0054,'denmark':0.00416,'duchy-of-milan':0.004,'vatican-city':0.004,'tuscany':0.00333,'sweden':0.00174,'netherlands':0.00081},
    1600:{'china':0.23573,'india':0.19688,'spain':0.12442,'turkey':0.07323,'france':0.05983,'japan':0.04895,'england':0.04271,'holy-roman-empire':0.03881,'netherlands':0.03541,'russia':0.02976,'republic-of-venice':0.02525,'poland':0.02485,'iran':0.01903,'austria':0.01052,'sweden':0.00964,'kingdom-of-naples':0.00883,'denmark':0.00628,'vatican-city':0.00415,'tuscany':0.00312,'republic-of-genoa':0.0026},
    1650:{'china':0.21564,'india':0.20976,'france':0.07767,'spain':0.06958,'netherlands':0.06922,'turkey':0.05904,'england':0.05415,'japan':0.03949,'russia':0.03214,'austria':0.02756,'portugal':0.02287,'holy-roman-empire':0.0214,'sweden':0.02107,'republic-of-venice':0.01793,'poland':0.01674,'iran':0.01621,'denmark':0.01198,'kingdom-of-naples':0.00829,'vatican-city':0.0039,'tuscany':0.00293,'republic-of-genoa':0.00244},
    1700:{'india':0.21203,'china':0.20769,'france':0.09735,'england':0.07628,'spain':0.05831,'netherlands':0.05373,'turkey':0.05001,'russia':0.04367,'japan':0.03977,'austria':0.03748,'portugal':0.01945,'sweden':0.01934,'holy-roman-empire':0.01612,'poland':0.01456,'iran':0.01332,'denmark':0.01091,'republic-of-venice':0.01062,'kingdom-of-naples':0.0078,'vatican-city':0.00367,'germany':0.00284,'tuscany':0.00275,'republic-of-genoa':0.00229},
    1750:{'china':0.23036,'united-kingdom':0.10607,'india':0.09553,'france':0.09375,'maratha-empire':0.08314,'russia':0.05743,'spain':0.04953,'austria':0.04649,'turkey':0.04054,'netherlands':0.0313,'japan':0.0312,'germany':0.02776,'portugal':0.01875,'holy-roman-empire':0.01661,'iran':0.01294,'poland':0.01234,'denmark':0.01229,'sweden':0.01124,'kingdom-of-naples':0.00773,'republic-of-venice':0.00545,'italy':0.00273,'vatican-city':0.00273,'tuscany':0.00227,'republic-of-genoa':0.00182},
    1789:{'china':0.24214,'united-kingdom':0.11519,'maratha-empire':0.10988,'france':0.08968,'russia':0.06746,'austria':0.04906,'spain':0.04818,'india':0.04667,'turkey':0.03699,'germany':0.03274,'japan':0.03145,'netherlands':0.02344,'portugal':0.01557,'united-states':0.01497,'holy-roman-empire':0.01463,'denmark':0.01255,'poland':0.01201,'sweden':0.01155,'kingdom-of-naples':0.00746,'republic-of-venice':0.00526,'iran':0.0039,'italy':0.00263,'vatican-city':0.00263,'tuscany':0.00219,'republic-of-genoa':0.00175},
    1800:{'china':0.25036,'united-kingdom':0.12499,'maratha-empire':0.11851,'france':0.11731,'russia':0.07102,'spain':0.04453,'india':0.03746,'austria':0.03536,'japan':0.03284,'germany':0.02985,'turkey':0.0283,'united-states':0.02061,'netherlands':0.01687,'portugal':0.01561,'holy-roman-empire':0.01533,'denmark':0.01152,'sweden':0.00877,'kingdom-of-naples':0.00862,'iran':0.00396,'italy':0.00318,'vatican-city':0.00272,'tuscany':0.00227},
    1812:{'china':0.25339,'france':0.15521,'united-kingdom':0.13414,'maratha-empire':0.11223,'russia':0.07463,'spain':0.03808,'india':0.03641,'japan':0.03251,'turkey':0.02492,'austria':0.02479,'germany':0.02357,'united-states':0.02352,'portugal':0.01389,'kingdom-of-naples':0.00994,'sweden':0.00875,'duchy-of-warsaw':0.00874,'denmark':0.00702,'bavaria':0.00459,'iran':0.00396,'netherlands':0.00395,'saxony':0.00344,'italy':0.00231},
    1815:{'china':0.25402,'united-kingdom':0.14067,'maratha-empire':0.10773,'russia':0.08765,'france':0.07285,'austria':0.04482,'germany':0.04092,'spain':0.03778,'india':0.03591,'japan':0.03277,'turkey':0.02922,'united-states':0.02742,'netherlands':0.02295,'portugal':0.01433,'sweden':0.00926,'kingdom-of-naples':0.00775,'denmark':0.00723,'bavaria':0.00419,'iran':0.00391,'italy':0.00365,'vatican-city':0.00319,'tuscany':0.00319,'saxony':0.00302,'wurttemberg':0.00279,'baden':0.00279},
    }
    # Presence: every entity we have ruler dates for, to list all present states
    # each year even without a CINC score. age = earliest ruler start (nation age).
    import glob
    def dkey(v):
        if not v: return None
        neg = v[0] == '-'; t = v[1:] if neg else v
        pp = t.split('-'); val = int(pp[0]) * 10000 + int(pp[1]) * 100 + int(pp[2])
        return -val if neg else val
    DROP_P = {'england','scotland','wales','northern-ireland','puerto-rico','guam','american-samoa','us-virgin-islands','northern-mariana-islands','hong-kong','greenland','_current','_names','_defunct'}
    spans = {}; age = {}
    for f in glob.glob(os.path.join(CDIR, 'leaders', '*.json')):
        slug = os.path.basename(f)[:-5]
        if slug in DROP_P: continue
        try: rows = json.load(open(f))
        except Exception: continue
        if not isinstance(rows, list): continue
        sp = []
        for r in rows:
            st = r.get('start'); sdk = dkey(st) if st else None
            if sdk is None: continue
            en = r.get('end'); edk = dkey(en) if en else 10**18
            sp.append((sdk, edk))
        if sp: spans[slug] = sp; age[slug] = min(x for x, _ in sp)

    # ---- 1816-1859 sovereign-state injection: CINC lacks China/Japan until 1860 and
    # Persia until 1855, which used to make Qing China fall off a cliff at the 1816 seam.
    # Glide each from its 1815 benchmark share to its first real CINC-era share; the
    # Marathas glide to zero at the 1818 conquest, the Mughal remnant to zero at 1858.
    # CINC-scored shares are rescaled by (1-F) so each year still sums to 1.
    SH1855=headline(1855); SH1860=headline(1860); P15=PREB[1815]
    INJ=[('china',P15.get('china',0),SH1860.get('china',0),1860),
         ('japan',P15.get('japan',0),SH1860.get('japan',0),1860),
         ('iran',P15.get('iran',0),SH1855.get('iran',0),1855),
         ('india',P15.get('india',0),0.0,1858),
         ('maratha-empire',P15.get('maratha-empire',0),0.0,1818)]
    def inj_shares(y):
        out={}
        for sl,a,bt,E in INJ:
            if y<E and a>0:
                f=a+(bt-a)*(y-1815)/(E-1815)
                if f>0.0004: out[sl]=f
        return out

    byYear={}
    for year in range(1500,2027):
        if year<1816:
            sh=interp_kf(PREB,year)
            rank=sorted(sh.items(),key=lambda x:-x[1]); leader=rank[0][1] if rank else 0
            arr=[{"slug":sl,"share":round(v,5),"rank":i,"tier":tier(v,leader),"lat":None,"rec":None}
                 for i,(sl,v) in enumerate(rank,1) if v>0.0004]
        else:
            comp=headline(year); lat=latent(min(year,2016)); rec=recognized(min(year,2016))
            b=max(0.0,min(1.0,(year-1990)/(2026-1990)))
            slugs=set(comp)|(set(CS) if b>0 else set())
            blend={s:(1-b)*comp.get(s,0)+b*CS.get(s,0) for s in slugs}
            tt=sum(blend.values()) or 1; sh={s:v/tt for s,v in blend.items() if v>0}
            if year<1860:
                inj=inj_shares(year); F=sum(inj.values())
                if F>0:
                    sh={s:v*(1-F) for s,v in sh.items()}; sh.update(inj)
            rank=sorted(sh.items(),key=lambda x:-x[1]); leader=rank[0][1] if rank else 0
            arr=[]
            for i,(s,v) in enumerate(rank,1):
                arr.append({"slug":s,"share":round(v,5),"rank":i,"tier":tier(v,leader),
                            "lat":(round(lat[s],5) if s in lat else None),
                            "rec":(round(rec[s],5) if s in rec else None)})
        # Append every other entity present that year (ruler dates), unscored, oldest first.
        existing={r["slug"] for r in arr}
        ys=year*10000+101; ye=year*10000+1231
        present=[slug for slug,sp in spans.items() if slug not in existing and any(x<=ye and e>=ys for (x,e) in sp)]
        present.sort(key=lambda s: age[s])
        for slug in present:
            arr.append({"slug":slug,"share":None,"rank":None,"tier":None,"lat":None,"rec":None})
        byYear[year]=arr
    out={"meta":{"generated":str(date.today()),
        "method":"Hegemony-aware CINC v6 + Maddison 2023 + reach; 1500-1815 benchmark-interpolated (Maddison benchmarks + curated military/reach overlays incl. Napoleonic keyframes, wide error bars); 1816-1859 sovereign non-CINC states (Qing, Japan, Persia, fading Maratha/Mughal) glide-injected into the CINC pool; 1990-2026 blended into the country score (exact 2026). LATENT = material mass; RECOGNIZED = spending + productive economy + reach + curated status (P5 seat, nuclear, Concert recognition, bloc leadership).",
        "sources":["Correlates of War National Material Capabilities v6.0","Maddison Project Database 2023","site country score","curated status layer"],
        "tiers":["Superpower","Great Power","Middle Power","Regional","Minor"]},
        "years":list(range(1500,2027)),"byYear":{str(y):byYear[y] for y in byYear}}
    json.dump(out, open(OUT,"w"), separators=(",",":"))
    print("wrote", OUT, os.path.getsize(OUT)//1024, "KB")
if __name__=="__main__": main()
