#!/usr/bin/env python3
"""Goal differential per team per game, per season, from NHL.xlsx.

Feeds scripts/predictions/build_nhl_sim.py's STRENGTH_SEASONS without any
network call, which makes the sim runnable and checkable offline. The live
builder will prefer ESPN once the fetch half exists; this stays as the
offline path and as the thing --validate compares against.

Read-only. Never writes to the workbook.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_WB = os.path.join(ROOT, "workbooks", "NHL.xlsx")

# Resolved by HEADER TEXT, never by letter: the NHL workbook's own Formula
# Backup sheet disagrees with its live header row about column positions
# (established 2026-09-17 on the NBA workbook, same failure mode here).
HEADERS = {"season": "Season", "team": "Team", "gf": "GF", "ga": "GA",
           "phase": "Reg Sea / Playoff", "ha": "H/A"}

# 🔴 ERA-ACCURATE NAMES, FOLDED ONTO THE CURRENT ONE. The Regular Season sheet
# stores the name a club carried AT THE TIME, so the Utah franchise is "Hockey
# Club" in 2025 and "Mammoth" in 2026. Without this the Mammoth's rating is
# built from one season instead of two and is quietly weighted wrong, which
# looks like nothing at all in the output: a plausible rating for a team that
# only half exists.
#
# This is the SAME alias lib/nhl-standings.ts carries in its CANONICAL_OVERRIDE
# for ESPN's transitional label. The 2026-09-15 audit flagged that one as
# probably stale and worth verifying before deleting; it is not stale, and this
# is the second place that needs it. If a third appears, share one table.
ALIASES = {
    "Hockey Club": "Mammoth",
    "Coyotes": "Mammoth",
}


def _shared(z):
    out = []
    try:
        with z.open("xl/sharedStrings.xml") as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag == NS + "si":
                    out.append("".join(t.text or "" for t in el.iter(NS + "t")))
                    el.clear()
    except KeyError:
        pass
    return out


def _targets(z):
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    rmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    out = {}
    for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        t = rmap[rid].lstrip("/")
        out[name] = t if t.startswith("xl/") else "xl/" + t
    return out


def _col(ref):
    m = re.match(r"([A-Z]+)", ref or "")
    return m.group(1) if m else ""


def _rows(z, target, shared, want):
    with z.open(target) as f:
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != NS + "row":
                continue
            d = {}
            for c in el.iter(NS + "c"):
                cl = _col(c.get("r"))
                if want and cl not in want:
                    continue
                t = c.get("t")
                v = c.find(NS + "v")
                if v is None or v.text is None:
                    continue
                d[cl] = shared[int(v.text)] if t == "s" else v.text
            el.clear()
            yield d


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None


def goal_diff_by_season(path, seasons):
    z = zipfile.ZipFile(path)
    shared = _shared(z)
    target = _targets(z)["Regular Season"]

    header = {}
    for d in _rows(z, target, shared, None):
        for letter, val in d.items():
            if val:
                header[str(val).strip()] = letter
        break
    cols, missing = {}, []
    for key, label in HEADERS.items():
        if label in header:
            cols[key] = header[label]
        else:
            missing.append(label)
    if missing:
        raise SystemExit(f"FATAL: Regular Season missing column(s): {missing}. "
                         f"Refusing to guess a position.")
    inv = {v: k for k, v in cols.items()}

    agg = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
    seen = False
    for d in _rows(z, target, shared, set(cols.values())):
        if not seen:
            seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        s = _num(row.get("season"))
        if s is None or int(s) not in seasons:
            continue
        phase = str(row.get("phase") or "")
        if phase and "reg" not in phase.lower():
            continue
        gf, ga = _num(row.get("gf")), _num(row.get("ga"))
        team = str(row.get("team") or "").strip()
        team = ALIASES.get(team, team)
        if gf is None or ga is None or not team:
            continue
        cell = agg[int(s)][team]
        cell[0] += gf - ga
        cell[1] += 1
    z.close()
    return {s: {t: v[0] / v[1] for t, v in teams.items() if v[1] >= 40}
            for s, teams in agg.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workbook", default=DEFAULT_WB)
    ap.add_argument("--seasons", default="2025,2026")
    ap.add_argument("--json", action="store_true", help="Emit JSON, not a table.")
    a = ap.parse_args()
    seasons = {int(x) for x in a.seasons.split(",") if x.strip()}
    if not os.path.exists(a.workbook):
        print(f"FATAL: {a.workbook} not found. Run scripts/stage-leagues.py")
        return 1
    out = goal_diff_by_season(a.workbook, seasons)
    if a.json:
        print(json.dumps(out, indent=2, sort_keys=True))
        return 0
    for s in sorted(out):
        rows = sorted(out[s].items(), key=lambda kv: -kv[1])
        print(f"\n{s}  ({len(rows)} teams)")
        for t, gd in rows:
            print(f"   {t:<16} {gd:+.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
