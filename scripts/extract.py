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

        # Wikidata QID (col BT / idx 71) and Wikipedia URL (col BU / idx 72).
        # Populated for Top 25 metros as of 2026-04-24; ranks 26+ intentionally
        # blank. Omit keys entirely when absent so the JSON payload stays clean
        # and downstream sameAs arrays never emit null placeholders.
        qid = safe_str(v[71]) if len(v) > 71 else ''
        wiki_url = safe_str(v[72]) if len(v) > 72 else ''

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
        if qid:
            metro['qid'] = qid
        if wiki_url:
            metro['wikipediaUrl'] = wiki_url
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
        level = safe_str(v[9])
        # Main Division (col 3) holds the authoritative tag for NCAA minor-sport
        # rows the user has put under generic league labels like "Other Sports" or
        # "Other Women Sports" (e.g. NCAA Wrestling, NCAA W Soccer, NCAA Baseball).
        # Promote level to "College" whenever Main Division starts with "NCAA" so
        # downstream bucketing routes these teams into College/University Teams
        # regardless of league label.
        main_division = safe_str(v[3])
        if main_division.upper().startswith("NCAA") and level != "College":
            level = "College"
        # Major League column (col 11) uses three patterns:
        #   ""           → not a major-league row
        #   "Y"          → major-league row, league label comes from col 1 as-is
        #   "<TierName>" → major-league row AND the tier name overrides the
        #                  generic col 1 label. This is how Euroleague basketball
        #                  is encoded: col 1 = "Int'l Basketball" (the bucket),
        #                  col 11 = "Euroleague" (the actual tier the team
        #                  competes in). Surface the tier so the metro page
        #                  shows "Euroleague" rather than "Int'l Basketball".
        ml_marker = safe_str(v[11])
        is_major = ml_marker != ''
        league_for_team = ml_marker if (is_major and ml_marker != 'Y') else league
        team_entry = {
            'sport': safe_str(v[0]),
            'league': league_for_team,
            'team': _normalize_venue_name(league_for_team, safe_str(v[2])),
            'city': safe_str(v[5]),
            'country': safe_str(v[8]),
            'level': level,
            'major': is_major,
        }
        # Column O (index 14) = "Annual Event" flag, marked 'Y' for recurring
        # event-type entries in Team List (F1 Grands Prix, NASCAR races, Sailing
        # regattas, Powerboat races). These are teams in the source data but
        # behave like events on the site, so they route exclusively into the
        # "Annual Sporting Events" category on the metro page rather than the
        # Major League Teams or Other Teams buckets.
        annual_flag = safe_str(v[14]) if len(v) > 14 else ''
        if annual_flag.upper() == 'Y':
            team_entry['annual'] = True
        # Columns P/Q (idx 15/16) = Wikidata QID and Wikipedia URL. Populated
        # as of 2026-04-24 for all US major league franchises (NFL/MLB/NBA/NHL)
        # plus every Canadian NHL team and the Toronto MLB/NBA franchises.
        # Omit the keys when empty so JSON-LD sameAs arrays never emit nulls.
        qid = safe_str(v[15]) if len(v) > 15 else ''
        wiki_url = safe_str(v[16]) if len(v) > 16 else ''
        if qid:
            team_entry['qid'] = qid
        if wiki_url:
            team_entry['wikipediaUrl'] = wiki_url
        # Columns R/S (idx 17/18) = Lat / Long for the team's home venue (or for
        # venue-class rows, the venue itself). Used to render team and venue
        # markers on the metro detail page map. Both must be present and numeric
        # for the marker to plot; otherwise the entry is rendered in the written
        # sections only.
        lat = safe_float(v[17]) if len(v) > 17 else 0
        lng = safe_float(v[18]) if len(v) > 18 else 0
        if lat or lng:
            team_entry['lat'] = lat
            team_entry['lng'] = lng
        teams.setdefault(metro, []).append(team_entry)

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
    """Extract skyscraper data grouped by metro.

    The Skyscrapers sheet has one row per municipality, and a single metro can
    span multiple municipalities (NYC + Jersey City + Fort Lee, Tokyo +
    Yokohama + Kawasaki, Bay Area's SF + San Jose + Oakland, etc.). We must
    SUM the 150m+/200m+/300m+ tier counts across all rows for the metro, not
    overwrite. The 'city' field stores the largest contributing municipality
    so the value remains meaningful if surfaced later.
    """
    ws = wb["Skyscrapers"]
    scrapers = {}
    for row in ws.iter_rows(min_row=3, values_only=True):
        v = list(row)
        metro = safe_str(v[4])
        if not metro:
            continue
        city = safe_str(v[2])
        over150 = safe_int(v[9])
        over200 = safe_int(v[10])
        over300 = safe_int(v[11])
        agg = scrapers.get(metro)
        if agg is None:
            scrapers[metro] = {
                'city': city,
                'over150m': over150,
                'over200m': over200,
                'over300m': over300,
                # Bookkeeping: track the largest contributor's 150m+ count so
                # the headline city stays the densest municipality even when
                # a smaller one is processed later in the sheet.
                '_top_city_over150m': over150,
            }
            continue
        agg['over150m'] += over150
        agg['over200m'] += over200
        agg['over300m'] += over300
        # Promote the largest contributor as the headline city. Ties broken
        # by row order (first occurrence wins).
        if over150 > agg.get('_top_city_over150m', 0):
            agg['city'] = city
            agg['_top_city_over150m'] = over150
    # Strip the bookkeeping field so the output JSON stays clean.
    for v in scrapers.values():
        v.pop('_top_city_over150m', None)
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


def _slugify_state(name):
    """Slug-ify a state/admin division name for use in URLs."""
    if not name:
        return ""
    s = safe_str(name).lower()
    # Strip diacritics
    import unicodedata
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    # Replace common punctuation/whitespace
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif ch in (' ', '-', '_', '/', '.', "'", '(', ')'):
            out.append('-')
    s = ''.join(out)
    # Collapse repeated dashes and trim
    while '--' in s:
        s = s.replace('--', '-')
    return s.strip('-')


# Per-country sheet routing is data-driven inside extract_metro_state_edges
# rather than driven by a static list. Notes lists 33 countries as
# "Municipality countries", but several (Brazil, Japan, Russia, India,
# Australia) actually have zero rows there in practice. Discovering which
# sovereigns have Municipality rows at runtime keeps coverage correct
# regardless of which long-tail countries get added or moved between sheets.

# Map UK constituent labels back to the sovereign so per-state lookups
# resolve consistently against the States sheet (which stores Greater
# London under Country='England', Edinburgh under Country='Scotland', etc.).
WORKBOOK_TO_CANONICAL_COUNTRY = {
    "England":          "United Kingdom",
    "Scotland":         "United Kingdom",
    "Wales":            "United Kingdom",
    "Northern Ireland": "United Kingdom",
}


def extract_metro_state_edges(wb, all_metros):
    """Aggregate (state, metro) edges from Counties + Municipality.

    Routing is data-driven, not based on a static list. We scan Municipality
    first to discover which countries actually have rows there. Those
    countries are sourced exclusively from Municipality (it's denser when
    populated). Every other country falls through to Counties — including
    countries Notes lists as "Municipality" but which have zero rows there
    in practice (Brazil, Japan, Russia, India, Australia all qualify as of
    Session 73).

    Sheet column layout (verified directly against the workbook, ignoring
    the Notes' off-by-one column-letter shorthand for Counties):
      Counties:     col 0 = Country, col 2 = State, col 7 = Metro, col 8 = Sub Country
      Municipality: col 1 = Country, col 4 = State, col 6 = Metro

    UK rows in Municipality use the constituent ("England", "Scotland",
    etc.) in col 1, never the sovereign. Those canonicalize to United
    Kingdom in the edge key while the constituent is preserved for the
    States-sheet matcher's fallback path.

    Returns:
      edges: dict[(country, sub_country, state_name)] -> set(metro_name)
    """
    edges = {}
    metros_by_name = {m['name']: m for m in all_metros}

    def add_edge(country, sub, state, metro_name):
        if not country or not state or not metro_name:
            return
        if metro_name not in metros_by_name:
            return
        canonical = WORKBOOK_TO_CANONICAL_COUNTRY.get(country, country)
        sub_label = (
            country if country in WORKBOOK_TO_CANONICAL_COUNTRY else (sub or "")
        )
        key = (canonical, sub_label, state)
        edges.setdefault(key, set()).add(metro_name)

    # Pass 1: scan Municipality. Track which sovereign countries have
    # actual rows so the Counties pass below knows which to skip.
    municipality_sovereigns = set()
    if "Municipality" in wb.sheetnames:
        ws = wb["Municipality"]
        for row in ws.iter_rows(min_row=2, values_only=True):
            v = list(row)
            country = safe_str(v[1]) if len(v) > 1 else ''
            if not country:
                continue
            canonical = WORKBOOK_TO_CANONICAL_COUNTRY.get(country, country)
            municipality_sovereigns.add(canonical)
            state = safe_str(v[4]) if len(v) > 4 else ''
            metro = safe_str(v[6]) if len(v) > 6 else ''
            add_edge(country, '', state, metro)

    # Pass 2: scan Counties for countries NOT served by Municipality.
    # Falls back the long tail (Brazil, Japan, India, Russia, Australia,
    # plus the 200+ smaller countries that never had Municipality rows).
    if "Counties" in wb.sheetnames:
        ws = wb["Counties"]
        for row in ws.iter_rows(min_row=2, values_only=True):
            v = list(row)
            country = safe_str(v[0]) if len(v) > 0 else ''
            if not country:
                continue
            canonical = WORKBOOK_TO_CANONICAL_COUNTRY.get(country, country)
            if canonical in municipality_sovereigns:
                continue
            state = safe_str(v[2]) if len(v) > 2 else ''
            metro = safe_str(v[7]) if len(v) > 7 else ''
            sub = safe_str(v[8]) if len(v) > 8 else ''
            add_edge(country, sub, state, metro)

    return edges


# Editorial overrides: metros whose real footprint spans more states/
# administrative areas than the workbook's primary/state2/state3 columns
# can carry. Each metro lists ADDITIONAL state names (in addition to its
# primaryState/state2/state3) to render on the metro page tables and to
# include in /states/[slug] pages for those states.
#
# Names must match the Administrative Division (col 2) in the States sheet
# under the metro's country (or subCountry for UK constituents). Add new
# entries here as editorial calls land.
METRO_ADDITIONAL_STATES = {
    # Greater London Built-Up Area extends well beyond the boundary of the
    # GLA into the home counties; commuter belt covers Surrey,
    # Hertfordshire, and Berkshire.
    "London": ["Surrey", "Hertfordshire", "Berkshire"],
}


def extract_states(wb, all_metros):
    """Extract states/provinces from the States (ISO 3166-2) sheet.

    Returns:
      states_list: list of state dicts ready for states.json
      metro_state_slugs: dict {metro_name: {primary?, state2?, state3?}}
        Each value is a dict with up to three keys mapping the metro's
        primaryState / state2 / state3 names to their resolved state slugs.
        Missing keys mean the lookup found no match (state isn't in the
        ISO sheet under either country or subCountry).

    Keying: (Country, Administrative Division) is the canonical pair. Cross-
    reference each metro's (country, primaryState) against this pair, falling
    back to (subCountry, primaryState) for UK constituents whose metros tag
    country='United Kingdom' but the States sheet stores them under
    Country='England' / 'Scotland' / 'Wales' / 'Northern Ireland'.

    Slug rule: kebab-cased Administrative Division. On collision (Punjab in
    India + Pakistan, Amazonas in Brazil/Venezuela/Colombia), append the
    country slug to disambiguate. Final fallback prepends ISO if available.
    """
    if "States (ISO 3166-2)" not in wb.sheetnames:
        return [], {}
    ws = wb["States (ISO 3166-2)"]

    # Pre-compute country slug map from metros so state slug collisions can
    # disambiguate using the same conventions as country pages.
    country_slug = {}
    for m in all_metros:
        country_slug[m['country']] = m['country'].lower().replace(' ', '-')
        if m.get('subCountry'):
            country_slug[m['subCountry']] = m['subCountry'].lower().replace(' ', '-')

    # Pass 1: collect raw state rows.
    raw = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        admin = safe_str(v[2]) if len(v) > 2 else ''
        country = safe_str(v[4]) if len(v) > 4 else ''
        if not admin or not country:
            continue
        raw.append({
            'name': admin,
            'type': safe_str(v[3]) if len(v) > 3 else '',
            'country': country,  # the immediate parent in the sheet (England, Anguilla, etc.)
            'pop': safe_int(v[5]) if len(v) > 5 else 0,
            'capital': safe_str(v[6]) if len(v) > 6 else '',
            'continent': safe_str(v[8]) if len(v) > 8 else '',
            'iso': safe_str(v[9]) if len(v) > 9 else '',
            'subRegion': safe_str(v[10]) if len(v) > 10 else '',
            'mainCountry': safe_str(v[11]) if len(v) > 11 else '',
            'languageAdmin': safe_str(v[12]) if len(v) > 12 else '',
            'languageSecondary': safe_str(v[13]) if len(v) > 13 else '',
            'languageDeFacto': safe_str(v[16]) if len(v) > 16 else '',
            'languageNational': safe_str(v[17]) if len(v) > 17 else '',
        })

    # Pass 2: assign collision-aware slugs.
    # Group by raw slug to detect collisions across countries.
    by_raw_slug = {}
    for s in raw:
        rs = _slugify_state(s['name'])
        if not rs:
            continue
        s['_raw_slug'] = rs
        by_raw_slug.setdefault(rs, []).append(s)

    states_by_key = {}  # (country, name) -> state dict with final slug
    for rs, group in by_raw_slug.items():
        if len(group) == 1:
            s = group[0]
            s['slug'] = rs
        else:
            # Disambiguate by appending the immediate parent country slug.
            for s in group:
                country_part = country_slug.get(s['country']) or _slugify_state(s['country'])
                # If state name == country name (e.g. Andorra/Andorra),
                # don't double the slug — fall back to ISO if present.
                if rs == country_part and s['iso']:
                    s['slug'] = s['iso'].lower()
                else:
                    s['slug'] = f"{rs}-{country_part}"
        for s in group:
            states_by_key[(s['country'], s['name'])] = s

    # Sanity: enforce slug uniqueness across the whole set; fall back to ISO
    # on any residual collision so the slug truly identifies one row.
    seen_slugs = {}
    for s in states_by_key.values():
        if s['slug'] in seen_slugs and seen_slugs[s['slug']] is not s:
            if s['iso']:
                s['slug'] = s['iso'].lower()
            else:
                s['slug'] = f"{s['slug']}-{_slugify_state(s['mainCountry'])}"
        seen_slugs[s['slug']] = s

    # Pass 3: resolve every metro's primary, #2 and #3 state slugs. The
    # homepage rankings table and country-page tables both read these three
    # slugs off metros.json so neither has to redo the lookup at render
    # time. Per-state metro counts (and the state page's metro list) come
    # from the cross-sheet aggregator below — which sees the FULL list of
    # states a metro spans rather than just the workbook's three slots.
    metro_state_slugs = {}  # metro_name -> {primary, state2, state3, additional}

    def _resolve(country, sub, name):
        if not name:
            return None
        return (
            states_by_key.get((country, name))
            or (states_by_key.get((sub, name)) if sub else None)
        )

    # Resolve the up-to-three workbook slots for the homepage / country
    # tables (these are space-constrained and only show 3 states inline).
    for m in all_metros:
        country = m['country']
        sub = m.get('subCountry') or ''
        primary = m.get('primaryState') or ''
        s2 = m.get('state2') or ''
        s3 = m.get('state3') or ''
        primary_state = _resolve(country, sub, primary)
        s2_state = _resolve(country, sub, s2)
        s3_state = _resolve(country, sub, s3)
        slugs = {}
        if primary_state:
            slugs['primary'] = primary_state['slug']
        if s2_state:
            slugs['state2'] = s2_state['slug']
        if s3_state:
            slugs['state3'] = s3_state['slug']
        extras = METRO_ADDITIONAL_STATES.get(m['name'], [])
        if extras:
            additional = []
            for name in extras:
                st = _resolve(country, sub, name)
                if st:
                    additional.append({'name': name, 'slug': st['slug']})
                else:
                    print(f"  [warn] additional-state override for {m['name']!r} did not match {(country, name)!r}")
                    additional.append({'name': name})
            if additional:
                slugs['additional'] = additional
        if slugs:
            metro_state_slugs[m['name']] = slugs

    # Pass 4: cross-sheet aggregation. Counties + Municipality together
    # capture every state a metro touches (a metro that spans 7 English
    # ceremonial counties has 7 edges in Municipality; primaryState only
    # records 1). For each (country, state) edge, accumulate the metro into
    # the matching State row's _metroSlugs set and recompute totals from
    # that set. This becomes the source of truth for the country-page chip
    # counts and the /states/[slug] metro list.
    edges = extract_metro_state_edges(wb, all_metros)
    metros_by_name = {m['name']: m for m in all_metros}
    metros_by_slug = {m['slug']: m for m in all_metros}
    state_by_slug = {s['slug']: s for s in states_by_key.values()}

    for (country, sub_label, state_name), metro_set in edges.items():
        st = _resolve(country, sub_label, state_name)
        if not st:
            # No matching row in States sheet. Common in countries whose
            # Counties data tags state names that aren't in the ISO sheet
            # under the same Country column (cross-listed via Sub-Country
            # is already tried by _resolve). Skip silently — the metro
            # still shows on its primary state page if that resolved.
            continue
        bucket = st.setdefault('_metroSlugs', set())
        for metro_name in metro_set:
            m = metros_by_name.get(metro_name)
            if m:
                bucket.add(m['slug'])

    # Always also include the metro's primary state slug — the workbook's
    # primaryState is the intentional editorial primary, and a metro
    # sometimes has zero rows in Counties/Municipality for its primary
    # state (e.g., when the "metro" is actually a single municipality and
    # the parent state isn't otherwise tagged). Belt-and-braces.
    for m in all_metros:
        slugs = metro_state_slugs.get(m['name'], {})
        primary = slugs.get('primary')
        if not primary:
            continue
        primary_state = state_by_slug.get(primary)
        if primary_state:
            primary_state.setdefault('_metroSlugs', set()).add(m['slug'])

    # Roll the metro slug set into final counts and a sorted list. Pop
    # and score totals follow the same set so they don't double-count
    # metros that span multiple workbook columns. O(N) overall thanks
    # to the metros_by_slug index built above.
    for st in states_by_key.values():
        slug_set = st.get('_metroSlugs') or set()
        st['_metroCount'] = len(slug_set)
        st['_metroPop'] = 0
        st['_scoreTotal'] = 0.0
        for sl in slug_set:
            mm = metros_by_slug.get(sl)
            if mm:
                st['_metroPop'] += mm.get('pop') or 0
                st['_scoreTotal'] += mm.get('score') or 0.0
        # Stable order: by metro rank ascending so the highest-ranked
        # metro in each state lands first in the state page table.
        st['_metroSlugList'] = sorted(
            slug_set,
            key=lambda sl: metros_by_slug.get(sl, {}).get('rank', 99999),
        )

    # Final shape for states.json — keep concise; promote internal keys.
    states_list = []
    for s in states_by_key.values():
        country_slug_val = country_slug.get(s['country']) or _slugify_state(s['country'])
        main_country_slug_val = (
            country_slug.get(s['mainCountry']) or _slugify_state(s['mainCountry'])
            if s['mainCountry'] else None
        )
        out = {
            'slug': s['slug'],
            'name': s['name'],
            'country': s['country'],
            'countrySlug': country_slug_val,
            'mainCountry': s['mainCountry'] or s['country'],
            'mainCountrySlug': main_country_slug_val or country_slug_val,
            'type': s['type'] or 'Administrative Area',
            'iso': s['iso'] or None,
            'pop': s['pop'] or None,
            'capital': s['capital'] or None,
            'continent': s['continent'] or None,
            'subRegion': s['subRegion'] or None,
            'languageAdmin': s['languageAdmin'] or None,
            'languageSecondary': s['languageSecondary'] or None,
            'languageDeFacto': s['languageDeFacto'] or None,
            'languageNational': s['languageNational'] or None,
            'metroCount': s.get('_metroCount', 0),
            'metroPop': s.get('_metroPop', 0),
            'scoreTotal': round(s.get('_scoreTotal', 0.0), 2),
            # The full list of metro slugs that touch this state (from
            # Counties/Municipality cross-sheet aggregation, plus each
            # metro's primary state). Drives the /states/[slug] metro
            # table; supersedes the older "filter metros by stateSlug"
            # client-side scan, which only saw the first-3 workbook slots.
            'metroSlugs': s.get('_metroSlugList', []),
        }
        states_list.append(out)

    # Stable sort: by main country, then descending metro count, then name.
    states_list.sort(key=lambda x: (
        x['mainCountrySlug'] or '',
        -(x['metroCount'] or 0),
        x['name'],
    ))
    return states_list, metro_state_slugs


def extract_football(wb):
    """Extract football club data grouped by metro.

    FootballClub_Data column layout (as of 2026-05-05):
      0: Team, 1: City, 2: Metro Area, 3: County, 4: Country, 5: League,
      6: Level, 7: Club, 8: Major League, 9: Latitude, 10: Longitude.

    Country aggregate rows (col 7 = "Country") are pure roll-ups and have
    no metro home; skip them. Cols 9/10 previously scaffolded for QID and
    Wikipedia URL; the user repurposed them for venue coordinates on
    2026-05-05. If a future pass adds club-level Wikidata linking, give
    those columns a new home rather than reusing 9/10.
    """
    ws = wb["FootballClub_Data"]
    football = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        v = list(row)
        metro = safe_str(v[2])  # Metro Area column
        team_name = safe_str(v[0])  # Team name column
        if not metro or not team_name:
            continue
        # Skip Country-level aggregate rows (~250 entries); they exist to
        # carry a country-wide pin and are not stadiums.
        if safe_str(v[7]) == 'Country':
            continue
        entry = {
            'team': team_name,
            'city': safe_str(v[1]),
            'country': safe_str(v[4]),
            'league': safe_str(v[5]),
            'level': safe_int(v[6]),
            'major': safe_str(v[8]) == 'Y',
        }
        # Cols 9/10 = Latitude / Longitude. Only attach when both are
        # present and numeric so the marker layer can filter cleanly.
        lat = safe_float(v[9]) if len(v) > 9 else 0
        lng = safe_float(v[10]) if len(v) > 10 else 0
        if lat or lng:
            entry['lat'] = lat
            entry['lng'] = lng
        football.setdefault(metro, []).append(entry)
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


def find_companies_source(explicit_path=None):
    """Locate the upstream companiesmarketcap.com xlsx whose mtime tells us
    when the market cap data was last refreshed. Returns Path or None.

    Lookup order:
      1. COMPANIES_SOURCE_XLSX environment variable, if set
      2. explicit_path argument, if provided
      3. ~/OneDrive/Excel Files/companiesmarketcap.com - Companies ranked by Market Cap - CompaniesMarketCap.com (1).xlsx
      4. ~/Excel Files/...
      5. Sibling 'Excel Files' folder next to project root
    """
    filename = (
        "companiesmarketcap.com - Companies ranked by Market Cap - "
        "CompaniesMarketCap.com (1).xlsx"
    )
    candidates = []
    env_path = os.environ.get("COMPANIES_SOURCE_XLSX")
    if env_path:
        candidates.append(Path(env_path))
    if explicit_path:
        candidates.append(Path(explicit_path))
    home = Path.home()
    candidates.extend([
        home / "OneDrive" / "Excel Files" / filename,
        home / "Excel Files" / filename,
        Path(__file__).resolve().parent.parent.parent / "Excel Files" / filename,
    ])
    for c in candidates:
        try:
            if c.exists():
                return c
        except OSError:
            continue
    return None


def build_detail(metro_name, teams, unis, culture, scrapers, luxury, events, mktcap, football, towers, mktcap_as_of=None):
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
        if mktcap_as_of:
            detail['marketCap']['asOf'] = mktcap_as_of

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
            merged = {
                'sport': 'Soccer',
                'league': c['league'],
                'team': c['team'],
                'city': c['city'],
                'country': c['country'],
                'level': str(c['level']),
                'major': c['major'],
            }
            if c.get('qid'):
                merged['qid'] = c['qid']
            if c.get('wikipediaUrl'):
                merged['wikipediaUrl'] = c['wikipediaUrl']
            if c.get('lat') is not None and c.get('lng') is not None:
                merged['lat'] = c['lat']
                merged['lng'] = c['lng']
            detail['teams'].append(merged)

    return detail


def main():
    # Find the Excel file
    script_dir = Path(__file__).parent
    site_dir = script_dir.parent

    if len(sys.argv) > 1:
        xlsx_path = Path(sys.argv[1])
    else:
        # Prefer the project-root copy maintained by sync_source_xlsx.py;
        # fall back to a sibling 'MetroAreas.xlsx' next to the project root
        # for legacy layouts.
        primary = site_dir / "MetroAreas.xlsx"
        legacy = site_dir.parent / "MetroAreas.xlsx"
        xlsx_path = primary if primary.exists() else legacy

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

    # Capture the freshness of the upstream companiesmarketcap.com xlsx so
    # the metro pages can render a "Source data as of {date}" line below the
    # Top Companies table. Falls back gracefully when the file is not found
    # (e.g. running ETL on a machine without the OneDrive sync).
    import datetime as _dt
    companies_src = find_companies_source()
    if companies_src is not None:
        mktcap_as_of = _dt.datetime.fromtimestamp(
            os.path.getmtime(str(companies_src))
        ).strftime('%Y-%m-%d')
        print(f"  companies source: {companies_src.name} (asOf {mktcap_as_of})")
    else:
        mktcap_as_of = None
        print("  companies source xlsx not found; skipping asOf stamp")

    print("Extracting football clubs...")
    football = extract_football(wb)
    print(f"  {sum(len(v) for v in football.values())} clubs")

    print("Extracting supertall structures...")
    towers = extract_towers(wb)
    print(f"  {sum(len(v) for v in towers.values())} supertalls across {len(towers)} metros")

    print("Extracting states/provinces...")
    states_list, metro_state_slugs = extract_states(wb, metros)
    print(f"  {len(states_list)} states; {len(metro_state_slugs)} metros resolved to state slug")

    wb.close()

    # Build a country-name -> slug lookup from public/data/countries.json so
    # every metro entry can carry a ready-to-use countrySlug field. Client
    # components on the homepage and elsewhere link metros to /countries/...
    # without a runtime lookup. Also captures subCountry slug for UK metros
    # so the constituent (England / Scotland / Wales / Northern Ireland)
    # link reads naturally rather than always pointing at /countries/united-kingdom.
    country_slug_by_name = {}
    countries_json_path = site_dir / "public" / "data" / "countries.json"
    if countries_json_path.exists():
        try:
            with open(countries_json_path, encoding='utf-8') as f:
                for c in json.load(f):
                    if c.get('name') and c.get('slug'):
                        country_slug_by_name[c['name']] = c['slug']
            print(f"  loaded {len(country_slug_by_name)} country slugs from countries.json")
        except Exception as e:
            print(f"  WARN: could not parse countries.json ({e}); countrySlug will be omitted")
    else:
        print("  WARN: countries.json not found; countrySlug will be omitted from metros.json")

    # Enrich every metro dict with resolved slug fields BEFORE both the
    # slim metros.json emission and the per-metro detail emission consume
    # them. This way detail.metro (used by app/rankings/[slug]/page.tsx)
    # and slim_metros (used by the homepage RankingsTable) both link to
    # /countries/[slug] and /states/[slug] without any runtime lookup.
    for m in metros:
        primary_cs = country_slug_by_name.get(m.get('country') or '')
        sub_cs = (
            country_slug_by_name.get(m.get('subCountry') or '')
            if m.get('subCountry')
            else None
        )
        if sub_cs:
            m['countrySlug'] = sub_cs
            if primary_cs and primary_cs != sub_cs:
                m['sovereignSlug'] = primary_cs
        elif primary_cs:
            m['countrySlug'] = primary_cs
        slugs = metro_state_slugs.get(m['name']) or {}
        if slugs.get('primary'):
            m['stateSlug'] = slugs['primary']
        if slugs.get('state2'):
            m['state2Slug'] = slugs['state2']
        if slugs.get('state3'):
            m['state3Slug'] = slugs['state3']
        if slugs.get('additional'):
            m['additionalStates'] = slugs['additional']

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
        # Country slugs (resolved on the master metros list above).
        if m.get('countrySlug'):
            entry['countrySlug'] = m['countrySlug']
        if m.get('sovereignSlug'):
            entry['sovereignSlug'] = m['sovereignSlug']
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
        # Resolved state slugs (from extract_states matching). Includes
        # the primary state plus state2 / state3 when each name resolves
        # against the States sheet. Both the homepage rankings table and
        # the country-page metro table read these directly so neither
        # client component has to redo the (country, name) lookup.
        # State slugs (resolved on the master metros list above).
        if m.get('stateSlug'):
            entry['stateSlug'] = m['stateSlug']
        if m.get('state2Slug'):
            entry['state2Slug'] = m['state2Slug']
        if m.get('state3Slug'):
            entry['state3Slug'] = m['state3Slug']
        if m.get('additionalStates'):
            entry['additionalStates'] = m['additionalStates']
        slim_metros.append(entry)

    with open(data_dir / "metros.json", 'w') as f:
        json.dump(slim_metros, f, separators=(',', ':'))
    size = os.path.getsize(data_dir / "metros.json")
    print(f"  metros.json: {size:,} bytes ({size/1024:.0f} KB)")

    # Write regions.json
    print("Writing regions.json...")
    with open(data_dir / "regions.json", 'w') as f:
        json.dump(regions, f, separators=(',', ':'))

    # Write states.json (every state row in the ISO sheet, with metro counts).
    print("Writing states.json...")
    with open(data_dir / "states.json", 'w') as f:
        json.dump(states_list, f, separators=(',', ':'))
    states_size = os.path.getsize(data_dir / "states.json")
    print(f"  states.json: {states_size:,} bytes ({states_size/1024:.0f} KB)")

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
            luxury, events, mktcap, football, towers,
            mktcap_as_of=mktcap_as_of,
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
    if mktcap_as_of:
        meta['companiesAsOf'] = mktcap_as_of
    with open(data_dir / "meta.json", 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print(f"  meta.json: lastUpdate={last_update}" + (f", companiesAsOf={mktcap_as_of}" if mktcap_as_of else ""))

    print("\nDone. Data files written to public/data/")
    print(f"  metros.json ({len(slim_metros)} metros)")
    print(f"  regions.json ({len(regions)} regions)")
    print(f"  details/ ({detail_count} files)")
    print(f"  meta.json (lastUpdate: {last_update})")
    # Regenerate quiz forward queue against the freshly written data.
    # Locked issues are preserved by generator idempotency. Forward slots
    # are recomputed. The CI guard validates non-strict; tier-band slips
    # emit warnings rather than failing the ETL.
    import subprocess
    print("\n--- quiz queue ---")
    try:
        subprocess.run(["python3", "scripts/generate_quiz_questions.py", "--days", "30"],
                       check=True)
        subprocess.run(["python3", "scripts/check_quiz_queue.py"], check=False)
    except Exception as e:
        print(f"  quiz queue regeneration failed: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
