#!/usr/bin/env python3
"""NFL Program 2026: lift the workbook's own Elo convention out of NFL_all.xlsx.

WHY THIS EXISTS. The walk-forward backtest gate (scripts/predictions/
backtest_harness.py) grades its candidate against the CENTURY BACKBONE, and
that backbone is the workbook's `ELO Prob (Pre)` column, read out of
NFL_all.xlsx by scripts/nfl/build_expectation.py into the expectation ledger.

The LIVE pick engine (scripts/predictions/build_nfl_sim.py) does NOT use that
backbone. Its `model.pH` is a regressed, recency-weighted POINT MARGIN from
ESPN season standings, mapped through a normal CDF. Two different models,
one field name. Feeding the live model's probability into a logistic whose
`elo_logit` coefficient was fitted on workbook-Elo logits would apply a
coefficient fitted for one predictor to a different predictor.

So the v3 shadow needs the workbook Elo carried forward into 2026 on the
workbook's own terms. This script measures those terms rather than assuming
them, and writes them to a small tracked JSON the shadow builder reads. The
workbook lives only on the Windows box; the asset travels to the mini.

WHAT IS MEASURED (all numbers below are re-derived on every --write run and
asserted against tolerances, so a workbook change surfaces here, not in a
silently wrong pick)

  1. The probability map.  p_home = 1 / (1 + 10 ** (-(dElo + HFA) / DIV)).
     Fitted over every 1999+ row: DIV = 400 and HFA = 65 exactly. Home rows
     reproduce the workbook column to MAE ~0.0007; the 52 NEUTRAL-site rows
     (H/A blank, not "vs"/"at") reproduce it to MAE ~0.000001 at HFA = 0,
     which is what pins DIV independently of HFA.

  2. The off-season carry.  new = a * old + b, least squares over every
     franchise-season boundary. a = 2/3 and b = 501.53: one third of the way
     to 1505, R^2 = 0.99997. This is what turns end-of-2025 into
     pre-season-2026.

  3. The in-season update.  elo_shift against K * (actual - expected). If the
     workbook uses a flat K this fits tightly and the shadow can carry its own
     Elo through the season; if it uses a margin-of-victory multiplier it will
     not, and the script says so rather than pretending. Read `k_fit.usable`
     before relying on `k`.

A NOTE ON qbelo. The workbook carries qbelo1_pre/qbelo2_pre, but only for
1999-2022 -- FiveThirtyEight stopped publishing when it was shut down. It is
a dead source for anything live. Do not build the QB layer on it.

Usage:
    python scripts/predictions/nfl_elo_workbook.py --self-test
    python scripts/predictions/nfl_elo_workbook.py            # dry run, prints
    python scripts/predictions/nfl_elo_workbook.py --write     # emits the asset
"""
import argparse, json, math, os, sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(os.path.expanduser("~"), "OneDrive", "Excel Files", "NFL_all.xlsx")
OUT = os.path.join(HERE, "nfl_elo_2026.json")

SEASON = 2026
FIRST = 1999                 # matches the harness's pbp era
ANCHOR_EXPECT = 1505.0       # the mean the off-season carry pulls toward
DIV_EXPECT, HFA_EXPECT = 400.0, 65.0
MAE_TOL = 0.005              # home-row reproduction of ELO Prob (Pre)
NEUTRAL_MAE_TOL = 0.0005


def elo_prob(d_elo, home, div=DIV_EXPECT, hfa=HFA_EXPECT):
    """The workbook's own map. `home` is 1.0 at a home site, 0.0 at a neutral."""
    return 1.0 / (1.0 + 10 ** (-((d_elo + hfa * home) / div)))


def implied_hfa(elo_self, elo_opp, p, div=DIV_EXPECT):
    """Invert ELO Prob (Pre) to the home-field edge the workbook must have
    used on that row. This is how the displaced-venue rule was found: it is
    65 at a team's own ground and 0 everywhere else."""
    if p is None or elo_self is None or elo_opp is None or not (0 < p < 1):
        return None
    return div * math.log10(p / (1 - p)) - (elo_self - elo_opp)


def mov_multiplier(margin, winner_elo_edge):
    """FiveThirtyEight's margin-of-victory damper, which is what stops a
    blowout from moving a rating as far as three close wins would. `margin`
    is the absolute points difference; `winner_elo_edge` is the WINNER's
    pre-game Elo advantage including home field, so an upset moves more than
    an expected win of the same margin. A tie has no winner and no movement."""
    return math.log(abs(margin) + 1.0) * (2.2 / (winner_elo_edge * 0.001 + 2.2))


def elo_shift(actual, expected, margin, elo_edge_home, k):
    """The workbook's per-game rating change, from the HOME side's view."""
    if margin == 0:
        return 0.0
    edge = elo_edge_home if actual > 0.5 else -elo_edge_home
    return k * (actual - expected) * mov_multiplier(margin, edge)


def fit_line(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    a = sxy / sxx
    b = my - a * mx
    resid = [y - (a * x + b) for x, y in zip(xs, ys)]
    ss_res = sum(r * r for r in resid)
    ss_tot = sum((y - my) ** 2 for y in ys)
    return a, b, (1 - ss_res / ss_tot if ss_tot else 0.0), max(abs(r) for r in resid), n


def _hidx(hdr):
    d = {}
    for i, h in enumerate(hdr):
        if h is None:
            continue
        h = str(h).strip()
        if h not in d:
            d[h] = i
    return d


def _fnum(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read_workbook(path=SRC):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Regular Season"]
    it = ws.iter_rows(values_only=True)
    idx = _hidx(list(next(it)))
    need = ["Name", "NFL Season", "Date", "H/A", "ELO - Pre", "ELO (Opp) -Pre",
            "ELO Prob (Pre)", "ELO Shift", "W/L/T", "Reg/Play", "PF", "PA",
            "Stadium", "Stad. State"]
    missing = [c for c in need if c not in idx]
    if missing:
        wb.close()
        sys.exit("FATAL: NFL_all.xlsx is missing columns %s" % missing)

    def g(row, col):
        return row[idx[col]]

    rows = []
    for row in it:
        name = str(g(row, "Name") or "").strip()
        if not name:
            continue
        try:
            season = int(str(g(row, "NFL Season"))[:4])
        except (TypeError, ValueError):
            continue
        if season < FIRST:
            continue
        d = g(row, "Date")
        d = d.date().isoformat() if hasattr(d, "date") else (str(d)[:10] if d else None)
        rows.append({
            "season": season, "date": d, "name": name,
            "ha": str(g(row, "H/A") or "").strip(),
            "playoff": str(g(row, "Reg/Play") or "").strip() == "Playoff",
            "elo": _fnum(g(row, "ELO - Pre")),
            "oelo": _fnum(g(row, "ELO (Opp) -Pre")),
            "p": _fnum(g(row, "ELO Prob (Pre)")),
            "shift": _fnum(g(row, "ELO Shift")),
            "res": str(g(row, "W/L/T") or "").strip(),
            "pf": _fnum(g(row, "PF")),
            "pa": _fnum(g(row, "PA")),
            "stadium": str(g(row, "Stadium") or "").strip(),
            "state": str(g(row, "Stad. State") or "").strip(),
        })
    wb.close()
    return rows


def measure(rows):
    """Every constant the shadow depends on, derived from the rows."""
    out = {}
    usable = [r for r in rows if r["elo"] is not None and r["oelo"] is not None
              and r["p"] is not None]
    home = [r for r in usable if r["ha"] == "vs"]
    neut = [r for r in usable if r["ha"] not in ("vs", "at")]
    if not home or not neut:
        sys.exit("FATAL: no home or no neutral rows; H/A encoding changed")

    def mae(sample, hfa):
        errs = [abs(elo_prob(r["elo"] - r["oelo"], 1.0 if hfa else 0.0) - r["p"])
                for r in sample]
        return sum(errs) / len(errs), max(errs), len(errs)

    hm, hx, hn = mae(home, True)
    nm, nx, nn = mae(neut, False)

    # The displaced-venue rule. A handful of "home" rows carry an implied HFA
    # of 0 rather than 65, and every one of them is a game the home side did
    # not actually host: the London/Mexico/Germany/Brazil/Ireland/Spain
    # international series, the 2005 Saints at the Alamodome and Cardinals at
    # Estadio Azteca after Katrina, the 2003 Chargers at Sun Devil Stadium
    # during the Cedar Fire, the 2010 Vikings at Ford Field after the
    # Metrodome roof came down. The workbook zeroes home field for all of
    # them, so the 2026 international slate must be zeroed too.
    displaced = [r for r in home
                 if (lambda h: h is not None and abs(h - HFA_EXPECT) > 5)(
                     implied_hfa(r["elo"], r["oelo"], r["p"]))]
    settled = [r for r in home if r not in displaced]
    sm, sx, sn = mae(settled, True) if settled else (None, None, 0)
    out["prob_map"] = {"div": DIV_EXPECT, "hfa": HFA_EXPECT,
                       "home_mae": round(hm, 8), "home_max": round(hx, 6), "home_n": hn,
                       "neutral_mae": round(nm, 8), "neutral_max": round(nx, 6),
                       "neutral_n": nn,
                       "own_ground_mae": round(sm, 8) if sm is not None else None,
                       "own_ground_max": round(sx, 6) if sx is not None else None,
                       "own_ground_n": sn,
                       "displaced_n": len(displaced),
                       "displaced_venues": sorted({r["stadium"] for r in displaced}),
                       "rule": "HFA = 65 at the home side's own ground, 0 at any "
                               "displaced or international venue, 0 at a neutral "
                               "site (the workbook codes only Super Bowls neutral)"}

    # off-season carry
    end_of, first_of = defaultdict(dict), defaultdict(dict)
    for r in rows:
        if r["elo"] is None:
            continue
        if r["shift"] is not None:
            cur = end_of[r["season"]].get(r["name"])
            if cur is None or (r["date"] or "") > (cur["date"] or ""):
                end_of[r["season"]][r["name"]] = r
        cur = first_of[r["season"]].get(r["name"])
        if cur is None or (r["date"] or "") < (cur["date"] or ""):
            first_of[r["season"]][r["name"]] = r
    xs, ys = [], []
    for season in sorted(end_of):
        nxt = first_of.get(season + 1, {})
        for name, r in end_of[season].items():
            if name in nxt:
                xs.append(r["elo"] + r["shift"])
                ys.append(nxt[name]["elo"])
    a, b, r2, mxr, n = fit_line(xs, ys)
    out["carry"] = {"a": round(a, 6), "b": round(b, 4), "r2": round(r2, 6),
                    "max_resid": round(mxr, 3), "n": n,
                    "implied_anchor": round(b / (1 - a), 2)}

    # in-season update constant
    kx, ky = [], []
    for r in rows:
        if r["shift"] is None or r["p"] is None or r["res"] not in ("W", "L", "T"):
            continue
        actual = {"W": 1.0, "L": 0.0, "T": 0.5}[r["res"]]
        kx.append(actual - r["p"])
        ky.append(r["shift"])
    ka, kb, kr2, kmx, kn = fit_line(kx, ky)
    out["k_fit"] = {"k": round(ka, 4), "intercept": round(kb, 4), "r2": round(kr2, 5),
                    "max_resid": round(kmx, 3), "n": kn,
                    "usable": bool(kr2 >= 0.95 and abs(kb) < 1.0),
                    "note": ("flat-K fit; safe to carry Elo in-season" if kr2 >= 0.95
                             else "POOR FIT - the workbook applies a margin-of-victory "
                                  "multiplier. Do NOT carry Elo in-season from this K; "
                                  "hold the pre-season ratings and say so on the page.")}

    # the same update WITH the margin-of-victory damper, which is the form
    # the flat fit above is failing against. If this one fits, the shadow can
    # carry its own Elo through the season instead of freezing it in September.
    mx_, my_ = [], []
    for r in rows:
        if (r["shift"] is None or r["p"] is None or r["res"] not in ("W", "L", "T")
                or r["pf"] is None or r["pa"] is None or r["elo"] is None
                or r["oelo"] is None):
            continue
        margin = r["pf"] - r["pa"]
        if margin == 0:
            continue
        actual = 1.0 if r["res"] == "W" else 0.0
        hfa = HFA_EXPECT if r["ha"] == "vs" else (-HFA_EXPECT if r["ha"] == "at" else 0.0)
        edge_self = (r["elo"] - r["oelo"]) + hfa
        edge = edge_self if actual > 0.5 else -edge_self
        mx_.append((actual - r["p"]) * mov_multiplier(margin, edge))
        my_.append(r["shift"])
    ma, mb, mr2, mmx, mn = fit_line(mx_, my_)
    out["k_mov_fit"] = {"k": round(ma, 4), "intercept": round(mb, 4),
                        "r2": round(mr2, 5), "max_resid": round(mmx, 3), "n": mn,
                        "usable": bool(mr2 >= 0.99 and abs(mb) < 0.5),
                        "form": "shift = k * (actual - p) * ln(|margin|+1) * "
                                "2.2 / (winner_elo_edge*0.001 + 2.2)"}

    # ratings at the season boundary
    last = end_of.get(SEASON - 1, {})
    end_prev = {k: round(v["elo"] + v["shift"], 3) for k, v in last.items()
                if v["shift"] is not None}
    carried = {k: round(a * v + b, 3) for k, v in end_prev.items()}
    out["end_of_%d" % (SEASON - 1)] = end_prev
    out["preseason_%d" % SEASON] = carried
    out["n_franchises"] = len(carried)
    out["mean_carried"] = round(sum(carried.values()) / len(carried), 3) if carried else None
    return out


def validate(m):
    """Refuse to emit an asset whose own measurements have drifted."""
    errs = []
    p = m["prob_map"]
    if p["home_mae"] > MAE_TOL:
        errs.append("home probability MAE %.6f exceeds %.6f - the workbook's Elo "
                    "convention changed" % (p["home_mae"], MAE_TOL))
    if p["neutral_mae"] > NEUTRAL_MAE_TOL:
        errs.append("neutral MAE %.8f exceeds %.8f - the divisor is no longer 400"
                    % (p["neutral_mae"], NEUTRAL_MAE_TOL))
    if p.get("own_ground_mae") is not None and p["own_ground_mae"] > NEUTRAL_MAE_TOL:
        errs.append("own-ground MAE %.8f exceeds %.8f - HFA is no longer a flat 65 "
                    "at a team's own venue" % (p["own_ground_mae"], NEUTRAL_MAE_TOL))
    if p.get("displaced_n", 0) > 0.02 * max(1, p["home_n"]):
        errs.append("displaced-venue rows are %d of %d home rows, far more than the "
                    "international series plus a few relocations - the rule changed"
                    % (p["displaced_n"], p["home_n"]))
    c = m["carry"]
    if c["r2"] < 0.99:
        errs.append("off-season carry R2 %.5f below 0.99" % c["r2"])
    if abs(c["implied_anchor"] - ANCHOR_EXPECT) > 15:
        errs.append("carry anchor %.2f is not near %.1f" % (c["implied_anchor"], ANCHOR_EXPECT))
    if m["n_franchises"] != 32:
        errs.append("expected 32 franchises, measured %d" % m["n_franchises"])
    return errs


def self_test():
    """Pure logic, no workbook, no network."""
    # 1. the probability map reproduces hand-checked workbook rows
    cases = [
        # (elo_home, elo_away, home?, workbook p, tolerance)
        (1691.3, 1750.5, 0.0, 0.4156, 0.0005),   # SB LII, neutral site
        (1763.8, 1688.1, 0.0, 0.6073, 0.0005),   # SB LI, neutral site
        (1675.2, 1661.5, 1.0, 0.6114, 0.0010),   # 2019 AFC CG, KC at home
        (1714.7, 1659.9, 1.0, 0.6658, 0.0010),   # 2024 AFC CG, BAL at home
    ]
    for eh, ea, home, want, tol in cases:
        got = elo_prob(eh - ea, home)
        assert abs(got - want) <= tol, "prob map: %.4f vs %.4f (%s)" % (got, want, (eh, ea, home))
    # a neutral game between equals is a coin flip; a home game is not
    assert abs(elo_prob(0.0, 0.0) - 0.5) < 1e-12
    assert elo_prob(0.0, 1.0) > 0.59
    # 2. the carry is a contraction toward the anchor and is monotone
    a, b = 2.0 / 3.0, 501.5313
    assert abs((b / (1 - a)) - ANCHOR_EXPECT) < 1.0
    assert a * 1800 + b < 1800 and a * 1200 + b > 1200      # both pulled inward
    assert a * 1800 + b > a * 1700 + b                      # order preserved
    # 3. implied_hfa inverts the map, so a row built at 65 reads back as 65
    _p = elo_prob(120.0, 1.0)
    assert abs(implied_hfa(1600.0, 1480.0, _p) - HFA_EXPECT) < 1e-6
    _pn = elo_prob(120.0, 0.0)
    assert abs(implied_hfa(1600.0, 1480.0, _pn) - 0.0) < 1e-6, "a displaced game reads 0"
    assert implied_hfa(1600.0, 1480.0, None) is None
    assert implied_hfa(1600.0, 1480.0, 1.0) is None, "a certainty has no finite logit"

    # 4. the margin damper behaves: a bigger win moves more, but sub-linearly,
    #    and an upset moves more than the same margin achieved by a favourite
    assert mov_multiplier(3, 0) < mov_multiplier(21, 0)
    assert mov_multiplier(21, 0) < 3 * mov_multiplier(3, 0), "damper must be sub-linear"
    assert mov_multiplier(14, -200) > mov_multiplier(14, 200), "upsets must move more"
    assert elo_shift(1.0, 0.5, 0, 100, 20.0) == 0.0, "a tie moves nothing"
    up = elo_shift(1.0, 0.2, 10, -150, 20.0)
    exp = elo_shift(1.0, 0.8, 10, 150, 20.0)
    assert up > exp > 0, "winning as an underdog must gain more than as a favourite"

    # 5. fit_line recovers a known line exactly, and reports R2 = 1
    xs = [1.0, 2.0, 3.0, 4.0]
    fa, fb, fr2, fmx, fn = fit_line(xs, [3 * x + 7 for x in xs])
    assert abs(fa - 3) < 1e-9 and abs(fb - 7) < 1e-9 and abs(fr2 - 1) < 1e-9 and fn == 4
    # 6. validate() actually rejects drift rather than waving it through
    bad = {"prob_map": {"home_mae": 0.9, "neutral_mae": 0.9, "own_ground_mae": 0.9,
                        "home_n": 1000, "displaced_n": 500},
           "carry": {"r2": 0.5, "implied_anchor": 1.0}, "n_franchises": 3}
    assert len(validate(bad)) == 7, "validate must catch every drifted field, got %d" % len(validate(bad))
    good = {"prob_map": {"home_mae": 0.0007, "neutral_mae": 1e-6, "own_ground_mae": 1e-7,
                         "home_n": 7245, "displaced_n": 60},
            "carry": {"r2": 0.99997, "implied_anchor": 1505.0}, "n_franchises": 32}
    assert validate(good) == [], validate(good)
    # the displaced count is a ratio test, not a magic number: 60 of 7245 passes,
    # the same 60 against a tiny sample does not
    tight = dict(good, prob_map=dict(good["prob_map"], home_n=100))
    assert len(validate(tight)) == 1
    print("self-test OK: probability map, carry, margin damper, fit_line, validation gate")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true", help="emit %s" % os.path.basename(OUT))
    ap.add_argument("--src", default=SRC)
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    if not os.path.exists(args.src):
        sys.exit("FATAL: workbook not found at %s (this script runs where the "
                 "master lives, not on the mini)" % args.src)
    rows = read_workbook(args.src)
    print("read %d workbook rows from %d+" % (len(rows), FIRST))
    m = measure(rows)
    p, c, k = m["prob_map"], m["carry"], m["k_fit"]
    print("probability map : p = 1/(1+10^(-(dElo + %g*home)/%g))" % (p["hfa"], p["div"]))
    print("                  home  MAE %.7f  max %.4f  n %d" % (p["home_mae"], p["home_max"], p["home_n"]))
    print("                  neutral MAE %.8f  max %.6f  n %d" % (p["neutral_mae"], p["neutral_max"], p["neutral_n"]))
    print("                  own-ground MAE %.8f  max %.6f  n %d" % (p["own_ground_mae"], p["own_ground_max"], p["own_ground_n"]))
    print("                  %d displaced rows get HFA 0: %s" % (p["displaced_n"], ", ".join(p["displaced_venues"][:6])))
    print("off-season carry: new = %.6f*old + %.4f   R2 %.5f  max resid %.2f  anchor %.2f  n %d"
          % (c["a"], c["b"], c["r2"], c["max_resid"], c["implied_anchor"], c["n"]))
    print("in-season K     : shift = %.3f*(actual-p) %+.3f   R2 %.5f  usable=%s"
          % (k["k"], k["intercept"], k["r2"], k["usable"]))
    print("                  %s" % k["note"])
    km = m["k_mov_fit"]
    print("in-season K (MOV): shift = %.4f*(actual-p)*damper %+.4f   R2 %.5f  usable=%s  n=%d"
          % (km["k"], km["intercept"], km["r2"], km["usable"], km["n"]))
    print("%d franchises carried into %d, mean %.2f" % (m["n_franchises"], SEASON, m["mean_carried"]))
    top = sorted(m["preseason_%d" % SEASON].items(), key=lambda kv: -kv[1])[:6]
    print("top carried     : %s" % ", ".join("%s %.0f" % t for t in top))
    errs = validate(m)
    if errs:
        print("\nVALIDATION FAILED:")
        for e in errs:
            print("  -", e)
        sys.exit(2)
    print("validation passed")
    if not args.write:
        print("\n(dry run; pass --write to emit %s)" % OUT)
        return
    m["_meta"] = {"source": "NFL_all.xlsx :: Regular Season",
                  "built_by": "scripts/predictions/nfl_elo_workbook.py",
                  "season": SEASON,
                  "why": "the century backbone the backtest gate grades against; "
                         "NOT the live sim's margin model"}
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        json.dump(m, f, indent=1, sort_keys=True)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
