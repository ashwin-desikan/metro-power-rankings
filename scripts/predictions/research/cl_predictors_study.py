#!/usr/bin/env python3
"""cl_predictors_study.py — what actually predicts Champions League outcomes?

Commissioned by Ashwin, 2026-08-30, after ucl-poisson-v1 ranked Sporting CP
third on champion odds and the proposed fix (blend in UEFA club coefficients)
was, correctly, challenged as untested. This study answers, with the site's
own data, the question v1 skipped: WHICH preseason indicators actually
predict European performance, and is a club coefficient predictive at all or
merely descriptive?

DATA (all first-party):
  * eur_competition_matches (Supabase, exported to research/eur_matches.json):
    every European tie 1955-56..2025-26 with scores — 28k individual matches
    once two-legged ties are unfolded. Outcomes, a rolling European Elo, and
    a UEFA-style coefficient analogue are all computed from this archive, so
    the whole study lives in ONE club-name namespace (the workbook's Eur
    canonical names, which join the domestic hubs at 1162/1188 names).
  * hub-1959-60..hub-2025-26.json: domestic tables for every tracked league
    (goals for/against, rank), the site's own per-season club score, and the
    site's historical country coefficients.
  * uefa_club_coeff_history + uefa_team_coeff_history (Supabase): the REAL
    UEFA per-season club coefficient points, 2008/09..2025/26, to check the
    home-grown analogue against the genuine article in the modern era.

DESIGN:
  Campaign level — for every club in a CL group stage / league phase
  (1992..2026, n≈1100 club-seasons): outcome = depth reached (group exit 0,
  new-format KO play-off exit 0.5, R16 1, QF 2, SF 3, final 4, champion 5)
  and group-stage points per game (3/1/0, a continuous outcome every
  participant has). Predictors, all STRICTLY pre-season (season t uses only
  data through t-1):
    dom_att, dom_def   goals for/against per game relative to own league avg
    dom_rank           domestic finishing position
    site_score         the site's own club rating for season t-1
    elo                rolling European-match Elo entering season t
    coeff5             UEFA-style points from European matches, prior 5 years
    coeff1             same, prior season only
    uefa5              the real UEFA 5-year coefficient (2014+ campaigns)
    country_coeff      the site's country coefficient after season t-1
  Metrics: mean within-season Spearman vs both outcomes; era splits; pairwise
  concordance; and an incremental test (does coeff5 add anything once elo +
  domestic form are in the model?) via within-season-z OLS with era CV.

  Match level — for the 3,240 CL group/league-phase matches: does the
  predictor gap pick the winner of decisive matches?

Everything here is descriptive research; the model consequences are fitted
separately (fit_ucl_strength.py) and only the fitted artifact ships.

Usage:  python scripts/predictions/research/cl_predictors_study.py
        (expects research exports under ~/research; see RESEARCH_DIR)
"""
import json
import math
import os
import re
import sys
from collections import defaultdict

import numpy as np

RESEARCH_DIR = os.environ.get("RESEARCH_DIR", os.path.expanduser("~/research"))
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
REPO = os.path.join(ROOT, "repo") if os.path.isdir(os.path.join(ROOT, "repo")) else ROOT
DD = os.path.join(REPO, "public", "data", "football")

def ntn(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()

# ------------------------------------------------------------------ matches

def stage_order(comp, rn, round_name):
    """Chronological order of stages inside a season; also the depth ladder."""
    if rn is None and re.search(r"knockout", round_name or "", re.I):
        return 2.5   # new-format knockout play-offs, between league phase and R16
    if rn is None:
        return 1.5
    if rn >= 6:
        return 0     # qualifying
    return {5: 1, 4: 3, 3: 4, 2: 5, 1: 6}.get(rn, 1.5)

def load_matches():
    m = json.load(open(os.path.join(RESEARCH_DIR, "matches_unfolded.json")))
    # rows: (season_end, comp, round, round_num, is_group, home, away, hg, ag)
    m.sort(key=lambda x: (x[0], stage_order(x[1], x[3], x[2])))
    return m

# ------------------------------------------------------------------- hubs

def load_hubs():
    """per season_end: {'dom': {club: (att_rel, def_rel, rank, level, country)},
                        'score': {club: score}, 'country_coeff': {country: coef}}"""
    out = {}
    import glob
    for p in sorted(glob.glob(os.path.join(DD, "hub-*.json"))):
        h = json.load(open(p))
        end = int(h["season"][:4]) + 1
        dom, score, cc = {}, {}, {}
        for l in h.get("leagues", []):
            rows = [r for g in l.get("groups", []) for r in g.get("rows", []) if r.get("played")]
            if not rows:
                continue
            avg_gf = sum(r["gf"] for r in rows) / sum(r["played"] for r in rows)
            avg_ga = sum(r["ga"] for r in rows) / sum(r["played"] for r in rows)
            for r in rows:
                key = ntn(r.get("lookup") or r.get("name"))
                lvl = l.get("level") or 9
                # keep the highest level (lowest number) if a club appears twice
                if key in dom and dom[key][3] <= lvl:
                    continue
                dom[key] = ((r["gf"] / r["played"]) / avg_gf,
                            (r["ga"] / r["played"]) / avg_ga,
                            r.get("rank"), lvl, l.get("country"))
        for c in h.get("clubs", []):
            # index under BOTH namespaces — the clubs array's lookup is the
            # workbook Eur name ("Bayern München") while the match archive's
            # canon is sometimes the display name ("Bayern Munich"); missing
            # one side silently dropped Arsenal/Inter scores in study v1.
            for k in (c.get("lookup"), c.get("name")):
                if k:
                    score[ntn(k)] = c.get("score")
        for c in h.get("countries", []):
            cc[c["country"]] = c.get("coef")
        out[end] = {"dom": dom, "score": score, "country_coeff": cc}
    return out

# ----------------------------------------------- rolling Elo + coefficients

ELO_K = 28.0
ELO_HA = 70.0
ELO_INIT = 1450.0
# Study-Elo v3. v1 regressed 25%/season toward a "country mean" whose club->
# country map was never populated, so everything regressed to the GLOBAL mean:
# after 70 years the whole pool sat in a 40-point band, Real Madrid capped at
# ~1550, and match concordance was a coin flip. v3 is ClubElo-shaped: NO
# blanket regression (the pool is closed and zero-sum), entrants seeded at
# their COUNTRY's current mean (minnow debutants no longer spawn at the
# global average and inflate incumbents), capped margin-of-victory K.
ELO_SEED_DEFAULT = 1300.0

def mov_mult(margin):
    return 1.0 + math.log(1.0 + min(int(margin), 2))

def run_rolling(matches, upto_season=None):
    """One chronological pass over ALL European matches building, per season t,
    the PRE-SEASON snapshot of: elo, coeff5, coeff1.
    Returns {season: {'elo': {club:v}, 'coeff5': {...}, 'coeff1': {...}}}."""
    elo = {}
    club_country = {}
    country_sum = defaultdict(float)
    country_n = defaultdict(int)
    season_pts = defaultdict(lambda: defaultdict(float))   # season -> club -> uefa-style pts
    snapshots = {}
    cur = None

    def seed(cc):
        if cc and country_n[cc] >= 3:
            return country_sum[cc] / country_n[cc]
        return ELO_SEED_DEFAULT

    def snapshot(season):
        c5, c1 = {}, {}
        clubs = set().union(*(season_pts[s].keys() for s in range(season - 5, season) if s in season_pts)) \
            if any(s in season_pts for s in range(season - 5, season)) else set()
        for c in clubs:
            c5[c] = sum(season_pts[s].get(c, 0.0) for s in range(season - 5, season))
            c1[c] = season_pts[season - 1].get(c, 0.0)
        snapshots[season] = {"elo": dict(elo), "coeff5": c5, "coeff1": c1}

    for season, comp, rnd, rn, is_group, home, away, hg, ag, hcc, acc in matches:
        if upto_season and season > upto_season:
            break
        if cur is None:
            cur = season
        if season != cur:
            # refresh the country means used to seed next season's debutants
            country_sum.clear(); country_n.clear()
            for c, r in elo.items():
                k = club_country.get(c)
                if k:
                    country_sum[k] += r
                    country_n[k] += 1
            snapshot(season)
            cur = season
        for c, cc in ((home, hcc), (away, acc)):
            if c not in elo:
                elo[c] = ELO_INIT if not snapshots else seed(cc)
                club_country[c] = cc
        if hg is None or ag is None:
            continue
        # UEFA-style points (qualifying at half credit)
        w = 0.5 if (rn is not None and rn >= 6) else 1.0
        if hg > ag:
            season_pts[season][home] += 2 * w
        elif hg < ag:
            season_pts[season][away] += 2 * w
        else:
            season_pts[season][home] += 1 * w
            season_pts[season][away] += 1 * w
        # Elo update
        dr = elo[home] + ELO_HA - elo[away]
        exp_home = 1.0 / (1.0 + 10 ** (-dr / 400.0))
        res = 1.0 if hg > ag else (0.0 if hg < ag else 0.5)
        # Qualifying at reduced K: those rounds are blowouts vs micro-state
        # sides and at full weight they inflated mid-tier minnows (Stjarnan
        # 1641 in study-Elo v3) faster than group play could correct.
        k_eff = ELO_K * (0.4 if (rn is not None and rn >= 6) else 1.0)
        delta = k_eff * mov_mult(abs(hg - ag)) * (res - exp_home)
        elo[home] += delta
        elo[away] -= delta
    snapshot((upto_season or cur) + 1)
    return snapshots

# --------------------------------------------------------------- campaigns

def build_campaigns(matches, hubs, snapshots, uefa5):
    """One row per (club, season) that appears in a CL group/league phase."""
    # outcome depth per club-season from the archive itself
    depth = defaultdict(float)          # (club, season) -> depth
    group_pts = defaultdict(float)
    group_games = defaultdict(int)
    finals = {}                          # season -> (home, away, winner)
    in_group = set()

    DEPTH = {1: 0.0, 2.5: 0.5, 3: 1.0, 4: 2.0, 5: 3.0, 6: 4.0}  # stage_order -> depth
    for season, comp, rnd, rn, is_group, home, away, hg, ag, _hcc, _acc in matches:
        if comp != "CL":
            continue
        so = stage_order(comp, rn, rnd)
        if so == 0:
            continue
        for c in (home, away):
            key = (c, season)
            depth[key] = max(depth[key], DEPTH.get(so, 0.0))
            if is_group:
                in_group.add(key)
        if is_group and hg is not None:
            group_games[(home, season)] += 1
            group_games[(away, season)] += 1
            if hg > ag:
                group_pts[(home, season)] += 3
            elif hg < ag:
                group_pts[(away, season)] += 3
            else:
                group_pts[(home, season)] += 1
                group_pts[(away, season)] += 1
        if so == 6 and hg is not None:
            # single final in this archive (leg1 only for modern finals)
            winner = home if hg > ag else (away if ag > hg else None)
            finals[season] = (home, away, winner)
    for season, (h, a, w) in finals.items():
        if w:
            depth[(w, season)] = 5.0

    rows = []
    unjoined = defaultdict(int)
    for (club, season) in sorted(in_group):
        if season < 1992:
            continue
        hub = hubs.get(season - 1)
        snap = snapshots.get(season)
        if not hub or not snap:
            continue
        key = ntn(club)
        d = hub["dom"].get(key)
        if d is None:
            unjoined[club] += 1
            continue
        att_rel, def_rel, rank, level, country = d
        cc = hub["country_coeff"].get(country)
        top_cc = max(hub["country_coeff"].values()) if hub["country_coeff"] else None
        dom_comp = math.log(max(att_rel, 0.05) / max(def_rel, 0.05))
        v1 = (dom_comp + 0.8 * math.log(max(cc, 1.0) / top_cc)) if (cc and top_cc) else None
        rows.append({
            "dom_comp": dom_comp,
            "v1_strength": v1,
            "club": club, "season": season, "country": country,
            "depth": depth[(club, season)],
            "gppg": group_pts[(club, season)] / max(1, group_games[(club, season)]),
            "dom_att": att_rel, "dom_def": def_rel,
            "dom_rank": rank if rank is not None else 20,
            "site_score": hub["score"].get(key),
            "elo": snap["elo"].get(club),
            "coeff5": snap["coeff5"].get(club, 0.0),
            "coeff1": snap["coeff1"].get(club, 0.0),
            "uefa5": uefa5.get((key, season)),
            "country_coeff": cc,
        })
    return rows, unjoined

# -------------------------------------------------------------- evaluation

def spearman(x, y):
    if len(x) < 3:
        return None
    rx = np.argsort(np.argsort(x)).astype(float)
    ry = np.argsort(np.argsort(y)).astype(float)
    sx, sy = rx.std(), ry.std()
    if sx == 0 or sy == 0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])

PREDICTORS = ["site_score", "elo", "coeff5", "coeff1", "uefa5",
              "dom_att", "dom_def", "dom_rank", "dom_comp",
              "country_coeff", "v1_strength"]
FLIP = {"dom_def", "dom_rank"}   # smaller is better

def per_season_spearman(rows, outcome, era=None):
    by_season = defaultdict(list)
    for r in rows:
        if era and not (era[0] <= r["season"] <= era[1]):
            continue
        by_season[r["season"]].append(r)
    out = {}
    for p in PREDICTORS:
        vals = []
        for season, rs in by_season.items():
            pts = [(r[p], r[outcome]) for r in rs if r[p] is not None]
            if len(pts) < 8:
                continue
            x = np.array([v for v, _ in pts])
            if p in FLIP:
                x = -x
            y = np.array([o for _, o in pts])
            s = spearman(x, y)
            if s is not None:
                vals.append(s)
        out[p] = (round(float(np.mean(vals)), 3), round(float(np.std(vals)), 3), len(vals)) if vals else None
    return out

def match_level_concordance(matches, snapshots, hubs, uefa5):
    """P(the side rated higher by predictor X wins | decisive group match)."""
    counts = {p: [0, 0] for p in PREDICTORS}
    for season, comp, rnd, rn, is_group, home, away, hg, ag, _hcc, _acc in matches:
        if comp != "CL" or not is_group or hg is None or hg == ag or season < 1992:
            continue
        hub = hubs.get(season - 1)
        snap = snapshots.get(season)
        if not hub or not snap:
            continue
        hk, ak = ntn(home), ntn(away)
        feats = {}
        for p in PREDICTORS:
            if p in ("dom_att", "dom_def", "dom_rank"):
                dh, da = hub["dom"].get(hk), hub["dom"].get(ak)
                if not dh or not da:
                    feats[p] = None
                    continue
                i = {"dom_att": 0, "dom_def": 1, "dom_rank": 2}[p]
                feats[p] = (dh[i], da[i])
            elif p == "site_score":
                feats[p] = (hub["score"].get(hk), hub["score"].get(ak))
            elif p == "country_coeff":
                dh, da = hub["dom"].get(hk), hub["dom"].get(ak)
                feats[p] = (hub["country_coeff"].get(dh[4]) if dh else None,
                            hub["country_coeff"].get(da[4]) if da else None)
            elif p in ("dom_comp", "v1_strength"):
                dh, da = hub["dom"].get(hk), hub["dom"].get(ak)
                top_cc = max(hub["country_coeff"].values()) if hub["country_coeff"] else None
                def strength(d):
                    if not d:
                        return None
                    comp = math.log(max(d[0], 0.05) / max(d[1], 0.05))
                    if p == "dom_comp":
                        return comp
                    cc = hub["country_coeff"].get(d[4])
                    return comp + 0.8 * math.log(max(cc, 1.0) / top_cc) if (cc and top_cc) else None
                feats[p] = (strength(dh), strength(da))
            elif p == "uefa5":
                feats[p] = (uefa5.get((hk, season)), uefa5.get((ak, season)))
            else:
                feats[p] = (snap[p].get(home) if p != "elo" else snap["elo"].get(home),
                            snap[p].get(away) if p != "elo" else snap["elo"].get(away))
        won_home = hg > ag
        for p, fv in feats.items():
            if not fv or fv[0] is None or fv[1] is None or fv[0] == fv[1]:
                continue
            hi_home = fv[0] > fv[1]
            if p in FLIP:
                hi_home = not hi_home
            counts[p][0] += 1
            if hi_home == won_home:
                counts[p][1] += 1
    return {p: (round(c[1] / c[0], 3), c[0]) if c[0] else None for p, c in counts.items()}

def incremental_ols(rows, outcome, base_feats, add_feat, eras):
    """Era-CV R^2 of OLS on within-season z-scores: base vs base+add."""
    by_season = defaultdict(list)
    for r in rows:
        by_season[r["season"]].append(r)

    def design(feats, test_era):
        Xtr, ytr, Xte, yte = [], [], [], []
        for season, rs in by_season.items():
            ok = [r for r in rs if all(r[f] is not None for f in feats)]
            if len(ok) < 8:
                continue
            cols = []
            for f in feats:
                v = np.array([float(r[f]) for r in ok])
                if f in FLIP:
                    v = -v
                sd = v.std()
                cols.append((v - v.mean()) / sd if sd > 0 else v * 0)
            X = np.column_stack(cols)
            y = np.array([float(r[outcome]) for r in ok])
            y = (y - y.mean()) / (y.std() if y.std() > 0 else 1)
            if test_era[0] <= season <= test_era[1]:
                Xte.append(X); yte.append(y)
            else:
                Xtr.append(X); ytr.append(y)
        if not Xte or not Xtr:
            return None
        Xtr = np.vstack(Xtr); ytr = np.concatenate(ytr)
        Xte = np.vstack(Xte); yte = np.concatenate(yte)
        b, *_ = np.linalg.lstsq(Xtr, ytr, rcond=None)
        pred = Xte @ b
        ss_res = float(((yte - pred) ** 2).sum())
        ss_tot = float((yte ** 2).sum())
        return 1 - ss_res / ss_tot, b

    out = {}
    for era in eras:
        r_base = design(base_feats, era)
        r_full = design(base_feats + [add_feat], era)
        if r_base and r_full:
            out[f"{era[0]}-{era[1]}"] = {
                "base_r2": round(r_base[0], 4), "with_r2": round(r_full[0], 4),
                "delta": round(r_full[0] - r_base[0], 4),
                "weights_full": [round(float(x), 3) for x in r_full[1]],
            }
    return out

# ------------------------------------------------------------------- main

def main():
    matches = load_matches()
    hubs = load_hubs()
    print(f"matches: {len(matches)} | hub seasons: {len(hubs)}")
    snapshots = run_rolling(matches)

    uefa5 = {}
    up = os.path.join(RESEARCH_DIR, "uefa_coeff_rows.json")
    if os.path.exists(up):
        per = defaultdict(dict)
        for r in json.load(open(up)):
            yr = 2000 + int(r["season"][:2]) + 1
            per[ntn(r["uefa_name"])][yr] = float(r["points"])
        for name, ys in per.items():
            for season in range(2014, 2028):
                w = [ys.get(s) for s in range(season - 5, season)]
                if sum(1 for x in w if x is not None) >= 3:
                    uefa5[(name, season)] = sum(x for x in w if x)
        print(f"real UEFA coefficient snapshots: {len(uefa5)} club-seasons")

    rows, unjoined = build_campaigns(matches, hubs, snapshots, uefa5)
    print(f"campaign rows: {len(rows)} | unjoined clubs: {sum(unjoined.values())} ({len(unjoined)} names)")
    json.dump(rows, open(os.path.join(RESEARCH_DIR, "campaign_rows.json"), "w"))

    print("\n== Within-season Spearman vs KNOCKOUT DEPTH (mean, sd, n seasons) ==")
    for era in [(1992, 2026), (1992, 2003), (2004, 2015), (2016, 2026)]:
        res = per_season_spearman(rows, "depth", era)
        print(f"  era {era}:")
        for p in PREDICTORS:
            print(f"    {p:14s} {res[p]}")

    print("\n== Within-season Spearman vs GROUP POINTS PER GAME ==")
    res = per_season_spearman(rows, "gppg", (1992, 2026))
    for p in PREDICTORS:
        print(f"    {p:14s} {res[p]}")

    print("\n== Match-level concordance (decisive CL group matches) ==")
    conc = match_level_concordance(matches, snapshots, hubs, uefa5)
    for p in PREDICTORS:
        print(f"    {p:14s} {conc[p]}")

    print("\n== Incremental value on group pts/game (era-CV OLS, z-scored) ==")
    eras = [(1992, 2003), (2004, 2015), (2016, 2026)]
    base = ["elo", "dom_att", "dom_def"]
    for add in ["coeff5", "uefa5", "site_score", "country_coeff"]:
        print(f"  base {base} + {add}:")
        for k, v in incremental_ols(rows, "gppg", base, add, eras).items():
            print(f"    test {k}: {v}")

if __name__ == "__main__":
    main()
