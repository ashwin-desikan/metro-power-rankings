#!/usr/bin/env python3
"""NFL postseason bracket: ESPN seasontype=3 -> public/data/nfl/playoffs.json.

WHAT THIS IS
------------
The AFL and NRL hubs have carried a finals bracket since August
(scripts/ingest/footy_finals.py -> public/data/{afl,nrl}/finals.json, rendered
by app/teams/_shared/FinalsBracket.tsx). Ashwin asked for the same idiom on the
NFL hub in January. This is the NFL feed for that component, and it writes the
SAME bundle shape on purpose:

    {"meta": {"league", "season", "generated_at", "complete"},
     "weeks": [{"week", "label", "games": [
        {"week", "code", "round", "date", "venue", "neutral",
         "home": {"name", "slug", "score", "winner", "seed"}, "away": {...},
         "state", "completed", "winner"}]}],
     "premier": {"name", "slug"} | null}

`neutral` and the sides' `seed` are the only fields finals.json does not carry.
Both are optional to the renderer: the Australian codes emit neither and draw
exactly what they drew before.

THE POSTSEASON WEEKS, AND THE ONE THAT IS NOT FOOTBALL
------------------------------------------------------
ESPN files the whole postseason under seasontype=3, numbered from 1:

    1  Wild Card          6 games
    2  Divisional Round   4 games
    3  Conference Champs  2 games
    4  THE PRO BOWL GAMES -- excluded, see below
    5  Super Bowl         1 game

🔴 WEEK 4 IS THE PRO BOWL AND MUST NEVER REACH THE BRACKET. It is an
all-star exhibition between two squads ESPN names "AFC" and "NFC", it carries a
score, and it is marked completed, so nothing downstream would notice it. It is
excluded THREE ways, because a week renumbering must not be able to let it in:

  1. by week number (PRO_BOWL_WEEK),
  2. by name -- any event whose name, shortName or note headline matches
     PRO_BOWL_RE ("Pro Bowl"), at any week number,
  3. by teams -- an event where NEITHER side resolves to one of the 32
     franchises is not a fixture between clubs and is dropped with a warning.

Guard 3 is the one that still works if the NFL renames the game again (it has
been the "Pro Bowl Games" only since 2023).

TEAM NAMES
----------
ESPN_TO_SHARD is imported from scripts/nfl/nfl_live_update.py rather than
copied: it is the same 32-row table, proved there against ESPN's own team list
and against the published Elo shard, and a second copy would be a second thing
to keep right. The shard's canonical name is the nickname alone ("Commanders");
the site's franchise name and page slug want the full "Washington Commanders",
which is SHARD_CITY + nickname, i.e. ESPN's displayName. The self-test pins
every resolved slug against public/data/nfl/franchises.json, so a rename shows
up as a failed check rather than as a dead link.

An ESPN name the table does not know is passed through UNLINKED (name kept,
slug null) with a warning, exactly as footy_finals.py does: a rebrand must not
kill the feed in the middle of the playoffs.

Usage:
    python3 scripts/nfl/nfl_playoffs.py --self-test --fixtures /tmp/espn
    python3 scripts/nfl/nfl_playoffs.py --season 2025 --fixtures /tmp/espn
    python3 scripts/nfl/nfl_playoffs.py --season 2026 --write

Dry run is the default. No secrets, no Supabase: a read-only public feed to
committed JSON.
"""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "nfl" / "playoffs.json"
FRANCHISES = ROOT / "public" / "data" / "nfl" / "franchises.json"

ESPN_SCOREBOARD = ("https://site.api.espn.com/apis/site/v2/sports/football/nfl"
                   "/scoreboard?dates=%d&seasontype=3&week=%d")

FIRST_WEEK, LAST_WEEK = 1, 5
PRO_BOWL_WEEK = 4
PRO_BOWL_RE = re.compile(r"pro\s*bowl", re.I)
SUPER_BOWL_WEEK = 5

# Week -> (column label, the round each game in it belongs to).
WEEK_ROUNDS = {
    1: ("Wild Card", "Wild Card"),
    2: ("Divisional Round", "Divisional Round"),
    3: ("Conference Championships", "Conference Championship"),
    5: ("Super Bowl", "Super Bowl"),
}
# "Super Bowl LX" out of a name or a note headline. Roman numerals only, so a
# stray "Super Bowl Sunday" cannot become a round name.
SB_RE = re.compile(r"Super Bowl\s+([IVXLCDM]+)\b")
CONF_RE = re.compile(r"\b(AFC|NFC)\b")
# ESPN's "unranked" sentinel in curatedRank. A real NFL seed is 1 to 7.
MAX_SEED = 7


def _load_live_update():
    """Import scripts/nfl/nfl_live_update.py, whose name is not an identifier.

    🔴 IMPORTED, NEVER COPIED. ESPN_TO_SHARD and SHARD_CITY are proved there
    (bijection against espn-teams.json and against the 2026 shard) and the
    import costs nothing: that module's own import of build-nfl-elo.py is pure
    Python with no workbook read at import time.
    """
    path = Path(__file__).with_name("nfl_live_update.py")
    spec = importlib.util.spec_from_file_location("nfl_live_update", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_LU = _load_live_update()
ESPN_TO_SHARD = _LU.ESPN_TO_SHARD
SHARD_CITY = _LU.SHARD_CITY

# ESPN displayName -> the site's NFL franchise name. Identical strings today,
# but built through the proved table rather than trusted, so an ESPN name the
# table has never seen resolves to nothing instead of to a guess.
SITE_NAME = {
    espn: "%s %s" % (SHARD_CITY[nick], nick) for espn, nick in ESPN_TO_SHARD.items()
}


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))


def site_team(espn_display: str) -> tuple[str, str] | None:
    """ESPN displayName -> (site franchise name, /teams/nfl slug), or None."""
    name = SITE_NAME.get((espn_display or "").strip())
    if not name:
        return None
    return name, slugify(name)


# ------------------------------------------------------------------- parsing

def _seed(comp: dict) -> int | None:
    """A playoff seed when ESPN carries one, else None.

    ESPN puts 99 in curatedRank.current for "not ranked", which is what the NFL
    scoreboard carries for every postseason game measured to date. A number
    outside 1..7 is not an NFL seed and is dropped rather than rendered.
    """
    for raw in (comp.get("seed"), (comp.get("curatedRank") or {}).get("current")):
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if 1 <= n <= MAX_SEED:
            return n
    return None


def _side(comp: dict, home_away: str, warn: list) -> dict | None:
    """One competitor -> {name, slug, score, winner, seed} or None (TBC)."""
    for c in comp.get("competitors", []) or []:
        if c.get("homeAway") != home_away:
            continue
        nm = ((c.get("team") or {}).get("displayName") or "").strip()
        if not nm:
            return None  # TBC slot: ESPN lists the shell before the draw
        mapped = site_team(nm)
        if mapped:
            name, slug = mapped
        else:
            name, slug = nm, None
            warn.append(nm)
        raw = c.get("score")
        try:
            score = int(float(raw)) if raw not in (None, "") else None
        except (TypeError, ValueError):
            score = None
        return {"name": name, "slug": slug, "score": score,
                "winner": bool(c.get("winner")), "seed": _seed(c)}
    return None


def _headline(comp: dict) -> str:
    for n in comp.get("notes", []) or []:
        if n.get("headline"):
            return str(n["headline"]).strip()
    return ""


def is_pro_bowl(ev: dict, comp: dict, week: int | None) -> bool:
    """The three nets. Any one of them is enough to drop the event."""
    if week == PRO_BOWL_WEEK:
        return True
    for text in (ev.get("name"), ev.get("shortName"), _headline(comp)):
        if text and PRO_BOWL_RE.search(str(text)):
            return True
    return False


def parse_playoffs(payload: dict, season: int, warn: list | None = None) -> list[dict]:
    """One ESPN scoreboard payload -> bracket games. Postseason events only."""
    warn = warn if warn is not None else []
    games = []
    default_week = ((payload or {}).get("week") or {}).get("number")
    for ev in (payload or {}).get("events", []) or []:
        se = ev.get("season") or {}
        # seasontype 3 only: a regular-season event would be week 1 all over
        # again, and the whole bracket would gain seventeen phantom fixtures.
        if se.get("type") not in (None, 3):
            continue
        if se.get("year") not in (None, season):
            continue
        comp = (ev.get("competitions") or [{}])[0]
        week = (ev.get("week") or {}).get("number") or default_week
        try:
            week = int(week) if week else None
        except (TypeError, ValueError):
            week = None
        if is_pro_bowl(ev, comp, week):
            continue
        home = _side(comp, "home", warn)
        away = _side(comp, "away", warn)
        # 🔴 THE THIRD NET. Neither side is a franchise: this is an all-star
        # exhibition (or something new that is not a club fixture), not a
        # playoff game. A single unmapped side is a rename and stays, unlinked.
        if (home is None or home["slug"] is None) and (away is None or away["slug"] is None):
            warn.append("dropped non-franchise event: %s" % (ev.get("shortName") or ev.get("id")))
            continue
        headline = _headline(comp)
        label, round_name = WEEK_ROUNDS.get(week or 0, ("Playoffs", None))
        if week == SUPER_BOWL_WEEK:
            m = SB_RE.search(headline) or SB_RE.search(str(ev.get("name") or ""))
            if m:
                label = round_name = "Super Bowl %s" % m.group(1)
        conf = CONF_RE.search(headline)
        # The conference is the honest short code on a card: "AFC · Wild Card".
        # The Super Bowl belongs to neither, so it carries no code at all.
        code = conf.group(1) if (conf and week != SUPER_BOWL_WEEK) else None
        stype = ((comp.get("status") or {}).get("type") or {})
        state = stype.get("state") or ("post" if stype.get("completed") else "pre")
        completed = bool(stype.get("completed"))
        winner = None
        if completed and home and away:
            if home.get("winner"):
                winner = "home"
            elif away.get("winner"):
                winner = "away"
            elif home["score"] is not None and away["score"] is not None and home["score"] != away["score"]:
                winner = "home" if home["score"] > away["score"] else "away"
        venue = comp.get("venue") or {}
        games.append({
            "week": week,
            "code": code,
            "round": round_name,
            "date": ev.get("date"),
            "venue": venue.get("fullName") or None,
            # The Super Bowl is always a neutral site, and ESPN says so on the
            # competition. Read the flag; never assume it from the week.
            "neutral": bool(comp.get("neutralSite")),
            "home": home, "away": away,
            "state": state, "completed": completed,
            "winner": winner,
            "_label": label,
        })
    return games


def to_bundle(season: int, games: list[dict], generated_at: str | None = None) -> dict:
    """Grouped weeks + Super Bowl meta. Pure; the self-test leans on it."""
    by_week: dict[int, list[dict]] = {}
    labels: dict[int, str] = {}
    for g in sorted(games, key=lambda g: (g["week"] or 99, g["date"] or "")):
        wk = g["week"] or 0
        labels.setdefault(wk, g.get("_label") or "Playoffs")
        if g["week"] == SUPER_BOWL_WEEK and g.get("_label"):
            labels[wk] = g["_label"]
        by_week.setdefault(wk, []).append({k: v for k, v in g.items() if k != "_label"})
    weeks = [{"week": wk, "label": labels[wk], "games": by_week[wk]} for wk in sorted(by_week)]
    sb = next((g for g in games if g["week"] == SUPER_BOWL_WEEK), None)
    champion = None
    if sb and sb["completed"] and sb["winner"]:
        champion = sb[sb["winner"]]
    return {
        "meta": {
            "league": "NFL", "season": season,
            "generated_at": generated_at or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "complete": champion is not None,
        },
        "weeks": weeks,
        # Named `premier` because the bundle shape is shared with the AFL and
        # NRL feed the renderer was written for. For the NFL it is the Super
        # Bowl winner.
        "premier": ({"name": champion["name"], "slug": champion["slug"]} if champion else None),
    }


# --------------------------------------------------------------- the sources

def fetch_week(season: int, week: int) -> dict:
    """ESPN's postseason scoreboard for one week. NO User-Agent; no limit=."""
    opener = urllib.request.build_opener()
    opener.addheaders = [("Accept", "application/json")]
    with opener.open(ESPN_SCOREBOARD % (season, week), timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def gather(season: int, fixtures: Path | None, warn: list) -> list[dict]:
    games: list[dict] = []
    for week in range(FIRST_WEEK, LAST_WEEK + 1):
        if week == PRO_BOWL_WEEK:
            print("  week %d: skipped (the Pro Bowl Games are not the playoffs)" % week)
            continue
        if fixtures is not None:
            p = fixtures / ("espn-post-%d-w%d.json" % (season, week))
            if not p.exists():
                print("  week %d: no %s" % (week, p.name))
                continue
            payload = json.loads(p.read_text(encoding="utf-8"))
        else:
            payload = fetch_week(season, week)
        got = parse_playoffs(payload, season, warn)
        print("  week %d: %d games, %d played" % (
            week, len(got), sum(1 for g in got if g["completed"])))
        games += got
    return games


def completed_count(bundle: dict) -> int:
    return sum(1 for w in bundle.get("weeks", []) for g in w.get("games", []) if g.get("completed"))


# -------------------------------------------------------------------- the run

def summarise(bundle: dict) -> None:
    n = sum(len(w["games"]) for w in bundle["weeks"])
    print()
    print("SUMMARY  NFL %d postseason" % bundle["meta"]["season"])
    print("  %d games across %d rounds, %d completed"
          % (n, len(bundle["weeks"]), completed_count(bundle)))
    for w in bundle["weeks"]:
        print("  %-22s %d games" % (w["label"], len(w["games"])))
        for g in w["games"]:
            def side(s):
                if not s:
                    return "TBC"
                seed = "(%d) " % s["seed"] if s.get("seed") else ""
                sc = " %s" % s["score"] if s["score"] is not None else ""
                return "%s%s%s" % (seed, s["name"], sc)
            mark = {"home": " <- home", "away": " <- away"}.get(g["winner"] or "", "")
            print("      %-10s %-28s vs %-28s %s%s"
                  % (g["code"] or "-", side(g["away"]), side(g["home"]),
                     g["venue"] or "-", mark))
    if bundle["premier"]:
        print("  SUPER BOWL CHAMPION: %s (%s)"
              % (bundle["premier"]["name"], bundle["premier"]["slug"]))
    print("  complete: %s" % bundle["meta"]["complete"])


def run(season: int, fixtures: Path | None, write: bool) -> int:
    warn: list = []
    print("NFL %d postseason (ESPN seasontype=3, weeks 1-5 less the Pro Bowl)" % season)
    games = gather(season, fixtures, warn)
    for w in sorted(set(warn)):
        print("  WARNING %s" % w, file=sys.stderr)

    if not games:
        # 🔴 EXIT 0. The January cron starts before the postseason exists, and
        # "not yet" is the expected answer for most of its runs, not a failure.
        print("no postseason yet: ESPN lists no %d postseason games. Nothing written." % season)
        return 0

    bundle = to_bundle(season, games)
    summarise(bundle)

    prev = None
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            prev = None
    if prev and prev.get("meta", {}).get("season") == season:
        before, now = completed_count(prev), completed_count(bundle)
        # 🔴 COMPLETED GAMES NEVER GO BACKWARDS. A short ESPN answer is a
        # transient, not a correction, and a bracket rebuilt from one would
        # delete a playoff round that actually happened.
        if now < before:
            print("ABORT: completed games would fall from %d to %d. "
                  "ESPN answered short; nothing written." % (before, now), file=sys.stderr)
            return 1

    if not write:
        print()
        print("(dry-run; nothing written. Pass --write to update %s.)"
              % OUT.relative_to(ROOT))
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    print()
    print("wrote %s" % OUT.relative_to(ROOT))
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

    # 1. The name map resolves to real franchise slugs, one to one.
    check(len(SITE_NAME) == 32, "SITE_NAME has %d rows, not 32" % len(SITE_NAME))
    if FRANCHISES.exists():
        fr = json.loads(FRANCHISES.read_text(encoding="utf-8"))
        slugs = {f["slug"] for f in fr}
        names = {f["name"] for f in fr}
        got = {slugify(n) for n in SITE_NAME.values()}
        check(got == slugs,
              "resolved slugs != franchises.json: only-map %s, only-file %s"
              % (sorted(got - slugs), sorted(slugs - got)))
        check(set(SITE_NAME.values()) == names,
              "resolved names != franchises.json names: %s"
              % sorted(set(SITE_NAME.values()) ^ names))
        print("  name map: 32 ESPN names -> 32 franchise slugs, one to one")
    else:
        check(False, "no public/data/nfl/franchises.json to check the map against")

    # 2. The Pro Bowl is excluded by NAME even at a week that is not 4.
    pb = {"season": {"type": 3, "year": 2025}, "week": {"number": 2},
          "name": "NFC  at AFC ", "shortName": "NFC VS AFC",
          "competitions": [{"notes": [{"headline": "Pro Bowl Games"}],
                            "venue": {"fullName": "Moscone Center"},
                            "status": {"type": {"completed": True, "state": "post"}},
                            "competitors": [
                                {"homeAway": "home", "team": {"displayName": "AFC"}, "score": "52"},
                                {"homeAway": "away", "team": {"displayName": "NFC"}, "score": "66"}]}]}
    check(parse_playoffs({"events": [pb]}, 2025) == [],
          "the Pro Bowl survived a week renumbering")
    # ... and by TEAMS even with the name scrubbed and the week moved.
    scrub = json.loads(json.dumps(pb))
    scrub["name"] = scrub["shortName"] = "Conference All-Star Game"
    scrub["competitions"][0]["notes"] = [{"headline": "All-Star Game"}]
    dropped: list = []
    check(parse_playoffs({"events": [scrub]}, 2025, dropped) == [],
          "an all-star game between two non-franchises reached the bracket")
    check(any("non-franchise" in w for w in dropped), "the drop was silent")

    # 3. A regular-season event never reaches the bracket.
    reg = json.loads(json.dumps(pb))
    reg["season"]["type"] = 2
    reg["name"] = "Chicago Bears at Green Bay Packers"
    reg["shortName"] = "CHI @ GB"
    reg["competitions"][0]["notes"] = []
    reg["competitions"][0]["competitors"] = [
        {"homeAway": "home", "team": {"displayName": "Green Bay Packers"}, "score": "20"},
        {"homeAway": "away", "team": {"displayName": "Chicago Bears"}, "score": "17"}]
    check(parse_playoffs({"events": [reg]}, 2025) == [],
          "a seasontype=2 event reached the postseason bracket")

    # 4. A seed is read when ESPN carries one, and 99 never becomes a seed.
    seeded = json.loads(json.dumps(reg))
    seeded["season"]["type"] = 3
    seeded["week"]["number"] = 1
    seeded["competitions"][0]["notes"] = [{"headline": "NFC Wild Card Playoffs"}]
    seeded["competitions"][0]["competitors"][0]["curatedRank"] = {"current": 99}
    seeded["competitions"][0]["competitors"][1]["seed"] = 6
    g = parse_playoffs({"events": [seeded]}, 2025)
    check(len(g) == 1 and g[0]["home"]["seed"] is None,
          "curatedRank 99 was read as a seed")
    check(g and g[0]["away"]["seed"] == 6, "an explicit seed was not read")
    check(g and g[0]["code"] == "NFC" and g[0]["round"] == "Wild Card",
          "wild-card code/round wrong: %r" % (g[0] if g else None))

    # 5. An unmapped club is kept unlinked and warned, never dropped.
    ren = json.loads(json.dumps(seeded))
    ren["competitions"][0]["competitors"][0]["team"]["displayName"] = "Green Bay Cheeseheads"
    w: list = []
    g = parse_playoffs({"events": [ren]}, 2025, w)
    check(len(g) == 1 and g[0]["home"]["slug"] is None and g[0]["home"]["name"] == "Green Bay Cheeseheads",
          "a renamed club was dropped instead of rendered unlinked")
    check("Green Bay Cheeseheads" in w, "the rename was silent")

    # 6. The real 2025 postseason, out of the fixtures.
    if fixtures and fixtures.is_dir():
        warn: list = []
        games: list = []
        per_week = {}
        for week in range(FIRST_WEEK, LAST_WEEK + 1):
            p = fixtures / ("espn-post-2025-w%d.json" % week)
            if not p.exists():
                check(False, "no %s" % p)
                continue
            payload = json.loads(p.read_text(encoding="utf-8"))
            got = [] if week == PRO_BOWL_WEEK else parse_playoffs(payload, 2025, warn)
            # The Pro Bowl file is ALSO parsed without the week guard, so the
            # name and team nets are proved on the real payload, not a mock.
            if week == PRO_BOWL_WEEK:
                unguarded = parse_playoffs(payload, 2025, [])
                check(unguarded == [],
                      "the real Pro Bowl payload survived the name/teams nets: %d games"
                      % len(unguarded))
            per_week[week] = len(got)
            games += got
        check(per_week.get(1) == 6, "wild card parsed %s games, expected 6" % per_week.get(1))
        check(per_week.get(2) == 4, "divisional parsed %s games, expected 4" % per_week.get(2))
        check(per_week.get(3) == 2, "conference parsed %s games, expected 2" % per_week.get(3))
        check(per_week.get(4, 0) == 0, "the Pro Bowl reached the bracket")
        check(per_week.get(5) == 1, "super bowl parsed %s games, expected 1" % per_week.get(5))
        check(len(games) == 13, "2025 postseason parsed %d games, expected 13" % len(games))

        unmapped = [w for w in warn]
        check(unmapped == [], "2025 postseason left unmapped teams: %s" % sorted(set(unmapped)))
        for g in games:
            for side in ("home", "away"):
                s = g[side]
                check(s is not None and s["slug"] is not None,
                      "%s %s did not resolve" % (g.get("code"), side))

        b = to_bundle(2025, games)
        labels = [w["label"] for w in b["weeks"]]
        check(labels == ["Wild Card", "Divisional Round", "Conference Championships", "Super Bowl LX"],
              "week labels wrong: %r" % labels)
        check([w["week"] for w in b["weeks"]] == [1, 2, 3, 5],
              "week numbers wrong: %r" % [w["week"] for w in b["weeks"]])
        codes = {g["code"] for w in b["weeks"] for g in w["games"]}
        check(codes == {"AFC", "NFC", None}, "conference codes wrong: %r" % codes)
        sb = b["weeks"][-1]["games"][0]
        check(sb["neutral"] is True, "the Super Bowl is not marked neutral")
        check(sb["code"] is None and sb["round"] == "Super Bowl LX",
              "super bowl code/round wrong: %r / %r" % (sb["code"], sb["round"]))
        check(b["premier"] == {"name": "Seattle Seahawks", "slug": "seattle-seahawks"},
              "champion wrong: %r" % (b["premier"],))
        check(b["meta"]["complete"] is True, "complete flag not set on a finished postseason")
        check(b["meta"]["league"] == "NFL" and b["meta"]["season"] == 2025, "meta wrong")
        check(completed_count(b) == 13, "completed count %d, expected 13" % completed_count(b))
        print("  2025 postseason: 6 wild card, 4 divisional, 2 conference, "
              "1 Super Bowl, 0 Pro Bowl; champion %s" % b["premier"]["name"])
    else:
        # Skipped, not failed: the Action runs the self-test on a runner with no
        # fixture directory, and the pure logic above still has to pass there.
        print("  (no fixture directory; the 2025 postseason parse was NOT run)")

    # 7. The bundle shape is the one the shared renderer reads.
    b = to_bundle(2026, [])
    check(set(b) == {"meta", "weeks", "premier"}, "bundle keys drifted: %r" % sorted(b))
    check(set(b["meta"]) == {"league", "season", "generated_at", "complete"},
          "meta keys drifted: %r" % sorted(b["meta"]))
    check(b["weeks"] == [] and b["premier"] is None, "an empty postseason is not empty")

    for f in fails:
        print("  FAIL %s" % f)
    print("[self-test] %d/%d checks passed" % (checks - len(fails), checks))
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, default=None,
                    help="ESPN season year; the postseason is played the "
                         "January and February after it. Default: the current "
                         "NFL season.")
    ap.add_argument("--fixtures", metavar="DIR",
                    help="read espn-post-<season>-w<week>.json from DIR "
                         "instead of calling ESPN")
    ap.add_argument("--write", action="store_true",
                    help="write public/data/nfl/playoffs.json. Dry run is the default.")
    ap.add_argument("--dry-run", action="store_true",
                    help="explicit no-op; this is already the default")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)

    fixtures = Path(args.fixtures) if args.fixtures else None
    season = args.season if args.season is not None else current_season()

    # Self-test first, always, before any network call. CLAUDE.md's working loop.
    rc = self_test(fixtures)
    if args.self_test:
        return rc
    if rc:
        print("ABORT: self-test failed; ESPN was not called and nothing was written.")
        return rc
    return run(season, fixtures, args.write and not args.dry_run)


def current_season(today: dt.date | None = None) -> int:
    """The ESPN season year whose postseason is the current one.

    The season that kicks off in September YYYY plays its postseason in
    January and February YYYY+1, so January and February belong to the
    previous season year. Mirrors currentNflSeason() in lib/nflPlayoffs.ts.
    """
    d = today or dt.datetime.now(dt.timezone.utc).date()
    return d.year if d.month >= 3 else d.year - 1


if __name__ == "__main__":
    sys.exit(main())
