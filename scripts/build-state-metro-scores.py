#!/usr/bin/env python3
"""
build-state-metro-scores.py
===========================
Population-weighted per-US-state Metro Power score.

For each US metro, the Municipality sheet of MetroAreas.xlsx gives the population
of every municipality and the state it sits in. Summing municipality population
by (metro, state) yields the share of a metro's population living in each state.
We allocate the metro's composite score (from public/data/metros.json) to each
state by that share, so a metro spanning state lines (New York across NY/NJ/CT/PA,
Kansas City across MO/KS, etc.) is split rather than counted in full for each.

Output: public/data/state-metro-scores.json
  { "<state-slug>": { "score": <weighted sum>, "metros": <distinct metros in state> } }

Usage:
  python scripts/build-state-metro-scores.py [path/to/MetroAreas.xlsx]
Defaults to ../MetroAreas.xlsx relative to the repo root (the OneDrive master is
the source of truth; sync it before regenerating).
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

from python_calamine import CalamineWorkbook  # pip install python-calamine

ROOT = Path(__file__).resolve().parents[1]
METROS = ROOT / "public" / "data" / "metros.json"
OUT = ROOT / "public" / "data" / "state-metro-scores.json"

# State display name -> site slug (three collide with same-named foreign states).
SPECIAL = {
    "Florida": "florida-united-states",
    "Maryland": "maryland-united-states",
    "Montana": "montana-united-states",
    "District of Columbia": "dc",
}


def state_slug(name: str) -> str:
    name = name.strip()
    return SPECIAL.get(name, name.lower().replace(" ", "-"))


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "MetroAreas.xlsx"
    if not xlsx.exists():
        sys.exit(f"workbook not found: {xlsx} (pass the path as an argument)")

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    mrows = metros if isinstance(metros, list) else metros.get("metros", metros)
    score_by_metro = {
        m["name"].strip(): (m.get("score") or 0.0)
        for m in mrows
        if m.get("countrySlug") == "united-states"
    }

    rows = CalamineWorkbook.from_path(str(xlsx)).get_sheet_by_name("Municipality").to_python(
        skip_empty_area=True
    )
    hdr = rows[0]
    ci = {n: i for i, n in enumerate(hdr)}
    C, ST, POP, M = (
        ci["Country"],
        ci["State/Region (ISO 3166-2)"],
        ci["Population"],
        ci["Metro Area"],
    )

    ms_pop: dict = defaultdict(float)
    m_total: dict = defaultdict(float)
    for r in rows[1:]:
        if str(r[C]).strip() != "United States":
            continue
        metro = str(r[M]).strip()
        st = str(r[ST]).strip()
        if not metro or not st:
            continue
        pop = r[POP] if isinstance(r[POP], (int, float)) else 0
        ms_pop[(metro, st)] += pop
        m_total[metro] += pop

    weighted: dict = defaultdict(float)
    counts: dict = defaultdict(int)
    unmatched = set()
    for (metro, st), pop in ms_pop.items():
        score = score_by_metro.get(metro)
        if score is None:
            unmatched.add(metro)
            continue
        total = m_total[metro]
        if total <= 0:
            continue
        weighted[state_slug(st)] += score * (pop / total)
        counts[state_slug(st)] += 1

    out = {
        slug: {"score": round(weighted[slug], 2), "metros": counts[slug]}
        for slug in weighted
        if slug != "dc"  # DC has a mayor, not a governor
    }
    OUT.write_text(json.dumps(out, indent=2, sort_keys=True), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(out)} states; {len(unmatched)} unmatched metro names")
    if unmatched:
        print("  unmatched (untracked in metros.json):", ", ".join(sorted(unmatched)))


if __name__ == "__main__":
    main()
