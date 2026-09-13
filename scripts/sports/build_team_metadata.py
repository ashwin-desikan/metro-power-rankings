#!/usr/bin/env python3
"""
build_team_metadata.py  --  TheSportsDB crest/logo enrichment pass (multi-sport).

Walks all-teams.json, matches each in-scope club to TheSportsDB, downloads the
badge, and writes it where each surface already expects it:

  * Football (English tiers 1-4 + MLS) -> public/team-badges/<slug>.png plus an
    entry in public/data/sports/team-metadata.json. Rendered by <TeamCrest>.
  * US majors (NFL/NBA/MLB/NHL) -> public/data/<sport>/logos/<route-slug>.png.
    Rendered by the EXISTING logoUrlFor() with no code change.

INCREMENTAL: a club already resolved (badge file present) is skipped on re-run,
so fixing a few stragglers only costs a handful of API calls, not all 246.

MATCHING NOTES (from the full run):
  * Always filter candidates to expected sport + country set, exclude women's
    teams, then score by name similarity. Never trust a name-only hit.
  * Country strings are "England", "Wales", "United States" (NOT "USA"), "Canada".
    Welsh clubs (Cardiff, Swansea, Newport, Wrexham) play the English pyramid but
    are tagged "Wales", so the English scope allows both.
  * Some clubs need a search ALIAS (TheSportsDB stores "LA Galaxy", not
    "Los Angeles Galaxy"); see ALIASES.
  * A few clubs are simply not reachable on the FREE tier (the search hides them
    and lookup_all_teams caps at 24/league and is unreliable). Known cases:
    Nottingham Forest (collides with a netball club), St. Louis Cardinals,
    St. Louis City SC. Pin their TheSportsDB id in OVERRIDES (look it up on
    thesportsdb.com) or accept the monogram fallback. Free tier = 30 req/min.

CARRY-FORWARD: team-metadata.json is rewritten whole on every run, so a club
that has since fallen OUT of scope (relegated, renamed, league dropped from the
workbook) would silently lose its entry and its crest would vanish from the
historical pages that still name it. Entries no longer in scope are therefore
carried forward untouched. Use --prune only when you mean to drop them.

Run from the repo root:
    python scripts/sports/build_team_metadata.py --dry-run
    python scripts/sports/build_team_metadata.py --only intl,wsl,nwsl,ligaf
    python scripts/sports/build_team_metadata.py

Flags:
    --dry-run        list what would be fetched, make no network calls, write nothing
    --only a,b,c     restrict to these scope keys (see SCOPES)
    --prune          drop carried-forward entries that are no longer in scope
"""

import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, urllib.error

# Club names carry Turkish, Azerbaijani, Nordic and Slavic letters. A Windows
# console defaults to cp1252 and raises UnicodeEncodeError mid-run on the first
# one, losing the whole pass. Force UTF-8 and replace anything the terminal
# cannot draw, so a name never aborts a fetch.
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass

API = "https://www.thesportsdb.com/api/v1/json/3"
ALL_TEAMS = "public/data/sports/all-teams.json"
OUT_JSON  = "public/data/sports/team-metadata.json"
REVIEW    = "team-metadata-review.md"
BADGE_DIR = "public/team-badges"
LOGO_DIR  = "public/team-logos"
SLEEP = 2.5            # free tier = 30 req/min; 2.5s paces to ~24/min
RATE_WAIT = 65         # on HTTP 429, wait this long then retry
NAME_THRESHOLD = 0.5

# clubs to include beyond the tier filter (e.g. promoted National League sides)
EXTRA_ENG = {"Rochdale", "York City"}

# first-division international leagues: site league label -> TheSportsDB country string
# (TheSportsDB tags Dutch clubs "The Netherlands", not "Netherlands")
LEAGUE_COUNTRY = {
    "Brazil": "Brazil", "Mexico": "Mexico", "Argentina": "Argentina",
    "France": "France", "Spain": "Spain", "Germany": "Germany",
    "Italy": "Italy", "Netherlands": "The Netherlands",
    "Scotland": "Scotland", "Portugal": "Portugal",
    "Belgium": "Belgium", "Austria": "Austria", "Switzerland": "Switzerland",
    "Sweden": "Sweden", "Russia": "Russia", "Ukraine": "Ukraine",
    "Poland": "Poland", "Turkey": "Turkey", "Greece": "Greece",
    "Colombia": "Colombia", "Denmark": "Denmark", "Czech Republic": "Czechia",
    "Uruguay": "Uruguay",
    # Added 2026-09-13. These three send clubs to the Champions League league
    # phase, so their top flights appear on the live continental standings even
    # though the domestic table is not surfaced. Without them, Viking FK,
    # FK Bodo/Glimt, Sabah FK and Slovan Bratislava render as monograms.
    "Norway": "Norway", "Azerbaijan": "Azerbaijan", "Slovakia": "Slovakia",
}

SCOPES = [
    {"key": "eng", "sdb_sport": "Soccer", "countries": {"England", "Wales"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "England"
              and (t.get("workbook_level") in {"1", "2", "3", "4"} or t.get("team") in EXTRA_ENG)},
    {"key": "mls", "sdb_sport": "Soccer", "countries": {"United States", "Canada"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "United States"
              and t.get("workbook_level") == "1"},
    {"key": "intl", "sdb_sport": "Soccer", "out": "metadata",
     "countries": lambda t: {LEAGUE_COUNTRY.get(t.get("league"), "")},
     "match": lambda t: t.get("sport") == "Football" and t.get("league") in LEAGUE_COUNTRY
              and t.get("workbook_level") == "1"},
    {"key": "nfl", "sdb_sport": "American Football", "countries": {"United States"}, "out": "logos:nfl",
     "match": lambda t: t.get("sport") == "American Football" and t.get("league") == "NFL"},
    {"key": "nba", "sdb_sport": "Basketball", "countries": {"United States", "Canada"}, "out": "logos:nba",
     "match": lambda t: t.get("sport") == "Basketball" and t.get("league") == "NBA"},
    {"key": "mlb", "sdb_sport": "Baseball", "countries": {"United States", "Canada"}, "out": "logos:mlb",
     "match": lambda t: t.get("sport") == "Baseball" and t.get("league") == "MLB"},
    {"key": "nhl", "sdb_sport": "Ice Hockey", "countries": {"United States", "Canada"}, "out": "logos:nhl",
     "match": lambda t: t.get("sport") == "Hockey" and t.get("league") == "NHL"},
    # --- additional leagues (out:"metadata" -> team-metadata.json, wired per-portal) ---
    {"key": "afl", "sdb_sport": "Australian Football", "countries": {"Australia"}, "gender": "M", "out": "metadata",
     "match": lambda t: t.get("sport") == "Aussie Rules" and t.get("league") == "AFL"},
    {"key": "nrl", "sdb_sport": "Rugby", "countries": {"Australia", "New Zealand"}, "gender": "M", "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby League" and t.get("league") == "NRL"},
    {"key": "ipl", "sdb_sport": "Cricket", "countries": {"India"}, "gender": "M", "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "IPL"},
    {"key": "wnba", "sdb_sport": "Basketball", "countries": {"United States"}, "gender": "F", "out": "metadata",
     "match": lambda t: t.get("sport") == "W Basketball" and t.get("league") == "WNBA"},
    {"key": "nwsl", "sdb_sport": "Soccer", "countries": {"United States"}, "gender": "F", "out": "metadata",
     "match": lambda t: t.get("sport") == "W Football" and t.get("league") == "NWSL"},
    {"key": "wsl", "sdb_sport": "Soccer", "countries": {"England"}, "gender": "F", "out": "metadata",
     "match": lambda t: t.get("sport") == "W Football" and t.get("league") == "WSL"},
    {"key": "cfb", "sdb_sport": "American Football", "countries": {"United States"}, "gender": "M", "out": "metadata",
     "match": lambda t: t.get("sport") == "American Football" and t.get("workbook_level") == "College"},
    {"key": "cbb", "sdb_sport": {"Basketball", "American Football"}, "countries": {"United States"}, "gender": "M", "out": "metadata",
     "match": lambda t: t.get("sport") == "Basketball" and t.get("workbook_level") == "College"},
    # cricket + rugby domestic leagues (resolved via overrides scraped from league pages)
    {"key": "t20blast", "sdb_sport": "Cricket", "countries": {"England"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "T20 Blast"},
    {"key": "hundred", "sdb_sport": "Cricket", "countries": {"England"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "The Hundred"},
    {"key": "bbl", "sdb_sport": "Cricket", "countries": {"Australia"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Big Bash League"},
    {"key": "hundredw", "sdb_sport": "Cricket", "countries": {"England"}, "gender": "F", "out": "metadata",
     "match": lambda t: t.get("sport") == "W T20 Cricket" and t.get("league") == "The Hundred - Women"},
    {"key": "premrugby", "sdb_sport": "Rugby", "countries": {"England"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "Premiership"},
    {"key": "superleague", "sdb_sport": "Rugby", "countries": {"England", "France"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby League" and t.get("league") == "Super League"},
    {"key": "top14", "sdb_sport": "Rugby", "countries": {"France"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "Top 14"},
    {"key": "urc", "sdb_sport": "Rugby", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "URC"},
    {"key": "superrugby", "sdb_sport": "Rugby", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "Super Rugby"},
    {"key": "currie", "sdb_sport": "Rugby", "countries": {"South Africa"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "Currie Cup"},
    {"key": "japanrugby", "sdb_sport": "Rugby", "countries": {"Japan"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Rugby Union" and t.get("league") == "Japan Rugby League One"},
    {"key": "npb", "sdb_sport": "Baseball", "countries": {"Japan"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Baseball" and t.get("league") == "NPB"},
    {"key": "kbo", "sdb_sport": "Baseball", "countries": {"South Korea"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Baseball" and t.get("league") == "KBO"},
    # Triple-A (AAA) minor-league baseball.
    {"key": "aaa-il", "sdb_sport": "Baseball", "countries": {"United States", "Canada"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Baseball" and t.get("league") == "International League"},
    {"key": "aaa-pcl", "sdb_sport": "Baseball", "countries": {"United States", "Canada"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Baseball" and t.get("league") == "Pacific Coast League"},
    {"key": "khl", "sdb_sport": "Ice Hockey", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Hockey" and t.get("league") == "KHL"},
    {"key": "superlega", "sdb_sport": "Volleyball", "countries": {"Italy"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Volleyball" and t.get("league") == "Superlega"},
    {"key": "plusliga", "sdb_sport": "Volleyball", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Volleyball" and t.get("league") == "PlusLiga"},
    # franchise / domestic T20 cricket leagues (resolved via overrides scraped from league pages)
    {"key": "cpl", "sdb_sport": "Cricket", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "CPL"},
    {"key": "sa20", "sdb_sport": "Cricket", "countries": {"South Africa"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "SA20"},
    {"key": "bpl", "sdb_sport": "Cricket", "countries": {"Bangladesh"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "BPL"},
    {"key": "ilt20", "sdb_sport": "Cricket", "countries": {"United Arab Emirates"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "International League T20"},
    {"key": "lpl", "sdb_sport": "Cricket", "countries": {"Sri Lanka"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Lanka Premier League"},
    {"key": "psl", "sdb_sport": "Cricket", "countries": {"Pakistan"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Pakistan Super League"},
    {"key": "zimt20", "sdb_sport": "Cricket", "countries": {"Zimbabwe"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Zimbabwe Twenty20"},
    {"key": "mlc", "sdb_sport": "Cricket", "countries": {"United States"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Major League Cricket"},
    {"key": "nepalt20", "sdb_sport": "Cricket", "countries": {"Nepal"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Nepal T20 League"},
    {"key": "supersmash", "sdb_sport": "Cricket", "countries": {"New Zealand"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Super Smash"},
    {"key": "apl", "sdb_sport": "Cricket", "countries": {"Afghanistan"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "T20 Cricket" and t.get("league") == "Afghanistan Premier League"},
    {"key": "euroleague", "sdb_sport": "Basketball", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Basketball" and t.get("league") == "EuroLeague"},
    {"key": "aleague", "sdb_sport": "Soccer", "countries": {"Australia", "New Zealand"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "Australia"},
    {"key": "ligaf", "sdb_sport": "Soccer", "countries": {"Spain"}, "gender": "F", "out": "metadata",
     "match": lambda t: t.get("sport") == "W Football" and t.get("league") == "Liga F"},
    {"key": "cfl", "sdb_sport": "American Football", "countries": {"Canada"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Canadian Football" and t.get("league") == "CFL"},
    {"key": "cba", "sdb_sport": "Basketball", "countries": {"China"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Basketball" and t.get("league") == "CBA"},
    {"key": "handball-bundesliga", "sdb_sport": "Handball", "countries": {"Germany"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Handball" and t.get("league") == "Handball-Bundesliga"},
    # Asian top-flight football (countries=None: distinctive club names, robust to
    # TheSportsDB's country string) + the English National League (5th tier).
    {"key": "j1league", "sdb_sport": "Soccer", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "Japan" and t.get("workbook_level") == "1"},
    {"key": "csl", "sdb_sport": "Soccer", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "China" and t.get("workbook_level") == "1"},
    {"key": "kleague1", "sdb_sport": "Soccer", "countries": None, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "South Korea" and t.get("workbook_level") == "1"},
    {"key": "engnl", "sdb_sport": "Soccer", "countries": {"England", "Wales"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "England" and t.get("workbook_level") == "5"},
    # Gulf + Indian top-flight football. Gulf club names ("Al-Ahli", "Al-Nasr",
    # "Al-Ittihad") recur across countries, so a country filter is required to
    # avoid cross-border mismatches.
    {"key": "saudipro", "sdb_sport": "Soccer", "countries": {"Saudi Arabia"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "Saudi Arabia" and t.get("workbook_level") == "1"},
    {"key": "uaepro", "sdb_sport": "Soccer", "countries": {"United Arab Emirates", "UAE"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "United Arab Emirates" and t.get("workbook_level") == "1"},
    {"key": "qsl", "sdb_sport": "Soccer", "countries": {"Qatar"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "Qatar" and t.get("workbook_level") == "1"},
    {"key": "isl", "sdb_sport": "Soccer", "countries": {"India"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "India" and t.get("workbook_level") == "1"},
    # African top-flight football (country-filtered: "Al-Ahly" etc. recur across countries).
    {"key": "egypt", "sdb_sport": "Soccer", "countries": {"Egypt"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "Egypt" and t.get("workbook_level") == "1"},
    {"key": "rsa", "sdb_sport": "Soccer", "countries": {"South Africa"}, "out": "metadata",
     "match": lambda t: t.get("sport") == "Football" and t.get("league") == "South Africa" and t.get("workbook_level") == "1"},
]

# site name -> better search term when TheSportsDB stores a short/variant name
ALIASES = {
    "Los Angeles Galaxy": "LA Galaxy",
    "Seattle Sounders FC": "Seattle Sounders",
    "Seattle Reign FC": "Seattle Reign",
    "CA River Plate": "River Plate Montevideo",
    # Austria
    "FK Austria Wien": "Austria Vienna",
    "SK Rapid Wien": "Rapid Vienna",
    "SC Rheindorf Altach": "SCR Altach",
    "FC Blau-Weiß Linz": "Blau-Weiss Linz",
    # Belgium
    "KVC Westerlo": "Westerlo",
    "RAA Louviéroise": "RAAL La Louvière",
    "SV Zulte-Waregem": "Zulte Waregem",
    "Sint-Truidense VV": "Sint-Truiden",
    # Turkey
    "Besiktas JK": "Besiktas",
    "Galatasaray SK": "Galatasaray",
    "Çaykur Rizespor": "Rizespor",
    # Denmark
    "AGF Århus": "AGF",
    "Brøndby IF": "Brøndby",
    "FC København": "FC Copenhagen",
    # Sweden
    "AIK Fotboll": "AIK",
    "BK Hacken": "Hacken",
    "Djurgårdens IF": "Djurgarden",
    "GAIS Gothenburg": "GAIS",
    "Hammarby IF": "Hammarby",
    # Russia
    "Dinamo Moscow": "Dynamo Moscow",
    "Krylya Sovetov Samara": "Krylya Sovetov",
    "Zenit St. Petersburg": "Zenit St Petersburg",
    # Ukraine
    "Kryvbas": "Kryvbas Kryvyi Rih",
    "PFC Olexandria": "FC Oleksandriya",
    # Poland
    "Legia Warszawa": "Legia Warsaw",
    "Wisła Płock": "Wisla Plock",
    "Zaglebie Lubin": "Zagłębie Lubin",
    # Greece
    "Olympiakos CFP": "Olympiacos",
    "PAOK Thessaloniki": "PAOK",
    "Aris Thessaloniki": "Aris",
    "Volos NFC": "Volos",
    # Colombia
    "Junior": "Atlético Junior",
    "Águilas Doradas": "Rionegro Águilas",
    # Czech Republic
    "AC Sparta Praha": "Sparta Prague",
    "SK Slavia Praha": "Slavia Prague",
    "FC Viktoria Plzeň": "Viktoria Plzen",
    "FC Baník Ostrava": "Banik Ostrava",
    "FC Slovan Liberec": "Slovan Liberec",
    "FC Slovácko": "Slovacko",
    "FC Zlín": "Zlin",
    "FK Dukla Prague": "Dukla Prague",
    "FK Jablonec 97": "Jablonec",
    "FK Mladá Boleslav": "Mlada Boleslav",
    "FK Pardubice": "Pardubice",
    "FK Teplice": "Teplice",
    "Hradec Králové FC": "Hradec Kralove",
    "MFK Karviná": "Karvina",
    "SK Sigma Olomouc": "Sigma Olomouc",
    "Bohemians 1905": "Bohemians 1905",
    # Switzerland
    "FC Basel": "Basel",
    "FC St. Gallen": "St. Gallen",
    "FC Lucerne": "Luzern",
    "Grasshopper-Club Zürich": "Grasshoppers",
    "Lausanne-Sports": "Lausanne Sport",
}

# site name -> TheSportsDB team id, for clubs the free search cannot surface.
# Look the id up on thesportsdb.com (the team page URL ends in the id) and paste it.
OVERRIDES = {
    # England / US
    "Nottingham Forest": "133720",
    "St. Louis Cardinals": "135280",
    "St. Louis City SC": "147062",
    "Los Angeles Galaxy": "134153",
    # International (free search hid the club, or returned a B/variant)
    "Instituto de Córdoba": "137786",
    "Unión de Santa Fe": "135178",
    "Atlético Paranaense": "134297",
    "Angers SCO": "134709",
    "Stade Rennais FC": "133719",
    "FC St. Pauli": "133813",
    "Hamburger SV": "133651",
    "SC Freiburg": "133653",
    "Internazionale": "133681",
    "CF América": "134193",
    "FC Juárez": "136855",
    "Querétaro FC": "134194",
    "Chivas Guadalajara": "134206",
    "Excelsior Rotterdam": "133757",
    "FC Groningen": "133762",
    "GD Estoril-Praia": "134106",
    "Sporting Braga": "134098",
    "Sporting Clube de Portugal": "135708",
    "VSC Vitória Guimarães": "134115",
    "FC Porto": "134114",
    "Celta de Vigo": "133937",
    "FC Barcelona": "133739",
    "RCD Mallorca": "133733",
    "San Lorenzo": "135173",
    "AS Monaco": "133823",
    "Paris Saint-Germain": "133714",
    # Added 2026-09-13. The free-tier search returns no candidate for these
    # under the workbook's name, so they rendered as monograms on the live
    # standings. Ids read off the club's thesportsdb.com page.
    "FC Schalke 04": "133661",           # search hides it; stored as "Schalke 04"
    "Willem II Tilburg": "133827",       # stored as "Willem II"
    "FK Bodø/Glimt": "135497",           # stored as "Bodø/Glimt"
    "Deportivo Alavés Gloriosas": "144771",  # stored as "Alavés Gloriosas"
    # Stored as "Deportivo de A Coruña", the Galician spelling, so a search for the
    # Castilian "La Coruña" returns only the B team (Deportivo Fabril, 147597).
    "Deportivo de La Coruña": "133816",
    # STILL UNRESOLVED, monogram is correct for now:
    #   "Sabah FK" (Azerbaijan) - search returns only Sabah of Malaysia.
}

# Merge the side-loaded override map (college + AFL/NRL/NWSL/WSL ids harvested from
# the TheSportsDB league pages). Lives next to this script. Keyed by site team name.
_ovr_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "team-overrides.json")
if os.path.exists(_ovr_path):
    try:
        OVERRIDES.update(json.load(open(_ovr_path, encoding="utf-8")))
    except Exception as _e:
        print("could not load team-overrides.json:", _e)

# Formula 1 constructors -> TheSportsDB id, keyed by the display name the F1 hub
# renders (lib/f1 + ESPN standings). Pulled in a post-pass below since F1 is not
# in all-teams.json. Historical constructors (Lotus, Tyrrell, ...) have no entry
# and simply render without a crest.
F1_CONSTRUCTORS = {
    "Mercedes": "134812", "Ferrari": "134806", "McLaren": "134811", "Red Bull": "134813",
    "Alpine F1 Team": "135706", "RB F1 Team": "139631", "Haas F1 Team": "135705",
    "Williams": "134816", "Audi": "137569", "Aston Martin": "135126",
    "Cadillac F1 Team": "154529",
}

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", "and")
    s = re.sub(r"^afc\s+", "", s)
    s = re.sub(r"\s+fc$", "", s)
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")

def sim(a, b):
    a, b = norm(a), norm(b)
    if a == b: return 1.0
    if a and b and (a in b or b in a): return 0.9
    A, B = set(a.split()), set(b.split())
    inter = len(A & B)
    return inter / (len(A) + len(B) - inter) if (A or B) else 0.0

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "metro-enrich/1.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                print(f"  rate limited (429); waiting {RATE_WAIT}s"); time.sleep(RATE_WAIT); continue
            raise
        except Exception as e:
            if i < tries - 1:
                time.sleep(3); continue
            print(f"  ! request failed {url}: {e}"); return {}
    return {}

def query_terms(name):
    if name in ALIASES: return [ALIASES[name]]
    terms = [name.replace("&", "and")]
    stripped = re.sub(r"^AFC\s+", "", name)
    if stripped != name: terms.append(stripped)
    return terms

def lookup(name, sports, countries, gender="M"):
    if isinstance(sports, str): sports = {sports}
    if name in OVERRIDES and OVERRIDES[name]:
        d = get(f"{API}/lookupteam.php?id={OVERRIDES[name]}"); time.sleep(SLEEP)
        t = (d.get("teams") or [None])[0]
        return (t, "override") if t else (None, "override-failed")
    seen = []
    for term in query_terms(name):
        d = get(f"{API}/searchteams.php?t={urllib.parse.quote(term)}")
        time.sleep(SLEEP)
        cands = [t for t in (d.get("teams") or [])
                 if t.get("strSport") in sports
                 and (t.get("strGender") == "Female" if gender == "F" else t.get("strGender") != "Female")
                 and (countries is None or t.get("strCountry") in countries)
                 and not re.search(r"( b| ii| u\d+| reserves?| youth)$", (t.get("strTeam") or "").lower())]
        if cands:
            cmp_name = ALIASES.get(name, name)
            cands.sort(key=lambda t: sim(cmp_name, t.get("strTeam", "")), reverse=True)
            best = cands[0]
            if sim(cmp_name, best.get("strTeam", "")) >= NAME_THRESHOLD:
                return best, "matched"
            seen.append(best.get("strTeam", "?"))
    return None, ("weak:" + ",".join(seen) if seen else "no-candidate")

def download(url, path):
    if not url: return False
    if os.path.exists(path): return True
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "metro-enrich/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
            f.write(r.read())
        return True
    except Exception as e:
        print(f"  ! download failed {url}: {e}"); return False

def route_slug(t):
    u = t.get("team_page_url") or ""
    return u.rstrip("/").split("/")[-1] if u else slug(t["team"])

# Map a US team name -> its on-site franchise slug (so the logo filename and the
# team-metadata.json badge path match what logoUrlFor and the franchise pages use).
_fr_cache = {}
def franchise_slug(sport_key, name):
    if sport_key not in _fr_cache:
        fmap = {}
        try:
            for fr in json.load(open(os.path.join("public", "data", sport_key, "franchises.json"), encoding="utf-8")):
                for k in (fr.get("display_name"), fr.get("name"), fr.get("team")):
                    if k:
                        fmap.setdefault(norm(k), fr["slug"])
        except Exception:
            pass
        _fr_cache[sport_key] = fmap
    return _fr_cache[sport_key].get(norm(name))

def main():
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    prune = "--prune" in argv
    only = None
    for i, a in enumerate(argv):
        if a == "--only" and i + 1 < len(argv):
            only = {k.strip() for k in argv[i + 1].split(",") if k.strip()}
        elif a.startswith("--only="):
            only = {k.strip() for k in a.split("=", 1)[1].split(",") if k.strip()}
    if only:
        unknown = only - {sc["key"] for sc in SCOPES}
        if unknown:
            print(f"unknown scope key(s): {sorted(unknown)}"); return 2

    teams = json.load(open(ALL_TEAMS, encoding="utf-8"))
    existing = {}
    if os.path.exists(OUT_JSON):
        try: existing = json.load(open(OUT_JSON, encoding="utf-8")).get("teams", {})
        except Exception: existing = {}

    work = []
    for t in teams:
        for sc in SCOPES:
            if sc["match"](t):
                if only is None or sc["key"] in only: work.append((t, sc))
                break
    print(f"{len(work)} teams in scope"
          + (f" (--only {','.join(sorted(only))})" if only else "")
          + f"; pacing {SLEEP}s/call (~{int(60/SLEEP)}/min)")

    # Carry forward every entry that is not in scope on THIS run, so a narrowed
    # --only, a relegation or a rename never deletes a crest that pages still
    # reference. In-scope clubs overwrite their carried entry below.
    meta, review = ({} if prune else dict(existing)), []
    tally = {sc["key"]: [0, 0] for sc in SCOPES}
    for t, sc in work:
        name = t["team"]; tally[sc["key"]][1] += 1
        # incremental skip: already resolved on a previous run
        if sc["out"] == "metadata":
            prev = existing.get(name)
            if prev and prev.get("badge") and os.path.exists(os.path.join(BADGE_DIR, f"{slug(name)}.png")):
                meta[name] = prev; tally[sc["key"]][0] += 1; continue
        else:
            sport_key = sc["out"].split(":", 1)[1]
            fslug = franchise_slug(sport_key, name) or route_slug(t)
            if os.path.exists(os.path.join("public", "data", sport_key, "logos", f"{fslug}.png")):
                meta[name] = {"badge": f"/data/{sport_key}/logos/{fslug}.png", "sport": sport_key}
                tally[sc["key"]][0] += 1; continue

        if dry:
            print(f"  ? [{sc['key']}] {name}  (would fetch)")
            review.append((sc["key"], name, "dry-run")); continue

        cset = sc["countries"](t) if callable(sc["countries"]) else sc["countries"]
        m, status = lookup(name, sc["sdb_sport"], cset, sc.get("gender", "M"))
        if not m:
            review.append((sc["key"], name, status))
            print(f"  - [{sc['key']}] {name}: UNMATCHED ({status})"); continue
        tally[sc["key"]][0] += 1
        if sc["out"] == "metadata":
            s = slug(name)
            ok = download(m.get("strBadge"), os.path.join(BADGE_DIR, f"{s}.png"))
            download(m.get("strLogo"), os.path.join(LOGO_DIR, f"{s}.png"))
            meta[name] = {
                "sdb_name": m.get("strTeam"), "sdb_id": m.get("idTeam"),
                "badge": f"/team-badges/{s}.png" if ok else None,
                "logo": f"/team-logos/{s}.png" if m.get("strLogo") else None,
                "stadium": m.get("strStadium"),
                "capacity": int(m["intStadiumCapacity"]) if (m.get("intStadiumCapacity") or "").isdigit() else None,
                "founded": int(m["intFormedYear"]) if (m.get("intFormedYear") or "").isdigit() else None,
                "idESPN": m.get("idESPN"), "idAPIfootball": m.get("idAPIfootball"),
                "sdb_league": m.get("strLeague"),
            }
        else:
            sport_key = sc["out"].split(":", 1)[1]
            fslug = franchise_slug(sport_key, name) or route_slug(t)
            ok = download(m.get("strBadge"), os.path.join("public", "data", sport_key, "logos", f"{fslug}.png"))
            if ok:
                meta[name] = {"badge": f"/data/{sport_key}/logos/{fslug}.png", "sport": sport_key,
                              "sdb_name": m.get("strTeam"), "sdb_id": m.get("idTeam")}
        print(f"  + [{sc['key']}] {name} -> {m.get('strTeam')}")

    # --- Formula 1 constructors (pulled by id; not present in all-teams.json) ---
    for cname, cid in F1_CONSTRUCTORS.items():
        s = slug(cname)
        prev = existing.get(cname)
        if prev and prev.get("badge") and os.path.exists(os.path.join(BADGE_DIR, f"{s}.png")):
            meta[cname] = prev; continue
        if only is not None and "f1" not in only: continue
        if dry:
            print(f"  ? [f1] {cname}  (would fetch)"); continue
        d = get(f"{API}/lookupteam.php?id={cid}"); time.sleep(SLEEP)
        m = (d.get("teams") or [None])[0]
        if not m:
            print(f"  - [f1] {cname}: lookup failed"); continue
        ok = download(m.get("strBadge"), os.path.join(BADGE_DIR, f"{s}.png"))
        download(m.get("strLogo"), os.path.join(LOGO_DIR, f"{s}.png"))
        meta[cname] = {"sdb_name": m.get("strTeam"), "sdb_id": m.get("idTeam"),
                       "badge": f"/team-badges/{s}.png" if ok else None,
                       "logo": f"/team-logos/{s}.png" if m.get("strLogo") else None,
                       "sport": "f1"}
        print(f"  + [f1] {cname} -> {m.get('strTeam')}")

    carried = len(set(meta) - {t["team"] for t, _ in work} - set(F1_CONSTRUCTORS))
    if dry:
        print("\n=== dry run: nothing written ===")
        print(f"  would fetch : {len(review)}")
        print(f"  would carry : {carried} entries not in scope on this run")
        print(f"  teams out   : {len(meta)} (was {len(existing)})")
        return 0

    # Never shrink the file by accident. A legitimate --prune is the only way
    # entries leave, and it has to be asked for.
    if not prune and len(meta) < len(existing):
        print(f"REFUSING to write: {len(meta)} entries < {len(existing)} existing."
              " Carry-forward should make this impossible; investigate before rerunning.")
        return 1

    json.dump({"generated": time.strftime("%Y-%m-%d"), "matched": len(meta),
               "unmatched": [n for _, n, _ in review], "teams": meta},
              open(OUT_JSON, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    # A narrowed run has 0/0 tallies for every scope it skipped, so writing the
    # review would erase the real one. Only a full run may rewrite it.
    if only is None:
        with open(REVIEW, "w", encoding="utf-8") as f:
            f.write(f"# Team metadata review ({time.strftime('%Y-%m-%d')})\n\n")
            for sc in SCOPES:
                ok, tot = tally[sc["key"]]; f.write(f"- **{sc['key']}**: matched {ok}/{tot}\n")
            f.write("\n## Unmatched (pin a TheSportsDB id in OVERRIDES, or accept the monogram)\n\n")
            for key, n, s in review:
                f.write(f"- [{key}] **{n}** - {s}\n")
    else:
        print(f"  (--only run: {REVIEW} left alone)")

    print("\n=== summary ===")
    for sc in SCOPES:
        ok, tot = tally[sc["key"]]; print(f"  {sc['key']}: {ok}/{tot}")
    print(f"wrote {OUT_JSON} ({len(meta)} football crests) + {REVIEW}")

if __name__ == "__main__":
    sys.exit(main())
