#!/usr/bin/env python3
"""
extract-nba-top-games.py
------------------------
Reads NBA_RegSeason.xlsx (path passed as first CLI argument) and writes three
JSON files into public/data/nba/:

  top-games-by-team.json    — top 10 games per franchise (keyed by slug)
  top-games-all-time.json   — top 50 games across all time (deduplicated)
  top-games-by-decade.json  — top 10 per decade (deduplicated, keyed by decade)

The Excel file is NOT committed to the repo — run this script locally whenever
the workbook is updated and commit only the JSON outputs.

Usage:
  python scripts/extract-nba-top-games.py "path/to/NBA_RegSeason.xlsx"
  python scripts/extract-nba-top-games.py "path/to/NBA_RegSeason.xlsx" --out-dir public/data/nba

The script auto-detects the project root (parent of the scripts/ folder).
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, date

import pandas as pd

# ---------------------------------------------------------------------------
# Franchise canonical → slug (matches franchises.json)
# ---------------------------------------------------------------------------
CANONICAL_TO_SLUG: dict[str, str] = {
    "Hawks": "hawks",
    "Celtics": "celtics",
    "Nets": "nets",
    "Hornets": "hornets",
    "Bulls": "bulls",
    "Cavaliers": "cavaliers",
    "Mavericks": "mavericks",
    "Nuggets": "nuggets",
    "Pistons": "pistons",
    "Warriors": "warriors",
    "Rockets": "rockets",
    "Pacers": "pacers",
    "Clippers": "clippers",
    "Lakers": "lakers",
    "Grizzlies": "grizzlies",
    "Heat": "heat",
    "Bucks": "bucks",
    "Timberwolves": "timberwolves",
    "Pelicans": "pelicans",
    "Knicks": "knicks",
    "Thunder": "thunder",
    "Magic": "magic",
    "76ers": "76ers",
    "Suns": "suns",
    "Trail Blazers": "trail-blazers",
    "Kings": "kings",
    "Spurs": "spurs",
    "Raptors": "raptors",
    "Jazz": "jazz",
    "Wizards": "wizards",
}

TOP_N_TEAM = 10       # top games per franchise
TOP_N_ALL_TIME = 50   # league-wide all-time table
TOP_N_DECADE = 10     # per-decade table

# Rounds to skip (All-Star, preseason, exhibition, etc.)
SKIP_ROUNDS = {"All-Star Game", "All-Star", "Preseason"}


def fmt_date(v) -> str | None:
    """Normalise whatever openpyxl/pandas hands back to an ISO date string."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    # pandas may give "YYYY-MM-DD HH:MM:SS"
    if " " in s:
        s = s.split()[0]
    return s or None


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract NBA top games from workbook")
    parser.add_argument("xlsx", help="Path to NBA_RegSeason.xlsx")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory for JSON files (default: <project-root>/public/data/nba)",
    )
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx).expanduser()
    if not xlsx_path.exists():
        sys.exit(f"ERROR: file not found: {xlsx_path}")

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    out_dir = Path(args.out_dir) if args.out_dir else project_root / "public" / "data" / "nba"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading {xlsx_path} …")
    df = pd.read_excel(
        xlsx_path,
        sheet_name="Regular Season",
        engine="openpyxl",
    )
    print(f"  Loaded {len(df):,} rows, {len(df.columns)} columns")

    # -----------------------------------------------------------------------
    # Column references (by name — more robust than positional index)
    # -----------------------------------------------------------------------
    COL = {c: i for i, c in enumerate(df.columns)}

    def col(name: str):
        return df.columns[COL[name]]

    # Rename the unnamed trailing columns so we can reference them safely
    # The Game Score column header is "Game Score" per the Claude Notes
    # Verify it exists
    if "Game Score" not in df.columns:
        sys.exit("ERROR: 'Game Score' column not found — check the sheet name or column headers")

    # -----------------------------------------------------------------------
    # Filter rows
    # -----------------------------------------------------------------------
    # 1. Game Score must be numeric and non-null
    df = df[pd.to_numeric(df["Game Score"], errors="coerce").notna()].copy()
    df["game_score"] = pd.to_numeric(df["Game Score"], errors="coerce")

    # 2. Drop All-Star, preseason, etc.
    if "Round" in df.columns:
        df = df[~df["Round"].isin(SKIP_ROUNDS)]

    print(f"  {len(df):,} rows after filtering (numeric game score, non-exhibition)")

    # -----------------------------------------------------------------------
    # Derive decade
    # -----------------------------------------------------------------------
    df["decade"] = (df["Season"] // 10 * 10).astype(int)

    # -----------------------------------------------------------------------
    # Helper: build a TopGameTeamRow dict from a single DataFrame row
    # -----------------------------------------------------------------------
    def team_row(r) -> dict:
        ot_raw = r.get("OT")
        ot = bool(ot_raw) if (ot_raw is not None and not (isinstance(ot_raw, float) and pd.isna(ot_raw))) else False

        arena_as_of = r.get("Arena") or ""
        arena_canonical = r.get("Final/Current Arena Name") or arena_as_of
        if isinstance(arena_as_of, float) and pd.isna(arena_as_of):
            arena_as_of = ""
        if isinstance(arena_canonical, float) and pd.isna(arena_canonical):
            arena_canonical = arena_as_of

        arena_metro = r.get("Arena Area") or ""
        arena_state = r.get("Arena State") or ""
        if isinstance(arena_metro, float) and pd.isna(arena_metro):
            arena_metro = ""
        if isinstance(arena_state, float) and pd.isna(arena_state):
            arena_state = ""

        opp_canonical = r.get("Opponent") or ""
        if isinstance(opp_canonical, float) and pd.isna(opp_canonical):
            opp_canonical = ""
        opp_slug = CANONICAL_TO_SLUG.get(str(opp_canonical)) if opp_canonical else None

        rnd = r.get("Round") or ""
        if isinstance(rnd, float) and pd.isna(rnd):
            rnd = ""

        rnd_num = r.get("Round #")
        if rnd_num is not None and isinstance(rnd_num, float) and pd.isna(rnd_num):
            rnd_num = None
        else:
            try:
                rnd_num = int(rnd_num) if rnd_num is not None else None
            except (TypeError, ValueError):
                rnd_num = None

        gm_num = r.get("Gm #")
        if gm_num is not None and isinstance(gm_num, float) and pd.isna(gm_num):
            gm_num = None
        else:
            try:
                gm_num = int(gm_num) if gm_num is not None else None
            except (TypeError, ValueError):
                gm_num = None

        return {
            "year": int(r["Season"]),
            "date": fmt_date(r.get("Date")),
            "round": str(rnd),
            "round_num": rnd_num,
            "game_num": gm_num,
            "team_city": str(r.get("City") or ""),
            "team_team": str(r.get("Team") or ""),
            "team_canonical": str(r.get("Name") or ""),
            "opp_city": str(r.get("Other City") or ""),
            "opp_team": str(r.get("Other Team") or ""),
            "opp_canonical": str(opp_canonical),
            "result": str(r.get("W/L") or ""),
            "team_pts": int(r["PF"]) if pd.notna(r.get("PF")) else 0,
            "opp_pts": int(r["PA"]) if pd.notna(r.get("PA")) else 0,
            "ot": ot,
            "arena_as_of": str(arena_as_of),
            "arena_canonical": str(arena_canonical),
            "arena_metro": str(arena_metro),
            "arena_state": str(arena_state),
            "league": str(r.get("Lge") or "NBA"),
            "game_score": round(float(r["game_score"]), 6),
            "opp_slug": opp_slug,
        }

    # -----------------------------------------------------------------------
    # 1. top-games-by-team.json  (team perspective, top 10 per franchise slug)
    # -----------------------------------------------------------------------
    print("Building top-games-by-team …")
    by_team: dict[str, list] = {}

    for canonical, group in df.groupby("Name"):
        slug = CANONICAL_TO_SLUG.get(str(canonical))
        if not slug:
            continue  # defunct / ABA franchise not in active map — skip
        top = group.nlargest(TOP_N_TEAM, "game_score")
        rows = [team_row(r) for _, r in top.iterrows()]
        by_team[slug] = rows

    out_team = out_dir / "top-games-by-team.json"
    out_team.write_text(json.dumps(by_team, ensure_ascii=False, indent=2))
    print(f"  → {out_team}  ({len(by_team)} franchises)")

    # -----------------------------------------------------------------------
    # Deduplicate for league-wide tables (each game has two rows, one per team)
    # Strategy: keep the winner's row (W/L == 'W'). For ties keep either.
    # Use GameCode as the dedup key.
    # -----------------------------------------------------------------------
    if "GameCode" not in df.columns:
        sys.exit("ERROR: 'GameCode' column not found")

    # Prefer the W row; if none (e.g. tie or neutral), keep the first
    df_w = df[df["W/L"] == "W"].copy()
    df_other = df[df["W/L"] != "W"].copy()

    # For any GameCode already covered by a W row, drop duplicates from other
    covered = set(df_w["GameCode"].dropna())
    df_other_unique = df_other[~df_other["GameCode"].isin(covered)]

    df_dedup = pd.concat([df_w, df_other_unique], ignore_index=True)
    # Final dedup in case of duplicate GameCodes within the W rows
    df_dedup = df_dedup.sort_values("game_score", ascending=False).drop_duplicates(
        subset=["GameCode"]
    )

    # -----------------------------------------------------------------------
    # Helper: build a TopGameLeagueRow dict from a deduplicated (winner) row
    # -----------------------------------------------------------------------
    def league_row(r) -> dict:
        ot_raw = r.get("OT")
        ot = bool(ot_raw) if (ot_raw is not None and not (isinstance(ot_raw, float) and pd.isna(ot_raw))) else False

        winner_canonical = str(r.get("Name") or "")
        loser_canonical = str(r.get("Opponent") or "")
        if isinstance(loser_canonical, float) and pd.isna(loser_canonical):
            loser_canonical = ""

        winner_slug = CANONICAL_TO_SLUG.get(winner_canonical)
        loser_slug = CANONICAL_TO_SLUG.get(loser_canonical)

        arena_as_of = r.get("Arena") or ""
        arena_canonical = r.get("Final/Current Arena Name") or arena_as_of
        if isinstance(arena_as_of, float) and pd.isna(arena_as_of):
            arena_as_of = ""
        if isinstance(arena_canonical, float) and pd.isna(arena_canonical):
            arena_canonical = arena_as_of

        arena_metro = r.get("Arena Area") or ""
        arena_state = r.get("Arena State") or ""
        if isinstance(arena_metro, float) and pd.isna(arena_metro):
            arena_metro = ""
        if isinstance(arena_state, float) and pd.isna(arena_state):
            arena_state = ""

        rnd = r.get("Round") or ""
        if isinstance(rnd, float) and pd.isna(rnd):
            rnd = ""

        rnd_num = r.get("Round #")
        if rnd_num is not None and isinstance(rnd_num, float) and pd.isna(rnd_num):
            rnd_num = None
        else:
            try:
                rnd_num = int(rnd_num) if rnd_num is not None else None
            except (TypeError, ValueError):
                rnd_num = None

        gm_num = r.get("Gm #")
        if gm_num is not None and isinstance(gm_num, float) and pd.isna(gm_num):
            gm_num = None
        else:
            try:
                gm_num = int(gm_num) if gm_num is not None else None
            except (TypeError, ValueError):
                gm_num = None

        return {
            "year": int(r["Season"]),
            "date": fmt_date(r.get("Date")),
            "round": str(rnd),
            "round_num": rnd_num,
            "game_num": gm_num,
            "winner_canonical": winner_canonical,
            "loser_canonical": loser_canonical,
            "winner_city": str(r.get("City") or ""),
            "winner_team": str(r.get("Team") or ""),
            "loser_city": str(r.get("Other City") or ""),
            "loser_team": str(r.get("Other Team") or ""),
            "winner_pts": int(r["PF"]) if pd.notna(r.get("PF")) else 0,
            "loser_pts": int(r["PA"]) if pd.notna(r.get("PA")) else 0,
            "ot": ot,
            "arena_as_of": str(arena_as_of),
            "arena_canonical": str(arena_canonical),
            "arena_metro": str(arena_metro),
            "arena_state": str(arena_state),
            "league": str(r.get("Lge") or "NBA"),
            "game_score": round(float(r["game_score"]), 6),
            "winner_slug": winner_slug,
            "loser_slug": loser_slug,
        }

    # -----------------------------------------------------------------------
    # 2. top-games-all-time.json  (top 50 deduplicated)
    # -----------------------------------------------------------------------
    print("Building top-games-all-time …")
    top_all = df_dedup.nlargest(TOP_N_ALL_TIME, "game_score")
    all_time_rows = [league_row(r) for _, r in top_all.iterrows()]

    out_all = out_dir / "top-games-all-time.json"
    out_all.write_text(json.dumps(all_time_rows, ensure_ascii=False, indent=2))
    print(f"  → {out_all}  ({len(all_time_rows)} games)")

    # -----------------------------------------------------------------------
    # 3. top-games-by-decade.json  (top 10 per decade, deduplicated)
    # -----------------------------------------------------------------------
    print("Building top-games-by-decade …")
    by_decade: dict[str, list] = {}

    for decade, group in df_dedup.groupby("decade"):
        top = group.nlargest(TOP_N_DECADE, "game_score")
        rows = [league_row(r) for _, r in top.iterrows()]
        by_decade[str(int(decade))] = rows

    out_dec = out_dir / "top-games-by-decade.json"
    out_dec.write_text(json.dumps(by_decade, ensure_ascii=False, indent=2))
    print(f"  → {out_dec}  ({len(by_decade)} decades)")

    print("\nDone. Commit only the three JSON files — not the Excel.")


if __name__ == "__main__":
    main()
