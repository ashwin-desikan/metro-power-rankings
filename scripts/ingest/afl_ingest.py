#!/usr/bin/env python3
"""Live-season ingest: pull the current AFL ladder from ESPN's public API and
upsert the in-progress season into public.afl_nrl_ladders (sport='Aussie Rules',
Supabase = source of truth). Idempotent on (sport, season, team).

Mirrors scripts/ingest/wnba_ingest.py. The AFL ladder is a single table at the
top-level `standings.entries` (ESPN `children` is empty). ESPN gives the record
and scoring; canonical Name, Metro Area and State (which ESPN does not carry)
come from the CLUBS map below, seeded from the migrated 2025 ladder.

Standings columns (rank, played, wins, draws, losses, premiership_points,
points_for, points_against) refresh every run. Season-outcome flags (minor_prem,
finals, grand_final_app, premiership) are NOT written here; the merge-duplicates
upsert only sets payload columns, leaving those for the season-end finalizer.

Env: SUPABASE_URL (optional), SUPABASE_WRITE_KEY (required; sb_secret_...).
"""
import json, os, sys, urllib.request, urllib.error

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
ESPN_URL = "https://site.api.espn.com/apis/v2/sports/australian-football/afl/standings"
TABLE = "afl_nrl_ladders"
SPORT = "Aussie Rules"
LEAGUE = "AFL"

# ESPN displayName -> (canonical Name, Metro Area, State). Seeded from the
# migrated ladder; add a row here if the AFL admits a new club (e.g. Tasmania).
CLUBS = {
    "Fremantle": ("Fremantle", "Perth", "Western Australia"),
    "Melbourne": ("Melbourne", "Melbourne", "Victoria"),
    "West Coast Eagles": ("West Coast", "Perth", "Western Australia"),
    "Sydney Swans": ("Sydney Swans", "Sydney", "New South Wales"),
    "North Melbourne": ("North Melbourne", "Melbourne", "Victoria"),
    "Western Bulldogs": ("Western Bulldogs", "Melbourne", "Victoria"),
    "Port Adelaide": ("Port Adelaide", "Adelaide", "South Australia"),
    "GWS GIANTS": ("Greater Western Sydney", "Sydney", "New South Wales"),
    "Carlton": ("Carlton", "Melbourne", "Victoria"),
    "Gold Coast SUNS": ("Gold Coast", "Gold Coast", "Queensland"),
    "Brisbane Lions": ("Brisbane Lions", "Brisbane", "Queensland"),
    "Richmond": ("Richmond", "Melbourne", "Victoria"),
    "Hawthorn": ("Hawthorn", "Melbourne", "Victoria"),
    "Geelong Cats": ("Geelong", "Geelong", "Victoria"),
    "Adelaide Crows": ("Adelaide", "Adelaide", "South Australia"),
    "Essendon": ("Essendon", "Melbourne", "Victoria"),
    "Collingwood": ("Collingwood", "Melbourne", "Victoria"),
    "St Kilda": ("St Kilda", "Melbourne", "Victoria"),
}

def _get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "rankings-citizen-of-nowhere/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def _entries(d):
    # AFL: single top-level ladder; fall back to children groups if ESPN changes.
    top = ((d.get("standings") or {}).get("entries")) or []
    if top:
        return top
    out = []
    for c in d.get("children", []):
        out += ((c.get("standings") or {}).get("entries") or [])
    return out

def _stat(entry, name):
    for s in entry.get("stats", []):
        if s.get("name") == name:
            return s.get("value")
    return None

def _i(v):
    return int(v) if v is not None else None

def rows_from_espn(d):
    season = int((d.get("season") or {}).get("year") or 0)
    if not season:
        sys.exit("ESPN payload had no season.year; aborting (no write).")
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
            "wins": _i(_stat(e, "wins")), "draws": _i(_stat(e, "ties")), "losses": _i(_stat(e, "losses")),
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
        print("No AFL ladder rows from ESPN (offseason or empty payload); nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"afl ingest: upserted {len(rows)} rows for season {season}")
