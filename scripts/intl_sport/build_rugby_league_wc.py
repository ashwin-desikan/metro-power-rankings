#!/usr/bin/env python3
"""Build the International Rugby League (World Cup) portal data.

Reads scripts/intl_sport/rugby_league_wc.txt (pipe-delimited, one row per
World Cup edition with champion / runner-up / two semi-finalists) and emits
the baseball-style JSON under public/data/rugby-league-intl:
  hub.json          editions + finals roll + totals
  teams.json        per-nation honour record (titles / runners-up / semis)
  team-detail/<slug>.json   edition-by-edition finishes for one nation

The source only records the final four of each edition, so "apps" means
"editions reached the semi-finals or better", not total tournament entries.
Run host-side:  python scripts/intl_sport/build_rugby_league_wc.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "rugby_league_wc.txt")
OUT = os.path.join(ROOT, "public", "data", "rugby-league-intl")

FINISH_RANK = {"Champions": 0, "Runners-up": 1, "Semi-finalist": 2}

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def main():
    with open(SRC, encoding="utf-8") as f:
        lines = [ln.rstrip("\n") for ln in f if ln.strip()]
    header = lines[0].split("|")
    rows = [dict(zip(header, ln.split("|"))) for ln in lines[1:]]

    editions = []
    finals = []
    # nation -> list of {year, finish, host}
    nat = {}

    def add(name, year, finish, host):
        name = name.strip()
        if not name:
            return
        nat.setdefault(name, []).append({"year": year, "finish": finish, "host": host})

    for r in rows:
        year = r["year"]
        host = r["host"]
        teams = int(r["teams"])
        champ, ru = r["champion"].strip(), r["runner_up"].strip()
        sf = [r["sf1"].strip(), r["sf2"].strip()]
        editions.append({
            "ed": int(r["ed"]), "year": year, "host": host, "teams": teams,
            "champion": champ, "runner_up": ru, "score": r["score"].strip(),
            "semifinalists": [s for s in sf if s],
        })
        finals.append({
            "year": year, "champion": champ, "runner_up": ru,
            "score": r["score"].strip(), "host": host,
        })
        add(champ, year, "Champions", host)
        add(ru, year, "Runners-up", host)
        for s in sf:
            add(s, year, "Semi-finalist", host)

    teams_out = []
    for name, results in nat.items():
        results_sorted = sorted(results, key=lambda x: x["year"], reverse=True)
        years = sorted(int(re.match(r"\d{4}", r["year"]).group()) for r in results)
        title_years = [r["year"] for r in results if r["finish"] == "Champions"]
        ru_years = [r["year"] for r in results if r["finish"] == "Runners-up"]
        sf_years = [r["year"] for r in results if r["finish"] == "Semi-finalist"]
        best = min(results, key=lambda r: FINISH_RANK[r["finish"]])["finish"]
        teams_out.append({
            "slug": slugify(name), "name": name,
            "apps": len(results),
            "titles": len(title_years), "title_years": title_years,
            "runner_ups": len(ru_years), "ru_years": ru_years,
            "semis": len(sf_years), "semi_years": sf_years,
            "best_finish": best,
            "first": years[0], "last": years[-1],
        })
    teams_out.sort(key=lambda t: (-t["titles"], -t["runner_ups"], -t["semis"], t["name"]))

    hub = {
        "editions": editions,
        "finals": finals,
        "total_editions": len(editions),
        "total_nations": len(teams_out),
    }

    os.makedirs(os.path.join(OUT, "team-detail"), exist_ok=True)
    with open(os.path.join(OUT, "hub.json"), "w", encoding="utf-8") as f:
        json.dump(hub, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "teams.json"), "w", encoding="utf-8") as f:
        json.dump(teams_out, f, ensure_ascii=False, indent=2)
    for t in teams_out:
        detail = {
            "slug": t["slug"], "name": t["name"],
            "results": sorted(nat[t["name"]], key=lambda x: x["year"], reverse=True),
        }
        with open(os.path.join(OUT, "team-detail", f"{t['slug']}.json"), "w", encoding="utf-8") as f:
            json.dump(detail, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(teams_out)} nations, {len(editions)} editions to {OUT}")

if __name__ == "__main__":
    main()
