#!/usr/bin/env python3
"""Generic national-team portal builder for two-tier sports: the Olympics (the
ultimate trophy) + a World Championship. Used for handball and volleyball, which
have no Canada-Cup-style middle tier (unlike ice hockey).

Usage: python scripts/intl_sport/build_worlds_portal.py <sport>
  <sport> in {handball, volleyball}; reads <sport>_olympics.txt and
  <sport>_worlds.txt (Year/Gold/Silver/Bronze TSV) beside this script and writes
  public/data/<sport>/{nations.json, hub.json, team-detail/<slug>.json}.

Lineage folds (per edition): Soviet Union / Unified Team / ROC -> Russia;
Czechoslovakia / Czechia -> Czech Republic; West Germany -> Germany; Yugoslavia /
FR Yugoslavia / Serbia and Montenegro -> Serbia. East Germany stays separate.
"""
import io, json, os, re, sys, unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
COUNTRIES = os.path.join(ROOT, "public", "data", "countries.json")

LINEAGE = {
    "Soviet Union": "Russia", "Unified Team": "Russia", "ROC": "Russia",
    "Olympic Athletes from Russia": "Russia", "OAR": "Russia",
    "Czechoslovakia": "Czech Republic", "Czechia": "Czech Republic",
    "West Germany": "Germany",
    "Yugoslavia": "Serbia", "FR Yugoslavia": "Serbia",
    "Serbia and Montenegro": "Serbia",
}
KEEP_NAME = {"Great Britain", "East Germany", "Soviet Union", "Czechoslovakia",
             "West Germany", "Yugoslavia", "FR Yugoslavia", "Serbia and Montenegro",
             "Unified Team", "ROC"}


def canon(name):
    if not name:
        return ""
    n = re.sub(r"\s*\([^)]*\)\s*$", "", name.strip())
    n = re.sub(r"\[[^\]]*\]", "", n)
    return n.replace("†", "").replace("*", "").strip()


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


def norm(s):
    out = "".join(ch for ch in unicodedata.normalize("NFKD", s)
                  if not (0x300 <= ord(ch) <= 0x36f))
    return out.replace("&", " and ").replace(".", " ").replace("  ", " ").lower().strip()


def ent(name):
    return LINEAGE.get(name, name)


def parse_tsv(path):
    rows = []
    for ln in io.open(path, encoding="utf-8").read().splitlines()[1:]:
        c = ln.split("\t")
        if len(c) >= 4 and re.match(r"^\d{4}$", c[0].strip()):
            rows.append({"year": int(c[0]), "gold": canon(c[1]),
                         "silver": canon(c[2]), "bronze": canon(c[3])})
    return rows


def main():
    sport = sys.argv[1]
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    OUT = os.path.join(ROOT, "public", "data", sport)
    oly = parse_tsv(os.path.join(HERE, f"{sport}_olympics.txt"))
    worlds = parse_tsv(os.path.join(HERE, f"{sport}_worlds.txt"))

    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    canon_by_norm = {norm(c["name"]): c["name"] for c in countries}
    slug_by_norm = {norm(c["name"]): c["slug"] for c in countries}

    def display(node):
        return node if node in KEEP_NAME else canon_by_norm.get(norm(node), node)

    nations = defaultdict(lambda: {
        "oly_gold": [], "oly_silver": [], "oly_bronze": [],
        "worlds_gold": [], "worlds_silver": [], "worlds_bronze": [], "as": set(),
    })
    detail = defaultdict(lambda: {"oly": [], "worlds": []})

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
    for r in worlds:
        add(r["gold"], r["year"], "worlds_gold", "worlds", "Gold")
        add(r["silver"], r["year"], "worlds_silver", "worlds", "Silver")
        add(r["bronze"], r["year"], "worlds_bronze", "worlds", "Bronze")

    rows = []
    for node, n in nations.items():
        og, osv, ob = len(n["oly_gold"]), len(n["oly_silver"]), len(n["oly_bronze"])
        wg, ws, wb = len(n["worlds_gold"]), len(n["worlds_silver"]), len(n["worlds_bronze"])
        rows.append({
            "slug": slugify(node), "name": display(node),
            "country_slug": slug_by_norm.get(norm(display(node))),
            "oly_gold": og, "oly_silver": osv, "oly_bronze": ob,
            "oly_medals": og + osv + ob, "oly_gold_years": sorted(n["oly_gold"]),
            "worlds_gold": wg, "worlds_silver": ws, "worlds_bronze": wb,
            "worlds_medals": wg + ws + wb, "worlds_gold_years": sorted(n["worlds_gold"]),
            "lineage": sorted(n["as"]) or None, "_ent": node,
        })
    rows.sort(key=lambda r: (-r["oly_gold"], -r["worlds_gold"], -r["oly_medals"],
                             -r["worlds_medals"], r["name"]))
    rk = 0
    for r in sorted(rows, key=lambda r: (-r["oly_gold"], -r["oly_silver"], -r["oly_bronze"])):
        if r["oly_medals"] > 0:
            rk += 1
            r["oly_alltime_rank"] = rk
        else:
            r["oly_alltime_rank"] = None

    hub = {
        "olympic_podiums": sorted(oly, key=lambda r: -r["year"]),
        "worlds": sorted(worlds, key=lambda r: -r["year"]),
        "totals": {"nations": len(rows), "oly_editions": len(oly),
                   "worlds_editions": len(worlds)},
    }

    os.makedirs(os.path.join(OUT, "team-detail"), exist_ok=True)
    for r in rows:
        d = detail[r.pop("_ent")]
        json.dump({
            "slug": r["slug"], "name": r["name"], "country_slug": r["country_slug"],
            "oly": sorted(d["oly"], key=lambda x: -x["year"]),
            "worlds": sorted(d["worlds"], key=lambda x: -x["year"]),
        }, io.open(os.path.join(OUT, "team-detail", r["slug"] + ".json"), "w",
                   encoding="utf-8", newline=""), separators=(",", ":"), ensure_ascii=False)
    json.dump(rows, io.open(os.path.join(OUT, "nations.json"), "w", encoding="utf-8", newline=""),
              separators=(",", ":"), ensure_ascii=False)
    json.dump(hub, io.open(os.path.join(OUT, "hub.json"), "w", encoding="utf-8", newline=""),
              separators=(",", ":"), ensure_ascii=False)

    print("%s: %d nations | %d Olympics | %d Worlds" % (sport, len(rows), len(oly), len(worlds)))
    print("Olympic golds:", [(r["name"], r["oly_gold"]) for r in rows if r["oly_gold"] > 0])


if __name__ == "__main__":
    main()
