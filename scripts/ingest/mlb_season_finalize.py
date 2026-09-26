#!/usr/bin/env python3
"""Bridge the 2026 MLB season into team pages before MLB.xlsx is hand-edited.

WHY THIS EXISTS. scripts/build-mlb-data.py reads MLB.xlsx's "Year by Year"
sheet, and the 2026 row there only gets real numbers when Ashwin edits the
workbook by hand -- normally not until the season (and often the postseason)
is over. Until then, public/data/mlb/seasons-by-team.json carries a
zero-filled 2026 placeholder for every team, and /teams/mlb/<slug> shows
nothing for the current season.

This script writes public/data/mlb/season-overlay.json from ESPN's live MLB
standings (and, once it exists, public/data/mlb/playoffs.json -- see
_scratch/playoffs-contract.md for that bundle's shape). lib/mlb.ts merges the
overlay into the placeholder row at read time, so the season shows up on
team pages without touching the workbook. When Ashwin later fills in
MLB.xlsx by hand, that row stops being a zero-filled placeholder and the
overlay is ignored for that team from then on -- no conflict, no manual
reconciliation.

IMPORTANT: lib/mlb.ts reads public/data at Next.js BUILD time (see
CLAUDE.md's public/data build-relevance rule), not via ISR. Writing this
overlay does not change the live site by itself -- the change only reaches
production on the next build that includes it (a `[vercel skip]`-free
commit, or a scheduled/manual rebuild). Say so to whoever runs this.

Usage:
    python3 scripts/ingest/mlb_season_finalize.py --self-test
    python3 scripts/ingest/mlb_season_finalize.py --season 2026 --dry
    python3 scripts/ingest/mlb_season_finalize.py --season 2026 --write
    python3 scripts/ingest/mlb_season_finalize.py --season 2026 --fixtures _scratch/mlb-fixtures --write

Network: ESPN standings at
    https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings?season=YYYY
Stat names read from that payload mirror lib/mlb-standings.ts exactly: wins,
losses, ties, pointsFor (runs scored), pointsAgainst (runs allowed),
winPercent, divisionRank, leagueRank, playoffSeed.

Playoff bundle: public/data/mlb/playoffs.json, contract in
_scratch/playoffs-contract.md (rounds keyed wc/ds/cs/ws, series with
high/low sides each carrying a franchise slug, winner "high"|"low"|None,
and a top-level "champion"). Missing file is a no-op, not an error -- the
regular season can be finalised long before any playoff series exists.

Stdlib only, no third-party imports (mirrors scripts/ingest/playoff_series.py).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(ROOT, "public", "data", "mlb")
FRANCHISES_PATH = os.path.join(DATA_DIR, "franchises.json")
PLAYOFFS_PATH = os.path.join(DATA_DIR, "playoffs.json")
OVERLAY_PATH = os.path.join(DATA_DIR, "season-overlay.json")
CSV_PATH = os.path.join(ROOT, "_scratch", "mlb-2026-season-rows.csv")

ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings"

DIVISIONS = ["AL East", "AL Central", "AL West", "NL East", "NL Central", "NL West"]

# Escape hatch for any ESPN team.name that does not match a franchises.json
# `name`/`display_name` verbatim. Empty today -- see lib/mlb-standings.ts's
# own CANONICAL_OVERRIDE, which has stayed empty for the same reason: ESPN's
# `name` values ("Yankees", "Diamondbacks", "Athletics") already line up with
# the workbook canonical strings for the modern 30 teams.
CANONICAL_OVERRIDE: dict[str, str] = {}


# --------------------------------------------------------------------- io ---

def load_franchise_map() -> dict[str, str]:
    """ESPN display/team name (and abbreviation) -> workbook canonical."""
    with open(FRANCHISES_PATH, "r", encoding="utf-8") as f:
        franchises = json.load(f)
    m: dict[str, str] = {}
    for fr in franchises:
        canon = fr["canonical"]
        for key in (fr.get("name"), fr.get("display_name"), fr.get("canonical")):
            if key:
                m[key.strip().lower()] = canon
    return m


def load_franchise_divisions() -> dict[str, str]:
    with open(FRANCHISES_PATH, "r", encoding="utf-8") as f:
        franchises = json.load(f)
    return {fr["canonical"]: fr.get("division", "") for fr in franchises}


def load_slug_to_canonical() -> dict[str, str]:
    with open(FRANCHISES_PATH, "r", encoding="utf-8") as f:
        franchises = json.load(f)
    return {fr["slug"]: fr["canonical"] for fr in franchises}


def fetch_espn_standings(season: int) -> dict:
    url = f"{ESPN_STANDINGS_URL}?season={season}"
    # No User-Agent: urllib's own token is the only one that passes ESPN's
    # per-PoP edge policy from every machine this runs on (see the fetch_json
    # note in scripts/predictions/build_mlb_sim.py; a browser UA 403s here).
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_playoffs_bundle(fixtures_dir: str | None) -> dict | None:
    path = os.path.join(fixtures_dir, "playoffs.json") if fixtures_dir else PLAYOFFS_PATH
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------ standings -----

def as_obj(v):
    return v if isinstance(v, dict) else None


def as_arr(v):
    return v if isinstance(v, list) else []


def as_num(v, fallback=0):
    try:
        if v is None:
            return fallback
        return float(v)
    except (TypeError, ValueError):
        return fallback


def as_str(v):
    return v if isinstance(v, str) else ""


def parse_standings(raw: dict, franchise_map: dict[str, str]) -> dict[str, dict]:
    """Mirror lib/mlb-standings.ts's shapeStandings, keyed by canonical.

    Returns {canonical: {wins, losses, ties, games_played, win_pct, rs, ra,
    division_rank, league_rank, playoff_seed, league, division}}. Raises
    (via unresolved list on the caller) rather than guessing an unmapped
    team.
    """
    out: dict[str, dict] = {}
    unresolved: list[str] = []
    children = as_arr(raw.get("children"))

    for child in children:
        child = as_obj(child) or {}
        league_abbr = as_str(child.get("abbreviation")).upper()
        child_name = as_str(child.get("name"))
        child_name_lower = child_name.lower()
        child_id = as_str(child.get("id"))
        league = ""
        if league_abbr == "AL" or league_abbr.startswith("AL ") or "american" in child_name_lower:
            league = "AL"
        elif league_abbr == "NL" or league_abbr.startswith("NL ") or "national" in child_name_lower:
            league = "NL"
        elif child_id == "8":
            league = "AL"
        elif child_id == "7":
            league = "NL"

        direct_entries = as_arr(as_obj(child.get("standings"))
                                 and as_obj(child.get("standings")).get("entries"))
        nested = []
        for div in as_arr(child.get("children")):
            div = as_obj(div) or {}
            div_name = as_str(div.get("name")) or as_str(div.get("abbreviation"))
            for e in as_arr(as_obj(div.get("standings")) and as_obj(div.get("standings")).get("entries")):
                nested.append((e, div_name))

        looks_like_division = any(w in child_name.lower() for w in ("east", "central", "west"))
        flat_default = child_name if looks_like_division else ""
        if direct_entries:
            flat = [(e, flat_default) for e in direct_entries]
        else:
            flat = nested

        for entry, div_hint in flat:
            entry = as_obj(entry) or {}
            team = as_obj(entry.get("team")) or {}
            team_name = as_str(team.get("name")) or as_str(team.get("shortDisplayName"))
            if not team_name:
                continue
            key = team_name.strip().lower()
            canonical = CANONICAL_OVERRIDE.get(team_name) or franchise_map.get(key) \
                or franchise_map.get(as_str(team.get("displayName")).strip().lower())
            if not canonical:
                unresolved.append(team_name)
                continue

            division = div_hint
            if not division:
                for g in as_arr(team.get("groups")):
                    g = as_obj(g) or {}
                    gname = as_str(g.get("name"))
                    if gname and any(w in gname.lower() for w in ("east", "central", "west")):
                        division = gname
                        break
                    parent = as_obj(g.get("parent")) or {}
                    pname = as_str(parent.get("name"))
                    if pname and any(w in pname.lower() for w in ("east", "central", "west")):
                        division = pname
                        break
            if not division and looks_like_division:
                division = child_name

            effective_league = league
            if not effective_league and division:
                dl = division.lower()
                if dl.startswith("al ") or "american" in dl:
                    effective_league = "AL"
                elif dl.startswith("nl ") or "national" in dl:
                    effective_league = "NL"

            stats = as_arr(entry.get("stats"))

            def find_stat(name):
                for s in stats:
                    s = as_obj(s)
                    if s and as_str(s.get("name")) == name:
                        return s
                return None

            def stat_num(name, fallback=0):
                s = find_stat(name)
                return as_num(s.get("value") if s else None, fallback)

            def stat_present(name):
                return find_stat(name) is not None

            wins = stat_num("wins")
            losses = stat_num("losses")
            ties = stat_num("ties")
            rs = stat_num("pointsFor")
            ra = stat_num("pointsAgainst")

            out[canonical] = {
                "wins": int(wins),
                "losses": int(losses),
                "ties": int(ties),
                "games_played": int(wins + losses + ties),
                "win_pct": stat_num("winPercent"),
                "rs": int(rs),
                "ra": int(ra),
                "run_diff": int(rs - ra),
                "division_rank": int(stat_num("divisionRank")) if stat_present("divisionRank") else None,
                "league_rank": int(stat_num("leagueRank")) if stat_present("leagueRank") else None,
                "playoff_seed": int(stat_num("playoffSeed")) if stat_present("playoffSeed") else None,
                "league": effective_league,
                "division": division,
            }

    if unresolved:
        raise SystemExit(
            "mlb_season_finalize: cannot resolve ESPN team(s) to a franchises.json "
            f"canonical: {sorted(set(unresolved))}. Add to CANONICAL_OVERRIDE and rerun."
        )
    return out


# -------------------------------------------------------------- overlay -----

def compute_place_and_flags(standings: dict[str, dict], fr_divisions: dict[str, str],
                             regular_season_complete: bool) -> dict[str, dict]:
    """place ("1".."5"), div_title, best_rec_leag -- only when the regular
    season is over. Until then every team still gets true w/l/rs/ra (they
    are accurate to date) but place stays "" and these two flags stay False,
    per the rule in CLAUDE.md's spirit: don't guess a division finish off an
    incomplete season."""
    result: dict[str, dict] = {c: {"place": "", "div_title": False, "best_rec_leag": False} for c in standings}
    if not regular_season_complete:
        return result

    # Group canonicals by division (prefer the division the standings entry
    # itself carries; fall back to franchises.json).
    by_division: dict[str, list[str]] = {}
    for canon, row in standings.items():
        div = row.get("division") or fr_divisions.get(canon, "")
        by_division.setdefault(div, []).append(canon)

    for div, canons in by_division.items():
        ranked = sorted(canons, key=lambda c: standings[c]["win_pct"], reverse=True)
        for i, canon in enumerate(ranked):
            rank = standings[canon].get("division_rank")
            place = str(rank) if rank else str(i + 1)
            result[canon]["place"] = place
            result[canon]["div_title"] = (place == "1")

    by_league: dict[str, list[str]] = {}
    for canon, row in standings.items():
        lg = row.get("league", "")
        if lg:
            by_league.setdefault(lg, []).append(canon)
    for lg, canons in by_league.items():
        if not canons:
            continue
        best = max(standings[c]["win_pct"] for c in canons)
        for c in canons:
            result[c]["best_rec_leag"] = (standings[c]["win_pct"] == best)

    return result


def _row_complete(row: dict) -> bool:
    try:
        return int(row.get("games_played", 0)) >= 162
    except (TypeError, ValueError):
        return False


def compute_playoff_flags(playoffs: dict | None, slug_to_canonical: dict[str, str],
                           standings: dict[str, dict]) -> tuple[dict[str, dict], bool]:
    flags = {c: {"playoff": False, "lcs_app": False, "ws_app": False,
                  "champ_app": False, "champ": False} for c in standings}

    # ESPN's playoffSeed is a LEAGUE RANK, 1 to 15, for every club, eliminated
    # or not (measured 2026-09-26: the Angels carried seed 15). Only the six
    # per league that make the field count, and only once the regular season
    # is complete, because a 6 seed on 26 September can still be caught. Before
    # that, a club is a playoff club only by appearing in a real series below.
    if all(_row_complete(r) for r in standings.values()):
        for canon, row in standings.items():
            seed = row.get("playoff_seed")
            if seed and 1 <= int(seed) <= 6:
                flags[canon]["playoff"] = True

    postseason_complete = False
    if playoffs is None:
        return flags, postseason_complete

    postseason_complete = bool(playoffs.get("meta", {}).get("complete", False))

    def canon_for_side(side: dict) -> str | None:
        slug = side.get("slug")
        if slug and slug in slug_to_canonical:
            return slug_to_canonical[slug]
        return None

    for round_ in playoffs.get("rounds", []):
        key = round_.get("key")
        for series in round_.get("series", []):
            for side_key in ("high", "low"):
                side = series.get(side_key) or {}
                canon = canon_for_side(side)
                if not canon or canon not in flags:
                    continue
                flags[canon]["playoff"] = True
                if key == "cs":
                    flags[canon]["lcs_app"] = True
                if key == "ws":
                    flags[canon]["ws_app"] = True
                    flags[canon]["champ_app"] = True

    champion = playoffs.get("champion")
    if champion:
        canon = canon_for_side(champion)
        if canon and canon in flags:
            flags[canon]["champ"] = True

    return flags, postseason_complete


def build_overlay(season: int, standings: dict[str, dict], fr_divisions: dict[str, str],
                   playoffs: dict | None, slug_to_canonical: dict[str, str]) -> dict:
    regular_season_complete = bool(standings) and all(
        row["games_played"] >= 162 for row in standings.values()
    )
    place_flags = compute_place_and_flags(standings, fr_divisions, regular_season_complete)
    playoff_flags, postseason_complete = compute_playoff_flags(playoffs, slug_to_canonical, standings)

    teams = {}
    for canon, row in standings.items():
        teams[canon] = {
            "w": row["wins"],
            "l": row["losses"],
            "t": row["ties"],
            "win_pct": round(row["win_pct"], 4),
            "rs": row["rs"],
            "ra": row["ra"],
            "run_diff": row["run_diff"],
            "place": place_flags[canon]["place"],
            "div_title": place_flags[canon]["div_title"],
            "best_rec_leag": place_flags[canon]["best_rec_leag"],
            "playoff": playoff_flags[canon]["playoff"],
            "lcs_app": playoff_flags[canon]["lcs_app"],
            "ws_app": playoff_flags[canon]["ws_app"],
            "champ_app": playoff_flags[canon]["champ_app"],
            "champ": playoff_flags[canon]["champ"],
        }

    return {
        "meta": {
            "season": season,
            "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "regular_season_complete": regular_season_complete,
            "postseason_complete": postseason_complete,
            "source": "ESPN standings + playoffs.json",
        },
        "teams": teams,
    }


# ------------------------------------------------------------------ csv -----

CSV_COLUMNS = [
    ("League", lambda c, r: "MLB"),
    ("Year", lambda c, r, season: season),
    ("City", lambda c, r, fr: fr.get(c, {}).get("city", "")),
    ("Team", lambda c, r, fr: fr.get(c, {}).get("team", "")),
    ("W", lambda c, r: r["w"]),
    ("L", lambda c, r: r["l"]),
    ("Win. %", lambda c, r: r["win_pct"]),
    ("Runs Sc.", lambda c, r: r["rs"]),
    ("Runs Al.", lambda c, r: r["ra"]),
    ("Play. Ap", lambda c, r: "Y" if r["playoff"] else "N"),
    ("Div. Title", lambda c, r: "Y" if r["div_title"] else "N"),
    ("Best Rec (Leag)", lambda c, r: "Y" if r["best_rec_leag"] else "N"),
    ("LCS App", lambda c, r: "Y" if r["lcs_app"] else "N"),
    ("WS App", lambda c, r: "Y" if r["ws_app"] else "N"),
    ("WS Champ", lambda c, r: "Y" if r["champ"] else "N"),
    ("Division", lambda c, r, fr: fr.get(c, {}).get("division", "")),
    ("Place #", lambda c, r: r["place"]),
    ("Name", lambda c, r: c),
]


def write_csv(season: int, overlay: dict):
    """One row per team, in MLB.xlsx 'Year by Year' column order (see
    scripts/build-mlb-data.py:read_year_by_year for the column indices this
    mirrors), so Ashwin can paste the finished season straight into the
    workbook once the World Series is over. Only written with --write."""
    with open(FRANCHISES_PATH, "r", encoding="utf-8") as f:
        franchises = {fr["canonical"]: fr for fr in json.load(f)}

    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["League", "Year", "City", "Team", "W", "L", "Win. %", "Runs Sc.",
                    "Runs Al.", "Play. Ap", "Div. Title", "Best Rec (Leag)", "LCS App",
                    "WS App", "WS Champ", "Division", "Place #", "Name"])
        for canon in sorted(overlay["teams"]):
            r = overlay["teams"][canon]
            fr = franchises.get(canon, {})
            w.writerow([
                "MLB", season, fr.get("city", ""), fr.get("team", canon),
                r["w"], r["l"], r["win_pct"], r["rs"], r["ra"],
                "Y" if r["playoff"] else "N", "Y" if r["div_title"] else "N",
                "Y" if r["best_rec_leag"] else "N", "Y" if r["lcs_app"] else "N",
                "Y" if r["ws_app"] else "N", "Y" if r["champ"] else "N",
                fr.get("division", ""), r["place"], canon,
            ])


# ------------------------------------------------------------- self-test ----

def _synthetic_standings_payload(complete: bool) -> dict:
    """One league (AL), one division (AL East) with 5 teams, so
    div_title/best_rec_leag/place logic is fully exercised without needing
    all 30 teams. games_played hits 162 for every team when `complete`."""
    gp = 162 if complete else 80

    def team(name, wins, losses, seed=None):
        stats = [
            {"name": "wins", "value": wins},
            {"name": "losses", "value": losses},
            {"name": "ties", "value": 0},
            {"name": "pointsFor", "value": 700},
            {"name": "pointsAgainst", "value": 600},
            {"name": "winPercent", "value": round(wins / gp, 4)},
            {"name": "divisionRank", "value": 0},  # unused; rank computed
        ]
        if seed is not None:
            stats.append({"name": "playoffSeed", "value": seed})
        return {
            "team": {"name": name, "displayName": f"City {name}"},
            "stats": stats,
        }

    al_east = [
        team("Yankees", int(gp * 0.65), gp - int(gp * 0.65), seed=1),
        team("Red Sox", int(gp * 0.55), gp - int(gp * 0.55), seed=5),
        team("Blue Jays", int(gp * 0.50), gp - int(gp * 0.50)),
        team("Orioles", int(gp * 0.45), gp - int(gp * 0.45)),
        team("Rays", int(gp * 0.40), gp - int(gp * 0.40)),
    ]
    nl_east = [
        team("Braves", int(gp * 0.60), gp - int(gp * 0.60), seed=2),
        team("Mets", int(gp * 0.52), gp - int(gp * 0.52)),
        team("Phillies", int(gp * 0.58), gp - int(gp * 0.58), seed=4),
        team("Marlins", int(gp * 0.38), gp - int(gp * 0.38)),
        team("Nationals", int(gp * 0.35), gp - int(gp * 0.35)),
    ]
    return {
        "children": [
            {"abbreviation": "AL", "name": "American League",
             "children": [{"name": "AL East", "standings": {"entries": al_east}}]},
            {"abbreviation": "NL", "name": "National League",
             "children": [{"name": "NL East", "standings": {"entries": nl_east}}]},
        ]
    }


def _synthetic_franchise_map() -> dict[str, str]:
    names = ["Yankees", "Red Sox", "Blue Jays", "Orioles", "Rays",
             "Braves", "Mets", "Phillies", "Marlins", "Nationals"]
    return {n.lower(): n for n in names}


def _synthetic_fr_divisions() -> dict[str, str]:
    return {
        "Yankees": "AL East", "Red Sox": "AL East", "Blue Jays": "AL East",
        "Orioles": "AL East", "Rays": "AL East",
        "Braves": "NL East", "Mets": "NL East", "Phillies": "NL East",
        "Marlins": "NL East", "Nationals": "NL East",
    }


def _synthetic_playoffs_bundle() -> dict:
    return {
        "meta": {"league": "mlb", "season": 2026, "complete": True},
        "rounds": [
            {"key": "wc", "name": "Wild Card Series", "order": 1, "series": [
                {"high": {"slug": "yankees"}, "low": {"slug": "red-sox"}, "winner": "high"},
            ]},
            {"key": "cs", "name": "League Championship Series", "order": 3, "series": [
                {"high": {"slug": "yankees"}, "low": {"slug": "phillies"}, "winner": "high"},
            ]},
            {"key": "ws", "name": "World Series", "order": 4, "series": [
                {"high": {"slug": "yankees"}, "low": {"slug": "braves"}, "winner": "high"},
            ]},
        ],
        "champion": {"slug": "yankees"},
    }


def _synthetic_slug_map() -> dict[str, str]:
    return {"yankees": "Yankees", "red-sox": "Red Sox", "phillies": "Phillies", "braves": "Braves"}


def self_test():
    checks = [0]

    def check(name, cond):
        checks[0] += 1
        if not cond:
            raise SystemExit(f"self-test FAILED: {name}")

    fmap = _synthetic_franchise_map()
    fdivs = _synthetic_fr_divisions()

    # --- Incomplete regular season: numbers real, place/flags withheld ----
    raw_incomplete = _synthetic_standings_payload(complete=False)
    standings_incomplete = parse_standings(raw_incomplete, fmap)
    check("parses all 10 synthetic teams", len(standings_incomplete) == 10)
    check("Yankees w/l populated mid-season",
          standings_incomplete["Yankees"]["wins"] > 0 and standings_incomplete["Yankees"]["losses"] > 0)
    overlay_incomplete = build_overlay(2026, standings_incomplete, fdivs, None, {})
    check("regular_season_complete False mid-season",
          overlay_incomplete["meta"]["regular_season_complete"] is False)
    check("place withheld mid-season", overlay_incomplete["teams"]["Yankees"]["place"] == "")
    check("div_title withheld mid-season", overlay_incomplete["teams"]["Yankees"]["div_title"] is False)
    check("best_rec_leag withheld mid-season", overlay_incomplete["teams"]["Yankees"]["best_rec_leag"] is False)
    check("w/l still true to date mid-season", overlay_incomplete["teams"]["Yankees"]["w"] > 0)

    # --- Complete regular season: place + flags computed ------------------
    raw_complete = _synthetic_standings_payload(complete=True)
    standings_complete = parse_standings(raw_complete, fmap)
    overlay_complete = build_overlay(2026, standings_complete, fdivs, None, {})
    check("regular_season_complete True", overlay_complete["meta"]["regular_season_complete"] is True)
    check("Yankees win AL East (best win pct in division)",
          overlay_complete["teams"]["Yankees"]["place"] == "1")
    check("Yankees div_title True", overlay_complete["teams"]["Yankees"]["div_title"] is True)
    check("Red Sox (2nd in division) place is 2",
          overlay_complete["teams"]["Red Sox"]["place"] == "2")
    check("Red Sox div_title False", overlay_complete["teams"]["Red Sox"]["div_title"] is False)
    check("Yankees best record in AL", overlay_complete["teams"]["Yankees"]["best_rec_leag"] is True)
    check("Braves best record in NL (0.60)", overlay_complete["teams"]["Braves"]["best_rec_leag"] is True)
    check("Mets not best record in NL", overlay_complete["teams"]["Mets"]["best_rec_leag"] is False)

    # --- Playoff flags from the synthetic bundle ---------------------------
    bundle = _synthetic_playoffs_bundle()
    slug_map = _synthetic_slug_map()
    overlay_playoffs = build_overlay(2026, standings_complete, fdivs, bundle, slug_map)
    check("postseason_complete True", overlay_playoffs["meta"]["postseason_complete"] is True)
    check("Yankees playoff True (in wc series)", overlay_playoffs["teams"]["Yankees"]["playoff"] is True)
    check("Yankees lcs_app True (in cs series)", overlay_playoffs["teams"]["Yankees"]["lcs_app"] is True)
    check("Yankees ws_app True (in ws series)", overlay_playoffs["teams"]["Yankees"]["ws_app"] is True)
    check("Yankees champ_app == ws_app", overlay_playoffs["teams"]["Yankees"]["champ_app"] is True)
    check("Yankees champ True (bundle champion)", overlay_playoffs["teams"]["Yankees"]["champ"] is True)
    check("Braves ws_app True but champ False (lost WS)",
          overlay_playoffs["teams"]["Braves"]["ws_app"] is True
          and overlay_playoffs["teams"]["Braves"]["champ"] is False)
    check("Phillies lcs_app True but ws_app False (lost LCS)",
          overlay_playoffs["teams"]["Phillies"]["lcs_app"] is True
          and overlay_playoffs["teams"]["Phillies"]["ws_app"] is False)
    check("Marlins never in a series: all playoff flags False",
          not any([overlay_playoffs["teams"]["Marlins"]["playoff"],
                   overlay_playoffs["teams"]["Marlins"]["lcs_app"],
                   overlay_playoffs["teams"]["Marlins"]["ws_app"],
                   overlay_playoffs["teams"]["Marlins"]["champ"]]))

    # --- No playoffs.json is a no-op, not a crash --------------------------
    # Yankees still reads playoff True here because standings_complete gives
    # them a playoff_seed (the "seed present" half of the playoff rule does
    # not need a bundle at all); Marlins has no seed and no bundle, so it
    # stays False -- that is the actual no-op this checks.
    overlay_no_playoffs = build_overlay(2026, standings_complete, fdivs, None, {})
    check("postseason_complete False with no bundle",
          overlay_no_playoffs["meta"]["postseason_complete"] is False)
    check("Yankees playoff True from seed alone, no bundle needed",
          overlay_no_playoffs["teams"]["Yankees"]["playoff"] is True)
    # ESPN seeds every club 1..15; only 1..6 make the field, and only once the
    # season is complete (a 6 seed with games left can still be caught).
    standings_incomplete = parse_standings(_synthetic_standings_payload(complete=False), fmap)
    overlay_incomplete = build_overlay(2026, standings_incomplete, fdivs, None, {})
    check("no playoff flag from a seed while games remain",
          overlay_incomplete["teams"]["Yankees"]["playoff"] is False)
    standings_seed15 = parse_standings(_synthetic_standings_payload(complete=True), fmap)
    standings_seed15["Marlins"]["playoff_seed"] = 15
    overlay_seed15 = build_overlay(2026, standings_seed15, fdivs, None, {})
    check("seed 15 (an eliminated club's league rank) is not a playoff flag",
          overlay_seed15["teams"]["Marlins"]["playoff"] is False)
    check("no lcs/ws/champ flags without a bundle",
          overlay_no_playoffs["teams"]["Yankees"]["lcs_app"] is False
          and overlay_no_playoffs["teams"]["Yankees"]["ws_app"] is False
          and overlay_no_playoffs["teams"]["Yankees"]["champ"] is False)
    check("Marlins (no seed, no bundle) not marked playoff",
          overlay_no_playoffs["teams"]["Marlins"]["playoff"] is False)

    # --- Unresolved team name refuses rather than guessing ------------------
    bad_raw = {"children": [{"abbreviation": "AL", "children": [
        {"name": "AL East", "standings": {"entries": [
            {"team": {"name": "Nonexistent Team"}, "stats": [{"name": "wins", "value": 1},
                                                               {"name": "losses", "value": 1}]},
        ]}},
    ]}]}
    try:
        parse_standings(bad_raw, fmap)
        raise SystemExit("self-test FAILED: unresolved team should have raised")
    except SystemExit as e:
        if "self-test FAILED" in str(e):
            raise
        check("unresolved team refuses (exit, not a guess)", True)

    print(f"mlb_season_finalize self-test OK -- {checks[0]} checks")


# -------------------------------------------------------------------- cli ---

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=dt.date.today().year)
    ap.add_argument("--dry", action="store_true", help="print the overlay, do not write")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fixtures", default=None, help="read standings.json/playoffs.json from this dir instead of the network")
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    franchise_map = load_franchise_map()
    fr_divisions = load_franchise_divisions()
    slug_to_canonical = load_slug_to_canonical()

    if args.fixtures:
        with open(os.path.join(args.fixtures, "standings.json"), "r", encoding="utf-8") as f:
            raw = json.load(f)
    else:
        raw = fetch_espn_standings(args.season)

    standings = parse_standings(raw, franchise_map)
    playoffs = load_playoffs_bundle(args.fixtures)

    overlay = build_overlay(args.season, standings, fr_divisions, playoffs, slug_to_canonical)

    if args.write:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(OVERLAY_PATH, "w", encoding="utf-8") as f:
            json.dump(overlay, f, indent=2)
            f.write("\n")
        write_csv(args.season, overlay)
        print(f"Wrote {OVERLAY_PATH} and {CSV_PATH}")
    else:
        print(json.dumps(overlay, indent=2))
        if not args.dry:
            print("\n(dry-run is the default; pass --write to write the overlay)", file=sys.stderr)


if __name__ == "__main__":
    main()
