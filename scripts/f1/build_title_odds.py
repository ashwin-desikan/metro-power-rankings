#!/usr/bin/env python3
"""Formula 1 title odds: who wins the drivers' and constructors' championships.

Writes public/data/f1/title-odds.json from Jolpica (the Ergast-compatible API
the F1 pipeline already uses): the season's schedule, every race and sprint
result so far, and the two standings tables.

THE MODEL, in one paragraph. Each driver gets a strength from his points per
race this season, weighted toward recent rounds (0.9 per round back), and a
retirement rate shrunk toward the grid's. Every remaining race is run by
drawing a performance for each driver (strength plus standard normal noise),
dropping the retirements, ranking the rest and paying the F1 points table;
a sprint weekend pays the sprint table from a second draw. The noise-to-
strength scale is not chosen by hand: it is the value at which the
simulation reproduces the points per race each driver has actually scored
this season (a one-dimensional fit). The season is then run 10,000 times and
the share of runs each driver and constructor finishes top is the odds.
A lead the rest of the calendar cannot overturn reads 100 and is flagged
`clinched`; a gap that cannot be closed reads 0 and `eliminated`.

What it does not do: no car development curve, no track-type effects, no
weather, no penalties, no driver changes mid-season (the lineup is the one
that started the last completed round). It is the honest floor: the season
so far, projected. Everything it uses is in the file's `meta.method`.

Usage:
  python scripts/f1/build_title_odds.py --self-test
  python scripts/f1/build_title_odds.py [--sims 10000] [--dry]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import random
import sys
import urllib.request

BASE = "https://api.jolpi.ca/ergast/f1"
UA = {"User-Agent": "metro-power-rankings f1-title-odds/1.0"}
HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.normpath(os.path.join(HERE, "..", "..", "public", "data", "f1", "title-odds.json"))

RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1]
RECENCY = 0.9          # weight per round back when estimating strength
DNF_PRIOR_WEIGHT = 6   # pseudo-races of the grid's retirement rate per driver
FINISHED_STATUSES = ("Finished", "+1 Lap", "+2 Laps", "+3 Laps", "+4 Laps", "+5 Laps", "+6 Laps", "+7 Laps", "+8 Laps", "+9 Laps")


# ------------------------------------------------------------------ fetch
def gj(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}/{path}", headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def races_of(j: dict) -> list:
    return j.get("MRData", {}).get("RaceTable", {}).get("Races", [])


def races_paged(path: str, key: str) -> list:
    """Jolpica caps a page at 100 result rows (five races' worth), so walk the
    offset and merge rows back onto their race by round."""
    by_round: dict = {}
    offset, total = 0, None
    while total is None or offset < total:
        j = gj(f"{path}?limit=100&offset={offset}")
        total = int(j.get("MRData", {}).get("total", 0))
        got = 0
        for r in races_of(j):
            rows = r.get(key, [])
            got += len(rows)
            slot = by_round.setdefault(int(r["round"]), dict(r, **{key: []}))
            slot[key].extend(rows)
        if got == 0:
            break
        offset += 100
    return [by_round[k] for k in sorted(by_round)]


def fullname(d: dict) -> str:
    return (d.get("givenName", "") + " " + d.get("familyName", "")).strip()


def fetch_season() -> dict:
    """Everything the model needs, in one plain structure (also the self-test's input shape)."""
    schedule = races_of(gj("current.json?limit=100"))
    results = races_paged("current/results.json", "Results")
    try:
        sprints = races_paged("current/sprint.json", "SprintResults")
    except Exception:
        sprints = []
    ds = gj("current/driverStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
    cs = gj("current/constructorStandings.json")["MRData"]["StandingsTable"]["StandingsLists"]
    season = int(schedule[0]["season"]) if schedule else dt.date.today().year
    return {
        "season": season,
        "schedule": [{"round": int(r["round"]), "name": r["raceName"], "date": r.get("date"), "sprint": "Sprint" in r} for r in schedule],
        "races": [
            {"round": int(r["round"]),
             "results": [{"driverId": x["Driver"]["driverId"], "driver": fullname(x["Driver"]),
                          "constructorId": x["Constructor"]["constructorId"], "constructor": x["Constructor"]["name"],
                          "points": float(x.get("points", 0)), "status": x.get("status", ""),
                          "positionText": x.get("positionText", "")} for x in r.get("Results", [])]}
            for r in results],
        "sprints": [
            {"round": int(r["round"]),
             "results": [{"driverId": x["Driver"]["driverId"], "points": float(x.get("points", 0))} for x in r.get("SprintResults", [])]}
            for r in sprints],
        "driver_standings": [
            {"driverId": s["Driver"]["driverId"], "driver": fullname(s["Driver"]), "points": float(s["points"]), "wins": int(s.get("wins", 0)),
             "constructor": (s.get("Constructors") or [{}])[-1].get("name")}
            for s in (ds[0]["DriverStandings"] if ds else [])],
        "constructor_standings": [
            {"constructorId": s["Constructor"]["constructorId"], "constructor": s["Constructor"]["name"], "points": float(s["points"]), "wins": int(s.get("wins", 0))}
            for s in (cs[0]["ConstructorStandings"] if cs else [])],
    }


# ------------------------------------------------------------------ pure model
def is_dnf(status: str, position_text: str) -> bool:
    if position_text in ("R", "D", "W", "N", "E", "F"):
        return True
    return not any(status.startswith(f) for f in FINISHED_STATUSES)


def driver_table(season: dict) -> dict:
    """driverId -> {driver, constructorId, constructor, per_round: {round: race points}, starts, dnfs}.
    Lineup is the one that started the LAST completed round."""
    out: dict = {}
    for race in sorted(season["races"], key=lambda r: r["round"]):
        for x in race["results"]:
            d = out.setdefault(x["driverId"], {"driver": x["driver"], "constructorId": x["constructorId"], "constructor": x["constructor"],
                                                "per_round": {}, "starts": 0, "dnfs": 0})
            d["per_round"][race["round"]] = x["points"]
            d["starts"] += 1
            d["dnfs"] += 1 if is_dnf(x["status"], x["positionText"]) else 0
            d["constructorId"], d["constructor"] = x["constructorId"], x["constructor"]  # latest wins
    for sp in season["sprints"]:
        for x in sp["results"]:
            d = out.get(x["driverId"])
            if d is not None:
                d.setdefault("sprint_points", 0.0)
                d["sprint_points"] += x["points"]
    return out


def strengths(drivers: dict, last_round: int) -> dict:
    """driverId -> recency-weighted race points per race (sprints excluded: a race-pace signal)."""
    out = {}
    for did, d in drivers.items():
        num = den = 0.0
        for rnd, pts in d["per_round"].items():
            w = RECENCY ** (last_round - rnd)
            num += w * pts
            den += w
        out[did] = num / den if den > 0 else 0.0
    return out


def dnf_rates(drivers: dict) -> dict:
    starts = sum(d["starts"] for d in drivers.values()) or 1
    dnfs = sum(d["dnfs"] for d in drivers.values())
    grid = dnfs / starts
    return {did: (d["dnfs"] + DNF_PRIOR_WEIGHT * grid) / (d["starts"] + DNF_PRIOR_WEIGHT) for did, d in drivers.items()}


def latent(strength: dict, scale: float) -> dict:
    return {did: scale * math.log1p(s) for did, s in strength.items()}


def run_race(mu: dict, dnf: dict, table: list, rng: random.Random) -> dict:
    """One race: performance draw, retirements out, points paid. Returns driverId -> points."""
    field = []
    for did, m in mu.items():
        if rng.random() < dnf[did]:
            continue
        field.append((m + rng.gauss(0.0, 1.0), did))
    field.sort(reverse=True)
    return {did: (table[i] if i < len(table) else 0) for i, (_, did) in enumerate(field)}


def expected_points_per_race(mu: dict, dnf: dict, sims: int, seed: int) -> dict:
    rng = random.Random(seed)
    tot = {did: 0.0 for did in mu}
    for _ in range(sims):
        for did, p in run_race(mu, dnf, RACE_POINTS, rng).items():
            tot[did] += p
    return {did: v / sims for did, v in tot.items()}


def fit_scale(strength: dict, dnf: dict, seed: int = 7) -> float:
    """The noise-to-strength scale at which the simulated points per race match the observed."""
    best, best_err = 1.0, float("inf")
    for scale in [x / 4 for x in range(2, 49)]:   # 0.5 .. 12.0
        sim = expected_points_per_race(latent(strength, scale), dnf, 300, seed)
        err = sum((sim[d] - strength[d]) ** 2 for d in strength)
        if err < best_err:
            best, best_err = scale, err
    return best


def max_remaining(races_left: int, sprints_left: int) -> int:
    return races_left * RACE_POINTS[0] + sprints_left * SPRINT_POINTS[0]


def simulate(season: dict, sims: int, seed: int = 20260911) -> dict:
    drivers = driver_table(season)
    if not drivers:
        raise SystemExit("no results yet: nothing to simulate")
    last_round = max(r["round"] for r in season["races"])
    remaining = [r for r in season["schedule"] if r["round"] > last_round]
    races_left = len(remaining)
    sprints_left = sum(1 for r in remaining if r["sprint"])
    strength = strengths(drivers, last_round)
    dnf = dnf_rates(drivers)
    scale = fit_scale(strength, dnf)
    mu = latent(strength, scale)

    dpts0 = {s["driverId"]: s["points"] for s in season["driver_standings"]}
    for did in drivers:
        dpts0.setdefault(did, 0.0)
    team_of = {did: d["constructorId"] for did, d in drivers.items()}
    cname = {d["constructorId"]: d["constructor"] for d in drivers.values()}
    cpts0 = {s["constructorId"]: s["points"] for s in season["constructor_standings"]}
    for cid in cname:
        cpts0.setdefault(cid, 0.0)

    rng = random.Random(seed)
    dwins = {did: 0 for did in dpts0}
    cwins = {cid: 0 for cid in cpts0}
    dsum = {did: 0.0 for did in dpts0}
    csum = {cid: 0.0 for cid in cpts0}
    for _ in range(sims):
        dp = dict(dpts0)
        cp = dict(cpts0)
        for r in remaining:
            if r["sprint"]:
                for did, p in run_race(mu, dnf, SPRINT_POINTS, rng).items():
                    dp[did] += p
                    cp[team_of[did]] += p
            for did, p in run_race(mu, dnf, RACE_POINTS, rng).items():
                dp[did] += p
                cp[team_of[did]] += p
        # ties: most wins this season, then the standings order (a fair approximation of the countback)
        dtop = max(dp, key=lambda k: (dp[k], -list(dpts0).index(k) if k in dpts0 else 0))
        ctop = max(cp, key=lambda k: (cp[k], -list(cpts0).index(k) if k in cpts0 else 0))
        dwins[dtop] += 1
        cwins[ctop] += 1
        for k, v in dp.items():
            dsum[k] += v
        for k, v in cp.items():
            csum[k] += v

    mr = max_remaining(races_left, sprints_left)
    d_lead = sorted(dpts0.values(), reverse=True)
    c_lead = sorted(cpts0.values(), reverse=True)
    mr_c = 2 * mr  # a constructor has two cars

    def drow(did):
        d = drivers.get(did, {})
        st = next((s for s in season["driver_standings"] if s["driverId"] == did), {})
        pts = dpts0[did]
        clinched = races_left == 0 and pts == d_lead[0] and d_lead.count(pts) == 1 or (len(d_lead) > 1 and pts - d_lead[1] > mr and pts == d_lead[0])
        eliminated = pts + mr < d_lead[0]
        p = 100.0 if clinched else 0.0 if eliminated else 100.0 * dwins[did] / sims
        return {"driverId": did, "driver": d.get("driver") or st.get("driver") or did, "constructor": d.get("constructor") or st.get("constructor"),
                "points": pts, "wins": st.get("wins", 0), "points_per_race": round(strength.get(did, 0.0), 2),
                "dnf_rate": round(dnf.get(did, 0.0), 3), "exp_points": round(dsum[did] / sims, 1),
                "p_title": round(p, 1), "clinched": bool(clinched), "eliminated": bool(eliminated)}

    def crow(cid):
        st = next((s for s in season["constructor_standings"] if s["constructorId"] == cid), {})
        pts = cpts0[cid]
        clinched = len(c_lead) > 1 and pts == c_lead[0] and pts - c_lead[1] > mr_c
        eliminated = pts + mr_c < c_lead[0]
        p = 100.0 if clinched else 0.0 if eliminated else 100.0 * cwins[cid] / sims
        return {"constructorId": cid, "constructor": cname.get(cid) or st.get("constructor") or cid, "points": pts, "wins": st.get("wins", 0),
                "drivers": sorted(d["driver"] for d in drivers.values() if d["constructorId"] == cid),
                "exp_points": round(csum[cid] / sims, 1), "p_title": round(p, 1), "clinched": bool(clinched), "eliminated": bool(eliminated)}

    drows = sorted((drow(d) for d in dpts0), key=lambda r: (-r["p_title"], -r["points"]))
    crows = sorted((crow(c) for c in cpts0), key=lambda r: (-r["p_title"], -r["points"]))
    next_race = remaining[0] if remaining else None
    return {
        "meta": {
            "league": "Formula 1", "season": season["season"], "through_round": last_round,
            "rounds_total": len(season["schedule"]), "races_remaining": races_left, "sprints_remaining": sprints_left,
            "max_points_remaining_driver": mr, "max_points_remaining_constructor": mr_c,
            "next_race": next_race, "sims": sims, "noise_scale": scale,
            "generated_at": dt.date.today().isoformat(), "source": "Jolpica (Ergast API)",
            "method": ("Each driver's strength is his race points per race this season, weighted 0.9 per round toward the latest, "
                       "with a retirement rate shrunk toward the grid's. Every remaining race is drawn as strength plus standard normal "
                       "noise, retirements removed, the field ranked and the F1 points table paid (sprint table on sprint weekends). "
                       "The noise scale is fitted so the simulation reproduces each driver's points per race so far. "
                       f"{sims:,} runs; the share of runs a driver or constructor finishes top is the odds. A lead the calendar cannot "
                       "overturn is clinched; a gap it cannot close is eliminated. No car development, track effects or driver changes."),
        },
        "drivers": drows,
        "constructors": crows,
    }


# ------------------------------------------------------------------ self-test
def self_test() -> None:
    assert is_dnf("Collision", "R") and is_dnf("Engine", "R") and not is_dnf("Finished", "1") and not is_dnf("+1 Lap", "12")
    assert max_remaining(5, 1) == 133
    # A three-driver season, two rounds done, one to go, no sprints.
    season = {
        "season": 2026,
        "schedule": [{"round": 1, "name": "A", "date": "2026-03-01", "sprint": False}, {"round": 2, "name": "B", "date": "2026-03-08", "sprint": False},
                     {"round": 3, "name": "C", "date": "2026-03-15", "sprint": False}],
        "races": [
            {"round": 1, "results": [{"driverId": "x", "driver": "X", "constructorId": "t1", "constructor": "T1", "points": 25, "status": "Finished", "positionText": "1"},
                                     {"driverId": "y", "driver": "Y", "constructorId": "t1", "constructor": "T1", "points": 18, "status": "Finished", "positionText": "2"},
                                     {"driverId": "z", "driver": "Z", "constructorId": "t2", "constructor": "T2", "points": 0, "status": "Collision", "positionText": "R"}]},
            {"round": 2, "results": [{"driverId": "x", "driver": "X", "constructorId": "t1", "constructor": "T1", "points": 25, "status": "Finished", "positionText": "1"},
                                     {"driverId": "y", "driver": "Y", "constructorId": "t1", "constructor": "T1", "points": 18, "status": "Finished", "positionText": "2"},
                                     {"driverId": "z", "driver": "Z", "constructorId": "t2", "constructor": "T2", "points": 15, "status": "Finished", "positionText": "3"}]},
        ],
        "sprints": [],
        "driver_standings": [{"driverId": "x", "driver": "X", "points": 50, "wins": 2, "constructor": "T1"},
                             {"driverId": "y", "driver": "Y", "points": 36, "wins": 0, "constructor": "T1"},
                             {"driverId": "z", "driver": "Z", "points": 15, "wins": 0, "constructor": "T2"}],
        "constructor_standings": [{"constructorId": "t1", "constructor": "T1", "points": 86, "wins": 2},
                                  {"constructorId": "t2", "constructor": "T2", "points": 15, "wins": 0}],
    }
    d = driver_table(season)
    assert d["z"]["dnfs"] == 1 and d["z"]["starts"] == 2 and d["x"]["constructorId"] == "t1"
    s = strengths(d, 2)
    assert abs(s["x"] - 25) < 1e-9 and s["z"] > 7 and s["z"] < 8  # 0.9*0 + 1*15 over 1.9
    out = simulate(season, sims=400, seed=1)
    by = {r["driverId"]: r for r in out["drivers"]}
    # X leads by 14 with 25 left: not clinched; Z is 35 back with 25 left: eliminated.
    assert not by["x"]["clinched"] and by["z"]["eliminated"] and by["z"]["p_title"] == 0.0
    assert abs(sum(r["p_title"] for r in out["drivers"]) - 100) < 1.5
    c = {r["constructorId"]: r for r in out["constructors"]}
    assert c["t1"]["clinched"] and c["t1"]["p_title"] == 100.0 and c["t2"]["eliminated"]
    assert out["meta"]["races_remaining"] == 1 and out["meta"]["max_points_remaining_driver"] == 25
    # Clinched driver: lead beyond reach.
    season2 = json.loads(json.dumps(season))
    season2["driver_standings"][0]["points"] = 80
    out2 = simulate(season2, sims=50, seed=1)
    assert {r["driverId"]: r for r in out2["drivers"]}["x"]["clinched"]
    print("self-test OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--sims", type=int, default=10000)
    ap.add_argument("--dry", action="store_true", help="print the summary, write nothing")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return 0
    season = fetch_season()
    out = simulate(season, a.sims)
    m = out["meta"]
    print(f"{m['season']} through round {m['through_round']} of {m['rounds_total']}: {m['races_remaining']} races left "
          f"({m['sprints_remaining']} sprints), noise scale {m['noise_scale']}")
    for r in out["drivers"][:6]:
        print(f"  {r['driver']:<24} {r['points']:>6.0f} pts  ppr {r['points_per_race']:>5.2f}  title {r['p_title']:>5.1f}%{'  clinched' if r['clinched'] else ''}")
    for r in out["constructors"][:4]:
        print(f"  {r['constructor']:<24} {r['points']:>6.0f} pts  title {r['p_title']:>5.1f}%{'  clinched' if r['clinched'] else ''}")
    if a.dry:
        return 0
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with open(DEST, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {DEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
