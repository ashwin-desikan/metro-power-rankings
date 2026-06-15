#!/usr/bin/env python3
"""
Build public/data/cbb/{data.json,slug-lookup.json,games.json} from CBB.xlsx
(NCAA Division I Men's Basketball, 1896-2026). Mirrors build-cfb-data.py.

Scope: all programs in Totals. Slug = slugify(School)+"-ncaam". Season log =
Conf_Teams (one row per team-season). National champions derived from the Chm.
flag (NCAA, 1939+) with Helms / Premo-Porretta as retroactive pre-tournament
selectors. Games = Detailed Playoffs (per-game Game Score, MLB-comparable scale).

Usage: python build-cbb-data.py CBB.xlsx public/data
"""
import sys, os, json, re, unicodedata, datetime
from collections import defaultdict

def slugify(s):
    if s is None: return ""
    s=unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode()
    return re.sub(r"-+","-",re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-"))
def norm_name(s):
    if s is None: return ""
    s=unicodedata.normalize("NFKD",str(s)).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+"," ",s.lower()).strip()
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
def datestr(x):
    if isinstance(x,(datetime.datetime,datetime.date)): return x.strftime("%Y-%m-%d")
    return str(x) if x not in (None,"") else None

def read_sheet(path,name):
    try:
        from python_calamine import CalamineWorkbook
        rows=CalamineWorkbook.from_path(path).get_sheet_by_name(name).to_python()
    except Exception:
        import openpyxl
        ws=openpyxl.load_workbook(path,read_only=True,data_only=True)[name]
        rows=[list(r) for r in ws.iter_rows(values_only=True)]
    if not rows: return {},[]
    return {str(c).strip():i for i,c in enumerate(rows[0]) if c is not None}, rows[1:]

def _load_team_colors():
    """Real brand colors: cfb-colors.csv (shared FBS schools) then
    cbb-colors.csv (basketball additions, takes precedence). Keyed by
    norm_name. Falls back to pyhue() for any program in neither file."""
    import csv as _csv
    here = os.path.dirname(os.path.abspath(__file__))
    out = {}
    for fn in ("cfb-colors.csv", "cbb-colors.csv"):
        fp = os.path.join(here, fn)
        if not os.path.exists(fp):
            continue
        with open(fp, encoding="utf-8-sig", newline="") as f:
            for row in _csv.DictReader(f):
                key = norm_name(row.get("Cur. Name") or "")
                prim = (row.get("Primary") or "").strip() or None
                sec = (row.get("Secondary") or "").strip() or None
                if key:
                    out[key] = (prim, sec)
    return out

_TEAM_COLORS = None
def team_color(name):
    global _TEAM_COLORS
    if _TEAM_COLORS is None:
        _TEAM_COLORS = _load_team_colors()
    prim, sec = _TEAM_COLORS.get(norm_name(name), (None, None))
    return (prim or pyhue(name), sec or prim or pyhue(name))


def main():
    src,out=sys.argv[1],sys.argv[2]
    SUF="-ncaam"

    # ---- Totals -> teams (one row per program) ----
    T,rows=read_sheet(src,"Totals")
    def t(r,k): i=T.get(k); return r[i] if i is not None and i<len(r) else None
    teams={}
    for r in rows:
        cur=t(r,"School")
        if not cur: continue
        slug=slugify(cur)+SUF
        metro=t(r,"Metro Area")
        teams[slug]={"slug":slug,"name":str(cur),
            "conference":t(r,"Present Conf./Div") or t(r,"2027 Conf."),
            "current_d1":str(t(r,"Div-I (Current)") or "").strip().upper()=="Y",
            "city":t(r,"City"),"metro":metro,"metro_slug":slugify(metro) or None,
            "state":t(r,"State"),"lat":fnum(t(r,"Lat")),"long":fnum(t(r,"Long")),
            "region":t(r,"Region"),"color":team_color(cur)[0],"color2":team_color(cur)[1],
            "games":inti(t(r,"Tot W"))+inti(t(r,"Tot L")),"w":inti(t(r,"Tot W")),"l":inti(t(r,"Tot L")),
            "pct":round(fnum(t(r,"Tot Win%")) or 0.0,4),"seasons":inti(t(r,"# Yrs Tot")),
            "tour_app":inti(t(r,"App.")),"seed1":inti(t(r,"# 1 Seed")),"top4_seed":inti(t(r,"Top 4 Seed")),
            "sweet16":inti(t(r,"# Swt 16")),"elite8":inti(t(r,"# Elite 8")),"final4":inti(t(r,"# Final 4")),
            "champ_app":inti(t(r,"# Chm. App")),"titles":inti(t(r,"# Chmp")),"other_titles":inti(t(r,"# Oth Chmp")),
            "tour_w":inti(t(r,"Win")),"tour_l":inti(t(r,"Loss")),
            "nit_app":inti(t(r,"NIT App")),"nit_sf":inti(t(r,"NIT Semi Final")),"nit_titles":inti(t(r,"NIT Chm")),
            "weeks_ranked":inti(t(r,"# AP Rank Wks")),"weeks_t5":inti(t(r,"# AP T5 Rank Wk")),"weeks_at_1":inti(t(r,"# AP T1 Rank Wk")),
            "last_year":inti(t(r,"Last Yr.")),"last_app":inti(t(r,"Last App.")),"last_title":inti(t(r,"Last Chmp.")),
            "all_americans":0,"nba_first_round":0,"best15":None,"title_years":[]}
    name2slug={norm_name(d["name"]):d["slug"] for d in teams.values()}

    # ---- Conf_Teams -> seasons; enrich name2slug with historical names ----
    C,rows=read_sheet(src,"Conf_Teams")
    def c(r,k): i=C.get(k); return r[i] if i is not None and i<len(r) else None
    seasons=defaultdict(list); natchamp_rows=[]; ru_by_year=defaultdict(list); f4_by_year=defaultdict(list)
    for r in rows:
        cur=c(r,"Cur. Name")
        if not cur: continue
        slug=slugify(cur)+SUF
        hist=c(r,"Team")
        if hist: name2slug.setdefault(norm_name(hist),slug)
        name2slug.setdefault(norm_name(cur),slug)
        if slug not in teams: continue
        yr=inti(c(r,"Year"))
        champ=yn(c(r,"Chm.")); helms=yn(c(r,"Helms Chmp")); premo=yn(c(r,"Premo-Porretta Chmp"))
        _chapp=yn(c(r,"Ch. App")); _fin4=yn(c(r,"Fin. 4"))
        if yr>0 and _fin4: f4_by_year[yr].append(cur)
        if yr>0 and _chapp and not champ: ru_by_year[yr].append(cur)
        seasons[slug].append({"year":yr,"school":hist,"w":inti(c(r,"Fin W")),"l":inti(c(r,"Fin L")),
            "conference":c(r,"Conference"),"conf_w":inti(c(r,"Conf W")),"conf_l":inti(c(r,"Conf L")),
            "ap_high":inti(c(r,"AP High Rank")) or None,"ap_final":inti(c(r,"AP Final")) or None,
            "srs_rank":inti(c(r,"SRS Rnk")) or None,
            "reg_champ":yn(c(r,"Reg Sea Chmp")),"conf_tour_champ":yn(c(r,"Conf Tour Chmp")),
            "ncaa":yn(c(r,"NCAA Tour")),"seed":inti(c(r,"#")) or None,"t_w":inti(c(r,"T. Wins")),"t_l":inti(c(r,"T. Loss")),
            "sweet16":yn(c(r,"Sw 16")),"elite8":yn(c(r,"El. 8")),"final4":yn(c(r,"Fin. 4")),
            "champ_app":yn(c(r,"Ch. App")),"champ":champ,"nit":yn(c(r,"NIT App.")),
            "rank15":inti(c(r,"15-Yr Rank")) or None,"vacated":yn(c(r,"Vacated"))})
        if champ: natchamp_rows.append((yr,cur,"NCAA"))
        elif helms: natchamp_rows.append((yr,cur,"Helms"))
        elif premo: natchamp_rows.append((yr,cur,"Premo"))
    for slug,d in teams.items():
        ss=seasons.get(slug,[])
        d["title_years"]=sorted(x["year"] for x in ss if x["champ"])
        ranks=[x["rank15"] for x in ss if x["rank15"]]
        d["best15"]=min(ranks) if ranks else None
    byyear=defaultdict(list)
    for yr,cur,sel in natchamp_rows:
        if yr<=0: continue
        byyear[yr].append({"name":cur,"slug":name2slug.get(norm_name(cur)),"sel":("" if sel=="NCAA" else sel)})
    def _mk(nm): return {"name":nm,"slug":name2slug.get(norm_name(nm))}
    national_champions=[]
    for y in sorted(byyear,reverse=True):
        champs=byyear[y]
        cset={x["name"] for x in champs}
        runner_up=[_mk(n) for n in dict.fromkeys(ru_by_year.get(y,[])) if n not in cset]
        ruset={x["name"] for x in runner_up}
        final_four=[_mk(n) for n in dict.fromkeys(f4_by_year.get(y,[])) if n not in cset and n not in ruset]
        national_champions.append({"year":y,"champs":champs,"runner_up":runner_up,"final_four":final_four})

    # ---- AP All-American -> awards per team ----
    A,rows=read_sheet(src,"AP All-American")
    def a(r,k): i=A.get(k); return r[i] if i is not None and i<len(r) else None
    awards=defaultdict(list)
    for r in rows:
        tm=a(r,"Team"); pl=a(r,"Player")
        if not tm or not pl: continue
        slug=name2slug.get(norm_name(tm))
        if not slug or slug not in teams: continue
        awards[slug].append({"year":inti(a(r,"Year")),"player":str(pl)})
    for slug in awards:
        awards[slug].sort(key=lambda x:-x["year"])
        teams[slug]["all_americans"]=len(awards[slug])

    # ---- NBA 1st Round -> draft pipeline per team ----
    N,rows=read_sheet(src,"NBA 1st Round")
    def n(r,k): i=N.get(k); return r[i] if i is not None and i<len(r) else None
    nba=defaultdict(list)
    for r in rows:
        cur=n(r,"Cur. Name") or n(r,"Team"); pl=n(r,"Player")
        if not cur or not pl: continue
        slug=name2slug.get(norm_name(cur)) or slugify(cur)+SUF
        if slug not in teams: continue
        nba[slug].append({"year":inti(n(r,"College Year")),"player":str(pl),"draft_year":inti(n(r,"Draft Year")) or None})
    for slug in nba:
        nba[slug].sort(key=lambda x:-x["year"])
        teams[slug]["nba_first_round"]=len(nba[slug])

    # ---- Detailed Playoffs -> games (Game Score) ----
    G,rows=read_sheet(src,"Detailed Playoffs")
    def g(r,k): i=G.get(k); return r[i] if i is not None and i<len(r) else None
    gsi=G.get("Game Score")
    ARENA=next((k for k in G if str(k).startswith("Final/Current Arena")),None)
    def rec(r):
        tm=g(r,"Cur. Name"); op=g(r,"Opp. Name")
        return {"season":inti(g(r,"Season")),"date":datestr(g(r,"Date")),"round":g(r,"Round"),
            "team":tm,"opp":op,
            "team_slug":name2slug.get(norm_name(tm)) or slugify(tm)+SUF,
            "opp_slug":name2slug.get(norm_name(op)) or slugify(op)+SUF,
            "rank":inti(g(r,"AP Poll Rnk.")) or None,"opp_rank":inti(g(r,"Opp AP Poll Rnk.")) or None,
            "pf":inti(g(r,"For")),"pa":inti(g(r,"Agt")),"ot":g(r,"#OT"),
            "arena":(g(r,ARENA) if ARENA else None),"metro":g(r,"Arena Area"),"state":g(r,"Arena State"),
            "gs":round(float(g(r,"Game Score")),3)}
    uniq={}; by_team=defaultdict(list)
    for r in rows:
        gv=fnum(r[gsi]) if gsi is not None and gsi<len(r) else None
        if gv is None: continue
        tm=g(r,"Cur. Name")
        if tm:
            slug=name2slug.get(norm_name(tm)) or slugify(tm)+SUF
            if slug in teams: by_team[slug].append((gv,r))
        gb=g(r,"GameBin"); win=str(g(r,"W/L") or "").strip().upper()=="W"
        if gb is None: continue
        cur=uniq.get(gb)
        if cur is None or (win and not cur[2]): uniq[gb]=(gv,r,win)
    ordered=sorted(uniq.values(),key=lambda x:-x[0])
    top_overall=[rec(r) for _,r,_ in ordered[:50]]
    by_decade=defaultdict(list)
    for gv,r,_ in ordered:
        dec=(inti(g(r,"Season"))//10)*10
        if dec<=0: continue
        if len(by_decade[dec])<10: by_decade[dec].append(rec(r))
    top_by_team={}
    for slug,l in by_team.items():
        l.sort(key=lambda x:-x[0]); top_by_team[slug]=[rec(r) for _,r in l[:10]]

    # ---- write outputs ----
    od=os.path.join(out,"cbb"); os.makedirs(od,exist_ok=True)
    team_list=sorted(teams.values(),key=lambda d:(-d["titles"],-d["final4"],-d["pct"],d["name"]))
    json.dump({"teams":team_list,
               "seasons_by_team":{k:sorted(v,key=lambda x:-x["year"]) for k,v in seasons.items() if k in teams},
               "awards_by_team":{k:v for k,v in awards.items()},
               "nba_by_team":{k:v for k,v in nba.items()},
               "national_champions":national_champions},
              open(os.path.join(od,"data.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({norm_name(d["name"]):d["slug"] for d in team_list},
              open(os.path.join(od,"slug-lookup.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({"top_overall":top_overall,"by_decade":{str(k):v for k,v in sorted(by_decade.items())},"by_team":top_by_team},
              open(os.path.join(od,"games.json"),"w",encoding="utf-8"),ensure_ascii=False)
    print(f"teams:{len(team_list)} d1:{sum(1 for d in team_list if d['current_d1'])} season_rows:{sum(len(v) for v in seasons.values())} champ_years:{len(national_champions)} award_teams:{len(awards)} nba_teams:{len(nba)} games:{len(uniq)}")
    for nm in ("kentucky-ncaam","ucla-ncaam","duke-ncaam","connecticut-ncaam","north-carolina-ncaam"):
        d=teams.get(nm)
        if d: print(nm,{k:d[k] for k in ("w","l","titles","final4","tour_app","weeks_at_1","all_americans","nba_first_round")})
    print("recent champs:",[(nc["year"],[ (c["name"],c["sel"]) for c in nc["champs"]]) for nc in national_champions if nc["year"]>=2022])
    print("oldest champ year:",national_champions[-1]["year"] if national_champions else None)

if __name__=="__main__": main()
