#!/usr/bin/env python3
"""Refresh the F1 hub's live-season data in public/data/f1/data.json straight
from the Jolpica (Ergast-compatible) API -- no local "F1 Data" CSVs required.

Patches ONLY the current season: the per-round winner / pole / fastest lap in
latest_season_races, and the current_standings snapshot (drivers + constructors).
The deep 1950-present history is left untouched. Idempotent: it rewrites the file
(and the Action commits) only when a value actually changed, so quiet days and
re-runs produce no diff. Fails loudly without overwriting if the API misbehaves.

Run by .github/workflows/f1-refresh.yml; safe to run by hand too.
"""
import json, os, sys, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data", "f1", "data.json")
BASE = "https://api.jolpi.ca/ergast/f1"
UA = {"User-Agent": "metro-power-rankings f1-refresh/1.0 (github actions)"}


def gj(path):
    req = urllib.request.Request(f"{BASE}/{path}", headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fullname(dr):
    return (dr.get("givenName", "") + " " + dr.get("familyName", "")).strip()


def races_of(j):
    return j.get("MRData", {}).get("RaceTable", {}).get("Races", [])


def slists(j):
    return j.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])


def patch_data(data, winners, poles, flaps, dlist, clist):
    """Pure transform: mutate `data` in place, return True if anything changed.

    winners: {round:int -> (driver:str, constructor:str)}
    poles/flaps: {round:int -> driver:str}
    dlist/clist: a single Ergast StandingsList dict (drivers / constructors).
    """
    season = data["meta"]["latest_season"]
    s_round = int(dlist.get("round") or 0)

    drivers = []
    for x in dlist.get("DriverStandings", []):
        cons = (x.get("Constructors") or [{}])[-1]
        drivers.append({
            "pos": int(x["position"]),
            "driver": fullname(x["Driver"]),
            "nat": x["Driver"].get("nationality"),
            "team": cons.get("name"),
            "points": int(round(float(x["points"]))),
            "wins": int(x["wins"]),
        })
    constructors = []
    for x in clist.get("ConstructorStandings", []):
        constructors.append({
            "pos": int(x["position"]),
            "constructor": x["Constructor"]["name"],
            "points": int(round(float(x["points"]))),
            "wins": int(x["wins"]),
        })
    if len(drivers) < 10 or len(constructors) < 5:
        raise SystemExit(f"f1-refresh: implausible standings "
                         f"({len(drivers)} drivers, {len(constructors)} constructors) -- aborting, no write")

    before = json.dumps(data, sort_keys=True, ensure_ascii=False)

    for r in data.get("latest_season_races", []):
        rnd = r.get("round")
        if rnd in winners:
            r["winner"], r["winner_constructor"] = winners[rnd]
        if rnd in poles:
            r["pole"] = poles[rnd]
        if rnd in flaps:
            r["fastest_lap"] = flaps[rnd]

    data["current_standings"] = {
        "season": season, "round": s_round,
        "drivers": drivers, "constructors": constructors,
    }

    after = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return after != before


def main():
    if not os.path.exists(DATA):
        sys.exit(f"f1-refresh: {DATA} not found")
    data = json.load(open(DATA, encoding="utf-8"))
    season = data["meta"]["latest_season"]

    winners, poles, flaps = {}, {}, {}
    try:
        for R in races_of(gj(f"{season}/results/1.json?limit=100")):
            res = R.get("Results", [])
            if res:
                winners[int(R["round"])] = (fullname(res[0]["Driver"]), res[0]["Constructor"]["name"])
    except Exception as e:
        sys.exit(f"f1-refresh: winners fetch failed ({e}) -- aborting, no write")
    if not winners:
        sys.exit("f1-refresh: no winners returned -- aborting, no write")
    # Pole + fastest-lap are best-effort cosmetics; never fail the run on them.
    try:
        for R in races_of(gj(f"{season}/qualifying/1.json?limit=100")):
            q = R.get("QualifyingResults", [])
            if q:
                poles[int(R["round"])] = fullname(q[0]["Driver"])
    except Exception as e:
        print(f"f1-refresh: pole fetch skipped ({e})")
    try:
        for R in races_of(gj(f"{season}/fastest/1/results.json?limit=100")):
            res = R.get("Results", [])
            if res:
                flaps[int(R["round"])] = fullname(res[0]["Driver"])
    except Exception as e:
        print(f"f1-refresh: fastest-lap fetch skipped ({e})")

    try:
        ds = slists(gj(f"{season}/driverStandings.json?limit=100"))
        cs = slists(gj(f"{season}/constructorStandings.json?limit=100"))
    except Exception as e:
        sys.exit(f"f1-refresh: standings fetch failed ({e}) -- aborting, no write")
    if not ds or not cs:
        sys.exit("f1-refresh: empty standings -- aborting, no write")

    changed = patch_data(data, winners, poles, flaps, ds[0], cs[0])
    if not changed:
        print("f1-refresh: no change")
        return
    data["meta"]["generated"] = datetime.date.today().isoformat()
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, DATA)
    cs0 = data["current_standings"]
    print(f"f1-refresh: updated through round {cs0['round']}; "
          f"leader {cs0['drivers'][0]['driver']} ({cs0['drivers'][0]['points']} pts)")


if __name__ == "__main__":
    main()
