# -*- coding: utf-8 -*-
"""gen_hub_early.py - build completed-season club-football hubs for 2010-11, 2011-12, 2012-13.

Reuses the recovered pipeline math (build_season_hub's club power ranking, rebuild_tables'
build_groups for standings) but sources everything from Supabase cl_league_history + the kassiesa
archives instead of api-football bundles, which only exist 2013+. Writes the same shape the shared
app/teams/football/SeasonHub.tsx reads: public/data/football/hub-YYYY-YY.json.

  standings base  -> cl_rows.json (season-text keyed) via build_groups
  club ranking    -> domfix (domestic form) + kassiesa European matches (form)
                     + club_coeff_full merged with kassiesa team-coeff 06/07-07/08 (pedigree)
                     + kassiesa country coefficients (CF factor + countries[])
  continental     -> hubgen/continental_rbr.json (already validated byte-exact vs 2013-14)
  champions       -> cl_league_history champions='Y' (build_groups stars them inline)
  end_year        -> cl_league_history end_year, cross-checked vs the FIRST_YEAR_ENDERS rule

Run:  python gen_hub_early.py            # build + write the three hubs
      python gen_hub_early.py --validate # reproduce 2013-14 countries + rank sanity, no write
"""
import json, os, re, gzip, math, sys, unicodedata
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
UEFA = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(UEFA, "..", ".."))
DATA = os.path.join(UEFA, "data")
SC = os.path.join(ROOT, "scripts", "apifootball", "_scratch")
OUTDIR = os.path.join(ROOT, "public", "data", "football")

def jload(p):
    with open(p, encoding="utf-8") as f: return json.load(f)

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

# ---- per-season config: five-year windows (labels) + country-coeff window (end-years) ----
SEASONS = [
    {"key": "2006-07", "end": 2007, "domfix": "2007",
     "five": ["02/03", "03/04", "04/05", "05/06", "06/07"], "cur": "06/07",
     "cwin": [2003, 2004, 2005, 2006, 2007]},
    {"key": "2007-08", "end": 2008, "domfix": "2008",
     "five": ["03/04", "04/05", "05/06", "06/07", "07/08"], "cur": "07/08",
     "cwin": [2004, 2005, 2006, 2007, 2008]},
    {"key": "2008-09", "end": 2009, "domfix": "2009",
     "five": ["04/05", "05/06", "06/07", "07/08", "08/09"], "cur": "08/09",
     "cwin": [2005, 2006, 2007, 2008, 2009]},
    {"key": "2009-10", "end": 2010, "domfix": "2010",
     "five": ["05/06", "06/07", "07/08", "08/09", "09/10"], "cur": "09/10",
     "cwin": [2006, 2007, 2008, 2009, 2010]},
    {"key": "2010-11", "end": 2011, "domfix": "2011",
     "five": ["06/07", "07/08", "08/09", "09/10", "10/11"], "cur": "10/11",
     "cwin": [2007, 2008, 2009, 2010, 2011]},
    {"key": "2011-12", "end": 2012, "domfix": "2012",
     "five": ["07/08", "08/09", "09/10", "10/11", "11/12"], "cur": "11/12",
     "cwin": [2008, 2009, 2010, 2011, 2012]},
    {"key": "2012-13", "end": 2013, "domfix": "2013",
     "five": ["08/09", "09/10", "10/11", "11/12", "12/13"], "cur": "12/13",
     "cwin": [2009, 2010, 2011, 2012, 2013]},
]
# Calendar / spring-summer top flights whose YYYY-YY season ends in the FIRST year.
# The 2026-27 set from app/teams/football/2026-27/page.tsx, plus Japan (its J-League was a
# calendar-year competition in 2010-13, before the aborted 2026-27 autumn-spring switch).
FIRST_YEAR_ENDERS = {
    "Argentina", "Belarus", "Brazil", "China", "Estonia", "Faroe Islands", "Finland", "Georgia",
    "Iceland", "Ireland", "Kazakhstan", "Latvia", "Lithuania", "Norway", "South Korea", "Sweden",
    "United States", "Uruguay", "Japan",
}
TOP5 = {"England", "Spain", "Germany", "Italy", "France"}
# The eight leagues domfix carries as per-match fixtures (opponent-weighted domestic form). Every
# OTHER UEFA top flight has only its standings table, so those clubs' domestic W/D/L is folded into
# the ranking as an aggregate weighted by the league's average opponent strength (see compute_clubs).
DOMFIX_COUNTRIES = {"England", "Spain", "Germany", "Italy", "France", "Netherlands", "Portugal", "Scotland"}
NOTE = ("Club power ranking: 0.65 opponent- & stage-weighted quality per match + 0.35 pedigree "
        "+ current-season coefficient, less a losing-record penalty. Country coefficients are the "
        "full 5-year UEFA window (the era's team-coefficient method).")

# ================= STANDINGS BASE (build_groups, from rebuild_tables.py, verbatim math) ========
def I(v):
    try: return int(v)
    except: return None

def common_prefix(names):
    if len(names) < 2: return ""
    s1, s2 = min(names), max(names); i = 0
    while i < len(s1) and s1[i] == s2[i]: i += 1
    return s1[:i]

def pretty_label(raw):
    raw = (raw or "").strip().replace("Apertuera", "Apertura")
    if raw in ("Eastern", "Western"): return raw + " Conference"
    if re.fullmatch(r"\d+", raw): return "Group " + raw
    if re.fullmatch(r"[A-H]", raw): return "Zone " + raw
    return raw

def order_key(label):
    if not label: return (0, 0, "")
    l = label.lower()
    for i, t in enumerate(["clausura", "apertura"]):
        if t in l: return (1, i, "")
    for i, t in enumerate(["eastern", "western"]):
        if t in l: return (2, i, "")
    m = re.search(r"(\d+)", label)
    if m: return (3, int(m.group(1)), "")
    return (4, 0, label)

def build_groups(wb_idx, season, country, level):
    rows = list(wb_idx.get((season, country, level), []))
    if level == 1: rows = [r for r in rows if r.get("first_division") == "Y"] or rows
    if not rows: return None
    ng = [r for r in rows if not r.get("grp")]; sg = [r for r in rows if r.get("grp")]
    if ng and sg: rows = ng
    names = sorted(set(r.get("league") for r in rows))
    grps = sorted(set(r.get("grp") for r in rows if r.get("grp")))
    divs = sorted(set(str(r.get("division")) for r in rows if r.get("division") not in (None, "")))
    if len(names) > 1:
        pref = common_prefix(names)
        def _nl(nm):
            suf = (nm[len(pref):] if nm.startswith(pref) else nm).strip()
            if re.fullmatch(r"[A-Z0-9]", suf):
                lw = pref.strip().split()[-1] if pref.strip() else ""
                return (lw + " " + suf).strip()
            return suf.replace("Apertuera", "Apertura")
        part = lambda r: r.get("league"); lab = _nl
    elif len(grps) > 1:
        part = lambda r: r.get("grp"); lab = pretty_label
    elif len(divs) > 1:
        part = lambda r: str(r.get("division")); lab = pretty_label
    else:
        part = lambda r: None; lab = lambda k: None
    buckets = defaultdict(list)
    for r in rows: buckets[part(r)].append(r)
    groups = []
    for key, rr in buckets.items():
        rr = sorted(rr, key=lambda x: (I(x.get("place")) if I(x.get("place")) is not None else 99))
        out = []
        for r in rr:
            out.append({"rank": I(r.get("place")), "name": r.get("cur_name"), "lookup": r.get("cur_name"),
                "played": I(r.get("matches")), "win": I(r.get("w")), "draw": I(r.get("d")), "lose": I(r.get("l")),
                "gf": I(r.get("gs")), "ga": I(r.get("ga")), "gd": I(r.get("g_diff")), "points": I(r.get("points")),
                **({"champ": True} if r.get("champions") == "Y" else {})})
        groups.append({"label": lab(key) if len(buckets) > 1 else None, "rows": out})
    groups.sort(key=lambda g: order_key(g["label"]))
    return groups

LEAGUE_SUFFIX = re.compile(r"\s*[-–]\s*(Group|Serie|Zone|Apertura|Clausura|North|South|Promotion|Relegation).*$")
def clean_league_name(raw):
    return LEAGUE_SUFFIX.sub("", (raw or "").strip()).strip()

# ================= NAME MAPS + COEFFICIENT SOURCES ============================================
def load_core():
    core = {}
    core["cl"] = jload(os.path.join(HERE, "cl_rows.json"))
    core["ft"] = jload(os.path.join(SC, "football_team.json"))
    core["lk"] = jload(os.path.join(SC, "football_lookup.json"))
    core["ship"] = jload(os.path.join(ROOT, "public", "data", "football", "hub-2013-14.json"))
    core["cont"] = jload(os.path.join(HERE, "continental_rbr.json"))
    core["domfix"] = jload(os.path.join(DATA, "domfix_2007_2013.json"))
    core["cupfix"] = jload(os.path.join(DATA, "cupfix_2007_2023.json"))
    with gzip.open(os.path.join(UEFA, "_kassiesa_all_rows.json.gz"), "rt", encoding="utf-8") as f:
        core["eur"] = json.load(f)
    return core

def build_name_maps(core):
    ft, lk = core["ft"], core["lk"]
    cur2uefa = {}     # norm(cur/canon/lookup) -> uefa_name
    cur2look = {}     # norm(cur) -> lookup_name (best display lookup for club links)
    for r in ft:
        un = r.get("uefa_name")
        for fld in ("canonical_name", "lookup_name"):
            if r.get(fld) and un: cur2uefa.setdefault(norm(r[fld]), un)
        if r.get("canonical_name") and r.get("lookup_name"):
            cur2look.setdefault(norm(r["canonical_name"]), r["lookup_name"])
    for r in lk:
        un = r.get("uefa_name")
        for fld in ("cur_name", "team", "lookup_name"):
            if r.get(fld) and un: cur2uefa.setdefault(norm(r[fld]), un)
        if r.get("cur_name") and r.get("lookup_name"):
            cur2look.setdefault(norm(r["cur_name"]), r["lookup_name"])
    # dommap: (country, norm(raw club name)) -> canonical cur_name (for the domestic form feed).
    # Sourced from cl_league_history's own cur_name/team plus football_team canonical/lookup, which
    # cover the domfix export's club spellings at ~100% (football_lookup misses many top clubs).
    dommap = {}
    for r in core["cl"]:
        cn = r.get("cur_name"); ctry = r.get("country")
        if not cn or not ctry: continue
        for fld in ("cur_name", "team"):
            if r.get(fld): dommap.setdefault((ctry, norm(r[fld])), cn)
    for r in core["ft"]:
        can = r.get("canonical_name"); ctry = r.get("country")
        if not can or not ctry: continue
        for fld in ("canonical_name", "lookup_name"):
            if r.get(fld): dommap.setdefault((ctry, norm(r[fld])), can)
    return cur2uefa, cur2look, dommap

def build_ccf():
    """club_coeff_full.json (08/09-25/26) merged with kassiesa team-coeff Totals for 06/07 & 07/08,
    so the 5-year pedigree windows for 2010-11 and 2011-12 are complete. Keyed by uefa_name."""
    ccf = jload(os.path.join(UEFA, "club_coeff_full.json"))
    ccf_norm = {norm(k): k for k in ccf}
    lines = open(os.path.join(DATA, "uefateamcoeff_1956_2009.txt"), encoding="utf-8").read().split("\n")
    cur = None; added = 0; unmatched = 0
    for l in lines:
        m = re.search(r"UEFA Team Coefficients.*?(\d{4})/(\d{4})", l)   # tolerate "(method=2/3)" tag
        if m:
            cur = int(m.group(2)); continue
        # 2003 (02/03) lives on a "(method=2)" page; setdefault + file order keep the default-method
        # pages authoritative for 03/04-07/08, so folding method=2/3 pages here is safe.
        if cur not in (2003, 2004, 2005, 2006, 2007, 2008) or "\t" not in l: continue
        p = [x.strip() for x in l.split("\t")]
        if len(p) < 9: continue
        try: total = float(p[-3])
        except: continue
        team = p[-9]; lab = f"{(cur - 1) % 100:02d}/{cur % 100:02d}"   # 2004 -> 03/04 ... 2008 -> 07/08
        key = ccf_norm.get(norm(team))            # only fold into clubs already tracked in CCF
        if key:
            ccf[key].setdefault(lab, total); added += 1
        else:
            unmatched += 1
    print(f"  CCF merge: added {added} kassiesa 02/03-07/08 season points; {unmatched} kassiesa clubs not in CCF (ignored)")
    return ccf

def parse_country_coeff():
    """kassiesa country-coefficient pages -> {season_end: {country_name: coefficient}} using the
    per-season 'Average' value on each country's aggregate line."""
    lines = open(os.path.join(DATA, "uefacountrycoeff_history.txt"), encoding="utf-8").read().split("\n")
    out = defaultdict(dict); end = None; expect = None
    for l in lines:
        m = re.search(r"UEFA Country Coefficients (\d{4})/(\d{4})", l)
        if m:
            end = int(m.group(2)); expect = None; continue
        if end is None: continue
        s = l.rstrip("\r")
        if re.fullmatch(r"\d+\t", s) or re.fullmatch(r"\d+", s.rstrip("\t")):
            expect = "country"; continue
        if expect == "country":
            expect = "teams_hdr"; cur_country = s.strip(); continue
        if expect == "teams_hdr" and s.strip().endswith("teams"):
            expect = "agg"; continue
        if expect == "agg":
            parts = s.split("\t")
            try: avg = float(parts[-1])
            except: avg = None
            if avg is not None: out[end][cur_country] = avg
            expect = None
    return out

# ================= CLUB POWER RANKING (build_season_hub math, keyed by canonical name) =========
def stage_mult(comp, rnd):
    """Mirror build_season_hub.sm(): CL knockout ramps 1.35-1.5, group 1.2; EL knockout 1.25,
    group 1.1; qualifying / unlisted rounds 1.0. round_num: 1 Final .. 5 group, 6 qual, None other."""
    if comp == "CL":
        return {1: 1.5, 2: 1.45, 3: 1.4, 4: 1.35, 5: 1.2}.get(rnd, 1.0)
    if comp == "EL":
        return {1: 1.25, 2: 1.25, 3: 1.25, 4: 1.25, 5: 1.1}.get(rnd, 1.0)
    return 1.0

def cup_mult(comp):
    """Stage weight for a cup match, mirroring build_season_hub.sm's cup handling: UEFA Super Cup
    1.3, Intercontinental / Club World Cup 1.2, all domestic (major/minor/super) cups 1.0."""
    c = (comp or "").lower()
    if "uefa super" in c or "european super" in c: return 1.3
    if "intercontinental" in c or "club world" in c or "world club" in c or "toyota" in c: return 1.2
    return 1.0

def compute_clubs(cfg, uni, cur2uefa, cur2look, dommap, ccf, country5yr, domfix_year, cupfix_year, eur_rows, cont_secs, cup_secs, champ_curs, dom_rec):
    five, curlab = cfg["five"], cfg["cur"]
    canon2cur = {norm(cur): cur for cur in uni}
    def uf(cur): return cur2uefa.get(norm(cur))
    club_cur = {}; club_five = {}
    for cur in uni:
        u = uf(cur); cs = ccf.get(u, {}) if u else {}
        club_cur[cur] = cs.get(curlab, 0) or 0
        club_five[cur] = sum((cs.get(s) or 0) for s in five)
    MAXCUR = max(club_cur.values()) if club_cur else 1; MAXCUR = MAXCUR or 1
    MAX5 = max(club_five.values()) if club_five else 1; MAX5 = MAX5 or 1
    def fiveN(cur): return club_five.get(cur, 0) / MAX5
    def curN(cur): return club_cur.get(cur, 0) / MAXCUR
    ENG = country5yr.get("England") or 1.0
    def CF(country):
        v = country5yr.get(country)
        return math.sqrt(v / ENG) if v else 0.0
    def strength(cur):
        return max(0.5 * CF(uni[cur]) + 0.5 * fiveN(cur), 0.10) if cur in uni else 0.10
    agg = {cur: {"MP": 0, "W": 0, "D": 0, "L": 0, "Q": 0.0} for cur in uni}
    def result(me, opp, gf, ga, mult, wdl=None):
        if me not in agg or gf is None or ga is None: return
        A = agg[me]; A["MP"] += 1
        res = wdl if wdl in ("W", "D", "L") else ("W" if gf > ga else "L" if gf < ga else "D")
        A[res] += 1
        A["Q"] += (1.0 if res == "W" else 0.5 if res == "D" else 0.0) * strength(opp) * mult
    # domestic league form (weight 1.0)
    for m in domfix_year:
        h = dommap.get((m["country"], norm(m["home"])))
        a = dommap.get((m["country"], norm(m["away"])))
        hg, ag = m.get("hg"), m.get("ag")
        result(h, a, hg, ag, 1.0); result(a, h, ag, hg, 1.0)
    # cup form for the same top-8 leagues (domestic major/minor/super, UEFA Super Cup, Intercont /
    # Club World Cup). One row per club-match; opponent via the universe, floored at 0.10 if unknown.
    for m in cupfix_year:
        me = canon2cur.get(norm(m["cur"])); opp = canon2cur.get(norm(m["opp"]))
        result(me, opp if opp else m.get("opp"), m.get("gf"), m.get("ga"), cup_mult(m.get("comp")), m.get("wdl"))
    # European form (kassiesa CL/EL, both legs, stage-weighted)
    for r in eur_rows:
        comp = r.get("competition")
        if comp not in ("CL", "EL"): continue
        H, A = r.get("home_canon"), r.get("away_canon"); mult = stage_mult(comp, r.get("round_num"))
        if r.get("leg1_home") is not None:
            result(H, A, r["leg1_home"], r["leg1_away"], mult); result(A, H, r["leg1_away"], r["leg1_home"], mult)
        if r.get("leg2_home") is not None:
            result(H, A, r["leg2_home"], r["leg2_away"], mult); result(A, H, r["leg2_away"], r["leg2_home"], mult)
    # domestic aggregate for the leagues domfix does NOT carry per-match: fold each club's standings
    # W/D/L in, weighting the games by the league's average opponent strength (best proxy without a
    # fixture list). The eight domfix leagues keep their real per-match feed above (no double count).
    by_country = defaultdict(list)
    for cur, ctry in uni.items(): by_country[ctry].append(strength(cur))
    avg_str = {c: (sum(v) / len(v) if v else 0.10) for c, v in by_country.items()}
    for cur, (w, d, l) in dom_rec.items():
        ctry = uni.get(cur)
        if ctry in DOMFIX_COUNTRIES or cur not in agg: continue
        n = w + d + l
        if n <= 0: continue
        A = agg[cur]; A["MP"] += n; A["W"] += w; A["D"] += d; A["L"] += l
        A["Q"] += (w * 1.0 + d * 0.5) * avg_str.get(ctry, 0.10) * 1.0
    rates = [a["Q"] / a["MP"] for a in agg.values() if a["MP"] >= 8]
    maxRate = max(rates) if rates else 1.0
    # trophy bonus
    TB = defaultdict(float)
    def addb(name, w):
        if not name: return
        cur = name if name in agg else canon2cur.get(norm(name))
        if cur: TB[cur] += w
    # "UEFA Cup" is the pre-2009 name for the same competition as the Europa League; credit it equally
    # so the 2006-07/07-08/08-09 UEFA Cup winners (Sevilla, Zenit, Shakhtar) are not silently missed.
    BONUS = {"Champions League": 0.10, "Europa League": 0.05, "UEFA Cup": 0.05, "UEFA Super Cup": 0.04, "FIFA Club World Cup": 0.03}
    for sec in cont_secs:
        w = BONUS.get(sec.get("comp"))
        if not w: continue
        for e in (sec.get("entries") or []):
            if e.get("trophy"): addb(e.get("name"), w)
    for cur, ctry in champ_curs:
        addb(cur, 0.06 if ctry in TOP5 else 0.03)
    # domestic cup / super cup winners (top-8 leagues via build_cups), mirroring
    # regen_shipped_clubs.py's weights: 0.015 for a domestic cup, 0.01 for a super cup.
    for cp in (cup_secs or []):
        addb(cp.get("winner"), 0.015 if cp.get("type") == "Domestic cup" else 0.01)
    # assemble ranked clubs (MP>=8), dense rank on score
    clubs = []
    for cur, A in agg.items():
        if A["MP"] < 8: continue
        form = (A["Q"] / A["MP"]) / maxRate
        wp = (2 * A["W"] + A["D"]) / (2 * A["MP"])
        score = 0.65 * form + 0.35 * fiveN(cur) + 0.11 * curN(cur) - max(0.0, 0.5 - wp) * 0.6 + TB.get(cur, 0)
        clubs.append({"name": cur, "lookup": cur2look.get(norm(cur), cur), "country": uni[cur],
            "score": round(score, 4), "form": round(form, 3), "ped": round(fiveN(cur), 3),
            "winpct": round(wp, 3), "mp": A["MP"], "w": A["W"], "d": A["D"], "l": A["L"], "tb": round(TB.get(cur, 0), 3)})
    clubs.sort(key=lambda c: -c["score"]); prev = None; rk = 0
    for i, c in enumerate(clubs, 1):
        if c["score"] != prev: rk = i; prev = c["score"]
        c["rank"] = rk
    return clubs

# ================= ASSEMBLY (leagues[], countries[], name alignment) ==========================
CFILE2HUB = {
    "Bosnia and Herzegovina": "Bosnia-Herzegovina", "Republic of Ireland": "Ireland",
    "North Macedonia": "Macedonia", "FYR Macedonia": "Macedonia", "Faeroe Islands": "Faroe Islands",
}
def build_confed_map(ship):
    cm = {}
    for l in ship["leagues"]: cm.setdefault(l["country"], l["confed"])
    cm.setdefault("Macedonia", "UEFA")
    return cm

def build_leagues(cl_rows, key, end, confed_map):
    wb_idx = defaultdict(list)
    for r in cl_rows:
        if r.get("season") == key: wb_idx[(key, r.get("country"), r.get("level"))].append(r)
    pairs = sorted({(k[1], k[2]) for k in wb_idx}, key=lambda x: (x[0] or "", x[1] or 0))
    leagues = []; lid = 900001; ey_warn = 0
    for country, level in pairs:
        g = build_groups(wb_idx, key, country, level)
        if not g: continue
        rr = wb_idx[(key, country, level)]
        nm = clean_league_name(Counter(r.get("league") for r in rr).most_common(1)[0][0])
        eys = [r.get("end_year") for r in rr if r.get("end_year") is not None]
        ey = Counter(eys).most_common(1)[0][0] if eys else (end - 1 if country in FIRST_YEAR_ENDERS else end)
        rule = end - 1 if country in FIRST_YEAR_ENDERS else end
        if ey != rule: ey_warn += 1
        leagues.append({"league_id": lid, "name": nm, "country": country, "level": level,
                        "confed": confed_map.get(country, "UEFA"), "groups": g, "end_year": ey})
        lid += 1
    return leagues, ey_warn

def build_countries(cfg, ccountry, hub_country_set):
    norm2hub = {norm(c): c for c in hub_country_set}
    def to_hub(n):
        if n in CFILE2HUB: return CFILE2HUB[n]
        return norm2hub.get(norm(n), n)
    # gather every country that has a coefficient in any window season
    names = set()
    for ey in cfg["cwin"]:
        names |= set(ccountry.get(ey, {}).keys())
    rows = []
    for n in names:
        seasons = {}
        for i, ey in enumerate(cfg["cwin"]):
            v = ccountry.get(ey, {}).get(n)
            seasons[cfg["five"][i]] = round(v, 3) if v is not None else None
        coef = round(sum(v for v in seasons.values() if v is not None), 3)
        rows.append({"country": to_hub(n), "seasons": seasons, "coef": coef})
    rows.sort(key=lambda r: -r["coef"])
    for i, r in enumerate(rows, 1): r["rank"] = i
    return [{"rank": r["rank"], "country": r["country"], "seasons": r["seasons"], "coef": r["coef"]} for r in rows]

def country5yr_map(cfg, ccountry, hub_country_set):
    """{hub country name -> 5-year coef sum} for the CF() strength factor."""
    cs = build_countries(cfg, ccountry, hub_country_set)
    return {r["country"]: r["coef"] for r in cs}

# ================= DRIVER =====================================================================
def universe_and_champs(cl_rows, key, confed_map):
    uni = {}; champs = []; dom_rec = {}
    for r in cl_rows:
        if r.get("season") != key or r.get("level") != 1 or r.get("first_division") != "Y": continue
        if confed_map.get(r.get("country")) != "UEFA": continue
        cur = r.get("cur_name")
        uni[cur] = r.get("country")
        # domestic W/D/L straight from the standings row (the aggregate fed for non-domfix leagues)
        dom_rec.setdefault(cur, (I(r.get("w")) or 0, I(r.get("d")) or 0, I(r.get("l")) or 0))
        if r.get("champions") == "Y": champs.append((cur, r.get("country")))
    return uni, champs, dom_rec

def validate_countries(core, ccountry):
    """Reproduce the shipped 2013-14 countries[] from the parsed country-coeff file."""
    cfg = {"cwin": [2010, 2011, 2012, 2013, 2014], "five": ["09/10", "10/11", "11/12", "12/13", "13/14"]}
    hubset = {l["country"] for l in core["ship"]["leagues"]} | {c["country"] for c in core["ship"]["countries"]}
    got = build_countries(cfg, ccountry, hubset)
    got_by = {c["country"]: c for c in got}
    ship = core["ship"]["countries"]
    exact = 0; near = 0; bad = []
    for s in ship:
        g = got_by.get(s["country"])
        if not g: bad.append((s["country"], "MISSING")); continue
        if abs(g["coef"] - s["coef"]) < 0.01: exact += 1
        elif abs(g["coef"] - s["coef"]) < 0.5: near += 1
        else: bad.append((s["country"], f"{g['coef']} vs {s['coef']}"))
    print(f"[validate] 2013-14 countries: {exact} exact, {near} within 0.5, {len(bad)} off (of {len(ship)})")
    for b in bad[:12]: print("   ", b)
    print("   top5 reproduced:", [(g['country'], g['coef']) for g in got[:5]])

def main(validate=False):
    core = load_core()
    cur2uefa, cur2look, dommap = build_name_maps(core)
    ccf = build_ccf()
    ccountry = parse_country_coeff()
    confed_map = build_confed_map(core["ship"])
    hubset = {r["country"] for r in core["cl"]} | {l["country"] for l in core["ship"]["leagues"]} | set(confed_map)
    if validate:
        validate_countries(core, ccountry)
    eur_by = defaultdict(list)
    for r in core["eur"]: eur_by[r.get("season")].append(r)
    cup_rows = load_cup_rows()
    for cfg in SEASONS:
        key, end = cfg["key"], cfg["end"]
        uni, champs, dom_rec = universe_and_champs(core["cl"], key, confed_map)
        leagues, ey_warn = build_leagues(core["cl"], key, end, confed_map)
        countries = build_countries(cfg, ccountry, hubset)
        c5yr = {c["country"]: c["coef"] for c in countries}
        cups = build_cups(key, cup_rows)
        clubs = compute_clubs(cfg, uni, cur2uefa, cur2look, dommap, ccf, c5yr,
                              core["domfix"].get(cfg["domfix"], []),
                              core["cupfix"].get(cfg["domfix"], []), eur_by.get(key, []),
                              core["cont"].get(key, []), cups, champs, dom_rec)
        hub = {"season": key, "clubSeasons": cfg["five"], "note": NOTE, "clubs": clubs,
               "countries": countries, "leagues": leagues, "continental": core["cont"].get(key, []), "cups": cups}
        print(f"\n=== {key}: {len(clubs)} clubs · {len(leagues)} leagues · {len(countries)} countries · "
              f"{len(hub['continental'])} continental · {len(cups)} cups · end_year-rule-mismatch {ey_warn} ===")
        print("  universe", len(uni), "| top 15:")
        for c in clubs[:15]:
            print(f"   {c['rank']:2} {c['name']:26} {c['country']:14} score={c['score']:.4f} form={c['form']:.3f} ped={c['ped']:.3f} tb={c['tb']:.3f} mp={c['mp']}")
        if not validate:
            fn = os.path.join(OUTDIR, f"hub-{key}.json")
            with open(fn, "w", encoding="utf-8") as f: json.dump(hub, f, ensure_ascii=False)
            print("  wrote", fn, f"({round(os.path.getsize(fn)/1e6,2)} MB)")

# ================= CUPS (workbook 'Cup History' sheet) ========================================
CUP_WB = r"C:\Users\ashwi\OneDrive\Excel Files\Champions League-201516.xlsx"
CUP_NAMES = {
    "England": {"major": "FA Cup", "minor": "League Cup", "super": "Community Shield"},
    "Spain": {"major": "Copa del Rey", "super": "Supercopa de Espana"},
    "Germany": {"major": "DFB-Pokal", "super": "DFL-Supercup"},
    "Italy": {"major": "Coppa Italia", "super": "Supercoppa Italiana"},
    "France": {"major": "Coupe de France", "minor": "Coupe de la Ligue", "super": "Trophee des Champions"},
    "Portugal": {"major": "Taca de Portugal", "minor": "Taca da Liga", "super": "Supertaca"},
    "Netherlands": {"major": "KNVB Beker", "super": "Johan Cruyff Shield"},
    "Scotland": {"major": "Scottish Cup", "minor": "Scottish League Cup"},
}

def load_cup_rows():
    """Read the workbook 'Cup History' sheet once; return rows for the target seasons. Degrades to
    an empty list (cups become []) if openpyxl or the workbook is unavailable."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(CUP_WB, read_only=True, data_only=True)
    except Exception as e:
        print("  cups: workbook unavailable, cups[] will be empty --", e); return None
    ws = wb["Cup History"]; it = ws.iter_rows(values_only=True)
    hdr = [str(h).strip() if h is not None else "" for h in next(it)]
    ix = {h: i for i, h in enumerate(hdr)}
    want = {"2006-07", "2007-08", "2008-09", "2009-10", "2010-11", "2011-12", "2012-13"}
    out = []
    for r in it:
        s = r[ix["Season"]] if ix.get("Season") is not None else None
        if s in want:
            out.append({"season": s, "league": r[ix["League"]], "club": r[ix["Cur. Name"]],
                "maj": r[ix["Cup (Major Domestic)"]], "majf": r[ix["Cup Final (Major Domestic)"]],
                "min": r[ix["Cup (Minor Domestic)"]], "minf": r[ix["Cup Final (Minor Domestic)"]],
                "sup": r[ix["Super Cup"]], "supf": r[ix["Super Cup Final"]]})
    wb.close()
    return out

def _Y(v): return str(v).strip().upper() == "Y"

def build_cups(key, cup_rows):
    if not cup_rows: return []
    sub = [r for r in cup_rows if r["season"] == key]
    out = []
    for country, names in CUP_NAMES.items():
        crows = [r for r in sub if r["league"] == country]
        for kind, wflag, fflag, typ in (("major", "maj", "majf", "Domestic cup"),
                                        ("minor", "min", "minf", "Domestic cup"),
                                        ("super", "sup", "supf", "Super cup")):
            comp = names.get(kind)
            if not comp: continue
            winners = [r["club"] for r in crows if _Y(r[wflag])]
            finalists = [r["club"] for r in crows if _Y(r[fflag]) and not _Y(r[wflag])]
            if not winners: continue
            out.append({"type": typ, "country": country, "comp": comp, "winner": winners[0],
                        "winner_lookup": winners[0], "runnerup": (finalists[0] if finalists else ""), "score": ""})
    out.sort(key=lambda c: ({"Domestic cup": 0, "Super cup": 1}[c["type"]], c["country"]))
    return out

if __name__ == "__main__":
    main(validate="--validate" in sys.argv)
