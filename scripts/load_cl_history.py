#!/usr/bin/env python3
"""Mirror the CL workbook league-history sheets into Supabase public.cl_league_history.

Reads four sheets that share one column layout — 'Leagues History' (top-8 leagues +
Russia/USSR), 'StandOth' (other UEFA leagues), 'World' (non-UEFA leagues), 'Stand2nd'
(lower divisions) — cleans + filters to real rows (a team + end year + a placing/points),
and FULL-MIRRORS them (truncate + insert) into cl_league_history. Run on a machine with
network egress + the workbook (the Windows host), same as sync_lookup.py.

  # dry run (parse + count, no writes):
  python scripts/load_cl_history.py
  # real load:
  python scripts/load_cl_history.py --write

Env: CL_WORKBOOK (defaults to the Desktop\\CL copy), SUPABASE_SERVICE_KEY (or repo .env.local).
"""
import os, sys, json, time, urllib.request, urllib.error
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
WB   = os.environ.get("CL_WORKBOOK", r"C:\Users\ashwi\Desktop\CL\Champions League-201516.xlsx")
SHEETS = {"Leagues History": "leagues_history", "StandOth": "standoth", "World": "world", "Stand2nd": "stand2nd"}
# Reference table holds COMPLETED seasons only. The workbook still carries the in-progress
# season as placeholder rows; exclude it here so a re-run never re-adds it. As a season
# completes, drop it from this set (or clear it if nothing is in progress).
EXCLUDE_SEASONS = {"2026-27"}
KEEP = {
 "Key":"key","Country (Leag)":"country","League":"league","Division":"division","Eur Rank (EFS)":"eur_rank_efs",
 "fd":"name_fd","End Year":"end_year","Team":"team","Place #":"place","W":"w","D":"d","L":"l","Points":"points",
 "Win%":"win_pct","GS":"gs","GA":"ga","G Diff":"g_diff","Matches":"matches","GS/M":"gs_per_m","GA/M":"ga_per_m",
 "Eur Qual":"eur_qual","Relegated":"relegated","CL Champ":"cl_champ","CL Finals":"cl_finals","CL SF":"cl_sf",
 "CL QF":"cl_qf","CL R16":"cl_r16","CL GS":"cl_gs","CL App":"cl_app","Cup (Major Domestic)":"cup_major",
 "Cup Final (Major Domestic)":"cup_major_final","Cup (Minor Domestic)":"cup_minor","Cup Final (Minor Domestic)":"cup_minor_final",
 "EL/UEFA Cup/Inter-Cities Fairs Cup":"el_win","EL/UEFA/Inter-Cities Fairs Final":"el_final","EL/UEFA/Inter-Cities Fairs SF":"el_sf",
 "EL/UEFA/ICF GS":"el_gs","EL/UEFA/ICF App":"el_app","CWC/ECL Win":"cwc_ecl_win","CWC/ECL Final":"cwc_ecl_final",
 "CWC/ECL SF":"cwc_ecl_sf","CWC/ECL GS":"cwc_ecl_gs","CWC/ECL App":"cwc_ecl_app","Club WC/Intercon. Cup":"clubwc_intercon",
 "CLWC/Int. Final":"clubwc_final","Metro Area":"metro_area","County/Dis/State/Region/Prov/Council Area":"region",
 "Eur.Trophy":"eur_trophy","Eur. Final":"eur_final","Eur. App":"eur_app","Ctry Rank (UEFA)":"ctry_rank_uefa",
 "Level":"level","Con Yrs (Level)":"con_yrs_level","Prom":"prom","Forfeited":"forfeited","Group":"grp","Group Place":"group_place",
 "Attendance":"attendance","# Teams":"num_teams","# Maj. Trophies":"num_maj_trophies","Maj. Trophy":"maj_trophy",
 "# Treb. Trophies":"num_treb_trophies","Treb Trophy":"treb_trophy","# Maj. Finals":"num_maj_finals","Final App":"final_app",
 "Season":"season","Cur. Name":"cur_name","Final":"final","Champions":"champions","Top 2":"top2","Top 3":"top3","Top 4":"top4",
 "Year":"year","First Division":"first_division","First Div Yr":"first_div_yr","Champ Play. App":"champ_play_app",
 "Prom/Reg Play. App":"prom_reg_play_app","Prom/Reg Play. Final":"prom_reg_play_final","Supporters Shield":"supporters_shield",
}
NUM = {"end_year","place","w","d","l","points","gs","ga","g_diff","matches","num_teams","level","year","first_div_yr"}

def supa_key():
    for e in ("SUPABASE_WRITE_KEY","SUPABASE_SERVICE_KEY"):
        if os.environ.get(e): return os.environ[e].strip()
    envf = os.path.abspath(os.path.join(HERE, "..", ".env.local"))
    if os.path.exists(envf):
        for ln in open(envf, encoding="utf-8"):
            if ln.startswith("SUPABASE_SERVICE_KEY="): return ln.split("=",1)[1].strip()
    sys.exit("No Supabase service key (set SUPABASE_SERVICE_KEY or repo .env.local)")

def cleannum(v):
    if v is None: return None
    if isinstance(v,(int,float)): return v
    s=str(v).strip()
    if s in ("","#DIV/0!","#N/A","#REF!","#VALUE!","#NAME?"): return None
    try: return float(s) if "." in s else int(s)
    except: return None

def extract():
    wb=openpyxl.load_workbook(WB, read_only=True, data_only=True)
    rows=[]
    for sname,src in SHEETS.items():
        ws=wb[sname]; it=ws.iter_rows(values_only=True)
        hdr=[str(c).strip() if c is not None else "" for c in next(it)]
        cidx={}
        for i,h in enumerate(hdr):
            if h in KEEP and KEEP[h] not in cidx: cidx[KEEP[h]]=i
        n=0
        for r in it:
            g=lambda c: r[cidx[c]] if c in cidx and cidx[c]<len(r) else None
            team,ey,plc,pts=g("team"),g("end_year"),g("place"),g("points")
            if not team or ey in (None,""): continue
            if plc in (None,"") and pts in (None,""): continue
            if str(g("season") or "").strip() in EXCLUDE_SEASONS: continue
            d={"source_sheet":src}
            for col,i in cidx.items():
                v=r[i] if i<len(r) else None
                d[col]=cleannum(v) if col in NUM else (None if v is None else (str(v).strip() or None))
            rows.append(d); n+=1
        print(f"  {sname}: {n} rows")
    return rows

def post(path, key, body=None, method="POST"):
    req=urllib.request.Request(SUPA+path, data=(json.dumps(body).encode() if body is not None else None),
        headers={"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"}, method=method)
    with urllib.request.urlopen(req, timeout=120) as r: return r.status

def main():
    write="--write" in sys.argv
    print(f"reading {os.path.basename(WB)} ...")
    rows=extract()
    print(f"TOTAL real rows: {len(rows)}")
    if not write:
        print("DRY RUN — pass --write to truncate + load cl_league_history."); return
    key=supa_key()
    print("truncating cl_league_history ..."); post("/rest/v1/cl_league_history?id=gt.0", key, method="DELETE")
    n=0
    for i in range(0,len(rows),500):
        b=rows[i:i+500]
        for attempt in range(3):
            try: post("/rest/v1/cl_league_history", key, b); n+=len(b); break
            except urllib.error.HTTPError as e:
                if attempt==2: raise RuntimeError(f"insert failed HTTP {e.code}: {e.read().decode()[:300]}")
                time.sleep(3)
        if (i//500)%10==0: print(f"  inserted {n}/{len(rows)}", flush=True)
    print(f"DONE: loaded {n} rows into cl_league_history")

if __name__=="__main__":
    main()
