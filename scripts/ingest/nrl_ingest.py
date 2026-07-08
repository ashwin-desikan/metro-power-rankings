#!/usr/bin/env python3
"""Live-season ingest: pull the current NRL ladder from ESPN's public API and
upsert the in-progress season into public.afl_nrl_ladders (sport='Rugby League',
Supabase = source of truth). Idempotent on (sport, season, team).

Mirrors scripts/ingest/afl_ingest.py, with NRL specifics discovered from the
site's own lib/_footyStandings.ts: the endpoint is rugby-league/3 (league id 3),
the ladder sits under children[0].standings.entries, ESPN's displayName is the
NICKNAME only, and NRL uses gamesWon/gamesLost/gamesDrawn rather than
wins/losses/ties. Canonical Name, Metro Area and State come from the CLUBS map,
seeded from the migrated 2025 ladder.

Season-outcome flags (minor_prem, finals, grand_final_app, premiership) are NOT
written here; the merge-duplicates upsert only sets payload columns, leaving
those for the season-end finalizer.

Env: SUPABASE_URL (optional), SUPABASE_WRITE_KEY (required; sb_secret_...).
"""
import json, os, sys, urllib.request, urllib.error

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
ESPN_URL = "https://site.api.espn.com/apis/v2/sports/rugby-league/3/standings"
TABLE = "afl_nrl_ladders"
SPORT = "Rugby League"
LEAGUE = "NRL"

# ESPN nickname -> (canonical Name, Metro Area, State). Seeded from migrated rows.
CLUBS = {
    "Panthers": ("Penrith", "Sydney", "New South Wales"),
    "Rabbitohs": ("South Sydney", "Sydney", "New South Wales"),
    "Storm": ("Melbourne Storm", "Melbourne", "Victoria"),
    "Roosters": ("Sydney Roosters", "Sydney", "New South Wales"),
    "Sea Eagles": ("Manly Warringah", "Sydney", "New South Wales"),
    "Dolphins": ("Dolphins", "Brisbane", "Queensland"),
    "Sharks": ("Cronulla-Sutherland", "Sydney", "New South Wales"),
    "Knights": ("Newcastle Knights", "Newcastle-Maitland", "New South Wales"),
    "Cowboys": ("North Queensland", "Townsville", "Queensland"),
    "Wests Tigers": ("Wests Tigers", "Sydney", "New South Wales"),
    "Broncos": ("Brisbane Broncos", "Brisbane", "Queensland"),
    "Bulldogs": ("Canterbury-Bankstown", "Sydney", "New South Wales"),
    "Raiders": ("Canberra Raiders", "Canberra", "Australian Capital Territory"),
    "Titans": ("Gold Coast Titans", "Gold Coast", "Queensland"),
    "Eels": ("Parramatta", "Sydney", "New South Wales"),
    "Dragons": ("St George Illawarra", "Wollongong", "New South Wales"),
    "Warriors": ("New Zealand Warriors", "Auckland", "New Zealand"),
}

def _get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "rankings-citizen-of-nowhere/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def _entries(d):
    for c in d.get("children", []):
        e = ((c.get("standings") or {}).get("entries")) or []
        if e:
            return e
    return ((d.get("standings") or {}).get("entries")) or []

def _season(d):
    y = (d.get("season") or {}).get("year")
    if y:
        return int(y)
    for c in d.get("children", []):
        s = (c.get("standings") or {}).get("season")
        if s:
            return int(s)
    return 0

def _stat(entry, name):
    for s in entry.get("stats", []):
        if s.get("name") == name:
            return s.get("value")
    return None

def _i(v):
    return int(v) if v is not None else None

def rows_from_espn(d):
    season = _season(d)
    if not season:
        sys.exit("ESPN payload had no season year; aborting (no write).")
    rows, unknown = [], []
    for e in _entries(d):
        disp = ((e.get("team") or {}).get("displayName") or "").strip()
        if not disp:
            continue
        club = CLUBS.get(disp)
        if not club:
            unknown.append(disp)
            continue
        name, metro, state = club
        rows.append({
            "sport": SPORT, "name": name, "team": name, "season": season, "league": LEAGUE,
            "rank": _i(_stat(e, "rank")), "played": _i(_stat(e, "gamesPlayed")),
            "wins": _i(_stat(e, "gamesWon")), "draws": _i(_stat(e, "gamesDrawn")),
            "losses": _i(_stat(e, "gamesLost")),
            "premiership_points": _i(_stat(e, "points")),
            "points_for": _i(_stat(e, "pointsFor")), "points_against": _i(_stat(e, "pointsAgainst")),
            "metro_area": metro, "state": state,
        })
    if unknown:
        print(f"WARNING: unmapped ESPN clubs (add to CLUBS): {unknown}", file=sys.stderr)
    return season, rows

def upsert(rows):
    if not KEY:
        sys.exit("SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) not set; refusing to write.")
    headers = {"apikey": KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    if KEY.count(".") == 2:
        headers["Authorization"] = f"Bearer {KEY}"
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{TABLE}?on_conflict=sport,season,team",
        data=json.dumps(rows).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as ex:
        sys.exit(f"HTTP {ex.code} upserting {TABLE}: {ex.read().decode(errors='replace')[:300]}")

if __name__ == "__main__":
    season, rows = rows_from_espn(_get(ESPN_URL))
    if not rows:
        print("No NRL ladder rows from ESPN (offseason or empty payload); nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"nrl ingest: upserted {len(rows)} rows for season {season}")
