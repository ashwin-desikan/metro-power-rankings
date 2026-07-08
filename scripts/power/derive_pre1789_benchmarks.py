#!/usr/bin/env python3
"""derive_pre1789_benchmarks.py — derives the PREB constant embedded in build_power_history.py.

Covers 1500-1815 (incl. Napoleonic keyframes). Re-run only if the curated tables change.
Prints ranked views per benchmark; paste the printed PREB into build_power_history.py.

Pillars per benchmark year: curated MILITARY overlay, POPULATION share (Maddison),
GDP share (gdppc x pop, proxy gdppc where missing), curated REACH overlay.
Score = .30*mil + .25*dem + .31*econ + .14*reach, normalized. Era-relative tiers.
"""
import collections, openpyxl

import os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
XLSX = os.path.join(ROOT, "data", "power-history", "_incoming", "mpd2023_web.xlsx")
BENCH = [1500, 1600, 1650, 1700, 1750, 1789, 1800, 1812, 1815]

# ---- load maddison pop + gdppc at benchmarks (nearest within ±5y) ----
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb["Full data"]; it = ws.iter_rows(values_only=True); hdr = next(it)
ci = {h: i for i, h in enumerate(hdr)}
POP = collections.defaultdict(dict); GPC = collections.defaultdict(dict)
for r in it:
    code, yr, gpc, pop = r[ci["countrycode"]], r[ci["year"]], r[ci["gdppc"]], r[ci["pop"]]
    if not code or yr is None: continue
    yr = int(yr)
    if yr > 1825: continue   # include the 1820 benchmark so 1789 interpolates between real brackets
    if pop is not None: POP[code][yr] = float(pop)
    if gpc is not None: GPC[code][yr] = float(gpc)

def near(d, y, tol=8):
    """Value at y: exact/close match, else linear interpolation between bracketing
    years (Maddison pre-1800 is benchmark-resolution), else bounded flat extrapolation."""
    if not d: return None
    ys = sorted(d)
    lo = max((k for k in ys if k <= y), default=None)
    hi = min((k for k in ys if k >= y), default=None)
    if lo is not None and hi is not None:
        if lo == hi: return d[lo]
        f = (y - lo) / (hi - lo)
        return d[lo] * (1 - f) + d[hi] * f
    edge = lo if lo is not None else hi
    return d[edge] if abs(edge - y) <= 60 else None

# ---- curated fills ----
CUR_POP = {  # thousands; literature values, wide error bars
    "RUS": {1500: 10000, 1600: 14000, 1650: 15000, 1700: 18000, 1750: 24000, 1789: 36000},
    "HUN": {1500: 3500},  # independent Hungary pre-Mohacs
}
PROXY_GPC = {"RUS": "POL", "IRN": "TUR", "DNK": "SWE", "AUT": "DEU", "EGY": "TUR", "HUN": "POL"}
# imperial population adders (thousands) for territory beyond the Maddison row
EXTRA_POP = {
    "turkey":  {1500: 7000, 1600: 9500, 1650: 9500, 1700: 9000, 1750: 9000, 1789: 10000},  # Balkans+Levant beyond TUR(+EGY)
    "austria": {1600: 5000, 1650: 5500, 1700: 7000, 1750: 10000, 1789: 14000},             # Bohemia+Hungary beyond rump AUT
}
EXTRA_GPC_PROXY = {"turkey": "TUR", "austria": "DEU"}

# ---- entity allocation per benchmark: maddison code -> {slug: fraction} ----
def alloc(year):
    A = {
        "CHN": {"china": 1}, "JPN": {"japan": 1}, "FRA": {"france": 1}, "ESP": {"spain": 1},
        "POL": ({"poland": 1} if year < 1795 else
                {"russia": .45, "austria": .25, "germany": .30} if year < 1807 else
                {"duchy-of-warsaw": .50, "russia": .30, "austria": .10, "germany": .10} if year <= 1813 else
                {"russia": .55, "austria": .20, "germany": .25}),
        "SWE": {"sweden": 1}, "FIN": {"sweden": 1}, "DNK": {"denmark": 1},
        "RUS": {"russia": 1}, "IRN": {"iran": 1} if year >= 1600 else {},  # Safavids from 1501; 1500 skip
        "ITA": ({"republic-of-venice": .28, "kingdom-of-naples": .30, "tuscany": .10,
                 "duchy-of-milan": .12, "republic-of-genoa": .08, "vatican-city": .12}
                if year <= 1500 else
                {"republic-of-venice": .28, "kingdom-of-naples": .34, "tuscany": .12,
                 "republic-of-genoa": .10, "vatican-city": .16} if year <= 1700 else
                {"republic-of-venice": .24, "kingdom-of-naples": .34, "tuscany": .10,
                 "republic-of-genoa": .08, "vatican-city": .12, "italy": .12} if year < 1798 else
                {"kingdom-of-naples": .38, "italy": .14, "vatican-city": .12, "tuscany": .10, "france": .26} if year < 1809 else
                {"france": .60, "kingdom-of-naples": .30, "italy": .10} if year <= 1813 else
                {"kingdom-of-naples": .34, "austria": .22, "italy": .16, "vatican-city": .14, "tuscany": .14}),  # italy = Sardinia-Piedmont from 1720; Venetia to Austria 1815
        "GBR": {"england": 1} if year < 1707 else {"united-kingdom": 1},
        "PRT": {"spain": 1} if 1580 <= year <= 1640 else {"portugal": 1},  # Iberian Union
        "NLD": ({"holy-roman-empire": 1} if year <= 1500 else
                {"france": 1} if 1810 <= year <= 1813 else {"netherlands": 1}),  # annexed 1810-13
        "BEL": ({"holy-roman-empire": 1} if year <= 1500 else
                {"spain": 1} if year <= 1700 else
                {"austria": 1} if year < 1795 else
                {"france": 1} if year <= 1813 else {"netherlands": 1}),  # Spanish -> Austrian Netherlands -> annexed -> United Netherlands
        "DEU": ({"holy-roman-empire": 1} if year <= 1650 else
                {"holy-roman-empire": .85, "germany": .15} if year <= 1700 else
                {"holy-roman-empire": .78, "germany": .22} if year <= 1750 else
                {"holy-roman-empire": .70, "germany": .30} if year < 1806 else
                {"germany": .35, "bavaria": .20, "france": .30, "saxony": .15} if year <= 1813 else
                {"germany": .45, "bavaria": .18, "saxony": .13, "wurttemberg": .12, "baden": .12}),  # HRE dissolved 1806; Rhine Confederation under French sway; 1815 German Confederation
        "AUT": ({"holy-roman-empire": 1} if year <= 1500 else {"austria": 1}),
        "IND": ({"delhi-sultanate": .45, "vijayanagara-empire": .55} if year <= 1500 else
                {"india": 1} if year <= 1700 else
                {"india": .55, "maratha-empire": .45} if year <= 1750 else
                {"india": .30, "maratha-empire": .70} if year < 1795 else
                {"india": .25, "maratha-empire": .75}),  # colonies stay OFF the UK ledger pre-1816 for CINC-seam consistency; empire lives in reach
        "EGY": ({"mamluk-sultanate": 1} if year <= 1500 else {"turkey": 1}),
        "MEX": ({"aztec-empire": 1} if year <= 1500 else {"spain": 1}),
        "PER": ({"inca-empire": 1} if year <= 1500 else {"spain": 1}),
        "USA": ({"england": 1} if year < 1707 else {"united-kingdom": 1}) if year < 1776 else {"united-states": 1},
        "CUB": {"spain": 1}, "ZAF": {"netherlands": 1}, "HUN": {"hungary": 1} if year <= 1500 else {},
    }
    return A

# ---- curated military overlay (relative weights; army+navy composite) ----
MIL = {
1500: {"turkey": .20, "china": .14, "france": .12, "spain": .12, "holy-roman-empire": .10, "poland": .05,
       "england": .05, "republic-of-venice": .05, "russia": .04, "japan": .05, "delhi-sultanate": .04,
       "vijayanagara-empire": .04, "mamluk-sultanate": .04, "portugal": .03, "hungary": .03, "denmark": .01},
1600: {"turkey": .15, "spain": .16, "china": .11, "india": .09, "japan": .08, "france": .08,
       "holy-roman-empire": .06, "poland": .07, "england": .06, "netherlands": .06, "iran": .05,
       "russia": .05, "sweden": .03, "republic-of-venice": .03, "denmark": .02},
1650: {"france": .13, "turkey": .12, "india": .11, "china": .10, "spain": .09, "netherlands": .08,
       "england": .08, "sweden": .07, "austria": .06, "russia": .06, "poland": .04, "japan": .05,
       "iran": .04, "portugal": .02, "republic-of-venice": .02, "denmark": .02},
1700: {"france": .15, "china": .11, "india": .11, "turkey": .10, "russia": .09, "austria": .09,
       "england": .09, "spain": .06, "netherlands": .06, "sweden": .06, "japan": .04, "poland": .03,
       "iran": .03, "portugal": .02, "denmark": .02},
1750: {"france": .13, "united-kingdom": .12, "russia": .11, "china": .11, "austria": .10, "germany": .08,
       "turkey": .08, "india": .04, "maratha-empire": .05, "spain": .05, "japan": .03, "sweden": .03,
       "netherlands": .03, "iran": .03, "poland": .02, "denmark": .02, "portugal": .01},
1789: {"united-kingdom": .13, "france": .13, "russia": .12, "china": .11, "austria": .10, "germany": .09,
       "turkey": .07, "maratha-empire": .05, "spain": .05, "india": .02, "japan": .03, "sweden": .03,
       "netherlands": .02, "united-states": .02, "denmark": .02, "poland": .02, "portugal": .01},
1800: {"france": .20, "united-kingdom": .12, "russia": .12, "austria": .10, "china": .10, "germany": .07,
       "turkey": .06, "maratha-empire": .05, "spain": .04, "japan": .03, "united-states": .02, "sweden": .02,
       "denmark": .02, "india": .01, "netherlands": .01, "portugal": .01},
1812: {"france": .28, "russia": .14, "united-kingdom": .12, "china": .09, "austria": .07, "germany": .05,
       "turkey": .05, "maratha-empire": .04, "spain": .03, "japan": .03, "united-states": .02, "sweden": .02,
       "duchy-of-warsaw": .02, "kingdom-of-naples": .01, "india": .01, "denmark": .01, "portugal": .01},
1815: {"russia": .16, "united-kingdom": .14, "austria": .11, "france": .09, "germany": .09, "china": .09,
       "turkey": .06, "maratha-empire": .03, "spain": .03, "united-states": .03, "japan": .03, "sweden": .02,
       "netherlands": .02, "denmark": .01, "india": .01, "portugal": .01},
}
# ---- curated reach overlay (projection: navies, colonies, trade networks) ----
REACH = {
1500: {"portugal": .30, "spain": .22, "republic-of-venice": .15, "turkey": .12, "china": .06,
       "republic-of-genoa": .06, "france": .05, "england": .04},
1600: {"spain": .44, "netherlands": .10, "turkey": .12, "england": .11, "france": .08,
       "republic-of-venice": .07, "china": .04, "japan": .04},
1650: {"netherlands": .29, "spain": .19, "england": .15, "portugal": .11, "france": .10,
       "turkey": .08, "republic-of-venice": .04, "denmark": .04},
1700: {"england": .25, "netherlands": .22, "france": .18, "spain": .15, "portugal": .08,
       "turkey": .06, "denmark": .03, "republic-of-venice": .03},
1750: {"united-kingdom": .32, "france": .20, "spain": .14, "netherlands": .12, "portugal": .09,
       "turkey": .05, "denmark": .04, "russia": .04},
1789: {"united-kingdom": .38, "france": .18, "spain": .13, "netherlands": .09, "portugal": .07,
       "russia": .06, "turkey": .05, "denmark": .04},
1800: {"united-kingdom": .42, "france": .14, "spain": .12, "portugal": .07, "netherlands": .06,
       "russia": .06, "turkey": .05, "united-states": .03, "denmark": .03},
1812: {"united-kingdom": .48, "france": .12, "spain": .10, "russia": .08, "portugal": .06,
       "turkey": .05, "united-states": .04, "netherlands": .02, "denmark": .02},
1815: {"united-kingdom": .45, "france": .11, "russia": .09, "spain": .09, "netherlands": .06,
       "portugal": .06, "turkey": .05, "united-states": .04, "denmark": .02},
}
W_MIL, W_DEM, W_ECON, W_REACH = .30, .25, .31, .14

def tier(share, leader):
    if leader <= 0: return "Minor"
    r = share / leader
    if share >= 0.14 and r >= 0.60: return "Superpower"
    if r >= 0.25: return "Great Power"
    if r >= 0.10: return "Middle Power"
    if r >= 0.035: return "Regional"
    return "Minor"

def bench_scores(year):
    A = alloc(year)
    pop = collections.defaultdict(float); gdp = collections.defaultdict(float)
    for code, frac in A.items():
        p = near(POP.get(code, {}), year) or near(CUR_POP.get(code, {}), year, 60)
        if not p: continue
        g = near(GPC.get(code, {}), year)
        if not g:
            g = near(GPC.get(PROXY_GPC.get(code, ""), {}), year) or 600.0
        for slug, f in frac.items():
            pop[slug] += p * f
            gdp[slug] += p * g * f
    for slug, tab in EXTRA_POP.items():
        p = tab.get(year)
        if p and (slug in pop or year >= 1600):
            g = near(GPC.get(EXTRA_GPC_PROXY[slug], {}), year) or 600.0
            pop[slug] += p; gdp[slug] += p * g
    pt = sum(pop.values()) or 1; gt = sum(gdp.values()) or 1
    mil = MIL[year]; mt = sum(mil.values()) or 1
    rch = REACH[year]; rt = sum(rch.values()) or 1
    slugs = set(pop) | set(mil) | set(rch)
    raw = {s: W_MIL * mil.get(s, 0) / mt + W_DEM * pop.get(s, 0) / pt
              + W_ECON * gdp.get(s, 0) / gt + W_REACH * rch.get(s, 0) / rt for s in slugs}
    t = sum(raw.values()) or 1
    return {s: v / t for s, v in raw.items()}

def interp(a, b, f):
    slugs = set(a) | set(b)
    return {s: a.get(s, 0) * (1 - f) + b.get(s, 0) * f for s in slugs}

if __name__ == "__main__":
    cache = {y: bench_scores(y) for y in BENCH}
    for y in [1500, 1600, 1648, 1700, 1750]:
        if y in cache: sh = cache[y]
        else:
            lo = max(b for b in BENCH if b <= y); hi = min(b for b in BENCH if b >= y)
            sh = interp(cache[lo], cache[hi], (y - lo) / (hi - lo))
        rank = sorted(sh.items(), key=lambda x: -x[1]); lead = rank[0][1]
        print(f"\n=== {y} ===")
        for i, (s, v) in enumerate(rank[:14], 1):
            print(f" {i:>2}. {s:<24} {v*100:5.1f}%  {tier(v, lead)}")

    print("\nPREB = {")
    for y in BENCH:
        row=",".join(f"'{k}':{round(v,5)}" for k,v in sorted(cache[y].items(),key=lambda kv:-kv[1]) if v>0.0004)
        print(f"{y}:{{{row}}},")
    print("}")
