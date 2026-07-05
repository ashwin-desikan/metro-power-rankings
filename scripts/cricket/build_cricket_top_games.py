#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Greatest Games (cricket): compute a per-format and combined Game Score for
every men's international, and write public/data/cricket/top-games.json.

Game Score = 0.42*Closeness + 0.30*Stakes + 0.28*Quality, closeness-gated, with a
curated FLOOR that lifts the all-time classics whose greatness is historical rather
than in the margin (e.g. Kolkata 2001). Closeness is parsed from the Result Detail;
Stakes from the Major/Round columns; Quality from both sides' ratings on the day
(via icc_engine), damped by rating connectedness so associate flukes don't sneak in.

Native monthly run, like build_icc_rankings.py:
    python build_cricket_top_games.py            # writes the JSON
    python build_cricket_top_games.py --workbook <path>
"""
import os, sys, re, json, datetime, collections, argparse
import openpyxl
from cricket_source import open_source
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import icc_engine as E

MASTER = r"C:\Users\ashwi\OneDrive\Excel Files\InternationalCricket.xlsx"
DEST = os.environ.get("TOPGAMES_DEST") or os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                     "..", "..", "public", "data", "cricket", "top-games.json"))
CANON = {"United States of America": "United States"}
def canon(t): return CANON.get(t, t)
def slug(t): return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")

def _to_date(v):
    if hasattr(v, "date"): return v.date()
    s = str(v).strip()
    if "-" in s:
        y, m, d = s[:10].split("-"); return datetime.date(int(y), int(m), int(d))
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(s)))


def load_matches(path):
    wb = open_source(path)
    ws = wb["Matches"]
    H = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
    ix = {n: H.index(n) for n in ["Format", "Start Date", "End Date", "Team", "Opponent", "Winner",
          "Result", "Result Detail", "Tournament / Series", "Major", "Round",
          "Venue", "Venue City", "Venue Country"]}
    seen, out = set(), []
    for r in ws.iter_rows(min_row=2, values_only=True):
        fmt = r[ix["Format"]]
        if fmt not in ("Test", "ODI", "T20I"): continue
        v = r[ix["Start Date"]]
        if v is None: continue
        sd = _to_date(v)
        v2 = r[ix["End Date"]]
        ed = _to_date(v2) if v2 is not None else sd
        team, opp = r[ix["Team"]], r[ix["Opponent"]]
        if not team or not opp: continue
        team, opp = canon(str(team)), canon(str(opp))
        key = (fmt, sd, frozenset((team, opp)))
        if key in seen: continue
        seen.add(key)
        out.append(dict(fmt=fmt, sd=sd, ed=ed, team=team, opp=opp,
            winner=canon(str(r[ix["Winner"]]).strip()) if r[ix["Winner"]] else "",
            res=str(r[ix["Result"]] or "").strip(), detail=str(r[ix["Result Detail"]] or "").strip(),
            tourn=str(r[ix["Tournament / Series"]] or ""), major=str(r[ix["Major"]] or ""),
            round=str(r[ix["Round"]] or ""), venue=str(r[ix["Venue"]] or ""),
            city=str(r[ix["Venue City"]] or ""), country=str(r[ix["Venue Country"]] or "")))
    return out

def build_limited(matches, fmt):
    items = [dict(date=m["sd"], t1=m["team"], t2=m["opp"], winner=m["winner"], result=m["res"])
             for m in matches if m["fmt"] == fmt and m["res"].lower() not in ("no result", "abandoned")]
    items.sort(key=lambda x: x["date"]); return items

def build_series(matches):
    tests = [m for m in matches if m["fmt"] == "Test"]
    bp = collections.defaultdict(list)
    for m in tests: bp[frozenset((m["team"], m["opp"]))].append(m)
    ser = []
    for _, ms in bp.items():
        ms.sort(key=lambda x: x["sd"]); cur = []
        for m in ms:
            if cur and (m["sd"] - cur[-1]["sd"]).days > 45: ser.append(_mk(cur)); cur = []
            cur.append(m)
        if cur: ser.append(_mk(cur))
    ser.sort(key=lambda s: s["end"]); return ser

def _mk(ms):
    A, B = sorted(frozenset((ms[0]["team"], ms[0]["opp"])))
    wA = sum(1 for m in ms if m["winner"] == A); wB = sum(1 for m in ms if m["winner"] == B)
    dr = sum(1 for m in ms if m["winner"] not in (A, B))
    return dict(start=ms[0]["sd"], end=ms[-1]["sd"], A=A, B=B, wA=wA, wB=wB, dr=dr, n=len(ms))

def closeness(detail, fmt):
    s = detail.lower()
    if "tie" in s or "tied" in s: return 0.90
    if "super over" in s: return 0.94
    if "no result" in s or "abandon" in s: return 0.0
    if "draw" in s or (fmt == "Test" and re.search(r"\bdrawn\b", s)): return 0.35
    if "innings" in s: return 0.05
    mw = re.search(r"by (\d+) wicket", s)
    if mw: return max(0.05, 1 - (int(mw.group(1)) - 1) / 10.0)
    mr = re.search(r"by (\d+) run", s)
    if mr:
        scale = {"Test": 220, "ODI": 95, "T20I": 45}[fmt]
        return max(0.0, 1 - int(mr.group(1)) / scale)
    return 0.3

def stakes(m):
    mj, rd, tn = m["major"].lower(), m["round"].lower(), m["tourn"].lower()
    glob = any(k in mj for k in ("world cup", "world twenty20", "t20 world cup", "champions trophy", "world test championship"))
    fin = "final" in rd and "semi" not in rd and "quarter" not in rd
    ko = any(k in rd for k in ("final", "semi", "quarter", "super eight", "super 8", "playoff", "eliminator", "super over"))
    marquee = any(k in tn for k in ("ashes", "border-gavaskar", "border gavaskar"))
    if glob and fin: return 1.0
    if glob and ko: return 0.85
    if glob: return 0.68
    if marquee: return 0.62
    if tn and ("tri" in tn or "series" in tn or "trophy" in tn or "cup" in tn): return 0.5
    return 0.42

def norm(r):
    return max(0.0, min(1.15, (r - 95) / 35.0))

FLOORS = {
    (datetime.date(2001, 3, 11), frozenset({"india", "australia"})): 96,
    (datetime.date(2019, 7, 14), frozenset({"england", "new zealand"})): 100,
    (datetime.date(1999, 6, 17), frozenset({"australia", "south africa"})): 96,
    (datetime.date(2006, 3, 12), frozenset({"south africa", "australia"})): 96,
    (datetime.date(2005, 8, 4), frozenset({"england", "australia"})): 98,
    (datetime.date(1960, 12, 9), frozenset({"west indies", "australia"})): 94,
    (datetime.date(2019, 8, 22), frozenset({"australia", "england"})): 92,
    (datetime.date(2021, 1, 15), frozenset({"australia", "india"})): 92,
    (datetime.date(1981, 7, 16), frozenset({"australia", "england"})): 90,
    (datetime.date(2016, 4, 3), frozenset({"england", "west indies"})): 96,
    (datetime.date(2007, 9, 24), frozenset({"india", "pakistan"})): 97,
    (datetime.date(2022, 10, 23), frozenset({"pakistan", "india"})): 92,
    (datetime.date(2011, 4, 2), frozenset({"sri lanka", "india"})): 90,
}
LEG = {(y, frozenset(ts)) for (d, ts), _ in FLOORS.items() for y in [d.year]}
def floor_for(m): return FLOORS.get((m["sd"], frozenset({m["team"].lower(), m["opp"].lower()})), 0)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workbook", default=MASTER)
    args = ap.parse_args()
    matches = load_matches(args.workbook)
    L = {"Test": E.run(build_series(matches), True),
         "ODI": E.run(build_limited(matches, "ODI"), False),
         "T20I": E.run(build_limited(matches, "T20I"), False)}
    def rating(fmt, team, d):
        r, n = L[fmt][team].rating(d); return (100.0 if r is None else r), n

    scored = []
    for m in matches:
        if m["res"].lower() in ("no result", "abandoned"): continue
        cl = closeness(m["detail"], m["fmt"]); st = stakes(m)
        rA, nA = rating(m["fmt"], m["team"], m["sd"]); rB, nB = rating(m["fmt"], m["opp"], m["sd"])
        qfac = max(0.0, min(1.0, (min(nA, nB) - 6) / 18.0))
        q = (0.55 * norm(min(rA, rB)) + 0.45 * norm((rA + rB) / 2)) * qfac
        core = 0.38 * cl + 0.38 * st + 0.24 * q
        gs = 100 * core * (0.80 + 0.20 * cl)
        fl = floor_for(m)
        if fl: gs = max(gs, fl)
        scored.append((gs, cl, st, q, m))
    scored.sort(key=lambda x: -x[0])

    fmax = {f: max((x[0] for x in scored if x[4]["fmt"] == f), default=1) for f in ("Test", "ODI", "T20I")}
    def rec(x):
        gs, cl, st, q, m = x
        return dict(fmt=m["fmt"], date=m["sd"].isoformat(), team=m["team"], teamSlug=slug(m["team"]),
            end=m["ed"].isoformat(), opp=m["opp"], oppSlug=slug(m["opp"]), winner=m["winner"], detail=m["detail"],
            major=m["major"] or None, round=m["round"] or None, tournament=m["tourn"] or None,
            venue=m["venue"] or None, city=m["city"] or None, country=m["country"] or None,
            gs=round(gs, 1), norm=round(gs / fmax[m["fmt"]] * 100, 1), editorPick=bool(floor_for(m)),
            cl=round(cl, 2), st=round(st, 2), q=round(q, 2))
    out = {"generated": datetime.date.today().isoformat(),
           "method": "GS=0.42*close+0.30*stakes+0.28*quality, closeness-gated, curated floor for all-time classics"}
    for f in ("Test", "ODI", "T20I"):
        out[f] = [rec(x) for x in scored if x[4]["fmt"] == f][:50]
    combined = sorted(scored, key=lambda x: -x[0] / fmax[x[4]["fmt"]])
    out["combined"] = [rec(x) for x in combined][:50]
    bt = collections.defaultdict(list)
    for x in combined:
        bt[slug(x[4]["team"])].append(x); bt[slug(x[4]["opp"])].append(x)
    out["by_team"] = {t: [rec(x) for x in v[:12]] for t, v in bt.items() if len(v) >= 4}
    def dec_of(x): y = int(x[4]["sd"].isoformat()[:4]); return f"{y // 10 * 10}s"
    by_decade = {}
    for f in ("Test", "ODI", "T20I"):
        bk = collections.defaultdict(list)
        for x in scored:
            if x[4]["fmt"] == f: bk[dec_of(x)].append(x)
        by_decade[f] = {d: [rec(x) for x in v[:12]] for d, v in bk.items()}
    ck = collections.defaultdict(list)
    for x in combined: ck[dec_of(x)].append(x)
    by_decade["All"] = {d: [rec(x) for x in v[:12]] for d, v in ck.items()}
    out["by_decade"] = by_decade
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    json.dump(out, open(DEST, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {DEST}: {len(matches)} matches, {len(out['by_team'])} teams")

if __name__ == "__main__":
    main()
