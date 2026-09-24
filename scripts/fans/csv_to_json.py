#!/usr/bin/env python3
"""
scripts/fans/csv_to_json.py

Turns the three Fan Attention Index CSVs (teams_fan_attention.csv,
teams_monthly_long.csv, teams_fan_vs_valuation.csv) into the single JSON file
the /fans page reads via lib/fanIndex.ts: data/fans/fan-attention.json.
(Moved out of public/ on 2026-09-24 so the raw JSON is not directly
downloadable; the site now serves it only through the auth-gated
app/api/fans/route.ts, plus a small public top-20 preview.)

v0.2: new schema (wiki_baseline_12m, social_followers, signal, fan_index_raw,
score_in_group, global_score, global_rank, in_flux, etc). See
fan_index/README.md REVISION 5 for the full method writeup.

Pure offline transform, no network calls. Safe to re-run any time the source
CSVs change; it does not touch the CSVs themselves.

Usage:
    python3 scripts/fans/csv_to_json.py \
        --fan-index-dir "/path/to/fan_index" \
        --out data/fans/fan-attention.json

--fan-index-dir can also be set via the FAN_INDEX_DIR environment variable.
"""
import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

WINDOW_START = "2025-09"
WINDOW_END = "2026-08"
VERSION = "v0.8"
METHOD_URL = "/fans/methodology"
CROSS_SPORT_METHOD = (
    "v0.4 cross-sport scale: for each league L (each Football league separately; "
    "the group for every other sport), k_L = sqrt(revenue_usd_m_L / wiki_attention_total_L), "
    "cross_raw = fan_index_raw x k_L (the geometric mean of a team's within-league wiki-attention "
    "share and its league's revenue scale). global_score = 100 x cross_raw / max(cross_raw) over all "
    "teams; global_rank follows. Revenue anchors are Deloitte (Europe's top 5 + WSL), league/federation "
    "self-reported or reputable-aggregator figures elsewhere -- see anchor_source/anchor_confidence per team."
)

# Sport-emoji lookup, mirroring lib/sportLabels.ts's leagueIcon() (same
# emoji per league/group -- the two are kept in sync by hand since one is
# TS for the client and this one is Python for the build step; see that
# file's own comment for why it does not use a second, different mapping).
# Used only to precompute data/fans/preview.json's `icon` field, so the
# public /fans page needs zero extra fields (no group, no href) to show a
# sport icon next to each of the top 20 rows.
ICON_BY_LEAGUE_OR_GROUP = {
    "nfl": "🏈", "cfl": "🏈", "college football": "🏈",
    "nba": "🏀", "wnba": "🏀", "college basketball": "🏀", "euroleague": "🏀",
    "nhl": "🏒",
    "mlb": "⚾", "npb": "⚾",
    "afl": "🦘",
    "nrl": "🏉", "top 14": "🏉",
    "f1": "🏎️",
    "handball-bundesliga": "🤾",
    "superlega": "🏐",
    "ipl": "🏏",
    "football": "⚽", "mls": "⚽", "women's football": "⚽",
    "premier league": "⚽", "championship": "⚽", "la liga": "⚽", "bundesliga": "⚽",
    "serie a": "⚽", "ligue 1": "⚽", "primeira liga": "⚽", "eredivisie": "⚽",
    "scottish premiership": "⚽", "süper lig": "⚽", "liga mx": "⚽",
    "brasileirão": "⚽", "liga profesional": "⚽", "nwsl": "⚽", "wsl": "⚽",
}


def icon_for(group, league):
    return ICON_BY_LEAGUE_OR_GROUP.get((league or "").lower()) or ICON_BY_LEAGUE_OR_GROUP.get((group or "").lower()) or ""


GROUP_ORDER = [
    "NFL", "NBA", "MLB", "NHL", "Football", "College football",
    "College basketball", "EuroLeague", "AFL", "NRL", "IPL", "F1",
    "WNBA", "Women's football", "Top 14", "Handball-Bundesliga",
    "SuperLega", "NPB", "CFL",
]


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def to_float(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def to_int(v):
    f = to_float(v)
    return int(round(f)) if f is not None else None


def round_sig(v, ndigits):
    if v is None:
        return None
    return round(v, ndigits)


import re
import unicodedata

_NAME_STOPWORDS = {
    "fc", "sk", "fk", "ac", "jk", "cf", "as", "cd", "sc", "se", "cs",
    "clube", "club", "atletico", "athletic", "de", "of", "the", "team",
}


def _norm_name(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    toks = re.findall(r"[a-z0-9]+", s.lower())
    toks = [t for t in toks if t not in _NAME_STOPWORDS]
    return "".join(toks)


# method precedence for valuations_extended.csv rows, low index = wins first.
# "derived" (scripts/fans/pending/college_program_values.csv -- a program's
# revenue share of a department value) ranks like "estimate": it is a
# computed figure, not a directly published or transacted one, but it is
# still more grounded than an unverified "speculative" guess.
_METHOD_RANK = {"published": 0, "transaction": 1, "estimate": 2, "derived": 2, "speculative": 3}

# valuations_extended.csv "league" strings -> the dataset's own `league`
# field value(s) they apply to. Most are 1:1; the college row applies its
# one athletic-department figure to BOTH of a school's football and
# basketball rows (val_unit marks those as department-level, not team-level).
EXTENDED_LEAGUE_MAP = {
    "WNBA": ["WNBA"],
    "NWSL": ["NWSL"],
    "Premier League": ["Premier League"],
    "La Liga": ["La Liga"],
    "IPL": ["IPL"],
    "Serie A": ["Serie A"],
    "Brasileirao Serie A": ["Brasileirão"],
    "Bundesliga": ["Bundesliga"],
    "Eredivisie": ["Eredivisie"],
    "EFL Championship": ["Championship"],
    "Ligue 1": ["Ligue 1"],
    "Scottish Premiership": ["Scottish Premiership"],
    "Liga MX": ["Liga MX"],
    "College football / College basketball (athletic dept.)": ["College football", "College basketball"],
    # Added 2026-09-24 for scripts/fans/pending/college_program_values.csv (see
    # load_college_program_values below): identity entries, one league each, so
    # a program-value row's _unit stays None (team-level), unlike the combined
    # department row above whose two-league list marks it "athletic department".
    "College football": ["College football"],
    "College basketball": ["College basketball"],
    "Brazilian football (division unconfirmed)": ["Brasileirão"],
    "NRL": ["NRL"],
    "AFL": ["AFL"],
    # Added 2026-09-24 for the round2 valuations merge (scripts/fans/pending/
    # valuations_round2_sourced.csv): identity entries for league strings
    # that were already the dataset's own `league` field value verbatim
    # (checked against data/fans/fan-attention.json), so they just needed
    # to be present in this map at all.
    "CFL": ["CFL"],
    "NPB": ["NPB"],
    "Top 14": ["Top 14"],
    "Handball-Bundesliga": ["Handball-Bundesliga"],
    "SuperLega": ["SuperLega"],
    "EuroLeague": ["EuroLeague"],
    "WSL": ["WSL"],
    "Primeira Liga": ["Primeira Liga"],
    "Süper Lig": ["Süper Lig"],
    "Liga Profesional": ["Liga Profesional"],
    "Championship": ["Championship"],
    # Scottish Premiership and Liga MX were already keys above; not repeated
    # here to avoid a duplicate dict key.
}

EXTENDED_UNMATCHED = []  # rows whose league string or team name never resolved; reported by main()


def load_extended_valuations(path):
    """Loads scripts/fans/valuations_extended.csv (team, league, value_usd_m,
    year, source, source_url, method, confidence, notes) if it exists, and
    returns {norm_team: [rows]} where each row carries its resolved dataset
    league(s) (`_leagues`) and precedence rank (`_rank`, published > transaction
    > estimate). A row whose league string is not in EXTENDED_LEAGUE_MAP is
    recorded in EXTENDED_UNMATCHED and skipped.

    Returns {} if the file does not exist yet -- this is expected until the
    research agent delivers it; absence is not an error."""
    EXTENDED_UNMATCHED.clear()
    if not path or not os.path.exists(path):
        return {}
    rows = read_csv(path)
    by_team = defaultdict(list)
    for r in rows:
        league_raw = (r.get("league") or "").strip()
        team = (r.get("team") or "").strip()
        leagues = EXTENDED_LEAGUE_MAP.get(league_raw)
        if not leagues:
            EXTENDED_UNMATCHED.append({**r, "_reason": f"unrecognized league '{league_raw}'"})
            continue
        method = (r.get("method") or "estimate").strip().lower()
        row = dict(r)
        row["_leagues"] = leagues
        row["_rank"] = _METHOD_RANK.get(method, 99)
        row["_unit"] = "athletic department" if len(leagues) > 1 else None
        by_team[_norm_name(team)].append(row)
    return by_team


def load_speculative_valuations(path):
    """Loads scripts/fans/valuations_speculative.csv (same columns as
    valuations_extended.csv; method is always "speculative" in this file).
    Reuses EXTENDED_LEAGUE_MAP for league-string resolution -- a row whose
    league string is not in that map is recorded in EXTENDED_UNMATCHED and
    skipped, same as the extended loader. Returns {} if the file does not
    exist."""
    if not path or not os.path.exists(path):
        return {}
    rows = read_csv(path)
    by_team = defaultdict(list)
    for r in rows:
        league_raw = (r.get("league") or "").strip()
        team = (r.get("team") or "").strip()
        leagues = EXTENDED_LEAGUE_MAP.get(league_raw)
        if not leagues:
            EXTENDED_UNMATCHED.append({**r, "_reason": f"unrecognized league '{league_raw}' (speculative)"})
            continue
        method = (r.get("method") or "speculative").strip().lower()
        row = dict(r)
        row["_leagues"] = leagues
        row["_rank"] = _METHOD_RANK.get(method, 99)
        row["_unit"] = "athletic department" if len(leagues) > 1 else None
        by_team[_norm_name(team)].append(row)
    return by_team


def load_college_program_values(path):
    """Loads scripts/fans/pending/college_program_values.csv (same columns as
    valuations_extended.csv; method is "derived" -- a school's football or
    basketball revenue share of its athletic department's valuation, per
    Ashwin's ruling that a school's football and basketball rows should not
    both show the same whole-department figure).

    Unlike valuations_extended.csv/valuations_speculative.csv, a program-value
    row's league string is already the dataset's own single league ("College
    football" or "College basketball" -- see the identity entries added to
    EXTENDED_LEAGUE_MAP above), so it resolves to exactly one league and its
    `_unit` is None (team/program-level), not "athletic department".

    Kept as a separate dict from load_extended_valuations()/
    load_speculative_valuations() and checked FIRST in build_json (before the
    merged extended+speculative dict), so a program value always takes
    precedence over the combined department row for the same team+league,
    regardless of the department row's own method rank (most department rows
    are "published", which would otherwise outrank a "derived" program row on
    _rank alone). Returns {} if the file does not exist yet."""
    if not path or not os.path.exists(path):
        return {}
    rows = read_csv(path)
    by_team = defaultdict(list)
    for r in rows:
        league_raw = (r.get("league") or "").strip()
        team = (r.get("team") or "").strip()
        leagues = EXTENDED_LEAGUE_MAP.get(league_raw)
        if not leagues:
            EXTENDED_UNMATCHED.append({**r, "_reason": f"unrecognized league '{league_raw}' (college program value)"})
            continue
        method = (r.get("method") or "derived").strip().lower()
        row = dict(r)
        row["_leagues"] = leagues
        row["_rank"] = _METHOD_RANK.get(method, 99)
        row["_unit"] = "athletic department" if len(leagues) > 1 else None
        by_team[_norm_name(team)].append(row)
    return by_team


def merge_valuation_sources(*by_team_dicts):
    """Merges several {norm_team: [rows]} dicts (e.g. valuations_extended.csv
    + valuations_speculative.csv) into one, concatenating candidate lists per
    team so best_extended_match()'s min(_rank) picks the highest-precedence
    row across ALL sources (published > transaction > estimate > speculative)."""
    merged = defaultdict(list)
    for d in by_team_dicts:
        for k, v in d.items():
            merged[k].extend(v)
    return merged


def best_extended_match(by_team, league, display_name, en_title):
    """Picks the best (lowest-rank) valuations_extended.csv row for a dataset
    team, among candidates whose resolved league list includes this team's
    league. Tries the display name first, then the Wikipedia title.

    v0.5: if nothing matches on (name, league), fall back to matching on name
    alone, ignoring league -- this catches cases like Ipswich Town, where the
    dataset's own `league` field and the source article's tier disagree (a
    roster/tier snapshot issue, not a naming problem). The name-only fallback
    is only used when it resolves to a single team, so it can't silently
    misattribute a value across two same-named clubs in different sports."""
    for name in (display_name, en_title):
        candidates = by_team.get(_norm_name(name or ""))
        if not candidates:
            continue
        in_league = [c for c in candidates if league in c["_leagues"]]
        if in_league:
            return min(in_league, key=lambda c: c["_rank"])
    for name in (display_name, en_title):
        candidates = by_team.get(_norm_name(name or ""))
        if candidates:
            return min(candidates, key=lambda c: c["_rank"])
    # v0.8: nickname suffix fallback (AFL/NRL source rows say "Geelong Cats",
    # the dataset says "Geelong"). Match when a source key is this team's
    # name plus trailing words, within this league, and only when exactly
    # one source team fits, so it cannot misattribute.
    # Restricted to AFL/NRL: elsewhere a bare prefix is ambiguous ("Paris FC"
    # normalises to "paris", a prefix of "Paris Saint-Germain").
    if league not in ("AFL", "NRL"):
        return None
    for name in (display_name, en_title):
        base = _norm_name(name or "")
        if not base:
            continue
        hits = {k: v for k, v in by_team.items()
                if k.startswith(base) and len(k) > len(base) and any(league in c["_leagues"] for c in v)}
        if len(hits) == 1:
            (cands,) = hits.values()
            return min([c for c in cands if league in c["_leagues"]], key=lambda c: c["_rank"])
    return None


MIN_FIT_N = 4       # minimum valued teams in a group before the informational log-log fit is attempted
MIN_FIT_R2 = 0.4    # informational threshold only; no longer gates value_vs_attention (see below)
MIN_RATIO_N = 3     # minimum valued teams (any method) in a LEAGUE before value_vs_attention is shown


def _loglog_fit_r2(pairs):
    """pairs: list of (x, y), both > 0. Returns (slope, intercept, r2) for
    ln(y) = intercept + slope * ln(x), or None if there are too few points
    or x/y have no variance."""
    n = len(pairs)
    if n < MIN_FIT_N:
        return None
    xs = [math.log(x) for x, y in pairs]
    ys = [math.log(y) for x, y in pairs]
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    if sxx == 0:
        return None
    slope = sxy / sxx
    intercept = my - slope * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    if ss_tot == 0:
        return None
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - ss_res / ss_tot
    return slope, intercept, r2


def round_sig_figs(v, sig=2):
    """Rounds v to `sig` significant figures (not decimal places -- round_sig()
    above is decimal places and is the wrong tool for a ratio that can
    legitimately sit anywhere from 0.05 to 20)."""
    if v is None:
        return None
    if v == 0:
        return 0.0
    d = sig - int(math.floor(math.log10(abs(v)))) - 1
    return round(v, d)


def apply_value_vs_attention(teams):
    """v0.9 (2026-09-24): replaces the old R^2-gated log-log-fit multiplier.
    Ashwin's ruling: gating the multiplier on a within-group fit clearing
    R^2 >= 0.4 left it blank for NFL/MLB/NHL/WNBA/F1/college/AFL/NRL --
    exactly the leagues where attention least explains value, which is
    itself the interesting finding, not a reason to hide the number.

    New rule: for every LEAGUE (not group -- Football's dozen leagues each
    get their own multiplier, not one blended across all of them) with at
    least MIN_RATIO_N valued teams, by ANY method including speculative:

        ratio_i = value_m_i / attention_i
        value_vs_attention_i = ratio_i / median(ratio over valued teams in the same league)

    attention_i is fan_index_raw -- confirmed against the source CSV to be
    the exact measure rank_in_league is sorted on (every league's
    rank_in_league is strictly non-increasing in fan_index_raw; wiki_baseline_12m
    is NOT monotonic with it, since fan_index_raw is wiki_baseline_12m after
    the in-flux 0.5x weight and the Wikipedia/Trends blend). Rounded to 2
    significant figures, not 2 decimal places, since these ratios span from
    well under 1 to well over 10 (round(0.087, 2) would print as 0.09 next
    to round(8.7, 2) printing as 8.7 -- inconsistent precision -- while 2
    sig figs keeps both honestly precise: 0.087 and 8.7).

    No R^2 threshold gates this any more: every league that clears the
    team-count bar gets a multiplier for every one of its valued teams,
    published or speculative alike (the UI's Est badge, driven by
    val_method, is what tells a speculative one apart -- see FanTable.tsx).
    A league below MIN_RATIO_N teams, or a team with no value_m or no
    fan_index_raw, gets value_vs_attention = residual_pct = None.

    PARTIALLY EXCLUDED: College basketball (2026-09-24, refined 2026-09-24 when
    program-level values were added). A College basketball row whose value_m
    still carries a WHOLE-ATHLETIC-DEPARTMENT figure (val_unit ==
    "athletic department" -- see EXTENDED_LEAGUE_MAP's "College football /
    College basketball (athletic dept.)" entry, one department figure applied
    to both a school's football AND basketball rows) is excluded here, since
    dividing it by basketball-only attention produces a meaningless ratio
    (Oklahoma basketball showed x160). A College basketball row with its own
    program-level value (scripts/fans/pending/college_program_values.csv,
    val_unit is None) is NOT excluded -- that figure is this sport's own
    revenue share, so the ratio is meaningful again. value_m stays visible for
    every row regardless (untouched, set earlier in build_json); only
    value_vs_attention/residual_pct are skipped for the still-department-valued
    ones. College football keeps the same athletic-department caveat but is
    left as is per the coordinator's original call -- not touched by this
    exclusion either way.

    Returns {league: {"n": int}} for every league that cleared the bar."""
    by_league = defaultdict(list)
    for t in teams:
        if t["league"] == "College basketball" and t.get("val_unit") == "athletic department":
            continue
        if (t["value_m"] is not None and t["value_m"] > 0
                and t.get("fan_index_raw") is not None and t["fan_index_raw"] > 0):
            by_league[t["league"]].append(t)

    eligible_leagues = {}
    for league, league_teams in by_league.items():
        if len(league_teams) < MIN_RATIO_N:
            continue
        ratios = [(t, t["value_m"] / t["fan_index_raw"]) for t in league_teams]
        sorted_ratios = sorted(r for _, r in ratios)
        n = len(sorted_ratios)
        mid = n // 2
        median_ratio = sorted_ratios[mid] if n % 2 else (sorted_ratios[mid - 1] + sorted_ratios[mid]) / 2
        if median_ratio <= 0:
            continue
        eligible_leagues[league] = {"n": n}
        for t, ratio in ratios:
            vva = round_sig_figs(ratio / median_ratio, 2)
            t["value_vs_attention"] = vva
            t["residual_pct"] = round_sig((vva - 1) * 100, 1) if vva is not None else None

    return eligible_leagues


def apply_value_fit_info(teams):
    """Informational only as of v0.9 -- no longer gates value_vs_attention
    (see apply_value_vs_attention above). The same log-log OLS fit of
    value_m on wiki_baseline_12m as before (non-speculative valued teams
    only), still computed per GROUP for method-summary.json's existing
    groups[] entries (continuity with earlier versions of that file), and
    ALSO computed per LEAGUE for method-summary.json's leagues[] entries --
    the granularity the methodology page's "how much attention explains
    value, by league" table needs, since a group like Football spans a
    dozen leagues with very different fits and one blended group-level R^2
    would hide that. Returns (fit_info_by_group, fit_info_by_league), each
    {key: {"n": int, "r2": float | None}}."""
    def _fit_by(keyfn):
        pairs_by_key = defaultdict(list)
        for t in teams:
            if (t["value_m"] is not None and t["value_m"] > 0 and t.get("wiki_baseline_12m")
                    and t.get("val_method") != "speculative"):
                pairs_by_key[keyfn(t)].append((t["wiki_baseline_12m"], t["value_m"]))
        info = {}
        for key, pairs in pairs_by_key.items():
            fit = _loglog_fit_r2(pairs)
            info[key] = {"n": len(pairs), "r2": round(fit[2], 3) if fit else None}
        return info

    return _fit_by(lambda t: t["group"]), _fit_by(lambda t: t["league"])


def build_json(fan_index_dir, out_path, extended_valuations_path=None, speculative_valuations_path=None,
                college_program_values_path=None):
    attention_rows = read_csv(os.path.join(fan_index_dir, "teams_fan_attention.csv"))
    monthly_rows = read_csv(os.path.join(fan_index_dir, "teams_monthly_long.csv"))
    extended_val_only = load_extended_valuations(extended_valuations_path)
    speculative_val = load_speculative_valuations(speculative_valuations_path)
    extended_val = merge_valuation_sources(extended_val_only, speculative_val)
    # Loaded and matched SEPARATELY (not merged into extended_val above) so a
    # program value takes precedence over the combined department row for the
    # same team+league no matter its method rank -- see best_extended_match()
    # calls in the loop below, which try college_program_val first.
    college_program_val = load_college_program_values(college_program_values_path)

    monthly_by_key = defaultdict(list)
    for r in monthly_rows:
        key = (r["league"], r["team"])
        monthly_by_key[key].append((r["year_month"], to_int(r["all_lang_views"]) or 0))
    for key in monthly_by_key:
        monthly_by_key[key].sort(key=lambda p: p[0])

    seen_groups = set()
    for r in attention_rows:
        seen_groups.add(r["group"])

    teams = []
    for r in attention_rows:
        league = r["league"]
        team = r["team"]
        group = r["group"]
        key = (league, team)

        has_val = r.get("has_valuation") == "1"
        monthly_series = [v for _, v in monthly_by_key.get(key, [])]
        monthly_series = monthly_series[-12:]
        if len(monthly_series) < 12:
            monthly_series = [None] * (12 - len(monthly_series)) + monthly_series

        value_m = to_float(r["value_m"]) if has_val else None
        val_source = r["val_source"] if has_val else None
        val_year = to_int(r["val_year"]) if has_val else None
        val_league = r.get("val_league") or None
        val_method = "published" if has_val else None
        val_confidence = "high" if has_val else None
        val_unit = None

        if not has_val:
            # Precedence: valuations.json (has_val, above) wins first; only
            # fall back to valuations_extended.csv when there is no
            # published valuations.json row for this team. Within the
            # extended file itself, load_extended_valuations() has already
            # ranked candidates per team (published > transaction > estimate);
            # best_extended_match() further restricts to rows whose resolved
            # league(s) include this team's league (a college row's single
            # row applies to both that school's football and basketball rows).
            ext_row = best_extended_match(college_program_val, league, r.get("display_name") or team, r.get("en_title"))
            if not ext_row:
                ext_row = best_extended_match(extended_val, league, r.get("display_name") or team, r.get("en_title"))
            if ext_row:
                value_m = to_float(ext_row.get("value_usd_m"))
                val_source = ext_row.get("source") or None
                val_year = to_int(ext_row.get("year"))
                val_league = ext_row.get("league") or None
                val_method = (ext_row.get("method") or "").strip().lower() or None
                val_confidence = (ext_row.get("confidence") or "").strip().lower() or None
                val_unit = ext_row.get("_unit")
                has_val = value_m is not None
        # Per the coordinator: never synthesize a value_m from attention data.
        # A team with no published (valuations.json) or transaction/published
        # extended row simply stays value_m=None -- there is no third,
        # attention-derived fallback anywhere in this function.

        wiki_baseline = to_float(r.get("wiki_baseline_12m"))
        value_per_1k_baseline = None
        if has_val and value_m is not None and wiki_baseline:
            value_per_1k_baseline = round_sig(value_m / (wiki_baseline / 1000.0), 2)

        teams.append({
            "team": team,
            "group": group,
            "league": league,
            "conference": r.get("conference") or None,
            "qid": r["qid"],
            "en_title": r["en_title"],
            "wiki_baseline_12m": to_int(wiki_baseline),
            "social_followers": to_int(r.get("social_followers")),
            "social_asof": r.get("social_asof") or None,
            "signal": r.get("signal") or None,
            "fan_index_raw": round_sig(to_float(r.get("fan_index_raw")), 3),
            "score_in_group": round_sig(to_float(r.get("score_in_group")), 1),
            "rank_in_group": to_int(r.get("rank_in_group")),
            "rank_in_league": to_int(r.get("rank_in_league")),
            "global_score": round_sig(to_float(r.get("global_score")), 1),
            "global_rank": to_int(r.get("global_rank")),
            "in_flux": r.get("in_flux") or None,
            "reddit_subscribers": to_int(r.get("reddit_subscribers")),
            "subreddit": r.get("subreddit") or None,
            "trends_index": round_sig(to_float(r.get("trends_index")), 2),
            "inclusion_rule": r.get("inclusion_rule") or None,
            "display_name": r.get("display_name") or None,
            "trends_excluded_reason": r.get("trends_excluded_reason") or None,
            "anchor_revenue_usd_m": to_float(r.get("anchor_revenue_usd_m")),
            "anchor_source": r.get("anchor_source") or None,
            "anchor_confidence": r.get("anchor_confidence") or None,
            "anchor_basis": r.get("anchor_basis") or None,
            "k_league": round_sig(to_float(r.get("k_league")), 6),
            "home_langs": r.get("home_langs") or None,
            "home_views_12m": to_int(r.get("home_views_12m")),
            "global_reach_pct": round_sig(to_float(r.get("global_reach_pct")), 2),
            # WNBA and Women's football (NWSL + WSL) are grouped under a
            # dedicated "Women's sports" tab on the site, distinct from the
            # source CSV's own category column (which files them under
            # "World"). This is the one place that distinction is applied;
            # every other group's category passes through unchanged.
            "category": ("Women's sports" if group in ("WNBA", "Women's football") else (r.get("category") or None)),
            "spike_ratio": round_sig(to_float(r.get("wiki_spike_ratio")), 2),
            "monthly": monthly_series,
            "value_m": value_m,
            "val_source": val_source,
            "val_year": val_year,
            "val_league": val_league,
            "val_method": val_method,
            "val_confidence": val_confidence,
            "val_unit": val_unit,
            "residual_pct": None,  # filled in by _apply_value_vs_attention_fits() below
            "value_vs_attention": None,  # filled in by _apply_value_vs_attention_fits() below
            "value_per_1k_baseline": value_per_1k_baseline,
            "season_article_coverage": (r.get("season_article_coverage") == "True"),
            # v0.6: US cross-league attention blend (Major American sports tab).
            # us_attention = geometric mean of (wiki share of the US universe) and
            # (Trends share of the US universe), expressed in wiki-equivalent views.
            # Null for every non-US-universe team (Trends wasn't run for them).
            "us_attention": round_sig(to_float(r.get("us_attention")), 1),
            "us_wiki_share": round_sig(to_float(r.get("us_wiki_share")), 5),
            "us_trends_area": round_sig(to_float(r.get("us_trends_area")), 1),
            "us_trends_share": round_sig(to_float(r.get("us_trends_share")), 5),
            "us_attention_rank": to_int(r.get("us_attention_rank")),
            "us_attention_rank_in_league": to_int(r.get("us_attention_rank_in_league")),
        })

    eligible_leagues = apply_value_vs_attention(teams)
    fit_info_by_group, fit_info_by_league = apply_value_fit_info(teams)

    # residual_eligible_groups: field name kept for continuity (the JSON
    # shape / lib/fanIndex.ts's fallback both still read it), but its
    # meaning changed with v0.9: the gate moved from a per-group R^2 fit to
    # a per-league valued-team count (see apply_value_vs_attention above),
    # so this is now "groups with at least one team whose value_vs_attention
    # is actually shown" rather than "groups whose fit cleared R^2 >= 0.4".
    residual_eligible_groups = sorted({t["group"] for t in teams if t.get("value_vs_attention") is not None})

    groups = [g for g in GROUP_ORDER if g in seen_groups]

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "window": {"start": WINDOW_START, "end": WINDOW_END},
        "version": VERSION,
        "method_url": METHOD_URL,
        "cross_sport_method": CROSS_SPORT_METHOD,
        # Not a public URL: data/fans/ is server-only (moved out of public/
        # 2026-09-24), so this is a repo-relative path for the pipeline and
        # for the auth-gated app/api/fans/route.ts, not something the
        # browser can fetch directly.
        "history_index_url": "data/fans/history/index.json",
        "groups": groups,
        "residual_eligible_groups": sorted(residual_eligible_groups),
        "teams": teams,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({len(teams)} teams, {size_kb:.1f} KB)")

    write_preview(payload, os.path.join(os.path.dirname(out_path), "preview.json"))
    write_method_summary(payload, fit_info_by_group, fit_info_by_league, eligible_leagues,
                          os.path.join(os.path.dirname(out_path), "method-summary.json"))

    return payload


# data/fans/preview.json: the ONE fan-index file that stays committed to the
# public repo (2026-09-24 Supabase migration -- see scripts/fans/README.md
# and supabase/migrations/20260924171144_fan_attention.sql). Top 20 of the
# All / cross-sport view, four fields per row (rank, name, league, icon,
# score) plus a little meta. Deliberately excludes href, group, qid, or
# anything else that could be used to look a team up further: the public
# page this feeds is unauthenticated, and the whole point of the gate is
# that nothing beyond the top 20's own numbers reaches an anonymous browser.
# data/fans/method-summary.json: tracked and public-safe (no team-level
# rows, no qid/en_title/anything that could be used to reconstruct a row).
# The /fans methodology page reads this instead of the full fan-attention.json,
# because that file lives outside public/ and is gitignored -- it will not
# exist at all in a production build, so the methodology page cannot read it.
def write_method_summary(payload, fit_info_by_group, fit_info_by_league, eligible_leagues, out_path):
    teams = payload["teams"]

    by_league = defaultdict(list)
    by_group = defaultdict(list)
    for t in teams:
        by_league[t["league"]].append(t)
        by_group[t["group"]].append(t)

    leagues = []
    for league, rows in sorted(by_league.items()):
        n = len(rows)
        covered = sum(1 for r in rows if r.get("season_article_coverage"))
        us_universe = [r for r in rows if r.get("us_attention") is not None]
        trends_covered = sum(1 for r in us_universe if r.get("us_trends_area") is not None)
        valued = sum(1 for r in rows if r.get("value_m") is not None)
        speculative_valued = sum(1 for r in rows if r.get("val_method") == "speculative")
        r0 = rows[0]
        fi = fit_info_by_league.get(league, {"n": 0, "r2": None})
        leagues.append({
            "league": league,
            "group": r0["group"],
            "team_count": n,
            "anchor_revenue_usd_m": r0.get("anchor_revenue_usd_m"),
            "anchor_source": r0.get("anchor_source"),
            "anchor_confidence": r0.get("anchor_confidence"),
            "anchor_basis": r0.get("anchor_basis"),
            "k_league": r0.get("k_league"),
            "season_article_coverage_pct": round_sig(100 * covered / n, 1) if n else None,
            "us_trends_coverage_pct": (round_sig(100 * trends_covered / len(us_universe), 1)
                                        if us_universe else None),
            "valued_count": valued,
            "valued_coverage_pct": round_sig(100 * valued / n, 1) if n else None,
            "speculative_valued_count": speculative_valued,
            # v0.9: the log-log attention-explains-value fit, informational
            # only (see apply_value_fit_info in csv_to_json.py), computed at
            # LEAGUE granularity so a group spanning many leagues (Football)
            # does not hide how differently each one fits. value_vs_attention
            # itself is gated separately, on a per-league valued-team count
            # (>= MIN_RATIO_N, any method) -- see value_vs_attention_shown.
            "value_fit_n": fi["n"],
            "value_fit_r2": fi["r2"],
            "value_vs_attention_shown": league in eligible_leagues,
        })

    groups = []
    for group, rows in sorted(by_group.items()):
        n = len(rows)
        covered = sum(1 for r in rows if r.get("season_article_coverage"))
        fi = fit_info_by_group.get(group, {"n": 0, "r2": None})
        groups.append({
            "group": group,
            "team_count": n,
            "value_fit_n": fi["n"],
            "value_fit_r2": fi["r2"],
            "value_vs_attention_shown": group in payload["residual_eligible_groups"],
            "season_article_coverage_pct": round_sig(100 * covered / n, 1) if n else None,
        })

    summary = {
        "generated": payload["generated"],
        "version": payload["version"],
        "window": payload["window"],
        "min_fit_n": MIN_FIT_N,
        "min_fit_r2": MIN_FIT_R2,
        "min_ratio_n": MIN_RATIO_N,
        "groups": groups,
        "leagues": leagues,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path} ({len(leagues)} leagues, {len(groups)} groups)")


def write_preview(payload, preview_path):
    # RAW identifiers only (team/group/qid), not a precomputed display name:
    # lib/fanIndex.ts's getFanIndexPreview() resolves the canonical name and
    # href at render time with the same resolveCanonical() the full table
    # uses, so this file cannot drift from the site's own team-linking
    # logic (which lives in TypeScript, not here). See that function's doc
    # comment.
    top20 = sorted(payload["teams"], key=lambda t: t["global_rank"])[:20]
    rows = [
        {
            "rank": t["global_rank"],
            "team": t["team"],
            "group": t["group"],
            "qid": t["qid"],
            "league": t["league"],
            "icon": icon_for(t["group"], t["league"]),
            "score": t["global_score"],
        }
        for t in top20
    ]
    preview = {
        "meta": {
            "version": payload["version"],
            "generated": payload["generated"],
            "window": payload["window"],
            "totalTeams": len(payload["teams"]),
        },
        "rows": rows,
    }
    with open(preview_path, "w", encoding="utf-8") as f:
        json.dump(preview, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {preview_path} ({len(rows)} rows)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--fan-index-dir",
        default=os.environ.get("FAN_INDEX_DIR"),
        help="Directory holding teams_fan_attention.csv, teams_monthly_long.csv and "
             "teams_fan_vs_valuation.csv. Required unless FAN_INDEX_DIR is set.",
    )
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "data", "fans", "fan-attention.json"))
    ap.add_argument(
        "--valuations-extended",
        default=os.path.join(os.path.dirname(__file__), "valuations_extended.csv"),
        help="Optional scripts/fans/valuations_extended.csv (team, league, value_usd_m, "
             "year, source, source_url, method, confidence, notes). Used only for teams "
             "with no published valuations.json match. Safe to omit -- if the file does "
             "not exist yet, its absence is silently ignored.",
    )
    ap.add_argument(
        "--valuations-speculative",
        default=os.path.join(os.path.dirname(__file__), "valuations_speculative.csv"),
        help="Optional scripts/fans/valuations_speculative.csv (same columns as "
             "valuations_extended.csv, method always 'speculative'). Lowest precedence: "
             "used only when neither valuations.json nor valuations_extended.csv has a "
             "row for that team. Excluded from the value-vs-attention fit's training data "
             "but still scored from it. Safe to omit.",
    )
    ap.add_argument(
        "--college-program-values",
        default=os.path.join(os.path.dirname(__file__), "pending", "college_program_values_tiered.csv"),
        help="Optional scripts/fans/pending/college_program_values_tiered.csv (same "
             "columns as valuations_extended.csv; method 'speculative'). A school's "
             "football or basketball program valued as a STANDALONE sport enterprise: "
             "EADA FY2025 sport revenue x a tiered EV/revenue multiple (brief supplied "
             "by Ashwin, 2026-09-24) -- see load_college_program_values(). Checked "
             "BEFORE valuations_extended.csv/valuations_speculative.csv, so a program "
             "value always wins over the combined department row for the same "
             "team+league. Swapped in 2026-09-24 for the earlier "
             "scripts/fans/pending/college_program_values.csv (revenue-share-of-"
             "department method, method 'derived') -- that file is kept and still "
             "loadable via this same flag, just no longer wired in by default. Safe "
             "to omit.",
    )
    args = ap.parse_args()
    if not args.fan_index_dir:
        ap.error("--fan-index-dir is required (or set FAN_INDEX_DIR)")
    ext_path = os.path.abspath(os.path.expanduser(args.valuations_extended)) if args.valuations_extended else None
    spec_path = os.path.abspath(os.path.expanduser(args.valuations_speculative)) if args.valuations_speculative else None
    college_path = (os.path.abspath(os.path.expanduser(args.college_program_values))
                    if args.college_program_values else None)
    build_json(os.path.abspath(os.path.expanduser(args.fan_index_dir)), os.path.abspath(args.out), ext_path, spec_path,
               college_path)


if __name__ == "__main__":
    sys.exit(main())
