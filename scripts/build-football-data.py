#!/usr/bin/env python3
"""
Build Football team-pages data from the grand Football workbook
(Champions League-201516.xlsx — the legacy filename hides a global database;
see the workbook's Claude Notes sheet for full schema).

V0 scope:
  - Big 5 Level 1 top flights (England, Spain, Italy, Germany, France)
  - English Levels 2-5 additionally (Championship, League One, League Two,
    National League and their historical predecessors)
  - One canonical page per distinct Cur. Name across the in-scope tiers
  - Season-by-season standings (P/W/D/L/Pts/GF/GA/GD/Place) + cup finals
    + European appearances + summary totals

Row-level format flag per season:
  - format = "league"   → normal round-robin standings; render all cells
  - format = "playoff"  → workbook only carries participant + finish; render
                          a pill with the finish position. Germany pre-1963
                          Deutsche Fußballmeisterschaft is purely this shape;
                          Italy pre-1929 and France pre-1929 are mixed.

Outputs (all under public/data/football/):
  index.json     - all canonical clubs with metadata + top-line totals
  seasons.json   - { slug: [season rows...] }
  cups.json      - { slug: [cup-final rows...] }
  europe.json    - { slug: [european-competition entries...] }
  leagues.json   - Big 5 league hub data (current standings + all-time champions)

Usage:
  python3 scripts/build-football-data.py
  python3 scripts/build-football-data.py /path/to/Champions\\ League-201516.xlsx
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict, Counter

try:
    import openpyxl
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl",
                           "--quiet", "--break-system-packages"])
    import openpyxl


# ---------- Source resolution ----------

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_SOURCE_CANDIDATES = [
    Path(os.path.expanduser("~/OneDrive/Excel Files/Champions League-201516.xlsx")),
    Path("/mnt/c/Users/ashwi/OneDrive/Excel Files/Champions League-201516.xlsx"),
]
# Add every current uploads mount dynamically (session token changes per run).
for sess in Path("/sessions").glob("*/mnt/uploads/Champions League-201516.xlsx"):
    DEFAULT_SOURCE_CANDIDATES.append(sess)
for sess in Path("/sessions").glob("*/mnt/Excel Files/Champions League-201516.xlsx"):
    DEFAULT_SOURCE_CANDIDATES.append(sess)

OUT_DIR = REPO_ROOT / "public" / "data" / "football"

BIG5 = {"England", "Spain", "Italy", "Germany", "France"}

# Mapping from country -> set of in-scope tier levels.
COUNTRY_TIERS = {
    "England": {1, 2, 3, 4, 5},
    "Spain":   {1},
    "Italy":   {1},
    "Germany": {1},
    "France":  {1},
}

# League hub slugs for the five modern top-flight competitions.
LEAGUE_HUBS = [
    ("premier-league", "England", "Premier League", "Premier League", 1),
    ("la-liga",        "Spain",   "La Liga",        "La Liga",        1),
    ("serie-a",        "Italy",   "Serie A",        "Serie A",        1),
    ("bundesliga",     "Germany", "Bundesliga",     "Bundesliga",     1),
    ("ligue-1",        "France",  "Ligue 1",        "Ligue 1",        1),
]

# Standings sheets share an identical 86-column schema.
STANDINGS_SHEETS = ["Leagues History", "Stand2nd"]


# ---------- Helpers ----------

def slugify(s):
    if s is None: return None
    s = str(s).strip().lower()
    repl = {"á":"a","à":"a","â":"a","ä":"a","ã":"a","å":"a",
            "é":"e","è":"e","ê":"e","ë":"e",
            "í":"i","ì":"i","î":"i","ï":"i",
            "ó":"o","ò":"o","ô":"o","ö":"o","õ":"o","ø":"o",
            "ú":"u","ù":"u","û":"u","ü":"u",
            "ñ":"n","ç":"c","ß":"ss",
            "ý":"y","ÿ":"y","ž":"z","š":"s","č":"c","ć":"c","ř":"r"}
    for k, v in repl.items():
        s = s.replace(k, v)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or None


def header_map(ws):
    row1 = list(next(ws.iter_rows(min_row=1, max_row=1, values_only=True)))
    out = {}
    for i, h in enumerate(row1):
        if h is None: continue
        h = str(h).strip()
        # First wins for duplicate headers (sheets sometimes echo cols).
        if h not in out:
            out[h] = i
    return out, row1


def find_source():
    if len(sys.argv) >= 2:
        p = Path(sys.argv[1])
        if not p.exists(): sys.exit(f"FAIL: source not found: {p}")
        return p
    for c in DEFAULT_SOURCE_CANDIDATES:
        if c.exists(): return c
    sys.exit("FAIL: no source workbook found. Pass a path or place it under "
             "OneDrive/Excel Files/Champions League-201516.xlsx")


def to_int(v):
    if v is None: return None
    if isinstance(v, bool): return int(v)
    if isinstance(v, (int, float)):
        try: return int(v)
        except: return None
    try: return int(str(v).strip())
    except: return None


def to_float(v):
    if v is None: return None
    if isinstance(v, (int, float)): return float(v)
    try: return float(str(v).strip())
    except: return None


def detect_format(w, d, l, matches):
    """Row-level format detection. Pre-Bundesliga German rows have all of these
    blank → 'playoff'. Italian Football Championship rows often have small
    match counts but populated W → 'league' if matches looks round-robin,
    else 'playoff'. Rule: format=league iff matches is populated AND w is
    populated. Otherwise playoff."""
    if matches is None or matches == 0: return "playoff"
    if w is None: return "playoff"
    return "league"


# ---------- ETL: clubs from Lookup ----------

def build_clubs_index(wb, in_scope_curnames):
    """Build the master club index from Lookup, restricted to in_scope_curnames.
    Collapses intra-country dupe rows (e.g. Hornchurch, Watford Rovers) by
    preferring the row with metro/lat/long populated."""
    ws = wb["Lookup"]
    hdr, _ = header_map(ws)
    # Per Claude Notes verified col indices: Cur. Name = M (12), Team = A (0),
    # City = B (1), Metro = C (2), County = D (3), Country = E (4),
    # Continent = K (10), Lat = U (20), Long = V (21), Club = P (15)
    idx_curname = hdr.get("Cur. Name", 12)
    idx_city = hdr.get("City", 1)
    idx_metro = hdr.get("Metro Area", 2)
    idx_county = hdr.get("County", 3)
    idx_country = hdr.get("Country", 4)
    idx_continent = hdr.get("Continent", 10)
    idx_club = hdr.get("Club", 15)
    idx_lat = 20
    idx_lng = 21

    # Lookup col M (Cur. Name) is a formula echo (=A typically) and the
    # workbook is often saved without cached values for these cells, so
    # read_only+data_only returns None. Fall back to col A (Team) which
    # the user maintains as the canonical current name for the primary
    # registry row of each club.
    candidates = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row: continue
        cn = row[idx_curname] if idx_curname < len(row) else None
        if not cn:
            cn = row[0] if len(row) > 0 else None  # col A: Team
        if not cn: continue
        cn = str(cn).strip()
        if cn not in in_scope_curnames: continue
        # Only Clubs (not National teams).
        club_flag = row[idx_club] if idx_club < len(row) else None
        if club_flag and str(club_flag).strip().lower() == "nat": continue
        candidates[cn].append(row)

    clubs = {}
    for cn, rows in candidates.items():
        # Pick the row with the most populated metro/lat fields.
        def score(r):
            s = 0
            for i in (idx_metro, idx_county, idx_lat, idx_lng, idx_city):
                if i < len(r) and r[i] not in (None, "", 0): s += 1
            return s
        rows.sort(key=score, reverse=True)
        r = rows[0]

        def cell(i):
            return r[i] if i < len(r) and r[i] not in ("",) else None

        clubs[cn] = {
            "slug": slugify(cn),
            "cur_name": cn,
            "country": cell(idx_country),
            "city": cell(idx_city),
            "metro": cell(idx_metro),
            "county": cell(idx_county),
            "continent": cell(idx_continent),
            "lat": to_float(cell(idx_lat)),
            "lng": to_float(cell(idx_lng)),
        }
    return clubs


# ---------- ETL: standings rows ----------

def collect_standings_rows(wb):
    """Pull every in-scope standings row (Big 5 Level 1 + England 2-5) from
    Leagues History + Stand2nd. Returns (rows, in_scope_curnames)."""
    rows_out = []
    curnames = set()
    for sheet in STANDINGS_SHEETS:
        ws = wb[sheet]
        hdr, row1 = header_map(ws)
        # Cur. Name lives at col BV (idx 73) per Claude Notes; the in-sheet
        # header_map also catches it, but pin to 73 in case of header drift.
        idx_curname = 73
        idx_country = hdr.get("Country (Leag)")
        idx_league = hdr.get("League")
        idx_year = hdr.get("End Year")
        idx_team = hdr.get("Team")
        idx_place = hdr.get("Place #")
        idx_w = hdr.get("W")
        idx_d = hdr.get("D")
        idx_l = hdr.get("L")
        idx_pts = hdr.get("Points")
        idx_gf = hdr.get("GS")
        idx_ga = hdr.get("GA")
        idx_gdiff = hdr.get("G Diff")
        idx_matches = hdr.get("Matches")
        idx_level = None
        for i, h in enumerate(row1):
            if h == "Level":
                idx_level = i; break
        idx_eur_qual = hdr.get("Eur Qual")
        idx_relegated = hdr.get("Relegated")
        idx_div = hdr.get("Division")

        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row: continue
            if idx_country is None or idx_country >= len(row): continue
            country = row[idx_country]
            if country not in BIG5: continue
            cn = row[idx_curname] if idx_curname < len(row) else None
            if not cn: continue
            cn = str(cn).strip()
            level = to_int(row[idx_level]) if idx_level is not None and idx_level < len(row) else None
            allowed = COUNTRY_TIERS.get(country, set())
            if level not in allowed: continue

            year = to_int(row[idx_year]) if idx_year < len(row) else None
            league = row[idx_league] if idx_league < len(row) else None
            team = row[idx_team] if idx_team < len(row) else None
            w = to_int(row[idx_w]) if idx_w < len(row) else None
            d = to_int(row[idx_d]) if idx_d < len(row) else None
            l = to_int(row[idx_l]) if idx_l < len(row) else None
            pts = to_int(row[idx_pts]) if idx_pts < len(row) else None
            gf = to_int(row[idx_gf]) if idx_gf < len(row) else None
            ga = to_int(row[idx_ga]) if idx_ga < len(row) else None
            gdiff = to_int(row[idx_gdiff]) if idx_gdiff < len(row) else None
            matches = to_int(row[idx_matches]) if idx_matches < len(row) else None
            place = to_int(row[idx_place]) if idx_place < len(row) else None
            division = row[idx_div] if idx_div is not None and idx_div < len(row) else None

            fmt = detect_format(w, d, l, matches)
            rows_out.append({
                "slug": slugify(cn),
                "cur_name": cn,
                "year": year,
                "country": country,
                "league": str(league) if league else None,
                "division": str(division) if division else None,
                "level": level,
                "team": str(team) if team else cn,
                "place": place,
                "w": w, "d": d, "l": l,
                "pts": pts, "gf": gf, "ga": ga, "gd": gdiff,
                "matches": matches,
                "format": fmt,
                "eur_qual": True if (idx_eur_qual is not None and idx_eur_qual < len(row) and row[idx_eur_qual] == "Y") else False,
                "relegated": True if (idx_relegated is not None and idx_relegated < len(row) and row[idx_relegated] == "Y") else False,
            })
            curnames.add(cn)
    return rows_out, curnames


# ---------- ETL: cup finals ----------

def collect_cup_finals(wb, in_scope_curnames):
    """Pull domestic cup finals for in-scope clubs from Cup History."""
    ws = wb["Cup History"]
    hdr, _ = header_map(ws)
    # Per Claude Notes: B=Key, C=League (country), D=End Year, E=Cur. Name,
    # F=Cup Major (Y win, blank lost, date if scheduled), G=Cup Final Major,
    # H=Cup Minor (Y win, blank lost), I=Cup Final Minor,
    # J=Super Cup (Y win), K=Super Cup Final, L=Continent
    idx_country = hdr.get("League", 2)
    idx_year = hdr.get("End Year", 3)
    idx_cn = hdr.get("Cur. Name", 4)
    idx_maj = hdr.get("Cup (Major Domestic)", 5)
    idx_maj_f = hdr.get("Cup Final (Major Domestic)", 6)
    idx_min = hdr.get("Cup (Minor Domestic)", 7)
    idx_min_f = hdr.get("Cup Final (Minor Domestic)", 8)
    idx_sup = hdr.get("Super Cup", 9)
    idx_sup_f = hdr.get("Super Cup Final", 10)

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row: continue
        country = row[idx_country] if idx_country < len(row) else None
        if country not in BIG5: continue
        cn = row[idx_cn] if idx_cn < len(row) else None
        if not cn or str(cn).strip() not in in_scope_curnames: continue
        cn = str(cn).strip()
        year = to_int(row[idx_year]) if idx_year < len(row) else None

        def status(win_cell, final_cell):
            """Return (kind, result) per Claude Notes col F convention.
            Y = won, blank = lost, date serial = scheduled (not yet played)."""
            if final_cell != "Y": return None
            if win_cell == "Y": return "won"
            if win_cell in (None, "", 0): return "lost"
            # Date serial → scheduled.
            if isinstance(win_cell, (int, float)) and win_cell > 1000:
                return "scheduled"
            return "lost"

        for kind, win_idx, final_idx in (
            ("major", idx_maj, idx_maj_f),
            ("minor", idx_min, idx_min_f),
            ("super", idx_sup, idx_sup_f),
        ):
            if win_idx is None or final_idx is None: continue
            if win_idx >= len(row) or final_idx >= len(row): continue
            res = status(row[win_idx], row[final_idx])
            if not res: continue
            rows.append({
                "slug": slugify(cn),
                "cur_name": cn,
                "year": year,
                "country": country,
                "kind": kind,
                "result": res,
            })
    return rows


# ---------- ETL: European appearances ----------

def collect_european(wb, in_scope_curnames):
    """For each in-scope club, summarize European-competition appearances
    from Eur Summary (one row per team-per-season-per-competition)."""
    ws = wb["Eur Summary"]
    hdr, _ = header_map(ws)
    idx_season = hdr.get("Season", 2)
    idx_comp_name = hdr.get("Leag/Comp.", 3)
    idx_team_seas = hdr.get("Seas", 5)
    idx_cn = hdr.get("Cur. Name", 6)
    idx_comp_code = hdr.get("Comp", 11)

    by_club = defaultdict(list)
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or idx_cn >= len(row): continue
        cn = row[idx_cn]
        if not cn or str(cn).strip() not in in_scope_curnames: continue
        cn = str(cn).strip()
        year = to_int(row[idx_team_seas]) if idx_team_seas < len(row) else None
        season = row[idx_season] if idx_season < len(row) else None
        comp = row[idx_comp_name] if idx_comp_name < len(row) else None
        code = row[idx_comp_code] if idx_comp_code < len(row) else None
        by_club[slugify(cn)].append({
            "year": year,
            "season": str(season) if season else None,
            "competition": str(comp) if comp else None,
            "code": str(code) if code else None,
        })

    # Sort each club's entries by year ascending then competition.
    for slug in by_club:
        by_club[slug].sort(key=lambda r: (r["year"] or 0, r["competition"] or ""))
    return dict(by_club)


# ---------- ETL: Totals roll-up (compact) ----------

def collect_totals(wb, in_scope_curnames):
    """Pull the top-line totals from Totals for header summaries.
    Compact: titles, finals, top-4 finishes, major cups, minor cups, european
    titles, european finals, european app, top-flight years."""
    ws = wb["Totals"]
    hdr, row1 = header_map(ws)
    # Cur. Name in col A (0); other indices via header lookup.
    idx_cn = hdr.get("Cur. Name", 0)
    idx_country = hdr.get("Country (Leag)", 1)

    # Best-effort header lookups; tolerate slight name drift.
    def col(*names):
        for n in names:
            if n in hdr: return hdr[n]
        return None

    out = {}
    keys = {
        "titles":         col("# Title (1 Div)"),
        "last_title":     col("Last Tit. (1 Div)"),
        "league_finals":  col("# Top 2"),
        "league_t4":      col("# Top 4"),
        "major_cups":     col("# Maj Trophies"),
        "minor_cups":     col("# Trophies (Maj. & Min)"),
        "last_trophy":    col("Last Trophy"),
        "career_years":   col("# Years", "#Years"),
    }
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or idx_cn >= len(row): continue
        cn = row[idx_cn]
        if not cn or str(cn).strip() not in in_scope_curnames: continue
        cn = str(cn).strip()
        rec = {}
        for k, i in keys.items():
            if i is None or i >= len(row): continue
            v = row[i]
            if k.startswith("last_"):
                rec[k] = to_int(v)
            else:
                iv = to_int(v)
                rec[k] = iv if iv is not None else 0
        out[cn] = rec
    return out


# ---------- ETL: league hub data ----------

def build_league_hubs(wb, standings_rows):
    """Build the five Big 5 league hub aggregates.
    Each hub gets: current season standings (latest year for that league name),
    all-time champions list (every year, every Level-1 league name in that country)."""
    hubs = {}
    # Index standings rows by (country, league_name, year).
    by_country_level1 = defaultdict(list)
    for r in standings_rows:
        if r["level"] != 1: continue
        by_country_level1[r["country"]].append(r)

    for slug, country, league_name, display, level in LEAGUE_HUBS:
        rows = by_country_level1.get(country, [])
        # Current standings: most recent year for this exact modern league name
        # with populated data. Skip forward-keyed placeholder rows where the
        # workbook has carried the team list but no results yet (typical of
        # the upcoming season before round 1 is played).
        modern = [r for r in rows if r["league"] == league_name]
        completed_years = sorted({r["year"] for r in modern
                                  if r["year"] and r["pts"] is not None}, reverse=True)
        latest_year = completed_years[0] if completed_years else None
        current = [r for r in modern if r["year"] == latest_year]
        current.sort(key=lambda r: (r["place"] if r["place"] is not None else 99))

        # All-time champions: place == 1 OR (champion-flag via place==1 within
        # the country's Level-1 set across ALL league names). The standings
        # row's Place # is the source of truth; the workbook uses 1 for the
        # year's champion across every era including knockouts.
        champs = [r for r in rows if r["place"] == 1]
        champs.sort(key=lambda r: r["year"] or 0)

        hubs[slug] = {
            "slug": slug,
            "country": country,
            "league": display,
            "current_year": latest_year,
            "current_standings": current,
            "all_time_champions": [
                {
                    "year": r["year"],
                    "champion": r["cur_name"],
                    "champion_team": r["team"],
                    "champion_slug": r["slug"],
                    "league_name": r["league"],
                    "format": r["format"],
                }
                for r in champs
            ],
        }
    return hubs


# ---------- Main ----------

def main():
    src = find_source()
    print(f"Source: {src}")
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Collecting in-scope standings rows...")
    standings_rows, in_scope_curnames = collect_standings_rows(wb)
    print(f"  {len(standings_rows)} rows, {len(in_scope_curnames)} distinct canonical clubs")

    print("Building club index from Lookup...")
    clubs = build_clubs_index(wb, in_scope_curnames)
    missing = in_scope_curnames - set(clubs.keys())
    if missing:
        print(f"  WARN: {len(missing)} in-scope clubs have NO Lookup entry; synthesizing minimal records")
        for cn in missing:
            # Infer country from the first standings row for this club.
            country = next((r["country"] for r in standings_rows if r["cur_name"] == cn), None)
            clubs[cn] = {
                "slug": slugify(cn),
                "cur_name": cn,
                "country": country,
                "city": None, "metro": None, "county": None,
                "continent": "Europe",
                "lat": None, "lng": None,
            }
    print(f"  index has {len(clubs)} clubs")

    # Slug collision check + merge. Two Cur. Names that slugify identically
    # are treated as the same canonical club (e.g. 'SPAL' vs 'Spal'). The
    # winning Cur. Name is the one with more standings rows. The losing
    # Cur. Name's standings/cup/europe rows are rewritten to point at the
    # winner's slug downstream.
    slug_groups = defaultdict(list)
    for cn, club in clubs.items():
        slug_groups[club["slug"]].append(cn)
    canonical_for_slug = {}
    aliased_cn = {}
    for slug, cns in slug_groups.items():
        if len(cns) == 1:
            canonical_for_slug[slug] = cns[0]; continue
        # Pick the spelling with the most standings rows; tie-break alpha.
        row_count = Counter(r["cur_name"] for r in standings_rows if r["slug"] == slug)
        cns_sorted = sorted(cns, key=lambda x: (-row_count.get(x, 0), x))
        winner = cns_sorted[0]
        canonical_for_slug[slug] = winner
        for loser in cns_sorted[1:]:
            aliased_cn[loser] = winner
            print(f"  merging slug-colliding Cur. Names: {loser!r} -> {winner!r} (slug={slug!r})")
    # Drop loser clubs from the index; rewrite standings/cups to winner.
    for loser, winner in aliased_cn.items():
        clubs.pop(loser, None)
    for r in standings_rows:
        if r["cur_name"] in aliased_cn:
            r["cur_name"] = aliased_cn[r["cur_name"]]
            r["slug"] = slugify(r["cur_name"])

    print("Collecting cup finals...")
    cups_rows = collect_cup_finals(wb, in_scope_curnames)
    # Rewrite slug-merged Cur. Names. (aliased_cn isn't defined yet here on
    # first call; defer the rewrite to after the slug-merge block runs below.)
    print(f"  {len(cups_rows)} cup-final rows")

    print("Collecting European appearances...")
    europe = collect_european(wb, in_scope_curnames)
    print(f"  {sum(len(v) for v in europe.values())} euro entries across {len(europe)} clubs")

    print("Collecting Totals roll-up...")
    totals = collect_totals(wb, in_scope_curnames)
    print(f"  {len(totals)} totals rows matched")

    # Merge totals + tier coverage into clubs index.
    for cn, club in clubs.items():
        club_rows = [r for r in standings_rows if r["cur_name"] == cn]
        tiers = sorted({r["level"] for r in club_rows if r["level"] is not None})
        years = [r["year"] for r in club_rows if r["year"]]
        playoff_only_years = {r["year"] for r in club_rows if r["format"] == "playoff"}
        league_format_years = {r["year"] for r in club_rows if r["format"] == "league"}
        club["tiers"] = tiers
        club["first_year"] = min(years) if years else None
        club["last_year"] = max(years) if years else None
        club["league_seasons"] = len(league_format_years)
        club["playoff_appearances"] = len(playoff_only_years)
        club["totals"] = totals.get(cn, {})

    # Group seasons + cups by slug.
    seasons_by_slug = defaultdict(list)
    for r in standings_rows:
        seasons_by_slug[r["slug"]].append(r)
    for slug in seasons_by_slug:
        seasons_by_slug[slug].sort(key=lambda r: (r["year"] or 0, r["level"] or 99))

    cups_by_slug = defaultdict(list)
    for r in cups_rows:
        cups_by_slug[r["slug"]].append(r)
    for slug in cups_by_slug:
        cups_by_slug[slug].sort(key=lambda r: (r["year"] or 0, r["kind"]))

    print("Building league hubs...")
    league_hubs = build_league_hubs(wb, standings_rows)

    # ---------- Write outputs ----------
    index_path = OUT_DIR / "index.json"
    seasons_path = OUT_DIR / "seasons.json"
    cups_path = OUT_DIR / "cups.json"
    europe_path = OUT_DIR / "europe.json"
    leagues_path = OUT_DIR / "leagues.json"

    payload_index = {
        "generated_at": __import__("datetime").date.today().isoformat(),
        "source": str(src.name),
        "scope": {"big5": sorted(BIG5), "country_tiers": {k: sorted(v) for k, v in COUNTRY_TIERS.items()}},
        "clubs": [c for c in sorted(clubs.values(), key=lambda x: (x["country"] or "", x["cur_name"]))],
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(payload_index, f, ensure_ascii=False, indent=2)
    print(f"Wrote {index_path}  ({index_path.stat().st_size:,} bytes)")

    with open(seasons_path, "w", encoding="utf-8") as f:
        json.dump(dict(seasons_by_slug), f, ensure_ascii=False)
    print(f"Wrote {seasons_path}  ({seasons_path.stat().st_size:,} bytes)")

    with open(cups_path, "w", encoding="utf-8") as f:
        json.dump(dict(cups_by_slug), f, ensure_ascii=False)
    print(f"Wrote {cups_path}  ({cups_path.stat().st_size:,} bytes)")

    with open(europe_path, "w", encoding="utf-8") as f:
        json.dump(europe, f, ensure_ascii=False)
    print(f"Wrote {europe_path}  ({europe_path.stat().st_size:,} bytes)")

    with open(leagues_path, "w", encoding="utf-8") as f:
        json.dump(league_hubs, f, ensure_ascii=False)
    print(f"Wrote {leagues_path}  ({leagues_path.stat().st_size:,} bytes)")

    # Normalized-name -> slug lookup for cross-data-source joins. Mirrors
    # build-sports-index.py's normalize_team_name (lowercase, alnum-only,
    # collapsed whitespace) so the join works against the team name as it
    # appears in MetroAreas.xlsx FootballClub_Data and Team List.
    def _norm(s: str) -> str:
        s = s.lower()
        s = re.sub(r"[^a-z0-9]+", " ", s)
        return s.strip()
    slug_lookup = {}
    for club in clubs.values():
        key = _norm(club["cur_name"])
        if key and key not in slug_lookup:
            slug_lookup[key] = club["slug"]
    slug_lookup_path = OUT_DIR / "slug-lookup.json"
    with open(slug_lookup_path, "w", encoding="utf-8") as f:
        json.dump(slug_lookup, f, ensure_ascii=False)
    print(f"Wrote {slug_lookup_path}  ({slug_lookup_path.stat().st_size:,} bytes, {len(slug_lookup)} entries)")

    print("\nDone.")


if __name__ == "__main__":
    main()
