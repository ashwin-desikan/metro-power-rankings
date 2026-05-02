#!/usr/bin/env python3
"""
Generate the dimension-based badge CSVs with significance thresholds:

  public/data/global-gateway.csv     airport_score >= 5
  public/data/finance-capital.csv    marketCap >= $300B
  public/data/culture-capital.csv    culture_score >= 30 OR regional top 3
  public/data/sports-mecca.csv       sports_score >= 40
  public/data/rail-hub.csv           rail_score >= 130

Replaces the prior top-100 cap with editorial floors that capture only the
metros meaningfully significant on each dimension. Culture Capital adds a
regional-top-3 fallback so even small regions get representation.

Run after every ETL refresh.
"""

import csv
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METROS_JSON = ROOT / "public" / "data" / "metros.json"
DETAILS_DIR = ROOT / "public" / "data" / "details"

THRESHOLDS = {
    "airport_score": 5.0,
    "marketCap": 300_000_000_000.0,
    "culture_score": 30.0,
    "sports_score": 40.0,
    "rail_score": 130.0,
}


def load_metros():
    return json.load(open(METROS_JSON, "r", encoding="utf-8"))


def get_dims(slug):
    p = DETAILS_DIR / f"{slug}.json"
    if not p.exists():
        return {}
    d = json.load(open(p, "r", encoding="utf-8"))
    return (d.get("metro") or d).get("dims") or {}


def airport_score(s): return get_dims(s).get("airportScore", 0) or 0
def market_cap(s):    return get_dims(s).get("marketCap", 0) or 0


def culture_score(s):
    d = get_dims(s)
    return (d.get("culturalEvents", 0) or 0) + (d.get("museumsLandmarks", 0) or 0) + (d.get("luxuryStars", 0) or 0)


def sports_score(s):
    d = get_dims(s)
    return 2 * (d.get("majorLeagueTeams", 0) or 0) + (d.get("totalTeams", 0) or 0) + 3 * (d.get("majorSportingEvents", 0) or 0)


def rail_score(s):
    d = get_dims(s)
    return (d.get("metroStations", 0) or 0) + 0.5 * (d.get("suburbStations", 0) or 0) + 5 * (d.get("trainHubs", 0) or 0)


def emit_csv(metros, value_fn, value_col, threshold, out_path, regional_fallback_top=0):
    """Emit a sorted CSV of metros that clear `threshold` on `value_fn`. If
    regional_fallback_top > 0, also include each region's top N by value, even
    if those entries fall below the threshold."""
    rows = []
    seen = set()
    for m in metros:
        v = value_fn(m["slug"])
        if v >= threshold:
            rows.append({
                "rank": m["rank"], "slug": m["slug"], "name": m["name"], "country": m["country"],
                "score": m["score"], "pop": m["pop"], value_col: v,
            })
            seen.add(m["slug"])

    if regional_fallback_top > 0:
        # Group remaining metros by region, take top N each, add if not already in
        by_region = {}
        for m in metros:
            if m["slug"] in seen:
                continue
            v = value_fn(m["slug"])
            if v <= 0:
                continue
            r = m.get("region") or "Other"
            by_region.setdefault(r, []).append((v, m))
        for region, items in by_region.items():
            items.sort(key=lambda t: -t[0])
            for v, m in items[:regional_fallback_top]:
                rows.append({
                    "rank": m["rank"], "slug": m["slug"], "name": m["name"], "country": m["country"],
                    "score": m["score"], "pop": m["pop"], value_col: v,
                })

    rows.sort(key=lambda r: -r[value_col])
    cols = ["rank", "slug", "name", "country", "score", "pop", value_col]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    print(f"wrote {out_path.relative_to(ROOT)}: {len(rows)} rows")
    return len(rows)


def main():
    metros = load_metros()
    n_gg = emit_csv(metros, airport_score, "airport_score", THRESHOLDS["airport_score"],
                    ROOT / "public" / "data" / "global-gateway.csv")
    n_fc = emit_csv(metros, market_cap, "marketCap", THRESHOLDS["marketCap"],
                    ROOT / "public" / "data" / "finance-capital.csv")
    n_cc = emit_csv(metros, culture_score, "culture_score", THRESHOLDS["culture_score"],
                    ROOT / "public" / "data" / "culture-capital.csv", regional_fallback_top=3)
    n_sm = emit_csv(metros, sports_score, "sports_score", THRESHOLDS["sports_score"],
                    ROOT / "public" / "data" / "sports-mecca.csv")
    n_rh = emit_csv(metros, rail_score, "rail_score", THRESHOLDS["rail_score"],
                    ROOT / "public" / "data" / "rail-hub.csv")
    print()
    print(f"Counts: Global Gateway {n_gg}, Finance Capital {n_fc}, Culture Capital {n_cc}, Sports Mecca {n_sm}, Rail Hub {n_rh}")


if __name__ == "__main__":
    main()
