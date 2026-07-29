# -*- coding: utf-8 -*-
"""regen_shipped_clubs.py - recompute clubs[] for the shipped hubs (2013-14 .. 2025-26) with the
standard domestic-tables fallback, spliced back into each public/data/football/hub-*.json.

Reproduces build_season_hub.py's per-match form + trophy math EXACTLY for the api-covered clubs
(universe and fixtures keyed by the api team's canonical name, identical to the shipped build), then
folds each remaining UEFA top-flight club's standings W/D/L (api standings where present, the hub's
own leagues[] otherwise) using league-average opponent weighting, on the SAME maxRate so covered
scores are untouched. Country coefficients come from each hub's own countries[].

  python regen_shipped_clubs.py [--only 2013-14] [--write]
"""
import json, os, re, math, sys, gzip, unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
UEFA = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(UEFA, "..", ".."))
SC = os.path.join(ROOT, "scripts", "apifootball", "_scratch")
FOUT = os.path.join(ROOT, "public", "data", "football")

def jload(p):
    with open(p, encoding="utf-8") as f: return json.load(f)
def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

TOP5 = {"England", "Spain", "Germany", "Italy", "France"}
DOMCUPS = {48, 137, 81, 97, 185, 90, 143, 45, 66, 181, 96, 65}
OLD_CWC = {2022: {"wid": 541}, 2023: {"wid": 50}, 2018: {"wid": 541}}
SEASONS = [(y, f"{y}-{str(y+1)[2:]}") for y in range(2013, 2025)] + [(2025, "2025-26")]
DATA = os.path.join(UEFA, "data")
CUPFIX = jload(os.path.join(DATA, "cupfix_2007_2023.json"))   # keyed by season-END year
try:  # hand-wired recent international finals (post-2022-23, not in cupresults93_23)
    for _k, _v in jload(os.path.join(DATA, "cupfix_recent_intl.json")).items():
        CUPFIX.setdefault(_k, []).extend(_v)
except FileNotFoundError:
    pass
INTL_CUPS = {"UEFA Super Cup", "FIFA Club World Cup", "Intercontinental Cup"}
def cup_mult(comp):
    c = (comp or "").lower()
    if "uefa super" in c: return 1.3
    if "club world" in c or "intercontinental" in c: return 1.2
    return 1.0

by_id = {r["team_id"]: r for r in jload(os.path.join(SC, "football_team.json"))}
CCF = jload(os.path.join(UEFA, "club_coeff_full.json"))
_lk = jload(os.path.join(SC, "football_lookup.json"))
cur2uefa = {}; cur2look = {}
for r in by_id.values():
    un = r.get("uefa_name")
    for f in ("canonical_name", "lookup_name"):
        if r.get(f) and un: cur2uefa.setdefault(norm(r[f]), un)
    if r.get("canonical_name") and r.get("lookup_name"):
        cur2look.setdefault(norm(r["canonical_name"]), r["lookup_name"])
for r in _lk:
    un = r.get("uefa_name")
    for f in ("cur_name", "team", "lookup_name"):
        if r.get(f) and un: cur2uefa.setdefault(norm(r[f]), un)
    if r.get("cur_name") and r.get("lookup_name"):
        cur2look.setdefault(norm(r["cur_name"]), r["lookup_name"])

canon2uefa = {}  # canonical_name -> uefa_name, the EXACT id-based join build_season_hub uses via uf(tid)
for r in by_id.values():
    if r.get("canonical_name") and r.get("uefa_name"):
        canon2uefa.setdefault(r["canonical_name"], r["uefa_name"])

def cid_name(tid, fallback):
    r = by_id.get(tid); return (r["canonical_name"] if r else fallback)

# Complete kassiesa European match archive, grouped by (season, competition), to backfill any
# European competition an api bundle left empty (2013-14 Europa is empty on disk).
KASS = defaultdict(list)
try:
    with gzip.open(os.path.join(UEFA, "_kassiesa_all_rows.json.gz"), "rt", encoding="utf-8") as f:
        for _r in json.load(f):
            KASS[(_r.get("season"), _r.get("competition"))].append(_r)
except Exception as _e:
    print("kassiesa archive unavailable:", _e)

def kass_mult(comp, rn):
    if comp == "CL": return {1: 1.5, 2: 1.45, 3: 1.4, 4: 1.35, 5: 1.2}.get(rn, 1.0)
    if comp == "EL": return {1: 1.25, 2: 1.25, 3: 1.25, 4: 1.25, 5: 1.1}.get(rn, 1.0)
    return {1: 1.15, 2: 1.15, 3: 1.15, 4: 1.15, 5: 1.05}.get(rn, 1.0)

NRND = {"8th Finals": "Round of 16", "Finals": "Final"}
def _nz(fx):
    for f in (fx or []):
        rr = (f.get("league") or {}).get("round")
        if rr in NRND: f["league"]["round"] = NRND[rr]

def stage_mult(comp, r):  # verbatim from build_season_hub.sm
    r = r or ""
    if comp == "CL":
        return {"Final": 1.5, "Semi-finals": 1.45, "Quarter-finals": 1.4, "Round of 16": 1.35, "Round of 32": 1.3}.get(r, 1.2 if r.startswith("League Stage") else 1.0)
    if comp == "EL":
        return 1.25 if r in ("Final", "Semi-finals", "Quarter-finals", "Round of 16") else (1.1 if r.startswith("League Stage") else 1.0)
    if comp == "ECL":
        return 1.15 if r in ("Final", "Semi-finals", "Quarter-finals", "Round of 16") else (1.05 if r.startswith("League Stage") else 1.0)
    return {"USC": 1.3, "ICC": 1.2}.get(comp, 1.0)

def fwid(fixtures):
    fins = [f for f in fixtures if (f["league"]["round"] or "") == "Final" and f["goals"]["home"] is not None]
    if not fins: return None
    f = sorted(fins, key=lambda x: x["fixture"]["date"])[-1]
    h, a = f["teams"]["home"], f["teams"]["away"]; g = f["goals"]
    return h["id"] if h.get("winner") else a["id"] if a.get("winner") else (h["id"] if g["home"] >= g["away"] else a["id"])

def load_bundle(year):
    if year == 2025:
        sa = jload(os.path.join(SC, "hub_standings_2025.json"))
        b = jload(os.path.join(SC, "uefarank2025_full.json"))
        lf, cf = b["league_fixtures"], b["cup_fixtures"]
        europe = {str(l): {"fixtures": jload(os.path.join(SC, "uefa2025", f"fixtures_{l}.json"))["response"]} for l in (2, 3, 848)}
        cwc = None
    else:
        b = jload(os.path.join(SC, f"uefahub{year}.json"))
        sa, lf, cf = b["standings_all"], b["league_fixtures"], b["cup_fixtures"]
        europe = {k: {"fixtures": v["fixtures"]} for k, v in b["europe"].items()}
        cwc = jload(os.path.join(SC, "cwc2025.json")) if year == 2024 else None
    for fx in list(lf.values()) + list(cf.values()): _nz(fx)
    for e in europe.values(): _nz(e["fixtures"])
    if cwc: _nz(cwc)
    return {"standings_all": sa, "league_fixtures": lf, "cup_fixtures": cf, "europe": europe, "cwc": cwc}

def recompute(year, label):
    hub = jload(os.path.join(FOUT, f"hub-{label}.json"))
    five = hub["clubSeasons"]; curlab = five[-1]
    B = load_bundle(year); sa = B["standings_all"]
    # covered universe = api standings UEFA L1, keyed by canonical name (== build_season_hub). Carry
    # api W/D/L (for the standings-fallback) and single-group champions.
    uni = {}; api_wdl = {}; api_countries = set(); champs = []
    for lid, d in sa.items():
        if d.get("confed") != "UEFA" or d.get("level") != 1 or not d.get("response"): continue
        api_countries.add(d.get("country"))
        grps = d["response"][0]["league"].get("standings", [])
        for grp in grps:
            for row in grp:
                nm = cid_name(row["team"]["id"], row["team"]["name"])
                uni.setdefault(nm, d.get("country"))
                al = row.get("all", {})
                api_wdl.setdefault(nm, (al.get("win") or 0, al.get("draw") or 0, al.get("lose") or 0))
        if len(grps) == 1:
            r1 = [row for row in grps[0] if row.get("rank") == 1]
            if r1: champs.append((cid_name(r1[0]["team"]["id"], None), d.get("country")))
    api_names = set(uni)  # the api-standings universe == build_season_hub's universe
    # add clubs from the hub's own leagues[] for UEFA L1 leagues the api bundle did NOT carry
    hub_wdl = {}
    for lg in hub["leagues"]:
        if lg.get("confed") != "UEFA" or lg.get("level") != 1 or lg["country"] in api_countries: continue
        for g in lg["groups"]:
            for row in g["rows"]:
                nm = row.get("name")
                if not nm: continue
                uni.setdefault(nm, lg["country"])
                hub_wdl.setdefault(nm, (row.get("win") or 0, row.get("draw") or 0, row.get("lose") or 0))
                if row.get("champ"): champs.append((nm, lg["country"]))
    country5yr = {c["country"]: c["coef"] for c in hub["countries"]}
    def uf(nm): return canon2uefa.get(nm) if nm in api_names else cur2uefa.get(norm(nm))
    club_cur = {nm: (CCF.get(uf(nm), {}).get(curlab, 0) or 0) for nm in uni}
    club_five = {nm: sum((CCF.get(uf(nm), {}).get(s) or 0) for s in five) for nm in uni}
    MAXCUR = max((cs.get(curlab) or 0 for cs in CCF.values()), default=1) or 1
    MAX5 = max((sum((cs.get(s) or 0) for s in five) for cs in CCF.values()), default=1) or 1
    def fiveN(nm): return club_five.get(nm, 0) / MAX5
    def curN(nm): return club_cur.get(nm, 0) / MAXCUR
    ENG = country5yr.get("England") or 1.0
    def CF(c):
        v = country5yr.get(c); return math.sqrt(v / ENG) if v else 0.0
    def strength_real(nm): return max(0.5 * CF(uni[nm]) + 0.5 * fiveN(nm), 0.10)
    def strength(nm): return strength_real(nm) if nm in api_names else 0.10
    agg = {nm: {"MP": 0, "W": 0, "D": 0, "L": 0, "Q": 0.0} for nm in uni}
    def result(me, opp, gf, ga, mult, wdl=None):
        if me not in agg or gf is None or ga is None: return
        A = agg[me]; A["MP"] += 1
        res = wdl if wdl in ("W", "D", "L") else ("W" if gf > ga else "L" if gf < ga else "D")
        A[res] += 1
        A["Q"] += (1.0 if res == "W" else 0.5 if res == "D" else 0.0) * strength(opp) * mult
    def feed(fx, comp):
        for f in fx:
            g = f["goals"]
            if g["home"] is None or g["away"] is None: continue
            h = cid_name(f["teams"]["home"]["id"], f["teams"]["home"]["name"])
            a = cid_name(f["teams"]["away"]["id"], f["teams"]["away"]["name"])
            m = stage_mult(comp, f["league"]["round"])
            result(h, a, g["home"], g["away"], m); result(a, h, g["away"], g["home"], m)
    # per-match domestic ONLY for api-response countries (whose universe is the canonical name the
    # fixtures use); everything else folds its standings table below. This both reproduces
    # build_season_hub for the covered set and avoids feeding canonical fixtures into a cur_name
    # universe (which silently attached nothing for empty-response countries like Russia).
    covered = set()
    for lid, fx in B["league_fixtures"].items():
        d = sa.get(str(lid)) or sa.get(lid) or {}
        if d.get("confed") == "UEFA" and d.get("level") == 1 and d.get("country") in api_countries:
            covered.add(d.get("country")); feed(fx, "LEAGUE")
    # international one-off cups (UEFA Super Cup / Club World Cup / Intercontinental) come from Ashwin's
    # cupresults file (the api Super Cup=531 / Club World Cup=1168 slots come back empty). Skip those api
    # slots when cupresults covers the year so nothing double-counts; cupfix is keyed by season-END year.
    intl = [m for m in CUPFIX.get(str(year + 1), []) if m.get("comp") in INTL_CUPS]
    skip = {531, 1168} if intl else set()
    for cidk, fx in B["cup_fixtures"].items():
        if int(cidk) in skip: continue
        feed(fx, {531: "USC", 1168: "ICC"}.get(int(cidk), "CUP"))
    canon_i = {norm(nm): nm for nm in uni}
    for m in intl:
        me = canon_i.get(norm(m["cur"])); opp = canon_i.get(norm(m["opp"])) or m.get("opp")
        result(me, opp, m.get("gf"), m.get("ga"), cup_mult(m.get("comp")), m.get("wdl"))
    empty = set()
    for lid, comp in (("2", "CL"), ("3", "EL"), ("848", "ECL")):
        e = B["europe"].get(lid) or B["europe"].get(int(lid))
        if e and e.get("fixtures"): feed(e["fixtures"], comp)
        else: empty.add(comp)
    # backfill any empty European competition (2013-14 Europa) from the kassiesa archive, mapped to
    # the universe by normalized name, so its participants aren't left with no European form
    if empty:
        norm2uni = {norm(nm): nm for nm in uni}
        for comp in empty:
            for r in KASS.get((label, comp), []):
                H = norm2uni.get(norm(r.get("home_canon"))); A = norm2uni.get(norm(r.get("away_canon")))
                m = kass_mult(comp, r.get("round_num"))
                if r.get("leg1_home") is not None:
                    result(H, A, r["leg1_home"], r["leg1_away"], m); result(A, H, r["leg1_away"], r["leg1_home"], m)
                if r.get("leg2_home") is not None:
                    result(H, A, r["leg2_home"], r["leg2_away"], m); result(A, H, r["leg2_away"], r["leg2_home"], m)
    maxRate = max((agg[nm]["Q"] / agg[nm]["MP"] for nm in api_names if agg[nm]["MP"] >= 8), default=1.0)
    # domestic-tables fallback for every UEFA L1 country NOT covered per-match, on the covered maxRate
    by_country = defaultdict(list)
    for nm, c in uni.items(): by_country[c].append(strength_real(nm))
    avg_str = {c: (sum(v) / len(v) if v else 0.10) for c, v in by_country.items()}
    all_wdl = dict(api_wdl); all_wdl.update(hub_wdl)
    for nm, (w, d, l) in all_wdl.items():
        c = uni.get(nm)
        if c in covered or nm not in agg: continue
        n = w + d + l
        if n <= 0: continue
        A = agg[nm]; A["MP"] += n; A["W"] += w; A["D"] += d; A["L"] += l
        A["Q"] += (w * 1.0 + d * 0.5) * avg_str.get(c, 0.10) * 1.0
    return hub, agg, uni, fiveN, curN, maxRate, champs, covered, B

def assemble(year, label):
    hub, agg, uni, fiveN, curN, maxRate, champs, covered, B = recompute(year, label)
    TB = defaultdict(float); canon2 = {norm(nm): nm for nm in uni}
    def addb_name(name, w):
        if not name: return
        nm = name if name in agg else canon2.get(norm(name))
        if nm: TB[nm] += w
    def addb_id(tid, w):
        if tid is not None: addb_name(cid_name(tid, None), w)
    # Trophy bonuses from the hub's own continental[]/cups[] (complete for every season, and the
    # winners are identical to the api finals build_season_hub used - the round-by-round data was
    # built from the same workbook - so this reproduces the shipped bonuses AND fixes 2013-14, whose
    # api Europa fixtures are missing on disk).
    CONT_W = {"Champions League": 0.10, "Europa League": 0.05, "Conference League": 0.03,
              "UEFA Super Cup": 0.04, "FIFA Club World Cup": 0.05 if year >= 2024 else 0.03}
    for sec in hub["continental"]:
        w = CONT_W.get(sec.get("comp"))
        if not w: continue
        for e in (sec.get("entries") or []):
            if e.get("trophy"): addb_name(e.get("name"), w)
    for cp in hub["cups"]:
        addb_name(cp.get("winner"), 0.015 if cp.get("type") == "Domestic cup" else 0.01)
    for nm, c in champs:
        addb_name(nm, 0.06 if c in TOP5 else 0.03)
    clubs = []
    for nm, A in agg.items():
        if A["MP"] < 8: continue
        form = (A["Q"] / A["MP"]) / maxRate
        wp = (2 * A["W"] + A["D"]) / (2 * A["MP"])
        score = 0.65 * form + 0.35 * fiveN(nm) + 0.11 * curN(nm) - max(0.0, 0.5 - wp) * 0.6 + TB.get(nm, 0)
        clubs.append({"name": nm, "lookup": cur2look.get(norm(nm), nm), "country": uni[nm],
            "score": round(score, 4), "form": round(form, 3), "ped": round(fiveN(nm), 3),
            "winpct": round(wp, 3), "mp": A["MP"], "w": A["W"], "d": A["D"], "l": A["L"], "tb": round(TB.get(nm, 0), 3)})
    clubs.sort(key=lambda c: -c["score"]); prev = None; rk = 0
    for i, c in enumerate(clubs, 1):
        if c["score"] != prev: rk = i; prev = c["score"]
        c["rank"] = rk
    return hub, clubs, covered

def main():
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    write = "--write" in sys.argv
    for year, label in SEASONS:
        if only and label != only: continue
        hub, clubs, covered = assemble(year, label)
        old = {c["name"]: c for c in hub["clubs"]}
        new = {c["name"]: c for c in clubs}
        common = [n for n in new if n in old and new[n]["country"] in covered]
        exact = sum(1 for n in common if abs(new[n]["score"] - old[n]["score"]) < 1e-9)
        maxd = max((abs(new[n]["score"] - old[n]["score"]) for n in common), default=0)
        added = [n for n in new if n not in old]
        print(f"\n{label}: {len(hub['clubs'])} -> {len(clubs)} clubs (+{len(added)}) | "
              f"covered reproduction {exact}/{len(common)} exact, max delta {maxd:.5f}")
        print("  top 12:", ", ".join(f"{c['rank']}.{c['name']}" for c in clubs[:12]))
        if write:
            hub["clubs"] = clubs
            with open(os.path.join(FOUT, f"hub-{label}.json"), "w", encoding="utf-8") as f:
                json.dump(hub, f, ensure_ascii=False)
            print("  WROTE hub-" + label + ".json")

if __name__ == "__main__":
    main()
