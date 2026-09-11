#!/usr/bin/env python3
"""League fixtures and results, a week either side of today, into a committed bundle.

WHY. The Today box on Live Standings (On today, Recent results, Coming up) reads
kick-off instants and scores, and the standings bundles for the domestic leagues
carry tables only; the Premier League got in through its predictions ledger and
the cups through live-cups-2026.json, but La Liga, the Bundesliga, Serie A,
Ligue 1, MLS, the WSL and NWSL had no fixture source on the site at all (HANDOFF
2026-09-11 section M). Ashwin, 2026-09-11: "build out the builder ... We can pull
it directly from the Football API itself to find the recent results and the
upcoming fixtures."

WHAT. One api-football call per league in league_fixtures.json, /fixtures with
league, season, from and to (today minus WINDOW_BACK days to today plus
WINDOW_AHEAD), so the bundle is small and the quota cost is seven requests a
run. Team names resolve to the canonical Lookup name through football_team where
the club is tracked (the same soft resolution the cups use) and keep the api name
otherwise. Display only: nothing is written to Supabase.

SEASONS. api-football keys a cross-year league by its starting year (2026 is
2026-27); MLS and NWSL are calendar-year. A league whose current season the api
has not opened yet (the WSL sat on 2025-26 into September 2026, see
refresh_women.py) gets a second call on `fallback_season` when the first returns
nothing in the window, so the box never goes dark on a registry that is a week
behind the api.

Writes public/data/football/live-fixtures-2026.json:
  generated_at, window {from, to}
  leagues [{league_id, country, name, comp_slug, women, season, fixtures[...]}]
    fixtures: {fixture_id, kickoff, round, home{team_id,name,lookup},
               away{...}, home_goals, away_goals, status}

Runs on the Mac mini inside run-football-standings.sh (needs APISPORTS_KEY and a
Supabase read key). Committed with [vercel skip]: lib/clubFootballLive.ts reads
it from GitHub raw with ISR, so no production build.

  python refresh_league_fixtures.py --self-test
  python refresh_league_fixtures.py --write
"""
import os, sys, json, time, argparse
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "data", "football"))
OUT_FILE = "live-fixtures-2026.json"
WINDOW_BACK = 7     # days of results kept; the box shows three, the margin covers a missed run
WINDOW_AHEAD = 7    # days of fixtures ahead; the box shows today plus three
FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}


def window(today=None):
    today = today or datetime.now(timezone.utc).date()
    return (today - timedelta(days=WINDOW_BACK)).isoformat(), (today + timedelta(days=WINDOW_AHEAD)).isoformat()


def shape(doc, ref):
    """The bundle rows from one /fixtures response, kick-off order."""
    out = []
    for f in (doc.get("response") or []):
        fixture = f.get("fixture") or {}
        tt = f.get("teams") or {}
        goals = f.get("goals") or {}
        out.append({
            "fixture_id": fixture.get("id"), "kickoff": fixture.get("date"),
            "round": (f.get("league") or {}).get("round"),
            "home": ref(tt.get("home") or {}), "away": ref(tt.get("away") or {}),
            "home_goals": goals.get("home"), "away_goals": goals.get("away"),
            "status": (fixture.get("status") or {}).get("short"),
        })
    out.sort(key=lambda x: x.get("kickoff") or "")
    return out


def self_test():
    doc = {"response": [
        {"fixture": {"id": 2, "date": "2026-09-13T15:00:00+00:00", "status": {"short": "NS"}},
         "league": {"round": "Regular Season - 4"},
         "teams": {"home": {"id": 529, "name": "Barcelona"}, "away": {"id": 541, "name": "Real Madrid"}},
         "goals": {"home": None, "away": None}},
        {"fixture": {"id": 1, "date": "2026-09-11T19:00:00+00:00", "status": {"short": "FT"}},
         "league": {"round": "Regular Season - 4"},
         "teams": {"home": {"id": 530, "name": "Atletico Madrid"}, "away": {"id": 532, "name": "Valencia"}},
         "goals": {"home": 2, "away": 0}},
    ]}
    rows = shape(doc, lambda t: {"team_id": t.get("id"), "name": t.get("name"), "lookup": None})
    assert [r["fixture_id"] for r in rows] == [1, 2], rows          # kick-off order, not response order
    assert rows[0]["status"] == "FT" and rows[0]["home_goals"] == 2
    assert rows[1]["home"]["name"] == "Barcelona" and rows[1]["home_goals"] is None
    a, b = window(datetime(2026, 9, 11).date())
    assert (a, b) == ("2026-09-04", "2026-09-18"), (a, b)
    reg = json.load(open(os.path.join(HERE, "league_fixtures.json"), encoding="utf-8"))
    assert len({r["league_id"] for r in reg}) == len(reg) == 7
    assert all({"league_id", "country", "name", "comp_slug", "women", "season"} <= set(r) for r in reg)
    print("refresh_league_fixtures self-test OK")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true", help="write the bundle (default: fetch and report only)")
    a = ap.parse_args(argv)
    if a.self_test:
        self_test()
        return 0
    from refresh import api_get, api_key, supa_get, supa_key
    reg = json.load(open(os.path.join(HERE, "league_fixtures.json"), encoding="utf-8"))
    akey = api_key()
    teams = {}
    try:
        skey = supa_key()
        teams = {t["team_id"]: t for t in supa_get("/rest/v1/football_team?select=team_id,canonical_name,lookup_name", skey)}
    except SystemExit:
        print("no Supabase key: api team names kept as served", file=sys.stderr)

    def ref(t):
        tid = t.get("id")
        row = teams.get(tid) or {}
        return {"team_id": tid, "name": row.get("canonical_name") or t.get("name"), "lookup": row.get("lookup_name")}

    frm, to = window()
    leagues_out = []
    for lg in reg:
        rows, season = [], lg["season"]
        for s in [lg["season"]] + ([lg["fallback_season"]] if lg.get("fallback_season") else []):
            doc = api_get("/fixtures", akey, **{"league": lg["league_id"], "season": s, "from": frm, "to": to})
            time.sleep(0.4)   # under api-football's per-minute rate limit
            if doc.get("_error"):
                print("%s: api error %s" % (lg["name"], doc["_error"]), file=sys.stderr)
                break
            rows = shape(doc, ref)
            season = s
            if rows:
                break
        fin = sum(1 for r in rows if r["status"] in FINISHED)
        print("%s (%d, season %d): %d fixtures in %s..%s, %d finished" % (lg["name"], lg["league_id"], season, len(rows), frm, to, fin))
        leagues_out.append({"league_id": lg["league_id"], "country": lg["country"], "name": lg["name"],
                            "comp_slug": lg["comp_slug"], "women": bool(lg.get("women")), "season": season,
                            "fixtures": rows})
    if not a.write:
        print("dry run; nothing written")
        return 0
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, OUT_FILE), "w", encoding="utf-8") as fh:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "window": {"from": frm, "to": to},
                   "leagues": leagues_out}, fh, ensure_ascii=False)
    print("WROTE %s (%d leagues)" % (OUT_FILE, len(leagues_out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
