#!/usr/bin/env python3
"""NFL Program 2026, Stage 1: the walk-forward backtest harness.

Plan of record: docs/NFL-PROGRAM-2026.md. This is the gate every points-v3
feature must pass before it may influence a live pick: improve out-of-sample
Brier against the closing market, walk-forward over the play-by-play era.

WHAT IT GRADES
  Three probability columns per game, on exactly the games the market
  priced (the expectation ledger's own convention):
    market : de-vigged closing spread through Phi (from the expectation
             ledger, public/data/nfl/expectation/season-<Y>.json)
    elo    : the workbook century model's pre-game probability (same files)
    model  : the candidate built HERE from nflverse play-by-play EPA,
             strictly walk-forward (a game's features come only from games
             finished before it; the probability map is refit each season
             on prior seasons only)

THE CANDIDATE MODEL (gate 1: "EPA ratings")
  Per team, exponentially decayed per-play EPA form, offense and defense,
  opponent-adjusted at ingestion time (a performance is measured against
  the opponent's rating as of that day, never a later one). Season
  rollover shrinks ratings toward the league mean. Feature -> probability
  via a logistic (IRLS, numpy only) on [net_diff, home], refit before each
  graded season on all completed prior seasons. No sklearn, no leakage.

MATCHING WITHOUT GUESSING
  pbp names teams by abbreviation; the ledger by canonical franchise key.
  The join learns the abbrev->key map empirically from (date, score-pair)
  matches that are unambiguous, requires unanimity per abbreviation, then
  resolves the rest through the learned map and ASSERTS a 1:1 bijection
  over every game 1999-2025, with final scores agreeing on both sides.
  Anything unmatched is listed and the run hard-exits: mismatches surface,
  they are never repaired by inference.

APPROXIMATION ON RECORD (per the 2026-08-30 scope ruling): historical QB
starts, when the QB layer arrives, derive from the game itself; this
slightly flatters the model on surprise scratches. Gate 1 uses no QB data.

Usage:
    python scripts/predictions/backtest_harness.py                # full run
    python scripts/predictions/backtest_harness.py --seasons 2019 2025
    python scripts/predictions/backtest_harness.py --no-adjust    # ablation
    python scripts/predictions/backtest_harness.py --self-test    # offline
Outputs a console table and data/nfl/backtest-report.json (gitignored).
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EXP_DIR = ROOT / "public" / "data" / "nfl" / "expectation"
CACHE_DIR = ROOT / "data" / "nfl"
REPORT = CACHE_DIR / "backtest-report.json"

PBP_FIRST = 1999          # nflfastR's earliest season
FIRST_GRADED = 2001       # 1999-2000 are burn-in: features exist, no grade
LAST_SEASON = 2025

# Rating hyperparameters (gate 1 defaults; every change re-runs the gate)
DECAY = 0.95              # per team-game EMA decay (half-life ~13.5 games)
ROLLOVER = 0.65           # season boundary: rating *= ROLLOVER toward mean
MIN_GAMES = 4             # a team below this many observed games predicts 0

# nflfastR's documented upstream gaps: these games exist in the ledger and
# were played, but nflverse holds no play-by-play for them (verified against
# the caches 2026-08-30: 1999 has 258 of 259 games, 2000 has 257 of 259).
# They are exempt from the bijection check ONLY; ratings simply see one
# fewer game, and all three predate FIRST_GRADED, so no graded game is
# affected. Anything missing beyond this list still hard-fails the run.
KNOWN_MISSING_PBP = {
    ("1999-09-12", frozenset({"Rams", "Ravens"})),
    ("2000-09-17", frozenset({"Chargers", "Chiefs"})),
    ("2000-10-08", frozenset({"Dolphins", "Bills"})),
}


# ---------------------------------------------------------------- ledger --

def load_ledger(seasons):
    """The expectation ledger's per-game rows: date, keys, result, market
    and workbook-elo probabilities. This is the graded side of the join."""
    games = []
    for season in seasons:
        path = EXP_DIR / f"season-{season}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        for g in data["games"]:
            hs, as_ = g["score"].split("-")
            games.append({
                "season": season,
                "week": g.get("week"),
                "date": g["date"],
                "playoff": bool(g.get("playoff")),
                "home_key": g["home_key"],
                "away_key": g["away_key"],
                "neutral": bool(g.get("neutral")),
                "result": g["result"],          # H / A / T
                "home_score": int(hs),
                "away_score": int(as_),
                "market_ph": (g.get("market") or {}).get("pH"),
                "elo_ph": (g.get("model") or {}).get("pH"),
            })
    return games


# ------------------------------------------------------------------- pbp --

def load_pbp_games(seasons):
    """Per-game facts and per-team-game EPA aggregates from the nflverse
    parquet cache. Returns (game_rows, team_game_rows)."""
    import pandas as pd
    cols = ["game_id", "game_date", "home_team", "away_team",
            "home_score", "away_score", "posteam", "epa", "pass", "rush",
            "season_type"]
    game_rows, team_rows = [], []
    for season in seasons:
        path = CACHE_DIR / "pbp" / f"play_by_play_{season}.parquet"
        if not path.exists():
            sys.exit(f"FATAL: missing pbp cache {path} - run nfl_etl.py first")
        df = pd.read_parquet(path, columns=cols)
        meta = df.drop_duplicates("game_id")[
            ["game_id", "game_date", "home_team", "away_team",
             "home_score", "away_score"]]
        for r in meta.itertuples(index=False):
            game_rows.append({
                "season": season, "game_id": r.game_id,
                "date": str(r.game_date)[:10],
                "home_ab": r.home_team, "away_ab": r.away_team,
                "home_score": int(r.home_score), "away_score": int(r.away_score),
            })
        plays = df[((df["pass"] == 1) | (df["rush"] == 1)) & df["epa"].notna()]
        agg = plays.groupby(["game_id", "posteam"])["epa"].agg(["mean", "count"])
        for (gid, team), row in agg.iterrows():
            if not team:      # safety: null posteam never aggregates
                continue
            team_rows.append({"game_id": gid, "team_ab": team,
                              "off_epa": float(row["mean"]),
                              "plays": int(row["count"])})
    return game_rows, team_rows


# -------------------------------------------------- empirical abbrev map --

def learn_mapping(ledger, pbp_games):
    """Learn abbrev->franchise-key from unambiguous (date, score-pair)
    matches; unanimity required per abbreviation. Returns the map after
    asserting a clean 1:1 bijection over ALL games, scores agreeing."""
    by_date = defaultdict(list)
    for g in ledger:
        by_date[g["date"]].append(g)

    votes = defaultdict(set)
    for p in pbp_games:
        cands = []
        for g in by_date.get(p["date"], []):
            if (g["home_score"], g["away_score"]) == (p["home_score"], p["away_score"]):
                cands.append((g, False))
            elif (g["home_score"], g["away_score"]) == (p["away_score"], p["home_score"]):
                cands.append((g, True))
        # keep only score-pairs unique on their date, both sides
        if len(cands) == 1:
            g, flipped = cands[0]
            same_score_pbp = [q for q in pbp_games
                              if q["date"] == p["date"] and
                              {q["home_score"], q["away_score"]} ==
                              {p["home_score"], p["away_score"]}]
            if len(same_score_pbp) == 1:
                hk, ak = (g["away_key"], g["home_key"]) if flipped else \
                         (g["home_key"], g["away_key"])
                votes[p["home_ab"]].add(hk)
                votes[p["away_ab"]].add(ak)

    mapping, bad = {}, []
    for ab, keys in sorted(votes.items()):
        if len(keys) == 1:
            mapping[ab] = next(iter(keys))
        else:
            bad.append((ab, sorted(keys)))
    if bad:
        sys.exit(f"FATAL: ambiguous abbreviation votes (never guess): {bad}")

    # full bijection check through the learned map
    led_index = {}
    for g in ledger:
        led_index[(g["date"], frozenset((g["home_key"], g["away_key"])))] = g
    matched, problems = {}, []
    for p in pbp_games:
        hk, ak = mapping.get(p["home_ab"]), mapping.get(p["away_ab"])
        if not hk or not ak:
            problems.append(("unmapped", p["game_id"], p["home_ab"], p["away_ab"]))
            continue
        key = (p["date"], frozenset((hk, ak)))
        g = led_index.get(key)
        if g is None:
            problems.append(("no_ledger_row", p["game_id"], p["date"], hk, ak))
            continue
        flipped = (hk != g["home_key"])
        ps = (p["away_score"], p["home_score"]) if flipped else \
             (p["home_score"], p["away_score"])
        if ps != (g["home_score"], g["away_score"]):
            problems.append(("score_mismatch", p["game_id"], p["date"], ps,
                             (g["home_score"], g["away_score"])))
            continue
        if key in matched:
            problems.append(("duplicate_match", p["game_id"], key))
            continue
        matched[key] = (p, g, flipped)
    unmatched_ledger = [k for k in led_index
                        if k not in matched and k not in KNOWN_MISSING_PBP]
    if problems or unmatched_ledger:
        for pr in problems[:20]:
            print("PROBLEM:", pr)
        for k in unmatched_ledger[:20]:
            print("LEDGER GAME NEVER MATCHED:", k)
        sys.exit(f"FATAL: reconciliation failed - {len(problems)} problems, "
                 f"{len(unmatched_ledger)} ledger games unmatched")
    return mapping, matched


# ------------------------------------------------------------- the model --

class Ratings:
    """Walk-forward team form: exponentially decayed, opponent-adjusted
    per-play EPA, offense and defense. Everything is per-play units."""

    def __init__(self, decay=DECAY, rollover=ROLLOVER, adjust=True):
        self.decay = decay
        self.rollover = rollover
        self.adjust = adjust
        self.off = {}      # team -> EMA of adjusted offensive EPA/play
        self.dfn = {}      # team -> EMA of adjusted EPA/play ALLOWED
        self.n = defaultdict(int)   # team -> games observed

    def season_rollover(self):
        for d in (self.off, self.dfn):
            for t in d:
                d[t] *= self.rollover

    def net(self, team):
        if self.n[team] < MIN_GAMES:
            return 0.0
        return self.off.get(team, 0.0) - self.dfn.get(team, 0.0)

    def ready(self, team):
        return self.n[team] >= MIN_GAMES

    def _fold(self, team, off_epa, epa_allowed, opp_off, opp_dfn):
        adj_off = off_epa - (opp_dfn if self.adjust else 0.0)
        adj_def = epa_allowed - (opp_off if self.adjust else 0.0)
        for store, value in ((self.off, adj_off), (self.dfn, adj_def)):
            prev = store.get(team)
            store[team] = value if prev is None else \
                self.decay * prev + (1 - self.decay) * value
        self.n[team] += 1

    def update_game(self, team_a, team_b, epa_a, epa_b):
        """Fold one finished game in for BOTH sides. Adjustments use
        PRE-GAME snapshots of the opponent's ratings, so neither side's
        adjustment can see this game's effect on the other (the same-game
        leak the self-test guards)."""
        a_off, a_dfn = self.off.get(team_a, 0.0), self.dfn.get(team_a, 0.0)
        b_off, b_dfn = self.off.get(team_b, 0.0), self.dfn.get(team_b, 0.0)
        self._fold(team_a, epa_a, epa_b, b_off, b_dfn)
        self._fold(team_b, epa_b, epa_a, a_off, a_dfn)


def fit_logistic(X, y, iters=25):
    """Plain IRLS logistic regression; numpy only. X includes intercept."""
    import numpy as np
    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        z = X @ w
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))
        g = X.T @ (y - p)
        W = p * (1 - p) + 1e-9
        H = (X * W[:, None]).T @ X + 1e-6 * np.eye(X.shape[1])
        step = np.linalg.solve(H, g)
        w = w + step
        if float(abs(step).max()) < 1e-10:
            break
    return w


def predict_ph(w, net_diff, home):
    z = w[0] + w[1] * net_diff + w[2] * home
    return 1.0 / (1.0 + math.exp(-max(-30, min(30, z))))


def outcome_value(result):
    return {"H": 1.0, "A": 0.0, "T": 0.5}[result]


def feature_vector(mode, feat, home, elo_logit):
    """The gated feature sets. 'epa' is the candidate alone; 'elo' is the
    century backbone re-expressed through the same logistic (sanity rail);
    'elo+epa' is the actual gate-1 question - does EPA ADD information the
    backbone does not already carry?"""
    if mode == "epa":
        return [1.0, feat, home]
    if mode == "elo":
        return [1.0, elo_logit]
    if mode == "elo+epa":
        return [1.0, elo_logit, feat, home]
    raise ValueError(mode)


def run_backtest(seasons_graded, adjust=True, decay=DECAY, rollover=ROLLOVER,
                 mode="epa"):
    all_seasons = list(range(PBP_FIRST, max(seasons_graded) + 1))
    ledger = load_ledger(all_seasons)
    pbp_games, team_rows = load_pbp_games(all_seasons)
    mapping, matched = learn_mapping(ledger, pbp_games)
    print(f"mapping learned: {len(mapping)} abbreviations, "
          f"{len(matched)} games reconciled 1:1, scores agree")

    epa_by_game = defaultdict(dict)
    for r in team_rows:
        epa_by_game[r["game_id"]][r["team_ab"]] = r["off_epa"]

    # one chronological stream of matched games
    stream = sorted(matched.values(), key=lambda t: (t[0]["date"], t[0]["game_id"]))

    ratings = Ratings(decay=decay, rollover=rollover, adjust=adjust)
    rows_by_season = defaultdict(list)   # season -> (feature, home, outcome, g)
    current_season = None
    for p, g, flipped in stream:
        if g["season"] != current_season:
            if current_season is not None:
                ratings.season_rollover()
            current_season = g["season"]
        hk = mapping[p["home_ab"]]
        ak = mapping[p["away_ab"]]
        # ledger orientation governs: home_key is the ledger's home side
        lh_ab = p["away_ab"] if flipped else p["home_ab"]
        la_ab = p["home_ab"] if flipped else p["away_ab"]
        lh, la = g["home_key"], g["away_key"]
        # prediction BEFORE the game's own result is folded in
        if ratings.ready(lh) and ratings.ready(la):
            feat = ratings.net(lh) - ratings.net(la)
            home = 0.0 if g["neutral"] else 1.0
            elo_ph = g["elo_ph"]
            elo_logit = None if elo_ph is None else \
                math.log(max(1e-6, min(1 - 1e-6, elo_ph)) /
                         (1 - max(1e-6, min(1 - 1e-6, elo_ph))))
            rows_by_season[g["season"]].append(
                (feat, home, elo_logit, outcome_value(g["result"]), g))
        # fold the game in
        epa = epa_by_game.get(p["game_id"], {})
        if lh_ab in epa and la_ab in epa:
            ratings.update_game(lh, la, epa[lh_ab], epa[la_ab])

    # walk-forward grading: fit on strictly earlier seasons
    report = []
    for season in seasons_graded:
        train = []
        for s in range(PBP_FIRST, season):
            train += rows_by_season.get(s, [])
        rows = rows_by_season.get(season, [])
        if len(train) < 200 or not rows:
            continue
        train_ok = [(f, h, el, o) for f, h, el, o, _ in train if el is not None]
        w = fit_logistic([feature_vector(mode, f, h, el) for f, h, el, o in train_ok],
                         [o for _, _, _, o in train_ok])
        bm = bk = be = n = 0.0
        for f, h, el, o, g in rows:
            if g["market_ph"] is None or el is None:
                continue
            x = feature_vector(mode, f, h, el)
            z = sum(wi * xi for wi, xi in zip(w, x))
            ph = 1.0 / (1.0 + math.exp(-max(-30, min(30, z))))
            g["_model_ph"] = ph
            bm += (ph - o) ** 2
            bk += (g["market_ph"] - o) ** 2
            be += (g["elo_ph"] - o) ** 2
            n += 1
        if n == 0:
            continue
        report.append({
            "season": season, "graded": int(n),
            "model_brier": round(bm / n, 5),
            "market_brier": round(bk / n, 5),
            "elo_brier": round(be / n, 5),
            "skill_vs_market": round(1 - (bm / n) / (bk / n), 5),
            "elo_skill_vs_market": round(1 - (be / n) / (bk / n), 5),
        })
    return report, mapping


def print_report(report, label):
    total_n = sum(r["graded"] for r in report)
    wm = sum(r["model_brier"] * r["graded"] for r in report) / total_n
    wk = sum(r["market_brier"] * r["graded"] for r in report) / total_n
    we = sum(r["elo_brier"] * r["graded"] for r in report) / total_n
    closer = sum(1 for r in report if r["model_brier"] < r["market_brier"])
    elo_closer = sum(1 for r in report if r["elo_brier"] < r["market_brier"])
    beats_elo = sum(1 for r in report if r["model_brier"] < r["elo_brier"])
    print(f"\n=== {label} ===")
    print("season  graded  model    market   elo      skill      elo_skill")
    for r in report:
        print(f"{r['season']}    {r['graded']:>4}   {r['model_brier']:.4f}"
              f"   {r['market_brier']:.4f}   {r['elo_brier']:.4f}"
              f"   {r['skill_vs_market']:+.4f}    {r['elo_skill_vs_market']:+.4f}")
    agg = {
        "label": label, "seasons": len(report), "graded": total_n,
        "model_brier": round(wm, 5), "market_brier": round(wk, 5),
        "elo_brier": round(we, 5),
        "skill_vs_market": round(1 - wm / wk, 5),
        "elo_skill_vs_market": round(1 - we / wk, 5),
        "seasons_model_closer_than_market": closer,
        "seasons_elo_closer_than_market": elo_closer,
        "seasons_model_beats_elo": beats_elo,
    }
    print(f"AGGREGATE: model {wm:.5f}  market {wk:.5f}  elo {we:.5f}")
    print(f"skill vs market: model {1 - wm / wk:+.4%}   elo {1 - we / wk:+.4%}")
    print(f"seasons closer than market: model {closer}/{len(report)}, "
          f"elo {elo_closer}/{len(report)}; model beats elo in "
          f"{beats_elo}/{len(report)}")
    return agg


# --------------------------------------------------------------- selftest --

def self_test():
    """Offline checks: rating math, logistic recovery, mapping learner
    with a same-score collision, and the walk-forward no-leak property."""
    import random
    random.seed(7)

    # 1) logistic recovers a monotone relationship
    X, y = [], []
    for _ in range(4000):
        f = random.uniform(-0.3, 0.3)
        h = random.random() < 0.5
        p = 1 / (1 + math.exp(-(4.0 * f + 0.35 * (1 if h else 0))))
        X.append([1.0, f, 1.0 if h else 0.0])
        y.append(1.0 if random.random() < p else 0.0)
    w = fit_logistic(X, y)
    assert w[1] > 2.0, f"logistic slope not recovered: {w}"
    assert 0.1 < w[2] < 0.7, f"home coefficient off: {w}"

    # 2) ratings, unadjusted: sustained outperformance rises; rollover
    # shrinks toward the mean
    r = Ratings(adjust=False)
    for _ in range(10):
        r.update_game("A", "B", 0.15, -0.05)
    assert r.net("A") > 0.1 > 0 > r.net("B"), (r.net("A"), r.net("B"))
    before = r.net("A")
    r.season_rollover()
    assert 0 < r.net("A") < before, "rollover must shrink toward the mean"

    # 2b) opponent adjustment: the same raw performance is worth more
    # against a strong defense than a weak one
    r = Ratings(adjust=True)
    r.dfn["StrongD"], r.dfn["WeakD"] = -0.1, 0.1
    r.update_game("C", "StrongD", 0.1, 0.0)
    r.update_game("D", "WeakD", 0.1, 0.0)
    assert r.off["C"] > r.off["D"], (r.off["C"], r.off["D"])

    # 2c) no same-game leak inside one update_game: folding a game must
    # use pre-game opponent snapshots on both sides
    r1 = Ratings(adjust=True)
    r1.off["X"], r1.dfn["X"] = 0.05, -0.05
    r1.off["Y"], r1.dfn["Y"] = -0.02, 0.02
    r2 = Ratings(adjust=True)
    r2.off.update(r1.off); r2.dfn.update(r1.dfn)
    r1.update_game("X", "Y", 0.1, -0.1)
    r2._fold("X", 0.1, -0.1, -0.02, 0.02)
    r2._fold("Y", -0.1, 0.1, 0.05, -0.05)
    assert abs(r1.off["Y"] - r2.off["Y"]) < 1e-12 and \
        abs(r1.dfn["Y"] - r2.dfn["Y"]) < 1e-12, "same-game leak detected"

    # 3) mapping learner: two games, same date, same score pair -> those
    # games are deferred, but the map still resolves from the clean date,
    # and the bijection check then matches all four games.
    ledger = [
        {"season": 2001, "date": "2001-01-01", "home_key": "K1", "away_key": "K2",
         "home_score": 20, "away_score": 10, "result": "H", "week": 1,
         "playoff": False, "neutral": False, "market_ph": 0.6, "elo_ph": 0.6},
        {"season": 2001, "date": "2001-01-01", "home_key": "K3", "away_key": "K4",
         "home_score": 20, "away_score": 10, "result": "H", "week": 1,
         "playoff": False, "neutral": False, "market_ph": 0.6, "elo_ph": 0.6},
        {"season": 2001, "date": "2001-01-08", "home_key": "K1", "away_key": "K3",
         "home_score": 7, "away_score": 3, "result": "H", "week": 2,
         "playoff": False, "neutral": False, "market_ph": 0.6, "elo_ph": 0.6},
        {"season": 2001, "date": "2001-01-08", "home_key": "K2", "away_key": "K4",
         "home_score": 21, "away_score": 14, "result": "H", "week": 2,
         "playoff": False, "neutral": False, "market_ph": 0.6, "elo_ph": 0.6},
    ]
    pbp = [
        {"season": 2001, "game_id": "g1", "date": "2001-01-01",
         "home_ab": "A1", "away_ab": "A2", "home_score": 20, "away_score": 10},
        {"season": 2001, "game_id": "g2", "date": "2001-01-01",
         "home_ab": "A3", "away_ab": "A4", "home_score": 20, "away_score": 10},
        {"season": 2001, "game_id": "g3", "date": "2001-01-08",
         "home_ab": "A1", "away_ab": "A3", "home_score": 7, "away_score": 3},
        {"season": 2001, "game_id": "g4", "date": "2001-01-08",
         "home_ab": "A2", "away_ab": "A4", "home_score": 21, "away_score": 14},
    ]
    mapping, matched = learn_mapping(ledger, pbp)
    assert mapping == {"A1": "K1", "A2": "K2", "A3": "K3", "A4": "K4"}, mapping
    assert len(matched) == 4, len(matched)

    # 4) no-leak: the prediction stream never looks ahead. Build two
    # synthetic streams that agree until a cut date and diverge after;
    # predictions up to the cut must be identical.
    def preds(extra):
        r = Ratings()
        out = []
        sched = [("T1", "T2"), ("T2", "T1")] * 6 + extra
        for i, (h, a) in enumerate(sched):
            if r.ready(h) and r.ready(a):
                out.append(round(r.net(h) - r.net(a), 12))
            perf = 0.2 if h == "T1" else -0.2
            r.update_game(h, a, perf, -perf)
            if i == 7:
                cutlen = len(out)
        return out[:cutlen]
    a = preds([("T1", "T2")] * 4)
    b = preds([("T2", "T1")] * 4)
    assert a == b, "walk-forward leak: future games changed past predictions"

    print("self-test: OK (logistic, ratings, mapping collision, no-leak)")


# ------------------------------------------------------------------ main --

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs=2, type=int, metavar=("FIRST", "LAST"),
                    default=[FIRST_GRADED, LAST_SEASON])
    ap.add_argument("--decay", type=float, default=DECAY)
    ap.add_argument("--rollover", type=float, default=ROLLOVER)
    ap.add_argument("--no-adjust", action="store_true",
                    help="ablation: skip opponent adjustment")
    ap.add_argument("--features", default="epa",
                    choices=["epa", "elo", "elo+epa"])
    ap.add_argument("--label", default=None)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    lo, hi = args.seasons
    seasons = list(range(max(lo, FIRST_GRADED), min(hi, LAST_SEASON) + 1))
    label = args.label or (
        f"{args.features} decay={args.decay} rollover={args.rollover}"
        f"{' NO-ADJUST' if args.no_adjust else ''}")
    report, mapping = run_backtest(seasons, adjust=not args.no_adjust,
                                   decay=args.decay, rollover=args.rollover,
                                   mode=args.features)
    agg = print_report(report, label)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"aggregate": agg, "seasons": report,
               "mapping": mapping,
               "params": {"decay": args.decay, "rollover": args.rollover,
                          "adjust": not args.no_adjust,
                          "min_games": MIN_GAMES,
                          "first_graded": seasons[0], "last": seasons[-1]}}
    REPORT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"report written: {REPORT}")


if __name__ == "__main__":
    main()
