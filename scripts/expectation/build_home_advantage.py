#!/usr/bin/env python3
"""Home advantage, on one scale, for every sport that has an expectation ledger.

    python scripts/expectation/build_home_advantage.py --dry
    python scripts/expectation/build_home_advantage.py --write

OUTPUT  public/data/expectation/home-advantage.json

WHY ELO POINTS AND NOT HOME-WIN PERCENTAGE
🔴 Home-win share is NOT comparable across these two sports. About a quarter of
English league matches are drawn and almost no NFL game is tied, so football's
home-win share is structurally depressed by a quantity the NFL does not have.
The comparable measure is the RATING GAP a home side is effectively spotted,
which is what both models actually use, and for evenly matched sides that has a
closed form that divides the draws out:

    hfa = 400 * log10(home wins / away wins)

Ties and draws cancel from the ratio, so the same number means the same thing
in both sports: how many Elo points of team quality playing at home is worth.

WINDOW
Every point is a plain five-season moving window ENDING at that season, because
a single NFL season is only ~250 games and one football season ~380. This is a
descriptive series, not the model's input, so it includes the season it sits on
(the model's own trailing window deliberately does not - see
scripts/football/build_expectation.py).

WHAT IS COUNTED
NFL: REGULAR SEASON ONLY, and neutral-site games are excluded. Playoffs are
structurally home-heavy because the better team hosts, so leaving them in would
read as home advantage when it is really seeding. Football: all league matches;
the top flight has no neutral-site fixtures.

INPUTS are the two SHIPPED ledgers, not the workbooks, so this runs anywhere
the repo is checked out.
"""
import argparse, glob, json, math, os, sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PUB = os.path.join(ROOT, "public", "data")
FOOTBALL_INDEX = os.path.join(PUB, "football", "expectation", "index.json")
NFL_DIR = os.path.join(PUB, "nfl", "expectation")
OUT_DIR = os.path.join(PUB, "expectation")
WINDOW = 5


def hfa_from(home, away):
    """Elo points a home side is effectively spotted. Draws divide out."""
    if home <= 0 or away <= 0:
        return None
    return 400.0 * math.log10(home / away)


def rolled(rows):
    """rows: [(label, year, h, d, a)] in season order -> series with a WINDOW-season
    moving window ending at each season."""
    out = []
    for i, (label, year, h, d, a) in enumerate(rows):
        win = rows[max(0, i - WINDOW + 1): i + 1]
        H = sum(r[2] for r in win)
        D = sum(r[3] for r in win)
        A = sum(r[4] for r in win)
        n = H + D + A
        if n < 100:
            continue
        out.append({
            "season": label, "year": year, "games": h + d + a,
            "window_games": n,
            "home": round(H / n, 4), "draw": round(D / n, 4), "away": round(A / n, 4),
            "hfa": round(hfa_from(H, A) or 0.0, 1),
            "season_home": round(h / (h + d + a), 4) if (h + d + a) else None,
        })
    return out


def football_rows():
    d = json.load(open(FOOTBALL_INDEX, encoding="utf-8"))
    rows = []
    for s in d["seasons"]:
        n = s["matches"]
        rows.append((s["season"], int(s["season"][:4]) + 1,
                     round(s["home_win_pct"] * n), round(s["draw_pct"] * n),
                     round(s["away_win_pct"] * n)))
    return rows, d["meta"]["generated_at"]


def nfl_rows():
    rows = []
    files = sorted(glob.glob(os.path.join(NFL_DIR, "season-*.json")))
    if not files:
        raise SystemExit("no NFL season files under %s" % NFL_DIR)
    for p in files:
        d = json.load(open(p, encoding="utf-8"))
        h = t = a = 0
        for g in d.get("games", []):
            # 🔴 regular season, own stadium. See the module docstring.
            if g.get("playoff") or g.get("neutral"):
                continue
            r = g.get("result")
            if r == "H":
                h += 1
            elif r == "A":
                a += 1
            elif r == "T":
                t += 1
        if h + t + a == 0:
            continue
        season = int(d["season"])
        rows.append((str(season), season, h, t, a))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    frows, fgen = football_rows()
    nrows = nfl_rows()
    fser, nser = rolled(frows), rolled(nrows)
    if not fser or not nser:
        raise SystemExit("REFUSING: one of the series came back empty")

    for name, ser in (("football", fser), ("nfl", nser)):
        print("%-9s %d points  %s (%.0f) -> %s (%.0f)"
              % (name, len(ser), ser[0]["season"], ser[0]["hfa"], ser[-1]["season"], ser[-1]["hfa"]))
        peak = max(ser, key=lambda r: r["hfa"])
        print("            peak %s at %.0f; home-win share %.1f%% -> %.1f%%"
              % (peak["season"], peak["hfa"], 100 * ser[0]["home"], 100 * ser[-1]["home"]))

    payload = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "window": WINDOW,
            "measure": "hfa",
            "unit": "Elo points",
            "method": ("Home advantage as the rating gap a home side is effectively "
                       "spotted: 400*log10(home wins / away wins), over a %d-season "
                       "moving window ending at each season. Draws and ties divide "
                       "out of the ratio, which is what makes one scale legitimate "
                       "across a sport with draws and a sport without." % WINDOW),
            "counted": ("NFL regular season only, neutral-site games excluded, because "
                        "the better team hosts in the playoffs and that is seeding, not "
                        "home advantage. English tier-1 league matches, all of them."),
            "sources": ["public/data/football/expectation/index.json",
                        "public/data/nfl/expectation/season-*.json"],
            "football_ledger_generated_at": fgen,
        },
        "series": [
            # 🔴 The site's teal and amber, stepped DOWN to the lightness band
            # that passes the palette validator against --bg-card #12121A. The
            # bright pair (#4ECDC4 / #f59e0b) fails that check; both pairs pass
            # CVD separation and contrast comfortably, so this costs nothing.
            {"key": "football", "label": "English top flight", "accent": "#35A79F",
             "draws": True, "rows": fser},
            {"key": "nfl", "label": "NFL", "accent": "#C97A06", "draws": False, "rows": nser},
        ],
    }
    if a.dry or not a.write:
        print("--dry: nothing written (%.0f KB)" % (len(json.dumps(payload)) / 1024))
        return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    p = os.path.join(OUT_DIR, "home-advantage.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print("wrote %s (%.0f KB)" % (p, os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
