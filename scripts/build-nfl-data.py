#!/usr/bin/env python3
"""
Build NFL team-pages data from NFL_all.xlsx.

Reads the canonical NFL workbook (NFL_all_backup.xlsx in the user's
OneDrive Excel Files folder, or a path passed on the command line) and
emits four JSON files under public/data/nfl/.

Outputs:
  public/data/nfl/franchises.json       - 32 active franchises (index + per-page header)
  public/data/nfl/championships.json    - one entry per championship year per franchise
  public/data/nfl/stadium-history.json  - stadium-era rows grouped by canonical franchise
  public/data/nfl/award-winners.json    - MVP, COY, OPOY, etc. grouped by franchise
  public/data/nfl/historical.json       - defunct franchises for /teams/nfl/historical
  public/data/nfl/hall-of-fame.json     - HoF inductees by primary team (v1: primary only)
  public/data/nfl/pro-bowl-counts.json  - per-franchise Pro Bowl selection counts
  public/data/nfl/seasons-by-team.json  - per-franchise season-by-season rows

Canonical join key throughout: Year by Year col DN ("Name"). Every other
sheet's "Name"-equivalent column joins back to this. See the workbook's
"Claude Notes" sheet for full schema.

Usage:
  python scripts/build-nfl-data.py
  python scripts/build-nfl-data.py /path/to/NFL_all_backup.xlsx
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

try:
    import openpyxl
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl",
                           "--quiet", "--break-system-packages"])
    import openpyxl


# -------- Constants --------

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE_CANDIDATES = [
    # User's OneDrive (Windows) — preferred when present
    Path(os.path.expanduser("~/OneDrive/Excel Files/NFL_all_backup.xlsx")),
    Path(os.path.expanduser("~/OneDrive/Excel Files/NFL_all - Copy.xlsx")),
    Path(os.path.expanduser("~/OneDrive/Excel Files/NFL_all.xlsx")),
    # OneDrive via Linux bindfs mount
    Path("/sessions/jolly-tender-turing/mnt/Excel Files/NFL_all_backup.xlsx"),
    Path("/sessions/jolly-tender-turing/mnt/Excel Files/NFL_all - Copy.xlsx"),
    Path("/sessions/jolly-tender-turing/mnt/Excel Files/NFL_all.xlsx"),
    # Project-local fallback (if the user committed a frozen copy)
    REPO_ROOT / "data" / "nfl-source" / "NFL_all_backup.xlsx",
    REPO_ROOT / "data" / "nfl-source" / "NFL_all.xlsx",
    # Bootstrap fallback to the most recent upload
    Path("/sessions/jolly-tender-turing/mnt/uploads/NFL_all - Copy-5a2eae1a.xlsx"),
]

OUT_DIR = REPO_ROOT / "public" / "data" / "nfl"

# Stolen-championship editorial flag for Pottsville Maroons 1925.
# Documented at the /teams/nfl/historical page; see scope memory.
STOLEN_TITLES = {
    ("Maroons", 1925): "Won on the field; stripped after a Notre Dame All-Stars exhibition in "
                       "Frankford's territory. Pete Rozelle reviewed in 1963 and 1972. "
                       "NFL owners voted 30-2 in 2003 to leave the title with the Cardinals. "
                       "The Maroons faithful have never accepted it.",
}


# -------- Helpers --------

def slugify(s):
    s = (s or "").lower().strip()
    s = re.sub(r"[àáâãäå]", "a", s)
    s = re.sub(r"[èéêë]", "e", s)
    s = re.sub(r"[ìíîï]", "i", s)
    s = re.sub(r"[òóôõö]", "o", s)
    s = re.sub(r"[ùúûü]", "u", s)
    s = re.sub(r"[ñ]", "n", s)
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def safe_int(val, default=0):
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return default


def safe_float(val, default=0.0):
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_str(val):
    if val is None:
        return ""
    return str(val).strip()


def metro_slug_from_metro_area(metro_area):
    """Map the workbook's 'Metro Area' string to the rankings-side metro slug."""
    if not metro_area:
        return None
    return slugify(metro_area)


def find_source_xlsx(argv):
    if len(argv) >= 2:
        p = Path(argv[1])
        if p.exists():
            return p
        print(f"WARN: explicit path {p} not found, falling back to defaults", file=sys.stderr)
    for c in DEFAULT_SOURCE_CANDIDATES:
        if c.exists():
            return c
    raise SystemExit(f"No NFL workbook found. Checked: {DEFAULT_SOURCE_CANDIDATES}")


# -------- Sheet readers --------

def read_lookup_block3(wb):
    """
    Lookup sheet, cols N-U rows 2-37: current 32-team rich detail.
    Returns dict keyed on canonical team short name (col O):
      {"Cardinals": {city, team, division, conf, stadium, stadium_city, metro, state}}
    """
    ws = wb["Lookup"]
    out = {}
    for i, row in enumerate(ws.iter_rows(min_row=2, max_row=40, values_only=True), start=2):
        # Cols N-U = indices 13-20 (0-based). Pad to length 22 just in case.
        row = list(row) + [None] * max(0, 22 - len(row))
        city = safe_str(row[13])
        team = safe_str(row[14])
        division = safe_str(row[15])
        conf = safe_str(row[16])
        stadium = safe_str(row[17])
        stadium_city = safe_str(row[18])
        metro = safe_str(row[19])
        state = safe_str(row[20])
        if not team:
            continue
        out[team] = {
            "city": city,
            "team": team,
            "division": division,
            "conf": conf,
            "stadium": stadium,
            "stadium_city": stadium_city,
            "metro": metro,
            "state": state,
        }
    return out


def read_totals(wb):
    """
    Totals sheet: one row per franchise. AK col is canonical name (join key).
    Returns dict keyed on canonical name -> franchise record.
    """
    ws = wb["Totals"]
    out = {}
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        row = list(row) + [None] * max(0, 37 - len(row))
        league = safe_str(row[0])
        city = safe_str(row[1])
        team_hist = safe_str(row[2])
        # D-G: W L T Win%
        w = safe_int(row[3])
        l = safe_int(row[4])
        t = safe_int(row[5])
        winpct = safe_float(row[6])
        # H: # seasons; I: .500 seasons
        seasons = safe_int(row[7])
        sea500 = safe_int(row[8])
        # J-K: P. App, Div. Titles
        playoff_apps = safe_int(row[9])
        div_titles = safe_int(row[10])
        # L-M: Best Main Div, Best Rec.
        best_div_count = safe_int(row[11])
        best_rec_count = safe_int(row[12])
        # N-O: Chmp App, Chmps
        champ_apps = safe_int(row[13])
        champs = safe_int(row[14])
        # P-S: Playoff W L T Win%
        p_w = safe_int(row[15])
        p_l = safe_int(row[16])
        p_t = safe_int(row[17])
        p_winpct = safe_float(row[18])
        # T-U: CF App, CF Wins
        cf_app = safe_int(row[19])
        cf_wins = safe_int(row[20])
        # V: Ab Win% (combined)
        abs_winpct = safe_float(row[21])
        # W: Last Champ year
        last_champ = safe_int(row[22], None) if row[22] is not None else None
        # AF-AG: Current Y/N, Defunct
        current = safe_str(row[31]) == "Y"
        defunct = safe_str(row[32]) == "Y"
        # AH-AJ: Reg Games, Play Games, Total Games
        reg_games = safe_int(row[33])
        play_games = safe_int(row[34])
        total_games = safe_int(row[35])
        # AK: canonical Name
        name = safe_str(row[36])
        if not name:
            continue
        out[name] = {
            "league": league,
            "city_history": city,
            "team_history": team_hist,
            "all_time_w": w,
            "all_time_l": l,
            "all_time_t": t,
            "win_pct": winpct,
            "seasons": seasons,
            "seasons_500_plus": sea500,
            "playoff_appearances": playoff_apps,
            "division_titles": div_titles,
            "champ_appearances": champ_apps,
            "championships": champs,
            "playoff_w": p_w,
            "playoff_l": p_l,
            "playoff_t": p_t,
            "playoff_win_pct": p_winpct,
            "conference_finals_app": cf_app,
            "conference_finals_wins": cf_wins,
            "abs_win_pct": abs_winpct,
            "last_championship": last_champ,
            "is_current": current,
            "is_defunct": defunct,
            "reg_games": reg_games,
            "play_games": play_games,
            "total_games": total_games,
            "canonical": name,
        }
    return out


def read_year_by_year(wb):
    """
    Year by Year sheet: one row per team-season.
    Used for:
      - per-franchise championship years (T = "Y")
      - season-by-season tables
      - founding year (min Year per canonical name)
    Returns dict keyed on canonical name -> list of season dicts.
    """
    ws = wb["Year by Year"]
    rows_by_name = defaultdict(list)
    # Header is row 1. Data from row 2.
    for row in ws.iter_rows(min_row=2, values_only=True):
        row = list(row) + [None] * max(0, 136 - len(row))
        year = safe_int(row[2], None) if row[2] is not None else None
        if year is None:
            continue
        league = safe_str(row[1])
        city = safe_str(row[3])
        team_hist = safe_str(row[4])
        w = safe_int(row[5])
        l = safe_int(row[6])
        t = safe_int(row[7])
        winpct = safe_float(row[8])
        pf = safe_int(row[9])
        pa = safe_int(row[10])
        playoff_y = safe_str(row[11])
        div_title_y = safe_str(row[12])
        # T (col 19) = Champs Y/blank
        champ_y = safe_str(row[19])
        # U (20) division, V (21) place
        division = safe_str(row[20])
        place = safe_str(row[21])
        # Cols around 26 onward have stadium era; AJ-AL = home city/metro/state (35-37)
        home_stadium_era = safe_str(row[26]) if len(row) > 26 else ""
        home_city = safe_str(row[35]) if len(row) > 35 else ""
        metro_area = safe_str(row[36]) if len(row) > 36 else ""
        home_state = safe_str(row[37]) if len(row) > 37 else ""
        # DN (col 117) = canonical name
        canonical = safe_str(row[117]) if len(row) > 117 else ""
        if not canonical:
            continue
        rows_by_name[canonical].append({
            "year": year,
            "league": league,
            "city": city,
            "team_historical": team_hist,
            "w": w, "l": l, "t": t, "win_pct": winpct,
            "pf": pf, "pa": pa,
            "playoff_appearance": playoff_y == "Y",
            "division_title": div_title_y == "Y",
            "championship": champ_y == "Y",
            "division": division,
            "place": place,
            "stadium_era": home_stadium_era,
            "home_city": home_city,
            "metro_area": metro_area,
            "home_state": home_state,
        })
    # Sort each franchise's seasons ascending
    for k in rows_by_name:
        rows_by_name[k].sort(key=lambda r: r["year"])
    return rows_by_name


def read_stadiums(wb):
    """
    Stadiums sheet: A canonical name, B era name, C team (canonical), D city,
    E metro, F state, G first year, H last year.
    Returns dict keyed on canonical team -> list of stadium-era rows.
    Era rows for the same canonical stadium name get grouped under one
    'building' record on output.
    """
    ws = wb["Stadiums"]
    by_team = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        row = list(row) + [None] * max(0, 8 - len(row))
        canonical_stadium = safe_str(row[0])
        era_name = safe_str(row[1])
        team = safe_str(row[2])
        city = safe_str(row[3])
        metro = safe_str(row[4])
        state = safe_str(row[5])
        first_year = safe_int(row[6], None)
        last_year = safe_int(row[7], None)
        if not team:
            # neutral-site / host-only venue, skip per-team rollup
            continue
        if not canonical_stadium:
            continue
        by_team[team].append({
            "canonical_stadium": canonical_stadium,
            "era_name": era_name,
            "city": city,
            "metro": metro,
            "state": state,
            "first_year": first_year,
            "last_year": last_year,
        })
    # For each team, group eras by canonical stadium name (one building = one group)
    grouped = {}
    for team, rows in by_team.items():
        buildings = defaultdict(lambda: {
            "canonical": None, "city": None, "metro": None, "state": None,
            "first_year": None, "last_year": None, "eras": [],
        })
        for r in rows:
            b = buildings[r["canonical_stadium"]]
            b["canonical"] = r["canonical_stadium"]
            b["city"] = b["city"] or r["city"]
            b["metro"] = b["metro"] or r["metro"]
            b["state"] = b["state"] or r["state"]
            fy, ly = r["first_year"], r["last_year"]
            if fy is not None:
                b["first_year"] = fy if b["first_year"] is None else min(b["first_year"], fy)
            if ly is not None:
                b["last_year"] = ly if b["last_year"] is None else max(b["last_year"], ly)
            b["eras"].append({
                "era_name": r["era_name"], "first_year": fy, "last_year": ly,
            })
        out_buildings = []
        for cname, b in buildings.items():
            b["eras"].sort(key=lambda e: (e["first_year"] or 0))
            out_buildings.append(b)
        # Sort buildings by most-recent first
        out_buildings.sort(key=lambda b: -(b["last_year"] or 0))
        grouped[team] = out_buildings
    return grouped


def read_awards(wb):
    """
    Awards sheet: 1920-2025, 14 award types. Keyed on canonical name (col J).
    Returns dict[canonical_name][award_type] -> list of {year, player, position}.
    """
    ws = wb["Awards"]
    by_team = defaultdict(lambda: defaultdict(list))
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        row = list(row) + [None] * max(0, 11 - len(row))
        year = safe_int(row[3], None)
        player = safe_str(row[4])
        award = safe_str(row[7])
        position = safe_str(row[8])
        canonical = safe_str(row[9])
        if not (player and award and canonical and year):
            continue
        by_team[canonical][award].append({
            "year": year, "player": player, "position": position,
        })
    # Sort each award list by year asc
    for team in by_team:
        for award in by_team[team]:
            by_team[team][award].sort(key=lambda r: r["year"])
    return by_team


def read_hall_of_fame(wb):
    """
    Hall of Fame: A player, B year inducted, C category, D position, E birth,
    F death, G age, H-M: 3 team slots (city/team pairs), N: cur. pos, O-Q: current
    franchise names for the 3 slots, R-S: first/last name.
    v1: attribute to primary team (#1 slot, col O = canonical name of slot 1).
    """
    ws = wb["Hall of Fame"]
    by_team = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        row = list(row) + [None] * max(0, 19 - len(row))
        player = safe_str(row[0])
        year_ind = safe_int(row[1], None)
        category = safe_str(row[2])
        position = safe_str(row[3])
        primary_canonical = safe_str(row[14])  # O: #1 Cur Nam
        if not (player and year_ind and primary_canonical):
            continue
        by_team[primary_canonical].append({
            "year": year_ind, "player": player, "category": category, "position": position,
        })
    for team in by_team:
        by_team[team].sort(key=lambda r: r["year"])
    return by_team


def read_pro_bowl_counts(wb):
    """
    Pro Bowl: count selections per canonical franchise (col O Name).
    v1 surfaces counts only; full list is v2.
    """
    ws = wb["Pro Bowl"]
    counts = defaultdict(int)
    for row in ws.iter_rows(min_row=2, values_only=True):
        row = list(row) + [None] * max(0, 18 - len(row))
        canonical = safe_str(row[14])
        if canonical:
            counts[canonical] += 1
    return dict(counts)


# -------- Output builders --------

def build_franchises(lookup, totals, year_by_year):
    """
    Active 32 franchises. Combines Lookup (current city/team/metro/etc) with
    Totals (all-time stats). Slug = slugify(city + "-" + team).
    """
    franchises = []
    for team_name, lk in lookup.items():
        tot = totals.get(team_name)
        if not tot:
            print(f"WARN: no Totals row for active franchise '{team_name}'", file=sys.stderr)
            continue
        seasons = year_by_year.get(team_name, [])
        founding_year = seasons[0]["year"] if seasons else None
        # Detect prior cities by inspecting historical city values
        cities_seen = []
        for s in seasons:
            c = s.get("city")
            if c and c not in cities_seen:
                cities_seen.append(c)
        current_city = lk["city"]
        prior_cities = [c for c in cities_seen if c != current_city]
        # Slug from city + team
        slug = slugify(f"{lk['city']}-{lk['team']}")
        franchises.append({
            "slug": slug,
            "name": f"{lk['city']} {lk['team']}",
            "canonical": team_name,
            "city": lk["city"],
            "team": lk["team"],
            "league": "NFL",
            "conf": lk["conf"],
            "division": lk["division"],
            "stadium": lk["stadium"],
            "stadium_city": lk["stadium_city"],
            "metro": lk["metro"],
            "metro_slug": metro_slug_from_metro_area(lk["metro"]),
            "state": lk["state"],
            "founding_year": founding_year,
            "prior_cities": prior_cities,
            "championships": tot["championships"],
            "division_titles": tot["division_titles"],
            "playoff_appearances": tot["playoff_appearances"],
            "all_time_w": tot["all_time_w"],
            "all_time_l": tot["all_time_l"],
            "all_time_t": tot["all_time_t"],
            "win_pct": round(tot["win_pct"], 4),
            "playoff_w": tot["playoff_w"],
            "playoff_l": tot["playoff_l"],
            "playoff_t": tot["playoff_t"],
            "playoff_win_pct": round(tot["playoff_win_pct"], 4),
            "conf_finals_app": tot["conference_finals_app"],
            "conf_finals_wins": tot["conference_finals_wins"],
            "seasons": tot["seasons"],
            "seasons_500_plus": tot["seasons_500_plus"],
            "last_championship": tot["last_championship"],
            "reg_games": tot["reg_games"],
            "play_games": tot["play_games"],
            "total_games": tot["total_games"],
        })
    # Sort by championships desc, then win pct desc
    franchises.sort(key=lambda f: (-f["championships"], -f["win_pct"]))
    return franchises


def build_championships(year_by_year):
    """
    Per-franchise list of championship years, with era flag.
    Era flag: 'pre_sb' (1920-1965) or 'sb' (1966+).
    """
    out = defaultdict(list)
    for canonical, seasons in year_by_year.items():
        for s in seasons:
            if s["championship"]:
                era = "sb" if s["year"] >= 1966 else "pre_sb"
                entry = {
                    "year": s["year"],
                    "era": era,
                    "league": s["league"],
                    "record": f"{s['w']}-{s['l']}-{s['t']}",
                    "season_city": s["city"],
                    "season_team": s["team_historical"],
                }
                stolen_key = (canonical, s["year"])
                if stolen_key in STOLEN_TITLES:
                    entry["stolen"] = True
                    entry["stolen_note"] = STOLEN_TITLES[stolen_key]
                out[canonical].append(entry)
    # Sort by year asc within each franchise
    return {k: sorted(v, key=lambda r: r["year"]) for k, v in out.items()}


def build_historical(totals):
    """Defunct franchises for /teams/nfl/historical."""
    rows = []
    for canonical, tot in totals.items():
        if tot["is_current"]:
            continue
        rows.append({
            "canonical": canonical,
            "name": canonical,
            "city": tot["city_history"],
            "team_historical": tot["team_history"],
            "league": tot["league"],
            "seasons": tot["seasons"],
            "w": tot["all_time_w"],
            "l": tot["all_time_l"],
            "t": tot["all_time_t"],
            "win_pct": round(tot["win_pct"], 4),
            "championships": tot["championships"],
        })
    rows.sort(key=lambda r: (-r["championships"], r["city"] or ""))
    return rows


def build_historical_championships(year_by_year, totals):
    """Championship years for defunct franchises with stolen-title flagging."""
    out = defaultdict(list)
    for canonical, seasons in year_by_year.items():
        tot = totals.get(canonical)
        if not tot or tot["is_current"]:
            continue
        for s in seasons:
            if s["championship"]:
                entry = {
                    "year": s["year"], "era": "pre_sb",
                    "league": s["league"],
                    "season_city": s["city"], "season_team": s["team_historical"],
                }
                stolen_key = (canonical, s["year"])
                if stolen_key in STOLEN_TITLES:
                    entry["stolen"] = True
                    entry["stolen_note"] = STOLEN_TITLES[stolen_key]
                out[canonical].append(entry)
        # Even if no championship rows captured via Year by Year, allow stolen flag injection
        for (sname, syear), note in STOLEN_TITLES.items():
            if sname == canonical and not any(e["year"] == syear for e in out[canonical]):
                out[canonical].append({
                    "year": syear, "era": "pre_sb", "stolen": True, "stolen_note": note,
                })
    return {k: sorted(v, key=lambda r: r["year"]) for k, v in out.items()}


# -------- Main --------

def main():
    src = find_source_xlsx(sys.argv)
    print(f"Reading: {src}")
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    print(f"Sheets: {wb.sheetnames}")

    print("Reading Lookup block 3 (current 32)...")
    lookup = read_lookup_block3(wb)
    print(f"  {len(lookup)} active teams")

    print("Reading Totals...")
    totals = read_totals(wb)
    print(f"  {len(totals)} franchise rows (active + defunct)")

    print("Reading Year by Year...")
    yby = read_year_by_year(wb)
    print(f"  {len(yby)} canonical names, {sum(len(v) for v in yby.values())} team-seasons")

    print("Reading Stadiums...")
    stadiums = read_stadiums(wb)
    print(f"  {len(stadiums)} teams with stadium history")

    print("Reading Awards...")
    awards = read_awards(wb)
    print(f"  {len(awards)} teams with awards")

    print("Reading Hall of Fame...")
    hof = read_hall_of_fame(wb)
    print(f"  {len(hof)} teams with HoF inductees")

    print("Reading Pro Bowl counts...")
    pb_counts = read_pro_bowl_counts(wb)
    print(f"  {sum(pb_counts.values())} total selections across {len(pb_counts)} teams")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    franchises = build_franchises(lookup, totals, yby)
    print(f"Built franchises: {len(franchises)}")
    (OUT_DIR / "franchises.json").write_text(json.dumps(franchises, indent=2, ensure_ascii=False))

    champs = build_championships(yby)
    (OUT_DIR / "championships.json").write_text(json.dumps(champs, indent=2, ensure_ascii=False))

    (OUT_DIR / "stadium-history.json").write_text(json.dumps(stadiums, indent=2, ensure_ascii=False))

    # Awards by team: convert defaultdict to plain dict for json
    awards_plain = {team: dict(awards_by_type) for team, awards_by_type in awards.items()}
    (OUT_DIR / "award-winners.json").write_text(json.dumps(awards_plain, indent=2, ensure_ascii=False))

    historical = build_historical(totals)
    print(f"Built historical: {len(historical)}")
    (OUT_DIR / "historical.json").write_text(json.dumps(historical, indent=2, ensure_ascii=False))

    hist_champs = build_historical_championships(yby, totals)
    (OUT_DIR / "historical-championships.json").write_text(json.dumps(hist_champs, indent=2, ensure_ascii=False))

    (OUT_DIR / "hall-of-fame.json").write_text(json.dumps(dict(hof), indent=2, ensure_ascii=False))

    # Per-franchise season-by-season rows (active 32 only for v1)
    active_canonicals = {f["canonical"]: f["slug"] for f in franchises}
    seasons_out = {}
    for canonical, slug in active_canonicals.items():
        rows = yby.get(canonical, [])
        seasons_out[slug] = [
            {
                "year": r["year"], "league": r["league"], "city": r["city"],
                "team": r["team_historical"],
                "w": r["w"], "l": r["l"], "t": r["t"], "win_pct": round(r["win_pct"], 4),
                "pf": r["pf"], "pa": r["pa"],
                "division": r["division"], "place": r["place"],
                "playoff": r["playoff_appearance"],
                "div_title": r["division_title"],
                "champ": r["championship"],
            }
            for r in rows
        ]
    (OUT_DIR / "seasons-by-team.json").write_text(json.dumps(seasons_out, indent=2, ensure_ascii=False))

    (OUT_DIR / "pro-bowl-counts.json").write_text(json.dumps(pb_counts, indent=2, ensure_ascii=False))

    # Light summary for the build log
    print("\nWrote:")
    for f in sorted(OUT_DIR.glob("*.json")):
        print(f"  {f.relative_to(REPO_ROOT)}  ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
eam.json").write_text(json.dumps(seasons_out, indent=2, ensure_ascii=False))

    (OUT_DIR / "pro-bowl-counts.json").write_text(json.dumps(pb_counts, indent=2, ensure_ascii=False))

    # Light summary for the build log
    print("\nWrote:")
    for f in sorted(OUT_DIR.glob("*.json")):
        print(f"  {f.relative_to(REPO_ROOT)}  ({f.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
