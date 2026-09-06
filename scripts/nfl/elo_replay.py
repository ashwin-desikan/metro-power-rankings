#!/usr/bin/env python3
"""
Port the workbook's Elo shift rule to Python, and prove it against 106 seasons
before it is ever allowed to rate a live game.

WHY THIS EXISTS
---------------
The workbook's `Regular Season` sheet does NOT compute its own pre-game
ratings. DM (ELO Pre), DN (opponent pre) and DO (win probability) are PASTED
values from Neil Paine. Only the shift is a formula:

  DP =20*(LN(MAX(ABS(AC),1)+1)
         *(2.2/((IF(DR=0.5,1,IF(DR=1,(DM-DN+DS*65),-(DM-DN+DS*65))))*0.001+2.2)))
         *(DR-DO)
  DQ =DM+DP

For 2026 nothing is pasted, so if the site is to publish a rating during the
season it must generate the pre-game ratings itself. That is only legitimate if
the shift formula IS the rule that produced Paine's numbers. This script asks
that question in two separate ways, because they can give different answers:

  TEST A, formula reproduction. Given the workbook's OWN inputs, does this
  Python reproduce DP and DQ? This tests the port and nothing else. It should
  be exact to floating point.

  TEST B, chain reproduction. Seed from the season's week-0 rating and carry
  our OWN ratings forward game by game, never looking at a pasted value again.
  Compare our pre-game rating to Paine's pasted DM. This is the real question,
  because it is exactly the 2026 situation: a seed, then nothing.

🔴 A passes and B fails is the interesting outcome, not a contradiction. It
would mean the shift formula is a faithful description of what Paine's ratings
DID between two games, without being the rule that generates them, and the site
could not own the live chain without either fitting its own rule or continuing
to take Paine's. Do not report A as if it answered B.

Seasons are replayed INDEPENDENTLY, each starting from its own week-0 seed, so
the offseason regression rule is never under test here. That is deliberate: it
is also how 2026 would run, from a seed Ashwin has already entered.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROOT = Path(__file__).resolve().parent.parent.parent
HFA = 65.0
K_BASE = 20.0


def elo_prob(elo_for: float, elo_against: float, home: float) -> float:
    """The workbook's DO column, derived rather than pasted. Verified against
    Regular Season row 36380 to 2.2e-11."""
    return 1.0 / (1.0 + 10.0 ** (-(elo_for - elo_against + home * HFA) / 400.0))


def elo_shift(margin: float, result: float, prob: float,
              elo_for: float, elo_against: float, home: float) -> float:
    """A literal port of the DP formula. The inner term is the margin-of-victory
    multiplier that damps a blowout by the favourite and rewards an upset; the
    winner's rating edge enters it signed, which is what stops a strong team
    farming rating off weak opponents."""
    edge = elo_for - elo_against + home * HFA
    if result == 0.5:
        k = 1.0
    elif result == 1.0:
        k = edge
    else:
        k = -edge
    mov = math.log(max(abs(margin), 1.0) + 1.0) * (2.2 / (k * 0.001 + 2.2))
    return K_BASE * mov * (result - prob)


# ------------------------------------------------------------------ workbook

G = {"season": "B", "week": "D", "phase": "E", "date": "H", "result": "M",
     "pf": "Q", "pa": "R", "ha": "W", "diff": "AC", "name": "DK", "opp": "DL",
     "elo_pre": "DM", "opp_pre": "DN", "prob": "DO", "shift": "DP", "post": "DQ",
     "res_num": "DR", "ha_num": "DS", "gid": "EE"}
S = {"season": "E", "week": "D", "name": "AY", "elo": "AI"}


def num(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


class Book:
    def __init__(self, path: Path):
        self.z = zipfile.ZipFile(path)
        self.shared = []
        try:
            with self.z.open("xl/sharedStrings.xml") as f:
                for _, el in ET.iterparse(f, events=("end",)):
                    if el.tag == NS + "si":
                        self.shared.append("".join(t.text or "" for t in el.iter(NS + "t")))
                        el.clear()
        except KeyError:
            pass
        wb = self.z.read("xl/workbook.xml").decode("utf-8", "replace")
        rels = self.z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
        rmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
        self.targets = {}
        for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
            t = rmap[rid].lstrip("/")
            self.targets[name] = t if t.startswith("xl/") else "xl/" + t

    def rows(self, sheet: str, cols: dict):
        want = set(cols.values())
        inv = {v: k for k, v in cols.items()}
        first = True
        with self.z.open(self.targets[sheet]) as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag != NS + "row":
                    continue
                d = {}
                for c in el.iter(NS + "c"):
                    m = re.match(r"([A-Z]+)", c.get("r") or "")
                    cl = m.group(1) if m else ""
                    if cl not in want:
                        continue
                    v = c.find(NS + "v")
                    if v is None or v.text is None:
                        continue
                    d[inv[cl]] = self.shared[int(v.text)] if c.get("t") == "s" else v.text
                el.clear()
                if first:
                    first = False
                    continue
                yield d


def load_games(book: Book):
    """One row per GAME, from the two-rows-per-game log. The home row is kept."""
    seen = {}
    for d in book.rows("Regular Season", G):
        se, wk = num(d.get("season")), num(d.get("week"))
        nm, opp = d.get("name"), d.get("opp")
        if se is None or wk is None or not nm or not opp:
            continue
        ha = (d.get("ha") or "").strip()
        neutral = ha not in ("vs", "at")
        home_row = (ha == "vs") or neutral
        key = (int(se), int(wk), d.get("date"), *sorted([str(nm), str(opp)]))
        if key in seen and not home_row:
            continue
        rec = {
            "season": int(se), "week": int(wk), "date": num(d.get("date")),
            "neutral": neutral,
            "for": str(nm), "against": str(opp),
            "elo_pre": num(d.get("elo_pre")), "opp_pre": num(d.get("opp_pre")),
            "prob": num(d.get("prob")), "shift": num(d.get("shift")),
            "post": num(d.get("post")),
            "res": num(d.get("res_num")), "ha_num": num(d.get("ha_num")),
            "diff": num(d.get("diff")),
            "phase": d.get("phase"),
        }
        if key in seen and home_row:
            seen[key] = rec
        else:
            seen.setdefault(key, rec)
    return sorted(seen.values(), key=lambda g: (g["season"], g["date"] or 0, g["week"], g["for"]))


def load_seeds(book: Book):
    """Week-0 rating per (season, franchise): the only input a replay gets."""
    out = {}
    for d in book.rows("NFL Standings", S):
        se, wk, nm, e = num(d.get("season")), num(d.get("week")), d.get("name"), num(d.get("elo"))
        if se is None or wk is None or not nm or e is None:
            continue
        if int(wk) == 0:
            out[(int(se), str(nm))] = e
    return out


def test_a(games):
    """Formula reproduction, on the workbook's own inputs.

    🔴 DO NOT ADD A `DM + DP == DQ` ASSERTION HERE. It was here, it reported a
    worst error of 372, and it was measuring nothing. Counted 2026-09-06:
    35,529 of the 36,935 DQ cells are PASTED VALUES and only 1,406 (2023 on)
    carry `=DM+DP`. So for 96% of games DQ is Paine's own post-game rating, and
    DM+DP vs DQ compares the workbook's shift formula against Paine's actual
    result. That is a measurement worth having, and it is reported below as
    `vs_source`, but it is NOT a test and a large value is not a failure. The
    only assertion in this function is that the port reproduces DP.
    """
    worst_dp = 0.0
    n = bad = 0
    worst_row = None
    src = []
    for g in games:
        if None in (g["elo_pre"], g["opp_pre"], g["prob"], g["shift"], g["res"], g["ha_num"], g["diff"]):
            continue
        n += 1
        dp = elo_shift(g["diff"], g["res"], g["prob"], g["elo_pre"], g["opp_pre"], g["ha_num"])
        e_dp = abs(dp - g["shift"])
        if e_dp > worst_dp:
            worst_dp, worst_row = e_dp, g
        if g["post"] is not None:
            src.append(abs((g["elo_pre"] + dp) - g["post"]))
        if e_dp > 1e-6:
            bad += 1
    src.sort()
    return {"games": n, "worst_shift_error": worst_dp, "over_1e-6": bad,
            "vs_source": None if not src else {
                "games": len(src), "median": src[len(src) // 2],
                "p95": src[int(len(src) * 0.95)], "max": src[-1]},
            "worst_row": None if not worst_row else
            {k: worst_row[k] for k in ("season", "week", "for", "against", "diff", "res")}}


def test_b(games, seeds):
    """Chain reproduction: seed, then carry OUR ratings, never look back."""
    by_season = defaultdict(list)
    for g in games:
        by_season[g["season"]].append(g)

    per_season = []
    for se in sorted(by_season):
        rating = {}
        errs = []
        used = 0
        for g in by_season[se]:
            if g["res"] is None or g["diff"] is None:
                continue
            a, b = g["for"], g["against"]
            for t in (a, b):
                if t not in rating:
                    s = seeds.get((se, t))
                    if s is None:
                        rating[t] = None
                    else:
                        rating[t] = s
            if rating.get(a) is None or rating.get(b) is None:
                continue
            ra, rb = rating[a], rating[b]
            home = g["ha_num"] if g["ha_num"] is not None else 0.0
            # What the workbook says our pre-game rating should have been.
            if g["elo_pre"] is not None:
                errs.append(abs(ra - g["elo_pre"]))
                used += 1
            p = elo_prob(ra, rb, home)
            d = elo_shift(g["diff"], g["res"], p, ra, rb, home)
            rating[a] = ra + d
            rating[b] = rb - d
        if used:
            errs.sort()
            per_season.append({
                "season": se, "games": used,
                "mean": sum(errs) / len(errs),
                "median": errs[len(errs) // 2],
                "p95": errs[int(len(errs) * 0.95)],
                "max": errs[-1],
            })
    return per_season


def self_test() -> int:
    fails = []
    # The probability against the workbook's own pasted value.
    p = elo_prob(1610.675837, 1711.392234, -1)
    if abs(p - 0.278093094) > 1e-8:
        fails.append(f"elo_prob {p}")
    # The shift against the workbook's own computed value on the same row.
    d = elo_shift(-35.0, 0.0, 0.278093094, 1610.675837, 1711.392234, -1)
    if abs(d - (-18.534885369915973)) > 1e-9:
        fails.append(f"elo_shift {d} != -18.534885369915973")
    # A draw takes the k=1 branch, so it cannot blow up on a zero edge.
    if not math.isfinite(elo_shift(0.0, 0.5, 0.5, 1500.0, 1500.0, 0.0)):
        fails.append("draw branch not finite")
    # Zero margin still moves the rating: MAX(|0|,1) floors it at 1.
    if abs(elo_shift(0.0, 1.0, 0.5, 1500.0, 1500.0, 0.0)) < 1e-9:
        fails.append("a one-point win moved nothing")
    # The shift is antisymmetric in result for a symmetric pairing.
    up = elo_shift(10, 1.0, 0.5, 1500, 1500, 0)
    dn = elo_shift(10, 0.0, 0.5, 1500, 1500, 0)
    if abs(up + dn) > 1e-9:
        fails.append(f"not antisymmetric: {up} {dn}")
    for f in fails:
        print(f"  FAIL {f}")
    print(f"[self-test] {5 - len(fails)}/5 checks passed")
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workbook", default=str(ROOT / "workbooks" / "NFL_all.xlsx"))
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--json", default=None)
    args = ap.parse_args(argv)

    rc = self_test()
    if args.self_test:
        return rc
    if rc:
        print("ABORT: self-test failed")
        return rc

    wb = Path(args.workbook)
    print(f"reading {wb.name} ({wb.stat().st_size / 1e6:.1f} MB)")
    book = Book(wb)
    games = load_games(book)
    seeds = load_seeds(Book(wb))
    print(f"games: {len(games):,}  seeds: {len(seeds):,}")

    a = test_a(games)
    print("\nTEST A - formula reproduction, on the workbook's own inputs")
    print(f"  games compared     {a['games']:,}")
    print(f"  worst |shift err|  {a['worst_shift_error']:.3e}")
    print(f"  over 1e-6          {a['over_1e-6']}")
    print(f"  {'PASS' if a['over_1e-6'] == 0 else 'FAIL'} - the port {'is' if a['over_1e-6'] == 0 else 'is NOT'} the workbook's formula")
    if a["vs_source"]:
        v = a["vs_source"]
        print(f"\n  MEASUREMENT, not a test: the workbook's shift against Paine's own post rating")
        print(f"  (DQ is a pasted value on 35,529 of 36,935 rows, so this compares two sources)")
        print(f"  median {v['median']:.2f}   p95 {v['p95']:.2f}   max {v['max']:.2f} Elo over {v['games']:,} games")

    b = test_b(games, seeds)
    print("\nTEST B - chain reproduction, seeded then carried, vs Paine's pasted pre-ratings")
    print(f"  {'season':>7} {'games':>6} {'mean':>9} {'median':>9} {'p95':>9} {'max':>9}")
    for r in b[-12:]:
        print(f"  {r['season']:>7} {r['games']:>6} {r['mean']:>9.2f} {r['median']:>9.2f} {r['p95']:>9.2f} {r['max']:>9.2f}")
    if b:
        allm = [r["mean"] for r in b]
        print(f"\n  across {len(b)} seasons: mean-of-means {sum(allm)/len(allm):.2f} Elo, "
              f"worst season mean {max(allm):.2f} ({max(b, key=lambda r: r['mean'])['season']}), "
              f"best {min(allm):.2f} ({min(b, key=lambda r: r['mean'])['season']})")
    if args.json:
        Path(args.json).write_text(json.dumps({"a": a, "b": b}, indent=1), encoding="utf-8")
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
