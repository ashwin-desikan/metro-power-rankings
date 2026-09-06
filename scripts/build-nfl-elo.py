#!/usr/bin/env python3
"""
Build the NFL weekly-Elo spine from NFL_all.xlsx.

WHAT THIS IS
------------
`NFL Standings` in the workbook holds one row per team-week-season, 1920-2026,
and every one carries an Elo rating and a league rank: 48,637 team-weeks with no
gaps. Neil Paine publishes the ratings. Nobody publishes them as a browsable
week-by-week history. This script turns that sheet into two projections:

  public/data/nfl/elo/index.json          per-season summary, every season
  public/data/nfl/elo/seasons/<year>.json one season, 32-ish teams x 23 weeks
  public/data/nfl/elo/franchises.json     season-resolution career series

Two projections rather than one file, for the same reason the football
expectation ledger splits index from clubs: a season hub wants one season, a
team page wants one franchise's whole life, and neither should pay for the other.

RULINGS THAT ARE ENCODED HERE, NOT GUESSED
------------------------------------------
🔴 ONE ELO POOL PER SEASON, STANDINGS SPLIT BY LEAGUE. In 1946-49 the NFL and
   AAFC ran at once, and in 1960-69 the NFL and AFL did. The workbook rates every
   team in a season against every other regardless of league, and Ashwin
   confirmed that is deliberate. So `rank` is league-agnostic and `league` is
   carried on every team so a hub can split the STANDINGS without splitting the
   ratings.

🔴 A CARRIED WEEK IS NOT A MEASURED WEEK. Bye weeks and post-elimination weeks
   inherit the previous week's rating (2025 Bills read 1661.557 at weeks 21 and
   22). Those are marked `carried: true` so a chart can draw them as held rather
   than asserting a measurement nobody took.

🔴 WEEK 0 IS THE PRESEASON SEED, AND ITS LABEL LIES. The `Reg/Play` column calls
   week 0 "Preseason" in 2024 and "Reg. Season" from 2025. Filter on `week == 0`,
   never on the label.

🔴 THE BUILD REFUSES A BROKEN SEASON RATHER THAN PUBLISHING ONE. As of
   2026-09-06 the 2026 rows past week 0 read 6.9283225680685128 for every team,
   because the shift formula collapses to 20*ln(2)*(2.2/2.201)*0.5 when there is
   no result and no pre-game rating; and the 2026 ELO Rank formula ranks against
   the 2025 row range, so every team returns rank 1. A season whose Elo is
   non-numeric, or identical across every team in a played week, is emitted with
   status "seeded" or "broken" and its bad weeks are dropped. It is never
   silently rendered as a flat line at 6.93.

PROBABILITY
-----------
The workbook's `ELO Prob (Pre)` is a pasted value from Paine, which is why a
pre-game probability was never available before the game. It does not need to be
pasted: it is the standard logistic on the two ratings with a 65-point home
advantage, and it reproduces the workbook's own column to 2.2e-11. See
`win_probability` and its self-test. That is what lets the 2026 preseason board
publish week-1 probabilities before a snap is played.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "nfl" / "elo"

# The home-field constant inside the workbook's own ELO Shift formula (DS*65).
HFA_ELO = 65.0
# Excel's 1900 date system, with its deliberate 1900-leap-year bug.
EPOCH = dt.date(1899, 12, 30)


def win_probability(elo_for: float, elo_against: float, home: int) -> float:
    """Pre-game win probability for the FOR side. `home` is 1 vs, -1 at, 0 neutral.

    Verified against the workbook's own pasted column: row 36380 of Regular
    Season (2025, Elo 1610.675837 away at 1711.392234) gives 0.278093094 here
    and 0.278093094 there, a delta of 2.2e-11.
    """
    diff = elo_for - elo_against + home * HFA_ELO
    return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))


def serial_to_iso(v) -> str | None:
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    if n < 1 or n > 80000:
        return None
    return (EPOCH + dt.timedelta(days=n)).isoformat()


def num(v):
    """A float, or None for blanks and for Excel error strings."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


# --------------------------------------------------------------- xlsx reading

class Book:
    """A streaming reader. openpyxl loads the 115 MB NFL Standings sheet whole;
    this walks it row by row and keeps only the columns asked for."""

    def __init__(self, path: Path):
        self.z = zipfile.ZipFile(path)
        self.shared = self._shared()
        self._targets = self._sheet_targets()

    def _shared(self):
        out = []
        try:
            with self.z.open("xl/sharedStrings.xml") as f:
                for _, el in ET.iterparse(f, events=("end",)):
                    if el.tag == NS + "si":
                        out.append("".join(t.text or "" for t in el.iter(NS + "t")))
                        el.clear()
        except KeyError:
            pass
        return out

    def _sheet_targets(self):
        wb = self.z.read("xl/workbook.xml").decode("utf-8", "replace")
        rels = self.z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
        rmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
        out = {}
        for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
            t = rmap[rid].lstrip("/")
            out[name] = t if t.startswith("xl/") else "xl/" + t
        return out

    @staticmethod
    def _col(ref: str) -> str:
        m = re.match(r"([A-Z]+)", ref or "")
        return m.group(1) if m else ""

    def rows(self, sheet: str, want: set[str]):
        """Yield (row_number, {column_letter: value}). Error cells yield their
        error text ('#DIV/0!'), which the caller must treat as absent."""
        with self.z.open(self._targets[sheet]) as f:
            for _, el in ET.iterparse(f, events=("end",)):
                if el.tag != NS + "row":
                    continue
                r = int(el.get("r") or 0)
                d = {}
                for c in el.iter(NS + "c"):
                    cl = self._col(c.get("r"))
                    if cl not in want:
                        continue
                    t = c.get("t")
                    if t == "inlineStr":
                        ise = c.find(NS + "is")
                        d[cl] = "".join(x.text or "" for x in ise.iter(NS + "t")) if ise is not None else ""
                        continue
                    v = c.find(NS + "v")
                    if v is None or v.text is None:
                        continue
                    d[cl] = self.shared[int(v.text)] if t == "s" else v.text
                el.clear()
                yield r, d


# ------------------------------------------------------------------- the spine

# NFL Standings columns. Named so a reader does not have to hold the letters.
S = {
    "league": "B", "gm": "C", "week": "D", "season": "E", "conf": "F", "div": "G",
    "city": "H", "team": "I", "w": "J", "l": "K", "t": "L", "pf": "N", "pa": "O",
    "divpos": "S", "gb_div": "T", "wc": "U", "gb_wc": "V",
    "week_end": "AG", "phase": "AH", "elo": "AI", "rank": "AJ", "seed": "AK",
    # AR-AX are the year-end context VLOOKUP'd from Year by Year, identical on
    # every week row of a team-season: what the season ended up being.
    "play_app": "AR", "div_title": "AS", "best_conf": "AT", "best_rec": "AU",
    "cf_app": "AV", "champ_app": "AW", "champ": "AX",
    "name": "AY",
}
S_WANT = set(S.values())


def read_standings(book: Book):
    """One dict per team-week, in sheet order. Sheet order is season then team
    then week, which is what the season and franchise passes both rely on."""
    inv = {v: k for k, v in S.items()}
    header_seen = False
    for r, d in book.rows("NFL Standings", S_WANT):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        season = num(row.get("season"))
        week = num(row.get("week"))
        name = row.get("name")
        if season is None or week is None or not name:
            continue
        yield {
            "season": int(season),
            "week": int(week),
            "name": str(name),
            "league": row.get("league") or None,
            "conf": row.get("conf") or None,
            "div": row.get("div") or None,
            "city": row.get("city") or None,
            "team": row.get("team") or None,
            "gm": num(row.get("gm")),
            "w": num(row.get("w")), "l": num(row.get("l")), "t": num(row.get("t")),
            "pf": num(row.get("pf")), "pa": num(row.get("pa")),
            "divpos": row.get("divpos") or None,
            "gb_div": num(row.get("gb_div")),
            "wc": row.get("wc") or None,
            "seed": row.get("seed") or None,
            "phase": row.get("phase") or None,
            "flags": {k: row.get(k) for k in
                      ("play_app", "div_title", "best_conf", "best_rec",
                       "cf_app", "champ_app", "champ")},
            "date": serial_to_iso(row.get("week_end")),
            "elo": num(row.get("elo")),
            "rank": num(row.get("rank")),
        }


def classify(season: int, weeks: dict[int, list[dict]]) -> tuple[str, set[int]]:
    """Return (status, weeks_to_drop).

    status is one of:
      final   every week carries a plausible, varying Elo
      seeded  week 0 is sound and later weeks are not (a season not yet played)
      broken  week 0 is unusable too

    🔴 The test that catches 2026 is NOT "is the number missing". The number is
    present: it is 6.9283225680685128 for all 32 teams. The test is that a week
    in which every team shares one rating carries no information, whatever that
    rating is.
    """
    bad = set()
    for wk, rows in weeks.items():
        elos = [r["elo"] for r in rows if r["elo"] is not None]
        if len(elos) < 2:
            bad.add(wk)
            continue
        if max(elos) - min(elos) < 1e-9:
            bad.add(wk)
            continue
        # A real NFL Elo lives near 1500. Anything outside this is a formula
        # artefact, not a rating.
        if min(elos) < 800 or max(elos) > 2200:
            bad.add(wk)
    if not bad:
        return "final", bad
    if 0 in bad:
        return "broken", bad
    return "seeded", bad


def build(book: Book) -> dict:
    by_season: dict[int, dict[str, dict]] = defaultdict(dict)
    weeks_by_season: dict[int, dict[int, list]] = defaultdict(lambda: defaultdict(list))
    total = 0

    for row in read_standings(book):
        total += 1
        se, nm = row["season"], row["name"]
        t = by_season[se].setdefault(nm, {
            "name": nm, "city": row["city"], "team": row["team"],
            "league": row["league"], "conf": row["conf"], "div": row["div"],
            "flags": {}, "weeks": {},
        })
        # Year-end context, identical on every week row of a team-season.
        # 🔴 THE VOCABULARY IS "Y" OR "0", NOT "Y" OR BLANK. Storing the raw
        # cell made every flag truthy, because "0" is a non-empty string: the
        # first build had all 24 teams winning the 1966 championship and the
        # 49ers winning 2026 before a snap. Normalise to a real boolean here,
        # once, so no consumer can repeat the mistake.
        for fk, fv in (row.get("flags") or {}).items():
            if str(fv).strip().upper() == "Y":
                t["flags"][fk] = True
        # Later rows win on identity, so a team that changed city mid-history
        # shows the name it carried that season.
        for k in ("city", "team", "league", "conf", "div"):
            if row[k]:
                t[k] = row[k]
        t["weeks"][row["week"]] = row
        weeks_by_season[se][row["week"]].append(row)

    seasons_out = []
    index_rows = []
    franchise_seasons: dict[str, list] = defaultdict(list)

    for se in sorted(by_season):
        status, bad = classify(se, weeks_by_season[se])
        teams_out = []
        for nm, t in sorted(by_season[se].items()):
            wks = []
            prev_elo = None
            for wk in sorted(t["weeks"]):
                if wk in bad:
                    continue
                r = t["weeks"][wk]
                elo = r["elo"]
                if elo is None:
                    continue
                # A week whose rating is unchanged from the previous one and
                # whose game count did not move is a bye or a post-elimination
                # hold, not a fresh measurement.
                carried = prev_elo is not None and abs(elo - prev_elo) < 1e-9
                entry = {
                    "w": wk,
                    "e": round(elo, 1),
                    "r": int(r["rank"]) if r["rank"] is not None else None,
                }
                if r["w"] is not None:
                    entry["rec"] = [int(r["w"] or 0), int(r["l"] or 0), int(r["t"] or 0)]
                if r["pf"] is not None and r["pa"] is not None:
                    entry["pts"] = [int(r["pf"]), int(r["pa"])]
                if r["divpos"]:
                    entry["dv"] = r["divpos"]
                if r["date"]:
                    entry["d"] = r["date"]
                if carried:
                    entry["carried"] = True
                if wk == 0:
                    entry["seed"] = True
                # 🔴 The phase is what tells a chart where the regular season
                # stopped. It cannot be inferred from the week number: the week
                # the playoffs start moved repeatedly, and in 1946-49 and
                # 1960-69 the two leagues did not start theirs together.
                if r["phase"]:
                    entry["ph"] = r["phase"]
                wks.append(entry)
                prev_elo = elo
            if not wks:
                continue
            rated = [x for x in wks if not x.get("carried")]
            peak = max(rated or wks, key=lambda x: x["e"])
            trough = min(rated or wks, key=lambda x: x["e"])
            teams_out.append({
                "name": nm, "city": t["city"], "team": t["team"],
                "league": t["league"], "conf": t["conf"], "div": t["div"],
                "flags": {k: True for k, v in t["flags"].items() if v is True},
                "start": wks[0]["e"], "end": wks[-1]["e"],
                "peak": {"w": peak["w"], "e": peak["e"]},
                "trough": {"w": trough["w"], "e": trough["e"]},
                "weeks": wks,
            })
            franchise_seasons[nm].append({
                "season": se,
                "start": wks[0]["e"], "end": wks[-1]["e"],
                "peak": peak["e"], "peak_w": peak["w"],
                "trough": trough["e"], "trough_w": trough["w"],
                "rank_end": wks[-1]["r"],
                "weeks": len(wks),
                "status": status,
            })

        # The last week any team in a league was still in the regular season.
        # Per league, because in 1946-49 and 1960-69 they diverged.
        # 🔴 Week 0 is the preseason seed and is labelled "Reg. Season" from
        # 2025 on, so it must be excluded or a season with only a seed reports
        # its regular season ending at week 0.
        reg_end = {}
        for t in teams_out:
            lg = t["league"] or "NFL"
            for w in t["weeks"]:
                if w["w"] > 0 and (w.get("ph") or "").startswith("Reg"):
                    reg_end[lg] = max(reg_end.get(lg, 0), w["w"])
        leagues = sorted({t["league"] for t in teams_out if t["league"]})
        seasons_out.append({
            "season": se, "status": status, "leagues": leagues,
            "reg_end_week": reg_end,
            # 🔴 A season is COMPLETE only when someone is flagged champion.
            # That is the gate for anything that summarises a whole season,
            # greatest games above all: 2026 must not get a board in November.
            "complete": any(t["flags"].get("champ") for t in teams_out),
            "teams": teams_out,
            "dropped_weeks": sorted(bad),
        })
        champ = next((t for t in teams_out if t["flags"].get("champ")), None)
        index_rows.append({
            "season": se, "status": status, "leagues": leagues,
            "complete": bool(champ),
            "champion": None if not champ else {
                "name": champ["name"], "city": champ["city"], "team": champ["team"]},
            "teams": len(teams_out),
            "weeks": max((w["w"] for t in teams_out for w in t["weeks"]), default=0),
            "dropped_weeks": sorted(bad),
            "top": (lambda t: {"name": t["name"], "city": t["city"],
                               "team": t["team"], "elo": t["end"]} if t else None)(
                max(teams_out, key=lambda x: x["end"]) if teams_out else None),
        })

    return {
        "index": index_rows,
        "seasons": seasons_out,
        "franchises": franchise_seasons,
        "team_weeks": total,
    }


# Regular Season columns, for the schedule pass.
G = {"season": "B", "week": "D", "phase": "E", "date": "H", "city": "K", "team": "L",
     "opp_city": "O", "opp_team": "P", "pf": "Q", "pa": "R", "ha": "W",
     "name": "DK", "opp": "DL", "gid": "EE"}
G_WANT = set(G.values())


def read_schedule(book: Book, season: int):
    """One row per GAME (not per team) for `season`, from the game log.

    The sheet carries two rows per game, one per perspective. The home row is
    kept; a neutral-site game keeps whichever arrives first, with `neutral` set.
    """
    inv = {v: k for k, v in G.items()}
    seen: dict[str, dict] = {}
    header = False
    for _, d in book.rows("Regular Season", G_WANT):
        if not header:
            header = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        se = num(row.get("season"))
        if se is None or int(se) != season:
            continue
        gid = row.get("gid")
        wk = num(row.get("week"))
        if not gid or wk is None:
            continue
        ha = (row.get("ha") or "").strip()
        neutral = ha not in ("vs", "at")
        # Normalise to home/away so the two rows of one game collapse to one.
        if ha == "vs" or neutral:
            home, away = row.get("name"), row.get("opp")
            home_city, away_city = row.get("city"), row.get("opp_city")
            pf, pa = num(row.get("pf")), num(row.get("pa"))
        else:
            home, away = row.get("opp"), row.get("name")
            home_city, away_city = row.get("opp_city"), row.get("city")
            pf, pa = num(row.get("pa")), num(row.get("pf"))
        if not home or not away:
            continue
        key = f"{int(wk)}|" + "|".join(sorted([str(home), str(away)])) + f"|{row.get('date')}"
        if key in seen and not neutral:
            continue
        seen[key] = {
            "week": int(wk), "date": serial_to_iso(row.get("date")),
            "home": str(home), "away": str(away),
            "home_city": home_city, "away_city": away_city,
            "neutral": neutral, "phase": row.get("phase"),
            "home_pts": int(pf) if pf is not None else None,
            "away_pts": int(pa) if pa is not None else None,
        }
    return sorted(seen.values(), key=lambda g: (g["week"], g["date"] or "", g["home"]))


def build_upcoming(book: Book, season: int, season_shard: dict) -> dict:
    """The schedule with a pre-game probability wherever both ratings are known.

    🔴 A probability is published ONLY where both pre-game ratings are facts.
    After week 1 of an unplayed season that means nothing, because week 2's
    ratings depend on week 1's results. Those games are emitted with a null
    probability and `pending`, never with a guess. This is the honest version of
    the thing the workbook could not do: the probability is derived from the two
    ratings, not pasted from a source after the fact.
    """
    elo_at: dict[tuple[str, int], float] = {}
    for t in season_shard["teams"]:
        for w in t["weeks"]:
            elo_at[(t["name"], w["w"])] = w["e"]
    known_weeks = sorted({w for (_, w) in elo_at})
    last_known = max(known_weeks) if known_weeks else None

    games = []
    for g in read_schedule(book, season):
        # The rating that applies before week N is the one carried out of N-1.
        prior = g["week"] - 1
        he = elo_at.get((g["home"], prior))
        ae = elo_at.get((g["away"], prior))
        out = dict(g)
        if he is not None and ae is not None:
            out["home_elo"] = he
            out["away_elo"] = ae
            out["p_home"] = round(win_probability(he, ae, 0 if g["neutral"] else 1), 4)
            out["basis"] = "seed" if prior == 0 else "week"
        else:
            out["home_elo"] = out["away_elo"] = out["p_home"] = None
            out["basis"] = "pending"
        games.append(out)
    priced = sum(1 for g in games if g["p_home"] is not None)
    return {
        "season": season,
        "last_rated_week": last_known,
        "games": len(games),
        "priced": priced,
        "schedule": games,
    }


def self_test() -> int:
    """Offline. Runs before any read of the workbook."""
    fails = []

    # 1. The probability the workbook pastes is the probability we compute.
    #    Regular Season row 36380, 2025: Elo 1610.675837 away at 1711.392234.
    p = win_probability(1610.675837, 1711.392234, -1)
    if abs(p - 0.278093094) > 1e-8:
        fails.append(f"win_probability: {p!r} != 0.278093094")

    # 2. Symmetry: the two sides of one game must sum to 1.
    a = win_probability(1600, 1500, 1)
    b = win_probability(1500, 1600, -1)
    if abs(a + b - 1.0) > 1e-12:
        fails.append(f"probabilities not complementary: {a} + {b}")

    # 3. Equal ratings at home is the home edge alone, and it is above even.
    e = win_probability(1500, 1500, 1)
    if not (0.55 < e < 0.60):
        fails.append(f"neutral-rating home probability out of band: {e}")
    if abs(win_probability(1500, 1500, 0) - 0.5) > 1e-12:
        fails.append("a neutral-site coin flip is not 0.5")

    # 4. classify() must catch the 2026 shape: a sound week 0 and later weeks
    #    where every team shares one rating.
    flat = 6.9283225680685128
    weeks = {
        0: [{"elo": 1609.4}, {"elo": 1491.7}, {"elo": 1559.6}],
        1: [{"elo": flat}, {"elo": flat}, {"elo": flat}],
        2: [{"elo": flat}, {"elo": flat}, {"elo": flat}],
    }
    status, bad = classify(2026, weeks)
    if status != "seeded" or bad != {1, 2}:
        fails.append(f"classify did not catch the flat-week shape: {status} {bad}")

    # 5. A season that is sound throughout passes untouched.
    good = {0: [{"elo": 1500}, {"elo": 1600}], 1: [{"elo": 1510}, {"elo": 1590}]}
    if classify(2001, good) != ("final", set()):
        fails.append("a sound season was not classified final")

    # 6. A week 0 that is itself flat is broken, not merely seeded.
    bad0 = {0: [{"elo": flat}, {"elo": flat}], 1: [{"elo": 1500}, {"elo": 1600}]}
    if classify(2027, bad0)[0] != "broken":
        fails.append("a flat week 0 was not classified broken")

    # 7. Excel serials, checked against the two anchors the workbook's own
    #    Claude Notes sheet documents rather than against a guess.
    for serial, want in ((35820, "1998-01-25"), (46033, "2026-01-11")):
        got = serial_to_iso(serial)
        if got != want:
            fails.append(f"serial {serial} -> {got}, expected {want}")
    # And the 2026 opener, Thursday 10 September, which is what week 1 carries.
    if serial_to_iso(46275) != "2026-09-10":
        fails.append(f"serial 46275 -> {serial_to_iso(46275)}")

    # 8. Error text is not a number.
    if num("#DIV/0!") is not None or num("#N/A") is not None or num("") is not None:
        fails.append("num() accepted an Excel error string")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"[self-test] {8 - len(fails)}/8 checks passed")
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--workbook", default=str(ROOT / "workbooks" / "NFL_all.xlsx"),
                    help="NFL_all.xlsx. Defaults to the staged copy.")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = ap.parse_args(argv)

    rc = self_test()
    if args.self_test:
        return rc
    if rc:
        print("ABORT: self-test failed; the workbook was not read.")
        return rc

    wb = Path(args.workbook)
    if not wb.exists():
        print(f"ABORT: workbook not found at {wb}")
        return 1
    print(f"reading {wb} ({wb.stat().st_size / 1e6:.1f} MB)")

    data = build(Book(wb))
    idx, seasons, franchises = data["index"], data["seasons"], data["franchises"]

    by_status = defaultdict(int)
    for r in idx:
        by_status[r["status"]] += 1
    print(f"team-weeks read: {data['team_weeks']:,}")
    print(f"seasons: {len(idx)}  " + "  ".join(f"{k}={v}" for k, v in sorted(by_status.items())))
    for r in idx:
        if r["status"] != "final":
            print(f"  {r['status'].upper():7} {r['season']}  dropped weeks {r['dropped_weeks']}")

    generated = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    meta = {
        "generated_at": generated,
        "source": "NFL_all.xlsx, sheet 'NFL Standings'",
        "source_credit": "Elo ratings by Neil Paine",
        "hfa_elo": HFA_ELO,
        "team_weeks": data["team_weeks"],
        "seasons": [idx[0]["season"], idx[-1]["season"]],
        "notes": ("One Elo pool per season across every league that ran in it; "
                  "standings split by league. Week 0 is the preseason seed. "
                  "A week flagged carried inherits the previous rating."),
    }

    if args.dry_run:
        print("(dry-run; nothing written)")
        return 0

    (OUT / "seasons").mkdir(parents=True, exist_ok=True)
    for s in seasons:
        p = OUT / "seasons" / f"{s['season']}.json"
        p.write_text(json.dumps({"meta": meta, **s}, separators=(",", ":")), encoding="utf-8")

    fr = []
    for nm, rows in sorted(franchises.items()):
        rows = sorted(rows, key=lambda r: r["season"])
        rated = [r for r in rows if r["status"] != "broken"]
        peak = max(rated, key=lambda r: r["peak"]) if rated else None
        trough = min(rated, key=lambda r: r["trough"]) if rated else None
        fr.append({
            "name": nm,
            "first_season": rows[0]["season"], "last_season": rows[-1]["season"],
            "seasons": rows,
            "peak": {"season": peak["season"], "week": peak["peak_w"], "elo": peak["peak"]} if peak else None,
            "trough": {"season": trough["season"], "week": trough["trough_w"], "elo": trough["trough"]} if trough else None,
        })
    (OUT / "franchises.json").write_text(
        json.dumps({"meta": meta, "franchises": fr}, separators=(",", ":")), encoding="utf-8")
    (OUT / "index.json").write_text(
        json.dumps({"meta": meta, "seasons": idx}, separators=(",", ":")), encoding="utf-8")

    # The live season's schedule, priced where the ratings are facts.
    live = seasons[-1]
    up = build_upcoming(Book(wb), live["season"], live)
    (OUT / "upcoming.json").write_text(
        json.dumps({"meta": meta, **up}, separators=(",", ":")), encoding="utf-8")
    print(f"upcoming: season {up['season']}, {up['games']} games, "
          f"{up['priced']} priced from week {up['last_rated_week']} ratings, "
          f"{up['games'] - up['priced']} pending")

    total = sum(f.stat().st_size for f in OUT.rglob("*.json"))
    print(f"wrote {len(seasons)} season shards + franchises.json ({len(fr)} franchises) "
          f"+ index.json, {total / 1e6:.1f} MB total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
