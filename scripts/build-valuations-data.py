#!/usr/bin/env python3
"""Build cross-sport team valuations data from the Team Valuations sheet of
OtherLeagues.xlsx.

The sheet is a curated, non-exhaustive snapshot: latest available valuation per
team. US leagues (NFL/NBA/MLB/NHL) carry Forbes figures; global soccer clubs
carry Sportico figures, with the League column holding the club's country.

Emits public/data/valuations/valuations.json:
  { "generated": "<iso>", "rows": [ {year, team, league, value_m, source}, ... ] }
Link resolution to canonical /teams pages is done in lib/valuations.ts so the
shared resolveTeamLink() stays the single source of truth.

Usage: python scripts/build-valuations-data.py [SOURCE_XLSX]
"""
import json, os, sys, datetime
import time, urllib.request, urllib.parse

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
        for _t in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as rr:
                    batch = json.load(rr); break
            except Exception:
                if _t == 3: raise
                time.sleep(2)
        out += batch
        if len(batch) < step:
            return out
        off += step

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "OtherLeagues.xlsx")
OUT = os.path.join(ROOT, "public", "data", "valuations", "valuations.json")
SHEET = "Team Valuations"

def main():
    out = []
    for r in _sb("team_valuations", "year,team,league,value_m,source"):
        team = r["team"]
        val = r["value_m"]
        if team is None or val is None:
            continue
        out.append({
            "year": int(r["year"]) if r["year"] is not None else None,
            "team": str(team).strip(),
            "league": str(r["league"]).strip() if r["league"] is not None else "",
            "value_m": float(val),
            "source": str(r["source"]).strip() if r["source"] is not None else "",
        })
    out.sort(key=lambda x: x["value_m"], reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {"generated": datetime.datetime.now().isoformat(timespec="seconds"), "rows": out}
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)
    os.replace(tmp, OUT)
    print(f"wrote {len(out)} rows -> {os.path.relpath(OUT, ROOT)}")
    # quick league histogram
    from collections import Counter
    print("by league:", dict(Counter(x["league"] for x in out)))

if __name__ == "__main__":
    main()
