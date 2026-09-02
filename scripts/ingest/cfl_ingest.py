#!/usr/bin/env python3
"""Live-season ingest: scrape the current CFL standings from cfl.ca and upsert
the in-progress season into public.cfl_standings (Supabase = source of truth).
Idempotent on (year, team).

CFL is NOT on ESPN (ESPN dropped the live CFL feed), so this mirrors the site's
lib/cflStandings.ts: cfl.ca/standings/<year>/ is server-rendered, so the West/
East division tables are in the HTML. We strip tags and regex-parse the rows.

Standings columns (division, w, l, t, pct, pf, pa) refresh every run. Season-
outcome flags (play_app, gc_final, grey_cup, playoff_result) are NOT written
here; they are left for the season-end finalizer.

Env: SUPABASE_URL (optional), SUPABASE_WRITE_KEY (required; sb_secret_...),
     CFL_YEAR (optional; defaults to the current UTC year).
"""
import json, os, re, sys, datetime, urllib.request, urllib.error

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()
YEAR = int(os.environ.get("CFL_YEAR") or datetime.datetime.utcnow().year)
TABLE = "cfl_standings"

# cfl.ca uppercase label -> (canonical Name, Division). Matches lib/cflStandings.ts.
TEAMS = {
    "WINNIPEG": ("Winnipeg Blue Bombers", "West"),
    "EDMONTON": ("Edmonton Elks", "West"),
    "BC": ("BC Lions", "West"),
    "SASKATCHEWAN": ("Saskatchewan Roughriders", "West"),
    "CALGARY": ("Calgary Stampeders", "West"),
    "MONTREAL": ("Montreal Alouettes", "East"),
    "TORONTO": ("Toronto Argonauts", "East"),
    "OTTAWA": ("Ottawa RedBlacks", "East"),
    "HAMILTON": ("Hamilton Tiger-Cats", "East"),
}
# cfl.ca abbreviation -> (name, division). The old uppercase-city keys
# ("WINNIPEG") came from the scraped HTML table; the JSON API returns
# abbreviations, so TEAMS above is kept for its names and this maps onto it.
ABBR = {
    "WPG": "WINNIPEG", "EDM": "EDMONTON", "BC": "BC", "SSK": "SASKATCHEWAN",
    "CGY": "CALGARY", "MTL": "MONTREAL", "TOR": "TORONTO", "OTT": "OTTAWA",
    "HAM": "HAMILTON",
}


def fetch_standings(year):
    """Season standings from api.stats.cfl.ca.

    Was a scrape of https://www.cfl.ca/standings/<year>/. cfl.ca was rebuilt as
    a Nuxt app: that year-suffixed URL now 404s (which is what failed this
    workflow from 2026-08-31), and the standings table on the surviving
    /standings/ page is loaded client-side, so the SSR HTML has no rows for the
    old regex to match either. This endpoint is the XHR the rebuilt page makes
    itself -- a public JSON API, and a better source than the scrape was.

    Mirrors scripts/predictions/build_season_sims.py parse_cfl_standings, which
    was moved to the same endpoint on 2026-09-01. Keep the two in step."""
    req = urllib.request.Request(
        f"https://api.stats.cfl.ca/standings/{year}",
        headers={"Accept": "application/json",
                 "User-Agent": "MetroPowerRankings/1.0 (+https://rankings.citizenofnowhere.org)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def rows_from_api(doc, year):
    rows, seen = [], set()
    for div in ((doc.get("data") or {}).get("divisions") or {}).values():
        for r in (div or {}).get("standings") or []:
            meta = TEAMS.get(ABBR.get(r.get("abbreviation"), ""))
            if not meta or meta[0] in seen:
                continue
            seen.add(meta[0])
            name, division = meta
            try:
                gp = int(r["games_played"]); w = int(r["wins"])
                l = int(r["losses"]); t = int(r["ties"])
                pf = int(r["points_for"]); pa = int(r["points_against"])
            except (KeyError, TypeError, ValueError):
                continue
            rows.append({
                "year": year, "division": division, "team": name, "canonical": name,
                "w": w, "l": l, "t": t,
                "pct": round((w + 0.5 * t) / gp, 3) if gp else 0.0,
                "pf": pf, "pa": pa,
            })
    return rows


def upsert(rows):
    if not KEY:
        sys.exit("SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) not set; refusing to write.")
    headers = {"apikey": KEY, "Content-Type": "application/json",
               "Prefer": "resolution=merge-duplicates,return=minimal"}
    if KEY.count(".") == 2:
        headers["Authorization"] = f"Bearer {KEY}"
    req = urllib.request.Request(
        f"{SB_URL}/rest/v1/{TABLE}?on_conflict=year,team",
        data=json.dumps(rows).encode(), method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as ex:
        sys.exit(f"HTTP {ex.code} upserting {TABLE}: {ex.read().decode(errors='replace')[:300]}")

if __name__ == "__main__":
    rows = rows_from_api(fetch_standings(YEAR), YEAR)
    if not rows:
        print(f"No CFL standings parsed for {YEAR} (offseason or page changed); nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"cfl ingest: upserted {len(rows)} rows for season {YEAR}")
