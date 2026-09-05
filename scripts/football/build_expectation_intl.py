#!/usr/bin/env python3
"""Against Expectation for the five continental top flights.

    python scripts/football/build_expectation_intl.py --self-test
    python scripts/football/build_expectation_intl.py --dry
    python scripts/football/build_expectation_intl.py --write

Spain, Italy, Germany, France and the Netherlands, on the SAME model as the
English ledger. The model is IMPORTED from build_expectation, never copied:
`gmul`, `davidson`, `trailing_params`, `run` and `brier3` all come from there,
so a change to the rating engine moves England and the continent together. If
this file ever grows its own copy of `run()`, the two ledgers will drift and
nobody will notice until the numbers disagree in public.

WHAT IS DIFFERENT FROM ENGLAND, and why this is a sibling rather than a flag:
  - the source is engsoccerdata CSV, not AllFootball.xlsx paired rows
  - there is no market layer; football-data.co.uk E0 is England-only here
  - there is no metro on any row, so no MetroResolver and no hub reconciliation
  - the two-to-three points switch is a DIFFERENT SEASON in every country

🔴 SURPLUS IS THE HEADLINE, NOT `diff`. Surplus is measured in win-units and is
independent of the points system. `pts`/`xpts`/`diff` depend on WIN_PTS_FROM
below and are therefore only as good as those five dates.

🔴 THIS BUILD REFUSES RATHER THAN GUESSES. An interior season that is missing,
or a season that is part-played, has to be DECLARED in MISSING_SEASONS or
PARTIAL_SEASONS with a reason. A gap that nobody declared is a data defect
wearing a season's clothes, and silently skipping it rewrites promotion and
relegation for every club around it.

DATA: data/football/esd/<country>.csv from github.com/jalapic/engsoccerdata,
compiled by James Curley. `data/` is gitignored, so this is per-machine and the
shipped artefact is public/data/football/expectation/intl/, not the input.
Licensing on that repo is unresolved: the package metadata says GPL >= 2, the
README says non-commercial with attribution, and there is no LICENSE file. The
attribution is carried in `meta.source_credit` and must render wherever this
data does.
"""
import argparse, csv, json, os, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from build_expectation import (  # noqa: E402  the one model, imported not copied
    PARAMS, run, brier3, season_completeness,
    ABANDONED_FRACTION, SUSPICIOUS_FRACTION,
)

SRC_DIR = os.path.join(ROOT, "data", "football", "esd")
OUT_DIR = os.path.join(ROOT, "public", "data", "football", "expectation", "intl")

SOURCE_CREDIT = ("Historical results compiled by James Curley, "
                 "github.com/jalapic/engsoccerdata")

# The SOURCE's currency, not this build's. engsoccerdata ships in annual
# batches: v0.1.8, released 2026-02-06 and last committed 2026-02-08, carries
# through 2024-25. check-data-currency reads this as _meta.asOf, so when Curley
# publishes 2025-26 and nobody re-pulls, the manifest says so. Bump it only
# after actually re-downloading data/football/esd/.
SOURCE_AS_OF = "2026-02-08"

# First season played under three points for a win. England is 1981; every one
# of these is later and none of them is the same as its neighbour's.
#   Spain 1995-96      en.wikipedia.org/wiki/1995-96_La_Liga
#   Italy 1994-95      en.wikipedia.org/wiki/1994-95_Serie_A
#   Germany 1995-96    de.wikipedia.org/wiki/Fussball-Bundesliga_1995/96
#   France 1994-95     fr.wikipedia.org/wiki/Championnat_de_France_de_football_1994-1995
#   Netherlands 1995-96  en.wikipedia.org/wiki/1994-95_Eredivisie (last 2-pt season)
# 🔴 France ran a three-point TRIAL in 1988-89 and reverted. It is not modelled
# here: 1994 is the permanent switch. Six seasons of French `pts` are therefore
# on the wrong scale if that trial was league-wide. `surplus` is unaffected.
WIN_PTS_FROM = {"spain": 1995, "italy": 1994, "germany": 1995,
                "france": 1994, "holland": 1995}

COUNTRIES = {
    "spain":   {"label": "Spain",       "comp": "Primera División"},
    "italy":   {"label": "Italy",       "comp": "Serie A"},
    "germany": {"label": "Germany",     "comp": "Bundesliga"},
    "france":  {"label": "France",      "comp": "Ligue 1"},
    "holland": {"label": "Netherlands", "comp": "Eredivisie"},
}

# Interior seasons with no matches. Declared, with the reason, or the build stops.
MISSING_SEASONS = {
    ("spain", 1936): "Spanish Civil War", ("spain", 1937): "Spanish Civil War",
    ("spain", 1938): "Spanish Civil War",
    ("italy", 1943): "Second World War", ("italy", 1944): "Second World War",
    ("france", 1937): "not present in the source",
    ("france", 1939): "Second World War", ("france", 1940): "Second World War",
    ("france", 1941): "Second World War", ("france", 1942): "Second World War",
    ("france", 1943): "Second World War", ("france", 1944): "Second World War",
    # 🔴 NOT a war and NOT an abandonment. 1994-95 Division 1 was played in
    # full and Nantes won it. The 380 matches are simply absent from
    # engsoccerdata. Every French rating carries a one-season hole here and the
    # payload says so; fill it from another source before anyone cites a French
    # career total across 1994.
    ("france", 1994): "DATA GAP: season was played, source does not carry it",
}

# Part-played seasons: real matches, no full fixture list. Kept, and flagged.
PARTIAL_SEASONS = {
    ("france", 2019): "abandoned at the COVID-19 shutdown, 279 of 380 played",
    ("holland", 2019): "voided at the COVID-19 shutdown, 232 of 306 played",
    # 🔴 NOT an abandonment. All 20 clubs played exactly 34 games and the source
    # stops dead on 1992-04-25: the last four matchdays, 40 matches, are simply
    # absent. That is the season Stuttgart took on the final day on goal
    # difference, so the source's table does not end where the season did.
    # Ratings absorb the 340 real matches; nothing here should be cited as a
    # 1991-92 final standing.
    ("germany", 1991): "source truncated on 1992-04-25, last 4 matchdays absent, 340 of 380",
    # Same shape as Germany 1991-92: 20 clubs each on 34 of 38. One round also
    # carries the placeholder date 1946-03-10 (see SEASON_NAME_MERGE), so the
    # within-season ordering of those ten matches is wrong even though the
    # results are real.
    ("france", 1946): "source 4 matchdays short (20 clubs at 34 of 38) and one round mis-dated",
}

# Seasons not played as one double round robin. `expected = k * (k - 1)` is
# wrong for these by construction, so they are exempt from the club cap and the
# completeness fraction, and ONLY these. Widening the gate for everyone would
# have hidden the France 1994 hole.
GROUPED_SEASONS = {
    ("italy", 1945): "two regional groups (Alta Italia, Centro-Sud) plus a final round",
}

# One club recorded under TWO names inside a single season. These are not
# inferred from a symptom: in every case the two names' game counts sum to
# EXACTLY the league's modal games-per-club that season, and merging them
# returns the season to the right club count and the right match total.
#   france 1981  Brest Armorique 16 + Stade Brest 22            = 38, 20 clubs
#   france 1990  Brest Armorique 20 + Stade Brest 18            = 38, 20 clubs
#   france 1986  Matra Racing 15 + Racing Club de France 23     = 38, 20 clubs
#   france 1988  Matra Racing 25 + Racing Club de France 13     = 38, 20 clubs
# The arithmetic is re-checked at build time by the club-share gate below, so a
# source change that breaks the sum stops the build rather than merging garbage.
SEASON_NAME_MERGE = {
    ("france", 1981, "Brest Armorique FC"): "Stade Brest",
    ("france", 1990, "Brest Armorique FC"): "Stade Brest",
    ("france", 1986, "Matra Racing"): "Racing Club de France",
    ("france", 1988, "Matra Racing"): "Racing Club de France",
    #   france 1945  Red Star Olympique 17 + Red Star Olympique Audonien 17 = 34
    #                merging returns the season to 18 clubs and 306 of 306, exact
    ("france", 1945, "Red Star Olympique"): "Red Star Olympique Audonien",
    #   france 1946  AS Cannes 1 + AS Cannes-Grasse 33               = 34, 20 clubs
    #   The single "AS Cannes" row sits inside a complete ten-match round dated
    #   1946-03-10, five months before the season's real start on 1946-08-18.
    #   The round is real 1946-47 football on a placeholder date; it is NOT
    #   dropped, because dropping it would delete a matchday to tidy a date.
    ("france", 1946, "AS Cannes"): "AS Cannes-Grasse",
}

# 🔴 AWAITING A RULING. Three rows put a club into a season it did not play,
# on one match, in a league where everyone else played 34 to 40. Unlike the
# merges above these do NOT prove themselves, so the disposition here is mine
# and not the data's: they are DROPPED, because keeping them invents a
# top-flight club-season and hands a club a rating built on a single game.
# Every dropped row is echoed in the payload under meta.dropped_rows so the
# decision is visible and reversible. Ashwin rules; until he does, this is a
# stated choice rather than a finding.
GHOST_ROWS = {
    ("italy", "1947-08-06", "Unione Triestina", "AC Venezia"):
        "Venezia played 1 game in a 37-game season; not a 1947-48 Serie A club",
    ("italy", "1947-08-06", "Brescia Calcio", "Atalanta"):
        "Brescia played 1 game in a 37-game season; not a 1947-48 Serie A club",
}

# A club must play at least this share of its league's median games that season.
CLUB_SHARE_MIN = 0.5

MIN_CLUBS, MAX_CLUBS = 8, 24


def season_label(start_year):
    return "%d-%02d" % (start_year, (start_year + 1) % 100)


def read_country(country, src_dir=SRC_DIR):
    """engsoccerdata CSV -> the match dicts `run()` expects. Tier 1 only."""
    path = os.path.join(src_dir, country + ".csv")
    with open(path, "rt", encoding="utf-8", newline="") as fh:
        raw = list(csv.DictReader(fh))
    out, seen, dropped = [], set(), []
    for r in raw:
        if str(r.get("tier", "1")).strip() != "1":
            continue
        hg, ag = r["hgoal"].strip(), r["vgoal"].strip()
        if not (hg.lstrip("-").isdigit() and ag.lstrip("-").isdigit()):
            raise SystemExit("%s: non-numeric score in %r" % (country, r))
        d = r["Date"].strip()
        key = (d, r["home"], r["visitor"])
        if key in seen:
            raise SystemExit("%s: duplicate fixture %r" % (country, key))
        seen.add(key)
        y, m, dd = (int(x) for x in d.split("-"))
        yr = int(r["Season"])
        home, away = r["home"].strip(), r["visitor"].strip()
        if (country, d, home, away) in GHOST_ROWS:
            dropped.append({"date": d, "home": home, "away": away,
                            "reason": GHOST_ROWS[(country, d, home, away)]})
            continue
        home = SEASON_NAME_MERGE.get((country, yr, home), home)
        away = SEASON_NAME_MERGE.get((country, yr, away), away)
        out.append({"y": y, "m": m, "d": dd,
                    "season": season_label(yr), "start_year": yr,
                    "home": home, "away": away,
                    "hg": int(hg), "ag": int(ag)})
    out.sort(key=lambda x: (x["y"], x["m"], x["d"], x["home"]))
    return out, dropped


def audit(country, M):
    """Every gate. Returns (missing, partial) once nothing is undeclared."""
    years = sorted({m["start_year"] for m in M})
    gaps = [y for y in range(years[0], years[-1] + 1) if y not in set(years)]
    undeclared = [y for y in gaps if (country, y) not in MISSING_SEASONS]
    if undeclared:
        raise SystemExit(
            "%s: interior season(s) %r have no matches and are not declared in "
            "MISSING_SEASONS. Say what they are before shipping." % (country, undeclared))

    comp = season_completeness(M)
    part, thin, grouped = [], [], []
    for s, (n, k, exp, frac) in sorted(comp.items()):
        yr = int(s[:4])
        if (country, yr) in GROUPED_SEASONS:
            grouped.append({"season": s, "clubs": k, "played": n,
                            "reason": GROUPED_SEASONS[(country, yr)]})
            continue
        if not (MIN_CLUBS <= k <= MAX_CLUBS):
            raise SystemExit("%s %s: %d clubs, outside %d..%d"
                             % (country, s, k, MIN_CLUBS, MAX_CLUBS))
        if frac < ABANDONED_FRACTION:
            thin.append((s, n, exp, round(frac, 3)))
        elif frac < SUSPICIOUS_FRACTION:
            if (country, yr) not in PARTIAL_SEASONS:
                raise SystemExit(
                    "%s %s: %d of %d matches (%.0f%%). Part-played but not "
                    "declared in PARTIAL_SEASONS. Decide what it is."
                    % (country, s, n, exp, frac * 100))
            part.append({"season": s, "played": n, "expected": exp,
                         "fraction": round(frac, 3),
                         "reason": PARTIAL_SEASONS[(country, yr)]})
    if thin:
        raise SystemExit("%s: season(s) under %d%% complete and undeclared: %r"
                         % (country, ABANDONED_FRACTION * 100, thin))
    # A club that played a fraction of its league-mates' games is one club
    # under two names, or a row from another competition. Either way it is not
    # a club-season, and it must not silently become one.
    import statistics
    games = defaultdict(Counter)
    for m in M:
        games[m["season"]][m["home"]] += 1
        games[m["season"]][m["away"]] += 1
    short = []
    for s, c in sorted(games.items()):
        med = statistics.median(c.values())
        for club, n in sorted(c.items()):
            if n < med * CLUB_SHARE_MIN:
                short.append("%s %s: %d games, league median %d" % (s, club, n, med))
    if short:
        raise SystemExit(
            "%s: club-season(s) far short of the league median, and undeclared. "
            "One club under two names, or a foreign row. Declare in "
            "SEASON_NAME_MERGE or GHOST_ROWS:\n    %s" % (country, "\n    ".join(short)))

    missing = [{"season": season_label(y), "reason": MISSING_SEASONS[(country, y)]}
               for y in gaps]
    return missing, part, grouped


def era_baseline(rows):
    """Log loss of predicting each season's own H/D/A base rates. The bar the
    model has to clear to have said anything at all."""
    agg = defaultdict(lambda: [0, 0, 0])
    for r in rows:
        agg[r["season"]][0 if r["res"] == 1 else (1 if r["res"] == 0 else 2)] += 1
    tot, n = 0.0, 0
    import math
    for r in rows:
        c = agg[r["season"]]
        s = sum(c) or 1
        p = [c[0] / s, c[1] / s, c[2] / s][0 if r["res"] == 1 else (1 if r["res"] == 0 else 2)]
        tot += -math.log(max(p, 1e-12)); n += 1
    return tot / n if n else 0.0


def score(rows):
    import math
    ll = bs = 0.0
    for r in rows:
        p = r["pH"] if r["res"] == 1 else (r["pD"] if r["res"] == 0 else r["pA"])
        ll += -math.log(max(p, 1e-12))
        bs += brier3(r["pH"], r["pD"], r["pA"], r["res"])
    n = len(rows) or 1
    return ll / n, bs / n


def club_seasons(country, rows):
    switch = WIN_PTS_FROM[country]
    wp = lambda s: 3 if int(s[:4]) >= switch else 2
    cs = {}
    for r in rows:
        for side in ("home", "away"):
            t = r[side]
            p_w = r["pH"] if side == "home" else r["pA"]
            won = (r["res"] == 1) == (side == "home") and r["res"] != 0
            drew = r["res"] == 0
            c = cs.setdefault((r["season"], t), {
                "season": r["season"], "club": t, "gp": 0, "w": 0, "d": 0,
                "l": 0, "pts": 0, "xpts": 0.0, "surplus": 0.0})
            c["gp"] += 1
            c["xpts"] += wp(r["season"]) * p_w + 1.0 * r["pD"]
            c["pts"] += wp(r["season"]) if won else (1 if drew else 0)
            c["w"] += 1 if won else 0
            c["d"] += 1 if drew else 0
            c["l"] += 0 if (won or drew) else 1
            c["surplus"] += (1.0 if won else 0.5 if drew else 0.0) - (p_w + 0.5 * r["pD"])
    return cs


def row_out(c, country):
    return {"season": c["season"], "club": c["club"],
            "win_pts": 3 if int(c["season"][:4]) >= WIN_PTS_FROM[country] else 2,
            "gp": c["gp"], "w": c["w"], "d": c["d"], "l": c["l"],
            "pts": c["pts"], "xpts": round(c["xpts"], 2),
            "diff": round(c["pts"] - c["xpts"], 2),
            "surplus": round(c["surplus"], 3)}


def build_country(country, src_dir=SRC_DIR):
    M, dropped = read_country(country, src_dir)
    missing, partial, grouped = audit(country, M)
    rows, par = run(M, PARAMS)
    ll, bs = score(rows)
    base = era_baseline(rows)
    if ll >= base:
        raise SystemExit("%s: log loss %.5f does not beat the era baseline %.5f. "
                         "The model has said nothing; do not ship it." % (country, ll, base))
    cs = club_seasons(country, rows)
    per_club = defaultdict(lambda: {"seasons": [], "total_surplus": 0.0, "club_matches": 0})
    for c in sorted(cs.values(), key=lambda x: x["season"]):
        e = per_club[c["club"]]
        e["seasons"].append(row_out(c, country))
        e["total_surplus"] += c["surplus"]
        e["club_matches"] += c["gp"]
    clubs = [{"club": k, "metro": None, "metro_slug": None,
              "total_surplus": round(v["total_surplus"], 2),
              "club_matches": v["club_matches"], "seasons": v["seasons"]}
             for k, v in sorted(per_club.items())]
    ranked = sorted(cs.values(), key=lambda c: c["surplus"], reverse=True)
    seasons = sorted({m["season"] for m in M}, key=lambda s: int(s[:4]))
    payload = {
        "meta": {
            "country": COUNTRIES[country]["label"],
            "competition": COUNTRIES[country]["comp"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": "davidson-elo-v1",
            "model_source": "shared with the English ledger, imported not copied",
            "source": "engsoccerdata data-raw/%s.csv" % country,
            "source_credit": SOURCE_CREDIT,
            "seasons": [seasons[0], seasons[-1]],
            "season_count": len(seasons),
            "matches": len(M),
            "clubs": len(clubs),
            "win_pts_three_from": season_label(WIN_PTS_FROM[country]),
            "log_loss": round(ll, 5),
            "brier": round(bs, 5),
            "baseline_log_loss": round(base, 5),
            "skill_vs_era_baseline": round((base - ll) / base, 4),
            "market": None,
            "metros_resolved": False,
            "missing_seasons": missing,
            "partial_seasons": partial,
            "grouped_seasons": grouped,
            "dropped_rows": dropped,
        },
        "best": [row_out(c, country) for c in ranked[:25]],
        "worst": [row_out(c, country) for c in ranked[-25:]][::-1],
        "clubs": clubs,
    }
    return payload


def self_test():
    """Synthetic, offline. The gates must fire."""
    import tempfile, math
    ok = True

    def mk(rows, path):
        with open(path, "w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["Date", "Season", "home", "visitor", "FT", "hgoal", "vgoal", "tier"])
            for r in rows:
                w.writerow(r)

    d = tempfile.mkdtemp()
    # a clean two-season, four-club double round robin
    rows = []
    clubs = ["A", "B", "C", "D"]
    for si, yr in enumerate((2000, 2001)):
        n = 0
        for h in clubs:
            for a in clubs:
                if h == a:
                    continue
                n += 1
                rows.append(["%d-09-%02d" % (yr, (n % 28) + 1), yr, h, a,
                             "1-0", 1 + (h == "A"), 0, 1])
    mk(rows, os.path.join(d, "spain.csv"))
    try:
        M, _ = read_country("spain", d)
        assert len(M) == 24, len(M)
        assert M[0]["season"] == "2000-01", M[0]["season"]
        print("  ok  read_country pairs and labels seasons")
    except Exception as e:
        ok = False; print("  FAIL read_country: %s" % e)

    # duplicate fixture must refuse
    mk(rows + [rows[0]], os.path.join(d, "italy.csv"))
    try:
        read_country("italy", d); ok = False; print("  FAIL duplicate fixture was accepted")
    except SystemExit:
        print("  ok  duplicate fixture refused")

    # undeclared interior gap must refuse
    g = [r for r in rows] + [["2003-09-01", 2003, "A", "B", "1-0", 1, 0, 1],
                             ["2003-09-02", 2003, "B", "A", "1-0", 1, 0, 1]]
    mk(g, os.path.join(d, "germany.csv"))
    try:
        audit("germany", read_country("germany", d)[0])
        ok = False; print("  FAIL undeclared interior gap was accepted")
    except SystemExit:
        print("  ok  undeclared interior gap refused")

    # season label arithmetic across the century
    assert season_label(1999) == "1999-00", season_label(1999)
    assert season_label(2024) == "2024-25"
    assert season_label(1928) == "1928-29"
    print("  ok  season labels roll over the century")

    # the imported model is the same object the English build uses
    import build_expectation as be
    assert run is be.run and brier3 is be.brier3
    print("  ok  model is imported from build_expectation, not copied")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true", help="build and report, write nothing")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--only", help="one country slug")
    a = ap.parse_args()

    if getattr(a, "self_test"):
        return self_test()
    if not (a.dry or a.write):
        ap.error("pass --dry or --write")

    names = [a.only] if a.only else list(COUNTRIES)
    payloads, index = {}, []
    for c in names:
        p = build_country(c)
        payloads[c] = p
        m = p["meta"]
        index.append({"slug": c, "country": m["country"], "competition": m["competition"],
                      "seasons": m["seasons"], "season_count": m["season_count"],
                      "matches": m["matches"], "clubs": m["clubs"],
                      "log_loss": m["log_loss"], "baseline_log_loss": m["baseline_log_loss"],
                      "skill_vs_era_baseline": m["skill_vs_era_baseline"],
                      "missing_seasons": len(m["missing_seasons"]),
                      "partial_seasons": len(m["partial_seasons"])})
        print("%-8s %s..%s  %5d matches  %3d seasons  %3d clubs  "
              "ll %.5f  base %.5f  skill %+.4f"
              % (c, m["seasons"][0], m["seasons"][1], m["matches"],
                 m["season_count"], m["clubs"], m["log_loss"],
                 m["baseline_log_loss"], m["skill_vs_era_baseline"]))
        for ms in m["missing_seasons"]:
            print("         missing %s  %s" % (ms["season"], ms["reason"]))
        for gs in m["grouped_seasons"]:
            print("         grouped %s  %d clubs  %s" % (gs["season"], gs["clubs"], gs["reason"]))
        for ps in m["partial_seasons"]:
            print("         partial %s  %d/%d  %s" % (ps["season"], ps["played"],
                                                      ps["expected"], ps["reason"]))
        top = p["best"][0]
        print("         best season: %s %s  surplus %+.2f" % (top["club"], top["season"], top["surplus"]))

    if not a.write:
        print("\n--dry: nothing written")
        return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for c, p in payloads.items():
        fp = os.path.join(OUT_DIR, "%s.json" % c)
        with open(fp, "w", encoding="utf-8") as fh:
            json.dump(p, fh, separators=(",", ":"))
        print("wrote %s (%.0f KB)" % (fp, os.path.getsize(fp) / 1024))
    ip = os.path.join(OUT_DIR, "index.json")
    with open(ip, "w", encoding="utf-8") as fh:
        json.dump({"_meta": {"asOf": SOURCE_AS_OF,
                             "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "source_credit": SOURCE_CREDIT},
                   "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "source_credit": SOURCE_CREDIT, "countries": index}, fh,
                  separators=(",", ":"))
    print("wrote %s" % ip)
    return 0


if __name__ == "__main__":
    sys.exit(main())
