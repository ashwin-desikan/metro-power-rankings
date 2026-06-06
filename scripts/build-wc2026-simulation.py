#!/usr/bin/env python3
"""
Monte Carlo simulator for the FIFA World Cup 2026.

Blends two strength signals:
  - Market: de-vigged outright (to-win) odds from public/data/international/wc2026-odds.json
  - Elo:    the elo_rank already carried per team in public/data/international/index.json

The blend feeds a Poisson goals model. Each tournament is simulated from the
real draw (public/data/international/wc2026.json): 12 groups of 4, top two plus
the eight best third-placed teams advance to a 32-team knockout, then the exact
bracket (matches 73-104) through to the final. Best-thirds are slotted into the
eight third-place knockout slots via a bipartite matching against the official
candidate-group sets encoded in the draw.

Once group/knockout results land in wc2026.json, re-running this picks up locked
teams; for now (pre-tournament) every match is simulated.

Output: public/data/international/wc2026-sim.json
"""
import argparse, json, math, os, datetime
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTL = os.path.join(ROOT, "public", "data", "international")

GROUPS = list("ABCDEFGHIJKL")
HOSTS = {"united-states", "mexico", "canada"}

THIRD_SLOTS = {
    75: set("ABCDF"), 78: set("CEFHI"), 79: set("CDFGH"), 80: set("BEFIJ"),
    81: set("AEHIJ"), 82: set("EHIJK"), 83: set("EFGIJ"), 86: set("DEIJL"),
}
R32 = {
    73: (("R", "A"), ("R", "B")),
    74: (("W", "F"), ("R", "C")),
    75: (("W", "E"), ("3", 75)),
    76: (("W", "C"), ("R", "F")),
    77: (("R", "E"), ("R", "I")),
    78: (("W", "A"), ("3", 78)),
    79: (("W", "I"), ("3", 79)),
    80: (("W", "D"), ("3", 80)),
    81: (("W", "G"), ("3", 81)),
    82: (("W", "L"), ("3", 82)),
    83: (("W", "B"), ("3", 83)),
    84: (("R", "K"), ("R", "L")),
    85: (("W", "H"), ("R", "J")),
    86: (("W", "K"), ("3", 86)),
    87: (("R", "D"), ("R", "G")),
    88: (("W", "J"), ("R", "H")),
}
WIN = {
    89: (74, 77), 90: (73, 75), 91: (79, 80), 92: (76, 78),
    93: (83, 84), 94: (81, 82), 95: (85, 87), 96: (86, 88),
    97: (89, 90), 98: (93, 94), 99: (95, 96), 100: (91, 92),
    101: (97, 98), 102: (99, 100), 104: (101, 102),
}


def zscore(vals):
    a = np.array(vals, dtype=float)
    sd = a.std()
    return (a - a.mean()) / sd if sd > 0 else a * 0.0


def bipartite_match(slots, qualified_groups):
    """Assign each third-slot a distinct qualified group from its candidate set."""
    match = {}  # group -> slot
    def try_assign(slot, seen):
        for g in THIRD_SLOTS[slot]:
            if g in qualified_groups and g not in seen:
                seen.add(g)
                if g not in match or try_assign(match[g], seen):
                    match[g] = slot
                    return True
        return False
    for s in slots:
        try_assign(s, set())
    return {slot: g for g, slot in match.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=20000)
    ap.add_argument("--beta", type=float, default=0.50, help="strength->goals sensitivity")
    ap.add_argument("--mu", type=float, default=1.33, help="baseline goals per team")
    ap.add_argument("--blend-market", type=float, default=0.72, help="weight on market vs elo")
    ap.add_argument("--host-bonus", type=float, default=0.10, help="strength bump for hosts")
    ap.add_argument("--seed", type=int, default=20260611)
    args = ap.parse_args()

    rng = np.random.default_rng(args.seed)
    wc = json.load(open(os.path.join(INTL, "wc2026.json")))
    idx = {t["slug"]: t for t in json.load(open(os.path.join(INTL, "index.json")))["teams"]}
    odds_doc = json.load(open(os.path.join(INTL, "wc2026-odds.json")))
    odds = odds_doc["american_odds"]

    res_path = os.path.join(INTL, "wc2026-results.json")
    res_doc = json.load(open(res_path)) if os.path.exists(res_path) else {"events": {}}
    res_events = [e for e in res_doc.get("events", {}).values() if e.get("completed")]
    group_goals = {}   # frozenset(a,b) -> {slug: goals}
    ko_winner = {}     # (round, frozenset(a,b)) -> winner_slug
    for e in res_events:
        a, b = e["a_slug"], e["b_slug"]
        if e["round"] == "Group":
            group_goals[frozenset((a, b))] = {a: e["a_score"], b: e["b_score"]}
        elif e.get("winner_slug"):
            ko_winner[(e["round"], frozenset((a, b)))] = e["winner_slug"]

    gs = wc["group_stage"]
    field = [(g, t["slug"], t["cur_name"]) for g in GROUPS for t in gs[g]]
    slugs = [s for _, s, _ in field]
    name_of = {s: n for _, s, n in field}
    group_of = {s: g for g, s, _ in field}
    elo_rank = {s: (idx.get(s, {}).get("elo_rank") or idx.get(s, {}).get("fifa_rank") or 210) for s in slugs}

    raw = {s: 100.0 / (odds[s] + 100.0) for s in slugs}
    tot = sum(raw.values())
    mkt = {s: raw[s] / tot for s in slugs}

    mz = dict(zip(slugs, zscore([math.log(mkt[s]) for s in slugs])))
    ez = dict(zip(slugs, zscore([-math.log(elo_rank[s]) for s in slugs])))
    w = args.blend_market
    S = {s: w * mz[s] + (1 - w) * ez[s] + (args.host_bonus if s in HOSTS else 0.0) for s in slugs}

    mu, beta = args.mu, args.beta
    def lambdas(a, b):
        d = beta * (S[a] - S[b]) / 2.0
        return (min(6.0, max(0.05, mu * math.exp(d))),
                min(6.0, max(0.05, mu * math.exp(-d))))

    N = args.sims
    group_team_slugs = {g: [t["slug"] for t in gs[g]] for g in GROUPS}
    win_idx, run_idx, third_idx, third_score = {}, {}, {}, {}
    exp_pts = {s: 0.0 for s in slugs}
    win_group_ct = {s: 0 for s in slugs}
    fixtures = [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]
    for g in GROUPS:
        ts = group_team_slugs[g]
        pts = np.zeros((4, N)); gf = np.zeros((4, N)); ga = np.zeros((4, N))
        for a, b in fixtures:
            la, lb = lambdas(ts[a], ts[b])
            gk = frozenset((ts[a], ts[b]))
            if gk in group_goals and ts[a] in group_goals[gk] and ts[b] in group_goals[gk]:
                xa = np.full(N, group_goals[gk][ts[a]]); xb = np.full(N, group_goals[gk][ts[b]])
            else:
                xa = rng.poisson(la, N); xb = rng.poisson(lb, N)
            gf[a] += xa; ga[a] += xb; gf[b] += xb; ga[b] += xa
            pts[a] += np.where(xa > xb, 3, np.where(xa == xb, 1, 0))
            pts[b] += np.where(xb > xa, 3, np.where(xb == xa, 1, 0))
        gd = gf - ga
        score = pts * 1e6 + gd * 1e3 + gf + rng.random((4, N)) * 1e-2
        order = np.argsort(-score, axis=0)
        win_idx[g] = order[0]; run_idx[g] = order[1]; third_idx[g] = order[2]
        rows = np.arange(N)
        third_score[g] = score[third_idx[g], rows]
        for li in range(4):
            exp_pts[ts[li]] = float(pts[li].mean())
            win_group_ct[ts[li]] += int((win_idx[g] == li).sum())

    tscore = np.vstack([third_score[g] for g in GROUPS])
    torder = np.argsort(-tscore, axis=0)
    top8 = torder[:8, :]

    wL = {g: win_idx[g].tolist() for g in GROUPS}
    rL = {g: run_idx[g].tolist() for g in GROUPS}
    tL = {g: third_idx[g].tolist() for g in GROUPS}
    top8L = top8.T.tolist()

    advance = {s: 0 for s in slugs}
    r16 = {s: 0 for s in slugs}; qf = {s: 0 for s in slugs}
    sf = {s: 0 for s in slugs}; final = {s: 0 for s in slugs}; title = {s: 0 for s in slugs}

    slot_order = [75, 78, 79, 80, 81, 82, 83, 86]
    poiss = rng.poisson; rand = rng.random

    def play(a, b):
        la, lb = lambdas(a, b)
        ga_, gb_ = poiss(la), poiss(lb)
        if ga_ > gb_: return a, b
        if gb_ > ga_: return b, a
        p = 0.5 + 0.08 * math.tanh(S[a] - S[b])
        return (a, b) if rand() < p else (b, a)

    def round_of(m):
        if 73 <= m <= 88: return "Round of 32"
        if 89 <= m <= 96: return "Round of 16"
        if 97 <= m <= 100: return "Quarterfinals"
        if m in (101, 102): return "Semifinals"
        if m == 104: return "Final"
        return "Third Place Game"

    def resolve_ko(rnd, a, b):
        w = ko_winner.get((rnd, frozenset((a, b))))
        if w == a: return a, b
        if w == b: return b, a
        return play(a, b)

    for n in range(N):
        winner = {g: group_team_slugs[g][wL[g][n]] for g in GROUPS}
        runner = {g: group_team_slugs[g][rL[g][n]] for g in GROUPS}
        third = {g: group_team_slugs[g][tL[g][n]] for g in GROUPS}
        qgroups = set(GROUPS[i] for i in top8L[n])
        slotmap = bipartite_match(slot_order, qgroups)

        def side(spec):
            kind, ref = spec
            if kind == "W": return winner[ref]
            if kind == "R": return runner[ref]
            return third[slotmap[ref]]

        res = {}
        seen32 = set()
        for m in range(73, 89):
            a = side(R32[m][0]); b = side(R32[m][1])
            seen32.add(a); seen32.add(b)
            res[m] = resolve_ko("Round of 32", a, b)
        for m in list(range(89, 97)) + list(range(97, 101)) + [101, 102, 104]:
            a = res[WIN[m][0]][0]; b = res[WIN[m][1]][0]
            res[m] = resolve_ko(round_of(m), a, b)

        for s in seen32:
            advance[s] += 1
        for m in range(73, 89):
            r16[res[m][0]] += 1
        for m in range(89, 97):
            qf[res[m][0]] += 1
        for m in range(97, 101):
            sf[res[m][0]] += 1
        for m in (101, 102):
            final[res[m][0]] += 1
        title[res[104][0]] += 1

    def pct(c): return round(100.0 * c / N, 2)
    groups_out = {}
    for g in GROUPS:
        rowlist = []
        for t in gs[g]:
            s = t["slug"]
            rowlist.append({
                "slug": s, "name": name_of[s], "group": g,
                "exp_points": round(exp_pts[s], 2),
                "p_advance": pct(advance[s]),
                "p_win_group": pct(win_group_ct[s]),
                "elo_rank": elo_rank[s],
                "market_prob": round(100.0 * mkt[s], 2),
            })
        rowlist.sort(key=lambda r: (-r["p_advance"], -r["exp_points"]))
        groups_out[g] = rowlist

    deep = []
    for s in slugs:
        deep.append({
            "slug": s, "name": name_of[s], "group": group_of[s],
            "p_r16": pct(r16[s]), "p_qf": pct(qf[s]),
            "p_sf": pct(sf[s]), "p_final": pct(final[s]), "p_title": pct(title[s]),
            "market_prob": round(100.0 * mkt[s], 2),
        })
    deep.sort(key=lambda r: -r["p_title"])

    out = {
        "meta": {
            "tournament": "FIFA World Cup 2026",
            "generated_at": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "sims": N,
            "model": "Blended Elo + market odds, Poisson goals, Monte Carlo",
            "blend_market_weight": w, "beta": beta, "mu": mu, "host_bonus": args.host_bonus,
            "odds_source": odds_doc["source"], "odds_as_of": odds_doc["as_of"],
            "starts_iso": wc["tournament"]["starts_iso"],
            "pre_tournament": len(res_events) == 0,
            "results_as_of": res_doc.get("as_of"),
            "played_group": sum(1 for e in res_events if e["round"] == "Group"),
            "played_knockout": sum(1 for e in res_events if e["round"] != "Group"),
        },
        "groups": groups_out,
        "deep_runs": deep,
    }
    outpath = os.path.join(INTL, "wc2026-sim.json")
    json.dump(out, open(outpath, "w"), indent=1)
    print("wrote", outpath, "bytes", os.path.getsize(outpath))
    chk = sum(r["p_title"] for r in deep)
    print("sum title %% = %.1f  sum advance = %.1f (target 3200)" %
          (chk, sum(pct(advance[s]) for s in slugs)))
    print("Top 12 title odds:")
    for r in deep[:12]:
        print("  %-16s title %5.2f%% (mkt %5.2f%%)  SF %5.2f  Final %5.2f  adv %5.2f" %
              (r["name"], r["p_title"], r["market_prob"], r["p_sf"], r["p_final"],
               next(x["p_advance"] for x in groups_out[r["group"]] if x["slug"] == r["slug"])))


if __name__ == "__main__":
    main()
