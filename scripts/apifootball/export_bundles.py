#!/usr/bin/env python3
"""Export Supabase football_* tables into committed JSON bundles the frontend reads via ISR.

Runs on the Mac mini right after refresh.py (needs Supabase read). Writes two files under
public/data/football/ that the site reads from GitHub raw (ISR) -- so a data refresh needs NO
Vercel build; commit them with [vercel skip].

  live-standings-2026.json    every tracked DOMESTIC league table (grouped by league + group)
  live-competitions-2026.json the 5 continental comps: group tables + fixtures/knockout

Team names are pre-resolved to your canonical Lookup name via football_team, so the frontend
just maps name -> crest/slug with its existing lib/football helper.
"""
import os, sys, json
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refresh import supa_get, supa_key, CONTINENTAL, INTERNATIONAL

OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "data", "football"))

# Non-UEFA confederations for the tracked domestic leagues; every other tracked
# country is UEFA (the site tracks no other European-adjacent edge cases).
CONF_OVERRIDE = {
    "Brazil": "CONMEBOL", "Argentina": "CONMEBOL", "Uruguay": "CONMEBOL",
    "United States": "CONCACAF", "Mexico": "CONCACAF",
    "Japan": "AFC", "South Korea": "AFC", "China": "AFC", "Saudi Arabia": "AFC",
    "Qatar": "AFC", "United Arab Emirates": "AFC", "Australia": "AFC", "Iran": "AFC", "India": "AFC",
    "Egypt": "CAF", "South Africa": "CAF",
}
def confed(country):
    return CONF_OVERRIDE.get(country or "", "UEFA")

def tref(teams, tid):
    t = teams.get(tid) or {}
    return {"team_id": tid, "name": t.get("canonical_name"), "lookup": t.get("lookup_name"),
            "country": t.get("country")}

def srow(s, teams):
    return {"rank": s.get("rank"), **tref(teams, s.get("team_id")),
            "played": s.get("played"), "win": s.get("win"), "draw": s.get("draw"), "lose": s.get("lose"),
            "gf": s.get("goals_for"), "ga": s.get("goals_against"), "gd": s.get("goal_diff"),
            "points": s.get("points"), "form": s.get("form")}

def main():
    key = supa_key()
    leagues = supa_get("/rest/v1/football_league?select=league_id,name,country,level,comp_type", key)
    lmeta = {l["league_id"]: l for l in leagues}
    teams = {t["team_id"]: t for t in supa_get(
        "/rest/v1/football_team?select=team_id,canonical_name,lookup_name,country", key)}
    standings = supa_get("/rest/v1/football_standings?select=*&order=league_id,group_label,rank", key)
    fixtures = supa_get("/rest/v1/football_fixtures?select=*&order=league_id,kickoff", key)

    # Three buckets: domestic league tables, continental CLUB comps, and
    # INTERNATIONAL (national-team) comps — UEFA Nations League — which ship
    # in their own key so the frontend can build an International Football
    # section without club assumptions.
    dom, comps, intl = {}, {}, {}
    def bucket_for(lid):
        if lid in CONTINENTAL: return comps
        if lid in INTERNATIONAL: return intl
        return dom
    for s in standings:
        lid = s["league_id"]
        L = bucket_for(lid).setdefault(lid, {"groups": {}, "fixtures": []})
        L["groups"].setdefault(s.get("group_label") or "", []).append(srow(s, teams))
    for f in fixtures:
        lid = f["league_id"]
        if lid not in CONTINENTAL and lid not in INTERNATIONAL: continue
        bucket_for(lid).setdefault(lid, {"groups": {}, "fixtures": []})["fixtures"].append({
            "fixture_id": f.get("fixture_id"), "round": f.get("round"), "kickoff": f.get("kickoff"),
            "home": tref(teams, f.get("home_team_id")), "away": tref(teams, f.get("away_team_id")),
            "home_goals": f.get("home_goals"), "away_goals": f.get("away_goals"), "status": f.get("status")})

    def pack(bucket, include_fixtures):
        out = []
        for lid, L in bucket.items():
            m = lmeta.get(lid, {})
            entry = {"league_id": lid, "name": m.get("name"), "country": m.get("country"),
                     "level": m.get("level"), "confederation": confed(m.get("country")),
                     "groups": [{"group_label": gl, "rows": rows} for gl, rows in L["groups"].items()]}
            if include_fixtures: entry["fixtures"] = L["fixtures"]
            out.append(entry)
        return out

    league_list = pack(dom, False)
    league_list.sort(key=lambda x: (x.get("country") or "", x.get("level") or 99, x.get("name") or ""))
    # Backstop: a watched league should always have metadata (refresh.py syncs football_league
    # from leagues.json). If one still lacks country/name, DROP it rather than ship a blank
    # dash-group to the page, and log loudly so the mini surfaces it.
    blank = [e for e in league_list if not (e.get("country") or "").strip() or not (e.get("name") or "").strip()]
    if blank:
        print("=" * 64)
        print("METADATA GAP: %d league(s) have standings but blank country/name -- DROPPED from bundle." % len(blank))
        print("Repair their football_league row (refresh.py --write now syncs it from leagues.json):")
        for e in blank: print("  league_id %s country=%r name=%r" % (e.get("league_id"), e.get("country"), e.get("name")))
        print("=" * 64)
        league_list = [e for e in league_list if e not in blank]
    comp_list = pack(comps, True)
    intl_list = pack(intl, True)

    # Europe participation: a club is "alive" in a comp while it still has an unplayed
    # fixture. Once eliminated, its remaining fixtures are all finished, so it drops out.
    # Badge each alive team with its best competition (UCL > UEL > UECL > Libertadores).
    FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}
    EURO_BADGE = {2: "UCL", 3: "UEL", 848: "UECL", 13: "LIB"}
    PRIO = {"UCL": 0, "UEL": 1, "UECL": 2, "LIB": 3}
    europe_badges = {}
    for lid, C in comps.items():
        badge = EURO_BADGE.get(lid)
        if not badge:
            continue
        for f in C["fixtures"]:
            if f.get("status") in FINISHED:
                continue
            for side in (f.get("home") or {}, f.get("away") or {}):
                tid = side.get("team_id")
                if tid is None:
                    continue
                cur = europe_badges.get(tid)
                if cur is None or PRIO[badge] < PRIO[cur]:
                    europe_badges[tid] = badge

    ts = datetime.now(timezone.utc).isoformat()
    os.makedirs(OUT, exist_ok=True)
    json.dump({"generated_at": ts, "leagues": league_list},
              open(os.path.join(OUT, "live-standings-2026.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({"generated_at": ts, "competitions": comp_list, "international": intl_list,
               "europe_badges": europe_badges},
              open(os.path.join(OUT, "live-competitions-2026.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("wrote %d domestic leagues (%d standings rows), %d competitions + %d international (%d fixtures)" % (
        len(league_list), len(standings), len(comp_list), len(intl_list), len(fixtures)))

if __name__ == "__main__":
    main()
