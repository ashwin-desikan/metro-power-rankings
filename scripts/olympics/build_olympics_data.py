#!/usr/bin/env python3
"""Build /teams/olympics portal JSONs from the Olympedia medals-by-country dump.

Source: olympics.txt — Olympedia "Medals by country" tables for every Summer
and Winter Games plus the 1906 Intercalated Games (57 blocks; the two 1956
Summer hostings are merged into one edition).

Editorial rules (user decisions 2026-06-12):
  - Lineages fold into the modern NOC, eras visible per edition:
      Russia  = RUS + Soviet Union + Unified Team + ROC
      Serbia  = SRB + Yugoslavia + Serbia and Montenegro
      Czechia = CZE + Czechoslovakia + Bohemia
      Germany = GER + West Germany          (East Germany stays separate)
      Egypt   = EGY + United Arab Republic
  - 1906 Intercalated Games COUNT FULLY in all-time totals (deliberate
    divergence from IOC convention; noted in methodology).
  - Combined/special teams stay separate entities: East Germany, Australasia,
    West Indies Federation, Netherlands Antilles, Mixed team, Refugee Olympic
    Team, Independent Olympic Athletes, Individual Neutral Athletes.

Run: python build_olympics_v1.py <olympics.txt> <out_dir>
"""
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

# Original NOC code -> modern lineage code.
LINEAGE = {
    "URS": "RUS", "EUN": "RUS", "ROC": "RUS",
    "YUG": "SRB", "SCG": "SRB",
    "TCH": "CZE", "BOH": "CZE",
    "FRG": "GER",
    "UAR": "EGY",
}

# IOC formal names -> site display names.
DISPLAY = {
    "United States": "United States",
    "People's Republic of China": "China",
    "Republic of Korea": "South Korea",
    "Democratic People's Republic of Korea": "North Korea",
    "Islamic Republic of Iran": "Iran",
    "Kingdom of Saudi Arabia": "Saudi Arabia",
    "Republic of Moldova": "Moldova",
    "United Republic of Tanzania": "Tanzania",
    "Syrian Arab Republic": "Syria",
    "The Bahamas": "Bahamas",
    "Cabo Verde": "Cape Verde",
    "Côte d'Ivoire": "Côte d'Ivoire",
    "Ivory Coast": "Côte d'Ivoire",
    "Bosnia and Herzegovina": "Bosnia-Herzegovina",
    "Türkiye": "Turkey",
    "Hong Kong, China": "Hong Kong",
    "Russian Federation": "Russia",
    "Équipe Olympique des Réfugies": "Refugee Olympic Team",
    "ROC": "ROC",
}

# Special entities: never joined to a single country card.
SPECIAL = {"GDR", "ANZ", "WIF", "AHO", "MIX", "EOR", "IOA", "AIN"}

# Keep existing page URLs stable when a canonical rename would shift the slug.
SLUG_OVERRIDE = {"Côte d'Ivoire": "ivory-coast"}

# Entity -> related modern teams (for team-page cross-links) and the country
# pages that show the entity's card because they lack a modern team of their own.
RELATED = {
    "ANZ": {"teams": ["AUS", "NZL"], "countries": []},
    "WIF": {"teams": ["JAM", "TTO", "BAR"], "countries": []},
    "AHO": {"teams": [], "countries": ["Curacao", "Aruba", "Sint Maarten"]},
    "GDR": {"teams": ["GER"], "countries": []},
}


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


def main(path, out_dir):
    lines = open(path, encoding="utf-8").read().splitlines()
    blocks = []
    cur, year, season = None, None, None
    for l in lines:
        s = l.strip()
        if re.fullmatch(r"(18|19|20)\d\d", s):
            year = int(s)
        elif s in ("Summer", "Winter") and year:
            season = s
        elif s.startswith("NOC\t"):
            sn = "Intercalated" if year == 1906 else season
            blocks.append({"year": year, "season": sn, "rows": []})
            cur = blocks[-1]
        elif cur is not None:
            cells = l.split("\t")
            if len(cells) == 6 and cells[2].strip().isdigit():
                cur["rows"].append({
                    "name": cells[0].strip(), "code": cells[1].strip(),
                    "g": int(cells[2]), "s": int(cells[3]),
                    "b": int(cells[4]), "t": int(cells[5]),
                })
            elif s == "" or "Did you know" in s:
                cur = None

    # Merge same (year, season) blocks (1956 Stockholm + Melbourne).
    editions = {}
    for b in blocks:
        key = (b["year"], b["season"])
        ed = editions.setdefault(key, defaultdict(lambda: {"g": 0, "s": 0, "b": 0, "t": 0, "name": ""}))
        for r in b["rows"]:
            e = ed[r["code"]]
            e["g"] += r["g"]; e["s"] += r["s"]; e["b"] += r["b"]; e["t"] += r["t"]
            e["name"] = r["name"]

    code_name = {}
    for ed in editions.values():
        for code, e in ed.items():
            code_name.setdefault(code, e["name"])

    def display(code):
        raw = code_name[code]
        return DISPLAY.get(raw, raw)

    # Entity = lineage head code.
    def entity_of(code):
        return LINEAGE.get(code, code)

    rows_by_entity = defaultdict(list)  # entity -> per-edition rows
    for (yr, sn), ed in sorted(editions.items()):
        ranked = sorted(ed.items(), key=lambda kv: (-kv[1]["g"], -kv[1]["s"], -kv[1]["b"]))
        ranks = {code: i + 1 for i, (code, _) in enumerate(ranked)}
        per_entity = defaultdict(lambda: {"g": 0, "s": 0, "b": 0, "t": 0, "as": []})
        for code, e in ed.items():
            pe = per_entity[entity_of(code)]
            pe["g"] += e["g"]; pe["s"] += e["s"]; pe["b"] += e["b"]; pe["t"] += e["t"]
            pe["as"].append((code, ranks[code]))
        for ent, pe in per_entity.items():
            orig = [c for c, _ in pe["as"]]
            label = None
            if orig != [ent]:
                label = " + ".join(display(c) for c in orig) if len(orig) > 1 else display(orig[0])
            rows_by_entity[ent].append({
                "year": yr, "season": sn,
                "g": pe["g"], "s": pe["s"], "b": pe["b"], "total": pe["t"],
                "rank": min(r for _, r in pe["as"]),
                "as": label,
            })

    # Per-edition leaders at ENTITY level: who topped each Games by golds and
    # by total medals (1906 counts within Summer, per the totals decision).
    ent_ed = defaultdict(dict)  # (year, season) -> ent -> (g,s,b,t)
    for ent, rows in rows_by_entity.items():
        for r in rows:
            ent_ed[(r["year"], r["season"])][ent] = (r["g"], r["s"], r["b"], r["total"])
    no1 = defaultdict(lambda: {"summer_gold": 0, "summer_total": 0,
                               "winter_gold": 0, "winter_total": 0})
    for (yr, sn), ents in ent_ed.items():
        season_key = "winter" if sn == "Winter" else "summer"
        gold_leader = max(ents.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[1][2]))[0]
        total_leader = max(ents.items(), key=lambda kv: (kv[1][3], kv[1][0]))[0]
        no1[gold_leader][season_key + "_gold"] += 1
        no1[total_leader][season_key + "_total"] += 1

    teams = []
    for ent, rows in rows_by_entity.items():
        name = display(ent)
        g = sum(r["g"] for r in rows); s_ = sum(r["s"] for r in rows)
        b = sum(r["b"] for r in rows)
        summer = [r for r in rows if r["season"] in ("Summer", "Intercalated")]
        winter = [r for r in rows if r["season"] == "Winter"]
        teams.append({
            "slug": SLUG_OVERRIDE.get(name, slugify(name)), "code": ent, "name": name,
            "special": ent in SPECIAL,
            "lineage": sorted({display(c) for c in LINEAGE if LINEAGE[c] == ent}) or None,
            "apps": len(rows), "summer_apps": len(summer), "winter_apps": len(winter),
            "g": g, "s": s_, "b": b, "total": g + s_ + b,
            "summer": {"g": sum(r["g"] for r in summer), "s": sum(r["s"] for r in summer),
                       "b": sum(r["b"] for r in summer),
                       "first": min((r["year"] for r in summer), default=None),
                       "last": max((r["year"] for r in summer), default=None)},
            "winter": {"g": sum(r["g"] for r in winter), "s": sum(r["s"] for r in winter),
                       "b": sum(r["b"] for r in winter),
                       "first": min((r["year"] for r in winter), default=None),
                       "last": max((r["year"] for r in winter), default=None)},
            "best_rank": min(r["rank"] for r in rows),
            "no1": no1[ent],
            "first": min(r["year"] for r in rows), "last": max(r["year"] for r in rows),
            "related_teams": [display(c) for c in RELATED.get(ent, {}).get("teams", [])],
            "related_countries": RELATED.get(ent, {}).get("countries", []),
        })
    teams.sort(key=lambda t: (-t["g"], -t["s"], -t["b"]))

    # All-time medal-table rank (gold, then silver, then bronze ordering, our
    # lineage-folded version). Only medal-winning NOCs are ranked.
    rank = 0
    for t in teams:
        if t["total"] > 0:
            rank += 1
            t["alltime_rank"] = rank
        else:
            t["alltime_rank"] = None

    slug_by_name = {t["name"]: t["slug"] for t in teams}

    # Symmetric related-team links (Germany <-> East Germany, Australia <->
    # Australasia, etc.) so both sides cross-reference.
    by_name = {t["name"]: t for t in teams}
    for t in teams:
        for rel in list(t["related_teams"]):
            other = by_name.get(rel)
            if other and t["name"] not in other["related_teams"]:
                other["related_teams"].append(t["name"])

    eds_summary = []
    for (yr, sn), ed in sorted(editions.items()):
        ranked = sorted(ed.items(), key=lambda kv: (-kv[1]["g"], -kv[1]["s"], -kv[1]["b"]))
        top = [{"name": display(c), "g": e["g"], "s": e["s"], "b": e["b"]}
               for c, e in ranked[:3]]
        eds_summary.append({
            "year": yr, "season": sn, "nations": len(ed),
            "medals": sum(e["t"] for e in ed.values()),
            "top": top,
        })

    hub = {
        "editions": eds_summary,
        "totals": {"editions": len(eds_summary), "teams": len(teams),
                   "first": min(e["year"] for e in eds_summary),
                   "last": max(e["year"] for e in eds_summary)},
        "note_1906": "Counted fully in all-time totals by editorial choice; the IOC excludes it.",
    }

    os.makedirs(os.path.join(out_dir, "team-detail"), exist_ok=True)
    json.dump(teams, open(os.path.join(out_dir, "teams.json"), "w"), separators=(",", ":"))
    json.dump(hub, open(os.path.join(out_dir, "hub.json"), "w"), separators=(",", ":"))
    for t in teams:
        rows = sorted(rows_by_entity[t["code"]], key=lambda r: (-r["year"], r["season"]))
        json.dump({
            "slug": t["slug"], "name": t["name"],
            "editions": rows,
            "related_teams": [{"name": n, "slug": slug_by_name.get(n)} for n in t["related_teams"]],
        }, open(os.path.join(out_dir, "team-detail", t["slug"] + ".json"), "w"),
            separators=(",", ":"))

    print("editions:", len(eds_summary), "teams:", len(teams))
    print("top 10 all-time:", [(t["name"], t["g"], t["total"]) for t in teams[:10]])
    for probe in ("Russia", "Serbia", "Czechia", "Germany", "East Germany", "Egypt", "Australasia"):
        t = next((x for x in teams if x["name"] == probe), None)
        if t:
            print(f"  {probe}: G{t['g']} total {t['total']} apps {t['apps']} lineage={t['lineage']}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
