"""Rested-starters adjustment for the NFL expectation ledger.

WHAT THIS IS. `public/data/nfl/expectation/season-YYYY.json` scores every game
against `model.pH`, the pre-game Elo win probability. Elo has no idea a
clinched favourite is about to start its backup quarterback, so a Week 17/18
loss by a team resting starters reads as one of the biggest upsets of the
season. It usually is not: it is a team that stopped trying to win that
specific game.

THE EVIDENCE (measured by the orchestrator, 2002-2025). In the final two weeks
of the regular season, a favourite at 65%+ Elo win probability that starts a
QB other than its season's primary starter (most regular-season starts) won
43 of 75 such games (57%), where Elo expected 57.7 wins and the closing market
expected 46.7. That gap implies roughly a 140 Elo-point discount. The control
group, favourites starting their primary QB in the same weeks, shows no such
gap.

THE RULING (Ashwin). Elo itself (`model.pH`) stays untouched everywhere it is
used as Elo. Only the "against expectation" surprise scoring gets a second,
adjusted probability: `model.pH_rest`. `surprise` is recomputed from it in
place. `model_brier` is never touched, because it scores Elo, not the surprise
board.

REST ADJUSTMENT (this module).
  * `primary_qbs(rows)` - the QB with the most REGULAR-SEASON starts for each
    (season, team_key). Playoff starts don't count towards who "is" the
    starter; ties keep whichever name was seen first in row order.
  * `rest_flags(rows)` - a side is flagged "rested" only when ALL of:
      - the game is a regular-season game (not playoff),
      - it falls in the last two weeks of THAT season's regular season
        (week >= max_week - 1, and max_week is taken from the same season's
        rows, since season length has varied 14/16/17/18 games across eras),
      - the side's starting QB is known and differs from that team-season's
        primary starter, and
      - the side's own Elo win probability is >= 0.5.
    That last condition is deliberate: it is what keeps an injured starter on
    a bad team from reading as "resting starters". A team that was never
    favoured has nothing to rest for.
  * `adjust(rows, penalty_elo=140)` - for every row with a flagged side,
    converts `model.pH` to an Elo point difference, shifts it by
    `penalty_elo` against whichever side is rested (both sides rested: no
    shift, since neither has an edge left to discount), converts back, and
    writes `model.pH_rest` + `rest: {home, away}` on the row. `surprise` is
    recomputed from `model.pH_rest` using the same formula the builder uses
    for `model.pH`. `model.pH` and `model_brier` are left exactly as they
    were. Rows with no flagged side are left untouched entirely (no
    `model.pH_rest`, no `rest` key) so the on-disk diff stays proportional to
    what actually changed.

🔴 THIS IS A PROXY, NOT A DIRECT SIGNAL, AND SAYS SO IN THE OUTPUT. The
workbook has no "these starters were rested" field; "QB differs from the
team's primary starter in the final two weeks while still favoured" is what
is actually observable. It will occasionally flag a real injury on a good
team as a rest game, and it will occasionally miss a token rest of a
non-quarterback starter entirely. `meta.rest_adjustment.note` in index.json
carries this same caveat so a reader of the raw data sees it too.

USAGE
  python scripts/nfl/rest_adjust.py --self-test
      Runs the pure-function tests below against hand-built fixtures. No
      filesystem writes, no network.
  python scripts/nfl/rest_adjust.py --apply [--penalty-elo 140]
      Rewrites every public/data/nfl/expectation/season-*.json in place
      (adds pH_rest/rest, recomputes surprise on flagged rows) and rebuilds
      index.json's `upsets` all-time board from the adjusted surprise, so a
      rested-side loss cannot land in the top 100 by construction. Prints a
      before/after summary: sides flagged per season (2002 on) and the top
      ten all-time upsets before and after.

This module is also imported (not reimplemented) by build_expectation.py, so
the next full workbook rebuild applies the same adjustment before it ever
writes a season file.
"""
import argparse
import copy
import glob
import io
import json
import math
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPDIR = os.path.join(ROOT, "public", "data", "nfl", "expectation")

PENALTY_ELO_DEFAULT = 140.0

# The rule only fires from this season on. Measured on the same ledger before
# wiring it: rested favourites at 65%+ won 40 of 49 such games in 1950-1977
# against an Elo expectation of 38.9, and 39 of 54 in 1978-2001 against 39.9,
# so a late-season quarterback change in those eras was a platoon or an
# injury and the team played to win. The gap opens only in 2002-2025 (43 of
# 75 against 57.7). Flagging the earlier eras would have discounted real
# upsets.
REST_FROM_SEASON = 2002

# A rested side is never more than this much of a favourite, whatever Elo
# said before the benching. Ashwin's ruling (2026-09-08) on the 2020 Chargers
# 38-21 over the 14-1 Chiefs: Kansas City sat every starter, and a 140-point
# discount still left the Chargers at 17%, which read as an all-time upset on
# the board. The ledger's own evidence is thin at the top (six rested
# favourites above 90% Elo, five of them won), so this is an editorial
# ceiling, not a fitted one, and it is written down as such.
REST_CAP = 0.70

REST_ADJUSTMENT_NOTE = (
    "A side is flagged 'rested' when the game is a regular-season game in "
    "the last two weeks of that season (week >= max_week - 1), the side's "
    "starting QB is known and differs from that team-season's primary "
    "starter (most regular-season starts that season), and the side's Elo "
    "win probability is >= 0.5, from the 2002 season on (earlier eras show "
    "no rest effect in the ledger). This is a proxy for a clinched team resting "
    "starters, not a direct signal: an injured starter on a good team can "
    "match it too. Elo (model.pH) is untouched everywhere; only the "
    "against-expectation surprise scoring uses the adjusted model.pH_rest, "
    "which discounts the rested side by penalty_elo Elo points and caps it at "
    "REST_CAP (both sides rested: no shift)."
)


# --------------------------------------------------------------------------
# pure logic
# --------------------------------------------------------------------------

def _team_key(row, side):
    return row.get(side + "_key")


def _row_key(row):
    """A row identity that is actually unique within a season.

    🔴 `game_id` IS NOT UNIQUE. It is the leading digits shared by the row
    pair of ONE game (see build_expectation.py's read_rows() docstring), but
    that serial turns out to also be shared by every OTHER game played the
    same day across the whole league (all 16 games of a Sunday carry the same
    game_id in the ledger). Keying on (season, game_id) silently collapses a
    full week's slate into one flags entry and applies whichever game was
    processed last to all of them, caught via a Week 17 2019 game where Tom
    Brady, the Patriots' QB in all 16 of that season's games, came back
    flagged as a QB change. (season, date, home_key, away_key) is unique
    across the full ledger (checked: 0 collisions in 18,195 rows) and is the
    same identity build_expectation.py's read_rows() pairs game rows on.
    """
    return (row.get("season"), row.get("date"), row.get("home_key"), row.get("away_key"))


def _week_num(row):
    w = row.get("week")
    try:
        return int(w)
    except (TypeError, ValueError):
        return None


def _side_prob(row, side):
    model = row.get("model")
    if not model or model.get("pH") is None:
        return None
    p = model["pH"]
    return p if side == "home" else 1.0 - p


def primary_qbs(rows):
    """(season, team_key) -> the QB with the most REGULAR-SEASON starts.

    Playoff rows never contribute a start here: who "is" the starter is a
    regular-season question, and the rest adjustment only ever looks at
    regular-season games anyway. Ties keep the first QB name seen for that
    team-season, in row order, so the result does not depend on dict
    ordering.
    """
    counts = defaultdict(lambda: defaultdict(int))
    order = defaultdict(list)
    for r in rows:
        if r.get("playoff"):
            continue
        qb = r.get("qb") or {}
        for side in ("home", "away"):
            name = qb.get(side)
            if not name:
                continue
            key = (r.get("season"), _team_key(r, side))
            if name not in counts[key]:
                order[key].append(name)
            counts[key][name] += 1
    out = {}
    for key, c in counts.items():
        out[key] = max(order[key], key=lambda n: c[n])
    return out


def rest_flags(rows, primary=None):
    """{_row_key(row): {"home": bool, "away": bool}} for every row.

    Only regular-season rows in the last two weeks of their own season can
    ever come back True on either side; every other row maps to
    {"home": False, "away": False}.
    """
    if primary is None:
        primary = primary_qbs(rows)

    max_week = {}
    for r in rows:
        if r.get("playoff"):
            continue
        w = _week_num(r)
        if w is None:
            continue
        s = r.get("season")
        if w > max_week.get(s, -1):
            max_week[s] = w

    out = {}
    for r in rows:
        key = _row_key(r)
        flags = {"home": False, "away": False}
        if not r.get("playoff") and (r.get("season") or 0) >= REST_FROM_SEASON:
            s = r.get("season")
            w = _week_num(r)
            mw = max_week.get(s)
            if w is not None and mw is not None and w >= mw - 1:
                qb = r.get("qb") or {}
                for side in ("home", "away"):
                    name = qb.get(side)
                    if not name:
                        continue
                    prim = primary.get((s, _team_key(r, side)))
                    if prim is None or name == prim:
                        continue
                    p = _side_prob(r, side)
                    if p is not None and p >= 0.5:
                        flags[side] = True
        out[key] = flags
    return out


def _pH_to_diff(p):
    p = min(max(p, 1e-6), 1 - 1e-6)
    return 400.0 * math.log10(p / (1.0 - p))


def _diff_to_pH(d):
    return 1.0 / (1.0 + 10.0 ** (-d / 400.0))


def adjust(rows, penalty_elo=PENALTY_ELO_DEFAULT, primary=None):
    """Mutate `rows` in place: add model.pH_rest + rest{} and recompute
    surprise on every row with a flagged side. model.pH and model_brier are
    never touched. Returns the {_row_key(row): {home, away}} flag map that
    was used, for reporting.
    """
    flags_map = rest_flags(rows, primary=primary)
    for r in rows:
        flags = flags_map.get(_row_key(r), {"home": False, "away": False})
        if not (flags["home"] or flags["away"]):
            continue
        model = r.get("model")
        if not model or model.get("pH") is None:
            continue
        pH = model["pH"]
        if flags["home"] and flags["away"]:
            pH_rest = pH  # both sides rested: neither has an edge left to discount
        elif flags["home"]:
            pH_rest = min(_diff_to_pH(_pH_to_diff(pH) - penalty_elo), REST_CAP)
        else:
            pH_rest = max(_diff_to_pH(_pH_to_diff(pH) + penalty_elo), 1.0 - REST_CAP)
        model["pH_rest"] = round(pH_rest, 4)
        r["rest"] = {"home": flags["home"], "away": flags["away"]}
        result = r.get("result")
        if result in ("H", "A", "T"):
            actual = 1.0 if result == "H" else (0.0 if result == "A" else 0.5)
            surprise = 1.0 - (pH_rest if actual == 1.0 else (1 - pH_rest) if actual == 0.0 else 0.5)
            r["surprise"] = round(surprise, 4)
    return flags_map


# --------------------------------------------------------------------------
# self-test
# --------------------------------------------------------------------------

def _fixture_rows():
    """Real-shaped rows for one team-season pair (Chiefs home vs Broncos
    away), a full 17-game regular season plus a pick'em week 18 game, built
    so every case in the docstring has a concrete row to exercise.
    """
    import datetime as _dt

    rows = []
    game_id = 1000

    def add(week, home_pH, home_qb, away_qb, result, playoff=False, season=2022):
        nonlocal game_id
        game_id += 1
        # _row_key is (season, date, home_key, away_key): every row in this
        # fixture is the same two teams, so the date has to actually vary by
        # week or rows collide on identity, same trap _row_key's docstring
        # warns game_id falls into.
        date = (_dt.date(2022, 9, 8) + _dt.timedelta(weeks=week - 1)).isoformat()
        rows.append({
            "game_id": str(game_id), "season": season, "week": week, "date": date,
            "playoff": playoff, "home": "Kansas City Chiefs", "away": "Denver Broncos",
            "home_slug": "kansas-city-chiefs", "away_slug": "denver-broncos",
            "home_era": "Kansas City Chiefs", "away_era": "Denver Broncos",
            "home_key": "Chiefs", "away_key": "Broncos",
            "venue": "Arrowhead Stadium", "metro": "Kansas City", "neutral": False,
            "result": result, "score": "24-17" if result == "H" else "17-24",
            "model": {"pH": round(home_pH, 4)},
            "model_brier": 0.1,
            "surprise": round(1.0 - (home_pH if result == "H" else (1 - home_pH) if result == "A" else 0.5), 4),
            "qb": {"home": home_qb, "away": away_qb},
        })

    # Weeks 1-14: both teams start their eventual primary QB. 14 starts each,
    # comfortably the majority of a 17/18-week season.
    for wk in range(1, 15):
        add(wk, 0.60, "Patrick Mahomes", "Russell Wilson", "H")

    # Week 15: a mid-season-style change is NOT what's being tested here (that
    # is fixture #3 below), just more normal games to keep the primary QB
    # counts unambiguous.
    add(15, 0.55, "Patrick Mahomes", "Russell Wilson", "H")
    add(16, 0.58, "Patrick Mahomes", "Russell Wilson", "A")

    return rows


def _case_rested_favourite_loses():
    rows = _fixture_rows()
    # Week 17: Chiefs (favourite, pH=0.75) start a backup, and lose.
    rows.append({
        "game_id": "2001", "season": 2022, "week": 17, "date": "2023-01-01",
        "playoff": False, "home": "Kansas City Chiefs", "away": "Denver Broncos",
        "home_slug": "kansas-city-chiefs", "away_slug": "denver-broncos",
        "home_era": "Kansas City Chiefs", "away_era": "Denver Broncos",
        "home_key": "Chiefs", "away_key": "Broncos",
        "venue": "Arrowhead Stadium", "metro": "Kansas City", "neutral": False,
        "result": "A", "score": "17-24",
        "model": {"pH": 0.75}, "model_brier": 0.5625,
        "surprise": round(0.75, 4),
        "qb": {"home": "Chad Henne", "away": "Russell Wilson"},
    })
    return rows


def _case_rested_underdog():
    rows = _fixture_rows()
    # Week 17: Chiefs are the UNDERDOG this time (pH=0.30) and rest starters
    # anyway (a lost-cause benching). The >=0.5 rule must keep this OFF.
    rows.append({
        "game_id": "2002", "season": 2022, "week": 17, "date": "2023-01-01",
        "playoff": False, "home": "Kansas City Chiefs", "away": "Denver Broncos",
        "home_slug": "kansas-city-chiefs", "away_slug": "denver-broncos",
        "home_era": "Kansas City Chiefs", "away_era": "Denver Broncos",
        "home_key": "Chiefs", "away_key": "Broncos",
        "venue": "Arrowhead Stadium", "metro": "Kansas City", "neutral": False,
        "result": "H", "score": "24-17",
        "model": {"pH": 0.30}, "model_brier": 0.49,
        "surprise": round(1 - 0.30, 4),
        "qb": {"home": "Chad Henne", "away": "Russell Wilson"},
    })
    return rows


def _case_midseason_change_not_flagged():
    rows = _fixture_rows()
    # Week 9 (well inside the season, not the last two weeks): Chiefs change
    # starters. Must not be flagged no matter what the primary QB works out
    # to be, purely on the week filter.
    for r in rows:
        if r["week"] == 9:
            r["qb"]["home"] = "Chad Henne"
            r["model"]["pH"] = 0.65
    return rows


def _case_both_rested():
    rows = _fixture_rows()
    # Week 18, a true pick'em (pH=0.5): both teams rest starters.
    rows.append({
        "game_id": "2003", "season": 2022, "week": 18, "date": "2023-01-08",
        "playoff": False, "home": "Kansas City Chiefs", "away": "Denver Broncos",
        "home_slug": "kansas-city-chiefs", "away_slug": "denver-broncos",
        "home_era": "Kansas City Chiefs", "away_era": "Denver Broncos",
        "home_key": "Chiefs", "away_key": "Broncos",
        "venue": "Arrowhead Stadium", "metro": "Kansas City", "neutral": False,
        "result": "H", "score": "20-20",
        "model": {"pH": 0.5}, "model_brier": 0.25,
        "surprise": 0.5,
        "qb": {"home": "Chad Henne", "away": "Brett Rypien"},
    })
    return rows


def self_test():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    # --- primary_qbs -------------------------------------------------------
    rows = _fixture_rows()
    prim = primary_qbs(rows)
    check("primary QB is Mahomes", prim[(2022, "Chiefs")] == "Patrick Mahomes")
    check("primary QB is Wilson", prim[(2022, "Broncos")] == "Russell Wilson")

    # --- rested favourite that loses ---------------------------------------
    rows = _case_rested_favourite_loses()
    before = next(r["surprise"] for r in rows if r["game_id"] == "2001")
    flags_map = adjust(rows)
    game = next(r for r in rows if r["game_id"] == "2001")
    check("rested favourite: home flagged", flags_map[_row_key(game)]["home"] is True)
    check("rested favourite: away not flagged", flags_map[_row_key(game)]["away"] is False)
    check("rested favourite: rest{} written", game.get("rest") == {"home": True, "away": False})
    check("rested favourite: pH_rest written and lower than pH",
          "pH_rest" in game["model"] and game["model"]["pH_rest"] < game["model"]["pH"])
    check("rested favourite: pH untouched", game["model"]["pH"] == 0.75)
    check("rested favourite: model_brier untouched", game["model_brier"] == 0.5625)
    check("rested favourite: surprise reduced", game["surprise"] < before)

    # --- rested underdog: must NOT be flagged -------------------------------
    rows = _case_rested_underdog()
    flags_map = adjust(rows)
    game = next(r for r in rows if r["game_id"] == "2002")
    check("rested underdog: not flagged", flags_map[_row_key(game)] == {"home": False, "away": False})
    check("rested underdog: no pH_rest written", "pH_rest" not in game["model"])
    check("rested underdog: no rest{} written", "rest" not in game)

    # --- mid-season change: must NOT be flagged -----------------------------
    rows = _case_midseason_change_not_flagged()
    flags_map = adjust(rows)
    game = next(r for r in rows if r["week"] == 9)
    check("mid-season change: week 9 not flagged", flags_map[_row_key(game)] == {"home": False, "away": False})
    check("mid-season change: no pH_rest written", "pH_rest" not in game["model"])

    # --- both sides rested: no shift ----------------------------------------
    rows = _case_both_rested()
    flags_map = adjust(rows)
    game = next(r for r in rows if r["game_id"] == "2003")
    check("both rested: both flagged", flags_map[_row_key(game)] == {"home": True, "away": True})
    check("both rested: pH_rest == pH (no shift)", game["model"]["pH_rest"] == game["model"]["pH"])
    check("both rested: surprise unchanged", game["surprise"] == 0.5)

    if failures:
        print("SELF-TEST FAILED (%d):" % len(failures))
        for f in failures:
            print("  - %s" % f)
        return False
    print("self-test: all checks passed")
    return True


# --------------------------------------------------------------------------
# --apply
# --------------------------------------------------------------------------

def _iter_season_paths():
    for path in sorted(glob.glob(os.path.join(EXPDIR, "season-*.json"))):
        base = os.path.basename(path)
        try:
            season = int(base[len("season-"):-len(".json")])
        except ValueError:
            continue
        yield season, path


def _side_view(r, winner_side):
    """Mirrors build_expectation.py's side_view(), reading pH_rest when
    present so the all-time board is built from whatever surprise the row
    actually carries.
    """
    sc = r.get("score")
    if sc and winner_side == "A":
        a, b = sc.split("-")
        sc = "%s-%s" % (b, a)
    model = r.get("model") or {}
    pH = model.get("pH_rest", model.get("pH"))
    return {
        "season": r["season"], "date": r["date"], "game_id": r["game_id"],
        "winner": r["home_era"] if winner_side == "H" else r["away_era"],
        "winner_slug": r["home_slug"] if winner_side == "H" else r["away_slug"],
        "loser": r["away_era"] if winner_side == "H" else r["home_era"],
        "loser_slug": r["away_slug"] if winner_side == "H" else r["home_slug"],
        "p_winner": round(pH if winner_side == "H" else 1 - pH, 4),
        "score": sc, "metro": r.get("metro"), "venue": r.get("venue"),
        "playoff": r["playoff"], "round": r.get("round"),
    }


def _side_view_raw(r, winner_side):
    """Same as _side_view but always reads model.pH, never pH_rest. Used for
    the BEFORE board, which must reflect plain Elo even on a second `--apply`
    run against files a prior run already adjusted (adjust() is idempotent on
    disk, but the "before" comparison should still mean "before any rest
    adjustment", not "before this particular run").
    """
    sc = r.get("score")
    if sc and winner_side == "A":
        a, b = sc.split("-")
        sc = "%s-%s" % (b, a)
    pH = (r.get("model") or {}).get("pH")
    return {
        "season": r["season"], "date": r["date"], "game_id": r["game_id"],
        "winner": r["home_era"] if winner_side == "H" else r["away_era"],
        "winner_slug": r["home_slug"] if winner_side == "H" else r["away_slug"],
        "loser": r["away_era"] if winner_side == "H" else r["home_era"],
        "loser_slug": r["away_slug"] if winner_side == "H" else r["home_slug"],
        "p_winner": round(pH if winner_side == "H" else 1 - pH, 4),
        "score": sc, "metro": r.get("metro"), "venue": r.get("venue"),
        "playoff": r["playoff"], "round": r.get("round"),
    }


def rebuild_upsets(all_rows, limit=100):
    scored = [r for r in all_rows
              if r.get("result") in ("H", "A") and "surprise" in r]
    upsets = sorted(scored, key=lambda r: -r["surprise"])[:limit]
    return [_side_view(r, r["result"]) for r in upsets]


def apply_all(penalty_elo=PENALTY_ELO_DEFAULT):
    per_season_flagged_sides = {}
    all_rows_before, all_rows_after = [], []

    for season, path in _iter_season_paths():
        data = json.load(io.open(path, encoding="utf-8"))
        games = data.get("games", [])
        for g in games:
            if g.get("result") in ("H", "A") and "surprise" in g:
                # deep, not shallow: adjust() mutates model{} and rest{} IN
                # PLACE on these same row objects a few lines down, and a
                # shallow dict(g) would still share the nested "model" dict
                # by reference, silently corrupting this "before" snapshot.
                all_rows_before.append(copy.deepcopy(g))
        flags_map = adjust(games, penalty_elo=penalty_elo)
        if season >= 2002:
            per_season_flagged_sides[season] = sum(
                int(v["home"]) + int(v["away"]) for v in flags_map.values())
        json.dump(data, io.open(path, "w", encoding="utf-8", newline=""),
                   separators=(",", ":"), ensure_ascii=False)
        all_rows_after.extend(games)

    # BEFORE is scored on raw model.pH (never pH_rest), so it reads as "no
    # rest adjustment at all" even when run a second time against files a
    # prior --apply already wrote pH_rest/rest into.
    def _raw_surprise(r):
        pH = (r.get("model") or {}).get("pH")
        if pH is None:
            return None
        result = r["result"]
        actual = 1.0 if result == "H" else 0.0
        return 1.0 - (pH if actual == 1.0 else (1 - pH))

    scored_before = [r for r in all_rows_before if _raw_surprise(r) is not None]
    upsets_before = sorted(scored_before, key=lambda r: -_raw_surprise(r))[:10]
    upsets_before_view = [_side_view_raw(r, r["result"]) for r in upsets_before]
    upsets_after_view = rebuild_upsets(all_rows_after)

    index_path = os.path.join(EXPDIR, "index.json")
    index = json.load(io.open(index_path, encoding="utf-8"))
    index["upsets"] = rebuild_upsets(all_rows_after, limit=100)
    index.setdefault("meta", {})["rest_adjustment"] = {
        "penalty_elo": penalty_elo,
        "note": REST_ADJUSTMENT_NOTE,
    }
    json.dump(index, io.open(index_path, "w", encoding="utf-8", newline=""),
               separators=(",", ":"), ensure_ascii=False)

    return per_season_flagged_sides, upsets_before_view, upsets_after_view[:10]


def _print_upset_row(u):
    print("  %d %-10s %-28s beat %-28s p=%.3f %-8s %s" % (
        u["season"], u["date"] or "", u["winner"][:28], u["loser"][:28],
        u["p_winner"], u["score"] or "", u["metro"] or ""))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--penalty-elo", type=float, default=PENALTY_ELO_DEFAULT)
    args = ap.parse_args()

    if not args.self_test and not args.apply:
        ap.print_help()
        return

    if args.self_test:
        ok = self_test()
        if not ok:
            sys.exit(1)
        if not args.apply:
            return

    if args.apply:
        flagged, before, after = apply_all(penalty_elo=args.penalty_elo)
        print("\nsides flagged 'rested' per season (2002 on):")
        for season in sorted(flagged):
            print("  %d: %d" % (season, flagged[season]))
        print("  total: %d" % sum(flagged.values()))

        print("\nTOP 10 ALL-TIME UPSETS, BEFORE THE REST ADJUSTMENT")
        for u in before:
            _print_upset_row(u)
        print("\nTOP 10 ALL-TIME UPSETS, AFTER THE REST ADJUSTMENT")
        for u in after:
            _print_upset_row(u)


if __name__ == "__main__":
    main()
