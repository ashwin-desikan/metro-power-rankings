#!/usr/bin/env python3
"""
feed_shape_monitor.py - shape-drift monitor for the Citizen of Nowhere data feeds.

WHY THIS EXISTS
  .github/workflows/external-url-monitor.yml already probes HTTP *status* on the
  ESPN and Substack URLs and files a GitHub Issue on non-2xx/3xx. It explicitly
  does NOT inspect response shape. This script fills that gap: it fetches each
  feed, parses JSON, and asserts that the structural keys our parsers depend on
  still exist. A feed that returns 200 with a renamed or restructured payload
  (ESPN has renamed teams mid-season and could rotate keys; SPAIA and Sportz are
  undocumented third-party endpoints) passes a status probe but silently breaks a
  page. That is what this catches. No overlap with the status monitor.

NOISE POSTURE
  A well-formed but empty payload (a league in its off-season) is a soft note,
  never an alert. Only a missing/renamed structural key, a parse failure, or a
  fetch failure raises an alert.

ALERTS
  On any hard failure it sends ONE consolidated push via notify.py. Healthy runs
  are silent. Every run appends a status line to $LOG_DIR/feed-monitor.log.
"""
import os
import sys
import json
import time
import datetime
import urllib.request

from notify import notify

BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")

LOG_DIR = os.environ.get("LOG_DIR", os.path.dirname(os.path.abspath(__file__)))


def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={
        "User-Agent": BROWSER_UA,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw.decode("utf-8", "replace"))


# --- structural validators -------------------------------------------------
# Each returns (state, detail) where state in {"ok", "empty", "FAIL"}.
# "empty" = well-formed container but no rows (off-season); not alerted.

def check_espn_standings(doc):
    if not isinstance(doc, dict) or "children" not in doc:
        return "FAIL", "missing top-level 'children'"
    children = doc.get("children")
    if not isinstance(children, list):
        return "FAIL", "'children' is not a list"
    if not children:
        return "empty", "no conferences/groups (off-season?)"
    grp = children[0]
    entries = (grp.get("standings") or {}).get("entries")
    if not isinstance(entries, list):
        return "FAIL", "missing children[0].standings.entries"
    if not entries:
        return "empty", "conference present but no entries"
    e0 = entries[0]
    if "team" not in e0 or not isinstance(e0.get("stats"), list) or not e0["stats"]:
        return "FAIL", "entry missing 'team' or non-empty 'stats'"
    return "ok", f"{len(children)} groups, {len(entries)} teams in first"


def check_espn_scoreboard(doc):
    if not isinstance(doc, dict) or "events" not in doc:
        return "FAIL", "missing top-level 'events'"
    events = doc.get("events")
    if not isinstance(events, list):
        return "FAIL", "'events' is not a list"
    if not events:
        return "empty", "no events scheduled (off-season / between rounds)"
    comps = (events[0].get("competitions") or [])
    if not comps:
        return "FAIL", "event missing 'competitions'"
    competitors = comps[0].get("competitors")
    if not isinstance(competitors, list) or len(competitors) < 2:
        return "FAIL", "competition missing 2 'competitors'"
    return "ok", f"{len(events)} events"


def check_espn_tennis_scoreboard(doc):
    # Tennis scoreboards differ from team-sport ones: an event is a whole
    # tournament, and the matches live under events[].groupings[].competitions
    # (see lib/tennisDraw.ts), NOT directly on the event. A tournament with no
    # draw posted yet / between events is a soft note, not a failure.
    if not isinstance(doc, dict) or "events" not in doc:
        return "FAIL", "missing top-level 'events'"
    events = doc.get("events")
    if not isinstance(events, list):
        return "FAIL", "'events' is not a list"
    if not events:
        return "empty", "no tournament in progress (between events)"
    ev = events[0]
    if "groupings" not in ev:
        return "FAIL", "tennis event missing 'groupings' (ESPN shape change?)"
    groupings = ev.get("groupings") or []
    if not groupings:
        return "empty", f"{ev.get('name','tournament')}: no groupings yet (draw not posted)"
    if "competitions" not in (groupings[0] or {}):
        return "FAIL", "tennis grouping missing 'competitions' (ESPN shape change?)"
    return "ok", f"{ev.get('name','?')}: {len(groupings)} groupings"


def check_spaia_npb(doc):
    if not isinstance(doc, list):
        return "FAIL", "expected a top-level JSON array"
    if not doc:
        return "empty", "empty array (off-season?)"
    row = doc[0]
    if not isinstance(row, dict) or "TeamCD" not in row:
        return "FAIL", "row missing 'TeamCD' key"
    return "ok", f"{len(doc)} rows"


def check_sportz_wtc(doc):
    if not isinstance(doc, dict):
        return "FAIL", "root is not an object"
    data = doc.get("data")
    if not isinstance(data, dict):
        return "FAIL", "missing 'data' object"
    standings = data.get("standings")
    if isinstance(standings, list):
        standings = standings[0] if standings else None
    if not isinstance(standings, dict):
        return "FAIL", "missing 'data.standings'"
    teams = (standings.get("teams") or {}).get("team")
    if not isinstance(teams, list):
        return "FAIL", "missing 'data.standings.teams.team' list"
    if not teams:
        return "empty", "no teams listed"
    t0 = teams[0]
    for k in ("team_name", "points", "matches_played"):
        if k not in t0:
            return "FAIL", f"team row missing '{k}'"
    return "ok", f"{len(teams)} teams"


# --- feed registry ---------------------------------------------------------
# (name, url, validator). URLs mirror the constants in lib/*.ts and
# scripts/parse-espn-wc2026.py as of this build.
FEEDS = [
    ("ESPN NFL standings",
     "https://site.api.espn.com/apis/v2/sports/football/nfl/standings",
     check_espn_standings),
    ("ESPN MLB standings",
     "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings",
     check_espn_standings),
    ("ESPN NBA standings",
     "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings",
     check_espn_standings),
    ("ESPN NHL standings",
     "https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings",
     check_espn_standings),
    ("ESPN EPL standings",
     "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings",
     check_espn_standings),
    ("ESPN MLS standings",
     "https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings",
     check_espn_standings),
    ("ESPN WC2026 standings",
     "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=2026",
     check_espn_standings),
    ("ESPN WC2026 scoreboard",
     "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
     check_espn_scoreboard),
    ("ESPN PGA scoreboard",
     "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
     check_espn_scoreboard),
    ("ESPN ATP scoreboard",
     "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
     check_espn_tennis_scoreboard),
    ("ESPN AFL standings",
     "https://site.api.espn.com/apis/v2/sports/australian-football/afl/standings",
     check_espn_standings),
    ("ESPN NRL standings",
     "https://site.api.espn.com/apis/v2/sports/rugby-league/3/standings",
     check_espn_standings),
    ("SPAIA NPB (Central)",
     "https://spaia.jp/baseball/npb/api/official_stats_history?GameAssortment=1&Year="
     + str(datetime.date.today().year),
     check_spaia_npb),
    ("Sportz ICC WTC standings",
     "https://assets-icc.sportz.io/cricket/v1/championship_standing?championship_id=8"
     "&client_id=tPZJbRgIub3Vua93%2FDWtyQ%3D%3D&feed_format=json&lang=en",
     check_sportz_wtc),
]


def main():
    results = []
    failures = []
    for name, url, validator in FEEDS:
        try:
            doc = fetch_json(url)
        except Exception as e:
            state, detail = "FAIL", f"fetch/parse error: {e}"
        else:
            try:
                state, detail = validator(doc)
            except Exception as e:
                state, detail = "FAIL", f"validator error: {e}"
        results.append((state, name, detail))
        if state == "FAIL":
            failures.append(f"- {name}: {detail}")
        time.sleep(0.4)  # be polite to the feeds

    ts = datetime.datetime.now().isoformat(timespec="seconds")
    summary = " | ".join(f"{s}:{n}" for s, n, _ in results)
    line = f"{ts}  {'FAIL' if failures else 'ok'}  {summary}"
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "feed-monitor.log"), "a") as f:
            f.write(line + "\n")
    except Exception as e:
        print(f"log write failed: {e}", file=sys.stderr)

    print(line)
    for s, n, d in results:
        print(f"  {s:5}  {n}: {d}")

    if failures:
        body = (f"{len(failures)} feed(s) changed shape or failed:\n"
                + "\n".join(failures)
                + "\n\nParsers reading these will fail soft (section hides). "
                  "Check lib/*.ts against the upstream payload.")
        notify("CoN feed-shape drift", body, priority=1)
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
