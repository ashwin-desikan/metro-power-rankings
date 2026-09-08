#!/usr/bin/env python3
"""
Builds public/data/sports/moves.json: a ledger of every franchise relocation
the site knows, across every league it carries data for.

Two source paths:

(a) The big four (NFL/NBA/NHL/MLB) each carry a per-team year-by-year sheet:
    public/data/{lg}/seasons-by-team.json (active franchises, keyed by
    current slug) and public/data/{lg}/historical-seasons.json (defunct
    franchises, keyed by canonical name for nfl/mlb, by slug for nba/nhl -
    see the KEY_BY dict). A franchise's rows are walked in year order; a
    change in the `city` field between consecutive seasons is a move. The
    move's year is the arrival year (the first season in the new city),
    matching how these are conventionally dated ("the Rams moved to LA in
    1946").

(b) Every other league (NRL, CFL, WNBA, IPL, AFL, football, rugby, NPB, T20)
    has no per-season sheet here, so moves come from
    public/data/sports/relocations-by-metro.json: a row with kind
    "relocated" under metro key M says a franchise that used to play in M
    now lives elsewhere. The destination is resolved by looking up the
    row's href in the league's own team file.

Usage:
  python3 scripts/build-moves.py              # write public/data/sports/moves.json
  python3 scripts/build-moves.py --self-test  # run the built-in checks, no write
  python3 scripts/build-moves.py --dry-run    # build + print totals, no write
"""
import argparse
import datetime
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "sports", "moves.json")

BIG4 = ["nfl", "nba", "nhl", "mlb"]
SPORT = {
    "nfl": "American Football", "nba": "Basketball", "nhl": "Hockey", "mlb": "Baseball",
    "wnba": "W Basketball", "ipl": "Cricket", "football": "Football/Soccer",
    "cfl": "Canadian Football", "afl": "Aussie Rules", "nrl": "Rugby League",
    "rugby-union": "Rugby Union", "npb": "Baseball (Japan)", "cricket-t20": "Cricket (T20)",
}
# nfl/mlb historical-seasons.json is keyed by the historical.json `canonical`
# field; nba/nhl's is keyed by `slug`. See scripts/DATA-READS-RECIPE.md note:
# this is a fixed, small map, not a dynamic path, so it stays plain Python.
KEY_BY = {"nfl": "canonical", "mlb": "canonical", "nba": "slug", "nhl": "slug"}


def load(rel):
    with open(os.path.join(ROOT, rel), "r", encoding="utf-8-sig") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# City/metro slug resolution, following scripts/build-relocations.py's m2slug.
# ---------------------------------------------------------------------------

METRO_ALIAS = {
    "baltimore": "washington-baltimore", "san francisco": "san-francisco-san-jose",
    "st.louis": "st-louis", "st. louis": "st-louis", "raleigh": "raleigh-durham",
    "greensboro": "greensboro-winston-salem",
    # Historical BIG4 cities not covered by build-relocations' alias set,
    # because that script only ever needs a franchise's CURRENT/FINAL metro.
    # This script needs every city a franchise ever played in.
    "oakland": "san-francisco-san-jose", "anaheim": "los-angeles",
    "brooklyn": "new-york", "minneapolis": "minneapolis-st-paul",
    "st. paul": "minneapolis-st-paul", "ft. wayne": "fort-wayne",
    "fort wayne": "fort-wayne", "tri-cities": "quad-cities",
    "phila-pit": "philadelphia", "arizona": "phoenix", "utah": "salt-lake-city",
    "carolina": "charlotte", "tennessee": "nashville", "new england": "boston",
    "golden state": "san-francisco-san-jose", "texas": "dallas-fort-worth",
    "washington": "washington-baltimore", "california": "los-angeles",
    "los angeles/anaheim": "los-angeles", "florida": "miami",
    "pittsburg": "pittsburgh", "minnesota": "minneapolis-st-paul",
    "capital": "washington-baltimore", "staten island": "new-york",
    "newark": "new-york", "alberta": "edmonton",
}
NA_DISAMBIG = {"birmingham": "birmingham-al"}


def slugify(s):
    s = unicodedata.normalize("NFKD", str(s).lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", s))


def build_m2slug(metros):
    exact = {m["name"].strip().lower(): m["slug"] for m in metros}

    def m2slug(name):
        k = str(name).strip().lower()
        return NA_DISAMBIG.get(k) or exact.get(k) or METRO_ALIAS.get(k)

    return m2slug


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def decade_of(year):
    return f"{(year // 10) * 10}s"


# ---------------------------------------------------------------------------
# Part (a): the big four, from per-season sheets.
# ---------------------------------------------------------------------------

def champ_flag(row):
    return 1 if row.get("champ") else 0


def big4_franchises(lg, m2slug, metros_by_slug):
    """Yields (franchise_slug, franchise_now, href, sorted_rows) for every
    franchise (active + historical) in league `lg`, each row carrying at
    least year/city/team/champ."""
    active = load(f"public/data/{lg}/franchises.json")
    historical = load(f"public/data/{lg}/historical.json")
    seasons_active = load(f"public/data/{lg}/seasons-by-team.json")
    seasons_hist = load(f"public/data/{lg}/historical-seasons.json")
    hist_key = KEY_BY[lg]

    for f in active:
        rows = seasons_active.get(f["slug"]) or []
        if not rows:
            continue
        yield f["slug"], f["name"], f"/teams/{lg}/{f['slug']}", sorted(rows, key=lambda r: r["year"])
    for h in historical:
        key = h.get(hist_key)
        rows = seasons_hist.get(key) or []
        if not rows:
            continue
        slug = h.get("slug") or slugify(h.get("canonical"))
        name = h.get("display_name") or h.get("canonical") or h.get("name")
        yield slug, name, f"/teams/{lg}/{slug}", sorted(rows, key=lambda r: r["year"])


def build_big4_moves(lg, m2slug, metros_by_slug):
    moves = []
    for slug, franchise_now, href, rows in big4_franchises(lg, m2slug, metros_by_slug):
        # Break the season list into contiguous same-city stints.
        stints = []  # [{city, start_idx, end_idx (exclusive)}]
        for i, r in enumerate(rows):
            city = r.get("city") or ""
            if not stints or stints[-1]["city"] != city:
                stints.append({"city": city, "rows": []})
            stints[-1]["rows"].append(r)

        for i in range(1, len(stints)):
            prev, cur = stints[i - 1], stints[i]
            from_city, to_city = prev["city"], cur["city"]
            from_slug, to_slug = m2slug(from_city), m2slug(to_city)
            year = cur["rows"][0]["year"]
            same_metro = bool(from_slug and to_slug and from_slug == to_slug and from_city != to_city)

            dist = None
            if from_slug and to_slug and from_slug in metros_by_slug and to_slug in metros_by_slug:
                a, b = metros_by_slug[from_slug], metros_by_slug[to_slug]
                dist = round(haversine(a["lat"], a["lon"], b["lat"], b["lon"]), 1)

            seasons_before = len(prev["rows"])
            titles_before = sum(champ_flag(r) for r in prev["rows"])
            titles_after = sum(champ_flag(r) for r in cur["rows"])  # this stint, to date

            def metro_name(slug_, city_):
                return metros_by_slug[slug_]["name"] if slug_ in metros_by_slug else city_

            moves.append({
                "league": lg, "sport": SPORT[lg], "franchise_slug": slug,
                "franchise_now": franchise_now, "href": href,
                "from": {"city": from_city, "metro": metro_name(from_slug, from_city),
                         "metro_slug": from_slug, "name": f"{from_city} {prev['rows'][-1]['team']}".strip()},
                "to": {"city": to_city, "metro": metro_name(to_slug, to_city),
                       "metro_slug": to_slug, "name": f"{to_city} {cur['rows'][0]['team']}".strip()},
                "year": year, "decade": decade_of(year), "same_metro": same_metro,
                "distance_km": dist, "seasons_before": seasons_before,
                "titles_before": titles_before, "titles_after": titles_after,
                "returned": False, "replaced_by": None,
            })
    return moves


# ---------------------------------------------------------------------------
# Part (b): the rest, from relocations-by-metro.json's "relocated" rows.
# ---------------------------------------------------------------------------

LEAGUE_FILE = {
    "nrl": "public/data/nrl/data.json", "cfl": "public/data/cfl/data.json",
    "wnba": "public/data/wnba/data.json", "ipl": "public/data/ipl/data.json",
    "afl": "public/data/afl/data.json",
}


def resolve_current_metro(league, href, all_teams):
    """Find the destination franchise's current metro via its own league
    file where available, else fall back to public/data/sports/all-teams.json
    matched by team_page_url."""
    slug = href.rsplit("/", 1)[-1]
    key = LEAGUE_FILE.get(league)
    if key:
        try:
            franchises = load(key).get("franchises", [])
            for f in franchises:
                if f.get("slug") == slug:
                    return f.get("metro_slug"), f.get("name")
        except Exception:
            pass
    for t in all_teams:
        if t.get("team_page_url") == href:
            return t.get("metro_slug"), t.get("team")
    return None, None


def build_other_moves(m2slug, metros_by_slug):
    reloc = load("public/data/sports/relocations-by-metro.json")
    all_teams = load("public/data/sports/all-teams.json")
    moves = []
    for origin_slug, rows in reloc.items():
        for r in rows:
            if r.get("kind") != "relocated" or r["league"] in BIG4:
                continue
            lg = r["league"]
            years = re.findall(r"\d{4}", r.get("years") or "")
            year = int(years[-1]) if years else None
            if year is None:
                continue
            to_slug, to_name = resolve_current_metro(lg, r["href"], all_teams)

            def metro_name(slug_):
                return metros_by_slug[slug_]["name"] if slug_ in metros_by_slug else slug_

            dist = None
            if to_slug and origin_slug in metros_by_slug and to_slug in metros_by_slug:
                a, b = metros_by_slug[origin_slug], metros_by_slug[to_slug]
                dist = round(haversine(a["lat"], a["lon"], b["lat"], b["lon"]), 1)

            stats = r.get("stats") or {}
            titles_before = stats.get("champ") or stats.get("prem") or 0

            moves.append({
                "league": lg, "sport": r.get("sport") or SPORT.get(lg, ""),
                "franchise_slug": r["href"].rsplit("/", 1)[-1],
                "franchise_now": to_name or r["name"], "href": r["href"],
                "from": {"city": r["name"], "metro": metro_name(origin_slug),
                         "metro_slug": origin_slug, "name": r["name"]},
                "to": {"city": to_name or "", "metro": metro_name(to_slug) if to_slug else "",
                       "metro_slug": to_slug, "name": to_name or ""},
                "year": year, "decade": decade_of(year),
                "same_metro": bool(to_slug and to_slug == origin_slug),
                "distance_km": dist, "seasons_before": stats.get("seasons"),
                "titles_before": titles_before, "titles_after": None,
                "returned": False, "replaced_by": None,
            })
    return moves


# ---------------------------------------------------------------------------
# Cross-move enrichment: `returned` / `replaced_by`.
# ---------------------------------------------------------------------------

def enrich_returns(moves):
    by_league = defaultdict(list)
    for m in moves:
        by_league[m["league"]].append(m)
    for lg, lg_moves in by_league.items():
        lg_moves_sorted = sorted(lg_moves, key=lambda m: m["year"])
        for m in lg_moves:
            from_slug = m["from"]["metro_slug"]
            if not from_slug:
                continue
            # (a) the same franchise later plays in that metro again.
            same_franchise_return = any(
                o["franchise_slug"] == m["franchise_slug"] and o["to"]["metro_slug"] == from_slug
                and o["year"] > m["year"]
                for o in lg_moves_sorted
            )
            # (b) a different same-league franchise later arrives there
            # (either by relocating in, or, for the big four, by beginning
            # its documented history there after this departure).
            arrivals = [
                o for o in lg_moves_sorted
                if o["franchise_slug"] != m["franchise_slug"] and o["to"]["metro_slug"] == from_slug
                and o["year"] > m["year"]
            ]
            replaced = arrivals[0] if arrivals else None
            if same_franchise_return or replaced:
                m["returned"] = True
            if replaced:
                m["replaced_by"] = {"name": replaced["franchise_now"], "year": replaced["year"]}
    return moves


# ---------------------------------------------------------------------------
# Summary block.
# ---------------------------------------------------------------------------

def build_summary(moves):
    by_league = Counter(m["league"] for m in moves)
    by_decade = Counter(m["decade"] for m in moves)
    by_sport = Counter(m["sport"] for m in moves)

    dep = Counter()
    dep_events = defaultdict(list)
    arr = Counter()
    arr_events = defaultdict(list)
    for m in moves:
        fs = m["from"]["metro_slug"]
        ts = m["to"]["metro_slug"]
        if fs:
            dep[fs] += 1
            dep_events[fs].append({"franchise": m["franchise_now"], "year": m["year"], "to": m["to"]["metro"]})
        if ts:
            arr[ts] += 1
            arr_events[ts].append({"franchise": m["franchise_now"], "year": m["year"], "from": m["from"]["metro"]})

    all_metros = set(dep) | set(arr)
    metro_net = sorted(
        ({"metro_slug": ms, "departures": dep.get(ms, 0), "arrivals": arr.get(ms, 0),
          "net": arr.get(ms, 0) - dep.get(ms, 0)} for ms in all_metros),
        key=lambda x: (-x["departures"], x["metro_slug"]),
    )
    top_losers = sorted(metro_net, key=lambda x: (-x["departures"], x["metro_slug"]))[:15]
    top_gainers = sorted(metro_net, key=lambda x: (-x["arrivals"], x["metro_slug"]))[:15]

    with_dist = [m for m in moves if m["distance_km"] is not None]
    longest = sorted(with_dist, key=lambda m: -m["distance_km"])[:10]
    shortest = sorted(with_dist, key=lambda m: m["distance_km"])[:10]

    busiest_decade_by_league = {}
    per_league_decade = defaultdict(Counter)
    for m in moves:
        per_league_decade[m["league"]][m["decade"]] += 1
    for lg, c in per_league_decade.items():
        busiest_decade_by_league[lg] = c.most_common(1)[0][0] if c else None

    returns = sum(1 for m in moves if m["returned"])

    return {
        "by_league": dict(by_league), "by_decade": dict(sorted(by_decade.items())),
        "by_sport": dict(by_sport),
        "top_losing_metros": top_losers, "top_gaining_metros": top_gainers,
        "longest": [{"franchise": m["franchise_now"], "league": m["league"],
                     "from": m["from"]["metro"], "to": m["to"]["metro"],
                     "year": m["year"], "distance_km": m["distance_km"]} for m in longest],
        "shortest": [{"franchise": m["franchise_now"], "league": m["league"],
                      "from": m["from"]["metro"], "to": m["to"]["metro"],
                      "year": m["year"], "distance_km": m["distance_km"]} for m in shortest],
        "busiest_decade_by_league": busiest_decade_by_league,
        "returns": returns,
        "total_moves": len(moves),
    }


# ---------------------------------------------------------------------------
# Self-test.
# ---------------------------------------------------------------------------

def self_test():
    metros = load("public/data/metros.json")
    metros_by_slug = {m["slug"]: m for m in metros}
    m2slug = build_m2slug(metros)

    all_moves = []
    for lg in BIG4:
        all_moves += build_big4_moves(lg, m2slug, metros_by_slug)
    all_moves += build_other_moves(m2slug, metros_by_slug)
    all_moves = enrich_returns(all_moves)

    def find(league, slug, year):
        for m in all_moves:
            if m["league"] == league and m["franchise_slug"] == slug and m["year"] == year:
                return m
        return None

    ok = True

    def check(label, cond):
        nonlocal ok
        status = "OK" if cond else "FAIL"
        if not cond:
            ok = False
        print(f"  [{status}] {label}")

    # Rams: Cleveland 1946 LA, LA 1995 StL, StL 2016 LA. `returned` true on the 1995 row.
    rams_1946 = find("nfl", "los-angeles-rams", 1946)
    rams_1995 = find("nfl", "los-angeles-rams", 1995)
    rams_2016 = find("nfl", "los-angeles-rams", 2016)
    check("Rams 1946: Cleveland -> Los Angeles",
          rams_1946 and rams_1946["from"]["city"] == "Cleveland" and rams_1946["to"]["city"] == "Los Angeles")
    check("Rams 1995: Los Angeles -> St. Louis",
          rams_1995 and rams_1995["from"]["city"] == "Los Angeles" and rams_1995["to"]["city"] == "St. Louis")
    check("Rams 2016: St. Louis -> Los Angeles",
          rams_2016 and rams_2016["from"]["city"] == "St. Louis" and rams_2016["to"]["city"] == "Los Angeles")
    check("Rams 1995 row is flagged returned (they come back to LA in 2016)",
          rams_1995 and rams_1995["returned"] is True)

    # Raiders: Oakland -> LA -> Oakland -> Las Vegas.
    raiders_1982 = find("nfl", "las-vegas-raiders", 1982)
    raiders_1995 = find("nfl", "las-vegas-raiders", 1995)
    raiders_2020 = find("nfl", "las-vegas-raiders", 2020)
    check("Raiders 1982: Oakland -> Los Angeles",
          raiders_1982 and raiders_1982["from"]["city"] == "Oakland" and raiders_1982["to"]["city"] == "Los Angeles")
    check("Raiders 1995: Los Angeles -> Oakland",
          raiders_1995 and raiders_1995["from"]["city"] == "Los Angeles" and raiders_1995["to"]["city"] == "Oakland")
    check("Raiders 2020: Oakland -> Las Vegas",
          raiders_2020 and raiders_2020["from"]["city"] == "Oakland" and raiders_2020["to"]["city"] == "Las Vegas")

    # Braves: Boston -> Milwaukee -> Atlanta.
    braves_1953 = find("mlb", "braves", 1953)
    braves_1966 = find("mlb", "braves", 1966)
    check("Braves 1953: Boston -> Milwaukee",
          braves_1953 and braves_1953["from"]["city"] == "Boston" and braves_1953["to"]["city"] == "Milwaukee")
    check("Braves 1966: Milwaukee -> Atlanta",
          braves_1966 and braves_1966["from"]["city"] == "Milwaukee" and braves_1966["to"]["city"] == "Atlanta")

    # Jets/Coyotes: Winnipeg -> Phoenix (1997, as Coyotes), then Winnipeg
    # gets the Thrashers (2012) as a same-league arrival -> replaced_by.
    coyotes_1997 = find("nhl", "coyotes", 1997)
    check("Coyotes 1997: Winnipeg -> Phoenix",
          coyotes_1997 and coyotes_1997["from"]["city"] == "Winnipeg" and coyotes_1997["to"]["city"] == "Phoenix")
    check("Coyotes 1997 row: Winnipeg replaced_by the Thrashers-turned-Jets arrival",
          coyotes_1997 and coyotes_1997["replaced_by"] is not None
          and coyotes_1997["replaced_by"]["year"] == 2012)

    print(f"\n{'ALL SELF-TESTS PASSED' if ok else 'SELF-TEST FAILURES ABOVE'}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        ok = self_test()
        sys.exit(0 if ok else 1)

    metros = load("public/data/metros.json")
    metros_by_slug = {m["slug"]: m for m in metros}
    m2slug = build_m2slug(metros)

    all_moves = []
    for lg in BIG4:
        moves = build_big4_moves(lg, m2slug, metros_by_slug)
        all_moves += moves
        print(f"  {lg}: {len(moves)} moves")
    other = build_other_moves(m2slug, metros_by_slug)
    all_moves += other
    print(f"  other leagues: {len(other)} moves")

    all_moves = enrich_returns(all_moves)
    all_moves.sort(key=lambda m: m["year"])

    summary = build_summary(all_moves)
    out = {
        "as_of": datetime.date.today().isoformat(),
        "count": len(all_moves),
        "moves": all_moves,
        "summary": summary,
    }

    print(f"\nTotal moves: {len(all_moves)}")
    print("By league:", dict(summary["by_league"]))
    print("By decade:", dict(summary["by_decade"]))
    print(f"Returns: {summary['returns']}")

    if args.dry_run:
        print("\n(dry run, not written)")
        return

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
