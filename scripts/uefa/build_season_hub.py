#!/usr/bin/env python3
"""build_season_hub.py — Citizen of Nowhere completed-season club-football hubs.

Generates public/data/football/hub-YYYY-YY.json for each completed season, read by
app/teams/football/<season>/page.tsx via the shared app/teams/football/SeasonHub.tsx.

WHAT IT PRODUCES per season: the club power ranking, UEFA country coefficients (5-year),
every European/continental competition (qualifying, group/league phase, knockout, winner),
all ~113 final domestic league tables across the confederations, and every cup final.

CLUB POWER-RANKING FORMULA (per club, UEFA first divisions only):
  score = 0.65*form + 0.35*five_year_pedigree + 0.11*current_season_coef
          - max(0, 0.5 - win_pct)*0.6            # losing-record penalty
          + trophy_bonus                          # achievement layer
  where:
    form            = opponent- and stage-weighted quality PER MATCH, normalised to the max.
                      Each result (1 win / 0.5 draw / 0) is weighted by the opponent's strength
                      (0.5*country-factor + 0.5*club-pedigree) and a competition-stage multiplier
                      (domestic 1.0; UEFA league phase 1.05-1.2; knockout rounds up to 1.5 for a
                      CL final). Rate-based so a club is not rewarded for merely playing more games.
    pedigree/current= from the 1-year UEFA club coefficients (public.uefa_club_coeff_history,
                      17/18-25/26); five_year = sum of the five seasons ending that year.
    country factor  = sqrt(country 5-year coef / England's), from public.uefa_country_coeff_history.
    trophy_bonus    = CL 0.15, Club World Cup 0.05, Europa League 0.05, UEFA Super Cup 0.04,
                      Conference League 0.03, old 7-team Club World Cup 0.03, domestic league title
                      0.03, Intercontinental 0.02, domestic cup 0.015, domestic super cup 0.01
                      (added to the winning club; the old Club World Cup shows in the super-cup section).

DATA SOURCES (per season): the fetch scripts in scripts/apifootball/_scratch produce the season
bundles (uefahub{season}.json / the split-file 2025 set), plus countries{year}.json dumped from
uefa_country_coeff_history and club_coeff_full.json (the merged 9-season club coefficients, also in
public.uefa_club_coeff_history). Run the fetch scripts, then this, then commit the hub JSON.

Backtested: the trophy layer reproduces the expected champions (Man City top 2022-23 on the treble,
Real Madrid 2023-24, PSG 2024-25 and 2025-26 on the Champions League).
"""
import json, math, os
SC="/mnt/user-data/uploads/Desktop--Projects--Metro Area Project/scripts/apifootball/_scratch"
by_id={r["team_id"]:r for r in json.load(open("/tmp/football_team.json"))}
fr=json.load(open("/tmp/frozen_coefficients.json"))
CCF=json.load(open("/tmp/club_coeff_full.json"))
# Kassiesa coefficient aliases: a club may carry a second UEFA name (Lookup "UEFA Name 2") because
# the coefficient feed spells it differently across seasons (rebrands/transliterations). Fold the
# secondary key's seasons into the primary uefa_name so the club's full split-history pedigree
# attaches via uf(); reindex when only the secondary key exists in the coefficient data.
try: _LK=json.load(open("/tmp/football_lookup.json"))
except Exception: _LK=[]
for _r in _LK:
    _a=(_r.get("uefa_name") or "").strip(); _b=(_r.get("uefa_name_2") or "").strip()
    if not _b or _a==_b: continue
    if _b in CCF and _a in CCF:
        for _s,_v in CCF[_b].items(): CCF[_a][_s]=CCF[_a].get(_s,0)+_v
        del CCF[_b]
    elif _b in CCF and _a not in CCF:
        CCF[_a]=CCF.pop(_b)
LAB={"Czech Republic":"Czechia","Turkey":"Türkiye"}
def canon(tid,api): r=by_id.get(tid); return (r.get("canonical_name") if r else None) or api
def lk(tid,api): r=by_id.get(tid); return (r.get("lookup_name") if r else None) or (r.get("canonical_name") if r else None) or api
def uf(tid): r=by_id.get(tid); return r.get("uefa_name") if r else None
def md(f): return {"home":canon(f["teams"]["home"]["id"],f["teams"]["home"]["name"]),"home_lookup":lk(f["teams"]["home"]["id"],f["teams"]["home"]["name"]),
    "away":canon(f["teams"]["away"]["id"],f["teams"]["away"]["name"]),"away_lookup":lk(f["teams"]["away"]["id"],f["teams"]["away"]["name"]),
    "score":f"{f['goals']['home']}–{f['goals']['away']}"+(" p" if f["fixture"]["status"]["short"]=="PEN" else "")}
def classify(r):
    rl=(r or "").lower()
    if "qualifying" in rl or "preliminary" in rl or r in ("Play-offs","Playoff round") or "phase" in rl: return "QUAL"
    if "league stage" in rl or "group" in rl or "regular season" in rl: return "GROUP"
    if r in ("Round of 32","Knockout Round Play-offs","Round of 16","8th Finals","Quarter-finals","Semi-finals","Final"): return "KO"
    return "OTHER"
def rounds(fixtures, kinds):
    by={}
    for f in fixtures:
        if f["goals"]["home"] is None: continue
        if classify(f["league"]["round"]) not in kinds: continue
        by.setdefault(f["league"]["round"],[]).append(f)
    out=[]
    for r,ms in by.items():
        ms.sort(key=lambda x:x["fixture"]["date"]); out.append((ms[0]["fixture"]["date"],r,ms))
    out.sort(key=lambda x:x[0], reverse=True)
    return [{"round":r,"matches":[md(f) for f in ms]} for _,r,ms in out]
def winner(fixtures):
    fins=[f for f in fixtures if (f["league"]["round"] or "")=="Final" and f["goals"]["home"] is not None]
    if not fins: return None
    f=sorted(fins,key=lambda x:x["fixture"]["date"])[-1]; h,a=f["teams"]["home"],f["teams"]["away"];g=f["goals"]
    win,ru=(h,a) if h.get("winner") else (a,h) if a.get("winner") else ((h,a) if g["home"]>=g["away"] else (a,h))
    return {"winner":canon(win["id"],win["name"]),"winner_lookup":lk(win["id"],win["name"]),"runnerup":canon(ru["id"],ru["name"]),
            "score":f"{g['home']}–{g['away']}"+(" (pens)" if f['fixture']['status']['short']=="PEN" else "")}
def std_rows(grp):
    out=[]
    for row in grp:
        t=row["team"];al=row["all"];g=al["goals"]
        out.append({"rank":row["rank"],"name":t["name"],"lookup":lk(t["id"],t["name"]),"played":al["played"],"win":al["win"],
            "draw":al["draw"],"lose":al["lose"],"gf":g["for"],"ga":g["against"],"gd":row.get("goalsDiff"),"points":row["points"]})
    return out
CUPMETA={48:("England","League Cup"),137:("Italy","Coppa Italia"),81:("Germany","DFB Pokal"),97:("Portugal","Taça da Liga"),185:("Scotland","League Cup"),90:("Netherlands","KNVB Beker"),143:("Spain","Copa del Rey"),45:("England","FA Cup"),66:("France","Coupe de France"),181:("Scotland","Scottish Cup"),96:("Portugal","Taça de Portugal"),531:("Europe","UEFA Super Cup"),528:("England","Community Shield"),526:("France","Trophée des Champions"),556:("Spain","Supercopa"),529:("Germany","Super Cup"),543:("Netherlands","Johan Cruyff Shield"),550:("Portugal","Supertaça"),547:("Italy","Supercoppa"),1168:("World","Intercontinental Cup"),65:("France","Coupe de la Ligue"),15:("World","FIFA Club World Cup")}
DOMCUPS={48,137,81,97,185,90,143,45,66,181,96,65}
# Old 7-team FIFA Club World Cup (pre-2025 format) — shown in the super-cup section.
# season key 2022 -> played Feb 2023 (2022-23 hub); 2023 -> played Dec 2023 (2023-24 hub).
OLD_CWC={2022:{"wid":541,"winner":"Real Madrid","runnerup":"Al Hilal","score":"5–3"},
         2023:{"wid":50,"winner":"Manchester City","runnerup":"Fluminense","score":"4–0"},
         2018:{"wid":541,"winner":"Real Madrid","runnerup":"Al Ain","score":"4–1","comp":"FIFA Club World Cup"}}

def load(season):
    if season==2025:
        S={"standings_all":json.load(open(f"{SC}/hub_standings_2025.json"))}
        b=json.load(open(f"{SC}/uefarank2025_full.json"))
        S["league_fixtures"]=b["league_fixtures"]; S["cup_fixtures"]=b["cup_fixtures"]
        S["europe"]={str(l):{"fixtures":json.load(open(f"{SC}/uefa2025/fixtures_{l}.json"))["response"],"standings":json.load(open(f"{SC}/uefa2025/standings_{l}.json"))["response"]} for l in (2,3,848)}
        S["libertadores"]=json.load(open(f"{SC}/libertadores2025.json")); S["cwc"]=None
        S["country_rows"]=json.load(open(f"{SC}/countries2026.json"))
        S["cseasons"]=["21/22","22/23","23/24","24/25","25/26"]; S["fr"]=["22/23","23/24","24/25","25/26"]; S["cur"]="25/26"
    else:
        b=json.load(open(f"{SC}/uefahub{season}.json"))
        S={"standings_all":b["standings_all"],"league_fixtures":b["league_fixtures"],"cup_fixtures":b["cup_fixtures"],
           "europe":b["europe"],"libertadores":b["libertadores"],"cwc":(json.load(open(f"{SC}/cwc2025.json")) if season==2024 else None)}
        CFG={2024:("countries2025.json",["20/21","21/22","22/23","23/24","24/25"],"24/25"),
             2023:("countries2024.json",["19/20","20/21","21/22","22/23","23/24"],"23/24"),
             2022:("countries2023.json",["18/19","19/20","20/21","21/22","22/23"],"22/23"),
             2021:("countries2022.json",["17/18","18/19","19/20","20/21","21/22"],"21/22"),
             2020:("countries2021.json",["16/17","17/18","18/19","19/20","20/21"],"20/21"),
             2019:("countries2020.json",["15/16","16/17","17/18","18/19","19/20"],"19/20"),
             2018:("countries2019.json",["14/15","15/16","16/17","17/18","18/19"],"18/19"),
             2017:("countries2018.json",["13/14","14/15","15/16","16/17","17/18"],"17/18"),
             2016:("countries2017.json",["12/13","13/14","14/15","15/16","16/17"],"16/17")}[season]
        S["country_rows"]=json.load(open(f"{SC}/{CFG[0]}")); S["cseasons"]=CFG[1]; S["fr"]=list(CFG[1]); S["cur"]=CFG[2]
    return S

def build(season):
    S=load(season)
    NRND={"8th Finals":"Round of 16","Finals":"Final"}
    def _nz(fx):
        for f in (fx or []):
            r=(f.get("league") or {}).get("round")
            if r in NRND: f["league"]["round"]=NRND[r]
    for _fx in list(S["league_fixtures"].values())+list(S["cup_fixtures"].values()): _nz(_fx)
    for _l in S["europe"].values(): _nz(_l.get("fixtures"))
    _nz(S.get("libertadores"))
    crow={r["league"]:float(r["score"]) for r in S["country_rows"]}
    ENG=crow["England"]
    def CF(c): v=crow.get(LAB.get(c,c),crow.get(c)); return math.sqrt(v/ENG) if v else 0.0
    club_cur={u:(cs.get(S["cur"]) or 0) for u,cs in CCF.items()}
    club_five={u:sum((cs.get(s) or 0) for s in S["fr"]) for u,cs in CCF.items()}
    MAXCUR=max(club_cur.values()) or 1; MAX5=max(club_five.values()) or 1
    def curN(t): return club_cur.get(uf(t),0)/MAXCUR
    def fiveN(t): return club_five.get(uf(t),0)/MAX5
    # universe = UEFA level-1
    uni={}
    for lid,d in S["standings_all"].items():
        if d["confed"]!="UEFA" or d.get("level")!=1 or not d["response"]: continue
        for grp in d["response"][0]["league"].get("standings",[]):
            for row in grp: uni.setdefault(row["team"]["id"],{"country":d["country"],"name":row["team"]["name"]})
    def strength(t): return max(0.5*CF(uni[t]["country"])+0.5*fiveN(t),0.10) if t in uni else 0.10
    def sm(comp,r):
        r=r or ""
        if comp=="CL": return {"Final":1.5,"Semi-finals":1.45,"Quarter-finals":1.4,"Round of 16":1.35,"Round of 32":1.3}.get(r,1.2 if r.startswith("League Stage") else 1.0)
        if comp=="EL": return 1.25 if r in("Final","Semi-finals","Quarter-finals","Round of 16") else (1.1 if r.startswith("League Stage") else 1.0)
        if comp=="ECL": return 1.15 if r in("Final","Semi-finals","Quarter-finals","Round of 16") else (1.05 if r.startswith("League Stage") else 1.0)
        return {"USC":1.3,"ICC":1.2}.get(comp,1.0)
    agg={t:{"MP":0,"W":0,"D":0,"L":0,"Q":0.0} for t in uni}
    def feed(fx,comp):
        for f in fx:
            g=f["goals"]
            if g["home"] is None or g["away"] is None: continue
            h,a=f["teams"]["home"]["id"],f["teams"]["away"]["id"]; m=sm(comp,f["league"]["round"])
            for me,opp,gf,ga in ((h,a,g["home"],g["away"]),(a,h,g["away"],g["home"])):
                if me in agg:
                    A=agg[me];A["MP"]+=1;A["W" if gf>ga else "L" if gf<ga else "D"]+=1
                    A["Q"]+=(1.0 if gf>ga else 0.5 if gf==ga else 0.0)*strength(opp)*m
    for lid,fx in S["league_fixtures"].items(): feed(fx,"LEAGUE")
    for cid,fx in S["cup_fixtures"].items(): feed(fx,{531:"USC","531":"USC",1168:"ICC","1168":"ICC"}.get(cid,{531:"USC",1168:"ICC"}.get(int(cid),"CUP")))
    for lid,comp in (("2","CL"),("3","EL"),("848","ECL")): feed(S["europe"][lid]["fixtures"],comp)
    maxRate=max(a["Q"]/a["MP"] for a in agg.values() if a["MP"]>=8); PEN=0.6
    # --- achievement / trophy bonus (prestige-weighted) ---
    def fwid(fx):
        fins=[f for f in fx if (f["league"]["round"] or "")=="Final" and f["goals"]["home"] is not None]
        if not fins: return None
        f=sorted(fins,key=lambda x:x["fixture"]["date"])[-1]; h,a2=f["teams"]["home"],f["teams"]["away"];g=f["goals"]
        return h["id"] if h.get("winner") else a2["id"] if a2.get("winner") else (h["id"] if g["home"]>=g["away"] else a2["id"])
    TB={}
    def addb(tid,w):
        if tid is not None: TB[tid]=TB.get(tid,0)+w
    addb(fwid(S["europe"]["2"]["fixtures"]),0.15)   # Champions League
    addb(fwid(S["europe"]["3"]["fixtures"]),0.05)   # Europa League
    addb(fwid(S["europe"]["848"]["fixtures"]),0.03) # Conference League
    if S["cwc"]: addb(fwid(S["cwc"]),0.05)          # Club World Cup (new 32-team format)
    _oc=OLD_CWC.get(season)
    if _oc: addb(_oc["wid"],0.03)                    # old 7-team Club World Cup
    for cid,fx in S["cup_fixtures"].items():
        cid=int(cid); wid=fwid(fx)
        if cid in DOMCUPS: addb(wid,0.015)          # domestic cup
        elif cid==531: addb(wid,0.04)               # UEFA Super Cup
        elif cid==1168: addb(wid,0.02)              # Intercontinental
        else: addb(wid,0.01)                        # domestic super cup
    for lid,d in S["standings_all"].items():        # domestic league champions (single-group UEFA)
        if d["confed"]=="UEFA" and d.get("level")==1 and d["response"]:
            grps=d["response"][0]["league"].get("standings",[])
            if len(grps)==1:
                r1=[row for row in grps[0] if row.get("rank")==1]
                if r1: addb(r1[0]["team"]["id"],0.03)
    clubs=[]
    for t,a in agg.items():
        if a["MP"]<8: continue
        form=(a["Q"]/a["MP"])/maxRate; wp=(2*a["W"]+a["D"])/(2*a["MP"])
        score=0.65*form+0.35*fiveN(t)+0.11*curN(t)-max(0.0,0.5-wp)*PEN+TB.get(t,0)
        clubs.append({"name":canon(t,uni[t]["name"]),"lookup":lk(t,uni[t]["name"]),"country":uni[t]["country"],
            "score":round(score,4),"form":round(form,3),"ped":round(fiveN(t),3),"winpct":round(wp,3),"mp":a["MP"],"w":a["W"],"d":a["D"],"l":a["L"],"tb":round(TB.get(t,0),3)})
    clubs.sort(key=lambda c:-c["score"]); prev=None;rk=0
    for i,c in enumerate(clubs,1):
        if c["score"]!=prev: rk=i;prev=c["score"]
        c["rank"]=rk
    # countries
    countries=[{"rank":r["rank"],"country":r["league"],"seasons":dict(zip(S["cseasons"],[float(r["y1"]),float(r["y2"]),float(r["y3"]),float(r["y4"]),float(r["y5"])])),"coef":round(float(r["score"]),3)} for r in S["country_rows"]]
    # leagues (all)
    leagues=[]
    for lid,d in S["standings_all"].items():
        if not d["response"]: continue
        grps=d["response"][0]["league"].get("standings",[]); multi=len(grps)>1
        gs=[{"label":(g[0].get("group") if multi else None),"rows":std_rows(g)} for g in grps if g]
        if gs: leagues.append({"league_id":int(lid),"name":d["name"],"country":d["country"],"level":d["level"],"confed":d["confed"],"groups":gs})
    # continental
    continental=[]
    CN={"2":"Champions League","3":"Europa League","848":"Conference League"}
    for lid in ("2","3","848"):
        fx=S["europe"][lid]["fixtures"]; st=S["europe"][lid]["standings"]
        table=std_rows(st[0]["league"]["standings"][0]) if st else []
        continental.append({"comp":CN[lid],"scope":"UEFA","table":table,"groups":None,
            "knockout":rounds(fx,{"KO"}),"qualifying":rounds(fx,{"QUAL"}),"final":winner(fx)})
    GX=json.load(open(f"{SC}/groups_extra.json"))
    def groups_from(resp):
        if not resp: return None
        out=[{"label":(g[0].get("group") if g else None),"rows":std_rows(g)} for g in resp[0]["league"]["standings"] if g]
        return out or None
    lib=S["libertadores"]; libstd=GX.get("lib2024" if season==2024 else "lib2025" if season==2025 else f"lib{season}")
    continental.append({"comp":"Copa Libertadores","scope":"CONMEBOL","table":None,"groups":groups_from(libstd),
        "knockout":rounds(lib,{"KO"}),"qualifying":rounds(lib,{"QUAL"}),"final":winner(lib)})
    if S["cwc"]:
        cwc=S["cwc"]
        continental.append({"comp":"FIFA Club World Cup","scope":"FIFA","table":None,"groups":groups_from(GX["cwc"]),
            "knockout":rounds(cwc,{"KO"}),"qualifying":[],"final":winner(cwc)})
    continental=[cc for cc in continental if (cc.get("table") or cc.get("groups") or cc.get("knockout") or cc.get("qualifying") or cc.get("final"))]
    # cups
    cups=[]
    for cid,fx in S["cup_fixtures"].items():
        cid=int(cid); meta=CUPMETA.get(cid); w=winner(fx) if meta else None
        if not w: continue
        cups.append({"type":"Domestic cup" if cid in DOMCUPS else "Super cup","country":meta[0],"comp":meta[1],
            "winner":w["winner"],"winner_lookup":w["winner_lookup"],"runnerup":w["runnerup"],"score":w["score"]})
    _oc=OLD_CWC.get(season)
    if _oc:
        cups.append({"type":"Super cup","country":"World","comp":_oc.get("comp","Club World Cup"),
            "winner":_oc["winner"],"winner_lookup":_oc["winner"],"runnerup":_oc["runnerup"],"score":_oc["score"]})
    cups.sort(key=lambda c:({"Domestic cup":0,"Super cup":1}[c["type"]],c["country"]))
    label={2025:"2025-26",2024:"2024-25",2023:"2023-24",2022:"2022-23",2021:"2021-22",2020:"2020-21",2019:"2019-20",2018:"2018-19",2017:"2017-18",2016:"2016-17"}[season]
    hub={"season":label,"clubSeasons":S["cseasons"],"note":"Club power ranking: 0.65 opponent- & stage-weighted quality per match + 0.35 pedigree + current-season coefficient, less a losing-record penalty. Country coefficients are the full 5-year UEFA window.","clubs":clubs,"countries":countries,"leagues":leagues,"continental":continental,"cups":cups}
    fn=f"/tmp/hub-{label}.json"; json.dump(hub,open(fn,"w"),ensure_ascii=False)
    print(f"{label}: clubs {len(clubs)} leagues {len(leagues)} continental {[c['comp'] for c in continental]} cups {len(cups)} MB {round(os.path.getsize(fn)/1e6,2)}")
    print("   KO rounds (reverse):", [(c['comp'],[r['round'] for r in c['knockout']]) for c in continental if c['knockout']][:2])
    print("   MUtd/Che/Tot:", [(c['rank'],c['name']) for c in clubs if c['name'] in ("Manchester United","Chelsea","Tottenham Hotspur")])
    print("   CWC winner:", [c['final'] for c in continental if c['comp']=="FIFA Club World Cup"])
build(2025); build(2024); build(2023); build(2022); build(2021); build(2020); build(2019); build(2018); build(2017); build(2016)
