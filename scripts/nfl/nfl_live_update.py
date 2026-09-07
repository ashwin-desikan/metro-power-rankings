#!/usr/bin/env python3
"""
Carry the live NFL season's Elo from ESPN alone, with no workbook anywhere.

WHAT THIS IS
------------
`scripts/build-nfl-elo.py` builds the whole 1920-2026 spine out of NFL_all.xlsx
and, for a season that is not final, carries the ratings forward in Python from
the week-0 seed with `live_chain()`. That works, and it needs a 58 MB workbook
on a Windows machine that has to be awake.

This script is the site half of the same job with the workbook removed. It
needs exactly two things:

  1. the week-0 seeds, which are ALREADY PUBLISHED in
     public/data/nfl/elo/seasons/<season>.json (the preseason board), and
  2. the schedule with results, which ESPN's scoreboard hands over one week at
     a time.

It then calls the SAME `live_chain()` the workbook path calls, with the same
`elo_shift`, the same `win_probability` and the same 65-point home edge, and
rewrites the season shard and upcoming.json. Nothing here is a second model:
if this and build-nfl-elo.py are given the same games they produce the same
numbers, and `--replay` in build-nfl-elo.py is the gate for both.

🔴 THE WORKBOOK HALF IS NOT THIS JOB. Writing Q/R/M and DM/DN/DO back into
NFL_all.xlsx (see HANDOFF 2026-09-06, "What the 2026 automation still needs")
remains open and still runs on the Windows box. The site does not wait for it:
if that job never runs, these files are still right.

🔴 THE SPINE IS COMMITTED SO THE ACTION NEVER NEEDS A WORKBOOK OR A MINI.
`--write` emits public/data/nfl/elo/spine-<season>.json = {seeds, schedule}.
A later run merges what ESPN gives it ONTO that file, so a truncated ESPN
answer loses nothing, and the run refuses to write at all if the number of
played games would go DOWN.

ESPN CONVENTIONS THIS REPO ALREADY LEARNED (lib/espnFetch.ts, lib/cfb-live.ts)
-----------------------------------------------------------------------------
  - Send NO User-Agent. Not a custom one, not a browser one. urllib sends
    "Python-urllib/3.x" unless you take it off the opener, so this does.
  - Pin seasontype=2 for the NFL regular season, and ask week by week.
  - Never pass limit=.
  - Read flags off the payload's own fields, never off a display string.

HOW CLOSE THIS IS TO THE WORKBOOK PATH, MEASURED
------------------------------------------------
Carrying 2025 week 1 from the published seeds and ESPN's scoreboard alone and
comparing to the workbook's own published week-1 ratings: mean 0.08 Elo across
32 teams, and every team inside 0.1 except two.

  - The 0.1s are the SEED'S OWN PRECISION. The shard publishes week 0 rounded to
    one decimal, so the chain starts up to 0.05 away from where the workbook
    started. It does not compound: each week is a fresh shift off the same
    rounded base.
  - The two that are not are the Chargers (+0.9) and the Chiefs (-0.8), which is
    ONE game: Sao Paulo, week 1 2025. ESPN flags it neutralSite, so this drops
    the 65-point home edge; the workbook gave the Chargers a home game. That is
    a difference of ruling, not of arithmetic, and this side is the defensible
    one. Expect the same on the Melbourne, London, Berlin and Madrid games.

DATES
-----
ESPN stamps a game in UTC, so a Sunday-night kickoff carries the NEXT day's
date. The workbook, and therefore every shard and the whole site, uses the US
Eastern calendar date. Kickoff minus 5 hours reproduces it for every NFL
kickoff time in both DST and standard time (the earliest kickoff ESPN carries
is a 09:30Z London game, which is 04:30 the same morning in New York), so that
is the conversion, and it is unit-tested rather than assumed.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import math
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ELO = ROOT / "public" / "data" / "nfl" / "elo"
FIRST_WEEK, LAST_WEEK = 1, 18
ESPN_SCOREBOARD = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl"
                   "/scoreboard?dates=%d&seasontype=2&week=%d")


def _load_builder():
    """Import scripts/build-nfl-elo.py, whose name is not an identifier.

    🔴 IMPORTED, NEVER REIMPLEMENTED. elo_shift, win_probability, HFA_ELO and
    live_chain live there and are proved there by --replay and --self-test. A
    copy here would be a second model with a second set of bugs.
    """
    path = ROOT / "scripts" / "build-nfl-elo.py"
    spec = importlib.util.spec_from_file_location("build_nfl_elo", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


B = _load_builder()


# --------------------------------------------------------------- the name map

# 🔴 AN EXPLICIT TABLE, NOT A HEURISTIC. ESPN says "Washington Commanders";
# the shard's canonical name is the nickname alone, "Commanders", with the city
# carried separately. Nickname-splitting would work today and break the first
# time a franchise moves or ESPN renames one, silently dropping that team's
# games out of the chain and leaving its rating frozen with no error anywhere.
# The self-test proves this table is a BIJECTION against espn-teams.json and
# against the published shard: 32 in, 32 out, nothing guessed.
ESPN_TO_SHARD = {
    "Arizona Cardinals": "Cardinals",
    "Atlanta Falcons": "Falcons",
    "Baltimore Ravens": "Ravens",
    "Buffalo Bills": "Bills",
    "Carolina Panthers": "Panthers",
    "Chicago Bears": "Bears",
    "Cincinnati Bengals": "Bengals",
    "Cleveland Browns": "Browns",
    "Dallas Cowboys": "Cowboys",
    "Denver Broncos": "Broncos",
    "Detroit Lions": "Lions",
    "Green Bay Packers": "Packers",
    "Houston Texans": "Texans",
    "Indianapolis Colts": "Colts",
    "Jacksonville Jaguars": "Jaguars",
    "Kansas City Chiefs": "Chiefs",
    "Las Vegas Raiders": "Raiders",
    "Los Angeles Chargers": "Chargers",
    "Los Angeles Rams": "Rams",
    "Miami Dolphins": "Dolphins",
    "Minnesota Vikings": "Vikings",
    "New England Patriots": "Patriots",
    "New Orleans Saints": "Saints",
    "New York Giants": "Giants",
    "New York Jets": "Jets",
    "Philadelphia Eagles": "Eagles",
    "Pittsburgh Steelers": "Steelers",
    "San Francisco 49ers": "49ers",
    "Seattle Seahawks": "Seahawks",
    "Tampa Bay Buccaneers": "Buccaneers",
    "Tennessee Titans": "Titans",
    "Washington Commanders": "Commanders",
}

# The city the shard carries for each canonical name, so upcoming.json keeps the
# home_city/away_city fields lib/nflElo.ts declares even with no workbook.
SHARD_CITY = {v: k[: -(len(v) + 1)] for k, v in ESPN_TO_SHARD.items()}


def shard_name(espn_display: str) -> str | None:
    return ESPN_TO_SHARD.get((espn_display or "").strip())


# ------------------------------------------------------------------- parsing

def eastern_date(raw: str) -> str | None:
    """ESPN's UTC stamp ('2026-09-11T00:35Z') -> the US Eastern calendar date."""
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M%z"):
        try:
            t = dt.datetime.strptime(raw or "", fmt)
        except ValueError:
            continue
        return (t.replace(tzinfo=None) - dt.timedelta(hours=5)).date().isoformat()
    return None


def kickoff_iso(raw: str) -> str | None:
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return dt.datetime.strptime(raw, fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (ValueError, TypeError):
            pass
    return None


def parse_scoreboard(payload: dict, season: int, warn=print) -> list[dict]:
    """One dict per game, in the shape live_chain() and upcoming.json consume.

    An unplayed game carries home_pts/away_pts None: live_chain prices those and
    never rates them, which is the whole reason the preseason board can publish
    week-1 probabilities before a snap.
    """
    out = []
    default_week = ((payload or {}).get("week") or {}).get("number")
    for ev in (payload or {}).get("events", []):
        se = ev.get("season") or {}
        # seasontype 2 only. A postseason game would be week 1 all over again.
        if se.get("type") not in (None, 2):
            continue
        if se.get("year") not in (None, season):
            continue
        comp = (ev.get("competitions") or [{}])[0]
        week = (ev.get("week") or {}).get("number") or default_week
        if not week:
            continue
        home = away = None
        hs = as_ = None
        for c in comp.get("competitors", []):
            nm = shard_name(((c.get("team") or {}).get("displayName")))
            try:
                sc = int(c.get("score"))
            except (TypeError, ValueError):
                sc = None
            if c.get("homeAway") == "home":
                home, hs = nm, sc
            elif c.get("homeAway") == "away":
                away, as_ = nm, sc
        if not home or not away:
            warn(f"  SKIP event {ev.get('id')}: unmapped team in {ev.get('shortName')!r}")
            continue
        completed = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))
        if completed and (hs is None or as_ is None):
            # Completed with no score is not a result. Never invent one.
            warn(f"  SKIP score for {ev.get('shortName')}: completed with no score")
            completed = False
        venue = comp.get("venue") or {}
        country = ((venue.get("address") or {}).get("country") or "").strip()
        # 🔴 NEUTRAL COMES OFF THE FLAG, AND A FOREIGN VENUE IS THE BACKSTOP.
        # The Melbourne game (Rams "home" vs the 49ers at the MCG, week 1 2026)
        # and the international series carry neutralSite true; the venue country
        # is the second reading so a missing flag cannot silently hand a team a
        # 65-point home edge it never had.
        neutral = bool(comp.get("neutralSite")) or (country not in ("", "USA"))
        out.append({
            "id": str(ev.get("id") or ""),
            "week": int(week),
            "date": eastern_date(ev.get("date") or ""),
            "kickoff": kickoff_iso(ev.get("date") or ""),
            "home": home, "away": away,
            "home_city": SHARD_CITY.get(home), "away_city": SHARD_CITY.get(away),
            "neutral": neutral,
            "phase": "Reg. Season",
            "venue": venue.get("fullName"),
            "home_pts": hs if completed else None,
            "away_pts": as_ if completed else None,
        })
    return out


# --------------------------------------------------------------- the sources

def fetch_week(season: int, week: int) -> dict:
    """ESPN's scoreboard for one week. NO User-Agent; see lib/espnFetch.ts."""
    opener = urllib.request.build_opener()
    opener.addheaders = [("Accept", "application/json")]
    with opener.open(ESPN_SCOREBOARD % (season, week), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fixture_payloads(fixtures: Path, season: int) -> list[tuple[int, dict]]:
    """espn-<season>-w<week>.json out of a directory, in week order."""
    out = []
    for p in sorted(fixtures.glob(f"espn-{season}-w*.json")):
        try:
            week = int(p.stem.split("-w")[-1])
        except ValueError:
            continue
        out.append((week, json.loads(p.read_text(encoding="utf-8"))))
    return sorted(out)


def gather(season: int, fixtures: Path | None, warn=print) -> list[dict]:
    games: list[dict] = []
    if fixtures is not None:
        payloads = fixture_payloads(fixtures, season)
        if not payloads:
            warn(f"  no espn-{season}-w*.json under {fixtures}")
        for week, payload in payloads:
            got = parse_scoreboard(payload, season, warn)
            print(f"  fixture week {week:>2}: {len(got)} games, "
                  f"{sum(1 for g in got if g['home_pts'] is not None)} played")
            games += got
    else:
        for week in range(FIRST_WEEK, LAST_WEEK + 1):
            got = parse_scoreboard(fetch_week(season, week), season, warn)
            print(f"  espn week {week:>2}: {len(got)} games, "
                  f"{sum(1 for g in got if g['home_pts'] is not None)} played")
            games += got
    return games


def merge_schedule(base: list[dict], fresh: list[dict]) -> list[dict]:
    """Fresh games win; games only the committed spine knows about survive.

    🔴 A TRUNCATED ESPN ANSWER MUST NEVER ERASE A GAME. ESPN answering one week
    with an empty events list is a normal transient, and a schedule rebuilt from
    that answer alone would drop a whole week of results out of the chain.
    """
    by_key: dict[str, dict] = {}
    for g in base:
        by_key[game_key(g)] = g
    for g in fresh:
        k = game_key(g)
        prev = by_key.get(k)
        # A fresh row with no score does not overwrite a stored result.
        if prev is not None and prev.get("home_pts") is not None and g.get("home_pts") is None:
            merged = dict(g)
            merged["home_pts"] = prev["home_pts"]
            merged["away_pts"] = prev["away_pts"]
            by_key[k] = merged
        else:
            by_key[k] = g
    return sorted(by_key.values(), key=lambda g: (g["week"], g["date"] or "", g["home"]))


def game_key(g: dict) -> str:
    """ESPN's event id where there is one, else week + the two teams."""
    return g.get("id") or f"{g['week']}|" + "|".join(sorted([g["home"], g["away"]]))


# ------------------------------------------------------------------ the shard

def read_seeds(shard: dict) -> dict[str, float]:
    """Week-0 ratings out of the published preseason board."""
    out = {}
    for t in shard.get("teams", []):
        for w in t.get("weeks", []):
            if w.get("w") == 0 and w.get("e") is not None:
                out[t["name"]] = float(w["e"])
                break
    return out


def rebuild_teams(shard: dict, chain: dict, games: list[dict]) -> None:
    """Rewrite teams[].weeks in place from the chain, keeping week 0 intact."""
    by_name = {t["name"]: t for t in shard["teams"]}
    last = chain["last"]

    # Cumulative record and points, from the results alone.
    rec: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    pts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    rec_at: dict[tuple[str, int], list[int]] = {}
    pts_at: dict[tuple[str, int], list[int]] = {}
    last_date: dict[int, str] = {}
    for g in sorted(games, key=lambda g: (g["week"], g["date"] or "")):
        if g["home_pts"] is None or g["away_pts"] is None or g["week"] > last:
            continue
        h, a, hp, ap = g["home"], g["away"], g["home_pts"], g["away_pts"]
        for team, f, ag in ((h, hp, ap), (a, ap, hp)):
            rec[team][0 if f > ag else 1 if f < ag else 2] += 1
            pts[team][0] += f
            pts[team][1] += ag
            rec_at[(team, g["week"])] = list(rec[team])
            pts_at[(team, g["week"])] = list(pts[team])
        if g["date"]:
            last_date[g["week"]] = max(last_date.get(g["week"], ""), g["date"])

    for wk in range(1, last + 1):
        standing = sorted(
            ((nm, rows[wk][0]) for nm, rows in chain["weeks"].items()
             if wk in rows and nm in by_name),
            key=lambda x: -x[1],
        )
        rank_of = {nm: i + 1 for i, (nm, _) in enumerate(standing)}
        for nm, elo in standing:
            t = by_name[nm]
            entry = {"w": wk, "e": round(elo, 1), "r": rank_of[nm]}
            # 🔴 A BYE IS A CARRIED WEEK, NOT A MISSING ONE. live_chain marks it;
            # the charts draw a carried week as held rather than as measured.
            if chain["weeks"][nm][wk][1]:
                entry["carried"] = True
            # The record is carried forward through a bye, like the rating.
            r = rec_at.get((nm, wk)) or _last_before(rec_at, nm, wk)
            p = pts_at.get((nm, wk)) or _last_before(pts_at, nm, wk)
            if r:
                entry["rec"] = r
            if p:
                entry["pts"] = p
            if last_date.get(wk):
                entry["d"] = last_date[wk]
            entry["ph"] = "Reg. Season"
            t["weeks"].append(entry)

    for t in shard["teams"]:
        wks = t["weeks"]
        rated = [x for x in wks if not x.get("carried")]
        peak = max(rated or wks, key=lambda x: x["e"])
        trough = min(rated or wks, key=lambda x: x["e"])
        t["start"] = wks[0]["e"]
        t["end"] = wks[-1]["e"]
        t["peak"] = {"w": peak["w"], "e": peak["e"]}
        t["trough"] = {"w": trough["w"], "e": trough["e"]}
        with_rec = [x for x in wks if x.get("rec")]
        with_pts = [x for x in wks if x.get("pts")]
        if with_rec:
            t["rec"] = with_rec[-1]["rec"]
        if with_pts:
            t["pts"] = with_pts[-1]["pts"]


def _last_before(store: dict, nm: str, wk: int):
    for w in range(wk - 1, 0, -1):
        if (nm, w) in store:
            return list(store[(nm, w)])
    return None


def strip_live_weeks(shard: dict) -> None:
    """Back to the week-0 seed, so a rerun is idempotent rather than additive."""
    for t in shard["teams"]:
        t["weeks"] = [w for w in t["weeks"] if w.get("w") == 0]


# -------------------------------------------------------------------- the run

def played(games: list[dict]) -> int:
    return sum(1 for g in games if g["home_pts"] is not None and g["away_pts"] is not None)


def run(season: int, fixtures: Path | None, write: bool) -> int:
    shard_path = ELO / "seasons" / f"{season}.json"
    spine_path = ELO / f"spine-{season}.json"
    if not shard_path.exists():
        print(f"ABORT: no season shard at {shard_path}")
        return 1
    shard = json.loads(shard_path.read_text(encoding="utf-8"))
    strip_live_weeks(shard)
    seeds = read_seeds(shard)
    if not seeds:
        print("ABORT: the shard carries no week-0 seeds; nothing to carry forward.")
        return 1
    print(f"season {season}: {len(seeds)} week-0 seeds from {shard_path.name}")

    spine = {}
    if spine_path.exists():
        spine = json.loads(spine_path.read_text(encoding="utf-8"))
    base = spine.get("schedule", [])
    print(f"spine on disk: {len(base)} games, {played(base)} played"
          if base else "spine on disk: none yet")

    fresh = gather(season, fixtures)
    games = merge_schedule(base, fresh)
    now, before = played(games), played(base)
    print(f"schedule: {len(games)} games, {now} played "
          f"(spine had {before})")

    # 🔴 RESULTS NEVER GO BACKWARDS. A short or empty ESPN answer is a transient,
    # not a correction, and a shard rebuilt from one would delete a week of
    # football that actually happened.
    if now < before:
        print(f"ABORT: played games fell from {before} to {now}. "
              f"ESPN answered short; nothing written.")
        return 1

    chain = B.live_chain(None, season, seeds, games)
    last = chain["last"]
    rebuild_teams(shard, chain, games)

    if last > 0:
        shard["status"] = "live"
        shard["dropped_weeks"] = []
        shard["reg_end_week"] = {"NFL": min(last, LAST_WEEK)}
    else:
        print("nothing played yet: the season stays the preseason board it is.")

    meta = dict(shard.get("meta") or {})
    meta["generated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    meta["source"] = ("ESPN scoreboard, carried in Python from the week-0 seed "
                      "(no workbook); seeds from NFL_all.xlsx via build-nfl-elo.py")
    shard["meta"] = meta

    up = B.build_upcoming(None, season, shard, games)
    up_out = {"meta": meta, **up}

    # ------------------------------------------------------------- summary
    movers = sorted(shard["teams"], key=lambda t: -abs(t["end"] - t["start"]))[:5]
    print()
    print(f"SUMMARY  season {season}  status {shard['status']}")
    print(f"  games played : {now} of {len(games)}")
    print(f"  last week    : {last}")
    print(f"  upcoming     : {up['games']} games, {up['priced']} priced from "
          f"week {up['last_rated_week']} ratings, {up['games'] - up['priced']} pending")
    print("  biggest movers (Elo now against the week-0 seed):")
    for t in movers:
        d = t["end"] - t["start"]
        rec = t.get("rec")
        recs = f"  {rec[0]}-{rec[1]}" + (f"-{rec[2]}" if rec and rec[2] else "") if rec else ""
        print(f"    {t['name']:<12} {t['start']:>7.1f} -> {t['end']:>7.1f}  {d:+7.1f}{recs}")

    if not write:
        print()
        print("(dry-run; nothing written. Pass --write to commit the shard, "
              "the spine and upcoming.json.)")
        return 0

    shard_path.write_text(json.dumps(shard, separators=(",", ":")), encoding="utf-8")
    spine_path.write_text(json.dumps({
        "meta": {
            "generated_at": meta["generated_at"],
            "source": "ESPN scoreboard (seasontype=2) + the published week-0 seeds",
            "note": ("The site half of the 2026 automation depends on this file "
                     "and nothing else. The workbook half is separate and open."),
        },
        "season": season,
        "seeds": seeds,
        "schedule": games,
    }, separators=(",", ":")), encoding="utf-8")
    (ELO / "upcoming.json").write_text(json.dumps(up_out, separators=(",", ":")),
                                       encoding="utf-8")
    print()
    print(f"wrote {shard_path.name}, {spine_path.name} and upcoming.json "
          f"under {ELO}")
    return 0


# ------------------------------------------------------------------ self-test

def self_test(fixtures: Path | None) -> int:
    fails: list[str] = []
    checks = 0

    def check(ok, msg):
        nonlocal checks
        checks += 1
        if not ok:
            fails.append(msg)

    # 1. The name map is a bijection with the shard's own 32 names.
    shard_path = ELO / "seasons" / "2026.json"
    if shard_path.exists():
        names = {t["name"] for t in json.loads(shard_path.read_text(encoding="utf-8"))["teams"]}
        check(set(ESPN_TO_SHARD.values()) == names,
              f"name map != shard names: only-map {sorted(set(ESPN_TO_SHARD.values()) - names)}, "
              f"only-shard {sorted(names - set(ESPN_TO_SHARD.values()))}")
        check(len(names) == 32, f"the 2026 shard carries {len(names)} teams, not 32")
    else:
        check(False, "no public/data/nfl/elo/seasons/2026.json to check the map against")

    # 2. Every ESPN team resolves, and no two resolve to the same shard team.
    check(len(set(ESPN_TO_SHARD.values())) == len(ESPN_TO_SHARD) == 32,
          f"the map is not 32 distinct pairs: {len(ESPN_TO_SHARD)} keys, "
          f"{len(set(ESPN_TO_SHARD.values()))} values")
    teams_file = (fixtures / "espn-teams.json") if fixtures and fixtures.is_dir() else None
    if teams_file and teams_file.exists():
        d = json.loads(teams_file.read_text(encoding="utf-8"))
        espn = {t["team"]["displayName"]
                for t in d["sports"][0]["leagues"][0]["teams"]}
        check(espn == set(ESPN_TO_SHARD),
              f"ESPN teams != map keys: only-espn {sorted(espn - set(ESPN_TO_SHARD))}, "
              f"only-map {sorted(set(ESPN_TO_SHARD) - espn)}")
        check(all(shard_name(n) for n in espn), "an ESPN team did not resolve")
        print(f"  name map: {len(espn)}/{len(ESPN_TO_SHARD)} ESPN teams resolve, "
              f"one to one")
    else:
        print("  (no espn-teams.json in --fixtures; the 32/32 check against "
              "ESPN's own team list was NOT run)")

    # 3. Eastern date conversion, including the two that roll a day.
    for raw, want in (("2026-09-11T00:35Z", "2026-09-10"),   # Melbourne, MCG
                      ("2026-09-10T00:20Z", "2026-09-09"),   # Thursday opener
                      ("2026-09-13T17:00Z", "2026-09-13"),   # Sunday 1pm ET
                      ("2026-01-05T01:20Z", "2026-01-04")):  # Sunday night, EST
        got = eastern_date(raw)
        check(got == want, f"eastern_date({raw}) -> {got}, expected {want}")

    # 4. The fixtures: 2025 week 1 is a played week, 2026 week 1 is not.
    if fixtures and fixtures.is_dir():
        p25 = fixtures / "espn-2025-w1.json"
        if p25.exists():
            g = parse_scoreboard(json.loads(p25.read_text(encoding="utf-8")), 2025,
                                 warn=lambda m: None)
            check(len(g) == 16, f"2025 week 1 parsed {len(g)} games, expected 16")
            check(played(g) == 16, f"2025 week 1: {played(g)} of 16 carry scores")
            check(all(w == 1 for w in {x["week"] for x in g}), "2025 week 1 is not all week 1")
            neutral = [x for x in g if x["neutral"]]
            check(len(neutral) == 1,
                  f"2025 week 1 neutral sites: {len(neutral)}, expected 1 (Sao Paulo)")
            print(f"  2025 w1: {len(g)} games, {played(g)} played, "
                  f"{len(neutral)} neutral ({neutral[0]['venue'] if neutral else '-'})")
        else:
            check(False, f"no {p25}")

        p26 = fixtures / "espn-2026-w1.json"
        if p26.exists():
            g = parse_scoreboard(json.loads(p26.read_text(encoding="utf-8")), 2026,
                                 warn=lambda m: None)
            check(len(g) == 16, f"2026 week 1 parsed {len(g)} games, expected 16")
            check(played(g) == 0,
                  f"2026 week 1: {played(g)} games are already marked completed in "
                  f"the fixture, expected 0")
            neutral = [x for x in g if x["neutral"]]
            check(len(neutral) == 1,
                  f"2026 week 1 neutral sites: {len(neutral)}, expected 1 (Melbourne)")
            check(bool(neutral) and {neutral[0]["home"], neutral[0]["away"]} == {"Rams", "49ers"},
                  "the 2026 neutral-site game is not the Rams and the 49ers")
            print(f"  2026 w1: {len(g)} games, {played(g)} played, "
                  f"{len(neutral)} neutral ({neutral[0]['venue'] if neutral else '-'})")
        else:
            check(False, f"no {p26}")
    else:
        # 🔴 SKIPPED, NOT FAILED. The Action runs the self-test on a runner that
        # has no fixture directory; the pure logic below still has to pass there.
        print("  (no fixture directory; the scoreboard parse checks were NOT run)")

    # 5. A two-game chain against the arithmetic written out longhand.
    #    Written from the workbook formula independently of elo_shift, so this
    #    catches a change to elo_shift rather than agreeing with it by
    #    construction. Game 1: A home, wins 24-20 from 1500 vs 1500. Game 2 in
    #    week 2: B home, wins 30-10, from the ratings game 1 left.
    edge1 = 65.0
    p1 = 1 / (1 + 10 ** (-edge1 / 400))
    d1 = 20 * (math.log(5) * (2.2 / (edge1 * 0.001 + 2.2))) * (1 - p1)
    edge2 = 65.0 - 2 * d1
    p2 = 1 / (1 + 10 ** (-edge2 / 400))
    d2 = 20 * (math.log(21) * (2.2 / (edge2 * 0.001 + 2.2))) * (1 - p2)
    check(abs(d1 - 12.741551064092334) < 1e-9, f"hand-computed shift drifted: {d1!r}")
    synth = [
        {"week": 1, "date": "2026-09-13", "home": "Aardvarks", "away": "Bisons",
         "neutral": False, "home_pts": 24, "away_pts": 20},
        {"week": 2, "date": "2026-09-20", "home": "Bisons", "away": "Aardvarks",
         "neutral": False, "home_pts": 30, "away_pts": 10},
    ]
    ch = B.live_chain(None, 2026, {"Aardvarks": 1500.0, "Bisons": 1500.0}, synth)
    a1, b1 = ch["weeks"]["Aardvarks"][1][0], ch["weeks"]["Bisons"][1][0]
    a2, b2 = ch["weeks"]["Aardvarks"][2][0], ch["weeks"]["Bisons"][2][0]
    check(abs(a1 - (1500 + d1)) < 1e-9, f"week 1 home rating {a1!r} != {1500 + d1!r}")
    check(abs(b1 - (1500 - d1)) < 1e-9, f"week 1 away rating {b1!r} != {1500 - d1!r}")
    check(abs(a2 - (1500 + d1 - d2)) < 1e-9, f"week 2 away rating {a2!r} != {1500 + d1 - d2!r}")
    check(abs(b2 - (1500 - d1 + d2)) < 1e-9, f"week 2 home rating {b2!r} != {1500 - d1 + d2!r}")
    check(abs(a2 - 1486.2206483409475) < 1e-9, f"two-game chain landed at {a2!r}")
    check(ch["last"] == 2, f"chain last week {ch['last']}, expected 2")

    # 6. A neutral site takes the home edge away, and only that.
    n = B.live_chain(None, 2026, {"Aardvarks": 1500.0, "Bisons": 1500.0}, [
        {"week": 1, "date": "2026-09-13", "home": "Aardvarks", "away": "Bisons",
         "neutral": True, "home_pts": 24, "away_pts": 20}])
    dn = n["weeks"]["Aardvarks"][1][0] - 1500
    # Equal ratings on neutral ground: the edge is 0, so the margin multiplier
    # is ln(5) undamped and the probability is exactly a coin flip.
    check(abs(dn - 20 * math.log(5) * 0.5) < 1e-9,
          f"neutral-site shift {dn!r} is not the even-money shift")

    # 7. A bye is carried, not dropped.
    ch3 = B.live_chain(None, 2026, {"Aardvarks": 1500.0, "Bisons": 1500.0, "Cranes": 1500.0},
                       synth)
    check(ch3["weeks"]["Cranes"][2] == (1500.0, True),
          f"a team on bye is not carried: {ch3['weeks']['Cranes'][2]!r}")

    # 8. The merge never loses a stored result to a fresh unplayed row.
    stored = [{"id": "1", "week": 1, "date": "2026-09-13", "home": "Rams",
               "away": "49ers", "home_pts": 20, "away_pts": 17, "neutral": True}]
    incoming = [{"id": "1", "week": 1, "date": "2026-09-13", "home": "Rams",
                 "away": "49ers", "home_pts": None, "away_pts": None, "neutral": True}]
    m = merge_schedule(stored, incoming)
    check(len(m) == 1 and m[0]["home_pts"] == 20,
          f"merge lost a stored result: {m!r}")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"[self-test] {checks - len(fails)}/{checks} checks passed")
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--write", action="store_true",
                    help="write the shard, the spine and upcoming.json. "
                         "Dry-run is the default.")
    ap.add_argument("--dry-run", action="store_true",
                    help="explicit no-op; this is already the default")
    ap.add_argument("--fixtures", metavar="DIR",
                    help="read espn-<season>-w<week>.json from DIR instead of "
                         "calling ESPN")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)

    fixtures = Path(args.fixtures) if args.fixtures else None

    # Self-test first, always, before any network call. CLAUDE.md's working loop.
    rc = self_test(fixtures)
    if args.self_test:
        return rc
    if rc:
        print("ABORT: self-test failed; ESPN was not called and nothing was written.")
        return rc
    return run(args.season, fixtures, args.write and not args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
