#!/usr/bin/env python3
"""Premier League 2026-27 season simulator + fixture predictions + ledger.

poisson-v2 ("site data + market"): the /predictions/pl model. Three outputs
from one run:
  public/data/pl-sim.json          - season odds (title/top5/top7/releg/xPts)
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
per-season strength noise sigma=0.15 (the humility layer). PL tie-breaks.

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
"""
import io
import json
import math
import os
import random
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
HUBS = os.path.join(ROOT, "public", "data", "football")
OUT_SIM = os.path.join(ROOT, "public", "data", "pl-sim.json")
OUT_PRED = os.path.join(ROOT, "public", "data", "pl-predictions.json")

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
    req = urllib.request.Request(url, headers={"User-Agent": "CitizenOfNowhere/1.0"})
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


def _odds_triplet(row):
    for pre in ("Avg", "B365", "PS"):
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


def match_lambdas(rates, mu, h, a):
    att = {t: rates[t][0] / mu for t in rates}
    dfc = {t: rates[t][1] / mu for t in rates}
    return (mu * HOME_ADV * att[h] * dfc[a], mu * (2 - HOME_ADV) * att[a] * dfc[h])


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


def remaining_fixtures(played_pairs):
    out = []
    for h in TEAMS_2026_27:
        for a in TEAMS_2026_27:
            if h != a and (h, a) not in played_pairs:
                out.append((h, a))
    return out


def _tally():
    return {"pts": 0.0, "title": 0, "top5": 0, "top7": 0, "releg": 0, "pos": defaultdict(int)}


def simulate(rates, mu, sims, base, fixtures, seed=20262027):
    """base: {team: (pts, gd, gf)} actual standings so far."""
    try:
        import numpy as np  # noqa: F401
        return _simulate_numpy(rates, mu, sims, base, fixtures, seed)
    except ImportError:
        return _simulate_py(rates, mu, sims, base, fixtures, seed)


def _fix_lams(rates, mu, fixtures):
    return [(h, a) + match_lambdas(rates, mu, h, a) for h, a in fixtures]


def _simulate_py(rates, mu, sims, base, fixtures, seed):
    rng = random.Random(seed)
    teams = sorted(rates)
    fl = _fix_lams(rates, mu, fixtures)
    acc = {t: _tally() for t in teams}
    for _ in range(sims):
        nA = {t: math.exp(rng.gauss(0.0, SIGMA)) for t in teams}
        nD = {t: math.exp(rng.gauss(0.0, SIGMA)) for t in teams}
        pts = {t: base[t][0] for t in teams}
        gd = {t: base[t][1] for t in teams}
        gf = {t: base[t][2] for t in teams}
        for h, a, lh, la in fl:
            x = poisson(lh * nA[h] * nD[a], rng)
            y = poisson(la * nA[a] * nD[h], rng)
            gd[h] += x - y; gd[a] += y - x; gf[h] += x; gf[a] += y
            if x > y: pts[h] += 3
            elif y > x: pts[a] += 3
            else: pts[h] += 1; pts[a] += 1
        order = sort_table([[t, pts[t], gd[t], gf[t]] for t in teams], rng)
        for pos, t in enumerate(order, 1):
            a2 = acc[t]
            a2["pts"] += pts[t]; a2["pos"][pos] += 1
            if pos == 1: a2["title"] += 1
            if pos <= 5: a2["top5"] += 1
            if pos <= 7: a2["top7"] += 1
            if pos >= 18: a2["releg"] += 1
    return teams, acc


def _simulate_numpy(rates, mu, sims, base, fixtures, seed):
    import numpy as np
    rng_np = np.random.default_rng(seed)
    rng = random.Random(seed)
    teams = sorted(rates)
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    fl = _fix_lams(rates, mu, fixtures)
    lh = np.array([f[2] for f in fl]); la = np.array([f[3] for f in fl])
    hi = np.array([idx[f[0]] for f in fl], dtype=int)
    ai = np.array([idx[f[1]] for f in fl], dtype=int)
    b_pts = np.array([base[t][0] for t in teams])
    b_gd = np.array([base[t][1] for t in teams])
    b_gf = np.array([base[t][2] for t in teams])
    acc = {t: _tally() for t in teams}
    B = 500
    done = 0
    while done < sims:
        b = min(B, sims - done)
        nA = np.exp(rng_np.normal(0.0, SIGMA, (n, b)))
        nD = np.exp(rng_np.normal(0.0, SIGMA, (n, b)))
        X = rng_np.poisson(lh[:, None] * nA[hi, :] * nD[ai, :]) if len(fl) else np.zeros((0, b), dtype=int)
        Y = rng_np.poisson(la[:, None] * nA[ai, :] * nD[hi, :]) if len(fl) else np.zeros((0, b), dtype=int)
        for s in range(b):
            x, y = X[:, s], Y[:, s]
            pts = b_pts.copy(); gd = b_gd.copy(); gf = b_gf.copy()
            if len(fl):
                hw = x > y; aw = y > x; dr = x == y
                np.add.at(pts, hi[hw], 3); np.add.at(pts, ai[aw], 3)
                np.add.at(pts, hi[dr], 1); np.add.at(pts, ai[dr], 1)
                np.add.at(gd, hi, x - y); np.add.at(gd, ai, y - x)
                np.add.at(gf, hi, x); np.add.at(gf, ai, y)
            order = sort_table([[t, int(pts[idx[t]]), int(gd[idx[t]]), int(gf[idx[t]])] for t in teams], rng)
            for pos, t in enumerate(order, 1):
                a2 = acc[t]
                a2["pts"] += int(pts[idx[t]]); a2["pos"][pos] += 1
                if pos == 1: a2["title"] += 1
                if pos <= 5: a2["top5"] += 1
                if pos <= 7: a2["top7"] += 1
                if pos >= 18: a2["releg"] += 1
        done += b
    return teams, acc


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
    {(fd_home, fd_away): 'H'|'D'|'A'}."""
    played, results = [], {}
    for r in rows or []:
        try:
            hg, ag = int(r["FTHG"]), int(r["FTAG"])
        except (KeyError, ValueError, TypeError):
            continue
        h, a = r["HomeTeam"].strip(), r["AwayTeam"].strip()
        played.append((hub_name(h), hub_name(a), hg, ag))
        results[(h, a)] = r.get("FTR") or ("H" if hg > ag else "A" if ag > hg else "D")
    return played, results


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


def espn_fixtures(today, horizon_days):
    """Upcoming PL fixtures within the horizon: [(iso_date, home, away)]."""
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
            out.append((ev.get("date", "")[:10], home, away))
    return sorted(set(out))


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


def grade_and_extend(ledger, results, upcoming, rates, mu, mkt_fix, today_iso):
    """Grade ungraded ledger entries against results; append new predictions
    for upcoming fixtures not yet in the ledger. Mutates + returns ledger."""
    known = {(e["home"], e["away"]) for e in ledger}
    for e in ledger:
        if e.get("result"):
            continue
        res = results.get((fd_name(e["home"]), fd_name(e["away"])))
        if res:
            e["result"] = res
            e["graded_at"] = today_iso
            e["model_brier"] = round(brier((e["model"]["pH"], e["model"]["pD"], e["model"]["pA"]), res), 4)
            if e.get("market"):
                e["market_brier"] = round(brier((e["market"]["pH"], e["market"]["pD"], e["market"]["pA"]), res), 4)
            b = e.get("blend") or e["model"]
            e["blend_brier"] = round(brier((b["pH"], b["pD"], b["pA"]), res), 4)
            e["pick_correct"] = (e["pick"] == res)
    for iso, h, a in upcoming:
        if (h, a) in known:
            continue
        pH, pD, pA = match_probs(rates, mu, h, a)
        entry = {
            "date": iso, "home": h, "away": a,
            "home_slug": slugify(h), "away_slug": slugify(a),
            "model": {"pH": round(pH, 4), "pD": round(pD, 4), "pA": round(pA, 4)},
            "predicted_at": today_iso,
        }
        mk = mkt_fix.get((h, a))
        if mk:
            entry["market"] = {"pH": round(mk[0], 4), "pD": round(mk[1], 4), "pA": round(mk[2], 4)}
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
    teams, acc = simulate(rates_b, mu, sims, base, fixtures)

    table = []
    for t in teams:
        a = acc[t]
        pd_ = a["pos"]
        table.append({
            "slug": slugify(t), "name": t,
            "exp_pts": round(a["pts"] / sims, 1),
            "p_title": round(100.0 * a["title"] / sims, 2),
            "p_top5": round(100.0 * a["top5"] / sims, 2),
            "p_top7": round(100.0 * a["top7"] / sims, 2),
            "p_releg": round(100.0 * a["releg"] / sims, 2),
            "pos": {"p5": percentile(pd_, sims, 0.05), "p25": percentile(pd_, sims, 0.25),
                    "p50": percentile(pd_, sims, 0.50), "p75": percentile(pd_, sims, 0.75),
                    "p95": percentile(pd_, sims, 0.95)},
        })
    table.sort(key=lambda r: (-r["p_title"], -r["exp_pts"]))
    assert len(table) == 20, "expected 20 teams"
    s = sum(r["p_title"] for r in table)
    assert abs(s - 100.0) < 1.0, "p_title sums to %.2f" % s

    sim_doc = {
        "meta": {
            "league": "premier-league", "season": SEASON,
            "generated_at": today_iso, "sims": sims, "model": "poisson-v2",
            "mu": round(mu, 4), "home_adv": HOME_ADV, "sigma": SIGMA,
            "market": market_note, "blend_market_weight": MARKET_W,
            "odds_source": "football-data.co.uk closing/posted odds (E0/E1)",
            "promoted_calibration": {"att": round(att_f, 3), "def": round(def_f, 3), "n": ncal},
            "strength_seasons": [x for x, _ in STRENGTH_SEASONS],
            "matches_played": len(played),
            "notes": "Site-data goal rates blended with market-implied team "
                     "ratings; actual results folded in and only the remaining "
                     "fixtures simulated.",
        },
        "table": table,
    }

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
            first = min(d for d, _, _ in far)
            cutoff = (datetime.strptime(first, "%Y-%m-%d") + timedelta(days=4)).strftime("%Y-%m-%d")
            upcoming = [f for f in far if f[0] <= cutoff]
    mkt_fix = fixtures_market(fix_rows)
    ledger = grade_and_extend(ledger, results, upcoming, rates_b, mu, mkt_fix, today_iso)
    pred_doc = {
        "meta": {"season": SEASON, "generated_at": today_iso,
                 "match_blend_weight": MATCH_BLEND_W,
                 "horizon_days": FIXTURE_HORIZON_DAYS,
                 "odds_source": "football-data.co.uk fixtures.csv",
                 "results_source": "football-data.co.uk E0.csv"},
        "record": ledger_record(ledger),
        "ledger": ledger,
    }
    return sim_doc, pred_doc


# ---------------------------------------------------------------- self-test

def self_test():
    fails = []

    def check(name, cond):
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

    if fails:
        print("SELF-TEST FAIL:", ", ".join(fails))
        sys.exit(1)
    print("self-test OK (14 cases)")


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
    sim_doc, pred_doc = build(sims)
    print("mu=%.3f  %s  played=%d" % (sim_doc["meta"]["mu"], sim_doc["meta"]["market"],
                                      sim_doc["meta"]["matches_played"]))
    for r in sim_doc["table"][:6]:
        print("  %-24s title %5.1f%%  top5 %5.1f%%  xPts %.1f" % (r["name"], r["p_title"], r["p_top5"], r["exp_pts"]))
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
    print("wrote pl-sim.json + pl-predictions.json")


if __name__ == "__main__":
    main()
