#!/usr/bin/env python3
"""Golden test: compute 2025 standings from our own data and reconcile
against GSIS's official standings export, column by column."""
import json
import re
import sys
from nfl_standings import Standings, CURRENT_ALIGNMENT

ABBREV = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills",
    "CAR": "Panthers", "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns",
    "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
    "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "KC": "Chiefs",
    "LA": "Rams", "LAC": "Chargers", "LV": "Raiders", "MIA": "Dolphins",
    "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks",
    "SF": "49ers", "TB": "Buccaneers", "TEN": "Titans", "WAS": "Commanders",
}
DISPLAY = {
    "Buffalo": "Bills", "Miami": "Dolphins", "New England": "Patriots",
    "New York Jets": "Jets", "Pittsburgh": "Steelers", "Baltimore": "Ravens",
    "Cincinnati": "Bengals", "Cleveland": "Browns", "Jacksonville": "Jaguars",
    "Houston": "Texans", "Indianapolis": "Colts", "Tennessee": "Titans",
    "Denver": "Broncos", "Los Angeles Chargers": "Chargers",
    "Kansas City": "Chiefs", "Las Vegas": "Raiders",
    "Philadelphia": "Eagles", "Dallas": "Cowboys", "Washington": "Commanders",
    "New York Giants": "Giants", "Chicago": "Bears", "Green Bay": "Packers",
    "Minnesota": "Vikings", "Detroit": "Lions", "Carolina": "Panthers",
    "Tampa Bay": "Buccaneers", "Atlanta": "Falcons", "New Orleans": "Saints",
    "Seattle": "Seahawks", "Los Angeles Rams": "Rams",
    "San Francisco": "49ers", "Arizona": "Cardinals",
}


def load_games(season_path, box_path):
    exp = json.load(open(season_path))
    box = json.load(open(box_path))
    tds = {}
    for r in box["tds"]:
        tds.setdefault(r["game_id"], {})[r["td_team"]] = r["n"]
    boxes = {}
    for g in box["games"]:
        date = str(g["game_date"])[:10]
        key = (date, frozenset((int(g["home_score"]), int(g["away_score"]))))
        boxes.setdefault(key, []).append(g)
    games = []
    for g in exp["games"]:
        if g.get("playoff"):
            continue
        hs, as_ = (int(x) for x in g["score"].split("-"))
        key = (g["date"], frozenset((hs, as_)))
        cands = boxes.get(key, [])
        match = None
        for b in cands:
            bh, ba = ABBREV[b["home_team"]], ABBREV[b["away_team"]]
            if {bh, ba} == {g["home_key"], g["away_key"]}:
                match = b
                break
        assert match, f"no pbp box for {g['date']} {g['home_key']}-{g['away_key']}"
        t = tds.get(match["game_id"], {})
        home_ab = match["home_team"] if ABBREV[match["home_team"]] == g["home_key"] else match["away_team"]
        away_ab = match["away_team"] if home_ab == match["home_team"] else match["home_team"]
        games.append({
            "home": g["home_key"], "away": g["away_key"],
            "home_score": hs, "away_score": as_,
            "home_tds": t.get(home_ab, 0), "away_tds": t.get(away_ab, 0),
        })
    return games


REC = r"\d+-\d+-\d+"
SOX = r"\.\d+\s+\(\d+(?:\.5)?\)"


def parse_fixture(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    rows = {}
    lines = [ln.rstrip() for ln in text.splitlines()]
    i = 0
    while i < len(lines):
        raw = lines[i].strip()
        # a team line: a known display name possibly with clinch suffix
        name = None
        for disp in sorted(DISPLAY, key=len, reverse=True):
            if raw == disp or (raw.startswith(disp) and
                               re.fullmatch(r"[xyz*]+", raw[len(disp):] or "x") and raw[len(disp):]):
                name = disp
                break
        if name:
            # next non-empty line holds the numbers
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            data = lines[j]
            recs = re.findall(REC, data)
            sox = re.findall(SOX, data)
            tail = data.split(sox[-1])[-1] if sox else ""
            ints = re.findall(r"-?\d+", re.sub(r"\([A-Z,]+\)", "", tail))
            sov_pct, sov_w = re.match(r"(\.\d+)\s+\((\d+(?:\.5)?)\)", sox[0]).groups()
            sos_pct, sos_w = re.match(r"(\.\d+)\s+\((\d+(?:\.5)?)\)", sox[1]).groups()
            # records: overall, division, [common], conference (common has
            # a (TEAM) suffix and sits between division and conference)
            overall, division, conference = recs[0], recs[1], recs[-1]
            rows[DISPLAY[name]] = {
                "overall": overall, "division": division, "conference": conference,
                "sov_pct": float(sov_pct), "sov_wins": float(sov_w),
                "sos_pct": float(sos_pct), "sos_wins": float(sos_w),
                "conf_rank": int(ints[0]), "overall_rank": int(ints[1]),
                "net_pts": int(ints[3]), "net_tds": int(ints[4]),
            }
            i = j + 1
        else:
            i += 1
    return rows


def main():
    fixture, season_path, box_path = sys.argv[1:4]
    games = load_games(season_path, box_path)
    print(f"regular-season games loaded: {len(games)}")
    S = Standings(games)
    want = parse_fixture(fixture)
    assert len(want) == 32, f"fixture parsed {len(want)} teams"
    bad = 0
    for team in sorted(want):
        w = want[team]
        r = S.row(team)
        for col in ("overall", "division", "conference", "conf_rank",
                    "overall_rank", "net_pts", "net_tds"):
            if r[col] != w[col]:
                print(f"MISMATCH {team} {col}: ours={r[col]} gsis={w[col]}")
                bad += 1
        for col in ("sov_pct", "sos_pct"):
            if abs(r[col] - w[col]) > 0.0005:
                print(f"MISMATCH {team} {col}: ours={r[col]} gsis={w[col]}")
                bad += 1
        for col in ("sov_wins", "sos_wins"):
            if abs(r[col] - w[col]) > 1e-9:
                print(f"MISMATCH {team} {col}: ours={r[col]} gsis={w[col]}")
                bad += 1
    print("MISMATCHES:", bad)
    if bad == 0:
        print("GOLDEN TEST PASSED: all 32 teams, 11 columns each, "
              "match GSIS exactly")
        # bonus: show the seeds our ladder produces
        for conf in ("AFC", "NFC"):
            print(conf, "seeds:", S.seed_conference(conf))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
