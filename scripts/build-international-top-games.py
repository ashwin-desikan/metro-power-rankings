#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build International Football "greatest games" data from the grand Football
workbook (Champions League-201516.xlsx -> Int Tournaments, column CK Game Score).
Mirrors scripts/build-{nfl,nba,mlb}-data.py top-games outputs.

Men's tournament matches only (excludes Women's World Cup and 2026 World Cup).
Outputs under public/data/international/:
  top-games-all-time.json   (top 25 unique matches)
  top-games-by-decade.json  (top 10 per decade)
  top-games-by-team.json    ({slug: [top 10 this-team rows]})
"""
import json, os, re, sys
from pathlib import Path
from collections import defaultdict
import openpyxl

REPO_ROOT = Path(__file__).resolve().parent.parent
ALL_TIME_N, DECADE_N, TEAM_N = 50, 10, 10

def find_workbook(argv):
    if len(argv) > 1: return Path(argv[1])
    HOME = Path(os.path.expanduser("~"))
    cands = [HOME/"OneDrive"/"Excel Files"/"Champions League-201516.xlsx",
             HOME/"Library"/"CloudStorage"/"OneDrive-Personal"/"Excel Files"/"Champions League-201516.xlsx"]
    cands += list(Path("/sessions").glob("*/mnt/Excel Files/Champions League-201516.xlsx"))
    cands += list(Path("/sessions").glob("*/mnt/uploads/Champions League-201516.xlsx"))
    for c in cands:
        if c.exists(): return c
    sys.exit("workbook not found")

def col(letter):
    n=0
    for ch in letter: n=n*26+(ord(ch)-64)
    return n-1
COLS={k:col(k) for k in ['J','K','M','N','O','L','T','U','S','BI','BJ','F','H','P','Q','R','CK','C','CB','AD']}
def mn(s): return re.sub(r'[^a-z0-9]','',str(s or '').lower())

def main():
    REPO = Path(os.environ.get("COW_REPO", str(REPO_ROOT)))
    OUT = Path(os.environ.get("COW_OUT", str(REPO/"public"/"data"/"international")))
    OUT.mkdir(parents=True, exist_ok=True)
    wb_path = find_workbook(sys.argv)
    # resolver: name -> slug from slug-lookup.json (+ index.json fallback)
    idir = REPO/"public"/"data"/"international"
    resolver={}
    try:
        sl=json.load(open(idir/"slug-lookup.json", encoding="utf-8"))
        for k,v in sl.items(): resolver[mn(k)]=v
    except Exception: pass
    try:
        idx=json.load(open(idir/"index.json", encoding="utf-8"))
        for t in (idx if isinstance(idx,list) else idx.get("teams",[])):
            for k in (t.get("cur_name"),t.get("name"),t.get("slug")):
                if k and mn(k) not in resolver: resolver[mn(k)]=t["slug"]
    except Exception: pass
    def slug(name): return resolver.get(mn(name))

    wb=openpyxl.load_workbook(wb_path, read_only=True, data_only=True)
    ws=wb["Int Tournaments"]
    g=lambda r,k: r[COLS[k]].value
    rows=[]
    for r in ws.iter_rows(min_row=2):
        if g(r,'K') is None or g(r,'CK') is None: continue
        if g(r,'F')=="Women's World Cup": continue
        if g(r,'C')==2026: continue
        rows.append({
            'date':(str(g(r,'J'))[:10] if g(r,'J') else None),'year':g(r,'C'),
            'team':g(r,'K'),'opp':g(r,'M'),'for':g(r,'N'),'ag':g(r,'O'),'res':g(r,'L'),
            'pkself':g(r,'T'),'pkopp':g(r,'U'),'tiebrk':g(r,'S'),
            'comp':g(r,'F'),'round':g(r,'H'),'stadium':g(r,'P'),'metro':g(r,'Q'),'country':g(r,'R'),
            'team_slug':slug(g(r,'BI')),'opp_slug':slug(g(r,'BJ')),'elo':g(r,'CB'),
            'home':(g(r,'AD')=='Home'),'gs':round(float(g(r,'CK')),4)})
    wb.close()

    # ---- unique matches (winner/loser/draw) ----
    groups=defaultdict(list)
    for x in rows: groups[(x['date'],frozenset((mn(x['team']),mn(x['opp']))))].append(x)
    matches=[]
    for k,pair in groups.items():
        w=next((p for p in pair if p['res']=='W'), None)
        if w:
            l=next((p for p in pair if p is not w), w)
            is_draw=False; win,lose=w,l
        else:
            ranked=sorted(pair, key=lambda p:-(p['elo'] or 0))
            win,lose=ranked[0],(ranked[1] if len(ranked)>1 else ranked[0]); is_draw=True
        pens=None
        if win['pkself'] is not None and win['pkopp'] is not None:
            pens=f"{win['pkself']}-{win['pkopp']}"
        matches.append({
            'year':win['year'],'date':win['date'],'competition':win['comp'],'round':win['round'],
            'winner_name':win['team'],'winner_slug':win['team_slug'],
            'loser_name':lose['team'],'loser_slug':lose['team_slug'],
            'winner_score':win['for'],'loser_score':win['ag'],'is_draw':is_draw,'pens':pens,
            'stadium':win['stadium'],'stadium_metro':win['metro'],'stadium_country':win['country'],
            'game_score':win['gs']})
    matches.sort(key=lambda m:-m['game_score'])

    all_time=matches[:ALL_TIME_N]
    by_decade=defaultdict(list)
    for m in matches:
        if m['year']: by_decade[str((int(m['year'])//10)*10)].append(m)
    by_decade={k:v[:DECADE_N] for k,v in sorted(by_decade.items())}

    # ---- per-team (this-team perspective) ----
    team_rows=defaultdict(list)
    for x in rows:
        s=x['team_slug']
        if not s: continue
        pens=None
        if x['pkself'] is not None and x['pkopp'] is not None: pens=f"{x['pkself']}-{x['pkopp']}"
        team_rows[s].append({
            'year':x['year'],'date':x['date'],'competition':x['comp'],'round':x['round'],
            'team_name':x['team'],'team_slug':s,'opp_name':x['opp'],'opp_slug':x['opp_slug'],
            'for_score':x['for'],'against_score':x['ag'],'result':x['res'],'pens':pens,'is_home':x['home'],
            'stadium':x['stadium'],'stadium_metro':x['metro'],'stadium_country':x['country'],
            'game_score':x['gs']})
    by_team={s:sorted(v,key=lambda r:-r['game_score'])[:TEAM_N] for s,v in team_rows.items()}

    json.dump(all_time, open(OUT/"top-games-all-time.json","w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
    json.dump(by_decade, open(OUT/"top-games-by-decade.json","w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
    json.dump(by_team, open(OUT/"top-games-by-team.json","w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
    print(f"unique matches: {len(matches)} | all-time: {len(all_time)} | decades: {len(by_decade)} | teams: {len(by_team)}")
    print("decade keys:", list(by_decade))
    print("\nTOP 8 all-time:")
    for m in all_time[:8]:
        d="(draw)" if m['is_draw'] else ""; p=f" pens {m['pens']}" if m['pens'] else ""
        print(f"  {m['game_score']:.3f} {m['date']} {m['winner_name']} {m['winner_score']}-{m['loser_score']} {m['loser_name']} {d}{p} | {m['competition']}/{m['round']} | {m['stadium_metro']} | slugs {m['winner_slug']}/{m['loser_slug']}")
    print("\nGermany top 3:")
    for r in by_team.get('germany',[])[:3]:
        print(f"  {r['game_score']:.3f} {r['date']} {r['result']} {r['team_name']} {r['for_score']}-{r['against_score']} {r['opp_name']} | {r['competition']}/{r['round']}")
    miss_w=sum(1 for m in matches if not m['winner_slug']); miss_t=sum(1 for s,v in by_team.items() for r in v if not r['opp_slug'])
    print(f"\nunmapped winner slugs: {miss_w} | by-team rows with unmapped opp: {miss_t}")

if __name__=="__main__": main()
