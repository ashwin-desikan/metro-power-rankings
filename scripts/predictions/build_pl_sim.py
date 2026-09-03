#!/usr/bin/env python3
"""Premier League 2026-27 season simulator + fixture predictions + ledger.

poisson-v2-v3 ("site data + market, correlated noise"): the /predictions/pl
model. Three outputs from one run:
  public/data/pl-sim.json          - season odds (title/top4/top5/top7/releg/xPts)
  public/data/pl-sim-history.json  - one snapshot per build date, for trend
                                     lines on the same numbers
  public/data/pl-predictions.json  - upcoming-fixture predictions + the graded
                                     ledger tracking us vs the market all season

STRENGTH SIGNAL (blended, meta records everything):
  - Site data: attack/defence goal rates per game from the last three PL
    seasons (hub-2023-24/24-25/25-26, weights .55/.30/.15). Promoted sides'
    Championship rates translated by factors calibrated on the hub archive's
    own promoted cohort (n~75). In-season, the current campaign's real goals
    are folded in with weight growing as games are played.
  - Market data: closing match odds from football-data.co.uk (E0.csv last
    season at weight 0.4, current season at 1.0; E1.csv for the promoted
    sides, tier-anchored to the model's own promoted-cohort level). De-vigged
    Avg (fallback B365) odds -> per-match log-strength gaps -> weighted
    least-squares team ratings. Blended into the model's overall strength at
    MARKET_W, preserving the site-data attack/defence split.

SEASON SIM: actual standings so far (E0 current season) + every REMAINING
fixture simulated with Poisson goals (mu from the hubs, home adv x1.11) and
per-season strength noise (the humility layer). PL tie-breaks.

POISSON-V2-V3 additions (contract 2026-09-03, mirrors build_nfl_sim.py's
points-v3): per-season noise now has two correlated layers on the log-
strength scale - a league-wide home-advantage jitter (multiplicative on
HOME_ADV) and a per-team residual sized to an adaptive sigma that shrinks as
the season plays out (no market-disagreement widening here; PL's market
term is already folded into the blended strength, not a second rating).
Every simulated season draws its rating shocks from common random numbers
keyed to its index; because a single uniform per fixture cannot drive a
Poisson scoreline, each fixture's home/away goal counts are drawn from their
OWN random stream, keyed by that season AND the fixture's fixed position in
the full round-robin - so a fixture's draw does not move as earlier
fixtures are played or the schedule shrinks between builds. A history file
tracks the headline numbers across builds.

FIXTURES + LEDGER: upcoming fixtures (ESPN eng.1 scoreboard, next 9 days)
get model probabilities; football-data fixtures.csv market odds are joined
when posted, giving a 50/50 blend column and a pick. Each prediction is
FROZEN into the ledger on first sight; later runs grade it against the real
result (E0) and accumulate pick accuracy + Brier score for model, market and
blend - the season-long "how are we doing" record.

    python scripts/predictions/build_pl_sim.py               # build + write
    python scripts/predictions/build_pl_sim.py --dry         # no writes
    python scripts/predictions/build_pl_sim.py --self-test   # offline tests
    python scripts/predictions/build_pl_sim.py --verify-teams
    python scripts/predictions/build_pl_sim.py --sims 50000

Network: football-data.co.uk + ESPN (verified reachable from the Windows box
and CI; the Cowork cloud sandbox is egress-blocked). Last-season odds are
REQUIRED (hard fail); fixtures.csv / current E0 / ESPN are soft (degrade to
model-only, preseason state). Team list baked + --verify-teams, as in v1.

Stdlib only, by design (contract 2026-09-03): the per-fixture common-random-
numbers scheme needs one independent random.Random stream per (season,
fixture position), which does not vectorize cleanly across an external RNG
library, so the numpy fast path from poisson-v2 is retired in this build.
"""
import io
import json
import math
import os
import random
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_common as sc
from collections import defaultdict
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HUBS = os.path.join(ROOT, "public", "data", "football")
OUT_SIM = os.path.join(ROOT, "public", "data", "pl-sim.json")
OUT_PRED = os.path.join(ROOT, "public", "data", "pl-predictions.json")
OUT_HIST = os.path.join(ROOT, "public", "data", "pl-sim-history.json")

SEASON = "2026-27"
FD_SEASON_CUR = "2627"   # football-data.co.uk season codes
FD_SEASON_PREV = "2526"
STRENGTH_SEASONS = [("2025-26", 0.55), ("2024-25", 0.30), ("2023-24", 0.15)]
HOME_ADV = 1.11
SIGMA = 0.15             # per-simulated-season strength noise (see v1 note)
MARKET_W = 0.45          # weight of the market rating in the blended strength
PREV_ODDS_W = 0.4        # last-season odds rows' weight in the market fit
MATCH_BLEND_W = 0.5      # market weight in per-fixture blend (when odds posted)
FIXTURE_HORIZON_DAYS = 9
DEFAULT_SIMS = 20000
FD_BASE = "https://www.football-data.co.uk"

# poisson-v2-v3: correlated season-noise layers, adaptive sigma and the
# history-file cap (contract 2026-09-03).
SEED = 20262027              # common random numbers seed
HOME_ADV_SD = 0.03            # sd of the per-season, league-wide HOME_ADV jitter (multiplicative)
SIGMA_FLOOR_FRAC = 0.45       # floor on adaptive sigma as a fraction of SIGMA
HISTORY_KEEP = 180            # max snapshots kept in pl-sim-history.json

# Verified vs ESPN eng.1 2026-27 standings, 2026-08-02.
TEAMS_2026_27 = [
    "AFC Bournemouth", "Arsenal", "Aston Villa", "Brentford",
    "Brighton & Hove Albion", "Chelsea", "Coventry City", "Crystal Palace",
    "Everton", "Fulham", "Hull City", "Ipswich Town", "Leeds United",
    "Liverpool", "Manchester City", "Manchester United", "Newcastle United",
    "Nottingham Forest", "Sunderland", "Tottenham Hotspur",
]
PROMOTED = {"Coventry City", "Ipswich Town", "Hull City"}

# football-data.co.uk name -> hub/ESPN name (both E0 and E1 spellings).
FD_TO_HUB = {
    "Bournemouth": "AFC Bournemouth", "Man City": "Manchester City",
    "Man United": "Manchester United", "Nott'm Forest": "Nottingham Forest",
    "Tottenham": "Tottenham Hotspur", "Newcastle": "Newcastle United",
    "Brighton": "Brighton & Hove Albion", "West Ham": "West Ham United",
    "Wolves": "Wolverhampton Wanderers", "Leeds": "Leeds United",
    "Coventry": "Coventry City", "Ipswich": "Ipswich Town", "Hull": "Hull City",
    "Sheffield United": "Sheffield United", "Sheffield Weds": "Sheffield Wednesday",
}
HUB_TO_FD = {v: k for k, v in FD_TO_HUB.items()}

SLUG_FIX = {"AFC Bournemouth": "afc-bournemouth"}


def slugify(name):
    if name in SLUG_FIX:
        return SLUG_FIX[name]
    s = name.lower().replace("&", " ")
    return "-".join(w for w in "".join(c if c.isalnum() or c == " " else " " for c in s).split())


def fd_name(hub):
    return HUB_TO_FD.get(hub, hub)


def hub_name(fd):
    return FD_TO_HUB.get(fd, fd)


# ------------------------------------------------------------------ fetching

def fetch(url, timeout=25):
    # No User-Agent on purpose: urllib's own library token is the only shape
    # that passed from every vantage we tested on 2026-08-05. The mini's edge
    # 403s "CitizenOfNowhere/1.0", branded tokens and browser spoofs alike.
    # Full measured matrix and the reasoning live in build_mlb_sim.py's
    # fetch_json docstring. Do not add a UA back here without re-measuring.
    # (This helper also fetches football-data.co.uk CSVs, which are UA-agnostic.)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fetch_csv(url, required=False):
    import csv
    try:
        txt = fetch(url)
    except Exception as e:
        if required:
            raise SystemExit("required fetch failed: %s (%s)" % (url, e))
        print("soft-fetch miss: %s (%s)" % (url, e))
        return None
    rows = [r for r in csv.reader(io.StringIO(txt)) if r and any(c.strip() for c in r)]
    if not rows:
        return None
    hdr = [h.strip("﻿").strip() for h in rows[0]]
    return [dict(zip(hdr, r)) for r in rows[1:]]


# ---------------------------------------------------------------- site data

def load_hub(season):
    with io.open(os.path.join(HUBS, "hub-%s.json" % season), encoding="utf-8") as f:
        return json.load(f)


def england_rows(hub, level):
    for l in hub.get("leagues", []):
        if l.get("country") == "England" and l.get("level") == level:
            return [r for g in l.get("groups", []) for r in g.get("rows", [])
                    if r.get("played")]
    return []


def promoted_calibration():
    import glob
    seasons = sorted(os.path.basename(f)[4:11]
                     for f in glob.glob(os.path.join(HUBS, "hub-20*.json")))
    att, dfc = [], []
    hubs = {}
    for i in range(len(seasons) - 1):
        a, b = seasons[i], seasons[i + 1]
        for s in (a, b):
            if s not in hubs:
                try:
                    hubs[s] = load_hub(s)
                except FileNotFoundError:
                    hubs[s] = None
        if not hubs[a] or not hubs[b]:
            continue
        l2 = {r["name"]: r for r in england_rows(hubs[a], 2)}
        l1 = {r["name"]: r for r in england_rows(hubs[b], 1)}
        for name in set(l2) & set(l1):
            p, n = l2[name], l1[name]
            att.append((n["gf"] / n["played"]) / (p["gf"] / p["played"]))
            dfc.append((n["ga"] / n["played"]) / (p["ga"] / p["played"]))
    if not att:
        return 0.64, 1.84, 0
    return sum(att) / len(att), sum(dfc) / len(dfc), len(att)


def team_rates(att_f, def_f, played_matches):
    """PL-equivalent (gf/g, ga/g) per team from the hubs, with the CURRENT
    season's real goals (played_matches: [(home,away,hg,ag)]) folded in at a
    weight that grows with games played. Returns (rates, mu)."""
    per_season = {}
    mu_num = mu_den = 0.0
    for season, w in STRENGTH_SEASONS:
        hub = load_hub(season)
        l1 = {r["name"]: r for r in england_rows(hub, 1)}
        l2 = {r["name"]: r for r in england_rows(hub, 2)}
        per_season[season] = (l1, l2)
        gpg = sum(r["gf"] for r in l1.values()) / sum(r["played"] for r in l1.values())
        mu_num += w * gpg
        mu_den += w
    mu = mu_num / mu_den
    cur = {t: [0, 0, 0] for t in TEAMS_2026_27}  # gf, ga, played
    for h, a, hg, ag in played_matches:
        if h in cur:
            cur[h][0] += hg; cur[h][1] += ag; cur[h][2] += 1
        if a in cur:
            cur[a][0] += ag; cur[a][1] += hg; cur[a][2] += 1
    rates = {}
    for team in TEAMS_2026_27:
        num_a = num_d = den = 0.0
        for season, w in STRENGTH_SEASONS:
            l1, l2 = per_season[season]
            if team in l1:
                r = l1[team]
                gf, ga = r["gf"] / r["played"], r["ga"] / r["played"]
            elif team in l2:
                r = l2[team]
                gf, ga = att_f * r["gf"] / r["played"], def_f * r["ga"] / r["played"]
            else:
                continue
            num_a += w * gf
            num_d += w * ga
            den += w
        if den == 0:
            raise SystemExit("no L1/L2 record for %s in any strength season" % team)
        gf0, ga0 = num_a / den, num_d / den
        gp = cur[team][2]
        if gp:
            wc = min(0.7, gp / 38.0 * 1.4)  # current season dominates by ~GW19
            gf0 = (1 - wc) * gf0 + wc * cur[team][0] / gp
            ga0 = (1 - wc) * ga0 + wc * cur[team][1] / gp
        rates[team] = (gf0, ga0)
    return rates, mu


# --------------------------------------------------------------- market data

def devig(oh, od, oa):
    """Decimal odds -> fair (pH, pD, pA), proportional de-vig."""
    rh, rd, ra = 1.0 / oh, 1.0 / od, 1.0 / oa
    s = rh + rd + ra
    return rh / s, rd / s, ra / s


# football-data ships a pre-match price and, from 2012-13, a closing price in
# the C-suffixed columns. Closing is the sharper benchmark and the one the
# scoreboard claims, so anything scoring the market reaches for it first.
CLOSING_PRE = ("AvgC", "PSC", "B365C")
OPENING_PRE = ("Avg", "B365", "PS")


def _odds_triplet(row, prefixes=OPENING_PRE):
    for pre in prefixes:
        try:
            oh, od, oa = float(row[pre + "H"]), float(row[pre + "D"]), float(row[pre + "A"])
            if oh > 1 and od > 1 and oa > 1:
                return oh, od, oa
        except (KeyError, ValueError, TypeError):
            continue
    return None


def market_gap_rows(rows):
    """E-division CSV rows -> [(home, away, gap, weight)] where gap is the
    market's log-strength difference (home minus away, HFA removed later)."""
    out = []
    for row in rows or []:
        trip = _odds_triplet(row)
        if not trip:
            continue
        ph, _, pa = devig(*trip)
        gap = math.log(ph / pa)
        out.append((hub_name(row["HomeTeam"].strip()), hub_name(row["AwayTeam"].strip()), gap))
    return out


def fit_market_ratings(gaps_weighted):
    """[(home, away, gap, w)] -> ({team: rating}, hfa). Weighted least squares
    of gap ~ r_h - r_a + hfa, ratings zero-mean. numpy if present."""
    teams = sorted({t for h, a, _, _ in gaps_weighted for t in (h, a)})
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    try:
        import numpy as np
        A = np.zeros((len(gaps_weighted) + 1, n + 1))
        b = np.zeros(len(gaps_weighted) + 1)
        for k, (h, a, g, w) in enumerate(gaps_weighted):
            sw = math.sqrt(w)
            A[k, idx[h]] = sw
            A[k, idx[a]] = -sw
            A[k, n] = sw          # hfa column
            b[k] = g * sw
        A[len(gaps_weighted), :n] = 1.0  # sum-to-zero constraint
        x, *_ = np.linalg.lstsq(A, b, rcond=None)
        return {t: float(x[idx[t]]) for t in teams}, float(x[n])
    except ImportError:
        # Gauss-Seidel fallback
        r = {t: 0.0 for t in teams}
        hfa = sum(g for _, _, g, _ in gaps_weighted) / max(1, len(gaps_weighted))
        for _ in range(200):
            for t in teams:
                num = den = 0.0
                for h, a, g, w in gaps_weighted:
                    if h == t:
                        num += w * (g - hfa + r[a]); den += w
                    elif a == t:
                        num += w * (r[h] + hfa - g); den += w
                if den:
                    r[t] = num / den
            m = sum(r.values()) / len(r)
            for t in r:
                r[t] -= m
        return r, hfa


def market_ratings(prev_e0, cur_e0, prev_e1, model_log_strength):
    """Blend-ready market rating per 2026-27 team (zero-mean over the 20).
    E1 (Championship) ratings for the promoted sides are anchored so their
    MEAN equals the model's mean for those sides - the market decides who of
    the promoted trio is stronger, the model's calibration sets the level."""
    rows = [(h, a, g, PREV_ODDS_W) for h, a, g in market_gap_rows(prev_e0)] + \
           [(h, a, g, 1.0) for h, a, g in market_gap_rows(cur_e0)]
    if not rows:
        return None, 0
    r_pl, _ = fit_market_ratings(rows)
    out = {}
    for t in TEAMS_2026_27:
        if t in r_pl:
            out[t] = r_pl[t]
    missing = [t for t in TEAMS_2026_27 if t not in out]
    if missing and prev_e1:
        r_ch, _ = fit_market_ratings([(h, a, g, 1.0) for h, a, g in market_gap_rows(prev_e1)])
        have = [t for t in missing if t in r_ch]
        if have:
            anchor = sum(model_log_strength[t] for t in have) / len(have)
            ch_mean = sum(r_ch[t] for t in have) / len(have)
            for t in have:
                out[t] = anchor + (r_ch[t] - ch_mean)
    for t in TEAMS_2026_27:
        out.setdefault(t, model_log_strength[t])  # no market info at all
    m = sum(out.values()) / len(out)
    return {t: v - m for t, v in out.items()}, len(rows)


def blend_ratings(rates, mu, mkt):
    """Move each team's overall strength toward its market rating at MARKET_W,
    preserving the site-data attack/defence split."""
    model_ls = {t: math.log((rates[t][0] / mu) / (rates[t][1] / mu)) for t in rates}
    m = sum(model_ls.values()) / len(model_ls)
    model_ls = {t: v - m for t, v in model_ls.items()}
    out = {}
    for t, (gf, ga) in rates.items():
        target = (1 - MARKET_W) * model_ls[t] + MARKET_W * mkt[t]
        shift = (target - model_ls[t]) / 2.0
        out[t] = (gf * math.exp(shift), ga * math.exp(-shift))
    return out


# --------------------------------------------------------- adaptive sigma

def adaptive_sigma(frac_left, sigma_season=SIGMA, floor_frac=SIGMA_FLOOR_FRAC):
    return sc.adaptive_sigma(frac_left, sigma_season, floor_frac)


# --------------------------------------------------------------- intervals

percentiles = sc.percentiles
band_for = sc.band_for


# ------------------------------------------------------------------- history

def upsert_snapshot(doc, date_iso, games_played, rows, keep=HISTORY_KEEP):
    return sc.upsert_snapshot(doc, date_iso, games_played, rows, "premier-league", SEASON, keep=keep)


# ------------------------------------------------------------------ the sim

def poisson(lam, rng):
    L = math.exp(-lam)
    k, p = 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


def sort_table(rows, rng):
    rng.shuffle(rows)
    rows.sort(key=lambda r: (-r[1], -r[2], -r[3]))
    return [r[0] for r in rows]


def match_lambdas(rates, mu, h, a, home_adv=HOME_ADV):
    att = {t: rates[t][0] / mu for t in rates}
    dfc = {t: rates[t][1] / mu for t in rates}
    return (mu * home_adv * att[h] * dfc[a], mu * (2 - home_adv) * att[a] * dfc[h])


def match_probs(rates, mu, h, a, cap=10):
    """(pH, pD, pA) from the Poisson grid."""
    lh, la = match_lambdas(rates, mu, h, a)
    ph = [math.exp(-lh) * lh ** k / math.factorial(k) for k in range(cap)]
    pa = [math.exp(-la) * la ** k / math.factorial(k) for k in range(cap)]
    pH = pD = pA = 0.0
    for x in range(cap):
        for y in range(cap):
            p = ph[x] * pa[y]
            if x > y: pH += p
            elif x == y: pD += p
            else: pA += p
    s = pH + pD + pA
    return pH / s, pD / s, pA / s


def full_fixture_order():
    """Every possible (home, away) pairing among the 20 clubs, in a fixed
    order (alphabetical, since the round-robin has no real calendar until
    fixtures are actually released) - the CRN position table, independent of
    how much of the season has been played."""
    return [(h, a) for h in TEAMS_2026_27 for a in TEAMS_2026_27 if h != a]


def remaining_fixtures(played_pairs):
    return [f for f in full_fixture_order() if f not in played_pairs]


def _tally():
    return {"pts": 0.0, "title": 0, "top4": 0, "top5": 0, "top7": 0, "releg": 0, "pos": defaultdict(int)}


def simulate(rates, mu, sims, base, fixtures, seed=SEED, sigma_team=None,
            fixture_pos=None):
    """Monte Carlo the remaining fixtures `sims` times.

    `fixtures`: [(home, away)] still to play. `fixture_pos`: {(home, away):
    position in the full 380-fixture round robin} - fixed regardless of how
    many fixtures have been played, so a fixture's draw never moves between
    builds. `sigma_team`: per-team adaptive sigma (uniform across teams for
    this league; falls back to SIGMA when absent).

    Common random numbers: season i draws a league-wide HOME_ADV jitter
    (multiplicative, sd HOME_ADV_SD) and a per-team attack/defence residual
    from random.Random(seed*1_000_003 + i). A single uniform cannot drive a
    Poisson scoreline, so each fixture's home/away goal counts are drawn
    from their OWN stream, random.Random((seed*1_000_003+i)*1000 + pos),
    keyed by that season and the fixture's fixed position - so a fixture's
    draw does not move as earlier fixtures are played or the remaining
    schedule shrinks between builds. The table-order tie-break (sort_table's
    shuffle) draws from the season's main stream, same as before.

    Returns (teams, acc, pts_lists): pts_lists is {team: [points per sim]},
    for the season points-total p10/p90 interval."""
    sigma_team = sigma_team or {}
    fixture_pos = fixture_pos or {}
    teams = sorted(rates)
    fl = [(h, a) + match_lambdas(rates, mu, h, a) for h, a in fixtures]
    acc = {t: _tally() for t in teams}
    pts_lists = {t: [] for t in teams}
    for i in range(sims):
        rng = random.Random(seed * 1_000_003 + i)
        home_adv_s = HOME_ADV * math.exp(rng.gauss(0.0, HOME_ADV_SD))
        nA = {t: math.exp(rng.gauss(0.0, sigma_team.get(t, SIGMA))) for t in teams}
        nD = {t: math.exp(rng.gauss(0.0, sigma_team.get(t, SIGMA))) for t in teams}
        pts = {t: base[t][0] for t in teams}
        gd = {t: base[t][1] for t in teams}
        gf = {t: base[t][2] for t in teams}
        adv_ratio = home_adv_s / HOME_ADV
        for h, a, lh0, la0 in fl:
            lh = lh0 * adv_ratio * nA[h] * nD[a]
            la = la0 * (2 - home_adv_s) / (2 - HOME_ADV) * nA[a] * nD[h]
            pos = fixture_pos.get((h, a))
            fix_rng = random.Random((seed * 1_000_003 + i) * 1000 + pos) if pos is not None else rng
            x = poisson(lh, fix_rng)
            y = poisson(la, fix_rng)
            gd[h] += x - y; gd[a] += y - x; gf[h] += x; gf[a] += y
            if x > y: pts[h] += 3
            elif y > x: pts[a] += 3
            else: pts[h] += 1; pts[a] += 1
        order = sort_table([[t, pts[t], gd[t], gf[t]] for t in teams], rng)
        for pos_i, t in enumerate(order, 1):
            a2 = acc[t]
            a2["pts"] += pts[t]; a2["pos"][pos_i] += 1
            if pos_i == 1: a2["title"] += 1
            if pos_i <= 4: a2["top4"] += 1
            if pos_i <= 5: a2["top5"] += 1
            if pos_i <= 7: a2["top7"] += 1
            if pos_i >= 18: a2["releg"] += 1
        for t in teams:
            pts_lists[t].append(pts[t])
    return teams, acc, pts_lists


def percentile(posdist, sims, q):
    c = 0
    for pos in range(1, 21):
        c += posdist.get(pos, 0)
        if c >= q * sims:
            return pos
    return 20


# ------------------------------------------------- fixtures, ledger, grading

def parse_fd_results(rows):
    """E0 rows -> played matches [(home, away, hg, ag)] + results index
    {(fd_home, fd_away): ('H'|'D'|'A', hg, ag)}."""
    played, results = [], {}
    for r in rows or []:
        try:
            hg, ag = int(r["FTHG"]), int(r["FTAG"])
        except (KeyError, ValueError, TypeError):
            continue
        h, a = r["HomeTeam"].strip(), r["AwayTeam"].strip()
        played.append((hub_name(h), hub_name(a), hg, ag))
        ftr = r.get("FTR") or ("H" if hg > ag else "A" if ag > hg else "D")
        results[(h, a)] = (ftr, hg, ag)
    return played, results


# THE MARKET LAYER IS GRADED FROM THE SETTLED ROW, NOT FROM fixtures.csv.
# fixtures.csv only carries matches football-data has already posted odds for,
# which is a few days out. Picks here are made up to HORIZON_DAYS ahead, so for
# most of a season no odds exist at prediction time: the 2026-27 ledger ran to
# `market_graded: 0` on a site whose scoreboard exists to compare model with
# market. The finished E0 row carries a price for every played match, so the
# benchmark is taken from there instead.
#
# SCORING ONLY. A price attached at grading time was NOT available when
# the pick was made. It must never reach `blend` or `pick`, which would be
# backdating our own forecast. It answers "how did the market do on this match",
# never "what should we have said".
def settled_market(rows):
    """Finished E0 rows -> {(fd_home, fd_away): ((pH, pD, pA), tier)}."""
    out = {}
    for r in rows or []:
        try:
            int(r["FTHG"]), int(r["FTAG"])
        except (KeyError, ValueError, TypeError):
            continue
        trip, tier = _odds_triplet(r, CLOSING_PRE), "closing"
        if not trip:
            trip, tier = _odds_triplet(r, OPENING_PRE), "opening"
        if not trip:
            continue
        out[(r["HomeTeam"].strip(), r["AwayTeam"].strip())] = (devig(*trip), tier)
    return out


def standings_from(played):
    base = {t: [0, 0, 0] for t in TEAMS_2026_27}
    for h, a, hg, ag in played:
        if h not in base or a not in base:
            continue
        base[h][1] += hg - ag; base[a][1] += ag - hg
        base[h][2] += hg; base[a][2] += ag
        if hg > ag: base[h][0] += 3
        elif ag > hg: base[a][0] += 3
        else: base[h][0] += 1; base[a][0] += 1
    return {t: tuple(v) for t, v in base.items()}


def kickoff_iso(raw):
    """ESPN event date ('2026-08-21T19:00Z') -> full ISO UTC, or None."""
    for fmt in ("%Y-%m-%dT%H:%MZ", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(raw or "", fmt).strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            pass
    return None


def espn_fixtures(today, horizon_days):
    """Upcoming PL fixtures within the horizon:
    [(iso_date, home, away, kickoff_iso or None)]."""
    d0 = today.strftime("%Y%m%d")
    d1 = (today + timedelta(days=horizon_days)).strftime("%Y%m%d")
    url = ("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
           "?dates=%s-%s&limit=100" % (d0, d1))
    try:
        doc = json.loads(fetch(url))
    except Exception as e:
        print("soft-fetch miss: ESPN scoreboard (%s)" % e)
        return []
    out = []
    for ev in doc.get("events", []):
        comp = (ev.get("competitions") or [{}])[0]
        if comp.get("status", {}).get("type", {}).get("completed"):
            continue
        home = away = None
        for c in comp.get("competitors", []):
            nm = (c.get("team") or {}).get("displayName")
            if c.get("homeAway") == "home":
                home = nm
            elif c.get("homeAway") == "away":
                away = nm
        if home in TEAMS_2026_27 and away in TEAMS_2026_27:
            out.append((ev.get("date", "")[:10], home, away, kickoff_iso(ev.get("date"))))
    # key on the fixture, not the tuple: a None kickoff must never be compared
    # against a str one if ESPN ever lists an event twice
    return sorted(set(out), key=lambda f: (f[0], f[1], f[2]))


def fixtures_market(rows):
    """fixtures.csv rows -> {(home_hub, away_hub): (pH, pD, pA)} for E0."""
    out = {}
    for r in rows or []:
        if (r.get("Div") or "").strip() != "E0":
            continue
        trip = _odds_triplet(r)
        if not trip:
            continue
        out[(hub_name(r["HomeTeam"].strip()), hub_name(r["AwayTeam"].strip()))] = devig(*trip)
    return out


def brier(p, outcome):
    o = {"H": (1, 0, 0), "D": (0, 1, 0), "A": (0, 0, 1)}[outcome]
    return sum((pi - oi) ** 2 for pi, oi in zip(p, o))


def grade_and_extend(ledger, results, upcoming, rates, mu, mkt_fix, today_iso,
                    settled_mkt=None):
    """Grade ungraded ledger entries against results; append new predictions
    for upcoming fixtures not yet in the ledger. Mutates + returns ledger."""
    known = {(e["home"], e["away"]) for e in ledger}
    # ESPN's scoreboard is the kickoff source, so ungraded entries appended by
    # an earlier run pick their timestamp up (or a rescheduled time) here.
    kick_by_fixture = {(u[1], u[2]): u[3] for u in upcoming if len(u) > 3 and u[3]}
    for e in ledger:
        if e.get("result"):
            continue
        if kick_by_fixture.get((e["home"], e["away"])):
            e["kickoff"] = kick_by_fixture[(e["home"], e["away"])]
        got = results.get((fd_name(e["home"]), fd_name(e["away"])))
        if got:
            # (ftr, hg, ag) since the score string shipped; bare 'H'|'D'|'A'
            # still accepted so old call sites and tests cannot break silently
            res, score = (got, None) if isinstance(got, str) else (got[0], "%d-%d" % (got[1], got[2]))
            e["result"] = res
            if score:
                e["score"] = score
            e["graded_at"] = today_iso
            e["model_brier"] = round(brier((e["model"]["pH"], e["model"]["pD"], e["model"]["pA"]), res), 4)
            # No price at prediction time? Take the settled one, for scoring only.
            if not e.get("market"):
                sm = (settled_mkt or {}).get((fd_name(e["home"]), fd_name(e["away"])))
                if sm:
                    (mh, md, ma), tier = sm
                    e["market"] = {"pH": round(mh, 4), "pD": round(md, 4), "pA": round(ma, 4)}
                    e["market_tier"] = tier
                    e["market_priced_at"] = "settlement"
            if e.get("market"):
                e["market_brier"] = round(brier((e["market"]["pH"], e["market"]["pD"], e["market"]["pA"]), res), 4)
            b = e.get("blend") or e["model"]
            e["blend_brier"] = round(brier((b["pH"], b["pD"], b["pA"]), res), 4)
            e["pick_correct"] = (e["pick"] == res)
    for u in upcoming:
        iso, h, a = u[:3]
        kick = u[3] if len(u) > 3 else None
        if (h, a) in known:
            continue
        pH, pD, pA = match_probs(rates, mu, h, a)
        entry = {
            "date": iso, "home": h, "away": a,
            "home_slug": slugify(h), "away_slug": slugify(a),
            "model": {"pH": round(pH, 4), "pD": round(pD, 4), "pA": round(pA, 4)},
            "predicted_at": today_iso,
        }
        if kick:
            entry["kickoff"] = kick
        mk = mkt_fix.get((h, a))
        if mk:
            entry["market"] = {"pH": round(mk[0], 4), "pD": round(mk[1], 4), "pA": round(mk[2], 4)}
            entry["market_priced_at"] = "prediction"
            bl = tuple(MATCH_BLEND_W * m + (1 - MATCH_BLEND_W) * p
                       for m, p in zip(mk, (pH, pD, pA)))
            entry["blend"] = {"pH": round(bl[0], 4), "pD": round(bl[1], 4), "pA": round(bl[2], 4)}
        pick_src = entry.get("blend") or entry["model"]
        entry["pick"] = max("HDA", key=lambda k: pick_src["p" + k])
        ledger.append(entry)
    ledger.sort(key=lambda e: (e["date"], e["home"]))
    return ledger


def ledger_record(ledger):
    g = [e for e in ledger if e.get("result")]
    rec = {
        "graded": len(g),
        "pick_correct": sum(1 for e in g if e.get("pick_correct")),
        "model_brier": round(sum(e["model_brier"] for e in g) / len(g), 4) if g else None,
        "blend_brier": round(sum(e["blend_brier"] for e in g) / len(g), 4) if g else None,
    }
    gm = [e for e in g if "market_brier" in e]
    rec["market_graded"] = len(gm)
    rec["market_brier"] = round(sum(e["market_brier"] for e in gm) / len(gm), 4) if gm else None
    # How the benchmark was obtained, so the page never implies we had a price
    # in hand when we made the call. Both are honest; they are not the same claim.
    rec["market_priced_at_prediction"] = sum(1 for e in gm if e.get("market_priced_at") != "settlement")
    rec["market_priced_at_settlement"] = sum(1 for e in gm if e.get("market_priced_at") == "settlement")
    rec["market_closing_graded"] = sum(1 for e in gm if e.get("market_tier") == "closing")
    return rec


# -------------------------------------------------------------------- build

def build(sims, today=None):
    today = today or date.today()
    today_iso = today.isoformat()
    att_f, def_f, ncal = promoted_calibration()

    prev_e0 = fetch_csv("%s/mmz4281/%s/E0.csv" % (FD_BASE, FD_SEASON_PREV), required=True)
    prev_e1 = fetch_csv("%s/mmz4281/%s/E1.csv" % (FD_BASE, FD_SEASON_PREV))
    cur_e0 = fetch_csv("%s/mmz4281/%s/E0.csv" % (FD_BASE, FD_SEASON_CUR))
    fix_rows = fetch_csv("%s/fixtures.csv" % FD_BASE)

    played, results = parse_fd_results(cur_e0)
    base = standings_from(played)
    rates, mu = team_rates(att_f, def_f, played)

    model_ls = {t: math.log((rates[t][0] / mu) / (rates[t][1] / mu)) for t in rates}
    mls_mean = sum(model_ls.values()) / len(model_ls)
    model_ls = {t: v - mls_mean for t, v in model_ls.items()}
    mkt, n_odds = market_ratings(prev_e0, cur_e0, prev_e1, model_ls)
    if mkt:
        rates_b = blend_ratings(rates, mu, mkt)
        market_note = "blended (market weight %.2f, %d odds rows)" % (MARKET_W, n_odds)
    else:
        rates_b = rates
        market_note = "model-only (no market rows available)"

    played_pairs = {(h, a) for h, a, _, _ in played}
    fixtures = remaining_fixtures(played_pairs)
    fixture_pos = {f: i for i, f in enumerate(full_fixture_order())}

    frac_left = len(fixtures) / float(len(full_fixture_order()))
    sigma_base = adaptive_sigma(frac_left)
    sigma_team_dict = {t: sigma_base for t in TEAMS_2026_27}

    teams, acc, pts_lists = simulate(rates_b, mu, sims, base, fixtures,
                                     sigma_team=sigma_team_dict, fixture_pos=fixture_pos)

    table = []
    for t in teams:
        a = acc[t]
        pd_ = a["pos"]
        p_top4 = round(100.0 * a["top4"] / sims, 2)
        p10 = percentiles(pts_lists[t], 10)
        p90 = percentiles(pts_lists[t], 90)
        table.append({
            "slug": slugify(t), "name": t,
            "exp_pts": round(a["pts"] / sims, 1),
            "rating_stats": round(model_ls[t], 4),
            "sigma_team": round(sigma_team_dict[t], 4),
            "p_title": round(100.0 * a["title"] / sims, 2),
            "p_top4": p_top4,
            "p_top5": round(100.0 * a["top5"] / sims, 2),
            "p_top7": round(100.0 * a["top7"] / sims, 2),
            "p_releg": round(100.0 * a["releg"] / sims, 2),
            "pts_p10": p10, "pts_p90": p90,
            "pos": {"p5": percentile(pd_, sims, 0.05), "p25": percentile(pd_, sims, 0.25),
                    "p50": percentile(pd_, sims, 0.50), "p75": percentile(pd_, sims, 0.75),
                    "p95": percentile(pd_, sims, 0.95)},
            "band": band_for(p_top4),
        })
    table.sort(key=lambda r: (-r["p_title"], -r["exp_pts"]))
    assert len(table) == 20, "expected 20 teams"
    s = sum(r["p_title"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_title sums to %.2f" % s

    corr_note = {"home_adv_sd": HOME_ADV_SD, "team_sd": round(sigma_base, 4)}

    sim_doc = {
        "meta": {
            "league": "premier-league", "season": SEASON,
            "generated_at": today_iso, "sims": sims, "model": "poisson-v2-v3",
            "seed": SEED,
            "mu": round(mu, 4), "home_adv": HOME_ADV, "sigma": SIGMA,
            "sigma_season_eff": round(sigma_base, 4), "corr": corr_note,
            "market": market_note, "blend_market_weight": MARKET_W,
            "odds_source": "football-data.co.uk closing/posted odds (E0/E1)",
            "promoted_calibration": {"att": round(att_f, 3), "def": round(def_f, 3), "n": ncal},
            "strength_seasons": [x for x, _ in STRENGTH_SEASONS],
            "matches_played": len(played),
            "notes": "Site-data goal rates blended with market-implied team "
                     "ratings; actual results folded in and only the remaining "
                     "fixtures simulated, with correlated home-advantage and "
                     "per-team season noise sized to an adaptive sigma and "
                     "common random numbers.",
        },
        "table": table,
    }

    hist_rows = {r["slug"]: {
        "xpts": round(r["exp_pts"], 1),
        "title": round(r["p_title"], 1),
        "top4": round(r["p_top4"], 1),
        "rel": round(r["p_releg"], 1),
    } for r in table}
    hist_doc = None
    if os.path.exists(OUT_HIST):
        try:
            hist_doc = json.load(io.open(OUT_HIST, encoding="utf-8"))
        except Exception:
            hist_doc = None
    hist_doc = upsert_snapshot(hist_doc, today_iso, len(played), hist_rows, HISTORY_KEEP)

    # ledger: load existing, grade, extend with upcoming fixtures
    ledger = []
    if os.path.exists(OUT_PRED):
        try:
            ledger = json.load(io.open(OUT_PRED, encoding="utf-8")).get("ledger", [])
        except Exception:
            ledger = []
    upcoming = espn_fixtures(today, FIXTURE_HORIZON_DAYS)
    if not upcoming:
        # Quiet near-window (preseason or an international break): reach ahead
        # to the NEXT batch of fixtures so the predictions table is never
        # empty - the first match date plus four days ~= one gameweek.
        far = espn_fixtures(today, 35)
        if far:
            first = min(d for d, *_ in far)
            cutoff = (datetime.strptime(first, "%Y-%m-%d") + timedelta(days=4)).strftime("%Y-%m-%d")
            upcoming = [f for f in far if f[0] <= cutoff]
    mkt_fix = fixtures_market(fix_rows)
    ledger = grade_and_extend(ledger, results, upcoming, rates_b, mu, mkt_fix, today_iso,
                              settled_mkt=settled_market(cur_e0))
    pred_doc = {
        "meta": {"season": SEASON, "generated_at": today_iso,
                 "match_blend_weight": MATCH_BLEND_W,
                 "horizon_days": FIXTURE_HORIZON_DAYS,
                 "odds_source": "football-data.co.uk fixtures.csv when posted "
                                "before the pick, else the settled E0 closing "
                                "price (scoring only, never blended)",
                 "results_source": "football-data.co.uk E0.csv"},
        "record": ledger_record(ledger),
        "ledger": ledger,
    }
    return sim_doc, pred_doc, hist_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []

    ran = []

    def check(name, cond):
        # The case count was hardcoded and went stale the moment anyone
        # added a case. Count what actually ran, so a silently skipped block shows.
        ran.append(name)
        if not cond:
            fails.append(name)

    rng = random.Random(1)
    order = sort_table([["A", 70, 10, 60], ["B", 70, 12, 50], ["C", 71, 0, 40], ["D", 70, 10, 61]], rng)
    check("tiebreak", order == ["C", "B", "D", "A"])
    rng = random.Random(7)
    xs = [poisson(1.4, rng) for _ in range(20000)]
    check("poisson-mean", abs(sum(xs) / len(xs) - 1.4) < 0.05)
    check("slug-brighton", slugify("Brighton & Hove Albion") == "brighton-hove-albion")
    # de-vig: fair probs sum to 1, favourite stays favourite
    p = devig(1.5, 4.5, 6.0)
    check("devig-sum", abs(sum(p) - 1.0) < 1e-9)
    check("devig-order", p[0] > p[2])
    # market fit recovers a planted strength gap (round-robin, exact odds)
    planted = {"A": 0.6, "B": 0.1, "C": -0.3, "D": -0.4}
    rows = []
    for h in planted:
        for a in planted:
            if h != a:
                rows.append((h, a, planted[h] - planted[a] + 0.25, 1.0))
    fit, hfa = fit_market_ratings(rows)
    check("mktfit-order", sorted(planted, key=planted.get) == sorted(fit, key=fit.get))
    check("mktfit-hfa", abs(hfa - 0.25) < 0.02)
    check("mktfit-gap", abs((fit["A"] - fit["D"]) - 1.0) < 0.05)
    # match probs sum to 1; stronger side favoured at home
    rates = {"S": (2.4, 0.8), "W": (0.9, 2.0)}
    pH, pD, pA = match_probs(rates, 1.4, "S", "W")
    check("matchp-sum", abs(pH + pD + pA - 1.0) < 1e-6)
    check("matchp-fav", pH > 0.65 and pA < 0.15)
    # standings + remaining fixtures
    played = [("Arsenal", "Chelsea", 2, 0)]
    base = standings_from(played)
    check("standings", base["Arsenal"] == (3, 2, 2) and base["Chelsea"] == (0, -2, 0))
    rem = remaining_fixtures({("Arsenal", "Chelsea")})
    check("remaining", len(rem) == 379 and ("Chelsea", "Arsenal") in rem)
    check("full-fixture-order-count", len(full_fixture_order()) == 380)
    check("full-fixture-order-fixed",
          full_fixture_order()[:2] == [("AFC Bournemouth", "Arsenal"), ("AFC Bournemouth", "Aston Villa")])
    # grading: correct pick + brier vs the known result
    ledger = [{"date": "2026-08-21", "home": "Arsenal", "away": "Coventry City",
               "home_slug": "arsenal", "away_slug": "coventry-city",
               "model": {"pH": 0.7, "pD": 0.2, "pA": 0.1}, "pick": "H",
               "predicted_at": "2026-08-20"}]
    graded = grade_and_extend(ledger, {("Arsenal", "Coventry"): "H"}, [], rates, 1.4, {}, "2026-08-22")
    check("grade-pick", graded[0].get("pick_correct") is True)
    check("grade-brier", abs(graded[0]["model_brier"] - (0.09 + 0.04 + 0.01)) < 1e-6)
    rec = ledger_record(graded)
    check("record", rec["graded"] == 1 and rec["pick_correct"] == 1)
    # tuple results (the parse_fd_results shape) carry the score string through
    led_s = [{"date": "2026-08-21", "home": "Arsenal", "away": "Coventry City",
              "home_slug": "arsenal", "away_slug": "coventry-city",
              "model": {"pH": 0.7, "pD": 0.2, "pA": 0.1}, "pick": "H",
              "predicted_at": "2026-08-20"}]
    led_s = grade_and_extend(led_s, {("Arsenal", "Coventry"): ("H", 3, 1)}, [], rates, 1.4, {}, "2026-08-22")
    check("grade-score-string", led_s[0]["result"] == "H" and led_s[0]["score"] == "3-1")

    # the 2026-08-30 fix: a pick made before odds were posted still gets
    # a market benchmark, taken from the settled row and used for SCORING ONLY.
    sm_rows = [{"HomeTeam": "Arsenal", "AwayTeam": "Coventry", "FTHG": "3", "FTAG": "1",
                "AvgH": "3.0", "AvgD": "3.0", "AvgA": "3.0",
                "AvgCH": "1.25", "AvgCD": "6.0", "AvgCA": "12.0"}]
    sm = settled_market(sm_rows)
    check("settled-market-prefers-closing", sm[("Arsenal", "Coventry")][1] == "closing"
          and sm[("Arsenal", "Coventry")][0][0] > 0.7)
    sm_open = settled_market([{"HomeTeam": "A", "AwayTeam": "B", "FTHG": "1", "FTAG": "0",
                               "AvgH": "2.0", "AvgD": "4.0", "AvgA": "4.0"}])
    check("settled-market-falls-back-to-opening", sm_open[("A", "B")][1] == "opening")
    check("settled-market-skips-unplayed",
          settled_market([{"HomeTeam": "A", "AwayTeam": "B", "FTHG": "", "FTAG": "",
                           "AvgCH": "2.0", "AvgCD": "4.0", "AvgCA": "4.0"}]) == {})
    led_m = [{"date": "2026-08-21", "home": "Arsenal", "away": "Coventry City",
              "home_slug": "arsenal", "away_slug": "coventry-city",
              "model": {"pH": 0.7, "pD": 0.2, "pA": 0.1}, "pick": "H",
              "predicted_at": "2026-08-20"}]
    led_m = grade_and_extend(led_m, {("Arsenal", "Coventry"): ("H", 3, 1)}, [], rates, 1.4,
                             {}, "2026-08-22", settled_mkt=sm)
    check("settled-market-grades", "market_brier" in led_m[0]
          and led_m[0]["market_priced_at"] == "settlement")
    check("settled-market-is-scoring-only",
          "blend" not in led_m[0] and led_m[0]["pick"] == "H"
          and led_m[0]["model"] == {"pH": 0.7, "pD": 0.2, "pA": 0.1})
    rec_m = ledger_record(led_m)
    check("record-counts-settlement", rec_m["market_graded"] == 1
          and rec_m["market_priced_at_settlement"] == 1
          and rec_m["market_priced_at_prediction"] == 0
          and rec_m["market_closing_graded"] == 1)
    # a price that WAS posted before the pick is left alone, provenance intact
    led_p = [{"date": "2026-08-21", "home": "Arsenal", "away": "Coventry City",
              "home_slug": "arsenal", "away_slug": "coventry-city",
              "model": {"pH": 0.7, "pD": 0.2, "pA": 0.1},
              "market": {"pH": 0.5, "pD": 0.3, "pA": 0.2},
              "market_priced_at": "prediction", "pick": "H",
              "predicted_at": "2026-08-20"}]
    led_p = grade_and_extend(led_p, {("Arsenal", "Coventry"): ("H", 3, 1)}, [], rates, 1.4,
                             {}, "2026-08-22", settled_mkt=sm)
    check("posted-price-not-overwritten", led_p[0]["market"]["pH"] == 0.5
          and led_p[0]["market_priced_at"] == "prediction")
    # kickoff: ESPN date -> ISO UTC; carried on new entries and backfilled
    # onto ungraded ones (S and W are the rates fixture's two teams)
    check("kickoff-iso", kickoff_iso("2026-08-21T19:00Z") == "2026-08-21T19:00:00Z"
          and kickoff_iso("garbage") is None and kickoff_iso(None) is None)
    led2 = [{"date": "2026-08-21", "home": "S", "away": "W",
             "home_slug": "s", "away_slug": "w",
             "model": {"pH": 0.7, "pD": 0.2, "pA": 0.1}, "pick": "H",
             "predicted_at": "2026-08-20"}]
    up2 = [("2026-08-21", "S", "W", "2026-08-21T19:00:00Z"),
           ("2026-08-22", "W", "S", "2026-08-22T14:00:00Z")]
    led2 = grade_and_extend(led2, {}, up2, rates, 1.4, {}, "2026-08-20")
    by_fix = {(e["home"], e["away"]): e for e in led2}
    check("kickoff-backfill", by_fix[("S", "W")]["kickoff"] == "2026-08-21T19:00:00Z")
    check("kickoff-new-entry", by_fix[("W", "S")]["kickoff"] == "2026-08-22T14:00:00Z")

    # adaptive sigma: shrinks with games played, never below the floor
    check("adaptive-sigma-full", abs(adaptive_sigma(1.0, 0.15, 0.45) - 0.15) < 1e-12)
    check("adaptive-sigma-floor", abs(adaptive_sigma(0.0, 0.15, 0.45) - 0.15 * 0.45) < 1e-12)
    check("adaptive-sigma-mid", adaptive_sigma(0.2, 0.15, 0.45) < adaptive_sigma(1.0, 0.15, 0.45))
    check("adaptive-sigma-clamp-neg", adaptive_sigma(-5.0, 0.15, 0.45) == adaptive_sigma(0.0, 0.15, 0.45))
    check("adaptive-sigma-clamp-big", adaptive_sigma(9.0, 0.15, 0.45) == adaptive_sigma(1.0, 0.15, 0.45))

    # percentiles: nearest-rank, empty-safe, monotonic p10 <= p90
    check("percentiles-empty", percentiles([], 50) is None)
    check("percentiles-single", percentiles([44], 10) == 44)
    ptsv = [38, 40, 45, 50, 55, 60, 65, 70, 75, 90]
    p10, p90 = percentiles(ptsv, 10), percentiles(ptsv, 90)
    check("percentiles-order", p10 <= p90)
    check("percentiles-bounds", ptsv[0] <= p10 and p90 <= ptsv[-1])

    # band thresholds (top-4 odds, same cuts as the playoff band)
    check("band-solid", band_for(90.0) == "solid")
    check("band-likely", band_for(75.0) == "likely" and band_for(89.9) == "likely")
    check("band-lean", band_for(60.0) == "lean")
    check("band-tossup", band_for(40.0) == "tossup")
    check("band-unlikely", band_for(15.0) == "unlikely")
    check("band-out", band_for(0.0) == "out" and band_for(14.9) == "out")

    # upsert_snapshot: fresh doc, same-date rebuild replaces (not appends),
    # ascending sort, and the cap drops the oldest first
    doc = upsert_snapshot(None, "2026-09-01", 5, {"arsenal": {"xpts": 80.0}}, keep=3)
    check("snapshot-fresh", len(doc["snapshots"]) == 1 and doc["meta"]["league"] == "premier-league")
    doc = upsert_snapshot(doc, "2026-09-01", 6, {"arsenal": {"xpts": 81.0}}, keep=3)
    check("snapshot-replace-same-date", len(doc["snapshots"]) == 1
          and doc["snapshots"][0]["games_played"] == 6)
    doc = upsert_snapshot(doc, "2026-08-25", 4, {"arsenal": {"xpts": 79.0}}, keep=3)
    check("snapshot-sorted", [s["date"] for s in doc["snapshots"]] == ["2026-08-25", "2026-09-01"])
    doc = upsert_snapshot(doc, "2026-09-08", 8, {}, keep=3)
    doc = upsert_snapshot(doc, "2026-09-15", 10, {}, keep=3)
    check("snapshot-cap", len(doc["snapshots"]) == 3
          and doc["snapshots"][0]["date"] == "2026-09-01")

    # a small end-to-end sim: probs are well-formed, the strong team tops the
    # table more often, and per-fixture CRN draws are stable when the
    # remaining-fixture list shrinks (a fixture already played is simply
    # dropped from `fixtures`, but its position in `fixture_pos` is fixed)
    sim_teams = ["Alpha", "Beta", "Gamma", "Delta"]
    sim_rates = {"Alpha": (2.2, 0.7), "Beta": (1.2, 1.2), "Gamma": (1.0, 1.4), "Delta": (0.8, 1.8)}
    sim_base = {t: (0, 0, 0) for t in sim_teams}
    full = [(h, a) for h in sim_teams for a in sim_teams if h != a]
    fpos = {f: i for i, f in enumerate(full)}
    teams_out, acc, pts_l = simulate(sim_rates, 1.4, 300, sim_base, full, seed=11, fixture_pos=fpos)
    check("sim-teams", sorted(teams_out) == sorted(sim_teams))
    check("sim-title-sum", sum(a["title"] for a in acc.values()) == 300)
    check("sim-alpha-strong", acc["Alpha"]["title"] > acc["Delta"]["title"])
    check("sim-pts-lists", all(len(pts_l[t]) == 300 for t in sim_teams))
    # CRN: drop one fixture (Alpha-Beta) from the schedule but keep the SAME
    # fixture_pos table. Every fixture's own draw is keyed by its fixed
    # position, so every team NOT in the dropped fixture must post the exact
    # same points total, one season at a time; Alpha/Beta (who no longer
    # play each other) must differ in at least one season.
    partial = [f for f in full if f != ("Alpha", "Beta")]
    _t2, _acc2, pl2 = simulate(sim_rates, 1.4, 5, sim_base, partial, seed=11, fixture_pos=fpos)
    _t1, _acc1, pl1 = simulate(sim_rates, 1.4, 5, sim_base, full, seed=11, fixture_pos=fpos)
    untouched = [t for t in sim_teams if t not in ("Alpha", "Beta")]
    check("crn-stable-subset-pl", all(pl1[t] == pl2[t] for t in untouched))
    check("crn-dropped-fixture-differs-pl", pl1["Alpha"] != pl2["Alpha"] or pl1["Beta"] != pl2["Beta"])

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (%d cases)" % len(ran))


def verify_teams():
    d = json.loads(fetch("https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings?season=2026"))
    espn = sorted(e["team"]["displayName"] for ch in d.get("children", [])
                  for e in ch.get("standings", {}).get("entries", []))
    ours = sorted(TEAMS_2026_27)
    if espn == ours:
        print("team list verified vs ESPN (%d teams)." % len(espn))
    else:
        print("MISMATCH.\n  espn-only: %s\n  ours-only: %s"
              % (sorted(set(espn) - set(ours)), sorted(set(ours) - set(espn))))
        sys.exit(1)


def main():
    if "--self-test" in sys.argv:
        self_test(); return
    if "--verify-teams" in sys.argv:
        verify_teams(); return
    sims = DEFAULT_SIMS
    if "--sims" in sys.argv:
        sims = int(sys.argv[sys.argv.index("--sims") + 1])
    sim_doc, pred_doc, hist_doc = build(sims)
    print("mu=%.3f  %s  played=%d" % (sim_doc["meta"]["mu"], sim_doc["meta"]["market"],
                                      sim_doc["meta"]["matches_played"]))
    for r in sim_doc["table"][:6]:
        print("  %-24s title %5.1f%%  top4 %5.1f%%  xPts %.1f (p10 %s p90 %s)"
              % (r["name"], r["p_title"], r["p_top4"], r["exp_pts"], r["pts_p10"], r["pts_p90"]))
    for r in sim_doc["table"][-3:]:
        print("  %-24s releg %5.1f%%  xPts %.1f" % (r["name"], r["p_releg"], r["exp_pts"]))
    up = [e for e in pred_doc["ledger"] if not e.get("result")]
    print("ledger: %d entries (%d graded, %d upcoming); record: %s"
          % (len(pred_doc["ledger"]), pred_doc["record"]["graded"], len(up), pred_doc["record"]))
    if "--dry" in sys.argv:
        print("dry run; nothing written."); return
    with io.open(OUT_SIM, "w", encoding="utf-8", newline="") as f:
        json.dump(sim_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_PRED, "w", encoding="utf-8", newline="") as f:
        json.dump(pred_doc, f, separators=(",", ":"), ensure_ascii=False)
    with io.open(OUT_HIST, "w", encoding="utf-8", newline="") as f:
        json.dump(hist_doc, f, separators=(",", ":"), ensure_ascii=False)
    print("wrote pl-sim.json + pl-predictions.json + pl-sim-history.json")


if __name__ == "__main__":
    main()
