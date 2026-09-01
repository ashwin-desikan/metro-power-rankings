import json, math, time, os, pickle, urllib.request
from collections import defaultdict

BASE = "https://nmprqkmymrdknffwnuur.supabase.co/rest/v1"
key = None
with open(r"C:\Users\ashwi\Desktop\Projects\Metro Area Project\.env.local") as f:
    for line in f:
        if line.startswith("SUPABASE_SERVICE_KEY="):
            key = line.strip().split("=", 1)[1]
HEAD = {"apikey": key, "Authorization": "Bearer " + key,
        "Content-Type": "application/json", "Prefer": "return=minimal"}

def fetch(path, page=1000):
    rows, off = [], 0
    while True:
        req = urllib.request.Request(BASE + path + "&limit=%d&offset=%d" % (page, off), headers=HEAD)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    batch = json.loads(r.read().decode("utf-8"))
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(3 * (attempt + 1))
        rows += batch
        if len(batch) < page:
            return rows
        off += page

CACHE = r"C:\Users\ashwi\AppData\Local\Temp\clubgames_gs_cache.pkl"
if os.path.exists(CACHE):
    with open(CACHE, "rb") as fh:
        M, E = pickle.load(fh)
    print("cache loaded", flush=True)
else:
    print("fetching...", flush=True)
    M = fetch("/football_matches?select=id,match_date,season,comp_key,home_cur_name,away_cur_name,"
              "hg,ag,neutral,is_league,is_european,level,exclude,round,leg,pens,tiebreaker&order=id")
    E = fetch("/football_elo?select=match_id,home_pre,away_pre,home_post,away_post,p_home,p_draw,p_away&order=match_id")
    with open(CACHE, "wb") as fh:
        pickle.dump((M, E), fh)
    print("cache saved", flush=True)
EL = {e["match_id"]: e for e in E}
print("matches:", len(M), "elo:", len(EL), flush=True)

def cycle_of(date):
    y, mo = int(date[:4]), int(date[5:7])
    return y if mo >= 7 else y - 1

# standings pairs (club, season-END-year) from the elo cache: table-level evidence
with open(r"C:\Users\ashwi\AppData\Local\Temp\clubgames_elo_cache.pkl", "rb") as fh:
    _c, _cc, _u, _m = pickle.load(fh)
STAND = set((r["cur_name"], int(r["year"])) for r in _cc if r["cur_name"])
_latest = {}
for r in _cc:
    if r["cur_name"] and (r["cur_name"] not in _latest or int(r["year"]) > _latest[r["cur_name"]][1]):
        _latest[r["cur_name"]] = (r["country"], int(r["year"]))
CLUB_CTRY = {k: v[0] for k, v in _latest.items()}
del _c, _cc, _u, _m, _latest
print("standings pairs:", len(STAND), "club countries:", len(CLUB_CTRY), flush=True)

UEFA = {"eur|european-cup", "eur|champions-league", "eur|uefa-cup", "eur|europa-league",
        "eur|cup-winners-cup", "eur|inter-cities-fairs-cup", "eur|europa-conference-league"}
COMP_W = {"eur|european-cup": 1.0, "eur|champions-league": 1.0, "eur|uefa-cup": 0.80,
          "eur|europa-league": 0.80, "eur|cup-winners-cup": 0.78,
          "eur|inter-cities-fairs-cup": 0.70, "eur|europa-conference-league": 0.60}

# WP5 (ruled 2026-08-31): ten major domestic cups score. Main cups 0.78 (an FA
# Cup final can outrank any league match but never a European final); league
# cups 0.60. The n-a| shadow keys, supercups, FA Trophy/EFL Trophy and the
# finals-only small-country set stay OUT.
CUP_W = {"england|fa-cup": 0.78, "spain|copa-del-rey": 0.78, "italy|coppa-italia": 0.78,
         "germany|dfb-pokal": 0.78, "france|coupe-de-france": 0.78,
         "scotland|scottish-cup": 0.78, "netherlands|knvb-beker": 0.78,
         "portugal|taca-de-portugal": 0.78,
         "england|league-cup": 0.60, "scotland|scottish-league-cup": 0.60}
CUPS = set(CUP_W)

def cup_round_w(rd):
    """Domestic cup round weights. Numbered rounds are shallow in every comp
    here except the Coupe de France, whose numbered rounds are the regional
    preliminaries below the Round of 64."""
    s = (rd or "").lower()
    if "qualif" in s or "prelim" in s:
        return 0.10
    if ("final" in s) and not any(k in s for k in ("semi", "semf", "quarter", "eighth", "16", "32", "64")):
        return 1.00
    if "semi" in s or "semf" in s:
        return 0.85
    if "quarter" in s:
        return 0.70
    if "round of 16" in s or "sixth round" in s or "round 6" in s:
        return 0.55
    if "fifth round" in s or "round 5" in s:
        return 0.48
    if "fourth round" in s or "round 4" in s:
        return 0.40
    if "third round" in s or "round 3" in s:
        return 0.34
    if "round of 32" in s:
        return 0.30
    if "second round" in s or "round 2" in s:
        return 0.26
    if "first round" in s or "round 1" in s or "round of 64" in s:
        return 0.22
    if "seventh round" in s or "eighth round" in s or "ninth round" in s:
        return 0.18
    if "group" in s or "sectional" in s:
        return 0.20
    RW_UNKNOWN["CUP:" + s] += 1
    return 0.30

rated = []
for m in M:
    if m["comp_key"] in UEFA and m["is_european"]:
        rated.append(m)  # UEFA rows rate regardless of the workbook Exclude flag
    elif m["comp_key"] in CUPS:
        rated.append(m)  # WP5: major domestic cups score regardless of Exclude
    elif m["exclude"]:
        continue
    elif m["is_league"] and (m["level"] == 1 or m["level"] is None):
        if m["comp_key"].split("|")[0] in ("russia", "soviet-union", "ussr", "cis"):
            continue  # ruled 2026-08-31: Russian/Soviet league matches do not score
        tail = m["comp_key"].split("|")[-1]
        if "playoff" in tail or "nacompetitie" in tail:
            continue  # ruled 2026-08-31: post-season playoff rounds stored as
            # level-1 "league" comps (nacompetitie, reg/CL/EL playoffs) are
            # cup-shaped, not league play — out of the scored universe
            # (still Elo-rated, same treatment as Russian league rows)
        rated.append(m)
rated.sort(key=lambda m: (m["match_date"], m["id"]))
print("universe:", len(rated), flush=True)

def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))

RW_UNKNOWN = defaultdict(int)
def round_w(rd):
    s = (rd or "").lower()
    if "qualif" in s or "prelim" in s or "intertoto" in s:
        return 0.20
    if ("final" in s) and not any(k in s for k in ("semi", "quarter", "play", "eighth", "16", "32")):
        return 1.00
    if "semi" in s:
        return 0.85
    if "quarter" in s:
        return 0.70
    if "16" in s or "eighth" in s:
        return 0.55
    if "32" in s or "play" in s or "knockout" in s:
        return 0.50
    if "fourth round" in s:
        return 0.60
    if "third round" in s:
        return 0.55
    if "second round" in s:
        return 0.50
    if "first round" in s:
        return 0.42
    if "group" in s or "league phase" in s or "league stage" in s or "matchday" in s:
        return 0.45
    RW_UNKNOWN[s] += 1
    return 0.45

# leg-1 lookup for aggregate context on second legs (UEFA + two-legged cup
# rounds, e.g. Coppa Italia finals through the 1990s)
leg1 = {}
for m in rated:
    if (m["comp_key"] in UEFA or m["comp_key"] in CUPS) and m.get("leg") == 1:
        k = (m["comp_key"], m["season"], m["round"],
             frozenset((m["home_cur_name"], m["away_cur_name"])))
        leg1[k] = m

def agg_context(m):
    """Returns (aggregate margin from m-home perspective, overturned deficit,
    leg-1 margin from m-home perspective) or None."""
    if (m["comp_key"] not in UEFA and m["comp_key"] not in CUPS) or m.get("leg") != 2:
        return None
    k = (m["comp_key"], m["season"], m["round"],
         frozenset((m["home_cur_name"], m["away_cur_name"])))
    l1 = leg1.get(k)
    if not l1:
        return None
    if l1["home_cur_name"] == m["home_cur_name"]:
        h1, a1 = l1["hg"], l1["ag"]
    else:
        h1, a1 = l1["ag"], l1["hg"]
    h_agg, a_agg = m["hg"] + h1, m["ag"] + a1
    am = h_agg - a_agg
    over = 0
    if am > 0 and a1 - h1 >= 2:
        over = a1 - h1
    elif am < 0 and h1 - a1 >= 2:
        over = h1 - a1
    return am, over, h1 - a1

# Empirical tie-overturn table, measured from the spine itself: P(leg-2 home
# side advances | leg-1 margin from their perspective). This is what prices
# the remontada: the MATCH was no upset, the TIE was a 2-in-100 event.
ADV = defaultdict(lambda: [0, 0])
for _m in rated:
    _a = agg_context(_m)
    if _a is None or _a[0] == 0:
        continue
    _b = max(-4, min(4, _a[2]))
    ADV[_b][1] += 1
    ADV[_b][0] += 1 if _a[0] > 0 else 0
print("tie-overturn table:", {b: (v[0], v[1]) for b, v in sorted(ADV.items())}, flush=True)

def closeness(m, agg):
    hg, ag = m["hg"], m["ag"]
    tot = hg + ag
    tb = (m.get("tiebreaker") or "").lower()
    pens = bool(m.get("pens")) or "pen" in tb or "shootout" in tb
    eff = abs(hg - ag)
    comeback = 0.0
    agg_level = False
    if agg is not None:
        am, over, _m1 = agg
        eff = abs(am)
        agg_level = (am == 0)
        if over >= 2:
            comeback = 0.06 + 0.02 * min(over - 1, 3)
    if pens:
        cl = 0.90 + 0.02 * min(tot, 5)  # shootout: eventfulness still separates Istanbul from a 0-0
    elif agg_level:
        cl = 0.91 + 0.015 * min(tot, 6)  # tie level after 180 min, settled by away goals or replay
    elif eff == 0:
        cl = 0.40 + 0.075 * min(tot, 6)  # league draw: 0-0 dull, 3-3 great
    else:
        base = {1: 0.88, 2: 0.55, 3: 0.30, 4: 0.15}.get(eff, 0.05)
        cl = base + 0.02 * min(tot, 8)
    if "extra" in tb or "aet" in tb or "a.e.t" in tb:
        cl = max(cl, 0.92)
    return clamp(cl + comeback)

# ---- league stakes: live table recomputed at matchday (match points: W=1, D=0.5) ----
totals = defaultdict(lambda: defaultdict(int))
date_counts = defaultdict(int)
for m in rated:
    if not (m["comp_key"] in UEFA or m["comp_key"] in CUPS):
        k = (m["comp_key"], m["season"])
        totals[k][m["home_cur_name"]] += 1
        totals[k][m["away_cur_name"]] += 1
        date_counts[(k, m["match_date"])] += 1

# PLACEHOLDER-DATE CLUSTERS (fix for the French 1930s flood on the decade
# boards): a date holding more than nt/2 matches of one league season is a
# placeholder (a real day holds at most one full round) — France 1933-38
# carries WHOLE SEASONS on one stamped date. Without real dates a match's
# position in the season is unknown, so no run-in urgency and no deciders
# can honestly be claimed: league stakes are zeroed for those rows while
# closeness/quality/upset still score.
PLACEHOLDER = set()
for (k, d), n in date_counts.items():
    if n > len(totals[k]) // 2:
        PLACEHOLDER.add((k, d))
print("placeholder date-clusters:", len(PLACEHOLDER), "| rows:",
      sum(n for (k, d), n in date_counts.items() if (k, d) in PLACEHOLDER), flush=True)

# RIVALRY STAKES FLOOR (ruled 2026-08-31, following the CFB precedent where
# rivalry is an input to the workbook's own Game Score): a league match
# between a curated rivalry pair never has stakes below 0.25 (0.32 for the
# top tier) — bragging rights are stakes, just small ones next to a title.
# Cups need no floor (the round already provides structural stakes). Applied
# AFTER the fragment/placeholder overrides: a derby is a derby even in a
# season the table cannot sequence.
RIV = {}
with open(r"C:\Users\ashwi\Desktop\Projects\Metro Area Project\public\data\rivalries.json", encoding="utf-8") as fh:
    _rv = json.load(fh)
for _r in _rv.get("all", []):
    if _r.get("sport") == "Football":
        _pk = frozenset((_r["team"]["name"], _r["rival"]["name"]))
        if len(_pk) == 2:
            prev = RIV.get(_pk)
            RIV[_pk] = (_r["rivalry"], bool(_r.get("top")) or (prev[1] if prev else False))
print("rivalry pairs loaded:", len(RIV), flush=True)
RIV_FLOORED = [0]
RIV_MATCHED = set()

tables = {}
FRAGMENTS = set()

# SEASON-LENGTH NORMS (fix for Heracles 1-0 Ajax, 23 Feb 2020: the COVID-
# abandoned 2019-20 Eredivisie sits in the spine as ~26 rounds, so late
# February read as the run-in of a 26-game season). For each (comp, league
# size) the norm is the median full schedule across its seasons; a season
# short of its norm is treated as having those rounds still to play, which
# is also the correct ex-ante view: in Feb 2020 the season was 34 rounds.
import statistics
_comp_group = defaultdict(list)
for _k, _tgv in totals.items():
    if _tgv:
        _comp_group[(_k[0], len(_tgv))].append(max(_tgv.values()))
SEASON_NORM = {}
for _k, _tgv in totals.items():
    if _tgv:
        SEASON_NORM[_k] = statistics.median(_comp_group[(_k[0], len(_tgv))])
TRUNCATED = sorted(k for k in totals
                   if totals[k] and max(totals[k].values()) < SEASON_NORM.get(k, 0) - 2)
print("truncated seasons (scored vs league norm):", len(TRUNCATED), flush=True)
for _t in TRUNCATED[:20]:
    print("  TRUNCATED", _t, "max", max(totals[_t].values()), "norm", SEASON_NORM[_t], flush=True)

def league_stakes(m):
    """Returns (stakes, decider, knife). The table tracks wins/draws separately
    so title-liveness is judged under BOTH scoring conventions (2-pt and 3-pt
    equivalents): a race sealed under either is over, whatever match points
    say. This kills the false deciders (Man Utd v Chelsea, 24 Apr 2000: an mp
    gap of 4.0 with rivals able to reach exactly level read as a live clinch
    while the real 3-pt race had been dead for weeks)."""
    k = (m["comp_key"], m["season"])
    if k not in tables:
        tables[k] = {c: [0, 0, 0, 0, 0] for c in totals[k]}  # w, d, played, gd, gf
    T = tables[k]
    h, a = m["home_cur_name"], m["away_cur_name"]
    tg = totals[k]
    nt = len(T)

    def p2(v):
        return v[0] + 0.5 * v[1]

    def p3(v):
        return 1.5 * v[0] + 0.5 * v[1]

    l2 = max(p2(v) for v in T.values())
    l3 = max(p3(v) for v in T.values())
    vals2 = sorted((p2(v) for v in T.values()), reverse=True)
    vals3 = sorted((p3(v) for v in T.values()), reverse=True)
    rel = max(2, round(nt * 0.15))
    drop_line = vals2[nt - rel] if nt - rel < len(vals2) else 0.0

    # CONTESTED-RACE GATE (fix for the Mainz-Bayern 2021 / SPAL-Juventus 2019
    # false deciders): mathematical liveness is not contention. A clinch or
    # title H2H counts as a decider only when the top two are separated by
    # less than 1.5 wins under BOTH conventions, i.e. the race is one bad
    # weekend from flipping. A runaway leader's failed clinch day decides
    # nothing and falls through to the continuous contention producer.
    gap2 = (vals2[0] - vals2[1]) if len(vals2) >= 2 else 0.0
    gap3 = (vals3[0] - vals3[1]) if len(vals3) >= 2 else 0.0
    contested = gap2 < 1.5 and gap3 < 2.25

    # SEASON-FRAGMENT GATE (fix for Blackpool 2-1 Wolves, 2 Sep 1939: the
    # abandoned 1939-40 First Division sits in the spine as a 3-match stub,
    # so "3 of 3 played" read as a title-deciding final day). A season whose
    # fullest club schedule is below a single round robin is a fragment:
    # its table is real but its truncation point is not a season's end, so
    # it produces NO league stakes and no deciders.
    fragment = (max(tg.values(), default=0) < nt - 1)
    if fragment:
        FRAGMENTS.add(k)

    # expected schedule length: a season short of its league's norm (COVID
    # abandonments, expunged seasons) keeps its missing rounds as still to
    # play, so its truncation point never masquerades as a run-in
    exp_len = max(max(tg.values(), default=0), SEASON_NORM.get(k, 0))

    def etot(c):
        return max(tg[c], exp_len)

    def reach(c, pfun, wgain):
        return max((pfun(v) + wgain * (etot(c2) - v[2]) for c2, v in T.items() if c2 != c),
                   default=0.0)

    def live(pfun, wgain, lead):
        best = max(T, key=lambda c: pfun(T[c]))
        return reach(best, pfun, wgain) >= lead

    title_live = live(p2, 1.0, l2) and live(p3, 1.5, l3)

    def side(c):
        v = T[c]
        tot = max(etot(c), 1)
        left = tot - v[2]
        if left <= 0:
            return 0.0, 0.0, 1.0, False, 0
        ct = min(clamp(1.0 - (l2 - p2(v)) / (left + 0.5)),
                 clamp(1.0 - (l3 - p3(v)) / (1.5 * left + 0.75)))  # alive under BOTH conventions
        cr = clamp(1.0 - (p2(v) - drop_line) / left) if p2(v) - drop_line >= 0 else 1.0
        prog = v[2] / tot
        bo2, bo3 = reach(c, p2, 1.0), reach(c, p3, 1.5)
        clinch = contested and title_live and (p2(v) + 1.0 >= bo2) and (p2(v) <= bo2) \
            and (p3(v) + 1.5 >= bo3) and (p3(v) <= bo3)
        return ct, cr, prog, clinch, left

    ct_h, cr_h, pg_h, cl_h, lf_h = side(h)
    ct_a, cr_a, pg_a, cl_a, lf_a = side(a)
    urg = clamp(((pg_h + pg_a) / 2 - 0.5) / 0.5) ** 1.5
    st_title = urg * (0.6 * max(ct_h, ct_a) + 0.4 * min(ct_h, ct_a)) if title_live else 0.0
    h2h = contested and title_live and ct_h > 0.15 and ct_a > 0.15 and min(lf_h, lf_a) <= 3
    if cl_h or cl_a:
        st_title = max(st_title, 1.0)  # a title on the line today is the maximum a league offers
    if h2h:
        st_title = max(st_title, 0.95)
    decider = bool(cl_h or cl_a or h2h)

    # knife test: did the title sit one goal from flipping in THIS match?
    knife = False
    if decider and max(lf_h, lf_a) <= 1 and m["hg"] != m["ag"]:
        margin = abs(m["hg"] - m["ag"])
        wc = h if m["hg"] > m["ag"] else a
        if (cl_h and wc == h) or (cl_a and wc == a):
            # clinch by exactly one goal: a draw would have handed it elsewhere
            if margin == 1 and p2(T[wc]) + 0.5 < reach(wc, p2, 1.0):
                knife = True
        if h2h and not knife:
            # two-party final-day ordering on (mp, gd, gf): does trimming one
            # goal from the winner change who finishes ahead?
            def key(c, dmp, dgd, dgf):
                return (p2(T[c]) + dmp, T[c][3] + dgd, T[c][4] + dgf)
            wh = m["hg"] > m["ag"]
            gw, gl = (m["hg"], m["ag"]) if wh else (m["ag"], m["hg"])
            lc = a if wh else h
            actual = key(wc, 1.0, gw - gl, gw) > key(lc, 0.0, gl - gw, gl)
            if gw - 1 == gl:
                trimmed = key(wc, 0.5, 0, gw - 1) > key(lc, 0.5, 0, gl)
            else:
                trimmed = key(wc, 1.0, gw - 1 - gl, gw - 1) > key(lc, 0.0, gl - gw + 1, gl)
            if actual != trimmed:
                knife = True

    st_rel = urg * 0.8 * (0.6 * max(cr_h, cr_a) + 0.4 * min(cr_h, cr_a))
    st = 0.75 * clamp(max(st_title, st_rel))
    if fragment or (k, m["match_date"]) in PLACEHOLDER:
        st, decider, knife = 0.0, False, False
    # post-match update
    if m["hg"] > m["ag"]:
        T[h][0] += 1
    elif m["hg"] == m["ag"]:
        T[h][1] += 1
        T[a][1] += 1
    else:
        T[a][0] += 1
    T[h][2] += 1
    T[a][2] += 1
    T[h][3] += m["hg"] - m["ag"]
    T[a][3] += m["ag"] - m["hg"]
    T[h][4] += m["hg"]
    T[a][4] += m["ag"]
    return st, decider, knife

# ---- quality: rank-based (era-neutral), monthly rank snapshots from elo posts ----
ANCH = [(0, 1.02), (1, 1.00), (2, 0.90), (3, 0.78), (4, 0.62), (5, 0.45), (6, 0.30), (7, 0.16), (8, 0.06)]
def g_rank(rank):
    x = math.log2(max(rank, 1))
    if x >= 8:
        return 0.02
    for i in range(len(ANCH) - 1):
        x0, y0 = ANCH[i]
        x1, y1 = ANCH[i + 1]
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return 0.02

R = {}
NC = defaultdict(int)
RANK = {}
CRANK = {}
cur_month = None

def refresh_ranks():
    global RANK, CRANK
    order = sorted(R.items(), key=lambda x: -x[1])
    RANK = {c: i + 1 for i, (c, _) in enumerate(order)}
    per = defaultdict(list)
    for c, r in order:
        per[CLUB_CTRY.get(c, "OTHER")].append(c)
    CRANK = {c: i + 1 for cl in per.values() for i, c in enumerate(cl)}

def quality(m, e, decider=False):
    h, a = m["home_cur_name"], m["away_cur_name"]
    if m["match_date"] < "1955-07-01":
        # No cross-country matches exist before the European Cup, so a global
        # rank compares countries that never met: rank within country instead.
        rh, ra = CRANK.get(h, 99), CRANK.get(a, 99)
    else:
        rh, ra = RANK.get(h, 999), RANK.get(a, 999)
    if decider:
        # a title decider's drama belongs to the contender, not the opponent
        q_raw = 0.25 * g_rank(max(rh, ra)) + 0.75 * g_rank(min(rh, ra))
    else:
        q_raw = 0.55 * g_rank(max(rh, ra)) + 0.45 * (g_rank(rh) + g_rank(ra)) / 2
    ey = cycle_of(m["match_date"]) + 1
    def n_eff(c):
        n = NC[c]
        if (c, ey) in STAND or (c, ey - 1) in STAND:
            n = max(n, 25)  # a standings season is table-level evidence, never nothing
        elif m["comp_key"] == "eur|european-cup":
            n = max(n, 25)  # champions-only competition: participation certifies standing
        return n
    qfac = clamp((min(n_eff(h), n_eff(a)) - 10) / 40.0)
    return clamp(q_raw * qfac, 0.0, 1.05)

def upset(m, e, agg=None):
    if m["hg"] == m["ag"]:
        # a draw is only an upset when a heavy favourite is held
        u = clamp((max(e["p_home"], e["p_away"]) - 0.70) / 0.30)
    else:
        p = e["p_home"] if m["hg"] > m["ag"] else e["p_away"]
        u = clamp(((1.0 - p) - 0.55) / 0.40)
    # second legs: the match may be no upset while the TIE is a miracle —
    # price the aggregate outcome against the empirical overturn table
    if agg is not None and agg[0] != 0:
        b = max(-4, min(4, agg[2]))
        won, tot = ADV[b]
        if tot >= 30:
            p_home_adv = won / tot
            p_obs = p_home_adv if agg[0] > 0 else 1.0 - p_home_adv
            u = max(u, clamp(((1.0 - p_obs) - 0.55) / 0.40))
    return u

# ---- curated floor: classics whose greatness is historical rather than in the margin ----
# Floors are compressed INTO the natural fabric (top natural is ~94.0), so a
# classic is nudged past its neighbours, never teleported into a separate
# band above the whole distribution. Liverpool 4-0 Barcelona needs no floor
# any more: the tie-upset fix earned it 94.0 on the model's own terms.
FLOORS = {
    ("2005-05-25", frozenset(("AC Milan", "Liverpool"))): 95.0,           # Istanbul
    ("1999-05-26", frozenset(("Manchester United", "Bayern Munich"))): 94.5,  # Camp Nou
    ("1960-05-18", frozenset(("Real Madrid", "Eintracht Frankfurt"))): 94.2,  # Hampden 7-3
    ("2017-03-08", frozenset(("FC Barcelona", "Paris Saint-Germain"))): 92.5,  # remontada
    ("2012-05-13", frozenset(("Manchester City", "Queens Park Rangers"))): 91.5,  # Aguero 93:20
    ("1989-05-26", frozenset(("Liverpool", "Arsenal"))): 91.0,            # Anfield, it's up for grabs now
    ("2019-05-08", frozenset(("Ajax", "Tottenham Hotspur"))): 90.0,       # Moura 96'
    ("2022-05-04", frozenset(("Real Madrid", "Manchester City"))): 89.5,  # Rodrygo 90+1, 90+2
    ("1967-05-25", frozenset(("Celtic", "Internazionale"))): 89.2,        # Lisbon Lions end catenaccio
    ("1962-05-02", frozenset(("Benfica", "Real Madrid"))): 89.0,          # Amsterdam 5-3, Eusebio v Puskas
    ("2014-05-24", frozenset(("Real Madrid", "Atlético de Madrid"))): 88.5,  # Ramos 92:48
}
FLOOR_HIT = {}

# ---- main scoring pass ----
scored = []
no_elo = 0
for m in rated:
    e = EL.get(m["id"])
    mk = m["match_date"][:7]
    if mk != cur_month:
        refresh_ranks()
        cur_month = mk
    if e is None:
        no_elo += 1
        continue
    agg = agg_context(m)
    decider = knife = False
    if m["comp_key"] in UEFA:
        st = COMP_W[m["comp_key"]] * round_w(m.get("round"))
    elif m["comp_key"] in CUPS:
        st = CUP_W[m["comp_key"]] * cup_round_w(m.get("round"))
    else:
        st, decider, knife = league_stakes(m)
        _rv = RIV.get(frozenset((m["home_cur_name"], m["away_cur_name"])))
        if _rv:
            _fl = 0.32 if _rv[1] else 0.25
            if st < _fl:
                st = _fl
                RIV_FLOORED[0] += 1
            RIV_MATCHED.add(_rv[0])
    cl = closeness(m, agg)
    if knife:
        cl = max(cl, 0.95)  # the title sat one goal from flipping: closeness in the sense that mattered
    q = quality(m, e, decider)
    u = upset(m, e, agg)
    core = 0.34 * cl + 0.34 * st + 0.22 * q + 0.10 * u
    gs = 100.0 * core * (0.80 + 0.20 * cl)
    fk = (m["match_date"], frozenset((m["home_cur_name"], m["away_cur_name"])))
    fl = FLOORS.get(fk)
    floored = fl is not None and fl > gs
    base = gs
    if floored:
        FLOOR_HIT[fk] = (gs, fl)
        gs = fl
    scored.append((gs, cl, st, q, u, m, floored, base))
    h, a = m["home_cur_name"], m["away_cur_name"]
    R[h], R[a] = e["home_post"], e["away_post"]
    NC[h] += 1
    NC[a] += 1

print("scored:", len(scored), "no_elo:", no_elo, flush=True)
print("rivalry floor: %d rows raised | %d of %d rivalries matched a scored league match" %
      (RIV_FLOORED[0], len(RIV_MATCHED), len(RIV)), flush=True)
print("fragment seasons (zero league stakes):", len(FRAGMENTS), flush=True)
for fk in sorted(FRAGMENTS)[:25]:
    print("  FRAGMENT", fk, flush=True)
if RW_UNKNOWN:
    print("UNKNOWN round labels:", dict(sorted(RW_UNKNOWN.items(), key=lambda x: -x[1])[:15]), flush=True)

scored.sort(key=lambda x: -x[0])
def line(x):
    gs, cl, st, q, u, m, fl, _b = x
    return "%.1f%s  %s  %s %d-%d %s  [%s/%s]  cl=%.2f st=%.2f q=%.2f u=%.2f" % (
        gs, "*" if fl else "", m["match_date"], m["home_cur_name"], m["hg"], m["ag"], m["away_cur_name"],
        m["comp_key"].split("|")[1], (m.get("round") or "lg")[:18], cl, st, q, u)

print("\n=== FLOOR AUDIT (%d authored) ===" % len(FLOORS), flush=True)
hit_keys = set(FLOOR_HIT)
for fk, v in FLOORS.items():
    if fk in hit_keys:
        print("APPLIED %.0f (natural %.1f)  %s  %s" % (v, FLOOR_HIT[fk][0], fk[0], " v ".join(sorted(fk[1]))), flush=True)
    else:
        print("NOT MATCHED (check date/names): %s  %s" % (fk[0], " v ".join(sorted(fk[1]))), flush=True)

print("\n=== TOP 30 ALL-TIME ===", flush=True)
for x in scored[:30]:
    print(line(x), flush=True)

print("\n=== TOP 5 PER DECADE ===", flush=True)
bydec = defaultdict(list)
for x in scored:
    bydec[x[5]["match_date"][:3] + "0s"].append(x)
for d in sorted(bydec):
    for x in bydec[d][:5]:
        print(d, line(x), flush=True)

print("\n=== TOP 15 LEAGUE MATCHES ===", flush=True)
shown = 0
for x in scored:
    ck = x[5]["comp_key"]
    if ck not in UEFA and ck not in CUPS:
        print(line(x), flush=True)
        shown += 1
        if shown >= 15:
            break

print("\n=== 1930s LEAGUE TOP 8 (placeholder regression) ===", flush=True)
shown = 0
for x in scored:
    ck = x[5]["comp_key"]
    if ck not in UEFA and ck not in CUPS and x[5]["match_date"][:3] == "193":
        print(line(x), flush=True)
        shown += 1
        if shown >= 8:
            break

print("\n=== TOP 20 CUP MATCHES ===", flush=True)
shown = 0
for x in scored:
    if x[5]["comp_key"] in CUPS:
        print(line(x), flush=True)
        shown += 1
        if shown >= 20:
            break

CLASSICS = [
    ("1960-05-18", "Real Madrid", "Eintracht Frankfurt"),
    ("1989-05-26", "Liverpool", "Arsenal"),
    ("1999-05-26", "Manchester United", "Bayern Munich"),
    ("2005-05-25", "AC Milan", "Liverpool"),
    ("2012-05-13", "Manchester City", "Queens Park Rangers"),
    ("2017-03-08", "FC Barcelona", "Paris Saint-Germain"),
    ("2019-05-07", "Liverpool", "FC Barcelona"),
    ("2019-05-08", "Ajax", "Tottenham Hotspur"),
    ("2022-05-04", "Real Madrid", "Manchester City"),
    ("1967-05-25", "Celtic", "Internazionale"),
    ("2003-04-23", "Manchester United", "Real Madrid"),
    ("2004-04-07", "Deportivo de La Coruña", "AC Milan"),
    # WP5 cup classics
    ("2013-05-11", "Wigan Athletic", "Manchester City"),      # Watson 90+1, FA Cup final
    ("1973-05-05", "Sunderland", "Leeds United"),             # Second Division winners
    ("1988-05-14", "Milton Keynes Dons", "Liverpool"),        # Crazy Gang (workbook canon folds Wimbledon into MK Dons; era name displays Wimbledon)
    ("1953-05-02", "Blackpool", "Bolton Wanderers"),          # Matthews final 4-3
    ("2006-05-13", "Liverpool", "West Ham United"),           # Gerrard final, 3-3 + pens
    ("1972-02-05", "Hereford United", "Newcastle United"),    # Radford, R3 replay
    # contested-race gate regression: the two false deciders should be LOW,
    # the two real deciders should stay HIGH
    ("2021-04-24", "Mainz 05", "Bayern Munich"),              # formality clinch day, Bayern 10 clear
    ("2019-04-13", "SPAL", "Juventus"),                       # formality clinch day, Juve ~20 clear
    ("1999-05-16", "Manchester United", "Tottenham Hotspur"), # final-day decider, 1-pt lead
    ("1992-06-07", "CD Tenerife", "Real Madrid"),             # final-day flip, Real lose the title
    # season-fragment gate regression: abandoned 1939-40 stub rows must be LOW
    ("1939-09-02", "Blackpool", "Wolverhampton Wanderers"),
    ("1939-08-30", "Sunderland", "Huddersfield Town"),
    ("1939-08-28", "Stoke City", "Bolton Wanderers"),
    # season-length-norm regression: COVID-abandoned 2019-20 Eredivisie rows
    # must be LOW (Feb/Mar was mid-season against the 34-round norm)
    ("2020-02-23", "Heracles Almelo", "Ajax"),
    ("2020-03-01", "Ajax", "AZ Alkmaar"),
]
print("\n=== CLASSIC CHECKS (natural rank, no floor applied) ===", flush=True)
pos = {(x[5]["match_date"], frozenset((x[5]["home_cur_name"], x[5]["away_cur_name"]))): (i + 1, x)
       for i, x in enumerate(scored)}
for d, t1, t2 in CLASSICS:
    hit = pos.get((d, frozenset((t1, t2))))
    if hit:
        print("rank %6d  %s" % (hit[0], line(hit[1])), flush=True)
    else:
        print("NOT FOUND: %s %s v %s" % (d, t1, t2), flush=True)

# ---- post to football_gamescore ----
def rest(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=HEAD, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.status
        except Exception:
            if attempt == 4:
                raise
            time.sleep(4 * (attempt + 1))

rows = [{"match_id": m["id"], "gs": round(gs, 2), "closeness": round(cl, 3), "stakes": round(st, 3),
         "quality": round(qq, 3), "upset": round(uu, 3), "floored": fl, "base": round(b, 2)}
        for gs, cl, st, qq, uu, m, fl, b in scored]
print("deleting old football_gamescore...", flush=True)
print("delete status:", rest("DELETE", "/football_gamescore?match_id=gte.0"), flush=True)
print("posting %d rows..." % len(rows), flush=True)
for i in range(0, len(rows), 2000):
    rest("POST", "/football_gamescore", rows[i:i + 2000])
    if (i // 2000) % 30 == 0:
        print("posted through", i + 2000, flush=True)
print("post complete:", len(rows), flush=True)
