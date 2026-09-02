#!/usr/bin/env python3
"""Check the home/away fix list against the spine the published ledger reads.

WHAT THIS IS FOR. `home_fix_final.json` in this directory lists English
top-flight fixtures whose home/away flag is wrong in `AllFootball.xlsx`, with
the true fixture taken from engsoccerdata. A previous session corrected the
Supabase spine (`football_matches`, 48/48 verified 2026-09-02) but NOT the
workbook, and the Against Expectation ledger does not read Supabase: it reads
`data/football/eng-topflight.csv.gz`, which is the workbook extract. So the
published ledger still carries every one of these errors.

WHAT THE ERROR ACTUALLY IS, and it is narrower than it looks. The scoreline
is stored in TRUE home-away order and the two club names are swapped. So

    truth  Burnley 1-2 Sunderland
    spine  Sunderland 1-2 Burnley   (Sunderland recorded as home)

reads as a Sunderland home defeat when it was a Sunderland away win. The
correction is therefore mechanical: exchange the two club names and leave the
goals alone. Nothing is inferred; engsoccerdata is the source.

THE SHAPE OF THE BUG. Every affected fixture is the last matchday of its
season -- 46 of 47 fall in April, May or June -- one per season, across 1891-92
to 1991-92 with gaps. That is one repeated fault, not 47 independent ones, and
the gaps are the open question: either those seasons are clean or the pass that
produced this list did not reach them. Do not treat 47 as a proven population.

WHY THIS RUNS AS A CHECK RATHER THAN A FIX. `build_expectation.py` carries a
KNOWN_BAD list of 20 of these and refuses to repair them, with the note "DO NOT
REPAIR THE SPINE BY INFERENCE ... Get the real results." The real results now
exist, which lifts that block, but applying them rewrites published historical
results and rewrites a 192 MB master workbook. That is Ashwin's call, so this
script proves the ground and stops.

Usage:
    python scripts/football/verify_home_fix.py --self-test
    python scripts/football/verify_home_fix.py            # the report
    python scripts/football/verify_home_fix.py --json out.json
"""
import argparse, csv, gzip, io, json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FIXES = os.path.join(HERE, "home_fix_final.json")
SPINE = os.path.join(ROOT, "data", "football", "eng-topflight.csv.gz")

TRUTH_RE = re.compile(r"^(.*?) (\d+)-(\d+) (.*)$")


def parse_truth(eng):
    """'Burnley 1-2 Sunderland' -> (home, hg, ag, away). Club names contain
    digits nowhere in this dataset, but they DO contain spaces, so the split
    has to hang off the score, not off whitespace."""
    m = TRUTH_RE.match(eng or "")
    if not m:
        return None
    return m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)


def classify(truth, spine_home, spine_gf, spine_ga, spine_away):
    """How wrong is this row? Compare goals-per-club, which is what decides
    whether the ledger credits the right club with the win."""
    th, thg, tag, ta = truth
    if spine_home == th and spine_gf == thg and spine_ga == tag:
        return "correct"
    if {spine_home: spine_gf, spine_away: spine_ga} == {th: thg, ta: tag}:
        return "venue_only"      # right result, wrong ground
    return "wrong_winner"        # the win is credited to the wrong club


def load_spine(path=SPINE):
    with gzip.open(path) as fh:
        rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")))
    by = {}
    for r in rows:
        d = "%04d-%02d-%02d" % (int(r["year"]), int(r["month"]), int(r["day"]))
        by.setdefault((d, frozenset([r["team"], r["opp"]])), []).append(r)
    return rows, by


def check(fixes, by_key):
    """One verdict per English fixture in the list."""
    out = []
    for f in fixes:
        if not str(f.get("comp", "")).startswith("england"):
            continue
        truth = parse_truth(f["eng"])
        rec = {"season": f["season"], "date": f["date"], "id": f.get("id"),
               "truth": f["eng"], "score_ok": f.get("score_ok")}
        cand = by_key.get((f["date"], frozenset([f["A"], f["B"]])))
        if not truth:
            rec["verdict"] = "unparsable_truth"
        elif not cand:
            rec["verdict"] = "absent_from_spine"
        else:
            home = [r for r in cand if r["ha"] == "Home"]
            if not home:
                rec["verdict"] = "no_home_row"
            else:
                h = home[0]
                rec["spine"] = "%s %s-%s %s" % (h["team"], h["gf"], h["ga"], h["opp"])
                rec["verdict"] = classify(truth, h["team"], int(h["gf"]),
                                          int(h["ga"]), h["opp"])
        out.append(rec)
    return out


def self_test():
    assert parse_truth("Burnley 1-2 Sunderland") == ("Burnley", 1, 2, "Sunderland")
    # club names with spaces and with digits-adjacent words must still split
    assert parse_truth("Bradford Park Avenue 3-0 Bradford City") == \
        ("Bradford Park Avenue", 3, 0, "Bradford City")
    assert parse_truth("West Bromwich Albion 0-1 Nottingham Forest") == \
        ("West Bromwich Albion", 0, 1, "Nottingham Forest")
    assert parse_truth("nonsense") is None and parse_truth(None) is None

    t = ("Burnley", 1, 2, "Sunderland")
    assert classify(t, "Burnley", 1, 2, "Sunderland") == "correct"
    # the actual bug: names exchanged, scoreline left in true order, so the
    # goals end up attached to the wrong clubs and the winner flips
    assert classify(t, "Sunderland", 1, 2, "Burnley") == "wrong_winner"
    # a draw survives the same swap with the result intact but the ground wrong
    d = ("Arsenal", 2, 2, "Leeds United")
    assert classify(d, "Leeds United", 2, 2, "Arsenal") == "venue_only"
    # a genuine mirror (venue flipped AND goals moved with the clubs) is
    # venue-only too, which is the case a naive goals-only check would miss
    assert classify(("Liverpool", 0, 2, "Arsenal"), "Arsenal", 2, 0, "Liverpool") \
        == "venue_only"
    # and a real scoreline difference is never quietly called venue-only
    assert classify(t, "Burnley", 3, 2, "Sunderland") == "wrong_winner"
    print("self-test OK: truth parsing, the swap signature, draws, mirrors")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--json", default=None, help="write the per-fixture verdicts")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    for p in (FIXES, SPINE):
        if not os.path.exists(p):
            sys.exit("FATAL: missing %s" % p)
    fixes = json.load(open(FIXES, encoding="utf-8"))
    rows, by_key = load_spine()
    verdicts = check(fixes, by_key)
    tally = Counter(v["verdict"] for v in verdicts)
    months = Counter(int(v["date"][5:7]) for v in verdicts)

    print("spine: %d rows from %s" % (len(rows), os.path.relpath(SPINE, ROOT)))
    print("fix list: %d entries, %d of them English top-flight"
          % (len(fixes), len(verdicts)))
    print()
    for k in ("correct", "venue_only", "wrong_winner", "absent_from_spine",
              "no_home_row", "unparsable_truth"):
        if tally.get(k):
            print("  %-18s %d" % (k, tally[k]))
    print()
    print("season-end signature: %d of %d fall in April, May or June"
          % (sum(months.get(m, 0) for m in (4, 5, 6)), len(verdicts)))
    print("one per season, %d distinct seasons, %s to %s"
          % (len({v["season"] for v in verdicts}),
             min(v["season"] for v in verdicts), max(v["season"] for v in verdicts)))
    print()
    if tally.get("wrong_winner"):
        print("the published ledger credits the wrong club in these:")
        for v in verdicts:
            if v["verdict"] == "wrong_winner":
                print("   %s  truth %-46s | spine %s"
                      % (v["season"], v["truth"], v.get("spine", "?")))
    if tally.get("venue_only"):
        print()
        print("result right, ground wrong (still corrupts home advantage and Elo):")
        for v in verdicts:
            if v["verdict"] == "venue_only":
                print("   %s  truth %-46s | spine %s"
                      % (v["season"], v["truth"], v.get("spine", "?")))
    for v in verdicts:
        if v["verdict"] in ("absent_from_spine", "no_home_row", "unparsable_truth"):
            print()
            print("NEEDS A LOOK (%s): %s %s" % (v["verdict"], v["season"], v["truth"]))
    if args.json:
        json.dump({"tally": dict(tally), "verdicts": verdicts},
                  open(args.json, "w", encoding="utf-8", newline=""), indent=1)
        print("\nwrote", args.json)
    print()
    print("NOT APPLIED. The correction is mechanical (exchange the two club "
          "names, leave the goals) and engsoccerdata is the source, so this is "
          "no longer inference. Applying it rewrites published historical "
          "results and the master workbook, which is Ashwin's call.")


if __name__ == "__main__":
    main()
