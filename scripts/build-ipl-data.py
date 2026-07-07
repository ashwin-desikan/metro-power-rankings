#!/usr/bin/env python3
"""Build public/data/ipl/data.json from Supabase (source of truth; migrated
2026-07 from OtherLeagues.xlsx 'IPL Table' + 'IPL Playoff Matches'). The original
workbook builder was not in the repo, so the curated franchise metadata (slug,
abbreviation, colours, city/state/metro, and DISPLAY ORDER) lives here; all
stats are computed from the ipl_standings table. Output schema matches the prior
committed data.json (indent=2). Run: python scripts/build-ipl-data.py
"""
import json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "ipl", "data.json")

_SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
           or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
_SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def _sb_fetch(table, select, order="id"):
    import urllib.request, urllib.parse, urllib.error, time
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{_SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": _SB_KEY, "Authorization": f"Bearer {_SB_KEY}"})
        batch = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    batch = json.load(resp)
                break
            except (urllib.error.HTTPError, urllib.error.URLError):
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))
        out += batch
        if len(batch) < step:
            return out
        off += step

# Curated franchises in display order: (slug, name, abbr, color, color2, city, state, metro, founded, active)
FR = [
    ("mumbai-indians", "Mumbai Indians", "MI", "#004BA0", "#D4AF37", "Mumbai", "Maharashtra", "Mumbai", 2008, True),
    ("chennai-super-kings", "Chennai Super Kings", "CSK", "#F9CD06", "#F7A812", "Chennai", "Tamil Nadu", "Chennai", 2008, True),
    ("kolkata-knight-riders", "Kolkata Knight Riders", "KKR", "#3A225D", "#B3A123", "Kolkata", "West Bengal", "Calcutta", 2008, True),
    ("rcb", "Royal Challengers Bengaluru", "RCB", "#EC1C24", "#1A1A1A", "Bengaluru", "Karnataka", "Bangalore", 2008, True),
    ("rajasthan-royals", "Rajasthan Royals", "RR", "#EA1A8A", "#254AA5", "Jaipur", "Rajasthan", "Jaipur", 2008, True),
    ("sunrisers-hyderabad", "Sunrisers Hyderabad", "SRH", "#F26522", "#1A1A1A", "Hyderabad", "Telangana", "Hyderabad", 2013, True),
    ("gujarat-titans", "Gujarat Titans", "GT", "#1C2951", "#00B4D8", "Ahmedabad", "Gujarat", "Ahmedabad", 2022, True),
    ("punjab-kings", "Punjab Kings", "PBKS", "#AA4545", "#DCCCB0", "Chandigarh", "Chandigarh (UT)", "Chandigarh", 2008, True),
    ("delhi-capitals", "Delhi Capitals", "DC", "#004C97", "#EF3340", "Delhi", "NCT of Delhi", "Delhi", 2008, True),
    ("lucknow-super-giants", "Lucknow Super Giants", "LSG", "#002147", "#23B5D3", "Lucknow", "Uttar Pradesh", "Lucknow", 2022, True),
    ("deccan-chargers", "Deccan Chargers", "DEC", "#2D2D2D", "#C0C0C0", "Hyderabad", "Telangana", "Hyderabad", 2008, False),
    ("pune-warriors", "Pune Warriors", "PW", "#1B375A", "#FFFFFF", "Pune", "Maharashtra", "Pune", 2011, False),
    ("gujarat-lions", "Gujarat Lions", "GL", "#E87F1E", "#FFFFFF", "Rajkot", "Gujarat", "Rajkot", 2016, False),
    ("rising-pune-supergiant", "Rising Pune Supergiant", "RPSG", "#8B2BE2", "#FFFFFF", "Pune", "Maharashtra", "Pune", 2016, False),
    ("kochi-tuskers", "Kochi Tuskers Kerala", "KTK", "#006633", "#FFFFFF", "Kochi", "Kerala", "Kochi", 2011, False),
]

def _N(x):
    if x is None or x == "": return None
    f = float(x)
    return int(f) if f == int(f) else f

def main():
    st = _sb_fetch("ipl_standings",
        "season,pos,team,canonical_name,m,w,l,nr,pts,nrr,playoffs,finalist,champion,active", order="id")
    pm = _sb_fetch("ipl_playoff_matches", "season,round,team1,team2,result", order="id")
    name2slug = {f[1]: f[0] for f in FR}

    by_season = defaultdict(list)
    for r in st:
        by_season[int(r["season"])].append(r)
    po_by_season = defaultdict(list)
    for r in pm:
        po_by_season[int(r["season"])].append(r)
    years = sorted(by_season)

    seasons = []
    for y in years:
        rows = sorted(by_season[y], key=lambda r: r["pos"])
        standings, champ, ru, champ_slug, ru_slug = [], None, None, None, None
        for r in rows:
            canon = r["canonical_name"] or r["team"]
            slug = name2slug.get(canon)
            standings.append({
                "pos": r["pos"], "team": r["team"], "name": canon, "slug": slug,
                "m": r["m"], "w": r["w"], "l": r["l"], "nr": r["nr"], "pts": r["pts"], "nrr": _N(r["nrr"]),
                "playoffs": bool(r["playoffs"]), "finalist": bool(r["finalist"]),
                "champion": bool(r["champion"]), "active": bool(r["active"]),
            })
            if r["champion"]: champ, champ_slug = canon, slug
            elif r["finalist"]: ru, ru_slug = canon, slug
        playoffs = [{"round": p["round"], "team1": p["team1"], "team2": p["team2"], "result": p["result"]}
                    for p in po_by_season[y]]
        seasons.append({"year": y, "teams": len(rows), "champion": champ, "champion_slug": champ_slug,
                        "runner_up": ru, "runner_up_slug": ru_slug, "standings": standings, "playoffs": playoffs})

    by_canon = defaultdict(list)
    for r in st:
        by_canon[r["canonical_name"] or r["team"]].append(r)
    franchises = []
    for slug, name, abbr, color, color2, city, state, metro, founded, active in FR:
        rows = by_canon.get(name, [])
        title_years = sorted(int(r["season"]) for r in rows if r["champion"])
        ru_years = sorted(int(r["season"]) for r in rows if r["finalist"] and not r["champion"])
        final_years = sorted(int(r["season"]) for r in rows if r["finalist"])
        franchises.append({
            "slug": slug, "name": name, "abbr": abbr, "city": city, "state": state, "metro": metro,
            "founded": founded, "active": active, "color": color, "color2": color2,
            "seasons": len(rows),
            "playoff_appearances": sum(1 for r in rows if r["playoffs"]),
            "finals": sum(1 for r in rows if r["finalist"]),
            "titles": len(title_years), "title_years": title_years,
            "runner_up_count": len(ru_years), "runner_up_years": ru_years,
            "last_title": max(title_years) if title_years else None,
            "last_final": max(final_years) if final_years else None,
        })

    meta = {"league": "Indian Premier League", "abbr": "IPL", "sport": "Cricket", "format": "T20",
            "founded": min(years), "latest_season": max(years), "total_seasons": len(years),
            "active_teams": sum(1 for f in FR if f[9])}
    payload = {"meta": meta, "franchises": franchises, "seasons": seasons}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as _f:
        json.dump(payload, _f, ensure_ascii=False, indent=2)
        _f.write("\n")
    print(f"wrote {OUT}: {len(franchises)} franchises, {len(seasons)} seasons, {min(years)}-{max(years)}")

if __name__ == "__main__":
    main()
