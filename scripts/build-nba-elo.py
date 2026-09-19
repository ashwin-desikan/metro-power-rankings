#!/usr/bin/env python3
"""Build the NBA Elo spine: one week-by-week rating history per team-season.

A port of scripts/build-nfl-elo.py onto the NBA workbooks. The output shape is
deliberately IDENTICAL to public/data/nfl/elo/** so lib/nbaElo.ts can mirror
lib/nflElo.ts and the season-page components port with a data source swap
rather than a rewrite.

    public/data/nba/elo/index.json          one row per season, 1947 on
    public/data/nba/elo/seasons/<year>.json one season's full weekly spine
    public/data/nba/elo/franchises.json     each franchise's career strip

🔴 TWO WORKBOOKS, NOT ONE. This is the main structural difference from the NFL,
where NFL_all.xlsx holds everything.

    NBA_RegSeason.xlsx  "Standings"       57k team-weeks: ELO Rating, +/-
                                          Change, Rank, W/L per team per week.
                                          THIS IS THE SPINE.
                        "Regular Season"  146k team-games: the game log, with
                                          ELO-Pre/Prob/Shift/Post per row.
                                          Used by --replay to prove the formula.
    NBA.xlsx            "Year by Year"    season context the Standings sheet
                                          does not carry at all: conference,
                                          division, and the honours flags
                                          (Play. Ap, Div. Title, Best Rec.,
                                          CF App, Cham App, Champs.).

Both must be staged together by scripts/stage-leagues.py. If they drift, the
Elo history and the honours describe different seasons and nothing complains,
because each file is internally consistent.

🔴 THE NBA ELO IS AN EXTERNAL SERIES. WE DO NOT COMPUTE IT, AND WE CANNOT.
This is the single most important fact about this pipeline, and it is the
opposite of the NFL's, so anyone porting from build-nfl-elo.py will assume
wrong. It was established by measurement on 2026-09-17, not by reading:

  - NBA_RegSeason's "Formula Backup" sheet does carry a damped margin-of-
    victory shift formula that looks exactly like the NFL's with K=9.3 and
    the same 65-point home edge. Transcribing it and replaying it against
    30,958 rated team-games REPRODUCES NOTHING: mean |diff| 3.26 Elo, worst
    16.47. The ratio to the real column is not constant either (sd 0.13
    over 5,286 rows), so it is not a scale constant that could be fitted.
  - That formula belongs to column BP, whose header is the keyboard-mash
    "sdfd" and which is EMPTY for every recent season. It is an abandoned
    attempt to reproduce the series, not the thing that produces it.
  - The real column, BL "ELO Shift", is simply BM - BI: post minus pre,
    exact to 1e-9 in 99.39% of 30,958 rows (median and p99 both exactly 0).
    So ELO-Post is the primitive and the shift is derived from it.
  - ELO-Post itself is not internally generated. A self-consistent pairwise
    Elo is exactly zero-sum by construction; this one is zero-sum in only
    63.26% of 15,317 game pairs, and off by more than 0.01 in 7.70%. That
    asymmetry is the fingerprint of a published, rounded, editorially
    adjusted external series being pasted in.

The 2026 preseason seeds carried injury adjustments (Pacers -136, 76ers
+143, Celtics -131 for the Haliburton and Tatum Achilles tears) that no
formula reproduces, which is the same story at the season boundary.

⚠️ CONSEQUENCE FOR THE LIVE SEASON. The NFL carries its live season forward
in Python from the week-0 seed and the game log, licensed by a replay that
reproduces the workbook to under 1 Elo. THAT LICENCE DOES NOT EXIST HERE and
cannot be earned, because there is no formula to reproduce. So the 2026-27
NBA season is refreshed by REREADING THE WORKBOOK after Ashwin updates it,
weekly on a Sunday. This builder never computes a rating. If you find
yourself adding a live chain here, re-read this block first.

--audit is the integrity gate that replaces --replay: it checks that the
series we publish holds together (each game's pre equals the previous
game's post) rather than pretending to generate it.

Usage:
    python scripts/build-nba-elo.py --self-test
    python scripts/build-nba-elo.py --audit --seasons 2025,2026
    python scripts/build-nba-elo.py --write
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "nba" / "elo"

# From the Formula Backup sheet. The NFL's equivalents are K=20 / HFA=65.
K_BASE = 9.3
HFA_ELO = 65.0

# A real NBA Elo lives near 1500. The 1947 BAA seeds start at 1300 and modern
# superteams peak around 1750, so the plausible band is wider than the NFL's
# and still far inside anything a broken formula produces (2026's NFL bug
# emitted 6.9283225680685128 for all 32 teams).
ELO_FLOOR = 900.0
ELO_CEIL = 2100.0

EPOCH_1900 = dt.date(1899, 12, 30)
EPOCH_1904 = dt.date(1904, 1, 1)


def win_probability(elo_for: float, elo_against: float, ground: int) -> float:
    """`ground` is +1 at home, -1 away, 0 at a neutral site."""
    diff = elo_for - elo_against + ground * HFA_ELO
    return 1.0 / (1.0 + 10.0 ** (-diff / 400.0))


def elo_shift(margin: float, result: float, prob: float,
              elo_for: float, elo_against: float, ground: int) -> float:
    """⚠️ REFERENCE ONLY. THIS DOES NOT REPRODUCE THE WORKBOOK.

    A faithful transcription of NBA_RegSeason "Formula Backup" column BP,
    kept because the next person to open this file will find that formula and
    assume it is the generator. It is not: replayed against 30,958 rated
    team-games it lands 3.26 Elo out on average and 16.47 at worst, and the
    error is structural rather than a scale constant. See the module
    docstring for the full measurement.

    Nothing in the production path calls this. It exists so the finding is
    reproducible: run --audit, which reports the discrepancy rather than
    hiding it.

    `result` is 1.0 win, 0.0 loss, 0.5 tie. `margin` is the signed point
    differential; only its magnitude is used.
    """
    if result == 0.5:
        edge = 1.0
    elif result == 1.0:
        edge = elo_for - elo_against + ground * HFA_ELO
    else:
        edge = -(elo_for - elo_against + ground * HFA_ELO)
    damper = 2.2 / (edge * 0.001 + 2.2)
    return K_BASE * math.log(max(abs(margin), 1.0) + 1.0) * damper * (result - prob)


def num(v):
    """A float, or None for blanks and for Excel error strings ('#N/A')."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def flag(v) -> bool:
    """Workbook honour columns are 'Y', blank, or a count. Any of those means
    the same thing here: did it happen."""
    if v is None or v == "":
        return False
    s = str(v).strip().upper()
    if s in ("Y", "YES", "TRUE"):
        return True
    n = num(s)
    return bool(n and n > 0)


# --------------------------------------------------------------- xlsx reading

class Book:
    """A streaming reader. NBA_RegSeason.xlsx is 95 MB and its Standings sheet
    alone is 57k rows; openpyxl loads a sheet whole, so this walks it row by
    row and keeps only the columns asked for."""

    def __init__(self, path: Path):
        self.path = path
        self.z = zipfile.ZipFile(path)
        self.shared = self._shared()
        self._targets = self._sheet_targets()
        self.date1904 = self._date1904()

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

    def _date1904(self) -> bool:
        """🔴 DETECTED, NEVER ASSUMED. NBA.xlsx's own Claude Notes sheet says
        'Date system: 1904 (add 2 to standard 1900-based date serials)'. Get
        this wrong by one epoch and every week-end date lands four years out,
        which is the kind of error that looks like a plausible date and so
        survives review. Read the flag the file actually carries."""
        wb = self.z.read("xl/workbook.xml").decode("utf-8", "replace")
        m = re.search(r"<workbookPr[^>]*date1904=\"([^\"]+)\"", wb)
        return bool(m and m.group(1) in ("1", "true"))

    def _sheet_targets(self):
        wb = self.z.read("xl/workbook.xml").decode("utf-8", "replace")
        rels = self.z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
        rmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
        out = {}
        for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
            t = rmap[rid].lstrip("/")
            out[name] = t if t.startswith("xl/") else "xl/" + t
        return out

    def has_sheet(self, name: str) -> bool:
        return name in self._targets

    def serial_to_iso(self, v) -> str | None:
        try:
            n = int(float(v))
        except (TypeError, ValueError):
            return None
        if n < 1 or n > 80000:
            return None
        epoch = EPOCH_1904 if self.date1904 else EPOCH_1900
        return (epoch + dt.timedelta(days=n)).isoformat()

    @staticmethod
    def _col(ref: str) -> str:
        m = re.match(r"([A-Z]+)", ref or "")
        return m.group(1) if m else ""

    def rows(self, sheet: str, want: set[str]):
        """Yield (row_number, {column_letter: value}). Error cells yield their
        error text ('#N/A'), which the caller must treat as absent via num()."""
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

# NBA_RegSeason "Standings". Named so a reader does not have to hold letters.
S = {
    "year": "C", "week": "D", "week_end": "E", "city": "F", "team": "G",
    "name": "H", "w": "I", "l": "J", "win_pct": "K",
    "elo": "L", "change": "M", "rank": "N", "tot_teams": "O",
    "preseason": "P", "final": "Q", "tot_week": "R", "best_rec": "S",
}
S_WANT = set(S.values())

# WORKBOOK CORRECTIONS, applied on read. Keyed (year, team name).
#
# These are errors in NBA.xlsx itself, not in this script, and they are fixed
# here because the workbook lives on the Windows box and the site should not
# stay wrong until it is next opened. FIX THE WORKBOOK TOO and then this table
# becomes a no-op rather than a lie: each entry re-asserts the corrected value,
# so once the source agrees the override changes nothing.
#
# 🔴 2024 DALLAS AND THE CLIPPERS. Their first-round series was SIX games,
# Dallas 4-2, closed out at home on 3 May 2024. Three places in the workbook
# disagreed about it and only the weekly Standings series was right:
#   * the bracket recorded Mavericks 4-3, a seventh game that was never played;
#   * Year by Year gave the Mavericks a postseason of 13-10, which is exactly
#     what that phantom loss produces (4-3, 4-2, 4-1, 1-4 sums to 13-10, while
#     the real 4-2, 4-2, 4-1, 1-4 sums to 13-9);
#   * Year by Year gave the Clippers 2-3, which matches NEITHER reading of the
#     series and is simply a second, independent typo for 2-4.
# Found 2026-09-19 because the season table's derived playoff record refused to
# reconcile: the Mavericks came out a loss SHORT of their recorded postseason
# and the Clippers a loss LONG, which no single missing game can explain. The
# weekly cumulative record is the arbiter here, being a running total of games
# actually played rather than a hand-typed summary.
POST_CORRECTIONS: dict[tuple[int, str], list[int]] = {
    (2024, "Mavericks"): [13, 9],
    (2024, "Clippers"): [2, 4],
}

# Mismatches that are REAL and are not workbook errors, so the reconciliation
# check below stays quiet about them. Both are 1953 teams whose weekly series
# carries one game more than their season line and who played no postseason;
# the cause is in the 1950s source data and has not been run down. Listed rather
# than silently tolerated, so the check still speaks up for anything new.
KNOWN_UNRECONCILED: set[tuple[int, str]] = {
    (1953, "Hawks"),
    (1953, "Warriors"),
}

# Same three-way disagreement, the bracket half. (year, winner, loser) -> (w, l).
BRACKET_CORRECTIONS: dict[tuple[int, str, str], tuple[int, int]] = {
    (2024, "Mavericks", "Clippers"): (4, 2),
}

# NBA.xlsx "Year by Year". Everything the Standings sheet does not carry.
# Col A is the lookup key, Year & Name, e.g. "2026Thunder".
Y = {
    "key": "A", "league": "B", "year": "C", "city": "D", "team": "E",
    # 🔴 THE REGULAR-SEASON RECORD, AND ONLY THAT. The Standings sheet's
    # running W/L keeps counting through the playoffs, so its final week for
    # the 2026 Spurs reads 75-31 rather than the 62-20 they finished the
    # regular season on. A season page that shows one number without saying
    # which it is will be read as the other. These four columns are the
    # authoritative split and the reason the shard carries reg and post
    # separately rather than a single total.
    "reg_w": "F", "reg_l": "G",
    "play_app": "P", "div_title": "Q", "best_conf": "R", "best_rec": "S",
    "post_w": "T", "post_l": "U",
    "cf_app": "V", "champ_app": "W", "champ": "X",
    "seed": "Y",
    "division": "Z", "name": "AI", "conf": "AL",
}
Y_WANT = set(Y.values())

# NBA.xlsx "Playoffs": one row PER TEAM PER SERIES, so every series appears
# twice, once from each side. Round numbering runs BACKWARDS from the end:
# 1 is the Finals and 4 is the first round, with the play-in at 4.5 and 5.
PO = {
    "league": "B", "year": "C", "conf": "D", "round": "E",
    "city": "F", "team": "G", "wl": "H", "w": "I", "l": "J",
    "ocity": "K", "oteam": "L", "champ": "O",
    "seed": "P", "opp_seed": "Q", "name": "R", "opp": "S", "rnum": "T",
}
PO_WANT = set(PO.values())


def read_standings(book: Book):
    """One dict per team-week, in sheet order (year, then team, then week)."""
    inv = {v: k for k, v in S.items()}
    header_seen = False
    for _r, d in book.rows("Standings", S_WANT):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("year"))
        week = num(row.get("week"))
        name = row.get("name")
        if year is None or week is None or not name:
            continue
        yield {
            "year": int(year),
            "week": int(week),
            "name": str(name).strip(),
            "city": (row.get("city") or None),
            "team": (row.get("team") or None),
            "w": num(row.get("w")), "l": num(row.get("l")),
            "win_pct": num(row.get("win_pct")),
            "elo": num(row.get("elo")),
            "change": num(row.get("change")),
            "rank": num(row.get("rank")),
            "tot_teams": num(row.get("tot_teams")),
            # Col P marks the week-0 seed row. Treated as a label only: the
            # week number is what the rest of the builder keys on.
            "is_preseason": flag(row.get("preseason")),
            "date": book.serial_to_iso(row.get("week_end")),
        }


def read_year_context(book: Book) -> dict[tuple[int, str], dict]:
    """(year, name) -> conference, division, league and the honours flags.

    Keyed on year+name rather than year+team because the Standings sheet
    carries the CURRENT franchise name on historical rows (a 1988 Supersonics
    row reads Name=Thunder), and so does Year by Year col AI. Joining on the
    era-accurate `team` instead would silently drop every relocated franchise,
    which is the bug the workbook's own notes record hitting twice.
    """
    inv = {v: k for k, v in Y.items()}
    out: dict[tuple[int, str], dict] = {}
    header_seen = False
    for _r, d in book.rows("Year by Year", Y_WANT):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("year"))
        name = row.get("name")
        if year is None or not name:
            continue
        rw, rl = num(row.get("reg_w")), num(row.get("reg_l"))
        pw, pl = num(row.get("post_w")), num(row.get("post_l"))
        seed = num(row.get("seed"))
        out[(int(year), str(name).strip())] = {
            "league": (row.get("league") or None),
            "conf": (row.get("conf") or None),
            "div": (row.get("division") or None),
            "reg": [int(rw), int(rl)] if rw is not None and rl is not None else None,
            # A team that missed the playoffs has blanks here, not zeroes, and
            # the difference matters: 0-0 says "played and went nowhere",
            # absent says "was not there". Kept as None so the page can choose.
            "post": POST_CORRECTIONS.get((int(year), str(name).strip()))
                    or ([int(pw), int(pl)] if pw is not None and pl is not None
                        and (pw or pl) else None),
            "seed": int(seed) if seed else None,
            "flags": {
                "play_app": flag(row.get("play_app")),
                "div_title": flag(row.get("div_title")),
                "best_conf": flag(row.get("best_conf")),
                "best_rec": flag(row.get("best_rec")),
                "cf_app": flag(row.get("cf_app")),
                "champ_app": flag(row.get("champ_app")),
                "champ": flag(row.get("champ")),
            },
        }
    return out


def classify(weeks: dict[int, list[dict]], first_season: bool = False) -> tuple[str, set[int]]:
    """Return (status, weeks_to_drop).

      final   every week carries a plausible, varying Elo
      seeded  week 0 is sound and later weeks are not (a season not yet played)
      broken  week 0 is unusable too

    🔴 The test is NOT "is the number missing". The NFL's 2026 failure had a
    number present for all 32 teams: 6.9283225680685128. The test is that a
    week in which every team shares one rating carries no information,
    whatever that rating is.
    """
    bad = set()
    for wk, rows in weeks.items():
        elos = [r["elo"] for r in rows if r["elo"] is not None]
        if len(elos) < 2:
            bad.add(wk)
            continue
        if max(elos) - min(elos) < 1e-9:
            # ⚠️ ONE LEGITIMATE EXCEPTION, and it is not a bug. In the FIRST
            # season of the league nobody has a history, so every team is
            # seeded at the same 1300 and week 0 is flat BY DEFINITION. The
            # flat-week test exists to catch a broken formula emitting one
            # value for everyone (the NFL's 2026 case); in 1947 the flat
            # value is the truth. Later seasons get no such licence, because
            # by then a flat week can only mean the formula failed.
            if not (first_season and wk == 0):
                bad.add(wk)
            continue
        if min(elos) < ELO_FLOOR or max(elos) > ELO_CEIL:
            bad.add(wk)
    if not bad:
        return "final", bad
    if 0 in bad:
        return "broken", bad
    return "seeded", bad


def build(spine: Book, context: Book) -> dict:
    ctx = read_year_context(context)
    brackets = read_brackets(context, ctx)
    top_games = read_top_games(spine)
    awards = read_awards(context)
    all_stars = read_all_stars(context)
    by_season: dict[int, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    total = 0
    for row in read_standings(spine):
        by_season[row["year"]][row["name"]].append(row)
        total += 1

    index_rows, seasons_out = [], []
    franchise_seasons: dict[str, list[dict]] = defaultdict(list)
    earliest = min(by_season) if by_season else None
    # Each team's END rating in the previous season, so a season page can show
    # a YEAR-OVER-YEAR movement rather than a week-on-week one. Filled as the
    # loop walks seasons in order, which is why the loop must stay sorted.
    prev_end: dict[str, float] = {}

    for year in sorted(by_season):
        teams_raw = by_season[year]
        weeks_pool: dict[int, list[dict]] = defaultdict(list)
        for rows in teams_raw.values():
            for r in rows:
                weeks_pool[r["week"]].append(r)
        status, bad = classify(weeks_pool, first_season=(year == earliest))

        teams_out = []
        for name, rows in teams_raw.items():
            rows = sorted(rows, key=lambda r: r["week"])
            wks = []
            prev_rec = None
            for r in rows:
                if r["week"] in bad or r["elo"] is None:
                    continue
                entry = {"w": r["week"], "e": round(r["elo"], 1)}
                # 🔴 A WEEK WITH NO GAMES IS NOT A MEASUREMENT, and the chart
                # has to draw it as held rather than as a flat rating somebody
                # earned. The workbook does not mark these, but it does not
                # need to: the running W-L is what moves when a team plays, so
                # a week whose record is identical to the previous week's is a
                # week that team did not play. That covers both cases a reader
                # cares about on a season chart -- a club eliminated in round
                # one, whose line should go dashed from that week to the end of
                # the Finals, and a club that missed the playoffs entirely,
                # whose line should go dashed the moment the regular season
                # stops. Week 0 is the seed and is never carried.
                this_rec = None
                if r["w"] is not None and r["l"] is not None:
                    this_rec = (int(r["w"]), int(r["l"]))
                if r["week"] > 0 and this_rec is not None and this_rec == prev_rec:
                    entry["carried"] = True
                if this_rec is not None:
                    prev_rec = this_rec
                if r["rank"] is not None:
                    entry["r"] = int(r["rank"])
                if r["date"]:
                    entry["d"] = r["date"]
                if r["w"] is not None and r["l"] is not None:
                    entry["rec"] = [int(r["w"]), int(r["l"])]
                if r["change"] is not None:
                    entry["chg"] = round(r["change"], 1)
                if r["week"] == 0:
                    entry["seed"] = True
                wks.append(entry)
            if not wks:
                continue
            meta = ctx.get((year, name), {})
            first = rows[0]
            peak = max(wks, key=lambda x: x["e"])
            trough = min(wks, key=lambda x: x["e"])
            teams_out.append({
                "name": name,
                "city": first["city"],
                "team": first["team"],
                "league": meta.get("league"),
                "conf": meta.get("conf"),
                "div": meta.get("div"),
                # The regular-season and postseason records as separate
                # numbers. The weekly `rec` inside `weeks` keeps running
                # through the playoffs and is NOT the same thing.
                "reg": meta.get("reg"),
                "post": meta.get("post"),
                "seed": meta.get("seed"),
                # 🔴 THE UNIT OF A SEASON PAGE IS A SEASON. The weekly rows
                # carry a week-on-week Elo change, which is the right number on
                # a live board and the wrong one on a year-end aggregate: it
                # reports whatever happened in the last seven days of a season
                # that took eight months. This is where the team ENDED last
                # season, so the page can show the movement across the year,
                # offseason included. Absent for an expansion team or a first
                # season, which is a real distinction and not a zero.
                "prev_end": prev_end.get(name),
                "flags": meta.get("flags", {}),
                "start": wks[0]["e"],
                "end": wks[-1]["e"],
                "peak": {"w": peak["w"], "e": peak["e"]},
                "trough": {"w": trough["w"], "e": trough["e"]},
                "weeks": wks,
            })
            franchise_seasons[name].append({
                "season": year,
                "elo_start": wks[0]["e"],
                "elo_end": wks[-1]["e"],
                "peak": peak["e"],
                "rank_end": wks[-1].get("r"),
                "weeks": len(wks),
                "status": status,
            })

        teams_out.sort(key=lambda t: -t["end"])
        # Carry this season's finish into the next one. Done AFTER the season
        # is assembled so a team's own prev_end is last season's, not its own.
        for t in teams_out:
            prev_end[t["name"]] = t["end"]
        leagues = sorted({t["league"] for t in teams_out if t["league"]})
        champ = next((t for t in teams_out if t["flags"].get("champ")), None)
        seasons_out.append({
            "season": year,
            "status": status,
            "leagues": leagues,
            # 🔴 A season is COMPLETE only when someone is flagged champion.
            # That gate is what stops a half-played season getting a board.
            "complete": bool(champ),
            "teams": teams_out,
            # 🔴 THIS SEASON'S LEAGUE ONLY. The Playoffs sheet carries the ABA
            # alongside the NBA, so an unfiltered 1975 bracket shows two sets
            # of Finals. A series whose league is blank is kept rather than
            # dropped: the early years are patchy and a missing bracket is a
            # worse answer than an unlabelled one.
            "bracket": [s for s in brackets.get(year, [])
                        if not s.get("league") or not leagues
                        or s["league"] in leagues],
            "top_games": top_games.get(year, []),
            "awards": awards.get(year, []),
            "all_star": all_stars.get(year),
            "dropped_weeks": sorted(bad),
        })
        index_rows.append({
            "season": year,
            "status": status,
            "leagues": leagues,
            "complete": bool(champ),
            "champion": None if not champ else {
                "name": champ["name"], "city": champ["city"], "team": champ["team"]},
            "teams": len(teams_out),
            "weeks": max((w["w"] for t in teams_out for w in t["weeks"]), default=0),
            "series": len(brackets.get(year, [])),
            "dropped_weeks": sorted(bad),
            "top": None if not teams_out else {
                "name": teams_out[0]["name"], "city": teams_out[0]["city"],
                "team": teams_out[0]["team"], "elo": teams_out[0]["end"]},
        })

    # 🔴 THE UPCOMING SEASON GETS A SHELL, because a hub that leads with a
    # FINISHED season is pointing backwards. The workbook has no rows for a
    # season that has not started, and will not until Ashwin adds them, so
    # there is nothing to compute: the shell carries the field only, teams with
    # their conference and division and no ratings at all. status "upcoming"
    # is a distinct state from "seeded" for exactly that reason. "Seeded" means
    # week 0 exists and the rest does not; "upcoming" means not even that, and
    # a page that cannot tell them apart will render an empty chart for one of
    # them. The shell disappears of its own accord the moment the workbook
    # carries the season, because then it is a real season like any other.
    if seasons_out:
        latest = seasons_out[-1]["season"]
        upcoming = latest + 1
        field = [
            {
                "name": name,
                "city": meta.get("city"),
                "team": meta.get("team"),
                "league": meta.get("league"),
                "conf": meta.get("conf"),
                "div": meta.get("div"),
                "reg": None, "post": None, "seed": None, "prev_end": prev_end.get(name),
                "flags": {},
                "start": None, "end": None, "peak": None, "trough": None,
                "weeks": [],
            }
            for (yr, name), meta in sorted(ctx.items())
            if yr == latest
        ]
        if field:
            seasons_out.append({
                "season": upcoming, "status": "upcoming",
                "leagues": sorted({f["league"] for f in field if f["league"]}),
                "complete": False, "teams": field, "bracket": [],
                "top_games": [], "awards": [], "all_star": None,
                "dropped_weeks": [],
            })
            index_rows.append({
                "season": upcoming, "status": "upcoming",
                "leagues": sorted({f["league"] for f in field if f["league"]}),
                "complete": False, "champion": None, "teams": len(field),
                "weeks": 0, "series": 0, "dropped_weeks": [], "top": None,
            })

    return {
        "index": index_rows,
        "seasons": seasons_out,
        "franchises": franchise_seasons,
        "team_weeks": total,
    }


# ---------------------------------------------------------------- the self-test

def self_test() -> int:
    """Pure decision logic only, no workbook and no network. Cases are the
    messy ones actually hit in production, not synthetic happy paths."""
    fails = []

    def check(label, got, want, tol=None):
        ok = abs(got - want) <= tol if tol is not None else got == want
        if not ok:
            fails.append(f"{label}: got {got!r}, want {want!r}")

    # --- win_probability
    check("even teams, neutral", win_probability(1500, 1500, 0), 0.5, 1e-12)
    # A 65-point home edge is worth exactly the same as 65 Elo of team quality.
    check("HFA equals 65 Elo of quality",
          win_probability(1500, 1500, 1), win_probability(1565, 1500, 0), 1e-12)
    check("away is the mirror of home",
          win_probability(1500, 1500, -1), 1 - win_probability(1500, 1500, 1), 1e-12)
    # 400 Elo is the classic 10:1 ratio.
    check("400 Elo is 10 to 1", win_probability(1900, 1500, 0), 10 / 11, 1e-12)

    # --- elo_shift: the REFERENCE transcription, not the generator.
    # These pin the transcription's own internal properties so the --audit
    # discrepancy stays attributable to the workbook rather than to a typo
    # that crept in here later. They do NOT assert it matches the workbook;
    # it measurably does not. See the module docstring.
    z = elo_shift(margin=10, result=0.5, prob=0.5, elo_for=1500, elo_against=1500, ground=0)
    check("no surprise, no movement", z, 0.0, 1e-12)
    # The transcription IS zero-sum by construction. The workbook's real
    # column is zero-sum in only 63.26% of game pairs, which is precisely how
    # we know the real column is not produced by this formula.
    a = elo_shift(12, 1.0, 0.62, 1600, 1500, 1)
    b = elo_shift(-12, 0.0, 0.38, 1500, 1600, -1)
    check("zero sum across one game", a + b, 0.0, 1e-9)
    # An upset moves more than a chalk result of the same margin.
    upset = elo_shift(5, 1.0, 0.25, 1400, 1600, 0)
    chalk = elo_shift(5, 1.0, 0.75, 1600, 1400, 0)
    if not upset > chalk:
        fails.append(f"upset {upset:.3f} should exceed chalk {chalk:.3f}")
    # Margin is damped, not linear: doubling the margin adds well under double.
    m10 = elo_shift(10, 1.0, 0.5, 1500, 1500, 0)
    m20 = elo_shift(20, 1.0, 0.5, 1500, 1500, 0)
    if not (m20 > m10 and m20 < 2 * m10):
        fails.append(f"margin damping wrong: 10->{m10:.3f}, 20->{m20:.3f}")
    # A 1-point win and a 0-point margin are the same, because the formula
    # floors |margin| at 1. Real rows do carry PDif 0 for a tie.
    check("margin floors at one",
          elo_shift(0, 1.0, 0.5, 1500, 1500, 0),
          elo_shift(1, 1.0, 0.5, 1500, 1500, 0), 1e-12)

    # --- flag: the workbook writes honours three different ways
    for raw, want in [("Y", True), ("y", True), ("", False), (None, False),
                      (0, False), ("0", False), (1, True), (3, True), ("N", False)]:
        if flag(raw) is not want:
            fails.append(f"flag({raw!r}): got {flag(raw)}, want {want}")

    # --- classify: the three states, and the one that actually bit
    mk = lambda elos: {i: [{"elo": e} for e in row] for i, row in enumerate(elos)}
    st, bad = classify(mk([[1500, 1600, 1400], [1510, 1590, 1405]]))
    check("a real season is final", st, "final")
    check("nothing dropped", len(bad), 0)
    # 🔴 The NFL 2026 shape: a number is present, identical for every team.
    st, bad = classify(mk([[1500, 1600], [6.928, 6.928], [6.928, 6.928]]))
    check("flat weeks are seeded, not final", st, "seeded")
    check("both flat weeks dropped", len(bad), 2)
    st, _ = classify(mk([[6.928, 6.928], [1500, 1600]]))
    check("a flat week 0 is broken", st, "broken")
    st, _ = classify(mk([[1500], [1500, 1600]]))
    check("a single-team week is unusable", st, "broken")
    st, _ = classify(mk([[1500, 1600], [50, 3000]]))
    check("out-of-band ratings are dropped", st, "seeded")

    for f in fails:
        print("  FAIL " + f)
    print(f"self-test: {'PASS' if not fails else str(len(fails)) + ' FAILURES'}")
    return 1 if fails else 0


# ------------------------------------------------------------------- the proof

# 🔴 RESOLVED BY HEADER TEXT, NOT BY LETTER, AND THAT IS DELIBERATE.
# The workbook's own "Formula Backup" sheet disagrees with the live header row
# about where these columns are: it records ELO Shift at BO and H/A/N at BR,
# while the actual header row has ELO Shift at BL, Opp Rank at BO and H/A/N at
# BQ. One of the two has drifted and there is no way to tell which from inside
# the file. Reading the header row is the only version that cannot be stale,
# and it fails loudly if a column is renamed rather than silently reading the
# neighbouring column's numbers.
REPLAY_HEADERS = {
    "season": "Season", "week": "Wk", "pdif": "PDif", "wbin": "W Bin",
    "elo_pre": "ELO - Pre", "elo_opp": "ELO (Opp) -Pre",
    "prob": "ELO Prob (Pre)", "shift": "ELO Shift", "elo_post": "ELO - Post",
    "ground": "H/A/N", "name": "Name",
    # 🔴 Needed because SHEET ORDER IS NOT CHRONOLOGICAL ORDER. The Regular
    # Season sheet opens on a 2016 Finals row, and within a team-season the
    # rows interleave (Spurs row 11 -> 45 -> 69 are not consecutive games).
    # A continuity check that walks the sheet reports ~96% breaks, all of
    # them artefacts of the ordering rather than faults in the data. Sort on
    # this before comparing anything to "the previous game".
    "date": "Date",
}


def resolve_columns(book: Book, sheet: str, wanted: dict[str, str]) -> dict[str, str]:
    """Map logical name -> column letter by reading the sheet's header row."""
    header: dict[str, str] = {}
    for _r, d in book.rows(sheet, set()):
        break
    # book.rows filters by `want`; ask for everything on row 1 instead.
    with book.z.open(book._targets[sheet]) as f:
        for _ev, el in ET.iterparse(f, events=("end",)):
            if el.tag != NS + "row":
                continue
            for c in el.iter(NS + "c"):
                letter = Book._col(c.get("r"))
                t = c.get("t")
                v = c.find(NS + "v")
                if v is None or v.text is None:
                    continue
                text = book.shared[int(v.text)] if t == "s" else v.text
                if text:
                    header[str(text).strip()] = letter
            el.clear()
            break
    out, missing = {}, []
    for key, label in wanted.items():
        if label in header:
            out[key] = header[label]
        else:
            missing.append(label)
    if missing:
        raise SystemExit(
            f"FATAL: {sheet} is missing expected column(s): {missing}.\n"
            f"       Found headers: {sorted(header)[:40]}\n"
            f"       Refusing to guess a column position.")
    return out


def audit(spine: Book, seasons: list[int] | None) -> int:
    """Integrity gate on the series we actually publish.

    🔴 THIS DOES NOT TRY TO REGENERATE THE RATINGS, because they are an
    external series (module docstring). It asks the only questions that are
    answerable about a series you did not compute:

      1. Does the chain hold together? Each game's ELO-Pre should equal that
         team's previous ELO-Post within the same season. A break means a
         row was edited, inserted out of order, or pasted from a different
         vintage, and the published history would show a phantom jump.
      2. Is ELO Shift still just post minus pre? If that stops being true,
         someone has started generating the column and this file's central
         assumption needs revisiting.
      3. How far off is the reference formula? Reported, never gated, so the
         finding stays visible instead of becoming folklore.
    """
    cols = resolve_columns(spine, "Regular Season", REPLAY_HEADERS)
    inv = {v: k for k, v in cols.items()}
    want = set(cols.values())

    n = 0
    skipped_no_elo = 0
    derived_err = []          # |shift - (post - pre)|
    formula_err = []          # |reference formula - shift|, reported only
    # (season, name) -> list of (date_serial, sheet_row, pre, post), sorted
    # AFTER collection. See the note on REPLAY_HEADERS["date"].
    games: dict[tuple[int, str], list[tuple[float, int, float, float]]] = defaultdict(list)
    breaks = []
    header_seen = False
    for r, d in spine.rows("Regular Season", want):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        season = num(row.get("season"))
        if season is None:
            continue
        se = int(season)
        if seasons and se not in seasons:
            continue
        pre = num(row.get("elo_pre"))
        opp = num(row.get("elo_opp"))
        prob = num(row.get("prob"))
        shift = num(row.get("shift"))
        post = num(row.get("elo_post"))
        pdif = num(row.get("pdif"))
        wbin = num(row.get("wbin"))
        ground = num(row.get("ground"))
        name = str(row.get("name") or "").strip()
        # All-Star games and pre-Elo eras carry no rating; the workbook leaves
        # those blank on purpose and so do we.
        if None in (pre, post, shift) or not name:
            skipped_no_elo += 1
            continue
        n += 1
        derived_err.append(abs(shift - (post - pre)))
        if None not in (opp, prob, pdif, wbin):
            formula_err.append(abs(
                elo_shift(pdif, wbin, prob, pre, opp, int(ground or 0)) - shift))
        day = num(row.get("date"))
        if day is not None:
            games[(se, name)].append((day, r, pre, post))

    # Chain continuity, walked in DATE order within each team-season.
    for (se, name), rows_for in games.items():
        rows_for.sort(key=lambda x: (x[0], x[1]))
        for (d1, r1, _p1, post1), (d2, r2, pre2, _p2) in zip(rows_for, rows_for[1:]):
            # Half an Elo of slack: the workbook stores rounded values in
            # places, and a sub-0.5 step is rounding, not a broken chain.
            if abs(post1 - pre2) > 0.51:
                breaks.append((se, name, r1, r2, post1, pre2))

    if not n:
        print("audit: NO ROWS MATCHED. Wrong season filter, or the sheet is empty.")
        return 1

    def stat(xs):
        xs = sorted(xs)
        return (sum(xs) / len(xs), xs[int(len(xs) * .99)], xs[-1])

    print(f"audit: {n:,} rated team-games ({skipped_no_elo:,} skipped, no Elo)")

    d_mean, d_p99, d_max = stat(derived_err)
    d_exact = sum(1 for x in derived_err if x < 1e-9)
    print(f"  1. shift == post - pre   exact {d_exact:,}/{len(derived_err):,} "
          f"({100 * d_exact / len(derived_err):.2f}%)  p99 {d_p99:.2e}  max {d_max:.3f}")

    print(f"  2. chain continuity      {len(breaks)} break(s) "
          f"where a game's pre != the previous post by more than 0.5 Elo")
    for se, nm, r1, r2, p, q in breaks[:8]:
        print(f"       {se} {nm:<14} row {r1} post {p:.2f} -> row {r2} pre {q:.2f}"
              f"  (jump {q - p:+.2f})")
    if len(breaks) > 8:
        print(f"       ... and {len(breaks) - 8} more")

    if formula_err:
        f_mean, f_p99, f_max = stat(formula_err)
        print(f"  3. reference formula     mean {f_mean:.3f}  p99 {f_p99:.3f}  "
              f"max {f_max:.3f} Elo off (EXPECTED, not a gate: the series is external)")

    # 🔴 THE GATE IS CHAIN CONTINUITY ALONE, and the split is deliberate.
    #
    # A chain break is the only one of these three that corrupts what a
    # reader sees: it puts a phantom jump on a season page, and it is the
    # signature of a row edited, reordered or pasted from another vintage.
    #
    # Check 1 is a CANARY, not a gate. It is 99.39% exact over 2015-26 but
    # 98.06% over 2024-26, i.e. 154 rows in three seasons where ELO Shift is
    # not exactly post minus pre. Those exceptions are un-diagnosed. They do
    # not touch the published spine, which comes from the Standings sheet's
    # weekly ratings and not from this column at all, so failing the build on
    # them would be blocking real work on a number nothing reads. Worth
    # understanding before the live season starts; not worth stopping for.
    # If this rate collapses rather than drifts, someone has started
    # GENERATING the column and this file's central assumption is void.
    derived_rate = d_exact / len(derived_err)
    if derived_rate < 0.95:
        print(f"  ⚠️  shift-is-derived has fallen to {100 * derived_rate:.2f}%. "
              f"Check whether ELO Shift is now generated rather than derived.")

    # A RATCHET, the same idiom as scripts/mobile-baseline.json and
    # scripts/table-scroll-rank-baseline.json: the current count is recorded
    # so it can never GROW unnoticed, and it is meant to shrink as the old
    # rows get fixed. Measured 2026-09-17 over the full 1947-2026 history:
    # 27 breaks, every one of them pre-1984 (1950, 1960, 1979, 1983), none
    # in the modern era and none anywhere near a live season. Fixing them
    # means reconciling franchise-name collisions in the early BAA/NBA years,
    # which is a data job, not a blocker on the pipeline.
    # 🔴 NEVER RAISE THIS TO MAKE A RUN PASS. A NEW break, especially in a
    # recent season, is a corrupted spine and a phantom jump on a page.
    BREAK_BASELINE = 27

    # The four post-2000 breaks are DIAGNOSED AND CORRECT, which is why they
    # are named here rather than absorbed into the count above. All four are
    # 2008 Hawks/Heat and all four are under 1.6 Elo:
    #
    #   - Atlanta at Miami of 19 Dec 2007 was REPLAYED from the 51:50 mark on
    #     8 Mar 2008 after a scoring error, the only replayed game in modern
    #     NBA history. Both halves are in the log, on the same date, against
    #     the same opponent. The chain legitimately steps twice.
    #   - The same season has the New Orleans franchise under both "Hornets"
    #     and "Pelicans", so one team-season's opponent column splits across
    #     two names and the walk sees a discontinuity that is not one.
    #
    # Named, not silenced: if a FIFTH modern break appears, it is new and the
    # gate fails. Widen this only with an explanation of the same kind.
    MODERN_ALLOWED = {(2008, "Hawks"), (2008, "Heat")}
    modern = [b for b in breaks if b[0] >= 2000 and (b[0], b[1]) not in MODERN_ALLOWED]
    ok = len(breaks) <= BREAK_BASELINE and not modern
    if modern:
        print(f"  🔴 {len(modern)} UNDIAGNOSED break(s) in a season from 2000 on: "
              f"{sorted({(b[0], b[1]) for b in modern})}")
        print("     These are not historical noise. Investigate before building.")
    if len(breaks) > BREAK_BASELINE:
        print(f"  🔴 breaks grew from the {BREAK_BASELINE} baseline to {len(breaks)}.")
    print(f"  {'PASS' if ok else 'FAIL'} (gate: no modern break, total <= "
          f"{BREAK_BASELINE}; checks 1 and 3 are reported, not gated)")
    return 0 if ok else 1


# -------------------------------------------------------------------- the main

def write_outputs(data: dict, meta: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "seasons").mkdir(parents=True, exist_ok=True)

    (OUT / "index.json").write_text(json.dumps(
        {"meta": meta, "seasons": data["index"]}, separators=(",", ":")), encoding="utf-8")

    for season in data["seasons"]:
        shard = dict(season)
        shard["meta"] = meta
        (OUT / "seasons" / f"{season['season']}.json").write_text(
            json.dumps(shard, separators=(",", ":")), encoding="utf-8")

    (OUT / "franchises.json").write_text(json.dumps(
        {"meta": meta, "franchises": data["franchises"]},
        separators=(",", ":")), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--spine", default=str(ROOT / "workbooks" / "NBA_RegSeason.xlsx"),
                    help="NBA_RegSeason.xlsx. Defaults to the staged copy.")
    ap.add_argument("--context", default=str(ROOT / "workbooks" / "NBA.xlsx"),
                    help="NBA.xlsx. Defaults to the staged copy.")
    ap.add_argument("--self-test", action="store_true",
                    help="Pure logic only. No workbook, no network. Run this first.")
    ap.add_argument("--audit", action="store_true",
                    help="Integrity gate on the published series: is the shift "
                         "still derived, and does the chain hold together.")
    ap.add_argument("--seasons", default="",
                    help="Comma-separated seasons to restrict --audit to.")
    ap.add_argument("--write", action="store_true",
                    help="Write public/data/nba/elo/**. Without this, dry run.")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()

    # 🔴 The self-test gates every path that touches a workbook, exactly as it
    # does in scripts/civic/*. A transcription error in elo_shift is invisible
    # in the output (the numbers all look like Elo ratings) and would poison
    # every live week from the first carry onwards.
    if self_test() != 0:
        print("ABORT: self-test failed, refusing to read the workbooks.")
        return 1

    spine_path = Path(args.spine)
    context_path = Path(args.context)
    for p, what in ((spine_path, "spine"), (context_path, "context")):
        if not p.exists():
            print(f"FATAL: {what} workbook not found at {p}")
            print("       Run: python scripts/stage-leagues.py")
            return 1

    spine = Book(spine_path)
    print(f"spine:   {spine_path.name}  (date system {'1904' if spine.date1904 else '1900'})")

    if args.audit:
        seasons = [int(s) for s in args.seasons.split(",") if s.strip()] or None
        return audit(spine, seasons)

    context = Book(context_path)
    print(f"context: {context_path.name}  (date system {'1904' if context.date1904 else '1900'})")

    data = build(spine, context)
    idx = data["index"]
    finals = sum(1 for r in idx if r["status"] == "final")
    seeded = [r["season"] for r in idx if r["status"] == "seeded"]
    broken = [r["season"] for r in idx if r["status"] == "broken"]

    print(f"\n{data['team_weeks']:,} team-weeks over {len(idx)} seasons "
          f"({idx[0]['season']}-{idx[-1]['season']})")
    print(f"  final  {finals}")
    if seeded:
        print(f"  seeded {len(seeded)}: {seeded}")
    if broken:
        print(f"  broken {len(broken)}: {broken}")
    missing_ctx = [r["season"] for r in data["seasons"]
                   if r["teams"] and not any(t["conf"] for t in r["teams"])]
    if missing_ctx:
        print(f"  ⚠️  {len(missing_ctx)} season(s) joined NO conference from "
              f"NBA.xlsx Year by Year: {missing_ctx[:12]}"
              f"{' ...' if len(missing_ctx) > 12 else ''}")
        print("      The two workbooks disagree about team names for those years.")

    # RECONCILIATION. The season line (reg + post) and the weekly cumulative
    # record are two independent statements about the same games, so they must
    # agree, and when they do not one of them is wrong. This is the check that
    # was missing on 2026-09-19, when the Mavericks and the Clippers disagreed
    # in OPPOSITE directions and nothing anywhere said so.
    #
    # One mismatch is legitimate: the NBA Cup final counts toward neither
    # column in the workbook, so each finalist's weekly total carries one extra
    # game, the winner a win and the loser a loss. That is read from the same
    # file the season pages use rather than hardcoded here.
    try:
        with open(ROOT / "public" / "data" / "nba" / "cup-finals.json",
                  encoding="utf-8") as fh:
            cup = {f["year"]: f for f in json.load(fh)["finals"]}
    except (OSError, ValueError, KeyError):
        cup = {}
    unreconciled = []
    for r in data["seasons"]:
        if not r.get("complete"):
            continue
        for t in r["teams"]:
            reg, weeks = t.get("reg"), t.get("weeks") or []
            if not reg or not weeks or not weeks[-1].get("rec"):
                continue
            post = t.get("post") or [0, 0]
            rec = weeks[-1]["rec"]
            dw = rec[0] - (reg[0] + post[0])
            dl = rec[1] - (reg[1] + post[1])
            if not dw and not dl:
                continue
            c = cup.get(r["season"])
            if c and t["name"] == c["winner"] and (dw, dl) == (1, 0):
                continue
            if c and t["name"] == c["loser"] and (dw, dl) == (0, 1):
                continue
            if (r["season"], t["name"]) in KNOWN_UNRECONCILED:
                continue
            unreconciled.append((r["season"], t["name"], reg, post, rec, dw, dl))
    if unreconciled:
        print(f"  ⚠️  {len(unreconciled)} team-season(s) where reg + post does NOT "
              f"equal the final weekly record:")
        for y, n, reg, post, rec, dw, dl in unreconciled[:12]:
            print(f"      {y} {n}: reg={reg} post={post} weekly={rec} "
                  f"(dW {dw:+d}, dL {dl:+d})")
        print("      One of the two is wrong in NBA.xlsx. The weekly series is a "
              "running total of games played and is usually the arbiter; add a "
              "POST_CORRECTIONS or BRACKET_CORRECTIONS entry once you know which.")

    meta = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "NBA_RegSeason.xlsx Standings + NBA.xlsx Year by Year",
        "source_credit": "Elo spine hand-maintained in the workbook; "
                         "preseason seeds are editorial, not computed.",
        "k_base": K_BASE,
        "hfa_elo": HFA_ELO,
        "team_weeks": data["team_weeks"],
        "seasons": [idx[0]["season"], idx[-1]["season"]] if idx else [],
    }

    if not args.write:
        print("\nDRY RUN. Nothing written. Pass --write to emit "
              "public/data/nba/elo/**.")
        return 0

    write_outputs(data, meta)
    print(f"\nwrote {OUT.relative_to(ROOT)}: index.json, "
          f"{len(data['seasons'])} season shards, franchises.json")
    return 0


# ------------------------------------------------------------------ the bracket

# The workbook's round numbers count BACKWARDS from the Finals. Mapping them to
# a depth (how many rounds from the title) is what lets a page lay the bracket
# out left to right without knowing how many rounds a given era had: the NBA
# has run three-round and four-round postseasons, and the play-in only since
# 2020.
ROUND_LABELS = {
    1: "NBA Finals",
    2: "Conference Finals",
    3: "Conference Semifinals",
    4: "First Round",
    5: "Play-In",
}


def round_label(rnum):
    if rnum is None:
        return ""
    if rnum >= 4.5:
        return "Play-In"
    n = int(rnum)
    return ROUND_LABELS.get(n, f"Round {n}")


def read_brackets(book: Book, ctx: dict[tuple[int, str], dict]) -> dict[int, list[dict]]:
    """{year: [series]}, one entry per SERIES rather than per team.

    🔴 EVERY SERIES IS IN THE SHEET TWICE, once from each side, and the two
    rows are not redundant: each carries its own seed and its own W-L. Folding
    them means picking a canonical direction. This keeps the WINNER's row as
    the series record and attaches the loser from the mirror row, so a series
    reads "Knicks beat Spurs 4-1" in one object rather than two half-objects
    that a renderer has to pair up itself.

    A series whose mirror row is missing (a handful of early years) is still
    emitted, with whatever the one row knows. Dropping it would silently
    shorten a bracket.
    """
    inv = {v: k for k, v in PO.items()}
    by_year: dict[int, dict[tuple, dict]] = defaultdict(dict)
    header_seen = False
    for _r, d in book.rows("Playoffs", PO_WANT):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("year"))
        name = (row.get("name") or row.get("team") or "").strip()
        opp = (row.get("opp") or row.get("oteam") or "").strip()
        rnum = num(row.get("rnum"))
        if year is None or not name or not opp:
            continue
        year = int(year)
        w, l = num(row.get("w")), num(row.get("l"))
        seed, oseed = num(row.get("seed")), num(row.get("opp_seed"))
        won = str(row.get("wl") or "").strip().upper().startswith("W")
        # One key per series regardless of which side we are reading.
        key = (rnum, tuple(sorted((name, opp))))
        slot = by_year[year].get(key)
        if slot is None:
            slot = by_year[year][key] = {
                "round": rnum,
                "round_label": round_label(rnum),
                # 🔴 CONFERENCE COMES FROM Year by Year, NOT FROM THIS SHEET.
                # The Playoffs sheet's own Conf. column is wrong on some rows:
                # the 2026 Warriors-Clippers play-in, an all-Western series,
                # is filed as Eastern there. Year by Year's conference is the
                # column the rest of this builder already trusts for the
                # standings groupings, so the two cannot disagree on a page.
                "conf": None,
                # The league the series belongs to. The sheet carries BOTH the
                # NBA and the ABA, so 1975 has two "NBA Finals" rows unless
                # this is read: the Colonels won the ABA that year and the
                # Warriors won the NBA. A page that shows one bracket per
                # season has to pick, or say which is which.
                "league": (row.get("league") or None),
                "winner": None, "loser": None,
                # 🔴 TWO NAMES PER CLUB, AND THE DIFFERENCE IS THE POINT.
                # `winner`/`loser` are the CANONICAL franchise (Cur. Name),
                # which is what joins to a team page and must never change.
                # `*_city`/`*_team` are the name the club actually carried
                # THAT SEASON. A 1978 bracket showing "Thunder" beating
                # someone is wrong on its face: they were the SuperSonics,
                # in Seattle, and the canonical is a join key rather than a
                # label. Display the era name, link on the canonical.
                # (Ashwin, 2026-09-17.)
                "winner_city": None, "winner_team": None,
                "loser_city": None, "loser_team": None,
                "w": None, "l": None,
                "winner_seed": None, "loser_seed": None,
            }
        if won:
            slot["winner"] = name
            slot["loser"] = opp
            # This row is the winner's, so City/Team are the WINNER's era name
            # and Other City/Other Team are the loser's.
            slot["winner_city"] = row.get("city") or None
            slot["winner_team"] = row.get("team") or None
            slot["loser_city"] = row.get("ocity") or None
            slot["loser_team"] = row.get("oteam") or None
            slot["winner_seed"] = int(seed) if seed else None
            slot["loser_seed"] = int(oseed) if oseed else None
            if w is not None and l is not None:
                slot["w"], slot["l"] = int(w), int(l)
        else:
            # The losing row still tells us who lost and from what seed, which
            # is all we need if the winning row is the one that is missing.
            slot.setdefault("loser", name)
            if slot["loser"] is None:
                slot["loser"] = name
            if slot["winner"] is None:
                slot["winner"] = opp
                slot["winner_seed"] = int(oseed) if oseed else None
                if w is not None and l is not None:
                    slot["w"], slot["l"] = int(l), int(w)
            if slot["loser"] == name and seed:
                slot["loser_seed"] = int(seed)

    out: dict[int, list[dict]] = {}
    for year, series in by_year.items():
        rows = [s for s in series.values() if s["winner"] and s["loser"]]
        for s in rows:
            # Conference from the team table, and only when BOTH sides agree.
            # The Finals are inter-conference by definition, so a conference
            # there is meaningless rather than missing.
            cw = (ctx.get((year, s["winner"])) or {}).get("conf")
            cl = (ctx.get((year, s["loser"])) or {}).get("conf")
            s["conf"] = cw if (cw and cw == cl) else None
            # See BRACKET_CORRECTIONS. Applied here rather than on read because
            # the key is the finished pairing, which only exists once both the
            # winner's and the loser's rows have been folded into the slot.
            fix = BRACKET_CORRECTIONS.get((year, s["winner"], s["loser"]))
            if fix:
                s["w"], s["l"] = fix
        # Deepest round last, so a renderer reading in order walks the bracket
        # from the first round toward the Finals.
        rows.sort(key=lambda s: (-(s["round"] or 0), s["conf"] or "",
                                 -(s["winner_seed"] or 99)))
        out[year] = rows
    return out


# ---------------------------------------------------------------- top games

# Resolved by HEADER TEXT for the same reason the audit is: this workbook's
# Formula Backup sheet disagrees with its live header row about positions.
TG_HEADERS = {
    "season": "Season", "date": "Date", "round": "Round", "rnum": "Round #",
    "gm": "Gm #", "city": "City", "team": "Team", "name": "Name",
    "ocity": "Other City", "oteam": "Other Team", "opp": "Opponent",
    "pf": "PF", "pa": "PA", "ot": "OT", "phase": "Reg/Playoffs",
    "gamecode": "GameCode", "score": "Game Score",
}

TOP_GAMES_PER_SEASON = 20


def read_top_games(spine: Book, per_season: int = TOP_GAMES_PER_SEASON):
    """{year: [game]} — the best games of each season by Game Score.

    🔴 THE SCORES ARE READ, NEVER RECOMPUTED. Game Score is a frozen column in
    NBA_RegSeason (scripts/build-nba-data.py only regenerates it behind
    --refresh-game-scores, by explicit instruction). This function ranks what
    is already there and computes nothing, so a season page cannot disagree
    with /teams/nba's own top-games boards about which game was better.

    🔴 EVERY GAME IS IN THE SHEET TWICE, once per team, and the two rows carry
    DIFFERENT Game Scores because the metric is computed per perspective. Rank
    on one row per game or the board is half duplicates: dedupe on GameCode and
    keep the WINNER's row, which is also the row whose city/team read naturally
    as "X beat Y". A row with no GameCode falls back to a key built from the
    date and both marks rather than being dropped.

    The emitted row shape matches public/data/nba/top-games-all-time.json so a
    reader moving between the season page and the all-time board meets one
    vocabulary. Arena fields are omitted rather than guessed: they live in the
    all-time file and are not worth a second lookup here.
    """
    cols = resolve_columns(spine, "Regular Season", TG_HEADERS)
    inv = {v: k for k, v in cols.items()}
    best: dict[int, dict[str, dict]] = defaultdict(dict)

    header_seen = False
    for _r, d in spine.rows("Regular Season", set(cols.values())):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("season"))
        gs = num(row.get("score"))
        if year is None or gs is None:
            continue
        year = int(year)
        pf, pa = num(row.get("pf")), num(row.get("pa"))
        if pf is None or pa is None:
            continue
        # The winner's row. A tie cannot happen in basketball, so > is total.
        if pf < pa:
            continue
        key = str(row.get("gamecode") or "").strip()
        if not key:
            key = "|".join([
                str(row.get("date") or ""), str(row.get("name") or ""),
                str(row.get("opp") or ""),
            ])
        prev = best[year].get(key)
        if prev is not None and prev["game_score"] >= gs:
            continue
        ot_raw = str(row.get("ot") or "").strip()
        best[year][key] = {
            "year": year,
            "date": spine.serial_to_iso(row.get("date")),
            "round": (row.get("round") or None),
            "round_num": num(row.get("rnum")),
            "game_num": int(num(row.get("gm")) or 0) or None,
            "phase": (row.get("phase") or None),
            "winner_canonical": str(row.get("name") or "").strip(),
            "loser_canonical": str(row.get("opp") or "").strip(),
            "winner_city": (row.get("city") or None),
            "winner_team": (row.get("team") or None),
            "loser_city": (row.get("ocity") or None),
            "loser_team": (row.get("oteam") or None),
            "winner_pts": int(pf),
            "loser_pts": int(pa),
            "ot": bool(ot_raw),
            "ot_label": ot_raw or None,
            "game_score": round(gs, 4),
        }

    out: dict[int, list[dict]] = {}
    for year, games in best.items():
        rows = sorted(games.values(), key=lambda g: -g["game_score"])[:per_season]
        out[year] = rows
    return out


# 🔴 THE ENTRY POINT STAYS LAST, and this is the THIRD time appending past it
# has cost a debug cycle in this file and its NHL sibling. A function defined
# below this line does not exist when main() runs, and the NameError reads
# like a typo rather than an ordering problem. Append ABOVE this block.
# ------------------------------------------------------- awards and all-stars

AW_HEADERS = {
    "year": "Year", "player": "Player", "city": "City", "team": "Team",
    "award": "Awards", "pos": "Pos", "name": "Name", "all_nba": "All NBA",
}

AS_HEADERS = {
    "year": "Year", "league": "League", "player": "Player", "city": "City",
    "team": "Team", "div": "Main Div.", "app": "AS App.", "mvp": "MVP",
    "arena": "Host Arena", "host_city": "Host City", "host_state": "Host State",
    "wl": "W/L", "name": "Name", "hof": "HOF",
}

# Awards whose winner is a single named player and which a season page should
# lead with. Anything else the sheet carries still comes through; this only
# fixes the ORDER, so MVP is not listed under Sixth Man because the workbook
# happened to sort that way.
# 🔴 THESE ARE THE WORKBOOK'S OWN LABELS, CHECKED AGAINST THE SHEET. The first
# version of this list led with "MVP" and the sheet says "Most Valuable
# Player", so the single most important award in the season fell through to the
# catch-all and sorted LAST, under Coach of the Year. It looked fine: a list of
# awards, all present, in an order nobody would query. Read the labels.
AWARD_ORDER = [
    "Most Valuable Player",
    "Finals Most Valuable Player",
    "Rookie of the Year",
    "Defensive Player of the Year",
    "Clutch Player of the Year",
    "Sixth Man of the Year",
    "Most Improved Player",
    "Coach of the Year",
    "Executive of the Year",
]


def _award_rank(label: str) -> tuple[int, str]:
    """Individual honours in a sensible order, then All-NBA teams, then the
    rest. The All-NBA selections are a LIST rather than a winner, so they sort
    below the named awards however many of them there are."""
    s = (label or "").strip()
    low = s.lower()
    for i, want in enumerate(AWARD_ORDER):
        if low.startswith(want.lower()):
            return (i, s)
    if "all nba" in low or "all-nba" in low:
        # 1st, 2nd, 3rd team, in that order, after every named award.
        return (len(AWARD_ORDER) + 1, s)
    return (len(AWARD_ORDER), s)


def read_awards(book: Book) -> dict[int, list[dict]]:
    """{year: [award]}. One row per player-award.

    ⚠️ The sheet mixes individual honours (MVP, Rookie of the Year) with
    All-NBA team selections in the same column. They are separated here rather
    than on the page: a season hub wants "who won MVP" prominently and "who
    made First Team" as a list, and a component should not have to know the
    workbook's vocabulary to tell them apart.
    """
    cols = resolve_columns(book, "Awards", AW_HEADERS)
    inv = {v: k for k, v in cols.items()}
    out: dict[int, list[dict]] = defaultdict(list)
    header_seen = False
    for _r, d in book.rows("Awards", set(cols.values())):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("year"))
        player = str(row.get("player") or "").strip()
        award = str(row.get("award") or "").strip()
        if year is None or not player or not award:
            continue
        out[int(year)].append({
            "player": player,
            "award": award,
            "canonical": str(row.get("name") or "").strip() or None,
            "city": (row.get("city") or None),
            "team": (row.get("team") or None),
            "pos": (row.get("pos") or None),
            "all_nba": bool(str(row.get("all_nba") or "").strip()),
        })
    for year, rows in out.items():
        rows.sort(key=lambda a: _award_rank(a["award"]))
    return out


def read_all_stars(book: Book) -> dict[int, dict]:
    """{year: {host, result, players: [...]}}.

    The All-Star game is a fact ABOUT a season that no other board on the site
    carries per year, which is the whole reason to put it here: the workbook
    knows where the game was played, who hosted, who was picked and which of
    them were MVP, and none of that surfaces anywhere today.
    """
    cols = resolve_columns(book, "All-Stars", AS_HEADERS)
    inv = {v: k for k, v in cols.items()}
    by_year: dict[int, dict] = {}
    header_seen = False
    for _r, d in book.rows("All-Stars", set(cols.values())):
        if not header_seen:
            header_seen = True
            continue
        row = {inv[k]: v for k, v in d.items()}
        year = num(row.get("year"))
        player = str(row.get("player") or "").strip()
        if year is None or not player:
            continue
        year = int(year)
        slot = by_year.setdefault(year, {
            "host_arena": None, "host_city": None, "host_state": None,
            "players": [],
        })
        # The host is a property of the GAME and repeats on every player row.
        # Take the first non-empty rather than the last: the tail of the sheet
        # is where blanks live.
        for k, col in (("host_arena", "arena"), ("host_city", "host_city"),
                       ("host_state", "host_state")):
            if not slot[k] and row.get(col):
                slot[k] = row.get(col)
        slot["players"].append({
            "player": player,
            "canonical": str(row.get("name") or "").strip() or None,
            "city": (row.get("city") or None),
            "team": (row.get("team") or None),
            "conf": (row.get("div") or None),
            "appearance": int(num(row.get("app")) or 0) or None,
            "mvp": bool(str(row.get("mvp") or "").strip()),
            "hof": bool(str(row.get("hof") or "").strip()),
        })
    for year, slot in by_year.items():
        # MVPs first, then by conference, then by name: a reader scanning the
        # list wants the one name that matters at the top.
        slot["players"].sort(key=lambda p: (not p["mvp"], p["conf"] or "", p["player"]))
    return by_year


# 🔴 THE ENTRY POINT STAYS LAST. Appending past it defines the function AFTER
# main() has run; the NameError reads like a typo. Four times in this session
# across two files. APPEND ABOVE THIS BLOCK.
if __name__ == "__main__":
    sys.exit(main())
