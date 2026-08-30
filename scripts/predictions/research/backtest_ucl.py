#!/usr/bin/env python3
"""backtest_ucl.py — season-level calibration of the v2 strength scale.

The Poisson MLE in fit_ucl_strength.py calibrates per-MATCH probabilities,
but noisy features attenuate the fitted slope, and compounding a diluted
slope over a 13-17 match campaign can under-spread SEASON outcomes (a 6.7%
favourite). This backtest asks the season-level question directly: replaying
2004-2024 (the uniform 32-team group -> R16 era) with each season's REAL
group compositions and preseason features, which global multiplier tau on S
maximizes the log-likelihood of the ACTUAL champions?

Group memberships are reconstructed from the match archive by connected
components (clubs only meet their own group in the group stage). Knockout:
R16 winner-v-runner-up cross-group, open draw from the QF (the post-2013
format; the seeded-path 2004-2013 R16 differs only mildly for this purpose),
two legs, one-leg neutral final. 2000 sims per (season, tau).

Also reports, per tau: how often the model's preseason favourite actually
won (model expectation v the 21-season reality), as a second calibration
check that does not condition on tail probabilities.
"""
import json
import math
import os
import random
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cl_predictors_study import (RESEARCH_DIR, load_matches, load_hubs,  # noqa: E402
                                 run_rolling, ntn, stage_order)

WEIGHTS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "..", "ucl_strength_weights.json")))
W1, W2 = WEIGHTS["weights"]
B0, HFA = WEIGHTS["b0"], WEIGHTS["hfa"]
SIMS = 4000
TAUS = [1.0, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]
ET = 1.0 / 3.0


def season_features(season, hubs, snapshots, clubs):
    """S (tau=1) per club for one historical season, z within this field —
    matching sim-time standardization (the CL field alone here; the modern
    sim z's over CL+EL+ECL, a wider field, which mildly SHRINKS CL gaps, so
    tau calibrated here is conservative rather than flattering)."""
    hub = hubs.get(season - 1)
    if not hub:
        return None
    feats = {}
    for c in clubs:
        k = ntn(c)
        d = hub["dom"].get(k)
        sc = hub["score"].get(k)
        cc = hub["country_coeff"].get(d[4]) if d else None
        if cc is None:
            return None   # no country coefficient at all: skip season
        feats[c] = [None if sc is None else float(sc), math.log(max(cc, 0.5))]
    # production behaviour: a club with no site score takes the field minimum
    floor = min(v[0] for v in feats.values() if v[0] is not None)
    for v in feats.values():
        if v[0] is None:
            v[0] = floor
    M = np.array(list(feats.values()))
    mu, sd = M.mean(axis=0), M.std(axis=0)
    sd[sd == 0] = 1.0
    return {c: W1 * (v[0] - mu[0]) / sd[0] + W2 * (v[1] - mu[1]) / sd[1]
            for c, v in feats.items()}


def reconstruct_groups(matches, season):
    """Group memberships by connected components of the group-match graph."""
    adj = defaultdict(set)
    for s, comp, rnd, rn, grp, home, away, hg, ag, _h, _a in matches:
        if s == season and comp == "CL" and grp:
            adj[home].add(away)
            adj[away].add(home)
    seen, groups = set(), []
    for start in adj:
        if start in seen:
            continue
        comp_set, stack = set(), [start]
        while stack:
            c = stack.pop()
            if c in comp_set:
                continue
            comp_set.add(c)
            stack.extend(adj[c] - comp_set)
        seen |= comp_set
        groups.append(sorted(comp_set))
    return groups


_FINAL_WINNERS = json.load(open(os.path.join(RESEARCH_DIR, "cl_final_winners.json"))) \
    if os.path.exists(os.path.join(RESEARCH_DIR, "cl_final_winners.json")) else {}

def actual_champion(matches, season):
    # pens-decided finals resolved from the archive's pens columns
    return _FINAL_WINNERS.get(str(season)) or _FINAL_WINNERS.get(season)


def poisson(lam, rnd):
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rnd.random()
        if p <= l:
            return k
        k += 1


def lambdas(S, x, y, noise, home_adv=True):
    gap = S[x] + noise[x] - S[y] - noise[y]
    h = HFA if home_adv else 0.0
    return math.exp(B0 + h + gap), math.exp(B0 - h - gap)


def tie(S, x, y, noise, rnd, two_legs=True):
    nx, ny = lambdas(S, x, y, noise, home_adv=False)
    if two_legs:
        l1h, l1a = lambdas(S, x, y, noise)
        l2h, l2a = lambdas(S, y, x, noise)
        gx = poisson(l1h, rnd) + poisson(l2a, rnd)
        gy = poisson(l1a, rnd) + poisson(l2h, rnd)
    else:
        gx, gy = poisson(nx, rnd), poisson(ny, rnd)
    if gx != gy:
        return x if gx > gy else y
    gx, gy = poisson(nx * ET, rnd), poisson(ny * ET, rnd)
    if gx != gy:
        return x if gx > gy else y
    return x if rnd.random() < 0.5 else y


def simulate_season(S, groups, rnd, sigma=0.05):
    noise = {c: rnd.gauss(0.0, sigma) for g in groups for c in g}
    winners, runners = [], []
    for g in groups:
        pts = {c: 0 for c in g}
        gd = {c: 0 for c in g}
        for i, x in enumerate(g):
            for y in g[i + 1:]:
                for h, a in ((x, y), (y, x)):
                    lh, la = lambdas(S, h, a, noise)
                    hg, ag = poisson(lh, rnd), poisson(la, rnd)
                    gd[h] += hg - ag; gd[a] += ag - hg
                    if hg > ag:
                        pts[h] += 3
                    elif hg < ag:
                        pts[a] += 3
                    else:
                        pts[h] += 1; pts[a] += 1
        order = sorted(g, key=lambda c: (-pts[c], -gd[c], rnd.random()))
        winners.append(order[0]); runners.append(order[1])
    # R16: winners v runners, cross-group
    idx = list(range(len(groups)))
    while True:
        rnd.shuffle(idx)
        if all(idx[i] != i for i in range(len(idx))):
            break
    alive = [tie(S, winners[i], runners[idx[i]], noise, rnd) for i in range(len(groups))]
    while len(alive) > 2:
        rnd.shuffle(alive)
        alive = [tie(S, alive[i], alive[i + 1], noise, rnd) for i in range(0, len(alive), 2)]
    return tie(S, alive[0], alive[1], noise, rnd, two_legs=False)


def main():
    matches = load_matches()
    hubs = load_hubs()
    snapshots = run_rolling(matches)
    seasons = []
    for season in range(2004, 2025):
        groups = reconstruct_groups(matches, season)
        champ = actual_champion(matches, season)
        if len(groups) != 8 or any(len(g) != 4 for g in groups) or champ is None:
            print(f"  skip {season}: groups={len(groups)} champ={champ}")
            continue
        clubs = [c for g in groups for c in g]
        S1 = season_features(season, hubs, snapshots, clubs)
        if S1 is None:
            print(f"  skip {season}: incomplete features")
            continue
        seasons.append((season, groups, champ, S1))
    print(f"backtest universe: {len(seasons)} seasons")

    for tau in TAUS:
        ll = 0.0
        fav_wins = 0
        fav_prob = 0.0
        for season, groups, champ, S1 in seasons:
            S = {c: tau * v for c, v in S1.items()}
            rnd = random.Random(1000 + season)
            wins = defaultdict(int)
            for _ in range(SIMS):
                wins[simulate_season(S, groups, rnd)] += 1
            p_champ = (wins[champ] + 0.5) / (SIMS + 18.0)   # light smoothing
            ll += math.log(p_champ)
            fav = max(S, key=S.get)
            fav_prob += wins[fav] / SIMS
            fav_wins += int(fav == champ)
        print(f"tau={tau:><4}: champion logloss/season={-ll/len(seasons):.4f} | "
              f"favourite won {fav_wins}/{len(seasons)} (model expected {fav_prob:.1f})")


if __name__ == "__main__":
    main()
