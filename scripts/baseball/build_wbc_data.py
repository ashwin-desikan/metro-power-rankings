#!/usr/bin/env python3
"""Build /teams/baseball portal JSONs from the World Baseball Classic dump.

Source: wbc.txt — Wikipedia text for all six WBC editions (2006, 2009, 2013,
2017, 2023, 2026): pool standings, every game line (road/home, score,
innings, venue, attendance), knockout rounds, and finals (game rows or
line-score blocks).

Emits:
  teams.json            - one row per participant nation
  hub.json              - finals roll, all-time table, editions summary
  team-detail/<slug>.json - per-edition campaigns + full game log

Run: python build_wbc_v1.py <wbc.txt> <out_dir>
"""
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}

ROUND_ORDER = [
    "First round", "Second round", "Quarterfinals", "Championship round",
    "Semifinals", "Final",
]
FINISH_RANK = {r: i for i, r in enumerate(ROUND_ORDER)}


def slugify(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()


NAME_CANON = {"Czech Republic": "Czechia"}  # Wikipedia renamed between 2023 and 2026


def clean_team(s):
    s = s.replace(" ", " ").replace("(H)", "")
    s = re.sub(r"\[\w+\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return NAME_CANON.get(s, s)


def parse_date(s, year):
    s = s.strip()
    m = re.match(r"([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),\s*(\d{4})", s)
    if not m:
        return None
    mon = MONTHS.get(m.group(1)[:3])
    if not mon:
        return None
    return f"{int(m.group(3)):04d}-{mon:02d}-{int(m.group(2)):02d}"


def main(path, out_dir):
    lines = open(path, encoding="utf-8").read().splitlines()

    games = []            # {year, round, pool, date, road, home, rs, hs, venue}
    standings = []        # {year, round, pool, pos, team, pld, w, l, rf, ra}
    finals_meta = {}      # year -> {venue, city}
    year = None
    rnd = None
    pool = ""
    last_date = None
    final_linescore = defaultdict(list)  # year -> [(team, runs)]

    for raw in lines:
        line = raw.rstrip("\n")
        s = line.strip()
        if re.fullmatch(r"20\d\d", s):
            year = int(s)
            rnd, pool, last_date = None, "", None
            continue
        if s in ("First round", "Second round", "Quarterfinals",
                 "Championship round", "Semifinals", "Final", "Finals"):
            rnd = "Final" if s == "Finals" else s
            if rnd in ("Quarterfinals", "Championship round", "Semifinals", "Final"):
                pool = ""
            continue
        m = re.fullmatch(r"Pool ([A-F\d]+)", s)
        if m:
            pool = f"Pool {m.group(1)}"
            continue
        # Final header line: "March 17, 2026, 20:00 EDT (UTC−4) at LoanDepot Park in Miami, ..."
        m = re.match(r"([A-Z][a-z]+ \d{1,2}, \d{4}).*? at (.+?) in (.+)", s)
        if m and rnd == "Final":
            finals_meta[year] = {"venue": m.group(2).strip(),
                                 "city": m.group(3).strip().rstrip(".")}
            last_date = parse_date(m.group(1).replace("March", "Mar")
                                   .replace("January", "Jan"), year)
            continue

        cells = line.split("\t")
        # Standings row: Pos, Team, Pld, W, L, RF, RA, ...
        if (len(cells) >= 7 and cells[0].strip().isdigit()
                and cells[2].strip().isdigit() and cells[3].strip().isdigit()
                and cells[4].strip().isdigit()):
            try:
                standings.append({
                    "year": year, "round": rnd or "", "pool": pool,
                    "pos": int(cells[0]), "team": clean_team(cells[1]),
                    "pld": int(cells[2]), "w": int(cells[3]), "l": int(cells[4]),
                    "rf": int(cells[5]), "ra": int(cells[6]),
                })
                continue
            except ValueError:
                pass
        # Game row: Date, Local time, Road, Score, Home, Inn., Venue, ...
        if "Boxscore" in line and len(cells) >= 7:
            score_idx = None
            for i, c in enumerate(cells):
                if re.fullmatch(r"\d+[–-]\d+", c.strip()):
                    score_idx = i
                    break
            if score_idx is None or score_idx < 2:
                continue
            d = parse_date(cells[0], year)
            if d:
                last_date = d
            road = clean_team(cells[score_idx - 1])
            home = clean_team(cells[score_idx + 1])
            rs, hs = map(int, re.split(r"[–-]", cells[score_idx].strip()))
            venue = clean_team(cells[score_idx + 3]) if len(cells) > score_idx + 3 else ""
            # venue cell can be empty when Inn. column present/absent; fall back
            if venue and re.fullmatch(r"[\d:]*", venue):
                venue = clean_team(cells[score_idx + 2]) if len(cells) > score_idx + 2 else ""
            games.append({
                "year": year, "round": rnd or ("First round" if pool else ""), "pool": pool,
                "date": last_date, "road": road, "home": home,
                "rs": rs, "hs": hs, "venue": venue,
            })
            continue
        # Final line-score row: " Venezuela\t0\t0\t1\t...\t3\t6\t0"
        if rnd == "Final" and len(cells) >= 10 and cells[0].strip() and \
                all(re.fullmatch(r"[\dX]*", c.strip()) for c in cells[1:]):
            team = clean_team(cells[0])
            nums = [c.strip() for c in cells[1:] if c.strip() != ""]
            if team and len(nums) >= 3 and not team.startswith("Team"):
                try:
                    runs = int(nums[-3])
                    final_linescore[year].append((team, runs))
                except ValueError:
                    pass
            continue

    # Synthesize final games from line-score blocks where no Boxscore row exists.
    for y, rows_ in final_linescore.items():
        if len(rows_) == 2 and not any(g["year"] == y and g["round"] == "Final" for g in games):
            (t1, r1), (t2, r2) = rows_
            meta = finals_meta.get(y, {})
            games.append({
                "year": y, "round": "Final", "pool": "",
                "date": None, "road": t1, "home": t2, "rs": r1, "hs": r2,
                "venue": meta.get("venue", ""),
            })

    # ---------------- Aggregate ----------------
    editions = sorted({g["year"] for g in games})
    team_games = defaultdict(list)
    for g in games:
        for side in ("road", "home"):
            team_games[g[side]].append(g)

    def result_for(team, g):
        rs, hs = g["rs"], g["hs"]
        won = (g["road"] == team and rs > hs) or (g["home"] == team and hs > rs)
        return "W" if won else "L"

    finals_roll = []
    finish = defaultdict(dict)  # team -> year -> finish label
    for y in editions:
        fg = [g for g in games if g["year"] == y and g["round"] == "Final"]
        assert len(fg) == 1, f"{y}: expected 1 final, found {len(fg)}"
        g = fg[0]
        champ = g["road"] if g["rs"] > g["hs"] else g["home"]
        ru = g["home"] if champ == g["road"] else g["road"]
        finals_roll.append({
            "year": y, "champion": champ, "runner_up": ru,
            "score": f"{max(g['rs'], g['hs'])}-{min(g['rs'], g['hs'])}",
            "venue": g["venue"] or finals_meta.get(y, {}).get("venue", ""),
            "city": finals_meta.get(y, {}).get("city", ""),
        })
        finish[champ][y] = "Champions"
        finish[ru][y] = "Runners-up"

    for (team, gl) in team_games.items():
        for y in editions:
            yg = [g for g in gl if g["year"] == y]
            if not yg or y in finish[team]:
                continue
            deepest = max(yg, key=lambda g: FINISH_RANK.get(g["round"], 0))
            r = deepest["round"]
            finish[team][y] = {
                "Semifinals": "Semi-finals",
                "Championship round": "Championship round",
                "Quarterfinals": "Quarter-finals",
                "Second round": "Second round",
            }.get(r, "First round")

    teams = []
    for team in sorted(team_games):
        gl = team_games[team]
        w = sum(1 for g in gl if result_for(team, g) == "W")
        l = len(gl) - w
        rf = sum(g["rs"] if g["road"] == team else g["hs"] for g in gl)
        ra = sum(g["hs"] if g["road"] == team else g["rs"] for g in gl)
        titles = [y for y, f in finish[team].items() if f == "Champions"]
        ru = [y for y, f in finish[team].items() if f == "Runners-up"]
        best = "Champions" if titles else ("Runners-up" if ru else None)
        if not best:
            order = ["Semi-finals", "Championship round", "Quarter-finals",
                     "Second round", "First round"]
            for o in order:
                if any(f == o for f in finish[team].values()):
                    best = o
                    break
        teams.append({
            "slug": slugify(team), "name": team,
            "apps": len(finish[team]), "pld": len(gl), "w": w, "l": l,
            "rf": rf, "ra": ra,
            "titles": len(titles), "title_years": sorted(titles),
            "runner_ups": len(ru), "ru_years": sorted(ru),
            "best_finish": best,
            "first": min(finish[team]), "last": max(finish[team]),
        })

    hub = {
        "editions": [{
            "year": y,
            "teams": sum(1 for t in teams if y in finish[t["name"]]),
            "games": sum(1 for g in games if g["year"] == y),
            **{k: v for k, v in next(r for r in finals_roll if r["year"] == y).items()
               if k != "year"},
        } for y in editions],
        "finals": finals_roll,
        "total_games": len(games),
        "total_teams": len(teams),
    }

    os.makedirs(os.path.join(out_dir, "team-detail"), exist_ok=True)
    json.dump(teams, open(os.path.join(out_dir, "teams.json"), "w"),
              separators=(",", ":"))
    json.dump(hub, open(os.path.join(out_dir, "hub.json"), "w"),
              separators=(",", ":"))
    for t in teams:
        team = t["name"]
        gl = sorted(team_games[team],
                    key=lambda g: (g["year"], g["date"] or "9999"))
        detail = {
            "slug": t["slug"], "name": team,
            "campaigns": [{
                "year": y, "finish": finish[team][y],
                "w": sum(1 for g in team_games[team]
                         if g["year"] == y and result_for(team, g) == "W"),
                "l": sum(1 for g in team_games[team]
                         if g["year"] == y and result_for(team, g) == "L"),
            } for y in sorted(finish[team], reverse=True)],
            "games": [{
                "year": g["year"], "date": g["date"], "round": g["round"],
                "pool": g["pool"],
                "opp": g["home"] if g["road"] == team else g["road"],
                "result": result_for(team, g),
                "score": f"{g['rs']}-{g['hs']}" if g["road"] == team else f"{g['hs']}-{g['rs']}",
                "home": g["home"] == team, "venue": g["venue"],
            } for g in gl],
        }
        json.dump(detail, open(os.path.join(out_dir, "team-detail",
                                            t["slug"] + ".json"), "w"),
                  separators=(",", ":"))

    print("editions:", editions)
    print("teams:", len(teams), "games:", len(games))
    for r in finals_roll:
        print(" ", r["year"], r["champion"], "bt", r["runner_up"], r["score"],
              "@", r["venue"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
