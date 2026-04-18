#!/usr/bin/env python3
"""
Extract data from MetroAreas.xlsx and generate JSON files for the website.

Usage:
  python scripts/extract.py [path/to/MetroAreas.xlsx]

If no path is given, looks for MetroAreas.xlsx in the parent directory.

Outputs:
  public/data/metros.json - Main rankings (all 4,285 metros)
  public/data/regions.json - Regional aggregates
  public/data/details/<slug>.json - Per-metro detail files
"""

import json
import math
import os
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Installing openpyxl...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "--quiet", "--break-system-packages"])
    import openpyxl


def slugify(name):
    """Convert metro name to URL-safe slug."""
    s = name.lower().strip()
    s = re.sub(r'[àáâãäå]', 'a', s)
    s = re.sub(r'[èéêë]', 'e', s)
    s = re.sub(r'[ìíîï]', 'i', s)
    s = re.sub(r'[òóôõö]', 'o', s)
    s = re.sub(r'[ùúûü]', 'u', s)
    s = re.sub(r'[ñ]', 'n', s)
    s = re.sub(r'[ç]', 'c', s)
    s = re.sub(r'[ß]', 'ss', s)
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s]+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')


def safe_int(val, default=0):
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_str(val):
    if val is None:
        return ''
    return str(val).strip()


def extract_metros(wb):
    """Extract main metro data from the Metro Areas sheet."""
    ws = wb["Metro Areas"]
    metros = []

    for row in ws.iter_rows(min_row=4, values_only=True):
        v = list(row)
        name = safe_str(v[5])
        score = safe_float(v[58])
        if not name:
            continue

        pop = safe_int(v[9])
        lat = safe_float(v[63])
        lon = safe_float(v[64])
        region = safe_str(v[65]) or safe_str(v[41])
        slug = slugify(name)

        metro = {
            'slug': slug,
            'name': name,
            'country': safe_str(v[0]),
            'subCountry': safe_str(v[1]),
            'language': safe_str(v[2]),
            'capital': safe_str(v[3]),
            'gawcClass': safe_str(v[4]),
            'primaryState': safe_str(v[6]),
            'state2': safe_str(v[7]),
            'state3': safe_str(v[8]),
            'pop': pop,
            'region': region,
            'continent': safe_str(v[41]),
            'score': round(score, 1),
            'lat': lat,
            'lon': lon,
            'primaryCity': safe_str(v[61]),
            'primaryCityCountry': safe_str(v[62]),
            'gdp': round(safe_float(v[69]), 1),
            'gdpPerCapita': round(safe_float(v[70])),
            # Raw dimension data
            'dims': {
                'majorLeagueTeams': safe_int(v[43]),
                'totalTeams': safe_int(v[42]),
                'majorSportingEvents': safe_int(v[44]),
                'companies': safe_int(v[45]),
                'marketCap': safe_float(v[46]),
                'culturalEvents': safe_int(v[47]),
                'universities': safe_int(v[48]),
                'topUniHospResearch': safe_int(v[49]),
                'museumsLandmarks': safe_int(v[50]),
                'portsExchangesInfra': safe_int(v[51]),
                'airportScore': safe_float(v[52]),
                'luxuryStars': safe_float(v[53]),
                'metroStations': safe_int(v[54]),
                'suburbStations': safe_int(v[55]),
                'trainHubs': safe_int(v[56]),
                'skyscrapers': safe_int(v[57]),
            },
            'naRank': safe_int(v[59]) if v[59] else None,
            'pctOfCountry': round(safe_float(v[67]) * 100, 1) if v[67] else 0,
        }
        metros.append(metro)

    # Sort by score descending and assign global rank
    metros.sort(key=lambda x: x['score'], reverse=True)
    for i, m in enumerate(metros):
        m['rank'] = i + 1

    return metros


def _normalize_league(raw):
    """Map internal league labels to the names shown on the site."""
    s = safe_str(raw)
    if s == "Major Venues":
        return "Notable Venues"
    return s


# Manual venue name aliases so the same physical venue dedupes across sports.
# Extend here rather than letting the frontend guess. The first tuple entry is
# a normalized form matched as a substring; the value is the canonical name.
_VENUE_NAME_ALIASES = {
    "New Wembley Stadium": "Wembley Stadium",
    "The O2 Arena": "O2 Arena",
}


def _normalize_venue_name(league, name):
    """Canonicalize venue names so a venue appearing under multiple sports
    (e.g. combat sports + tennis at the O2) dedupes cleanly on the frontend."""
    if league != "Notable Venues":
        return name
    return _VENUE_NAME_ALIASES.get(name, name)


def extract_teams(wb):
    """Extract teams grouped by metro."""
    ws = wb["Team List"]
    teams = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[6])
        if not metro:
            continue
        league = _normalize_league(v[1])
        teams.setdefault(metro, []).append({
            'sport': safe_str(v[0]),
            'league': league,
            'team': _normalize_venue_name(league, safe_str(v[2])),
            'city': safe_str(v[5]),
            'country': safe_str(v[8]),
            'level': safe_str(v[9]),
            'major': safe_str(v[11]) == 'Y',
        })

    # Note: RegTeams is intentionally NOT read. Team List is the single
    # source of truth for teams. RegTeams holds stale/regional legacy rows
    # (e.g. London Irish 2023) that must not reach the site.

    return teams


def extract_universities(wb):
    """Extract universities grouped by metro."""
    ws = wb["Universities"]
    unis = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[5])
        if not metro:
            continue
        unis.setdefault(metro, []).append({
            'rank': safe_int(v[2]),
            'name': safe_str(v[3]),
            'city': safe_str(v[4]),
            'country': safe_str(v[0]),
        })
    # Sort each metro's universities by rank
    for metro in unis:
        unis[metro].sort(key=lambda x: x['rank'] if x['rank'] else 9999)
    return unis


def extract_culture(wb):
    """Extract cultural assets and infrastructure grouped by metro."""
    ws = wb["Culture-Infra"]
    culture = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[6])
        if not metro:
            continue
        entry = {
            'name': safe_str(v[4]),
            'city': safe_str(v[5]),
            'subtype': safe_str(v[8]),
            'type': safe_str(v[11]),
            'majorType': safe_str(v[10]),
        }
        # Column O (index 14) = "Annual Event" flag, marked "Y" for recurring events
        annual_flag = safe_str(v[14]) if len(v) > 14 else ''
        if annual_flag.upper() == 'Y':
            entry['annual'] = True
        # Column P (index 15) = "# Stations", used on Metro System / Suburban Rail
        # so each line shows its own station count instead of just the aggregate.
        if entry['type'] in ('Metro System', 'Suburban Rail'):
            stations = safe_int(v[15]) if len(v) > 15 else 0
            if stations:
                entry['stations'] = stations
        # Override: America's Cup editions are championship moments, not annual events.
        # The xlsx flags them Annual=Y because they recur on a multi-year cadence, but
        # semantically each edition belongs in Championship Finals (like Super Bowl
        # or World Series), not Annual Sporting Events.
        if entry['type'] == 'Sporting Event' and entry['name'].startswith("America's Cup"):
            entry.pop('annual', None)
        culture.setdefault(metro, []).append(entry)
    return culture


def extract_skyscrapers(wb):
    """Extract skyscraper data grouped by metro."""
    ws = wb["Skyscrapers"]
    scrapers = {}
    for row in ws.iter_rows(min_row=3, values_only=True):
        v = list(row)
        metro = safe_str(v[4])
        if not metro:
            continue
        scrapers[metro] = {
            'city': safe_str(v[2]),
            'over150m': safe_int(v[9]),
            'over200m': safe_int(v[10]),
            'over300m': safe_int(v[11]),
        }
    return scrapers


def extract_luxury(wb):
    """Extract luxury hospitality grouped by metro."""
    ws = wb["Luxury Hospitality"]
    luxury = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[6])
        if not metro:
            continue
        luxury.setdefault(metro, []).append({
            'name': safe_str(v[4]),
            'city': safe_str(v[5]),
            'type': safe_str(v[8]),
        })
    return luxury


def extract_events(wb):
    """Extract sporting events (Golf, Tennis, F1, Boxing) grouped by metro."""
    ws = wb["Golf-Tennis-F1"]
    events = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[6])
        if not metro:
            continue
        entry = {
            'sport': safe_str(v[0]),
            'event': safe_str(v[1]),
            'year': safe_str(v[2]),
            'venue': safe_str(v[3]),
        }
        # Boxing Event type (Column K / index 10): only applies to Boxing rows
        event_type = safe_str(v[10]) if len(v) > 10 else ''
        if event_type:
            entry['type'] = event_type
        events.setdefault(metro, []).append(entry)
    return events


def extract_mktcap(wb):
    """Extract market cap data grouped by metro, including company name and source."""
    ws = wb["MktCap_Data"]
    mktcap = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[0])
        val = safe_float(v[1])
        if not metro or val == 0:
            continue
        company_name = safe_str(v[2]) if len(v) > 2 else ''
        source = safe_str(v[3]) if len(v) > 3 else ''
        mktcap.setdefault(metro, []).append({
            'valuation': val,
            'name': company_name,
            'source': source,
        })
    # Sort each metro's companies by valuation descending
    for metro in mktcap:
        mktcap[metro].sort(key=lambda x: x['valuation'], reverse=True)
    return mktcap


def extract_football(wb):
    """Extract football club data grouped by metro."""
    ws = wb["FootballClub_Data"]
    football = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[2])  # Metro Area column
        team_name = safe_str(v[0])  # Team name column
        if not metro or not team_name:
            continue
        football.setdefault(metro, []).append({
            'team': team_name,
            'city': safe_str(v[1]),
            'country': safe_str(v[4]),
            'league': safe_str(v[5]),
            'level': safe_int(v[6]),
            'major': safe_str(v[8]) == 'Y',
        })
    return football


def extract_towers(wb):
    """Extract supertall structures (350m+) grouped by metro.

    Tower_Data layout (Row 1 empty, Row 2 headers, Row 3+ data):
      0: Rank, 1: Name, 2: Height (m), 3: Height (ft),
      4: City, 5: Country, 6: Year Built, 7: Notes, 8: Metro Area
    The xlsx is already pre-filtered to 350m+, but we still gate on
    height as a defensive measure in case the threshold changes upstream.
    """
    if "Tower_Data" not in wb.sheetnames:
        return {}
    ws = wb["Tower_Data"]
    towers = {}
    for row in ws.iter_rows(min_row=3, values_only=True):
        v = list(row)
        if len(v) < 9:
            continue
        metro = safe_str(v[8])
        name = safe_str(v[1])
        height_m = safe_float(v[2])
        if not metro or not name or height_m < 350:
            continue
        towers.setdefault(metro, []).append({
            'name': name,
            'city': safe_str(v[4]),
            'heightM': round(height_m, 1),
            'yearBuilt': safe_int(v[6]) or None,
        })
    # Sort each metro's towers tallest-first so the UI gets a stable order.
    for metro in towers:
        towers[metro].sort(key=lambda x: -x['heightM'])
    return towers


def compute_regions(metros):
    """Compute regional aggregates."""
    regions = {}
    for m in metros:
        r = m['region']
        if not r:
            continue
        if r not in regions:
            regions[r] = {
                'name': r,
                'metros': 0,
                'above50': 0,
                'above20': 0,
                'totalScore': 0,
                'top3': [],
                'totalPop': 0,
                'totalMarketCap': 0,
                'scores': [],
            }
        reg = regions[r]
        reg['metros'] += 1
        reg['totalScore'] += m['score']
        reg['totalPop'] += m['pop']
        reg['totalMarketCap'] += m['dims']['marketCap']
        reg['scores'].append(m['score'])
        if m['score'] >= 50:
            reg['above50'] += 1
        if m['score'] >= 20:
            reg['above20'] += 1
        if len(reg['top3']) < 3:
            reg['top3'].append({
                'name': m['name'],
                'score': m['score'],
                'rank': m['rank'],
                'slug': m['slug'],
            })

    # Compute medians
    for r in regions.values():
        scores = sorted(r['scores'])
        n = len(scores)
        r['medianScore'] = round(scores[n // 2], 2) if n else 0
        r['totalMarketCap'] = round(r['totalMarketCap'])
        del r['scores']

    return list(regions.values())


def compute_dimension_ranks(metros):
    """Compute per-dimension ranks across all metros. Returns dict keyed by slug."""
    dim_keys = list(metros[0]['dims'].keys()) if metros else []
    ranks_by_slug = {}

    for key in dim_keys:
        # Collect (value, slug) pairs, sorted descending by value
        entries = [(m['dims'][key], m['slug']) for m in metros]
        entries.sort(key=lambda x: -x[0])

        # Assign ranks with tie handling
        rank_map = {}
        i = 0
        while i < len(entries):
            val = entries[i][0]
            # Find all entries with this same value
            j = i
            while j < len(entries) and entries[j][0] == val:
                j += 1
            tied_count = j - i
            rank_pos = i + 1  # 1-based rank
            is_tie = tied_count > 1 and val > 0
            for k in range(i, j):
                slug = entries[k][1]
                if val <= 0:
                    rank_map[slug] = None  # No rank for zero/negative values
                elif is_tie:
                    rank_map[slug] = f"T-{rank_pos}"
                else:
                    rank_map[slug] = str(rank_pos)
            i = j

        for slug, rank_str in rank_map.items():
            if slug not in ranks_by_slug:
                ranks_by_slug[slug] = {}
            ranks_by_slug[slug][key] = rank_str

    return ranks_by_slug


def build_detail(metro_name, teams, unis, culture, scrapers, luxury, events, mktcap, football, towers):
    """Build a detail JSON object for a single metro."""
    detail = {}

    if metro_name in teams:
        detail['teams'] = teams[metro_name]

    if metro_name in unis:
        detail['universities'] = unis[metro_name]

    if metro_name in culture:
        # Group by type
        by_type = {}
        for item in culture[metro_name]:
            t = item['type'] or 'Other'
            by_type.setdefault(t, []).append(item)
        detail['culture'] = by_type

    if metro_name in scrapers:
        detail['skyscrapers'] = scrapers[metro_name]

    if metro_name in luxury:
        detail['luxury'] = luxury[metro_name]

    if metro_name in events:
        detail['events'] = events[metro_name]

    if metro_name in mktcap:
        companies = mktcap[metro_name]
        total = sum(c['valuation'] for c in companies)
        detail['marketCap'] = {
            'total': round(total),
            'count': len(companies),
            'top12': [
                {
                    'name': c['name'],
                    'valuation': round(c['valuation']),
                    'source': c['source'],
                }
                for c in companies[:12]
            ],
        }

    if metro_name in towers:
        detail['supertallStructures'] = towers[metro_name]

    if metro_name in football:
        clubs = football[metro_name]
        detail['football'] = {
            'total': len(clubs),
            'byLevel': {},
        }
        for c in clubs:
            lvl = str(c['level'])
            detail['football']['byLevel'][lvl] = detail['football']['byLevel'].get(lvl, 0) + 1

        # Merge football clubs into the teams array for site rendering
        # Major league clubs always included; non-major only if they have a valid level (> 0)
        if 'teams' not in detail:
            detail['teams'] = []
        for c in clubs:
            if not c['major'] and not c['level']:
                continue
            detail['teams'].append({
                'sport': 'Soccer',
                'league': c['league'],
                'team': c['team'],
                'city': c['city'],
                'country': c['country'],
                'level': str(c['level']),
                'major': c['major'],
            })

    return detail


def main():
    # Find the Excel file
    script_dir = Path(__file__).parent
    site_dir = script_dir.parent

    if len(sys.argv) > 1:
        xlsx_path = Path(sys.argv[1])
    else:
        # Look in parent of site/ directory
        xlsx_path = site_dir.parent / "MetroAreas.xlsx"

    if not xlsx_path.exists():
        print(f"ERROR: Cannot find {xlsx_path}")
        print(f"Usage: python {sys.argv[0]} [path/to/MetroAreas.xlsx]")
        sys.exit(1)

    print(f"Reading {xlsx_path}...")
    wb = openpyxl.load_workbook(str(xlsx_path), read_only=True, data_only=True)

    # Extract all data
    print("Extracting metro data...")
    metros = extract_metros(wb)
    print(f"  {len(metros)} metros")

    print("Extracting teams...")
    teams = extract_teams(wb)
    print(f"  {sum(len(v) for v in teams.values())} teams across {len(teams)} metros")

    print("Extracting universities...")
    unis = extract_universities(wb)
    print(f"  {sum(len(v) for v in unis.values())} universities")

    print("Extracting cultural assets...")
    culture_data = extract_culture(wb)
    print(f"  {sum(len(v) for v in culture_data.values())} assets")

    print("Extracting skyscrapers...")
    scrapers = extract_skyscrapers(wb)
    print(f"  {len(scrapers)} cities with skyscrapers")

    print("Extracting luxury hospitality...")
    luxury = extract_luxury(wb)
    print(f"  {sum(len(v) for v in luxury.values())} entries")

    print("Extracting sporting events...")
    events = extract_events(wb)
    print(f"  {sum(len(v) for v in events.values())} events")

    print("Extracting market cap data...")
    mktcap = extract_mktcap(wb)
    print(f"  {sum(len(v) for v in mktcap.values())} companies")

    print("Extracting football clubs...")
    football = extract_football(wb)
    print(f"  {sum(len(v) for v in football.values())} clubs")

    print("Extracting supertall structures...")
    towers = extract_towers(wb)
    print(f"  {sum(len(v) for v in towers.values())} supertalls across {len(towers)} metros")

    wb.close()

    # Compute regions
    print("Computing regional aggregates...")
    regions = compute_regions(metros)

    # Compute dimension ranks
    print("Computing dimension ranks...")
    dim_ranks = compute_dimension_ranks(metros)
    print(f"  Ranked {len(dim_ranks)} metros across {len(metros[0]['dims'])} dimensions")

    # Output directories
    data_dir = site_dir / "public" / "data"
    details_dir = data_dir / "details"
    data_dir.mkdir(parents=True, exist_ok=True)
    details_dir.mkdir(parents=True, exist_ok=True)

    # Write main metros.json (slim version for rankings table)
    print("Writing metros.json...")
    slim_metros = []
    for m in metros:
        entry = {
            'rank': m['rank'],
            'slug': m['slug'],
            'name': m['name'],
            'country': m['country'],
            'region': m['region'],
            'continent': m['continent'],
            'pop': m['pop'],
            'score': m['score'],
            'lat': m['lat'],
            'lon': m['lon'],
            'primaryCity': m['primaryCity'],
            'gdp': m['gdp'],
            # Key dimension summaries for the table
            'majorTeams': m['dims']['majorLeagueTeams'],
            'companies': m['dims']['companies'],
            'marketCap': m['dims']['marketCap'],
            'skyscrapers': m['dims']['skyscrapers'],
            'metroStations': m['dims']['metroStations'],
            'universities': m['dims']['universities'],
        }
        # Include subCountry for UK metros (for search)
        if m['country'] == 'United Kingdom' and m['subCountry']:
            entry['subCountry'] = m['subCountry']
        # Include states for search (only non-empty values)
        if m['primaryState']:
            entry['primaryState'] = m['primaryState']
        if m['state2']:
            entry['state2'] = m['state2']
        if m['state3']:
            entry['state3'] = m['state3']
        slim_metros.append(entry)

    with open(data_dir / "metros.json", 'w') as f:
        json.dump(slim_metros, f, separators=(',', ':'))
    size = os.path.getsize(data_dir / "metros.json")
    print(f"  metros.json: {size:,} bytes ({size/1024:.0f} KB)")

    # Write regions.json
    print("Writing regions.json...")
    with open(data_dir / "regions.json", 'w') as f:
        json.dump(regions, f, separators=(',', ':'))

    # Write per-metro detail files
    print("Writing detail files...")
    detail_count = 0
    total_detail_size = 0
    slug_map = {}  # Track slugs to handle duplicates

    for m in metros:
        slug = m['slug']
        # Handle duplicate slugs
        if slug in slug_map:
            slug = f"{slug}-{m['country'].lower().replace(' ', '-')}"
            m['slug'] = slug
        slug_map[slug] = True

        detail = build_detail(
            m['name'], teams, unis, culture_data, scrapers,
            luxury, events, mktcap, football, towers
        )

        # Add the full metro data to the detail file
        detail['metro'] = m

        # Add dimension ranks
        if slug in dim_ranks:
            detail['dimRanks'] = dim_ranks[slug]

        detail_path = details_dir / f"{slug}.json"
        with open(detail_path, 'w') as f:
            json.dump(detail, f, separators=(',', ':'))

        fsize = os.path.getsize(detail_path)
        total_detail_size += fsize
        detail_count += 1

    print(f"  {detail_count} detail files, {total_detail_size/1024/1024:.1f} MB total")

    # Rewrite metros.json with corrected slugs
    for sm in slim_metros:
        matched = next((m for m in metros if m['name'] == sm['name'] and m['country'] == sm['country']), None)
        if matched:
            sm['slug'] = matched['slug']

    with open(data_dir / "metros.json", 'w') as f:
        json.dump(slim_metros, f, separators=(',', ':'))

    # Write meta.json with last update date from the Excel file
    import datetime
    xlsx_mtime = os.path.getmtime(str(xlsx_path))
    last_update = datetime.datetime.fromtimestamp(xlsx_mtime).strftime('%Y-%m-%d')
    meta = {'lastUpdate': last_update}
    with open(data_dir / "meta.json", 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print(f"  meta.json: lastUpdate={last_update}")

    print("\nDone! Data files written to public/data/")
    print(f"  metros.json ({len(slim_metros)} metros)")
    print(f"  regions.json ({len(regions)} regions)")
    print(f"  details/ ({detail_count} files)")
    print(f"  meta.json (lastUpdate: {last_update})")


if __name__ == "__main__":
    main()
