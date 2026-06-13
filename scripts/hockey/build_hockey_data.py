#!/usr/bin/env python3
"""International ice hockey portal data (/teams/hockey).

Sources (committed beside this script):
  hockey_olympics.txt  Olympic men's podiums 1920-2026 (the ultimate trophy)
  hockey_worldcup.txt  Canada Cup / World Cup of Hockey 1976-2016 (champion, RU)
  hockey_iihf.txt      IIHF World Championship year-by-year (Gold/Silver/Bronze/4th)

Historical lineages fold into modern nations (Soviet Union / Unified Team / ROC
/ Olympic Athletes from Russia -> Russia; Czechoslovakia / Czechia -> Czech
Republic; West Germany -> Germany), attributed per edition. Olympic gold is the
headline honour; the World Cup is secondary and the annual Worlds least.

Outputs under public/data/hockey/: nations.json, hub.json, team-detail/<slug>.json
Run from repo root: python scripts/hockey/build_hockey_data.py
"""
import io
import json
import os
import re
import unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OLY = os.path.join(HERE, "hockey_olympics.txt")
WC = os.path.join(HERE, "hockey_worldcup.txt")
IIHF = os.path.join(HERE, "hockey_iihf.txt")
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")
OUT = os.path.join(ROOT, "public", "data", "hockey")

LINEAGE = {
    "Soviet Union": "Russia", "Unified Team": "Russia", "ROC": "Russia",
    "Olympic Athletes from Russia": "Russia", "OAR": "Russia",
    "Czechoslovakia": "Czech Republic", "Czechia": "Czech Republic",
    "West Germany": "Germany",
}
# Team names kept as-is (no canonical countries.json rename).
KEEP_NAME = {"Great Britain", "Team Europe", "Unified Team", "Soviet Union",
             "Czechoslovakia", "West Germany", "ROC",
             "Olympic Athletes from Russia"}


def canon(name):
    if not name:
        return ""
    n = name.replace(" ", " ").strip()
    n = re.sub(r"\s*\([^)]*\)\s*$", "", n)   # trailing (12) or (1/23) count
    n = re.sub(r"\[[^\]]*\]", "", n)
    return n.replace("†", "").replace("*", "").strip()


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


def norm(s):
    out = "".join(ch for ch in unicodedata.normalize("NFKD", s)
                  if not (0x300 <= ord(ch) <= 0x36f))
    return (out.replace("&", " and ").replace(".", " ")
            .replace("  ", " ").lower().strip())


def ent(name):
    return LINEAGE.get(name, name)


def parse_oly():
    rows = []
    for ln in io.open(OLY, encoding="utf-8").read().splitlines()[1:]:
        c = ln.split("\t")
        if len(c) >= 4 and re.match(r"^\d{4}$", c[0].strip()):
            rows.append({"year": int(c[0]), "gold": canon(c[1]),
                         "silver": canon(c[2]), "bronze": canon(c[3])})
    return rows


def parse_wc():
    rows = []
    for ln in io.open(WC, encoding="utf-8").read().splitlines():
        if ln.startswith("#") or ln.startswith("Year\t"):
            continue
        c = ln.split("\t")
        if len(c) >= 4 and re.match(r"^\d{4}$", c[0].strip()):
            rows.append({"year": int(c[0]), "event": c[1].strip(),
                         "champion": canon(c[2]), "ru": canon(c[3])})
    return rows


def parse_iihf():
    rows = []
    for ln in io.open(IIHF, encoding="utf-8").read().splitlines():
        if not re.match(r"^\d{4}", ln.strip()):
            continue
        if "not held" in ln.lower() or "cancel" in ln.lower():
            continue
        c = ln.split("\t")
        if len(c) >= 4 and canon(c[1]) and canon(c[2]) and canon(c[3]):
            rows.append({"year": int(re.match(r"^(\d{4})", ln.strip()).group(1)),
                         "gold": canon(c[1]), "silver": canon(c[2]),
                         "bronze": canon(c[3])})
    return rows


def main():
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    canon_by_norm = {norm(c["name"]): c["name"] for c in countries}
    slug_by_norm = {norm(c["name"]): c["slug"] for c in countries}

    def display(node):
        return node if node in KEEP_NAME else canon_by_norm.get(norm(node), node)

    oly, wc, iihf = parse_oly(), parse_wc(), parse_iihf()

    nations = defaultdict(lambda: {
        "oly_gold": [], "oly_silver": [], "oly_bronze": [],
        "wc_titles": [], "wc_ru": [],
        "worlds_gold": [], "worlds_silver": [], "worlds_bronze": [],
        "as": set(),
    })
    detail = defaultdict(lambda: {"oly": [], "wc": [], "worlds": []})

    def add(raw, year, key, dkey, medal):
        e = ent(raw)
        nations[e][key].append(year)
        if raw != e:
            nations[e]["as"].add(raw)
        detail[e][dkey].append({"year": year, "medal": medal})

    for r in oly:
        add(r["gold"], r["year"], "oly_gold", "oly", "Gold")
        add(r["silver"], r["year"], "oly_silver", "oly", "Silver")
        add(r["bronze"], r["year"], "oly_bronze", "oly", "Bronze")
    for r in wc:
        ec = ent(r["champion"])
        nations[ec]["wc_titles"].append(r["year"])
        if r["champion"] != ec:
            nations[ec]["as"].add(r["champion"])
        detail[ec]["wc"].append({"year": r["year"], "event": r["event"], "medal": "Champion"})
        er = ent(r["ru"])
        nations[er]["wc_ru"].append(r["year"])
        if r["ru"] != er:
            nations[er]["as"].add(r["ru"])
        detail[er]["wc"].append({"year": r["year"], "event": r["event"], "medal": "Runner-up"})
    for r in iihf:
        add(r["gold"], r["year"], "worlds_gold", "worlds", "Gold")
        add(r["silver"], r["year"], "worlds_silver", "worlds", "Silver")
        add(r["bronze"], r["year"], "worlds_bronze", "worlds", "Bronze")

    rows = []
    for node, n in nations.items():
        og, os_, ob = len(n["oly_gold"]), len(n["oly_silver"]), len(n["oly_bronze"])
        wg, ws, wb = len(n["worlds_gold"]), len(n["worlds_silver"]), len(n["worlds_bronze"])
        rows.append({
            "slug": slugify(node), "name": display(node),
            "oly_gold": og, "oly_silver": os_, "oly_bronze": ob,
            "oly_medals": og + os_ + ob, "oly_gold_years": sorted(n["oly_gold"]),
            "wc_titles": len(n["wc_titles"]), "wc_title_years": sorted(n["wc_titles"]),
            "wc_ru": len(n["wc_ru"]), "wc_ru_years": sorted(n["wc_ru"]),
            "worlds_gold": wg, "worlds_silver": ws, "worlds_bronze": wb,
            "worlds_medals": wg + ws + wb, "worlds_gold_years": sorted(n["worlds_gold"]),
            "lineage": sorted(n["as"]) or None,
            "_ent": node,
        })
    # Sort by the ultimate trophy: Olympic gold, then WC titles, then Worlds gold.
    rows.sort(key=lambda r: (-r["oly_gold"], -r["wc_titles"], -r["worlds_gold"],
                             -r["oly_medals"], r["name"]))
    # All-time Olympic medal-table rank (gold, silver, bronze), medalists only.
    rk = 0
    for r in sorted(rows, key=lambda r: (-r["oly_gold"], -r["oly_silver"], -r["oly_bronze"])):
        if r["oly_medals"] > 0:
            rk += 1
            r["oly_alltime_rank"] = rk
        else:
            r["oly_alltime_rank"] = None

    hub = {
        "olympic_podiums": sorted(oly, key=lambda r: -r["year"]),
        "world_cup": sorted(wc, key=lambda r: -r["year"]),
        "worlds": [{"year": r["year"], "gold": r["gold"], "silver": r["silver"],
                    "bronze": r["bronze"]} for r in sorted(iihf, key=lambda r: -r["year"])],
        "totals": {"nations": len(rows), "oly_editions": len(oly),
                   "wc_editions": len(wc), "worlds_editions": len(iihf)},
    }

    os.makedirs(os.path.join(OUT, "team-detail"), exist_ok=True)
    for r in rows:
        ent_name = r.pop("_ent")
        d = detail[ent_name]
        json.dump({
            "slug": r["slug"], "name": r["name"],
            "oly": sorted(d["oly"], key=lambda x: -x["year"]),
            "wc": sorted(d["wc"], key=lambda x: -x["year"]),
            "worlds": sorted(d["worlds"], key=lambda x: -x["year"]),
        }, io.open(os.path.join(OUT, "team-detail", r["slug"] + ".json"), "w",
                   encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(rows, io.open(os.path.join(OUT, "nations.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(hub, io.open(os.path.join(OUT, "hub.json"), "w",
              encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)

    print("hockey: %d nations | %d Olympics | %d World Cups | %d Worlds" % (
        len(rows), len(oly), len(wc), len(iihf)))
    print("Olympic golds:", [(r["name"], r["oly_gold"]) for r in rows if r["oly_gold"] > 0])


if __name__ == "__main__":
    main()
