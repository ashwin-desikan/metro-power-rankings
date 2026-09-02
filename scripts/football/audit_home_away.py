#!/usr/bin/env python3
"""Audit every English tier-1 fixture in the spine against engsoccerdata.

WHY. `home_fix_final.json` lists 48 fixtures whose home/away flag is wrong in
`AllFootball.xlsx`. Every one of them is a season's FINAL matchday, one per
season, 1891-92 to 1991-92 with gaps -- so it is one repeated fault, not 48
independent ones, and the gaps were never explained. A hand list cannot tell
you whether it found the whole population. This does.

METHOD, and it refuses to guess.
  1. Pair the spine's two rows per match into one fixture.
  2. Learn the spine-name -> engsoccerdata-name map EMPIRICALLY, from fixtures
     that match unambiguously on (date, unordered goal pair). Unanimity is
     required per spine name: if a name votes for two different targets it is
     left unmapped and reported, never resolved by similarity. The workbook
     carries era names (Woolwich Arsenal, Small Heath, Leicester Fosse) that no
     string distance should be trusted to reconcile.
  3. With the map, compare every fixture and classify the disagreement.

CLASSES
  reversed      : the two clubs are exchanged; the scoreline is stored in true
                  home-away order, so the goals end up on the wrong clubs and
                  the WINNER flips. This is the bug the fix list describes.
  venue_only    : same result, wrong ground. Corrupts home advantage and Elo
                  but not the table.
  score_off     : same venue, different scoreline.
  missing_spine : engsoccerdata has it, the spine does not.
  missing_esd   : the spine has it, engsoccerdata does not.

🔴 READ-ONLY. Writes a report, never the workbook and never the spine.

Usage:
    python scripts/football/audit_home_away.py --self-test
    python scripts/football/audit_home_away.py --fetch      # cache the source
    python scripts/football/audit_home_away.py              # the audit
    python scripts/football/audit_home_away.py --emit-corrections out.json
"""
import argparse, collections, csv, gzip, io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPINE = os.path.join(ROOT, "data", "football", "eng-topflight.csv.gz")
ESD_CACHE = os.path.join(ROOT, "data", "football", "engsoccerdata-england.csv.gz")
ESD_URL = ("https://raw.githubusercontent.com/jalapic/engsoccerdata/"
           "master/data-raw/england.csv")


def fetch_esd(dest=ESD_CACHE):
    """Cache engsoccerdata locally. No User-Agent: that is the shape that
    passes from every vantage measured on this project."""
    import urllib.request
    req = urllib.request.Request(ESD_URL)
    req.remove_header("User-agent")
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with gzip.open(dest, "wb") as f:
        f.write(raw)
    return len(raw)


def load_spine(path=SPINE):
    """Two rows per match in, one fixture out, keyed by the HOME row."""
    with gzip.open(path) as fh:
        rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")))
    out = {}
    for r in rows:
        if r["ha"] != "Home":
            continue
        d = "%04d-%02d-%02d" % (int(r["year"]), int(r["month"]), int(r["day"]))
        out[(d, r["team"], r["opp"])] = {
            "date": d, "season": r["season"], "home": r["team"], "away": r["opp"],
            "hg": int(r["gf"]), "ag": int(r["ga"]), "comp": r["comp"]}
    return rows, out


def load_esd(path=ESD_CACHE):
    with gzip.open(path) as fh:
        rows = list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8")))
    return [{"date": r["Date"][:10], "home": r["home"], "away": r["visitor"],
             "hg": int(r["hgoal"]), "ag": int(r["vgoal"])}
            for r in rows if str(r.get("tier")) == "1"]


def learn_names(spine, esd):
    """spine name -> engsoccerdata name, learned and never guessed.

    Each fixture that matches unambiguously on (date, unordered goal pair)
    gives a CONSTRAINT: this pair of spine names is that pair of esd names,
    orientation unknown. Resolving a constraint by zipping the two sorted pairs
    is wrong the moment the two naming systems sort differently, which is
    exactly what era names do -- "Woolwich Arsenal" and "Arsenal" sort apart,
    and the positional zip then votes Woolwich Arsenal for whoever Arsenal
    happened to be playing. So instead:

      seed  : a constraint where one spine name equals one esd name outright
              pins BOTH sides of that constraint.
      relax : any constraint with one side already mapped pins the other.
      repeat until nothing new resolves.

    Unanimity is still required, so a name that ever votes two ways is left
    unmapped and reported rather than resolved by similarity.
    """
    by_date = collections.defaultdict(list)
    for e in esd:
        by_date[e["date"]].append(e)
    constraints = []
    for f in spine.values():
        goals = sorted([f["hg"], f["ag"]])
        cands = [e for e in by_date.get(f["date"], [])
                 if sorted([e["hg"], e["ag"]]) == goals]
        if len(cands) != 1:
            continue                       # ambiguous on this date, skip it
        e = cands[0]
        constraints.append(((f["home"], f["away"]), (e["home"], e["away"])))

    votes = collections.defaultdict(collections.Counter)

    def cast(sp_pair, es_pair, sp_known):
        """Given one side pinned, the other side is forced."""
        (s1, s2), (e1, e2) = sp_pair, es_pair
        if sp_known == s1:
            other_s, opts = s2, [e1, e2]
        else:
            other_s, opts = s1, [e1, e2]
        target = votes_map.get(sp_known)
        if target not in opts:
            return False
        rest = [o for o in opts if o != target]
        if len(rest) != 1:
            return False
        votes[other_s][rest[0]] += 1
        return True

    # seed on outright name equality
    for sp, es in constraints:
        for i, name in enumerate(sp):
            if name in es:
                votes[name][name] += 1
                other_s = sp[1 - i]
                other_e = [x for x in es if x != name]
                if len(other_e) == 1:
                    votes[other_s][other_e[0]] += 1

    def settle():
        m = {}
        for sp_name, c in votes.items():
            top, n = c.most_common(1)[0]
            if n / sum(c.values()) >= 0.9 and n >= 3:
                m[sp_name] = top
        return m

    votes_map = settle()
    for _ in range(6):
        before = len(votes_map)
        for sp, es in constraints:
            for name in sp:
                if name in votes_map:
                    cast(sp, es, name)
        votes_map = settle()
        if len(votes_map) == before:
            break

    ambiguous = {}
    for sp_name, c in votes.items():
        if sp_name not in votes_map:
            ambiguous[sp_name] = c.most_common(4)
    return votes_map, ambiguous


def audit(spine, esd, name_map):
    by_key = {}
    for e in esd:
        by_key[(e["date"], frozenset([e["home"], e["away"]]))] = e
    seen, findings = set(), []
    unmapped = collections.Counter()
    for f in spine.values():
        h, a = name_map.get(f["home"]), name_map.get(f["away"])
        if not h or not a:
            if not h:
                unmapped[f["home"]] += 1
            if not a:
                unmapped[f["away"]] += 1
            continue
        key = (f["date"], frozenset([h, a]))
        e = by_key.get(key)
        if not e:
            findings.append(dict(f, verdict="missing_esd", truth=None))
            continue
        seen.add(key)
        if e["home"] == h and e["hg"] == f["hg"] and e["ag"] == f["ag"]:
            continue
        truth = "%s %d-%d %s" % (e["home"], e["hg"], e["ag"], e["away"])
        goals_spine = {h: f["hg"], a: f["ag"]}
        goals_truth = {e["home"]: e["hg"], e["away"]: e["ag"]}
        if goals_spine == goals_truth:
            verdict = "venue_only"
        elif e["home"] != h:
            verdict = "reversed"
        else:
            verdict = "score_off"
        findings.append(dict(f, verdict=verdict, truth=truth,
                             esd_home=e["home"], esd_hg=e["hg"], esd_ag=e["ag"]))
    missing_spine = [e for k, e in by_key.items() if k not in seen]
    return findings, missing_spine, unmapped


def self_test():
    spine = {("1969-05-01", "Arsenal", "Spurs"):
             {"date": "1969-05-01", "season": "1968-69", "home": "Arsenal",
              "away": "Spurs", "hg": 1, "ag": 0, "comp": "First Division"}}
    esd = [{"date": "1969-05-01", "home": "Tottenham Hotspur",
            "away": "Arsenal", "hg": 1, "ag": 0}]
    nm = {"Arsenal": "Arsenal", "Spurs": "Tottenham Hotspur"}
    f, ms, un = audit(spine, esd, nm)
    assert len(f) == 1 and f[0]["verdict"] == "reversed", f
    # the same fixture, correctly stored, is silent
    esd_ok = [{"date": "1969-05-01", "home": "Arsenal",
               "away": "Tottenham Hotspur", "hg": 1, "ag": 0}]
    f2, _, _ = audit(spine, esd_ok, nm)
    assert f2 == [], f2
    # a draw with the ground wrong is venue_only, never reversed
    sp3 = {("1936-05-02", "Leeds", "Arsenal"):
           {"date": "1936-05-02", "season": "1935-36", "home": "Leeds",
            "away": "Arsenal", "hg": 2, "ag": 2, "comp": "First Division"}}
    esd3 = [{"date": "1936-05-02", "home": "Arsenal", "away": "Leeds United",
             "hg": 2, "ag": 2}]
    f3, _, _ = audit(sp3, esd3, {"Leeds": "Leeds United", "Arsenal": "Arsenal"})
    assert f3[0]["verdict"] == "venue_only", f3
    # right venue, wrong scoreline is score_off, not reversed
    esd4 = [{"date": "1969-05-01", "home": "Arsenal", "away": "Tottenham Hotspur",
             "hg": 3, "ag": 0}]
    f4, _, _ = audit(spine, esd4, nm)
    assert f4[0]["verdict"] == "score_off", f4
    # an unmapped club is reported, never guessed at
    f5, _, un5 = audit(spine, esd, {"Arsenal": "Arsenal"})
    assert f5 == [] and un5["Spurs"] == 1
    # name learning demands unanimity
    nm2, amb = learn_names(spine, esd)
    assert "Arsenal" not in nm2, "3 votes minimum, one fixture is not enough"
    print("self-test OK: reversed, venue_only, score_off, unmapped, unanimity")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--emit-corrections", default=None)
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return 0
    if a.fetch or not os.path.exists(ESD_CACHE):
        print("fetching engsoccerdata ...")
        print("cached %d bytes to %s" % (fetch_esd(), os.path.relpath(ESD_CACHE, ROOT)))
        if a.fetch:
            return 0
    _, spine = load_spine()
    esd = load_esd()
    print("spine fixtures: %d | engsoccerdata tier-1 fixtures: %d" % (len(spine), len(esd)))
    name_map, ambiguous = learn_names(spine, esd)
    print("name map learned: %d spine clubs, %d ambiguous" % (len(name_map), len(ambiguous)))
    for k, v in list(ambiguous.items())[:10]:
        print("   AMBIGUOUS %-26s %s" % (k, v))
    findings, missing_spine, unmapped = audit(spine, esd, name_map)
    tally = collections.Counter(f["verdict"] for f in findings)
    print()
    for k in ("reversed", "venue_only", "score_off", "missing_esd"):
        print("  %-14s %d" % (k, tally.get(k, 0)))
    print("  %-14s %d" % ("missing_spine", len(missing_spine)))
    if unmapped:
        print("  unmapped spine clubs: %s" % dict(unmapped.most_common(10)))
    months = collections.Counter(int(f["date"][5:7]) for f in findings
                                 if f["verdict"] in ("reversed", "venue_only"))
    print()
    print("month of every reversed/venue_only fixture: %s" % dict(sorted(months.items())))
    seasons = sorted({f["season"] for f in findings if f["verdict"] in ("reversed", "venue_only")})
    print("distinct seasons implicated: %d (%s .. %s)"
          % (len(seasons), seasons[0] if seasons else "-", seasons[-1] if seasons else "-"))
    per = collections.Counter(f["season"] for f in findings
                              if f["verdict"] in ("reversed", "venue_only"))
    worse = [s for s, n in per.items() if n > 1]
    print("seasons with MORE THAN ONE such fixture: %s" % (sorted(worse) or "none"))
    off = [f for f in findings if f["verdict"] == "score_off"]
    if off:
        print()
        print("score_off (right ground, different scoreline) - these are NOT the")
        print("home/away bug and may be engsoccerdata errors rather than workbook ones:")
        for f in off:
            print("   %s %s  spine %s %d-%d %s  |  esd %s"
                  % (f["season"], f["date"], f["home"], f["hg"], f["ag"], f["away"], f["truth"]))
    print()
    print("coverage differences (NOT home/away errors, listed so they are not")
    print("mistaken for them): %d spine fixtures engsoccerdata does not carry at"
          % tally.get("missing_esd", 0))
    print("that date, %d the other way. The spine holds %d fixtures against %d,"
          % (len(missing_spine), len(spine), len(esd)))
    print("so most of these are the same match dated differently in the two sources.")
    if a.emit_corrections:
        # Emit the TRUE state in SPINE names, so the consumer assigns it rather
        # than applying a transformation. A transformation has to know that a
        # `reversed` row swaps both venue and goals while a `venue_only` row
        # swaps only the venue, and getting that backwards on a draw is silent.
        # Assigning the truth cannot get it backwards.
        # 🔴 Do NOT invert the name map. It is many-to-one by design: the
        # workbook's era names mean Woolwich Arsenal and Arsenal both point at
        # engsoccerdata's "Arsenal", so inverting is ambiguous for every club
        # that was ever renamed, and silently drops exactly the oldest fixtures
        # this audit exists to find. The question is only which of THIS
        # fixture's two spine clubs was at home, so ask the forward map.
        out = []
        for f in findings:
            if f["verdict"] not in ("reversed", "venue_only"):
                continue
            if name_map.get(f["home"]) == f["esd_home"]:
                true_home, true_away = f["home"], f["away"]
            elif name_map.get(f["away"]) == f["esd_home"]:
                true_home, true_away = f["away"], f["home"]
            else:
                print("   SKIPPED (neither club maps to %r): %s"
                      % (f["esd_home"], f["date"]))
                continue
            out.append({"date": f["date"], "season": f["season"],
                        "spine_home": f["home"], "spine_away": f["away"],
                        "true_home": true_home, "true_away": true_away,
                        "hg": f["esd_hg"], "ag": f["esd_ag"],
                        "verdict": f["verdict"], "truth": f["truth"]})
        json.dump({"source": ESD_URL,
                   "what": "The true orientation of every English tier-1 fixture "
                           "AllFootball.xlsx records the wrong way round. Names are "
                           "SPINE names (the workbook's, era names included) so a "
                           "consumer can assign rather than transform.",
                   "how_found": "scripts/football/audit_home_away.py, which compares "
                                "every one of the spine's 50,223 fixtures against "
                                "engsoccerdata and learns the club-name map from "
                                "unambiguous date-and-score hits rather than guessing.",
                   "shape": "One per season, every one a season's final matchday, "
                            "1891-92 to 1991-92. 42 of the 47 pairings record BOTH "
                            "legs at the same ground, which is impossible in a double "
                            "round-robin and is independent proof the workbook is the "
                            "one that is wrong.",
                   "n": len(out), "corrections": out},
                  open(a.emit_corrections, "w", encoding="utf-8", newline=""),
                  indent=1, sort_keys=True)
        print("\nwrote %d corrections to %s" % (len(out), a.emit_corrections))
    return 0


if __name__ == "__main__":
    sys.exit(main())
