#!/usr/bin/env python3
"""Build the Women's International portal data (/teams/wnational).

Emits, under public/data/wintl:
  euros.json        UEFA Women's Championship (1984-2025) - knockout shape
  olympics.json     Olympic women's football (1996-2024)  - medal-table shape
  finalissima.json  Women's Finalissima (2023)            - one-off
Each carries {meta, editions, nations}. The Women's World Cup keeps its own
existing data (public/data/football/womens-world-cup.json); this hub links to it.

Run host-side:  python scripts/intl_sport/build_womens_intl.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "data", "wintl")

# Fold historical names onto the modern nation for honour tallies.
LINEAGE = {"West Germany": "Germany"}

FINISH_RANK = {"Champions": 0, "Runners-up": 1, "Semi-finalist": 2}

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def fold(name):
    return LINEAGE.get(name.strip(), name.strip())

def read_rows(fname):
    with open(os.path.join(HERE, fname), encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    header = lines[0].split("|")
    return [dict(zip(header, ln.split("|"))) for ln in lines[1:]]


def build_knockout(rows, label, slug):
    """champion / runner-up / two semi-finalists per edition."""
    editions, finals, nat = [], [], {}

    def add(name, year, finish, host, raw=None):
        m = fold(name)
        if not m:
            return
        nat.setdefault(m, {"results": [], "raw": set()})
        nat[m]["results"].append({"year": year, "finish": finish, "host": host})
        if raw and raw != m:
            nat[m]["raw"].add(raw)

    for r in rows:
        year, host = r["year"], r["host"]
        champ, ru = r["champion"].strip(), r["runner_up"].strip()
        sf = [r["sf1"].strip(), r["sf2"].strip()]
        editions.append({"year": year, "host": host, "champion": champ,
                         "runner_up": ru, "score": r["score"].strip(),
                         "semifinalists": [s for s in sf if s]})
        finals.append({"year": year, "champion": champ, "runner_up": ru,
                       "score": r["score"].strip(), "host": host})
        add(champ, year, "Champions", host, champ)
        add(ru, year, "Runners-up", host, ru)
        for s in sf:
            add(s, year, "Semi-finalist", host, s)

    nations = []
    for name, d in nat.items():
        res = sorted(d["results"], key=lambda x: x["year"], reverse=True)
        yrs = sorted(int(re.match(r"\d{4}", x["year"]).group()) for x in d["results"])
        ty = [x["year"] for x in d["results"] if x["finish"] == "Champions"]
        ry = [x["year"] for x in d["results"] if x["finish"] == "Runners-up"]
        sy = [x["year"] for x in d["results"] if x["finish"] == "Semi-finalist"]
        best = min(d["results"], key=lambda x: FINISH_RANK[x["finish"]])["finish"]
        nations.append({
            "slug": slugify(name), "name": name, "apps": len(res),
            "titles": len(ty), "title_years": ty,
            "runner_ups": len(ry), "ru_years": ry,
            "semis": len(sy), "semi_years": sy,
            "best_finish": best, "first": yrs[0], "last": yrs[-1],
            "lineage": sorted(d["raw"]) or None,
            "results": res,
        })
    nations.sort(key=lambda t: (-t["titles"], -t["runner_ups"], -t["semis"], t["name"]))
    return {
        "meta": {"label": label, "slug": slug, "editions": len(editions),
                 "nations": len(nations),
                 "year_min": editions[0]["year"], "year_max": editions[-1]["year"]},
        "editions": editions, "finals": finals, "nations": nations,
    }


def build_medals(rows, label, slug):
    editions, nat = [], {}

    def add(name, year, medal, host):
        m = fold(name)
        if not m:
            return
        nat.setdefault(m, [])
        nat[m].append({"year": year, "medal": medal, "host": host})

    for r in rows:
        year, host = r["year"], r["host"]
        g, s, b, f = (r["gold"].strip(), r["silver"].strip(),
                      r["bronze"].strip(), r["fourth"].strip())
        editions.append({"year": year, "host": host, "gold": g, "silver": s,
                         "bronze": b, "fourth": f})
        add(g, year, "Gold", host)
        add(s, year, "Silver", host)
        add(b, year, "Bronze", host)
        add(f, year, "Fourth", host)

    MRANK = {"Gold": 0, "Silver": 1, "Bronze": 2, "Fourth": 3}
    nations = []
    for name, res in nat.items():
        res_sorted = sorted(res, key=lambda x: x["year"], reverse=True)
        yrs = sorted(int(x["year"]) for x in res)
        gold = [x["year"] for x in res if x["medal"] == "Gold"]
        silver = [x["year"] for x in res if x["medal"] == "Silver"]
        bronze = [x["year"] for x in res if x["medal"] == "Bronze"]
        best = min(res, key=lambda x: MRANK[x["medal"]])["medal"]
        nations.append({
            "slug": slugify(name), "name": name, "apps": len(res),
            "gold": len(gold), "gold_years": gold,
            "silver": len(silver), "bronze": len(bronze),
            "medals": len(gold) + len(silver) + len(bronze),
            "best_finish": best if best != "Fourth" else "4th",
            "first": yrs[0], "last": yrs[-1], "results": res_sorted,
        })
    nations.sort(key=lambda t: (-t["gold"], -t["silver"], -t["bronze"], t["name"]))
    return {
        "meta": {"label": label, "slug": slug, "editions": len(editions),
                 "nations": len([n for n in nations if n["medals"] > 0]),
                 "year_min": editions[0]["year"], "year_max": editions[-1]["year"]},
        "editions": editions, "nations": nations,
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    euros = build_knockout(read_rows("womens_euros.txt"), "UEFA Women's Championship", "womens-euros")
    olympics = build_medals(read_rows("womens_olympics.txt"), "Olympic Women's Football", "womens-olympics")
    finalissima = {
        "meta": {"label": "Women's Finalissima", "slug": "womens-finalissima",
                 "editions": 1, "nations": 2, "year_min": "2023", "year_max": "2023"},
        "editions": [{"year": "2023", "host": "England", "champion": "England",
                      "runner_up": "Brazil", "score": "1-1 (4-2 p)",
                      "venue": "Wembley Stadium, London"}],
        "finals": [{"year": "2023", "champion": "England", "runner_up": "Brazil",
                    "score": "1-1 (4-2 p)", "host": "England"}],
        "nations": [
            {"slug": "england", "name": "England", "titles": 1, "best_finish": "Champions"},
            {"slug": "brazil", "name": "Brazil", "titles": 0, "best_finish": "Runners-up"},
        ],
    }
    for name, data in [("euros", euros), ("olympics", olympics), ("finalissima", finalissima)]:
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"euros: {euros['meta']['nations']} nations / {euros['meta']['editions']} eds; "
          f"olympics: {olympics['meta']['nations']} medal nations / {olympics['meta']['editions']} eds; "
          f"finalissima: 1 ed")

if __name__ == "__main__":
    main()
