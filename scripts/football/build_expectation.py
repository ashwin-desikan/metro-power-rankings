#!/usr/bin/env python3
"""English top-flight expectation ledger: every match 1888-89 to date scored
against what was expected of it before kick-off.

    python scripts/football/build_expectation.py --self-test
    python scripts/football/build_expectation.py --dry
    python scripts/football/build_expectation.py --write

OUTPUT
  public/data/football/expectation/index.json   boards + meta
  public/data/football/expectation/clubs.json   per-club season series (the
                                                club-page line and sparkline)

SPINE
  data/football/eng-topflight.csv.gz  - AllFootball.xlsx Sheet1, tier 1,
      England, produced by scripts/football/extract_topflight.py. 100,446 rows
      / 50,223 matches / 1888-89 -> 2022-23.
      🔴 The tier-1 competition has had THREE names in this workbook:
      `Football League` (1888-89..1891-92), `First Division`, `Premier League`.
      Filtering on the last two silently starts the series in 1892 and drops
      578 matches. The build asserts all three are present.
  data/football/e0/E0-<season>.csv    - football-data.co.uk, 1993-94 onward.
      Supplies the seasons the workbook does not carry AND the market layer.

MODEL  (davidson-elo-v1)
  Three-way Davidson Elo: a single draw parameter nu, properly normalised, so
  P(H)+P(D)+P(A) = 1 by construction rather than by patching a two-way curve.
  K scaled by goal difference on the World Football Elo convention. Ratings
  regressed toward 1500 between seasons because promotion and relegation churn
  the pool every year.

  🔴 HOME ADVANTAGE AND DRAW PROPENSITY ARE ESTIMATED FROM A TRAILING WINDOW,
  never the season being predicted. Closed form for evenly matched sides:
      hfa = 400 * log10(H/A)      nu = D / sqrt(H*A)
  Everything the model uses at kick-off was available before kick-off. This is
  not a detail: home advantage has fallen from ~166 Elo points in 1900-01 to
  ~50 in 2025-26, so a single fitted constant is wrong in both directions and
  wrong by a lot.

  Hyper-parameters were fitted on the whole history by coordinate descent on
  log loss. NOTHING IS HELD OUT, exactly as on the NFL board, and the page
  says so.

GUARD
  Every season's league table is rebuilt from the matches and reconciled
  against the site's OWN England tier-1 hub standings (public/data/football/
  hub-*.json, 1959-60 on). A table this site already publishes is the only
  honest check on a table derived from a different source. The build REFUSES
  to write when a season mismatches unless --allow-known-bad is passed, which
  admits only the fixtures listed in KNOWN_BAD below.

  🔴 DO NOT REPAIR THE SPINE BY INFERENCE. The bad fixtures show a clean
  signature (both legs recorded at one ground) and it is tempting to flip the
  venue or swap the goals. That is the 2023-24 NFL spread incident again:
  inferring the transformation from the symptom was half right, and half right
  was wrong. Get the real results.
"""
import argparse, csv, gzip, io, json, math, os, sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPINE = os.path.join(ROOT, "data", "football", "eng-topflight.csv.gz")
E0_DIR = os.path.join(ROOT, "data", "football", "e0")
HUB_DIR = os.path.join(ROOT, "public", "data", "football")
CLUB_INDEX = os.path.join(ROOT, "public", "data", "football", "index.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")
OUT_DIR = os.path.join(ROOT, "public", "data", "football", "expectation")

TIER1_NAMES = ("Football League", "First Division", "Premier League")

# Fitted on the full history by coordinate descent on log loss.
PARAMS = dict(K=14.0, PHI=0.85, PROMO=1470.0, WINDOW=5, SHRINK=200,
              HFA0=130.0, NU0=0.72, NU_SCALE=1.05)

# football-data.co.uk short labels -> the workbook's club names. EXACT; the
# loader refuses on an unmapped label rather than guessing, because a wrong
# club silently rewrites a rating history that runs for 138 years.
E0_TO_CLUB = {
    "Arsenal": "Arsenal", "Aston Villa": "Aston Villa", "Barnsley": "Barnsley",
    "Birmingham": "Birmingham City", "Blackburn": "Blackburn Rovers",
    "Blackpool": "Blackpool", "Bolton": "Bolton Wanderers",
    "Bournemouth": "AFC Bournemouth", "Bradford": "Bradford City",
    "Brentford": "Brentford", "Brighton": "Brighton & Hove Albion",
    "Burnley": "Burnley", "Cardiff": "Cardiff City", "Charlton": "Charlton Athletic",
    "Chelsea": "Chelsea", "Coventry": "Coventry City", "Crystal Palace": "Crystal Palace",
    "Derby": "Derby County", "Everton": "Everton", "Fulham": "Fulham",
    "Huddersfield": "Huddersfield Town", "Hull": "Hull City", "Ipswich": "Ipswich Town",
    "Leeds": "Leeds United", "Leicester": "Leicester City", "Liverpool": "Liverpool",
    "Luton": "Luton Town", "Man City": "Manchester City", "Man United": "Manchester United",
    "Middlesbrough": "Middlesbrough", "Newcastle": "Newcastle United",
    "Norwich": "Norwich City", "Nott'm Forest": "Nottingham Forest",
    "Oldham": "Oldham Athletic", "Portsmouth": "Portsmouth", "QPR": "Queens Park Rangers",
    "Reading": "Reading", "Sheffield United": "Sheffield United",
    "Sheffield Weds": "Sheffield Wednesday", "Southampton": "Southampton",
    "Stoke": "Stoke City", "Sunderland": "Sunderland", "Swansea": "Swansea City",
    "Swindon": "Swindon Town", "Tottenham": "Tottenham Hotspur", "Watford": "Watford",
    "West Brom": "West Bromwich Albion", "West Ham": "West Ham United",
    "Wigan": "Wigan Athletic", "Wimbledon": "Wimbledon", "Wolves": "Wolverhampton Wanderers",
}

# Era name -> the club page that holds the record today. Only unambiguous
# renames. 🔴 `Wimbledon` is DELIBERATELY ABSENT: the workbook's own current-
# name column resolves it to Milton Keynes Dons, which would move 554 rows and
# fourteen top-flight seasons of London football to Milton Keynes. Whose record
# that is has never been settled and this build does not settle it - the era
# name renders unlinked, the way the NFL board leaves its merged wartime names
# unlinked. Ashwin rules or it stays unlinked.
ERA_TO_CURRENT = {
    "Newton Heath": "Manchester United",
    "Woolwich Arsenal": "Arsenal",
    "Small Heath": "Birmingham City",
    "Birmingham": "Birmingham City",
    "Leicester Fosse": "Leicester City",
}
ERA_UNLINKED = {"Wimbledon"}

# Fixtures the standings reconciliation implicates: both legs of the pairing
# are recorded at one ground, so one of them is the wrong way round. Listed as
# (season, club, club). NOT repaired here - see the module docstring.
KNOWN_BAD = [
    ("1961-62", "Arsenal", "Everton"), ("1964-65", "Aston Villa", "Manchester United"),
    ("1966-67", "Everton", "Sunderland"), ("1967-68", "Everton", "Fulham"),
    ("1968-69", "Leicester City", "Manchester United"),
    ("1969-70", "Arsenal", "Tottenham Hotspur"),
    ("1971-72", "Arsenal", "Tottenham Hotspur"), ("1972-73", "Arsenal", "Leeds United"),
    ("1975-76", "Manchester City", "Manchester United"),
    ("1976-77", "Everton", "Newcastle United"), ("1977-78", "Arsenal", "Derby County"),
    ("1978-79", "Nottingham Forest", "West Bromwich Albion"),
    ("1979-80", "Arsenal", "Middlesbrough"), ("1980-81", "Liverpool", "Manchester City"),
    ("1981-82", "Aston Villa", "Swansea City"), ("1981-82", "Middlesbrough", "Tottenham Hotspur"),
    ("1984-85", "Everton", "Luton Town"), ("1985-86", "Chelsea", "Watford"),
    ("1988-89", "Middlesbrough", "Norwich City"), ("1991-92", "Arsenal", "Southampton"),
]

# 🔴 POINTS DEDUCTIONS ARE NOT DATA ERRORS. The reconciliation separates two
# signatures on its own: a reversed fixture moves W/L/GF/GA together, a
# deduction moves POINTS ONLY. Every entry here was confirmed by that
# signature, and the table below is what makes those seasons reconcile.
# The boards keep the ON-THE-PITCH total, because that is the quantity the
# model predicts, and carry the deduction alongside it.
DEDUCTIONS = {
    ("1990-91", "Arsenal"): (2, "two points docked after the Old Trafford brawl"),
    ("1990-91", "Manchester United"): (1, "one point docked after the Old Trafford brawl"),
    ("1996-97", "Middlesbrough"): (3, "three points docked for failing to fulfil a fixture"),
    ("2009-10", "Portsmouth"): (9, "nine points docked in administration"),
    ("2023-24", "Everton"): (8, "eight points docked for profit and sustainability breaches"),
    ("2023-24", "Nottingham Forest"): (4, "four points docked for a profit and sustainability breach"),
}

# Fixtures whose scoreline is wrong by a goal but whose RESULT is right, so
# only GF/GA move and the table's shape survives. Milder than KNOWN_BAD and
# listed separately so the two are never confused.
KNOWN_SCORE_OFF = [
    ("1993-94", "Tottenham Hotspur", "West Ham United"),
    ("2004-05", "Aston Villa", "Manchester United"),
]

# 🔴 A SEASON THAT WAS ABANDONED IS NOT A SEASON. The 1939-40 First Division
# ran three matchdays before war was declared and the results were EXPUNGED
# from the record; the workbook still carries the 33 matches. Left in, every
# club that played those games gains a phantom season on its page (Liverpool
# read 112 where the site's own club index says 111), and the ratings absorb
# results that officially never happened.
#
# Detected, not hardcoded: a full double round-robin is n*(n-1) matches for n
# clubs, and every real season in this spine hits it exactly. Anything under a
# quarter of that is void. Anything BETWEEN the two is something we have not
# understood, and the build refuses rather than guessing which it is.
ABANDONED_FRACTION = 0.25
SUSPICIOUS_FRACTION = 0.90


def season_completeness(matches):
    """{season: (matches, clubs, expected_matches, fraction)}."""
    per = defaultdict(lambda: [0, set()])
    for m in matches:
        e = per[m["season"]]
        e[0] += 1
        e[1].add(m["home"])
        e[1].add(m["away"])
    out = {}
    for season, (n, clubs) in per.items():
        k = len(clubs)
        expected = k * (k - 1)
        out[season] = (n, k, expected, n / expected if expected else 0.0)
    return out


def drop_abandoned(matches):
    """Returns (kept, dropped_seasons, suspicious_seasons)."""
    comp = season_completeness(matches)
    void = {s for s, (_n, _k, _e, f) in comp.items() if f < ABANDONED_FRACTION}
    odd = sorted(s for s, (_n, _k, _e, f) in comp.items()
                 if ABANDONED_FRACTION <= f < SUSPICIOUS_FRACTION)
    kept = [m for m in matches if m["season"] not in void]
    return kept, sorted(void), odd


WIN_PTS = lambda season: 2 if int(season[:4]) <= 1980 else 3


# ---------------------------------------------------------------- loading

def read_spine(path=SPINE):
    """The workbook slice. Two rows per match; pair them and assert the pair."""
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    comps = {r["comp"] for r in rows}
    missing = [c for c in TIER1_NAMES if c not in comps]
    if missing:
        raise SystemExit("spine is missing tier-1 competition name(s): %r. The "
                         "top flight has had three names; dropping one silently "
                         "truncates the series." % missing)
    seen = defaultdict(list)
    for r in rows:
        seen[(int(r["year"]), int(r["month"]), int(r["day"]),
              tuple(sorted((r["team"], r["opp"]))))].append(r)
    out = []
    for key, pair in seen.items():
        if len(pair) != 2:
            raise SystemExit("match key %r has %d rows, expected 2" % (key, len(pair)))
        home = [p for p in pair if p["ha"] == "Home"]
        away = [p for p in pair if p["ha"] == "Away"]
        if len(home) != 1 or len(away) != 1:
            raise SystemExit("match key %r is not one home + one away row" % (key,))
        h, a = home[0], away[0]
        if int(h["gf"]) != int(a["ga"]) or int(h["ga"]) != int(a["gf"]):
            raise SystemExit("match key %r: the two rows disagree on the score" % (key,))
        out.append({"y": key[0], "m": key[1], "d": key[2], "season": h["season"],
                    "comp": h["comp"], "home": h["team"], "away": a["team"],
                    "hm": h["metro"], "am": a["metro"],
                    "hg": int(h["gf"]), "ag": int(h["ga"]), "src": "workbook"})
    return out


def devig(row):
    """Proportional de-vig of the best available 1X2 price, or None."""
    for cols in (("AvgH", "AvgD", "AvgA"), ("B365H", "B365D", "B365A"),
                 ("BFDH", "BFDD", "BFDA"), ("BWH", "BWD", "BWA")):
        try:
            o = [float(row[c]) for c in cols]
        except (KeyError, TypeError, ValueError):
            continue
        if min(o) <= 1.0:
            continue
        p = [1.0 / x for x in o]
        s = sum(p)
        return [round(x / s, 6) for x in p]
    return None


def _open_e0(path):
    """football-data's older seasons are not UTF-8 (stray 0xA0 in referee
    names). Try UTF-8 first, fall back to the Windows codepage the files were
    actually written in rather than mangling bytes with errors="replace"."""
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return io.StringIO(raw.decode(enc)), enc
        except UnicodeDecodeError:
            continue
    raise SystemExit("cannot decode %s" % path)


def read_e0(path, season):
    out = []
    fh, _enc = _open_e0(path)
    if True:
        for r in csv.DictReader(fh):
            if not r.get("HomeTeam") or not r.get("FTHG"):
                continue
            dd, mm, yy = r["Date"].strip().split("/")
            yy = int(yy)
            if yy < 100:
                yy += 2000 if yy < 80 else 1900
            for n in (r["HomeTeam"].strip(), r["AwayTeam"].strip()):
                if n not in E0_TO_CLUB:
                    raise SystemExit("unmapped football-data club %r in %s. Add it "
                                     "to E0_TO_CLUB; never let it fall through." % (n, path))
            out.append({"y": yy, "m": int(mm), "d": int(dd), "season": season,
                        "comp": "Premier League",
                        "home": E0_TO_CLUB[r["HomeTeam"].strip()],
                        "away": E0_TO_CLUB[r["AwayTeam"].strip()],
                        "hg": int(r["FTHG"]), "ag": int(r["FTAG"]),
                        "mkt": devig(r), "src": "football-data"})
    return out


def load_all():
    """Spine, extended by the E0 seasons the spine does not carry, plus a market
    probability on every E0 match the odds cover."""
    spine = read_spine()
    have = {m["season"] for m in spine}
    market = {}
    extra = []
    for fn in sorted(os.listdir(E0_DIR)) if os.path.isdir(E0_DIR) else []:
        if not fn.startswith("E0-") or not fn.endswith(".csv"):
            continue
        season = fn[3:-4]
        for m in read_e0(os.path.join(E0_DIR, fn), season):
            mk = m.pop("mkt")
            if mk:
                market[(m["y"], m["m"], m["d"], m["home"], m["away"])] = mk
            if season not in have:
                extra.append(m)
    M = spine + extra
    # metro is per row in the workbook and is ERA-CORRECT (Wimbledon's 554
    # top-flight rows all read London, not Milton Keynes). E0 rows carry none,
    # so they inherit the club's last known metro from the workbook.
    metro = {}
    for m in spine:
        metro[m["home"]] = m["hm"]
        metro[m["away"]] = m["am"]
    for m in M:
        m["hm"] = m.get("hm") or metro.get(m["home"], "")
        m["am"] = m.get("am") or metro.get(m["away"], "")
    blank = sorted({m["home"] for m in M if not m["hm"]} | {m["away"] for m in M if not m["am"]})
    if blank:
        raise SystemExit("clubs with no metro: %r" % blank)
    M.sort(key=lambda x: (x["y"], x["m"], x["d"], x["home"]))
    M, void, odd = drop_abandoned(M)
    if odd:
        raise SystemExit("REFUSING: season(s) %r are part-played but not clearly "
                         "abandoned. Decide what they are before shipping." % odd)
    return M, market, void


# ------------------------------------------------------------------ model

def gmul(diff):
    """K multiplier by goal difference (World Football Elo convention)."""
    d = abs(diff)
    if d <= 1:
        return 1.0
    if d == 2:
        return 1.5
    return (11.0 + d) / 8.0


def davidson(rh, ra, hfa, nu):
    h = 10.0 ** ((rh + hfa) / 400.0)
    a = 10.0 ** (ra / 400.0)
    g = math.sqrt(h * a)
    den = h + a + nu * g
    return h / den, nu * g / den, a / den


def trailing_params(seasons, agg, window, shrink, hfa0, nu0):
    """{season: (hfa, nu)} from the `window` seasons BEFORE it, shrunk toward a
    prior while the sample is thin. Nothing here sees the season it predicts."""
    out = {}
    for i, s in enumerate(seasons):
        h = d = a = 0
        for w in seasons[max(0, i - window):i]:
            c = agg[w]
            h += c[0]; d += c[1]; a += c[2]
        n = h + d + a
        if n < 200:
            out[s] = (hfa0, nu0)
            continue
        H, D, A = h / n, d / n, a / n
        hfa = 400.0 * math.log10(max(H, 1e-6) / max(A, 1e-6))
        nu = D / math.sqrt(max(H * A, 1e-9))
        k = n / (n + shrink)
        out[s] = (k * hfa + (1 - k) * hfa0, k * nu + (1 - k) * nu0)
    return out


def run(M, p=PARAMS):
    """Walk the history once. Returns (rows, season_params)."""
    seasons = sorted({m["season"] for m in M}, key=lambda s: int(s[:4]))
    agg = defaultdict(lambda: [0, 0, 0])
    for m in M:
        agg[m["season"]][0 if m["hg"] > m["ag"] else (1 if m["hg"] == m["ag"] else 2)] += 1
    par = trailing_params(seasons, agg, p["WINDOW"], p["SHRINK"], p["HFA0"], p["NU0"])
    R, prev, rows = {}, None, []
    for m in M:
        s = m["season"]
        if s != prev:
            if prev is not None:
                for t in list(R):
                    R[t] = 1500.0 + p["PHI"] * (R[t] - 1500.0)
            prev = s
        hfa, nu = par[s]
        nu *= p["NU_SCALE"]
        R.setdefault(m["home"], p["PROMO"])
        R.setdefault(m["away"], p["PROMO"])
        rh, ra = R[m["home"]], R[m["away"]]
        pH, pD, pA = davidson(rh, ra, hfa, nu)
        res = 1 if m["hg"] > m["ag"] else (0 if m["hg"] == m["ag"] else -1)
        rows.append({**m, "pH": pH, "pD": pD, "pA": pA, "rh": rh, "ra": ra,
                     "res": res, "hfa": hfa, "nu": nu})
        w = 1.0 if res == 1 else (0.5 if res == 0 else 0.0)
        delta = p["K"] * gmul(m["hg"] - m["ag"]) * (w - (pH + 0.5 * pD))
        R[m["home"]] += delta
        R[m["away"]] -= delta
    return rows, par


def brier3(pH, pD, pA, res):
    return ((pH - (res == 1)) ** 2 + (pD - (res == 0)) ** 2 + (pA - (res == -1)) ** 2)


# ------------------------------------------------------------ reconciliation

def league_tables(M):
    tab = defaultdict(lambda: defaultdict(int))
    for m in M:
        wp = WIN_PTS(m["season"])
        h, a = tab[(m["season"], m["home"])], tab[(m["season"], m["away"])]
        h["played"] += 1; a["played"] += 1
        h["gf"] += m["hg"]; h["ga"] += m["ag"]
        a["gf"] += m["ag"]; a["ga"] += m["hg"]
        if m["hg"] > m["ag"]:
            h["win"] += 1; a["lose"] += 1; h["points"] += wp
        elif m["hg"] < m["ag"]:
            a["win"] += 1; h["lose"] += 1; a["points"] += wp
        else:
            h["draw"] += 1; a["draw"] += 1; h["points"] += 1; a["points"] += 1
    for key, (pts, _why) in DEDUCTIONS.items():
        if key in tab:
            tab[key]["points"] -= pts
    return tab


def hub_standings():
    """England tier 1 from the site's own season hubs: the independent check."""
    out = {}
    for fn in sorted(os.listdir(HUB_DIR)):
        if not fn.startswith("hub-") or not fn.endswith(".json"):
            continue
        season = fn[4:-5]
        try:
            d = json.load(open(os.path.join(HUB_DIR, fn), encoding="utf-8"))
        except Exception:
            continue
        for lg in d.get("leagues", []):
            if lg.get("country") == "England" and lg.get("level") == 1:
                rows = [r for g in lg.get("groups", []) for r in g.get("rows", [])]
                if rows:
                    out[season] = rows
    return out


def reconcile(M):
    """Rebuild every table and diff it against the hubs. Returns
    (n_seasons, n_club_seasons, unmatched_names, [(season, club, field, hub, ours)])."""
    tab = league_tables(M)
    hubs = hub_standings()
    fields = ("played", "win", "draw", "lose", "gf", "ga", "points")
    unmatched, mism, checked, nseasons = [], [], 0, 0
    for season, rows in sorted(hubs.items()):
        if not any(k[0] == season for k in tab):
            continue
        nseasons += 1
        for row in rows:
            key = (season, row["name"])
            if key not in tab:
                unmatched.append(key)
                continue
            checked += 1
            for f in fields:
                if row.get(f) is None:
                    continue
                if int(row[f]) != int(tab[key][f]):
                    mism.append((season, row["name"], f, int(row[f]), int(tab[key][f])))
    return nseasons, checked, unmatched, mism


# --------------------------------------------------------------- club slugs

def club_index():
    """(cur_name -> slug, cur_name -> metro) for England, from the site's own
    club index: the same file /teams/football/[slug] and /rankings/[slug] read."""
    try:
        d = json.load(open(CLUB_INDEX, encoding="utf-8"))
    except Exception:
        return {}, {}
    slugs, metros = {}, {}
    for c in d.get("clubs", []):
        if c.get("country") != "England" or not c.get("slug"):
            continue
        slugs[c["cur_name"]] = c["slug"]
        if c.get("metro"):
            metros[c["cur_name"]] = c["metro"]
    return slugs, metros


def club_top_flight_counts():
    """slug -> the site's own count of top-flight seasons for that club."""
    try:
        d = json.load(open(CLUB_INDEX, encoding="utf-8"))
    except Exception:
        return {}
    return {c["slug"]: c["top_flight_seasons"] for c in d.get("clubs", [])
            if c.get("country") == "England" and c.get("slug")
            and isinstance(c.get("top_flight_seasons"), int)}


def season_count_drift(clubs, site_counts):
    """🔴 THE SECOND RECONCILIATION, and the one that pays for itself.

    The standings check only reaches back to 1959-60. This one covers every
    club for its whole life: the number of top-flight seasons we derived from
    the match log must equal the number the site already publishes on the club
    page. It is what caught the abandoned 1939-40 season - Liverpool read 112
    where the club page said 111, and the extra was three matches played
    before war was declared and then expunged.

    Returns [(slug, site_count, ours)] for every club that disagrees."""
    out = []
    for slug, entry in clubs.items():
        if slug.startswith("era:"):
            continue
        n = site_counts.get(slug)
        if n is None:
            continue
        if n != len(entry["seasons"]):
            out.append((slug, n, len(entry["seasons"])))
    return sorted(out)


def metro_index():
    """name -> slug for every metro the site actually publishes a page for."""
    try:
        d = json.load(open(METROS, encoding="utf-8"))
    except Exception:
        return {}
    rows = d["metros"] if isinstance(d, dict) and "metros" in d else d
    return {r["name"]: r["slug"] for r in rows if r.get("name") and r.get("slug")}


def slug_for(era_name, slugs):
    """The club page that holds this era name's record, or None.

    🔴 Never read the workbook's own current-name column for this. In 1992-93
    it resolves 44 opponents to `FC Wacker Innsbruck`, an Austrian club, and
    for Wimbledon it resolves to Milton Keynes Dons. An era name links only
    when the mapping is unambiguous."""
    if era_name in ERA_UNLINKED:
        return None
    return slugs.get(ERA_TO_CURRENT.get(era_name, era_name))


class MetroResolver:
    """🔴 ONE SITE, ONE ANSWER. The workbook's per-row metro is era-correct but
    it is NOT the site's vocabulary: it says Reading and Luton where every other
    page on the site says London, and Leeds, Bradford and Kirklees where the
    site publishes one Leeds-Bradford conurbation. Rolling the workbook's raw
    values up would put a metro board on /rankings that disagrees with the club
    page one click away.

    So: the site's own club index decides, and the workbook's era metro is the
    fallback for a club the index does not carry. That fallback is what keeps
    Wimbledon in London - the index has no `Wimbledon`, only Milton Keynes
    Dons, while the workbook's 554 Wimbledon rows all read London.

    Nothing is guessed. A metro that resolves to no published page is reported
    and rendered unlinked."""

    def __init__(self, club_metros, metro_slugs):
        self.club_metros = club_metros
        self.metro_slugs = metro_slugs
        self.unresolved = {}
        self.overridden = {}

    def name_for(self, era_club, era_metro):
        site = self.club_metros.get(ERA_TO_CURRENT.get(era_club, era_club))
        if site:
            if era_metro and site != era_metro:
                self.overridden.setdefault(era_metro, set()).add(site)
            return site
        return era_metro

    def slug_for(self, metro_name):
        if not metro_name:
            return None
        slug = self.metro_slugs.get(metro_name)
        if not slug:
            self.unresolved[metro_name] = self.unresolved.get(metro_name, 0) + 1
        return slug


# ------------------------------------------------------------------ boards

def build(rows, par, market, slugs, mr):
    seasons = sorted({r["season"] for r in rows}, key=lambda s: int(s[:4]))
    n = len(rows)
    ll = sum(-math.log(max(r["pH"] if r["res"] == 1 else r["pD"] if r["res"] == 0
                           else r["pA"], 1e-12)) for r in rows) / n
    br = sum(brier3(r["pH"], r["pD"], r["pA"], r["res"]) for r in rows) / n

    # club-seasons
    cs = {}
    for r in rows:
        wp = WIN_PTS(r["season"])
        for side in ("home", "away"):
            t = r[side]
            p_w = r["pH"] if side == "home" else r["pA"]
            won = (r["res"] == 1) == (side == "home") and r["res"] != 0
            drew = r["res"] == 0
            c = cs.setdefault((r["season"], t), {
                "season": r["season"], "club": t, "gp": 0, "w": 0, "d": 0, "l": 0,
                "pts": 0, "xpts": 0.0, "surplus": 0.0,
                "metro": mr.name_for(t, r["hm"] if side == "home" else r["am"])})
            c["gp"] += 1
            c["xpts"] += wp * p_w + 1.0 * r["pD"]
            c["pts"] += wp if won else (1 if drew else 0)
            c["w"] += 1 if won else 0
            c["d"] += 1 if drew else 0
            c["l"] += 0 if (won or drew) else 1
            c["surplus"] += (1.0 if won else 0.5 if drew else 0.0) - (p_w + 0.5 * r["pD"])

    def cs_row(c):
        ded = DEDUCTIONS.get((c["season"], c["club"]))
        extra = {"deduction": ded[0], "deduction_reason": ded[1]} if ded else {}
        return {**extra, "season": c["season"], "club": c["club"],
                "slug": slug_for(c["club"], slugs), "metro": c["metro"],
                "metro_slug": mr.slug_for(c["metro"]), "gp": c["gp"],
                "w": c["w"], "d": c["d"], "l": c["l"],
                "win_pts": WIN_PTS(c["season"]),
                "pts": c["pts"], "xpts": round(c["xpts"], 2),
                "diff": round(c["pts"] - c["xpts"], 2),
                "surplus": round(c["surplus"], 3)}

    ranked = sorted(cs.values(), key=lambda c: c["pts"] - c["xpts"], reverse=True)
    best = [cs_row(c) for c in ranked[:25]]
    worst = [cs_row(c) for c in ranked[-25:]][::-1]

    # upsets
    ups = []
    for r in rows:
        if r["res"] == 0:
            continue
        p = r["pH"] if r["res"] == 1 else r["pA"]
        win, lose = (r["home"], r["away"]) if r["res"] == 1 else (r["away"], r["home"])
        ups.append({"p_winner": round(p, 5), "season": r["season"],
                    "date": "%04d-%02d-%02d" % (r["y"], r["m"], r["d"]),
                    "home": r["home"], "away": r["away"],
                    "score": "%d-%d" % (r["hg"], r["ag"]),
                    "winner": win, "winner_slug": slug_for(win, slugs),
                    "loser": lose, "loser_slug": slug_for(lose, slugs),
                    "at_home": r["res"] == 1,
                    "metro": mr.name_for(r["home"], r["hm"]),
                    "metro_slug": mr.slug_for(mr.name_for(r["home"], r["hm"]))})
    ups.sort(key=lambda u: (u["p_winner"], u["date"]))
    upsets = ups[:30]

    # per season
    season_rows = []
    for s in seasons:
        rs = [r for r in rows if r["season"] == s]
        k = len(rs)
        h = sum(1 for r in rs if r["res"] == 1)
        d = sum(1 for r in rs if r["res"] == 0)
        mb, kb = [], []
        for r in rs:
            q = market.get((r["y"], r["m"], r["d"], r["home"], r["away"]))
            if not q:
                continue
            mb.append(brier3(r["pH"], r["pD"], r["pA"], r["res"]))
            kb.append(brier3(q[0], q[1], q[2], r["res"]))
        season_rows.append({
            "season": s, "matches": k,
            "home_win_pct": round(h / k, 4), "draw_pct": round(d / k, 4),
            "away_win_pct": round((k - h - d) / k, 4),
            "hfa": round(par[s][0], 1), "nu": round(par[s][1], 4),
            "model_brier": round(sum(brier3(r["pH"], r["pD"], r["pA"], r["res"]) for r in rs) / k, 4),
            "market_matches": len(mb),
            "market_model_brier": round(sum(mb) / len(mb), 4) if mb else None,
            "market_brier": round(sum(kb) / len(kb), 4) if kb else None,
        })

    # metro rollup, era-neutral. 🔴 Points are NOT summable across the history:
    # a win was worth two until 1980-81 and three after. Surplus is in match
    # points (win 1, draw 0.5), which every era shares.
    mm = defaultdict(lambda: {"surplus": 0.0, "club_matches": 0, "seasons": set(), "clubs": set()})
    for c in cs.values():
        e = mm[c["metro"]]
        e["surplus"] += c["surplus"]
        e["club_matches"] += c["gp"]
        e["seasons"].add(c["season"])
        e["clubs"].add(c["club"])
    metros = sorted(({"metro": k, "metro_slug": mr.slug_for(k),
                      "surplus": round(v["surplus"], 2),
                      "club_matches": v["club_matches"],
                      "seasons": len(v["seasons"]), "clubs": len(v["clubs"])}
                     for k, v in mm.items()),
                    key=lambda x: x["surplus"], reverse=True)

    # per club: the whole season series, for the club-page line + sparkline
    clubs = {}
    for c in sorted(cs.values(), key=lambda c: int(c["season"][:4])):
        row = cs_row(c)
        key = row["slug"] or ("era:" + c["club"])
        e = clubs.setdefault(key, {"slug": row["slug"], "names": [], "metro": c["metro"],
                                   "metro_slug": row["metro_slug"], "seasons": [],
                                   "total_surplus": 0.0, "club_matches": 0})
        if c["club"] not in e["names"]:
            e["names"].append(c["club"])
        e["seasons"].append({k: row[k] for k in
                             ("season", "club", "gp", "w", "d", "l", "win_pts", "pts", "xpts", "diff", "surplus")
                             } | ({"deduction": row["deduction"]} if "deduction" in row else {}))
        e["total_surplus"] += c["surplus"]
        e["club_matches"] += c["gp"]
    for e in clubs.values():
        e["total_surplus"] = round(e["total_surplus"], 2)
        e["best"] = max(e["seasons"], key=lambda s: s["diff"])
        e["worst"] = min(e["seasons"], key=lambda s: s["diff"])

    # calibration, reported not asserted
    bins = defaultdict(lambda: [0, 0.0, 0])
    for r in rows:
        b = min(9, int(r["pH"] * 10))
        bins[b][0] += 1
        bins[b][1] += r["pH"]
        bins[b][2] += 1 if r["res"] == 1 else 0
    calib = [{"bin": "%.1f-%.1f" % (b / 10, (b + 1) / 10), "n": v[0],
              "predicted": round(v[1] / v[0], 4), "actual": round(v[2] / v[0], 4)}
             for b, v in sorted(bins.items())]

    # skill against an era baseline: the same trailing rates, no ratings
    base = {}
    for i, s in enumerate(seasons):
        h = d = a = 0
        for w in seasons[max(0, i - PARAMS["WINDOW"]):i]:
            row = next(x for x in season_rows if x["season"] == w)
            h += row["home_win_pct"] * row["matches"]
            d += row["draw_pct"] * row["matches"]
            a += row["away_win_pct"] * row["matches"]
        t = h + d + a
        base[s] = (h / t, d / t, a / t) if t >= 200 else (0.50, 0.25, 0.25)
    bll = sum(-math.log(max(base[r["season"]][0 if r["res"] == 1 else 1 if r["res"] == 0 else 2], 1e-12))
              for r in rows) / n

    return {
        "seasons": season_rows, "upsets": upsets, "best_seasons": best,
        "worst_seasons": worst, "metros": metros, "calibration": calib,
        "log_loss": round(ll, 5), "brier": round(br, 5),
        "baseline_log_loss": round(bll, 5),
        "skill_vs_era_baseline": round(1 - ll / bll, 4),
    }, clubs


# --------------------------------------------------------------- self-test

def self_test():
    """Pure decision logic, on the cases that actually bit in production."""
    ok = True

    def chk(name, cond):
        nonlocal ok
        print(("  PASS  " if cond else "  FAIL  ") + name)
        ok = ok and bool(cond)

    # Davidson normalises by construction; a two-way curve patched with a draw
    # term does not, which is why this model is Davidson.
    for rh, ra, hfa, nu in ((1500, 1500, 0, .7), (1800, 1200, 140, .6), (1200, 1900, -40, 1.2)):
        p = davidson(rh, ra, hfa, nu)
        chk("davidson sums to 1 (%d,%d,%d)" % (rh, ra, hfa), abs(sum(p) - 1) < 1e-12)
    chk("davidson: equal ratings, no hfa -> pH == pA", abs(davidson(1500, 1500, 0, .7)[0] - davidson(1500, 1500, 0, .7)[2]) < 1e-12)
    chk("davidson: home advantage raises pH", davidson(1500, 1500, 100, .7)[0] > davidson(1500, 1500, 0, .7)[0])
    chk("davidson: more nu -> more draws", davidson(1500, 1500, 0, 1.4)[1] > davidson(1500, 1500, 0, .7)[1])

    chk("gmul: 1 goal == 2 goals is false", gmul(1) != gmul(2))
    chk("gmul: symmetric in sign", gmul(3) == gmul(-3))
    chk("gmul: monotone", gmul(1) < gmul(2) < gmul(3) < gmul(6))

    # 🔴 the points system changed in 1981-82 and the tables must follow it
    chk("win worth 2 in 1980-81", WIN_PTS("1980-81") == 2)
    chk("win worth 3 in 1981-82", WIN_PTS("1981-82") == 3)
    chk("win worth 3 in 2025-26", WIN_PTS("2025-26") == 3)

    # trailing params never see the season they price
    seasons = ["1900-01", "1901-02", "1902-03"]
    agg = {"1900-01": [600, 100, 300], "1901-02": [600, 100, 300], "1902-03": [0, 1000, 0]}
    par = trailing_params(seasons, agg, 5, 0, 130.0, 0.72)
    chk("first season falls back to the prior", par["1900-01"] == (130.0, 0.72))
    chk("a season's own rates do not price it", par["1902-03"][1] < 1.0)
    chk("trailing hfa reads the window", par["1901-02"][0] > 100)

    # slug resolution
    slugs = {"Manchester United": "manchester-united", "Arsenal": "arsenal",
             "Milton Keynes Dons": "milton-keynes-dons", "Birmingham City": "birmingham-city"}
    chk("Newton Heath -> Manchester United", slug_for("Newton Heath", slugs) == "manchester-united")
    chk("Woolwich Arsenal -> Arsenal", slug_for("Woolwich Arsenal", slugs) == "arsenal")
    chk("Birmingham (era) -> Birmingham City", slug_for("Birmingham", slugs) == "birmingham-city")
    # 🔴 the one that matters: 554 rows of London football must not become Milton Keynes
    chk("Wimbledon stays UNLINKED", slug_for("Wimbledon", slugs) is None)
    chk("an unknown era name is unlinked, not guessed", slug_for("Accrington Stanley Reserves", slugs) is None)

    # 🔴 an abandoned season is not a season
    full = [{"season": "1938-39", "home": h, "away": a, "hg": 1, "ag": 0}
            for h in "ABCD" for a in "ABCD" if h != a]          # 4 clubs, 12 = 4*3
    # 1939-40 for real: 22 clubs, one matchday each, 33 of 462 fixtures.
    club = "ABCDEFGH"
    part = [{"season": "1939-40", "home": club[i], "away": club[i + 1], "hg": 1, "ag": 0}
            for i in range(0, 8, 2)]                            # 8 clubs, 4 of 56
    kept, void, odd = drop_abandoned(full + part)
    chk("a full season survives", "1938-39" not in void)
    chk("a 3-matchday season is dropped", void == ["1939-40"])
    chk("its matches go with it", len(kept) == 12)
    chk("nothing ambiguous is silently kept", odd == [])
    half = [{"season": "1950-51", "home": h, "away": a, "hg": 0, "ag": 0}
            for h, a in (("A", "B"), ("B", "A"), ("C", "D"), ("D", "C"), ("A", "C"), ("C", "A"))]
    _k, _v, odd2 = drop_abandoned(full + half)                   # 6 of 12 = 50%
    chk("a half-played season REFUSES instead of guessing", odd2 == ["1950-51"])

    clubs_stub = {"liverpool": {"seasons": [0] * 112}, "everton": {"seasons": [0] * 122},
                  "era:Wimbledon": {"seasons": [0] * 14}}
    chk("season-count drift is caught",
        season_count_drift(clubs_stub, {"liverpool": 111, "everton": 122}) == [("liverpool", 111, 112)])
    chk("an unlinked era entry is not compared",
        season_count_drift({"era:Wimbledon": {"seasons": [0] * 14}}, {"era:Wimbledon": 99}) == [])
    chk("a club the site does not count is skipped",
        season_count_drift(clubs_stub, {}) == [])

    # 🔴 a deduction is not a data error, and the table must apply it
    M = [{"season": "2023-24", "home": "Everton", "away": "Arsenal", "hg": 1, "ag": 0},
         {"season": "2023-24", "home": "Arsenal", "away": "Everton", "hg": 1, "ag": 0}]
    t = league_tables(M)
    chk("deduction applied to the table", t[("2023-24", "Everton")]["points"] == 3 - 8)
    chk("deduction leaves wins alone", t[("2023-24", "Everton")]["win"] == 1)
    chk("an undocked club is untouched", t[("2023-24", "Arsenal")]["points"] == 3)
    chk("the deduction table is documented", all(isinstance(v[1], str) and v[1] for v in DEDUCTIONS.values()))

    # 🔴 the site's vocabulary wins over the workbook's, except where the site
    # has no entry for the era club at all
    mr = MetroResolver({"Leeds United": "Leeds-Bradford", "Reading": "London",
                        "Manchester United": "Manchester"},
                       {"Leeds-Bradford": "leeds-bradford", "London": "london",
                        "Manchester": "Manchester".lower()})
    chk("site metro overrides the workbook's Leeds", mr.name_for("Leeds United", "Leeds") == "Leeds-Bradford")
    chk("site metro overrides the workbook's Reading", mr.name_for("Reading", "Reading") == "London")
    chk("an era rename resolves through the map", mr.name_for("Newton Heath", "Manchester") == "Manchester")
    chk("a club the site does not carry keeps its era metro",
        mr.name_for("Wimbledon", "London") == "London")
    chk("the override is recorded, not silent", "Leeds" in mr.overridden)
    chk("a published metro resolves", mr.slug_for("Leeds-Bradford") == "leeds-bradford")
    chk("an unpublished metro is unlinked, not slugified",
        mr.slug_for("Kirklees") is None and "Kirklees" in mr.unresolved)
    chk("no metro is None", mr.slug_for("") is None)

    # de-vig prefers the average price and normalises
    p = devig({"AvgH": "2.0", "AvgD": "4.0", "AvgA": "4.0"})
    chk("devig sums to 1", p and abs(sum(p) - 1) < 1e-9)
    chk("devig picks the favourite", p and p[0] > p[1])
    chk("devig on junk prices returns None", devig({"AvgH": "1.0", "AvgD": "0", "AvgA": ""}) is None)
    chk("devig falls back past a missing book", devig({"B365H": "2.0", "B365D": "4.0", "B365A": "4.0"}) is not None)

    # brier
    chk("brier of a certain correct call is 0", abs(brier3(1, 0, 0, 1)) < 1e-12)
    chk("brier of a certain wrong call is 2", abs(brier3(0, 0, 1, 1) - 2) < 1e-12)

    print("\nSELF-TEST %s" % ("PASSED" if ok else "FAILED"))
    return 0 if ok else 1


# -------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry", action="store_true", help="build and report, write nothing")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--allow-season-count-drift", action="store_true",
                    help="publish even though a club's season count disagrees with the club page")
    ap.add_argument("--allow-known-bad", action="store_true",
                    help="write even though the reconciliation flags the fixtures in KNOWN_BAD")
    a = ap.parse_args()
    if a.self_test:
        return self_test()

    M, market, void = load_all()
    seasons = sorted({m["season"] for m in M}, key=lambda s: int(s[:4]))
    print("spine: %d matches, %d seasons, %s -> %s" % (len(M), len(seasons), seasons[0], seasons[-1]))
    if void:
        print("abandoned season(s) dropped (results expunged, not a season): %s" % ", ".join(void))
    print("market: %d matches priced" % len(market))

    nseasons, checked, unmatched, mism = reconcile(M)
    bad_seasons = sorted({m[0] for m in mism})
    print("reconcile: %d seasons, %d club-seasons, %d unmatched names, %d mismatched cells"
          % (nseasons, checked, len(unmatched), len(mism)))
    if unmatched:
        print("  UNMATCHED: %r" % unmatched[:20])
    if mism:
        print("  seasons implicated: %s" % ", ".join(bad_seasons))
    known = {s for s, _, _ in KNOWN_BAD} | {s for s, _, _ in KNOWN_SCORE_OFF}
    unexpected = [s for s in bad_seasons if s not in known]
    if unmatched or unexpected:
        print("\nREFUSING: the reconciliation found something not in KNOWN_BAD (%r). "
              "Find the fixture before shipping; do not repair by inference." % unexpected)
        return 2
    if mism and not (a.allow_known_bad or a.dry):
        print("\nREFUSING: %d reversed fixtures and %d off-by-one scorelines are "
              "still in the spine. Re-run with --allow-known-bad to publish anyway."
              % (len(KNOWN_BAD), len(KNOWN_SCORE_OFF)))
        return 3

    rows, par = run(M)
    slugs, club_metros = club_index()
    mr = MetroResolver(club_metros, metro_index())
    boards, clubs = build(rows, par, market, slugs, mr)
    if mr.overridden:
        print("metro vocabulary: %d workbook name(s) resolved to the site's own: %s"
              % (len(mr.overridden), ", ".join("%s->%s" % (k, "/".join(sorted(v)))
                                               for k, v in sorted(mr.overridden.items()))))
    if mr.unresolved:
        print("🔴 metros with NO published page (rendered unlinked, not guessed): %s"
              % ", ".join("%s x%d" % kv for kv in sorted(mr.unresolved.items())))

    print("model: log loss %.5f  brier %.5f  skill vs era baseline %.2f%%"
          % (boards["log_loss"], boards["brier"], 100 * boards["skill_vs_era_baseline"]))
    print("home advantage: %s %.0f  ->  %s %.0f"
          % (seasons[0], par[seasons[0]][0], seasons[-1], par[seasons[-1]][0]))
    print("best season   : %s %s  %+.1f pts" % (boards["best_seasons"][0]["season"],
          boards["best_seasons"][0]["club"], boards["best_seasons"][0]["diff"]))
    print("worst season  : %s %s  %+.1f pts" % (boards["worst_seasons"][0]["season"],
          boards["worst_seasons"][0]["club"], boards["worst_seasons"][0]["diff"]))
    u = boards["upsets"][0]
    print("longest odds  : p=%.4f  %s %s %s (%s)" % (u["p_winner"], u["home"], u["score"], u["away"], u["season"]))
    print("clubs with a series: %d  (unlinked era entries: %d)"
          % (len(clubs), sum(1 for k in clubs if k.startswith("era:"))))

    site_counts = club_top_flight_counts()
    drift = season_count_drift(clubs, site_counts)
    print("club season counts: %d checked against the club pages, %d disagree"
          % (sum(1 for k in clubs if not k.startswith("era:") and k in site_counts), len(drift)))
    if drift:
        for slug, n, ours in drift[:20]:
            print("   %-26s club page %d, ours %d" % (slug, n, ours))
        if not (a.allow_season_count_drift or a.dry):
            print("\nREFUSING: the club pages and this ledger would show different "
                  "season counts for the same club. One site, one answer.")
            return 4

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": "davidson-elo-v1",
        "source": "AllFootball.xlsx (English tier 1) + football-data.co.uk E0",
        "seasons": [seasons[0], seasons[-1]],
        "season_count": len(seasons),
        "matches": len(M),
        "clubs": len({m["home"] for m in M} | {m["away"] for m in M}),
        "abandoned_seasons": void,
        "club_season_count_drift": [{"slug": d[0], "club_page": d[1], "ledger": d[2]} for d in drift],
        "params": PARAMS,
        "log_loss": boards["log_loss"],
        "brier": boards["brier"],
        "baseline_log_loss": boards["baseline_log_loss"],
        "skill_vs_era_baseline": boards["skill_vs_era_baseline"],
        "market_matches": len(market),
        "metro_unresolved": sorted(mr.unresolved),
        "metro_site_vocabulary": {k: sorted(v) for k, v in sorted(mr.overridden.items())},
        "market_seasons": sorted({s["season"] for s in boards["seasons"] if s["market_matches"]}),
        "reconciliation": {"seasons": nseasons, "club_seasons": checked,
                           "unmatched_names": len(unmatched),
                           "mismatched_cells": len(mism),
                           "seasons_implicated": bad_seasons,
                           "known_bad_fixtures": len(KNOWN_BAD)},
        "notes": ("Nothing is held out: the hyper-parameters were fitted on the "
                  "whole history. Home advantage and draw propensity come from a "
                  "trailing five-season window, so every number the model used at "
                  "kick-off was available before kick-off. The model has real skill "
                  "only from about 1960 on; before that, knowing the era's "
                  "home-draw-away split is almost as good as knowing the teams."),
    }
    index = {"meta": meta, "seasons": boards["seasons"], "upsets": boards["upsets"],
             "best_seasons": boards["best_seasons"], "worst_seasons": boards["worst_seasons"],
             "metros": boards["metros"], "calibration": boards["calibration"]}

    if a.dry or not a.write:
        print("\n--dry: nothing written. index %.0f KB, clubs %.0f KB"
              % (len(json.dumps(index)) / 1024, len(json.dumps(clubs)) / 1024))
        return 0
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, payload in (("index.json", index), ("clubs.json", {"meta": {"generated_at": meta["generated_at"]}, "clubs": clubs})):
        p = os.path.join(OUT_DIR, name)
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, separators=(",", ":"))
        print("wrote %s (%.0f KB)" % (p, os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
