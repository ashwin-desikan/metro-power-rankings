#!/usr/bin/env python3
"""Build English domestic-cup data (FA Cup + League Cup) from OtherLeagues.xlsx.

Source sheet: "FACup-LgCup SF" — every semifinal and final, two rows per match
(one per team perspective), in the standard football match format.

Emits public/data/football/domestic-cups.json with:
  competitions  - per-comp, per-season match lists (SFs + final) for the hub
  by_club       - { slug: [{year, season, comp, kind, stage}] }  stage in
                  {winner, runner_up, semifinal}; powers the per-season
                  Domestic Cup column (semifinal markers) and new-club tables
  new_clubs     - the clubs appearing here that have no canonical club page
                  yet (mostly Victorian amateurs); merged in at the lib layer

Run after editing the sheet:  python3 scripts/build-domestic-cups-data.py
"""
import json, os, re, datetime
from collections import defaultdict
import time, urllib.request, urllib.parse

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
          or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
          or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def _sb(table, select, order="id"):
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
        for _t in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as rr:
                    batch = json.load(rr); break
            except Exception:
                if _t == 3: raise
                time.sleep(2)
        out += batch
        if len(batch) < step:
            return out
        off += step

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "OtherLeagues.xlsx")
OUT_DIR = os.path.join(ROOT, "public", "data", "football")
SHEET = "FACup-LgCup SF"

COMP_META = {"FA Cup": ("fa-cup", "FA Cup", "major"),
             "League Cup": ("league-cup", "League Cup", "minor")}

def slugify(s):
    if s is None: return None
    s = str(s).strip().lower()
    repl = {"á":"a","à":"a","â":"a","ä":"a","ã":"a","å":"a","é":"e","è":"e","ê":"e","ë":"e",
            "í":"i","ì":"i","î":"i","ï":"i","ó":"o","ò":"o","ô":"o","ö":"o","õ":"o","ø":"o",
            "ú":"u","ù":"u","û":"u","ü":"u","ñ":"n","ç":"c","ß":"ss","ý":"y","ÿ":"y"}
    for k,v in repl.items(): s=s.replace(k,v)
    s = re.sub(r"[^a-z0-9]+","-",s).strip("-")
    return s or None

def norm_round(v):
    v = str(v or "").strip().lower()
    if v.startswith("final"): return "Final"
    if v.startswith("semi"): return "Semifinal"
    return v.title()

def fmt_date(d):
    if isinstance(d, datetime.datetime): return d.strftime("%Y-%m-%d")
    if isinstance(d, str): return d
    return None

def iso_from_ymd(ymd):
    s = str(ymd or "").strip()
    if len(s)==8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return None

def main():
    slug_lookup = json.load(open(os.path.join(OUT_DIR,"slug-lookup.json"), encoding="utf-8"))
    def lookup_slug(name):
        if name is None: return None
        return slug_lookup.get(str(name).strip().lower()) or slugify(name)
    # A club already has a page iff its RESOLVED SLUG exists among canonical
    # club slugs (seasons.json keys + every slug-lookup value). Matching on the
    # raw name misfires when the sheet spelling differs from the lookup key
    # (e.g. "Brighton & Hove Albion" vs lookup key "brighton hove albion").
    seasons_keys = set(json.load(open(os.path.join(OUT_DIR,"seasons.json"), encoding="utf-8")).keys())
    existing_slugs = seasons_keys | set(v for v in slug_lookup.values() if v)

    _HDR = ["Team","Leag/Comp.","Year","Season","Comp. Rnd","Cur. Name","Opp. Name","W/D/L","Trophy Won","Cup Final","Metro Area","County","Country","Continent","YYYYMMDD","Date","For","Ag","Comp Leg","Stadium","Stad. Metro Area"]
    _KEY = {"Team":"team","Leag/Comp.":"leag_comp","Year":"year","Season":"season","Comp. Rnd":"comp_rnd","Cur. Name":"cur_name","Opp. Name":"opp_name","W/D/L":"wdl","Trophy Won":"trophy_won","Cup Final":"cup_final","Metro Area":"metro_area","County":"county","Country":"country","Continent":"continent","YYYYMMDD":"yyyymmdd","Date":"date_str","For":"for_val","Ag":"ag_val","Comp Leg":"comp_leg","Stadium":"stadium","Stad. Metro Area":"stad_metro_area"}
    rows = [tuple(_HDR)]
    for _d in _sb("domestic_cups", ",".join(_KEY[h] for h in _HDR)):
        rows.append(tuple(_d[_KEY[h]] for h in _HDR))
    hdr = rows[0]; I = {h:i for i,h in enumerate(hdr)}
    def g(r, name):
        i = I.get(name); return r[i] if i is not None and i < len(r) else None

    data = [r for r in rows[1:] if g(r,"Team")]

    # ---- match-level dedup for the hub (2 rows per match) ----
    seen = {}  # key -> match dict
    # ---- per-club stage aggregation ----
    club_stage = defaultdict(lambda: 0)   # (slug, comp_id, year) -> rank
    club_name  = {}                       # slug -> display name
    club_meta  = {}                       # (slug,comp_id,year) -> {season,kind,comp_name}
    STAGE_RANK = {"semifinal":1, "runner_up":2, "winner":3}
    # ---- new-club metadata ----
    nc = defaultdict(lambda: {"metros":defaultdict(int),"counties":defaultdict(int),
                              "country":None,"continent":None,"years":set(),
                              "fa_titles":0,"lg_titles":0,"cur_name":None})

    for r in data:
        comp_raw = g(r,"Leag/Comp.")
        if comp_raw not in COMP_META: continue
        comp_id, comp_name, kind = COMP_META[comp_raw]
        year = g(r,"Year"); season = g(r,"Season")
        rnd = norm_round(g(r,"Comp. Rnd"))
        team = g(r,"Cur. Name"); opp = g(r,"Opp. Name")
        if not team: continue
        team = str(team).strip(); opp = str(opp).strip() if opp else None
        wdl = g(r,"W/D/L"); fa = g(r,"Trophy Won")=="Y"
        is_final = rnd=="Final"
        team_slug = lookup_slug(team); opp_slug = lookup_slug(opp)
        if team_slug: club_name[team_slug] = team

        # stage for this club this comp/season
        if fa: st="winner"
        elif is_final or g(r,"Cup Final")=="Y": st="runner_up"
        elif rnd=="Semifinal": st="semifinal"
        else: st=None
        if st:
            key=(team_slug,comp_id,year)
            if STAGE_RANK[st] > club_stage[key]:
                club_stage[key]=STAGE_RANK[st]
            club_meta[key]={"season":season,"kind":kind,"comp":comp_name,"year":year,"comp_id":comp_id}

        # new-club metadata
        if lookup_slug(team) not in existing_slugs:
            m=nc[team]; m["cur_name"]=team
            mt=g(r,"Metro Area"); cty=g(r,"County")
            if mt: m["metros"][mt]+=1
            if cty: m["counties"][cty]+=1
            if g(r,"Country"): m["country"]=g(r,"Country")
            if g(r,"Continent"): m["continent"]=g(r,"Continent")
            if isinstance(year,int): m["years"].add(year)
            if fa and comp_id=="fa-cup": m["fa_titles"]+=1
            if fa and comp_id=="league-cup": m["lg_titles"]+=1

        # hub match (dedup by date+comp+pair)
        ymd = g(r,"YYYYMMDD") or fmt_date(g(r,"Date"))
        pair = tuple(sorted([team, opp or ""]))
        mkey = (comp_id, str(ymd), rnd, pair)
        forg = g(r,"For"); against = g(r,"Ag")
        note = g(r,"Comp Leg")
        note = None if note in (None,"None") else str(note)
        rec = seen.get(mkey)
        # orient: keep the winner's perspective; for draws keep first
        keep = rec is None or (wdl=="W")
        if keep:
            seen[mkey]={"comp_id":comp_id,"season":season,"year":year,"round":rnd,
                        "date":iso_from_ymd(ymd) or fmt_date(g(r,"Date")),
                        "team":team,"team_slug":team_slug,"opp":opp,"opp_slug":opp_slug,
                        "for":forg,"ag":against,"wdl":wdl,"trophy":fa,"note":note,
                        "venue":g(r,"Stadium"),"metro":g(r,"Stad. Metro Area")}

    # ---- assemble competitions (hub) ----
    comps={}
    for cid,(_,cname,kind) in [(v[0],v) for v in COMP_META.values()]:
        comps[cid]={"name":cname,"kind":kind,"seasons":{}}
    by_season=defaultdict(list)
    for m in seen.values():
        by_season[(m["comp_id"],m["season"],m["year"])].append(m)
    for (cid,season,year),matches in by_season.items():
        matches.sort(key=lambda x:(0 if x["round"]=="Semifinal" else 1, x["date"] or ""))
        champ=runner=None
        for m in matches:
            if m["round"]=="Final" and m["trophy"]:
                champ=(m["team"],m["team_slug"]); runner=(m["opp"],m["opp_slug"])
        comps[cid]["seasons"][season]={"season":season,"year":year,
            "champion":champ[0] if champ else None,"champion_slug":champ[1] if champ else None,
            "runner_up":runner[0] if runner else None,"runner_up_slug":runner[1] if runner else None,
            "matches":[{k:m[k] for k in ("round","date","team","team_slug","opp","opp_slug","for","ag","wdl","trophy","note","venue","metro")} for m in matches]}
    # seasons -> sorted list (newest first)
    for cid in comps:
        s=comps[cid]["seasons"]
        comps[cid]["seasons"]=sorted(s.values(), key=lambda x:(x["year"] or 0), reverse=True)
        yrs=[x["year"] for x in comps[cid]["seasons"] if x["year"]]
        comps[cid]["first_year"]=min(yrs); comps[cid]["last_year"]=max(yrs)

    # ---- by_club ----
    by_club=defaultdict(list)
    RANK_STAGE={v:k for k,v in STAGE_RANK.items()}
    for key,rank in club_stage.items():
        slug,cid,year=key; meta=club_meta[key]
        by_club[slug].append({"year":year,"season":meta["season"],"comp":meta["comp"],
                              "comp_id":cid,"kind":meta["kind"],"stage":RANK_STAGE[rank]})
    for slug in by_club: by_club[slug].sort(key=lambda x:(x["year"] or 0), reverse=True)

    # ---- new clubs ----
    new_clubs=[]
    for name,m in nc.items():
        slug=lookup_slug(name)
        metro=max(m["metros"].items(),key=lambda x:x[1])[0] if m["metros"] else None
        county=max(m["counties"].items(),key=lambda x:x[1])[0] if m["counties"] else None
        yrs=sorted(m["years"])
        new_clubs.append({"slug":slug,"cur_name":name,"country":m["country"] or "England",
            "metro":metro,"county":county,"continent":m["continent"] or "Europe",
            "first_year":yrs[0] if yrs else None,"last_year":yrs[-1] if yrs else None,
            "fa_titles":m["fa_titles"],"lg_titles":m["lg_titles"]})
    new_clubs.sort(key=lambda x:x["cur_name"])

    # ---- aggregate: SF / Final / Cups per club + last year of each ----
    counts=defaultdict(lambda:{"fa_sf":0,"fa_f":0,"fa_cups":0,"lg_sf":0,"lg_f":0,"lg_cups":0})
    last=defaultdict(dict)
    def bump(slug,field,year):
        if year and year>last[slug].get(field,0): last[slug][field]=year
    for key,rank in club_stage.items():
        slug,cid,year=key
        p="fa" if cid=="fa-cup" else "lg"
        counts[slug][p+"_sf"]+=1; bump(slug,p+"_sf",year)
        if rank>=2: counts[slug][p+"_f"]+=1; bump(slug,p+"_f",year)
        if rank>=3: counts[slug][p+"_cups"]+=1; bump(slug,p+"_cups",year)
    aggregate=[]
    for slug,c in counts.items():
        L=last[slug]
        def comb(*ks):
            vals=[L.get(k) for k in ks if L.get(k)]
            return max(vals) if vals else None
        sf=c["fa_sf"]+c["lg_sf"]; ff=c["fa_f"]+c["lg_f"]; cups=c["fa_cups"]+c["lg_cups"]
        aggregate.append({"slug":slug,"cur_name":club_name.get(slug,slug),
            "fa_sf":c["fa_sf"],"fa_f":c["fa_f"],"fa_cups":c["fa_cups"],
            "lg_sf":c["lg_sf"],"lg_f":c["lg_f"],"lg_cups":c["lg_cups"],
            "sf":sf,"f":ff,"cups":cups,
            "fa_sf_last":L.get("fa_sf"),"fa_f_last":L.get("fa_f"),"fa_cups_last":L.get("fa_cups"),
            "lg_sf_last":L.get("lg_sf"),"lg_f_last":L.get("lg_f"),"lg_cups_last":L.get("lg_cups"),
            "sf_last":comb("fa_sf","lg_sf"),"f_last":comb("fa_f","lg_f"),"cups_last":comb("fa_cups","lg_cups")})
    aggregate.sort(key=lambda x:(-x["cups"],-x["f"],-x["sf"],x["cur_name"]))

    out={"generated_at":datetime.date.today().isoformat(),
         "source":"OtherLeagues.xlsx :: FACup-LgCup SF",
         "competitions":comps,"by_club":dict(by_club),"new_clubs":new_clubs,"aggregate":aggregate}
    os.makedirs(OUT_DIR,exist_ok=True)
    with open(os.path.join(OUT_DIR,"domestic-cups.json"),"w",encoding="utf-8") as f:
        json.dump(out,f,ensure_ascii=False)
    # ---- verification print ----
    print("OK domestic-cups.json")
    for cid in comps:
        c=comps[cid]; print(f"  {cid}: {len(c['seasons'])} seasons {c['first_year']}-{c['last_year']}")
    print("  by_club clubs:", len(by_club))
    print("  new_clubs:", len(new_clubs), "->", [n["cur_name"] for n in new_clubs])

if __name__=="__main__":
    main()
