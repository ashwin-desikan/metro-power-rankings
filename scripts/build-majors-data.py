#!/usr/bin/env python3
"""Build tennis & golf majors JSON for /teams/golf and /teams/tennis hubs.

Source of record is Supabase (project nmprqkmymrdknffwnuur): tables
golf_majors, tennis_majors, golf_ryder_cup, tennis_davis_cup. Reads them with
the public anon key (RLS read policy), derives leaders / by-nation / host-metros,
and emits public/data/majors/*.json. Majors.xlsx is retired as master (like
OtherLeagues.xlsx); the emitted JSON stays the committed/deployed artifact.

Derived tables (by-nation, host-metros, davis) are sorted deterministically
(count desc, then name) so the output is stable and reproducible from the
database, independent of any row order. The champion arrays are re-sorted by the
pages, so their order here is cosmetic.

    python scripts/build-majors-data.py
Env (optional): SUPABASE_URL / SUPABASE_ANON_KEY (or NEXT_PUBLIC_* equivalents).
"""
import json, os, collections, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT  = os.path.join(ROOT, "public", "data", "majors")
os.makedirs(OUT, exist_ok=True)

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
          or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
          or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def fetch(table, select, order):
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.load(r)
        out += batch
        if len(batch) < step:
            return out
        off += step

TENNIS_ORDER = {"Australian Open": 1, "French Open": 2, "Wimbledon": 3, "US Open": 4}
GOLF_ORDER = {"Masters Tournament": 1, "U.S. Open": 2, "The Open Championship": 3, "PGA Championship": 4}

def _champ(r, gender=None):
    out = {"year": int(r["year"]), "tournament": r["tournament"], "champion": r["champion"],
           "nation": r.get("nation"), "careerNo": r.get("career_no"), "careerTotal": r.get("career_total"),
           "note": r.get("note") or ""}
    if gender:
        out["gender"] = gender
    if r.get("metro_slug"):
        out["metroSlug"] = r["metro_slug"]; out["metroName"] = r.get("metro_name")
    if r.get("venue"):
        out["venue"] = r["venue"]
    return out

GOLF_SEL = "year,tournament,champion,nation,career_no,career_total,note,venue,metro_slug,metro_name"
golf_rows = [_champ(r) for r in fetch("golf_majors", GOLF_SEL, "year,tournament")]
tennis_rows = [_champ(r, r["gender"]) for r in
               fetch("tennis_majors", "gender," + GOLF_SEL, "year,tournament,gender,note")]

def leaders(rows, gender=None):
    by = collections.defaultdict(lambda: {"player": None, "nation": None, "total": 0, "byTour": collections.Counter()})
    for r in rows:
        if gender and r.get("gender") != gender: continue
        if r.get("note") == "unrecognized": continue
        p = r["champion"]; b = by[p]; b["player"] = p; b["nation"] = r["nation"]; b["total"] += 1; b["byTour"][r["tournament"]] += 1
    out = [{"player": b["player"], "nation": b["nation"], "total": b["total"], "byTour": dict(b["byTour"])} for b in by.values()]
    out.sort(key=lambda x: (-x["total"], x["player"]))
    return out

def by_nation(rows, gender=None):
    c = collections.Counter()
    for r in rows:
        if gender and r.get("gender") != gender: continue
        if r.get("note") == "unrecognized" or not r["nation"]: continue
        c[r["nation"]] += 1
    return [{"nation": n, "titles": t} for n, t in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))]

def host_metros(rows):
    c = collections.Counter(); names = {}
    for r in rows:
        if r.get("metroSlug"):
            c[r["metroSlug"]] += 1; names[r["metroSlug"]] = r["metroName"]
    return [{"metroSlug": k, "metroName": names[k], "count": v}
            for k, v in sorted(c.items(), key=lambda kv: (-kv[1], names[kv[0]] or "", kv[0]))]

def _ryder(r):
    rec = {"edition": int(r["edition"]), "year": int(r["year"]), "winner": r.get("winner"), "score": r.get("score"),
           "host": r.get("host"), "venue": r.get("venue"), "usCaptain": r.get("us_captain"), "homeCaptain": r.get("home_captain")}
    if r.get("metro_slug"):
        rec["metroSlug"] = r["metro_slug"]; rec["metroName"] = r.get("metro_name")
    return rec

ryder_rows = [_ryder(r) for r in fetch("golf_ryder_cup", "*", "edition")]
davis_rows = [{"country": r["country"], "titles": r.get("titles"), "titleYears": r.get("title_years"),
               "runnerUp": r.get("runner_up"), "runnerUpYears": r.get("runner_up_years")}
              for r in fetch("tennis_davis_cup", "*", "titles.desc,country")]

def latest(rows, gender=None):
    pool = [r for r in rows if (not gender or r.get("gender") == gender)]
    return sorted(pool, key=lambda r: (r["year"] or 0))[-1] if pool else None

golf = {"sport": "Golf", "tournaments": ["The Open Championship", "U.S. Open", "PGA Championship", "Masters Tournament"],
        "champions": sorted(golf_rows, key=lambda r: (-(r["year"] or 0), GOLF_ORDER.get(r["tournament"], 9), r.get("note") or "", r["champion"])),
        "leaders": leaders(golf_rows), "byNation": by_nation(golf_rows), "hostMetros": host_metros(golf_rows),
        "ryder": sorted(ryder_rows, key=lambda r: -(r["year"] or 0)),
        "ryderTally": dict(collections.Counter(r["winner"].split(" – ")[0] if r["winner"].startswith("Tied") else r["winner"] for r in ryder_rows))}
tennis = {"sport": "Tennis", "tournaments": ["Australian Open", "French Open", "Wimbledon", "US Open"],
          "champions": sorted(tennis_rows, key=lambda r: (-(r["year"] or 0), r.get("gender"), TENNIS_ORDER.get(r["tournament"], 9), r.get("note") or "", r["champion"])),
          "leadersMen": leaders(tennis_rows, "M"), "leadersWomen": leaders(tennis_rows, "W"),
          "byNationMen": by_nation(tennis_rows, "M"), "byNationWomen": by_nation(tennis_rows, "W"),
          "hostMetros": host_metros(tennis_rows), "davis": davis_rows}

json.dump(golf, open(os.path.join(OUT, "golf.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(tennis, open(os.path.join(OUT, "tennis.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# ---- report ----
def join_rate(rows):
    j = sum(1 for r in rows if r.get("metroSlug")); return j, len(rows)
gj, gt = join_rate(golf_rows); tj, tt = join_rate(tennis_rows); rj = sum(1 for r in ryder_rows if r.get("metroSlug"))
print(f"golf champions {gt} (metro-linked {gj}/{gt} = {gj*100//gt}%)")
print(f"tennis champions {tt} (metro-linked {tj}/{tt} = {tj*100//tt}%)")
print(f"ryder editions {len(ryder_rows)} (metro-linked {rj}); davis nations {len(davis_rows)}")
print("golf leaders top3:", [(l['player'], l['total']) for l in golf['leaders'][:3]])
print("tennis men top3:", [(l['player'], l['total']) for l in tennis['leadersMen'][:3]])
print("tennis women top3:", [(l['player'], l['total']) for l in tennis['leadersWomen'][:3]])

# ---- Zone Zero Cup feed: per-nation, per-year titles keyed by engine slug ----
import unicodedata, re as _re
ZZC_OVERRIDE = {
    "United Kingdom": "great-britain",
    "United Kingdom of Great Britain and Ireland": "great-britain",
    "West Germany": "germany", "Weimar Republic": "germany",
    "Soviet Union": "russia", "Russia RTF": "russia",
    "Czechoslovakia": "czech-republic",
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
    if r.get("note") == "unrecognized": continue
    zz_add(zzc_slug(r["nation"]), "slam_years", r["year"])
for d in davis_rows:
    sl = zzc_slug(d["country"])
    for y in _re.findall(r"(?:19|20)\d\d", d.get("titleYears") or ""): zz_add(sl, "davis_title_years", y)
    for y in _re.findall(r"(?:19|20)\d\d", d.get("runnerUpYears") or ""): zz_add(sl, "davis_ru_years", y)

for n in zz.values():  # deterministic year lists
    for f in ("golf_years", "slam_years", "davis_title_years", "davis_ru_years"):
        n[f].sort()
zzc_out = {"nations": sorted(zz.values(), key=lambda x: x["slug"])}
json.dump(zzc_out, open(os.path.join(OUT, "zzc-titles.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"zzc-titles: {len(zzc_out['nations'])} nations; "
      f"golf titles {sum(len(n['golf_years']) for n in zzc_out['nations'])}, "
      f"slam titles {sum(len(n['slam_years']) for n in zzc_out['nations'])}, "
      f"davis titles {sum(len(n['davis_title_years']) for n in zzc_out['nations'])}")
