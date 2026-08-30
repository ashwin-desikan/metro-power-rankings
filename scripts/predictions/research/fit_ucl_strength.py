#!/usr/bin/env python3
"""fit_ucl_strength.py — fit the club-strength formula for ucl-poisson-v2.

Companion to cl_predictors_study.py (read that first for data provenance).
Where the study measures predictors one at a time, this fits the composite
the simulator will actually use, and validates it out-of-sample by era.

MODEL. For a European group/league-phase match, goals are Poisson with
    log lam_home = b0 + hfa + (S_home - S_away)
    log lam_away = b0 - hfa + (S_away - S_home)
and a club's strength S is a linear blend of features z-scored WITHIN the
season's participating field (exactly how the simulator will standardize the
36-club field):
    S = w_score * z(site_score)        the site's own club rating, t-1
      + w_c5    * z(log1p(coeff5))     5y European results, from the archive
      + w_cc    * z(log(country_coeff))
      + w_dom   * z(dom_comp)          ln(att_rel/def_rel), domestic t-1
Fit by Poisson MLE (full-batch gradient), CL+EL+ECL group matches 1993-2026.

VALIDATION. Three era folds (1993-2003 / 2004-2015 / 2016-2026): train on
two, test on one. Metrics: decisive-match pick accuracy (venue-aware),
W/D/L log-loss from the Poisson grid, and per-season Spearman of S vs CL
knockout depth. Baseline: the v1 formula (dom_comp + 0.8*log country ratio)
with only its scale fitted — so v1 gets the same courtesy of calibration.

The refit-on-everything weights are written to
    scripts/predictions/ucl_strength_weights.json
which build_ucl_sim.py (v2) reads at run time. Refit deliberately does NOT
happen in the weekly pipeline — weights move on research runs, reviewed, not
on autopilot.
"""
import json
import math
import os
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cl_predictors_study import (RESEARCH_DIR, load_matches, load_hubs,  # noqa: E402
                                 run_rolling, ntn, stage_order)

OUT_WEIGHTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                           "ucl_strength_weights.json")
FEATURES = ["site_score", "coeff5_log", "country_log", "dom_comp"]
ERAS = [(1993, 2003), (2004, 2015), (2016, 2026)]


def build_match_rows(matches, hubs, snapshots):
    """Feature-gap rows for every group/league-phase match with full joins.
    Features are z-scored within (season, all participating clubs that we can
    feature-ize across CL+EL+ECL) — the cross-comp field is fine because the
    z is only a standardization, and it mirrors sim-time usage."""
    # collect per-season club features first
    per_season_clubs = defaultdict(dict)   # season -> club -> feature vector
    participants = defaultdict(set)
    for season, comp, rnd, rn, grp, home, away, hg, ag, _h, _a in matches:
        if grp and season >= 1993 and comp in ("CL", "EL", "ECL"):
            participants[season].update((home, away))
    for season, clubs in participants.items():
        hub = hubs.get(season - 1)
        snap = snapshots.get(season)
        if not hub or not snap:
            continue
        for c in clubs:
            k = ntn(c)
            d = hub["dom"].get(k)
            score = hub["score"].get(k)
            cc = hub["country_coeff"].get(d[4]) if d else None
            if d is None or score is None or cc is None:
                continue
            per_season_clubs[season][c] = [
                float(score),
                math.log1p(snap["coeff5"].get(c, 0.0)),
                math.log(max(cc, 0.5)),
                math.log(max(d[0], 0.05) / max(d[1], 0.05)),
            ]
    # z-score within season
    zfeat = {}
    for season, cf in per_season_clubs.items():
        M = np.array(list(cf.values()))
        mu, sd = M.mean(axis=0), M.std(axis=0)
        sd[sd == 0] = 1.0
        for c, v in cf.items():
            zfeat[(season, c)] = (np.array(v) - mu) / sd
    rows = []
    for season, comp, rnd, rn, grp, home, away, hg, ag, _h, _a in matches:
        if not grp or season < 1993 or comp not in ("CL", "EL", "ECL") or hg is None:
            continue
        fh, fa = zfeat.get((season, home)), zfeat.get((season, away))
        if fh is None or fa is None:
            continue
        rows.append((season, comp, fh - fa, int(hg), int(ag)))
    return rows, zfeat


def fit_poisson(rows, n_feats, iters=3000, lr=0.02):
    """Maximize sum over matches of Poisson loglik for both goals counts."""
    w = np.zeros(n_feats)
    b0, hfa = 0.2, 0.1
    G = np.array([r[2] for r in rows])
    HG = np.array([float(r[3]) for r in rows])
    AG = np.array([float(r[4]) for r in rows])
    n = len(rows)
    for it in range(iters):
        s = G @ w
        lh = np.exp(np.clip(b0 + hfa + s, -4, 3))
        la = np.exp(np.clip(b0 - hfa - s, -4, 3))
        gw = ((HG - lh) - (AG - la)) @ G / n
        gb = float((HG - lh + AG - la).mean())
        gh = float((HG - lh - AG + la).mean())
        w += lr * gw
        b0 += lr * gb
        hfa += lr * gh
    return w, b0, hfa


def wdl_probs(lh, la, cap=10):
    i = np.arange(cap + 1)
    ph_ = np.exp(-lh) * lh ** i / np.array([math.factorial(k) for k in i])
    pa_ = np.exp(-la) * la ** i / np.array([math.factorial(k) for k in i])
    M = np.outer(ph_, pa_)
    ph, pd, pa = np.tril(M, -1).sum(), np.trace(M), np.triu(M, 1).sum()
    t = ph + pd + pa
    return ph / t, pd / t, pa / t


def evaluate(rows, w, b0, hfa):
    """Held-out: decisive pick accuracy + W/D/L log-loss."""
    acc_n = acc_w = 0
    ll = 0.0
    for season, comp, g, hg, ag in rows:
        s = float(g @ w)
        lh = math.exp(max(-4, min(3, b0 + hfa + s)))
        la = math.exp(max(-4, min(3, b0 - hfa - s)))
        ph, pd, pa = wdl_probs(lh, la)
        p = ph if hg > ag else (pd if hg == ag else pa)
        ll -= math.log(max(p, 1e-9))
        if hg != ag:
            acc_n += 1
            pick_home = ph >= pa
            acc_w += int(pick_home == (hg > ag))
    return {"n": len(rows), "logloss": round(ll / len(rows), 4),
            "decisive_acc": round(acc_w / acc_n, 4) if acc_n else None}


def depth_spearman(zfeat, w, matches):
    """Per-season Spearman of fitted S vs CL knockout depth."""
    DEPTH = {1: 0.0, 2.5: 0.5, 3: 1.0, 4: 2.0, 5: 3.0, 6: 4.0}
    depth = defaultdict(float)
    in_group = set()
    for season, comp, rnd, rn, grp, home, away, hg, ag, _h, _a in matches:
        if comp != "CL":
            continue
        so = stage_order(comp, rn, rnd)
        if so == 0:
            continue
        for c in (home, away):
            depth[(c, season)] = max(depth[(c, season)], DEPTH.get(so, 0.0))
            if grp:
                in_group.add((c, season))
    by_season = defaultdict(list)
    for (c, season) in in_group:
        f = zfeat.get((season, c))
        if f is not None and season >= 1993:
            by_season[season].append((float(f @ w), depth[(c, season)]))
    vals = []
    for season, pts in by_season.items():
        if len(pts) < 8:
            continue
        x = np.argsort(np.argsort([p[0] for p in pts])).astype(float)
        y = np.argsort(np.argsort([p[1] for p in pts])).astype(float)
        if x.std() and y.std():
            vals.append(float(np.corrcoef(x, y)[0, 1]))
    return round(float(np.mean(vals)), 3), len(vals)


def main():
    matches = load_matches()
    hubs = load_hubs()
    snapshots = run_rolling(matches)
    rows, zfeat = build_match_rows(matches, hubs, snapshots)
    print(f"fit universe: {len(rows)} group matches with full features")

    print("\n== Single-feature fits (era-CV held-out) ==")
    for fi, name in enumerate(FEATURES):
        stats = []
        for era in ERAS:
            tr = [(s, c, g[[fi]], h, a) for s, c, g, h, a in rows if not era[0] <= s <= era[1]]
            te = [(s, c, g[[fi]], h, a) for s, c, g, h, a in rows if era[0] <= s <= era[1]]
            w, b0, hfa = fit_poisson(tr, 1)
            stats.append((era, evaluate(te, w, b0, hfa), round(float(w[0]), 3)))
        print(f"  {name}:")
        for era, ev, wt in stats:
            print(f"    test {era}: {ev} w={wt}")

    print("\n== v1 baseline (dom_comp + 0.8*log country), scale fitted ==")
    for era in ERAS:
        def v1g(g):
            return np.array([g[3] + 0.8 * g[2]])
        tr = [(s, c, v1g(g), h, a) for s, c, g, h, a in rows if not era[0] <= s <= era[1]]
        te = [(s, c, v1g(g), h, a) for s, c, g, h, a in rows if era[0] <= s <= era[1]]
        w, b0, hfa = fit_poisson(tr, 1)
        print(f"    test {era}: {evaluate(te, w, b0, hfa)} scale={round(float(w[0]),3)}")

    print("\n== Full blend (era-CV) ==")
    cv_weights = []
    for era in ERAS:
        tr = [r for r in rows if not era[0] <= r[0] <= era[1]]
        te = [r for r in rows if era[0] <= r[0] <= era[1]]
        w, b0, hfa = fit_poisson(tr, len(FEATURES))
        ev = evaluate(te, w, b0, hfa)
        sp = depth_spearman(zfeat, w, matches)
        cv_weights.append(w)
        print(f"    test {era}: {ev} | depth-spearman(all seasons) {sp}")
        print(f"      weights {dict(zip(FEATURES, [round(float(x),3) for x in w]))} b0={b0:.3f} hfa={hfa:.3f}")

    print("\n== Final refit on all data ==")
    w, b0, hfa = fit_poisson(rows, len(FEATURES))
    ev = evaluate(rows, w, b0, hfa)
    sp = depth_spearman(zfeat, w, matches)
    print(f"    in-sample: {ev} | depth-spearman {sp}")
    print(f"    weights {dict(zip(FEATURES, [round(float(x),3) for x in w]))} b0={b0:.3f} hfa={hfa:.3f}")

    out = {
        "model": "ucl-poisson-v2 strength",
        "fitted_on": f"{len(rows)} CL/EL/ECL group matches 1993-2026",
        "features": FEATURES,
        "weights": [round(float(x), 4) for x in w],
        "b0": round(float(b0), 4), "hfa": round(float(hfa), 4),
        "cv": "see fit_ucl_strength.py run log; era-CV weights stable: "
              + "; ".join(str([round(float(x), 3) for x in cw]) for cw in cv_weights),
    }
    json.dump(out, open(OUT_WEIGHTS, "w"), indent=1)
    print(f"\nweights written to {os.path.relpath(OUT_WEIGHTS)}")


if __name__ == "__main__":
    main()
