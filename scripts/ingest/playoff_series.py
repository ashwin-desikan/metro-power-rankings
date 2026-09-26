#!/usr/bin/env python3
"""MLB + WNBA postseason series feed: ESPN scoreboard -> public/data/{mlb,wnba}/playoffs.json.

Sibling of scripts/ingest/footy_finals.py, but a different bundle shape on
purpose: the AFL/NRL/NFL feeds draw a single-game bracket, while MLB and WNBA
postseasons are BEST-OF SERIES (a wild card best-of-3 can still be 1-1 after
two games). The contract for this bundle lives at
_scratch/playoffs-contract.md and is binding -- field names, round keys, the
reconciliation rule -- read it before changing anything here.

ROUND DETECTION
---------------
Reads ESPN's `competitions[0].notes[0].headline`, verified live 2026-09-26:
  MLB:  "ALWC - Game 2", "NLDS - Game 1", "ALCS - Game 3", "World Series - Game 1"
  WNBA: "First Round - Game 1", "Semifinals - Game 2", "WNBA Finals - Game 4"

  MLB_HEADLINE_RE   matches "(AL|NL)(WC|DS|CS) - Game N" -> bracketed rounds.
  MLB_WS_RE         matches "World Series - Game N" -> the title round, no bracket.
  WNBA_HEADLINE_RE  matches "(First Round|Semifinals|WNBA Finals) - Game N".

A headline that matches neither goes to `unassigned` (contract: never guessed).

SERIES GROUPING AND RECONCILIATION
-----------------------------------
Games with the same (round, bracket, pair of team ids) belong to the same
series -- home/away can flip between games, the team-id pair does not. `high`
is the better seed (lower seed number); when either seed is unknown, `high` is
whoever had home field in Game 1 of that series (falls back to date order when
the headline carries no game number).

ESPN's own `competitions[0].series.competitors[].wins` is authoritative when
present. This script always derives its own game-by-game win count too, and
REFUSES (exit 2, nothing written) if the two disagree -- a parser that quietly
trusts its own count is exactly how a stale/duplicated game would publish a
series score nobody actually reached.

Usage:
    python3 scripts/ingest/playoff_series.py --self-test
    python3 scripts/ingest/playoff_series.py --league mlb
    python3 scripts/ingest/playoff_series.py --league all --dry
    python3 scripts/ingest/playoff_series.py --league mlb --empty   # empty-but-valid bundle
    PLAYOFF_SERIES_FIXTURES=/tmp/fx python3 ... --league wnba --fixtures /tmp/fx

No Supabase, no secrets: a read-only public feed -> committed JSON.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/%s/scoreboard"
ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/%s/standings"
FRAG = {"mlb": "baseball/mlb", "wnba": "basketball/wnba"}

# Postseason calendar windows (contract: never pass limit=; use date ranges,
# split so no single request spans too much of the window).
DATE_WINDOWS = {
    "mlb": [("%d-09-28", "%d-10-18"), ("%d-10-19", "%d-11-08")],
    "wnba": [("%d-09-20", "%d-10-07"), ("%d-10-08", "%d-10-25")],
}

DROP_STATUSES = {"STATUS_POSTPONED", "STATUS_CANCELED"}

# ------------------------------------------------------------ round tables --

MLB_ROUNDS = [
    {"key": "wc", "name": "Wild Card Series", "order": 1, "best_of": 3},
    {"key": "ds", "name": "Division Series", "order": 2, "best_of": 5},
    {"key": "cs", "name": "League Championship Series", "order": 3, "best_of": 7},
    {"key": "ws", "name": "World Series", "order": 4, "best_of": 7},
]
WNBA_ROUNDS = [
    {"key": "r1", "name": "First Round", "order": 1, "best_of": 3},
    {"key": "sf", "name": "Semifinals", "order": 2, "best_of": 5},
    {"key": "finals", "name": "WNBA Finals", "order": 3, "best_of": 7},
]
ROUND_TABLES = {"mlb": MLB_ROUNDS, "wnba": WNBA_ROUNDS}
TITLE_ROUND = {"mlb": "ws", "wnba": "finals"}

MLB_HEADLINE_RE = re.compile(r"^(AL|NL)\s*(WC|DS|CS)\s*-\s*Game\s*(\d+)", re.I)
MLB_WS_RE = re.compile(r"^World\s+Series\s*-\s*Game\s*(\d+)", re.I)
MLB_CODE_TO_KEY = {"WC": "wc", "DS": "ds", "CS": "cs"}

WNBA_HEADLINE_RE = re.compile(
    r"^(First\s+Round|Semifinals|WNBA\s+Finals)\s*-\s*Game\s*(\d+)", re.I
)
WNBA_NAME_TO_KEY = {"first round": "r1", "semifinals": "sf", "wnba finals": "finals"}


def classify_headline(league, headline):
    """headline -> (round_key, bracket, game_num), or (None, None, None)."""
    h = (headline or "").strip()
    if not h:
        return None, None, None
    if league == "mlb":
        m = MLB_HEADLINE_RE.match(h)
        if m:
            bracket = m.group(1).upper()
            code = m.group(2).upper()
            return MLB_CODE_TO_KEY[code], bracket, int(m.group(3))
        m = MLB_WS_RE.match(h)
        if m:
            return "ws", None, int(m.group(1))
        return None, None, None
    m = WNBA_HEADLINE_RE.match(h)
    if m:
        return WNBA_NAME_TO_KEY[m.group(1).lower().strip()], None, int(m.group(2))
    return None, None, None


# ------------------------------------------------------------------ fetch ---


def fetch_json(url, attempts=3):
    """One JSON document, retried on transport errors (a TLS handshake that
    times out, a reset) with a short backoff; an HTTP 4xx is not retried."""
    req = urllib.request.Request(url)  # urllib's own UA -- ESPN accepts it
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                raise
            last = e
        except (urllib.error.URLError, OSError, ValueError) as e:
            last = e
        time.sleep(2 * (i + 1))
    raise last


def _year_windows(league, season):
    return [(a % season, b % season) for a, b in DATE_WINDOWS[league]]


def fetch_events(league, season, fixtures_dir):
    """[event, ...] deduped by id, from fixtures or from ESPN date-range windows."""
    events_by_id = {}
    if fixtures_dir:
        for path in sorted(glob.glob(os.path.join(fixtures_dir, "*.json"))):
            with open(path, encoding="utf-8") as f:
                payload = json.load(f)
            if isinstance(payload, dict) and "events" in payload:
                for ev in payload.get("events", []) or []:
                    events_by_id[str(ev.get("id"))] = ev
        return list(events_by_id.values())
    frag = FRAG[league]
    # MONTHS, not date ranges: ESPN dropped the hyphenated `dates=A-B` form on
    # 2026-09-15 (every range 400s now, verified again 2026-09-26). A month
    # plus seasontype=3 returns the whole postseason month without a limit
    # param, so nothing is truncated; overlapping windows dedupe by event id.
    # ... and not months either: `dates=YYYYMM&seasontype=3` IGNORES the
    # season type for MLB and returns the first 100 regular-season games of
    # the month (the silent default cap), which for September never reaches
    # the Wild Card shells on the 29th. One request per DAY, no limit param,
    # is the only form that returns every game (lib/mlbFixtures.ts does the
    # same). season.type == 3 is filtered downstream.
    for start, end in _year_windows(league, season):
        for day in _days_between(start, end):
            url = "%s?dates=%s" % (ESPN_SCOREBOARD % frag, day)
            data = fetch_json(url)
            for ev in data.get("events", []) or []:
                events_by_id[str(ev.get("id"))] = ev
    return list(events_by_id.values())


def _days_between(start, end):
    """['YYYYMMDD', ...] covering start..end inclusive (ISO dates)."""
    d = dt.date.fromisoformat(start)
    e = dt.date.fromisoformat(end)
    out = []
    while d <= e:
        out.append(d.strftime("%Y%m%d"))
        d += dt.timedelta(days=1)
    return out


def fetch_seeds(league, season, fixtures_dir):
    """{teamDisplayName or abbr: seed(int)|None} from ESPN standings' playoffSeed stat."""
    if fixtures_dir:
        payload = None
        for path in sorted(glob.glob(os.path.join(fixtures_dir, "*.json"))):
            with open(path, encoding="utf-8") as f:
                p = json.load(f)
            if isinstance(p, dict) and "children" in p:
                payload = p
                break
        if payload is None:
            return {}
    else:
        url = "%s?season=%d" % (ESPN_STANDINGS % FRAG[league], season)
        payload = fetch_json(url)
    if league == "wnba":
        return _wnba_overall_seeds(payload)
    return _walk_standings(payload)


def _wnba_seeds_from_pairings(seeds, events):
    """Record order cannot break a tie the league broke head-to-head, and a
    wrong 5/6 (or 3/4) reads as a wrong bracket. The first-round pairings are
    1v8, 2v7, 3v6, 4v5, so any series whose two seeds do not sum to nine
    names a tie that was ordered wrong. Fix it by swapping the two seeds that
    appear in the two mismatched series, when exactly one such swap makes
    every pairing sum to nine; otherwise leave the seeds as ranked."""
    pairs = []
    for ev in events or []:
        if (ev.get("season") or {}).get("type") != 3:
            continue
        comp = (ev.get("competitions") or [{}])[0]
        head = ""
        for n in comp.get("notes", []) or []:
            if n.get("headline"):
                head = n["headline"]
                break
        if not head.startswith("First Round"):
            continue
        names = [((c.get("team") or {}).get("displayName") or "") for c in comp.get("competitors", []) or []]
        if len(names) == 2 and all(seeds.get(n) for n in names):
            pair = frozenset(names)
            if pair not in pairs:
                pairs.append(pair)
    bad = [p for p in pairs if sum(seeds[n] for n in p) != 9]
    if not bad:
        return seeds
    # Candidate swaps: one team from each mismatched pair, TIED ON RECORD
    # (a swap between clubs with different records would rewrite the standings).
    names = [n for p in bad for n in p]
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if _WNBA_RECORDS and _WNBA_RECORDS.get(names[i]) != _WNBA_RECORDS.get(names[j]):
                continue
            trial = dict(seeds)
            trial[names[i]], trial[names[j]] = seeds[names[j]], seeds[names[i]]
            if all(sum(trial[n] for n in p) == 9 for p in pairs):
                # Mirror the swap onto the abbreviation keys.
                out = dict(seeds)
                for n in (names[i], names[j]):
                    for k, v in list(seeds.items()):
                        if v == seeds[n] and k != n:
                            out[k] = trial[n]
                    out[n] = trial[n]
                sys.stderr.write("wnba seeds: swapped %s and %s to honour the first-round pairings\n" % (names[i], names[j]))
                return out
    sys.stderr.write("wnba seeds: first-round pairings do not sum to nine and no single swap fixes it; seeds left as ranked\n")
    return seeds


def _wnba_overall_seeds(payload):
    """WNBA seeding is conference-blind: the eight best records overall, 1 to
    8. ESPN's playoffSeed stat is the CONFERENCE seed (two clubs can both be
    3), so rank every team by winPercent then wins, and seed only the top 8;
    everyone else gets None. Keys by displayName and abbreviation."""
    rows = []

    def walk(node):
        if not isinstance(node, dict):
            return
        st = node.get("standings")
        if isinstance(st, dict):
            for e in st.get("entries", []) or []:
                team = e.get("team") or {}
                stats = {x.get("name"): x for x in e.get("stats", []) or []}

                def num(k):
                    try:
                        return float((stats.get(k) or {}).get("value"))
                    except (TypeError, ValueError):
                        return 0.0
                rows.append((num("winPercent"), num("wins"), team.get("displayName"), team.get("abbreviation")))
        for c in node.get("children", []) or []:
            walk(c)
    walk(payload)
    rows.sort(key=lambda r: (-r[0], -r[1], r[2] or ""))
    out = {}
    _WNBA_RECORDS.clear()
    for i, (pct, wins, name, abbr) in enumerate(rows):
        seed = i + 1 if i < 8 else None
        if name:
            out[name] = seed
            _WNBA_RECORDS[name] = (pct, wins)
        if abbr:
            out[abbr] = seed
    return out


# displayName -> (winPercent, wins), filled by _wnba_overall_seeds so the
# pairing fixer can tell a genuine tie from a mis-ranked pair.
_WNBA_RECORDS = {}


def _walk_standings(node, out=None):
    if out is None:
        out = {}
    if not isinstance(node, dict):
        return out
    standings = node.get("standings")
    if isinstance(standings, dict):
        for e in standings.get("entries", []) or []:
            team = e.get("team") or {}
            name = team.get("displayName")
            abbr = team.get("abbreviation")
            stats = {s.get("name"): s for s in e.get("stats", []) or []}
            seed_stat = stats.get("playoffSeed")
            seed = None
            if seed_stat is not None:
                try:
                    seed = int(float(seed_stat.get("value")))
                except (TypeError, ValueError):
                    seed = None
            if name:
                out[name] = seed
            if abbr:
                out[abbr] = seed
    for child in node.get("children", []) or []:
        _walk_standings(child, out)
    return out


# -------------------------------------------------------------- franchises --


def load_mlb_franchises():
    path = os.path.join(ROOT, "public", "data", "mlb", "franchises.json")
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    by_name = {}
    for r in rows:
        nm = r.get("display_name") or ""
        if nm:
            by_name[nm.lower()] = {"name": nm, "slug": r.get("slug")}
    return by_name


def load_wnba_franchises():
    path = os.path.join(ROOT, "public", "data", "wnba", "data.json")
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    by_key = {}
    for r in d.get("franchises", []) or []:
        nm = r.get("name") or ""
        abbr = (r.get("abbr") or "").upper()
        entry = {"name": nm, "slug": r.get("slug")}
        if nm:
            by_key[nm.lower()] = entry
        if abbr:
            by_key[abbr] = entry
    return by_key


def load_franchises(league):
    return load_mlb_franchises() if league == "mlb" else load_wnba_franchises()


def resolve_side(league, franchises, display_name, abbr, seeds):
    if league == "mlb":
        fr = franchises.get((display_name or "").lower())
    else:
        fr = franchises.get((display_name or "").lower()) or franchises.get((abbr or "").upper())
    name = fr["name"] if fr else (display_name or "")
    slug = fr["slug"] if fr else None
    seed = seeds.get(display_name)
    if seed is None:
        seed = seeds.get(abbr)
    return {"name": name, "abbr": abbr, "slug": slug, "seed": seed, "wins": 0}


# --------------------------------------------------------------- parsing ---


def _score(raw):
    if raw in (None, ""):
        return None
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def _game_state(status_type):
    name = (status_type or {}).get("name") or ""
    state = (status_type or {}).get("state") or ""
    if name == "STATUS_FINAL" or state == "post":
        return "post"
    if name == "STATUS_IN_PROGRESS" or state == "in":
        return "in"
    return "pre"


def parse_events(league, events, franchises, seeds):
    """events -> (raw_games, unassigned). raw_games carry everything a series
    needs to assemble itself; unassigned games are already final shape."""
    raw_games, unassigned = [], []
    for ev in events:
        season_type = ((ev.get("season") or {}).get("type"))
        if season_type != 3:
            continue
        comp = (ev.get("competitions") or [{}])[0]
        status_type = (comp.get("status") or {}).get("type") or {}
        if status_type.get("name") in DROP_STATUSES:
            continue

        headline = ""
        for n in comp.get("notes", []) or []:
            if n.get("headline"):
                headline = n["headline"].strip()
                break
        round_key, bracket, game_num = classify_headline(league, headline)

        home_raw = away_raw = None
        for c in comp.get("competitors", []) or []:
            team = c.get("team") or {}
            side = {
                "team_id": str(team.get("id") or ""),
                "name": team.get("displayName") or "",
                "abbr": team.get("abbreviation") or "",
                "score": _score(c.get("score")),
            }
            if c.get("homeAway") == "home":
                home_raw = side
            elif c.get("homeAway") == "away":
                away_raw = side
        if home_raw is None or away_raw is None:
            continue

        state = _game_state(status_type)
        series_obj = comp.get("series") or None
        game = {
            "espn_id": str(ev.get("id") or ""),
            "date": ev.get("date"),
            "venue": ((comp.get("venue") or {}).get("fullName")) or None,
            "home": home_raw,
            "away": away_raw,
            "state": state,
            "headline": headline or None,
            "round_key": round_key,
            "bracket": bracket,
            "game_num": game_num,
            "series": series_obj,
        }
        if round_key is None:
            unassigned.append(_finish_game(game, franchises, seeds, league, include_headline=True))
        else:
            raw_games.append(game)
    return raw_games, unassigned


def _finish_game(game, franchises, seeds, league, include_headline=False):
    home = resolve_side(league, franchises, game["home"]["name"], game["home"]["abbr"], seeds)
    away = resolve_side(league, franchises, game["away"]["name"], game["away"]["abbr"], seeds)
    out = {
        "num": game["game_num"],
        "espn_id": game["espn_id"],
        "date": game["date"],
        "home": home["abbr"] or home["name"],
        "away": away["abbr"] or away["name"],
        "home_score": game["home"]["score"],
        "away_score": game["away"]["score"],
        "state": game["state"],
        "venue": game["venue"],
    }
    if include_headline:
        out["headline"] = game["headline"]
    return out


# Series per round and bracket. ESPN lists every fixture shell of a round
# before the draw resolves, with "TBD" on one or both sides, and those
# shells cannot be told apart by team; they are dealt into the slots the
# round still has open, in Game-number order, and anything beyond the
# round's real series count is dropped rather than drawn.
SERIES_PER_ROUND = {
    "mlb": {"wc": 2, "ds": 2, "cs": 1, "ws": 1},      # per bracket (AL / NL); ws has no bracket
    "wnba": {"r1": 4, "sf": 2, "finals": 1},
}


def is_tbd(side):
    """A fixture-shell side ESPN has not filled yet."""
    abbr = (side.get("abbr") or "").upper()
    name = (side.get("name") or "").upper()
    return abbr == "TBD" or name.startswith("TBD") or (not abbr and not name)


def group_series(league, raw_games):
    """raw_games -> {(round_key, bracket, frozenset(team_ids) | ("slot", k)): [games...]}

    Three passes: games with both teams known define the series; a game with
    one known team joins that team's series in the same round and bracket
    (or opens it); games with both sides TBD are dealt into the remaining
    open slots by Game number so the bracket can show dates before the draw.
    """
    groups = {}
    one_sided = []
    shells = []
    for g in raw_games:
        h_tbd, a_tbd = is_tbd(g["home"]), is_tbd(g["away"])
        if not h_tbd and not a_tbd:
            key = (g["round_key"], g["bracket"], frozenset({g["home"]["team_id"], g["away"]["team_id"]}))
            groups.setdefault(key, []).append(g)
        elif h_tbd and a_tbd:
            shells.append(g)
        else:
            one_sided.append(g)
    for g in one_sided:
        known = g["away"]["team_id"] if is_tbd(g["home"]) else g["home"]["team_id"]
        target = None
        for key in groups:
            if key[0] == g["round_key"] and key[1] == g["bracket"] and isinstance(key[2], frozenset) and known in key[2]:
                target = key
                break
        if target is None:
            target = (g["round_key"], g["bracket"], frozenset({known}))
        groups.setdefault(target, []).append(g)
    per = SERIES_PER_ROUND[league]
    by_rb = {}
    for g in shells:
        by_rb.setdefault((g["round_key"], g["bracket"]), []).append(g)
    for (rk, br), gs in by_rb.items():
        known_count = sum(1 for key in groups if key[0] == rk and key[1] == br)
        open_slots = max(0, per.get(rk, 1) - known_count)
        seen = {}
        for g in sorted(gs, key=lambda x: (x["game_num"] if x["game_num"] is not None else 999, x["date"] or "", x["espn_id"])):
            k = seen.get(g["game_num"], 0)
            seen[g["game_num"]] = k + 1
            if k >= open_slots:
                continue  # a shell beyond the round's real series count
            groups.setdefault((rk, br, ("slot", k)), []).append(g)
    return groups


def build_series(league, key, games, franchises, seeds, season):
    round_key, bracket, _team_ids = key
    games_sorted = sorted(
        games,
        key=lambda g: (g["game_num"] if g["game_num"] is not None else 999, g["date"] or ""),
    )
    g0 = games_sorted[0]
    home0, away0 = g0["home"], g0["away"]

    side_home = resolve_side(league, franchises, home0["name"], home0["abbr"], seeds)
    side_away = resolve_side(league, franchises, away0["name"], away0["abbr"], seeds)

    seed_home, seed_away = side_home["seed"], side_away["seed"]
    if seed_home is not None and seed_away is not None and seed_home != seed_away:
        if seed_home < seed_away:
            high, low = side_home, side_away
            high_id, low_id = home0["team_id"], away0["team_id"]
        else:
            high, low = side_away, side_home
            high_id, low_id = away0["team_id"], home0["team_id"]
    elif is_tbd(home0) and not is_tbd(away0):
        # A shell with one side filled: the known club leads the card.
        high, low = side_away, side_home
        high_id, low_id = away0["team_id"], home0["team_id"]
    else:
        # Unknown/tied seeds: high = home team of game 1.
        high, low = side_home, side_away
        high_id, low_id = home0["team_id"], away0["team_id"]

    # Derived wins, from completed games only.
    derived_wins = {high_id: 0, low_id: 0}
    games_out = []
    latest_series_obj = None
    for g in games_sorted:
        if g["series"]:
            latest_series_obj = g["series"]
        if g["state"] == "post" and g["home"]["score"] is not None and g["away"]["score"] is not None:
            if g["home"]["score"] > g["away"]["score"]:
                winner_id = g["home"]["team_id"]
            elif g["away"]["score"] > g["home"]["score"]:
                winner_id = g["away"]["team_id"]
            else:
                winner_id = None
            if winner_id in derived_wins:
                derived_wins[winner_id] += 1
        games_out.append({
            "num": g["game_num"],
            "espn_id": g["espn_id"],
            "date": g["date"],
            "home": g["home"]["abbr"] or g["home"]["name"],
            "away": g["away"]["abbr"] or g["away"]["name"],
            "home_score": g["home"]["score"],
            "away_score": g["away"]["score"],
            "state": g["state"],
            "venue": g["venue"],
        })

    # Reconciliation: ESPN's series.competitors[].wins is authoritative when
    # present. Disagreement is a hard refusal for the whole run (contract).
    if latest_series_obj and latest_series_obj.get("competitors"):
        espn_wins = {}
        for c in latest_series_obj["competitors"]:
            cid = str(c.get("id") or "")
            try:
                espn_wins[cid] = int(c.get("wins"))
            except (TypeError, ValueError):
                continue
        for team_id, our_wins in derived_wins.items():
            if team_id in espn_wins and espn_wins[team_id] != our_wins:
                raise SeriesReconciliationError(
                    "series %s/%s team %s: derived wins %d != ESPN wins %d"
                    % (round_key, bracket, team_id, our_wins, espn_wins[team_id])
                )

    high["wins"] = derived_wins.get(high_id, 0)
    low["wins"] = derived_wins.get(low_id, 0)

    best_of = None
    summary = None
    completed_flag = False
    if latest_series_obj:
        best_of = latest_series_obj.get("totalCompetitions")
        summary = latest_series_obj.get("summary")
        completed_flag = bool(latest_series_obj.get("completed"))
    if not best_of:
        table = {r["key"]: r for r in ROUND_TABLES[league]}
        best_of = table[round_key]["best_of"]

    need = best_of // 2 + 1
    winner = None
    if high["wins"] >= need:
        winner = "high"
    elif low["wins"] >= need:
        winner = "low"

    if completed_flag or winner is not None:
        state = "post"
    elif any(g["state"] == "in" for g in games_sorted) or any(
        g["state"] == "post" for g in games_sorted
    ):
        state = "in"
    else:
        state = "pre"

    seed_bit = (
        "%sv%s" % (high["seed"], low["seed"])
        if high["seed"] is not None and low["seed"] is not None
        else "%sv%s" % (high_id, low_id)
    )
    if isinstance(_team_ids, tuple) and _team_ids and _team_ids[0] == "slot":
        seed_bit = "slot%d" % _team_ids[1]
    sid = "%d-%s-%s-%s-%s" % (season, league, round_key, bracket or "x", seed_bit)

    return {
        "id": sid,
        "bracket": bracket,
        "best_of": best_of,
        "state": state,
        "high": high,
        "low": low,
        "winner": winner,
        "summary": summary,
        "games": games_out,
    }


class SeriesReconciliationError(RuntimeError):
    pass


def to_bundle(league, season, series_by_round, unassigned, generated_at=None):
    rounds_out = []
    for r in ROUND_TABLES[league]:
        rounds_out.append({
            "key": r["key"],
            "name": r["name"],
            "order": r["order"],
            "best_of": r["best_of"],
            "series": series_by_round.get(r["key"], []),
        })
    champion = None
    complete = False
    title_key = TITLE_ROUND[league]
    for r in rounds_out:
        if r["key"] == title_key:
            for s in r["series"]:
                if s["winner"]:
                    champion_side = s[s["winner"]]
                    champion = {"name": champion_side["name"], "abbr": champion_side["abbr"], "slug": champion_side["slug"]}
                    complete = True
    games_count = sum(len(s["games"]) for r in rounds_out for s in r["series"]) + len(unassigned)
    return {
        "meta": {
            "league": league,
            "season": season,
            "generated_at": generated_at or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "complete": complete,
            "source": "ESPN scoreboard (seasontype 3) + ESPN standings playoffSeed",
            "games": games_count,
            "unassigned_games": len(unassigned),
        },
        "rounds": rounds_out,
        "unassigned": unassigned,
        "champion": champion,
    }


def empty_bundle(league, season):
    return to_bundle(league, season, {}, [])


def build(league, season, fixtures_dir=None):
    franchises = load_franchises(league)
    events = fetch_events(league, season, fixtures_dir)
    seeds = fetch_seeds(league, season, fixtures_dir)
    if league == "wnba":
        seeds = _wnba_seeds_from_pairings(seeds, events)
    raw_games, unassigned = parse_events(league, events, franchises, seeds)
    groups = group_series(league, raw_games)
    series_by_round = {}
    for key, games in groups.items():
        round_key = key[0]
        series = build_series(league, key, games, franchises, seeds, season)
        series_by_round.setdefault(round_key, []).append(series)
    return to_bundle(league, season, series_by_round, unassigned)


def write_bundle(bundle, league, out_dir):
    path = os.path.join(out_dir, league, "playoffs.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, separators=(",", ":"))
    return path


# ------------------------------------------------------------- self-test ----


def _ev(season_type, espn_id, headline, home, away, home_score=None, away_score=None,
        status="STATUS_SCHEDULED", venue="Chase Field", date="2026-10-01T23:00Z",
        series=None, home_id="1", away_id="2"):
    comps = [
        {"homeAway": "home", "team": {"id": home_id, "displayName": home, "abbreviation": home[:3].upper()},
         "score": home_score},
        {"homeAway": "away", "team": {"id": away_id, "displayName": away, "abbreviation": away[:3].upper()},
         "score": away_score},
    ]
    state = "post" if status == "STATUS_FINAL" else ("in" if status == "STATUS_IN_PROGRESS" else "pre")
    comp = {
        "notes": [{"headline": headline}] if headline else [],
        "venue": {"fullName": venue},
        "status": {"type": {"name": status, "state": state, "completed": status == "STATUS_FINAL"}},
        "competitors": comps,
    }
    if series is not None:
        comp["series"] = series
    return {"id": espn_id, "date": date, "season": {"type": season_type}, "competitions": [comp]}


def self_test():
    ok = [0]

    def check(name, cond):
        ok[0] += 1
        if not cond:
            raise SystemExit("self-test FAILED: %s" % name)

    mlb_franchises = {"new york yankees": {"name": "New York Yankees", "slug": "yankees"},
                       "boston red sox": {"name": "Boston Red Sox", "slug": "red-sox"}}
    wnba_franchises = {"las vegas aces": {"name": "Las Vegas Aces", "slug": "las-vegas-aces"},
                        "lva": {"name": "Las Vegas Aces", "slug": "las-vegas-aces"},
                        "new york liberty": {"name": "New York Liberty", "slug": "new-york-liberty"},
                        "nyl": {"name": "New York Liberty", "slug": "new-york-liberty"}}

    # --- classify_headline covers every documented shape ---
    check("mlb wc", classify_headline("mlb", "ALWC - Game 2") == ("wc", "AL", 2))
    check("mlb ds", classify_headline("mlb", "NLDS - Game 1") == ("ds", "NL", 1))
    check("mlb cs", classify_headline("mlb", "ALCS - Game 3") == ("cs", "AL", 3))
    check("mlb ws", classify_headline("mlb", "World Series - Game 1") == ("ws", None, 1))
    check("mlb unassigned", classify_headline("mlb", "") == (None, None, None))
    check("wnba r1", classify_headline("wnba", "First Round - Game 1") == ("r1", None, 1))
    check("wnba sf", classify_headline("wnba", "Semifinals - Game 2") == ("sf", None, 2))
    check("wnba finals", classify_headline("wnba", "WNBA Finals - Game 4") == ("finals", None, 4))

    # --- Case 1: MLB wild card series in progress, 1-1 ---
    events = [
        _ev(3, "401001", "ALWC - Game 1", "New York Yankees", "Boston Red Sox",
            4, 2, status="STATUS_FINAL", home_id="10", away_id="20"),
        _ev(3, "401002", "ALWC - Game 2", "Boston Red Sox", "New York Yankees",
            5, 1, status="STATUS_FINAL", home_id="20", away_id="10"),
    ]
    seeds = {"New York Yankees": 3, "Boston Red Sox": 6}
    raw_games, unassigned = parse_events("mlb", events, mlb_franchises, seeds)
    check("wc games parsed", len(raw_games) == 2 and unassigned == [])
    groups = group_series("mlb", raw_games)
    check("one series group", len(groups) == 1)
    key = next(iter(groups))
    series = build_series("mlb", key, groups[key], mlb_franchises, seeds, 2026)
    check("high is better seed", series["high"]["name"] == "New York Yankees")
    check("series 1-1", series["high"]["wins"] == 1 and series["low"]["wins"] == 1)
    check("series still in", series["state"] == "in")
    check("no winner yet", series["winner"] is None)

    # --- Case 2: completed WNBA first-round 2-0 sweep ---
    events2 = [
        _ev(3, "500001", "First Round - Game 1", "Las Vegas Aces", "New York Liberty",
            88, 70, status="STATUS_FINAL", home_id="11", away_id="22",
            series={"type": "playoff", "summary": "Aces win 2-0", "completed": True,
                    "totalCompetitions": 3, "competitors": [{"id": "11", "wins": 1}, {"id": "22", "wins": 0}]}),
        _ev(3, "500002", "First Round - Game 2", "New York Liberty", "Las Vegas Aces",
            60, 75, status="STATUS_FINAL", home_id="22", away_id="11",
            series={"type": "playoff", "summary": "Aces win series 2-0", "completed": True,
                    "totalCompetitions": 3, "competitors": [{"id": "11", "wins": 2}, {"id": "22", "wins": 0}]}),
    ]
    seeds2 = {}  # unknown seeds -> high = home of game 1
    raw2, unassigned2 = parse_events("wnba", events2, wnba_franchises, seeds2)
    check("wnba games parsed", len(raw2) == 2 and unassigned2 == [])
    groups2 = group_series("wnba", raw2)
    key2 = next(iter(groups2))
    series2 = build_series("wnba", key2, groups2[key2], wnba_franchises, seeds2, 2026)
    check("wnba high = home of game 1 (seeds unknown)", series2["high"]["name"] == "Las Vegas Aces")
    check("wnba sweep 2-0", series2["high"]["wins"] == 2 and series2["low"]["wins"] == 0)
    check("wnba series completed", series2["state"] == "post" and series2["winner"] == "high")

    # --- Case 3: WNBA Finals game with no headline -> unassigned ---
    events3 = [_ev(3, "500099", "", "Las Vegas Aces", "New York Liberty",
                    status="STATUS_SCHEDULED", home_id="11", away_id="22")]
    raw3, unassigned3 = parse_events("wnba", events3, wnba_franchises, {})
    check("no-headline game unassigned", raw3 == [] and len(unassigned3) == 1)
    check("unassigned carries headline field", unassigned3[0]["headline"] is None)

    # --- Case 4: disagreement with ESPN's series wins must raise ---
    events4 = [
        _ev(3, "401101", "NLDS - Game 1", "Los Angeles Dodgers", "Philadelphia Phillies",
            3, 1, status="STATUS_FINAL", home_id="30", away_id="40",
            series={"type": "playoff", "summary": "Series tied", "completed": False,
                    "totalCompetitions": 5,
                    # ESPN says team 30 has 0 wins; we derived 1. Must refuse.
                    "competitors": [{"id": "30", "wins": 0}, {"id": "40", "wins": 0}]}),
    ]
    dodgers_map = {"los angeles dodgers": {"name": "Los Angeles Dodgers", "slug": "dodgers"},
                   "philadelphia phillies": {"name": "Philadelphia Phillies", "slug": "phillies"}}
    raw4, _ = parse_events("mlb", events4, dodgers_map, {})
    groups4 = group_series("mlb", raw4)
    key4 = next(iter(groups4))
    raised = False
    try:
        build_series("mlb", key4, groups4[key4], dodgers_map, {}, 2026)
    except SeriesReconciliationError:
        raised = True
    check("disagreement raises SeriesReconciliationError", raised)

    # --- CANCELED/POSTPONED events dropped entirely ---
    events5 = [
        _ev(3, "401200", "ALDS - Game 1", "New York Yankees", "Boston Red Sox",
            status="STATUS_POSTPONED"),
        _ev(3, "401201", "ALDS - Game 1", "New York Yankees", "Boston Red Sox",
            status="STATUS_CANCELED"),
    ]
    raw5, unassigned5 = parse_events("mlb", events5, mlb_franchises, {})
    check("postponed/canceled dropped", raw5 == [] and unassigned5 == [])

    # --- season.type filter: only 3 (postseason) is kept ---
    events6 = [_ev(2, "999999", "ALDS - Game 1", "New York Yankees", "Boston Red Sox")]
    raw6, unassigned6 = parse_events("mlb", events6, mlb_franchises, {})
    check("non-postseason dropped", raw6 == [] and unassigned6 == [])

    # --- to_bundle / champion / rounds-always-emitted shape ---
    bundle = to_bundle("wnba", 2026, {"r1": [series2]}, unassigned3)
    check("all wnba rounds emitted", [r["key"] for r in bundle["rounds"]] == ["r1", "sf", "finals"])
    check("empty rounds still have series: []", bundle["rounds"][1]["series"] == [])
    check("meta games count includes unassigned", bundle["meta"]["games"] == 2 + 1)
    check("not complete (finals round empty)", bundle["meta"]["complete"] is False)

    finals_win = dict(series2)
    finals_win["winner"] = "high"
    bundle_complete = to_bundle("wnba", 2026, {"finals": [finals_win]}, [])
    check("champion set when title round has a winner", bundle_complete["champion"]["name"] == "Las Vegas Aces")
    check("complete flag set", bundle_complete["meta"]["complete"] is True)

    # --- empty bundle is valid shape ---
    eb = empty_bundle("mlb", 2026)
    check("empty bundle has all rounds, no series", all(r["series"] == [] for r in eb["rounds"]))
    check("empty bundle champion null", eb["champion"] is None)

    print("playoff_series self-test OK -- %d checks" % ok[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", default="all", choices=["mlb", "wnba", "all"])
    ap.add_argument("--season", type=int, default=dt.date.today().year)
    ap.add_argument("--out", default=os.path.join(ROOT, "public", "data"))
    ap.add_argument("--dry", action="store_true", help="print the bundle, do not write")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fixtures", default=None, help="read scoreboard/standings JSON from this dir instead of the network")
    ap.add_argument("--empty", action="store_true", help="write an empty-but-valid bundle, no network call")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    leagues = ["mlb", "wnba"] if args.league == "all" else [args.league]
    for league in leagues:
        try:
            if args.empty:
                bundle = empty_bundle(league, args.season)
            else:
                bundle = build(league, args.season, fixtures_dir=args.fixtures)
        except SeriesReconciliationError as e:
            print("[%s] REFUSING TO WRITE: %s" % (league, e), file=sys.stderr)
            sys.exit(2)
        if args.dry:
            print(json.dumps(bundle, indent=2))
            continue
        path = write_bundle(bundle, league, args.out)
        print("[%s] %s: %d games, %d unassigned%s" % (
            league, path, bundle["meta"]["games"], bundle["meta"]["unassigned_games"],
            "; CHAMPION: %s" % bundle["champion"]["name"] if bundle["champion"] else ""))


if __name__ == "__main__":
    main()
