#!/usr/bin/env python3
"""Content parity check for the majors migration.

Compares the newly built (Supabase-sourced) golf.json / tennis.json against a
backup of the workbook-built versions (golf.prev.json / tennis.prev.json in the
same folder). Compares DATA as order-independent sets/dicts, so the intentional
tie-order normalization in by-nation / host-metros / davis does not flag.

    python scripts/supabase/parity_majors.py
"""
import json, os, sys

MAJORS = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                      "public", "data", "majors")

def load(name):
    p = os.path.join(MAJORS, name)
    if not os.path.exists(p):
        sys.exit(f"missing {p} (back up the workbook-built file to {name} first)")
    return json.load(open(p, encoding="utf-8"))

def champ_key(c):
    return (c.get("year"), c.get("tournament"), c.get("gender"), c.get("champion"), c.get("nation"),
            c.get("careerNo"), c.get("careerTotal"), c.get("note"), c.get("metroSlug"), c.get("metroName"), c.get("venue"))

def cmp_set(a, b, key, label, fails):
    sa, sb = {key(x) for x in a}, {key(x) for x in b}
    if sa == sb:
        print(f"  OK  {label}: {len(sa)} rows identical")
    else:
        fails.append(label)
        print(f"  FAIL {label}: only-in-prev {len(sa-sb)}, only-in-new {len(sb-sa)}")
        for x in list(sa - sb)[:3]: print("       prev:", x)
        for x in list(sb - sa)[:3]: print("       new :", x)

def cmp_dict(a, b, kf, vf, label, fails):
    da = {kf(x): vf(x) for x in a}; db = {kf(x): vf(x) for x in b}
    if da == db:
        print(f"  OK  {label}: {len(da)} entries identical")
    else:
        fails.append(label)
        diff = [k for k in set(da) | set(db) if da.get(k) != db.get(k)]
        print(f"  FAIL {label}: {len(diff)} differing keys, e.g. {diff[:5]}")

def main():
    fails = []
    for sport in ("golf", "tennis"):
        print(f"== {sport} ==")
        prev = load(f"{sport}.prev.json"); new = load(f"{sport}.json")
        cmp_set(prev["champions"], new["champions"], champ_key, "champions", fails)
        if sport == "golf":
            cmp_dict(prev["byNation"], new["byNation"], lambda x: x["nation"], lambda x: x["titles"], "byNation", fails)
            cmp_dict(prev["leaders"], new["leaders"], lambda x: x["player"], lambda x: (x["total"], tuple(sorted(x["byTour"].items()))), "leaders", fails)
            cmp_dict(prev["ryder"], new["ryder"], lambda x: x["edition"], lambda x: (x.get("winner"), x.get("score"), x.get("metroSlug")), "ryder", fails)
            if prev.get("ryderTally") != new.get("ryderTally"): fails.append("ryderTally"); print("  FAIL ryderTally differs")
            else: print("  OK  ryderTally identical")
        else:
            for f in ("leadersMen", "leadersWomen"):
                cmp_dict(prev[f], new[f], lambda x: x["player"], lambda x: (x["total"], tuple(sorted(x["byTour"].items()))), f, fails)
            for f in ("byNationMen", "byNationWomen"):
                cmp_dict(prev[f], new[f], lambda x: x["nation"], lambda x: x["titles"], f, fails)
            cmp_dict(prev["davis"], new["davis"], lambda x: x["country"],
                     lambda x: (x.get("titles"), x.get("titleYears"), x.get("runnerUp"), x.get("runnerUpYears")), "davis", fails)
        cmp_dict(prev["hostMetros"], new["hostMetros"], lambda x: x["metroSlug"], lambda x: x["count"], "hostMetros", fails)
    print("\n" + ("ALL DATA IDENTICAL ✓ (tie-order normalized, safe to commit)" if not fails
                  else f"MISMATCHES: {fails} — do NOT commit; send output to Claude"))
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
