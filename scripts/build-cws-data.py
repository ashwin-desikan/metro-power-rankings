#!/usr/bin/env python3
"""Build public/data/baseball/cws.json from the `cws_standings` table in
Supabase (SOURCE OF TRUTH as of 2026-07; migrated from the 'CWS Standings' sheet
of OtherLeagues.xlsx). Output is byte-identical to the previous xlsx-sourced
build. One row per team's College World Series appearance. Emits the per-year
champions roll and an all-time aggregate (titles / finals / appearances). Run:
    python scripts/build-cws-data.py
Env (all optional; falls back to the public anon read creds):
    SUPABASE_URL / SUPABASE_ANON_KEY  (or NEXT_PUBLIC_* equivalents)
"""
import json, os, time, urllib.request, urllib.parse
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "baseball", "cws.json")

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
          or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
          or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def fetch(table, select):
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": "year,team", "limit": step, "offset": off})
        req = urllib.request.Request(f"{SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.load(r)
        out += batch
        if len(batch) < step:
            return out
        off += step

raw = fetch("cws_standings", "year,team,finals,champion")
rows = [{"year": int(r["year"]), "team": str(r["team"]).strip(),
         "finals": bool(r["finals"]), "champ": bool(r["champion"])}
        for r in raw if r.get("year") is not None and r.get("team")]

years = sorted({r["year"] for r in rows})
champions = []
for y in sorted(years, reverse=True):
    yr = [r for r in rows if r["year"] == y]
    champions.append({"year": y,
        "champion": next((r["team"] for r in yr if r["champ"]), None),
        "runner_up": next((r["team"] for r in yr if r["finals"] and not r["champ"]), None)})

apps = Counter(r["team"] for r in rows)
titles = Counter(r["team"] for r in rows if r["champ"])
fin = Counter(r["team"] for r in rows if r["finals"])
last = {}
for r in rows:
    if r["champ"]:
        last[r["team"]] = max(last.get(r["team"], 0), r["year"])
teams = [{"name": t, "titles": titles[t], "finals": fin[t], "apps": apps[t], "last_title": last.get(t)} for t in apps]
teams.sort(key=lambda x: (-x["titles"], -x["apps"], x["name"]))

out = {"generated": time.strftime("%Y-%m-%d"), "first_year": years[0], "last_year": years[-1],
       "editions": len(years), "champions": champions, "teams": teams}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"wrote {OUT}: {len(years)} editions, {len(teams)} teams (from Supabase cws_standings)")
