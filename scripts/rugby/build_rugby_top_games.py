#!/usr/bin/env python3
"""Build public/data/rugby-union/top-games.json — the Rugby Union Greatest Games ranking.

Ranks every men's international test (OtherLeagues.xlsx "Rugby Union - Intl Results",
1871->today) by a computed Game Score = closeness + stakes + quality, where quality is
each side's strength on the day from a CONTINUOUS Elo rating built over the whole history
(so pre-2003 matches, before the official World Rugby rankings existed, sit on the same
scale). A curated date-keyed FLOOR lifts a set of all-time classics whose greatness is
narrative or an upset rather than margin (mirrors the cricket engine's "option b" floor).

Emits: top (50), by_team (top 12 per nation), by_decade (top 12 per decade).
Western Samoa is merged into Samoa; Cote d'Ivoire -> ivory-coast to match teams.json.

Run natively (openpyxl cannot read this workbook inside the Cowork sandbox):
    python scripts/rugby/build_rugby_top_games.py
Optional args: <OtherLeagues.xlsx> <out_json>
"""
import json, re, sys, unicodedata, collections, datetime
import os, time, urllib.request, urllib.parse

_SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
           or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
_SB_KEY = (os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")

def _sb(table, select, order="id"):
    out, step, off = [], 1000, 0
    while True:
        q = urllib.parse.urlencode({"select": select, "order": order, "limit": step, "offset": off})
        req = urllib.request.Request(f"{_SB_URL}/rest/v1/{table}?{q}",
                                     headers={"apikey": _SB_KEY, "Authorization": f"Bearer {_SB_KEY}"})
        for _t in range(4):
            try:
                with urllib.request.urlopen(req, timeout=30) as rr:
                    batch = json.load(rr); break
            except Exception:
                if _t == 3: raise
                time.sleep(2)
        out += batch
        if len(batch) < step:
            return out
        off += step

HERE = __file__
REPO = re.sub(r"[\\/]scripts[\\/]rugby[\\/].*$", "", HERE.replace("\\", "/"))
WB   = sys.argv[1] if len(sys.argv) > 1 else f"{REPO}/OtherLeagues.xlsx"
OUT  = sys.argv[2] if len(sys.argv) > 2 else f"{REPO}/public/data/rugby-union/top-games.json"
SHEET = "Rugby Union - Intl Results"
TODAY = datetime.date.today()

def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    sg = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")
    return {"cote-d-ivoire": "ivory-coast", "western-samoa": "samoa"}.get(sg, sg)

MERGE = {"Western Samoa": "Samoa", "Ivory Coast": "Côte d'Ivoire"}

def load_matches():
    seen, M = set(), []
    for r in _sb("rugby_results",
                 "date,team,wld,opp,pf,pa,comp,stage,city,country,home_away,"
                 "rugby_world_cup,home_five_six_nations,tri_nations_rugby_champ,nations_championship"):
        t, o = r["team"], r["opp"]
        if not t or not o: continue
        t = MERGE.get(str(t), str(t)); o = MERGE.get(str(o), str(o))
        ds = str(r["date"])
        if len(ds) != 8: continue
        d = datetime.date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
        if d > TODAY: continue
        wld = str(r["wld"] or "")
        pf = int(r["pf"] or 0); pa = int(r["pa"] or 0)
        if wld not in ("W", "L", "D") or (pf == 0 and pa == 0): continue
        key = (d, frozenset((t, o)))
        if key in seen: continue
        seen.add(key)
        M.append(dict(d=d, team=t, opp=o, wld=wld, pf=pf, pa=pa, margin=abs(pf - pa),
            comp=str(r["comp"] or ""), stage=str(r["stage"] or ""),
            rwc=bool(r["rugby_world_cup"]), six=bool(r["home_five_six_nations"]),
            tri=bool(r["tri_nations_rugby_champ"]), nc=bool(r["nations_championship"]),
            home=str(r["home_away"] or ""), city=str(r["city"] or ""),
            country=str(r["country"] or "")))
    M.sort(key=lambda m: m["d"])
    return M

def elo(M):
    R = collections.defaultdict(lambda: 1500.0); HFA = 60.0
    for m in M:
        a, b = m["team"], m["opp"]; ra, rb = R[a], R[b]
        adj = -HFA if m["home"] == "Home" else (HFA if m["home"] == "Away" else 0.0)
        Ea = 1 / (1 + 10 ** ((rb - ra + adj) / 400.0))
        Sa = 1.0 if m["wld"] == "W" else (0.5 if m["wld"] == "D" else 0.0)
        K = 40.0 * (1.5 if m["rwc"] else 1.0); mov = 1 + min(m["margin"], 40) / 40.0 * 0.75
        dl = K * mov * (Sa - Ea); m["ra"], m["rb"] = ra, rb; R[a] = ra + dl; R[b] = rb - dl

D = datetime.date
FLOORS = {
 (D(2000,7,15), frozenset({"australia","new-zealand"})): 95,
 (D(1995,6,24), frozenset({"south-africa","new-zealand"})): 101,  # user: 1995 final to #2, above 2011
 (D(2015,9,19), frozenset({"south-africa","japan"})): 94,
 (D(2023,10,15), frozenset({"france","south-africa"})): 92,
 (D(2003,11,22), frozenset({"australia","england"})): 96,
 (D(1999,10,31), frozenset({"france","new-zealand"})): 92,
 (D(2013,10,5), frozenset({"south-africa","new-zealand"})): 88,
 (D(2023,10,14), frozenset({"ireland","new-zealand"})): 90,
 (D(2015,10,18), frozenset({"australia","scotland"})): 86,
 (D(2007,9,29), frozenset({"wales","fiji"})): 88,
 (D(2019,3,16), frozenset({"england","scotland"})): 88,
 (D(2017,3,18), frozenset({"france","wales"})): 85,
 (D(2018,9,15), frozenset({"new-zealand","south-africa"})): 88,
 (D(1991,10,20), frozenset({"australia","ireland"})): 87,
 (D(2015,10,31), frozenset({"australia","new-zealand"})): 92,
}
def norm(r): return max(0.0, min(1.15, (r - 1450) / 300.0))
def closeness(m): return 0.90 if m["wld"] == "D" else max(0.0, 1 - m["margin"] / 28.0)
def stakes(m):
    if m["rwc"]:
        st = m["stage"].lower()
        if st == "final": return 1.0
        if "semi" in st: return 0.88
        if "quarter" in st: return 0.82
        if "bronze" in st: return 0.55
        return 0.68
    if m["tri"] or m["nc"]: return 0.60
    if m["six"]: return 0.55
    if "bledisloe" in m["comp"].lower(): return 0.62
    return 0.42
def badge(m):
    if m["rwc"]: return "RWC"
    if m["nc"]: return "NC"
    if m["tri"]: return "RC"
    if m["six"]: return "6N"
    return "TEST"

def main():
    M = load_matches(); elo(M)
    for m in M:
        cl = closeness(m); st = stakes(m)
        q = 0.55 * norm(min(m["ra"], m["rb"])) + 0.45 * norm((m["ra"] + m["rb"]) / 2)
        gs = 100 * (0.38 * cl + 0.38 * st + 0.24 * q) * (0.80 + 0.20 * cl)
        fl = FLOORS.get((m["d"], frozenset({slug(m["team"]), slug(m["opp"])})))
        if fl: gs = max(gs, fl)
        m["cl"], m["st"], m["q"], m["gs"], m["ep"] = round(cl,3), round(st,3), round(q,3), gs, bool(fl)
    MAX = max(m["gs"] for m in M)
    def rec(m):
        return dict(comp=badge(m), date=m["d"].isoformat(),
            team=m["team"], teamSlug=slug(m["team"]), opp=m["opp"], oppSlug=slug(m["opp"]),
            winner=("" if m["wld"] == "D" else (m["team"] if m["wld"] == "W" else m["opp"])),
            pf=m["pf"], pa=m["pa"], draw=(m["wld"] == "D"),
            competition=m["comp"], stage=m["stage"], city=m["city"], country=m["country"],
            gs=round(m["gs"], 2), norm=round(100 * m["gs"] / MAX, 1), editorPick=m["ep"],
            cl=m["cl"], st=m["st"], q=m["q"])
    alls = sorted(M, key=lambda m: -m["gs"])
    top = [rec(m) for m in alls[:50]]
    teams = set(m["team"] for m in M) | set(m["opp"] for m in M)
    by_team = {}
    for tm in teams:
        tg = [m for m in alls if m["team"] == tm or m["opp"] == tm][:12]
        if tg: by_team[slug(tm)] = [rec(m) for m in tg]
    decs = sorted({f"{(m['d'].year//10)*10}s" for m in alls})
    by_decade = {dec: [rec(m) for m in alls if f"{(m['d'].year//10)*10}s" == dec][:12] for dec in decs}
    out = dict(generated=TODAY.isoformat(),
        method="continuous-elo + game-score (closeness/stakes/quality) + curated floor",
        count=len(M), top=top, by_team=by_team, by_decade=by_decade)
    json.dump(out, open(OUT, "w"), indent=0)
    print(f"wrote {OUT}: {len(M)} matches, {len(by_team)} teams, {len(by_decade)} decades")

if __name__ == "__main__":
    main()
