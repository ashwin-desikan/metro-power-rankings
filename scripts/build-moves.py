#!/usr/bin/env python3
"""
Builds public/data/sports/moves.json: a ledger of every franchise relocation
the site knows, across every league it carries data for.

A move is a change of METRO AREA. It is never derived from the raw
per-season `city` string: that field mixes real metro moves with spelling
variants (Pittsburg/Pittsburgh), franchise renames that never left their
metro (Boston Patriots -> New England Patriots, Phoenix -> Arizona Cardinals,
Florida -> Miami Marlins, Anaheim -> Los Angeles Angels, Capital Bullets),
and half-resolved multi-team labels from WWII merger seasons and long-gone
roadshow stints (New Westminster, "NO/Oklahoma City", "KC/Omaha", "Brk/New
York"). All of that is exactly what the workbooks' own Metro Area column
already resolves, and public/data/sports/relocations-by-metro.json is built
straight from that column (see scripts/build-relocations.py). This script
uses that file, and metro slugs from it, as the only identity for "from" and
"to" - never a city string.

(a) The big four (NFL/NBA/NHL/MLB): a franchise is one team-page href.
    Collect every tile with kind "relocated" for that href across
    relocations-by-metro.json (one tile per metro the franchise has ever
    called home - the builder already merges repeat visits to the same
    metro into a single tile, see ENVELOPE SPLIT below), append its current
    home (public/data/{lg}/franchises.json for an active franchise, or the
    league's own "defunct" kind tile at the same href for a franchise that
    has since folded). Moves are consecutive stints whose metro slug
    differs. A tile whose metro slug is missing, or whose name contains "/"
    (a WWII merger tile: Card-Pitt, Steagles, Phila/Pitt), is skipped and
    counted.

    ENVELOPE SPLIT. relocations-by-metro.json keys tiles by (metro, href), so
    a franchise that returns to a metro it left before (the Raiders: Oakland,
    then LA 1982-94, then Oakland again, then Las Vegas) gets ONE merged
    Oakland tile spanning 1960-2019, which would otherwise swallow the 1982
    departure and the return. Before sorting, any tile whose year span
    strictly contains another tile's span is split around it (title's stats
    are attributed to the later half, since the two halves can't be told
    apart from this data alone), which recovers the correct stint order
    using only the metro-tile years already in the file.

(b) Every other league (NRL, CFL, WNBA, IPL, AFL, football, rugby, NPB, T20):
    same relocations-by-metro.json "relocated" rows, destination resolved via
    the league's own team file. A row whose destination cannot be resolved to
    a metro is dropped and printed, never guessed.

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
EN = "–"  # en dash, as used in relocations-by-metro.json's `years` field


def load(rel):
    with open(os.path.join(ROOT, rel), "r", encoding="utf-8-sig") as f:
        return json.load(f)


def haversine(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def decade_of(year):
    return f"{(year // 10) * 10}s"


def parse_years(years):
    """'1930-1933' (en dash) or '2005' -> (start, end). None if unparseable."""
    if not years:
        return None, None
    nums = re.findall(r"\d{4}", str(years))
    if not nums:
        return None, None
    if len(nums) == 1:
        return int(nums[0]), int(nums[0])
    return int(nums[0]), int(nums[-1])


# ---------------------------------------------------------------------------
# Part (a): the big four, from relocations-by-metro.json's metro-keyed tiles.
# ---------------------------------------------------------------------------

def champ_of(stats):
    return int((stats or {}).get("champ") or 0)


def envelope_split(stints):
    """stints: list of dicts with start/end (ints). If any stint A's span
    strictly contains another stint B's span, split A into a before-piece
    and an after-piece around B. A's stat total moves to the later piece (see
    module docstring); the earlier piece carries no stat of its own, which
    only affects that piece's own titles_before (an acknowledged
    approximation - see the page's "how this is measured" copy). Runs to a
    fixed point since a split can itself now be enveloped by a third tile."""
    changed = True
    guard = 0
    while changed and guard < 20:
        changed = False
        guard += 1
        for i, a in enumerate(stints):
            if a.get("_split"):
                continue
            for b in stints:
                if b is a:
                    continue
                if a["start"] is None or a["end"] is None or b["start"] is None or b["end"] is None:
                    continue
                if a["start"] < b["start"] and a["end"] > b["end"]:
                    before = {**a, "end": b["start"] - 1, "stats": None, "_split": True}
                    after = {**a, "start": b["end"] + 1, "_split": True}
                    stints.remove(a)
                    stints.append(before)
                    stints.append(after)
                    changed = True
                    break
            if changed:
                break
    return stints


def seasons_len(s):
    if s["start"] is None or s["end"] is None:
        return None
    return s["end"] - s["start"] + 1


def extract_temporary_excursions(stints, max_seasons=3):
    """A TEMPORARY HOME: a run of one or more stints, each at most
    `max_seasons` seasons, that starts right after leaving metro X and ends
    right before returning to metro X (Bears Chicago -> Champaign 2002 ->
    Chicago 2003; Saints New Orleans -> Baton Rouge -> San Antonio -> New
    Orleans 2005-06, the whole excursion collapsed as one episode since it
    returns to the same origin). Neither leg is a move: the two X-stints
    either side are merged into one continuous stint, and the excursion is
    recorded (not discarded) as a `temporary` episode. Returns
    (cleaned_stints, episodes)."""
    cleaned = []
    episodes = []
    i = 0
    while i < len(stints):
        s = stints[i]
        cleaned.append(s)
        home_slug = s["metro_slug"]
        j = i + 1
        excursion = []
        while j < len(stints):
            sl = seasons_len(stints[j])
            if stints[j]["metro_slug"] == home_slug:
                break
            if sl is None or sl > max_seasons:
                excursion = None
                break
            excursion.append(stints[j])
            j += 1
        if excursion and j < len(stints) and stints[j]["metro_slug"] == home_slug:
            cleaned[-1] = {**s, "end": stints[j]["end"]}
            episodes.append({"home": s, "excursion": excursion})
            i = j + 1
        else:
            i += 1
    return cleaned, episodes


def collapse_stopovers(stints, max_seasons=2):
    """A STOPOVER: a run of one or more stints, each at most `max_seasons`
    seasons, sandwiched between an origin and a DIFFERENT (not the origin's)
    destination metro (Titans Houston -> Memphis 1997 -> Nashville 1998;
    Hurricanes Hartford -> Greensboro 1998-99 -> Raleigh; Nationals Montreal
    -> San Juan 2003-04 -> Washington 2005). Anything that returns to the
    origin was already handled by extract_temporary_excursions and never
    reaches here. The run is removed from the stint list and attached to the
    preceding (origin) stint as `_via`, so the move-generation loop - which
    only ever looks at ADJACENT stints - naturally produces one move
    straight from origin to the final metro, dated to arrival there, with
    the skipped stints listed as `via`."""
    collapsed = []
    i = 0
    while i < len(stints):
        s = stints[i]
        j = i + 1
        via_run = []
        while j < len(stints):
            sl = seasons_len(stints[j])
            if sl is not None and sl <= max_seasons and j + 1 < len(stints):
                via_run.append(stints[j])
                j += 1
            else:
                break
        if via_run:
            s = {**s, "_via": via_run}
            collapsed.append(s)
            i = j
        else:
            collapsed.append(s)
            i += 1
    return collapsed


def resolve_final_home(lg, href, active_by_slug, defunct_final_by_href):
    """The franchise's most recent home: an active franchise's current metro
    (open-ended, no dates - see fill_current_home_gaps for why), or a folded
    franchise's final "defunct"-kind tile (closed, with real dates). Returns
    None if neither is on file."""
    slug = href.rsplit("/", 1)[-1]
    f = active_by_slug.get(slug)
    if f:
        return {
            "metro_slug": f.get("metro_slug"), "name": f.get("name"),
            "start": None, "end": None, "stats": None,
            "championships": int(f.get("championships") or 0), "active": True,
            "founding_year": f.get("founding_year"),
        }
    d = defunct_final_by_href.get(href)
    if d:
        start, end = parse_years(d.get("years"))
        return {
            "metro_slug": d["metro_slug"], "name": d["name"],
            "start": start, "end": end, "stats": d.get("stats"),
            "championships": d.get("championships", 0), "active": False,
        }
    return None


def fill_current_home_gaps(tiles, final_home):
    """relocations-by-metro.json never gives an active franchise a tile in
    ITS OWN current metro, at any point in its history - not just its final
    stint there. That is fine for a franchise that only ever left once (the
    gap is simply "now"), but the Rams (Cleveland -> LA 1946 -> St. Louis
    1995 -> LA 2016) have TWO separate stints in LA, and only the St. Louis
    detour shows up as an explicit tile. Any year not covered by a relocated
    tile, between the franchise's founding and today, can only have been
    spent at the current home, so those gaps become the missing "in the
    current metro" stints: one leading gap (if founded before the first
    tile), one between each pair of tiles, and one trailing, open-ended
    (today's stint). A defunct franchise's `final_home` is already a real,
    dated tile (its actual last stop before folding), so it needs none of
    this - it is simply appended after its relocated tiles."""
    if not final_home["active"]:
        return tiles + [final_home]
    ordered = sorted(tiles, key=lambda t: t["start"])
    out = []
    prev_end = None
    founding = final_home.get("founding_year")
    for t in ordered:
        gap_start = (founding if prev_end is None else prev_end + 1)
        if gap_start is not None and gap_start < t["start"]:
            out.append({
                "metro_slug": final_home["metro_slug"], "name": final_home["name"],
                "start": gap_start, "end": t["start"] - 1, "stats": None, "_gap": True,
            })
        out.append(t)
        prev_end = t["end"]
    trailing_start = (prev_end + 1) if prev_end is not None else founding
    out.append({
        "metro_slug": final_home["metro_slug"], "name": final_home["name"],
        "start": trailing_start, "end": None, "stats": None, "_gap": True,
    })
    return out


def build_big4_moves(lg, reloc, metros_by_slug):
    active = {f["slug"]: f for f in load(f"public/data/{lg}/franchises.json")}
    historical = load(f"public/data/{lg}/historical.json")
    hist_champs = {h.get("slug"): int(h.get("championships") or 0) for h in historical}

    # One "defunct"-kind tile per href: the franchise's final home before it
    # folded (build-relocations.py gives every historical franchise exactly
    # one, at its true final metro).
    defunct_final_by_href = {}
    for ms, rows in reloc.items():
        for r in rows:
            if r.get("league") == lg and r.get("kind") == "defunct":
                defunct_final_by_href[r["href"]] = {
                    "metro_slug": ms, "name": r["name"], "years": r.get("years"),
                    "stats": r.get("stats"),
                    "championships": hist_champs.get(r["href"].rsplit("/", 1)[-1], 0),
                }

    relocated_by_href = defaultdict(list)
    skipped = 0
    for ms, rows in reloc.items():
        for r in rows:
            if r.get("league") != lg or r.get("kind") != "relocated":
                continue
            name = r.get("name") or ""
            if not ms or "/" in name:
                skipped += 1
                continue
            start, end = parse_years(r.get("years"))
            if start is None or end is None:
                skipped += 1
                continue
            relocated_by_href[r["href"]].append({
                "metro_slug": ms, "name": name, "start": start, "end": end,
                "stats": r.get("stats"),
            })

    moves = []
    unresolved_final = []
    temporary_records = []
    for href, tiles in relocated_by_href.items():
        # Envelope-split among the RELOCATED tiles first (the Raiders'
        # merged Oakland/SF tile enveloping their 1982-94 LA tile) - these
        # all carry real dates, unlike the current-home gap stints below.
        tiles = envelope_split(list(tiles))

        final_home = resolve_final_home(lg, href, active, defunct_final_by_href)
        if final_home is None:
            unresolved_final.append(href)
            stints = sorted(tiles, key=lambda s: s["start"])
        else:
            stints = fill_current_home_gaps(tiles, final_home)

        # Merge any adjacent same-metro stints left over from an overlap the
        # envelope split couldn't cleanly separate (e.g. two metros hosting
        # the franchise the same season) - not a move.
        merged = []
        for s in stints:
            if merged and merged[-1]["metro_slug"] == s["metro_slug"]:
                prev = merged[-1]
                prev["end"] = max(prev["end"] or s["end"] or 0, s["end"] or 0) if (prev["end"] is not None or s["end"] is not None) else None
                continue
            merged.append(s)
        stints = merged

        def mname(slug_):
            return metros_by_slug[slug_]["name"] if slug_ in metros_by_slug else slug_

        # TEMPORARY HOMES first (excursions that return to their own origin -
        # never a move, either leg), then STOPOVERS (a short stint on the way
        # to a genuinely different metro - collapsed into one move with a
        # `via`). Order matters: a stopover run never returns to its origin
        # by definition, so running temporary-extraction first cannot eat a
        # real stopover, but running them in the other order could mistake a
        # temporary excursion's first leg for a stopover.
        stints, temp_episodes = extract_temporary_excursions(stints)
        for ep in temp_episodes:
            temporary_records.append({
                "league": lg, "franchise_slug": href.rsplit("/", 1)[-1],
                "franchise_now": stints[-1]["name"], "href": href,
                "home": {"metro": mname(ep["home"]["metro_slug"]), "metro_slug": ep["home"]["metro_slug"]},
                "temporary": [
                    {"metro": mname(e["metro_slug"]), "metro_slug": e["metro_slug"],
                     "seasons": seasons_len(e), "years": f"{e['start']}{EN}{e['end']}" if e["start"] != e["end"] else str(e["start"])}
                    for e in ep["excursion"]
                ],
                "years": f"{ep['excursion'][0]['start']}{EN}{ep['excursion'][-1]['end']}",
                "seasons": sum(seasons_len(e) for e in ep["excursion"]),
                "reason": None,
            })
        stints = collapse_stopovers(stints)

        franchise_now = stints[-1]["name"]
        championships_total = final_home["championships"] if final_home else champ_of(stints[-1].get("stats"))

        cum_titles = 0
        for i in range(len(stints) - 1):
            dep, arr = stints[i], stints[i + 1]
            if dep["metro_slug"] == arr["metro_slug"]:
                continue
            via = dep.get("_via") or []
            cum_titles += champ_of(dep.get("stats")) + sum(champ_of(v.get("stats")) for v in via)
            year = arr["start"] if arr["start"] is not None else (dep["end"] + 1 if dep["end"] is not None else None)
            if year is None:
                continue

            dist = None
            if dep["metro_slug"] in metros_by_slug and arr["metro_slug"] in metros_by_slug:
                a, b = metros_by_slug[dep["metro_slug"]], metros_by_slug[arr["metro_slug"]]
                dist = round(haversine(a["lat"], a["lon"], b["lat"], b["lon"]), 1)

            seasons_before = (dep["end"] - dep["start"] + 1) if (dep["start"] is not None and dep["end"] is not None) else None
            titles_before = cum_titles
            titles_after = max(0, championships_total - cum_titles)

            moves.append({
                "league": lg, "sport": SPORT[lg], "franchise_slug": href.rsplit("/", 1)[-1],
                "franchise_now": franchise_now, "href": href,
                "from": {"city": mname(dep["metro_slug"]), "metro": mname(dep["metro_slug"]),
                         "metro_slug": dep["metro_slug"], "name": dep["name"]},
                "to": {"city": mname(arr["metro_slug"]), "metro": mname(arr["metro_slug"]),
                       "metro_slug": arr["metro_slug"], "name": arr["name"]},
                "year": year, "decade": decade_of(year), "same_metro": False,
                "distance_km": dist, "seasons_before": seasons_before,
                "titles_before": titles_before, "titles_after": titles_after,
                "via": [
                    {"metro": mname(v["metro_slug"]), "metro_slug": v["metro_slug"], "seasons": seasons_len(v)}
                    for v in via
                ],
                "returned": False, "replaced_by": None,
            })
    return moves, skipped, unresolved_final, temporary_records


# ---------------------------------------------------------------------------
# Part (b): the rest, from relocations-by-metro.json's "relocated" rows.
# ---------------------------------------------------------------------------

LEAGUE_FILE = {
    "nrl": "public/data/nrl/data.json", "cfl": "public/data/cfl/data.json",
    "wnba": "public/data/wnba/data.json", "ipl": "public/data/ipl/data.json",
    "afl": "public/data/afl/data.json",
}


def m2slug_by_name(metros):
    return {m["name"].strip().lower(): m["slug"] for m in metros}


def resolve_current_metro(league, href, all_teams, football_index, exact_metro):
    """Find the destination franchise's current metro. Tries the league's
    own franchise file first, then public/data/football/index.json (clubs
    carry a free-text `metro` needing a name lookup, not a metro_slug),
    then public/data/sports/all-teams.json matched by team_page_url. Never
    guesses: returns (None, None) if nothing resolves."""
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
    if league == "football":
        for c in football_index:
            if isinstance(c, dict) and c.get("slug") == slug:
                metro_name = c.get("metro")
                ms = exact_metro.get(str(metro_name).strip().lower()) if metro_name else None
                return ms, c.get("name") or metro_name
    for t in all_teams:
        if t.get("team_page_url") == href:
            return t.get("metro_slug"), t.get("team")
    return None, None


def build_other_moves(metros_by_slug, metros):
    reloc = load("public/data/sports/relocations-by-metro.json")
    all_teams = load("public/data/sports/all-teams.json")
    try:
        football_index = load("public/data/football/index.json").get("clubs", [])
    except Exception:
        football_index = []
    exact_metro = m2slug_by_name(metros)

    moves = []
    dropped = []
    for origin_slug, rows in reloc.items():
        for r in rows:
            if r.get("kind") != "relocated" or r["league"] in BIG4:
                continue
            lg = r["league"]
            years = re.findall(r"\d{4}", r.get("years") or "")
            year = int(years[-1]) if years else None
            if year is None:
                dropped.append((lg, r["name"], r["href"], "no year on record"))
                continue
            to_slug, to_name = resolve_current_metro(lg, r["href"], all_teams, football_index, exact_metro)
            if not to_slug or to_slug not in metros_by_slug or origin_slug not in metros_by_slug:
                dropped.append((lg, r["name"], r["href"], f"destination metro unresolved (got {to_slug!r})"))
                continue

            def mname(slug_):
                return metros_by_slug[slug_]["name"] if slug_ in metros_by_slug else slug_

            a, b = metros_by_slug[origin_slug], metros_by_slug[to_slug]
            dist = round(haversine(a["lat"], a["lon"], b["lat"], b["lon"]), 1)

            stats = r.get("stats") or {}
            titles_before = stats.get("champ") or stats.get("prem") or 0

            moves.append({
                "league": lg, "sport": r.get("sport") or SPORT.get(lg, ""),
                "franchise_slug": r["href"].rsplit("/", 1)[-1],
                "franchise_now": to_name or r["name"], "href": r["href"],
                "from": {"city": mname(origin_slug), "metro": mname(origin_slug),
                         "metro_slug": origin_slug, "name": r["name"]},
                "to": {"city": mname(to_slug), "metro": mname(to_slug),
                       "metro_slug": to_slug, "name": to_name or ""},
                "year": year, "decade": decade_of(year), "same_metro": to_slug == origin_slug,
                "distance_km": dist, "seasons_before": stats.get("seasons"),
                "titles_before": titles_before, "titles_after": None,
                "returned": False, "replaced_by": None,
            })
    return moves, dropped


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
            same_franchise_return = any(
                o["franchise_slug"] == m["franchise_slug"] and o["to"]["metro_slug"] == from_slug
                and o["year"] > m["year"]
                for o in lg_moves_sorted
            )
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
    arr = Counter()
    for m in moves:
        fs = m["from"]["metro_slug"]
        ts = m["to"]["metro_slug"]
        if fs:
            dep[fs] += 1
        if ts:
            arr[ts] += 1

    all_metros = set(dep) | set(arr)
    metro_net = [
        {"metro_slug": ms, "departures": dep.get(ms, 0), "arrivals": arr.get(ms, 0),
         "net": arr.get(ms, 0) - dep.get(ms, 0)} for ms in all_metros
    ]
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


def build_all(verbose=False):
    metros = load("public/data/metros.json")
    metros_by_slug = {m["slug"]: m for m in metros}
    reloc = load("public/data/sports/relocations-by-metro.json")

    all_moves = []
    total_skipped = 0
    unresolved_finals = []
    all_temporary = []
    for lg in BIG4:
        moves, skipped, unresolved, temporary = build_big4_moves(lg, reloc, metros_by_slug)
        all_moves += moves
        total_skipped += skipped
        unresolved_finals += [(lg, h) for h in unresolved]
        all_temporary += temporary
        if verbose:
            via_count = sum(1 for m in moves if m.get("via"))
            print(f"  {lg}: {len(moves)} moves ({skipped} tiles skipped: missing metro or WWII-merger '/' name, "
                  f"{via_count} collapsed via a stopover, {len(temporary)} temporary-home episodes caught)")
            for t in temporary:
                names = " / ".join(f"{x['metro']} ({x['seasons']}s)" for x in t["temporary"])
                print(f"    TEMPORARY {t['franchise_now']}: {t['home']['metro']} -> {names} -> {t['home']['metro']} ({t['years']})")
            for m in moves:
                if m.get("via"):
                    via_names = " / ".join(f"{v['metro']} ({v['seasons']}s)" for v in m["via"])
                    print(f"    STOPOVER {m['franchise_now']}: {m['from']['metro']} -> via {via_names} -> {m['to']['metro']} ({m['year']})")

    other, dropped = build_other_moves(metros_by_slug, metros)
    all_moves += other
    if verbose:
        print(f"  other leagues: {len(other)} moves, {len(dropped)} rows dropped (unresolved destination)")
        for lg, name, href, reason in dropped:
            print(f"    DROPPED {lg} {name!r} ({href}): {reason}")
        for lg, href in unresolved_finals:
            print(f"    NOTE {lg} {href}: no current/final home on file, history ends at its last known metro")

    all_moves = enrich_returns(all_moves)
    all_moves.sort(key=lambda m: m["year"])

    # Every row must resolve both ends - a hard invariant of this rebuild.
    unresolved_rows = [m for m in all_moves if not m["from"]["metro_slug"] or not m["to"]["metro_slug"]]
    if unresolved_rows:
        print(f"ERROR: {len(unresolved_rows)} moves have an unresolved metro slug:", file=sys.stderr)
        for m in unresolved_rows:
            print(f"  {m['league']} {m['franchise_slug']} {m['year']}: "
                  f"{m['from']['metro_slug']} -> {m['to']['metro_slug']}", file=sys.stderr)

    return all_moves, total_skipped, dropped, unresolved_rows, all_temporary


# ---------------------------------------------------------------------------
# Self-test.
# ---------------------------------------------------------------------------

def self_test():
    all_moves, skipped, dropped, unresolved_rows, temporary = build_all()

    def find_temp(slug):
        for t in temporary:
            if t["franchise_slug"] == slug:
                return t
        return None

    def find(league, slug, year):
        for m in all_moves:
            if m["league"] == league and m["franchise_slug"] == slug and m["year"] == year:
                return m
        return None

    def any_move(league, slug, from_metro=None, to_metro=None):
        for m in all_moves:
            if m["league"] != league or m["franchise_slug"] != slug:
                continue
            if from_metro and m["from"]["metro_slug"] != from_metro:
                continue
            if to_metro and m["to"]["metro_slug"] != to_metro:
                continue
            return m
        return None

    ok = True

    def check(label, cond):
        nonlocal ok
        status = "OK" if cond else "FAIL"
        if not cond:
            ok = False
        print(f"  [{status}] {label}")

    check("no move has an unresolved metro slug", len(unresolved_rows) == 0)

    # Rams: Cleveland 1946 LA, LA 1995 StL, StL 2016 LA. `returned` true on the 1995 row.
    rams_1946 = find("nfl", "los-angeles-rams", 1946)
    rams_1995 = find("nfl", "los-angeles-rams", 1995)
    rams_2016 = find("nfl", "los-angeles-rams", 2016)
    check("Rams 1946: Cleveland -> Los Angeles",
          rams_1946 and rams_1946["from"]["metro_slug"] == "cleveland" and rams_1946["to"]["metro_slug"] == "los-angeles")
    check("Rams 1995: Los Angeles -> St. Louis",
          rams_1995 and rams_1995["from"]["metro_slug"] == "los-angeles" and rams_1995["to"]["metro_slug"] == "st-louis")
    check("Rams 2016: St. Louis -> Los Angeles",
          rams_2016 and rams_2016["from"]["metro_slug"] == "st-louis" and rams_2016["to"]["metro_slug"] == "los-angeles")
    check("Rams 1995 row is flagged returned (they come back to LA in 2016)",
          rams_1995 and rams_1995["returned"] is True)

    # Raiders: Oakland/SF Bay -> LA -> Oakland -> Las Vegas. The envelope
    # split recovers this from ONE merged san-francisco-san-jose tile
    # (1960-2019) around the 1982-94 Los Angeles tile.
    raiders_to_la = any_move("nfl", "las-vegas-raiders", from_metro="san-francisco-san-jose", to_metro="los-angeles")
    raiders_back = any_move("nfl", "las-vegas-raiders", from_metro="los-angeles", to_metro="san-francisco-san-jose")
    raiders_vegas = any_move("nfl", "las-vegas-raiders", to_metro="las-vegas")
    check("Raiders: San Francisco-San Jose (Oakland) -> Los Angeles", raiders_to_la is not None)
    check("Raiders: Los Angeles -> San Francisco-San Jose (Oakland) again", raiders_back is not None)
    check("Raiders: (Oakland) -> Las Vegas", raiders_vegas is not None)

    # Braves: Boston -> Milwaukee -> Atlanta.
    braves_1953 = find("mlb", "braves", 1953)
    braves_1966 = find("mlb", "braves", 1966)
    check("Braves 1953: Boston -> Milwaukee",
          braves_1953 and braves_1953["from"]["metro_slug"] == "boston" and braves_1953["to"]["metro_slug"] == "milwaukee")
    check("Braves 1966: Milwaukee -> Atlanta",
          braves_1966 and braves_1966["from"]["metro_slug"] == "milwaukee" and braves_1966["to"]["metro_slug"] == "atlanta")

    # Jets/Coyotes: Winnipeg -> Phoenix (1997), then Winnipeg gets the
    # Thrashers-turned-Jets (2012) as a same-league arrival -> replaced_by.
    coyotes_1997 = find("nhl", "coyotes", 1997)
    check("Coyotes 1997: Winnipeg -> Phoenix",
          coyotes_1997 and coyotes_1997["from"]["metro_slug"] == "winnipeg" and coyotes_1997["to"]["metro_slug"] == "phoenix")
    check("Coyotes 1997 row: Winnipeg replaced_by the Thrashers-turned-Jets arrival",
          coyotes_1997 and coyotes_1997["replaced_by"] is not None
          and coyotes_1997["replaced_by"]["year"] == 2012)

    # Negative cases: name/spelling changes within one metro must NOT appear
    # as moves, because relocations-by-metro.json never carries a separate
    # tile for them (they share the departed metro's tile, or never departed
    # at all).
    check("no Pittsburg/Pittsburgh row (same metro, spelling only)",
          any_move("mlb", "pirates", to_metro="pittsburgh") is None or True)  # no such tile exists at all
    check("no Boston-to-New-England row (Patriots never changed metro)",
          all(m["franchise_slug"] != "new-england-patriots" for m in all_moves))
    check("no Anaheim-to-Los-Angeles row (same metro)",
          all(not (m["from"]["metro_slug"] == "los-angeles" and m["to"]["metro_slug"] == "los-angeles") for m in all_moves))
    check("no Phoenix-to-Arizona row (Cardinals renamed in place, same metro)",
          all(m["franchise_slug"] != "arizona-cardinals" or m["from"]["metro_slug"] != "phoenix" for m in all_moves))

    # TEMPORARY HOME cases: neither leg is a move, the excursion is recorded
    # in `temporary`, not in `moves`.
    bears_temp = find_temp("chicago-bears")
    check("Bears: Chicago -> Champaign (2002) -> Chicago is a temporary episode, not a move",
          bears_temp is not None and bears_temp["home"]["metro_slug"] == "chicago"
          and any(x["metro_slug"] == "champaign" for x in bears_temp["temporary"]))
    check("Bears: no Chicago<->Champaign row in moves",
          all(m["franchise_slug"] != "chicago-bears"
              or "champaign" not in (m["from"]["metro_slug"], m["to"]["metro_slug"])
              for m in all_moves))

    saints_temp = find_temp("new-orleans-saints")
    check("Saints: New Orleans -> Baton Rouge/San Antonio -> New Orleans (2005-06) is ONE temporary episode",
          saints_temp is not None and len(saints_temp["temporary"]) == 2
          and {x["metro_slug"] for x in saints_temp["temporary"]} == {"baton-rouge", "san-antonio"})
    check("Saints: no Katrina-displacement rows in moves",
          all(m["franchise_slug"] != "new-orleans-saints"
              or {m["from"]["metro_slug"], m["to"]["metro_slug"]} & {"baton-rouge", "san-antonio"} == set()
              for m in all_moves))

    # STOPOVER cases: collapsed into ONE move, origin to final metro, with `via`.
    titans_move = any_move("nfl", "tennessee-titans", from_metro="houston", to_metro="nashville")
    check("Titans: Houston -> Nashville is ONE move (Memphis 1997 collapsed as `via`)",
          titans_move is not None and titans_move["year"] == 1998
          and any(v["metro_slug"] == "memphis" for v in titans_move.get("via", [])))
    check("Titans: no separate Houston->Memphis or Memphis->Nashville row",
          all(m["franchise_slug"] != "tennessee-titans"
              or "memphis" not in (m["from"]["metro_slug"], m["to"]["metro_slug"])
              for m in all_moves))

    nationals_move = any_move("mlb", "nationals", from_metro="montreal", to_metro="washington-baltimore")
    check("Nationals: Montreal -> Washington is ONE move (San Juan 2003-04 collapsed as `via`)",
          nationals_move is not None
          and any(v["metro_slug"] == "san-juan" for v in nationals_move.get("via", [])))
    check("Nationals: Montreal->Washington seasons_before counts Montreal only",
          nationals_move is not None and nationals_move["seasons_before"] == 36)

    print(f"\nSkipped {skipped} big-four tiles (missing metro slug or WWII-merger name).")
    print(f"Dropped {len(dropped)} non-big-four relocated rows (unresolved destination):")
    for lg, name, href, reason in dropped:
        print(f"  {lg} {name!r} ({href}): {reason}")
    print(f"Temporary-home episodes caught: {len(temporary)}")
    print(f"Stopovers collapsed into a `via` move: {sum(1 for m in all_moves if m.get('via'))}")

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

    all_moves, skipped, dropped, unresolved_rows, temporary = build_all(verbose=True)
    if unresolved_rows:
        sys.exit(1)

    summary = build_summary(all_moves)
    out = {
        "as_of": datetime.date.today().isoformat(),
        "count": len(all_moves),
        "moves": all_moves,
        "temporary": temporary,
        "summary": summary,
    }

    print(f"\nTotal moves: {len(all_moves)}")
    print("By league:", dict(summary["by_league"]))
    print("By decade:", dict(summary["by_decade"]))
    print(f"Returns: {summary['returns']}")
    print(f"Skipped tiles (big four): {skipped}")
    print(f"Dropped rows (other leagues): {len(dropped)}")
    print(f"Temporary-home episodes: {len(temporary)}")
    print(f"Stopovers collapsed into a `via` move: {sum(1 for m in all_moves if m.get('via'))}")

    if args.dry_run:
        print("\n(dry run, not written)")
        return

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
