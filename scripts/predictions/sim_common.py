"""Shared pure-math helpers for the points-v3 prediction builders (NFL, CFB,
...). Stdlib only. Every function here is covered by BOTH callers'
--self-test suites (each builder keeps its own test cases; this module has
no tests of its own by design, so it can never be "tested" without being
exercised through a real builder).
"""
import math
from collections import defaultdict


def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def american_prob(v):
    v = float(str(v).replace("+", ""))
    return 100.0 / (v + 100.0) if v > 0 else -v / (-v + 100.0)


def logodds(p, floor=5e-4):
    p = min(max(p, floor), 1 - floor)
    return math.log(p / (1 - p))


def fit_rating_from_logodds(pairs):
    """pairs: [(logodds, rating)] -> (a, b) least squares rating = a + b*lo."""
    n = len(pairs)
    if n < 2:
        return 0.0, 0.0
    sx = sum(x for x, _ in pairs); sy = sum(y for _, y in pairs)
    sxx = sum(x * x for x, _ in pairs); sxy = sum(x * y for x, y in pairs)
    denom = n * sxx - sx * sx
    if abs(denom) < 1e-9:
        return 0.0, 0.0
    b = (n * sxy - sx * sy) / denom
    a = (sy - b * sx) / n
    return a, b


def market_spread(comp):
    """Raw posted home spread from ESPN's odds (negative = home favoured),
    or None when nothing is posted yet."""
    for o in comp.get("odds") or []:
        spread = o.get("spread")
        if spread is not None:
            try:
                return float(spread)
            except (TypeError, ValueError):
                pass
    return None


def implied_ratings_from_spreads(obs, prior, lam=2.0, hfa=0.0, sweeps=200):
    """Ridge-regularized team ratings from posted point spreads.

    obs: [(home, away, spread, neutral)] -- posted home spread (negative =
    home favoured); neutral drops the HFA adjustment for that game. prior:
    {team: rating}, the regression target (recentred elsewhere; a team
    present in `prior` but with no observations falls back to it). Solved
    by Gauss-Seidel on the ridge normal equations.

    Returns ({team: rating}, n_observations_used), ratings recentred to
    mean zero."""
    m = dict(prior)
    by_team = defaultdict(list)  # team -> [(other_team, sign, y)]
    n = 0
    for h, a, spread, neutral in obs:
        if spread is None:
            continue
        m.setdefault(h, 0.0)
        m.setdefault(a, 0.0)
        y = -spread - (0.0 if neutral else hfa)
        by_team[h].append((a, 1.0, y))
        by_team[a].append((h, -1.0, y))
        n += 1
    if n == 0:
        return {t: v for t, v in prior.items()}, 0
    for _ in range(sweeps):
        for t in m:
            num = lam * prior.get(t, 0.0)
            den = lam
            for other, sign, y in by_team.get(t, []):
                num += sign * y + m[other]
                den += 1.0
            if den > 0:
                m[t] = num / den
    mean_m = sum(m.values()) / len(m)
    return {t: v - mean_m for t, v in m.items()}, n


def adaptive_sigma(frac_left, sigma_season, floor_frac):
    """League-wide per-season rating sigma given the fraction of the
    schedule still to play; shrinks toward `floor_frac` of the full-season
    value as the season resolves, never below it."""
    frac_left = min(max(frac_left, 0.0), 1.0)
    return sigma_season * max(floor_frac, math.sqrt(frac_left))


def team_sigma(sigma_base, r_stats, r_market, disagree_k):
    """Widen a team's season sigma by how much the stats and market ratings
    disagree about it (no widening when there is no market rating)."""
    if r_market is None:
        return sigma_base
    return math.sqrt(sigma_base ** 2 + (disagree_k * abs(r_stats - r_market)) ** 2)


def layer_residual_sd(sigma_adaptive, layer_sd, floor=0.25):
    """sd of a team's own noise layer once a shared correlated layer (sd
    `layer_sd`, e.g. division or conference) is split out of its adaptive
    sigma, so the two layers' variance sums back to it (floored so a small
    adaptive sigma never goes negative under the sqrt)."""
    return math.sqrt(max(sigma_adaptive ** 2 - layer_sd ** 2, floor))


def percentiles(values, p):
    """Nearest-rank percentile (p in 0..100) of a list of numbers. None for
    an empty list."""
    if not values:
        return None
    s = sorted(values)
    idx = int(round((p / 100.0) * (len(s) - 1)))
    idx = min(max(idx, 0), len(s) - 1)
    return s[idx]


def leverage_from_counts(win_po, win_total, loss_po, loss_total):
    """100 * (P(playoffs | this team won this game) - P(playoffs | lost)).
    0.0 (not an error) when a branch never happened in the sample."""
    if not win_total or not loss_total:
        return 0.0
    return round(100.0 * (win_po / win_total - loss_po / loss_total), 1)


def band_for(p_playoffs):
    """Playoff-odds band label from p_playoffs (0..100)."""
    if p_playoffs >= 90:
        return "solid"
    if p_playoffs >= 75:
        return "likely"
    if p_playoffs >= 60:
        return "lean"
    if p_playoffs >= 40:
        return "tossup"
    if p_playoffs >= 15:
        return "unlikely"
    return "out"


def upsert_snapshot(doc, date_iso, games_played, rows, league, season, keep=180):
    """Insert or replace `date_iso`'s snapshot in the history doc (a rebuild
    on the same date REPLACES it, never duplicates), sorted ascending by
    date and capped at `keep` entries (oldest dropped first). `doc` may be
    None for a fresh file."""
    doc = doc or {"meta": {"league": league, "season": season,
                           "generated_at": date_iso, "keep": keep},
                  "snapshots": []}
    snaps = [s for s in doc.get("snapshots", []) if s.get("date") != date_iso]
    snaps.append({"date": date_iso, "games_played": games_played, "rows": rows})
    snaps.sort(key=lambda s: s["date"])
    if len(snaps) > keep:
        snaps = snaps[-keep:]
    doc["snapshots"] = snaps
    doc["meta"]["generated_at"] = date_iso
    doc["meta"]["keep"] = keep
    return doc


def brier2(p_home, outcome_home_win):
    o = 1.0 if outcome_home_win else 0.0
    return (p_home - o) ** 2 + ((1 - p_home) - (1 - o)) ** 2
