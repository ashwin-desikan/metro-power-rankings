#!/usr/bin/env python3
"""UEFA country + club coefficients (Bert Kassies "method5") for rankings.citizenofnowhere.org.

Seasons 2022/23-2025/26 are FINAL and stored in frozen_coefficients.json (extracted from the
workbook; verified == kassiesa). The CURRENT season is recomputed from api-football match data
(football_fixtures + football_standings, mini-owned in Supabase) using the method below, then
summed with the frozen four to give the 5-year country ranking and 5-year club ranking.

Method (per competition CL/EL/ECL):
  * match points 2 win / 1 draw from the League Stage onward; the post-league knockout play-off
    ("Round of 32") counts for the COUNTRY ranking only, not the club ranking.
  * qualifying matches: COUNTRY only, halved (1 win / 0.5 draw); club gets nothing except the
    Conference League qualifying-elimination floor (Q1 1.0 / Q2 1.5 / Q3 2.0 / PO 2.5).
  * bonus: league-stage finishing-rank bonus (linear 1->9->17->25) + 1.5/1.0/0.5 (CL/EL/ECL)
    for reaching each of R16, QF, SF, Final; capped at 18/10/6.
  * ccoef = trunc(country_points / clubs_entered, 3); crank = sum of 5 seasons.
  * trank = trunc(max(sum of club points, crank/5), 3)   (the 20% country floor, since 2018).

Backtest: computing 2025/26 from api-football reproduces kassiesa for all 54 ranked associations
and every league-phase club to 3 dp (see README.md).

Modes:
  python uefa_coefficients.py --self-test        offline unit tests of the scoring logic
  python uefa_coefficients.py --backtest DIR      recompute a past season from raw api json, check parity
  python uefa_coefficients.py                     dry run: compute current season from Supabase, print
  python uefa_coefficients.py --write             also write public/data/football/uefa-coefficients.json
"""
import os, sys, json, math, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SUPA = os.environ.get("SUPABASE_URL", "https://nmprqkmymrdknffwnuur.supabase.co")
OUT  = os.path.join(ROOT, "public", "data", "football", "uefa-coefficients.json")

COMP = {
    2:   dict(n="CL",  rb=1.5, anch={1:12,9:10,17:8,25:6}, maxb=18, floor=None),
    3:   dict(n="EL",  rb=1.0, anch={1:6, 9:4, 17:2,25:0}, maxb=10, floor=3.0),
    848: dict(n="ECL", rb=0.5, anch={1:4, 9:2, 17:1,25:0}, maxb=6,  floor=2.5),
}
QUALFLOOR = {"1st Qualifying Round":1.0, "2nd Qualifying Round":1.5,
             "3rd Qualifying Round":2.0, "Play-offs":2.5, "Playoff round":2.5}
# --- data corrections: facts a match feed cannot infer on its own ---
COUNTRY_OVERRIDE = {660: "Liechtenstein"}          # FC Vaduz: plays in Swiss pyramid, UEFA-registered to Liechtenstein
EXTRA_ENTRANTS   = {"25/26": {"Ireland": 1}}       # Drogheda United: entered ECL, expelled (shared ownership), 0 matches
LABEL_FIX        = {"Czech Republic":"Czechia", "Turkey":"Türkiye"}   # api country -> workbook/site label
# teams occasionally absent from football_team in an older season (backtest only)
BACKTEST_COUNTRY = {663:"North Macedonia", 680:"Kosovo", 16135:"Gibraltar", 3408:"Cyprus"}
BACKTEST_UEFA    = {663:"Rabotnicki Skopje", 680:"FC Prishtina", 16135:"FCB Magpies", 3408:"Aris Limassol"}

def classify(r):
    if r.startswith("League Stage") or r.startswith("Group"): return "LEAGUE"
    if r == "Round of 32": return "KOPO"                       # knockout play-off: country only
    if r in ("Round of 16","Quarter-finals","Semi-finals","Final"): return "KO"
    return "QUAL"

def rankbonus(rk, a):
    if rk is None: return 0.0
    if rk >= 25: return a[25]
    for lo, hi in ((1,9),(9,17),(17,25)):
        if lo <= rk <= hi: return a[lo] + (rk-lo)/(hi-lo)*(a[hi]-a[lo])
    return 0.0

def result_pts(hg, ag):
    if hg is None or ag is None: return None
    return (2,0) if hg > ag else (0,2) if hg < ag else (1,1)

def trunc3(x): return math.floor(x*1000)/1000.0

def compute(matches, ranks):
    """matches: iterable of (league_id, round, home_id, away_id, hg, ag).
    ranks: {(league_id, team_id): league_stage_rank}. Returns {team_id: building-blocks}."""
    T = {}
    def g(tid): return T.setdefault(tid, {"club_m":0.0,"co_m":0.0,"co_q":0.0,"ko":set(),
                                          "lcomp":None,"rank":None,"eclq":0.0})
    for lid, rnd, h, a, hg, ag in matches:
        k = classify(rnd)
        for tid in (h, a):
            o = g(tid)
            if k == "KO": o["ko"].add((lid, rnd))
            if k == "QUAL" and lid == 848: o["eclq"] = max(o["eclq"], QUALFLOOR.get(rnd, 0.0))
        pts = result_pts(hg, ag)
        if pts is None: continue
        for tid, p in ((h, pts[0]), (a, pts[1])):
            o = g(tid)
            if   k == "LEAGUE": o["club_m"] += p; o["co_m"] += p; o["lcomp"] = lid
            elif k == "KO":     o["club_m"] += p; o["co_m"] += p
            elif k == "KOPO":   o["co_m"]  += p
            elif k == "QUAL":   o["co_q"]  += p/2.0
    for (lid, tid), rk in ranks.items():
        if tid in T: T[tid]["lcomp"] = lid; T[tid]["rank"] = rk
    for o in T.values():
        if o["lcomp"] is not None:
            cfg = COMP[o["lcomp"]]
            o["bonus"] = min(rankbonus(o["rank"], cfg["anch"]) + cfg["rb"]*len(o["ko"]), cfg["maxb"])
            tp = o["club_m"] + o["bonus"]
            if cfg["floor"]: tp = max(tp, cfg["floor"])
            o["tpoints"] = tp
        else:
            o["bonus"] = 0.0
            o["tpoints"] = o["eclq"]
        o["ccontrib"] = o["co_m"] + o["co_q"] + o["bonus"]
    return T

def aggregate(T, country_of, uefa_of, season):
    country, club = {}, {}
    for tid, o in T.items():
        cc = country_of(tid)
        if cc:
            cc = LABEL_FIX.get(cc, cc)
            d = country.setdefault(cc, {"cp":0.0, "n":0}); d["cp"] += o["ccontrib"]; d["n"] += 1
        u = uefa_of(tid)
        if u: club[u] = o["tpoints"]
    for cc, x in EXTRA_ENTRANTS.get(season, {}).items():
        if cc in country: country[cc]["n"] += x
    ccoef = {cc: trunc3(d["cp"]/d["n"]) for cc, d in country.items() if d["n"]}
    return ccoef, club, {cc: d["n"] for cc, d in country.items()}

# ------------------------- data readers -------------------------
def matches_from_raw(d):
    """Read raw api-football /fixtures json (fixtures_{lid}.json) + /standings for ranks."""
    matches, ranks = [], {}
    for lid in COMP:
        fx = json.load(open(os.path.join(d, f"fixtures_{lid}.json"), encoding="utf-8")).get("response", [])
        for f in fx:
            matches.append((lid, f["league"]["round"], f["teams"]["home"]["id"],
                            f["teams"]["away"]["id"], f["goals"]["home"], f["goals"]["away"]))
        sp = os.path.join(d, f"standings_{lid}.json")
        if os.path.exists(sp):
            st = json.load(open(sp, encoding="utf-8")).get("response", [])
            if st:
                for row in st[0]["league"]["standings"][0]:
                    ranks[(lid, row["team"]["id"])] = row["rank"]
    return matches, ranks

def supa_get(path, key):
    rows, off = [], 0
    sep = "&" if "?" in path else "?"
    while True:
        req = urllib.request.Request(f"{SUPA}{path}{sep}limit=1000&offset={off}",
                                     headers={"apikey":key, "Authorization":"Bearer "+key})
        with urllib.request.urlopen(req, timeout=60) as r: b = json.load(r)
        rows += b
        if len(b) < 1000: return rows
        off += 1000

def supa_key():
    for e in ("SUPABASE_WRITE_KEY","SUPABASE_SERVICE_KEY"):
        if os.environ.get(e): return os.environ[e].strip()
    envf = os.path.join(ROOT, ".env.local")
    if os.path.exists(envf):
        for ln in open(envf, encoding="utf-8"):
            if ln.startswith("SUPABASE_SERVICE_KEY="): return ln.split("=",1)[1].strip()
    sys.exit("No Supabase key")

def matches_from_supabase(season, key):
    ids = ",".join(str(x) for x in COMP)
    fx = supa_get(f"/rest/v1/football_fixtures?select=league_id,round,home_team_id,away_team_id,home_goals,away_goals&season=eq.{season}&league_id=in.({ids})", key)
    matches = [(r["league_id"], r["round"], r["home_team_id"], r["away_team_id"], r["home_goals"], r["away_goals"]) for r in fx]
    st = supa_get(f"/rest/v1/football_standings?select=league_id,team_id,rank&season=eq.{season}&league_id=in.({ids})", key)
    ranks = {(r["league_id"], r["team_id"]): r["rank"] for r in st}
    return matches, ranks

# ------------------------- identity -------------------------
def load_crosswalk_local(path):   # football_team.json (backtest / offline)
    by = {r["team_id"]: r for r in json.load(open(path))}
    def country_of(tid):
        if tid in COUNTRY_OVERRIDE: return COUNTRY_OVERRIDE[tid]
        r = by.get(tid)
        return (r.get("country") if r else None) or BACKTEST_COUNTRY.get(tid)
    def uefa_of(tid):
        r = by.get(tid)
        return (r.get("uefa_name") if r else None) or BACKTEST_UEFA.get(tid)
    return country_of, uefa_of

def load_crosswalk_supabase(key):
    rows = supa_get("/rest/v1/football_team?select=team_id,canonical_name,country,uefa_name", key)
    by = {r["team_id"]: r for r in rows}
    def country_of(tid):
        if tid in COUNTRY_OVERRIDE: return COUNTRY_OVERRIDE[tid]
        r = by.get(tid); return r.get("country") if r else None
    def uefa_of(tid):
        r = by.get(tid); return (r.get("uefa_name") or r.get("canonical_name")) if r else None
    return country_of, uefa_of

# ------------------------- self test -------------------------
def selftest():
    assert classify("League Stage - 3") == "LEAGUE"
    assert classify("Round of 32") == "KOPO"
    assert classify("Round of 16") == "KO" and classify("Final") == "KO"
    assert classify("2nd Qualifying Round") == "QUAL" and classify("Play-offs") == "QUAL"
    assert rankbonus(1, COMP[2]["anch"]) == 12 and rankbonus(9, COMP[2]["anch"]) == 10
    assert rankbonus(5, COMP[2]["anch"]) == 11.0 and rankbonus(25, COMP[2]["anch"]) == 6
    assert rankbonus(30, COMP[2]["anch"]) == 6 and rankbonus(1, COMP[3]["anch"]) == 6
    assert abs(rankbonus(13, COMP[848]["anch"]) - 1.5) < 1e-9   # ECL midpoint 9->17
    assert result_pts(3,2) == (2,0) and result_pts(1,1) == (1,1) and result_pts(0,1) == (0,2)
    # KO play-off (Round of 32) counts for country, not club; league win counts for both
    m = [(2,"League Stage - 1",10,11,1,0), (2,"Round of 32",10,11,2,0), (2,"Round of 16",10,12,1,1)]
    T = compute(m, {(2,10):5})
    o = T[10]
    assert o["club_m"] == 2+1, o["club_m"]              # league win 2 + R16 draw 1 (KOPO excluded)
    assert o["co_m"]   == 2+2+1, o["co_m"]              # + KOPO win 2
    assert o["ko"] == {(2,"Round of 16")}
    assert abs(o["bonus"] - (11.0 + 1.5)) < 1e-9, o["bonus"]   # rank5 bonus 11 + one KO round 1.5
    # ECL qualifying floor for a qualifying-only club
    T2 = compute([(848,"2nd Qualifying Round",20,21,0,3)], {})
    assert T2[20]["tpoints"] == 1.5 and T2[21]["tpoints"] == 1.5
    # country qualifying halving
    assert T2[21]["co_q"] == 1.0   # a qualifying win = 1.0 for country (halved from 2)
    print("self-test OK")

# ------------------------- build 5-year rankings -------------------------
def _rank(sortkey_desc):
    out = {}; prev = None; r = 0
    for i, (k, v) in enumerate(sortkey_desc, 1):
        if v != prev: r = i; prev = v
        out[k] = r
    return out

def build(frozen, ccoef, club_live, lookup, cur="26/27"):
    fr = frozen["frozenSeasons"]; seasons = fr + [cur]
    # countries
    countries = []
    for c in frozen["countries"]:
        s = dict(c["seasons"]); s[cur] = ccoef.get(c["country"], 0.0)
        crank = trunc3(sum((s[k] or 0) for k in seasons))
        countries.append({"country": c["country"], "seasons": s, "crank": crank})
    for cc in ccoef:
        if not any(c["country"] == cc for c in countries):
            s = {k: 0 for k in fr}; s[cur] = ccoef[cc]
            countries.append({"country": cc, "seasons": s, "crank": trunc3(ccoef[cc])})
    crank_by = {c["country"]: c["crank"] for c in countries}
    rk = _rank([(c["country"], c["crank"]) for c in sorted(countries, key=lambda x:-x["crank"])])
    for c in countries: c["rank"] = rk[c["country"]]
    countries.sort(key=lambda x: x["rank"])
    # clubs
    def ident(u): return lookup.get(u, {})
    clubs = []
    seen = set()
    for c in frozen["clubs"]:
        u = c["uefa_name"]; seen.add(u)
        s = dict(c["seasons"]); s[cur] = club_live.get(u, 0.0)
        sum_tp = sum((s[k] or 0) for k in seasons)
        info = ident(u); country = LABEL_FIX.get(info.get("country"), info.get("country"))
        floor = (crank_by.get(country, 0.0)) / 5.0
        trank = trunc3(max(sum_tp, floor))
        clubs.append({"uefa_name": u, "cc": c["cc"], "name": info.get("name") or u,
                      "metro": info.get("metro"), "country": country, "seasons": s, "trank": trank})
    for u, tp in club_live.items():         # clubs new this cycle (no frozen history)
        if u in seen: continue
        info = ident(u); country = LABEL_FIX.get(info.get("country"), info.get("country"))
        s = {k: 0 for k in fr}; s[cur] = tp
        trank = trunc3(max(tp, crank_by.get(country, 0.0)/5.0))
        clubs.append({"uefa_name": u, "cc": info.get("cc"), "name": info.get("name") or u,
                      "metro": info.get("metro"), "country": country, "seasons": s, "trank": trank})
    rk = _rank([(c["uefa_name"], c["trank"]) for c in sorted(clubs, key=lambda x:-x["trank"])])
    for c in clubs: c["rank"] = rk[c["uefa_name"]]
    clubs.sort(key=lambda x: x["rank"])
    return {"method": "kassiesa method5", "currentSeason": cur, "seasons": seasons,
            "countries": countries, "clubs": clubs}

# ------------------------- CLI -------------------------
def main():
    frozen = json.load(open(os.path.join(HERE, "frozen_coefficients.json"), encoding="utf-8"))
    if "--self-test" in sys.argv:
        return selftest()
    if "--backtest" in sys.argv:
        d = sys.argv[sys.argv.index("--backtest")+1]
        season = sys.argv[sys.argv.index("--season")+1] if "--season" in sys.argv else "25/26"
        country_of, uefa_of = load_crosswalk_local(os.environ.get("FOOTBALL_TEAM_JSON", "/tmp/football_team.json"))
        m, r = matches_from_raw(d)
        T = compute(m, r); ccoef, club, ncl = aggregate(T, country_of, uefa_of, season)
        ftc = {c["country"]: c["seasons"].get(season) for c in frozen["countries"]}
        ftk = {c["uefa_name"]: c["seasons"].get(season) for c in frozen["clubs"]}
        cok = [cc for cc, v in ccoef.items() if ftc.get(cc) is not None and abs(v-ftc[cc]) < 5e-4]
        chave = [cc for cc in ccoef if ftc.get(cc) is not None]
        koff = [(u, club[u], ftk[u]) for u in club if ftk.get(u) is not None and abs(club[u]-ftk[u]) >= 6e-3]
        khave = [u for u in club if ftk.get(u) is not None]
        print(f"BACKTEST {season}: countries {len(cok)}/{len(chave)} exact; clubs {len(khave)-len(koff)}/{len(khave)} match (<=0.006)")
        for cc in chave:
            if abs(ccoef[cc]-ftc[cc]) >= 5e-4: print(f"  country MISS {cc}: calc={ccoef[cc]} target={ftc[cc]} n={ncl[cc]}")
        for u, a, b in koff[:20]: print(f"  club MISS {u}: calc={a} target={b}")
        return
    # live current season from Supabase
    key = supa_key()
    country_of, uefa_of = load_crosswalk_supabase(key)
    lk = supa_get("/rest/v1/football_lookup?select=uefa_name,cur_name,team,metro_area,country,level&uefa_name=not.is.null&order=level.asc.nullslast", key)
    lookup = {}
    for r in lk:
        u = r.get("uefa_name")
        if u:
            lookup.setdefault(u, {"name": r.get("team") or r.get("cur_name"),
                                  "metro": r.get("metro_area"), "country": r.get("country")})
    m, r = matches_from_supabase(2026, key)
    T = compute(m, r); ccoef, club, ncl = aggregate(T, country_of, uefa_of, "26/27")
    out = build(frozen, ccoef, club, lookup, "26/27")
    print(f"current-season 26/27: matches={len(m)} ranks={len(r)} countries_scored={len(ccoef)} clubs_scored={len(club)}")
    print("Top 8 countries (5yr crank):")
    for c in out["countries"][:8]: print(f"  {c['rank']:2d} {c['country']:16} {c['crank']:8.3f}  (26/27={c['seasons']['26/27']})")
    print("Top 8 clubs (5yr trank):")
    for c in out["clubs"][:8]: print(f"  {c['rank']:2d} {c['name']:22} {c['trank']:7.2f}  (26/27={c['seasons']['26/27']})")
    if "--write" in sys.argv:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
        print("WROTE", OUT)

if __name__ == "__main__":
    main()
