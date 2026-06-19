#!/usr/bin/env python3
"""
Zone Zero Cup — v0 proof engine (Olympics-only).

Reads the Olympic all-time medal table (public/data/olympics/teams.json) and the
country indicator panel (public/data/country-indicators.json). Computes a weighted
merit score per nation, then presents it in two views: absolute and per-capita.

This is an INTERNAL VALIDATION proof. It writes a sanity-check report to
internal/zzc-v0-output.md and a machine file to internal/zzc-v0.json.
It does NOT touch public/data or the live site.

Scoring curve (v0, documented + tunable):
    merit = 4*gold + 2*silver + 1*bronze   (weighted-medal points)

Population is DERIVED as gdpUsd / gdpPerCapitaUsd (country-indicators has no raw
population field). Special / split nations (USSR, East Germany, etc.) keep their
absolute score with a marker but are excluded from per-capita, since they have no
current population denominator.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS = os.path.join(ROOT, "public", "data", "olympics", "teams.json")
INDIC = os.path.join(ROOT, "public", "data", "country-indicators.json")
OUT_JSON = os.path.join(ROOT, "internal", "zzc-v0.json")
OUT_MD = os.path.join(ROOT, "internal", "zzc-v0-output.md")

# v0 scoring curve
W_GOLD, W_SILVER, W_BRONZE = 4, 2, 1
# per-capita is noisy for tiny medal hauls; require a floor of total medals
PERCAP_MIN_MEDALS = 20


def merit(g, s, b):
    return W_GOLD * g + W_SILVER * s + W_BRONZE * b


def main():
    teams = json.load(open(TEAMS, encoding="utf-8"))
    indic = json.load(open(INDIC, encoding="utf-8"))["countries"]

    rows = []
    for t in teams:
        g, s, b = t.get("g", 0), t.get("s", 0), t.get("b", 0)
        total = t.get("total", g + s + b)
        if merit(g, s, b) == 0:
            continue
        slug = t.get("slug")
        ci = indic.get(slug)
        pop = None
        if ci:
            ind = ci.get("indicators", {})
            gdp = (ind.get("gdpUsd") or {}).get("value")
            gpc = (ind.get("gdpPerCapitaUsd") or {}).get("value")
            if gdp and gpc:
                pop = gdp / gpc
        rows.append({
            "slug": slug,
            "name": t.get("name"),
            "code": t.get("code"),
            "special": bool(t.get("special")),
            "g": g, "s": s, "b": b, "total": total,
            "merit": merit(g, s, b),
            "population": pop,
            "merit_per_million": (merit(g, s, b) / (pop / 1e6)) if pop else None,
        })

    # Absolute ranking
    absolute = sorted(rows, key=lambda r: r["merit"], reverse=True)
    for i, r in enumerate(absolute, 1):
        r["abs_rank"] = i

    # Per-capita ranking: real current nations only, with a medal floor
    pc_pool = [r for r in rows if not r["special"]
               and r["merit_per_million"] is not None
               and r["total"] >= PERCAP_MIN_MEDALS]
    percap = sorted(pc_pool, key=lambda r: r["merit_per_million"], reverse=True)
    for i, r in enumerate(percap, 1):
        r["pc_rank"] = i

    # ---- machine output ----
    json.dump({
        "_meta": {
            "engine": "zone-zero-cup-v0-olympics",
            "curve": {"gold": W_GOLD, "silver": W_SILVER, "bronze": W_BRONZE},
            "percap_min_medals": PERCAP_MIN_MEDALS,
            "population_method": "derived: gdpUsd / gdpPerCapitaUsd",
            "scored_nations": len(rows),
        },
        "absolute": absolute,
        "per_capita": percap,
    }, open(OUT_JSON, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    # ---- human report ----
    def fmt_pop(p):
        if not p:
            return "n/a"
        if p >= 1e6:
            return f"{p/1e6:.1f}M"
        return f"{p/1e3:.0f}k"

    L = []
    L.append("# Zone Zero Cup — v0 proof output (Olympics-only)\n")
    L.append(f"Scoring curve: gold={W_GOLD}, silver={W_SILVER}, bronze={W_BRONZE}. "
             f"Nations with a non-zero score: {len(rows)}.\n")
    L.append("Population derived as GDP / GDP-per-capita. Per-capita view requires "
             f"a floor of {PERCAP_MIN_MEDALS} total medals and excludes defunct/split states.\n")

    L.append("\n## Absolute merit (top 25)\n")
    L.append("| # | Nation | G | S | B | Merit |")
    L.append("|---|---|---|---|---|---|")
    for r in absolute[:25]:
        mark = " ‡" if r["special"] else ""
        L.append(f"| {r['abs_rank']} | {r['name']}{mark} | {r['g']} | {r['s']} | {r['b']} | {r['merit']} |")

    L.append("\n## Per-capita merit (top 25, merit per million people)\n")
    L.append("| # | Nation | Merit | Pop | Merit / M |")
    L.append("|---|---|---|---|---|")
    for r in percap[:25]:
        L.append(f"| {r['pc_rank']} | {r['name']} | {r['merit']} | {fmt_pop(r['population'])} | {r['merit_per_million']:.1f} |")

    L.append("\n## Defunct / split states scored (‡ in absolute)\n")
    specials = [r for r in absolute if r["special"]]
    L.append(", ".join(f"{r['name']} (#{r['abs_rank']}, {r['merit']})" for r in specials) or "none flagged")

    open(OUT_MD, "w", encoding="utf-8").write("\n".join(L) + "\n")
    print(f"Scored {len(rows)} nations.")
    print(f"Absolute top 3: " + ", ".join(f"{r['name']}={r['merit']}" for r in absolute[:3]))
    print(f"Per-capita top 3: " + ", ".join(f"{r['name']}={r['merit_per_million']:.1f}" for r in percap[:3]))
    print(f"Wrote {OUT_JSON} and {OUT_MD}")


if __name__ == "__main__":
    main()
