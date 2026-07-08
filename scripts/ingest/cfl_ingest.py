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
# rank TEAM gp w l t pts pf pa  home away div  (records dropped)
ROW = re.compile(r"(\d+)\s+([A-Z]{2,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+-\d+-\d+\s+\d+-\d+-\d+\s+\d+-\d+-\d+")

def fetch_html(year):
    req = urllib.request.Request(
        f"https://www.cfl.ca/standings/{year}/",
        headers={"User-Agent": "Mozilla/5.0 (compatible; MetroPowerRankings/1.0; +https://rankings.citizenofnowhere.org)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def rows_from_html(html, year):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    rows, seen = [], set()
    for m in ROW.finditer(text):
        label = m.group(2)
        meta = TEAMS.get(label)
        if not meta or meta[0] in seen:
            continue
        seen.add(meta[0])
        name, division = meta
        gp, w, l, t, pts, pf, pa = (int(m.group(i)) for i in (3, 4, 5, 6, 7, 8, 9))
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
    rows = rows_from_html(fetch_html(YEAR), YEAR)
    if not rows:
        print(f"No CFL standings parsed for {YEAR} (offseason or page changed); nothing to do.")
        sys.exit(0)
    upsert(rows)
    print(f"cfl ingest: upserted {len(rows)} rows for season {YEAR}")
