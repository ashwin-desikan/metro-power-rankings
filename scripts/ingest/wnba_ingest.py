#!/usr/bin/env python3
"""Live-season ingest: pull current WNBA standings from ESPN's public API and
upsert the in-progress season into public.wnba_seasons (Supabase = source of
truth). Idempotent on (season, team): re-running just refreshes the current
season's rows, so nightly runs accumulate the season and, once it finishes,
those rows persist as permanent history with no manual step.

Reuses the same ESPN endpoint the site already reads in lib/wnba-standings.ts.
The rewired scripts/build-wnba-data.py reads wnba_seasons from Supabase, so the
hub and metro pages pick up the new season automatically.

Standings columns (w, l, win_pct, gb, ps_g, pf_g, conference) are written every
run. Playoff-outcome flags (playoffs, div_title, best_rec, sf_app, champ_app,
champ, p_wins, p_losses) are intentionally NOT touched here; the merge-duplicates
upsert only sets the columns in the payload, leaving those for the season-end
finalizer (wnba_finalize.py) once the postseason concludes.

Env:
  SUPABASE_URL        (optional; defaults to the project URL)
  SUPABASE_WRITE_KEY  (required for writes: a Supabase secret key, sb_secret_...,
                       from the new key system; it bypasses RLS)
"""
import json, os, sys, urllib.request, urllib.error

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
ESPN_URL = "https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings"
TABLE = "wnba_seasons"

def _get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "rankings-citizen-of-nowhere/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def _stat(entry, name):
    for s in entry.get("stats", []):
        if s.get("name") == name:
            return s.get("value")
    return None

def _r(v, nd):
    return round(float(v), nd) if v is not None else None

def rows_from_espn(d):
    season = int((d.get("season") or {}).get("year") or 0)
    if not season:
        sys.exit("ESPN payload had no season.year; aborting (no write).")
    rows = []
    for child in d.get("children", []):
        gname = (child.get("name") or "").lower()
        conf = "East" if "east" in gname else "West" if "west" in gname else ""
        for e in ((child.get("standings") or {}).get("entries") or []):
            team = ((e.get("team") or {}).get("displayName") or "").strip()
            if not team:
                continue
            w = int(_stat(e, "wins") or 0)
            l = int(_stat(e, "losses") or 0)
            wp = _stat(e, "winPercent")
            rows.append({
                "season": season, "team": team, "canonical_name": team, "conference": conf,
                "w": w, "l": l,
                "win_pct": _r(wp, 3) if wp is not None else (round(w / (w + l), 3) if w + l else None),
                "gb": _r(_stat(e, "gamesBehind") or 0, 1),
                "ps_g": _r(_stat(e, "avgPointsFor"), 1),
                "pf_g": _r(_stat(e, "avgPointsAgainst"), 1),
            })
    return season, rows

def upsert(rows):
    if not KEY:
        sys.exit("SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) not set; refusing to write.")
    headers = {"apikey": KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    # New-style sb_secret_/sb_publishable keys are NOT JWTs and must not be sent
    # as a Bearer token (the API gateway mints the role JWT from the apikey
    # header). Only legacy anon/service_role JWT keys expect the Bearer header.
    if KEY.count(".") == 2:
        headers["Authorization"] = f"Bearer {KEY}"
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{TABLE}?on_conflict=season,team",
        data=json.dumps(rows).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as ex:
        sys.exit(f"HTTP {ex.code} upserting {TABLE}: {ex.read().decode(errors='replace')[:300]}")

if __name__ == "__main__":
    season, rows = rows_from_espn(_get(ESPN_URL))
    if not rows:
        print("No standings rows from ESPN (offseason or empty payload); nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"wnba ingest: upserted {len(rows)} rows for season {season}")
