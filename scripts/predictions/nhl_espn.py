#!/usr/bin/env python3
"""ESPN fetch half for the NHL sim: team ids and the real season schedule.

Split out of build_nhl_sim.py so the engine stays testable without a network
and this file owns every assumption about an API we do not control.

🔴 NO DATE RANGES ANYWHERE IN THIS FILE, AND THAT IS NOT A STYLE CHOICE.
Between 2026-09-15T15:53Z and 09-16T00:04Z ESPN began rejecting any hyphenated
`dates=A-B` query with HTTP 400, even for a single day, and it took the AFL,
NRL and MLB jobs down (repo commit e7c8ab06b). The per-team schedule endpoint
takes `season` and `seasontype` instead and was never affected. Use it. If you
find yourself reaching for a date range here, read that commit first.

🔴 NO USER-AGENT. Measured 2026-08-05 across four endpoints from three
vantages: a branded token 403s at the mac mini's Akamai edge while passing
from the Windows box, an empty string 403s everywhere, and sending none at all
(letting urllib supply its own) is the only shape that passed from every
vantage. Do not "fix" this by adding a browser UA. Full table in
build_mlb_sim.py fetch_json.
"""
from __future__ import annotations

import json
import time
import urllib.request

ESPN = "https://site.api.espn.com/apis"


def fetch_json(url, soft=False, retries=3):
    """ESPN rate-limits bursts with a 403 rather than a 429, and 32 team
    schedules in a row is a burst. Retry with backoff before giving up.

    Catch OSError, not urllib.error.URLError: a socket TimeoutError is an
    OSError but NOT a URLError, so a URLError-only except never retries a
    timeout. That exact mistake killed two pipeline runs in this repo.
    """
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (OSError, json.JSONDecodeError) as e:
            last = e
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
    if soft:
        print("soft-fetch miss: %s (%s)" % (url, last))
        return None
    raise SystemExit("required fetch failed after %d tries: %s (%s)"
                     % (retries, url, last))


def _num(v):
    """ESPN scores arrive as a string, a number, or {'value': n}."""
    if isinstance(v, dict):
        v = v.get("value", v.get("displayValue"))
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def espn_teams(expected, aliases):
    """{canonical: (espn_id, displayName)} for the current clubs.

    🔴 FAILS LOUDLY ON ANY UNMATCHED TEAM rather than returning a short map.
    A missing club does not look like an error downstream: the sim simply
    runs a 31-team league, every probability still sums correctly, and the
    output is wrong in a way no identity check catches. ESPN has renamed the
    Utah franchise twice in three seasons, so this WILL fire again.
    """
    d = fetch_json("%s/site/v2/sports/hockey/nhl/teams?limit=50" % ESPN)
    out, seen = {}, {}
    for grp in d.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = grp.get("team", {})
        raw = t.get("name")
        if not raw:
            continue
        canonical = aliases.get(raw, raw)
        seen[raw] = canonical
        out[canonical] = (t.get("id"), t.get("displayName"))

    missing = [t for t in expected if t not in out]
    extra = [raw for raw, c in seen.items() if c not in expected]
    if missing or extra:
        print("ESPN returned %d team(s); matched %d of %d expected."
              % (len(seen), len(out) - len(extra), len(expected)))
        if missing:
            print("  MISSING (expected, not found): %s" % sorted(missing))
        if extra:
            print("  UNMATCHED (found, not expected): %s" % sorted(extra))
            print("  If one of these is a rename, add it to ESPN_ALIASES in")
            print("  build_nhl_sim.py rather than dropping the club.")
        raise SystemExit("refusing to simulate an incomplete league")
    return out


def team_schedules(team_ids, season, divisions):
    """One pass over the per-team schedules gives BOTH the full regular season
    and every completed result, which is cheaper and far more reliable than
    paging the scoreboard a month at a time, and needs no date range.

    Competitors on THIS endpoint carry only id / displayName / location /
    shortDisplayName: there is no `name` field, unlike the teams and standings
    endpoints. Resolve through the id map rather than reading `team.name`,
    which is silently None here and would drop every game.

    -> {event_id: (iso_date, home, away, hg, ag, completed)}
    """
    id2team = {str(tid): t for t, (tid, _dn) in team_ids.items()}
    games = {}
    for t, (tid, _dn) in sorted(team_ids.items()):
        d = fetch_json("%s/site/v2/sports/hockey/nhl/teams/%s/schedule"
                       "?season=%d&seasontype=2" % (ESPN, tid, season), soft=True)
        for ev in (d or {}).get("events", []) or []:
            comp = (ev.get("competitions") or [{}])[0]
            done = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))
            home = away = None
            hg = ag = None
            for c in comp.get("competitors", []) or []:
                tm = c.get("team") or {}
                nm = id2team.get(str(tm.get("id")))
                sc = _num(c.get("score"))
                if c.get("homeAway") == "home":
                    home, hg = nm, sc
                else:
                    away, ag = nm, sc
            if home in divisions and away in divisions:
                games[ev["id"]] = (ev.get("date", "")[:10], home, away, hg, ag, done)
    return games


def check_schedule(games, teams, games_per_team=84):
    """Assert the schedule is the size a real season is.

    🔴 84 IS CORRECT FOR 2026-27, AND THIS CHECK WAS BRIEFLY WRITTEN THE WRONG
    WAY ROUND. ESPN returns 1,344 games, exactly 84 per club for all 32, and
    the first version of this function treated that as a feed bug against a
    remembered 82. It is not a bug: the CBA that began 2026-09-16 expanded the
    NHL regular season for the first time in 33 years, to 84 games, 42 home
    and 42 away, with both added games intra-division.

    The check is still worth having, pointed at the right number. A schedule
    that is short or uneven is exactly the failure that produces tidy,
    confident, wrong probabilities: every identity still sums correctly, no
    team is missing, and the only symptom is point totals a couple of games
    light. But the baseline has to come from the CBA, not from memory. If this
    fires again, check whether the league changed the number before assuming
    ESPN broke.
    """
    per = {}
    for _d, h, a, _hg, _ag, _done in games.values():
        per[h] = per.get(h, 0) + 1
        per[a] = per.get(a, 0) + 1
    missing = [t for t in teams if t not in per]
    odd = {t: n for t, n in per.items() if n != games_per_team}
    total_expected = games_per_team * len(teams) // 2
    ok = not missing and not odd and len(games) == total_expected
    if not ok:
        print("SCHEDULE CHECK FAILED")
        print("  games %d (expected %d)" % (len(games), total_expected))
        if missing:
            print("  teams with NO games: %s" % sorted(missing))
        if odd:
            lo, hi = min(odd.values()), max(odd.values())
            print("  %d team(s) not on %d games (range %d-%d): %s"
                  % (len(odd), games_per_team, lo, hi,
                     dict(sorted(odd.items())[:8])))
    return ok
