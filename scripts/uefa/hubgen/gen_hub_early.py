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

# Article-insensitive normalization for a best-effort coefficient-name fallback: bridges spelling
# variants that differ only by connecting articles, e.g. cl_league_history's "Deportivo de La
# Coruña" vs the UEFA/CCF "Deportivo La Coruña". Used ONLY when the exact crosswalk lookup misses.
_ARTICLES = {"de", "la", "le", "el", "del", "di", "do", "da", "the", "of", "les", "los"}
def loose_norm(s):
    return " ".join(t for t in norm(s).split() if t not in _ARTICLES)

# Transliteration normalization for the deep-history windows: club_coeff_full carries some 1990s
# Eastern-European sides under both an old and a modern romanization (e.g. "Dinamo Kiev" holds the
# late-90s coefficients while the crosswalk resolves the club to the empty modern "Dynamo Kyiv"
# entry). Collapsing the well-known variant tokens lets the resolver UNION both entries and recover
# the orphaned pedigree. Whole-word only, minimal set, so unrelated clubs never collide.
_TRANSLIT = [("dynamo", "dinamo"), ("kyiv", "kiev"), ("kiew", "kiev"), ("moskva", "moscow")]
def translit_norm(s):
    t = loose_norm(s)
    for a, b in _TRANSLIT: t = re.sub(rf"\b{a}\b", b, t)
    return t

# ---- per-season config: five-year windows (labels) + country-coeff window (end-years) ----
# Seasons 1959-60 .. 1991-92 are generated (the pattern is fully regular); 1992-93 onward stay
# explicit below. _mk_season(end_year) yields the same shape used by hand: the five-year team-coeff
# window (labels like 88/89) plus the 5-year country-coeff window (end-years).
def _mk_season(end):
    yy = lambda y: f"{(y - 1) % 100:02d}/{y % 100:02d}"
    return {"key": f"{end - 1}-{str(end)[2:]}", "end": end, "domfix": str(end),
            "five": [yy(y) for y in range(end - 4, end + 1)], "cur": yy(end),
            "cwin": list(range(end - 4, end + 1))}
SEASONS = [_mk_season(e) for e in range(1960, 1993)] + [
    {"key": "1992-93", "end": 1993, "domfix": "1993",
     "five": ["88/89", "89/90", "90/91", "91/92", "92/93"], "cur": "92/93",
     "cwin": [1989, 1990, 1991, 1992, 1993]},
    {"key": "1993-94", "end": 1994, "domfix": "1994",
     "five": ["89/90", "90/91", "91/92", "92/93", "93/94"], "cur": "93/94",
     "cwin": [1990, 1991, 1992, 1993, 1994]},
    {"key": "1994-95", "end": 1995, "domfix": "1995",
     "five": ["90/91", "91/92", "92/93", "93/94", "94/95"], "cur": "94/95",
     "cwin": [1991, 1992, 1993, 1994, 1995]},
    {"key": "1995-96", "end": 1996, "domfix": "1996",
     "five": ["91/92", "92/93", "93/94", "94/95", "95/96"], "cur": "95/96",
     "cwin": [1992, 1993, 1994, 1995, 1996]},
    {"key": "1996-97", "end": 1997, "domfix": "1997",
     "five": ["92/93", "93/94", "94/95", "95/96", "96/97"], "cur": "96/97",
     "cwin": [1993, 1994, 1995, 1996, 1997]},
    {"key": "1997-98", "end": 1998, "domfix": "1998",
     "five": ["93/94", "94/95", "95/96", "96/97", "97/98"], "cur": "97/98",
     "cwin": [1994, 1995, 1996, 1997, 1998]},
    {"key": "1998-99", "end": 1999, "domfix": "1999",
     "five": ["94/95", "95/96", "96/97", "97/98", "98/99"], "cur": "98/99",
     "cwin": [1995, 1996, 1997, 1998, 1999]},
    {"key": "1999-00", "end": 2000, "domfix": "2000",
     "five": ["95/96", "96/97", "97/98", "98/99", "99/00"], "cur": "99/00",
     "cwin": [1996, 1997, 1998, 1999, 2000]},
    {"key": "2000-01", "end": 2001, "domfix": "2001",
     "five": ["96/97", "97/98", "98/99", "99/00", "00/01"], "cur": "00/01",
     "cwin": [1997, 1998, 1999, 2000, 2001]},
    {"key": "2001-02", "end": 2002, "domfix": "2002",
     "five": ["97/98", "98/99", "99/00", "00/01", "01/02"], "cur": "01/02",
     "cwin": [1998, 1999, 2000, 2001, 2002]},
    {"key": "2002-03", "end": 2003, "domfix": "2003",
     "five": ["98/99", "99/00", "00/01", "01/02", "02/03"], "cur": "02/03",
     "cwin": [1999, 2000, 2001, 2002, 2003]},
    {"key": "2003-04", "end": 2004, "domfix": "2004",
     "five": ["99/00", "00/01", "01/02", "02/03", "03/04"], "cur": "03/04",
     "cwin": [2000, 2001, 2002, 2003, 2004]},
    {"key": "2004-05", "end": 2005, "domfix": "2005",
     "five": ["00/01", "01/02", "02/03", "03/04", "04/05"], "cur": "04/05",
     "cwin": [2001, 2002, 2003, 2004, 2005]},
    {"key": "2005-06", "end": 2006, "domfix": "2006",
     "five": ["01/02", "02/03", "03/04", "04/05", "05/06"], "cur": "05/06",
     "cwin": [2002, 2003, 2004, 2005, 2006]},
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
# Post-Heysel European ban (English clubs, 1985-86..1989-90). Two levers, deliberately split:
#   BAN_DECAY_TEAM    fades the team coefficient (a club's EUROPEAN pedigree, the 0.35 ped term).
#                     A flat hold overstated it (frozen peak despite no European football), so ban-
#                     year n holds preban * BAN_DECAY_TEAM**n (n=1 for 85/86 .. 5 for 89/90). Real
#                     pre-ban seasons still in the 5-yr window carry legitimately; only the lockout
#                     slots fade. Net effect: the best English side is #1-5 in the early ban years
#                     (earned trailing pedigree) and settles to ~#8 once the window is all lockout.
#   BAN_DECAY_COUNTRY fades England's country coefficient (the DOMESTIC-league strength proxy that
#                     weights opponents in the 0.65 form term). The English league genuinely stayed
#                     strong through the lockout, so this is held flat (1.0) — cutting it as well
#                     over-punishes form and buries sides that were dominating good opposition.
BAN_DECAY_TEAM = 0.6
BAN_DECAY_COUNTRY = 1.0
# Pre-Bundesliga German Championship qualifiers (1959-60..1962-63). Only the ~9 championship
# qualifiers per season enter the universe (not the ~80 regional Oberliga clubs), so the usual
# per-country average opponent strength is unavailable and would be inflated by an elite-only field.
# Their two form buckets are therefore weighted by fixed opponent strengths: the full regional
# Oberliga league record at a modest regional level, the national championship-group games (elite vs
# elite) at a high level. Tunable; calibrated so the qualifiers land sensibly against the rest of Europe.
OBERLIGA_OPP_STR = 0.4
CHAMP_OPP_STR = 0.85
# Opponent-strength blend in the form engine: strength(opp) = CF_WEIGHT * country factor + (1-CF_WEIGHT)
# * the opponent's own 5-year pedigree (fiveN), floored at 0.10. The country factor is sqrt(country_coef
# / England_coef), optionally capped at CF_CAP. A temporarily dominant league (Spain early-60s, Germany
# mid/late-70s) otherwise inflates EVERY one of its clubs' domestic form and floods the top of the table
# (7 Spanish sides in the 1961-62 top 10; a German club #1 nearly every year 1974-81). Lowering CF_WEIGHT
# shifts weight onto a club's OWN pedigree, and CF_CAP stops the strongest league running away.
CF_WEIGHT = 0.4
CF_CAP = None
# Winner's trophy bonus for the top continental competition (European Cup / Champions League). The
# ranking is otherwise heavily backward-looking (0.35 pedigree + country coefficient), so the actual
# European champion can sit below a pedigree-heavy non-winner from a strong league — English clubs won
# the European Cup 1977-81 yet German clubs ranked #1. Raising this surfaces the real winner. Also
# governs the long-standing Red Star 1990-91 case (European Cup winners should be top-tier that year).
TOP_TROPHY_BONUS = 0.10
# Weight of the 5-year pedigree term in the club score (score = 0.65 form + PED_WEIGHT pedigree +
# 0.11 current-coef - penalty + trophies). Pedigree is a TRAILING window, so a high value keeps a
# fading dynasty (Gladbach 1979-80, mediocre that season but maxed on 1975-77 pedigree) at #1 over the
# club that actually won Europe. Lowering it makes the table more current-season driven. Global lever.
PED_WEIGHT = 0.35
# Pedigree normalization. fiveN divides a club's 5-year coefficient window by a reference. Dividing by
# the single MAX makes an exceptionally sustained club (Gladbach's 1975-79 window) a lone 1.0 outlier
# ~0.3 clear of the field, which the pedigree weight then turns into a decisive edge over clubs with a
# far better CURRENT season. Set PED_TOPK to normalize by the MEAN of the top-K windows instead (cap
# 1.0): the genuine elite bunch near the top and pedigree spreads across many clubs, as it should.
# None reverts to the old divide-by-max behaviour.
PED_TOPK = 6
# Manual, editorial one-off trophy-bonus adjustments, keyed by (season, canonical club name). Reserved
# for genuinely exceptional cases the automatic model undersells. Ajax 1994-95 won the Champions League
# losing a single match all season (37-11-1); the model placed them #2 behind a Juventus side that won
# the lesser UEFA Cup with 10 losses, on higher opponent-weighted form. +0.05 lifts the actual European
# champion to #1. Kept deliberately tiny and few; each entry is a documented editorial decision.
MANUAL_TB = {("1994-95", "Ajax"): 0.05}
# The eight leagues domfix carries as per-match fixtures (opponent-weighted domestic form). Every
# OTHER UEFA top flight has only its standings table, so those clubs' domestic W/D/L is folded into
# the ranking as an aggregate weighted by the league's average opponent strength (see compute_clubs).
DOMFIX_COUNTRIES = {"England", "Spain", "Germany", "Italy", "France", "Netherlands", "Portugal", "Scotland"}
NOTE = ("Club power ranking: 0.65 opponent- & stage-weighted quality per match + 0.35 pedigree "
        "+ current-season coefficient, less a losing-record penalty. Country coefficients are the "
        "full 5-year UEFA window (the era's team-coefficient method).")
# Domestic cup honours, flag-driven, for EVERY UEFA nation and all seasons. (tier, kind) -> (winner,
# finalist). Top-8 nations score above the rest, majors above minors, winners above finalists; super
# cups are separate (0.01, from the workbook). Values are deliberately small vs a league title (0.03-
# 0.06) so cups stay a minor term.
CUP_TROPHY = {("top8", "major"): (0.015, 0.008), ("top8", "minor"): (0.010, 0.005),
              ("other", "major"): (0.010, 0.005), ("other", "minor"): (0.006, 0.003)}
# Pre-1993 top-8 cup FORM imputation (there is no per-match cupfix before 1993): a light block of
# opponent-weighted notional (wins, losses) folded into form so a cup run still counts. Winner
# reaches and lifts the trophy; finalist wins the semis and loses the final.
CUP_IMPUTE = {"major": {"win": (3, 0), "final": (2, 1)}, "minor": {"win": (2, 0), "final": (1, 1)}}

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
            out.append({"rank": I(r.get("place")), "name": r.get("team") or r.get("cur_name"), "lookup": r.get("cur_name"),
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
    # Real domestic-cup per-match W/D/L for the pre-1992-93 seasons, replacing the imputed cup nudge
    # for the covered nations: England FA/League Cup (build_eng_cups.py) and Germany DFB-Pokal
    # (build_de_cups.py). Merged into ONE per-season list, each row tagged with its country so the
    # imputation is switched off only for nations that actually have real cup data that season.
    # Optional: any missing artifact simply leaves that nation on imputation.
    natcup = defaultdict(list)
    for fn, ctry in (("eng_cups_pre93.json", "England"), ("dfb_cups_pre93.json", "Germany")):
        p = os.path.join(DATA, fn)
        if os.path.exists(p):
            for season, rows in jload(p).items():
                for r in rows:
                    rr = dict(r); rr["country"] = ctry
                    natcup[season].append(rr)
    core["natcup"] = natcup
    # Pre-Bundesliga German Championship qualifiers 1959-60..1962-63 (build_de_champ.py): the only
    # German clubs for those four seasons (the pipeline's German data otherwise starts at the 1963-64
    # Bundesliga). Injected into the universe in main(). Optional.
    dcp = os.path.join(DATA, "de_champ_5963.json")
    core["dechamp"] = jload(dcp) if os.path.exists(dcp) else {}
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

def build_ccf(decay=BAN_DECAY_TEAM):
    """club_coeff_full.json (08/09-25/26) merged with kassiesa team-coeff Totals for 06/07 & 07/08,
    so the 5-year pedigree windows for 2010-11 and 2011-12 are complete. Keyed by uefa_name."""
    ccf = jload(os.path.join(UEFA, "club_coeff_full.json"))
    ccf_norm = {norm(k): k for k in ccf}
    lines = open(os.path.join(DATA, "uefateamcoeff_1956_2009.txt"), encoding="utf-8").read().split("\n")
    cur = None; added = 0; seeded = 0; club_country = {}
    for l in lines:
        m = re.search(r"UEFA Team Coefficients.*?(\d{4})/(\d{4})", l)   # tolerate "(method=2/3)" tag
        if m:
            cur = int(m.group(2)); continue
        # 2003 (02/03) lives on a "(method=2)" page; setdefault + file order keep the default-method
        # pages authoritative for 03/04-07/08, so folding method=2/3 pages here is safe.
        # Range starts at 1956 (label 55/56) so the deep-history hubs' 5-year pedigree windows fill
        # all the way to the 1959-60 floor (needs 55/56..59/60). uefateamcoeff_1956_2009.txt carries
        # these pages; Team is col 1 and season Total col 7 on the pre-1996 pages too (same
        # column-stable layout as 1996-98).
        if cur not in range(1956, 2009) or "\t" not in l: continue
        p = [x.strip() for x in l.split("\t")]
        if len(p) < 9: continue
        # Column-stable across both eras: rank(0) Team(1) Country(2) Comp(3) ... Total(7). The 1990s
        # "method=1" pages are 9-col and the 1999+ pages 10-col (an extra Country-part column before
        # the cumulative coefficient), but Team is always col 1 and the season Total always col 7 —
        # unlike the old negative-index parse, which only aligned on the 10-col layout and read rank
        # (not the club) as the team on the 9-col 1996-1998 pages.
        team = p[1]
        if not team or re.fullmatch(r"[\d.]*", team): continue   # skip header / rank-only rows
        try: total = float(p[7])
        except: continue
        lab = f"{(cur - 1) % 100:02d}/{cur % 100:02d}"   # 1996 -> 95/96 ... 2008 -> 07/08
        key = ccf_norm.get(norm(team))            # fold into an already-tracked CCF club when possible
        if key:
            ccf[key].setdefault(lab, total); added += 1
        else:
            # club absent from the modern club_coeff_full (08/09+) — e.g. AC Parma, defunct/reformed
            # sides that had real UEFA pedigree in the early-2000s window. Seed a new CCF entry from
            # the kassiesa txt so their pedigree isn't silently zeroed. Keyed by the txt (uefa) name.
            ccf.setdefault(team, {}).setdefault(lab, total)
            ccf_norm.setdefault(norm(team), team)
            key = team; added += 1; seeded += 1
        if len(p) > 2 and p[2]: club_country.setdefault(key, p[2])   # 3-letter code: Eng, Esp, Rus, ...
    print(f"  CCF merge: added {added} kassiesa 99/00-07/08 season points ({seeded} new pre-2008 clubs seeded)")
    # English clubs' team coefficients cratered to zero during the post-Heysel European ban
    # (1985-86..1989-90). A flat carry-forward of the last pre-ban 84/85 value overstated them
    # (frozen peak pedigree despite no European football). Instead FADE it geometrically: ban-year n
    # holds 84/85 * BAN_DECAY**n, so pedigree stays strong but declines through the lockout.
    imp = 0
    ban_labels = ("85/86", "86/87", "87/88", "88/89", "89/90")
    for k, cc in club_country.items():
        if cc == "Eng" and ccf.get(k, {}).get("84/85") is not None:
            base = ccf[k]["84/85"]
            for n, lab in enumerate(ban_labels, 1):
                ccf[k][lab] = base * (decay ** n); imp += 1
    print(f"  England ban team-coeff fade (decay={decay}): {imp} club-seasons faded")
    return ccf

def parse_country_coeff(decay=BAN_DECAY_COUNTRY):
    """kassiesa country-coefficient pages -> {season_end: {country_name: coefficient}} using the
    per-season 'Average' value on each country's aggregate line."""
    lines = open(os.path.join(DATA, "uefacountrycoeff_history.txt"), encoding="utf-8").read().split("\n")
    out = defaultdict(dict); end = None; expect = None
    for l in lines:
        # ".*?" tolerates the "(method=1)" tag on the 1994/95-1997/98 pages, where the era's country
        # coefficients live — without it those four seasons (needed for the 1999-2003 windows) are
        # skipped. Method-tagged country pages exist ONLY for 1995-1998, so this is purely additive.
        m = re.search(r"UEFA Country Coefficients.*?(\d{4})/(\d{4})", l)
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
    # European-ban imputation: a country locked out of Europe earns zero coefficient, cratering its
    # 5-year window and burying its (still strong) domestic clubs. Treat the ban as MISSING data but
    # FADE the last pre-ban value across the ban rather than freezing it, so the league's strength
    # proxy eases toward the field. England: post-Heysel, seasons 1985-86..1989-90 (end-years 1986..
    # 1990), starting from the 1984-85 (end-year 1985) value * BAN_DECAY**n.
    if out.get(1985, {}).get("England") is not None:
        base = out[1985]["England"]
        for n, y in enumerate(range(1986, 1991), 1):
            out[y]["England"] = base * (decay ** n)
    return out

# ================= CLUB POWER RANKING (build_season_hub math, keyed by canonical name) =========
def stage_mult(comp, rnd):
    """Mirror build_season_hub.sm(): CL knockout ramps 1.35-1.5, group 1.2; EL knockout 1.25,
    group 1.1; qualifying / unlisted rounds 1.0. round_num: 1 Final .. 5 group, 6 qual, None other."""
    if comp == "CL":
        return {1: 1.5, 2: 1.45, 3: 1.4, 4: 1.35, 5: 1.2}.get(rnd, 1.0)
    if comp == "EL":
        return {1: 1.25, 2: 1.25, 3: 1.25, 4: 1.25, 5: 1.1}.get(rnd, 1.0)
    if comp == "CWC":
        # European Cup Winners' Cup (1960-1999): pure knockout, prestige between the European Cup
        # and the UEFA Cup. Weighted just below CL knockout, at/above EL; no group stage (round_num
        # 1 Final .. 4 R16). Only appears in the pre-2000 hubs; a no-op for CL/EL-only seasons.
        return {1: 1.35, 2: 1.3, 3: 1.3, 4: 1.25}.get(rnd, 1.0)
    if comp == "ICFC":
        # Inter-Cities Fairs Cup (1955-1971): the UEFA Cup's direct predecessor, same third-tier
        # standing, so weighted exactly like the EL knockout. Only appears in the 1959-60..1970-71
        # hubs. kassiesa labels it ICFC; the workbook carries it under the EL code (name differs).
        return {1: 1.25, 2: 1.25, 3: 1.25, 4: 1.25, 5: 1.1}.get(rnd, 1.0)
    return 1.0

def cup_mult(comp):
    """Stage weight for a cup match, mirroring build_season_hub.sm's cup handling: UEFA Super Cup
    1.3, Intercontinental / Club World Cup 1.2, all domestic (major/minor/super) cups 1.0."""
    c = (comp or "").lower()
    if "uefa super" in c or "european super" in c: return 1.3
    if "intercontinental" in c or "club world" in c or "world club" in c or "toyota" in c: return 1.2
    return 1.0

def compute_clubs(cfg, uni, cur2uefa, cur2look, dommap, ccf, country5yr, domfix_year, cupfix_year, eur_rows, cont_secs, cup_secs, champ_curs, dom_rec, cup_flags, team_name=None, nat_cup_year=None, de_early=None):
    five, curlab = cfg["five"], cfg["cur"]
    canon2cur = {norm(cur): cur for cur in uni}
    def uf(cur): return cur2uefa.get(norm(cur))
    # Coefficient resolution: exact crosswalk uefa_name first; then an article-insensitive fallback
    # against the CCF keys (catches cl_league_history spellings that differ only by articles, e.g.
    # "Deportivo de La Coruña" -> CCF "Deportivo La Coruña").
    ccf_alias = {}
    for k in ccf: ccf_alias.setdefault(loose_norm(k), k)
    translit_groups = defaultdict(list)
    for k in ccf: translit_groups[translit_norm(k)].append(k)
    def coeffs(cur):
        u = uf(cur)
        keys = set()
        if u and u in ccf: keys.add(u)
        for base in (cur, u):
            if not base: continue
            a = ccf_alias.get(loose_norm(base))
            if a: keys.add(a)
            keys.update(translit_groups.get(translit_norm(base), []))
        if not keys: return {}
        # union across the club's variant entries, filling gaps (first non-null wins); the primary
        # crosswalk key is preferred where it has a value.
        merged = dict(ccf.get(u, {})) if (u and u in ccf) else {}
        for k in keys:
            for lab, v in ccf[k].items():
                if v is not None and merged.get(lab) is None: merged[lab] = v
        return merged
    club_cur = {}; club_five = {}
    for cur in uni:
        cs = coeffs(cur)
        club_cur[cur] = cs.get(curlab, 0) or 0
        club_five[cur] = sum((cs.get(s) or 0) for s in five)
    MAXCUR = max(club_cur.values()) if club_cur else 1; MAXCUR = MAXCUR or 1
    MAX5 = max(club_five.values()) if club_five else 1; MAX5 = MAX5 or 1
    if PED_TOPK:
        _pv = sorted((v for v in club_five.values() if v > 0), reverse=True)[:PED_TOPK]
        PED_REF = (sum(_pv) / len(_pv)) if _pv else 1.0; PED_REF = PED_REF or 1.0
        def fiveN(cur): return min(club_five.get(cur, 0) / PED_REF, 1.0)
    else:
        def fiveN(cur): return club_five.get(cur, 0) / MAX5
    def curN(cur): return club_cur.get(cur, 0) / MAXCUR
    ENG = country5yr.get("England") or 1.0
    def CF(country):
        v = country5yr.get(country)
        c = math.sqrt(v / ENG) if v else 0.0
        return min(c, CF_CAP) if CF_CAP else c
    def strength(cur):
        return max(CF_WEIGHT * CF(uni[cur]) + (1 - CF_WEIGHT) * fiveN(cur), 0.10) if cur in uni else 0.10
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
    # Real domestic-cup per-match form for the pre-1992-93 seasons (England FA/League Cup, Germany
    # DFB-Pokal; see build_eng_cups.py / build_de_cups.py), fed through the SAME opponent-weighted
    # engine as cupfix. Replaces the notional imputation for those nations below (see cup_flags loop).
    # One row per club-match; cup opponents outside the top-flight universe are floored at 0.10.
    for m in (nat_cup_year or []):
        me = canon2cur.get(norm(m["cur"])); opp = canon2cur.get(norm(m["opp"]))
        result(me, opp if opp else m.get("opp"), m.get("gf"), m.get("ga"), cup_mult(m.get("comp")), m.get("wdl"))
    # European form (kassiesa CL/EL/CWC/ICFC, both legs, stage-weighted). CWC is the 1960-99 Cup
    # Winners' Cup; ICFC is the 1955-71 Inter-Cities Fairs Cup (UEFA Cup predecessor). For a modern
    # CL/EL-only season the extra codes simply match nothing.
    for r in eur_rows:
        comp = r.get("competition")
        if comp not in ("CL", "EL", "CWC", "ICFC"): continue
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
    # Exclude only leagues that actually carry per-match domfix data THIS season (their real
    # per-match form was fed above — avoid double-counting). Pre-2007 seasons have no domfix, so the
    # big-8 fall through to this aggregate standings-based form like every other league.
    domfix_present = {m["country"] for m in domfix_year}
    for cur, (w, d, l) in dom_rec.items():
        ctry = uni.get(cur)
        if ctry in domfix_present or cur not in agg: continue
        n = w + d + l
        if n <= 0: continue
        A = agg[cur]; A["MP"] += n; A["W"] += w; A["D"] += d; A["L"] += l
        A["Q"] += (w * 1.0 + d * 0.5) * avg_str.get(ctry, 0.10) * 1.0
    # Pre-Bundesliga German Championship qualifiers (1959-60..1962-63): two form buckets — the full
    # regional Oberliga league record weighted at a modest regional-opponent strength, and the
    # national championship-group games weighted at an elite strength. European form, DFB-Pokal and
    # pedigree flow via the universe (these clubs were injected into uni/champs in main()).
    for q in (de_early or []):
        cur = q["cur"]
        if cur not in agg: continue
        A = agg[cur]
        ow, od, ol, cw, cd, cl = q["ow"], q["od"], q["ol"], q["cw"], q["cd"], q["cl"]
        A["MP"] += ow + od + ol + cw + cd + cl
        A["W"] += ow + cw; A["D"] += od + cd; A["L"] += ol + cl
        A["Q"] += (ow * 1.0 + od * 0.5) * OBERLIGA_OPP_STR + (cw * 1.0 + cd * 0.5) * CHAMP_OPP_STR
    # Pre-1993 domestic cup FORM imputation (top-8 only; there is no per-match cupfix before 1993).
    # A light block of opponent-weighted notional results so a cup run still nudges form; skipped when
    # per-match cups exist (1993+), so no double count with the cupfix feed above. A nation is ALSO
    # skipped whenever real per-match cup results were fed for it this season (nat_cup_year, tagged by
    # country), so those actual results replace the notional nudge for that nation only, leaving every
    # other league on imputation.
    real_cup_countries = {m.get("country") for m in (nat_cup_year or [])}
    if not cupfix_year:
        for cur, (mw, mf, nw, nf) in cup_flags.items():
            if cur not in agg or uni.get(cur) not in DOMFIX_COUNTRIES: continue
            if uni.get(cur) in real_cup_countries: continue
            s = avg_str.get(uni[cur], 0.10)
            for kind, won, fin in (("major", mw, mf), ("minor", nw, nf)):
                w, l = CUP_IMPUTE[kind]["win"] if won else (CUP_IMPUTE[kind]["final"] if fin else (0, 0))
                if w or l:
                    A = agg[cur]; A["MP"] += w + l; A["W"] += w; A["L"] += l; A["Q"] += w * s
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
    # Trophy bonuses by the continental section's display comp name (keyed EXACTLY on the string in
    # continental_rbr.json). "Cup Winners Cup" is the workbook's label for the 1960-99 CWC (no
    # apostrophe) and gets 0.05, on a par with the UEFA Cup of the same era; "Intercontinental Cup"
    # is the pre-2000 forerunner of the FIFA Club World Cup and gets the same 0.03.
    BONUS = {"Champions League": TOP_TROPHY_BONUS, "European Cup": TOP_TROPHY_BONUS,
             "Europa League": 0.05, "UEFA Cup": 0.05,
             "Inter-Cities Fairs Cup": 0.05, "Cup Winners Cup": 0.05, "UEFA Super Cup": 0.04,
             "Intercontinental Cup": 0.03, "FIFA Club World Cup": 0.03}
    for sec in cont_secs:
        w = BONUS.get(sec.get("comp"))
        if not w: continue
        for e in (sec.get("entries") or []):
            if e.get("trophy"): addb(e.get("name"), w)
    for cur, ctry in champ_curs:
        addb(cur, 0.06 if ctry in TOP5 else 0.03)
    # Domestic cup trophy + final bonuses for EVERY UEFA nation (flag-driven, all seasons). Top-8
    # nations score above the rest, majors above minors, winners above finalists (see CUP_TROPHY).
    for cur, (mw, mf, nw, nf) in cup_flags.items():
        if cur not in agg: continue
        tier = "top8" if uni.get(cur) in DOMFIX_COUNTRIES else "other"
        if mw: TB[cur] += CUP_TROPHY[(tier, "major")][0]
        elif mf: TB[cur] += CUP_TROPHY[(tier, "major")][1]
        if nw: TB[cur] += CUP_TROPHY[(tier, "minor")][0]
        elif nf: TB[cur] += CUP_TROPHY[(tier, "minor")][1]
    # Super cups come from the workbook (not in the cup flags); domestic cups handled above.
    for cp in (cup_secs or []):
        if cp.get("type") == "Super cup":
            addb(cp.get("winner"), 0.01)
    # Editorial one-off trophy adjustments (see MANUAL_TB).
    for (mkey, mname), mbonus in MANUAL_TB.items():
        if mkey == cfg.get("key"):
            addb(mname, mbonus)
    # assemble ranked clubs (MP>=8), dense rank on score
    clubs = []
    for cur, A in agg.items():
        if A["MP"] < 8: continue
        form = (A["Q"] / A["MP"]) / maxRate
        wp = (2 * A["W"] + A["D"]) / (2 * A["MP"])
        score = 0.65 * form + PED_WEIGHT * fiveN(cur) + 0.11 * curN(cur) - max(0.0, 0.5 - wp) * 0.6 + TB.get(cur, 0)
        disp = (team_name or {}).get(cur, cur)   # season name for display (e.g. "Wimbledon"); canonical stays the join key
        clubs.append({"name": disp, "lookup": cur2look.get(norm(cur), cur), "country": uni[cur],
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
    # Defunct UEFA nations that appear pre-1992. Their clubs are ranked under the historical country
    # label; the country race merges them into their successor (Soviet Union->Russia, Yugoslavia->
    # Serbia, Czechoslovakia->Czech Republic) downstream in build_trends. East Germany stays its own
    # line. (Saar folded into West Germany in 1956, below the 1959-60 floor, so it never appears.)
    for c in ("Soviet Union", "Yugoslavia", "Czechoslovakia", "East Germany"):
        cm.setdefault(c, "UEFA")
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
    uni = {}; champs = []; dom_rec = {}; cup_flags = {}; team_name = {}
    for r in cl_rows:
        if r.get("season") != key or r.get("level") != 1 or r.get("first_division") != "Y": continue
        if confed_map.get(r.get("country")) != "UEFA": continue
        cur = r.get("cur_name")
        uni[cur] = r.get("country")
        # The name this club used THAT season (e.g. "Wimbledon" pre-2004), joined on the canonical
        # cur_name. Displayed in standings AND the club power ranking; canonical stays the join key.
        team_name.setdefault(cur, r.get("team") or cur)
        # domestic W/D/L straight from the standings row (the aggregate fed for non-domfix leagues)
        dom_rec.setdefault(cur, (I(r.get("w")) or 0, I(r.get("d")) or 0, I(r.get("l")) or 0))
        # domestic cup outcome flags: (major win, major final, minor win, minor final)
        cup_flags.setdefault(cur, (_Y(r.get("cup_major")), _Y(r.get("cup_major_final")),
                                   _Y(r.get("cup_minor")), _Y(r.get("cup_minor_final"))))
        if r.get("champions") == "Y": champs.append((cur, r.get("country")))
    return uni, champs, dom_rec, cup_flags, team_name

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

def main(validate=False, only=None):
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
    seasons = [c for c in SEASONS if (not only or c["key"] in only)]
    for cfg in seasons:
        key, end = cfg["key"], cfg["end"]
        uni, champs, dom_rec, cup_flags, team_name = universe_and_champs(core["cl"], key, confed_map)
        # Inject the pre-Bundesliga German clubs (1959-63) into the universe: they are the only German
        # clubs for those seasons (no cl_rows before the 1963-64 Bundesliga). Base set = the ~9 German
        # Championship qualifiers; PLUS any German club that played European football this season but
        # was not a current-year qualifier (the reigning champion enters the European Cup a year later,
        # e.g. 1960 EC finalist Eintracht Frankfurt), injected with its regional Oberliga record so the
        # continental entrant isn't missing. European form + DFB-Pokal + pedigree flow via the universe.
        dech = core["dechamp"].get(key) or {}
        de_early = list(dech.get("qualifiers", []))
        seen = {q["cur"] for q in de_early}
        regional = dech.get("regional", {})
        for r in eur_by.get(key, []):
            for canon in (r.get("home_canon"), r.get("away_canon")):
                if canon and canon not in seen and canon in regional:
                    seen.add(canon)
                    w, d, l = regional[canon]
                    de_early.append({"cur": canon, "ow": w, "od": d, "ol": l, "cw": 0, "cd": 0, "cl": 0})
        for q in de_early:
            uni.setdefault(q["cur"], "Germany"); team_name.setdefault(q["cur"], q["cur"])
        de_champion = dech.get("champion")
        if de_champion: champs.append((de_champion, "Germany"))
        leagues, ey_warn = build_leagues(core["cl"], key, end, confed_map)
        countries = build_countries(cfg, ccountry, hubset)
        c5yr = {c["country"]: c["coef"] for c in countries}
        cups = build_cups(key, cup_rows)
        clubs = compute_clubs(cfg, uni, cur2uefa, cur2look, dommap, ccf, c5yr,
                              core["domfix"].get(cfg["domfix"], []),
                              core["cupfix"].get(cfg["domfix"], []), eur_by.get(key, []),
                              core["cont"].get(key, []), cups, champs, dom_rec, cup_flags, team_name,
                              core["natcup"].get(key, []), de_early)
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
    want = {f"{y}-{str(y + 1)[2:]}" for y in range(1959, 2013)}   # 1959-60 .. 2012-13
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
    only = None
    for a in sys.argv:
        if a.startswith("--seasons="):
            only = set(a.split("=", 1)[1].split(","))
    main(validate="--validate" in sys.argv, only=only)
