#!/usr/bin/env python3
"""
Build public/data/cfb/{data.json,slug-lookup.json,games.json} from CFB.xlsx.

Scope: programs major at some point (Totals.Maj Seas > 0). Identity slug =
slugify(Cur. Name)+"-cfb" (Cur. Name = canonical; Opp. Name / Opp Team. = canonical
opponent). Season log is MAJOR seasons only (Standings col "Major/Minor" == "FBS";
FCS / Non-Rated / I-AA excluded). CFP/BCS/BA/BC Bowl: "Y" = major bowl, "YY" = playoff.

Outputs: data.json {teams[], seasons_by_team, awards_by_team, rivalries_by_team},
games.json {top_overall, by_decade, by_team} (Game Score; bowl name + rivalry flag),
slug-lookup.json {norm name -> slug}.

Reads via python-calamine if installed (much faster), else openpyxl.
Usage: python build-cfb-data.py CFB.xlsx <out_dir>
"""
import sys, os, json, re, unicodedata, datetime
from collections import Counter

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
def yn(x): return str(x or "").strip().upper() in ("Y","YES","YY","YYY","1","TRUE")
PRIMARY_COLS=["Primary","Primary Color","Primary Hex","Color","Color 1","Team Color"]
SECONDARY_COLS=["Secondary","Secondary Color","Secondary Hex","Color 2","Alt Color"]
def hexcol(v):
    if v in (None,""): return None
    t=str(v).strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{6}", t): return "#"+t.upper()
    if re.fullmatch(r"[0-9a-fA-F]{3}", t): return "#"+"".join(c*2 for c in t).upper()
    return None
def pyhue(name):
    h=0
    for ch in str(name): h=(h*31+ord(ch))&0xFFFFFFFF
    return f"hsl({h%360},58%,52%)"
CFB_VIDEOS={
    (2005,"Texas","USC"):"https://www.youtube.com/watch?v=WitAjwWY6EQ",
    (2002,"Ohio State","Miami (FL)"):"https://www.youtube.com/watch?v=TvSXwaNCJKs",
    (1986,"Penn State","Miami (FL)"):"https://www.youtube.com/watch?v=saOJL6m70G0",
}
def datestr(x):
    if isinstance(x,(datetime.datetime,datetime.date)): return x.strftime("%Y-%m-%d")
    return str(x) if x not in (None,"") else None
def ymd_date(y,mo,da,fallback=None):
    # Build an ISO date from the Month/Day/Year columns. The Date column is
    # Excel-limited and is blank for pre-1900 games, so prefer Y/M/D.
    try:
        yi=int(round(float(y))); mi=int(round(float(mo))); di=int(round(float(da)))
        if yi>0 and 1<=mi<=12 and 1<=di<=31: return f"{yi:04d}-{mi:02d}-{di:02d}"
    except Exception: pass
    return fallback

def read_sheet(path,name):
    try:
        from python_calamine import CalamineWorkbook
        rows=CalamineWorkbook.from_path(path).get_sheet_by_name(name).to_python()
    except Exception:
        import openpyxl
        ws=openpyxl.load_workbook(path,read_only=True,data_only=True)[name]
        rows=[list(r) for r in ws.iter_rows(values_only=True)]
    if not rows: return {},[]
    return {str(c):i for i,c in enumerate(rows[0]) if c is not None}, rows[1:]

def main():
    src,out=sys.argv[1],sys.argv[2]
    import csv as _csv
    CSV_COLORS={}
    _cp=os.path.join(os.path.dirname(os.path.abspath(__file__)),"cfb-colors.csv")
    if os.path.exists(_cp):
        for row in _csv.DictReader(open(_cp,encoding="utf-8")):
            CSV_COLORS[(row.get("Cur. Name") or "").strip()]=(hexcol(row.get("Primary")),hexcol(row.get("Secondary")))
    # Fallback brand colors for non-FBS (FCS / D-I) schools that aren't in
    # cfb-colors.csv but ARE in the college-basketball color file (same schools).
    # cfb-colors keeps precedence; a normalized key handles minor name drift.
    import re as _re
    def _cnorm(s): return _re.sub(r"[^a-z0-9]","",(s or "").lower())
    CSV_COLORS_NORM={_cnorm(k):v for k,v in CSV_COLORS.items()}
    _cbp=os.path.join(os.path.dirname(os.path.abspath(__file__)),"cbb-colors.csv")
    if os.path.exists(_cbp):
        for row in _csv.DictReader(open(_cbp,encoding="utf-8-sig")):
            _nm=(row.get("Cur. Name") or "").strip()
            if not _nm: continue
            _cols=(hexcol(row.get("Primary")),hexcol(row.get("Secondary")))
            CSV_COLORS.setdefault(_nm,_cols)
            CSV_COLORS_NORM.setdefault(_cnorm(_nm),_cols)

    # Totals
    T,rows=read_sheet(src,"Totals")
    def t(r,k): i=T.get(k); return r[i] if i is not None and i<len(r) else None
    teams={}
    for r in rows:
        cur=t(r,"Cur. Name")
        if not cur or (fnum(t(r,"Maj Seas")) or 0)<=0: continue
        slug=slugify(cur)+"-cfb"
        _cc=CSV_COLORS.get(str(cur)) or CSV_COLORS_NORM.get(_cnorm(cur)) or (None,None)
        prim=next((hexcol(t(r,c)) for c in PRIMARY_COLS if hexcol(t(r,c))), None) or _cc[0]
        sec=next((hexcol(t(r,c)) for c in SECONDARY_COLS if hexcol(t(r,c))), None) or _cc[1]
        d=teams.setdefault(slug,{"slug":slug,"name":str(cur),"conference":t(r,"Conference (Cur.)"),
            "fbs_fcs":t(r,"FBS/FCS"),"current_fbs":str(t(r,"FBS/FCS"))=="FBS","city":t(r,"City"),"metro":t(r,"Metro Area"),
            "metro_slug":slugify(t(r,"Metro Area")) or None,"state":t(r,"State"),
            "color":prim or pyhue(cur),"color2":sec or prim or pyhue(cur),
            "games":0,"w":0,"l":0,"tie":0,"seasons":0,"maj_seasons":0,"conf_champ_app":0,
            "maj_conf_champ":0,"bowl_app":0,"maj_bowl":0,"playoff_app":0,"nat_champ_count":0,
            "weeks_ranked":0,"weeks_at_1":0,"final_ap1":0})
        for a,b in (("games","Tot Gm"),("w","Tot W"),("l","Tot L"),("tie","Tot T"),("seasons","Tot Seas"),
                    ("maj_seasons","Maj Seas"),("conf_champ_app","Conf Chmp App"),("maj_conf_champ","Maj Conf Chmp"),
                    ("bowl_app","Bowl App"),("maj_bowl","Maj Bowl"),("playoff_app","Play App"),("nat_champ_count","Nat Chmp")):
            d[a]+=inti(t(r,b))

    # Standings -> MAJOR seasons only
    S,rows=read_sheet(src,"Standings")
    def s(r,k): i=S.get(k); return r[i] if i is not None and i<len(r) else None
    seasons={}; natyears={}
    for r in rows:
        cur=s(r,"Cur. Name")
        if not cur: continue
        slug=slugify(cur)+"-cfb"
        if slug not in teams: continue
        if str(s(r,"Major/Minor"))!="FBS": continue
        cfp=str(s(r,"CFP/BCS/BA/BC Bowl") or "").strip().upper()
        yr=inti(s(r,"Year")); nc=yn(s(r,"Nat. Champ"))
        seasons.setdefault(slug,[]).append({"year":yr,"school":s(r,"School"),"w":inti(s(r,"Fin. W")),"l":inti(s(r,"Fin. L")),"t":inti(s(r,"Fin. T")),
            "conference":s(r,"Conference"),"division":s(r,"Division"),
            "conf_w":inti(s(r,"Conf. W")),"conf_l":inti(s(r,"Conf. L")),"conf_t":inti(s(r,"Conf. T")),
            "champ_app":yn(s(r,"Conf. Champ Game")),"conf_champ":yn(s(r,"Conf. Champ")),
            "fin_ap":inti(s(r,"Fin AP Poll")) or None,"fin_coach":inti(s(r,"Fin Coach Poll")) or None,"high_ap":inti(s(r,"High AP Rank")) or None,
            "bowl":s(r,"Bowl"),"bowl_res":s(r,"Bowl Res."),
            "major_bowl":cfp in ("Y","YY","YYY"),"playoff":cfp=="YY","nat_champ":nc,"heisman":bool(s(r,"Heisman Trophy"))})
        if nc: natyears.setdefault(slug,[]).append(yr)
    for slug,d in teams.items():
        d["pct"]=round(d["w"]/d["games"],4) if d["games"] else 0.0
        d["nat_champ_years"]=sorted(set(natyears.get(slug,[])))
        d["conf_titles"]=sum(1 for x in seasons.get(slug,[]) if x["conf_champ"])
        d["heismans"]=sorted(x["year"] for x in seasons.get(slug,[]) if x["heisman"])

    # Awards -> all winners per team
    A,rows=read_sheet(src,"Awards")
    def a(r,k): i=A.get(k); return r[i] if i is not None and i<len(r) else None
    awards={}
    for r in rows:
        cur=a(r,"Cur. Name")
        if not cur: continue
        slug=slugify(cur)+"-cfb"
        if slug not in teams: continue
        aw=a(r,"Award")
        if not aw: continue
        awards.setdefault(slug,[]).append({"year":inti(a(r,"Season")),"award":str(aw),"player":a(r,"Name"),"pos":a(r,"Pos")})
    for slug in awards: awards[slug].sort(key=lambda x:(-x["year"], x["award"]))

    # Rivalries -> per team, with rival slug
    Rv,rows=read_sheet(src,"Rivalries")
    def rv(r,k): i=Rv.get(k); return r[i] if i is not None and i<len(r) else None
    rivalries={}
    for r in rows:
        cur=rv(r,"Cur. Name"); opp=rv(r,"Opp Team.")
        if not cur or not opp: continue
        slug=slugify(cur)+"-cfb"
        if slug not in teams: continue
        rivalries.setdefault(slug,[]).append({"rivalry":rv(r,"Rivalry"),"rival":str(opp),"rival_slug":slugify(opp)+"-cfb"})

    # Weekly Polls -> per-team poll aggregates
    W,rows=read_sheet(src,"Weekly Polls")
    def w(r,k): i=W.get(k); return r[i] if i is not None and i<len(r) else None
    lastpoll={}
    for r in rows:
        cur=w(r,"Cur. Name") or w(r,"School")
        if not cur: continue
        slug=slugify(cur)+"-cfb"
        if slug not in teams: continue
        rk=inti(w(r,"AP Rank"))
        if rk<=0: continue
        teams[slug]["weeks_ranked"]+=1
        if rk==1: teams[slug]["weeks_at_1"]+=1
        pn=inti(w(r,"Poll #")); season=inti(w(r,"Season")); key=(slug,season)
        if key not in lastpoll or pn>lastpoll[key][0]: lastpoll[key]=(pn,rk)
    for (slug,season),(pn,rk) in lastpoll.items():
        if rk==1: teams[slug]["final_ap1"]+=1

    # Game Results -> top games (deduped) + per team, with bowl name + rivalry
    G,rows=read_sheet(src,"Game Results")
    def g(r,k): i=G.get(k); return r[i] if i is not None and i<len(r) else None
    gi=G.get("Game Score")
    def rec(r):
        cfp=str(g(r,"CFP/BCS/BA/BC Bowl") or "").strip().upper()
        return {"season":inti(g(r,"Season")),"date":ymd_date(g(r,"Year"),g(r,"Month"),g(r,"Day"),datestr(g(r,"Date"))),
            "team":g(r,"Cur. Name"),"opp":g(r,"Opp. Name"),"team_slug":slugify(g(r,"Cur. Name"))+"-cfb","opp_slug":slugify(g(r,"Opp. Name"))+"-cfb",
            "rank":inti(g(r,"Rank")) or None,"opp_rank":inti(g(r,"Opp. Rank")) or None,
            "pf":inti(g(r,"PF")),"pa":inti(g(r,"PA")),"ot":g(r,"OT"),
            "bowl_name":g(r,"Bowl"),"conf_game":yn(g(r,"Conf. Game")),"conf_champ":yn(g(r,"Conf. Champ")),"nat_champ":yn(g(r,"Nat. Champ")),
            "major_bowl":cfp in ("Y","YY","YYY"),"playoff":cfp=="YY","rivalry":yn(g(r,"Rivalry Game")),
            "stadium":g(r,"Stadium"),"metro":g(r,"Stad. Metro Area"),"state":g(r,"Stad. State"),
            "video":CFB_VIDEOS.get((inti(g(r,"Season")),g(r,"Cur. Name"),g(r,"Opp. Name"))),"gs":round(float(g(r,"Game Score")),3)}
    uniq={}; by_team={}
    for r in rows:
        gv=fnum(r[gi]) if gi is not None and gi<len(r) else None
        if gv is None: continue
        team=g(r,"Cur. Name"); opp=g(r,"Opp. Name")
        yr=inti(g(r,"Season")); pf=inti(g(r,"PF")); pa=inti(g(r,"PA")); win=pf>=pa
        if team:
            slug=slugify(team)+"-cfb"
            if slug in teams: by_team.setdefault(slug,[]).append((gv,r))
        gk=(yr,tuple(sorted([norm_name(team),norm_name(opp)])),max(pf,pa),min(pf,pa))
        cur=uniq.get(gk)
        if cur is None or (win and not cur[2]) or gv>cur[0]:
            uniq[gk]=(gv,r,win)
    ordered=sorted(uniq.values(),key=lambda x:-x[0])
    top_overall=[rec(r) for _,r,_ in ordered[:50]]
    by_decade={}
    for gv,r,_ in ordered:
        dec=(inti(g(r,"Season"))//10)*10
        if dec<=0: continue
        l=by_decade.setdefault(dec,[])
        if len(l)<10: l.append(rec(r))
    top_by_team={}
    for slug,l in by_team.items():
        l.sort(key=lambda x:-x[0]); top_by_team[slug]=[rec(r) for _,r in l[:10]]

    od=os.path.join(out,"cfb"); os.makedirs(od,exist_ok=True)
    team_list=sorted(teams.values(),key=lambda d:(-len(d["nat_champ_years"]),-d["pct"],d["name"]))
    # National champions (curated TSV: Year, National Champion(s) w/ selectors, Heisman).
    _ncslug={norm_name(d["name"]):d["slug"] for d in team_list}
    _ncalias={"brigham young":"byu"}  # curated-name -> our Cur. Name (normalised)
    natchamps=[]
    _ncp=os.path.join(os.path.dirname(os.path.abspath(__file__)),"cfb-national-champions.tsv")
    if os.path.exists(_ncp):
        def _splittop(s):
            out=[];depth=0;cur=""
            for ch in s:
                if ch=="(":depth+=1;cur+=ch
                elif ch==")":depth-=1;cur+=ch
                elif ch=="," and depth==0:out.append(cur.strip());cur=""
                else:cur+=ch
            if cur.strip():out.append(cur.strip())
            return out
        def _pc(tok):
            m=list(re.finditer(r"\(([^()]*)\)\s*$",tok))
            if m:return tok[:m[-1].start()].strip(),m[-1].group(1).strip()
            return tok.strip(),""
        _nl=[l.rstrip("\n") for l in open(_ncp,encoding="utf-8")]
        for line in _nl[1:]:
            if not line.strip():continue
            p=line.split("\t");yr=inti(p[0])
            if yr<=0:continue
            champs=[]
            for c in _splittop(p[1] if len(p)>1 else ""):
                nm,sel=_pc(c);key=norm_name(nm)
                champs.append({"name":nm,"slug":_ncslug.get(_ncalias.get(key,key)),"sel":sel})
            natchamps.append({"year":yr,"heisman":(p[2].strip() if len(p)>2 else ""),"champs":champs})
        natchamps.sort(key=lambda x:-x["year"])
    print(f"national_champions:{len(natchamps)} unmatched:{sorted({c['name'] for nc in natchamps for c in nc['champs'] if not c['slug']})}")
    json.dump({"teams":team_list,"seasons_by_team":{k:sorted(v,key=lambda x:-x["year"]) for k,v in seasons.items()},
               "awards_by_team":awards,"rivalries_by_team":rivalries,"national_champions":natchamps},
              open(os.path.join(od,"data.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({norm_name(d["name"]):d["slug"] for d in team_list},open(os.path.join(od,"slug-lookup.json"),"w",encoding="utf-8"),ensure_ascii=False)
    json.dump({"top_overall":top_overall,"by_decade":{str(k):v for k,v in sorted(by_decade.items())},"by_team":top_by_team},
              open(os.path.join(od,"games.json"),"w",encoding="utf-8"),ensure_ascii=False)
    print(f"teams:{len(team_list)} (fbs:{sum(1 for d in team_list if d['current_fbs'])}) major_season_rows:{sum(len(v) for v in seasons.values())} awards_teams:{len(awards)} rivalry_teams:{len(rivalries)} games:{len(uniq)}")
    al=teams["alabama-cfb"]
    print("Alabama:", {k:al[k] for k in ("w","l","maj_bowl","playoff_app","weeks_at_1","weeks_ranked","final_ap1")}, "awards:",len(awards.get("alabama-cfb",[])), "rivalries:",len(rivalries.get("alabama-cfb",[])))
    print("Alabama rivalries:", [r["rivalry"]+"->"+r["rival"] for r in rivalries.get("alabama-cfb",[])[:5]])

if __name__=="__main__": main()
