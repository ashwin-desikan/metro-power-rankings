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

# ---------------------------------------------------------------------------
# The parade roster: every league this engine prices a drought in, named once.
# parade_drought() reads BOTH of these — see the 🔴 note on that function for
# what happened when the two gates it feeds were hardcoded separately instead.
# Adding a league to the index means adding it here in the same commit, or the
# board will ache for a trophy it refuses to celebrate.
# ---------------------------------------------------------------------------
# all-teams.json `league` labels for the non-football leagues scored above.
PARADE_LEAGUES = ("NFL", "NBA", "MLB", "NHL", "AFL", "NRL", "CFL", "NPB", "IPL")
# champions-history.json `competition` names for the same set, plus the eight
# football leagues (via LEAGUE_COMP_BY_COUNTRY) and both college titles.
# 🔴 MLS AND LIGA MX ARE DELIBERATELY ABSENT: the index does not price them
# yet (Phase 2). They belong here the day they are scored and not before —
# this list means "we price the ache", not "a parade happened".
PARADE_COMPS = (set(LEAGUE_COMP_BY_COUNTRY.values())
                | {"NFL", "NBA", "MLB", "NHL", "AFL", "NRL", "CFL", "IPL",
                   "Japan Series",              # NPB
                   "College Football",          # CFB (already tier 2; explicit anyway)
                   "NCAA Champions"})           # CBB — tier 3, so previously excluded

# ---------------------------------------------------------------------------
# Sport groups: the board's top-level filter (Ashwin, 2026-08-14). One level
# ABOVE the site's all-teams taxonomy on purpose — that file separates
# "Basketball" from "W Basketball" and "American Football" from "Canadian
# Football", which is right for a team directory and wrong for a question like
# "who are the most heartbroken basketball fans on earth". A reader who picks
# Basketball wants the NBA, the college game and the European clubs in one
# list, not three lists that each look like the whole answer.
#
# ⚠️ The CFL sits under American Football rather than in a code of its own.
# Three downs and a bigger field is a different game to its players and the
# same family to a fan choosing a filter, and a one-league group reads as an
# oversight. Overturnable — it is a labelling call, not a scoring one.
SPORT_GROUP = {
    "NFL": "American Football", "CFB": "American Football", "CFL": "American Football",
    "NBA": "Basketball", "CBB": "Basketball", "WNBA": "Basketball",
    "CBA": "Basketball", "EuroLeague": "Basketball",
    "MLB": "Baseball", "NPB": "Baseball",
    "NHL": "Ice Hockey",
    "Football": "Football",
    "AFL": "Australian Rules",
    "NRL": "Rugby League",
    "IPL": "Cricket",
}
# Every club needs a country so the board can fly a flag. Football and the
# grand-final leagues already carry one; these are the leagues that did not,
# and the ones with clubs on both sides of a border are resolved per club from
# all-teams.json rather than assumed — the Raptors and the Blue Jays are
# Canadian, and a board that stamps every NBA club with the Stars and Stripes
# repeats the mistake that put Toronto's World Series in Buffalo.
LEAGUE_COUNTRY = {"NFL": "United States", "NBA": "United States", "MLB": "United States",
                  "NHL": "United States", "CFB": "United States", "CBB": "United States",
                  "CFL": "Canada", "NPB": "Japan"}
SPLIT_COUNTRY_LEAGUES = {"NHL", "NBA", "MLB"}   # leagues with clubs in two countries

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
RUNNER_UP_HEGEMON = 0.35      # second behind a hegemon champion is the ceiling, not a lost race:
                              # Marseille's five runner-up seasons under PSG are not five
                              # heartbreaks (Ashwin, 2026-09-07, Marseille could not sit top)
HEGEMON_RUN = (5, 8)          # ...where a hegemon champion holds >=5 of the last 8 titles
                              # including this one (PSG, Bayern, City, Juventus 2012-20,
                              # Celtic), not merely 3 in 15, which would catch a rival in a
                              # three-club league (Sporting) and discount a real race.
REALISM_FLOOR = 0.35          # modern-era realism floor on title/UCL longing
# College relevance (Ashwin, 2026-09-07: Dartmouth, two lost finals in the
# 1940s and no tournament since 1959, belongs nowhere near Purdue, Gonzaga and
# Houston). A program's ache scales by how much it competes NOW: the share of
# the last COLLEGE_RELEVANCE_SEASONS with an NCAA bid (CBB) or a final AP
# ranking (CFB), averaged with the share carrying a conference title. From
# COLLEGE_RELEVANCE_FLOOR (a program that has left the stage) to
# COLLEGE_RELEVANCE_FLOOR + COLLEGE_RELEVANCE_RANGE, on agony AND grind.
COLLEGE_RELEVANCE_SEASONS = 25
COLLEGE_RELEVANCE_FLOOR = 0.4
COLLEGE_RELEVANCE_RANGE = 0.9
REALISM_WINDOW = 15           # seasons over which contention share defines realistic aspiration
EARLY_EXIT_REL = 0.12         # US: playoff run ending before the conference final (the Leafs tax)
FAVOURITE_WIN_PCT = 0.75      # US: a playoff exit after a season this good (the Lions' 15-2 of
                              # 2024, one and done as the top seed) carries FULL hope whatever
                              # the previous decade looked like (Ashwin, 2026-09-07)
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
FOOT_LONGING_CAP_YEARS = 40   # football: a wait past forty years is history, not memory. The
                              # square-root clock stops growing there, so a 31-year wait at a
                              # big club (Everton) is not outweighed by a century at a club
                              # whose fans never saw the last one (Ashwin, 2026-09-07: Everton,
                              # Villa before 2025, Newcastle before 2025 belong near the top).
MAJOR_RAMP_YEARS = 25         # a TROPHY drought matures fast — full agony after a generation of
                              # season tickets, unlike the 60y horizon for ultimate-honour longing
EXPECTATION_FLOOR = 0.5       # football: heartbreak needs a big fanbase to break — clubs that
EXPECTATION_RANGE = 0.9       # never expected to win scale to 0.5x; big cabinets up to 1.4x
EXPECTATION_CAP = 20          # honours count at which the expectation factor maxes out
# Bigness, present tense (Ashwin, 2026-09-07): the cabinet says what a club
# once was; STATURE says what it is now. Benfica lose European finals they
# actually reach, West Brom and Genoa do not compete for the major trophies
# any more, and Arsenal's 2004-2025 wait hurt more than Genoa's century
# because Arsenal were one of the biggest clubs in the world while waiting.
# Two present-tense signals, both Europe-wide so a Benfica outranks a West
# Brom: European presence over the last STATURE_SEASONS completed seasons
# (Champions League 1.0, Europa League 0.6, Conference League 0.35, top
# flight without Europe 0.1, below it 0), and squad-value percentile across
# every priced club (Transfermarkt, six leagues; Portugal and Scotland run on
# presence alone). Multiplier from STATURE_FLOOR to STATURE_FLOOR + STATURE_RANGE.
STATURE_SEASONS = 10
STATURE_FLOOR = 0.7
STATURE_RANGE = 0.8
STATURE_EUR = {"CL": 1.0, "EL": 0.6, "ECL": 0.35}
STATURE_TOP_FLIGHT = 0.1
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


def european_presence(rows, now=NOW) -> float:
    """Share of the last STATURE_SEASONS completed seasons spent in Europe,
    weighted by competition; 0 for a club below the top flight."""
    recent = sorted((r for r in rows if (r.get("year") or 0) <= now), key=lambda r: r["year"])[-STATURE_SEASONS:]
    if not recent:
        return 0.0
    tot = 0.0
    for r in recent:
        q = r.get("eur_qual")
        if q in STATURE_EUR:
            tot += STATURE_EUR[q]
        elif r.get("level") == 1:
            tot += STATURE_TOP_FLIGHT
    return tot / STATURE_SEASONS


def foot_stature_factor(presence: float, value_pct, capacity_pct=None) -> float:
    """Present-tense bigness: European presence, the Europe-wide squad-value
    percentile where the club is priced, and the stadium-capacity percentile
    where the site holds a ground (the fanbase a club can seat: Everton's
    40,000 against Sparta Rotterdam's 12,000). Mean of whichever exist."""
    sig = [presence] + [x for x in (value_pct, capacity_pct) if x is not None]
    raw = sum(sig) / len(sig)
    return STATURE_FLOOR + STATURE_RANGE * min(1.0, max(0.0, raw))


def load_capacity_percentiles(data_dir, names):
    """club name -> percentile (0..1) of stadium capacity among the tracked
    clubs that team-metadata.json holds a ground for."""
    try:
        meta = load(data_dir, "sports/team-metadata.json").get("teams", {})
    except Exception:
        return {}
    caps = {n: meta[n]["capacity"] for n in names if isinstance(meta.get(n), dict) and meta[n].get("capacity")}
    if not caps:
        return {}
    ordered = sorted(caps.values())
    n = len(ordered)
    return {k: sum(1 for x in ordered if x <= v) / n for k, v in caps.items()}


def load_value_percentiles(data_dir):
    """slug -> percentile (0..1) of the latest twelve-month mean squad value,
    across every priced club in every country file. Missing files -> {}."""
    vals = {}
    vdir = os.path.join(data_dir, "football", "value")
    if not os.path.isdir(vdir):
        return {}
    for fn in os.listdir(vdir):
        if not fn.endswith(".json") or fn == "index.json":
            continue
        d = load(data_dir, "football/value/%s" % fn)
        for c in d.get("clubs", []):
            ser = [x["v"] for x in (c.get("series") or [])[-12:] if x.get("v") is not None]
            if c.get("slug") and ser:
                vals[c["slug"]] = sum(ser) / len(ser)
    if not vals:
        return {}
    ordered = sorted(vals.values())
    n = len(ordered)
    return {k: sum(1 for x in ordered if x <= v) / n for k, v in vals.items()}


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

    value_pct = load_value_percentiles(data_dir)
    capacity_pct = load_capacity_percentiles(
        data_dir, {rows_[0].get("cur_name") for rows_ in seasons.values() if rows_})
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

    # Top-flight champion per (country, year), with each champion's title years,
    # so a runner-up season can ask whether it lost a race or met a hegemon.
    champ_of = {}
    champ_titles = collections.defaultdict(list)
    for rows_ in seasons.values():
        for r in rows_:
            if played(r) and r.get("level") == 1 and r.get("place") == 1:
                champ_of[(r.get("country"), r["year"])] = r.get("cur_name")
                champ_titles[(r.get("country"), r.get("cur_name"))].append(r["year"])

    def behind_hegemon(country_, year_):
        c = champ_of.get((country_, year_))
        if not c:
            return False
        need, span = HEGEMON_RUN
        return sum(1 for y in champ_titles[(country_, c)] if 0 <= year_ - y < span) >= need

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
                add_wound("runner_up", r["year"], w_top, REL["runner_up"], l1_titles,
                          factor=RUNNER_UP_HEGEMON if behind_hegemon(country, r["year"]) else 1.0)

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
            pts = longing_points(w_top, min(NOW - start, FOOT_LONGING_CAP_YEARS)) * mat
            longing.append({"honour": "major trophy", "since": start,
                            "maturity": round(mat, 3), "fade": round(fade, 3),
                            "points": round(pts, 3)})
        else:
            # Never won anything: the drought starts at birth, not at the first title
            first = years[0]
            if NOW > first:
                mat = memory_ramp(NOW - first, MAJOR_RAMP_YEARS) * fade
                pts = longing_points(w_top, min(NOW - first, FOOT_LONGING_CAP_YEARS)) * mat
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
            pts = longing_points(w_top, min(NOW - start, FOOT_LONGING_CAP_YEARS)) * APPEARANCE_SHARE * mat
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
        stature = damp_bonus(foot_stature_factor(european_presence(rows), value_pct.get(slug), capacity_pct.get(name)),
                             insulated(l1_titles + ucl_wins))
        agony = (sum(l["points"] for l in longing) + sum(w["points"] for w in wounds)) * glow * expectation * stature
        out.append({
            "slug": slug, "name": name, "sport": "Football", "country": country,
            "group": "football",
            "agony": round(agony, 2), "despair": round(grind, 2),
            "total": round(agony + grind, 2),
            "afterglow": round(glow, 3), "expectation": round(expectation, 3),
            "stature": round(stature, 3),
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
                        share = competitive_share(y)
                        if (r.get("win_pct") or 0) >= FAVOURITE_WIN_PCT:
                            share = 1.0
                        pts = (w * EARLY_EXIT_REL * hope_multiplier(share) * ctx
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


# Scarcity. A club plays for its title every year; a nation plays for the
# World Cup once in four, and a generation of fans gets a dozen chances in a
# lifetime rather than fifty. Each of those chances carries more, and the
# wait between them is measured in tournaments missed, not seasons. So a
# nation's longing and its lost finals are scaled by the cadence of the
# competition: cadence ** SCARCITY_EXP. Ashwin's calibration point, 2026-09-07:
# England's footballers should approach the Maple Leafs (46.2 on the club
# board) without passing them. Once the never-won European Championship wait
# and the appearances ledger were in, England sat at 63 with a 0.25 exponent;
# 0.05 (a four-year tournament 1.07x, a two-year one 1.04x) puts England near
# 48. The exponent is a calibration, recorded in params.
NATION_CADENCE_YEARS = {
    "World Cup": 4, "FIFA World Cup": 4, "FIFA Women's World Cup": 4,
    "European Championship": 4, "UEFA European Championship": 4, "Copa América": 4,
    "Africa Cup of Nations": 2, "AFC Asian Cup": 4, "CONCACAF Gold Cup": 2,
    "Cricket World Cup": 4, "T20 World Cup": 2, "Rugby World Cup": 4,
    "Olympic men's basketball": 4, "World Baseball Classic": 4,
    "FIBA Basketball World Cup": 4, "UEFA Women's Championship": 4,
}
SCARCITY_EXP = 0.03

# Which sport, and which team, each national competition belongs to. A win in
# a competition of equal or higher tier in the SAME sport restarts every
# drought clock in that sport and heals every earlier lost final in it: France
# won the 2018 World Cup, so its fans were not carrying a European
# Championship drought from 2000 through it, and the 2006 final they lost was
# avenged (Ashwin, 2026-09-07). The women's World Cup is its own team and its
# own sport here; a men's title heals nothing for it.
LEDGER_SPORTS = {"football", "cricket", "rugby", "basketball", "baseball", "wfootball"}
NATION_SPORT = {
    "FIFA World Cup": "football", "World Cup": "football",
    "UEFA European Championship": "football", "European Championship": "football", "Copa América": "football",
    "Africa Cup of Nations": "football", "AFC Asian Cup": "football", "CONCACAF Gold Cup": "football",
    "FIFA Women's World Cup": "wfootball",
    "Cricket World Cup": "cricket", "T20 World Cup": "cricket",
    "Rugby World Cup": "rugby", "Olympic men's basketball": "basketball", "World Baseball Classic": "baseball",
    "FIBA Basketball World Cup": "basketball", "UEFA Women's Championship": "wfootball",
}


def scarcity(comp):
    return NATION_CADENCE_YEARS.get(comp, 4) ** SCARCITY_EXP


# Football national teams are scored from the appearances ledger
# (international/appearances.json: every team, every tournament, the round
# reached), not from the champions list alone. Two things the champions list
# cannot say (Ashwin, 2026-09-07): a team that has NEVER won still waits, from
# its first appearance, with the club engine's aspiration fade so a side that
# has never been near a semi-final aches at the floor rather than at full
# weight; and a continental title CONSOLES a World Cup drought (Uruguay's six
# Copas since 1950) through the same consolation_discount the clubs use, while
# a World Cup title restarts the continental clock outright.
FOOT_COMPS = {
    "WC": ("FIFA World Cup", 0),
    "EUROS": ("UEFA European Championship", 1),
    "COPA": ("Copa América", 2),
    "AFCON": ("Africa Cup of Nations", 3),
    "ASIAN": ("AFC Asian Cup", 3),
    "GOLD": ("CONCACAF Gold Cup", 3),
}
CONTENTION_ROUNDS = {"Semifinal", "Final", "Champion"}
NATION_CONSOL = 0.25          # a continental title consoles the World Cup wait, per title, recency-weighted
# A HEGEMON competition (Ashwin, 2026-09-07: the US men have won seven of the
# last eight Olympic basketball golds, so nobody else's wait or lost final in it
# is a heartbreak on the football scale). When one nation holds at least
# NATION_HEGEMON_SHARE of the last NATION_HEGEMON_EDITIONS editions, every
# OTHER nation's drought and lost final in that competition is priced at
# NATION_HEGEMON_FACTOR, the club board's runner-up-under-a-hegemon rule.
NATION_HEGEMON_EDITIONS = 8
NATION_HEGEMON_SHARE = 0.6
NATION_HEGEMON_FACTOR = 0.35
# Depth of the field, per sport (Ashwin, 2026-09-07): the women's game is
# contested at the top by a handful of nations, so its waits are priced at
# half; order unchanged. Recorded in params.
NATION_SPORT_SCALE = {"wfootball": 0.5}
# Rugby stature: how much a nation has invested in the game, from the caps it
# has played (percentile) and the peak of its world ranking, so France and
# Wales, who have never won but have lived in the top four for a century,
# outweigh a side with a third of the matches (Ashwin, 2026-09-07).
RUGBY_STATURE_FLOOR = 0.4
RUGBY_STATURE_RANGE = 1.0
NATION_CONSOL_ANNUAL = 0.05   # an ANNUAL honour (Six Nations, Rugby Championship) consoles less per
                              # title: France's three Six Nations in five years are not three Copas


def score_football_nations(data_dir, score, det, finals_last, meta=None):
    apps = load(data_dir, "international/appearances.json")
    for slug, rows in apps.items():
        # Same derivation the finals loop uses, so droughts and lost finals
        # land on one row.
        name = slug.replace("-", " ").title()
        by = collections.defaultdict(list)
        for a in rows:
            cat = a.get("category")
            if cat in FOOT_COMPS and (a.get("year") or 9999) <= NOW:
                by[cat].append(a)
        if "WC" not in by and not any(c in by for c in FOOT_COMPS):
            continue
        wins = {cat: max((a["year"] for a in rs if a.get("champion")), default=None) for cat, rs in by.items()}
        all_wins = {cat: sorted(a["year"] for a in rs if a.get("champion")) for cat, rs in by.items()}
        wc_win = wins.get("WC")
        if meta is not None:
            every = sorted(y for ys in all_wins.values() for y in ys)
            meta[(name, "football")] = {"last_won": every[-1] if every else None,
                                        "first": min(a["year"] for rs in by.values() for a in rs)}
            score[(name, "football")] += 0.0
        for cat, rs in by.items():
            comp, tier = FOOT_COMPS[cat]
            first = min(a["year"] for a in rs)
            last_win = wins.get(cat)
            # A World Cup restarts every continental clock (equal or higher tier).
            if cat != "WC" and wc_win and (last_win is None or wc_win > last_win):
                last_win = wc_win
            start = last_win if last_win else first
            years = NOW - start
            if years <= 0:
                continue
            contended = [a["year"] for a in rs if a.get("round_reached") in CONTENTION_ROUNDS and a["year"] > start]
            last_cont = max(contended) if contended else (start if last_win else None)
            # "At the level" for a nation is a quarter-final or better within the
            # last two editions, not merely qualifying: forty-eight teams reach
            # a World Cup, and a side that goes out in the round of sixteen every
            # time is not in the room where the dream is (Mexico, Scotland).
            at_level = any(a["round_reached"] in ("Quarterfinal", "Semifinal", "Final", "Champion")
                           and (NOW - a["year"]) <= 8 for a in rs)
            fade = aspiration_fade(last_cont, at_level)
            consol = 1.0
            if cat == "WC":
                cons = [(NATION_CONSOL, y) for c2, ys in all_wins.items() if c2 != "WC" for y in ys if y > start]
                consol = consolation_discount(cons, start)
            pts = longing_points(TIER_W[tier], years) * memory_ramp(years) * fade * consol * scarcity(comp)
            if pts <= 0.05:
                continue
            score[(name, "football")] += pts
            det[(name, "football")].append({
                "kind": "drought", "comp": comp, "since": start, "never": last_win is None,
                "points": round(pts, 2)})
            finals_last[(name, comp)] = last_win
    return score, det


# Cricket national teams: the cricket hub's own honours and finals ledgers
# (public/data/cricket) rather than the champions list, so a team that has
# never won still waits from its first match in the format. Each sport's
# ULTIMATE honour is tier 0 like the FIFA World Cup (the Cricket World Cup,
# the Rugby World Cup, Olympic gold and the FIBA World Cup, the Classic); a
# nation's lost final weighs the tier too. Ashwin, 2026-09-07: these come once
# in four years and the ache is not smaller for it. Only the two
# World Cups are droughts, and they are PEERS (Ashwin, 2026-09-07): either
# title is a world championship, so a win in one restarts BOTH clocks
# (England's 2022 T20 title reset its ODI wait; Australia's 2023 ODI title
# reset its T20 wait). The Champions Trophy and the World Test Championship
# only console them (South Africa 1998 and 2025). 🔴 The ledger
# holds finals, not semi-finals, so the exits that define South Africa's
# reputation (1992, 1999, 2007, 2015, 2023) are NOT priced yet; when a
# per-edition knockout ledger exists the aspiration fade will read it.
CRICKET_COMPS = {
    "wc": ("Cricket World Cup", 0, "ODI"),
    "t20wc": ("T20 World Cup", 1, "T20I"),
}
CRICKET_CONSOL_KEYS = ("ct", "wtc")


def _years(v):
    out = []
    for tok in str(v or "").replace("*", "").split(","):
        tok = tok.strip()
        if tok[:4].isdigit():
            out.append(int(tok[:4]))
    return out


def score_cricket_nations(data_dir, score, det, meta=None):
    teams = load(data_dir, "cricket/teams.json")
    teams = teams if isinstance(teams, list) else teams.get("teams", [])
    for t in teams:
        if not t.get("full_member") or not t.get("honours"):
            continue
        name = t["name"]
        key = (name, "cricket")
        h = t["honours"]
        detail_path = os.path.join(data_dir, "cricket", "team-detail", "%s.json" % t["slug"])
        finals = load(data_dir, "cricket/team-detail/%s.json" % t["slug"]).get("finals", []) if os.path.exists(detail_path) else []
        final_years = [f["year"] for f in finals if f.get("year") and f["year"] <= NOW]
        consol_years = [y for k in CRICKET_CONSOL_KEYS for y in _years((h.get(k) or {}).get("title_years")) if y <= NOW]
        any_world_title = max((y for hk in CRICKET_COMPS for y in _years((h.get(hk) or {}).get("title_years")) if y <= NOW), default=None)
        if meta is not None:
            firsts = [int(((t.get("formats", {}).get(fmt) or {}).get("first") or "9999")[:4]) for _, (_, _, fmt) in CRICKET_COMPS.items()]
            meta[key] = {"last_won": any_world_title, "first": min(firsts) if min(firsts) < 9999 else None}
            score[key] += 0.0
        for hk, (comp, tier, fmt) in CRICKET_COMPS.items():
            first = (t.get("formats", {}).get(fmt) or {}).get("first")
            if not first:
                continue
            first_year = int(first[:4])
            wins = [y for y in _years((h.get(hk) or {}).get("title_years")) if y <= NOW]
            # Peer rule: the clock runs from the latest title in EITHER format.
            start = any_world_title if any_world_title else first_year
            if start < first_year:
                start = first_year
            years = NOW - start
            if years <= 0:
                continue
            contended = [y for y in final_years if y > start]
            last_cont = max(contended) if contended else (start if any_world_title else None)
            at_level = any((NOW - y) <= 8 for y in final_years)
            fade = aspiration_fade(last_cont, at_level)
            consol = consolation_discount([(NATION_CONSOL, y) for y in consol_years if y > start], start)
            pts = longing_points(TIER_W[tier], years) * memory_ramp(years) * fade * consol * scarcity(comp)
            if pts <= 0.05:
                continue
            score[key] += pts
            det[key].append({"kind": "drought", "comp": comp, "since": start, "never": not any_world_title, "points": round(pts, 2)})
        for f in finals:
            if f.get("won") or not f.get("year") or f["year"] > NOW:
                continue
            major = str(f.get("major") or "")
            if "World Cup" not in major:
                continue
            avenged = any(y > f["year"] for hk in CRICKET_COMPS for y in _years((h.get(hk) or {}).get("title_years")))
            ftier = 0 if "T20" not in major else 1
            pts = TIER_W[ftier] * decay(NOW - f["year"]) * scarcity(major) * (HEALED_FACTOR if avenged else 1.0)
            score[key] += pts
            det[key].append({"kind": "final_lost", "comp": major, "year": f["year"], "points": round(pts, 2)})
    return score, det


# ---------------------------------------------------------------------------
# One ledger scorer for every national team the site holds a ledger for.
# Ashwin, 2026-09-07: the champions list only knows winners, so Wales and
# France (rugby), France and Lithuania (basketball), Puerto Rico and Cuba
# (baseball), England and France (women's football) were missing outright, and
# the sports read as tiny. A nation that has never won waits from its FIRST
# appearance, faded like a club that has not been near the semi-finals; a lost
# final is a wound; lesser honours console. Within a sport the listed
# competitions are PEERS when peers=True (cricket's two World Cups, basketball's
# Olympic gold and World Cup): a title in any restarts every clock. Otherwise
# (football, men's and women's) a higher-tier title restarts a lower-tier clock
# and a lower-tier title only consoles.
# ---------------------------------------------------------------------------

def hegemon_factor(champions_by_year, editions=NATION_HEGEMON_EDITIONS):
    """champions_by_year: {year: nation} for one competition. Returns
    NATION_HEGEMON_FACTOR when one nation holds NATION_HEGEMON_SHARE of the
    last `editions` editions, else 1.0, with the hegemon's name."""
    recent = [champions_by_year[y] for y in sorted(champions_by_year) if y <= NOW][-editions:]
    if len(recent) < editions:
        return 1.0, None
    top, n = collections.Counter(recent).most_common(1)[0]
    current = recent[-3:].count(top) >= 2      # a hegemon that stopped winning is history
    return (NATION_HEGEMON_FACTOR, top) if n / editions >= NATION_HEGEMON_SHARE and current else (1.0, None)


def score_ledger_nation(score, det, meta, name, sport, comps, peers=False, stature=1.0):
    """comps: list of dicts with comp, tier, wins, first, finals_lost, semis, qfs,
    consol ([(weight, year)]), and optionally hegemon (factor, nation)."""
    key = (name, sport)
    comps = [c for c in comps if c.get("first")]
    if not comps:
        return
    all_wins = sorted(y for c in comps for y in c["wins"] if y <= NOW)
    meta[key] = {"last_won": all_wins[-1] if all_wins else None,
                 "first": min(c["first"] for c in comps)}
    score[key] += 0.0    # every nation with a ledger gets a row, champions included
    scale = NATION_SPORT_SCALE.get(sport, 1.0) * stature
    for c in comps:
        heg, heg_who = c.get("hegemon") or (1.0, None)
        if heg_who == name:
            heg = 1.0
        comp, tier = c["comp"], c["tier"]
        wins = [y for y in c["wins"] if y <= NOW]
        heal_years = [y for c2 in comps for y in c2["wins"]
                      if y <= NOW and (peers or c2["tier"] <= tier)]
        start = max(heal_years) if heal_years else c["first"]
        years = NOW - start
        if years <= 0:
            continue
        contended = [y for y in c["finals_lost"] + c["semis"] if start < y <= NOW]
        last_cont = max(contended) if contended else (start if heal_years else None)
        at_level = any(NOW - y <= 8 for y in c["finals_lost"] + c["semis"] + c["qfs"] if y <= NOW)
        fade = aspiration_fade(last_cont, at_level)
        cons = list(c.get("consol") or [])
        if not peers:
            cons += [(NATION_CONSOL, y) for c2 in comps for y in c2["wins"]
                     if c2["tier"] > tier and y <= NOW]
        consol = consolation_discount([(w, y) for w, y in cons if y > start], start)
        pts = longing_points(TIER_W[tier], years) * memory_ramp(years) * fade * consol * scarcity(comp) * heg * scale
        if pts <= 0.05:
            continue
        score[key] += pts
        det[key].append({"kind": "drought", "comp": comp, "since": start,
                         "never": not heal_years, "points": round(pts, 2)})
        for y in c["finals_lost"]:
            if y > NOW:
                continue
            avenged = any(y2 > y for y2 in heal_years)
            fpts = TIER_W[tier] * decay(NOW - y) * scarcity(comp) * (HEALED_FACTOR if avenged else 1.0) * heg * scale
            score[key] += fpts
            det[key].append({"kind": "final_lost", "comp": comp, "year": y, "points": round(fpts, 2)})


def _yrs(v):
    return sorted(int(str(x)[:4]) for x in (v or []) if str(x)[:4].isdigit())


def score_rugby_nations(data_dir, score, det, meta):
    teams = load(data_dir, "rugby-union/teams.json")
    finals = load(data_dir, "rugby-union/hub.json").get("rwc_finals", [])
    lost = collections.defaultdict(list)
    for f in finals:
        if f.get("runner_up") and f.get("year"):
            lost[f["runner_up"]].append(int(f["year"]))
    caps = sorted((t.get("record") or {}).get("m") or 0 for t in teams)
    heg = hegemon_factor({int(f["year"]): f["winner"] for f in finals if f.get("year") and f.get("winner")})
    for t in teams:
        rwc = t.get("rwc") or {}
        if not rwc.get("apps"):
            continue
        m = (t.get("record") or {}).get("m") or 0
        cap_rel = m / max(caps) if caps and max(caps) else 0.0     # share of the most-capped nation
        peak = (t.get("ranking") or {}).get("peak") or 99
        peak_score = 1.0 if peak <= 2 else 0.6 if peak <= 5 else 0.25
        stature = RUGBY_STATURE_FLOOR + RUGBY_STATURE_RANGE * (0.6 * cap_rel + 0.4 * peak_score)
        detail = os.path.join(data_dir, "rugby-union", "team-detail", "%s.json" % t["slug"])
        seasons = load(data_dir, "rugby-union/team-detail/%s.json" % t["slug"]).get("seasons", []) if os.path.exists(detail) else []
        rwc_rows = [r for r in seasons if "Rugby World Cup" in str(r.get("comp", ""))]
        first = min((r["season"] for r in rwc_rows), default=None)
        if first is None:
            first = 1987 if rwc.get("apps", 0) >= 10 else None
        ch = t.get("championships") or {}
        consol = [(NATION_CONSOL_ANNUAL, y) for y in _yrs(ch.get("five_six_years")) + _yrs(ch.get("trc_years"))]
        score_ledger_nation(score, det, meta, t["name"], "rugby", [{
            "comp": "Rugby World Cup", "tier": 0, "wins": _yrs(rwc.get("title_years")), "first": first,
            "finals_lost": lost.get(t["name"], []),
            "semis": [r["season"] for r in rwc_rows if r.get("rwc_sf")],
            "qfs": [r["season"] for r in rwc_rows if r.get("rwc_qf")],
            "consol": consol, "hegemon": heg}], stature=stature)


def score_basketball_nations(data_dir, score, det, meta):
    nations = load(data_dir, "basketball/nations.json")
    heg_oly = hegemon_factor({y: n["name"] for n in nations for y in _yrs(n.get("gold_years"))})
    heg_wc = hegemon_factor({y: n["name"] for n in nations for y in _yrs(n.get("wc_title_years"))})
    for n in nations:
        detail = os.path.join(data_dir, "basketball", "nation-detail", "%s.json" % n["slug"])
        d = load(data_dir, "basketball/nation-detail/%s.json" % n["slug"]) if os.path.exists(detail) else {}
        camp = [c["year"] for c in d.get("campaigns", []) if c.get("year")]
        pod = d.get("podium_years") or {}
        silver, bronze = _yrs(pod.get("silver")), _yrs(pod.get("bronze"))
        oly_first = min(_yrs(pod.get("gold")) + silver + bronze, default=None)
        if not camp and oly_first is None:
            continue
        wc_first = min(camp) if camp else None
        score_ledger_nation(score, det, meta, n["name"], "basketball", [
            {"comp": "Olympic men's basketball", "tier": 0, "wins": _yrs(n.get("gold_years")),
             "first": oly_first or wc_first, "finals_lost": silver, "semis": bronze, "qfs": [], "consol": [],
             "hegemon": heg_oly},
            {"comp": "FIBA Basketball World Cup", "tier": 1, "wins": _yrs(n.get("wc_title_years")),
             "first": wc_first or oly_first, "finals_lost": _yrs(n.get("wc_ru_years")),
             "semis": [c["year"] for c in d.get("campaigns", []) if str(c.get("finish") or "").startswith(("Third", "Fourth", "Semi"))],
             "qfs": [], "consol": [], "hegemon": heg_wc},
        ], peers=True)


def score_baseball_nations(data_dir, score, det, meta):
    teams = load(data_dir, "baseball/teams.json")
    heg = hegemon_factor({y: t["name"] for t in teams for y in _yrs(t.get("title_years"))})
    for t in teams:
        if not t.get("first"):
            continue
        detail = os.path.join(data_dir, "baseball", "team-detail", "%s.json" % t["slug"])
        camp = load(data_dir, "baseball/team-detail/%s.json" % t["slug"]).get("campaigns", []) if os.path.exists(detail) else []
        score_ledger_nation(score, det, meta, t["name"], "baseball", [{
            "comp": "World Baseball Classic", "tier": 0, "wins": _yrs(t.get("title_years")), "first": t["first"],
            "finals_lost": _yrs(t.get("ru_years")),
            "semis": [c["year"] for c in camp if str(c.get("finish") or "").startswith("Semi")],
            "qfs": [c["year"] for c in camp if str(c.get("finish") or "").startswith("Quarter")],
            "consol": [], "hegemon": heg}])


def score_wfootball_nations(data_dir, score, det, meta):
    wwc = {n["name"]: n for n in load(data_dir, "football/womens-world-cup.json").get("nations", [])}
    eur = {n["name"]: n for n in load(data_dir, "wintl/euros.json").get("nations", [])}
    oly = {n["name"]: n for n in load(data_dir, "wintl/olympics.json").get("nations", [])}
    heg_wwc = hegemon_factor({y: n["name"] for n in wwc.values() for y in _yrs(n.get("title_years"))})
    heg_eur = hegemon_factor({y: n["name"] for n in eur.values() for y in _yrs(n.get("title_years"))})
    for name in sorted(set(wwc) | set(eur)):
        comps = []
        w = wwc.get(name)
        if w and w.get("first_appearance"):
            res = w.get("results", [])
            comps.append({"comp": "FIFA Women's World Cup", "tier": 0, "wins": _yrs(w.get("title_years")),
                          "first": int(w["first_appearance"]),
                          "finals_lost": [int(r["year"]) for r in res if r.get("rank") == 2],
                          "semis": [int(r["year"]) for r in res if r.get("rank") in (3, 4)],
                          "qfs": [int(r["year"]) for r in res if r.get("rank") and r["rank"] <= 8],
                          "consol": [(NATION_CONSOL, y) for y in _yrs((oly.get(name) or {}).get("gold_years"))],
                          "hegemon": heg_wwc})
        e = eur.get(name)
        if e and e.get("first"):
            comps.append({"comp": "UEFA Women's Championship", "tier": 1, "wins": _yrs(e.get("title_years")),
                          "first": int(e["first"]), "finals_lost": _yrs(e.get("ru_years")),
                          "semis": _yrs(e.get("semi_years")), "qfs": _yrs(e.get("semi_years")) + _yrs(e.get("ru_years")),
                          "consol": [], "hegemon": heg_eur})
        score_ledger_nation(score, det, meta, name, "wfootball", comps)


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
    meta = {}

    def heals(n, c, y):
        """Latest year a win in the same sport, at equal or higher tier, resets
        the clock for competition c: the later of c's own last win and any
        such win. A lower-tier win (a T20 title against a World Cup drought)
        does not count."""
        sport = NATION_SPORT.get(c)
        best = y
        if sport is None:
            return best
        for (n2, c2), y2 in last.items():
            if n2 != n or c2 == c or NATION_SPORT.get(c2) != sport:
                continue
            if comp_tier[c2][0] <= comp_tier[c][0] and y2 > best:
                best = y2
        return best

    # One row per TEAM, and a national team is a nation in ONE sport: England's
    # footballers, cricketers and rugby players are three fanbases with three
    # waits, not one (Ashwin, 2026-09-07). Keys are (nation, sport).
    for (n, c), y in last.items():
        if NATION_SPORT.get(c) in LEDGER_SPORTS:
            continue  # scored from their own ledgers below
        y_eff = heals(n, c, y)
        pts = longing_points(TIER_W[comp_tier[c][0]], NOW - y_eff) * memory_ramp(NOW - y_eff) * scarcity(c)
        if pts <= 0:
            continue
        key = (n, NATION_SPORT.get(c, "other"))
        score[key] += pts
        det[key].append({"kind": "drought", "comp": c, "since": y_eff, "points": round(pts, 2)})
    finals_last = {}
    score_football_nations(data_dir, score, det, finals_last, meta)
    score_cricket_nations(data_dir, score, det, meta)
    score_rugby_nations(data_dir, score, det, meta)
    score_basketball_nations(data_dir, score, det, meta)
    score_baseball_nations(data_dir, score, det, meta)
    score_wfootball_nations(data_dir, score, det, meta)
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
            pts = 2.0 * close * decay(NOW - f["year"]) * scarcity(str(f.get("competition") or ""))
            # A final lost and then avenged by a later title in the same sport
            # (any competition of equal or higher tier) is a healed wound, the
            # club engine's own rule. France 2006 after 2018; not France 2022.
            fcomp = str(f.get("competition") or "")
            fsport = next((sp for k, sp in NATION_SPORT.items() if k.lower() in fcomp.lower()), None)
            ftier = next((comp_tier[k][0] for k in comp_tier if k.lower() in fcomp.lower() or fcomp.lower() in k.lower()), None)
            if fsport is not None:
                avenged = any(
                    n2 == name and NATION_SPORT.get(c2) == fsport and y2 > f["year"]
                    and (ftier is None or comp_tier[c2][0] <= ftier)
                    for (n2, c2), y2 in last.items()
                )
                if avenged:
                    pts *= HEALED_FACTOR
            key = (name, fsport or "football")
            score[key] += pts
            det[key].append({"kind": "final_lost", "comp": f.get("competition"),
                             "year": f["year"], "points": round(pts, 2)})
    SPORT_LABEL = {"football": "Football", "wfootball": "Women's football", "cricket": "Cricket",
                   "rugby": "Rugby", "basketball": "Basketball", "baseball": "Baseball", "other": "Other"}
    return [{"nation": n, "sport": SPORT_LABEL.get(sp, sp), "total": round(s, 2),
             "last_won": (meta.get((n, sp)) or {}).get("last_won"),
             "first": (meta.get((n, sp)) or {}).get("first"),
             "detail": sorted(det[(n, sp)], key=lambda d: -d["points"])[:6]}
            for (n, sp), s in sorted(score.items(), key=lambda kv: -kv[1])]


def parade_drought(data_dir):
    """Years since the metro last threw a parade for ANY major trophy — the
    tier 0-2 title ledger PLUS every league this index actually prices PLUS
    domestic cups and European trophies (Ashwin ruling: Newcastle's 2025
    League Cup was a parade).

    🔴 THE PARADE SET IS THE SET THIS INDEX SCORES. It used to be "tier 0-2 in
    the champions ledger", and tier measures GLOBAL STATURE, not whether a
    trophy is a trophy. The two are not the same question, and the gap between
    them was visible on the live board: the index priced Hamilton's Grey Cup
    drought at 21.7 and simultaneously refused to count a Grey Cup as a parade,
    so Toronto read 59 years while the Argonauts were the reigning champions.
    Ashwin, 2026-08-14: "Vancouver and Toronto have also had CFL success in
    that time... And Winnipeg and Calgary."

    The same one-sided rule reached further than the CFL. Every competition the
    engine prices below tier 2 was silently excluded: the NRL, the Japan
    Series, and — because league tier tracks league quality — the Eredivisie,
    the Primeira Liga and the Scottish Premiership, so Feyenoord, Benfica and
    Celtic could win their leagues without their cities holding a parade. The
    college pair split the same way for the same reason: College Football sits
    at tier 2 and counted, the NCAA basketball title sits at tier 3 and did
    not, though the index prices droughts in both.

    So the roster is derived ONCE, from the engine's own scoring tables, and
    used for both gates below — which competitions end a drought, and which
    metros are eligible to have one. Those two were separately hardcoded, which
    is how a metro could be scored for a Grey Cup drought and still never
    appear on this board at all.
    """
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
        if t.get("league") in PARADE_LEAGUES:
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
    # The tier ledger stays as the BASELINE — it is what brings in the trophies
    # this engine does not price club-by-club but a city plainly parades for
    # (the IPL, Copa Libertadores, a World Series). Competitions with no metro
    # on their rows — Wimbledon, the Tour, the Masters, the Olympic medal
    # table — fall out on their own below, because an individual's title is
    # not a city's parade and the ledger leaves their metro blank.
    active = {c for c, (t, y) in comp_tier.items() if y >= 2023 and t is not None and t <= 2}
    # ...and the engine's own roster is added to it, whatever tier it sits at.
    active |= {c for c, (t, y) in comp_tier.items() if y >= 2023 and c in PARADE_COMPS}
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
    # Metro page slug (/rankings/<slug>), from the team list first and the
    # champions ledger second; a metro with no slug on either renders unlinked.
    metro_slug = {}
    for t in at:
        if t.get("metro") and t.get("metro_slug"):
            metro_slug.setdefault(t["metro"], t["metro_slug"])
    for r in ch:
        if r.get("metro") and r.get("metroSlug"):
            metro_slug.setdefault(str(r["metro"]), r["metroSlug"])
    board = [{"metro": m, "slug": metro_slug.get(m), "last": y, "years": NOW - y}
             for m, y in mlast.items() if m in pro_metros]
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
                closed=False, title_contention_years=None, relevance=1.0):
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
    agony = (sum(l["points"] for l in longing) + sum(w["points"] for w in wounds)) * glow * expectation * relevance
    grind *= relevance
    return {
        "slug": slug, "name": name, "sport": sport, "group": group, "country": country,
        "agony": round(agony, 2), "despair": round(grind, 2),
        "total": round(agony + grind, 2),
        "afterglow": round(glow, 3), "expectation": round(expectation, 3),
        "realism": round(real, 3), "relevance": round(relevance, 3),
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


def score_ipl(data_dir):
    """The IPL. Ashwin, 2026-08-14: "Let's do IPL."

    Structurally the NPB case — a closed franchise league whose data carries
    titles and runners-up directly — with the playoff field taken from each
    season's standings, so the contention clock is real rather than inferred
    from finals alone.

    🔴 EXPECT SMALL NUMBERS, AND DO NOT FIX THAT. The league is nineteen
    seasons old, so its longest possible drought is nineteen years, which
    memory_ramp's sixty-year horizon matures to about a third. Punjab and Delhi
    will sit far below Toronto and that is the correct answer: an IPL supporter
    has not waited sixty years, because there was nothing to wait for. Scaling
    the ramp to league age would price the FORMAT rather than the suffering,
    and would hand a 2008 franchise the same ache as a 1917 one for waiting a
    fifth as long. The index measures lived time. Young leagues have less of it.

    Two honest limits, stated rather than papered over:
      - Every lost final is priced at closeness 1.0. The CFL block reads
        margins off its grand-final rows and the ledger here has none, so there
        is no super-over-versus-thrashing distinction to make. Flat is better
        than invented.
      - Only ACTIVE franchises score, the same rule the other closed leagues
        follow. Nobody is still waiting on the Deccan Chargers.
    """
    d = load(data_dir, "ipl/data.json")
    playoffs = collections.defaultdict(list)
    finals = collections.defaultdict(list)
    for s in d.get("seasons", []):
        y = s.get("year")
        if not y or y > NOW:
            continue
        for r in s.get("standings", []):
            if r.get("playoffs"):
                playoffs[r["slug"]].append(y)
            if r.get("finalist") or r.get("champion"):
                finals[r["slug"]].append(y)
    out = []
    for f in d.get("franchises", []):
        if not f.get("active"):
            continue
        slug = f["slug"]
        titles = [y for y in (f.get("title_years") or []) if y <= NOW]
        ru = [y for y in (f.get("runner_up_years") or []) if y <= NOW]
        # Prefer the standings' own finalist flags, falling back to the
        # franchise summary. The two agree today; the fallback is here so a
        # season loaded without standings cannot silently erase a final.
        gf_years = sorted(set(finals.get(slug) or []) | set(titles) | set(ru))
        contention = sorted(set(playoffs.get(slug) or []))
        exits = [y for y in contention if y not in set(gf_years)]
        out.append(_gfl_record(slug, f.get("name") or slug, "IPL", "India",
                               titles, f.get("founded") or 2008, gf_years,
                               [(y, 1.0) for y in ru], contention, exits,
                               closed=True))
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
            recent = [r for r in rows if NOW - COLLEGE_RELEVANCE_SEASONS < r["year"] <= NOW]
            if sport == "CFB":
                stage = sum(1 for r in recent if r.get("fin_ap"))
                conf = sum(1 for r in recent if r.get("conf_champ"))
            else:
                stage = sum(1 for r in recent if r.get("ncaa") and not r.get("vacated"))
                conf = sum(1 for r in recent if (r.get("reg_champ") or r.get("conf_tour_champ")) and not r.get("vacated"))
            raw = 0.5 * (stage / COLLEGE_RELEVANCE_SEASONS) + 0.5 * min(1.0, conf / (COLLEGE_RELEVANCE_SEASONS * 0.4))
            relevance = COLLEGE_RELEVANCE_FLOOR + COLLEGE_RELEVANCE_RANGE * min(1.0, raw)
            rec = _gfl_record(f"{sport.lower()}-{norm(school).replace(' ', '-')}",
                              school, sport, "United States", titles, first,
                              app_years, losses, contention, early,
                              deep_exit_years=deep_exits, group="college",
                              title_contention_years=title_cont, relevance=relevance)
            out.append(rec)
    return out


def stamp_group_and_country(clubs, data_dir):
    """Give every club a sport GROUP and a country, in one place.

    Both are display facts the board needs for every row, and doing it per
    score_* function is how a field ends up present on four sports and absent
    on the fifth. The country is resolved per club from all-teams.json for the
    leagues that straddle a border, and only falls back to the league's own
    country when the club is not matched there.
    """
    at = load(data_dir, "sports/all-teams.json")
    by_league_name = {}
    for t in at:
        lg, nm, ctry = t.get("league"), norm(t.get("team")), t.get("country")
        if lg and nm and ctry:
            by_league_name.setdefault((lg, nm), ctry)
    unmatched = collections.Counter()
    for c in clubs:
        sport = c.get("sport")
        c["sport_group"] = SPORT_GROUP.get(sport, sport)
        if c.get("country"):
            continue
        if sport in SPLIT_COUNTRY_LEAGUES:
            hit = by_league_name.get((sport, norm(c["name"])))
            if hit:
                c["country"] = hit
                continue
            unmatched[sport] += 1
        c["country"] = LEAGUE_COUNTRY.get(sport)
    for lg, n in unmatched.items():
        print(f"  note: {n} {lg} club(s) not matched in all-teams.json; "
              f"fell back to {LEAGUE_COUNTRY.get(lg)}")


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
    gfl = score_gfl(dd) + score_ipl(dd)
    clubs = football + us + gfl + college_rows
    apply_agony_events(clubs, load_agony_events(dd))
    stamp_group_and_country(clubs, dd)
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
                   "nation_scarcity_exp": SCARCITY_EXP, "nation_consol": NATION_CONSOL, "nation_consol_annual": NATION_CONSOL_ANNUAL, "nation_hegemon": [NATION_HEGEMON_EDITIONS, NATION_HEGEMON_SHARE, NATION_HEGEMON_FACTOR], "nation_sport_scale": NATION_SPORT_SCALE, "rugby_stature": [RUGBY_STATURE_FLOOR, RUGBY_STATURE_RANGE], "nation_cadence_years": NATION_CADENCE_YEARS,
                   "healed_factor": HEALED_FACTOR, "reloc_discount": RELOC_DISCOUNT,
                   "league_as_consol": LEAGUE_AS_CONSOL,
                   "living_memory_years": LIVING_MEMORY_YEARS, "pedigree_step": PEDIGREE_STEP,
                   "aspiration_half_life": ASPIRATION_HALF_LIFE, "aspiration_floor": ASPIRATION_FLOOR,
                   "in_the_room": IN_THE_ROOM, "afterglow_years": AFTERGLOW_YEARS,
                   "hegemon_titles_in_15": HEGEMON_TITLES_IN_15, "runner_up_hegemon": RUNNER_UP_HEGEMON, "hegemon_run": HEGEMON_RUN, "realism_floor": REALISM_FLOOR,
                   "realism_window": REALISM_WINDOW, "early_exit_rel": EARLY_EXIT_REL, "favourite_win_pct": FAVOURITE_WIN_PCT, "foot_longing_cap_years": FOOT_LONGING_CAP_YEARS, "college_relevance": [COLLEGE_RELEVANCE_SEASONS, COLLEGE_RELEVANCE_FLOOR, COLLEGE_RELEVANCE_RANGE],
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
                   "foot_stature_floor": STATURE_FLOOR, "foot_stature_range": STATURE_RANGE,
                   "foot_stature_seasons": STATURE_SEASONS, "foot_stature_eur": STATURE_EUR,
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
