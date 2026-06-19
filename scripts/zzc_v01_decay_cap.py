#!/usr/bin/env python3
"""
Zone Zero Cup — v0.1 proof (Olympics, decay + per-sport cap).

Adds two mechanics to the v0 proof:
  1. Exponential RECENCY DECAY: each year's medals are weighted by
     0.5 ** ((NOW - year) / HALFLIFE), so older results fade smoothly.
  2. Per-sport CAP: aggregate decayed points per (nation, sport), then count
     only each nation's best N sports (Directors'-Cup style, generous cap).

Reads public/data/olympics/medals-breakdown.json. Row schema:
    [slugIndex, year, season, sportIndex, gold, silver, bronze]
with the file's "slugs" and "sports" arrays as lookups.

Internal validation only. Writes internal/zzc-v01-output.md.
Prestige multipliers are 1.0 here (all Olympic sports equal); team-sport
pillars and their multipliers arrive in v1.
"""
import json
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BREAKDOWN = os.path.join(ROOT, "public", "data", "olympics", "medals-breakdown.json")
INDIC = os.path.join(ROOT, "public", "data", "country-indicators.json")
TEAMS = os.path.join(ROOT, "public", "data", "olympics", "teams.json")
OUT_MD = os.path.join(ROOT, "internal", "zzc-v01-output.md")

NOW = 2026
W_GOLD, W_SILVER, W_BRONZE = 4, 2, 1
PERCAP_MIN_MEDALS = 20

HALFLIFE_DEFAULT = 20          # years; tunable
CAP_DEFAULT = 10               # best-N sports counted


def decay(year, halflife):
    return 0.5 ** ((NOW - year) / halflife)


def load_meta():
    teams = json.load(open(TEAMS, encoding="utf-8"))
    special = {t["slug"]: bool(t.get("special")) for t in teams}
    name = {t["slug"]: t["name"] for t in teams}
    total_medals = {t["slug"]: t.get("total", 0) for t in teams}
    indic = json.load(open(INDIC, encoding="utf-8"))["countries"]
    pop = {}
    for slug, ci in indic.items():
        ind = ci.get("indicators", {})
        gdp = (ind.get("gdpUsd") or {}).get("value")
        gpc = (ind.get("gdpPerCapitaUsd") or {}).get("value")
        if gdp and gpc:
            pop[slug] = gdp / gpc
    return special, name, total_medals, pop


def compute(halflife, cap):
    bd = json.load(open(BREAKDOWN, encoding="utf-8"))
    slugs, sports, rows = bd["slugs"], bd["sports"], bd["rows"]
    # (slug, sport) -> decayed points
    sport_pts = defaultdict(float)
    for si, year, season, spi, g, s, b in rows:
        base = W_GOLD * g + W_SILVER * s + W_BRONZE * b
        if base == 0:
            continue
        sport_pts[(slugs[si], sports[spi])] += base * decay(year, halflife)
    # collapse to per-nation list of sport scores
    by_nation = defaultdict(list)
    for (slug, sport), pts in sport_pts.items():
        by_nation[slug].append(pts)
    merit = {}
    for slug, lst in by_nation.items():
        lst.sort(reverse=True)
        merit[slug] = sum(lst[:cap]) if cap else sum(lst)
    return merit


def main():
    special, name, total_medals, pop = load_meta()

    # primary run
    merit = compute(HALFLIFE_DEFAULT, CAP_DEFAULT)
    absolute = sorted(merit.items(), key=lambda kv: kv[1], reverse=True)

    # comparison runs to inform the open cap-N and half-life decisions
    variants = {
        "halflife=20, cap=10 (proposed)": compute(20, 10),
        "halflife=20, cap=15": compute(20, 15),
        "halflife=20, uncapped": compute(20, None),
        "halflife=12, cap=10 (sharper)": compute(12, 10),
        "halflife=40, cap=10 (gentler)": compute(40, 10),
    }

    def topn(m, n=12):
        return sorted(m.items(), key=lambda kv: kv[1], reverse=True)[:n]

    # per-capita on primary run
    pc = []
    for slug, mt in merit.items():
        if special.get(slug):
            continue
        if total_medals.get(slug, 0) < PERCAP_MIN_MEDALS:
            continue
        p = pop.get(slug)
        if not p:
            continue
        pc.append((slug, mt, p, mt / (p / 1e6)))
    pc.sort(key=lambda x: x[3], reverse=True)

    def fmt_pop(p):
        return f"{p/1e6:.1f}M" if p >= 1e6 else f"{p/1e3:.0f}k"

    L = []
    L.append("# Zone Zero Cup — v0.1 proof (Olympics, decay + per-sport cap)\n")
    L.append(f"Curve gold={W_GOLD}/silver={W_SILVER}/bronze={W_BRONZE}. "
             f"Recency decay half-life {HALFLIFE_DEFAULT}y. Cap = best {CAP_DEFAULT} sports. "
             f"Reference year {NOW}.\n")
    L.append("Decay weight = 0.5 ^ ((2026 - year) / half-life). At a 20y half-life a "
             "result from 2006 counts ~0.5, 1986 ~0.25, 1946 ~0.06.\n")

    L.append("\n## Absolute merit, proposed settings (top 25)\n")
    L.append("| # | Nation | Merit |")
    L.append("|---|---|---|")
    for i, (slug, mt) in enumerate(absolute[:25], 1):
        mark = " ‡" if special.get(slug) else ""
        L.append(f"| {i} | {name.get(slug, slug)}{mark} | {mt:.0f} |")

    L.append("\n## Per-capita merit, proposed settings (top 20)\n")
    L.append("| # | Nation | Merit | Pop | Merit / M |")
    L.append("|---|---|---|---|---|")
    for i, (slug, mt, p, pm) in enumerate(pc[:20], 1):
        L.append(f"| {i} | {name.get(slug, slug)} | {mt:.0f} | {fmt_pop(p)} | {pm:.2f} |")

    L.append("\n## Sensitivity: absolute top 12 under different settings\n")
    L.append("How the knobs change the ranking, to inform the cap-N and half-life calls.\n")
    for label, m in variants.items():
        names = ", ".join(name.get(s, s) for s, _ in topn(m, 12))
        L.append(f"- **{label}:** {names}")

    open(OUT_MD, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("Absolute top 5 (proposed):",
          ", ".join(f"{name.get(s,s)}={v:.0f}" for s, v in absolute[:5]))
    print("Per-capita top 5 (proposed):",
          ", ".join(f"{name.get(s,s)}={pm:.1f}" for s, _, _, pm in pc[:5]))
    print("Wrote", OUT_MD)


if __name__ == "__main__":
    main()
