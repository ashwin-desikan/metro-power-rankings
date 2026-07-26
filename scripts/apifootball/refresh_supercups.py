#!/usr/bin/env python3
"""Fetch Super Cup results (domestic / European / international) into a committed bundle.

These are one-off finals, shown for their RESULT only, so they run outside the invariant-
enforcing refresh.py: team names are resolved to your canonical Lookup name via football_team
where the club is tracked, and fall back to the api name otherwise (e.g. an OFC entrant in the
FIFA Intercontinental Cup). Writes public/data/football/live-supercups-2026.json for the site
to read via ISR; commit with [vercel skip].

Runs on the Mac mini (needs api-football + Supabase read).
"""
import os, sys, json
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refresh import api_get, api_key, supa_get, supa_key

OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "data", "football"))

def main():
    reg = json.load(open(os.path.join(HERE, "super_cups.json"), encoding="utf-8"))
    akey = api_key()
    skey = supa_key()
    teams = {t["team_id"]: t for t in supa_get(
        "/rest/v1/football_team?select=team_id,canonical_name,lookup_name", skey)}

    def ref(t):
        tid = t.get("id")
        row = teams.get(tid) or {}
        return {"team_id": tid, "name": row.get("canonical_name") or t.get("name"),
                "lookup": row.get("lookup_name")}

    out = []
    for c in reg:
        doc = api_get("/fixtures", akey, league=c["comp_id"], season=c["season"])
        fx = []
        for f in (doc.get("response") or []):
            fixture = f.get("fixture") or {}
            tt = f.get("teams") or {}
            goals = f.get("goals") or {}
            h = tt.get("home") or {}
            a = tt.get("away") or {}
            fx.append({
                "fixture_id": fixture.get("id"), "kickoff": fixture.get("date"),
                "round": (f.get("league") or {}).get("round"),
                "home": ref(h), "away": ref(a),
                "home_goals": goals.get("home"), "away_goals": goals.get("away"),
                "status": ((fixture.get("status") or {}).get("short")),
                "winner": ("home" if h.get("winner") else "away" if a.get("winner") else None),
            })
        fx.sort(key=lambda x: x.get("kickoff") or "")
        out.append({"comp_id": c["comp_id"], "country": c["country"], "name": c["name"],
                    "category": c["category"], "season": c["season"], "fixtures": fx})
        print("%s %s: %d fixture(s)" % (c["country"], c["name"], len(fx)))

    ts = datetime.now(timezone.utc).isoformat()
    os.makedirs(OUT, exist_ok=True)
    json.dump({"generated_at": ts, "super_cups": out},
              open(os.path.join(OUT, "live-supercups-2026.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("WROTE live-supercups-2026.json")

if __name__ == "__main__":
    main()
