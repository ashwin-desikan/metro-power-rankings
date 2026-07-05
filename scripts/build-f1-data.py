#!/usr/bin/env python3
"""Build public/data/f1/data.json for the F1 hub from the sibling "F1 Data" project CSVs.

Source of truth = the F1 Data project (self-refreshing via Jolpica). This script joins its
canonical CSVs into the JSON the Next.js F1 hub consumes. Run after the F1 weekly refresh.

Default source dir: ../F1 Data/data  (override with env F1_DATA_DIR).
Output: <repo>/public/data/f1/data.json
"""
import csv, json, os, re, unicodedata, sys
from collections import defaultdict, Counter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("F1_DATA_DIR") or os.path.join(REPO, "..", "F1 Data", "data")
OUT_DIR = os.path.join(REPO, "public", "data", "f1")
OUT = os.path.join(OUT_DIR, "data.json")

from f1_source import read_records
def rd(name):
    return read_records(name[:-4] if name.endswith(".csv") else name, csv_dir=SRC)

def slugify(s):
    if not s: return ""
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def num(x):
    try: return int(x)
    except: 
        try: return float(x)
        except: return None

race_tracks = rd("race_tracks.csv")
results     = rd("results.csv")
meta        = rd("race_meta.csv")
circuits    = rd("circuits.csv")
dstand      = rd("driver_standings.csv")
cstand      = rd("constructor_standings.csv")

# optional: validate metro slugs against the site metro set (readable on Windows)
site_slugs = None
mp = os.path.join(REPO, "public", "data", "metros.json")
try:
    with open(mp, encoding="utf-8") as f:
        site_slugs = {m["slug"] for m in json.load(f)}
except Exception:
    site_slugs = None  # sandbox/large-file read may fail; trust slugify

THIS_YEAR = max(int(r["Season"]) for r in race_tracks)

# ---- winner constructor + per-race result lookups (results pos1) ----
win_by_key = {}          # (season,round) -> {driver, constructor, constructor_id}
starters_by_key = Counter()
for r in results:
    s = num(r["season"]); rd_ = num(r["round"]); key = (s, rd_)
    starters_by_key[key] += 1
    if num(r.get("position")) == 1:
        win_by_key[key] = {"driver": r["driver"], "constructor": r["constructor"],
                            "constructor_id": r["constructor_id"]}

cid_by_key = {(num(m["season"]), num(m["round"])): m.get("circuit_id") for m in meta}
circ_name = {c["circuit_id"]: c["circuit_name"] for c in circuits}
circ_geo  = {c["circuit_id"]: {"lat": num(c.get("latitude")), "lng": num(c.get("longitude")),
                               "wikipedia": c.get("wikipedia")} for c in circuits}

# ---- assemble per-race rows from the editorial spine ----
races = []
for r in race_tracks:
    s = num(r["Season"]); rnd = num(r["Race"]); key = (s, rnd)
    win = win_by_key.get(key, {})
    metro = (r.get("Metro Area") or "").strip()
    mslug = slugify(metro)
    cid = cid_by_key.get(key) or slugify(r.get("Circuit") or "")
    races.append({
        "season": s, "round": rnd, "race_name": r.get("Grand Prix"),
        "date": r.get("Date"), "circuit": r.get("Circuit"), "circuit_id": cid,
        "city": r.get("City"), "metro": metro, "metro_slug": mslug,
        "metro_resolved": (site_slugs is None) or (mslug in site_slugs),
        "country": r.get("Country"),
        "winner": (r.get("Winner") or "").strip() or win.get("driver"),
        "winner_constructor": win.get("constructor"),
        "pole": (r.get("Pole") or "").strip() or None,
        "fastest_lap": (r.get("Fastest Lap") or "").strip() or None,
        "laps": num(r.get("Laps")),
        "length": (r.get("Current Length") or "").strip() or None,
        "direction": (r.get("Direction") or "").strip() or None,
        "ctype": (r.get("Type") or "").strip() or None,
    })
races.sort(key=lambda x: (x["season"], x["round"]))

# ---- champions (completed seasons only: < current year) ----
def standings_final(rows, idkey):
    by_season = {}
    for r in rows:
        s = num(r["season"]); rnd = num(r["round"])
        by_season.setdefault(s, {})[rnd] = by_season.get(s, {}).get(rnd, [])
    # group rows by season-round
    grp = defaultdict(list)
    for r in rows:
        grp[(num(r["season"]), num(r["round"]))].append(r)
    # final round per season
    final = {}
    for (s, rnd), rs in grp.items():
        if s not in final or rnd > final[s][0]:
            final[s] = (rnd, rs)
    return final

dr_name = {d["driver_id"]: d["driver"] for d in rd("drivers.csv")}
dr_nat  = {d["driver_id"]: d["nationality"] for d in rd("drivers.csv")}
co_name = {c["constructor_id"]: c["constructor"] for c in rd("constructors.csv")}

dfin = standings_final(dstand, "driver_id")
cfin = standings_final(cstand, "constructor_id")
champions = []
for s in sorted(dfin):
    if s >= THIS_YEAR:   # exclude in-progress season
        continue
    drows = dfin[s][1]; dch = next((r for r in drows if num(r.get("position")) == 1), None)
    crows = cfin.get(s, (None, []))[1]; cch = next((r for r in crows if num(r.get("position")) == 1), None)
    champions.append({
        "season": s,
        "driver": dr_name.get(dch["driver_id"]) if dch else None,
        "driver_nat": dr_nat.get(dch["driver_id"]) if dch else None,
        "driver_points": num(dch["points"]) if dch else None,
        "driver_wins": num(dch["wins"]) if dch else None,
        "constructor": co_name.get(cch["constructor_id"]) if cch else None,
        "constructor_points": num(cch["points"]) if cch else None,
        "constructor_wins": num(cch["wins"]) if cch else None,
    })

# ---- title tallies ----
def tally(field, natfield=None):
    cnt = Counter(); nat = {}; years = defaultdict(list)
    for c in champions:
        v = c.get(field)
        if v:
            cnt[v] += 1; years[v].append(c["season"])
            if natfield: nat[v] = c.get(natfield)
    return [{"name": k, "titles": cnt[k], "years": sorted(years[k]),
             **({"nat": nat.get(k)} if natfield else {})}
            for k in sorted(cnt, key=lambda k: (-cnt[k], k))]
driver_titles = tally("driver", "driver_nat")
constructor_titles = tally("constructor")

# ---- all-time wins (from results pos1) ----
dwins = Counter(); dwin_nat = {}; cwins = Counter()
res_drnat = {}
for r in results:
    if num(r.get("position")) == 1:
        dwins[r["driver"]] += 1; cwins[r["constructor"]] += 1
all_time_driver_wins = [{"driver": k, "wins": v} for k, v in dwins.most_common(40)]
all_time_constructor_wins = [{"constructor": k, "wins": v} for k, v in cwins.most_common(30)]

# ---- circuits (group by circuit_id) ----
circ_races = defaultdict(list)
for r in races:
    circ_races[r["circuit_id"]].append(r)
circuits_out = []
circuit_detail = {}
for cid, rs in circ_races.items():
    rs_sorted = sorted(rs, key=lambda x: (x["season"], x["round"]))
    name = circ_name.get(cid) or rs_sorted[-1]["circuit"]
    metros = [x["metro"] for x in rs_sorted if x["metro"]]
    metro = Counter(metros).most_common(1)[0][0] if metros else None
    last = rs_sorted[-1]
    win_counts = Counter(x["winner"] for x in rs_sorted if x["winner"])
    circuits_out.append({
        "circuit_id": cid, "circuit_name": name, "slug": cid,
        "metro": metro, "metro_slug": slugify(metro) if metro else "",
        "country": last["country"], "races": len(rs_sorted),
        "first_year": rs_sorted[0]["season"], "last_year": rs_sorted[-1]["season"],
        "last_winner": last["winner"], "last_winner_constructor": last["winner_constructor"],
        "most_wins_driver": (win_counts.most_common(1)[0] if win_counts else None),
        "lat": circ_geo.get(cid, {}).get("lat"), "lng": circ_geo.get(cid, {}).get("lng"),
        "wikipedia": circ_geo.get(cid, {}).get("wikipedia"),
    })
    circuit_detail[cid] = rs_sorted
circuits_out.sort(key=lambda x: (-x["races"], x["circuit_name"] or ""))

# ---- host metros (the metro angle) ----
metro_rows = defaultdict(list)
for r in races:
    if r["metro"]:
        metro_rows[r["metro_slug"]].append(r)
host_metros = []
metro_recent = {}
for mslug, rs in metro_rows.items():
    rs_sorted = sorted(rs, key=lambda x: (x["season"], x["round"]))
    last = rs_sorted[-1]
    cset = sorted(set(x["circuit"] for x in rs_sorted if x["circuit"]))
    host_metros.append({
        "metro": rs_sorted[-1]["metro"], "metro_slug": mslug,
        "metro_resolved": rs_sorted[-1]["metro_resolved"],
        "country": last["country"], "races": len(rs_sorted),
        "circuits": cset, "circuit_count": len(cset),
        "first_year": rs_sorted[0]["season"], "last_year": rs_sorted[-1]["season"],
        "last_gp": {"season": last["season"], "race_name": last["race_name"],
                    "winner": last["winner"], "constructor": last["winner_constructor"],
                    "circuit_id": last["circuit_id"]},
    })
    metro_recent[mslug] = {"race_name": last["race_name"], "season": last["season"],
                           "winner": last["winner"], "constructor": last["winner_constructor"],
                           "circuit_id": last["circuit_id"], "races": len(rs_sorted)}
host_metros.sort(key=lambda x: (-x["races"], x["metro"] or ""))

# ---- this (latest) season ----
season_rows = [r for r in races if r["season"] == THIS_YEAR]  # include upcoming (winner-less) races
season_latest = sorted(season_rows, key=lambda x: x["round"])

# ---- current-season standings (fallback for the ESPN live table) ----
_d_all = [r for r in dstand if num(r["season"]) == THIS_YEAR]
_c_all = [r for r in cstand if num(r["season"]) == THIS_YEAR]
cur_round = max([num(r["round"]) for r in _d_all], default=None)
_c_round = max([num(r["round"]) for r in _c_all], default=None)
cur_d_rows = sorted([r for r in _d_all if num(r["round"]) == cur_round], key=lambda r: (num(r.get("position")) or 999))
cur_c_rows = sorted([r for r in _c_all if num(r["round"]) == _c_round], key=lambda r: (num(r.get("position")) or 999))
# latest constructor per driver this season (for display)
drv_team = {}
for r in sorted([x for x in results if num(x["season"]) == THIS_YEAR], key=lambda x: num(x["round"])):
    drv_team[r["driver_id"]] = r["constructor"]
current_standings = {
    "season": THIS_YEAR, "round": cur_round,
    "drivers": [{"pos": num(r.get("position")), "driver": dr_name.get(r["driver_id"], r["driver_id"]),
                 "nat": dr_nat.get(r["driver_id"]), "team": drv_team.get(r["driver_id"]),
                 "points": num(r.get("points")), "wins": num(r.get("wins"))} for r in cur_d_rows],
    "constructors": [{"pos": num(r.get("position")), "constructor": co_name.get(r["constructor_id"], r["constructor_id"]),
                      "points": num(r.get("points")), "wins": num(r.get("wins"))} for r in cur_c_rows],
}

data = {
    "meta": {
        "league": "Formula 1", "abbr": "F1", "sport": "Formula 1",
        "first_season": races[0]["season"], "latest_season": THIS_YEAR,
        "races_total": len(races), "host_metros": len(host_metros),
        "circuits": len(circuits_out),
        "generated": __import__("datetime").date.today().isoformat(),
    },
    "champions": champions,
    "driver_titles": driver_titles,
    "constructor_titles": constructor_titles,
    "all_time_driver_wins": all_time_driver_wins,
    "all_time_constructor_wins": all_time_constructor_wins,
    "circuits": circuits_out,
    "circuit_detail": circuit_detail,
    "host_metros": host_metros,
    "metro_recent": metro_recent,
    "latest_season_races": season_latest,
    "current_standings": current_standings,
}

os.makedirs(OUT_DIR, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT)
m = data["meta"]
print(f"  seasons {m['first_season']}-{m['latest_season']}, {m['races_total']} races, "
      f"{m['host_metros']} host metros, {m['circuits']} circuits")
print(f"  champions {len(champions)} (through {champions[-1]['season']}), "
      f"driver titles leader {driver_titles[0]['name']} ({driver_titles[0]['titles']})")
unres = [h['metro'] for h in host_metros if not h['metro_resolved']]
print(f"  unresolved metros ({len(unres)}): {unres if unres else 'none'}")
