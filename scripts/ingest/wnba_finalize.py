#!/usr/bin/env python3
"""WNBA season-end finalizer: the piece wnba_ingest.py has always deferred to
("left for the season-end finalizer (wnba_finalize.py) once the postseason
concludes" -- its own docstring, 2026-07) but which never existed.

It sets the eight outcome columns on the already-ingested rows of
public.wnba_seasons and touches nothing else. The standings columns
(w, l, win_pct, gb, ps_g, pf_g, conference, canonical_name) are never in the
payload, so the merge-duplicates upsert cannot disturb them -- the same
guarantee, in the other direction, that lets the nightly ingest run without
clobbering these flags.

Columns owned here:
    playoffs    made the postseason (played at least one postseason game)
    div_title   best regular-season record in its conference
    best_rec    best regular-season record in the league
    sf_app      reached the semifinals (a team's SECOND series)
    champ_app   reached the WNBA Finals (a team's THIRD series)
    champ       won the Finals
    p_wins      postseason games won
    p_losses    postseason games lost

HOW ROUNDS ARE DERIVED, AND WHY NOT BY NAME
-------------------------------------------
Round membership is taken from SERIES STRUCTURE, never from ESPN's headline
text. Postseason games are grouped into series by opponent pair, the series
are ordered by their first game, and a team's Nth distinct series IS round N.
So round 1 = first round, round 2 = semifinals, round 3 = Finals, without the
script ever having to recognise a string.

That matters because the WNBA has changed its postseason repeatedly in the
last decade, and the series lengths changed again as recently as 2025, when
the Finals became best-of-seven -- the migrated 2025 rows record Las Vegas at
9-3 and Phoenix at 5-6, totals that only reconcile under a best-of-seven
final. A finalizer that hardcoded "first to 3 wins the Finals" would have
been wrong the first year it ran. Counting series is immune to that: it needs
no series length, no round name and no seeding rule.

Headlines are still read, but only as a CROSS-CHECK: if a series whose games
say "Finals" is not the structural round 3, the script warns and refuses to
write rather than picking a winner between the two signals.

GATES (nothing is ever guessed)
-------------------------------
  * The postseason must have started. No postseason games -> the script says
    so and exits without writing, so the daily workflow can run it blind all
    regular season.
  * Exactly 8 postseason teams and at most 3 rounds, or it refuses. A play-in
    round or a format change should stop this script and reach a human, not
    be silently absorbed into the flags.
  * div_title / best_rec come from the standings already in Supabase, not
    from ESPN. A tie for a conference lead or the league's best record is
    reported and left alone rather than broken by a guess.
  * champ is only set once the Finals series has no unplayed games left.
  * DRY RUN BY DEFAULT. --write applies; --self-test covers the pure decision
    logic offline with the real 2024 and 2025 brackets as fixtures.

Idempotent: it computes the flags the season SHOULD have and PATCHes only the
difference, so a stray flag is repaired rather than accumulated, and a second
run is a no-op. Safe to run daily from first tip-off to the trophy.

Usage:
    python scripts/ingest/wnba_finalize.py --self-test
    python scripts/ingest/wnba_finalize.py                 # dry run
    python scripts/ingest/wnba_finalize.py --write
    python scripts/ingest/wnba_finalize.py --season 2026 --write
    WNBA_FINALIZE_FIXTURE=/tmp/pf.json python ... --self-test   # offline dev

Env: SUPABASE_WRITE_KEY (sb_secret_...) required for --write; reads use anon.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SB_URL = (os.environ.get("SUPABASE_URL") or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30."
        "4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
WRITE_KEY = (os.environ.get("SUPABASE_WRITE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or "").strip()

TABLE = "wnba_seasons"
ESPN = "https://site.api.espn.com/apis"
# Same sport fragment as the standings endpoint wnba_ingest.py and
# lib/wnba-standings.ts already use, on the scoreboard route that
# scripts/ingest/footy_finals.py uses for the AFL and NRL finals.
SCOREBOARD = ESPN + "/site/v2/sports/basketball/wnba/scoreboard"

# ESPN season types: 1 preseason, 2 regular, 3 postseason, 4 offseason.
POSTSEASON_TYPE = 3
EXPECTED_PLAYOFF_TEAMS = 8
MAX_ROUNDS = 3

FLAG_COLS = ("playoffs", "div_title", "best_rec", "sf_app", "champ_app", "champ",
             "p_wins", "p_losses")


# ------------------------------------------------------------------ supabase --

def _headers(write=False):
    key = WRITE_KEY if write else ANON
    h = {"apikey": key, "Content-Type": "application/json"}
    # New-style sb_secret_/sb_publishable keys are NOT JWTs and must not be
    # sent as a Bearer token -- the API gateway mints the role JWT from the
    # apikey header. Only legacy anon/service_role JWTs expect Bearer.
    if key.count(".") == 2:
        h["Authorization"] = "Bearer %s" % key
    return h


def _req(method, path, params=None, body=None, write=False, prefer=None):
    url = "%s/rest/v1/%s" % (SB_URL, path)
    if params:
        url += "?" + urllib.parse.urlencode(params)
    h = _headers(write)
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(url, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as ex:
        raise SystemExit("HTTP %s on %s %s: %s"
                         % (ex.code, method, path, ex.read().decode(errors="replace")[:300]))


def get_ladder(season):
    return _req("GET", TABLE, {
        "select": "id,season,team,conference,w,l,win_pct,gb," + ",".join(FLAG_COLS),
        "season": "eq.%d" % season, "order": "win_pct.desc,team"}) or []


# --------------------------------------------------------------------- espn --

def fetch_json(url):
    req = urllib.request.Request(url)  # urllib's own UA -- ESPN accepts it
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _windows(season):
    """Fortnight windows across the postseason months.

    Deliberately chunked, and deliberately WITHOUT a `limit=` parameter. Both
    are scars: ESPN's scoreboard silently truncates when `limit=` is passed
    (hit on college football) and silently caps a wide date range at 100
    events while ignoring any seasontype filter (hit on MLB). Fortnights of a
    league this size cannot reach either cap.
    """
    start, end = dt.date(season, 8, 1), dt.date(season, 11, 15)
    out, cur = [], start
    while cur <= end:
        stop = min(cur + dt.timedelta(days=13), end)
        out.append("%s-%s" % (cur.strftime("%Y%m%d"), stop.strftime("%Y%m%d")))
        cur = stop + dt.timedelta(days=1)
    return out


def parse_events(payload):
    """ESPN scoreboard payload -> [game]. Postseason games only.

    Shape as measured by the repo's other ESPN readers (footy_finals.py,
    wnba-standings.ts): season.type / season.slug on the event, everything
    else under competitions[0].
    """
    games = []
    for ev in payload.get("events", []) or []:
        season = ev.get("season") or {}
        stype = season.get("type")
        slug = str(season.get("slug") or "")
        # Trust season.type when present; fall back to the slug, which is how
        # the AFL/NRL finals feed identifies post-season events.
        is_post = (stype == POSTSEASON_TYPE) if stype is not None else ("post" in slug)
        if not is_post:
            continue
        comps = ev.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        sides = {}
        for c in comp.get("competitors", []) or []:
            ha = c.get("homeAway")
            nm = ((c.get("team") or {}).get("displayName") or "").strip()
            if ha not in ("home", "away") or not nm:
                continue
            raw = c.get("score")
            try:
                score = int(float(raw)) if raw not in (None, "") else None
            except (TypeError, ValueError):
                score = None
            sides[ha] = {"name": nm, "score": score, "winner": bool(c.get("winner"))}
        if len(sides) != 2:
            continue  # a TBC slot: ESPN lists the fixture before the bracket resolves
        status = ((comp.get("status") or {}).get("type") or {})
        completed = bool(status.get("completed"))
        winner = None
        if completed:
            if sides["home"]["winner"] != sides["away"]["winner"]:
                winner = "home" if sides["home"]["winner"] else "away"
            elif sides["home"]["score"] is not None and sides["away"]["score"] is not None:
                winner = "home" if sides["home"]["score"] > sides["away"]["score"] else "away"
        notes = comp.get("notes") or ev.get("notes") or []
        headline = ""
        if notes and isinstance(notes, list):
            headline = str((notes[0] or {}).get("headline") or "")
        games.append({
            "date": str(ev.get("date") or "")[:10],
            "home": sides["home"]["name"], "away": sides["away"]["name"],
            "home_score": sides["home"]["score"], "away_score": sides["away"]["score"],
            "completed": completed, "winner": winner, "headline": headline,
        })
    return games


def fetch_postseason(season):
    games, seen = [], set()
    for win in _windows(season):
        payload = fetch_json("%s?dates=%s" % (SCOREBOARD, win))
        for g in parse_events(payload):
            key = (g["date"], g["home"], g["away"])
            if key in seen:  # fortnight boundaries cannot overlap, but be safe
                continue
            seen.add(key)
            games.append(g)
    games.sort(key=lambda g: (g["date"], g["home"], g["away"]))
    return games


# --------------------------------------------------------- pure decisions --

def build_series(games):
    """Postseason games -> series, ordered by first game.

    A series is every game between one unordered pair of teams. Returns
    [{teams: frozenset, games: [...], first: date, wins: {team: n},
      pending: n, headlines: set}].
    """
    by_pair = {}
    for g in games:
        pair = frozenset((g["home"], g["away"]))
        s = by_pair.setdefault(pair, {"teams": pair, "games": [], "wins": {}, "pending": 0,
                                      "headlines": set()})
        s["games"].append(g)
        if g["headline"]:
            s["headlines"].add(g["headline"])
        if g["completed"] and g["winner"]:
            w = g[g["winner"]]
            s["wins"][w] = s["wins"].get(w, 0) + 1
        elif not g["completed"]:
            s["pending"] += 1
    out = list(by_pair.values())
    for s in out:
        s["first"] = min(g["date"] for g in s["games"])
        for t in s["teams"]:
            s["wins"].setdefault(t, 0)
    out.sort(key=lambda s: (s["first"], sorted(s["teams"])))
    return out


def assign_rounds(series):
    """A team's Nth distinct series IS round N. Mutates series with 'round'.

    Name-free on purpose: the WNBA's round names, series lengths and seeding
    have all moved in the last decade. Structure has not.
    """
    seen = {}
    for s in series:
        rounds = []
        for t in sorted(s["teams"]):
            seen[t] = seen.get(t, 0) + 1
            rounds.append(seen[t])
        # Both sides of a series must be entering the same round. If they are
        # not, the bracket is not what we think it is.
        s["round"] = max(rounds)
        s["round_consistent"] = len(set(rounds)) == 1
    return series


def series_decided(s):
    """No unplayed games left in this series."""
    return s["pending"] == 0 and any(v > 0 for v in s["wins"].values())


def series_winner(s):
    if not series_decided(s):
        return None
    a, b = sorted(s["teams"])
    if s["wins"][a] == s["wins"][b]:
        return None
    return a if s["wins"][a] > s["wins"][b] else b


def postseason_open(games):
    """True while ANY postseason game anywhere is still unplayed.

    The champion gate deliberately looks at the whole postseason, not just the
    Finals series. Series length is not knowable from the feed -- the Finals
    were best-of-five until 2025 and best-of-seven after -- so "the leader has
    no game left in this series" cannot distinguish a completed sweep from a
    3-0 lead in a series ESPN has not scheduled the rest of yet. Requiring the
    entire bracket to be empty of unplayed games removes the ambiguity without
    inventing a series length.

    It is also self-repairing either way: the workflow runs daily, so if ESPN
    publishes a further game after a run, the next run recomputes champ as
    False and PATCHes it back. The flags converge on the truth.
    """
    return any(not g["completed"] for g in games)


def leaders(ladder):
    """(conference leaders, league leaders) by regular-season win_pct.

    Returns SETS so a tie is visible to the caller rather than silently
    resolved. gb == 0 is preferred when present: it is ESPN's own answer to
    the conference lead and already sits in the standings columns.
    """
    conf = {}
    for r in ladder:
        c = r.get("conference") or ""
        conf.setdefault(c, []).append(r)
    div = set()
    for c, rows in conf.items():
        by_gb = [r for r in rows if r.get("gb") == 0]
        if len(by_gb) == 1:
            div.add(by_gb[0]["team"])
            continue
        best = max((r.get("win_pct") or 0) for r in rows)
        div |= {r["team"] for r in rows if (r.get("win_pct") or 0) == best}
    best_all = max((r.get("win_pct") or 0) for r in ladder) if ladder else 0
    league = {r["team"] for r in ladder if (r.get("win_pct") or 0) == best_all}
    return div, league


def desired_flags(ladder, games):
    """The flags the season SHOULD carry. Returns (by_team, problems)."""
    problems = []
    series = assign_rounds(build_series(games))
    teams = sorted({t for s in series for t in s["teams"]})

    if len(teams) != EXPECTED_PLAYOFF_TEAMS:
        problems.append("expected %d postseason teams, found %d (%s)"
                        % (EXPECTED_PLAYOFF_TEAMS, len(teams), ", ".join(teams)))
    if series and max(s["round"] for s in series) > MAX_ROUNDS:
        problems.append("found %d rounds, expected at most %d -- format change?"
                        % (max(s["round"] for s in series), MAX_ROUNDS))
    for s in series:
        if not s["round_consistent"]:
            problems.append("series %s joins teams arriving from different rounds"
                            % " v ".join(sorted(s["teams"])))
        # Cross-check only. Structure decides; a disagreement stops the run.
        if any("final" in h.lower() and "semi" not in h.lower() for h in s["headlines"]):
            if s["round"] != MAX_ROUNDS:
                problems.append("series %s is headlined %r but is structurally round %d"
                                % (" v ".join(sorted(s["teams"])), sorted(s["headlines"])[0],
                                   s["round"]))

    known = {r["team"] for r in ladder}
    unknown = [t for t in teams if t not in known]
    if unknown:
        problems.append("postseason team(s) missing from the %s ladder: %s"
                        % (TABLE, ", ".join(unknown)))

    div, league = leaders(ladder)
    if len(league) > 1:
        problems.append("tie for the league's best record (%s) -- best_rec left alone"
                        % ", ".join(sorted(league)))
        league = set()
    for c in {r.get("conference") or "" for r in ladder}:
        tied = {t for t in div if any(r["team"] == t and (r.get("conference") or "") == c
                                      for r in ladder)}
        if len(tied) > 1:
            problems.append("tie for the %s lead (%s) -- div_title left alone"
                            % (c or "?", ", ".join(sorted(tied))))
            div -= tied

    finals = [s for s in series if s["round"] == MAX_ROUNDS]
    champion = None
    if len(finals) == 1 and not postseason_open(games):
        champion = series_winner(finals[0])

    by_team = {}
    for r in ladder:
        t = r["team"]
        mine = [s for s in series if t in s["teams"]]
        pw = sum(s["wins"].get(t, 0) for s in mine)
        pl = sum(v for s in mine for k, v in s["wins"].items() if k != t)
        by_team[t] = {
            "playoffs": t in teams,
            "div_title": t in div,
            "best_rec": t in league,
            "sf_app": any(s["round"] >= 2 for s in mine),
            "champ_app": any(s["round"] >= MAX_ROUNDS for s in mine),
            "champ": champion is not None and t == champion,
            "p_wins": pw,
            "p_losses": pl,
        }
    return by_team, problems


def flag_updates(ladder, by_team):
    """[(row, patch)] -- the minimal changes that make the flags exact."""
    out = []
    for r in ladder:
        want = by_team.get(r["team"])
        if not want:
            continue
        patch = {}
        for k, v in want.items():
            cur = r.get(k)
            if k in ("p_wins", "p_losses"):
                # NULL is not the same as 0 here. The migrated history records
                # a real 0 for every team once a season is finalized (2025's
                # non-qualifiers all read 0/0), and the ingest leaves NULL
                # mid-season, so a first finalize must fill the zeros -- an
                # undefeated champion would otherwise keep a null p_losses.
                if cur is None or cur != v:
                    patch[k] = v
            elif bool(cur) != v:
                patch[k] = v
        if patch:
            out.append((r, patch))
    return out


# ------------------------------------------------------------------- stages --

def run(season, write):
    ladder = get_ladder(season)
    if not ladder:
        print("[wnba] no %d rows in %s; run wnba_ingest.py first -- nothing to do"
              % (season, TABLE))
        return 0
    print("[wnba] %d: %d teams on the ladder" % (season, len(ladder)))

    fixture = os.environ.get("WNBA_FINALIZE_FIXTURE")
    if fixture:
        with open(fixture, encoding="utf-8") as f:
            games = json.load(f)
        print("[wnba] using fixture %s (%d games)" % (fixture, len(games)))
    else:
        games = fetch_postseason(season)

    if not games:
        print("[wnba] %d postseason has not started (no season.type=3 games); "
              "no flags to set yet" % season)
        return 0

    done = sum(1 for g in games if g["completed"])
    print("[wnba] %d postseason games found (%d completed, %d scheduled)"
          % (len(games), done, len(games) - done))

    by_team, problems = desired_flags(ladder, games)
    for p in problems:
        print("[wnba] REFUSING: %s" % p, file=sys.stderr)
    if problems:
        raise SystemExit("[wnba] %d bracket problem(s) above -- flags left untouched. "
                         "This needs a human, not a guess." % len(problems))

    series = assign_rounds(build_series(games))
    for s in series:
        a, b = sorted(s["teams"])
        print("[wnba]   R%d %s %d-%d %s%s" % (s["round"], a, s["wins"][a], s["wins"][b], b,
                                              "" if series_decided(s) else "  (in progress)"))
    champ = [t for t, f in by_team.items() if f["champ"]]
    print("[wnba] champion: %s" % (champ[0] if champ else "not decided yet"))

    updates = flag_updates(ladder, by_team)
    if not updates:
        print("[wnba] flags already exact; nothing to write")
        return 0

    payload = []
    for r, patch in updates:
        print("[wnba] %-24s %s" % (r["team"], patch))
        # Only the key and the flag columns travel. The standings columns are
        # not in the payload, so merge-duplicates cannot touch them.
        payload.append({"season": season, "team": r["team"], **patch})

    if not write:
        print("[wnba] DRY RUN -- %d row(s) would change. Re-run with --write to apply."
              % len(payload))
        return 0

    if not WRITE_KEY:
        raise SystemExit("SUPABASE_WRITE_KEY (or SUPABASE_SERVICE_KEY) not set; refusing to write.")
    _req("POST", TABLE, {"on_conflict": "season,team"}, payload,
         write=True, prefer="resolution=merge-duplicates,return=minimal")
    print("[wnba] wrote %d row(s) for %d" % (len(payload), season))
    return 0


# ---------------------------------------------------------------- self-test --

def _g(date, home, away, hs, as_, done=True, headline=""):
    winner = None
    if done:
        winner = "home" if hs > as_ else "away"
    return {"date": date, "home": home, "away": away, "home_score": hs, "away_score": as_,
            "completed": done, "winner": winner, "headline": headline}


def _bracket_2025():
    """The real 2025 bracket, whose totals the migrated rows already pin:
    Las Vegas 9-3, Phoenix 5-6, Indiana 4-4, Minnesota 3-3, and 1-2 apiece for
    Atlanta, New York and Seattle. Best-of-3, best-of-5, best-of-7."""
    G = []
    # Round 1
    for i, (w, l, wn, ln) in enumerate([("Las Vegas Aces", "Seattle Storm", 2, 1),
                                        ("Indiana Fever", "Atlanta Dream", 2, 1),
                                        ("Phoenix Mercury", "New York Liberty", 2, 1),
                                        ("Minnesota Lynx", "Golden State Valkyries", 2, 0)]):
        for n in range(wn):
            G.append(_g("2025-09-%02d" % (14 + n), w, l, 90, 80))
        for n in range(ln):
            G.append(_g("2025-09-%02d" % (17 + n), l, w, 90, 80))
    # Semifinals
    for n in range(3):
        G.append(_g("2025-09-%02d" % (21 + n), "Las Vegas Aces", "Indiana Fever", 90, 80,
                    headline="Semifinals"))
    for n in range(2):
        G.append(_g("2025-09-%02d" % (24 + n), "Indiana Fever", "Las Vegas Aces", 90, 80,
                    headline="Semifinals"))
    for n in range(3):
        G.append(_g("2025-09-%02d" % (21 + n), "Phoenix Mercury", "Minnesota Lynx", 90, 80,
                    headline="Semifinals"))
    G.append(_g("2025-09-24", "Minnesota Lynx", "Phoenix Mercury", 90, 80, headline="Semifinals"))
    # Finals: Las Vegas 4-0
    for n in range(4):
        G.append(_g("2025-10-%02d" % (3 + n), "Las Vegas Aces", "Phoenix Mercury", 90, 80,
                    headline="WNBA Finals"))
    return G


def _ladder_2025():
    rows = [("Minnesota Lynx", "West", 34, 10, 0.773, 0.0),
            ("Las Vegas Aces", "West", 30, 14, 0.682, 4.0),
            ("Atlanta Dream", "East", 30, 14, 0.682, 0.0),
            ("New York Liberty", "East", 27, 17, 0.614, 3.0),
            ("Phoenix Mercury", "West", 27, 17, 0.614, 7.0),
            ("Indiana Fever", "East", 24, 20, 0.545, 6.0),
            ("Seattle Storm", "West", 23, 21, 0.523, 11.0),
            ("Golden State Valkyries", "West", 23, 21, 0.523, 11.0),
            ("Los Angeles Sparks", "West", 21, 23, 0.477, 13.0),
            ("Washington Mystics", "East", 16, 28, 0.364, 14.0),
            ("Connecticut Sun", "East", 11, 33, 0.25, 19.0),
            ("Chicago Sky", "East", 10, 34, 0.227, 20.0),
            ("Dallas Wings", "West", 10, 34, 0.227, 24.0)]
    out = []
    for i, (t, c, w, l, p, gb) in enumerate(rows):
        r = {"id": i + 1, "season": 2025, "team": t, "conference": c, "w": w, "l": l,
             "win_pct": p, "gb": gb}
        for k in FLAG_COLS:
            r[k] = 0 if k in ("p_wins", "p_losses") else False
        out.append(r)
    return out


def self_test():
    n = [0]

    def check(name, cond):
        n[0] += 1
        if not cond:
            raise SystemExit("self-test FAILED: %s" % name)

    # -- windows: chunked, no limit= ---------------------------------------
    w = _windows(2026)
    check("windows are fortnights", all(len(x) == 17 and "-" in x for x in w))
    check("windows cover october", any(x.startswith("202610") for x in w))
    check("windows do not overlap",
          all(w[i].split("-")[1] < w[i + 1].split("-")[0] for i in range(len(w) - 1)))

    # -- parse_events: only postseason, TBC dropped ------------------------
    def ev(stype, home, away, done=True, hw=True, score=(90, 80), notes=None):
        return {"date": "2026-09-14T23:00Z", "season": {"type": stype, "slug": "post-season"},
                "competitions": [{"notes": notes or [],
                                  "status": {"type": {"completed": done}},
                                  "competitors": [
                                      {"homeAway": "home", "team": {"displayName": home},
                                       "score": score[0], "winner": done and hw},
                                      {"homeAway": "away", "team": {"displayName": away},
                                       "score": score[1], "winner": done and not hw}]}]}
    p = parse_events({"events": [ev(3, "A", "B"), ev(2, "C", "D")]})
    check("regular-season events dropped", len(p) == 1 and p[0]["home"] == "A")
    check("winner read from the winner flag", p[0]["winner"] == "home")
    tbc = ev(3, "A", "")
    check("TBC slot dropped", parse_events({"events": [tbc]}) == [])

    # -- series + rounds ---------------------------------------------------
    G = _bracket_2025()
    s = assign_rounds(build_series(G))
    check("2025 has 7 series", len(s) == 7)
    check("2025 has 4 first-round series", sum(1 for x in s if x["round"] == 1) == 4)
    check("2025 has 2 semifinals", sum(1 for x in s if x["round"] == 2) == 2)
    check("2025 has 1 final", sum(1 for x in s if x["round"] == 3) == 1)
    fin = [x for x in s if x["round"] == 3][0]
    check("finals winner is Las Vegas", series_winner(fin) == "Las Vegas Aces")

    # -- the real 2025 outcome, against the migrated numbers ---------------
    ladder = _ladder_2025()
    by_team, problems = desired_flags(ladder, G)
    check("2025 bracket is clean", problems == [])
    exp = {"Las Vegas Aces": (9, 3, True, True, True),
           "Phoenix Mercury": (5, 6, True, True, False),
           "Indiana Fever": (4, 4, True, False, False),
           "Minnesota Lynx": (3, 3, True, False, False),
           "Atlanta Dream": (1, 2, False, False, False),
           "New York Liberty": (1, 2, False, False, False),
           "Seattle Storm": (1, 2, False, False, False),
           "Golden State Valkyries": (0, 2, False, False, False)}
    for t, (pw, pl, sf, ca, ch) in exp.items():
        f = by_team[t]
        check("%s p_wins" % t, f["p_wins"] == pw)
        check("%s p_losses" % t, f["p_losses"] == pl)
        check("%s sf_app" % t, f["sf_app"] == sf)
        check("%s champ_app" % t, f["champ_app"] == ca)
        check("%s champ" % t, f["champ"] == ch)
        check("%s playoffs" % t, f["playoffs"] is True)
    check("Los Angeles missed the playoffs", by_team["Los Angeles Sparks"]["playoffs"] is False)
    check("best_rec is Minnesota", by_team["Minnesota Lynx"]["best_rec"] is True)
    check("best_rec is exclusive", sum(1 for f in by_team.values() if f["best_rec"]) == 1)
    # 30-14 Atlanta and 30-14 Las Vegas tie on win_pct across the league; gb
    # keeps the conference answer right. This is the case that would break a
    # naive "best record in each conference" rule.
    check("div_title East is Atlanta", by_team["Atlanta Dream"]["div_title"] is True)
    check("div_title West is Minnesota", by_team["Minnesota Lynx"]["div_title"] is True)
    check("Las Vegas has no div_title", by_team["Las Vegas Aces"]["div_title"] is False)
    check("exactly two div titles", sum(1 for f in by_team.values() if f["div_title"]) == 2)

    # -- updates are minimal, idempotent and self-repairing -----------------
    ups = flag_updates(ladder, by_team)
    check("every playoff team needs a patch", len(ups) >= 8)
    for r, patch in ups:
        r.update(patch)
    check("second pass is a no-op", flag_updates(ladder, by_team) == [])
    lv = next(r for r in ladder if r["team"] == "Las Vegas Aces")
    lv["champ"] = False
    check("cleared champ is restored",
          any(p.get("champ") is True for _, p in flag_updates(ladder, by_team)))
    lv["champ"] = True
    stray = next(r for r in ladder if r["team"] == "Chicago Sky")
    stray["playoffs"] = True
    check("stray playoffs flag is repaired",
          any(p.get("playoffs") is False for _, p in flag_updates(ladder, by_team)))
    stray["playoffs"] = False

    # -- mid-postseason: partial brackets must not crown anyone -------------
    r1_only = [g for g in G if g["date"] < "2025-09-21"]
    partial, probs = desired_flags(ladder, r1_only)
    check("round 1 alone still has 8 teams", probs == [])
    check("no champion after round 1", not any(f["champ"] for f in partial.values()))
    check("no semifinalists after round 1", not any(f["sf_app"] for f in partial.values()))

    # Finals at 3-0 with game 4 on the schedule: finalists are known, the
    # trophy is not. This is the state a nightly run actually meets.
    live_final = [g for g in G if g["date"] < "2025-10-06"]
    live_final.append(_g("2025-10-06", "Las Vegas Aces", "Phoenix Mercury", 0, 0, done=False,
                         headline="WNBA Finals"))
    part2, probs2 = desired_flags(ladder, live_final)
    check("live finals is clean", probs2 == [])
    check("finalists flagged before the trophy",
          part2["Las Vegas Aces"]["champ_app"] and part2["Phoenix Mercury"]["champ_app"])
    check("champ waits for the last game", not any(f["champ"] for f in part2.values()))
    check("p_wins still counts the completed finals games",
          part2["Las Vegas Aces"]["p_wins"] == 8)

    # A game still scheduled anywhere in the bracket blocks the crown, even
    # when the Finals series itself looks finished.
    stray_open = [g for g in G] + [_g("2025-10-09", "Indiana Fever", "Atlanta Dream",
                                      0, 0, done=False)]
    part3, _ = desired_flags(ladder, stray_open)
    check("an unplayed game anywhere blocks champ",
          not any(f["champ"] for f in part3.values()))

    # -- gates -------------------------------------------------------------
    short = [g for g in G if "Golden State Valkyries" not in (g["home"], g["away"])]
    _, probs3 = desired_flags(ladder, short)
    check("wrong team count is refused", any("postseason teams" in p for p in probs3))

    mislabel = [dict(g) for g in G]
    for g in mislabel:
        if {g["home"], g["away"]} == {"Las Vegas Aces", "Seattle Storm"}:
            g["headline"] = "WNBA Finals"
    _, probs4 = desired_flags(ladder, mislabel)
    check("headline/structure disagreement is refused",
          any("structurally round" in p for p in probs4))

    tied = [dict(r) for r in _ladder_2025()]
    for r in tied:
        if r["team"] in ("Minnesota Lynx", "Las Vegas Aces"):
            r["win_pct"], r["gb"] = 0.773, 0.0
    _, probs5 = desired_flags(tied, G)
    check("a tie for best record is refused", any("best record" in p for p in probs5))

    print("self-test OK (%d checks)" % n[0])


# --------------------------------------------------------------------- main --

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--season", type=int, default=dt.date.today().year,
                    help="season year (default: this year)")
    ap.add_argument("--write", action="store_true", help="apply (default is a dry run)")
    ap.add_argument("--self-test", action="store_true", help="offline logic checks, no network")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return 0
    return run(a.season, a.write)


if __name__ == "__main__":
    sys.exit(main())
