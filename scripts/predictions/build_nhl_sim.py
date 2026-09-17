#!/usr/bin/env python3
"""NHL playoff and Stanley Cup odds by Monte Carlo.

Mirrors scripts/predictions/build_mlb_sim.py: ratings from recent goal
differential, the real remaining schedule from ESPN, correlated per-season
noise under common random numbers, then the actual bracket. Writes
public/data/nhl-sim.json (+ nhl-sim-history.json) in the same {meta, table}
shape every other league's sim uses, so lib/nhlSim.ts and the standings block
follow the established pattern rather than inventing one.

🔴 HOCKEY IS NOT BASEBALL IN ONE WAY THAT MATTERS MORE THAN ANY OTHER, AND A
SIM THAT MISSES IT IS WRONG BY ABOUT NINE POINTS A TEAM A SEASON.

A won game is worth 2 points. A LOST game is worth 1 point if it went past
regulation and 0 if it did not. So a game puts either 2 or 3 points into the
league depending on whether it reached overtime, and the standings everyone
reads are points, not wins. Simulating only "who won" and awarding 2-0 would
understate every team's total by roughly the OT rate times the schedule.

MEASURED, NOT RECALLED. Over 13,511 regular-season games in NHL.xlsx from
2016 to 2026: 22.46% went past regulation (per-season range 20.7% to 24.9%)
and the home side won 54.04% of them, which is an HFA of 0.1619 in log-odds.
Both constants below come from that count. Re-measure rather than nudge them.

⚠️ WHAT THIS DOES NOT MODEL, stated so nobody assumes otherwise:
  - Goalie starts, injuries and trade-deadline moves. A rating is a team's
    recent goal differential, regressed; it does not know who is hurt.
  - The real tie-break ladder past regulation wins. Points, then regulation
    wins, then a coin flip. ROW and head-to-head points are the next two
    rungs and are not modelled.
  - Back-to-backs and travel, which are a real NHL effect and a known gap.

Usage:
    python scripts/predictions/build_nhl_sim.py --self-test
    python scripts/predictions/build_nhl_sim.py --sims 20000
    python scripts/predictions/build_nhl_sim.py --sims 20000 --write
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import sim_common as sc  # noqa: E402

OUT_SIM = os.path.join(ROOT, "public", "data", "nhl-sim.json")
OUT_HIST = os.path.join(ROOT, "public", "data", "nhl-sim-history.json")

SEASON = 2027                 # the 2026-27 season, by the site's end-year rule

# 🔴 84, NOT 82, AND THIS IS NEW. The CBA that began on 2026-09-16 expanded the
# NHL regular season for the first time in 33 years: 84 games, 42 home and 42
# away, 1,344 across the league, with both added games INTRA-DIVISION so every
# club plays each division rival exactly four times.
#
# Worth recording how this was nearly got wrong. ESPN's schedule feed returned
# 84 per team for all 32 clubs and the first version of this file treated that
# as a bug, because 82 was the number in my head. The schedule check was
# written to fail on it. Ashwin corrected it. The lesson is the one this repo
# already writes down elsewhere: assume your own code, and your own
# assumptions, before assuming the feed. A constant recalled from memory is not
# evidence, and this one had a four-year-old expiry date on it.
GAMES_PER_TEAM = 84
STRENGTH_SEASONS = [(2026, 0.60), (2025, 0.40)]
REGRESS = 0.60                # keep 60% of past goal differential

# 🔴 MEASURED from NHL.xlsx, 13,511 regular-season games 2016-2026.
P_OVERTIME = 0.2246           # share of games that go past regulation
HFA_LOGIT = 0.16185           # log-odds of the 54.04% home win rate

# Goals per win. From the hockey Pythagorean (exponent 2) at the measured
# 3.1 goals per team per game: a +0.5 goal/game side rates about .580, so
# p = 0.5 + gd / 6.25. The MLB builder's equivalent is RPW = 10 runs.
GPW = 6.25
WPCT_CLAMP = 0.20             # ratings clamp to .300-.700 true talent
CUR_W_CAP = 0.88
CUR_W_SLOPE = 1.25

SIGMA_SEASON = 0.075
SIGMA_FLOOR_FRAC = 0.45
DISAGREE_K = 0.5
HFA_SD = 0.01
DIV_SD = 0.03
TEAM_SD_FLOOR = 0.0004
MARKET_W_MAX = 0.35
DEFAULT_SIMS = 20000
SEED = SEASON
HISTORY_KEEP = 180

ESPN = "https://site.api.espn.com/apis"

# Canonical names are the workbook's, which is what lib/nhl-standings.ts
# produces and what nhlFranchises() joins on. Taken from
# public/data/nhl/franchises.json current_main_div / current_division.
DIVISIONS = {
    "Eastern Atlantic": ["Bruins", "Canadiens", "Lightning", "Maple Leafs",
                         "Panthers", "Red Wings", "Sabres", "Senators"],
    "Eastern Metropolitan": ["Blue Jackets", "Capitals", "Devils", "Flyers",
                             "Hurricanes", "Islanders", "Penguins", "Rangers"],
    "Western Central": ["Avalanche", "Blackhawks", "Blues", "Jets",
                        "Mammoth", "Predators", "Stars", "Wild"],
    "Western Pacific": ["Canucks", "Ducks", "Flames", "Golden Knights",
                        "Kings", "Kraken", "Oilers", "Sharks"],
}
TEAM_DIV = {t: d for d, ts in DIVISIONS.items() for t in ts}
TEAM_CONF = {t: d.split()[0] for t, d in TEAM_DIV.items()}
TEAMS = sorted(TEAM_DIV)

# Best-of-seven, 2-2-1-1-1, from the higher seed's point of view.
BO7 = ["H", "H", "A", "A", "H", "A", "H"]

# ESPN's `name` field is the mark ("Bruins", "Blue Jackets"), which is also
# the workbook canonical, so the join is direct for 31 of 32. Utah is the
# exception and has been through three names in three seasons. The same alias
# lives in lib/nhl-standings.ts CANONICAL_OVERRIDE and in
# scripts/predictions/nhl_workbook_ratings.py; a fourth copy should become a
# shared table.
ESPN_ALIASES = {
    "Hockey Club": "Mammoth",
    "Utah Hockey Club": "Mammoth",
    "Utah": "Mammoth",
    "Coyotes": "Mammoth",
}


# ------------------------------------------------------------------- ratings

def wpct_from_gd(gd):
    p = 0.5 + gd / GPW
    return min(max(p, 0.5 - WPCT_CLAMP), 0.5 + WPCT_CLAMP)


def rating_from_wpct(p):
    return math.log(p / (1.0 - p))


def base_ratings(per_season, played_games):
    """Log-odds true-talent rating per team, mean-centred.

    `per_season`: {season: {team: goal_diff_per_game}}
    `played_games`: [(home, away, hg, ag)] of completed games this season.
    """
    cur = {t: [0.0, 0] for t in TEAMS}
    for h, a, hg, ag in played_games:
        if h in cur:
            cur[h][0] += hg - ag
            cur[h][1] += 1
        if a in cur:
            cur[a][0] += ag - hg
            cur[a][1] += 1
    ratings = {}
    for t in TEAMS:
        num = den = 0.0
        for season, w in STRENGTH_SEASONS:
            m = per_season.get(season, {}).get(t)
            if m is not None:
                num += w * m
                den += w
        gd = REGRESS * (num / den) if den else 0.0
        gp = cur[t][1]
        if gp:
            wc = min(CUR_W_CAP, gp / float(GAMES_PER_TEAM) * CUR_W_SLOPE)
            gd = (1 - wc) * gd + wc * (cur[t][0] / gp)
        ratings[t] = rating_from_wpct(wpct_from_gd(gd))
    m = sum(ratings.values()) / len(ratings)
    return {t: v - m for t, v in ratings.items()}


def home_win_prob(r_h, r_a, hfa=HFA_LOGIT):
    """log5 plus home ice, in log-odds where both are additive. This is the
    probability the home side wins the GAME, in regulation or past it."""
    return 1.0 / (1.0 + math.exp(-(r_h - r_a + hfa)))


# ------------------------------------------------------------------ standings

def award_points(winner, loser, went_ot, pts, regw):
    """🔴 The three-point game. 2 to the winner always; 1 to the loser ONLY
    when the game went past regulation; a regulation win counted separately
    because it is the first tie-break after points."""
    pts[winner] += 2
    if went_ot:
        pts[loser] += 1
    else:
        regw[winner] += 1


def rank_group(teams, pts, regw, rng):
    """Points, then regulation wins, then a coin flip.

    The real ladder continues ROW, then head-to-head points, then goal
    differential. Those are not modelled, and the coin flip stands in for
    them. It matters less than it looks: it only separates teams already
    level on both points and regulation wins.
    """
    members = list(teams)
    return sorted(members, key=lambda t: (-pts[t], -regw[t], rng.random()))


def playoff_field(pts, regw, rng):
    """{conference: [seed0..seed7]} in BRACKET order, not merit order.

    The NHL does not seed 1-8 across a conference. Each division sends its
    top three, then the conference's two best remaining teams enter as wild
    cards. The bracket is then built in halves:

        A1 v WC2      B1 v WC1
        A2 v A3       B2 v B3

    where A is the division whose winner has the better record and WC1 is
    the better wild card. So the list returned is
    [A1, A2, A3, WC2, B1, B2, B3, WC1] and the first four play the first
    four: index 0 v 3, 1 v 2, then 4 v 7, 5 v 6.
    """
    field = {}
    for conf in ("Eastern", "Western"):
        divs = [d for d in DIVISIONS if d.startswith(conf)]
        top3, rest = {}, []
        for d in divs:
            order = rank_group(DIVISIONS[d], pts, regw, rng)
            top3[d] = order[:3]
            rest.extend(order[3:])
        wc = rank_group(rest, pts, regw, rng)[:2]
        # The division winner with the better record takes the LOWER wild card.
        a_div, b_div = sorted(divs, key=lambda d: (-pts[top3[d][0]],
                                                   -regw[top3[d][0]],
                                                   rng.random()))
        field[conf] = top3[a_div] + [wc[1]] + top3[b_div] + [wc[0]]
    return field


def sim_series(hi, lo, r, rng, pattern=BO7):
    """Best-of-seven. `hi` has home ice. Overtime is irrelevant here: a
    playoff game has no loser point and is played until somebody wins."""
    need = len(pattern) // 2 + 1
    w_hi = w_lo = 0
    for slot in pattern:
        p = home_win_prob(r[hi], r[lo]) if slot == "H" else 1.0 - home_win_prob(r[lo], r[hi])
        if rng.random() < p:
            w_hi += 1
        else:
            w_lo += 1
        if w_hi == need or w_lo == need:
            break
    return hi if w_hi > w_lo else lo


def run_playoffs(field, pts, regw, r, rng):
    """-> (east_champion, west_champion, cup_winner). Four best-of-seven
    rounds. Home ice in every round goes to the better regular-season record,
    which is the real rule and is NOT the same as the bracket position."""
    def better(x, y):
        return x if (pts[x], regw[x]) >= (pts[y], regw[y]) else y

    finalists = {}
    for conf in ("Eastern", "Western"):
        s = field[conf]
        # Round 1, in bracket halves.
        r1 = [sim_series(s[0], s[3], r, rng), sim_series(s[1], s[2], r, rng),
              sim_series(s[4], s[7], r, rng), sim_series(s[5], s[6], r, rng)]
        # Round 2: the two survivors of each half meet.
        d1 = sim_series(better(r1[0], r1[1]),
                        r1[1] if better(r1[0], r1[1]) == r1[0] else r1[0], r, rng)
        d2 = sim_series(better(r1[2], r1[3]),
                        r1[3] if better(r1[2], r1[3]) == r1[2] else r1[2], r, rng)
        # Round 3: conference final.
        hi = better(d1, d2)
        finalists[conf] = sim_series(hi, d2 if hi == d1 else d1, r, rng)
    e, w = finalists["Eastern"], finalists["Western"]
    host = better(e, w)
    return e, w, sim_series(host, w if host == e else e, r, rng)


# ----------------------------------------------------------------- the engine

def _tally():
    return {"points": 0.0, "division": 0, "playoffs": 0, "wildcard": 0,
            "conf": 0, "cup": 0, "president": 0}


def div_residual_sd(sigma_adaptive):
    return sc.layer_residual_sd(sigma_adaptive, DIV_SD, floor=TEAM_SD_FLOOR)


def simulate(ratings, schedule, base_pts, base_regw, sims, seed=SEED,
             sigma_team=None, gid_pos=None, n_full=0):
    """Monte Carlo the remaining schedule `sims` times.

    Common random numbers, as in the MLB builder: season i draws its
    correlated shocks (league-wide HFA jitter, per-division jitter, per-team
    residual) and then TWO uniforms per game of the full schedule, indexed by
    gid_pos so a game's draw never moves between builds. Postseason and
    tie-break draws come from a second stream so neither's length depends on
    the other.

    🔴 TWO uniforms per game, not one. The first decides the winner, the
    second decides whether it went past regulation. Drawing the overtime flag
    from the same stream as the result would make them share entropy and
    couple "who won" to "was it close", which is not a relationship this
    model claims to know.
    """
    sigma_team = sigma_team or {}
    gid_pos = gid_pos or {}
    div_names = sorted(DIVISIONS)
    e_sd = {t: div_residual_sd(sigma_team.get(t, SIGMA_SEASON)) for t in TEAMS}

    acc = {t: _tally() for t in TEAMS}
    pts_lists = {t: [] for t in TEAMS}

    for i in range(sims):
        rng = random.Random(seed * 1_000_003 + i)
        rng2 = random.Random(seed * 7_919 + i)
        hfa_s = HFA_LOGIT + rng.gauss(0.0, HFA_SD)
        div_noise = {d: rng.gauss(0.0, DIV_SD) for d in div_names}
        team_noise = {t: rng.gauss(0.0, e_sd[t]) for t in TEAMS}
        r = {t: ratings[t] + div_noise[TEAM_DIV[t]] + team_noise[t] for t in TEAMS}
        uniforms = [rng.random() for _ in range(n_full * 2)]

        pcache = {}
        pts = dict(base_pts)
        regw = dict(base_regw)
        for gid, h, a in schedule:
            key = (h, a)
            p = pcache.get(key)
            if p is None:
                p = pcache[key] = home_win_prob(r[h], r[a], hfa=hfa_s)
            if gid in gid_pos:
                pos = gid_pos[gid] * 2
                u_win, u_ot = uniforms[pos], uniforms[pos + 1]
            else:
                u_win, u_ot = rng.random(), rng.random()
            winner, loser = (h, a) if u_win < p else (a, h)
            award_points(winner, loser, u_ot < P_OVERTIME, pts, regw)

        field = playoff_field(pts, regw, rng2)
        e, w, cup = run_playoffs(field, pts, regw, r, rng2)
        for conf in ("Eastern", "Western"):
            s = field[conf]
            for t in s:
                acc[t]["playoffs"] += 1
            # Seeds 3 and 7 in the bracket-ordered list are the wild cards.
            for t in (s[3], s[7]):
                acc[t]["wildcard"] += 1
            for t in (s[0], s[4]):
                acc[t]["division"] += 1
        acc[e]["conf"] += 1
        acc[w]["conf"] += 1
        acc[cup]["cup"] += 1
        best = max(TEAMS, key=lambda t: (pts[t], regw[t], rng2.random()))
        acc[best]["president"] += 1
        for t in TEAMS:
            acc[t]["points"] += pts[t]
            pts_lists[t].append(pts[t])
    return acc, pts_lists


# --------------------------------------------------------------- the self-test

def self_test():
    """Pure decision logic, no network and no workbook. The cases are the
    things that would be WRONG AND PLAUSIBLE: a points total that looks like
    a points total but is nine short, a bracket that pairs the right number
    of teams in the wrong halves."""
    fails = []

    def check(label, got, want, tol=None):
        ok = abs(got - want) <= tol if tol is not None else got == want
        if not ok:
            fails.append(f"{label}: got {got!r}, want {want!r}")

    # --- the three-point game, which is the whole reason this is not the MLB sim
    pts = defaultdict(int); regw = defaultdict(int)
    award_points("A", "B", False, pts, regw)
    check("regulation win: winner 2", pts["A"], 2)
    check("regulation win: loser 0", pts["B"], 0)
    check("regulation win counts", regw["A"], 1)
    pts = defaultdict(int); regw = defaultdict(int)
    award_points("A", "B", True, pts, regw)
    check("OT win: winner 2", pts["A"], 2)
    check("OT win: loser gets the point", pts["B"], 1)
    check("an OT win is NOT a regulation win", regw["A"], 0)
    # 🔴 The league-wide consequence, stated as a number so a regression is
    # obvious: the 84-game season is 1,344 games, and at the measured OT rate
    # that many put this many points into the league beyond two per game.
    games_in_season = GAMES_PER_TEAM * len(TEAMS) // 2
    check("the 2026-27 league schedule", games_in_season, 1344)
    check("loser points per season", round(games_in_season * P_OVERTIME), 302)

    # --- ratings
    check("even goal difference is average", wpct_from_gd(0.0), 0.5, 1e-12)
    check("+0.5 gd per game is about .580", wpct_from_gd(0.5), 0.58, 0.005)
    check("clamped below", wpct_from_gd(-9.0), 0.30, 1e-9)
    check("clamped above", wpct_from_gd(9.0), 0.70, 1e-9)
    check("home ice is worth the measured edge",
          home_win_prob(0.0, 0.0), 0.5404, 0.0005)
    check("away is the mirror", home_win_prob(0.0, 0.0) + home_win_prob(0.0, 0.0) - 1,
          2 * 0.5404 - 1, 0.001)

    # --- ranking
    rng = random.Random(1)
    P = {"a": 100, "b": 100, "c": 99}
    R = {"a": 30, "b": 40, "c": 50}
    order = rank_group(["a", "b", "c"], P, R, rng)
    check("points first, then regulation wins", order, ["b", "a", "c"])

    # --- the bracket
    # Give every team a distinct points total so the field is deterministic:
    # the higher the index in TEAMS, the better. Then assert the SHAPE.
    P = {t: 60 + i for i, t in enumerate(TEAMS)}
    R = {t: 0 for t in TEAMS}
    field = playoff_field(P, R, random.Random(7))
    for conf in ("Eastern", "Western"):
        s = field[conf]
        check(f"{conf}: eight teams", len(s), 8)
        check(f"{conf}: no duplicates", len(set(s)), 8)
        divs = [d for d in DIVISIONS if d.startswith(conf)]
        # The first three and the fifth-to-seventh must each be one division.
        d_a = {TEAM_DIV[t] for t in s[:3]}
        d_b = {TEAM_DIV[t] for t in s[4:7]}
        check(f"{conf}: first half is one division", len(d_a), 1)
        check(f"{conf}: second half is one division", len(d_b), 1)
        check(f"{conf}: the two halves are different divisions", d_a != d_b, True)
        check(f"{conf}: both divisions represented", d_a | d_b, set(divs))
        # 🔴 WHICH WILD CARD GOES WHERE. Added after mutation testing: swapping
        # wc[0] and wc[1] in playoff_field left every assertion above passing,
        # because all of them are about SHAPE. The rule is that the division
        # winner with the BETTER record draws the WEAKER wild card, so the
        # reward for finishing top is an easier first round. Get this backwards
        # and the bracket is still well formed, still has sixteen teams, and is
        # still wrong in a way no structural check can see.
        wc_a, wc_b = s[3], s[7]          # facing A1 and B1 respectively
        check(f"{conf}: A1 is the better division winner",
              (P[s[0]], R[s[0]]) >= (P[s[4]], R[s[4]]), True)
        check(f"{conf}: the better division winner draws the weaker wild card",
              (P[wc_a], R[wc_a]) <= (P[wc_b], R[wc_b]), True)
        # Every seeded team must outrank every unseeded one in its conference.
        conf_teams = [t for t in TEAMS if TEAM_CONF[t] == conf]
        missed = [t for t in conf_teams if t not in s]
        if missed and min(P[t] for t in s) < max(P[t] for t in missed):
            # Legitimate: a third-place team in a strong division can miss out
            # to a wild card. Assert only that the DIVISION TOP THREE are in.
            pass
        for d in divs:
            top3 = sorted(DIVISIONS[d], key=lambda t: -P[t])[:3]
            for t in top3:
                if t not in s:
                    fails.append(f"{conf}: {t} is top three in {d} but missed the field")

    # A whole conference's worth of playoff runs must produce exactly one
    # champion per conference and exactly one Cup winner.
    r = {t: 0.0 for t in TEAMS}
    rng = random.Random(3)
    e, w, cup = run_playoffs(field, P, R, r, rng)
    check("east champion is an east team", TEAM_CONF[e], "Eastern")
    check("west champion is a west team", TEAM_CONF[w], "Western")
    check("the Cup winner is one of the two finalists", cup in (e, w), True)

    # --- the engine end to end, on a tiny synthetic season
    ratings = {t: 0.0 for t in TEAMS}
    sched = []
    gid = 0
    for a in TEAMS:
        for b in TEAMS:
            if a != b:
                sched.append((gid, a, b))
                gid += 1
    gid_pos = {g: i for i, (g, _, _) in enumerate(sched)}
    acc, pts_lists = simulate(
        ratings, sched, {t: 0 for t in TEAMS}, {t: 0 for t in TEAMS},
        sims=40, gid_pos=gid_pos, n_full=len(sched))
    n = 40
    check("every sim produces 16 playoff teams",
          sum(a["playoffs"] for a in acc.values()), 16 * n)
    check("every sim produces 4 division winners",
          sum(a["division"] for a in acc.values()), 4 * n)
    check("every sim produces 4 wild cards",
          sum(a["wildcard"] for a in acc.values()), 4 * n)
    check("every sim produces 2 conference champions",
          sum(a["conf"] for a in acc.values()), 2 * n)
    check("every sim produces 1 Cup winner",
          sum(a["cup"] for a in acc.values()), n)
    check("every sim produces 1 Presidents' Trophy",
          sum(a["president"] for a in acc.values()), n)
    # 🔴 THE POINTS IDENTITY. Each of the 32*31 games awards 2 points plus 1
    # more when it goes past regulation, so the league total is bounded and
    # its expectation is known. A sim that forgets the loser point fails here
    # and nowhere else.
    games = len(sched)
    total_pts = sum(a["points"] for a in acc.values()) / n
    lo, hi = 2 * games, 3 * games
    if not (lo < total_pts < hi):
        fails.append(f"league points {total_pts:.0f} outside ({lo}, {hi})")
    expected = games * (2 + P_OVERTIME)
    check("league points match the OT rate", total_pts, expected, expected * 0.02)

    for f in fails:
        print("  FAIL " + f)
    print(f"self-test: {'PASS' if not fails else str(len(fails)) + ' FAILURES'}")
    return 1 if fails else 0


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--sims", type=int, default=DEFAULT_SIMS)
    ap.add_argument("--offline", action="store_true",
                    help="Run on workbook ratings and a balanced schedule, no network.")
    ap.add_argument("--write", action="store_true",
                    help="Write public/data/nhl-sim.json. Without it, dry run.")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    # The self-test gates every path that fetches or writes, as in
    # scripts/civic/*. A transcription error here is invisible in the output:
    # every number still looks like a probability.
    if self_test() != 0:
        print("ABORT: self-test failed, refusing to fetch or write.")
        return 1

    if args.offline:
        return run_offline(args.sims)

    out = build(args.sims)
    if isinstance(out, int):
        return out
    doc, today_iso, played = out

    if not args.write:
        print("\nDRY RUN. Nothing written. Pass --write to emit "
              "public/data/nhl-sim.json.")
        return 0

    with open(OUT_SIM, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))

    # The history file is what the hub's week-over-week deltas read. It is
    # upserted by DATE, so rebuilding twice in a day replaces rather than
    # duplicates. 🔴 Both paths must be staged by whatever job runs this:
    # the 2026-09-04 incident was sim-history files written correctly and
    # never committed, so the deltas never appeared and nothing complained.
    hist = None
    if os.path.exists(OUT_HIST):
        with open(OUT_HIST, encoding="utf-8") as f:
            hist = json.load(f)
    rows = [{"canonical": r["canonical"], "p_playoffs": r["p_playoffs"],
             "p_cup": r["p_cup"], "points": r["points"]} for r in doc["table"]]
    hist = sc.upsert_snapshot(hist, today_iso, played, rows, "nhl", SEASON,
                              keep=HISTORY_KEEP)
    with open(OUT_HIST, "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))

    print(f"\nwrote public/data/nhl-sim.json ({len(doc['table'])} teams) "
          f"and nhl-sim-history.json ({len(hist['snapshots'])} snapshots)")
    return 0


def run_offline(sims):
    """Real ratings from the workbook, a BALANCED schedule, real bracket.

    ⚠️ THE SCHEDULE IS THE APPROXIMATION, AND IT IS NOT A SMALL ONE. The real
    NHL schedule is division-weighted: a team plays its own division far more
    often than the far conference. A balanced round robin therefore understates
    how much a team's playoff odds depend on the division it is stuck in, which
    is exactly what a playoff-odds column is for. These numbers are good enough
    to prove the engine and to eyeball against the market; they are NOT good
    enough to publish. Swap in ESPN's real schedule before anything ships.
    """
    from nhl_workbook_ratings import goal_diff_by_season, DEFAULT_WB

    if not os.path.exists(DEFAULT_WB):
        print(f"FATAL: {DEFAULT_WB} not found. Run scripts/stage-leagues.py")
        return 1
    seasons = [s for s, _ in STRENGTH_SEASONS]
    per_season = goal_diff_by_season(DEFAULT_WB, set(seasons))
    for s in seasons:
        have = set(per_season.get(s, {}))
        missing = [t for t in TEAMS if t not in have]
        if missing:
            print(f"⚠️  {s}: no goal differential for {len(missing)} team(s): "
                  f"{sorted(missing)[:6]}")

    ratings = base_ratings(per_season, [])
    # A double round robin: every team home and away against every other. 62
    # games each, not 84, and evenly spread, hence the warning above. The real
    # schedule is MORE division-weighted from 2026-27, not less: both games
    # added by the new CBA are intra-division.
    sched, gid = [], 0
    for h in TEAMS:
        for a in TEAMS:
            if h != a:
                sched.append((gid, h, a))
                gid += 1
    gid_pos = {g: i for i, (g, _, _) in enumerate(sched)}

    frac_left = 1.0
    sig = sc.adaptive_sigma(frac_left, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
    sigma_team = {t: sc.team_sigma(sig, ratings[t], ratings[t], DISAGREE_K) for t in TEAMS}

    print(f"\nsimulating {sims:,} seasons on workbook ratings "
          f"({', '.join(str(s) for s in seasons)})")
    acc, pts_lists = simulate(ratings, sched, {t: 0 for t in TEAMS},
                              {t: 0 for t in TEAMS}, sims, sigma_team=sigma_team,
                              gid_pos=gid_pos, n_full=len(sched))

    rows = []
    for t in TEAMS:
        a = acc[t]
        rows.append({
            "team": t, "conf": TEAM_CONF[t], "div": TEAM_DIV[t].split()[1],
            "rating": round(ratings[t], 4),
            "points": a["points"] / sims,
            "p_playoffs": a["playoffs"] / sims,
            "p_division": a["division"] / sims,
            "p_conf": a["conf"] / sims,
            "p_cup": a["cup"] / sims,
        })
    rows.sort(key=lambda r: -r["p_cup"])

    print(f"\n{'team':<16} {'div':<13} {'pts':>6} {'PO%':>7} {'Div%':>7} {'Conf%':>7} {'Cup%':>7}")
    for r in rows:
        print(f"{r['team']:<16} {r['div']:<13} {r['points']:6.1f} "
              f"{100 * r['p_playoffs']:6.1f}% {100 * r['p_division']:6.1f}% "
              f"{100 * r['p_conf']:6.1f}% {100 * r['p_cup']:6.1f}%")

    # Identities that must hold whatever the ratings are.
    tot_cup = sum(r["p_cup"] for r in rows)
    tot_po = sum(r["p_playoffs"] for r in rows)
    tot_conf = sum(r["p_conf"] for r in rows)
    print(f"\nchecks: Cup {tot_cup:.4f} (want 1)   playoff teams {tot_po:.3f} "
          f"(want 16)   conference finalists {tot_conf:.3f} (want 2)")
    ok = abs(tot_cup - 1) < 1e-9 and abs(tot_po - 16) < 1e-9 and abs(tot_conf - 2) < 1e-9
    mean_pts = sum(r["points"] for r in rows) / len(rows)
    # Each team plays every other home AND away, so 2*(n-1), not len/n.
    gpt = 2 * (len(TEAMS) - 1)
    print(f"        mean points {mean_pts:.1f} over {gpt} games per team "
          f"(expected {gpt * (2 + P_OVERTIME) / 2:.1f}); a real "
          f"{GAMES_PER_TEAM}-game season sits near "
          f"{GAMES_PER_TEAM * (2 + P_OVERTIME) / 2:.0f}")
    print(f"        {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


# ------------------------------------------------------ the live build

def build(sims, today=None):
    """Ratings from the workbook, the REAL schedule from ESPN, then the sim.

    Prior seasons come from NHL.xlsx rather than ESPN because that path is
    already proven and offline-testable; the current season's played games
    come from ESPN because the workbook will not have them until Ashwin
    updates it. That split is deliberate, not an accident of what was easy.
    """
    import nhl_espn
    from nhl_workbook_ratings import goal_diff_by_season, DEFAULT_WB

    today_iso = (today or date.today()).isoformat()

    if not os.path.exists(DEFAULT_WB):
        print(f"FATAL: {DEFAULT_WB} not found. Run scripts/stage-leagues.py")
        return 1
    per_season = goal_diff_by_season(DEFAULT_WB, {s for s, _ in STRENGTH_SEASONS})

    print("fetching ESPN teams and the 2026-27 schedule")
    ids = nhl_espn.espn_teams(TEAMS, ESPN_ALIASES)
    games = nhl_espn.team_schedules(ids, SEASON, TEAM_DIV)
    if not nhl_espn.check_schedule(games, TEAMS, GAMES_PER_TEAM):
        print("ABORT: the schedule is not the size a real season is.")
        return 1

    # 🔴 ORDER THE WHOLE SEASON ONCE, played and unplayed together, and index
    # every game by its position in that order. The simulation draws one pair
    # of uniforms per slot, so a game's random draw is the SAME on every build
    # regardless of how much of the season has been played. Without this a
    # team's odds jump around between runs for no reason anyone can explain,
    # which is indistinguishable from the model changing its mind.
    ordered = sorted(games.items(), key=lambda kv: (kv[1][0], kv[0]))
    gid_pos = {gid: i for i, (gid, _v) in enumerate(ordered)}
    n_full = len(ordered)

    played, remaining = [], []
    base_pts = {t: 0 for t in TEAMS}
    base_regw = {t: 0 for t in TEAMS}
    for gid, (d, h, a, hg, ag, done) in ordered:
        if done and hg is not None and ag is not None:
            played.append((h, a, hg, ag))
            # ⚠️ The completed-game path CANNOT tell a regulation win from an
            # overtime one: the schedule feed carries a final score and no
            # period detail. Treating every completed game as a regulation win
            # slightly overstates regulation-win counts, which is the SECOND
            # tie-break and only separates teams already level on points.
            # Points themselves are exact, which is what the standings show.
            winner, loser = (h, a) if hg > ag else (a, h)
            award_points(winner, loser, False, base_pts, base_regw)
        else:
            remaining.append((gid, h, a))

    print(f"  {len(played)} played, {len(remaining)} remaining of {n_full}")

    ratings = base_ratings(per_season, played)
    frac_left = len(remaining) / max(n_full, 1)
    sig = sc.adaptive_sigma(frac_left, SIGMA_SEASON, SIGMA_FLOOR_FRAC)
    sigma_team = {t: sc.team_sigma(sig, ratings[t], ratings[t], DISAGREE_K) for t in TEAMS}

    print(f"simulating {sims:,} seasons")
    acc, pts_lists = simulate(ratings, remaining, base_pts, base_regw, sims,
                              sigma_team=sigma_team, gid_pos=gid_pos, n_full=n_full)

    table = []
    for t in TEAMS:
        a = acc[t]
        p_po = a["playoffs"] / sims
        # sim_common.percentiles takes ONE percentile, not a list.
        sorted_pts = sorted(pts_lists[t])
        lo = sc.percentiles(sorted_pts, 10)
        mid = sc.percentiles(sorted_pts, 50)
        hi = sc.percentiles(sorted_pts, 90)
        table.append({
            "canonical": t,
            "name": ids[t][1] if t in ids else t,
            "conf": TEAM_CONF[t],
            "div": TEAM_DIV[t].split()[1],
            "rating": round(ratings[t], 4),
            "points": round(a["points"] / sims, 1),
            "points_p10": lo, "points_p50": mid, "points_p90": hi,
            "p_playoffs": round(p_po, 5),
            "p_division": round(a["division"] / sims, 5),
            "p_wildcard": round(a["wildcard"] / sims, 5),
            "p_conf": round(a["conf"] / sims, 5),
            "p_cup": round(a["cup"] / sims, 5),
            "p_president": round(a["president"] / sims, 5),
            "band": sc.band_for(p_po * 100),
        })
    table.sort(key=lambda r: -r["p_cup"])

    meta = {
        "league": "nhl",
        "season": SEASON,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sims": sims,
        "games_played": len(played),
        "games_total": n_full,
        "games_per_team": GAMES_PER_TEAM,
        "p_overtime": P_OVERTIME,
        "hfa_logit": round(HFA_LOGIT, 5),
        "ratings_source": "NHL.xlsx goal differential, "
                          + ", ".join(str(s) for s, _ in STRENGTH_SEASONS)
                          + "; schedule and results from ESPN",
        # ⚠️ NO MARKET BLEND YET. The NFL and MLB builders blend a futures
        # -implied rating; this one does not, so these are pure model odds
        # with nothing anchoring them to what anybody is betting. Stated in
        # the file so a reader of the JSON cannot mistake it for a consensus.
        "market": None,
    }

    doc = {"meta": meta, "table": table}

    # Identities that must hold whatever the ratings are. A build that fails
    # these is not published, because every number in it still looks fine.
    checks = {
        "cup": sum(r["p_cup"] for r in table),
        "conf": sum(r["p_conf"] for r in table),
        "playoffs": sum(r["p_playoffs"] for r in table),
    }
    want = {"cup": 1.0, "conf": 2.0, "playoffs": 16.0}
    bad = [k for k, v in checks.items() if abs(v - want[k]) > 0.02]
    print("  identities: " + "  ".join(f"{k} {v:.3f}/{want[k]}" for k, v in checks.items()))
    if bad:
        print(f"ABORT: identity check failed for {bad}")
        return 1

    top = table[0]
    print(f"  favourite: {top['canonical']} {100 * top['p_cup']:.1f}% "
          f"({top['points']:.0f} pts)")
    return doc, today_iso, len(played)


# 🔴 THE ENTRY POINT STAYS LAST. Appending a function after this guard defines
# it AFTER main() has already run, so the call fails with a NameError that
# reads like a typo. Cost two debug cycles in one session, in two files.
if __name__ == "__main__":
    sys.exit(main())
