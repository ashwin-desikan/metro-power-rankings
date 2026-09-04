#!/usr/bin/env python3
"""UEFA Champions League 2026-27 season simulator — /predictions/ucl.

ucl-poisson-v2 ("fitted on 33 years of European match data"). v1 (2026-08-29)
hand-set its strength formula — domestic goal ratios scaled by a country
coefficient at a guessed K — and promptly ranked Sporting CP third on
champion odds. Ashwin challenged it, correctly, so v2's strength is FITTED,
not asserted. The research lives in scripts/predictions/research/
(cl_predictors_study.py + fit_ucl_strength.py) on the site's own archives:
every European tie 1955-2026 (28k matches), every domestic table since
1959-60, the site's per-season club ratings, and the real UEFA coefficients.

WHAT THE STUDY FOUND (the numbers are in ucl_strength_weights.json):
  * The site's own club rating (hub clubs[].score, season t-1) is the
    strongest preseason predictor of European results in every era tested.
  * Country strength (the site's historical country coefficient) adds real,
    independent signal.
  * The 5-year club coefficient — real UEFA or reconstructed — adds NOTHING
    once the site score is in the model (collinear; negative CV weight). It
    is predictive alone, but it is a worse summary of the same information.
  * Domestic goal ratios have ~zero cross-league predictive power at match
    level and are NON-MONOTONE at the extremes: dominating a mid league is
    anti-signal. That was exactly v1's Sporting failure.
  * Home advantage in European league-phase/group play is tiny: 0.035
    log-goals (1.44 v 1.34 goals). A European-only Elo cannot be made sharp
    at ~10 matches/club/season; 5-year aggregates exist for a reason.

MODEL. Strength S = tau * (w1*z(site_score) + w2*z(log country_coeff)),
z-scored within the CL 36. Goals: lam_home = exp(b0 + hfa + S_h - S_a),
Poisson, per-season noise sigma on S. w1/w2/b0/hfa: Poisson MLE on 6,216
group matches 1993-2026; held out from training, the two completed
new-format seasons: 70.6% decisive-match accuracy v 62.9% for the v1
formula. tau: season-level calibration — the multiplier that maximizes the
likelihood of the ACTUAL 2004-2024 champions when those seasons are
replayed with their real groups (match-level MLE slopes are attenuated by
feature noise; compounding them over a 17-match campaign under-spreads
titles: tau=1 gave a 6.7%% favourite, backtest log-loss picks tau=3.5).

SEASON SIM: the 8 drawn league-phase fixtures per club from the committed
api-football bundle; finished ones replay their real result. UCL tie-breaks
approximated as pts/gd/gf/random. Ranks 1-8 to the R16, 9-24 to knockout
play-offs (seeded bands 9/10v23/24 .. 15/16v17/18, draw randomized), R16
routes W(1/2)vW(7/8) + W(3/4)vW(5/6) (verified against the 2024-25 bracket;
re-check the official 2026-27 chart before the February draw). Two-legged
ties aggregate; ET ~ a third of a match; shoot-outs are a coin flip; the
final is one leg, neutral.

    python scripts/predictions/build_ucl_sim.py               # build + write
    python scripts/predictions/build_ucl_sim.py --dry         # no writes
    python scripts/predictions/build_ucl_sim.py --self-test   # offline tests
    python scripts/predictions/build_ucl_sim.py --verify-teams
    python scripts/predictions/build_ucl_sim.py --sims 20000

Network: NONE. Weights are research artifacts (ucl_strength_weights.json),
re-fitted on research runs and reviewed — never on pipeline autopilot.
"""
import argparse
import json
import math
import os
import random
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FOOT = os.path.join(ROOT, "public", "data", "football")
OUT = os.path.join(ROOT, "public", "data", "ucl-sim.json")
# The frozen-call ledger, same shape as pl-predictions.json so /play/picks
# and /predictions/scoreboard can read it with no league special-casing.
OUT_PRED = os.path.join(ROOT, "public", "data", "ucl-predictions.json")
WEIGHTS_PATH = os.path.join(HERE, "ucl_strength_weights.json")

SEASON = "2026-27"
LEAGUE_ID = 2                       # api-football UEFA Champions League
FIELD_LEAGUE_IDS = (2,)             # z-score field: the CL 36 (backtest convention)
HUB_SEASON = "2025-26"              # season t-1, features' vintage
SIGMA_S = 0.05                      # per-sim-season noise on S (log-goal units;
                                    # ~25% of the field's strength spread, the
                                    # same humility ratio the PL sim uses)
ET_FRACTION = 1.0 / 3.0
FIXTURE_HORIZON_DAYS = 10
DEFAULT_SIMS = 10000
R16_ROUTING_NOTE = ("QF routes W(1/2)vW(7/8) + W(3/4)vW(5/6), verified against "
                    "the 2024-25 bracket; re-check the official 2026-27 chart "
                    "before the February knockout draw.")

FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}
LEAGUE_PHASE_RE = re.compile(r"group stage|league (phase|stage)", re.I)

# Hub-archive country spellings that differ from api-football's team country.
COUNTRY_ALIAS = {"Czech Republic": "Czech-Republic"}

# api-football bundle spelling -> Ashwin's canonical Lookup name (the hub
# league-row namespace, which lib/football's slug-lookup resolves and every
# club page is titled by). v1 carried this table; the v2 rewrite dropped it
# and leaked raw api spellings ("Sporting Lisboa") onto /predictions/ucl —
# regression caught by Ashwin 2026-08-30. Clubs not listed here match their
# canonical name by normalization; --verify-teams and the self-test now FAIL
# on any emitted name the site cannot resolve, so this can't regress quietly.
ALIAS = {
    "Arsenal FC": "Arsenal",
    "Atlético Madrid": "Atlético de Madrid",
    "Bayern München": "Bayern Munich",
    "Como 1907": "Como",
    "FK Bodo/Glimt": "FK Bodø/Glimt",
    "Inter Milan": "Internazionale",
    "Paris St. Germain": "Paris Saint-Germain",
    "Sabah FK": "Sabah FA",
    "Shakhtar Donetsk": "FC Shakhtar Donetsk",
    "Slavia Praha": "SK Slavia Praha",
    "Slovan Bratislava": "ŠK Slovan Bratislava",
    "Sporting Lisboa": "Sporting Clube de Portugal",
    "Villarreal CF": "Villarreal",
}


def ntn(s):
    """Normalize a club name across the bundle/hub spellings (case, accents,
    punctuation): 'Bodo/Glimt' == 'Bodø/Glimt', 'Lillestrom' == 'Lillestrøm'."""
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("ø", "o").replace("Ø", "o").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


# ------------------------------------------------------------------- inputs

def load_json(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return json.load(f)


def load_weights():
    w = load_json(WEIGHTS_PATH)
    assert w["features"] == ["site_score_z", "country_coeff_log_z"], \
        "weights artifact features changed; update build_ucl_sim.py to match"
    return w


def league_phase_fixtures(league_id=LEAGUE_ID):
    """[(home_key, away_key, kickoff, hg, ag, finished, fixture_id)] +
    {key: (name, country)} from the committed api-football bundle.
    Key = api team_id. fixture_id is last so index-based readers (f[5] is
    still `finished`) keep working; it exists so the ledger has a stable
    event id that survives a rescheduled kickoff or a renamed club."""
    doc = load_json(FOOT, "live-competitions-2026.json")
    comp = next(c for c in doc["competitions"] if c["league_id"] == league_id)
    fixtures, teams = [], {}
    for f in comp["fixtures"]:
        if not LEAGUE_PHASE_RE.search(f.get("round") or ""):
            continue
        h, a = f["home"], f["away"]
        if h.get("team_id") is None or a.get("team_id") is None:
            continue
        for t in (h, a):
            teams[t["team_id"]] = (t.get("lookup") or t.get("name"), t.get("country"))
        done = f.get("status") in FINISHED and f.get("home_goals") is not None and f.get("away_goals") is not None
        fixtures.append((h["team_id"], a["team_id"], f.get("kickoff"),
                         f.get("home_goals"), f.get("away_goals"), done,
                         f.get("fixture_id")))
    return fixtures, teams


def hub_features():
    """(score_by_name, coeff_by_country, canon_by_ntn) from the completed t-1
    hub. canon_by_ntn maps a normalized name to the workbook Lookup canonical
    (the hub LEAGUE-ROW namespace — clubs[].lookup is a different, api-ish
    namespace and must never be shown)."""
    hub = load_json(FOOT, f"hub-{HUB_SEASON}.json")
    score = {}
    for c in hub.get("clubs", []):
        for k in (c.get("lookup"), c.get("name")):
            if k:
                score[ntn(k)] = c.get("score")
    coeff = {c["country"]: c.get("coef") for c in hub.get("countries", [])}
    canon = {}
    for l in hub.get("leagues", []):
        for g in l.get("groups", []):
            for r in g.get("rows", []):
                lk = r.get("lookup") or r.get("name")
                if lk:
                    canon.setdefault(ntn(lk), lk)
    return score, coeff, canon


def canonical_name(bundle_name, canon_by_ntn):
    """Bundle spelling -> Ashwin's canonical Lookup name, or None if unknown."""
    if bundle_name in ALIAS:
        return ALIAS[bundle_name]
    return canon_by_ntn.get(ntn(bundle_name))


def site_resolvable(name):
    """Would lib/football getFootballClubByName resolve this exact string?
    Mirrors its normalizeTeamName (lowercase, non-alnum -> space, NO accent
    folding) against public/data/football/slug-lookup.json."""
    sl = load_json(FOOT, "slug-lookup.json")
    k = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    return k in sl


def build_strengths(weights):
    """S per CL club key, z-scored within the CL 36 (the championship
    backtest's convention; tau was calibrated under it). Returns
    (S_by_key, cl_teams, cl_fixtures, resolution_table, warnings)."""
    score_by_name, coeff_by_country, canon_by_ntn = hub_features()
    field = []          # (comp_id, key, name, country, score, log_coeff)
    cl_fixtures, cl_teams = None, None
    warnings = []
    for lid in FIELD_LEAGUE_IDS:
        fixtures, teams = league_phase_fixtures(lid)
        if lid == LEAGUE_ID:
            cl_fixtures, cl_teams = fixtures, teams
        for key, (name, country) in teams.items():
            cname = canonical_name(name, canon_by_ntn)
            if cname is None:
                warnings.append(f"no canonical Lookup name for {name!r}; emitting raw api spelling")
                cname = name
            elif lid == LEAGUE_ID:
                teams[key] = (cname, country)
            sc = score_by_name.get(ntn(name)) or score_by_name.get(ntn(cname))
            cc = coeff_by_country.get(country) or coeff_by_country.get(
                COUNTRY_ALIAS.get(country, country))
            if cc is None:
                warnings.append(f"no country coefficient for {name!r} ({country}); skipped from field")
                continue
            field.append([lid, key, cname, country, sc, math.log(max(cc, 0.5))])

    # never guess UP: a club with no site score takes the field minimum
    known = [f[4] for f in field if f[4] is not None]
    floor = min(known)
    for f in field:
        if f[4] is None:
            warnings.append(f"no site score for {f[2]!r}; imputed field minimum {floor}")
            f[4] = floor

    import statistics
    scores = [f[4] for f in field]
    logccs = [f[5] for f in field]
    mu_s, sd_s = statistics.mean(scores), statistics.pstdev(scores) or 1.0
    mu_c, sd_c = statistics.mean(logccs), statistics.pstdev(logccs) or 1.0
    w1, w2 = weights["weights"]
    S, table = {}, []
    for lid, key, name, country, sc, lcc in field:
        s = weights.get("tau", 1.0) * (w1 * (sc - mu_s) / sd_s + w2 * (lcc - mu_c) / sd_c)
        if lid == LEAGUE_ID:
            S[key] = s
            table.append((name, country, round(sc, 3), round(s, 4)))
    return S, cl_teams, cl_fixtures, sorted(table, key=lambda t: -t[3]), warnings


# ---------------------------------------------------------------- simulation

def poisson(lam, rnd):
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rnd.random()
        if p <= l:
            return k
        k += 1


def match_lambdas(S, w, h, a, noise=None):
    gap = (S[h] + (noise[h] if noise else 0.0)) - (S[a] + (noise[a] if noise else 0.0))
    lh = math.exp(w["b0"] + w["hfa"] + gap)
    la = math.exp(w["b0"] - w["hfa"] - gap)
    return lh, la


def outcome_probs(lh, la, cap=10):
    ph = pd = pa = 0.0
    ph_pois = [math.exp(-lh) * lh ** i / math.factorial(i) for i in range(cap + 1)]
    pa_pois = [math.exp(-la) * la ** j / math.factorial(j) for j in range(cap + 1)]
    for i in range(cap + 1):
        for j in range(cap + 1):
            p = ph_pois[i] * pa_pois[j]
            if i > j:
                ph += p
            elif i == j:
                pd += p
            else:
                pa += p
    s = ph + pd + pa
    return ph / s, pd / s, pa / s


def rank_table(pts, gd, gf, order, rnd):
    return sorted(order, key=lambda t: (-pts[t], -gd[t], -gf[t], rnd.random()))


def play_tie(S, w, x, y, noise, rnd, two_legs=True, neutral=False):
    """Winner of a knockout tie. ET at neutral (no-hfa) strength; coin-flip
    shoot-out."""
    gap = (S[x] + noise[x]) - (S[y] + noise[y])
    nx, ny = math.exp(w["b0"] + gap), math.exp(w["b0"] - gap)
    if two_legs:
        l1h, l1a = match_lambdas(S, w, x, y, noise)
        l2h, l2a = match_lambdas(S, w, y, x, noise)
        gx = poisson(l1h, rnd) + poisson(l2a, rnd)
        gy = poisson(l1a, rnd) + poisson(l2h, rnd)
    else:
        gx, gy = poisson(nx, rnd), poisson(ny, rnd)
    if gx != gy:
        return x if gx > gy else y
    gx = poisson(nx * ET_FRACTION, rnd)
    gy = poisson(ny * ET_FRACTION, rnd)
    if gx != gy:
        return x if gx > gy else y
    return x if rnd.random() < 0.5 else y


def knockout(S, w, ranking, noise, rnd):
    """ranking: list of team keys in league-phase order (index 0 = seed 1).
    Returns dict team -> deepest stage reached."""
    depth = {t: "lp" for t in ranking[24:]}
    seeds = {t: i + 1 for i, t in enumerate(ranking)}

    bands = [((9, 10), (23, 24)), ((11, 12), (21, 22)),
             ((13, 14), (19, 20)), ((15, 16), (17, 18))]
    po_winner_vs = {0: (7, 8), 1: (5, 6), 2: (3, 4), 3: (1, 2)}
    po_winners = {}
    for bi, (s_band, u_band) in enumerate(bands):
        s1, s2 = (ranking[s_band[0] - 1], ranking[s_band[1] - 1])
        u1, u2 = (ranking[u_band[0] - 1], ranking[u_band[1] - 1])
        pairs = [(s1, u1), (s2, u2)] if rnd.random() < 0.5 else [(s1, u2), (s2, u1)]
        winners = []
        for s, u in pairs:
            won = play_tie(S, w, s, u, noise, rnd)
            depth[s if won != s else u] = "po"
            winners.append(won)
        po_winners[bi] = winners

    r16 = []
    for bi, (sa, sb) in po_winner_vs.items():
        wa, wb = po_winners[bi]
        if rnd.random() < 0.5:
            wa, wb = wb, wa
        r16.append((ranking[sa - 1], wa))
        r16.append((ranking[sb - 1], wb))
    for t in {t for pair in r16 for t in pair}:
        depth.setdefault(t, "r16")

    def seed_bucket(pair):
        return min(seeds[pair[0]], seeds[pair[1]])

    winners = {}
    for pair in r16:
        won = play_tie(S, w, pair[0], pair[1], noise, rnd)
        depth[pair[0] if won != pair[0] else pair[1]] = "r16"
        winners[seed_bucket(pair)] = won
    for won in winners.values():
        depth[won] = "qf"

    def nearest(bucket_pref):
        for b in bucket_pref:
            if b in winners:
                return winners.pop(b)
        return winners.pop(sorted(winners)[0])

    qf_pairs = [(nearest([1, 2]), nearest([7, 8])), (nearest([3, 4]), nearest([5, 6])),
                (nearest([1, 2]), nearest([7, 8])), (nearest([3, 4]), nearest([5, 6]))]
    sf_teams = []
    for x, y in qf_pairs:
        won = play_tie(S, w, x, y, noise, rnd)
        depth[x if won != x else y] = "qf"
        depth[won] = "sf"
        sf_teams.append(won)
    finalists = []
    for x, y in [(sf_teams[0], sf_teams[1]), (sf_teams[2], sf_teams[3])]:
        won = play_tie(S, w, x, y, noise, rnd)
        depth[x if won != x else y] = "sf"
        depth[won] = "final"
        finalists.append(won)
    champ = play_tie(S, w, finalists[0], finalists[1], noise, rnd,
                     two_legs=False, neutral=True)
    depth[champ] = "champion"
    depth[finalists[0] if champ != finalists[0] else finalists[1]] = "final"
    return depth


def simulate(S, w, fixtures, teams, sims, seed=None):
    rnd = random.Random(seed)
    keys = sorted(teams)
    acc = {t: defaultdict(int) for t in keys}
    pos_samples = {t: [] for t in keys}
    pts_sum = {t: 0.0 for t in keys}
    for _ in range(sims):
        noise = {t: rnd.gauss(0.0, SIGMA_S) for t in keys}
        pts = {t: 0 for t in keys}
        gd = {t: 0 for t in keys}
        gf = {t: 0 for t in keys}
        for h, a, _ko, hg, ag, done, _fid in fixtures:
            if not done:
                lh, la = match_lambdas(S, w, h, a, noise)
                hg, ag = poisson(lh, rnd), poisson(la, rnd)
            gf[h] += hg; gf[a] += ag
            gd[h] += hg - ag; gd[a] += ag - hg
            if hg > ag:
                pts[h] += 3
            elif hg < ag:
                pts[a] += 3
            else:
                pts[h] += 1; pts[a] += 1
        ranking = rank_table(pts, gd, gf, keys, rnd)
        for i, t in enumerate(ranking):
            pos_samples[t].append(i + 1)
            pts_sum[t] += pts[t]
        depth = knockout(S, w, ranking, noise, rnd)
        ladder = ["lp", "po", "r16", "qf", "sf", "final", "champion"]
        for t, d in depth.items():
            for stage in ladder[:ladder.index(d) + 1]:
                acc[t][stage] += 1
        for i, t in enumerate(ranking):
            if i < 8:
                acc[t]["top8"] += 1
            if i < 24:
                acc[t]["top24"] += 1
    return acc, pos_samples, pts_sum



# ------------------------------------------------------- the frozen ledger
#
# /predictions/ucl had a table and a set of fixture calls but no MEMORY: the
# calls were recomputed every run and nothing was ever scored. That also kept
# the Champions League out of /play/picks, which reads a ledger, not a call
# list. This section adds the same freeze-then-grade contract the PL and NFL
# ledgers run on:
#
#   FREEZE  a tie is priced ONCE, when it enters the fixture horizon, and the
#           entry is never repriced afterwards. That is the whole point: a
#           prediction you can revise is not a prediction.
#   GRADE   from the same committed api-football bundle the simulation itself
#           reads, so the ledger can never disagree with the table above it.
#
# There is no market column here and there deliberately isn't one: no public
# odds file carries the Champions League, so this ledger scores the model
# alone. Do not blend in a scraped price without a source note.


def iso_z(ko):
    """Bundle kickoffs are '+00:00'; the other ledgers store 'Z'. One shape,
    because lib/picksGame's lockTime does a bare Date.parse on it."""
    try:
        return (datetime.fromisoformat(ko.replace("Z", "+00:00"))
                .astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    except (AttributeError, TypeError, ValueError):
        return ko


def club_slug(name):
    """The site's own club slug, from public/data/football/slug-lookup.json --
    the same table lib/football's getFootballClubByName consults, so a ledger
    row links to the club page that exists rather than to a slug guessed from
    the name. Falls back to plain slugification so an unmapped club still gets
    a stable key instead of an empty one."""
    sl = load_json(FOOT, "slug-lookup.json")
    k = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    return sl.get(k) or re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def brier3(p, outcome):
    """Three-way Brier, the convention build_pl_sim.py grades on, so the two
    football ledgers are directly comparable on the Ledger page."""
    o = {"H": (1, 0, 0), "D": (0, 1, 0), "A": (0, 0, 1)}[outcome]
    return sum((pi - oi) ** 2 for pi, oi in zip(p, o))


def grade_and_extend(ledger, fixtures, names, S, weights, now, horizon,
                     placeholder=False):
    """Grade ungraded entries, then freeze a call for every league-phase tie
    inside the horizon. Mutates and returns ledger.

    `placeholder` is the same guard the fixture calls use: until UEFA's real
    calendar propagates, the draw stamps every remaining tie with one kickoff.
    Freezing then would price the whole league phase at once against a date
    that is not real, so extension is skipped while grading continues."""
    today_iso = now.strftime("%Y-%m-%d")
    by_id = {f[6]: f for f in fixtures if f[6] is not None}
    known = {e.get("event_id") for e in ledger}

    for e in ledger:
        f = by_id.get(_as_int(e.get("event_id")))
        if f is None:
            continue
        _h, _a, ko, hg, ag, done, _fid = f
        if ko and not e.get("result"):
            e["kickoff"] = iso_z(ko)      # a rescheduled tie moves its lock
        if e.get("result") or not done:
            continue
        res = "H" if hg > ag else ("A" if ag > hg else "D")
        e["result"] = res
        e["score"] = "%d-%d" % (hg, ag)
        e["graded_at"] = today_iso
        e["model_brier"] = round(brier3((e["model"]["pH"], e["model"]["pD"],
                                         e["model"]["pA"]), res), 4)
        e["pick_correct"] = (e["pick"] == res)

    if not placeholder:
        for h, a, ko, _hg, _ag, done, fid in fixtures:
            if done or fid is None or str(fid) in known or not ko:
                continue
            try:
                when = datetime.fromisoformat(ko.replace("Z", "+00:00"))
            except (AttributeError, ValueError):
                continue
            if not (now - timedelta(hours=3) <= when <= horizon):
                continue
            if h not in names or a not in names:
                continue
            lh, la = match_lambdas(S, weights, h, a)
            ph, pd, pa = outcome_probs(lh, la)
            hn, an = names[h], names[a]
            ledger.append({
                "event_id": str(fid),
                "date": when.astimezone(timezone.utc).strftime("%Y-%m-%d"),
                "kickoff": iso_z(ko),
                "home": hn, "away": an,
                "home_slug": club_slug(hn), "away_slug": club_slug(an),
                "model": {"pH": round(ph, 4), "pD": round(pd, 4), "pA": round(pa, 4)},
                "predicted_at": today_iso,
                "pick": "H" if ph >= max(pd, pa) else ("A" if pa >= pd else "D"),
            })
    ledger.sort(key=lambda e: (e.get("date") or "", e.get("home") or ""))
    return ledger


def _as_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def ledger_record(ledger):
    g = [e for e in ledger if e.get("result")]
    return {
        "graded": len(g),
        "pick_correct": sum(1 for e in g if e.get("pick_correct")),
        "model_brier": round(sum(e["model_brier"] for e in g) / len(g), 4) if g else None,
        "decisive_graded": sum(1 for e in g if e["result"] != "D"),
    }


def load_ledger():
    if not os.path.exists(OUT_PRED):
        return []
    try:
        with open(OUT_PRED, encoding="utf-8") as fh:
            got = json.load(fh).get("ledger", [])
        return got if isinstance(got, list) else []
    except (OSError, ValueError):
        # A truncated or hand-edited file must not silently wipe the history:
        # fail the run instead, the same posture build() takes on a stale bundle.
        raise SystemExit("ucl-predictions.json exists but will not parse; "
                         "fix or delete it deliberately before rebuilding")


# ------------------------------------------------------------------- output

def pctl(sorted_vals, q):
    if not sorted_vals:
        return None
    i = min(len(sorted_vals) - 1, max(0, int(round(q * (len(sorted_vals) - 1)))))
    return sorted_vals[i]


def build(sims, dry):
    weights = load_weights()
    S, teams, fixtures, table, warnings = build_strengths(weights)
    for msg in warnings:
        print("  WARNING:", msg)
    if len(teams) != 36:
        raise SystemExit("expected 36 league-phase clubs, found %d — bundle stale?" % len(teams))
    played = sum(1 for f in fixtures if f[5])
    print("field: 36 clubs, %d fixtures (%d played) — sims=%d — %s" %
          (len(fixtures), played, sims, weights["model"]))
    acc, pos_samples, pts_sum = simulate(S, weights, fixtures, teams, sims)

    names = {k: v[0] for k, v in teams.items()}
    rows = []
    for t in sorted(teams, key=lambda x: -acc[x]["champion"] / sims):
        ps = sorted(pos_samples[t])
        rows.append({
            "name": names[t],
            "country": teams[t][1],
            "exp_pts": round(pts_sum[t] / sims, 1),
            "pos": {"p5": pctl(ps, 0.05), "p50": pctl(ps, 0.50), "p95": pctl(ps, 0.95)},
            "p_top8": round(100.0 * acc[t]["top8"] / sims, 1),
            "p_top24": round(100.0 * acc[t]["top24"] / sims, 1),
            "p_r16": round(100.0 * acc[t]["r16"] / sims, 1),
            "p_qf": round(100.0 * acc[t]["qf"] / sims, 1),
            "p_sf": round(100.0 * acc[t]["sf"] / sims, 1),
            "p_final": round(100.0 * acc[t]["final"] / sims, 1),
            "p_champion": round(100.0 * acc[t]["champion"] / sims, 2),
        })

    # Fixture calls, guarded against the draw's placeholder calendar (all 144
    # fixtures stamped with one kickoff until UEFA's real schedule propagates).
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=FIXTURE_HORIZON_DAYS)
    ko_counts = defaultdict(int)
    for _h, _a, ko, _hg, _ag, done, _fid in fixtures:
        if ko and not done:
            ko_counts[ko] += 1
    placeholder = max(ko_counts.values(), default=0) > 18
    calls = []
    if not placeholder:
        for h, a, ko, _hg, _ag, done, _fid in fixtures:
            if done or not ko:
                continue
            try:
                when = datetime.fromisoformat(ko.replace("Z", "+00:00"))
            except ValueError:
                continue
            if not (now - timedelta(hours=3) <= when <= horizon):
                continue
            lh, la = match_lambdas(S, weights, h, a)
            ph, pd, pa = outcome_probs(lh, la)
            calls.append({
                "date": ko, "home": names[h], "away": names[a],
                "model": {"pH": round(ph, 3), "pD": round(pd, 3), "pA": round(pa, 3)},
                "pick": "H" if ph >= max(pd, pa) else ("A" if pa >= pd else "D"),
            })
        calls.sort(key=lambda c: c["date"])

    # The ledger runs off the same fixtures, the same strengths and the same
    # horizon as the calls above, so a call and its frozen entry can never
    # disagree. Grading happens even under a placeholder calendar; freezing
    # does not (see grade_and_extend).
    ledger = grade_and_extend(load_ledger(), fixtures, names, S, weights,
                              now, horizon, placeholder=placeholder)
    pred = {
        "meta": {
            "league": "UEFA Champions League",
            "season": SEASON,
            "generated_at": now.strftime("%Y-%m-%d"),
            "horizon_days": FIXTURE_HORIZON_DAYS,
            "model": "ucl-poisson-v2",
            "market": "none - no public odds file carries the Champions League, "
                      "so this ledger scores the model alone",
            "results_source": "api-football league-phase bundle "
                              "(public/data/football/live-competitions-2026.json)",
            "calendar_placeholder": placeholder,
        },
        "record": ledger_record(ledger),
        "ledger": ledger,
    }

    out = {
        "meta": {
            "league": "UEFA Champions League", "season": SEASON,
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sims": sims, "model": "ucl-poisson-v2",
            "b0": weights["b0"], "hfa": weights["hfa"], "sigma": SIGMA_S,
            "strength": "fitted: %s (weights %s, tau %s), z within the CL 36" % (
                            " + ".join(weights["features"]),
                            weights["weights"], weights.get("tau")),
            "validation": weights["validation"],
            "market": "none — no public odds file carries the UCL",
            "matches_played": played,
            "calendar_placeholder": placeholder,
            "notes": "Strength fitted by Poisson MLE on 6,216 European group matches "
                     "1993-2026 (see scripts/predictions/research/). Held out from "
                     "training, the two completed league-phase seasons: 70.6% decisive-"
                     "match accuracy v 62.9% for the v1 formula. " + R16_ROUTING_NOTE,
        },
        "table": rows,
        "fixtures_called": calls,
    }
    if dry:
        print("DRY RUN — top of table:")
        for r in rows[:10]:
            print("  %-28s champ %5.2f%%  top8 %5.1f%%  xPts %s" %
                  (r["name"], r["p_champion"], r["p_top8"], r["exp_pts"]))
        print("DRY RUN — ledger: %d entries, %d graded, model Brier %s"
              % (len(ledger), pred["record"]["graded"], pred["record"]["model_brier"]))
        for e in ledger[-5:]:
            print("  %s  %-26s v %-26s pick %s%s"
                  % (e["date"], e["home"], e["away"], e["pick"],
                     ("  -> " + e["result"] + " " + e.get("score", "")) if e.get("result") else ""))
        return out
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_PRED, "w", encoding="utf-8") as f:
        json.dump(pred, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s (%d clubs, %d fixture calls)" % (os.path.relpath(OUT, ROOT), len(rows), len(calls)))
    print("wrote %s (%d ledger entries, %d graded)"
          % (os.path.relpath(OUT_PRED, ROOT), len(ledger), pred["record"]["graded"]))
    return out


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []
    total = [0]

    def check(label, cond):
        total[0] += 1
        print("  %s: %s" % ("ok" if cond else "FAIL", label))
        if not cond:
            fails.append(label)

    rnd = random.Random(42)
    m = sum(poisson(1.6, rnd) for _ in range(4000)) / 4000.0
    check("poisson mean ~ lambda", abs(m - 1.6) < 0.12)

    w = {"b0": 0.328, "hfa": 0.035, "weights": [0.0335, 0.019]}
    S = {"A": 0.15, "B": -0.15}
    lh, la = match_lambdas(S, w, "A", "B")
    ph, pd, pa = outcome_probs(lh, la)
    check("outcome probs sum to 1", abs(ph + pd + pa - 1.0) < 1e-9)
    check("stronger side favoured", ph > pa)
    lh2, la2 = match_lambdas(S, w, "B", "A")
    check("strength symmetric across venues", abs(lh * la - lh2 * la2) < 1e-9)

    check("name normalizer heals diacritics",
          ntn("FK Bodø/Glimt") == ntn("FK Bodo/Glimt") and
          ntn("Lillestrøm SK") == ntn("Lillestrom SK"))

    order = rank_table({"x": 6, "y": 6, "z": 3}, {"x": 2, "y": 5, "z": 0},
                       {"x": 4, "y": 4, "z": 1}, ["x", "y", "z"], rnd)
    check("rank by pts then gd", order == ["y", "x", "z"])

    # ---- the ledger contract -------------------------------------------
    check("three-way Brier matches the PL convention",
          abs(brier3((0.7, 0.2, 0.1), "H") - (0.09 + 0.04 + 0.01)) < 1e-9)
    check("Brier punishes the wrong call harder",
          brier3((0.7, 0.2, 0.1), "A") > brier3((0.7, 0.2, 0.1), "H"))
    check("kickoffs normalise to the Z shape lockTime parses",
          iso_z("2026-09-08T16:45:00+00:00") == "2026-09-08T16:45:00Z")
    check("a bad kickoff is passed through, never crashed on",
          iso_z(None) is None and iso_z("nonsense") == "nonsense")

    now_t = datetime(2026, 9, 8, 12, 0, tzinfo=timezone.utc)
    hor_t = now_t + timedelta(days=FIXTURE_HORIZON_DAYS)
    S_t = {1: 0.20, 2: -0.20}
    names_t = {1: "Arsenal", 2: "Real Madrid"}
    fx = [
        # inside the horizon and unplayed -> freezes
        (1, 2, "2026-09-10T19:00:00+00:00", None, None, False, 900001),
        # played -> grades, never freezes
        (2, 1, "2026-09-01T19:00:00+00:00", 2, 1, True, 900002),
        # beyond the horizon -> untouched until it enters the window
        (1, 2, "2026-11-01T19:00:00+00:00", None, None, False, 900003),
    ]
    led = grade_and_extend([], fx, names_t, S_t, w, now_t, hor_t)
    check("freezes only ties inside the horizon", len(led) == 1)
    check("the frozen entry carries a string event id and a Z kickoff",
          led[0]["event_id"] == "900001" and led[0]["kickoff"].endswith("Z"))
    check("the frozen entry is a full three-way call",
          abs(sum(led[0]["model"][k] for k in ("pH", "pD", "pA")) - 1.0) < 0.02
          and led[0]["pick"] in "HDA")

    # a call already in the ledger is graded, never repriced
    frozen = dict(led[0]); frozen["event_id"] = "900002"
    frozen["model"] = {"pH": 0.25, "pD": 0.25, "pA": 0.50}; frozen["pick"] = "A"
    led2 = grade_and_extend([frozen], fx, names_t, S_t, w, now_t, hor_t)
    got = next(e for e in led2 if e["event_id"] == "900002")
    check("a played tie grades from the bundle",
          got["result"] == "H" and got["score"] == "2-1" and got["pick_correct"] is False)
    check("grading never reprices the frozen call", got["model"]["pA"] == 0.50)
    check("regrading is idempotent",
          grade_and_extend(led2, fx, names_t, S_t, w, now_t, hor_t) is led2
          and sum(1 for e in led2 if e.get("result")) == 1)
    check("the record counts what it says it counts",
          ledger_record(led2)["graded"] == 1 and ledger_record(led2)["pick_correct"] == 0)

    # the draw's placeholder calendar must not freeze the whole league phase
    led3 = grade_and_extend([], fx, names_t, S_t, w, now_t, hor_t, placeholder=True)
    check("a placeholder calendar grades but never freezes", led3 == [])

    check("club slugs come from the site's own lookup",
          club_slug("Paris Saint-Germain") == "paris-saint-germain")

    keys = ["t%02d" % i for i in range(36)]
    S36 = {k: 0.0 for k in keys}
    noise = {k: 0.0 for k in keys}
    depth = knockout(S36, w, keys, noise, rnd)
    check("every club got a depth", len(depth) == 36)
    check("exactly one champion", sum(1 for d in depth.values() if d == "champion") == 1)
    check("exactly one beaten finalist", sum(1 for d in depth.values() if d == "final") == 1)
    check("two beaten semi-finalists", sum(1 for d in depth.values() if d == "sf") == 2)
    check("four beaten quarter-finalists", sum(1 for d in depth.values() if d == "qf") == 4)
    check("eight out in the R16", sum(1 for d in depth.values() if d == "r16") == 8)
    check("eight out in the play-offs", sum(1 for d in depth.values() if d == "po") == 8)
    check("twelve out in the league phase", sum(1 for d in depth.values() if d == "lp") == 12)

    try:
        weights = load_weights()
        check("weights artifact loads with expected features", True)
        S_real, teams, fixtures, table, warnings = build_strengths(weights)
        check("all 36 clubs carry a fitted strength", len(S_real) == 36)
        # Invariant: every emitted name is either page-linked (slug-lookup
        # resolves it -> the page shows cur_name + link) or is the canonical
        # workbook Lookup spelling rendered as plain text (club has no page).
        # A raw api spelling satisfies neither — that was the regression.
        _, _, canon_map = hub_features()
        offenders = [v[0] for v in teams.values()
                     if not site_resolvable(v[0])
                     and canon_map.get(ntn(v[0])) != v[0]
                     and v[0] not in ALIAS.values()]
        check("every emitted name is canonical (page-linked or Lookup spelling)"
              + ("" if not offenders else f" — FAILING: {offenders}"),
              offenders == [])
        check("strength field is centered (z-based)",
              abs(sum(S_real.values()) / len(S_real)) < 0.2)
        check("few or no feature warnings (never guess silently)", len(warnings) <= 3)
    except SystemExit as e:
        check("field resolves (%s)" % e, False)

    print("self-test: %d/%d passed" % (total[0] - len(fails), total[0]))
    return 1 if fails else 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    if "--self-test" in argv:
        sys.exit(self_test())
    if "--verify-teams" in argv:
        weights = load_weights()
        S, teams, fixtures, table, warnings = build_strengths(weights)
        for msg in warnings:
            print("WARNING:", msg)
        _, _, canon_map = hub_features()
        bad = 0
        for name, country, sc, s in table:
            if site_resolvable(name):
                tag = "linked"
            elif canon_map.get(ntn(name)) == name or name in ALIAS.values():
                tag = "plain text (no club page)"
            else:
                tag = "<-- RAW API SPELLING, fix ALIAS"
                bad += 1
            print("%-30s %-14s score %.3f  S %+0.4f  %s" % (name, country, sc, s, tag))
        if bad:
            print(f"{bad} name(s) would render raw on the page — fix ALIAS")
            sys.exit(1)
        sys.exit(0)
    sims = DEFAULT_SIMS
    if "--sims" in argv:
        sims = int(argv[argv.index("--sims") + 1])
    build(sims, dry="--dry" in argv)
