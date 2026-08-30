#!/usr/bin/env python3
"""Daily api-football -> committed JSON bundle for the women's 2026-27 hub.

Runs on the Mac mini (needs network + APISPORTS_KEY), right alongside the men's
refresh. Unlike the men's pipeline this is BUNDLE-DIRECT: it does not touch
Supabase or the Lookup canonicaliser. It pulls standings (and, for the UWCL,
fixtures) for the women's competitions in wleagues.json and writes:

  public/data/football/wlive-2026.json

which lib/wLive.ts reads via ISR from GitHub raw. Team names are written raw
from api-football; the frontend resolves name -> women's club slug at render time
with lib/wfootball's getWClubByName (the same fuzzy matcher the ESPN NWSL table
used). Commit the bundle with [vercel skip] (ISR-read, no Vercel build needed).

Modes:
  python refresh_women.py --self-test   offline logic tests, no network
  python refresh_women.py               DRY RUN: fetch + report, NO file write
  python refresh_women.py --write       fetch + overwrite wlive-2026.json

WSL auto-watch: the WSL entry carries season 2025 (2025-26, last season) as a
placeholder plus watch_season 2026. Each run first probes the watch season; the
moment api-football publishes a non-empty 2026-27 table the bundle swaps to it and
clears the placeholder flag automatically. No code change needed at kickoff.
"""
import os, sys, json, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from refresh import api_get, api_key, parse_standings, parse_fixtures  # reuse the men's parsers

OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "data", "football"))
BUNDLE = os.path.join(OUT, "wlive-2026.json")


def log(m):
    print("[wfootball] " + m, flush=True)


def looks_fresh(groups):
    """True when a standings table plausibly belongs to a season in progress
    (or just drawn) rather than a completed one carried over.

    Guard born 2026-08-30: the day Liga F 2026-27 kicked off, api-football's
    /standings?season=2026 served the COMPLETED 2025-26 table (every club at
    30 of 30 games, Barcelona 84pts) under the new season id. A rows-exist
    check would happily present last season's final table under a fresh
    label. A genuinely current table always has someone short of the full
    double round-robin; a carried-over final table has nobody."""
    rows = [r for g in groups for r in g.get("rows", [])]
    if not rows:
        return False
    n = len(rows)
    full = 2 * (n - 1) if n > 1 else 1
    return any((r.get("played") or 0) < full for r in rows)


def pick_effective(entry, watch_has_rows, base_has_rows):
    """Decide which season a league entry should show.

    Returns (season, season_label, placeholder). If the entry defines a
    watch_season and that season already has a published table, prefer it and
    clear the placeholder. Otherwise fall back to the base season, marked as a
    placeholder when the entry says so. base_has_rows is advisory only (kept so
    callers can log an all-empty league) and does not change the decision."""
    if entry.get("watch_season") is not None and watch_has_rows:
        return entry["watch_season"], entry.get("watch_season_label", str(entry["watch_season"])), False
    return entry["season"], entry.get("season_label", str(entry["season"])), bool(entry.get("placeholder", False))


def group_rows(rows, teams):
    """parse_standings rows (+ id->name map) -> bundle groups[] with raw names."""
    groups = {}
    for r in rows:
        gl = r.get("group_label") or ""
        groups.setdefault(gl, []).append({
            "rank": r.get("rank"), "name": teams.get(r.get("team_id")),
            "played": r.get("played"), "win": r.get("win"), "draw": r.get("draw"), "lose": r.get("lose"),
            "gf": r.get("goals_for"), "ga": r.get("goals_against"), "gd": r.get("goal_diff"),
            "points": r.get("points"), "form": r.get("form"),
        })
    return [{"group_label": gl, "rows": rs} for gl, rs in groups.items()]


def fixture_rows(rows, teams):
    """parse_fixtures rows (+ id->name map) -> bundle fixtures[] with raw names."""
    out = []
    for f in rows:
        out.append({
            "fixture_id": f.get("fixture_id"), "round": f.get("round"), "kickoff": f.get("kickoff"),
            "home": {"name": teams.get(f.get("home_team_id"))},
            "away": {"name": teams.get(f.get("away_team_id"))},
            "home_goals": f.get("home_goals"), "away_goals": f.get("away_goals"), "status": f.get("status"),
        })
    return out


def fetch_standings(entry, akey):
    """Pull standings for an entry, honouring its watch season. Returns
    (season, season_label, placeholder, groups)."""
    lid = entry["league_id"]
    watch_groups, watch_has = [], False
    if entry.get("watch_season") is not None:
        doc = api_get("/standings", akey, league=lid, season=entry["watch_season"])
        if not (doc.get("_error") or doc.get("errors")):
            rows, teams = parse_standings(doc, lid, entry["watch_season"])
            watch_groups = group_rows(rows, teams)
            # rows alone are not enough: a carried-over final table under the
            # new season id must NOT trigger the swap (see looks_fresh)
            watch_has = any(g["rows"] for g in watch_groups) and looks_fresh(watch_groups)
        time.sleep(0.2)
    if watch_has:
        season, label, placeholder = pick_effective(entry, True, True)
        return season, label, placeholder, watch_groups
    # base season
    doc = api_get("/standings", akey, league=lid, season=entry["season"])
    base_groups = []
    if not (doc.get("_error") or doc.get("errors")):
        rows, teams = parse_standings(doc, lid, entry["season"])
        base_groups = group_rows(rows, teams)
    time.sleep(0.2)
    base_has = any(g["rows"] for g in base_groups)
    season, label, placeholder = pick_effective(entry, False, base_has)
    return season, label, placeholder, base_groups


def build(write):
    entries = json.load(open(os.path.join(HERE, "wleagues.json"), encoding="utf-8"))
    akey = api_key()
    leagues, competitions = [], []
    log(f"refresh start ({len(entries)} women's competitions, write={write})")
    for e in entries:
        lid = e["league_id"]
        season, label, placeholder, groups = fetch_standings(e, akey)
        n = sum(len(g["rows"]) for g in groups)
        if e.get("continental"):
            fdoc = api_get("/fixtures", akey, league=lid, season=season)
            fixtures = []
            if not (fdoc.get("_error") or fdoc.get("errors")):
                frows, fteams = parse_fixtures(fdoc, lid, season)
                fixtures = fixture_rows(frows, fteams)
            time.sleep(0.2)
            competitions.append({
                "league_id": lid, "comp_slug": e["comp_slug"], "name": e["name"],
                "country": e.get("country"), "season": season, "season_label": label,
                "source": "api-football", "groups": groups, "fixtures": fixtures,
            })
            log(f"  {e['name']} (id {lid}): {n} standings rows, {len(fixtures)} fixtures [{label}]")
        else:
            leagues.append({
                "league_id": lid, "hub_slug": e.get("hub_slug"), "comp_slug": e.get("comp_slug"),
                "name": e["name"], "country": e.get("country"), "kind": e.get("kind", "league"),
                "season": season, "season_label": label, "placeholder": placeholder,
                "source": "api-football", "groups": groups,
            })
            tag = " PLACEHOLDER" if placeholder else ""
            log(f"  {e['name']} (id {lid}): {n} standings rows [{label}]{tag}")

    bundle = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "season": "2026-27",
        "leagues": leagues,
        "competitions": competitions,
    }
    if not write:
        log("DRY RUN — no file written. Pass --write to overwrite the bundle.")
        return
    os.makedirs(OUT, exist_ok=True)
    json.dump(bundle, open(BUNDLE, "w", encoding="utf-8"), ensure_ascii=False)
    log(f"WROTE {BUNDLE}: {len(leagues)} leagues, {len(competitions)} competitions")


def selftest():
    # season-selection / WSL auto-watch
    wsl = {"season": 2025, "season_label": "2025-26", "placeholder": True,
           "watch_season": 2026, "watch_season_label": "2026-27"}
    assert pick_effective(wsl, watch_has_rows=False, base_has_rows=True) == (2025, "2025-26", True)
    assert pick_effective(wsl, watch_has_rows=True, base_has_rows=True) == (2026, "2026-27", False)
    ligaf = {"season": 2025, "season_label": "2025-26", "placeholder": True,
             "watch_season": 2026, "watch_season_label": "2026-27"}
    assert pick_effective(ligaf, False, True) == (2025, "2025-26", True)
    assert pick_effective(ligaf, True, True) == (2026, "2026-27", False)
    nwsl = {"season": 2026, "season_label": "2026"}
    assert pick_effective(nwsl, False, True) == (2026, "2026", False)
    assert pick_effective(nwsl, True, False) == (2026, "2026", False)  # no watch_season -> base

    # looks_fresh: the carried-over-final-table guard (Liga F, 2026-08-30)
    stale = [{"group_label": "", "rows": [{"played": 30}] * 16}]       # 16 clubs, 30/30 games
    fresh0 = [{"group_label": "", "rows": [{"played": 0}] * 12}]        # drawn, unplayed
    mid = [{"group_label": "", "rows": [{"played": 30}] * 15 + [{"played": 2}]}]
    assert not looks_fresh(stale), "completed table must not read as fresh"
    assert looks_fresh(fresh0), "a zeros table is a fresh season"
    assert looks_fresh(mid), "any club short of the full schedule = in progress"
    assert not looks_fresh([]), "no rows is not fresh"

    # standings grouping + raw-name mapping (reusing the men's parser)
    sdoc = {"response": [{"league": {"standings": [[
        {"rank": 1, "team": {"id": 9, "name": "Barcelona"}, "points": 9, "goalsDiff": 7,
         "form": "WWW", "all": {"played": 3, "win": 3, "draw": 0, "lose": 0, "goals": {"for": 10, "against": 3}}},
        {"rank": 2, "team": {"id": 10, "name": "Real Madrid"}, "points": 6, "goalsDiff": 2,
         "form": "WWL", "all": {"played": 3, "win": 2, "draw": 0, "lose": 1, "goals": {"for": 5, "against": 3}}}]]}}]}
    rows, teams = parse_standings(sdoc, 142, 2026)
    groups = group_rows(rows, teams)
    assert len(groups) == 1 and len(groups[0]["rows"]) == 2, groups
    g0 = groups[0]["rows"][0]
    assert g0["name"] == "Barcelona" and g0["gf"] == 10 and g0["ga"] == 3 and g0["gd"] == 7 and g0["points"] == 9, g0

    # fixtures mapping (UWCL)
    fdoc = {"response": [{"fixture": {"id": 501, "date": "2026-07-24T18:00:00+00:00", "status": {"short": "FT"}},
        "league": {"round": "Group A - 1"}, "teams": {"home": {"id": 9, "name": "Barcelona"}, "away": {"id": 11, "name": "Lyon"}},
        "goals": {"home": 2, "away": 1}}]}
    frows, fteams = parse_fixtures(fdoc, 525, 2026)
    fx = fixture_rows(frows, fteams)
    assert len(fx) == 1 and fx[0]["home"]["name"] == "Barcelona" and fx[0]["away"]["name"] == "Lyon", fx
    assert fx[0]["home_goals"] == 2 and fx[0]["status"] == "FT", fx
    print("self-test OK")


def main():
    if "--self-test" in sys.argv:
        return selftest()
    build("--write" in sys.argv)


if __name__ == "__main__":
    main()
