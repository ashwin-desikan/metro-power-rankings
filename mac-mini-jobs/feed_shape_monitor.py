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
import re
import sys
import json
import time
import datetime
import urllib.request

from notify import notify

# The User-Agent is load-bearing, so we deliberately send NONE and let urllib
# supply its own library token ("Python-urllib/x.y"). site.api.espn.com sits
# behind Akamai, whose bot policy is per-PoP (not global): from the mini's edge
# it hard-403s browser-spoof UAs, an empty UA, AND branded/custom tokens like
# "CitizenOfNowhere/1.0" or "feed-shape-monitor/1.0", while a plain library
# token gets 200. (From the Windows box the same browser/branded UAs pass — the
# rule is environment-dependent.) Two things hold from every vantage: an empty
# UA always 403s, and urllib's own token always 200s where the IP isn't blocked.
# So: do NOT add a browser or branded User-Agent header here — it reinstates the
# 403 across all 12 ESPN feeds from this box. The 3 prediction sim scripts drop
# the header for the same reason. Full truth table: 2026-08-05 HANDOFF entries.

LOG_DIR = os.environ.get("LOG_DIR", os.path.dirname(os.path.abspath(__file__)))


def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw.decode("utf-8", "replace"))


def fetch_text(url, headers=None, timeout=15):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    return raw.decode("utf-8", "replace")


# Substack's Cloudflare has the OPPOSITE problem from ESPN: it specifically
# blocks urllib's own default token ("Python-urllib/x.y") with a 403, while a
# curl-like token, python-requests's default, an empty string, and even a
# branded token all pass clean. Measured live from the mini 2026-08-05. So
# Substack needs *some* explicit User-Agent, just not the bare urllib default
# — it does not need a browser UA the way GitHub Actions runners once did
# (that block was the runner IP range itself, not the UA; see HANDOFF #9).
# This is a per-host override, not a change to the no-UA default above, which
# stays correct for ESPN.
SUBSTACK_UA = "CitizenOfNowhereBot/1.0 (+https://rankings.citizenofnowhere.org)"


def fetch_substack(url, timeout=15):
    return fetch_text(url, timeout=timeout, headers={
        "Accept": "application/rss+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
        "User-Agent": SUBSTACK_UA,
    })


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
        # Some ESPN standings feeds (confirmed: AFL) ship the ladder flat at
        # the top level with no conference grouping, rather than nested under
        # children[0] -- children=[] there is a real, permanent response
        # shape, not an off-season/empty state. Without this fallback the
        # check reports "empty" on every single run forever (confirmed: 66/66
        # since 2026-07-01) and can never distinguish a genuinely broken feed
        # from a healthy flat one.
        entries = (doc.get("standings") or {}).get("entries")
        if isinstance(entries, list) and entries:
            e0 = entries[0]
            if "team" in e0 and isinstance(e0.get("stats"), list) and e0["stats"]:
                return "ok", f"flat standings, {len(entries)} teams"
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


def check_espn_golf_scoreboard(doc):
    # Golf scoreboards are a FIELD, not a two-sided fixture, so the team-sport
    # checker's "competition needs 2 competitors" is simply the wrong shape:
    # a tournament that has not started has no field posted at all. On
    # 2026-09-02 this hard-failed on the Biltmore Championship, which was two
    # weeks out (state "pre", no `competitors` key), and would have failed in
    # every gap between tournaments. Same class as the ATP false positive.
    #
    # Mirrors what lib/golfLeaderboard.ts actually consumes: it branches on
    # status.type.state (pre | in | post) and coerces a missing competitors to
    # an empty array, so a field is only REQUIRED once play is under way.
    if not isinstance(doc, dict) or "events" not in doc:
        return "FAIL", "missing top-level 'events'"
    events = doc.get("events")
    if not isinstance(events, list):
        return "FAIL", "'events' is not a list"
    if not events:
        return "empty", "no tournament scheduled (off-season)"
    ev = events[0]
    comps = ev.get("competitions") or []
    if not comps:
        return "FAIL", "golf event missing 'competitions' (ESPN shape change?)"
    comp = comps[0] or {}
    state = (((comp.get("status") or {}).get("type") or {}).get("state"))
    if not state:
        return "FAIL", "golf competition missing status.type.state (ESPN shape change?)"
    field = comp.get("competitors")
    if state == "pre":
        return "empty", f"{ev.get('name','tournament')}: not started ({len(field or [])} in field)"
    if not isinstance(field, list) or not field:
        return "FAIL", f"{ev.get('name','tournament')} is {state} but has no field"
    if "athlete" not in (field[0] or {}):
        return "FAIL", "golf competitor missing 'athlete' (ESPN shape change?)"
    return "ok", f"{ev.get('name','?')}: {len(field)} in field ({state})"


def check_spaia_npb(doc):
    if not isinstance(doc, list):
        return "FAIL", "expected a top-level JSON array"
    if not doc:
        return "empty", "empty array (off-season?)"
    row = doc[0]
    if not isinstance(row, dict) or "TeamCD" not in row:
        return "FAIL", "row missing 'TeamCD' key"
    return "ok", f"{len(doc)} rows"


def check_substack_feed(text):
    # Mirrors what scripts/refresh-substack-feed.mjs and lib/substack.ts
    # actually parse: <item> blocks with <title>/<link>/<pubDate>. A blog
    # with zero items is not a legitimate off-season, unlike the sports
    # feeds below, so this is a FAIL, not "empty" (refresh-substack-feed.mjs
    # treats 0 posts as a hard failure too, exit 2, "refusing to overwrite").
    if "<rss" not in text[:500]:
        return "FAIL", "response is not RSS (missing '<rss' near the top)"
    items = re.findall(r"<item\b[\s\S]*?</item>", text)
    if not items:
        return "FAIL", "no <item> elements (feed parser will render nothing)"
    first = items[0]
    for tag in ("title", "link", "pubDate"):
        if f"<{tag}" not in first:
            return "FAIL", f"first <item> missing <{tag}> (parser reads this key)"
    return "ok", f"{len(items)} items"


def check_substack_archive(text):
    # Nothing in the codebase parses the archive page today; this is a pure
    # canary that the page still renders real post links, so a future
    # consumer (or a human checking it manually) has a shape to trust.
    if "<html" not in text[:2000].lower():
        return "FAIL", "response is not HTML (missing '<html' near the top)"
    links = set(re.findall(
        r'href="https://citizenofnowhere\.substack\.com/p/[^"?#]+"', text))
    if not links:
        return "FAIL", "no /p/<slug> post links found (archive markup changed?)"
    return "ok", f"{len(links)} distinct post links"


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
# NB: the 2026-08-05 ESPN "403 for everything" was self-inflicted — the monitor
# was sending a browser UA, which Akamai blocks (see FETCH_UA above). With a
# library UA all 12 ESPN feeds return 200 again, so they are kept here rather
# than trimmed. (The site's own ESPN data still comes from the
# espn-standings-snapshot GitHub Action; this is a shape canary, not that path.)
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
     check_espn_golf_scoreboard),
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
    # These two replace the status-only probes removed from
    # external-url-monitor.yml on 2026-08-05 (HANDOFF, issue #9): that
    # workflow's GitHub Actions runner IPs are Cloudflare-blocked outright on
    # substack.com, a probe that can never pass. The mini's egress is clean,
    # and a shape check here is strictly better than the status check was —
    # it catches Substack quietly renaming a key, not just an outage.
    ("Substack RSS feed",
     "https://citizenofnowhere.substack.com/feed",
     check_substack_feed, fetch_substack),
    ("Substack archive page",
     "https://citizenofnowhere.substack.com/archive",
     check_substack_archive, fetch_substack),
]


def main():
    results = []
    failures = []
    for entry in FEEDS:
        name, url, validator = entry[0], entry[1], entry[2]
        fetcher = entry[3] if len(entry) > 3 else fetch_json
        try:
            doc = fetcher(url)
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
