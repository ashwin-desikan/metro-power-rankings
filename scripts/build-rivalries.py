#!/usr/bin/env python3
"""
build-rivalries.py - assemble the cross-sport rivalry dataset (public/data/rivalries.json).

DIRECTED model: each team carries its biggest rivals (top-2, plus any marquee
NAMED series as an allowed extra), so rivalries can be ONE-SIDED. Every entry
carries `mutual` (does the rival list this team back?) so the UI can show which
way it runs. Every rivalry has a name: a distinctive one (Iron Bowl, The Ashes,
Subway Series) or a default "TeamA-TeamB rivalry".

Sources: data/dir-majors.txt (NFL/NBA/NHL/MLB/CBB top-2 by Wikipedia pageviews),
data/dir-rugby.txt (curated), data/cricket/trophies.json (cricket), Rivalries.xlsx
(hand-curated football + CFB), and a curated NAMED_SERIES list.
"""
import json
import os
import re
import unicodedata
import datetime

import openpyxl

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "public", "data", "rivalries.json")
CAP = 2

URL_SEG = {"nfl": "nfl", "nba": "nba", "nhl": "nhl", "mlb": "mlb", "cbb": "cbb",
           "college-football": "cfb", "football": "football", "cricket": "cricket",
           "rugby-union": "rugby-union", "nrl": "nrl", "afl": "afl", "cfl": "cfl",
           "wnba": "wnba"}

LEAGUE_COUNTRY = {"nfl": "United States", "nba": "United States", "nhl": "United States",
                  "mlb": "United States", "cbb": "United States", "college-football": "United States",
                  "wnba": "United States", "afl": "Australia", "nrl": "Australia", "cfl": "Canada"}

# Canonical sport names (match lib/sportsCatalog.ts `sport`): college and pro
# share one sport name.
SPORT_LABEL = {"nfl": "American Football", "college-football": "American Football",
               "cfl": "Canadian Football", "nba": "Basketball", "wnba": "Basketball",
               "cbb": "Basketball", "mlb": "Baseball", "nhl": "Hockey",
               "football": "Football", "cricket": "Cricket", "rugby-union": "Rugby Union",
               "nrl": "Rugby League", "afl": "Aussie Rules"}

CRICKET_EXCLUDE = {("australia", "westindies")}  # directed (nation, rival) to drop

# Directed (lg, teamNorm, rivalNorm) relationships to suppress so a mirrored
# seed rivalry becomes one-way (the dropped side does not list the other).
DROP_DIRECTED = {
    ("football", "chelsea", "queensparkrangers"),
    ("football", "chelsea", "fulham"),
}

CBB_ALIAS = {"Carolina": "North Carolina", "NC State": "North Carolina State",
             "UConn": "Connecticut", "Penn": "Pennsylvania", "UMass": "Massachusetts",
             "VCU": "Virginia Commonwealth", "Saint Mary's": "Saint Mary's (CA)",
             "St. John's": "St. John's (NY)", "Ole Miss": "Mississippi"}

# Marquee named series the pageview pass misses (their articles aren't "A-B
# rivalry"). Added both ways (two-sided) and allowed past the cap.
NAMED_SERIES = [  # added both ways (mutual)
    ("nhl", "Flames", "Oilers", "Battle of Alberta"),
    ("nhl", "Kings", "Ducks", "Freeway Face-Off"),
    ("cbb", "Kansas", "Kansas State", "Sunflower Showdown"),
    ("cbb", "Kansas", "Missouri", "Border War"),
    ("cbb", "Duke", "Kentucky", ""),
]
NAMED_ONESIDED = [  # added one way only: (lg, from, to, name)
    ("nhl", "Senators", "Maple Leafs", "Battle of Ontario"),
]

# Best-assertion TOP rivalries per sport (get a "Top Rivalry" badge). 2-3 per
# sport, except association football where the count follows fierceness.
TOP_RIVALRIES = [
    ("nfl", "Packers", "Bears"), ("nfl", "Cowboys", "Eagles"), ("nfl", "Steelers", "Ravens"),
    ("nfl", "Cowboys", "Commanders"), ("nfl", "Chiefs", "Raiders"), ("nfl", "Packers", "Vikings"),
    ("nba", "Celtics", "Lakers"), ("nba", "Celtics", "76ers"),
    ("nhl", "Bruins", "Canadiens"), ("nhl", "Canadiens", "Maple Leafs"), ("nhl", "Rangers", "Islanders"),
    ("mlb", "Yankees", "Red Sox"), ("mlb", "Dodgers", "Giants"), ("mlb", "Cubs", "Cardinals"),
    ("college-football", "Ohio State", "Michigan"), ("college-football", "Alabama", "Auburn"), ("college-football", "Army", "Navy"), ("college-football", "Oklahoma", "Texas"),
    ("cbb", "North Carolina", "Duke"), ("cbb", "Kentucky", "Louisville"),
    ("cricket", "Australia", "England"), ("cricket", "India", "Pakistan"), ("cricket", "Australia", "India"),
    ("rugby-union", "New Zealand", "Australia"), ("rugby-union", "New Zealand", "South Africa"), ("rugby-union", "England", "Scotland"),
    ("afl", "Collingwood", "Carlton"), ("afl", "West Coast", "Fremantle"),
    ("nrl", "South Sydney", "Sydney Roosters"),
    ("cfl", "Saskatchewan Roughriders", "Winnipeg Blue Bombers"),
    ("wnba", "New York Liberty", "Las Vegas Aces"),
    # association football — the fiercest, so more qualify
    ("football", "FC Barcelona", "Real Madrid"), ("football", "Rangers", "Celtic"),
    ("football", "Boca Juniors", "River Plate"), ("football", "Liverpool", "Everton"),
    ("football", "Arsenal", "Tottenham Hotspur"), ("football", "AC Milan", "Internazionale"),
    ("football", "Galatasaray SK", "Fenerbahçe SK"), ("football", "Olympiakos CFP", "Panathinaikos"),
    ("football", "Flamengo", "Fluminense"), ("football", "Benfica", "FC Porto"),
    ("football", "Borussia Dortmund", "Bayern Munich"), ("football", "Internazionale", "Juventus"),
    ("football", "Manchester United", "Liverpool"),
    ("football", "Brazil", "Argentina"), ("football", "England", "Germany"), ("football", "United States", "Mexico"),
]
TOP_SET = set()


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())


def jload(rel):
    return json.load(open(os.path.join(REPO, "public", "data", rel), encoding="utf-8"))


def franchise_resolver(lg):
    d = jload(f"{lg}/franchises.json")
    rows = d if isinstance(d, list) else (d.get("franchises") or d.get("teams") or list(d.values())[0])
    by = {}
    for r in rows:
        canonical = r.get("canonical") or r.get("display_name") or r.get("name")
        nick = r.get("team") or r.get("name") or canonical
        keys = [k for k in {canonical, r.get("display_name"), r.get("name"), r.get("team")} if k]
        rec = {"display": nick, "slug": r.get("slug"), "keys": keys, "country": r.get("country")}
        for k in keys:
            by[norm(k)] = rec
    return by


def cbb_resolver():
    d = jload("cbb/data.json")
    teams = d.get("teams") if isinstance(d, dict) else d
    by = {}
    for t in teams:
        if t.get("name") and t.get("slug"):
            by[norm(t["name"])] = {"display": t["name"], "slug": t["slug"], "keys": [t["name"]]}
    for a, tgt in CBB_ALIAS.items():
        if norm(tgt) in by:
            by[norm(a)] = by[norm(tgt)]
    return by


def simple_resolver(rel):
    d = jload(rel)
    teams = d.get("teams") if isinstance(d, dict) else d
    by = {}
    for t in teams:
        if t.get("name") and t.get("slug"):
            by[norm(t["name"])] = {"display": t["name"], "slug": t["slug"], "keys": [t["name"]]}
    return by


def football_resolver():
    by = {}
    for c in jload("football/index.json").get("clubs", []):
        if c.get("cur_name") and c.get("slug"):
            by[norm(c["cur_name"])] = {"display": c["cur_name"], "slug": c["slug"], "keys": [c["cur_name"]], "country": c.get("country")}
    return by


def cfb_resolver():
    """Display must be the proper-case program name (from cfb/data.json), not the
    normalized slug-lookup key (which is lower-case)."""
    d = jload("cfb/data.json")
    teams = d.get("teams") if isinstance(d, dict) else d
    by, slug2name = {}, {}
    for t in teams:
        if t.get("name") and t.get("slug"):
            by[norm(t["name"])] = {"display": t["name"], "slug": t["slug"], "keys": [t["name"]]}
            slug2name[t["slug"]] = t["name"]
    try:
        for k, v in jload("cfb/slug-lookup.json").items():
            if norm(k) not in by:
                disp = slug2name.get(v, k)
                by[norm(k)] = {"display": disp, "slug": v, "keys": [disp]}
    except Exception:
        pass
    return by


def national_resolver():
    by = {}
    for c in jload("countries.json"):
        if c.get("name") and c.get("slug"):
            by[norm(c["name"])] = {"display": c["name"], "slug": c["slug"], "keys": [c["name"]]}
    return by


def data_franchise_resolver(lg):
    by = {}
    for x in jload(f"{lg}/data.json").get("franchises", []):
        if x.get("name") and x.get("slug"):
            by[norm(x["name"])] = {"display": x["name"], "slug": x["slug"], "keys": [x["name"]]}
    return by


RES = {}


def res(lg):
    if lg not in RES:
        RES[lg] = {"nfl": lambda: franchise_resolver("nfl"), "nba": lambda: franchise_resolver("nba"),
                   "nhl": lambda: franchise_resolver("nhl"), "mlb": lambda: franchise_resolver("mlb"),
                   "cbb": cbb_resolver, "football": football_resolver, "college-football": cfb_resolver,
                   "cricket": lambda: simple_resolver("cricket/teams.json"),
                   "rugby-union": lambda: simple_resolver("rugby-union/teams.json"),
                   "nrl": lambda: data_franchise_resolver("nrl"),
                   "afl": lambda: data_franchise_resolver("afl"),
                   "cfl": lambda: data_franchise_resolver("cfl"),
                   "wnba": lambda: data_franchise_resolver("wnba"),
                   "national": national_resolver}[lg]()
    return RES[lg]


by_team = {}     # leagueKey -> normKey -> [entry]  (lists shared across a team's keys)
pairs = {}       # frozenset -> row (kept for naming/dedup)
directed = []    # hub: one row per directed (team -> rival) relationship
DIR = set()      # (leagueKey, teamDisplayNorm, rivalDisplayNorm)


def seg_href(lg, slug):
    s = URL_SEG.get(lg)
    return f"/teams/{s}/{slug}" if (slug and s) else ""


def country_for(scope, lg, rt, rr):
    if scope == "National" or lg in ("cricket", "rugby-union"):
        return "World"
    ca, cb = rt.get("country"), rr.get("country")
    if ca and cb and ca == cb:
        return ca
    return ca or LEAGUE_COUNTRY.get(lg, cb or "")


def add(lg, team_name, rival_name, name="", scope="Club", url_lg=None, force=False):
    url_lg = url_lg or lg
    resolve_lg = "national" if scope == "National" else lg
    rt = res(resolve_lg).get(norm(team_name))
    rr = res(resolve_lg).get(norm(rival_name))
    if not rt or not rr:
        return False
    if (lg, norm(rt["display"]), norm(rr["display"])) in DROP_DIRECTED:
        return False
    DIR.add((lg, norm(rt["display"]), norm(rr["display"])))
    bucket = by_team.setdefault(lg, {})
    keys = [norm(k) for k in rt["keys"]]
    lst = None
    for k in keys:
        if k in bucket:
            lst = bucket[k]
            break
    if lst is None:
        lst = []
    for k in keys:
        bucket[k] = lst  # all of the team's spellings point at one list

    existing = next((e for e in lst if e["_rn"] == norm(rr["display"])), None)
    if existing:
        if name and not existing["rivalry"]:
            existing["rivalry"] = name
        return True
    if len(lst) >= CAP and not force:
        return False
    seg = "national" if scope == "National" else url_lg
    team_href = f"/teams/national/{rt['slug']}" if scope == "National" else seg_href(seg, rt["slug"])
    rival_href = f"/teams/national/{rr['slug']}" if scope == "National" else seg_href(seg, rr["slug"])
    entry = {"rivalry": name, "rival": rr["display"], "href": rival_href,
             "scope": scope, "trophy": "", "type": "", "tier": "", "blurb": "", "wikipedia": "",
             "_td": rt["display"], "_rd": rr["display"], "_tn": norm(rt["display"]), "_rn": norm(rr["display"])}
    lst.append(entry)
    directed.append({"lg": lg, "team": {"name": rt["display"], "href": team_href},
                     "entry": entry, "country": country_for(scope, lg, rt, rr)})
    pk = frozenset((norm(rt["display"]), norm(rr["display"]), lg))
    if pk not in pairs:
        pairs[pk] = {"lg": lg, "rivalry": name, "country": country_for(scope, lg, rt, rr),
                     "a": {"name": rt["display"], "href": (f"/teams/national/{rt['slug']}" if scope == "National" else seg_href(seg, rt["slug"]))},
                     "b": {"name": rr["display"], "href": (f"/teams/national/{rr['slug']}" if scope == "National" else seg_href(seg, rr["slug"]))}}
    elif name and not pairs[pk]["rivalry"]:
        pairs[pk]["rivalry"] = name
    return True


def load_dir_majors():
    for line in open(os.path.join(REPO, "data", "dir-majors.txt"), encoding="utf-8"):
        line = line.strip()
        if not line or "|" not in line or ">" not in line:
            continue
        lg, rest = line.split("|", 1)
        team, rivals = rest.split(">", 1)
        for rv in [x.strip() for x in rivals.split(",") if x.strip()]:
            add(lg, team.strip(), rv, force=True)  # dir files are pre-capped per league


def load_curated(fname, lg, force=True):
    """Curated directed lists "Team>Rival:Name,Rival:Name" (rugby, mlb). Named
    series and authoritative sources bypass the cap (force)."""
    for line in open(os.path.join(REPO, "data", fname), encoding="utf-8"):
        line = line.strip()
        if not line or ">" not in line:
            continue
        team, rivals = line.split(">", 1)
        for rv in [x.strip() for x in rivals.split(",") if x.strip()]:
            rival, name = (rv.split(":", 1) + [""])[:2]
            if rival.strip():
                add(lg, team.strip(), rival.strip(), name.strip(), force=force)


def load_extra(fname="dir-extra.txt", force=True):
    """Curated cross-league directed lists "lg|Team>Rival:Name,Rival:Name"."""
    for line in open(os.path.join(REPO, "data", fname), encoding="utf-8"):
        line = line.strip()
        if not line or "|" not in line or ">" not in line:
            continue
        lg, rest = line.split("|", 1)
        team, rivals = rest.split(">", 1)
        for rv in [x.strip() for x in rivals.split(",") if x.strip()]:
            rival, name = (rv.split(":", 1) + [""])[:2]
            if rival.strip():
                add(lg.strip(), team.strip(), rival.strip(), name.strip(), force=force)


def load_cricket():
    t = json.load(open(os.path.join(REPO, "data", "cricket", "trophies.json"), encoding="utf-8"))
    contrib = {}
    for row in t["summary"]:
        name, matchup, count = row[0], row[1], (row[6] or 0)
        if " v " not in matchup:
            continue
        a, b = [x.strip() for x in matchup.split(" v ", 1)]
        contrib.setdefault(a, []).append((b, name, count))
        contrib.setdefault(b, []).append((a, name, count))
    contrib.setdefault("India", []).append(("Pakistan", "", 10000))
    contrib.setdefault("Pakistan", []).append(("India", "", 10000))
    for nation, lst in contrib.items():
        lst = [x for x in lst if (norm(nation), norm(x[0])) not in CRICKET_EXCLUDE]
        for rival, name, _ in sorted(lst, key=lambda x: -x[2])[:CAP]:
            add("cricket", nation, rival, name)
    add("cricket", "Australia", "India", "Border-Gavaskar Trophy", force=True)  # ensure two-way


def load_xlsx_seed():
    wb = openpyxl.load_workbook(os.path.join(REPO, "Rivalries.xlsx"), read_only=True, data_only=True)
    ws = wb["Rivalries"]
    it = ws.iter_rows(values_only=True)
    header = list(next(it))
    idx = {h: i for i, h in enumerate(header)}

    def g(row, col):
        v = row[idx[col]] if col in idx and idx[col] < len(row) else None
        return str(v).strip() if v is not None else ""

    for row in it:
        sport = g(row, "Sport")
        if sport not in ("Football", "College Football"):
            continue
        scope = g(row, "Scope") or "Club"
        rivalry, a, b = g(row, "Rivalry"), g(row, "Team A"), g(row, "Team B")
        if not a or not b:
            continue
        if sport == "College Football":
            add("college-football", a, b, rivalry, "College")
            add("college-football", b, a, rivalry, "College")
        elif scope == "National":
            add("football", a, b, rivalry, "National")
            add("football", b, a, rivalry, "National")
        else:
            add("football", a, b, rivalry, "Club")
            add("football", b, a, rivalry, "Club")
    wb.close()


def load_named_series():
    for lg, a, b, nm in NAMED_SERIES:
        add(lg, a, b, nm, force=True)
        add(lg, b, a, nm, force=True)
    for lg, a, b, nm in NAMED_ONESIDED:
        add(lg, a, b, nm, force=True)  # one direction only


def finalize():
    seen = set()
    for lg, bucket in by_team.items():
        for lst in bucket.values():
            for e in lst:
                if id(e) in seen:
                    continue
                seen.add(id(e))
                e["mutual"] = (lg, e["_rn"], e["_tn"]) in DIR
                e["top"] = (lg, frozenset((e["_tn"], e["_rn"]))) in TOP_SET
                if not e["rivalry"]:
                    e["rivalry"] = f'{e["_td"]}–{e["_rd"]} rivalry'
                for f in ("_td", "_rd", "_tn", "_rn"):
                    e.pop(f, None)


def main():
    load_dir_majors()
    load_curated("dir-mlb.txt", "mlb", force=True)
    load_curated("dir-rugby.txt", "rugby-union", force=True)
    load_extra()
    load_cricket()
    load_xlsx_seed()
    load_named_series()
    add("football", "Brazil", "Uruguay", "", scope="National", force=True)
    add("football", "Uruguay", "Brazil", "", scope="National", force=True)
    for lg, a, b in TOP_RIVALRIES:
        TOP_SET.add((lg, frozenset((norm(a), norm(b)))))
    finalize()

    # One row per unique rivalry (no duplicates). For a one-way rivalry the
    # antagonist (the side that lists the other) is the Team; for two-way the
    # stored order is kept.
    all_rows = []
    for r in pairs.values():
        lg = r["lg"]
        A, B = r["a"], r["b"]
        an, bn = norm(A["name"]), norm(B["name"])
        ab, ba = (lg, an, bn) in DIR, (lg, bn, an) in DIR
        two = ab and ba
        team, rival = (A, B) if (two or ab) else (B, A)
        name = r["rivalry"] or f'{team["name"]}–{rival["name"]} rivalry'
        all_rows.append({"sport": SPORT_LABEL.get(lg, lg), "rivalry": name,
                         "team": team, "rival": rival, "country": r.get("country", ""),
                         "twoWay": two, "top": (lg, frozenset((an, bn))) in TOP_SET})
    all_rows.sort(key=lambda r: (r["sport"], r["rivalry"], r["team"]["name"]))

    out = {"generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "by_team": by_team, "all": all_rows}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {OUT}: {len(all_rows)} rivalries across {len(by_team)} sports")
    for sk in sorted(by_team):
        print(f"    {sk}: {len(by_team[sk])} keys")


if __name__ == "__main__":
    main()
