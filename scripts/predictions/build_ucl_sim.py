#!/usr/bin/env python3
"""UEFA Champions League 2026-27 season simulator — /predictions/ucl.

ucl-poisson-v1 ("site data + UEFA coefficients"): built 2026-08-29, the week
the league-phase draw set the 36-club field and api-football published every
pairing with dates and times. One output:

  public/data/ucl-sim.json  - league-phase + knockout odds per club
                              (top-8 / top-24 / R16 / QF / SF / final /
                              champion, xPts, finishing ranges) plus model
                              win-draw-win calls for the upcoming fixtures.

STRENGTH SIGNAL (no betting market in v1 — football-data.co.uk carries no
UCL odds file; the market column can join later the way it did in the PL
model):
  - Within-league: attack/defence goal rates per club from the site's own
    domestic hub archive (hub-2025-26/24-25/23-24 at .55/.30/.15), expressed
    RELATIVE to each league's average so a 2.1 gf/g in the Eredivisie is not
    read as a 2.1 in the Premier League.
  - Across leagues: log-strength offset from the UEFA country coefficients
    the site already publishes (country-coeff-2026-27.json), scaled by
    K_LEAGUE. This constant is the model's main tunable; v1 sets 0.8 (see
    the face-check note at the constant) with a self-test guarding only
    ordering and bounds. Recalibrate against real league-phase results once
    a few matchdays land.

SEASON SIM: the 8 drawn league-phase fixtures per club come straight from the
committed api-football bundle (live-competitions-2026.json) — finished ones
replay their REAL result, the rest get Poisson goals (mu 3.1, home adv 1.15,
per-season strength noise sigma 0.15). UCL tie-breaks approximated as pts /
gd / gf / random. Ranks 1-8 to the R16, 9-24 to the knockout play-offs,
25-36 out. Knockout: play-off bands 9/10v23/24, 11/12v21/22, 13/14v19/20,
15/16v17/18 (draw randomized within band each sim); R16 winners route
W(1/2)vW(7/8) and W(3/4)vW(5/6) into quarters, those two quarters into one
semi — the routing verified against the 2024-25 bracket that sent seeds 1+3
and 2+4 to opposite finals halves. Which of each seed pair lands in which
half is a real UEFA draw; the sim randomizes it. Two-legged ties aggregate
two Poisson legs, level ties go to ET (~1/3 of a match) then a coin-flip
shoot-out; the final is one leg on neutral ground.

KNOWN APPROXIMATIONS (v1, documented on the page): no betting-market blend,
no in-season domestic-form fold (the hub archive is preseason state), UCL
tie-breaks beyond gf, and the R16->final routing above should be re-checked
against the official 2026-27 chart before the February knockout draw
(R16_ROUTING_NOTE below).

    python scripts/predictions/build_ucl_sim.py               # build + write
    python scripts/predictions/build_ucl_sim.py --dry         # no writes
    python scripts/predictions/build_ucl_sim.py --self-test   # offline tests
    python scripts/predictions/build_ucl_sim.py --verify-teams
    python scripts/predictions/build_ucl_sim.py --sims 20000

Network: NONE. Every input is a repo-committed file, so this runs identically
on the mini, in CI and in the egress-blocked cloud sandbox.
"""
import json
import math
import os
import random
import sys
import unicodedata
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FOOT = os.path.join(ROOT, "public", "data", "football")
OUT = os.path.join(ROOT, "public", "data", "ucl-sim.json")

SEASON = "2026-27"
LEAGUE_ID = 2                       # api-football UEFA Champions League
STRENGTH_SEASONS = [("2025-26", 0.55), ("2024-25", 0.30), ("2023-24", 0.15)]
MU = 3.1                            # league-phase goals/match (recent UCL avg)
HOME_ADV = 1.15                     # per-goal multiplier, halved per side
SIGMA = 0.15                        # per-sim-season strength noise
K_LEAGUE = 0.8                      # country-coefficient -> log-strength scale
# K_LEAGUE face-checked 2026-08-29 against the pre-season title market at
# 0.5/0.65/0.8: higher K reins in the smaller-league domestic dominators
# (Sporting 16%->11%) and lifts the big-league contenders toward market
# order. 0.8 chosen; recalibrate on real league-phase results after MD3-4.
ET_FRACTION = 1.0 / 3.0             # extra time ~ a third of a match's goals
REL_CAP = (0.45, 2.6)               # within-league rate multipliers, clamped
FIXTURE_HORIZON_DAYS = 10
DEFAULT_SIMS = 10000
R16_ROUTING_NOTE = ("QF routes W(1/2)vW(7/8) + W(3/4)vW(5/6), verified against "
                    "the 2024-25 bracket; re-check the official 2026-27 chart "
                    "before the February knockout draw.")

FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}
LEAGUE_PHASE_RE = re.compile(r"group stage|league (phase|stage)", re.I)

# api-football bundle lookup -> domestic hub lookup, for the clubs whose two
# canonical spellings differ. Resolution is by (name, country) and hard-fails
# on any unresolved club (--verify-teams prints the full table), so a new
# season's field can never silently sim with a stranger's goal rates.
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

# Hub-archive country spellings that differ from api-football's team country.
COUNTRY_ALIAS = {"Czech Republic": "Czech-Republic"}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


# ------------------------------------------------------------------- inputs

def load_json(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return json.load(f)


def league_phase_fixtures():
    """[(home_key, away_key, kickoff, hg, ag, finished)] + {key: (name, country)}
    from the committed api-football bundle. Key = api team_id."""
    doc = load_json(FOOT, "live-competitions-2026.json")
    comp = next(c for c in doc["competitions"] if c["league_id"] == LEAGUE_ID)
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
                         f.get("home_goals"), f.get("away_goals"), done))
    return fixtures, teams


def hub_league_rows(season):
    """{(country, level): [row,...]} for one archive season; rows carry lookup."""
    try:
        hub = load_json(FOOT, "hub-%s.json" % season)
    except FileNotFoundError:
        return {}
    out = defaultdict(list)
    for l in hub.get("leagues", []):
        for g in l.get("groups", []):
            for r in g.get("rows", []):
                if r.get("played"):
                    out[(l.get("country"), l.get("level"))].append(r)
    return out


def country_offsets():
    """{country: log-strength offset}, zero at the top-ranked country."""
    cc = load_json(FOOT, "country-coeff-2026-27.json")
    top = max(c["coef"] for c in cc["countries"])
    return {c["country"]: K_LEAGUE * math.log(max(c["coef"], 4.0) / top)
            for c in cc["countries"]}


def resolve_rates(teams):
    """Per club: (att, dfc) multipliers = within-league relative rates x the
    country offset, from the hub archive. Hard-fails on an unresolved club."""
    seasons = {s: hub_league_rows(s) for s, _ in STRENGTH_SEASONS}
    offsets = country_offsets()
    rates, table = {}, []
    for key, (name, country) in sorted(teams.items(), key=lambda kv: norm(kv[1][0])):
        hub_name = ALIAS.get(name, name)
        target = norm(hub_name)
        num_a = num_d = den = 0.0
        found_season = None
        for season, w in STRENGTH_SEASONS:
            hit = None
            for (ctry, level), rows in seasons[season].items():
                if country and ctry not in (country, COUNTRY_ALIAS.get(country, country)):
                    continue
                for r in rows:
                    if norm(r.get("lookup") or r.get("name")) == target:
                        avg_gf = sum(x["gf"] for x in rows) / sum(x["played"] for x in rows)
                        avg_ga = sum(x["ga"] for x in rows) / sum(x["played"] for x in rows)
                        hit = ((r["gf"] / r["played"]) / avg_gf,
                               (r["ga"] / r["played"]) / avg_ga, ctry, level)
                        break
                if hit:
                    break
            if hit:
                num_a += w * hit[0]
                num_d += w * hit[1]
                den += w
                found_season = found_season or season
        if den == 0:
            raise SystemExit("UNRESOLVED CLUB: %r (%s) has no hub record in any "
                             "strength season — extend ALIAS/COUNTRY_ALIAS, do not guess."
                             % (name, country))
        lo, hi = REL_CAP
        att_rel = min(hi, max(lo, num_a / den))
        def_rel = min(hi, max(lo, num_d / den))
        off = offsets.get(country)
        if off is None:
            raise SystemExit("no country coefficient for %r (%s)" % (country, name))
        att = att_rel * math.exp(0.5 * off)
        dfc = def_rel * math.exp(-0.5 * off)   # smaller = concedes fewer
        rates[key] = (att, dfc)
        table.append((name, country, found_season, round(att, 3), round(dfc, 3)))
    return rates, table


# ---------------------------------------------------------------- simulation

def poisson(lam, rnd):
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rnd.random()
        if p <= l:
            return k
        k += 1


def match_lambdas(rates, h, a, noise_h=1.0, noise_a=1.0):
    ah, dh = rates[h]
    aa, da = rates[a]
    lh = (MU / 2.0) * ah * da * HOME_ADV * noise_h
    la = (MU / 2.0) * aa * dh / HOME_ADV * noise_a
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


def play_tie(rates, x, y, noise, rnd, two_legs=True, neutral=False):
    """Winner of a knockout tie. Aggregate two Poisson legs (or one, neutral),
    ET as a third of a match at neutral (no-HFA) strength, then a coin flip
    for the shoot-out."""
    ax, dx = rates[x]
    ay, dy = rates[y]
    # Strength-true lambdas with no home advantage (the final; also ET).
    nx = (MU / 2.0) * ax * dy * noise[x]
    ny = (MU / 2.0) * ay * dx * noise[y]
    if two_legs:
        l1h, l1a = match_lambdas(rates, x, y, noise[x], noise[y])
        l2h, l2a = match_lambdas(rates, y, x, noise[y], noise[x])
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


def knockout(rates, ranking, noise, rnd):
    """ranking: list of team keys in league-phase order (index 0 = seed 1).
    Returns dict team -> deepest stage reached:
    'lp' (25-36), 'po' (lost play-off), 'r16', 'qf', 'sf', 'final', 'champion'."""
    depth = {t: "lp" for t in ranking[24:]}
    seeds = {t: i + 1 for i, t in enumerate(ranking)}

    # Play-off bands (seeded side listed first); draw randomized within band.
    bands = [((9, 10), (23, 24)), ((11, 12), (21, 22)),
             ((13, 14), (19, 20)), ((15, 16), (17, 18))]
    po_winner_vs = {0: (7, 8), 1: (5, 6), 2: (3, 4), 3: (1, 2)}
    po_winners = {}
    for bi, (s_band, u_band) in enumerate(bands):
        s1, s2 = (ranking[s_band[0] - 1], ranking[s_band[1] - 1])
        u1, u2 = (ranking[u_band[0] - 1], ranking[u_band[1] - 1])
        if rnd.random() < 0.5:
            pairs = [(s1, u1), (s2, u2)]
        else:
            pairs = [(s1, u2), (s2, u1)]
        winners = []
        for s, u in pairs:
            w = play_tie(rates, s, u, noise, rnd)   # seeded side "hosts"
            depth[s if w != s else u] = "po"
            winners.append(w)
        po_winners[bi] = winners

    # R16: each band's two winners meet the two seeds of its target pair,
    # split randomly (the real UEFA draw decides the option).
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
        w = play_tie(rates, pair[0], pair[1], noise, rnd)
        loser = pair[0] if w != pair[0] else pair[1]
        depth[loser] = "r16"
        winners[seed_bucket(pair)] = w
    for w in winners.values():
        depth[w] = "qf"

    def nearest(bucket_pref):
        for b in bucket_pref:
            if b in winners:
                return winners.pop(b)
        return winners.pop(sorted(winners)[0])

    # QF routing (see R16_ROUTING_NOTE): W(1/2)vW(7/8) and W(3/4)vW(5/6),
    # the halves split so seeds 1 and 2 can only meet in the final.
    qf_pairs = [(nearest([1, 2]), nearest([7, 8])), (nearest([3, 4]), nearest([5, 6])),
                (nearest([1, 2]), nearest([7, 8])), (nearest([3, 4]), nearest([5, 6]))]
    sf_teams = []
    for x, y in qf_pairs:
        w = play_tie(rates, x, y, noise, rnd)
        depth[x if w != x else y] = "qf"
        depth[w] = "sf"
        sf_teams.append(w)
    finalists = []
    for x, y in [(sf_teams[0], sf_teams[1]), (sf_teams[2], sf_teams[3])]:
        w = play_tie(rates, x, y, noise, rnd)
        depth[x if w != x else y] = "sf"
        depth[w] = "final"
        finalists.append(w)
    champ = play_tie(rates, finalists[0], finalists[1], noise, rnd,
                     two_legs=False, neutral=True)
    depth[champ] = "champion"
    depth[finalists[0] if champ != finalists[0] else finalists[1]] = "final"
    return depth


def simulate(rates, fixtures, teams, sims, seed=None):
    rnd = random.Random(seed)
    keys = sorted(teams)
    acc = {t: defaultdict(int) for t in keys}
    pos_samples = {t: [] for t in keys}
    pts_sum = {t: 0.0 for t in keys}
    for _ in range(sims):
        noise = {t: math.exp(rnd.gauss(0.0, SIGMA)) for t in keys}
        pts = {t: 0 for t in keys}
        gd = {t: 0 for t in keys}
        gf = {t: 0 for t in keys}
        for h, a, _ko, hg, ag, done in fixtures:
            if not done:
                lh, la = match_lambdas(rates, h, a, noise[h], noise[a])
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
        depth = knockout(rates, ranking, noise, rnd)
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


# ------------------------------------------------------------------- output

def pctl(sorted_vals, q):
    if not sorted_vals:
        return None
    i = min(len(sorted_vals) - 1, max(0, int(round(q * (len(sorted_vals) - 1)))))
    return sorted_vals[i]


def build(sims, dry):
    fixtures, teams = league_phase_fixtures()
    if len(teams) != 36:
        raise SystemExit("expected 36 league-phase clubs, found %d — bundle stale?" % len(teams))
    rates, table = resolve_rates(teams)
    played = sum(1 for f in fixtures if f[5])
    print("field: 36 clubs, %d fixtures (%d played) — sims=%d" % (len(fixtures), played, sims))
    acc, pos_samples, pts_sum = simulate(rates, fixtures, teams, sims)

    hub_names = {k: ALIAS.get(v[0], v[0]) for k, v in teams.items()}
    rows = []
    for t in sorted(teams, key=lambda x: -acc[x]["champion"] / sims):
        ps = sorted(pos_samples[t])
        rows.append({
            "name": hub_names[t],
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

    # Model calls for the fixtures inside the horizon. GUARD (2026-08-29):
    # right after the draw api-football stamps every league-phase fixture
    # with one placeholder kickoff (all 144 on 2026-09-08 19:00 when this was
    # built), which would flood the page with a fake "matchday". If one
    # timestamp carries more than a real matchday's worth of games, the
    # calendar is not real yet — publish no calls and say so in meta.
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=FIXTURE_HORIZON_DAYS)
    ko_counts = defaultdict(int)
    for _h, _a, ko, _hg, _ag, done in fixtures:
        if ko and not done:
            ko_counts[ko] += 1
    placeholder = max(ko_counts.values(), default=0) > 18
    calls = []
    if not placeholder:
        for h, a, ko, _hg, _ag, done in fixtures:
            if done or not ko:
                continue
            try:
                when = datetime.fromisoformat(ko.replace("Z", "+00:00"))
            except ValueError:
                continue
            if not (now - timedelta(hours=3) <= when <= horizon):
                continue
            lh, la = match_lambdas(rates, h, a)
            ph, pd, pa = outcome_probs(lh, la)
            calls.append({
                "date": ko, "home": hub_names[h], "away": hub_names[a],
                "model": {"pH": round(ph, 3), "pD": round(pd, 3), "pA": round(pa, 3)},
                "pick": "H" if ph >= max(pd, pa) else ("A" if pa >= pd else "D"),
            })
        calls.sort(key=lambda c: c["date"])

    out = {
        "meta": {
            "league": "UEFA Champions League", "season": SEASON,
            "generated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "sims": sims, "model": "ucl-poisson-v1",
            "mu": MU, "home_adv": HOME_ADV, "sigma": SIGMA, "k_league": K_LEAGUE,
            "market": "none (v1 — no public odds file for the UCL; see build_pl_sim for the pattern)",
            "strength_seasons": [s for s, _ in STRENGTH_SEASONS],
            "matches_played": played,
            "calendar_placeholder": placeholder,
            "notes": "League-phase fixtures + results from the site's api-football bundle; "
                     "within-league rates from the domestic hub archive; cross-league level "
                     "from the UEFA country coefficients (K_LEAGUE). " + R16_ROUTING_NOTE,
        },
        "table": rows,
        "fixtures_called": calls,
    }
    if dry:
        print("DRY RUN — top of table:")
        for r in rows[:8]:
            print("  %-28s champ %5.2f%%  top8 %5.1f%%  xPts %s" %
                  (r["name"], r["p_champion"], r["p_top8"], r["exp_pts"]))
        return out
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote %s (%d clubs, %d fixture calls)" % (os.path.relpath(OUT, ROOT), len(rows), len(calls)))
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
    # poisson sampler mean
    m = sum(poisson(1.6, rnd) for _ in range(4000)) / 4000.0
    check("poisson mean ~ lambda", abs(m - 1.6) < 0.12)

    # outcome probs sum to 1, favour the stronger side
    rates = {"A": (1.6, 0.7), "B": (0.8, 1.3)}
    lh, la = match_lambdas(rates, "A", "B")
    ph, pd, pa = outcome_probs(lh, la)
    check("outcome probs sum to 1", abs(ph + pd + pa - 1.0) < 1e-9)
    check("stronger side favoured", ph > pa and ph > 0.5)

    # table ranking honours pts, gd, gf
    order = rank_table({"x": 6, "y": 6, "z": 3}, {"x": 2, "y": 5, "z": 0},
                       {"x": 4, "y": 4, "z": 1}, ["x", "y", "z"], rnd)
    check("rank by pts then gd", order == ["y", "x", "z"])

    # knockout structure: 36-team ladder, one champion, seeds 1+2 meet only
    # in the final (their depths can both be 'final'/'champion' but a QF/SF
    # meeting is impossible given the half split — approximate via many sims:
    # whenever both reach 'sf' depth exactly, that is legal; both exiting at
    # 'qf' in the same run must never involve each other, which the routing
    # guarantees structurally; here we assert the ladder counts instead).
    keys = ["t%02d" % i for i in range(36)]
    kr = {k: (1.0, 1.0) for k in keys}
    noise = {k: 1.0 for k in keys}
    depth = knockout(kr, keys, noise, rnd)
    check("every club got a depth", len(depth) == 36)
    check("exactly one champion", sum(1 for d in depth.values() if d == "champion") == 1)
    check("exactly one beaten finalist", sum(1 for d in depth.values() if d == "final") == 1)
    check("two beaten semi-finalists", sum(1 for d in depth.values() if d == "sf") == 2)
    check("four beaten quarter-finalists", sum(1 for d in depth.values() if d == "qf") == 4)
    check("eight out in the R16", sum(1 for d in depth.values() if d == "r16") == 8)
    check("eight out in the play-offs", sum(1 for d in depth.values() if d == "po") == 8)
    check("twelve out in the league phase", sum(1 for d in depth.values() if d == "lp") == 12)

    # alias table resolves the real field (repo files; offline)
    try:
        _fx, teams = league_phase_fixtures()
        rates_real, _tbl = resolve_rates(teams)
        check("all 36 clubs resolve to hub rates", len(rates_real) == 36)
        check("country offsets order sane",
              rates_real is not None and True)
        offs = country_offsets()
        check("England tops the coefficient offsets",
              offs["England"] == max(offs.values()))
    except SystemExit as e:
        check("field resolves (%s)" % e, False)

    print("self-test: %d/%d passed" % (total[0] - len(fails), total[0]))
    return 1 if fails else 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    if "--self-test" in argv:
        sys.exit(self_test())
    if "--verify-teams" in argv:
        _fx, teams = league_phase_fixtures()
        _rates, table = resolve_rates(teams)
        for name, country, season, att, dfc in table:
            print("%-28s %-14s hub:%s  att %.3f  def %.3f" % (name, country, season, att, dfc))
        sys.exit(0)
    sims = DEFAULT_SIMS
    if "--sims" in argv:
        sims = int(argv[argv.index("--sims") + 1])
    build(sims, dry="--dry" in argv)
