#!/usr/bin/env python3
"""International Basketball + EuroLeague data.

Inputs (committed beside this script): basketballwc.txt (FIBA World Cup,
all editions 1950-2023 — pools + knockouts; 1950-1974 were round-robin
finals), basketballolympics.txt (Olympic podiums, all 21 editions),
plus the Euroleague Table sheet in OtherLeagues.xlsx.

Lineages follow the user's Olympic rules: Soviet Union/Unified Team ->
Russia, Yugoslavia/FR Yugoslavia/Serbia and Montenegro -> Serbia, with
per-edition "as" attribution. Olympic GOLD is the ultimate-trophy chip
(user decision); World Cup titles are a regular stat.

Outputs under public/data/basketball/:
  nations.json, hub.json, nation-detail/<slug>.json, euroleague.json

Run from repo root: python scripts/basketball/build_intl_basketball.py
"""
import io
import json
import os
import re
import unicodedata
from collections import defaultdict

from openpyxl import load_workbook

# --- Supabase source of truth for the EuroLeague table (migrated 2026-07 from
# OtherLeagues.xlsx). Read-only anon key; order by id to preserve sheet order so
# order-dependent output (e.g. title_years) stays byte-identical.
_SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
           or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
_SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def _sb_fetch(table, select, order="id"):
    import urllib.request, urllib.parse, urllib.error, time
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{_SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": _SB_KEY, "Authorization": f"Bearer {_SB_KEY}"})
        batch = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    batch = json.load(resp)
                break
            except (urllib.error.HTTPError, urllib.error.URLError):
                if attempt == 4:
                    raise
                time.sleep(2 * (attempt + 1))
        out += batch
        if len(batch) < step:
            return out
        off += step

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WC = os.path.join(HERE, "basketballwc.txt")
OLY = os.path.join(HERE, "basketballolympics.txt")
XLSX = os.path.join(ROOT, "OtherLeagues.xlsx")
ALL_TEAMS = os.path.join(ROOT, "public", "data", "sports", "all-teams.json")
OUT = os.path.join(ROOT, "public", "data", "basketball")

LINEAGE = {
    "Soviet Union": "Russia", "Unified Team": "Russia",
    "Yugoslavia": "Serbia", "FR Yugoslavia": "Serbia",
    "Serbia and Montenegro": "Serbia",
    # 1950-1986 predecessor/defunct entities, folded by the user's Olympic
    # rules. Czechoslovakia folds into the modern node the WC data already
    # labels "Czech Republic"; Formosa (1959) is the ROC, now Chinese Taipei.
    "West Germany": "Germany",
    "Czechoslovakia": "Czech Republic",
    "Formosa": "Chinese Taipei",
    "United Arab Republic": "Egypt",
}

# Canonical championship-game results for the editions on file. The dump's
# sparse year markers blend adjacent editions (1998 lives inside the 2002
# block with no header), so finals come from this reviewed table; the
# parser's findings are printed as validation only.
FINALS_CANON = {
    # 1950-1974 were decided by a final round-robin (no championship game);
    # the score shown is the decisive top-two meeting where the champion won
    # it, or "round-robin" for 1974 where the title went on overall record.
    1950: {"champion": "Argentina", "ru": "United States", "score": "64-50"},
    1954: {"champion": "United States", "ru": "Brazil", "score": "62-41"},
    1959: {"champion": "Brazil", "ru": "United States", "score": "81-67"},
    1963: {"champion": "Brazil", "ru": "Yugoslavia", "score": "90-71"},
    1967: {"champion": "Soviet Union", "ru": "Yugoslavia", "score": "71-59"},
    1970: {"champion": "Yugoslavia", "ru": "Brazil", "score": "80-55"},
    1974: {"champion": "Soviet Union", "ru": "Yugoslavia", "score": "round-robin"},
    1978: {"champion": "Yugoslavia", "ru": "Soviet Union", "score": "82-81 (OT)"},
    1982: {"champion": "Soviet Union", "ru": "United States", "score": "95-94"},
    1986: {"champion": "United States", "ru": "Soviet Union", "score": "87-85"},
    1990: {"champion": "Yugoslavia", "ru": "Soviet Union", "score": "92-75"},
    1994: {"champion": "United States", "ru": "Russia", "score": "137-91"},
    1998: {"champion": "Yugoslavia", "ru": "Russia", "score": "64-62"},
    2002: {"champion": "Yugoslavia", "ru": "Argentina", "score": "84-77 (OT)"},
    2006: {"champion": "Spain", "ru": "Greece", "score": "70-47"},
    2010: {"champion": "United States", "ru": "Turkey", "score": "81-64"},
    2014: {"champion": "United States", "ru": "Serbia", "score": "129-92"},
    2019: {"champion": "Spain", "ru": "Argentina", "score": "95-75"},
    2023: {"champion": "Germany", "ru": "Serbia", "score": "83-77"},
}


def canon(name):
    name = re.sub(r"\(H\)", "", name.replace(" ", " ")).strip()
    # Strip championship/host markers: (C), (H), (C, H), (H, C).
    name = re.sub(r"\s*\((?:C|H)(?:\s*,\s*(?:C|H))*\)", "", name)
    name = re.sub(r"\[\w+\]", "", name).strip()
    return name


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


def parse_wc():
    lines = io.open(WC, encoding="utf-8").read().splitlines()
    year, rnd = None, ""
    standings = defaultdict(lambda: defaultdict(lambda: {"w": 0, "l": 0}))
    finals = {}  # year -> {champion, ru, score}
    ROUNDS = {"Final", "Semi-finals", "Semifinals", "Quarter-finals",
              "Quarterfinals", "Third place game", "Second round",
              "First round", "Classification"}
    for raw in lines:
        s = raw.strip()
        if re.fullmatch(r"(19|20)\d\d", s):
            year, rnd = int(s), ""
            continue
        # Sparse year markers: blocks can hold several editions. Any
        # "<year> FIBA World ..." title line re-anchors the current edition.
        # A title or lede line re-anchors the edition year. Qualification
        # tables reference prior editions ("1959 FIBA World Championship /
        # host nation ...") as tab-delimited rows, so never let a table row
        # (any line with a tab, or a "/ host nation" cell) re-anchor.
        if "\t" not in raw and "/" not in s:
            ym = re.search(r"\b((?:19|20)\d{2}) FIBA "
                           r"(?:World Championship|Basketball World Cup)\b", s)
            if ym:
                year, rnd = int(ym.group(1)), ""
                continue
        if s in ROUNDS or s.startswith("Classification"):
            rnd = s
            continue
        cells = raw.split("\t")
        # standings row
        if (len(cells) >= 5 and cells[0].strip().isdigit()
                and cells[2].strip().isdigit() and cells[3].strip().isdigit()):
            team = canon(cells[1])
            if team and year:
                t = standings[year][team]
                t["w"] += int(cells[3])
                t["l"] += int(cells[4]) if cells[4].strip().isdigit() else 0
            continue
        # game line: "TeamA \t\t87–81\t\t TeamB"
        m = re.match(r"^(.*?)\t+(\d+)[–-](\d+)\t+(.*?)\t*$", raw)
        if m and year and rnd == "Final":
            a, sa, sb, b = canon(m.group(1)), int(m.group(2)), int(m.group(3)), canon(m.group(4))
            if a and b:
                champ = a if sa > sb else b
                ru = b if champ == a else a
                finals[year] = {"champion": champ, "ru": ru,
                                "score": f"{max(sa, sb)}-{min(sa, sb)}"}
    return standings, finals


def parse_oly():
    lines = io.open(OLY, encoding="utf-8").read().splitlines()
    podiums = []
    year = None
    cur = {}
    for raw in lines:
        s = raw.strip()
        m = re.match(r"Men's Olympics - (\d{4}) Schedule", s)
        if m:
            if cur.get("gold"):
                podiums.append(cur)
            year = int(m.group(1))
            cur = {"year": year}
            continue
        m = re.match(r"◉ (Gold|Silver|Bronze): (.+)$", s)
        if m and year:
            cur[m.group(1).lower()] = canon(m.group(2))
    if cur.get("gold"):
        podiums.append(cur)
    return sorted(podiums, key=lambda p: -p["year"])


def parse_euroleague():
    rows = _sb_fetch("euroleague_seasons",
                     "season,competition,team,canonical_name,country,w,l,"
                     "playoffs,qf_app,final_four_app,final_app,champion", order="id")
    out = []
    for r in rows:
        if not r.get("season") or not r.get("team"):
            continue
        out.append({
            "season": str(r["season"]), "comp": str(r.get("competition") or ""),
            "team": str(r.get("canonical_name") or r["team"]).strip(),
            "country": str(r.get("country") or ""),
            "w": int(r.get("w") or 0), "l": int(r.get("l") or 0),
            "playoffs": bool(r.get("playoffs")), "qf": bool(r.get("qf_app")),
            "f4": bool(r.get("final_four_app")), "final": bool(r.get("final_app")),
            "champs": bool(r.get("champion")),
        })
    return out


FIBA = os.path.join(HERE, "fiba_ranking.json")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")

# Geographic continent -> FIBA ranking zone. FIBA folds Oceania into Asia.
_CONT_ZONE = {
    "North America": "Americas", "South America": "Americas",
    "Africa": "Africa", "Europe": "Europe", "Asia": "Asia", "Oceania": "Asia",
}
# Federations FIBA places in Europe despite a non-European geography.
_FIBA_EUROPE = {"israel", "turkiye", "georgia", "armenia", "azerbaijan", "cyprus"}
# FIBA name-slug -> countries.json slug, where slug/name matching would miss.
_FIBA_TO_COUNTRY = {
    "usa": "united-states", "turkiye": "turkey", "korea": "south-korea",
    "uae": "united-arab-emirates", "czechia": "czech-republic",
    "bosnia-and-herzegovina": "bosnia-herzegovina",
    "virgin-islands": "us-virgin-islands",
    "st-vincent-and-the-grenadines": "st-vincent-the-grenadines",
    "brunei-darussalam": "brunei", "hong-kong-china": "hong-kong",
    "chinese-taipei": "taiwan", "great-britain": "united-kingdom",
    "central-african-rep": "central-african-republic", "st-lucia": "saint-lucia",
    "cote-d-ivoire": "cote-divoire",
}
# FIBA name-slug -> portal basketball node slug, for the per-nation rank chip.
_FIBA_TO_NODE = {
    "usa": "united-states", "turkiye": "turkey", "korea": "south-korea",
    "czechia": "czech-republic", "cote-d-ivoire": "ivory-coast",
    "central-african-rep": "central-african-republic",
}
# FIBA slugs to leave as their FIBA team name (not the countries.json name).
_FIBA_KEEP_NAME = {"chinese-taipei"}

# Portal node display name -> countries.json slug, so the shown name is the
# user's canonical country name. Slugs and internal keys are unchanged.
NODE_CANON_SLUG = {"Ivory Coast": "cote-divoire"}


def _country_names():
    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    return {c["slug"]: c["name"] for c in countries}


# Current country + metro for EuroLeague clubs NOT in the Team List. The
# workbook stores the historical country (CSKA Moscow -> "Soviet Union"); we
# show the modern country and link the metro. Clubs whose city is not yet a
# metro in the corpus get a country but no metro (metro_slug stays None).
EL_CLUB_META = {
    "PBC CSKA Moscow": ("Russia", "Moscow", "moscow"),
    "KK Split": ("Croatia", "Split", "split"),
    "Rīgas ASK": ("Latvia", "Riga", "riga"),
    "KK Cibona": ("Croatia", "Zagreb", "zagreb"),
    "KK Bosna": ("Bosnia-Herzegovina", "Sarajevo", "sarajevo"),
    "BC Dinamo Tbilisi": ("Georgia", "Tbilisi", "tbilisi"),
    "KK Budućnost": ("Montenegro", "Podgorica", "podgorica"),
    "BC Budivelnyk": ("Ukraine", "Kyiv", "kyiv"),
    "BC Brno": ("Czech Republic", "Brno", "brno"),
    "Basket Brno": ("Czech Republic", "Brno", "brno"),
    "USK Praha": ("Czech Republic", "Prague", "prague"),
    "BC Prievidza": ("Slovakia", None, None),
    "AdW Berlin": ("Germany", "Berlin", "berlin"),
    "Limoges CSP": ("France", "Limoges", "limoges"),
    "Virtus Roma": ("Italy", "Rome", "rome"),
    "Mens Sana Basketball Siena": ("Italy", "Siena", "siena"),
    "Aris BC": ("Greece", "Thessaloniki", "thessaloniki"),
    "AEK BC": ("Greece", "Athens", "athens"),
    "CB Estudiantes": ("Spain", "Madrid", "madrid"),
    "Fortitudo Bologna": ("Italy", "Bologna", "bologna"),
    # Cities that aren't their own metro -> the parent metro (user decision).
    "Pallacanestro Varese": ("Italy", "Milan", "milan"),
    "Pallacanestro Cantù": ("Italy", "Milan", "milan"),
    "Joventut Badalona": ("Spain", "Barcelona", "barcelona"),
    "Benetton Treviso": ("Italy", "Padua-Venice", "padua-venice"),
}


def parse_fiba(node_slugs):
    """Current FIBA World Ranking (Men), enriched with FIBA zone and a portal
    node slug. Returns (hub_doc, {node_slug: record}); ([], {}) if absent."""
    if not os.path.exists(FIBA):
        return None, {}
    doc = json.load(io.open(FIBA, encoding="utf-8"))
    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    cont_slug = {c["slug"]: c.get("continent") for c in countries}
    cont_name = {slugify(c["name"]): c.get("continent") for c in countries}
    name_slug = {c["slug"]: c["name"] for c in countries}
    teams, by_node = [], {}
    for t in doc["teams"]:
        sl = slugify(t["country"])
        cs = _FIBA_TO_COUNTRY.get(sl, sl)
        cont = (cont_slug.get(cs) or cont_name.get(cs)
                or cont_slug.get(sl) or cont_name.get(sl))
        zone = "Europe" if sl in _FIBA_EUROPE else _CONT_ZONE.get(cont)
        node = _FIBA_TO_NODE.get(sl, sl)
        node = node if node in node_slugs else None
        # Display the user's canonical countries.json name (Cote d'Ivoire,
        # Bosnia-Herzegovina, ...); keep FIBA's own name for Chinese Taipei.
        canon = name_slug.get(cs) or name_slug.get(sl)
        display = t["country"] if sl in _FIBA_KEEP_NAME else (canon or t["country"])
        # Country-profile slug, so every ranked nation can link somewhere.
        country_slug = cs if cs in name_slug else (sl if sl in name_slug else None)
        rec = {"rank": t["rank"], "country": display, "ioc": t["ioc"],
               "zone": zone, "zoneRank": t["zoneRank"], "pts": t["pts"],
               "delta": t["delta"], "slug": node, "country_slug": country_slug}
        teams.append(rec)
        if node:
            by_node[node] = rec
    hub = {"date": doc["date"], "label": doc.get("label", doc["date"]),
           "source": doc["source"], "teams": teams}
    return hub, by_node


def _sizes(doc):
    """{key: magnitude} for a JSON doc, so a shrink guard compares like with like.

    euroleague.json mixes row LISTS (roll, clubs, most_titled) with a scalar
    COUNT (seasons: 69). The first version of this guard did
    len(doc.get("seasons", doc)), which raises TypeError on an int -- and the
    except turned that into "exists but could not be read", so fiba-weekly
    hard-failed every run from 2026-09-01 against a perfectly healthy file.
    Comparing every key also guards more than the original did: a drop in any
    of roll/clubs/most_titled now stops the write too, not just seasons."""
    if isinstance(doc, list):
        return {"": len(doc)}
    if not isinstance(doc, dict):
        return {}
    out = {}
    for k, v in doc.items():
        if isinstance(v, bool):
            continue
        if isinstance(v, int):
            out[k] = v
        elif hasattr(v, "__len__"):
            out[k] = len(v)
    return out


def main():
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    standings, parsed_finals = parse_wc()
    for y, f in parsed_finals.items():
        c = FINALS_CANON.get(y)
        if c and c["champion"] != f["champion"]:
            print(f"VALIDATION: parsed {y} final {f} != canon {c}")
    finals = FINALS_CANON
    podiums = parse_oly()
    el = parse_euroleague()

    # ---------------- Nations ----------------
    nations = defaultdict(lambda: {
        "wc_apps": [], "wc_titles": [], "wc_ru": [],
        "gold": [], "silver": [], "bronze": [],
        "as": defaultdict(list),
    })

    def ent(name):
        return LINEAGE.get(name, name)

    wc_campaigns = defaultdict(list)
    for year, teams in sorted(standings.items()):
        f = finals.get(year, {})
        for team, rec in teams.items():
            e = ent(team)
            n = nations[e]
            n["wc_apps"].append(year)
            if team != e:
                n["as"][year].append(team)
            finish = ("Champions" if f.get("champion") == team
                      else "Runners-up" if f.get("ru") == team else None)
            if finish == "Champions":
                n["wc_titles"].append(year)
            if finish == "Runners-up":
                n["wc_ru"].append(year)
            wc_campaigns[e].append({
                "year": year, "w": rec["w"], "l": rec["l"],
                "finish": finish, "as": team if team != e else None,
            })
    for p in podiums:
        for medal in ("gold", "silver", "bronze"):
            name = p.get(medal)
            if not name:
                continue
            e = ent(name)
            nations[e][medal].append(p["year"])
            if name != e:
                nations[e]["as"][p["year"]].append(name)

    country_names = _country_names()
    nation_rows = []
    ent_by_slug = {}
    for name, n in nations.items():
        sl = slugify(name)
        ent_by_slug[sl] = name
        nation_rows.append({
            "slug": sl, "name": country_names.get(NODE_CANON_SLUG.get(name, ""), name),
            "wc_apps": len(set(n["wc_apps"])),
            "wc_titles": len(n["wc_titles"]), "wc_title_years": sorted(n["wc_titles"]),
            "wc_ru": len(n["wc_ru"]), "wc_ru_years": sorted(n["wc_ru"]),
            "gold": len(n["gold"]), "gold_years": sorted(n["gold"]),
            "silver": len(n["silver"]), "bronze": len(n["bronze"]),
            "medals": len(n["gold"]) + len(n["silver"]) + len(n["bronze"]),
            "lineage": sorted({a for ys in n["as"].values() for a in ys}) or None,
        })
    nation_rows.sort(key=lambda x: (-x["gold"], -x["wc_titles"], -x["medals"], x["name"]))

    # ---------------- FIBA World Ranking ----------------
    node_slugs = {nr["slug"] for nr in nation_rows}
    fiba_hub, fiba_by_node = parse_fiba(node_slugs)
    for nr in nation_rows:
        r = fiba_by_node.get(nr["slug"])
        if r:
            nr["fiba_rank"] = r["rank"]
            nr["fiba_pts"] = r["pts"]
            nr["fiba_zone"] = r["zone"]
            nr["fiba_zone_rank"] = r["zoneRank"]
            nr["fiba_delta"] = r["delta"]

    # ---------------- EuroLeague aggregates ----------------
    by_club = defaultdict(lambda: {"w": 0, "l": 0, "seasons": 0, "f4": 0,
                                   "finals": 0, "champs": [], "country": ""})
    roll = []
    for r in el:
        c = by_club[r["team"]]
        c["w"] += r["w"]; c["l"] += r["l"]; c["seasons"] += 1
        c["f4"] += 1 if r["f4"] else 0
        c["finals"] += 1 if r["final"] else 0
        c["country"] = r["country"] or c["country"]
        if r["champs"]:
            c["champs"].append(r["season"])
    seasons = defaultdict(lambda: {"f4": []})
    for r in el:
        if r["champs"]:
            seasons[r["season"]]["champion"] = r["team"]
        elif r["final"]:
            seasons[r["season"]]["ru"] = r["team"]
        if r["f4"]:
            seasons[r["season"]]["f4"].append(r["team"])
    for s in sorted(seasons, reverse=True):
        sd = seasons[s]
        champ, ru = sd.get("champion", ""), sd.get("ru", "")
        # The two beaten semi-finalists (Final Four era, 1987-88 onward).
        others = [t for t in sd["f4"] if t not in (champ, ru)]
        roll.append({"season": s, "champion": champ, "ru": ru,
                     "f4_others": others})

    teams_doc = json.load(io.open(ALL_TEAMS, encoding="utf-8"))
    teams_doc = teams_doc if isinstance(teams_doc, list) else teams_doc.get("teams", [])
    # Team List carries the modern country + metro for current clubs.
    tl_meta = {(t.get("team") or t.get("name")):
               (t.get("country"), t.get("metro"), t.get("metro_slug"))
               for t in teams_doc if t.get("league") == "EuroLeague"}
    tl_el = set(tl_meta)

    clubs = []
    for k, v in sorted(by_club.items(), key=lambda kv: -len(kv[1]["champs"])):
        tl, cur = tl_meta.get(k), EL_CLUB_META.get(k)
        country = (tl and tl[0]) or (cur and cur[0]) or v["country"]
        metro = (tl and tl[1]) or (cur and cur[1])
        metro_slug = (tl and tl[2]) or (cur and cur[2])
        clubs.append({
            "name": k, "w": v["w"], "l": v["l"], "seasons": v["seasons"],
            "f4": v["f4"], "finals": v["finals"],
            "titles": len(v["champs"]), "title_years": v["champs"],
            "country": country, "metro": metro, "metro_slug": metro_slug,
            "in_team_list": k in tl_el,
        })

    euroleague = {
        "roll": roll,
        "clubs": clubs,
        "most_titled": [{"name": c["name"], "titles": c["titles"]}
                        for c in clubs if c["titles"] > 0][:10],
        "seasons": len({r["season"] for r in el}),
    }

    hub = {
        "wc_finals": [{"year": y, **finals[y]} for y in sorted(finals, reverse=True)],
        "wc_editions_on_file": sorted(standings.keys()),
        "podiums": podiums,
        "totals": {"nations": len(nation_rows), "podium_editions": len(podiums)},
    }

    # 🔴 SHRINK GUARD on the Supabase-fed file. euroleague.json is the only
    # output here that comes from a live table rather than a committed input, so
    # a partial read would quietly publish a thinner season list. Same failure
    # mode that cost the conflicts dataset five centuries of war in 2026.
    _el_path = os.path.join(OUT, "euroleague.json")
    if os.path.exists(_el_path):
        try:
            _before = json.load(io.open(_el_path, encoding="utf-8"))
        except ValueError as e:                     # corrupt is not a licence to wipe
            raise SystemExit(f"ERROR: {_el_path} exists but could not be parsed ({e}); "
                             f"refusing to overwrite it.")
        _shrunk = [f"{k or 'rows'} {b} -> {_sizes(euroleague)[k]}"
                   for k, b in _sizes(_before).items()
                   if k in _sizes(euroleague) and _sizes(euroleague)[k] < b]
        if _shrunk:
            raise SystemExit("ERROR: euroleague.json would shrink (" + "; ".join(_shrunk)
                             + "). Refusing to write; check the table before re-running.")

    os.makedirs(os.path.join(OUT, "nation-detail"), exist_ok=True)
    json.dump(nation_rows, io.open(os.path.join(OUT, "nations.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(hub, io.open(os.path.join(OUT, "hub.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(euroleague, io.open(os.path.join(OUT, "euroleague.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    if fiba_hub:
        json.dump(fiba_hub, io.open(os.path.join(OUT, "fiba_ranking.json"), "w",
                  encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    for nr in nation_rows:
        ent = ent_by_slug[nr["slug"]]
        json.dump({
            "slug": nr["slug"], "name": nr["name"],
            "campaigns": sorted(wc_campaigns.get(ent, []), key=lambda c: -c["year"]),
            "podium_years": {
                "gold": nations[ent]["gold"], "silver": nations[ent]["silver"],
                "bronze": nations[ent]["bronze"],
            },
            "fiba": fiba_by_node.get(nr["slug"]),
        }, io.open(os.path.join(OUT, "nation-detail", nr["slug"] + ".json"), "w",
                   encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)

    print("nations:", len(nation_rows), "| WC finals:", len(finals),
          "| podium editions:", len(podiums), "| EL seasons:", euroleague["seasons"])
    print("WC champions:", [(y, finals[y]["champion"]) for y in sorted(finals)])
    print("EL roll head:", roll[:3])
    print("EL clubs not in Team List (no chips):",
          [c["name"] for c in clubs if c["titles"] > 0 and not c["in_team_list"]][:12])


if __name__ == "__main__":
    main()
