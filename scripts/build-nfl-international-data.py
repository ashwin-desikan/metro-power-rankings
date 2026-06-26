#!/usr/bin/env python3
"""Build public/data/nfl/international-series.json — the modern NFL
International Series (regular-season games played outside the US), for the
"International Series" section of /teams/nfl/international.

Source: Wikipedia "NFL International Series" (Results tables). Only games with
a known matchup are included (played games plus scheduled 2026 games); pure
TBA future rows are omitted. The 2018 Mexico City game is omitted because it
was relocated to Los Angeles and never played abroad.

Team names are the contemporaneous names; slugs resolve to the current
franchise (San Diego -> LA Chargers, St. Louis -> LA Rams, Oakland -> Las
Vegas Raiders, Washington Redskins -> Commanders). Metro and country slugs
come from public/data/metros.json. Re-run:
    python scripts/build-nfl-international-data.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "nfl", "international-series.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
FRANCHISES = os.path.join(ROOT, "public", "data", "nfl", "franchises.json")

# franchise full-name -> current slug
fr = {f["name"]: f["slug"] for f in json.load(open(FRANCHISES, encoding="utf-8"))}
# relocated / renamed historical names -> current franchise slug
ALIAS = {
    "San Diego Chargers": "los-angeles-chargers",
    "St. Louis Rams": "los-angeles-rams",
    "Oakland Raiders": "las-vegas-raiders",
    "Washington Redskins": "washington-commanders",
}
def team_slug(name):
    return fr.get(name) or ALIAS.get(name)

# metro lookup by display name; a couple of article spellings need normalizing
metros = {m["name"]: m for m in json.load(open(METROS, encoding="utf-8"))}
CITY_TO_METRO = {"São Paulo": "Sao Paulo"}
def metro_rec(city):
    return metros.get(CITY_TO_METRO.get(city, city))

MONTHS = ["", "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]

# (year, month, day, visitor, home, stadium, city)
GAMES = [
    # Australia
    (2026, 9, 11, "San Francisco 49ers", "Los Angeles Rams", "Melbourne Cricket Ground", "Melbourne"),
    # Brazil
    (2024, 9, 6, "Green Bay Packers", "Philadelphia Eagles", "Arena Corinthians", "São Paulo"),
    (2025, 9, 5, "Kansas City Chiefs", "Los Angeles Chargers", "Arena Corinthians", "São Paulo"),
    (2026, 9, 27, "Baltimore Ravens", "Dallas Cowboys", "Maracanã Stadium", "Rio de Janeiro"),
    # France
    (2026, 10, 25, "Pittsburgh Steelers", "New Orleans Saints", "Stade de France", "Paris"),
    # Germany
    (2022, 11, 13, "Seattle Seahawks", "Tampa Bay Buccaneers", "Allianz Arena", "Munich"),
    (2023, 11, 5, "Miami Dolphins", "Kansas City Chiefs", "Deutsche Bank Park", "Frankfurt"),
    (2023, 11, 12, "Indianapolis Colts", "New England Patriots", "Deutsche Bank Park", "Frankfurt"),
    (2024, 11, 10, "New York Giants", "Carolina Panthers", "Allianz Arena", "Munich"),
    (2025, 11, 9, "Atlanta Falcons", "Indianapolis Colts", "Olympiastadion", "Berlin"),
    (2026, 11, 15, "New England Patriots", "Detroit Lions", "Allianz Arena", "Munich"),
    # Ireland
    (2025, 9, 28, "Minnesota Vikings", "Pittsburgh Steelers", "Croke Park", "Dublin"),
    # Mexico
    (2016, 11, 21, "Houston Texans", "Oakland Raiders", "Estadio Azteca", "Mexico City"),
    (2017, 11, 19, "New England Patriots", "Oakland Raiders", "Estadio Azteca", "Mexico City"),
    (2019, 11, 18, "Kansas City Chiefs", "Los Angeles Chargers", "Estadio Azteca", "Mexico City"),
    (2022, 11, 21, "San Francisco 49ers", "Arizona Cardinals", "Estadio Azteca", "Mexico City"),
    (2026, 11, 22, "Minnesota Vikings", "San Francisco 49ers", "Estadio Banorte", "Mexico City"),
    # Spain
    (2025, 11, 16, "Washington Commanders", "Miami Dolphins", "Bernabéu", "Madrid"),
    (2026, 11, 8, "Cincinnati Bengals", "Atlanta Falcons", "Bernabéu", "Madrid"),
    # United Kingdom (all London)
    (2007, 10, 28, "New York Giants", "Miami Dolphins", "Wembley Stadium", "London"),
    (2008, 10, 26, "San Diego Chargers", "New Orleans Saints", "Wembley Stadium", "London"),
    (2009, 10, 25, "New England Patriots", "Tampa Bay Buccaneers", "Wembley Stadium", "London"),
    (2010, 10, 31, "Denver Broncos", "San Francisco 49ers", "Wembley Stadium", "London"),
    (2011, 10, 23, "Chicago Bears", "Tampa Bay Buccaneers", "Wembley Stadium", "London"),
    (2012, 10, 28, "New England Patriots", "St. Louis Rams", "Wembley Stadium", "London"),
    (2013, 9, 29, "Pittsburgh Steelers", "Minnesota Vikings", "Wembley Stadium", "London"),
    (2013, 10, 27, "San Francisco 49ers", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2014, 9, 28, "Miami Dolphins", "Oakland Raiders", "Wembley Stadium", "London"),
    (2014, 10, 26, "Detroit Lions", "Atlanta Falcons", "Wembley Stadium", "London"),
    (2014, 11, 9, "Dallas Cowboys", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2015, 10, 4, "New York Jets", "Miami Dolphins", "Wembley Stadium", "London"),
    (2015, 10, 25, "Buffalo Bills", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2015, 11, 1, "Detroit Lions", "Kansas City Chiefs", "Wembley Stadium", "London"),
    (2016, 10, 2, "Indianapolis Colts", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2016, 10, 23, "New York Giants", "Los Angeles Rams", "Twickenham Stadium", "London"),
    (2016, 10, 30, "Washington Redskins", "Cincinnati Bengals", "Wembley Stadium", "London"),
    (2017, 9, 24, "Baltimore Ravens", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2017, 10, 1, "New Orleans Saints", "Miami Dolphins", "Wembley Stadium", "London"),
    (2017, 10, 22, "Arizona Cardinals", "Los Angeles Rams", "Twickenham Stadium", "London"),
    (2017, 10, 29, "Minnesota Vikings", "Cleveland Browns", "Twickenham Stadium", "London"),
    (2018, 10, 14, "Seattle Seahawks", "Oakland Raiders", "Wembley Stadium", "London"),
    (2018, 10, 21, "Tennessee Titans", "Los Angeles Chargers", "Wembley Stadium", "London"),
    (2018, 10, 28, "Philadelphia Eagles", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2019, 10, 6, "Chicago Bears", "Oakland Raiders", "Tottenham Hotspur Stadium", "London"),
    (2019, 10, 13, "Carolina Panthers", "Tampa Bay Buccaneers", "Tottenham Hotspur Stadium", "London"),
    (2019, 10, 27, "Cincinnati Bengals", "Los Angeles Rams", "Wembley Stadium", "London"),
    (2019, 11, 3, "Houston Texans", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2021, 10, 10, "New York Jets", "Atlanta Falcons", "Tottenham Hotspur Stadium", "London"),
    (2021, 10, 17, "Miami Dolphins", "Jacksonville Jaguars", "Tottenham Hotspur Stadium", "London"),
    (2022, 10, 2, "Minnesota Vikings", "New Orleans Saints", "Tottenham Hotspur Stadium", "London"),
    (2022, 10, 9, "New York Giants", "Green Bay Packers", "Tottenham Hotspur Stadium", "London"),
    (2022, 10, 30, "Denver Broncos", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2023, 10, 1, "Atlanta Falcons", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2023, 10, 8, "Jacksonville Jaguars", "Buffalo Bills", "Tottenham Hotspur Stadium", "London"),
    (2023, 10, 15, "Baltimore Ravens", "Tennessee Titans", "Tottenham Hotspur Stadium", "London"),
    (2024, 10, 6, "New York Jets", "Minnesota Vikings", "Tottenham Hotspur Stadium", "London"),
    (2024, 10, 13, "Jacksonville Jaguars", "Chicago Bears", "Tottenham Hotspur Stadium", "London"),
    (2024, 10, 20, "New England Patriots", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2025, 10, 5, "Minnesota Vikings", "Cleveland Browns", "Tottenham Hotspur Stadium", "London"),
    (2025, 10, 12, "Denver Broncos", "New York Jets", "Tottenham Hotspur Stadium", "London"),
    (2025, 10, 19, "Los Angeles Rams", "Jacksonville Jaguars", "Wembley Stadium", "London"),
    (2026, 10, 4, "Indianapolis Colts", "Washington Commanders", "Tottenham Hotspur Stadium", "London"),
    (2026, 10, 11, "Philadelphia Eagles", "Jacksonville Jaguars", "Tottenham Hotspur Stadium", "London"),
    (2026, 10, 18, "Houston Texans", "Jacksonville Jaguars", "Wembley Stadium", "London"),
]

warn = set()
games = []
for (yr, mo, day, vis, home, stad, city) in GAMES:
    m = metro_rec(city)
    if not m:
        warn.add(("metro", city))
    if not team_slug(vis): warn.add(("team", vis))
    if not team_slug(home): warn.add(("team", home))
    games.append({
        "season": yr,
        "date": f"{yr:04d}-{mo:02d}-{day:02d}",
        "date_display": f"{MONTHS[mo]} {day}, {yr}",
        "visitor": {"name": vis, "slug": team_slug(vis)},
        "home": {"name": home, "slug": team_slug(home)},
        "stadium": stad,
        "metro": {"name": city, "slug": (m or {}).get("slug")},
        "country": {"name": (m or {}).get("country"), "slug": (m or {}).get("countrySlug")},
    })

if warn:
    print("WARNING unresolved:", sorted(warn))

games.sort(key=lambda g: (g["date"], g["metro"]["name"]), reverse=True)

countries = sorted({g["country"]["name"] for g in games if g["country"]["name"]})
out = {
    "meta": {
        "name": "NFL International Series",
        "blurb": "NFL regular-season games played outside the United States, from the first London game in 2007 to the current slate. Excludes the 2018 Mexico City game, which was relocated to Los Angeles, and future fixtures without a confirmed matchup.",
        "source": "Wikipedia, NFL International Series (Results).",
        "count": len(games),
        "countries": countries,
        "first_season": min(g["season"] for g in games),
        "last_season": max(g["season"] for g in games),
    },
    "games": games,
}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Wrote {OUT}")
print(f"  {len(games)} games across {len(countries)} countries: {', '.join(countries)}")
