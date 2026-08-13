#!/usr/bin/env python3
"""
build_heartbreak.py — the Heartbreak Index engine (model v3, frozen 2026-08-13).

Heartbreak = Longing x ConsolationDiscount + Sum(Wounds x Hope x Decay) + Grind
  Agony   = longing + wounds   (hope crushed)
  Despair = grind              (hopelessness)

House conventions:
  - Dry-run by default: prints the boards and a summary, writes nothing.
  - --write emits public/data/sports/heartbreak.json (or --out).
  - --self-test runs the pure decision-logic tests and exits.
  - --data-dir overrides the data root (default: public/data relative to repo root).

Rules encoded (see project memory heartbreak-index-scoping-2026-08-13):
  - Title reset: winning the honour wipes that honour's longing clock completely.
  - Abdication Rule: voluntary departure from the top level closes the aspiration
    (college: current FBS / D1 membership gates the college boards). Performance
    relegation is a WOUND and the clock keeps running.
  - tierGuide is NOT a weight. Tier weights are TIER_W below.
  - Consolation floor 0.5; wound decay 25y half-life floored at 0.25.
"""

import argparse, json, math, os, re, sys, collections

NOW = 2026

# ----------------------------------------------------------------------------
# Published parameters (mirror these on the methodology page)
# ----------------------------------------------------------------------------
TIER_W = {0: 3.0, 1: 2.0, 2: 1.0, 3: 0.6, 4: 0.3}

# Tracked football countries (roster; also used by the parade-drought gate)
FOOT_LEAGUE_TIER = {
    "England": 1, "Spain": 1, "Germany": 2, "Italy": 2,
    "France": 3, "Netherlands": 4, "Portugal": 4, "Scotland": 4,
}
# Heartbreak is priced in local currency (the Genoa/Schalke fix, same principle
# as the flat US weights): a scudetto drought hurts a Genoan like a title
# drought hurts a Sheffielder. League-quality tiers stay out of the misery math.
FOOT_HEARTBREAK_W = 2.0

US_LEAGUE_TIER = {"nfl": 0, "nba": 1, "mlb": 2, "nhl": 2}   # site taxonomy (iteration order only)
US_HEARTBREAK_W = 2.0   # heartbreak is priced in local currency: the four US majors weigh
                        # EQUALLY here — to each fanbase, their league is the league
HEARTLAND_MULT = 1.25   # the heartland bump (Canadian NHL) as a multiplier on the flat weight

# Relative wound weights (major final lost = 1.0), multiplied by the comp tier weight
REL = {
    "final_lost": 1.0,
    "relegation_top": 1.1,
    "playoff_final_lost": 0.9,
    "runner_up": 0.7,
    "fa_cup_final_lost": 0.6,
    "league_cup_final_lost": 0.35,
    "conf_final_exit": 0.4,
    "relegation_l2": 0.5,
    "relegation_scare": 0.12,   # survived within two places of the drop — the Everton anxiety
}

# European trophy weights: (longing tier weight if won-before, wound rel-weight, consolation weight)
EURO = {
    "champions-league":     {"longing_w": 3.0, "wound_rel": 1.0,  "consol": 0.30},
    "europa-league":        {"longing_w": 0.0, "wound_rel": 0.5,  "consol": 0.20},
    "cup-winners-cup":      {"longing_w": 0.0, "wound_rel": 0.5,  "consol": 0.15},
    "inter-cities-fairs-cup": {"longing_w": 0.0, "wound_rel": 0.4, "consol": 0.12},
    "conference-league":    {"longing_w": 0.0, "wound_rel": 0.25, "consol": 0.10},
}
# Euro wound tier context: continental finals weighted against tier-0 (UCL) / tier-3-4 rest.
EURO_TIER_W = {"champions-league": 3.0, "europa-league": 1.0, "cup-winners-cup": 1.0,
               "inter-cities-fairs-cup": 0.6, "conference-league": 0.6}

CUP_CONSOL = {"major": 0.25, "minor": 0.12}   # national cup / league-cup class, all 8 countries
INTL_CLUB_COMPS = {"Club World Cup", "Intercontinental Cup"}   # count as MAJOR; super cups never do
INTL_CONSOL = 0.15

# The champions ledger's league lineages reach further back than seasons.json
# (Bundesliga comp from 1903, Serie A from 1898). Backfill pre-league-era titles
# so Schalke's seven German championships and Genoa's nine scudetti exist.
LEAGUE_COMP_BY_COUNTRY = {
    "England": "Premier League", "Spain": "La Liga", "Germany": "Bundesliga",
    "Italy": "Serie A", "France": "Ligue 1", "Netherlands": "Eredivisie",
    "Portugal": "Primeira Liga", "Scotland": "Scottish Premiership",
}
CUP_WOUND_REL = {"major": 0.6, "minor": 0.35}  # cup final lost, by cup class ("super" cups ignored)
STATURE_MAX = 0.3             # US: agony scales up to +30% by franchise valuation percentile
CONF_APPEARANCE_SHARE = 0.25  # US: the third clock — years since the last DEEP RUN (conf final+)
LEAGUE_AS_CONSOL = 0.30       # a league title consoles OTHER honours' longing (e.g. UCL)

CONSOL_FLOOR = 0.5
DECAY_HALF_LIFE = 25.0
DECAY_FLOOR = 0.25
HEALED_FACTOR = 0.15          # a wound avenged by later winning the honour mostly stops aching
RELOC_DISCOUNT = 0.3          # pre-relocation history counts at 30% for the current market's fans
LIVING_MEMORY_YEARS = 60      # torture matures over a fan generation; longing ramps up to this
PEDIGREE_STEP = 0.9           # each EXTRA title within the pedigree window discounts longing
PEDIGREE_WINDOW = 40          # dynasty inoculation reaches 40y back, not 60 — mid-80s glory
                              # no longer numbs a 2026 Evertonian (the Everton fix)
ASPIRATION_HALF_LIFE = 40.0   # longing fades with years since the club last CONTENDED
ASPIRATION_FLOOR = 0.15       # faded aspiration never fully disappears
IN_THE_ROOM = 0.5             # being currently at the honour's level reawakens at least half the dream
AFTERGLOW_YEARS = 5           # winning your ULTIMATE honour suppresses agony, fading back over 5y
HEGEMON_TITLES_IN_15 = 3      # >=3 league titles in 15y: league wins are maintenance; ceiling = Europe
REALISM_FLOOR = 0.35          # modern-era realism floor on title/UCL longing
REALISM_WINDOW = 15           # seasons over which contention share defines realistic aspiration
EARLY_EXIT_REL = 0.12         # US: playoff run ending before the conference final (the Leafs tax)
LEVELS_SHARE = 0.5            # football: ultimate (title/UCL) longing rides at half weight on top of
                              # the MAJOR TROPHY drought, which is the headline clock (Ashwin ruling)
# --- v3.9 dials (Gemini round three, amended) ---
SERIAL_FINALS_MULT = 1.5      # concentrated trauma: >=3 final-class losses in a 10y window
SERIAL_WINDOW = 10
SERIAL_MIN = 3
DYNASTIC_MIN = 3              # dynastic insulation: >=3 ultimate honours in the 20y before the
DYNASTIC_LOOKBACK = 20        # drought halves the expectation/stature BONUS for its first 15y
DYNASTIC_INSULATION_YEARS = 15
DYNASTIC_DAMPER = 0.5
SECONDARY_CLOCK_CAP = 40      # numb acceptance: the SECONDARY clocks (appearance, deep run) cap
                              # at 40y — the title clock does NOT (the Leafs/Bills rulings stand)
# Drought context (Ashwin's Sabres principle): a wound hurts in proportion to how
# long the club had gone without winning when it landed. Juventus's lost finals
# amid the scudetto glut damp to 0.5x; the Bills' four Super Bowls, 26 years into
# a drought, amplify toward 1.25x.
CONTEXT_BASE = 0.5
CONTEXT_SPAN = 0.75
CONTEXT_HORIZON = 25.0
# The curated agony layer (Phase 3, live): named events hand-scored in PANGS.
# 1.00 pang = the 1996 Syracuse tournament run. Curated events do NOT decay —
# the curator prices the current ache directly. Points = pangs x PANG_POINTS.
PANG_POINTS = 3.0
# Contemporaneous-consensus compliance (site canon: no retroactive indexing).
# College basketball had no contemporaneously awarded national title before the
# 1939 NCAA tournament — pre-1939 rows (Helms-era retro-selections) never start
# a drought clock. Football keeps its full range: contemporaneous claims existed.
CBB_TOURNAMENT_ERA = 1939
MAJOR_RAMP_YEARS = 25         # a TROPHY drought matures fast — full agony after a generation of
                              # season tickets, unlike the 60y horizon for ultimate-honour longing
EXPECTATION_FLOOR = 0.5       # football: heartbreak needs a big fanbase to break — clubs that
EXPECTATION_RANGE = 0.9       # never expected to win scale to 0.5x; big cabinets up to 1.4x
EXPECTATION_CAP = 20          # honours count at which the expectation factor maxes out
APPEARANCE_SHARE = 0.5        # US: longing for a FINALS APPEARANCE runs at half title-longing weight

# Heartbreak is priced in local currency: leagues weigh one tier heavier in their
# heartland, where the code is the national obsession (explicit ledger, auditable).
HEARTLAND_METROS = {
    "nhl": {"Toronto", "Montreal", "Ottawa", "Vancouver", "Calgary", "Edmonton",
            "Winnipeg", "Quebec City", "Quebec"},
}

# Same-market label changes (renames, temporary labels, in-metro shuffles) — NOT moves.
# A relocation is a change of MARKET between consecutive season-city labels.
MARKET_ALIAS = {
    "Arizona": "Phoenix", "Tempe": "Phoenix", "Glendale": "Phoenix",
    "New England": "Boston", "Foxborough": "Boston",
    "Golden State": "San Francisco Bay", "Oakland": "San Francisco Bay",
    "San Francisco": "San Francisco Bay",
    "Texas": "Dallas",
    "Capital": "Washington", "Landover": "Washington",
    # Ashwin's ruling 2026-08-13: San Diego and Los Angeles are one general area for
    # franchise-era purposes (relocation ledger ONLY — the site's metro taxonomy is untouched)
    "Los Angeles": "Southern California", "San Diego": "Southern California",
    "California": "Southern California", "Anaheim": "Southern California",
    "Inglewood": "Southern California",
    "Florida": "Miami",
    "Minnesota": "Minneapolis",
    "KC/Omaha": "Kansas City",
    "NO/Oklahoma City": "New Orleans",   # Katrina interim, treated as New Orleans
    "New Jersey": "New York", "Brooklyn": "New York",
    "Pittsburg": "Pittsburgh",
    "Alberta": "Edmonton",
    "Utah": "Salt Lake City",
    "Tennessee": "Nashville",
    "Carolina": "Raleigh",
    "Colorado": "Denver",
}
HOPE_MAX_BONUS = 0.5          # hope = 1 + HOPE_MAX_BONUS * competitiveness(0..1)
HABIT_WINDOW = 15             # yo-yo habituation window (years)
PROMO_REFUND = 0.4            # refund share if promoted back within 2 seasons
GRIND_SHARE = 1.0 / 3.0       # grind weight relative to longing weight
LOSING_STREAK_W = 0.05        # per consecutive losing season, x tier weight

# ----------------------------------------------------------------------------
# Pure decision logic (covered by --self-test)
# ----------------------------------------------------------------------------

def decay(age_years: float) -> float:
    """25-year half-life, floored so old wounds never vanish."""
    return max(DECAY_FLOOR, 0.5 ** (age_years / DECAY_HALF_LIFE))


def habituation(prior_recent_relegations: int) -> float:
    """k-th relegation inside the window scales by 1/sqrt(k). k = prior + this one."""
    k = prior_recent_relegations + 1
    return 1.0 / math.sqrt(k)


def consolation_discount(consolations, drought_start_year, now=NOW):
    """consolations: [(weight, year)] won since the drought began.
    Multiplicative, recency-weighted, floored at CONSOL_FLOOR."""
    d = 1.0
    for w, y in consolations:
        if y <= drought_start_year:
            continue
        d *= (1.0 - w * decay(now - y))
    return max(CONSOL_FLOOR, d)


def hope_multiplier(competitive_share: float) -> float:
    """competitive_share in [0,1]: fraction of the prior 10 seasons spent competitive."""
    return 1.0 + HOPE_MAX_BONUS * max(0.0, min(1.0, competitive_share))


def longing_points(tier_w: float, years: float) -> float:
    return tier_w * math.sqrt(max(0.0, years))


def memory_ramp(years: float, horizon: float = LIVING_MEMORY_YEARS) -> float:
    """Torture matures over a fan generation: a 30-year drought is not yet half
    of a 60-year drought in lived experience. Trophy droughts use a shorter horizon."""
    return min(1.0, max(0.0, years) / horizon)


def expectation_factor(n_majors: int) -> float:
    """Big clubs ache more, small clubs ache less: the Everton/Hamilton rule.
    The trophy cabinet scales agony from 0.5x (never expected to win anything)
    to 1.4x (a big club's drought is a heavier failure)."""
    return EXPECTATION_FLOOR + EXPECTATION_RANGE * min(1.0, n_majors / EXPECTATION_CAP)


def pedigree_factor(win_years, now=NOW) -> float:
    """Dynasty inoculation: each EXTRA title within PEDIGREE_WINDOW (beyond the
    one that starts the drought) discounts longing by PEDIGREE_STEP."""
    n = sum(1 for y in win_years if now - y <= PEDIGREE_WINDOW)
    return PEDIGREE_STEP ** max(0, n - 1)


def afterglow(last_ultimate_year, now=NOW) -> float:
    """A club that just won its ULTIMATE honour is celebrating, not suffering.
    Agony is suppressed and fades back linearly over AFTERGLOW_YEARS."""
    if last_ultimate_year is None:
        return 1.0
    return min(1.0, max(0.0, (now - last_ultimate_year) / AFTERGLOW_YEARS))


def is_hegemon(l1_titles, now=NOW) -> bool:
    """Serial domestic champions (Benfica, Celtic): league titles are maintenance,
    so their ceiling — and their afterglow trigger — is the European one."""
    return sum(1 for y in l1_titles if now - y <= REALISM_WINDOW) >= HEGEMON_TITLES_IN_15


def realism(contention_share: float) -> float:
    """Levels of misery: clubs that know they cannot win the title in the modern
    era long for it less. Scaled by recent contention share, floored."""
    return max(REALISM_FLOOR, math.sqrt(max(0.0, min(1.0, contention_share))))


def aspiration_fade(last_contention_year, at_level: bool, now=NOW) -> float:
    """The Preston/Huddersfield rule (performance-drift cousin of the Abdication
    Rule): longing fades with years since the club last contended. Being at the
    honour's level right now reawakens at least IN_THE_ROOM of the dream.
    Contention = top-half top-flight finish or winning a trophy."""
    if last_contention_year is None:
        fade = ASPIRATION_FLOOR
    else:
        fade = max(ASPIRATION_FLOOR, 0.5 ** ((now - last_contention_year) / ASPIRATION_HALF_LIFE))
    return max(fade, IN_THE_ROOM) if at_level else fade


def promotion_refund(relegation_year, promoted_years) -> float:
    """Return the wound multiplier after any bounce-back refund."""
    for py in promoted_years:
        if relegation_year < py <= relegation_year + 2:
            return 1.0 - PROMO_REFUND
    return 1.0


def college_active(program_memberships, code) -> bool:
    """Abdication Rule gate. code is 'FBS' or 'D1'."""
    return code in program_memberships


def heal_factor(wound_year, heal_years) -> float:
    """A wound is healed (mostly stops aching) if the corresponding honour was
    won at any point AFTER the wound. The mirror of the title-reset rule."""
    return HEALED_FACTOR if any(hy > wound_year for hy in heal_years) else 1.0


def market(city) -> str:
    return MARKET_ALIAS.get(str(city or ""), str(city or ""))


def era_start(city_year_pairs) -> int:
    """First year of the franchise's CURRENT market. Input: [(city, year)] ascending.
    Renames and in-metro shuffles (MARKET_ALIAS) do not start a new era."""
    if not city_year_pairs:
        return 0
    cur = market(city_year_pairs[-1][0])
    start = city_year_pairs[0][1]
    for c, y in city_year_pairs:
        if market(c) != cur:
            start = None
        elif start is None:
            start = y
    return start if start is not None else city_year_pairs[-1][1]


def effective_drought_years(title_year, move_year, now=NOW) -> float:
    """Relocation discount on longing: years suffered before the current market's
    era count at RELOC_DISCOUNT. A title won in the current era is undiscounted."""
    if title_year >= move_year:
        return now - title_year
    return (move_year - title_year) * RELOC_DISCOUNT + (now - move_year)


def reloc_factor(event_year, move_year) -> float:
    """Wounds inflicted before the current market's era count at RELOC_DISCOUNT."""
    return RELOC_DISCOUNT if event_year < move_year else 1.0


def norm(x: str) -> str:
    return re.sub(r"\s*\(.*?\)", "", str(x or "")).strip().lower()


def self_test():
    eps = 1e-9
    # decay: half at 25y, floor at 0.25 (reached at 50y)
    assert abs(decay(0) - 1.0) < eps
    assert abs(decay(25) - 0.5) < eps
    assert abs(decay(100) - DECAY_FLOOR) < eps
    # habituation: 1st = 1.0, 4th = 0.5
    assert abs(habituation(0) - 1.0) < eps
    assert abs(habituation(3) - 0.5) < eps
    # consolation: Newcastle-shaped case — a minor cup in 2025 against a 1927 drought
    d = consolation_discount([(CUP_CONSOL["minor"], 2025)], 1927)
    assert 0.85 < d < 1.0, d
    # floor engages under many big consolations
    d2 = consolation_discount([(0.3, NOW - 1)] * 10, 1900)
    assert abs(d2 - CONSOL_FLOOR) < eps
    # consolations BEFORE the drought started do not count (title reset)
    d3 = consolation_discount([(0.3, 1950)], 1960)
    assert abs(d3 - 1.0) < eps
    # hope: bounded
    assert abs(hope_multiplier(0.0) - 1.0) < eps
    assert abs(hope_multiplier(1.0) - 1.5) < eps
    assert abs(hope_multiplier(5.0) - 1.5) < eps
    # promotion refund: bounce in 2 -> 0.6, in 3 -> 1.0
    assert abs(promotion_refund(2000, [2002]) - (1 - PROMO_REFUND)) < eps
    assert abs(promotion_refund(2000, [2003]) - 1.0) < eps
    # healing: avenged wounds mostly stop aching; earlier wins do not heal
    assert abs(heal_factor(2011, [2013]) - HEALED_FACTOR) < eps
    assert abs(heal_factor(2011, [2008]) - 1.0) < eps
    # relocation: Cardinals-shaped case — Chicago 1920 / St. Louis 1960 / Phoenix 1988 / Arizona 1994
    seq = [("Chicago", 1920), ("St. Louis", 1960), ("Phoenix", 1988), ("Arizona", 1994)]
    assert era_start(seq) == 1988          # Arizona is a rename, not a move
    assert era_start([("New Jersey", 1968), ("New York", 1969), ("Brooklyn", 2013)]) == 1968  # all one metro
    assert era_start([("Green Bay", 1921)]) == 1921
    # Chargers ruling: San Diego and LA are one Southern California market — no move
    assert era_start([("Los Angeles", 1960), ("San Diego", 1961), ("Los Angeles", 2017)]) == 1960
    # living memory: half-matured at 30y, full at 60y+
    assert abs(memory_ramp(30) - 0.5) < eps
    assert abs(memory_ramp(90) - 1.0) < eps
    # pedigree: only glory within 40y inoculates — the 49ers' late run still counts,
    # Everton's mid-80s era no longer does
    assert abs(pedigree_factor([1981, 1984, 1988, 1989, 1994], now=2026) - PEDIGREE_STEP ** 2) < eps
    assert abs(pedigree_factor([1984, 1985, 1987, 1995], now=2026) - PEDIGREE_STEP) < eps
    assert abs(pedigree_factor([1889, 1890], now=2026) - 1.0) < eps
    # aspiration fade: Preston-shaped (last contended ~1958, not in top flight) fades hard;
    # a current top-flight club keeps at least half the dream; recent contenders keep it all
    assert aspiration_fade(1958, at_level=False, now=2026) < 0.35
    assert abs(aspiration_fade(1958, at_level=True, now=2026) - IN_THE_ROOM) < eps
    assert abs(aspiration_fade(2024, at_level=True, now=2026) - 0.5 ** (2 / ASPIRATION_HALF_LIFE)) < eps
    assert abs(aspiration_fade(None, at_level=False, now=2026) - ASPIRATION_FLOOR) < eps
    # afterglow: Arsenal-shaped — an ultimate win this year zeroes agony, fading back over 5y
    assert abs(afterglow(2026) - 0.0) < eps
    assert abs(afterglow(2023) - 0.6) < eps
    assert abs(afterglow(1965) - 1.0) < eps
    assert abs(afterglow(None) - 1.0) < eps
    # hegemon: Benfica-shaped serial champions' ceiling is Europe, not the league
    assert is_hegemon([2016, 2017, 2019, 2023], now=2026)
    assert not is_hegemon([2026], now=2026)
    # realism: levels of misery — non-contenders long for the title at the floor
    assert abs(realism(0.0) - REALISM_FLOOR) < eps
    assert abs(realism(1.0) - 1.0) < eps
    # stature: Cowboys-shaped — the league's most valuable franchise carries +30%
    assert abs(stature_factor(13000.0, [13000.0, 8000.0, 5000.0]) - (1 + STATURE_MAX)) < eps
    assert abs(stature_factor(None, [1.0, 2.0]) - 1.0) < eps
    # expectation: big cabinets amplify, empty cabinets damp (Everton vs Hamilton)
    assert abs(expectation_factor(0) - EXPECTATION_FLOOR) < eps
    assert abs(expectation_factor(EXPECTATION_CAP * 2) - (EXPECTATION_FLOOR + EXPECTATION_RANGE)) < eps
    assert expectation_factor(EXPECTATION_CAP) > 1.0
    # drought context: wounds amid plenty damp toward 0.5x; deep-drought wounds amplify to 1.25x
    assert drought_context(2015, [2012, 2013, 2014], 1897) < 0.55
    assert abs(drought_context(1991, [1965], 1960) - (CONTEXT_BASE + CONTEXT_SPAN)) < eps
    assert abs(drought_context(2011, [], 1970) - (CONTEXT_BASE + CONTEXT_SPAN)) < eps
    # v3.9: serial finals (Bills-shaped: 1991-94), dynastic insulation (United-shaped)
    assert abs(serial_factor(1993, [1991, 1992, 1993, 1994]) - SERIAL_FINALS_MULT) < eps
    assert abs(serial_factor(1994, [1965, 1994]) - 1.0) < eps
    assert insulated([1999, 2003, 2008, 2009, 2011, 2013], now=2026)      # 13y drought, dynasty before
    assert not insulated([1955], now=2026)                                 # old lone title
    assert not insulated([1999, 2003, 2008, 2009, 2011, 2013], now=2030)  # insulation expires
    assert abs(damp_bonus(1.4, True) - 1.2) < eps
    # major-trophy droughts mature over 25 years, not 60
    assert abs(memory_ramp(25, MAJOR_RAMP_YEARS) - 1.0) < eps
    assert abs(memory_ramp(30) - 0.5) < eps
    # 1947 title, 1988 move: 41 pre-move years count at 30% + 38 full years
    assert abs(effective_drought_years(1947, 1988) - (41 * RELOC_DISCOUNT + 38)) < eps
    assert abs(effective_drought_years(2000, 1988) - (NOW - 2000)) < eps
    assert abs(reloc_factor(1948, 1988) - RELOC_DISCOUNT) < eps
    assert abs(reloc_factor(2008, 1988) - 1.0) < eps
    # abdication: Yale football out, Yale basketball in
    assert not college_active({"D1"}, "FBS")
    assert college_active({"D1"}, "D1")
    # title reset: longing measured from last title only
    assert longing_points(2.0, NOW - 2016) < longing_points(2.0, NOW - 1927)
    # Rule 27: closed leagues take no cabinet haircut — one-title St Kilda and
    # sixteen-title Carlton face the same expectation, exactly 1.0
    toy = dict(slug="t", name="T", sport="AFL", country="AU", titles=[1966],
               first=1900, gf_years=[1966, 1971], loss_events=[(1971, 1.0)],
               contention_years=[2020], exit_years=[])
    assert _gfl_record(**toy, closed=True)["expectation"] == 1.0
    assert _gfl_record(**toy)["expectation"] < 1.0
    # Rule 28: a program with zero recent title contention gets the realism
    # floor on its clocks; a perennial contender gets the full clock
    cold = _gfl_record(**toy, title_contention_years=[])
    hot = _gfl_record(**toy, title_contention_years=list(range(NOW - 14, NOW + 1)))
    assert cold["realism"] == REALISM_FLOOR and hot["realism"] == 1.0
    assert cold["agony"] < hot["agony"]
    # last_won surfaces for the page's Waiting-since column
    assert _gfl_record(**toy)["last_won"] == 1966
    print("self-test OK")


# ----------------------------------------------------------------------------
# Data loading
# ----------------------------------------------------------------------------

def load(data_dir, rel):
    with open(os.path.join(data_dir, rel), encoding="utf-8") as f:
        return json.load(f)


def played(row):
    games = sum(row.get(k) or 0 for k in ("w", "d", "l", "t"))
    return games > 0 and (row.get("year") or 0) <= NOW


# ----------------------------------------------------------------------------
# Football (club) scoring
# ----------------------------------------------------------------------------

def score_football(data_dir):
    seasons = load(data_dir, "football/seasons.json")
    # Domestic cups for ALL EIGHT countries (Copa del Rey, DFB-Pokal, Coppa Italia...):
    # kind "major" = the national cup, "minor" = league-cup class, "super" = ignored.
    cups = load(data_dir, "football/cups.json")
    euro = load(data_dir, "football/european-tournaments.json")
    # International club trophies (major, per Ashwin's definition) from the ledger
    ch = load(data_dir, "champions-history.json")
    intl_wins = collections.defaultdict(list)    # norm(club name) -> [years]
    for r in ch:
        if r.get("competition") in INTL_CLUB_COMPS and (r.get("year") or 9999) <= NOW:
            intl_wins[norm(str(r.get("canonical") or ""))].append(r["year"])
    # Ledger backfill of league titles (the Schalke/Genoa fix)
    ledger_titles = collections.defaultdict(list)   # (country, norm(name)) -> [years]
    comp_by_country = {v: k for k, v in LEAGUE_COMP_BY_COUNTRY.items()}
    for r in ch:
        ctry = comp_by_country.get(r.get("competition"))
        if ctry and (r.get("year") or 9999) <= NOW:
            ledger_titles[(ctry, norm(str(r.get("canonical") or "")))].append(r["year"])

    euro_wins = collections.defaultdict(list)    # slug -> [(comp_slug, year)]
    euro_losses = collections.defaultdict(list)
    for comp_slug, cfg in EURO.items():
        comp = euro.get(comp_slug)
        if not comp:
            continue
        for e in comp.get("champions", []):
            if e.get("year") and e["year"] <= NOW:
                euro_wins[e["slug"]].append((comp_slug, e["year"]))
        for e in comp.get("finalists", []):
            if e.get("year") and e["year"] <= NOW:
                euro_losses[e["slug"]].append((comp_slug, e["year"]))

    # League size per (country, level, year) — needed to spot relegation scares
    league_size = {}
    for rows_ in seasons.values():
        for r in rows_:
            if played(r):
                k = (r.get("country"), r.get("level"), r["year"])
                p = r.get("place") or 0
                if p > league_size.get(k, 0):
                    league_size[k] = p

    out = []
    for slug, rows in seasons.items():
        rows = [r for r in rows if played(r)]
        if not rows:
            continue
        country = rows[0].get("country")
        if country not in FOOT_LEAGUE_TIER:
            continue
        w_top = FOOT_HEARTBREAK_W
        name = rows[0].get("cur_name") or slug
        by_year = {r["year"]: r for r in rows}
        years = sorted(by_year)
        l1_titles = sorted(set(r["year"] for r in rows if r.get("champion") and r.get("level") == 1)
                           | set(ledger_titles.get((country, norm(name)), [])))
        l1_years = sorted(r["year"] for r in rows if r.get("level") == 1)
        promoted_years = sorted(r["year"] for r in rows if r.get("promoted"))

        # competitiveness per year (for hope): level 1 and top-8 finish
        comp_years = set(r["year"] for r in rows if r.get("level") == 1 and (r.get("place") or 99) <= 8)

        def competitive_share(year):
            window = [y for y in range(year - 10, year) if y in by_year]
            if not window:
                return 0.0
            return sum(1 for y in window if y in comp_years) / len(window)

        cup_wins = collections.defaultdict(list)     # kind ("major"/"minor") -> [years]
        cup_losses = collections.defaultdict(list)
        for e in cups.get(slug, []):
            k = e.get("kind")
            if k not in CUP_CONSOL or (e.get("year") or 9999) > NOW:
                continue
            (cup_wins if e.get("result") == "won" else cup_losses)[k].append(e["year"])
        euro_win_years = collections.defaultdict(list)
        for cs, y in euro_wins.get(slug, []):
            euro_win_years[cs].append(y)

        # Major-trophy win list (needed for both the drought-context on wounds and
        # the headline clock): league, both domestic cup classes, Euro, international.
        major_wins = sorted(l1_titles
                            + cup_wins.get("major", [])
                            + cup_wins.get("minor", [])
                            + [y for _, y in euro_wins.get(slug, [])]
                            + intl_wins.get(norm(name), []))

        wounds = []

        def add_wound(kind, year, tier_w, rel_w, heal_years, hope=None, factor=1.0):
            h = hope if hope is not None else hope_multiplier(competitive_share(year))
            ctx = drought_context(year, major_wins, years[0])
            pts = tier_w * rel_w * h * ctx * decay(NOW - year) * factor * heal_factor(year, heal_years)
            wounds.append({"kind": kind, "year": year, "points": round(pts, 3)})

        # Relegations (performance = wound; clock keeps running; healed by a later league title)
        rel_top = sorted(r["year"] for r in rows if r.get("relegated") and r.get("level") == 1)
        for y in rel_top:
            prior = sum(1 for z in rel_top if 0 < y - z <= HABIT_WINDOW)
            add_wound("relegation_top", y, w_top, REL["relegation_top"], l1_titles, hope=1.0,
                      factor=habituation(prior) * promotion_refund(y, promoted_years))
        rel_l2 = sorted(r["year"] for r in rows if r.get("relegated") and r.get("level") == 2)
        for y in rel_l2:
            add_wound("relegation_l2", y, w_top, REL["relegation_l2"], promoted_years, hope=1.0)

        # Championship playoff final lost (healed by a later promotion)
        for r in rows:
            if r.get("playoff_final") and not r.get("promoted") and r.get("level") == 2:
                add_wound("playoff_final_lost", r["year"], w_top, REL["playoff_final_lost"],
                          promoted_years, hope=1.0)

        # League runner-up seasons (healed by a later league title)
        for r in rows:
            if r.get("level") == 1 and r.get("place") == 2:
                add_wound("runner_up", r["year"], w_top, REL["runner_up"], l1_titles)

        # Relegation scares (the Everton anxiety): survived a top-flight season within
        # two places of the drop. Famine context amplifies; a later trophy heals.
        for r in rows:
            if r.get("level") == 1 and not r.get("relegated"):
                size = league_size.get((country, 1, r["year"]))
                p = r.get("place")
                if size and p and size >= 10 and (size - 5) <= p <= (size - 3):
                    add_wound("relegation_scare", r["year"], w_top, REL["relegation_scare"],
                              major_wins, hope=1.0)

        # Domestic cup finals lost (all 8 countries; healed by a later win of the same cup class)
        for k, loss_years in cup_losses.items():
            for y in loss_years:
                add_wound(f"{k}_cup_final_lost", y, w_top, CUP_WOUND_REL[k], cup_wins.get(k, []))

        # European finals lost (healed by a later win of the same competition)
        for comp_slug, y in euro_losses.get(slug, []):
            add_wound(f"{comp_slug}_final_lost", y, EURO_TIER_W[comp_slug],
                      EURO[comp_slug]["wound_rel"], euro_win_years.get(comp_slug, []))

        # Longing (title reset: each honour measured from its LAST win only).
        # Unified consolation pool: every trophy discounts every OTHER honour's longing.
        trophy_pool = []   # (kind, weight, year)
        for c, ys in cup_wins.items():
            if c in CUP_CONSOL:
                trophy_pool += [("cup:" + c, CUP_CONSOL[c], y) for y in ys]
        for cs, ys in euro_win_years.items():
            trophy_pool += [("euro:" + cs, EURO[cs]["consol"], y) for y in ys]
        trophy_pool += [("league", LEAGUE_AS_CONSOL, y) for y in l1_titles]
        trophy_pool += [("intl", INTL_CONSOL, y) for y in intl_wins.get(norm(name), [])]

        def discount_for(honour_kind, since):
            pool = [(w, y) for k, w, y in trophy_pool if k != honour_kind]
            return consolation_discount(pool, since)

        # Aspiration fade (the Preston/Huddersfield rule): contention = top-half
        # top-flight finish or any trophy; being in the top flight now reawakens.
        cur_level_now = by_year[years[-1]].get("level")
        contention_years = [r["year"] for r in rows if r.get("level") == 1 and (r.get("place") or 99) <= 10]
        contention_years += [y for _, _, y in trophy_pool]
        last_contention = max(contention_years) if contention_years else None
        fade = aspiration_fade(last_contention, at_level=(cur_level_now == 1))

        # Modern-era realism: contention shares over the last REALISM_WINDOW seasons
        recent = [r for r in rows if NOW - REALISM_WINDOW < r["year"] <= NOW]
        top6_share = sum(1 for r in recent if r.get("level") == 1 and (r.get("place") or 99) <= 6) / REALISM_WINDOW
        top4_share = sum(1 for r in recent if r.get("level") == 1 and (r.get("place") or 99) <= 4) / REALISM_WINDOW

        longing = []
        # HEADLINE CLOCK (Ashwin's definition; major_wins built above the wounds)
        if major_wins:
            start = major_wins[-1]
            mat = memory_ramp(NOW - start, MAJOR_RAMP_YEARS) * pedigree_factor(major_wins) * fade
            pts = longing_points(w_top, NOW - start) * mat
            longing.append({"honour": "major trophy", "since": start,
                            "maturity": round(mat, 3), "fade": round(fade, 3),
                            "points": round(pts, 3)})
        else:
            # Never won anything: the drought starts at birth, not at the first title
            first = years[0]
            if NOW > first:
                mat = memory_ramp(NOW - first, MAJOR_RAMP_YEARS) * fade
                pts = longing_points(w_top, NOW - first) * mat
                longing.append({"honour": "first major trophy", "since": first,
                                "maturity": round(mat, 3), "fade": round(fade, 3),
                                "points": round(pts, 3)})
        # Finals-appearance clock (the Everton fix — football's version of "haven't
        # even sniffed a final"): years since the club last REACHED a major final
        final_apps = sorted(major_wins
                            + [y for ys in cup_losses.values() for y in ys]
                            + [y for _, y in euro_losses.get(slug, [])])
        if final_apps:
            start = final_apps[-1]
            mat = memory_ramp(NOW - start, MAJOR_RAMP_YEARS) * fade
            pts = longing_points(w_top, NOW - start) * APPEARANCE_SHARE * mat
            if pts > 0.05:
                longing.append({"honour": "major final appearance", "since": start,
                                "maturity": round(mat, 3), "fade": round(fade, 3),
                                "points": round(pts, 3)})
        # THE LEVELS: ultimate honours ride on top at LEVELS_SHARE, scaled by realism.
        if l1_titles:
            start = l1_titles[-1]
            disc = discount_for("league", start)
            rl = realism(top6_share)
            mat = memory_ramp(NOW - start) * pedigree_factor(l1_titles) * fade * rl * LEVELS_SHARE
            pts = longing_points(w_top, NOW - start) * mat * disc
            longing.append({"honour": "league", "since": start, "discount": round(disc, 3),
                            "maturity": round(mat, 3), "fade": round(fade, 3),
                            "realism": round(rl, 3), "points": round(pts, 3)})
        ucl_wins = sorted(y for cs, y in euro_wins.get(slug, []) if cs == "champions-league")
        if ucl_wins:
            start = ucl_wins[-1]
            disc = discount_for("euro:champions-league", start)
            rl = realism(top4_share)
            mat = memory_ramp(NOW - start) * pedigree_factor(ucl_wins) * fade * rl * LEVELS_SHARE
            pts = longing_points(EURO["champions-league"]["longing_w"], NOW - start) * mat * disc
            longing.append({"honour": "champions-league", "since": start, "discount": round(disc, 3),
                            "maturity": round(mat, 3), "fade": round(fade, 3),
                            "realism": round(rl, 3), "points": round(pts, 3)})

        # AFTERGLOW: a recent ULTIMATE win means the fanbase is celebrating.
        # Hegemons' league titles are maintenance; their ultimate is the European Cup.
        ult_wins = ucl_wins + ([] if is_hegemon(l1_titles) else l1_titles)
        glow = afterglow(max(ult_wins) if ult_wins else None)

        # Grind: current top-flight exile (only for clubs that have BEEN in the top flight)
        grind = 0.0
        cur_level = by_year[years[-1]].get("level")
        if l1_years and cur_level and cur_level > 1:
            grind = w_top * GRIND_SHARE * math.sqrt(NOW - l1_years[-1])

        # Concentrated trauma (v3.9): serial final-class losses in a tight window scale up
        FINAL_CLASS = {"runner_up", "major_cup_final_lost", "minor_cup_final_lost"}
        final_years = sorted(w_["year"] for w_ in wounds
                             if w_["kind"] in FINAL_CLASS or w_["kind"].endswith("_final_lost"))
        for w_ in wounds:
            if w_["kind"] in FINAL_CLASS or w_["kind"].endswith("_final_lost"):
                w_["points"] = round(w_["points"] * serial_gated(w_["year"], final_years,
                                                                major_wins, years[0]), 3)

        longing.sort(key=lambda l: -l["points"])
        expectation = damp_bonus(expectation_factor(len(major_wins)),
                                 insulated(l1_titles + ucl_wins))
        agony = (sum(l["points"] for l in longing) + sum(w["points"] for w in wounds)) * glow * expectation
        out.append({
            "slug": slug, "name": name, "sport": "Football", "country": country,
            "group": "football",
            "agony": round(agony, 2), "despair": round(grind, 2),
            "total": round(agony + grind, 2),
            "afterglow": round(glow, 3), "expectation": round(expectation, 3),
            "last_won": major_wins[-1] if major_wins else None,
            "longing": longing,
            "wounds": sorted(wounds, key=lambda w: -w["points"])[:12],
            "wound_count": len(wounds),
            "current_level": cur_level,
        })
    return out


# ----------------------------------------------------------------------------
# US majors scoring
# ----------------------------------------------------------------------------

def drought_context(year, win_years, birth_year) -> float:
    """How starved was the fanbase when this wound landed? 0.5x amid plenty,
    up to 1.25x deep into a drought (or a whole never-winning existence)."""
    prior = [y for y in win_years if y < year]
    since = prior[-1] if prior else birth_year
    d = max(0, year - since)
    return CONTEXT_BASE + CONTEXT_SPAN * min(1.0, d / CONTEXT_HORIZON)


def serial_factor(year, final_loss_years) -> float:
    """Concentrated trauma: a final lost as part of >=SERIAL_MIN final-class
    losses within SERIAL_WINDOW years scales by SERIAL_FINALS_MULT."""
    n = sum(1 for y in final_loss_years if year - SERIAL_WINDOW < y <= year or year <= y < year + SERIAL_WINDOW)
    return SERIAL_FINALS_MULT if n >= SERIAL_MIN else 1.0


def serial_gated(year, final_loss_years, win_years, birth_year) -> float:
    """The Dortmund correction: trauma only compounds in FAMINE. Serial losses
    suffered while regularly winning things are frustration, not compounding
    trauma — the serial multiplier scales with drought context at the time."""
    base = serial_factor(year, final_loss_years)
    if base <= 1.0:
        return 1.0
    famine = (drought_context(year, win_years, birth_year) - CONTEXT_BASE) / CONTEXT_SPAN
    return 1.0 + (base - 1.0) * max(0.0, min(1.0, famine))


def insulated(ultimate_wins, now=NOW) -> bool:
    """Dynastic insulation: a fanbase with >=3 ultimate honours in the 20 years
    before its current drought is still spending the muscle memory."""
    if not ultimate_wins:
        return False
    u = max(ultimate_wins)
    wins_before = sum(1 for y in ultimate_wins if u - DYNASTIC_LOOKBACK < y <= u)
    return wins_before >= DYNASTIC_MIN and (now - u) <= DYNASTIC_INSULATION_YEARS


def damp_bonus(mult, is_insulated) -> float:
    """Halve the BONUS portion of an amplifier (expectation/stature) under insulation."""
    return 1.0 + (mult - 1.0) * (DYNASTIC_DAMPER if is_insulated else 1.0)


def stature_factor(value, league_values) -> float:
    """Preeminence carries more hearts: agony scales by valuation percentile
    within the league, up to +STATURE_MAX. Unknown valuation -> neutral 1.0."""
    if value is None or not league_values:
        return 1.0
    pct = sum(1 for v in league_values if v <= value) / len(league_values)
    return 1.0 + STATURE_MAX * pct


def score_us(data_dir):
    out = []
    never = []
    vals = load(data_dir, "valuations/valuations.json")["rows"]
    val_by = collections.defaultdict(dict)   # league -> name(lower) -> value
    for r in vals:
        if r.get("league") in ("NFL", "NBA", "MLB", "NHL") and r.get("value_m"):
            val_by[r["league"]][str(r.get("team", "")).lower()] = float(r["value_m"])
    for lg, tier in US_LEAGUE_TIER.items():
        data = load(data_dir, f"{lg}/seasons-by-team.json")
        # League-year top-quartile win% thresholds: hope requires QUALITY, not a mere berth
        p75 = {}
        _by_yr = collections.defaultdict(list)
        for rows_ in data.values():
            for r in rows_:
                if (r.get("year") or 9999) <= NOW and r.get("win_pct") is not None:
                    _by_yr[r["year"]].append(r["win_pct"])
        for y, vals in _by_yr.items():
            vals = sorted(vals)
            p75[y] = vals[int(0.75 * (len(vals) - 1))]
        for slug, rows in data.items():
            rows = [r for r in rows if r.get("year", 0) <= NOW]
            if not rows:
                continue
            yrs = sorted(r["year"] for r in rows)
            if yrs[-1] < NOW - 1:      # defunct franchise
                continue
            by_year = {r["year"]: r for r in rows}
            name = f"{rows[-1].get('city','')} {rows[-1].get('team','')}".strip() or slug
            po_years = set(r["year"] for r in rows if r.get("playoff"))
            # Hope requires quality (v3.9): top-quartile finish, a division title, or a
            # deep run — an 8-seed's early exit is irrelevance, not hope
            hope_years = set()
            for r in rows:
                y = r.get("year")
                if not y or y > NOW:
                    continue
                deep = (r.get("sf_cf_app") if lg == "nhl"
                        else (r.get("lcs_app") or r.get("conf_final")) if lg == "mlb"
                        else r.get("conf_final"))
                wp = r.get("win_pct")
                if (r.get("div_title") or r.get("champ") or r.get("champ_app") or deep
                        or (wp is not None and y in p75 and wp >= p75[y])):
                    hope_years.add(y)
            # Heartbreak in local currency: the four majors weigh equally; heartland bumps
            home = rows[-1].get("metro") or rows[-1].get("city")
            heartland = home in HEARTLAND_METROS.get(lg, set())
            w = US_HEARTBREAK_W * (HEARTLAND_MULT if heartland else 1.0)
            # Relocation ledger: NHL rows carry metro; others use city + MARKET_ALIAS
            seq = []
            for r in sorted(rows, key=lambda r: r["year"]):
                c = r.get("metro") or r.get("city")
                if not seq or seq[-1][0] != c:
                    seq.append((c, r["year"]))
            move_year = era_start(seq)

            def competitive_share(year):
                window = [y for y in range(year - 10, year) if y in by_year]
                if not window:
                    return 0.0
                return sum(1 for y in window if y in hope_years) / len(window)

            titles = sorted(r["year"] for r in rows if r.get("champ"))
            wounds = []
            for r in rows:
                y = r["year"]
                ctx = drought_context(y, titles, yrs[0])
                if r.get("champ_app") and not r.get("champ"):
                    pts = (w * REL["final_lost"] * hope_multiplier(competitive_share(y)) * ctx
                           * decay(NOW - y) * heal_factor(y, titles) * reloc_factor(y, move_year))
                    wounds.append({"kind": "final_lost", "year": y, "points": round(pts, 3)})
                else:
                    if lg == "nhl":
                        cf = r.get("sf_cf_app")
                    elif lg == "mlb":
                        cf = r.get("lcs_app") or r.get("conf_final")
                    else:
                        cf = r.get("conf_final")
                    if cf and not r.get("champ_app"):
                        pts = (w * REL["conf_final_exit"] * hope_multiplier(competitive_share(y)) * ctx
                               * decay(NOW - y) * heal_factor(y, titles) * reloc_factor(y, move_year))
                        wounds.append({"kind": "conf_final_exit", "year": y, "points": round(pts, 3)})
                    elif r.get("playoff"):
                        # The Leafs/Sabres tax: a playoff berth that dies early is hope
                        # bought and burned — and it compounds deep into a drought
                        pts = (w * EARLY_EXIT_REL * hope_multiplier(competitive_share(y)) * ctx
                               * decay(NOW - y) * heal_factor(y, titles) * reloc_factor(y, move_year))
                        wounds.append({"kind": "early_exit", "year": y, "points": round(pts, 3)})

            longing = []
            fade = aspiration_fade(max(po_years) if po_years else None, at_level=True)
            # Title clock: from the last title, or from BIRTH if there has never been one
            title_start = titles[-1] if titles else yrs[0]
            eff = effective_drought_years(title_start, move_year)
            mat = memory_ramp(eff) * (pedigree_factor(titles) if titles else 1.0) * fade
            pts = longing_points(w, eff) * mat
            # Era-correct honour label: the Bills' 1965 title was an AFL championship,
            # but the Jets' 1968 crown was a SUPER BOWL beating the other league —
            # 1966-69 season champions carry the joint NFL/AFL label
            title_league = (by_year.get(title_start, {}).get("league") or lg.upper()) if titles else None
            if titles and lg == "nfl" and 1966 <= title_start <= 1969:
                title_league = "NFL/AFL"
            if pts > 0.05:
                longing.append({"honour": title_league if titles else f"first {lg.upper()} title",
                                "since": title_start,
                                "effective_years": round(eff, 1),
                                "era_start": move_year, "discount": 1.0,
                                "maturity": round(mat, 3), "fade": round(fade, 3),
                                "points": round(pts, 3)})
            # "Haven't even sniffed a final": longing for a FINALS APPEARANCE, at half
            # weight — from the last one, or from birth if there has never been one
            app_years = sorted(r["year"] for r in rows if r.get("champ_app"))
            app_start = app_years[-1] if app_years else yrs[0]
            eff_a = min(effective_drought_years(app_start, move_year), SECONDARY_CLOCK_CAP)
            mat_a = memory_ramp(eff_a) * fade
            pts_a = longing_points(w, eff_a) * APPEARANCE_SHARE * mat_a
            if pts_a > 0.05:
                longing.append({"honour": (f"{lg.upper()} final appearance" if app_years
                                           else f"first {lg.upper()} final appearance"),
                                "since": app_start,
                                "effective_years": round(eff_a, 1), "discount": 1.0,
                                "maturity": round(mat_a, 3), "points": round(pts_a, 3)})
            # The third clock (the Cowboys objection): years since the last DEEP RUN
            # (conference final or better) — thirty Januaries of early exits register
            deep_years = sorted(r["year"] for r in rows
                                if r.get("champ") or r.get("champ_app")
                                or (r.get("sf_cf_app") if lg == "nhl"
                                    else (r.get("lcs_app") or r.get("conf_final")) if lg == "mlb"
                                    else r.get("conf_final")))
            if deep_years:
                eff_d = min(effective_drought_years(deep_years[-1], move_year), SECONDARY_CLOCK_CAP)
                mat_d = memory_ramp(eff_d) * fade
                pts_d = longing_points(w, eff_d) * CONF_APPEARANCE_SHARE * mat_d
                if pts_d > 0.05:
                    longing.append({"honour": f"{lg.upper()} deep run", "since": deep_years[-1],
                                    "effective_years": round(eff_d, 1), "discount": 1.0,
                                    "maturity": round(mat_d, 3), "points": round(pts_d, 3)})

            # Grind: playoff drought + losing streak
            last_po = max(po_years) if po_years else None
            drought_start = last_po if last_po is not None else yrs[0]
            grind = w * GRIND_SHARE * math.sqrt(max(0, NOW - drought_start))
            streak = 0
            for y in sorted(by_year, reverse=True):
                r = by_year[y]
                wl = (r.get("w", 0), r.get("l", 0))
                if y == NOW and (wl[0] + wl[1]) == 0:
                    continue
                pct = r.get("win_pct") if r.get("win_pct") is not None else (
                    wl[0] / (wl[0] + wl[1]) if (wl[0] + wl[1]) else 0.5)
                if pct < 0.5:
                    streak += 1
                else:
                    break
            grind += w * LOSING_STREAK_W * streak

            # Concentrated trauma (v3.9): serial finals losses scale up
            final_years = sorted(x["year"] for x in wounds if x["kind"] == "final_lost")
            for x in wounds:
                if x["kind"] == "final_lost":
                    x["points"] = round(x["points"] * serial_gated(x["year"], final_years,
                                                                  titles, yrs[0]), 3)

            longing.sort(key=lambda l: -l["points"])
            glow = afterglow(titles[-1] if titles else None)
            lg_vals = list(val_by[lg.upper()].values())
            stat = damp_bonus(stature_factor(val_by[lg.upper()].get(name.lower()), lg_vals),
                              insulated(titles))
            agony = (sum(l["points"] for l in longing) + sum(x["points"] for x in wounds)) * glow * stat
            rec = {
                "slug": slug, "name": name, "sport": lg.upper(), "group": "us",
                "agony": round(agony, 2), "despair": round(grind, 2),
                "total": round(agony + grind, 2),
                "afterglow": round(glow, 3), "heartland": heartland,
                "stature": round(stat, 3),
                "last_won": titles[-1] if titles else None,
                "longing": longing,
                "wounds": sorted(wounds, key=lambda x: -x["points"])[:12],
                "wound_count": len(wounds),
                "last_playoffs": last_po, "losing_streak": streak,
            }
            out.append(rec)
            if not titles:
                never.append({
                    "slug": slug, "name": name, "league": lg.upper(),
                    "finals_lost": sum(1 for x in wounds if x["kind"] == "final_lost"),
                    "conf_final_exits": sum(1 for x in wounds if x["kind"] == "conf_final_exit"),
                    "last_playoffs": last_po,
                    "agony": rec["agony"], "despair": rec["despair"],
                })
    never.sort(key=lambda x: (-x["finals_lost"], -x["agony"]))
    return out, never


# ----------------------------------------------------------------------------
# College boards (Abdication Rule) — longing only
# ----------------------------------------------------------------------------

def score_college(data_dir):
    ch = load(data_dir, "champions-history.json")
    at = load(data_dir, "sports/all-teams.json")
    fbs = {norm(t["team"]) for t in at
           if t.get("sport") == "American Football" and t.get("league_raw") == "FBS"}
    d1 = {norm(t["team"]) for t in at
          if t.get("sport") == "Basketball" and t.get("workbook_level") == "College"}
    comps = {"College Football": ("college-football", fbs), "NCAA Champions": ("college-basketball", d1)}
    last = {}
    for r in ch:
        c = r.get("competition")
        if c not in comps or r.get("year", 0) > NOW:
            continue
        if c == "NCAA Champions" and r.get("year", 0) < CBB_TOURNAMENT_ERA:
            continue    # no contemporaneous title existed to win — site canon
        prog = str(r.get("canonical") or "")
        k = (c, prog)
        if r.get("year", 0) > last.get(k, 0):
            last[k] = r["year"]
    boards = {"college-football": [], "college-basketball": []}
    abdicated = {"college-football": [], "college-basketball": []}
    for (c, prog), y in last.items():
        key, members = comps[c]
        entry = {"name": prog, "since": y, "years": NOW - y,
                 "points": round(longing_points(TIER_W[2], NOW - y) * memory_ramp(NOW - y), 2)}
        if norm(prog) in members:
            boards[key].append(entry)
        else:
            abdicated[key].append(entry)   # Abdication Rule: historical shelf, unscored board
    for k in boards:
        boards[k].sort(key=lambda e: -e["points"])
        abdicated[k].sort(key=lambda e: -e["years"])
    return boards, abdicated


# ----------------------------------------------------------------------------
# Nations + parade drought (ported from the validated prototypes)
# ----------------------------------------------------------------------------

TEAM_NAT = {"FIFA World Cup", "UEFA European Championship", "Copa América", "Cricket World Cup",
            "T20 World Cup", "Rugby World Cup", "FIFA Women's World Cup", "World Baseball Classic",
            "Olympic men's basketball"}


def score_nations(data_dir):
    ch = load(data_dir, "champions-history.json")
    comp_tier = {}
    for r in ch:
        c = r["competition"]
        y = r.get("year") or 0
        if c not in comp_tier or y >= comp_tier[c][1]:
            comp_tier[c] = (r.get("tier"), y)
    active = {c for c, (t, y) in comp_tier.items() if y >= 2023 and t is not None and t <= 2 and c in TEAM_NAT}
    last = {}
    for r in ch:
        c = r["competition"]
        if c not in active or str(r.get("metro") or ""):
            continue
        nat = str(r.get("canonical") or r.get("champion") or "")
        y = r.get("year") or 0
        if nat and y <= NOW and y > last.get((nat, c), 0):
            last[(nat, c)] = y
    score = collections.defaultdict(float)
    det = collections.defaultdict(list)
    for (n, c), y in last.items():
        pts = longing_points(TIER_W[comp_tier[c][0]], NOW - y) * memory_ramp(NOW - y)
        score[n] += pts
        det[n].append({"kind": "drought", "comp": c, "since": y, "points": round(pts, 2)})
    fin = load(data_dir, "international/finals.json")
    keep = {"World Cup", "European Championship", "Copa América", "FIFA World Cup"}
    for slug, fl in fin.items():
        name = slug.replace("-", " ").title()
        for f in fl:
            if f.get("result") != "L" or f.get("year", 9999) > NOW:
                continue
            if not any(k.lower() in str(f.get("competition", "")).lower() for k in keep):
                continue
            close = 1.0
            if f.get("penalty_kicks") is not None:
                close = 2.0
            else:
                try:
                    m = abs((f.get("against_goals") or 0) - (f.get("for_goals") or 0))
                    close = 1.5 if m <= 1 else (0.75 if m >= 3 else 1.0)
                except Exception:
                    pass
            pts = 2.0 * close * decay(NOW - f["year"])
            score[name] += pts
            det[name].append({"kind": "final_lost", "comp": f.get("competition"),
                              "year": f["year"], "points": round(pts, 2)})
    return [{"nation": n, "total": round(s, 2),
             "detail": sorted(det[n], key=lambda d: -d["points"])[:6]}
            for n, s in sorted(score.items(), key=lambda kv: -kv[1])]


def parade_drought(data_dir):
    """Years since the metro last threw a parade for ANY major trophy — the
    tier 0-2 title ledger PLUS domestic cups and European trophies (Ashwin
    ruling: Newcastle's 2025 League Cup was a parade)."""
    ch = load(data_dir, "champions-history.json")
    at = load(data_dir, "sports/all-teams.json")
    cups = load(data_dir, "football/cups.json")
    euro = load(data_dir, "football/european-tournaments.json")
    # Only metros hosting a team in a competition the index actually scores
    pro_metros = set()
    for t in at:
        m = t.get("metro")
        if not m:
            continue
        if t.get("league") in ("NFL", "NBA", "MLB", "NHL", "AFL", "IPL"):
            pro_metros.add(m)
        elif (t.get("sport") == "Football" and t.get("level") == "Major"
              and t.get("league") in FOOT_LEAGUE_TIER):
            pro_metros.add(m)
    comp_tier = {}
    for r in ch:
        c = r["competition"]
        y = r.get("year") or 0
        if c not in comp_tier or y >= comp_tier[c][1]:
            comp_tier[c] = (r.get("tier"), y)
    active = {c for c, (t, y) in comp_tier.items() if y >= 2023 and t is not None and t <= 2}
    mlast = {}
    for r in ch:
        m = str(r.get("metro") or "")
        if not m or r["competition"] not in active or r.get("year", 0) > NOW:
            continue
        if r["year"] > mlast.get(m, 0):
            mlast[m] = r["year"]
    # Cup and European parades: club -> metro by exact name match only (never guess)
    club_metro = {}
    for r in ch:
        m = str(r.get("metro") or "")
        if m:
            club_metro.setdefault(norm(str(r.get("canonical") or "")), m)
    for t in at:
        if t.get("sport") == "Football" and t.get("metro"):
            club_metro.setdefault(norm(t.get("team")), t["metro"])
    def parade(name, year):
        m = club_metro.get(norm(name))
        if m and year <= NOW and year > mlast.get(m, 0):
            mlast[m] = year
    for entries in cups.values():
        for e in entries:
            if e.get("kind") in CUP_CONSOL and e.get("result") == "won" and e.get("year"):
                parade(e.get("cur_name"), e["year"])   # both domestic cup classes; never "super"
    for comp_slug in EURO:      # the real European trophies only — never super cups
        comp = euro.get(comp_slug)
        if isinstance(comp, dict):
            for e in comp.get("champions", []):
                if e.get("year"):
                    parade(e.get("cur_name"), e["year"])
    for r in ch:                # international club trophies are majors too
        if r.get("competition") in INTL_CLUB_COMPS and (r.get("year") or 9999) <= NOW:
            m = str(r.get("metro") or "")
            if m and r["year"] > mlast.get(m, 0):
                mlast[m] = r["year"]
    board = [{"metro": m, "last": y, "years": NOW - y} for m, y in mlast.items() if m in pro_metros]
    board.sort(key=lambda e: -e["years"])
    return board


# ----------------------------------------------------------------------------
# Quadrants + main
# ----------------------------------------------------------------------------

def assign_quadrants(entries):
    if not entries:
        return
    def pct(vals, p):
        vals = sorted(vals)
        return vals[min(len(vals) - 1, int(p * len(vals)))]
    a60 = max(pct([e["agony"] for e in entries], 0.6), 2.0)
    d60 = max(pct([e["despair"] for e in entries], 0.6), 0.75)
    for e in entries:
        hi_a, hi_d = e["agony"] >= a60, e["despair"] >= d60
        e["quadrant"] = ("The Damned" if hi_a and hi_d else
                         "The Tortured" if hi_a else
                         "The Numb" if hi_d else "The Blessed")


GFL_W = 2.0   # grand-final leagues price in local currency like everyone else


def _gfl_record(slug, name, sport, country, titles, first, gf_years, loss_events,
                contention_years, exit_years, deep_exit_years=None, group="gfl",
                closed=False, title_contention_years=None):
    """Shared scorer for grand-final leagues (AFL, NRL, CFL, NPB) and college.
    loss_events: [(year, closeness)] finals lost. exit_years: campaigns that died
    early (0.12). deep_exit_years: one round short of the final (0.4).
    closed=True (Rule 27, the Parramatta correction): closed leagues have no
    minnows — every franchise is major league, so the cabinet-based expectation
    haircut (an open-pyramid tool for pricing Hamilton Academicals at 0.5x)
    does not apply. Expectation is flat 1.0, like the US majors.
    title_contention_years (Rule 28, the Boise State correction): college's
    realism gate. Making a bowl is not contending for the title. When given,
    the title and appearance clocks scale by realism(share of the last
    REALISM_WINDOW seasons spent in genuine title contention), floor 0.35 —
    the same modern-era realism football applies to title/UCL longing."""
    titles = sorted(y for y in titles if y <= NOW)
    gf_years = sorted(y for y in gf_years if y <= NOW)
    contention_years = sorted(set(y for y in contention_years if y <= NOW))
    fade = aspiration_fade(contention_years[-1] if contention_years else None, at_level=True)
    real = 1.0
    if title_contention_years is not None:
        recent = [y for y in title_contention_years if NOW - REALISM_WINDOW < y <= NOW]
        real = realism(len(set(recent)) / REALISM_WINDOW)

    def comp_share(year):
        window = [y for y in contention_years if year - 10 <= y < year]
        return min(1.0, len(window) / 10.0)

    wounds = []
    loss_years = sorted(y for y, _ in loss_events)
    for y, close in loss_events:
        ctx = drought_context(y, titles, first)
        pts = (GFL_W * REL["final_lost"] * hope_multiplier(comp_share(y)) * close * ctx
               * decay(NOW - y) * heal_factor(y, titles)
               * serial_gated(y, loss_years, titles, first))
        wounds.append({"kind": "final_lost", "year": y, "points": round(pts, 3)})
    for y in exit_years:
        if y > NOW:
            continue
        ctx = drought_context(y, titles, first)
        pts = (GFL_W * EARLY_EXIT_REL * hope_multiplier(comp_share(y)) * ctx
               * decay(NOW - y) * heal_factor(y, titles))
        wounds.append({"kind": "early_exit", "year": y, "points": round(pts, 3)})
    for y in (deep_exit_years or []):
        if y > NOW:
            continue
        ctx = drought_context(y, titles, first)
        pts = (GFL_W * REL["conf_final_exit"] * hope_multiplier(comp_share(y)) * ctx
               * decay(NOW - y) * heal_factor(y, titles))
        wounds.append({"kind": "conf_final_exit", "year": y, "points": round(pts, 3)})

    longing = []
    t_start = titles[-1] if titles else first
    eff = NOW - t_start
    mat = memory_ramp(eff) * (pedigree_factor(titles) if titles else 1.0) * fade * real
    pts = longing_points(GFL_W, eff) * mat
    if pts > 0.05:
        longing.append({"honour": sport if titles else f"first {sport} title",
                        "since": t_start, "maturity": round(mat, 3),
                        "fade": round(fade, 3), "points": round(pts, 3)})
    a_start = gf_years[-1] if gf_years else first
    eff_a = min(NOW - a_start, SECONDARY_CLOCK_CAP)
    pts_a = longing_points(GFL_W, eff_a) * APPEARANCE_SHARE * memory_ramp(eff_a) * fade * real
    if pts_a > 0.05:
        longing.append({"honour": (f"{sport} final appearance" if gf_years
                                   else f"first {sport} final appearance"),
                        "since": a_start, "points": round(pts_a, 3)})

    grind = 0.0
    if contention_years:
        grind = GFL_W * GRIND_SHARE * math.sqrt(max(0, NOW - contention_years[-1]))
    glow = afterglow(titles[-1] if titles else None)
    expectation = 1.0 if closed else expectation_factor(len(titles))
    longing.sort(key=lambda l: -l["points"])
    agony = (sum(l["points"] for l in longing) + sum(w["points"] for w in wounds)) * glow * expectation
    return {
        "slug": slug, "name": name, "sport": sport, "group": group, "country": country,
        "agony": round(agony, 2), "despair": round(grind, 2),
        "total": round(agony + grind, 2),
        "afterglow": round(glow, 3), "expectation": round(expectation, 3),
        "realism": round(real, 3),
        "last_won": titles[-1] if titles else None,
        "longing": longing,
        "wounds": sorted(wounds, key=lambda w: -w["points"])[:12],
        "wound_count": len(wounds),
    }


def score_gfl(data_dir):
    """AFL, NRL, CFL, NPB — the grand-final leagues."""
    out = []
    for lg, sport, country in (("afl", "AFL", "Australia"), ("nrl", "NRL", "Australia")):
        d = load(data_dir, f"{lg}/data.json")
        gfs = d.get("grand_finals_by_team", {})
        seasons = d.get("seasons_by_team", {})
        for f in d.get("franchises", []):
            if not f.get("active"):
                continue
            slug = f["slug"]
            titles = f.get("title_years") or []
            first = f.get("first_year") or NOW
            gf_list = [g for g in gfs.get(slug, []) if (g.get("year") or 9999) <= NOW]
            # Reconcile the summary title list against the match-level rows:
            # trust the rows. (The St Kilda 2010 bug: title_years claimed the
            # premiership, but the grand-final rows record a draw and a lost
            # replay. Their drought runs from 1966, not 2010.) Flagged for the
            # workbook; the source file is not edited.
            gf_by_year = {}
            for g in gf_list:
                gf_by_year.setdefault(g["year"], []).append(bool(g.get("premiership")))
            bogus = [y for y in titles if y in gf_by_year and not any(gf_by_year[y])]
            if bogus:
                print(f"  ⚠️ {sport} {slug}: title_years claims {bogus} but the "
                      f"grand-final rows show no premiership — dropped (workbook review)")
                titles = [y for y in titles if y not in bogus]
            losses = []
            for g in gf_list:
                if g.get("result") == "L":
                    mgn = abs((g.get("pf") or 0) - (g.get("pa") or 0))
                    losses.append((g["year"], 1.5 if mgn <= 6 else (0.75 if mgn >= 30 else 1.0)))
            srows = seasons.get(slug, [])
            contention = [r["year"] for r in srows if r.get("finals")]
            exits = [r["year"] for r in srows if r.get("finals") and not r.get("gf")]
            out.append(_gfl_record(slug, f.get("name") or slug, sport, country, titles, first,
                                   [g["year"] for g in gf_list], losses, contention, exits,
                                   closed=True))
    # CFL
    d = load(data_dir, "cfl/data.json")
    gfs = d.get("grey_cup_finals_by_team", {})
    seasons = d.get("seasons_by_team", {})
    for f in d.get("franchises", []):
        if not f.get("active"):
            continue
        slug = f["slug"]
        titles = f.get("title_years") or []
        first = f.get("first_year") or NOW
        gf_list = [g for g in gfs.get(slug, []) if (g.get("year") or 9999) <= NOW]
        losses = []
        for g in gf_list:
            if g.get("result") == "L":
                mgn = abs((g.get("pf") or 0) - (g.get("pa") or 0))
                close = 2.0 if g.get("ot") else (1.5 if mgn <= 7 else (0.75 if mgn >= 25 else 1.0))
                losses.append((g["year"], close))
        srows = seasons.get(slug, [])
        contention = [r["year"] for r in srows if r.get("play_app")]
        exits = [r["year"] for r in srows if r.get("play_app") and not r.get("gc_final")]
        out.append(_gfl_record(slug, f.get("name") or slug, "CFL", "Canada", titles, first,
                               [g["year"] for g in gf_list], losses, contention, exits,
                               closed=True))
    # NPB — teams.json carries title and runner-up years directly
    teams = load(data_dir, "npb/teams.json")
    for t in teams:
        titles = t.get("js_title_years") or []
        ru = [y for y in (t.get("js_ru_years") or []) if y <= NOW]
        apps = sorted(set(titles) | set(ru))
        first = min(apps) if apps else 1950
        out.append(_gfl_record(t["slug"], t.get("name") or t["slug"], "NPB", "Japan",
                               titles, first, apps, [(y, 1.0) for y in ru],
                               apps, [], closed=True))
    return out


def score_college_clubs(data_dir):
    """CFB and CBB with the full depth Ashwin's portals provide: title-game
    losses, playoff/Final Four exits, bowl and tournament clocks, hope, grind.
    Title CLOCKS come from the champions ledger (site canon, contemporaneous,
    1939 floor for CBB); wounds come from the season records. Vacated CBB
    seasons never wound or heal. Loved-and-lost gate: a program appears only
    if it has a ledger title or has reached the title game / final four."""
    ch = load(data_dir, "champions-history.json")
    at = load(data_dir, "sports/all-teams.json")
    fbs = {norm(t["team"]) for t in at
           if t.get("sport") == "American Football" and t.get("league_raw") == "FBS"}
    d1 = {norm(t["team"]) for t in at
          if t.get("sport") == "Basketball" and t.get("workbook_level") == "College"}
    ledger = collections.defaultdict(list)
    for r in ch:
        c = r.get("competition")
        y = r.get("year") or 0
        if c == "College Football" and y <= NOW:
            ledger[("CFB", norm(str(r.get("canonical") or "")))].append(y)
        elif c == "NCAA Champions" and CBB_TOURNAMENT_ERA <= y <= NOW:
            ledger[("CBB", norm(str(r.get("canonical") or "")))].append(y)

    out = []
    for dirname, sport, members in (("cfb", "CFB", fbs), ("cbb", "CBB", d1)):
        d = load(data_dir, f"{dirname}/data.json")
        for team_key, rows in d.get("seasons_by_team", {}).items():
            rows = [r for r in rows if (r.get("year") or 9999) <= NOW]
            if not rows:
                continue
            school = str(rows[-1].get("school") or "")
            if norm(school) not in members:
                continue    # Abdication Rule / not at the top level
            titles = sorted(ledger.get((sport, norm(school)), []))
            first = min(r["year"] for r in rows)
            if sport == "CFB":
                # ⚠️ champ_app in cfb/data.json is the CONFERENCE championship
                # game (the Boise State bug: six Mountain West title games were
                # being priced as six lost national finals at ~4 points each).
                # The NATIONAL title game is identified by its bowl name; the
                # poll era's lost final is a No. 2 AP finish before the BCS.
                def natty(r):
                    return "Championship Game" in str(r.get("bowl") or "")
                def poll_ru(r):
                    return r.get("fin_ap") == 2 and r["year"] < 1998 and not r.get("nat_champ")
                app_years = [r["year"] for r in rows
                             if r.get("nat_champ") or natty(r) or poll_ru(r)]
                losses = ([(r["year"], 1.0) for r in rows
                           if natty(r) and str(r.get("bowl_res") or "") == "L"
                           and not r.get("nat_champ")]
                          + [(r["year"], 0.75) for r in rows if poll_ru(r)])
                deep_exits = [r["year"] for r in rows
                              if r.get("playoff") and not r.get("nat_champ") and not natty(r)]
                early = [r["year"] for r in rows
                         if (r.get("major_bowl") and not r.get("playoff")
                             and str(r.get("bowl_res") or "") == "L")
                         or (r.get("champ_app") and not r.get("conf_champ"))]
                contention = [r["year"] for r in rows
                              if r.get("playoff") or r.get("major_bowl") or r.get("fin_ap")]
                # Rule 28: making a New Year's bowl is contention; it is not
                # TITLE contention. The clocks only run hot for programs that
                # live where titles are decided — playoff, title game, top-10.
                title_cont = [r["year"] for r in rows
                              if r.get("playoff") or natty(r)
                              or (r.get("fin_ap") or 99) <= 10]
            else:
                ok = [r for r in rows if not r.get("vacated")]
                app_years = [r["year"] for r in ok if r.get("champ_app")]
                losses = [(r["year"], 1.0) for r in ok
                          if r.get("champ_app") and not r.get("champ")]
                deep_exits = [r["year"] for r in ok if r.get("final4") and not r.get("champ_app")]
                early = [r["year"] for r in ok if r.get("elite8") and not r.get("final4")]
                contention = [r["year"] for r in ok if r.get("ncaa")]
                # Rule 28, CBB flavour: an NCAA bid is contention; title
                # contention is a protected seed or the second weekend's end.
                title_cont = [r["year"] for r in ok
                              if r.get("final4") or r.get("champ_app") or r.get("elite8")
                              or (r.get("seed") or 99) <= 4]
            if not titles and not app_years and not deep_exits:
                continue    # never loved-and-lost at this level
            rec = _gfl_record(f"{sport.lower()}-{norm(school).replace(' ', '-')}",
                              school, sport, "United States", titles, first,
                              app_years, losses, contention, early,
                              deep_exit_years=deep_exits, group="college",
                              title_contention_years=title_cont)
            out.append(rec)
    return out


def load_agony_events(data_dir):
    """Optional curated layer: public/data/sports/agony-events.json."""
    p = os.path.join(data_dir, "sports", "agony-events.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        raw = json.load(f)
    by_slug = collections.defaultdict(list)
    for e in raw.get("events", []):
        by_slug[(e.get("sport"), e.get("slug"))].append(e)
    return by_slug


def apply_agony_events(clubs, events):
    """Add curated pang-scored wounds and rescore. No decay, no multipliers —
    the curator's number is final."""
    if not events:
        return
    for c in clubs:
        key = (c["sport"], c["slug"])
        evs = events.get(key) or events.get(("Football", c["slug"]) if c["group"] == "football" else key)
        if not evs:
            continue
        added = 0.0
        for e in evs:
            pts = round(float(e.get("pangs", 0)) * PANG_POINTS, 3)
            c["wounds"].append({"kind": "agony_event", "year": e.get("year"),
                                "name": e.get("name"), "points": pts, "pangs": e.get("pangs")})
            added += pts
        c["wounds"].sort(key=lambda w: -w["points"])
        c["wound_count"] = len(c["wounds"])
        c["agony"] = round(c["agony"] + added, 2)
        c["total"] = round(c["agony"] + c["despair"], 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(os.path.dirname(__file__), "..", "..", "public", "data"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    if args.self_test:
        self_test()
        return

    dd = args.data_dir
    football = score_football(dd)
    us, never = score_us(dd)
    college, abdicated = score_college(dd)
    college_rows = score_college_clubs(dd)
    gfl = score_gfl(dd)
    clubs = football + us + gfl + college_rows
    apply_agony_events(clubs, load_agony_events(dd))
    for grp in ("football", "us", "gfl", "college"):
        assign_quadrants([e for e in clubs if e["group"] == grp])
    nations = score_nations(dd)
    parade = parade_drought(dd)

    clubs.sort(key=lambda e: -e["total"])
    result = {
        "generated_note": "build_heartbreak.py (model v3); stamp date at commit time",
        "params": {"tier_w": TIER_W, "rel_weights": REL, "euro": {k: v for k, v in EURO.items()},
                   "cup_consolations": CUP_CONSOL, "consol_floor": CONSOL_FLOOR,
                   "decay_half_life": DECAY_HALF_LIFE, "decay_floor": DECAY_FLOOR,
                   "hope_max_bonus": HOPE_MAX_BONUS, "habituation_window": HABIT_WINDOW,
                   "healed_factor": HEALED_FACTOR, "reloc_discount": RELOC_DISCOUNT,
                   "league_as_consol": LEAGUE_AS_CONSOL,
                   "living_memory_years": LIVING_MEMORY_YEARS, "pedigree_step": PEDIGREE_STEP,
                   "aspiration_half_life": ASPIRATION_HALF_LIFE, "aspiration_floor": ASPIRATION_FLOOR,
                   "in_the_room": IN_THE_ROOM, "afterglow_years": AFTERGLOW_YEARS,
                   "hegemon_titles_in_15": HEGEMON_TITLES_IN_15, "realism_floor": REALISM_FLOOR,
                   "realism_window": REALISM_WINDOW, "early_exit_rel": EARLY_EXIT_REL,
                   "appearance_share": APPEARANCE_SHARE, "levels_share": LEVELS_SHARE,
                   "stature_max": STATURE_MAX, "conf_appearance_share": CONF_APPEARANCE_SHARE,
                   "cup_consol": CUP_CONSOL, "cup_wound_rel": CUP_WOUND_REL,
                   "us_heartbreak_w": US_HEARTBREAK_W, "heartland_mult": HEARTLAND_MULT,
                   "major_ramp_years": MAJOR_RAMP_YEARS,
                   "expectation_floor": EXPECTATION_FLOOR, "expectation_range": EXPECTATION_RANGE,
                   "expectation_cap": EXPECTATION_CAP,
                   "serial_finals_mult": SERIAL_FINALS_MULT, "serial_window": SERIAL_WINDOW,
                   "serial_min": SERIAL_MIN, "dynastic_min": DYNASTIC_MIN,
                   "dynastic_lookback": DYNASTIC_LOOKBACK,
                   "dynastic_insulation_years": DYNASTIC_INSULATION_YEARS,
                   "dynastic_damper": DYNASTIC_DAMPER,
                   "secondary_clock_cap": SECONDARY_CLOCK_CAP,
                   "context_base": CONTEXT_BASE, "context_span": CONTEXT_SPAN,
                   "context_horizon": CONTEXT_HORIZON,
                   "pedigree_window": PEDIGREE_WINDOW, "foot_heartbreak_w": FOOT_HEARTBREAK_W,
                   "pang_points": PANG_POINTS,
                   "heartland_metros": {k: sorted(v) for k, v in HEARTLAND_METROS.items()},
                   "promotion_refund": PROMO_REFUND, "grind_share": GRIND_SHARE,
                   "losing_streak_w": LOSING_STREAK_W, "now": NOW,
                   "gfl_w": GFL_W, "gfl_closed_expectation": 1.0,
                   "college_realism_window": REALISM_WINDOW,
                   "college_realism_floor": REALISM_FLOOR},
        "clubs": clubs,
        "never_winners": never,
        "college": college,
        "college_abdicated": abdicated,
        "nations": nations,
        "parade_drought": parade[:60],
    }

    # Dry-run report
    print(f"clubs scored: {len(clubs)} (football {len(football)}, US {len(us)})")
    print(f"\n=== HEARTBREAK BOARD top {args.top} ===")
    for e in clubs[:args.top]:
        top_w = e["wounds"][0] if e["wounds"] else None
        if top_w and top_w["kind"] == "agony_event" and top_w.get("name"):
            tw = f"; worst wound: {top_w['name']} ({top_w['year']})"
        else:
            tw = f"; worst wound {top_w['kind']} {top_w['year']}" if top_w else ""
        lo = e["longing"][0] if e["longing"] else None
        if lo and str(lo["honour"]).startswith("first "):
            ls = f"never won (est. {lo['since']})"
        else:
            ls = f"longing since {lo['since']}" if lo else "no title ever"
        print(f"{e['total']:7.1f}  {e['name']:<26} [{e['sport']:<8}] {e['quadrant']:<12} A{e['agony']:.1f}/D{e['despair']:.1f}  {ls}{tw}")
    print("\n=== NEVER WINNERS (US) top 8 ===")
    for e in never[:8]:
        print(f"  {e['name']:<26} {e['league']}  finals lost {e['finals_lost']}, agony {e['agony']}")
    print("\n=== NATIONS top 8 ===")
    for e in nations[:8]:
        print(f"  {e['total']:6.1f}  {e['nation']}")
    print("\n=== PARADE DROUGHT top 8 ===")
    for e in parade[:8]:
        print(f"  {e['years']:>3}y  {e['metro']}")
    print("\n=== COLLEGE (active) top 5 each / abdicated counts ===")
    for k in ("college-football", "college-basketball"):
        names = ", ".join(f"{e['name']} ({e['since']})" for e in college[k][:5])
        print(f"  {k}: {names}  | abdicated shelf: {len(abdicated[k])}")

    if args.write or args.out:
        out = args.out or os.path.join(dd, "sports", "heartbreak.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
        print(f"\nwrote {out} ({os.path.getsize(out):,} bytes)")
    else:
        print("\n(dry run — pass --write to emit heartbreak.json)")


if __name__ == "__main__":
    main()
