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


# ---------------------------------------------- de-vigging and the meta-market
#
# Everything below is idea 8 from the 2026-09-03 expert review (see
# reference_prediction_expert_sources): read a book's price properly, then read
# several books at once.


def power_devig(raw, lo=1e-6, hi=40.0, iters=200):
    """Fair probabilities from one book's raw implied prices, by the POWER
    method: solve sum(r_i ** k) == 1 and return [r_i ** k].

    WHY NOT PROPORTIONAL. The de-vig this repo used everywhere before
    2026-09-04 is proportional (multiplicative): p_i = r_i / sum(r). It removes
    the same FRACTION of margin from every outcome, which is only correct if
    the book spreads its margin evenly across the board. Books do not. They
    load margin onto longshots, the favourite-longshot bias, which is one of
    the oldest measured regularities in betting markets. Proportional de-vig
    therefore leaves longshots systematically too high and favourites too low.

    The power method removes margin multiplicatively in LOG space, so it takes
    more off a longshot than off a favourite, in the same direction as the bias
    it is correcting. On a two-way market the two methods barely differ (a 2%
    hold moves a 0.60 by about a point in the third decimal). On a 32-team
    futures board with a 30% overround the difference is large and it lands
    exactly where this repo is most sensitive to it: the futures prices feed
    fit_rating_from_logodds, and the log-odds of a 0.5% team is precisely where
    a de-vig error becomes a rating error.

    f(k) = sum(r_i ** k) is strictly decreasing in k for every r_i in (0, 1),
    so a bisection is exact and needs no derivative. An UNDERROUND (sum < 1,
    which is what an exchange mid or a crossed order book gives) is handled by
    the same solve returning k < 1; that is correct, not a special case.

    Degenerate inputs are clamped rather than raised on: a book that quotes 0
    or 1 is quoting a certainty, and no power can move it.
    """
    r = [min(max(float(x), 1e-9), 1.0 - 1e-9) for x in raw]
    if not r:
        return []
    if len(r) == 1:
        return [1.0]
    s = sum(r)
    if abs(s - 1.0) < 1e-12:
        return list(r)
    a, b = lo, hi
    for _ in range(iters):
        k = 0.5 * (a + b)
        if sum(x ** k for x in r) > 1.0:
            a = k
        else:
            b = k
    k = 0.5 * (a + b)
    out = [x ** k for x in r]
    t = sum(out)
    return [x / t for x in out] if t > 0 else list(r)


def two_way_devig(p_home_raw, p_away_raw):
    """Power de-vig for the common case: a moneyline pair. Returns the fair
    home probability, or None when the pair is unusable."""
    try:
        h, a = float(p_home_raw), float(p_away_raw)
    except (TypeError, ValueError):
        return None
    if h <= 0 or a <= 0:
        return None
    return power_devig([h, a])[0]


def overround(raw):
    """The book's hold, as the sum of its raw implied prices. 1.0 is a fair
    book; above is vig, below is an underround (an exchange, usually)."""
    try:
        return sum(float(x) for x in raw)
    except (TypeError, ValueError):
        return None


def meta_consensus(prices):
    """Consensus of several books' fair probabilities for the SAME outcome.

    prices: {book_key: p}. Returns (p, sd_logodds, n) where sd_logodds is the
    spread of the books around the consensus in log-odds -- the disagreement
    measure, and the honest one, because a 3-point gap at 50% and a 3-point gap
    at 95% are not the same disagreement.

    Books are EQUALLY weighted, deliberately. Inverse-variance weighting is the
    right answer eventually, but the variances have to be fitted on graded
    history and there is none yet; a weighting invented before the data exists
    is fake precision, and it would be indistinguishable in the output from a
    real one. Revisit once the Ledger has a season of per-book Brier scores.
    """
    vals = [float(p) for p in prices.values() if p is not None]
    n = len(vals)
    if n == 0:
        return None, None, 0
    los = [logodds(p) for p in vals]
    m = sum(los) / n
    p = 1.0 / (1.0 + math.exp(-m))
    if n < 2:
        return p, 0.0, n
    var = sum((x - m) ** 2 for x in los) / (n - 1)
    return p, math.sqrt(var), n


def house_effects(rows, min_games=1, min_books=2):
    """Per-book lean against its peers, the betting-market analogue of a
    pollster house effect.

    rows: [{book_key: p_home}], one dict per game, each holding whatever books
    priced that game. Returns
    {book: {"games": n, "lean_logodds": x, "lean_pp": y}} where a POSITIVE lean
    means the book is systematically higher on the home side than the others.

    🔴 The baseline for a book is the consensus of the OTHER books on that game,
    never the consensus including itself. Including it drags every book's own
    baseline toward its own number, which shrinks every house effect toward
    zero and shrinks it most for the books with fewest peers -- so the measure
    would say least about exactly the book it should say most about. This is
    the same leave-one-out correction pollster ratings use, and it is the whole
    reason this function is not two lines.

    `lean_pp` restates the lean in percentage points at a 50/50 game, which is
    the only place a log-odds difference has one unambiguous reading in points.
    """
    acc = defaultdict(list)
    for row in rows:
        priced = {b: p for b, p in row.items() if p is not None}
        if len(priced) < max(2, min_books):
            # 🔴 A book leans against a CONSENSUS, and two prices are not one.
            # At exactly two books the leave-one-out baseline for each IS the
            # other, so the two leans come out as exact negatives and the pair
            # reports its own disagreement twice, dressed as two findings.
            # Callers with thin coverage should pass min_books=3.
            continue
        for b, p in priced.items():
            others = {k: v for k, v in priced.items() if k != b}
            base, _sd, n = meta_consensus(others)
            if base is None or n == 0:
                continue
            acc[b].append(logodds(p) - logodds(base))
    out = {}
    for b, d in acc.items():
        if len(d) < min_games:
            continue
        lean = sum(d) / len(d)
        out[b] = {
            "games": len(d),
            "lean_logodds": round(lean, 4),
            "lean_pp": round(100.0 * (1.0 / (1.0 + math.exp(-lean)) - 0.5), 2),
        }
    return out
