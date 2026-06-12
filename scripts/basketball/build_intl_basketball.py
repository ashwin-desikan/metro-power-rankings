#!/usr/bin/env python3
"""International Basketball + EuroLeague data.

Inputs (committed beside this script): basketballwc.txt (FIBA World Cup,
7 editions on file: 1990, 1994, 2006, 2010, 2014, 2019, 2023 — pools +
knockouts), basketballolympics.txt (Olympic podiums, all 21 editions),
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
}

# Canonical championship-game results for the editions on file. The dump's
# sparse year markers blend adjacent editions (1998 lives inside the 2002
# block with no header), so finals come from this reviewed table; the
# parser's findings are printed as validation only.
FINALS_CANON = {
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
        ym = re.search(r"\b((?:19|20)\d{2}) FIBA World", s)
        if ym:
            year, rnd = int(ym.group(1)), rnd if "final" in s.lower() else ""
            if "final" in s.lower():
                rnd = "Final"
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
    wb = load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["Euroleague Table"]
    rows = list(ws.iter_rows(values_only=True))[1:]
    out = []
    for r in rows:
        if not r[0] or not r[2]:
            continue
        out.append({
            "season": str(r[0]), "comp": str(r[1] or ""),
            "team": str(r[20] or r[2]).strip(), "country": str(r[3] or ""),
            "w": int(r[8] or 0), "l": int(r[9] or 0),
            "playoffs": r[11] == "Y", "qf": r[12] == "Y", "f4": r[13] == "Y",
            "final": r[14] == "Y", "champs": r[15] == "Y",
        })
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

    nation_rows = []
    for name, n in nations.items():
        nation_rows.append({
            "slug": slugify(name), "name": name,
            "wc_apps": len(set(n["wc_apps"])),
            "wc_titles": len(n["wc_titles"]), "wc_title_years": sorted(n["wc_titles"]),
            "wc_ru": len(n["wc_ru"]), "wc_ru_years": sorted(n["wc_ru"]),
            "gold": len(n["gold"]), "gold_years": sorted(n["gold"]),
            "silver": len(n["silver"]), "bronze": len(n["bronze"]),
            "medals": len(n["gold"]) + len(n["silver"]) + len(n["bronze"]),
            "lineage": sorted({a for ys in n["as"].values() for a in ys}) or None,
        })
    nation_rows.sort(key=lambda x: (-x["gold"], -x["wc_titles"], -x["medals"], x["name"]))

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
    seasons = defaultdict(dict)
    for r in el:
        if r["champs"]:
            seasons[r["season"]]["champion"] = r["team"]
        elif r["final"]:
            seasons[r["season"]]["ru"] = r["team"]
    for s in sorted(seasons, reverse=True):
        roll.append({"season": s, "champion": seasons[s].get("champion", ""),
                     "ru": seasons[s].get("ru", "")})

    teams_doc = json.load(io.open(ALL_TEAMS, encoding="utf-8"))
    teams_doc = teams_doc if isinstance(teams_doc, list) else teams_doc.get("teams", [])
    tl_el = {(t.get("team") or t.get("name")) for t in teams_doc
             if t.get("league") == "EuroLeague"}

    clubs = [{"name": k, **v,
              "titles": len(v["champs"]), "title_years": v.pop("champs"),
              "in_team_list": k in tl_el}
             for k, v in sorted(by_club.items(), key=lambda kv: -len(kv[1]["champs"]))]

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

    os.makedirs(os.path.join(OUT, "nation-detail"), exist_ok=True)
    json.dump(nation_rows, io.open(os.path.join(OUT, "nations.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(hub, io.open(os.path.join(OUT, "hub.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(euroleague, io.open(os.path.join(OUT, "euroleague.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    for nr in nation_rows:
        e = nr["name"]
        json.dump({
            "slug": nr["slug"], "name": e,
            "campaigns": sorted(wc_campaigns.get(e, []), key=lambda c: -c["year"]),
            "podium_years": {
                "gold": nations[e]["gold"], "silver": nations[e]["silver"],
                "bronze": nations[e]["bronze"],
            },
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
