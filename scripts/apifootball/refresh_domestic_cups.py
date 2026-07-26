#!/usr/bin/env python3
"""Fetch domestic cup status (results + upcoming) into a committed bundle, and compute the set
of clubs still ALIVE in each cup so the league hubs can badge them across every tier.

Display-only, like the super cups: team names resolve to your canonical Lookup name via
football_team where the club is tracked (cups reach far down the pyramid, so many entrants are
not tracked and keep their api name). A club is "alive" while it has an unplayed cup fixture.

Writes public/data/football/live-cups-2026.json:
  cups       [{comp_id, country, name, season, fixtures[...]}]  (recent + upcoming window only)
  cup_alive  { team_id: ["FA Cup", "League Cup", ...] }         (clubs still in it, per cup)

Runs on the Mac mini (needs api-football + Supabase read). Commit with [vercel skip].
"""
import os, sys, json
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refresh import api_get, api_key, supa_get, supa_key

OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "data", "football"))
FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}
KEEP_FINISHED = 15   # most recent results per cup to keep for display
KEEP_UPCOMING = 25   # next fixtures per cup to keep for display

def main():
    reg = json.load(open(os.path.join(HERE, "domestic_cups.json"), encoding="utf-8"))
    akey = api_key()
    skey = supa_key()
    teams = {t["team_id"]: t for t in supa_get(
        "/rest/v1/football_team?select=team_id,canonical_name,lookup_name", skey)}

    def ref(t):
        tid = t.get("id")
        row = teams.get(tid) or {}
        return {"team_id": tid, "name": row.get("canonical_name") or t.get("name"),
                "lookup": row.get("lookup_name")}

    cups_out = []
    cup_alive = {}   # team_id -> set of cup names
    for c in reg:
        doc = api_get("/fixtures", akey, league=c["comp_id"], season=c["season"])
        allfx = []
        for f in (doc.get("response") or []):
            fixture = f.get("fixture") or {}
            tt = f.get("teams") or {}
            goals = f.get("goals") or {}
            h = tt.get("home") or {}
            a = tt.get("away") or {}
            status = (fixture.get("status") or {}).get("short")
            row = {"fixture_id": fixture.get("id"), "kickoff": fixture.get("date"),
                   "round": (f.get("league") or {}).get("round"),
                   "home": ref(h), "away": ref(a),
                   "home_goals": goals.get("home"), "away_goals": goals.get("away"), "status": status}
            allfx.append(row)
            if status not in FINISHED:
                for side in (h, a):
                    tid = side.get("id")
                    if tid is not None:
                        cup_alive.setdefault(tid, set()).add(c["name"])
        allfx.sort(key=lambda x: x.get("kickoff") or "")
        finished = [f for f in allfx if f["status"] in FINISHED]
        upcoming = [f for f in allfx if f["status"] not in FINISHED]
        keep = finished[-KEEP_FINISHED:] + upcoming[:KEEP_UPCOMING]
        cups_out.append({"comp_id": c["comp_id"], "country": c["country"], "name": c["name"],
                         "season": c["season"], "fixtures": keep})
        print("%s %s: %d fixtures (kept %d), alive-adds" % (c["country"], c["name"], len(allfx), len(keep)))

    ts = datetime.now(timezone.utc).isoformat()
    os.makedirs(OUT, exist_ok=True)
    json.dump({"generated_at": ts, "cups": cups_out,
               "cup_alive": {str(k): sorted(v) for k, v in cup_alive.items()}},
              open(os.path.join(OUT, "live-cups-2026.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("WROTE live-cups-2026.json (%d clubs alive across cups)" % len(cup_alive))

if __name__ == "__main__":
    main()
