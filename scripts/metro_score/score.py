"""The metro Score, as Excel computes it, in Python.

Two layers:

  derived_columns()  reproduces Metro Areas columns K..AN and AQ..BF from the
                     source sheets. These are the COUNTIFS/SUMIFS/SUMPRODUCT
                     formulas; every one of them is 100% formula-driven in the
                     workbook, with no hand overrides.

  score()            reproduces column BG from those, in the ORDER Excel writes
                     the terms. Order matters: floating-point addition is not
                     associative, and preserving it takes the disagreement with
                     the workbook from ~1e-13 to ~1e-15, which is what makes an
                     exact-match parity gate viable instead of a fuzzy one.

WHAT THIS DELIBERATELY DOES NOT RECOMPUTE
Population (J) and GaWC class (E) are read from the metro's own row and never
derived. J is a SUMIFS over Counties for 2,608 metros and over Municipality for
1,667, but 39 rows carry a hard-typed value instead, and E is hand-entered
throughout. Those are editorial overrides. An engine that "computes everything
from source" would erase them, and it would take months to notice. The rule is:
recompute only columns that are formulas in every row; read anything carrying
hand overrides from the row as-is.

Excel semantics reproduced on purpose:
  LOG(x)            is log base 10, and IFERROR(...,0) makes x<=0 contribute 0
  IF(a>10,10,a)     is a cap, not a clamp: the "other teams" term has NO floor,
                    so 13 metros where AR>AQ score NEGATIVE points on it today
  criteria matching is case-insensitive and does NOT trim whitespace
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any, Dict, Sequence

from .sources import A, Sheet, Workbook, has_num, key, num, text
from .weights import Weights

# Metro Areas columns the score reads straight off the row.
COL_NAME, COL_GAWC, COL_POP, COL_SCORE = "F", "E", "J", "BG"

# Column letters whose values are summed into AQ (Total Teams), which is
# SUM(K:AN)-V in the workbook. Written out so the -V exclusion is visible.
TEAM_COLS = [
    "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN",
]
AQ_EXCLUDES = "V"  # NCAA W is counted in U as well; excluded to avoid a double count

# Which Team List column each metro-sheet column matches its header against.
BY_LEAGUE = ("O", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
             "AF", "AG", "AH", "AJ", "AK", "AL", "AM", "AN")   # 'Team List'!B
BY_SPORT = ("N", "AA", "AB", "AC")                              # 'Team List'!A
BY_EVENT = ("AD", "AE")                                         # 'Team List'!J

CULTURE_INFRA_AZ = (
    "Port", "Trade Venue", "Stock Exchange", "Internet Exchange",
    "Military Base", "Central Bank", "Data Center Hub", "Agriculture & Extraction",
)
CULTURE_INFRA_AY = ("Museum/Landmark", "Bridge/Tunnel/Dam/Canal")


def log10(v: float) -> float:
    """Excel's IFERROR(LOG(v),0): base 10, and 0 for anything non-positive."""
    return math.log10(v) if v > 0 else 0.0


class Indexes:
    """Every source sheet reduced to per-metro counters, in one pass each."""

    def __init__(self, wb: Workbook, w: Weights, headers: Dict[str, str]):
        self.w = w
        tl: Sheet = wb["Team List"]
        fc: Sheet = wb["FootballClub_Data"]
        ci: Sheet = wb["Culture-Infra"]
        un: Sheet = wb["Universities"]
        mc: Sheet = wb["MktCap_Data"]
        lx: Sheet = wb["Luxury Hospitality"]
        s2: Sheet = wb["Sheet2"]

        kb, ka, kj = A("B"), A("A"), A("J")

        def tl_eq(col: int, label: str):
            lab = label.lower()
            return lambda r: col < len(r) and key(r[col]) == lab

        self.by_league = {c: tl.count_by("K", where=tl_eq(kb, headers[c])) for c in BY_LEAGUE}
        self.by_sport = {c: tl.count_by("K", where=tl_eq(ka, headers[c])) for c in BY_SPORT}
        self.by_event = {c: tl.count_by("K", where=tl_eq(kj, headers[c])) for c in BY_EVENT}

        # P (NFL) carries a partial-share multiplier: a metro sharing a team
        # counts a fraction of it, unless the shares already total ~1.
        nfl = tl_eq(kb, headers["P"])
        self.nfl_count = tl.count_by("K", where=nfl)
        self.nfl_share = tl.count_by("K", where=nfl, value_col="J")

        # AI matches the ROW 1 category band, not the row 3 header, and only
        # rows whose J is exactly 2.
        ai_label = headers["AI_row1"].lower()
        self.minor_am_football = tl.count_by(
            "K",
            where=lambda r: (ka < len(r) and key(r[ka]) == ai_label
                             and kj < len(r) and has_num(r[kj]) and num(r[kj]) == 2),
        )

        self.major_flag = tl.count_by("K", where=tl_eq(A("M"), "Y"))
        self.euroleague = tl.count_by("K", where=tl_eq(A("M"), "Euroleague"))
        self.fc_major = fc.count_by("C", where=tl_eq(A("I"), "Y"))

        tiers = w.col("football_tiers")
        gi = A("G")

        def band(lo: float, hi: float):
            return lambda r: gi < len(r) and has_num(r[gi]) and lo < num(r[gi]) <= hi

        self.football = {
            "K": fc.count_by("C", where=band(*tiers["first"])),
            "L": fc.count_by("C", where=band(*tiers["second"])),
            "M": fc.count_by("C", where=lambda r: gi < len(r) and has_num(r[gi])
                             and num(r[gi]) > tiers["other_above"]),
        }

        li, oi, pi_ = A("L"), A("O"), A("P")

        def ci_type(t: str):
            lab = t.lower()
            return lambda r: li < len(r) and key(r[li]) == lab

        self.ci_count = {t: ci.count_by("G", where=ci_type(t)) for t in (
            "Sporting Event", "Cultural Event", "Hospital", "Research Institution",
            "Train Station", *CULTURE_INFRA_AY, *CULTURE_INFRA_AZ)}
        self.ci_stations = {
            t: ci.count_by("G", where=ci_type(t), value_col="P")
            for t in ("Metro System", "Suburban Rail")
        }
        self.annual_events = ci.count_by("G", where=lambda r: oi < len(r) and key(r[oi]) == "y")

        # BA: SUMPRODUCT over airports, each worth points by its class.
        pts = w.col("airport_class_points")
        default = pts["_unclassified"]
        air: Counter = Counter()
        gcol, icol = A("G"), A("I")
        for r in ci.rows:
            if li >= len(r) or key(r[li]) != "airport":
                continue
            k = key(r[gcol]) if gcol < len(r) else ""
            if not k:
                continue
            cls = key(r[icol]) if icol < len(r) else ""
            air[k] += pts.get(cls, default)
        self.airports = air

        rank_max_top = w.col("top_university_rank_max")
        rank_max_50 = w.term("top50_universities", "rank_max")
        ci_ = A("C")

        def uni_rank(limit: float):
            return lambda r: ci_ < len(r) and has_num(r[ci_]) and num(r[ci_]) <= limit

        self.uni_all = un.count_by("F")
        self.uni_top = un.count_by("F", where=uni_rank(rank_max_top))
        self.uni_top50 = un.count_by("F", where=uni_rank(rank_max_50))

        self.companies = mc.count_by("A")
        self.market_cap = mc.count_by("A", value_col="B")
        self.luxury = lx.count_by("G", value_col="M")
        self.gdp = s2.count_by("B", value_col="E")
        self.skydb = {
            key(wb["SKYDB_Counts"].col(r, "A")): num(wb["SKYDB_Counts"].col(r, "C"))
            for r in wb["SKYDB_Counts"].rows
            if text(wb["SKYDB_Counts"].col(r, "A"))
        }


def read_headers(metro_sheet: Sheet, raw_rows: Sequence[Sequence[Any]]) -> Dict[str, str]:
    """Header labels used as COUNTIFS criteria, read from the sheet itself.

    The workbook writes criteria as $N$3, $P$3 and so on, so a header rename
    silently changes what a column counts. Reading them rather than hardcoding
    means this engine changes with the workbook, exactly as the formulas do.
    AI is the exception: it references $AI$1, the row-1 category band.
    """
    row1, row3 = raw_rows[0], raw_rows[2]

    def at(row: Sequence[Any], letter: str) -> str:
        i = A(letter)
        return text(row[i]) if i < len(row) else ""

    out = {c: at(row3, c) for c in (*BY_LEAGUE, *BY_SPORT, *BY_EVENT, "P")}
    out["AI_row1"] = at(row1, "AI")
    missing = [k for k, v in out.items() if not v]
    if missing:
        raise ValueError(f"Metro Areas header row is missing labels for {missing}")
    return out


def derived_columns(k: str, idx: Indexes, w: Weights) -> Dict[str, float]:
    """Metro Areas K..AN and AQ..BF for one metro, from the source sheets."""
    c: Dict[str, float] = {}
    for col in BY_LEAGUE:
        c[col] = idx.by_league[col][k]
    for col in BY_SPORT:
        c[col] = idx.by_sport[col][k]
    for col in BY_EVENT:
        c[col] = idx.by_event[col][k]
    for col in ("K", "L", "M"):
        c[col] = idx.football[col][k]

    share = idx.nfl_share[k]
    threshold = w.col("nfl_partial_share_threshold")
    c["P"] = idx.nfl_count[k] * (1 if share > threshold else share)
    c["AI"] = idx.minor_am_football[k]

    c["AQ"] = sum(c[col] for col in TEAM_COLS) - c[AQ_EXCLUDES]
    c["AR"] = idx.major_flag[k] + idx.fc_major[k] + idx.euroleague[k]
    c["AS"] = idx.ci_count["Sporting Event"][k] + c["AD"] + c["AE"]
    c["AT"] = idx.companies[k]
    c["AU"] = idx.market_cap[k]
    c["AV"] = idx.ci_count["Cultural Event"][k]
    c["AW"] = idx.uni_all[k]
    c["AX"] = (idx.uni_top[k]
               + w.col("hospital_weight") * idx.ci_count["Hospital"][k]
               + w.col("research_weight") * idx.ci_count["Research Institution"][k])
    c["AY"] = sum(idx.ci_count[t][k] for t in CULTURE_INFRA_AY)
    c["AZ"] = sum(idx.ci_count[t][k] for t in CULTURE_INFRA_AZ)
    c["BA"] = idx.airports[k]
    c["BB"] = idx.luxury[k]
    c["BC"] = idx.ci_stations["Metro System"][k]
    c["BD"] = idx.ci_stations["Suburban Rail"][k]
    c["BE"] = idx.ci_count["Train Station"][k]
    c["BF"] = idx.skydb.get(k, 0.0)
    c["BR"] = idx.gdp[k]
    return c


def score_terms(
    pop: float, gawc: float, cols: Dict[str, float], top50: float,
    annual: float, w: Weights,
) -> Dict[str, float]:
    """The seventeen terms of column BG, in the order Excel writes them.

    Returned as a dict so a metro's score can be explained term by term, which
    is what makes a ranking argument possible at all.
    """
    t = w.term
    aq, ar, a_s, br = cols["AQ"], cols["AR"], cols["AS"], cols["BR"]
    other_teams = aq - ar
    cap_teams = t("other_teams", "cap_teams")
    ml_cap = t("major_league_teams", "cap_points")

    gdp = t("gdp_band", "floor")
    for threshold, points in t("gdp_band", "bands"):
        if br > threshold:
            gdp = points
            break

    return {
        "population": pop / t("population", "divisor"),
        "market_cap": cols["AU"] / t("market_cap", "divisor"),
        # A cap, not a clamp. IF(AR>10,10,AR).
        "major_league_teams": (ml_cap if ar > ml_cap
                               else ar * t("major_league_teams", "per_team")),
        # Capped above, NOT floored below: where AR>AQ this goes negative, and
        # it does so for 13 metros in the workbook today. Faithful on purpose;
        # fixing it is a scoring change, not a migration.
        "other_teams": (cap_teams * t("other_teams", "per_team") if other_teams > cap_teams
                        else other_teams * t("other_teams", "per_team")),
        "culture_infra": (cols["AV"] + cols["AY"] + cols["AZ"]) * t("culture_infra", "per_item"),
        "airports": cols["BA"] * t("airports", "per_point"),
        "top50_universities": top50 * t("top50_universities", "per_university"),
        "other_top_institutions": ((cols["AX"] - top50)
                                   * t("other_top_institutions", "per_institution")),
        "metro_stations": log10(cols["BC"]) * t("metro_stations", "log_multiplier"),
        "gawc": (t("gawc", "numerator") / gawc) if gawc else 0.0,
        "suburban_rail": log10(cols["BD"]) * t("suburban_rail", "log_multiplier"),
        "train_hubs": log10(cols["BE"]) * t("train_hubs", "log_multiplier"),
        "skyscrapers": log10(cols["BF"]) * t("skyscrapers", "log_multiplier"),
        "sporting_events": (t("sporting_events", "cap_points")
                            if a_s * t("sporting_events", "per_event")
                            > t("sporting_events", "cap_points")
                            else a_s * t("sporting_events", "per_event")),
        "annual_events": annual * t("annual_events", "per_event"),
        "luxury_hospitality": log10(cols["BB"]) * t("luxury_hospitality", "log_multiplier"),
        "gdp_band": gdp,
    }


# The literal left-to-right order of the Excel expression. Summing in this
# order is what keeps the disagreement with the workbook at ~1e-15 rather than
# ~1e-13; float addition is not associative and the gate is exact.
TERM_ORDER = (
    "population", "market_cap", "major_league_teams", "other_teams", "culture_infra",
    "airports", "top50_universities", "other_top_institutions", "metro_stations",
    "gawc", "suburban_rail", "train_hubs", "skyscrapers", "sporting_events",
    "annual_events", "luxury_hospitality", "gdp_band",
)


def total(terms: Dict[str, float]) -> float:
    s = 0.0
    for name in TERM_ORDER:
        s += terms[name]
    return s


class Engine:
    """Score every metro in a workbook."""

    def __init__(self, wb: Workbook, w: Weights):
        self.wb = wb
        self.w = w
        metro = wb["Metro Areas"]
        if len(wb.header_rows) < 3:
            raise ValueError("Metro Areas header rows 1-3 were not captured by sources.load()")
        self.headers = read_headers(metro, wb.header_rows)
        self.idx = Indexes(wb, w, self.headers)

    def rows(self):
        """Yield (name, key, cached_score, computed_score, terms, columns)."""
        metro = self.wb["Metro Areas"]
        ni, ei, ji, si = A(COL_NAME), A(COL_GAWC), A(COL_POP), A(COL_SCORE)
        for r in metro.rows:
            name = text(r[ni]) if ni < len(r) else ""
            if not name:
                continue
            k = key(r[ni])
            cols = derived_columns(k, self.idx, self.w)
            pop = num(r[ji]) if ji < len(r) else 0.0
            gawc = num(r[ei]) if ei < len(r) else 0.0
            terms = score_terms(pop, gawc, cols, self.idx.uni_top50[k],
                                self.idx.annual_events[k], self.w)
            cached = num(r[si]) if si < len(r) else 0.0
            yield name, k, cached, total(terms), terms, cols
