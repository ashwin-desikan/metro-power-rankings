#!/usr/bin/env python3
"""Women's international basketball data (/teams/basketball/women).

Inputs (committed beside this script, both Wikipedia ARTICLE TEXT, not the
basketball-reference dumps the men's builder reads, so this file carries its
own parsers):

  wbasketball_olympics.txt  "Basketball at the Summer Olympics, women's
      tournament" - one section per edition from Montreal 1976, each with
      tab-delimited final-standings tables and, from 1980 on, medal-game
      sections. 1988/1992/1996 give the medal games only as a knockout
      BRACKET (seed, team, score triples in reading order).
  wbasketball_worldcup.txt  the FIBA Women's Basketball World Cup results
      summary: Year / Hosts / Champion / Score / Runner-up / Third place /
      Score / Fourth place / Number of teams, 1953 to 2022 (plus a 2026 row
      that is still "Future event" and is skipped).

Lineage rules and the per-edition "as" attribution are the men's builder's,
imported from scripts/basketball/build_intl_basketball.py where that is safe:
LINEAGE, canon() and slugify() are module-level constants and pure functions,
but importing that module also evaluates its Supabase credentials block, which
is harmless (no network at import). Anything it does NOT define for the
women's game (CIS -> Unified Team, East Germany) is added here.

WHAT THIS FILE CANNOT KNOW. The World Cup source is a results SUMMARY: it
lists the final four of every edition and nothing else. So there is no
appearance count to derive, and nations.json carries wc_apps: null rather
than a number that would look like a tournament count and be one. Said in
hub.json's meta too, because the page prints it.

Outputs under public/data/wbasketball/:
  nations.json, hub.json, fiba_ranking.json, nation-detail/<slug>.json

Run from repo root: python3 scripts/basketball/build_intl_wbasketball.py
                    python3 scripts/basketball/build_intl_wbasketball.py --self-test
Stdlib only.
"""
import io
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

# Men's builder helpers. LINEAGE/canon/slugify are the shared contract; the
# import is side-effect-free (module level only builds constants).
from build_intl_basketball import LINEAGE as MENS_LINEAGE, canon, slugify  # noqa: E402
# Same slug logic the weekly women's-ranking job uses, so a nation that maps
# there maps here. slug_universe() reads zone-zero-cup.json + countries.json.
from apply_womens_ranking import resolve as fiba_resolve, slug_universe  # noqa: E402

OLY = os.path.join(HERE, "wbasketball_olympics.txt")
WC = os.path.join(HERE, "wbasketball_worldcup.txt")
FIBA_W = os.path.join(HERE, "fiba_ranking_women.json")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")
OUT = os.path.join(ROOT, "public", "data", "wbasketball")

FIBA_SOURCE = "FIBA Women's World Ranking presented by Nike"

# The men's lineage table, plus the two entities only the women's record has.
# "CIS" is how the 1992 bracket spells the Unified Team; normalising it first
# means it folds to Russia through the men's rule rather than a second one.
LINEAGE = dict(MENS_LINEAGE)
LINEAGE["East Germany"] = "Germany"
NAME_FIXUPS = {
    "CIS": "Unified Team",
    "Commonwealth of Independent States": "Unified Team",
    # The 1980 standings row for Italy carries the IOC-flag caption inline.
    "International Olympic Committee Italy": "Italy",
    "Italy International Olympic Committee": "Italy",
    "Socialist Federal Republic of Yugoslavia": "Yugoslavia",
    "USA": "United States",
}

# Olympic hosts, reviewed once against the dump (the article gives them three
# different ways: an "(H)" marker in the standings through 1988, a "Host
# country"/"Host nation" infobox row from 2000, and 2012's row says "London",
# a city). Parsed hosts are validated against this and mismatches printed.
OLY_HOSTS = {
    1976: "Canada", 1980: "Soviet Union", 1984: "United States",
    1988: "South Korea", 1992: "Spain", 1996: "United States",
    2000: "Australia", 2004: "Greece", 2008: "China", 2012: "United Kingdom",
    2016: "Brazil", 2020: "Japan", 2024: "France",
}
# Host-row values that name a city rather than the country.
HOST_CITY_COUNTRY = {"London": "United Kingdom"}

# Geographic continent -> FIBA ranking zone. FIBA folds Oceania into Asia.
_CONT_ZONE = {
    "North America": "Americas", "South America": "Americas",
    "Africa": "Africa", "Europe": "Europe", "Asia": "Asia", "Oceania": "Asia",
}
_FIBA_EUROPE = {"israel", "turkey", "georgia", "armenia", "azerbaijan", "cyprus"}

# apply_womens_ranking resolves to the Cup ENGINE's slugs, which differ from
# countries.json for four nations and from this portal's node slugs for two.
# Explicit both ways; a guessed mapping credits the wrong country.
ENGINE_TO_COUNTRY = {
    "czechia": "czech-republic", "great-britain": "united-kingdom",
    "chinese-taipei": "taiwan", "ivory-coast": "cote-divoire",
    "united-states-virgin-islands": "us-virgin-islands",
    "st-vincent-and-the-grenadines": "st-vincent-the-grenadines",
}
# Portal node slug (slugify of the nation name this builder uses) per engine
# slug, where the two differ.
ENGINE_TO_NODE = {"czechia": "czech-republic", "great-britain": "great-britain"}

MAX_UNMAPPED = 12   # same threshold as apply_womens_ranking.py
MIN_MAPPED = 60


def fix(name):
    """canon() plus the women's-record name normalisations."""
    n = canon(name).replace(" ", " ").strip()
    n = re.sub(r"\s*\(H\)\s*$", "", n).strip()
    n = re.sub(r"\[\w+\]$", "", n).strip()
    return NAME_FIXUPS.get(n, n)


def ent(name):
    return LINEAGE.get(name, name)


# --------------------------------------------------------------------------
# World Cup
# --------------------------------------------------------------------------
def parse_wc(path=WC):
    """[{year, host, champion, score, runner_up, third, third_score, fourth,
    teams}], newest last. Blocks look like:

        1953
        Details<TAB> Chile<TAB>
        United States<TAB>49-36<TAB>
        Chile<TAB>
        France<TAB>49-37<TAB>
        Brazil<TAB>10
        (squads)

    A block whose champion cell has no score (the 2026 "Future event" row) is
    reported as scheduled and left out of the results.
    """
    lines = io.open(path, encoding="utf-8").read().splitlines()
    out, scheduled, block, year = [], [], None, None

    def flush():
        if year is None or not block:
            return
        cells = [ln.split("\t") for ln in block]
        host = fix(cells[0][1]) if len(cells[0]) > 1 else ""
        if len(block) < 5 or not re.search(r"\d+\s*[-–]\s*\d+", block[1]):
            scheduled.append({"year": year, "host": host})
            return
        champ = fix(cells[1][0])
        score = re.sub(r"\s*[-–]\s*", "-", cells[1][1].strip())
        runner_up = fix(cells[2][0])
        third = fix(cells[3][0])
        third_score = re.sub(r"\s*[-–]\s*", "-", cells[3][1].strip())
        fourth = fix(cells[4][0])
        teams = int(cells[4][1].strip()) if len(cells[4]) > 1 and cells[4][1].strip().isdigit() else None
        out.append({"year": year, "host": host, "champion": champ, "score": score,
                    "runner_up": runner_up, "third": third,
                    "third_score": third_score, "fourth": fourth, "teams": teams})

    for raw in lines:
        s = raw.strip()
        if re.fullmatch(r"(19|20)\d\d", s):
            flush()
            year, block = int(s), []
            continue
        if year is None:
            continue
        if s == "(squads)":
            flush()
            year, block = None, []
            continue
        if s:
            block.append(raw.rstrip("\n"))
    flush()
    out.sort(key=lambda r: r["year"])
    return out, scheduled


# --------------------------------------------------------------------------
# Olympics
# --------------------------------------------------------------------------
_GAME = re.compile(r"^(.*?)\t+(\d+)\s*[-–]\s*(\d+)(?:\s*\(OT\))?\t+(.*?)\s*$")
# A bracket row: `A1<TAB> Australia<TAB>56`, optionally trailed by the next
# round's column header ("...<TAB>Bronze medal (September 28)").
_BRACKET = re.compile(r"^([AB]\d)\t+([^\t]+?)\t+(\d+)(?:\t.*)?$")
_MEDAL_TAG = re.compile(
    r"\d(?:st|nd|rd|th) place, (?:gold|silver|bronze) medalist\(s\)", re.I)

# Medal games the article renders ONLY as a bracket. Reviewed from the dump's
# own bracket rows (1988 lines 311-320, 1992 lines 390-399, 1996 lines 436-451
# of the source article text); the bracket parser below reproduces all three
# and any disagreement is printed as VALIDATION rather than silently accepted.
PODIUM_CANON = {
    1976: ("Soviet Union", "United States", "Bulgaria"),
    1980: ("Soviet Union", "Bulgaria", "Yugoslavia"),
    1984: ("United States", "South Korea", "China"),
    1988: ("United States", "Yugoslavia", "Soviet Union"),
    1992: ("Unified Team", "China", "United States"),
    1996: ("United States", "Brazil", "Australia"),
    2000: ("United States", "Australia", "Brazil"),
    2004: ("United States", "Australia", "Russia"),
    2008: ("United States", "Australia", "Russia"),
    2012: ("United States", "France", "Australia"),
    2016: ("United States", "Spain", "Serbia"),
    2020: ("United States", "Japan", "France"),
    2024: ("United States", "France", "Australia"),
}


def _strip_medal_tag(s):
    return _MEDAL_TAG.sub("", s).strip()


def _game(raw):
    """('winner', 'loser') for a `TeamA \\t 90-75 \\t TeamB` line, else None."""
    m = _GAME.match(raw.rstrip())
    if not m:
        return None
    a, sa, sb, b = (_strip_medal_tag(m.group(1)), int(m.group(2)),
                    int(m.group(3)), _strip_medal_tag(m.group(4)))
    a, b = fix(a), fix(b)
    if not a or not b or sa == sb:
        return None
    return (a, b) if sa > sb else (b, a)


def parse_oly(path=OLY):
    """[{year, host, gold, silver, bronze}], newest first.

    Editions are delimited by a bare "Women's tournament" line or a
    "Basketball at the YYYY Summer Olympics" line; the 1980 section has
    neither a main-article link nor an infobox, so its year is taken from the
    first full date inside it. Qualification tables also carry years ("Sep 24,
    1993"), which is why only a section that is still waiting for a year may
    read one out of a date.
    """
    lines = io.open(path, encoding="utf-8").read().splitlines()
    year, pending, buf = None, False, []
    sections = defaultdict(list)          # year -> raw lines
    hosts_seen = defaultdict(set)
    for raw in lines:
        s = raw.strip()
        m = re.search(r"Basketball at the ((?:19|20)\d\d) Summer Olympics", s)
        if m:
            year, pending, buf = int(m.group(1)), False, []
        elif s == "Women's tournament":
            # A new edition starts; hold its lines aside rather than crediting
            # them to the previous one (1980's standings table sits ahead of
            # the first line that names its year, and used to land in 1976).
            year, pending, buf = None, True, []
        elif pending:
            d = re.match(r"^\d{1,2} [A-Z][a-z]+ ((?:19|20)\d\d)$", s)
            if d:
                year, pending = int(d.group(1)), False
                sections[year].extend(buf)
                buf = []
        if pending:
            buf.append(raw)
            continue
        if year is None:
            continue
        sections[year].append(raw)
        if s.startswith("Host country\t") or s.startswith("Host nation\t"):
            v = fix(s.split("\t", 1)[1])
            v = HOST_CITY_COUNTRY.get(v, v)
            if v and not re.match(r"^\d", v) and "N/a" not in v:
                hosts_seen[year].add(v)
        if "(H)" in raw and "\t" in raw:
            cells = raw.split("\t")
            for c in cells[:3]:
                if "(H)" in c:
                    hosts_seen[year].add(fix(c))

    podiums = []
    for y in sorted(sections, reverse=True):
        body = sections[y]
        gold = silver = bronze = None

        # (a) explicit medal-game sections (1980-1984, 2000 onward)
        for i, raw in enumerate(body):
            head = raw.strip()
            if head not in ("Gold medal game", "Bronze medal game"):
                continue
            for nxt in body[i + 1:i + 12]:
                g = _game(nxt)
                if g:
                    if head == "Gold medal game":
                        gold, silver = g
                    else:
                        bronze = g[0]
                    break

        # (b) knockout bracket only (1988, 1992, 1996). The bracket is drawn
        # vertically centred, so the FINAL is the middle pair of the left
        # block; the bronze game is either the trailing pair (2-round bracket)
        # or the pair hanging off the extra columns (3-round bracket).
        if gold is None:
            pairs, extra = [], []
            rows = []
            for raw in body:
                cells = [c for c in raw.split("\t") if c.strip()]
                # Two triples on one line - the 3-round bracket hangs the
                # bronze game off spare columns:
                # `A1<TAB>USA<TAB>108<TAB><TAB><TAB>A2<TAB>Ukraine<TAB>56`
                if len(cells) == 6 and re.fullmatch(r"[AB]\d", cells[0].strip()) \
                        and re.fullmatch(r"[AB]\d", cells[3].strip()) \
                        and cells[2].strip().isdigit() and cells[5].strip().isdigit():
                    rows.append((fix(cells[1]), int(cells[2])))
                    extra.append((fix(cells[4]), int(cells[5])))
                    continue
                m = _BRACKET.match(raw.rstrip())
                if m:
                    rows.append((fix(m.group(2)), int(m.group(3))))
            for j in range(0, len(rows) - 1, 2):
                pairs.append((rows[j], rows[j + 1]))
            if pairs:
                f = pairs[(len(pairs) - 1) // 2]
                (ta, sa), (tb, sb) = f
                if sa != sb:
                    gold, silver = (ta, tb) if sa > sb else (tb, ta)
                bp = None
                if len(extra) == 2:
                    bp = (extra[0], extra[1])
                elif len(pairs) % 2 == 0:
                    bp = pairs[-1]
                if bp and bp[0][1] != bp[1][1]:
                    bronze = bp[0][0] if bp[0][1] > bp[1][1] else bp[1][0]

        # (c) 1976 was a single round robin: the group table IS the podium.
        if gold is None:
            table = []
            for raw in body:
                cells = raw.split("\t")
                if len(cells) >= 6 and cells[0].strip().isdigit() and cells[2].strip().isdigit():
                    table.append((int(cells[0]), fix(cells[1])))
            table.sort()
            if len(table) >= 3:
                gold, silver, bronze = table[0][1], table[1][1], table[2][1]

        cn = PODIUM_CANON.get(y)
        parsed = (gold, silver, bronze)
        if cn and parsed != cn:
            print("VALIDATION: %d parsed podium %s != reviewed %s" % (y, parsed, cn))
        gold, silver, bronze = cn or parsed
        host = OLY_HOSTS.get(y)
        if hosts_seen[y] and host and host not in hosts_seen[y]:
            print("VALIDATION: %d host %r not among parsed %s" % (y, host, sorted(hosts_seen[y])))
        podiums.append({"year": y, "host": host, "gold": gold,
                        "silver": silver, "bronze": bronze})
    return podiums


# --------------------------------------------------------------------------
# FIBA Women's World Ranking
# --------------------------------------------------------------------------
def parse_fiba(node_slugs):
    """(hub_doc, {node_slug: record}) for the fetched women's ranking."""
    if not os.path.exists(FIBA_W):
        return None, {}
    doc = json.load(io.open(FIBA_W, encoding="utf-8"))
    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    countries = countries if isinstance(countries, list) else countries.get("countries") or []
    cont = {c["slug"]: c.get("continent") for c in countries}
    cname = {c["slug"]: c["name"] for c in countries}
    by_slug, by_name = slug_universe()
    # slug_universe() is the Cup ENGINE's universe (zone-zero-cup.json plus
    # countries.json). Five federations resolve to an engine spelling the Cup
    # does not currently score - czechia, chinese-taipei, ivory-coast and the
    # two island slugs - and would otherwise be dropped from a ranking that
    # would still look complete, which is the exact failure apply_womens_
    # ranking.py's docstring is about. Accept those spellings and translate
    # them to countries.json below.
    by_slug = set(by_slug) | set(ENGINE_TO_COUNTRY)

    teams, by_node, unmapped = [], {}, []
    for t in doc["teams"]:
        eng = fiba_resolve(t, by_slug, by_name)
        if not eng:
            unmapped.append("%s (%s, rank %s)" % (t.get("country"), t.get("ioc"), t.get("rank")))
            continue
        cs = ENGINE_TO_COUNTRY.get(eng, eng)
        cs = cs if cs in cname else None
        zone = ("Europe" if eng in _FIBA_EUROPE
                else _CONT_ZONE.get(cont.get(cs)) if cs else None)
        node = ENGINE_TO_NODE.get(eng, eng)
        node = node if node in node_slugs else None
        display = (cname.get(cs) if cs else None) or fix(t["country"])
        rec = {"rank": t["rank"], "country": display, "ioc": t.get("ioc") or "",
               "zone": zone, "zoneRank": t["zoneRank"], "pts": t["pts"],
               "delta": t["delta"], "slug": node, "country_slug": cs}
        teams.append(rec)
        if node:
            by_node[node] = rec

    if unmapped:
        print("UNMAPPED, no rank credited:")
        for u in unmapped:
            print("   ", u)
    print("FIBA women: mapped %d of %d teams, ranking date %s"
          % (len(teams), len(doc["teams"]), doc.get("date")))
    if len(unmapped) > MAX_UNMAPPED:
        raise SystemExit(
            "ERROR: %d unmapped nations (> %d). Add them to apply_womens_ranking."
            "IOC_SLUG rather than letting the ranking quietly shrink."
            % (len(unmapped), MAX_UNMAPPED))
    if len(teams) < MIN_MAPPED:
        raise SystemExit("ERROR: only %d mapped (< %d)" % (len(teams), MIN_MAPPED))

    hub = {"date": doc["date"], "label": doc.get("label", doc["date"]),
           "source": FIBA_SOURCE, "teams": teams}
    return hub, by_node


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
FINISHES = [("champion", "Champions"), ("runner_up", "Runners-up"),
            ("third", "Third place"), ("fourth", "Fourth place")]


def build():
    wc, wc_scheduled = parse_wc()
    podiums = parse_oly()

    nations = defaultdict(lambda: {
        "wc_titles": [], "wc_ru": [], "wc_third": [], "wc_fourth": [],
        "gold": [], "silver": [], "bronze": [], "as": defaultdict(set),
    })
    campaigns = defaultdict(list)
    olympics = defaultdict(list)

    for e in wc:
        for key, label in FINISHES:
            name = e[key]
            if not name:
                continue
            node = ent(name)
            n = nations[node]
            n[{"champion": "wc_titles", "runner_up": "wc_ru",
               "third": "wc_third", "fourth": "wc_fourth"}[key]].append(e["year"])
            if name != node:
                n["as"][e["year"]].add(name)
            opponent = (e["runner_up"] if key == "champion"
                        else e["champion"] if key == "runner_up"
                        else e["fourth"] if key == "third"
                        else e["third"])
            campaigns[node].append({
                "year": e["year"], "host": e["host"], "finish": label,
                "score": e["score"] if key in ("champion", "runner_up") else e["third_score"],
                "opponent": opponent, "as": name if name != node else None,
            })

    for p in podiums:
        for medal in ("gold", "silver", "bronze"):
            name = p.get(medal)
            if not name:
                continue
            node = ent(name)
            nations[node][medal].append(p["year"])
            if name != node:
                nations[node]["as"][p["year"]].add(name)
            olympics[node].append({"year": p["year"], "host": p["host"],
                                   "medal": medal,
                                   "as": name if name != node else None})

    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    countries = countries if isinstance(countries, list) else countries.get("countries") or []
    cname = {c["slug"]: c["name"] for c in countries}

    rows, ent_by_slug = [], {}
    for name, n in nations.items():
        sl = slugify(name)
        ent_by_slug[sl] = name
        rows.append({
            "slug": sl, "name": name,
            # The World Cup source is a final-four summary, so an appearance
            # count is not derivable. null, never a number that would read as one.
            "wc_apps": None,
            "wc_titles": len(n["wc_titles"]), "wc_title_years": sorted(n["wc_titles"]),
            "wc_ru": len(n["wc_ru"]), "wc_ru_years": sorted(n["wc_ru"]),
            "wc_final_fours": len(n["wc_titles"]) + len(n["wc_ru"])
                              + len(n["wc_third"]) + len(n["wc_fourth"]),
            "gold": len(n["gold"]), "gold_years": sorted(n["gold"]),
            "silver": len(n["silver"]), "silver_years": sorted(n["silver"]),
            "bronze": len(n["bronze"]), "bronze_years": sorted(n["bronze"]),
            "medals": len(n["gold"]) + len(n["silver"]) + len(n["bronze"]),
            "lineage": sorted({a for ys in n["as"].values() for a in ys}) or None,
        })
    rows.sort(key=lambda x: (-x["gold"], -x["wc_titles"], -x["medals"], x["name"]))

    fiba_hub, fiba_by_node = parse_fiba({r["slug"] for r in rows})
    for r in rows:
        f = fiba_by_node.get(r["slug"])
        if f:
            r["fiba_rank"] = f["rank"]
            r["fiba_pts"] = f["pts"]
            r["fiba_zone"] = f["zone"]
            r["fiba_zone_rank"] = f["zoneRank"]
            r["fiba_delta"] = f["delta"]
        # Show the site's canonical country name where there is one.
        r["name"] = cname.get(r["slug"], r["name"])

    hub = {
        "wc_finals": [{k: e[k] for k in
                       ("year", "host", "champion", "score", "runner_up",
                        "third", "fourth", "teams")}
                      for e in sorted(wc, key=lambda e: -e["year"])],
        "wc_editions_on_file": [e["year"] for e in wc],
        "wc_scheduled": wc_scheduled,
        "podiums": podiums,
        "totals": {"nations": len(rows), "podium_editions": len(podiums),
                   "wc_editions": len(wc)},
        "meta": {
            "olympics_source": "Wikipedia, Basketball at the Summer Olympics "
                               "(women's tournament), 1976-2024",
            "wc_source": "Wikipedia, FIBA Women's Basketball World Cup results "
                         "summary, 1953-2022",
            "wc_apps": "The World Cup source lists only the final four of each "
                       "edition, so appearance counts are not derivable; "
                       "wc_apps is null rather than a number that would read "
                       "as a tournament count.",
            "lineage": "Soviet Union and Unified Team results fold into Russia; "
                       "Yugoslav lineages into Serbia; Czechoslovakia into the "
                       "Czech Republic; East Germany into Germany. Every folded "
                       "edition keeps its own \"as\" attribution.",
        },
    }

    details = {}
    for r in rows:
        e = ent_by_slug[r["slug"]]
        details[r["slug"]] = {
            "slug": r["slug"], "name": r["name"],
            "campaigns": sorted(campaigns.get(e, []), key=lambda c: -c["year"]),
            "olympics": sorted(olympics.get(e, []), key=lambda c: -c["year"]),
            "podium_years": {"gold": sorted(nations[e]["gold"]),
                             "silver": sorted(nations[e]["silver"]),
                             "bronze": sorted(nations[e]["bronze"])},
            "fiba": fiba_by_node.get(r["slug"]),
        }
    return hub, rows, fiba_hub, details


def write(hub, rows, fiba_hub, details):
    os.makedirs(os.path.join(OUT, "nation-detail"), exist_ok=True)

    def dump(obj, *parts):
        with io.open(os.path.join(OUT, *parts), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)

    dump(rows, "nations.json")
    dump(hub, "hub.json")
    if fiba_hub:
        dump(fiba_hub, "fiba_ranking.json")
    for slug, d in details.items():
        dump(d, "nation-detail", slug + ".json")


# --------------------------------------------------------------------------
# Self-test - real cases read out of the two dumps, not synthetic ones.
# --------------------------------------------------------------------------
def self_test():
    wc, sched = parse_wc()
    podiums = parse_oly()
    by_year = {e["year"]: e for e in wc}
    pod = {p["year"]: p for p in podiums}
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    # 1976, the first women's tournament: a single round robin, so the podium
    # has to come out of the standings table.
    check("1976 podium",
          (pod[1976]["gold"], pod[1976]["silver"], pod[1976]["bronze"]),
          ("Soviet Union", "United States", "Bulgaria"))
    check("1976 host", pod[1976]["host"], "Canada")
    check("Olympic editions", len(podiums), 13)

    # United States Olympic gold through 2024.
    us_gold = sorted(y for y, p in pod.items() if p["gold"] == "United States")
    check("US gold years", us_gold,
          [1984, 1988, 1996, 2000, 2004, 2008, 2012, 2016, 2020, 2024])
    check("US gold count", len(us_gold), 10)

    # World Cup, first and latest played editions.
    check("1953 champion", by_year[1953]["champion"], "United States")
    check("1953 score", by_year[1953]["score"], "49-36")
    check("1953 runner-up", by_year[1953]["runner_up"], "Chile")
    check("1953 host", by_year[1953]["host"], "Chile")
    check("2022 champion", by_year[2022]["champion"], "United States")
    check("2022 score", by_year[2022]["score"], "83-61")
    check("2022 runner-up", by_year[2022]["runner_up"], "China")
    check("2022 third", by_year[2022]["third"], "Australia")
    check("2022 fourth", by_year[2022]["fourth"], "Canada")
    check("2022 teams", by_year[2022]["teams"], 12)
    check("WC editions", len(wc), 19)
    check("2026 not counted as played", [s["year"] for s in sched], [2026])

    # Lineage: the Soviet Union's 1983 world title is Russia's row, attributed.
    hub, rows, _fiba, details = build()
    ru = next(r for r in rows if r["slug"] == "russia")
    if 1983 not in ru["wc_title_years"]:
        fails.append("Russia wc_title_years missing 1983: %s" % ru["wc_title_years"])
    if not ru["lineage"] or "Soviet Union" not in ru["lineage"]:
        fails.append("Russia lineage missing Soviet Union: %s" % ru["lineage"])
    c83 = next((c for c in details["russia"]["campaigns"] if c["year"] == 1983), None)
    check("1983 attribution", c83 and (c83["finish"], c83["as"]),
          ("Champions", "Soviet Union"))
    o80 = next((o for o in details["russia"]["olympics"] if o["year"] == 1980), None)
    check("1980 Olympic attribution", o80 and (o80["medal"], o80["as"]),
          ("gold", "Soviet Union"))
    # Unified Team 1992 gold lands on Russia too, attributed as itself.
    o92 = next((o for o in details["russia"]["olympics"] if o["year"] == 1992), None)
    check("1992 Olympic attribution", o92 and (o92["medal"], o92["as"]),
          ("gold", "Unified Team"))
    check("wc_apps stays null", ru["wc_apps"], None)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("self-test OK: %d Olympic editions, %d World Cup editions, %d nations"
          % (len(podiums), len(wc), len(rows)))
    return 0


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())
    hub, rows, fiba_hub, details = build()
    write(hub, rows, fiba_hub, details)
    print("nations: %d | Olympic editions: %d | World Cup editions: %d"
          % (len(rows), len(hub["podiums"]), len(hub["wc_finals"])))
    print("WC champions:", [(e["year"], e["champion"]) for e in reversed(hub["wc_finals"])])
    if fiba_hub:
        print("FIBA women top 5:", [(t["rank"], t["country"]) for t in fiba_hub["teams"][:5]])


if __name__ == "__main__":
    main()
