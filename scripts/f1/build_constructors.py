#!/usr/bin/env python3
"""Build the F1 constructor read model from the Ergast/Jolpica mirror.

  public/data/f1/constructors.json

Reads Supabase (f1_results, f1_race_meta, f1_constructor_standings,
f1_constructors) and the curation in lineages.py, and emits one record per
CONTINUOUS TEAM rather than per Ergast constructor record. See lineages.py for
why that distinction is the whole job.

Design notes
- Per-race rows are NOT shipped, except victories. 27,389 entries would be
  megabytes on a page that is already a hub tab; the season table answers the
  same questions and the circuit pages carry race detail.
- Every displayed year is MEASURED from the results. The curation's spans exist
  to assign a row, not to describe it, so a typo in a year cannot mislabel a
  season.
- A result that matches zero eras, or more than one, is a FATAL error. Silence
  there would mean a team quietly missing races.

  python scripts/f1/build_constructors.py
  python scripts/f1/build_constructors.py --self-test
"""
import argparse, json, os, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "rankings"))

from lineages import ERAS, NOTES  # noqa: E402
from bases import BASES, NO_BASE  # noqa: E402
from common import select_all, log  # noqa: E402

DEST = os.path.join(ROOT, "public", "data", "f1", "constructors.json")
F1_DATA = os.path.join(ROOT, "public", "data", "f1", "data.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
BASE_METROS = os.path.join(HERE, "curation", "base_metros.json")
# The constructors' championship did not exist before 1958, so a missing
# standing before then is expected and must not read as a team failing to score.
FIRST_CONSTRUCTORS_TITLE = 1958
# A lineage earns a page if a reader could plausibly look it up.
MIN_RACES = 10

# Seasons where the championship total is deliberately NOT the sum of the
# points scored on track. Without these the reconciliation below would report a
# bug that is really a stewards' decision, and the page would show a number the
# record books do not.
KNOWN_ADJUSTMENTS = {
    ("aston-martin", 2020): (
        -15, "The FIA docked Racing Point 15 constructors' points for copying "
             "the 2019 Mercedes brake ducts, so the championship credited 195 "
             "against 210 scored on track."),
}


def num(v):
    """Ergast writes '1.0', '', 'R' and 'D' into the same columns."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def slugify(s):
    """ASCII only. Python's str.isalnum() is true for 'ö' and 'ü', so the naive
    version emitted non-ASCII slugs, which become percent-encoded URLs and do
    not match what anyone would type or link."""
    out, prev_dash = [], False
    for ch in s.lower():
        if ch.isascii() and ch.isalnum():
            out.append(ch); prev_dash = False
        elif not prev_dash:
            out.append("-"); prev_dash = True
    return "".join(out).strip("-")


def load_bases():
    """Curated factory sites, joined to the workbook's metro ruling.

    A base whose town the workbook cannot rule on keeps its town and loses its
    metro link. That is deliberate: the page should say Brackley and say that
    Brackley has no metro yet, rather than quietly promoting it to Milton
    Keynes because the two are twenty minutes apart."""
    resolved = {}
    if os.path.exists(BASE_METROS):
        resolved = json.load(open(BASE_METROS, encoding="utf-8")).get("metros", {})
    else:
        log("WARNING: no curation/base_metros.json. Run resolve_base_metros.py; "
            "bases will render without metro links.")

    slug_of, by_name = {}, defaultdict(set)
    if os.path.exists(METROS):
        for m in json.load(open(METROS, encoding="utf-8")):
            slug_of[(m.get("country"), m.get("name"))] = m.get("slug")
            by_name[m.get("name")].add(m.get("slug"))

    def metro_slug(name, country):
        s = slug_of.get((country, name))
        if s:
            return s
        # A metro can sit in a different country from the factory: Colnbrook is
        # in England and its metro is London, which is also in England, but
        # Fussgonheim's Rhine-Neckar and Niederzissen's Ahrweiler are not
        # guaranteed to agree on a country string. Fall back on the name only
        # when it is unambiguous across the whole metro list.
        cands = by_name.get(name) or set()
        return sorted(cands)[0] if len(cands) == 1 else None

    out = defaultdict(list)
    for b in BASES:
        r = resolved.get(f"{b['country']}|{b['town']}")
        metro = r["metro"] if r else None
        out[b["lineage"]].append({
            "town": b["town"], "region": b["region"], "country": b["country"],
            "from": b["from"], "to": b["to"], "role": b["role"],
            "source": b["source"], "contested": b["contested"], "note": b["note"],
            "metro": metro,
            "metroSlug": metro_slug(metro, b["country"]) if metro else None,
            "how": r["how"] if r else None,
        })
    for rows in out.values():
        rows.sort(key=lambda r: (r["role"] != "main", r["from"]))
    return out


def head_to_head(grid_by_race, limit=14):
    """Teammate against teammate, the most argued-about number in the sport.

    Two comparisons, counted separately and on different populations:

      QUALIFYING counts a race only where BOTH cars set a starting position.
      A grid of 0 in the archive means a pit-lane start or no time, and
      counting that as a defeat would punish a driver for a mechanical.

      RACE counts a race only where BOTH cars were CLASSIFIED. Anything else is
      scoring a retirement as a loss, and a car that failed on lap two did not
      lose to anybody.

    That is why the two totals rarely add up to the same number of races, and
    the page shows both denominators rather than one."""
    pairs = defaultdict(lambda: {"races": 0, "q": [0, 0], "r": [0, 0],
                                 "first": 9999, "last": 0})
    for (season, _rnd), rows in grid_by_race.items():
        if len(rows) < 2:
            continue
        # Sort by NAME only. grid and position are None for non-starters, and
        # a plain tuple sort compares None with a float and raises.
        rows = sorted(rows, key=lambda t: t[0])
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                (a, ga, pa), (b, gb, pb) = rows[i], rows[j]
                if a == b:
                    continue
                p = pairs[(a, b)]
                p["races"] += 1
                p["first"] = min(p["first"], season)
                p["last"] = max(p["last"], season)
                if ga and gb and ga > 0 and gb > 0:
                    p["q"][0 if ga < gb else 1] += 1
                if pa is not None and pb is not None:
                    p["r"][0 if pa < pb else 1] += 1
    out = []
    for (a, b), p in pairs.items():
        if p["races"] < 5:
            continue
        out.append([a, b, p["races"], p["first"], p["last"],
                    p["q"][0], p["q"][1], p["r"][0], p["r"][1]])
    out.sort(key=lambda r: (-r[2], r[0]))
    return out[:limit]


def build_index(eras):
    """constructor_id -> [era]. Kept as a list because a record can be split
    across eras by year (Sauber's three spells, the six unrelated-organisation
    splits)."""
    idx = defaultdict(list)
    for e in eras:
        for cid in e["ids"]:
            idx[cid].append(e)
    return idx


def assign(idx, cid, season, default_lineage):
    """The era owning this (constructor_id, season), or a default era standing
    for 'this record is its own team'. Ambiguity is fatal, never resolved by
    picking the first match."""
    hits = [e for e in idx.get(cid, ())
            if e["from_year"] <= season <= e["to_year"]]
    if len(hits) > 1:
        raise SystemExit(
            f"FATAL: {cid!r} in {season} matches {len(hits)} eras "
            f"({[h['lineage'] + '/' + h['era_name'] for h in hits]}). "
            f"Curation spans overlap; fix lineages.py rather than picking one.")
    return hits[0] if hits else default_lineage


def self_test():
    ok = True

    def check(label, got, want):
        nonlocal ok
        if got != want:
            ok = False; print(f"  FAIL {label}: got {got!r}, want {want!r}")
        else:
            print(f"  ok   {label}")

    check("slug", slugify("ATS (Auto Technisches Spezialzubehör)"), "ats-auto-technisches-spezialzubeh-r")
    check("num handles Ergast junk", [num("1.0"), num("R"), num("")], [1.0, None, None])

    idx = build_index(ERAS)
    # The six split records must resolve to different lineages by year.
    for cid, year, want in [("alfa", 1950, "alfa-romeo"), ("alfa", 2021, "audi"),
                            ("mercedes", 1954, "mercedes-works"), ("mercedes", 2015, "mercedes"),
                            ("renault", 1980, "renault-works"), ("renault", 2005, "alpine"),
                            ("renault", 2018, "alpine"), ("honda", 1965, "honda-works"),
                            ("honda", 2007, "mercedes"), ("aston_martin", 1959, "aston-martin-works"),
                            ("aston_martin", 2023, "aston-martin"), ("ats", 1963, "ats-italy"),
                            ("ats", 1980, "ats-germany"), ("sauber", 2000, "audi"),
                            ("sauber", 2024, "audi"), ("lotus-ford", 1968, "team-lotus"),
                            ("brabham-repco", 1967, "brabham"), ("tyrrell", 1975, "mercedes")]:
        got = assign(idx, cid, year, {"lineage": "DEFAULT"})["lineage"]
        check(f"{cid} in {year}", got, want)

    # No era may claim the same record in the same year twice.
    for cid, eras in idx.items():
        for y in range(1950, 2027):
            hits = [e for e in eras if e["from_year"] <= y <= e["to_year"]]
            if len(hits) > 1:
                ok = False
                print(f"  FAIL {cid} in {y} claimed by {[h['lineage'] for h in hits]}")
    check("no overlapping claims across 1950-2026", True, True)
    print("self-test:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def load():
    # 🔴 EVERY ORDER HERE ENDS IN `id`. (season, round) is one race and about
    # twenty rows, so paginating on it gave unstable page boundaries: rows
    # repeated, rows vanished, and the totals moved between runs. McLaren read
    # 148 points for 1991 against a real 139. See select_all's docstring.
    res = select_all(
        "/rest/v1/f1_results?select=season,round,driver,constructor_id,constructor,"
        "grid,position,points,status", "season,round,id")
    meta = select_all("/rest/v1/f1_race_meta?select=season,round,race_name,circuit_id",
                      "season,round,id")
    # 🔴 SPRINT POINTS ARE CHAMPIONSHIP POINTS. Counting only f1_results left
    # McLaren on 775 for 2025 against a real 833, and nothing on the page said
    # why. Sprint results are a separate table and have to be added in.
    sprint = select_all("/rest/v1/f1_sprint_results?select=season,round,driver,"
                        "constructor_id,points,position", "season,round,id")
    stand = select_all("/rest/v1/f1_constructor_standings?select=season,constructor_id,"
                       "position,points,wins", "season,id")
    cons = select_all("/rest/v1/f1_constructors?select=constructor_id,constructor,"
                      "nationality,wikipedia", "constructor_id")
    log(f"{len(res)} results, {len(meta)} races, {len(sprint)} sprint entries, "
        f"{len(stand)} standings, {len(cons)} constructor records")
    circuits = {}
    if os.path.exists(F1_DATA):
        for c in json.load(open(F1_DATA, encoding="utf-8")).get("circuits", []):
            circuits[c["circuit_id"]] = (c.get("circuit_name"), c.get("metro"),
                                         c.get("metro_slug"))
    return res, meta, sprint, stand, cons, circuits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--min-races", type=int, default=MIN_RACES)
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if self_test():
        return 1

    res, meta, sprint, stand, cons, circuits = load()
    bases_by_lin = load_bases()
    idx = build_index(ERAS)
    race_of = {(r["season"], r["round"]): r for r in meta}
    cons_meta = {c["constructor_id"]: c for c in cons}

    # Default era per record: "this record is its own team, spanning its own
    # seasons". Reported at the end so a missing merge shows as a number.
    defaults = {}
    for c in cons:
        cid = c["constructor_id"]
        if cid in idx:
            continue
        defaults[cid] = {"lineage": slugify(c["constructor"]) or cid,
                         "era_name": c["constructor"], "ids": [cid],
                         "from_year": 0, "to_year": 9999, "contested": 0,
                         "note": NOTES.get(cid, ""), "_default": True}

    L = defaultdict(lambda: {
        "eras": {}, "seasons": set(), "races": set(), "entries": 0, "wins": 0,
        "podiums": 0, "poles": 0, "points": 0.0, "status": Counter(),
        "decade": defaultdict(lambda: [0, 0]), "drivers": defaultdict(
            lambda: {"races": 0, "wins": 0, "podiums": 0, "points": 0.0,
                     "first": 9999, "last": 0}),
        "by_season": defaultdict(lambda: {"races": set(), "wins": 0, "podiums": 0,
                                          "poles": 0, "points": 0.0,
                                          "sprint_points": 0.0, "sprint_wins": 0,
                                          "grid": [], "finish": [], "drivers": set()}),
        "victories": [], "circuit": defaultdict(lambda: [0, 0]),
        # Every archive name for every record this lineage claims. The archive's
        # own labels ARE this team's aliases, and other pages still use them:
        # the hub wrote "Lotus-Climax" and "RB F1 Team", neither of which is any
        # lineage's display name or era name, so neither linked anywhere.
        "aliases": set(),
        "nat": None, "wiki": None,
        "sprint_points": 0.0, "sprint_wins": 0, "sprint_entries": 0,
        # (season, round) -> [(driver, grid, finish)], for teammate head-to-head.
        "grid_by_race": defaultdict(list),
    })


    unassigned = []
    for r in res:
        cid = r["constructor_id"]
        season = int(r["season"])
        e = assign(idx, cid, season, defaults.get(cid))
        if e is None:
            unassigned.append((cid, season)); continue
        lid = e["lineage"]
        d = L[lid]
        key = (lid, e["era_name"], e["from_year"], e["to_year"])
        d["eras"].setdefault(key, {"era": e, "seasons": set(), "races": set(),
                                   "wins": 0, "podiums": 0, "poles": 0,
                                   "points": 0.0, "drivers": set()})
        ed = d["eras"][key]
        rd = (season, r["round"])
        pos, grid = num(r["position"]), num(r["grid"])
        pts = num(r["points"]) or 0.0
        won, podium, pole = pos == 1, pos is not None and pos <= 3, grid == 1

        for bucket in (d, ed):
            bucket["seasons"].add(season)
            bucket["races"].add(rd)
            bucket["wins"] += won
            bucket["podiums"] += podium
            bucket["poles"] += pole
            bucket["points"] += pts
        ed["drivers"].add(r["driver"])
        d["entries"] += 1
        d["status"][r["status"] or "Unknown"] += 1
        dec = d["decade"][season // 10 * 10]
        dec[0] += 1
        dec[1] += (r["status"] == "Finished")
        d["aliases"].add(r["constructor"])
        if cid in cons_meta:
            d["aliases"].add(cons_meta[cid].get("constructor"))
        if d["nat"] is None and cid in cons_meta:
            d["nat"] = cons_meta[cid].get("nationality")
            d["wiki"] = cons_meta[cid].get("wikipedia")

        dr = d["drivers"][r["driver"]]
        dr["races"] += 1; dr["wins"] += won; dr["podiums"] += podium
        dr["points"] += pts
        dr["first"] = min(dr["first"], season); dr["last"] = max(dr["last"], season)

        d["grid_by_race"][rd].append((r["driver"], grid, pos))

        s = d["by_season"][season]
        s["races"].add(rd); s["wins"] += won; s["podiums"] += podium
        s["poles"] += pole; s["points"] += pts; s["drivers"].add(r["driver"])
        if grid is not None and grid > 0:
            s["grid"].append(grid)
        if pos is not None:
            s["finish"].append(pos)

        m = race_of.get((r["season"], r["round"]))
        cinfo = circuits.get(m["circuit_id"]) if m else None
        if m:
            c = d["circuit"][m["circuit_id"]]
            c[0] += 1; c[1] += won
        if won and m:
            d["victories"].append([season, int(r["round"]), m["race_name"], r["driver"],
                                   (cinfo or (None, None, None))[1],
                                   (cinfo or (None, None, None))[2],
                                   m["circuit_id"]])
    if unassigned:
        sys.exit(f"FATAL: {len(unassigned)} results matched no era and no default: "
                 f"{sorted(set(unassigned))[:10]}")

    # Sprints, 2021 onward. Their POINTS are championship points and are added
    # in. Their WINS are not Grand Prix wins and are counted separately, because
    # folding a Saturday result into a team's win column would quietly rewrite
    # the record book.
    for r in sprint:
        season = int(r["season"])
        e = assign(idx, r["constructor_id"], season, defaults.get(r["constructor_id"]))
        if e is None:
            continue
        d = L[e["lineage"]]
        pts = num(r["points"]) or 0.0
        won = num(r["position"]) == 1
        d["sprint_points"] += pts
        d["sprint_wins"] += won
        d["sprint_entries"] += 1
        s = d["by_season"][season]
        s["sprint_points"] += pts
        s["sprint_wins"] += won


    # Championship position per lineage-season. A lineage can hold two records
    # in one season only through an Ergast duplicate; take the better position.
    # 🔴 THE CURRENT SEASON'S LEADER IS NOT A CHAMPION. f1_constructor_standings
    # carries a live row for the season in progress, so counting position == 1
    # as a title credited Mercedes with eleven constructors' championships in
    # August 2026 against a real ten. Titles are counted only for seasons that
    # have finished; the live season still shows its position in the form line,
    # where it reads as a standing rather than a result.
    latest_season = max(int(x["season"]) for x in res)
    champ = defaultdict(dict)
    champ_pts = {}
    for s in stand:
        season = int(s["season"])
        e = assign(idx, s["constructor_id"], season, defaults.get(s["constructor_id"]))
        if e is None:
            continue
        p = num(s["position"])
        if p is None:
            continue
        cur = champ[e["lineage"]].get(season)
        champ[e["lineage"]][season] = p if cur is None else min(cur, p)
        # Standings rows are cumulative and per round, so the largest value for
        # a season is the final one.
        cp = num(s["points"])
        if cp is not None:
            champ_pts[(e["lineage"], season)] = max(
                champ_pts.get((e["lineage"], season), 0.0), cp)

    out = []
    for lid, d in L.items():
        seasons = sorted(d["seasons"])
        eras = []
        for (_, name, _, _), ed in sorted(
                d["eras"].items(), key=lambda kv: min(kv[1]["seasons"])):
            es = sorted(ed["seasons"])
            eras.append({
                "name": name, "from": es[0], "to": es[-1],
                "races": len(ed["races"]), "wins": ed["wins"],
                "podiums": ed["podiums"], "poles": ed["poles"],
                "points": round(ed["points"], 1),
                "titles": sum(1 for y in es if y < latest_season and champ[lid].get(y) == 1),
                "contested": ed["era"]["contested"],
                "note": ed["era"]["note"],
                "drivers": len(ed["drivers"]),
            })
        form = [[y, champ[lid].get(y), round(d["by_season"][y]["points"], 1),
                 d["by_season"][y]["wins"]] for y in seasons]
        season_rows = []
        for y in seasons:
            s = d["by_season"][y]
            season_rows.append([
                y, len(s["races"]), s["wins"], s["podiums"], s["poles"],
                round(s["points"] + s["sprint_points"], 1), champ[lid].get(y),
                round(sum(s["grid"]) / len(s["grid"]), 1) if s["grid"] else None,
                round(sum(s["finish"]) / len(s["finish"]), 1) if s["finish"] else None,
                sorted(s["drivers"]),
            ])
        drivers = sorted(
            ([n, v["races"], v["wins"], v["podiums"], round(v["points"], 1),
              v["first"], v["last"]] for n, v in d["drivers"].items()),
            key=lambda r: (-r[2], -r[1]))
        best_c = sorted(((cid, n, w) for cid, (n, w) in d["circuit"].items()),
                        key=lambda t: (-t[2], -t[1]))[:6]
        last_era = eras[-1]
        # The team's home now, or the last one it had. A team with only an
        # engine plant or a design office curated gets no headline base, since
        # "based in Brixworth" would be false of Mercedes.
        blist = bases_by_lin.get(lid, [])
        mains = [b for b in blist if b["role"] == "main"]
        home = max(mains, key=lambda b: b["from"]) if mains else None
        out.append({
            "slug": lid, "name": last_era["name"],
            "bases": blist,
            "base": ({"town": home["town"], "region": home["region"],
                      "country": home["country"], "metro": home["metro"],
                      "metroSlug": home["metroSlug"], "since": home["from"],
                      "until": None if home["to"] >= 9999 else home["to"]}
                     if home else None),
            "chain": [e["name"] for e in eras],
            "aliases": sorted(a for a in d["aliases"] if a),
            "contested": any(e["contested"] for e in eras),
            "first": seasons[0], "last": seasons[-1], "seasons": len(seasons),
            "races": len(d["races"]), "entries": d["entries"],
            "wins": d["wins"], "podiums": d["podiums"], "poles": d["poles"],
            "points": round(d["points"] + d["sprint_points"], 1),
            "sprintPoints": round(d["sprint_points"], 1),
            "sprintWins": d["sprint_wins"],
            "teammates": head_to_head(d["grid_by_race"]),
            "titles": sum(1 for y in seasons if y < latest_season and champ[lid].get(y) == 1),
            "bestChamp": min([p for p in (champ[lid].get(y) for y in seasons) if p],
                             default=None),
            "current": seasons[-1] >= max(int(r["season"]) for r in res),
            "nationality": d["nat"], "wikipedia": d["wiki"],
            "eras": eras, "form": form, "seasonRows": season_rows,
            "drivers": drivers,
            "reliability": [[dec, v[0], round(100 * v[1] / v[0])]
                            for dec, v in sorted(d["decade"].items())],
            "statuses": d["status"].most_common(8),
            "circuits": [[cid, circuits.get(cid, (cid, None, None))[0],
                          circuits.get(cid, (None, None, None))[1],
                          circuits.get(cid, (None, None, None))[2], n, w]
                         for cid, n, w in best_c],
            "victories": sorted(d["victories"], reverse=True)[:60],
            "note": NOTES.get(lid, ""),
            "default": all(e["era"].get("_default") for e in d["eras"].values()),
        })


    # 🔴 POINTS SCORED IS NOT THE CHAMPIONSHIP TOTAL, AND THE GAP IS REAL.
    # Many seasons before 1991 counted only a driver's best N results, so the
    # official total is LOWER than the points actually scored, by design. From
    # 1991 every result counts, so a gap there is a bug in this script and not
    # a rule of the sport. Sprint points were exactly that bug until this
    # commit: 2025 McLaren read 775 against a real 833.
    modern_gaps = []
    for r in out:
        notes = []
        for y in range(1991, latest_season + 1):
            row = next((s for s in r["seasonRows"] if s[0] == y), None)
            official = champ_pts.get((r["slug"], y))
            if row is None or official is None:
                continue
            adj, why = KNOWN_ADJUSTMENTS.get((r["slug"], y), (0, ""))
            if why:
                notes.append([y, adj, why])
            if abs((row[5] + adj) - official) > 0.01:
                modern_gaps.append((r["slug"], y, row[5], official))
        r["pointsNotes"] = notes
    if modern_gaps:
        log(f"WARNING: {len(modern_gaps)} lineage-seasons since 1991 do not match "
            f"the championship total and are not a known adjustment. "
            f"First few: {modern_gaps[:6]}")
    else:
        log(f"points reconcile with the championship for every lineage-season "
            f"1991-{latest_season} ({len(KNOWN_ADJUSTMENTS)} documented "
            f"stewards' adjustment(s) allowed for)")

    # 🔴 A BASE ATTACHED TO A LINEAGE THAT DOES NOT EXIST IS SILENT. bases.py is
    # keyed by lineage id, and a typo there does not crash anything; the row
    # simply never reaches a page, and the team looks like one nobody bothered
    # to research. Fatal, in the same spirit as an unassigned result.
    known = {r["slug"] for r in out}
    orphan = sorted({b["lineage"] for b in BASES} - known)
    if orphan:
        sys.exit(f"FATAL: bases.py names {len(orphan)} lineage(s) that no result "
                 f"produces: {orphan}. Fix the id or delete the rows.")
    stale = sorted(set(NO_BASE) - known)
    if stale:
        log(f"WARNING: NO_BASE lists {stale}, which are not lineages any more.")

    out.sort(key=lambda r: (-r["wins"], -r["races"], r["name"]))
    paged = [r for r in out if r["races"] >= a.min_races or r["wins"] > 0]
    pageable = {r["slug"] for r in paged}
    for r in out:
        r["hasPage"] = r["slug"] in pageable

    curated = sum(1 for r in out if not r["default"])
    latest = max(int(x["season"]) for x in res)
    doc = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "first_season": min(int(x["season"]) for x in res),
            "last_season": latest,
            "lineages": len(out), "with_pages": len(paged),
            "constructor_records": len(cons),
            "curated_lineages": curated,
            "with_base": sum(1 for r in out if r["base"]),
            "with_base_metro": sum(1 for r in out if r["base"] and r["base"]["metro"]),
            "base_rows": sum(len(r["bases"]) for r in out),
            "source": ("Ergast/Jolpica results, with team lineages curated in "
                       "scripts/f1/lineages.py"),
        },
        "lineages": out,
    }
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    with open(DEST, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    kb = os.path.getsize(DEST) / 1024
    log(f"{len(out)} lineages from {len(cons)} constructor records "
        f"({curated} curated, {len(out) - curated} left as themselves)")
    log(f"{len(paged)} earn a page (>= {a.min_races} races or a win)")
    nb = sum(1 for r in paged if not r["base"])
    nm = sum(1 for r in paged if r["base"] and not r["base"]["metro"])
    log(f"bases: {doc['meta']['base_rows']} sites over "
        f"{doc['meta']['with_base']} lineages; of the {len(paged)} with pages, "
        f"{nb} have no sourced base and {nm} have a base the workbook cannot "
        f"place in a metro")
    log(f"-> {DEST} ({kb:.0f} KB)")
    if kb > 1500:
        log("WARNING: over 1.5 MB for a hub tab. Trim victories or seasonRows.")
    top = out[:8]
    for r in top:
        log(f"  {r['name']:<22} {r['first']}-{r['last']}  {r['races']:>4} races  "
            f"{r['wins']:>3} wins  {r['titles']} titles  chain={len(r['chain'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
