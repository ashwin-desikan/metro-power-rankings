#!/usr/bin/env python3
"""Build tennis & golf majors JSON for /teams/golf and /teams/tennis hubs.
Reads Majors.xlsx (winners) + the Golf-Tennis-F1 venue events embedded in
public/data/details/*.json (hosts), joins on (sport, tournament, year) to attach
each champion to the metro that hosted it. Emits public/data/majors/*.json.
Source workbook is gitignored; the emitted JSON is the committed/deployed artifact.
"""
import json, glob, os, collections
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "Majors.xlsx")
OUT  = os.path.join(ROOT, "public", "data", "majors")
os.makedirs(OUT, exist_ok=True)

# venue-event name -> canonical workbook tournament, per sport
GOLF_MAP = {"Open Championship":"The Open Championship","US Open":"U.S. Open",
            "PGA Championship":"PGA Championship","Masters":"Masters Tournament"}
TENNIS_MAP = {"Australian Open":"Australian Open","Australian Championships":"Australian Open",
              "French Open":"French Open","French Championships":"French Open",
              "Wimbledon Championships":"Wimbledon","US Open":"US Open",
              "United States National Championships":"US Open"}

# ---- 1. venue index: (sport, canonical, year) -> {metroSlug, metroName, venue} ----
venue_idx = {}   # key -> dict
ryder_venue = {} # year -> {metroSlug, metroName, venue}
for f in glob.glob(os.path.join(ROOT,"public","data","details","*.json")):
    try: d = json.load(open(f, encoding="utf-8"))
    except Exception: continue
    m = d.get("metro") or {}
    mslug, mname = m.get("slug"), m.get("name")
    for e in d.get("events", []):
        sp = (e.get("sport") or "").strip(); ev = (e.get("event") or "").strip()
        yr = e.get("year")
        try: yr = int(str(yr)[:4])
        except: continue
        rec = {"metroSlug":mslug,"metroName":mname,"venue":e.get("venue")}
        if ev == "Ryder Cup":
            ryder_venue.setdefault(yr, rec)
        elif sp == "Golf" and ev in GOLF_MAP:
            venue_idx.setdefault(("Golf",GOLF_MAP[ev],yr), rec)
        elif sp == "Tennis" and ev in TENNIS_MAP:
            venue_idx.setdefault(("Tennis",TENNIS_MAP[ev],yr), rec)

def host_for(sport, tournament, year):
    return venue_idx.get((sport, tournament, int(year)))

# ---- 2. load champions ----
xl = pd.read_excel(XLSX, sheet_name=None)
def s(v): return None if (v is None or (isinstance(v,float) and pd.isna(v))) else (str(v).strip() if isinstance(v,str) else v)
def ival(v): 
    try: return int(v) if v==v else None
    except: return None

TENNIS_ORDER={"Australian Open":1,"French Open":2,"Wimbledon":3,"US Open":4}
GOLF_ORDER={"Masters Tournament":1,"U.S. Open":2,"The Open Championship":3,"PGA Championship":4}

def champ_row(r, sport, gender=None):
    t=s(r["Tournament"]); y=ival(r["Year"])
    host=host_for(sport,t,y) if y else None
    out={"year":y,"tournament":t,"champion":s(r["Champion"]),"nation":s(r["Nation"]),
         "careerNo":ival(r.get("CareerTitleNo")),"careerTotal":ival(r.get("CareerMajorTotal")),
         "note":s(r.get("Note")) or ""}
    if gender: out["gender"]=gender
    if host: out.update({"metroSlug":host["metroSlug"],"metroName":host["metroName"],"venue":host["venue"]})
    return out

# TENNIS
tdf = xl["TennisMajors"]
tennis_rows=[champ_row(r,"Tennis","M" if s(r["Gender"])=="Men" else "W") for _,r in tdf.iterrows()]
# GOLF
gdf = xl["GolfMajors"]
golf_rows=[champ_row(r,"Golf") for _,r in gdf.iterrows()]

def leaders(rows, gender=None):
    by=collections.defaultdict(lambda:{"player":None,"nation":None,"total":0,"byTour":collections.Counter()})
    for r in rows:
        if gender and r.get("gender")!=gender: continue
        if r.get("note")=="unrecognized": continue
        p=r["champion"]; b=by[p]; b["player"]=p; b["nation"]=r["nation"]; b["total"]+=1; b["byTour"][r["tournament"]]+=1
    out=[{"player":b["player"],"nation":b["nation"],"total":b["total"],"byTour":dict(b["byTour"])} for b in by.values()]
    out.sort(key=lambda x:(-x["total"],x["player"]))
    return out

def by_nation(rows, gender=None):
    c=collections.Counter()
    for r in rows:
        if gender and r.get("gender")!=gender: continue
        if r.get("note")=="unrecognized" or not r["nation"]: continue
        c[r["nation"]]+=1
    return [{"nation":n,"titles":t} for n,t in c.most_common()]

def host_metros(rows):
    c=collections.Counter(); names={}
    for r in rows:
        if r.get("metroSlug"):
            c[r["metroSlug"]]+=1; names[r["metroSlug"]]=r["metroName"]
    return [{"metroSlug":k,"metroName":names[k],"count":v} for k,v in c.most_common()]

# ---- 3. Ryder & Davis ----
ryder_rows=[]
for _,r in xl["RyderCup"].iterrows():
    y=ival(r["Year"]); host=ryder_venue.get(y)
    rec={"edition":ival(r["Edition"]),"year":y,"winner":s(r["Winner"]),"score":s(r["Score"]),
         "host":s(r["Host"]),"venue":s(r["Venue"]),"usCaptain":s(r["US Captain"]),"homeCaptain":s(r["Home Captain"])}
    if host: rec.update({"metroSlug":host["metroSlug"],"metroName":host["metroName"]})
    ryder_rows.append(rec)
davis_rows=[{"country":s(r["Country"]),"titles":ival(r["Titles"]),"titleYears":s(r["Title Years"]),
             "runnerUp":ival(r["Runners-up"]),"runnerUpYears":s(r["Runner-up Years"])} for _,r in xl["DavisCup"].iterrows()]

# ---- 4. emit ----
def latest(rows, sport, gender=None):
    pool=[r for r in rows if (not gender or r.get("gender")==gender)]
    return sorted(pool,key=lambda r:(r["year"] or 0))[-1] if pool else None

golf={"sport":"Golf","tournaments":["The Open Championship","U.S. Open","PGA Championship","Masters Tournament"],
      "champions":sorted(golf_rows,key=lambda r:(-(r["year"] or 0),GOLF_ORDER.get(r["tournament"],9))),
      "leaders":leaders(golf_rows),"byNation":by_nation(golf_rows),"hostMetros":host_metros(golf_rows),
      "ryder":sorted(ryder_rows,key=lambda r:-(r["year"] or 0)),
      "ryderTally":dict(collections.Counter(r["winner"].split(" – ")[0] if r["winner"].startswith("Tied") else r["winner"] for r in ryder_rows))}
tennis={"sport":"Tennis","tournaments":["Australian Open","French Open","Wimbledon","US Open"],
        "champions":sorted(tennis_rows,key=lambda r:(-(r["year"] or 0),r.get("gender"),TENNIS_ORDER.get(r["tournament"],9))),
        "leadersMen":leaders(tennis_rows,"M"),"leadersWomen":leaders(tennis_rows,"W"),
        "byNationMen":by_nation(tennis_rows,"M"),"byNationWomen":by_nation(tennis_rows,"W"),
        "hostMetros":host_metros(tennis_rows),"davis":davis_rows}

json.dump(golf, open(os.path.join(OUT,"golf.json"),"w"), ensure_ascii=False, separators=(",",":"))
json.dump(tennis, open(os.path.join(OUT,"tennis.json"),"w"), ensure_ascii=False, separators=(",",":"))

# ---- report ----
def join_rate(rows): 
    j=sum(1 for r in rows if r.get("metroSlug")); return j,len(rows)
gj,gt=join_rate(golf_rows); tj,tt=join_rate(tennis_rows); rj=sum(1 for r in ryder_rows if r.get("metroSlug"))
print(f"golf champions {gt} (metro-linked {gj}/{gt} = {gj*100//gt}%)")
print(f"tennis champions {tt} (metro-linked {tj}/{tt} = {tj*100//tt}%)")
print(f"ryder editions {len(ryder_rows)} (metro-linked {rj})")
print("golf leaders top3:", [(l['player'],l['total']) for l in golf['leaders'][:3]])
print("tennis men top3:", [(l['player'],l['total']) for l in tennis['leadersMen'][:3]])
print("tennis women top3:", [(l['player'],l['total']) for l in tennis['leadersWomen'][:3]])
# spot-check a rotating-venue join
for yr,tn in [(2014,"The Open Championship"),(2006,"U.S. Open"),(1981,"The Open Championship")]:
    h=host_for("Golf",tn,yr); print(f"  {yr} {tn} host:", h["metroName"] if h else None, "/", h["venue"] if h else None)

# ---- 5. Zone Zero Cup feed: per-nation, per-year titles keyed by engine slug ----
import unicodedata, re as _re
ZZC_OVERRIDE = {
    "United Kingdom": "great-britain",
    "United Kingdom of Great Britain and Ireland": "great-britain",
    "West Germany": "germany", "Weimar Republic": "germany",
    "Soviet Union": "russia", "Russia RTF": "russia",
    "Czechoslovakia": "czech-republic",          # engine FOLD -> czechia
    "Republic of Ireland": "ireland",
    "Socialist Federal Republic of Yugoslavia": "serbia",
    "Federal Republic of Yugoslavia": "serbia",
}
def zzc_slug(name):
    if not name: return None
    if name in ZZC_OVERRIDE: return ZZC_OVERRIDE[name]
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return _re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

zz = {}
def zz_add(slug, field, year):
    if not slug or not year: return
    zz.setdefault(slug, {"slug": slug, "golf_years": [], "slam_years": [],
                         "davis_title_years": [], "davis_ru_years": []})[field].append(int(year))

for r in golf_rows:
    zz_add(zzc_slug(r["nation"]), "golf_years", r["year"])
for r in tennis_rows:
    if r.get("note") == "unrecognized": continue   # occupation-era, not counted
    zz_add(zzc_slug(r["nation"]), "slam_years", r["year"])
for d in davis_rows:
    sl = zzc_slug(d["country"])
    for y in _re.findall(r"(?:19|20)\d\d", d.get("titleYears") or ""): zz_add(sl, "davis_title_years", y)
    for y in _re.findall(r"(?:19|20)\d\d", d.get("runnerUpYears") or ""): zz_add(sl, "davis_ru_years", y)

zzc_out = {"nations": sorted(zz.values(), key=lambda x: x["slug"])}
json.dump(zzc_out, open(os.path.join(OUT, "zzc-titles.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print(f"zzc-titles: {len(zzc_out['nations'])} nations; "
      f"golf titles {sum(len(n['golf_years']) for n in zzc_out['nations'])}, "
      f"slam titles {sum(len(n['slam_years']) for n in zzc_out['nations'])}, "
      f"davis titles {sum(len(n['davis_title_years']) for n in zzc_out['nations'])}")
