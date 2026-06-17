#!/usr/bin/env python3
"""
Build public/data/wcbb/{data.json,slug-lookup.json} for Women's College
Basketball, mirroring build-cbb-data.py.

Source: the master "NCAA Tournament.xlsx" workbook (women's sheets):
  Totals (W)        -> teams (one row per program; names carry a " (W)" suffix)
  Conf_Teams (W)    -> season-by-season log
  NCAA W Tournament -> per-team tournament-by-year + national champions
Metros are blank in Totals (W); they are joined from the men's "Totals" sheet
by campus (strip the " (W)" suffix), with the Sheet2 crosswalk as a fallback.

Slug = slugify(name without " (W)") + "-ncaaw".

Usage: python build-wcbb-data.py "NCAA Tournament.xlsx" public/data
"""
import sys, os, json, re, unicodedata
from collections import defaultdict

def slugify(s):
    if s is None: return ""
    s=unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode()
    return re.sub(r"-+","-",re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-"))
def norm_name(s):
    if s is None: return ""
    s=unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()
def strip_w(s):
    return re.sub(r"\s*\(W\)\s*$","",str(s or "")).strip()
def inti(x):
    try: return int(round(float(x)))
    except: return 0
def fnum(x):
    try: return float(x)
    except: return None
def yn(x): return str(x or "").strip().upper() in ("Y","YES","1","TRUE")
def pyhue(name):
    h=0
    for ch in str(name): h=(h*31+ord(ch))&0xFFFFFFFF
    return f"hsl({h%360},58%,52%)"

def read_sheet(path,name):
    import openpyxl
    ws=openpyxl.load_workbook(path,read_only=True,data_only=True)[name]
    rows=[list(r) for r in ws.iter_rows(values_only=True)]
    if not rows: return {},[]
    return {str(c).strip():i for i,c in enumerate(rows[0]) if c is not None}, rows[1:]

def _load_team_colors():
    import csv as _csv
    here=os.path.dirname(os.path.abspath(__file__)); out={}
    for fn in ("cfb-colors.csv","cbb-colors.csv"):
        fp=os.path.join(here,fn)
        if not os.path.exists(fp): continue
        with open(fp,encoding="utf-8-sig",newline="") as f:
            for row in _csv.DictReader(f):
                key=norm_name(row.get("Cur. Name") or "")
                if key: out[key]=((row.get("Primary") or "").strip() or None,(row.get("Secondary") or "").strip() or None)
    return out
_TC=None
def team_color(name):
    global _TC
    if _TC is None: _TC=_load_team_colors()
    prim,sec=_TC.get(norm_name(name),(None,None))
    return (prim or pyhue(name), sec or prim or pyhue(name))

def main():
    src,metro_xlsx,out=sys.argv[1],sys.argv[2],sys.argv[3]; SUF="-ncaaw"
    # Canonical metros come from MetroAreas.xlsx "Team List" (the single source
    # of team->metro for non-football sports). Women's college programs are the
    # League="NCAA W" rows (keyed by the same " (W)" names); the base school name
    # is a fallback so defunct programs inherit their campus metro from the
    # men's college rows.
    TL,tlrows=read_sheet(metro_xlsx,"Team List")
    def tl(r,k): i=TL.get(k); return r[i] if i is not None and i<len(r) else None
    tl_map={}
    for r in tlrows:
        if not re.search(r"ncaa|college",str(tl(r,"League") or ""),re.I): continue
        tm=tl(r,"Team")
        if tm: tl_map.setdefault(norm_name(tm),{"metro":tl(r,"Metro Area"),"state":tl(r,"State"),
            "lat":fnum(tl(r,"Lat")),"long":fnum(tl(r,"Long")),"city":tl(r,"City")})
    # Conf_Teams (W) carries Metro Area per program-season and covers every
    # program (current AND defunct); it is the women's-native metro source.
    C,crows=read_sheet(src,"Conf_Teams (W)")
    def c(r,k): i=C.get(k); return r[i] if i is not None and i<len(r) else None
    cw_metro={}
    for r in crows:
        nm=c(r,"Cur. Name")
        if nm and norm_name(nm) not in cw_metro and c(r,"Metro Area"):
            cw_metro[norm_name(nm)]={"metro":c(r,"Metro Area"),"state":c(r,"State")}

    # ---- Totals (W) -> teams ----
    T,rows=read_sheet(src,"Totals (W)")
    def t(r,k): i=T.get(k); return r[i] if i is not None and i<len(r) else None
    teams={}
    for r in rows:
        full=t(r,"School")
        if not full: continue
        name=strip_w(full); slug=slugify(name)+SUF
        # Metro priority: Team List (site-canonical for current programs) ->
        # Conf_Teams (W) Metro Area (women's-native, covers defunct) -> own row.
        tlh=tl_map.get(norm_name(full)) or tl_map.get(norm_name(name)) or {}
        cw=cw_metro.get(norm_name(full)) or {}
        metro=tlh.get("metro") or cw.get("metro") or t(r,"Metro Area")
        city=tlh.get("city") or t(r,"City")
        state=tlh.get("state") or cw.get("state") or t(r,"State")
        teams[slug]={"slug":slug,"name":name,
            "conference":t(r,"Present Conf./Div") or t(r,"2027 Conf."),
            "current_d1":str(t(r,"Div-I (Current)") or "").strip().upper()=="Y",
            "city":city,"metro":metro,"metro_slug":slugify(metro) or None,
            "state":state,"lat":tlh.get("lat"),"long":tlh.get("long"),"region":None,
            "color":team_color(name)[0],"color2":team_color(name)[1],
            "games":inti(t(r,"Tot W"))+inti(t(r,"Tot L")),"w":inti(t(r,"Tot W")),"l":inti(t(r,"Tot L")),
            "pct":round(fnum(t(r,"Tot Win%")) or 0.0,4),"seasons":inti(t(r,"# Yrs Tot")),
            "tour_app":inti(t(r,"App.")),"seed1":inti(t(r,"# 1 Seed")),"top4_seed":inti(t(r,"Top 4 Seed")),
            "sweet16":inti(t(r,"# Swt 16")),"elite8":inti(t(r,"# Elite 8")),"final4":inti(t(r,"# Final 4")),
            "champ_app":inti(t(r,"# Chm. App")),"titles":inti(t(r,"# Chmp")),
            "tour_w":inti(t(r,"Win")),"tour_l":inti(t(r,"Loss")),
            "weeks_ranked":inti(t(r,"# AP Rank Wks")),"weeks_t5":inti(t(r,"# AP T5 Rank Wk")),"weeks_at_1":inti(t(r,"# AP T1 Rank Wk")),
            "last_year":inti(t(r,"Last Yr.")),"last_app":inti(t(r,"Last App.")),"last_title":inti(t(r,"Last Chmp.")),
            "title_years":[]}
    name2slug={norm_name(d["name"]):d["slug"] for d in teams.values()}

    # ---- Conf_Teams (W) -> seasons ----
    C,crows=read_sheet(src,"Conf_Teams (W)")
    def c(r,k): i=C.get(k); return r[i] if i is not None and i<len(r) else None
    seasons=defaultdict(list)
    for r in crows:
        cur=c(r,"Cur. Name")
        if not cur: continue
        slug=slugify(strip_w(cur))+SUF
        name2slug.setdefault(norm_name(strip_w(c(r,"Team") or cur)),slug)
        if slug not in teams: continue
        seasons[slug].append({"year":inti(c(r,"Year")),"w":inti(c(r,"Fin W")),"l":inti(c(r,"Fin L")),
            "conference":c(r,"Conference"),"conf_w":inti(c(r,"Conf W")),"conf_l":inti(c(r,"Conf L")),
            "ap_high":inti(c(r,"AP High Rank")) or None,"ap_final":inti(c(r,"AP Final")) or None,
            "reg_champ":yn(c(r,"Reg Sea Chmp")),"conf_tour_champ":yn(c(r,"Conf Tour Chmp")),
            "ncaa":yn(c(r,"NCAA Tour")),"final4":yn(c(r,"Fin. 4")),"champ":yn(c(r,"Chm."))})

    # ---- NCAA W Tournament -> tournament-by-team + national champions ----
    W,wrows=read_sheet(src,"NCAA W Tournament")
    def w(r,k): i=W.get(k); return r[i] if i is not None and i<len(r) else None
    tour=defaultdict(list); champ_by_year=defaultdict(list); ru_by_year=defaultdict(list); f4_by_year=defaultdict(list)
    for r in wrows:
        sch=w(r,"School")
        if not sch: continue
        name=strip_w(sch); slug=slugify(name)+SUF; yr=inti(w(r,"Year"))
        chm=yn(w(r,"Chm.")); chapp=yn(w(r,"Ch. App")); f4=yn(w(r,"Fin. 4"))
        if slug in teams:
            tour[slug].append({"year":yr,"seed":inti(w(r,"Seed")) or None,"w":inti(w(r,"Tourney W")),"l":inti(w(r,"Tourney L")),
                "sweet16":yn(w(r,"Sw 16")),"elite8":yn(w(r,"El. 8")),"final4":f4,"champ_app":chapp,"champ":chm})
        if yr>0 and chm: champ_by_year[yr].append(name)
        elif yr>0 and chapp: ru_by_year[yr].append(name)
        if yr>0 and f4 and not chm: f4_by_year[yr].append(name)
    # Totals (W) leaves all-time W/L/Win%/seasons blank; derive from the season log.
    for slug,d in teams.items():
        d["title_years"]=sorted({x["year"] for x in tour.get(slug,[]) if x["champ"]})
        ss=seasons.get(slug,[])
        if ss:
            tw=sum(x["w"] for x in ss); tl=sum(x["l"] for x in ss)
            d["w"]=tw; d["l"]=tl; d["games"]=tw+tl
            d["seasons"]=len({x["year"] for x in ss})
            d["pct"]=round(tw/(tw+tl),4) if (tw+tl)>0 else 0.0
    def mk(nm): return {"name":nm,"slug":name2slug.get(norm_name(nm))}
    national_champions=[]
    for y in sorted(champ_by_year,reverse=True):
        cset=set(champ_by_year[y])
        ru=[mk(n) for n in dict.fromkeys(ru_by_year.get(y,[])) if n not in cset]
        ruset={x["name"] for x in ru}
        f4=[mk(n) for n in dict.fromkeys(f4_by_year.get(y,[])) if n not in cset and n not in ruset]
        national_champions.append({"year":y,"champs":[mk(n) for n in dict.fromkeys(champ_by_year[y])],"runner_up":ru,"final_four":f4})

    od=os.path.join(out,"wcbb"); os.makedirs(od,exist_ok=True)
    team_list=sorted(teams.values(),key=lambda d:(-d["titles"],-d["final4"],-d["tour_app"],-d["pct"],d["name"]))
    json.dump({"teams":team_list,
               "seasons_by_team":{k:sorted(v,key=lambda x:-x["year"]) for k,v in seasons.items() if k in teams},
               "tournament_by_team":{k:sorted(v,key=lambda x:-x["year"]) for k,v in tour.items()},
               "national_champions":national_champions},
              open(os.path.join(od,"data.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({norm_name(d["name"]):d["slug"] for d in team_list},
              open(os.path.join(od,"slug-lookup.json"),"w",encoding="utf-8"),ensure_ascii=False)
    no_metro=[d["name"] for d in team_list if not d["metro_slug"]]
    json.dump({"no_metro":no_metro},open(os.path.join(od,"skipped.json"),"w",encoding="utf-8"),ensure_ascii=False)
    print(f"teams:{len(team_list)} d1:{sum(1 for d in team_list if d['current_d1'])} season_rows:{sum(len(v) for v in seasons.values())} champ_years:{len(national_champions)} no_metro:{len(no_metro)} -> {no_metro}")
    for nm in ("connecticut-ncaaw","stanford-ncaaw","tennessee-ncaaw","south-carolina-ncaaw"):
        d=teams.get(nm)
        if d: print(nm,{k:d[k] for k in ("titles","final4","tour_app","metro","seasons")})

if __name__=="__main__": main()
