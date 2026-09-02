#!/usr/bin/env python3
"""NFL Program 2026: the points-v3 SHADOW ledger.

Plan of record: docs/NFL-PROGRAM-2026.md. v2 keeps the live picks. v3 runs
beside it from week 1, frozen at prediction time and graded in public, so the
comparison window is the whole season rather than whatever is left when the
model is finished. If v3 loses, that gets published too.

WHAT V3 IS HERE
  The configuration that actually passed the walk-forward gate on
  2026-08-30: `elo+epa`, a logistic on [1, elo_logit, epa_net_diff, home],
  -3.15% against the closing market over 2001-2025, beating the century
  backbone alone in 24 of 25 seasons. EPA alone FAILED at -6.10% and does
  not ship. The QB layer, then rest, travel and weather, are the next gated
  candidates; none of them is in here.

THE BACKBONE, AND WHY THIS SCRIPT EXISTS AT ALL
  🔴 The gate's `elo` column is the CENTURY BACKBONE out of NFL_all.xlsx.
  The live pick engine (build_nfl_sim.py) does NOT use it: its `model.pH` is
  a regressed recency-weighted POINT MARGIN from ESPN season standings,
  mapped through a normal CDF. Two different models wearing one field name.
  Feeding the live probability into a logistic whose `elo_logit` coefficient
  was fitted on workbook-Elo logits would apply a coefficient fitted for one
  predictor to a different predictor, and it would look fine.

  So the shadow carries the workbook's own Elo forward on the workbook's own
  terms, all three of them measured rather than assumed by
  scripts/predictions/nfl_elo_workbook.py and stored in nfl_elo_2026.json:
    probability  p = 1 / (1 + 10 ** (-(dElo + 65*own_ground) / 400))
                 reproduces the workbook column to MAE 6e-8 over 7,185 rows
    off-season   new = (2/3)*old + 501.49, one third of the way to 1505
                 (R^2 0.99996 over 829 franchise-season boundaries)
    in-season    shift = 20 * (actual - p) * ln(|margin|+1)
                 * 2.2 / (winner_elo_edge*0.001 + 2.2)   (R^2 1.00000)
  Because the in-season update is exact, the shadow's backbone stays live all
  season without anyone reopening the workbook.

  🔴 HOME FIELD IS ZERO AT A DISPLACED VENUE. The workbook applies 65 Elo
  points at a team's own ground and nothing at an international or relocated
  one. nfl_neutral_2026.json holds the nine 2026 games that qualify. The live
  sim has no neutral handling at all and gives the Rams a full home edge
  against the 49ers in Melbourne in week 1; the shadow does not.

FROZEN MEANS FROZEN
  An entry that already carries a `shadow` block is never recomputed, only
  graded. New entries are priced with the state as it stands the day they
  appear. The state itself is rebuilt from scratch on every run -- pre-season
  ratings, then every graded result in the ledger replayed in date order --
  so the script is idempotent and a rerun cannot double-count a result.

  Brier is the ledger's own TWO-SIDED convention (brier2 in build_nfl_sim.py,
  which is twice the textbook figure), so `shadow_brier` sits on the same axis
  as `model_brier` and `market_brier` and the three can be read against each
  other. The harness's internal one-sided Brier is a different scale and is
  never mixed in here.

Usage:
    python scripts/predictions/build_nfl_shadow.py --self-test   # offline
    python scripts/predictions/build_nfl_shadow.py               # dry run
    python scripts/predictions/build_nfl_shadow.py --write
"""
import argparse, json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

PRED = os.path.join(ROOT, "public", "data", "nfl-predictions.json")
ELO_ASSET = os.path.join(HERE, "nfl_elo_2026.json")
NEUTRAL_ASSET = os.path.join(HERE, "nfl_neutral_2026.json")
TEAMS = os.path.join(ROOT, "public", "data", "nfl", "expectation", "teams.json")

VERSION = "points-v3-shadow"
SEASON = 2026
FIRST_TRAIN = 1999
LAST_TRAIN = 2025
MODE = "elo+epa"
DIV, HFA, K = 400.0, 65.0, 20.0


# ----------------------------------------------------------------- helpers

def logit(p, floor=1e-6):
    p = max(floor, min(1 - floor, p))
    return math.log(p / (1 - p))


def elo_prob(d_elo, own_ground):
    return 1.0 / (1.0 + 10 ** (-((d_elo + HFA * (1.0 if own_ground else 0.0)) / DIV)))


def mov_multiplier(margin, winner_elo_edge):
    return math.log(abs(margin) + 1.0) * (2.2 / (winner_elo_edge * 0.001 + 2.2))


def elo_update(elo_h, elo_a, own_ground, home_score, away_score):
    """Return (new_home, new_away) on the workbook's exact convention."""
    margin = home_score - away_score
    if margin == 0:
        return elo_h, elo_a
    p = elo_prob(elo_h - elo_a, own_ground)
    actual = 1.0 if margin > 0 else 0.0
    edge_home = (elo_h - elo_a) + (HFA if own_ground else 0.0)
    edge = edge_home if actual > 0.5 else -edge_home
    shift = K * (actual - p) * mov_multiplier(margin, edge)
    return elo_h + shift, elo_a - shift


def brier2(p_home, home_won):
    """The LIVE LEDGER's two-sided Brier, so shadow_brier is comparable with
    model_brier and market_brier. Not the harness's one-sided figure."""
    o = 1.0 if home_won else 0.0
    return (p_home - o) ** 2 + ((1 - p_home) - (1 - o)) ** 2


def slug_to_key(teams_blob):
    """Franchise key per slug, taking the most recent season's naming."""
    best = {}
    for r in teams_blob.get("rows", []):
        slug, key, season = r.get("slug"), r.get("key"), r.get("season") or 0
        if not slug or not key:
            continue
        if slug not in best or season > best[slug][1]:
            best[slug] = (key, season)
    return {s: v[0] for s, v in best.items()}


def shadow_pick(ph):
    return "H" if ph >= 0.5 else "A"


def collapse_weights(w):
    """Fold the `home` coefficient into the intercept, and say why.

    🔴 THE FITTED MODEL IS NOT IDENTIFIED IN `home`. Only the Super Bowls are
    neutral, so `home` is 1.0 on 99.6% of the 7,203 training rows and is very
    nearly collinear with the intercept. The fit lands on a cancelling pair,
    intercept +18.79 against home -18.75. At home=1 that sums to +0.04 and the
    model is fine, which is why the aggregate gate never noticed: about one
    graded game a season is neutral. At home=0 the intercept stands alone and
    the model returns a probability of 1.0000. The first thing this script
    priced was the Rams against the 49ers in Melbourne, and it priced it at
    certainty.

    Dropping `home` is NOT the fix. Re-running the gate without it costs real
    skill, -3.64% against the market rather than -3.15%, beating the backbone
    in 21 of 25 seasons rather than 24, because the term is carrying a genuine
    correction to the workbook's FLAT 65-point home field. Home advantage has
    not been flat: it has been falling for a century, which is this project's
    own published finding.

    So keep the fit and re-parameterise it. (w0 + w3) is the quantity the data
    actually determines; venue then enters only through the backbone, which
    already applies 65 Elo points at a team's own ground and none at a
    displaced one. At home=1 this is numerically IDENTICAL to the fitted
    model, so the gate result stands unchanged for 99.6% of the season. At a
    neutral site it is a principled extrapolation instead of a divide by a
    collinearity.
    """
    return [w[0] + w[3], w[1], w[2]]


# ------------------------------------------------------------ model state

def cache_gaps():
    """Which nflverse play-by-play seasons the rating replay needs and does
    not have. The cache is ~490 MB and gitignored, so it exists only where
    nfl_etl.py has run. The mini's nightly predictions job aborts the WHOLE
    run on any non-zero step, so a missing cache must never raise here."""
    d = os.path.join(ROOT, "data", "nfl", "pbp")
    return [y for y in range(FIRST_TRAIN, LAST_TRAIN + 1)
            if not os.path.exists(os.path.join(d, "play_by_play_%d.parquet" % y))]




def build_state(verbose=True):
    """Fit the gate-passing logistic on 1999-2025 and carry both rating
    systems into 2026. Returns a dict of everything the pricing needs."""
    import backtest_harness as BT

    seasons = list(range(FIRST_TRAIN, LAST_TRAIN + 1))
    ledger = BT.load_ledger(seasons)
    pbp_games, team_rows = BT.load_pbp_games(seasons)
    mapping, matched = BT.learn_mapping(ledger, pbp_games)
    if verbose:
        print("mapping: %d abbreviations, %d games reconciled 1:1"
              % (len(mapping), len(matched)))

    epa_by_game = defaultdict(dict)
    for r in team_rows:
        epa_by_game[r["game_id"]][r["team_ab"]] = r["off_epa"]

    stream = sorted(matched.values(), key=lambda t: (t[0]["date"], t[0]["game_id"]))
    ratings = BT.Ratings()
    rows = []
    current = None
    for p, g, flipped in stream:
        if g["season"] != current:
            if current is not None:
                ratings.season_rollover()
            current = g["season"]
        lh, la = g["home_key"], g["away_key"]
        lh_ab = p["away_ab"] if flipped else p["home_ab"]
        la_ab = p["home_ab"] if flipped else p["away_ab"]
        if ratings.ready(lh) and ratings.ready(la) and g["elo_ph"] is not None:
            rows.append((ratings.net(lh) - ratings.net(la),
                         0.0 if g["neutral"] else 1.0,
                         logit(g["elo_ph"]),
                         BT.outcome_value(g["result"])))
        epa = epa_by_game.get(p["game_id"], {})
        if lh_ab in epa and la_ab in epa:
            ratings.update_game(lh, la, epa[lh_ab], epa[la_ab])

    if len(rows) < 2000:
        sys.exit("FATAL: only %d training rows; the ledger or pbp cache is "
                 "incomplete and a logistic fitted on this would be junk" % len(rows))
    w = BT.fit_logistic([BT.feature_vector(MODE, f, h, el) for f, h, el, _ in rows],
                        [o for _, _, _, o in rows])
    if verbose:
        print("fitted %s on %d rows 1999-2025: w = [%s]"
              % (MODE, len(rows), ", ".join("%.4f" % x for x in w)))

    ratings.season_rollover()   # 1999-2025 done; carry EPA form into 2026

    elo_blob = json.load(open(ELO_ASSET, encoding="utf-8"))
    elo = dict(elo_blob["preseason_%d" % SEASON])
    if verbose:
        print("carried %d franchises into %d; EPA form rolled over" % (len(elo), SEASON))
    return {"w": list(w), "w_used": collapse_weights(list(w)),
            "ratings": ratings, "elo": elo, "mapping": mapping,
            "n_train": len(rows), "elo_meta": elo_blob.get("_meta", {}),
            "carry": elo_blob.get("carry", {})}


def price(state, home_key, away_key, own_ground):
    """The shadow's probability for one fixture, and its parts."""
    r = state["ratings"]
    feat = r.net(home_key) - r.net(away_key)
    p_elo = elo_prob(state["elo"].get(home_key, 1505.0) -
                     state["elo"].get(away_key, 1505.0), own_ground)
    c = state["w_used"]                       # see collapse_weights()
    z = c[0] + c[1] * logit(p_elo) + c[2] * feat
    return {"pH": round(1.0 / (1.0 + math.exp(-max(-30, min(30, z)))), 4),
            "elo_pH": round(p_elo, 4),
            "epa_net": round(feat, 5),
            "elo_home": round(state["elo"].get(home_key, 1505.0), 1),
            "elo_away": round(state["elo"].get(away_key, 1505.0), 1),
            "own_ground": bool(own_ground),
            "epa_ready": bool(r.ready(home_key) and r.ready(away_key))}


# --------------------------------------------------------------- the pass

def apply_shadow(blob, state, s2k, neutral_ids, today):
    """Freeze a shadow on every unpriced entry, grade every finished one, and
    replay results into the backbone as we go. Chronological, idempotent."""
    ledger = blob.get("ledger", [])
    added = graded = skipped = 0
    for e in sorted(ledger, key=lambda e: (e.get("date") or "", e.get("event_id") or "")):
        hk = s2k.get(e.get("home_slug"))
        ak = s2k.get(e.get("away_slug"))
        if not hk or not ak:
            skipped += 1
            e.setdefault("shadow", {"version": VERSION, "unpriced":
                                    "no franchise key for %s / %s"
                                    % (e.get("home_slug"), e.get("away_slug"))})
            continue
        own_ground = e.get("event_id") not in neutral_ids

        if "pH" not in (e.get("shadow") or {}):
            sh = price(state, hk, ak, own_ground)
            sh["version"] = VERSION
            sh["frozen_at"] = today
            sh["pick"] = shadow_pick(sh["pH"])
            e["shadow"] = sh
            added += 1

        res = e.get("result")
        if res in ("H", "A") and e.get("score"):
            sh = e["shadow"]
            if "pH" in sh and "brier" not in sh:
                hw = res == "H"
                sh["brier"] = round(brier2(sh["pH"], hw), 4)
                sh["pick_correct"] = (sh.get("pick") == res)
                graded += 1
            try:
                hs, as_ = (int(x) for x in str(e["score"]).split("-"))
            except (ValueError, TypeError):
                hs = as_ = None
            if hs is not None:
                state["elo"][hk], state["elo"][ak] = elo_update(
                    state["elo"].get(hk, 1505.0), state["elo"].get(ak, 1505.0),
                    own_ground, hs, as_)
    return added, graded, skipped


def shadow_record(ledger):
    g = [e for e in ledger
         if e.get("result") in ("H", "A") and "brier" in (e.get("shadow") or {})]
    if not g:
        return {"graded": 0, "pick_correct": 0, "brier": None,
                "vs_model": None, "vs_market": None}
    n = len(g)
    sb = sum(e["shadow"]["brier"] for e in g) / n
    mb = [e["model_brier"] for e in g if "model_brier" in e]
    kb = [e["market_brier"] for e in g if "market_brier" in e]
    rec = {"graded": n,
           "pick_correct": sum(1 for e in g if e["shadow"].get("pick_correct")),
           "brier": round(sb, 4),
           "vs_model": None, "vs_market": None}
    if mb:
        rec["vs_model"] = round(1 - sb / (sum(mb) / len(mb)), 5)
    if kb:
        rec["vs_market"] = round(1 - sb / (sum(kb) / len(kb)), 5)
    return rec


# ------------------------------------------------------------- self-test

def self_test():
    # the probability map and its inverse-ish update agree with the workbook
    assert abs(elo_prob(0.0, False) - 0.5) < 1e-12
    assert abs(elo_prob(0.0, True) - 0.5934) < 1e-3, elo_prob(0.0, True)
    assert abs(elo_prob(-27.0, False) - 0.4612) < 1e-3, "2022 London game"
    assert elo_prob(100.0, True) > elo_prob(100.0, False), "own ground must help"

    # the two-sided Brier is exactly twice the textbook one, which is the
    # whole reason it may not be mixed with the harness's figure
    assert abs(brier2(0.75, True) - 2 * (0.25 ** 2)) < 1e-12
    assert abs(brier2(0.5, True) - 0.5) < 1e-12
    assert brier2(0.9, True) < brier2(0.9, False)

    # logit round-trips, and clamps rather than exploding
    for p in (0.01, 0.5, 0.9999):
        assert abs(1 / (1 + math.exp(-logit(p))) - p) < 1e-6
    assert math.isfinite(logit(0.0)) and math.isfinite(logit(1.0))

    # a win moves the winner up and the loser down by the same amount, a tie
    # moves nothing, and a blowout moves less than three times a narrow win
    h, a = elo_update(1600.0, 1500.0, True, 24, 20)
    assert h > 1600 and a < 1500 and abs((h - 1600) + (a - 1500)) < 1e-9
    assert elo_update(1600.0, 1500.0, True, 20, 20) == (1600.0, 1500.0)
    narrow = elo_update(1500.0, 1500.0, True, 21, 20)[0] - 1500      # by 1
    blowout = elo_update(1500.0, 1500.0, True, 45, 10)[0] - 1500     # by 35
    # strictly more for a bigger win, but far less than proportionally more:
    # the damper is logarithmic, so 35x the margin buys about 5x the movement
    assert narrow < blowout, (narrow, blowout)
    assert blowout < 35 * narrow, "the damper is not damping"
    assert 4.5 < blowout / narrow < 6.0, blowout / narrow
    # an upset must move more than the same margin by a favourite
    up = elo_update(1400.0, 1700.0, True, 27, 20)[0] - 1400
    fav = elo_update(1700.0, 1400.0, True, 27, 20)[0] - 1700
    assert up > fav > 0, (up, fav)

    # collapsing the unidentified pair is EXACTLY the fitted model at home=1,
    # and stops it returning certainty at a neutral site
    raw = [18.7922, 0.6485, 1.9992, -18.7504]
    col = collapse_weights(raw)
    for el, ft in ((0.8, 0.04), (-1.2, -0.02), (0.0, 0.0)):
        z_raw = raw[0] + raw[1] * el + raw[2] * ft + raw[3] * 1.0
        z_col = col[0] + col[1] * el + col[2] * ft
        assert abs(z_raw - z_col) < 1e-12, "collapse changed a home-game price"
    z_neutral_raw = raw[0] + raw[1] * 0.3 + raw[2] * 0.05
    assert 1 / (1 + math.exp(-z_neutral_raw)) > 0.999, "the bug this guards is real"
    z_neutral_col = col[0] + col[1] * 0.3 + col[2] * 0.05
    assert 0.4 < 1 / (1 + math.exp(-z_neutral_col)) < 0.75, "neutral price still wild"

    # slug -> key takes the LATEST season's naming, not the first it sees
    s2k = slug_to_key({"rows": [
        {"slug": "tennessee-titans", "key": "Titans", "season": 2024},
        {"slug": "tennessee-titans", "key": "Oilers", "season": 1994},
        {"slug": "chicago-bears", "key": "Bears", "season": 1920}]})
    assert s2k["tennessee-titans"] == "Titans" and s2k["chicago-bears"] == "Bears"

    # freeze semantics: an entry that already carries a pH is never repriced,
    # and a neutral-site entry is priced without home field
    class FakeR:
        def net(self, t): return {"A": 0.10, "B": -0.05}.get(t, 0.0)
        def ready(self, t): return True
    state = {"w": [0.0, 1.0, 1.0, 0.0], "w_used": collapse_weights([0.0, 1.0, 1.0, 0.0]),
             "ratings": FakeR(), "elo": {"A": 1600.0, "B": 1500.0}, "mapping": {}}
    blob = {"ledger": [
        {"event_id": "1", "date": "2026-09-10", "home_slug": "a", "away_slug": "b"},
        {"event_id": "2", "date": "2026-09-11", "home_slug": "a", "away_slug": "b",
         "shadow": {"version": VERSION, "pH": 0.1234, "pick": "A"}},
        {"event_id": "3", "date": "2026-09-12", "home_slug": "zz", "away_slug": "b"}]}
    added, graded, skipped = apply_shadow(blob, state, {"a": "A", "b": "B"},
                                          {"1"}, "2026-09-02")
    assert added == 1 and skipped == 1, (added, graded, skipped)
    assert blob["ledger"][1]["shadow"]["pH"] == 0.1234, "a frozen pick was repriced"
    assert blob["ledger"][0]["shadow"]["own_ground"] is False, "neutral not honoured"
    assert blob["ledger"][0]["shadow"]["elo_pH"] < elo_prob(100.0, True)
    assert "unpriced" in blob["ledger"][2]["shadow"]

    # grading is idempotent and the record reads the ledger's own convention
    blob2 = {"ledger": [{"event_id": "1", "date": "2026-09-10", "home_slug": "a",
                         "away_slug": "b", "result": "H", "score": "24-20",
                         "model_brier": 0.5, "market_brier": 0.4,
                         "shadow": {"version": VERSION, "pH": 0.75, "pick": "H"}}]}
    st2 = {"w": [0.0, 1.0, 1.0, 0.0], "w_used": collapse_weights([0.0, 1.0, 1.0, 0.0]),
           "ratings": FakeR(), "elo": {"A": 1600.0, "B": 1500.0}, "mapping": {}}
    a1, g1, _ = apply_shadow(blob2, st2, {"a": "A", "b": "B"}, set(), "2026-09-20")
    a2, g2, _ = apply_shadow(blob2, st2, {"a": "A", "b": "B"}, set(), "2026-09-21")
    assert (a1, g1) == (0, 1) and (a2, g2) == (0, 0), "grading must not repeat"
    assert blob2["ledger"][0]["shadow"]["brier"] == 0.125
    rec = shadow_record(blob2["ledger"])
    assert rec["graded"] == 1 and rec["pick_correct"] == 1
    assert rec["vs_model"] == round(1 - 0.125 / 0.5, 5)
    assert rec["vs_market"] == round(1 - 0.125 / 0.4, 5)
    assert shadow_record([]) == {"graded": 0, "pick_correct": 0, "brier": None,
                                 "vs_model": None, "vs_market": None}
    # the cache check reports gaps rather than raising, which is what keeps a
    # missing cache from aborting the mini's whole predictions run
    g = cache_gaps()
    assert isinstance(g, list) and all(isinstance(y, int) for y in g)

    print("self-test OK: elo map, displaced venues, two-sided Brier, margin damper, "
          "weight identification, slug mapping, freeze semantics, idempotent grading, record maths")


# ------------------------------------------------------------------ main

def main():
    import datetime
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--today", default=None)
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return

    for path in (PRED, ELO_ASSET, NEUTRAL_ASSET, TEAMS):
        if not os.path.exists(path):
            sys.exit("FATAL: missing %s" % path)
    today = args.today or datetime.date.today().isoformat()

    blob = json.load(open(PRED, encoding="utf-8"))
    s2k = slug_to_key(json.load(open(TEAMS, encoding="utf-8")))
    neutral = set(json.load(open(NEUTRAL_ASSET, encoding="utf-8"))["neutral_event_ids"])
    print("ledger: %d entries, %d already carry a shadow"
          % (len(blob.get("ledger", [])),
             sum(1 for e in blob.get("ledger", []) if "pH" in (e.get("shadow") or {}))))
    print("neutral-site events this season: %d" % len(neutral))

    gaps = cache_gaps()
    if gaps:
        # Degrade loudly, and put the staleness in the DATA, not only in a log
        # nobody reads. Frozen shadows already in the ledger are untouched and
        # stay graded; only new pricing stops.
        msg = ("nflverse pbp cache missing %d season(s) (%s%s) - run "
               "scripts/predictions/nfl_etl.py on this machine. No new shadow "
               "prices this run; existing frozen picks are unaffected."
               % (len(gaps), ", ".join(str(g) for g in gaps[:5]),
                  ", ..." if len(gaps) > 5 else ""))
        print("NOTE: " + msg)
        sh = blob.setdefault("meta", {}).setdefault("shadow", {})
        sh["stale"] = {"since": today, "reason": msg}
        if args.write:
            with open(PRED, "w", encoding="utf-8", newline="") as f:
                json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
            print("recorded staleness in", PRED)
        return

    state = build_state()
    added, graded, skipped = apply_shadow(blob, state, s2k, neutral, today)
    print("priced %d new, graded %d, skipped %d" % (added, graded, skipped))

    rec = shadow_record(blob["ledger"])
    blob.setdefault("record", {})["shadow"] = rec
    blob.setdefault("meta", {})["shadow"] = {
        "version": VERSION, "mode": MODE,
        "weights_fitted": [round(x, 6) for x in state["w"]],
        "weights_used": [round(x, 6) for x in state["w_used"]],
        "identification": "the fitted `home` term is collinear with the intercept "
                          "(home is 1.0 on 99.6% of training rows), so the two are "
                          "folded into one constant and venue enters only through "
                          "the backbone. Identical to the fitted model at a home "
                          "ground; without it the nine international games price "
                          "at certainty",
        "trained_on": "%d-%d, %d games" % (FIRST_TRAIN, LAST_TRAIN, state["n_train"]),
        "gate": "elo+epa passed the walk-forward gate at -3.15% vs the closing "
                "market over 2001-2025, beating the backbone alone in 24 of 25 "
                "seasons; EPA alone failed at -6.10% and is not in here",
        "backbone": "NFL_all.xlsx century Elo, carried by the workbook's own "
                    "measured rules, NOT the live sim's point-margin model",
        "status": "shadow only; v2 keeps the live picks until the switch is "
                  "announced on the Ledger",
        "built_at": today,
    }
    blob["meta"]["shadow"].pop("stale", None)
    for e in blob["ledger"][:6]:
        sh = e.get("shadow") or {}
        if "pH" in sh:
            print("  %s %-24s vs %-24s v2 %.4f  v3 %.4f  (elo %.4f, epa %+0.4f%s)"
                  % (e["date"], e["home"], e["away"], e["model"]["pH"], sh["pH"],
                     sh["elo_pH"], sh["epa_net"],
                     ", NEUTRAL" if not sh["own_ground"] else ""))
    print("shadow record:", json.dumps(rec))
    if not args.write:
        print("\n(dry run; pass --write to update %s)" % PRED)
        return
    with open(PRED, "w", encoding="utf-8", newline="") as f:
        json.dump(blob, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", PRED)


if __name__ == "__main__":
    main()
