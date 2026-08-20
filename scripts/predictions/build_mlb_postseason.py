#!/usr/bin/env python3
"""MLB postseason ledger - the October leg of Citizen of Nowhere Picks.

Emits public/data/mlb-predictions.json in the same shape the NFL and CFB
ledgers use, plus a `series` block for the lock-before-Game-1 series picks:

  { meta: {league:"mlb", season, generated_at, ...},
    ledger: [ per-GAME entries: event_id, date, kickoff, home/away,
              model {pH}, market {pH} when ESPN posts a moneyline,
              pick, result, score ],
    series: [ per-SERIES entries: series_id, round (WC/DS/CS/WS), date,
              kickoff (Game 1), home (higher seed), away, model {pH},
              result once decided ] }

Before the bracket exists the file carries an empty ledger and series list -
a real, valid artifact that keeps the picks client's MLB tab hidden. Safe to
run on any cadence; a run before October simply re-emits the empty shape.

RATINGS. October pricing wants end-of-regular-season strength, so the rating
is the season's own full-162 run differential per game (weight CUR_W), with
last season as a small stabiliser, through the same ten-runs-per-win ->
log-odds -> log5+HFA machinery as build_mlb_sim (all imported from it, never
copied). Series probabilities are EXACT best-of-N recursions over the real
home patterns, not simulations.

TRAPS built against (documented in memory, learned the hard way):
  - NEVER pass limit= to an ESPN scoreboard URL (it truncates silently and
    drops future games first). The date-RANGE form is used and the parse
    reconciles: every completed series must show a winner with exactly the
    needed wins.
  - Round detection reads the series/notes text from the feed; a game whose
    round cannot be named goes to the ledger but NOT into a series, and is
    counted in meta.unassigned_games rather than guessed.

    python scripts/predictions/build_mlb_postseason.py             # write
    python scripts/predictions/build_mlb_postseason.py --dry
    python scripts/predictions/build_mlb_postseason.py --season 2025 --dry
    python scripts/predictions/build_mlb_postseason.py --self-test

The --season 2025 dry run is the backtest: a completed postseason must parse
into series that all reconcile, or the parse is wrong.
"""
import argparse
import io
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_mlb_sim import (  # noqa: E402
    ESPN, HFA_LOGIT, REGRESS, TEAM_LG, TEAMS,
    WC_PATTERN, LDS_PATTERN, BO7_PATTERN,
    espn_teams, fetch_json, home_win_prob, rating_from_wpct, season_rundiff,
    wpct_from_rd,
)

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_LEDGER = os.path.join(ROOT, "public", "data", "mlb-predictions.json")

CUR_W = 0.85          # weight of the season's own run differential in October
ROUND_NEED = {"WC": 2, "DS": 3, "CS": 4, "WS": 4}
ROUND_PATTERN = {"WC": WC_PATTERN, "DS": LDS_PATTERN, "CS": BO7_PATTERN, "WS": BO7_PATTERN}
# The feed's notes use abbreviations ("ALWC - Game 2", "NLDS - Game 1");
# spelled-out names appear elsewhere. Both forms are matched, verified against
# the real 2025 postseason feed.
ROUND_WORDS = [
    ("alwc", "WC"), ("nlwc", "WC"), ("wild card", "WC"),
    ("alds", "DS"), ("nlds", "DS"), ("division series", "DS"),
    ("alcs", "CS"), ("nlcs", "CS"), ("championship series", "CS"),
    ("world series", "WS"),
]


def slugify(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", (name or "").lower())).strip("-")


def postseason_ratings(season):
    """End-of-regular-season log-odds ratings: the season's own full-162 run
    differential, stabilised by last season through the sim's REGRESS."""
    cur = season_rundiff(season)
    prev = season_rundiff(season - 1)
    ratings = {}
    for t in TEAMS:
        rd_cur = cur.get(t, (0.0, 0))[0]
        rd_prev = REGRESS * prev.get(t, (0.0, 0))[0]
        rd = CUR_W * rd_cur + (1.0 - CUR_W) * rd_prev
        ratings[t] = rating_from_wpct(wpct_from_rd(rd))
    m = sum(ratings.values()) / len(ratings)
    return {t: v - m for t, v in ratings.items()}


def series_prob(r_hi, r_lo, pattern):
    """Exact P(higher seed wins the series) over the real home pattern."""
    need = len(pattern) // 2 + 1
    p_home = home_win_prob(r_hi, r_lo)
    p_away = 1.0 - home_win_prob(r_lo, r_hi)

    def rec(i, w_hi, w_lo):
        if w_hi == need:
            return 1.0
        if w_lo == need:
            return 0.0
        p = p_home if pattern[i] == "H" else p_away
        return p * rec(i + 1, w_hi + 1, w_lo) + (1.0 - p) * rec(i + 1, w_hi, w_lo + 1)
    return rec(0, 0, 0)


def detect_round(event):
    """WC/DS/CS/WS from the feed's own words; None when it names nothing."""
    texts = []
    for comp in event.get("competitions", []) or []:
        s = comp.get("series") or {}
        texts.append(str(s.get("title") or ""))
        for n in comp.get("notes", []) or []:
            texts.append(str(n.get("headline") or ""))
    texts.append(str(event.get("name") or ""))
    blob = " ".join(texts).lower()
    for words, code in ROUND_WORDS:
        if words in blob:
            return code
    return None


def american_odds_prob(comp):
    """Home win probability from a posted moneyline pair, devigged; None
    when the feed carries no odds (normal for finished historical games)."""
    for o in comp.get("odds", []) or []:
        h = ((o.get("homeTeamOdds") or {}).get("moneyLine"))
        a = ((o.get("awayTeamOdds") or {}).get("moneyLine"))
        if h is None or a is None:
            continue
        def prob(ml):
            ml = float(ml)
            return 100.0 / (ml + 100.0) if ml > 0 else -ml / (-ml + 100.0)
        ph, pa = prob(h), prob(a)
        if ph + pa > 0:
            return ph / (ph + pa)
    return None


def fetch_postseason_events(season):
    """Every postseason event, in two-week chunks so no single response can
    approach the scoreboard's silent default cap (a 0925-1120 range came back
    at exactly 100 events, regular-season games included — both trap shapes
    at once). Events are filtered to season.type == 3 and deduped by id."""
    windows = [
        ("%d0925" % season, "%d1008" % season),
        ("%d1009" % season, "%d1022" % season),
        ("%d1023" % season, "%d1105" % season),
        ("%d1106" % season, "%d1120" % season),
    ]
    seen, out = set(), []
    for a, b in windows:
        url = ("%s/site/v2/sports/baseball/mlb/scoreboard?dates=%s-%s"
               "&seasontype=3" % (ESPN, a, b))
        d = fetch_json(url, soft=True)
        for ev in (d or {}).get("events", []) or []:
            if (ev.get("season") or {}).get("type") != 3:
                continue
            eid = str(ev.get("id"))
            if eid in seen:
                continue
            seen.add(eid)
            out.append(ev)
    return out


def parse_games(events, id_to_mark):
    """Scoreboard events -> per-game dicts keyed for the ledger."""
    games = []
    for ev in events:
        comps = ev.get("competitions", []) or []
        if not comps:
            continue
        comp = comps[0]
        sides = {c.get("homeAway"): c for c in comp.get("competitors", []) or []}
        home, away = sides.get("home"), sides.get("away")
        if not home or not away:
            continue
        h_mark = id_to_mark.get(str((home.get("team") or {}).get("id")))
        a_mark = id_to_mark.get(str((away.get("team") or {}).get("id")))
        if not h_mark or not a_mark:
            continue  # exhibition or a team outside the 30-club map
        iso = str(ev.get("date") or "")
        completed = bool(((comp.get("status") or {}).get("type") or {}).get("completed"))
        hs = as_ = None
        if completed:
            try:
                hs, as_ = int(home.get("score")), int(away.get("score"))
            except (TypeError, ValueError):
                completed = False
        games.append({
            "event_id": str(ev.get("id")),
            "iso": iso,
            "date": iso[:10],
            "round": detect_round(ev),
            "home_mark": h_mark, "away_mark": a_mark,
            "completed": completed, "hs": hs, "as": as_,
            "market_ph": american_odds_prob(comp),
        })
    games.sort(key=lambda g: (g["iso"], g["event_id"]))
    return games


def assemble(games, ratings, names):
    """-> (ledger_rows, series_rows, unassigned) in the picks shapes."""
    disp = {t: names[t][1] for t in TEAMS}

    ledger = []
    for g in games:
        ph = home_win_prob(ratings[g["home_mark"]], ratings[g["away_mark"]])
        row = {
            "event_id": g["event_id"],
            "date": g["date"],
            "kickoff": g["iso"],
            "home": disp[g["home_mark"]], "away": disp[g["away_mark"]],
            "home_slug": slugify(disp[g["home_mark"]]),
            "away_slug": slugify(disp[g["away_mark"]]),
            "model": {"pH": round(ph, 4)},
            "pick": "H" if ph >= 0.5 else "A",
        }
        if g["market_ph"] is not None:
            row["market"] = {"pH": round(g["market_ph"], 4)}
        if g["completed"]:
            row["result"] = "H" if g["hs"] > g["as"] else "A"
            row["score"] = "%d-%d" % (g["hs"], g["as"])
        ledger.append(row)

    # Series: group by (round, pair). The higher seed is whoever is at home
    # in Game 1 - that is what the bracket formats guarantee.
    groups, unassigned = {}, 0
    for g in games:
        if g["round"] is None:
            unassigned += 1
            continue
        pair = tuple(sorted((g["home_mark"], g["away_mark"])))
        groups.setdefault((g["round"], pair), []).append(g)

    series = []
    for (rnd, pair), gs in groups.items():
        gs.sort(key=lambda g: (g["iso"], g["event_id"]))
        g1 = gs[0]
        hi, lo = g1["home_mark"], g1["away_mark"]
        need = ROUND_NEED[rnd]
        wins = {hi: 0, lo: 0}
        for g in gs:
            if g["completed"]:
                wins[g["home_mark"] if g["hs"] > g["as"] else g["away_mark"]] += 1
        row = {
            "series_id": "%s-%s" % (rnd.lower(), "-".join(slugify(disp[t]) for t in pair)),
            "round": rnd,
            "date": g1["date"],
            "kickoff": g1["iso"],
            "home": disp[hi], "away": disp[lo],
            "home_slug": slugify(disp[hi]), "away_slug": slugify(disp[lo]),
            "model": {"pH": round(series_prob(ratings[hi], ratings[lo], ROUND_PATTERN[rnd]), 4)},
        }
        if wins[hi] >= need:
            row["result"] = "H"
        elif wins[lo] >= need:
            row["result"] = "A"
        # Reconcile: nobody may exceed the wins a series can hold, and a
        # completed pile of games with no winner means the parse is wrong.
        if max(wins.values()) > need:
            raise SystemExit("series %s holds %d wins for one side; best-of "
                             "needs %d - the grouping is broken"
                             % (row["series_id"], max(wins.values()), need))
        if all(g["completed"] for g in gs) and len(gs) >= need and "result" not in row:
            raise SystemExit("series %s: %d completed games but no side has %d "
                             "wins - the grouping is broken"
                             % (row["series_id"], len(gs), need))
        series.append(row)
    series.sort(key=lambda s: (s["date"], s["series_id"]))
    return ledger, series, unassigned


def build(season, today=None):
    names = espn_teams()
    id_to_mark = {str(v[0]): k for k, v in names.items() if k in TEAM_LG}
    events = fetch_postseason_events(season)
    games = parse_games(events, id_to_mark)
    if games:
        ratings = postseason_ratings(season)
        ledger, series, unassigned = assemble(games, ratings, names)
    else:
        ledger, series, unassigned = [], [], 0
    return {
        "meta": {
            "league": "mlb", "season": season,
            "generated_at": (today or date.today()).isoformat(),
            "mode": "postseason",
            "events": len(games), "series": len(series),
            "unassigned_games": unassigned,
            "source": "ESPN postseason scoreboard (date-range form, no limit param) "
                      "+ ESPN standings run differentials",
            "notes": "Game probabilities are log5 + home field on end-of-season "
                     "run-differential ratings (CUR_W %.2f). Series probabilities "
                     "are exact best-of-N recursions over the real home patterns. "
                     "A game whose round the feed does not name joins the ledger "
                     "but never a series." % CUR_W,
        },
        "ledger": ledger,
        "series": series,
    }


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []
    total = [0]

    def check(name, cond):
        total[0] += 1
        if not cond:
            fails.append(name)
        print("  %s %s" % ("PASS" if cond else "FAIL", name))

    # series_prob sanity: equal teams, all-home pattern -> above .5 (HFA);
    # symmetric pattern count -> exactly the home-edge advantage compounds.
    p = series_prob(0.0, 0.0, WC_PATTERN)
    check("equal teams at home favoured in a Bo3 (%.3f)" % p, 0.5 < p < 0.65)
    p7 = series_prob(0.0, 0.0, BO7_PATTERN)
    check("2-3-2 pattern nearly neutral for equal teams (%.3f)" % p7, 0.5 < p7 < 0.56)
    check("better team favoured", series_prob(0.3, -0.3, LDS_PATTERN) > 0.62)
    check("probabilities complement",
          abs(series_prob(0.2, -0.1, BO7_PATTERN)
              + series_prob_flipped(0.2, -0.1, BO7_PATTERN) - 1.0) < 1e-9)

    # round detection from feed words
    ev = {"competitions": [{"series": {"title": "NL Division Series"}, "notes": []}], "name": ""}
    check("round from series title", detect_round(ev) == "DS")
    ev = {"competitions": [{"notes": [{"headline": "World Series - Game 3"}]}], "name": ""}
    check("round from notes", detect_round(ev) == "WS")
    ev = {"competitions": [{}], "name": "Athletics at Braves"}
    check("unknown round refuses", detect_round(ev) is None)

    check("slugify", slugify("St. Louis Cardinals") == "st-louis-cardinals")

    print("%d PASS, %d FAIL" % (total[0] - len(fails), len(fails)))
    return 1 if fails else 0


def series_prob_flipped(r_hi, r_lo, pattern):
    """The same series seen from the lower seed: flip teams AND pattern."""
    flipped = ["A" if s == "H" else "H" for s in pattern]
    return series_prob(r_lo, r_hi, flipped)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=None)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        sys.exit(self_test())

    from build_mlb_sim import SEASON
    season = a.season or SEASON
    out = build(season)
    m = out["meta"]
    print("season %d: %d postseason games, %d series, %d unassigned"
          % (season, m["events"], m["series"], m["unassigned_games"]))
    for s in out["series"]:
        res = " -> %s" % (s["home"] if s.get("result") == "H" else s["away"]) if s.get("result") else ""
        print("  %-2s %s: %s v %s  pH=%.3f%s"
              % (s["round"], s["date"], s["home"], s["away"], s["model"]["pH"], res))
    graded = [g for g in out["ledger"] if g.get("result")]
    if graded:
        brier = sum((g["model"]["pH"] - (1.0 if g["result"] == "H" else 0.0)) ** 2
                    for g in graded) / len(graded)
        print("model Brier over %d graded games: %.4f" % (len(graded), brier))
    if a.dry:
        print("dry run: nothing written")
        return
    with io.open(OUT_LEDGER, "w", encoding="utf-8", newline="") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote %s" % OUT_LEDGER)


if __name__ == "__main__":
    main()
