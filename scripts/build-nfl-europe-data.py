#!/usr/bin/env python3
"""Build public/data/nfl/europe.json from the 'NFL Europe' sheet of
OtherLeagues.xlsx (repo root).

The hub at /teams/nfl/international and the metro-page defunct-team cards
read this JSON; nothing reads the workbook at runtime. Re-run after the
workbook changes:  python scripts/build-nfl-europe-data.py

Editorial model (confirmed with the data owner):
  * The "Name" column is the CANONICAL franchise identity. The "Team"
    column is the contemporaneous name used in a given metro/era. So the
    1991-92 "Birmingham Fire" (metro Birmingham (AL)) and the 1995-2007
    "Rhein Fire" (metro Rhine-Ruhr) are ONE franchise that relocated in
    1995. Likewise the Scottish Claymores span Edinburgh then Glasgow.
  * A franchise is therefore grouped by Name, and split into per-metro
    "stints" so each metro page shows the club under its local name with
    the titles won while it played there.
"""
import json, os, time, urllib.request, urllib.parse
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) \
    if os.path.basename(os.path.dirname(os.path.abspath(__file__))) == "scripts" \
    else os.environ.get("REPO_ROOT", os.getcwd())
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
        for _try in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as rr:
                    batch = json.load(rr); break
            except Exception:
                if _try == 3: raise
                time.sleep(2)
        out += batch
        if len(batch) < step:
            return out
        off += step
OUT = os.path.join(ROOT, "public", "data", "nfl", "europe.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

# name -> slug from the canonical metro dataset
metro_slug = {}
for m in json.load(open(METROS, encoding="utf-8")):
    metro_slug[m["name"]] = m["slug"]

_wb_rows = _sb("nfl_europe_worldbowls", "season,game,date,venue,city,champion,runner_up,score")
_std_rows = _sb("nfl_europe_standings", "season,division,pos,team,w,l,t,pct,pf,pa,playoff,wb_app,wb_champ,canonical,metro")

def cell(r, i):
    return r[i] if i < len(r) else None

def clean(v):
    if v is None:
        return None
    if hasattr(v, "year") and hasattr(v, "month"):  # datetime
        return v.strftime("%Y-%m-%d")
    return str(v).strip() if isinstance(v, str) else v

# ---- World Bowl championship games (from Supabase) ----
world_bowls = [{
    "season": r["season"],
    "game": r["game"],
    "date": r["date"],
    "venue": r["venue"],
    "city": r["city"],
    "champion": r["champion"],
    "runner_up": r["runner_up"],
    "score": r["score"],
} for r in _wb_rows]

# ---- Season standings (from Supabase) ----
standings = []
for r in _std_rows:
    team = r["team"]
    name = r["canonical"]
    metro = r["metro"]
    if not team or not name:
        continue
    standings.append({
        "season": r["season"],
        "division": r["division"],
        "pos": r["pos"],
        "team": team,
        "w": r["w"] or 0, "l": r["l"] or 0, "t": r["t"] or 0,
        "pct": r["pct"],
        "pf": r["pf"], "pa": r["pa"],
        "playoff": bool(r["playoff"]),
        "wb_app": bool(r["wb_app"]),
        "wb_champ": bool(r["wb_champ"]),
        "canonical": name,
        "metro": metro,
        "metro_slug": metro_slug.get(metro),
    })

# warn on any unmapped metro
missing = sorted({s["metro"] for s in standings if not s["metro_slug"]})
if missing:
    print("WARNING unmapped metros:", missing)

def winpct(w, l, t):
    g = w + l + t
    return round((w + 0.5 * t) / g, 4) if g else 0.0

# ---- aggregate franchises by canonical Name, split into metro stints ----
by_name = defaultdict(list)
for s in standings:
    by_name[s["canonical"]].append(s)

franchises = []
for name, srows in by_name.items():
    srows.sort(key=lambda s: s["season"])
    # per-metro stints
    stints_map = defaultdict(list)
    for s in srows:
        stints_map[(s["metro"], s["metro_slug"])].append(s)
    stints = []
    for (metro, slug), mrows in stints_map.items():
        mrows.sort(key=lambda s: s["season"])
        w = sum(x["w"] for x in mrows); l = sum(x["l"] for x in mrows); t = sum(x["t"] for x in mrows)
        # contemporaneous team name in this metro = the EARLIEST Team value in
        # the stint. For relocations this keeps the local name (Birmingham Fire
        # in Birmingham, Rhein Fire in the Rhine-Ruhr); for an in-place rename it
        # keeps the canonical original (London Monarchs, not England Monarchs).
        team_name = mrows[0]["team"]
        stints.append({
            "metro": metro, "metro_slug": slug,
            "team": team_name,
            "first_year": mrows[0]["season"], "last_year": mrows[-1]["season"],
            "seasons": len(mrows),
            "w": w, "l": l, "t": t, "win_pct": winpct(w, l, t),
            "wb_apps": sum(1 for x in mrows if x["wb_app"]),
            "wb_titles": sum(1 for x in mrows if x["wb_champ"]),
        })
    stints.sort(key=lambda x: x["first_year"])
    W = sum(x["w"] for x in srows); L = sum(x["l"] for x in srows); T = sum(x["t"] for x in srows)
    franchises.append({
        "canonical": name,
        "first_year": srows[0]["season"], "last_year": srows[-1]["season"],
        "seasons": len({x["season"] for x in srows}),
        "w": W, "l": L, "t": T, "win_pct": winpct(W, L, T),
        "wb_apps": sum(1 for x in srows if x["wb_app"]),
        "wb_titles": sum(1 for x in srows if x["wb_champ"]),
        "metros": stints,
        "relocated": len(stints) > 1,
    })

# sort: most World Bowl titles, then win pct
franchises.sort(key=lambda f: (-f["wb_titles"], -f["win_pct"], f["canonical"]))

out = {
    "meta": {
        "name": "NFL Europe",
        "aka": "World League of American Football (1991-92, 1995-97) · NFL Europe (1998-2006) · NFL Europa (2007)",
        "years": "1991–2007",
        "championship": "World Bowl",
        "source": "Wikipedia season articles; OtherLeagues.xlsx 'NFL Europe' sheet.",
    },
    "world_bowls": sorted(world_bowls, key=lambda x: x["season"]),
    "franchises": franchises,
    "standings": standings,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
print(f"Wrote {OUT}")
print(f"  {len(world_bowls)} World Bowls, {len(franchises)} franchises, {len(standings)} season rows")
print("  Franchises (titles | metros):")
for f in franchises:
    ms = ", ".join(f"{st['team']}@{st['metro']} {st['first_year']}-{st['last_year']}" for st in f["metros"])
    print(f"    {f['canonical']:24} {f['wb_titles']}T  {ms}")
