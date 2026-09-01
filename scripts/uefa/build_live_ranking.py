#!/usr/bin/env python3
"""build_live_ranking.py - the Citizen of Nowhere club power ranking, IN SEASON.

scripts/uefa/build_season_hub.py produces this ranking for a COMPLETED season, but it
reads /tmp and /mnt paths and only runs inside a container. This script computes the same
ranking for the season in progress, natively, from Supabase, and writes
public/data/football/live-ranking-2026-27.json for the 2026-27 hub to ISR-read.

FORMULA (unchanged in shape from the archive hubs):
  score = 0.65*form + 0.35*pedigree + 0.11*current_coef - max(0, 0.5-winpct)*0.6 + trophies

THREE DELIBERATE DIFFERENCES FROM THE ARCHIVE, each because a season two weeks old is not
a season, and each removable later without touching the formula:

1. SHRINKAGE. The archive simply drops any club with fewer than 8 matches. In September
   that would leave only the spring-summer leagues (Norway, Sweden, Ireland and nine more
   are 17-29 games in while England is on 3), so the board would be a list of Scandinavian
   clubs called "the club power ranking". Instead every club is ranked and this season's
   form is blended toward the club's pedigree with weight w = mp/(mp+K).
   K = 8 is NOT a taste value: w crosses 0.5 at mp = K, so the blend reaches an even split
   exactly where the archive's own gate said a club became rankable. The same weight shrinks
   win percentage toward 0.5, so an 0-2 start does not draw the full losing-record penalty.
   A proper refit of K against 2025-26 needs PARTIAL standings for that season, which needs
   domestic match dates, which needs the domestic fixture ingest. Until that lands, K is
   derived rather than fitted, and this comment is the honest record of which.

2. DOMESTIC FORM IS STANDINGS-DERIVED (v0). The archive weights every result by that
   opponent's strength. football_fixtures carries the continental competitions, domestic
   cups and super cups, but domestic LEAGUES are standings-only, so a club's domestic
   contribution is (W + 0.5D) times the mean strength of the rest of its league, which is
   the same sum with the opponent set averaged instead of enumerated. European and cup
   matches DO get true per-match opponent and stage weighting. When the domestic fixture
   ingest lands, feed() takes those rows and this approximation disappears with no change
   to the formula.

3. SCALE. The archive normalises form by max(Q/MP) over clubs with MP>=8. Mid-season that
   pool is only the spring-summer leagues, whose opponents are weak, so their Q/MP is low
   and every big-league club would normalise to a form above 1. This uses the 95th
   percentile of Q/MP over clubs with MP>=3 instead: robust to a single runaway club, and
   drawn from all 52 leagues rather than 12. Both numbers are printed every run.

Modes:
  python build_live_ranking.py --self-test    offline unit tests of the scoring logic
  python build_live_ranking.py                dry run: compute from Supabase, print the board
  python build_live_ranking.py --write        also write the JSON the hub reads
"""
import os, sys, json, math, statistics, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
DATA = os.path.join(ROOT, "public", "data", "football")
OUT  = os.path.join(DATA, "live-ranking-2026-27.json")
COEF = os.path.join(DATA, "uefa-coefficients.json")

SEASON  = 2026            # api-football season key for 2026-27
LABEL   = "2026-27"
CUR     = "26/27"         # live club-coefficient season
PED     = ["22/23", "23/24", "24/25", "25/26"]   # completed seasons behind the current one
CYEAR   = 2026            # uefa_country_coeff_history year that seeds this season

W_FORM, W_PED, W_CUR, PEN = 0.65, 0.35, 0.11, 0.6
K_SHRINK     = 8.0        # w = mp/(mp+K); crosses 0.5 at the archive's MP>=8 gate
SCALE_PCTL   = 95         # percentile of Q/MP used as the form scale
SCALE_MIN_MP = 3          # clubs below this do not set the scale

TOP5    = {"England", "Spain", "Germany", "Italy", "France"}
LAB     = {"Czech Republic": "Czechia", "Turkey": "Türkiye"}
EUROIDS = {2: "CL", 3: "EL", 848: "ECL"}
USC_ID  = 531
DOMCUPS = {48, 137, 81, 97, 185, 90, 143, 45, 66, 181, 96, 65}
TROPHY  = {"CL": 0.12, "EL": 0.05, "ECL": 0.03, "USC": 0.04, "CUP": 0.015, "SUPER": 0.01}


def sm(comp, r):
    """Stage multiplier. Identical table to build_season_hub.py."""
    r = r or ""
    if comp == "CL":
        return {"Final": 1.5, "Semi-finals": 1.45, "Quarter-finals": 1.4,
                "Round of 16": 1.35, "Round of 32": 1.3}.get(r, 1.2 if r.startswith("League Stage") else 1.0)
    if comp == "EL":
        return 1.25 if r in ("Final", "Semi-finals", "Quarter-finals", "Round of 16") else (1.1 if r.startswith("League Stage") else 1.0)
    if comp == "ECL":
        return 1.15 if r in ("Final", "Semi-finals", "Quarter-finals", "Round of 16") else (1.05 if r.startswith("League Stage") else 1.0)
    return {"USC": 1.3}.get(comp, 1.0)


def shrink(mp, k=None):
    """Weight on THIS season's evidence. 0 at no matches, 0.5 at mp = K, ->1 thereafter."""
    k = K_SHRINK if k is None else k
    return mp / (mp + k) if mp > 0 else 0.0


def result_q(gf, ga):
    return 1.0 if gf > ga else 0.5 if gf == ga else 0.0


# ------------------------- Supabase -------------------------
def supa_key():
    for e in ("SUPABASE_WRITE_KEY", "SUPABASE_SERVICE_KEY"):
        if os.environ.get(e):
            return os.environ[e].strip()
    envf = os.path.join(ROOT, ".env.local")
    if os.path.exists(envf):
        for ln in open(envf, encoding="utf-8"):
            if ln.startswith("SUPABASE_SERVICE_KEY="):
                return ln.split("=", 1)[1].strip()
    sys.exit("No Supabase key")


def supa_get(path, key):
    rows, off = [], 0
    sep = "&" if "?" in path else "?"
    while True:
        req = urllib.request.Request(f"{SUPA}{path}{sep}limit=1000&offset={off}",
                                     headers={"apikey": key, "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=60) as r:
            b = json.load(r)
        rows += b
        if len(b) < 1000:
            return rows
        off += 1000


# ------------------------- scoring core (pure, unit-tested) -------------------------
def score_club(form, ped, cur, wp, tb, mp, k=None):
    """The one place the formula lives. form/ped/cur are already normalised to [0,1]-ish."""
    w = shrink(mp, k)
    form_s = w * form + (1 - w) * ped     # no evidence yet -> assume pedigree
    wp_s = w * wp + (1 - w) * 0.5         # and assume an even record
    return (W_FORM * form_s + W_PED * ped + W_CUR * cur
            - max(0.0, 0.5 - wp_s) * PEN + tb), w, form_s, wp_s


def rank_rows(rows, keyf):
    rows.sort(key=lambda c: -keyf(c))
    prev, rk = None, 0
    for i, c in enumerate(rows, 1):
        v = keyf(c)
        if v != prev:
            rk, prev = i, v
        c["rank"] = rk
    return rows


# ------------------------- build -------------------------
def build(key):
    coefdoc = json.load(open(COEF, encoding="utf-8"))
    UEFA = {c["country"] for c in coefdoc["countries"]}

    # 1. universe: UEFA level-1 domestic leagues with a 2026 table
    leagues = [l for l in supa_get("/rest/v1/football_league?select=league_id,country,name,level,comp_type,season", key)
               if l.get("level") == 1 and l.get("comp_type") == "domestic" and l.get("country") in UEFA]
    lmeta = {l["league_id"]: l for l in leagues}
    st = supa_get(f"/rest/v1/football_standings?select=league_id,team_id,played,win,draw,lose,rank,group_label&season=eq.{SEASON}", key)
    st = [r for r in st if r["league_id"] in lmeta]

    teams = {r["team_id"]: r for r in supa_get("/rest/v1/football_team?select=team_id,canonical_name,lookup_name,country,uefa_name", key)}
    look = supa_get("/rest/v1/football_lookup?select=uefa_name,uefa_name_2,uefa_name_3,cur_name,team,country,metro_area&uefa_name=not.is.null", key)

    # 2. country factor: sqrt(country 5yr coefficient / England's), from the seeding year
    crows = supa_get(f"/rest/v1/uefa_country_coeff_history?select=league,score,rank&year=eq.{CYEAR}", key)
    crow = {r["league"]: float(r["score"]) for r in crows}
    ENG = crow.get("England") or max(crow.values())
    def CF(c):
        v = crow.get(LAB.get(c, c), crow.get(c))
        return math.sqrt(v / ENG) if v else 0.0

    # 3. pedigree (four completed seasons) and the live current-season coefficient.
    #    Fold uefa_name_2/_3 aliases into the primary key, as build_season_hub.py does:
    #    a rebrand or transliteration otherwise splits one club's history in two.
    alias = {}
    for r in look:
        p = (r.get("uefa_name") or "").strip()
        for k2 in ("uefa_name_2", "uefa_name_3"):
            s = (r.get(k2) or "").strip()
            if p and s and s != p:
                alias[s] = p
    ped_raw = defaultdict(float)
    for r in supa_get("/rest/v1/uefa_club_coeff_history?select=uefa_name,season,points", key):
        if r["season"] in PED:
            ped_raw[alias.get(r["uefa_name"], r["uefa_name"])] += float(r["points"] or 0)
    cur_raw = defaultdict(float)
    for c in coefdoc["clubs"]:
        cur_raw[alias.get(c["uefa_name"], c["uefa_name"])] += float((c["seasons"] or {}).get(CUR) or 0)
    MAXP = max(ped_raw.values()) or 1.0
    MAXC = max(cur_raw.values()) or 1.0

    info = {}
    for r in look:
        u = (r.get("uefa_name") or "").strip()
        if u:
            info.setdefault(u, {"name": r.get("team") or r.get("cur_name"), "metro": r.get("metro_area")})

    def uname(tid):
        t = teams.get(tid) or {}
        u = (t.get("uefa_name") or "").strip()
        return alias.get(u, u)
    def pedN(tid):
        return ped_raw.get(uname(tid), 0.0) / MAXP
    def curN(tid):
        return cur_raw.get(uname(tid), 0.0) / MAXC

    # 4. the ranked universe, and each club's strength as an OPPONENT
    # api-football serves the SAME table twice under two group-label spellings in about a
    # dozen leagues (the defect lib/clubFootballLive.ts dedupes at read time): 785 standings
    # rows here are only 701 clubs. Keep the row with the MOST matches played, so a stale
    # copy under the second label can never be the one that counts.
    uni, byleague = {}, defaultdict(list)
    for r in st:
        tid = r["team_id"]
        prev = uni.get(tid)
        if prev and (prev["row"].get("played") or 0) >= (r.get("played") or 0):
            continue
        country = lmeta[r["league_id"]]["country"]
        uni[tid] = {"country": country, "league_id": r["league_id"], "row": r}
        if not prev:
            byleague[r["league_id"]].append(tid)
    def strength(tid):
        if tid not in uni:
            return 0.10
        return max(0.5 * CF(uni[tid]["country"]) + 0.5 * pedN(tid), 0.10)

    # mean opponent strength per league, used for the standings-derived domestic term
    lstr = {lid: (statistics.fmean([strength(t) for t in tids]) if tids else 0.10)
            for lid, tids in byleague.items()}

    agg = {t: {"MP": 0, "W": 0, "D": 0, "L": 0, "Q": 0.0, "MPe": 0} for t in uni}

    # 4a. domestic, from the table (v0: opponents averaged, not enumerated)
    for tid, u in uni.items():
        r = u["row"]
        mp, w, d, l = (r.get("played") or 0), (r.get("win") or 0), (r.get("draw") or 0), (r.get("lose") or 0)
        a = agg[tid]
        a["MP"] += mp; a["W"] += w; a["D"] += d; a["L"] += l
        a["Q"] += (w + 0.5 * d) * lstr[u["league_id"]]

    # 4b. European, domestic-cup and super-cup matches, with true per-match weighting
    fx = supa_get(f"/rest/v1/football_fixtures?select=league_id,round,home_team_id,away_team_id,home_goals,away_goals,kickoff,status&season=eq.{SEASON}", key)
    def comp_of(lid):
        if lid in EUROIDS: return EUROIDS[lid]
        if lid == USC_ID: return "USC"
        if lid in DOMCUPS: return "CUP"
        return None
    for f in fx:
        comp = comp_of(f["league_id"])
        if comp is None or f["home_goals"] is None or f["away_goals"] is None:
            continue
        m = sm(comp, f["round"])
        h, a2 = f["home_team_id"], f["away_team_id"]
        for me, opp, gf, ga in ((h, a2, f["home_goals"], f["away_goals"]),
                                (a2, h, f["away_goals"], f["home_goals"])):
            if me in agg:
                A = agg[me]
                A["MP"] += 1; A["MPe"] += 1
                A["W" if gf > ga else "L" if gf < ga else "D"] += 1
                A["Q"] += result_q(gf, ga) * strength(opp) * m

    # 5. trophies decided so far this season. The league bump is PROVISIONAL and follows the
    #    current leader week to week, exactly as build_season_hub.py does for a live season.
    TB = defaultdict(float)
    finals = defaultdict(list)
    for f in fx:
        if (f["round"] or "") == "Final" and f["home_goals"] is not None:
            finals[f["league_id"]].append(f)
    for lid, fs in finals.items():
        f = sorted(fs, key=lambda x: x.get("kickoff") or "")[-1]
        wid = f["home_team_id"] if f["home_goals"] >= f["away_goals"] else f["away_team_id"]
        comp = comp_of(lid)
        TB[wid] += TROPHY.get(comp if comp in TROPHY else "SUPER", TROPHY["SUPER"])
    groups = defaultdict(set)
    for r in st:
        groups[r["league_id"]].add(r.get("group_label") or "")
    for r in st:
        if r.get("rank") == 1 and len(groups[r["league_id"]]) == 1 and (r.get("played") or 0) > 0:
            TB[r["team_id"]] += 0.06 if lmeta[r["league_id"]]["country"] in TOP5 else 0.03

    # 6. scale, then score
    # The archive's rule is max(Q/MP) over MP>=8. Keep the MAX, lower the gate to 3: the 8-game
    # gate exists to stop a tiny sample setting the scale, and two things already do that here,
    # the shrinkage and the fact that Q is opponent-weighted (a two-win start in Malta scores
    # about 0.15, so it can never set the top of the scale). A percentile was tried first and
    # was worse: p95 over 693 clubs sits at 0.31 because most of the board is weak leagues, so
    # the elite normalised above 2.0 and the form term quietly outweighed its own 0.65 cap.
    rates = [a["Q"] / a["MP"] for a in agg.values() if a["MP"] >= SCALE_MIN_MP]
    scale = max(rates) if rates else 1.0
    pctl = statistics.quantiles(rates, n=100)[SCALE_PCTL - 1] if len(rates) > 20 else scale
    legacy_pool = [a["Q"] / a["MP"] for a in agg.values() if a["MP"] >= 8]
    legacy = max(legacy_pool) if legacy_pool else 0.0

    clubs = []
    for tid, a in agg.items():
        if a["MP"] < 1:
            continue
        t = teams.get(tid) or {}
        u = uname(tid)
        rate = a["Q"] / a["MP"]
        form = rate / scale if scale else 0.0
        ped, cur = pedN(tid), curN(tid)
        wp = (2 * a["W"] + a["D"]) / (2 * a["MP"])
        sc, w, form_s, wp_s = score_club(form, ped, cur, wp, TB.get(tid, 0.0), a["MP"])
        clubs.append({
            "name": (info.get(u) or {}).get("name") or t.get("canonical_name") or u,
            "lookup": t.get("lookup_name") or t.get("canonical_name"),
            "country": uni[tid]["country"],
            "score": round(sc, 4), "form": round(form, 3), "formShrunk": round(form_s, 3),
            "ped": round(ped, 3), "cur": round(cur, 3), "wt": round(w, 3),
            "winpct": round(wp, 3), "mp": a["MP"], "mpEuro": a["MPe"],
            "w": a["W"], "d": a["D"], "l": a["L"], "tb": round(TB.get(tid, 0.0), 3),
        })
    rank_rows(clubs, lambda c: c["score"])
    return clubs, {"scale": round(scale, 4), "legacyScale": round(legacy, 4), "pctl": round(pctl, 4),
                   "leagues": len(byleague), "clubs": len(clubs), "k": K_SHRINK,
                   "euroMatches": sum(1 for f in fx if comp_of(f["league_id"]) and f["home_goals"] is not None)}


# ------------------------- self test -------------------------
def selftest():
    assert sm("CL", "Final") == 1.5 and sm("CL", "League Stage - 3") == 1.2
    assert sm("EL", "Round of 16") == 1.25 and sm("ECL", "League Stage - 1") == 1.05
    assert sm("USC", None) == 1.3 and sm("CUP", "Semi-finals") == 1.0
    assert result_q(2, 1) == 1.0 and result_q(1, 1) == 0.5 and result_q(0, 1) == 0.0
    # shrinkage crosses 0.5 exactly at the archive's rankability gate
    assert abs(shrink(8) - 0.5) < 1e-12
    assert shrink(0) == 0.0 and shrink(4) < 0.5 < shrink(20)
    # with no matches played the score is pure pedigree plus coefficient, no penalty
    s0, w0, f0, p0 = score_club(form=0.0, ped=0.6, cur=0.4, wp=0.0, tb=0.0, mp=0)
    assert w0 == 0.0 and abs(f0 - 0.6) < 1e-12 and abs(p0 - 0.5) < 1e-12
    assert abs(s0 - (0.65 * 0.6 + 0.35 * 0.6 + 0.11 * 0.4)) < 1e-12
    # a winless start is penalised, but only in proportion to the evidence
    a, _, _, _ = score_club(0.0, 0.6, 0.4, 0.0, 0.0, mp=2)
    b, _, _, _ = score_club(0.0, 0.6, 0.4, 0.0, 0.0, mp=30)
    assert b < a < s0, (a, b, s0)
    # A 3-game hot start must not outrank a great club.
    hot_early, _, _, _ = score_club(1.0, 0.05, 0.0, 1.0, 0.0, mp=3)
    big_early, _, _, _ = score_club(0.5, 0.90, 0.9, 0.6, 0.0, mp=3)
    assert big_early > hot_early, "a 3-game hot start must not outrank a great club"
    # An honest limit, tested rather than asserted. The first draft of this test claimed a
    # full season of the best form in Europe outranks pedigree, and it FAILED: pedigree is
    # 35% of the score and the coefficient another 11%, so a club starting from 0.05 pedigree
    # cannot reach the top in ONE season however it plays. That is the archive formula's
    # design, not a defect of the shrinkage, and the same result appears on every completed
    # hub. What the shrinkage should do is let form MATTER MORE as evidence accumulates, so
    # that is what is asserted: the gap between good form and bad form, pedigree held equal,
    # widens with matches played.
    hot_late, _, _, _ = score_club(1.0, 0.05, 0.0, 1.0, 0.0, mp=34)
    big_late, _, _, _ = score_club(0.5, 0.90, 0.9, 0.6, 0.0, mp=34)
    assert big_late > hot_late, "pedigree is 35% of the score by construction"
    def gap(mp):
        a, _, _, _ = score_club(1.0, 0.5, 0.5, 0.8, 0.0, mp)
        b, _, _, _ = score_club(0.2, 0.5, 0.5, 0.4, 0.0, mp)
        return a - b
    assert gap(3) < gap(10) < gap(34), (gap(3), gap(10), gap(34))
    assert gap(3) > 0, "better form must win even on three matches"
    # trophies add straight to the score
    t0, _, _, _ = score_club(0.5, 0.5, 0.5, 0.5, 0.0, mp=10)
    t1, _, _, _ = score_club(0.5, 0.5, 0.5, 0.5, 0.12, mp=10)
    assert abs((t1 - t0) - 0.12) < 1e-12
    # ranking ties share a rank and the next rank skips
    rows = [{"score": 3}, {"score": 5}, {"score": 5}, {"score": 1}]
    rank_rows(rows, lambda c: c["score"])
    assert [r["rank"] for r in rows] == [1, 1, 3, 4]
    print("self-test OK (11 cases)")


# ------------------------- report + CLI -------------------------
def report(clubs, meta):
    print(f"leagues={meta['leagues']}  clubs={meta['clubs']}  euro/cup matches={meta['euroMatches']}")
    print(f"K={meta['k']}  form scale = max Q/MP over MP>={SCALE_MIN_MP} = {meta['scale']}"
          f"   [p{SCALE_PCTL} would be {meta['pctl']}; the archive's max over MP>=8 would be {meta['legacyScale']}]")
    mps = sorted(c["mp"] for c in clubs)
    med = mps[len(mps) // 2] if mps else 0
    print(f"median matches played={med}  median form weight={round(med/(med+K_SHRINK), 3)}"
          "   <- how much of this board is THIS season rather than pedigree")
    print("\n  #  club                       ctry           score  form  shr  ped  cur   wt  mp  rec")
    for c in clubs[:25]:
        print("  %2d  %-26s %-12s %6.3f %5.2f %5.2f %4.2f %4.2f %4.2f %3d  %d-%d-%d"
              % (c["rank"], c["name"][:26], (c["country"] or "")[:12], c["score"], c["form"],
                 c["formShrunk"], c["ped"], c["cur"], c["wt"], c["mp"], c["w"], c["d"], c["l"]))
    top = clubs[:20]
    print("\nshape of the top 20: %d countries, %d clubs from the top-5 leagues, median mp %d"
          % (len({c["country"] for c in top}), sum(1 for c in top if c["country"] in TOP5),
             sorted(c["mp"] for c in top)[len(top)//2]))
    spring = [c for c in top if c["mp"] >= 15]
    if spring:
        print("  clubs in the top 20 from calendar-year leagues (already 15+ games in): "
              + ", ".join(f"{c['name']} ({c['mp']})" for c in spring[:8]))


def main():
    if "--self-test" in sys.argv:
        return selftest()
    selftest()
    key = supa_key()
    clubs, meta = build(key)
    report(clubs, meta)
    if "--write" in sys.argv:
        doc = {"season": LABEL, "generated": __import__("datetime").datetime.now(
                   __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "method": ("0.65 form + 0.35 pedigree + 0.11 current coefficient - losing penalty + trophies; "
                          "this season's form shrunk toward pedigree with weight mp/(mp+%g)" % K_SHRINK),
               "k": K_SHRINK, "scale": meta["scale"], "clubs": clubs}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
        print("\nWROTE", OUT)


if __name__ == "__main__":
    main()
