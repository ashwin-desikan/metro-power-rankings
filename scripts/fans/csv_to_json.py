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


# method precedence for valuations_extended.csv rows, low index = wins first
_METHOD_RANK = {"published": 0, "transaction": 1, "estimate": 2, "speculative": 3}

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
    "Brazilian football (division unconfirmed)": ["Brasileirão"],
    "NRL": ["NRL"],
    "AFL": ["AFL"],
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


MIN_FIT_N = 4       # minimum valued teams in a group before a fit is attempted
MIN_FIT_R2 = 0.4    # coordinator's threshold; below this, no predicted_value_m/value_vs_attention


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


def apply_value_vs_attention_fits(teams):
    """Recomputes, per group, a log-log OLS fit of value_m on
    wiki_baseline_12m using every NON-speculative valued team in that group
    (valuations.json published, or valuations_extended.csv published/
    transaction/estimate -- speculative-sourced value_m rows are excluded
    from the fit's training data per the coordinator's v0.7 ruling, since
    they are unverified). For groups where the fit clears MIN_FIT_R2, sets
    value_vs_attention = value_m / predicted_value_m (2 decimals) and
    residual_pct = (value_vs_attention - 1) * 100 for EVERY valued team in
    that group, including speculative ones -- they are scored FROM the fit,
    just never used to TRAIN it. Groups below the R^2 threshold, or with too
    few non-speculative valued teams, get value_vs_attention = residual_pct
    = None for every team. Returns (sorted list of groups that cleared the
    threshold, {group: {n, r2}} for every group a fit was attempted on,
    whether or not it cleared) -- n counts only the non-speculative training
    pairs."""
    all_valued = defaultdict(list)
    fit_valued = defaultdict(list)
    for t in teams:
        if t["value_m"] is not None and t["value_m"] > 0 and t.get("wiki_baseline_12m"):
            all_valued[t["group"]].append(t)
            if t.get("val_method") != "speculative":
                fit_valued[t["group"]].append(t)

    eligible_groups = []
    fit_info = {}
    for group, group_teams in all_valued.items():
        pairs = [(t["wiki_baseline_12m"], t["value_m"]) for t in fit_valued.get(group, [])]
        fit = _loglog_fit_r2(pairs)
        if fit is None:
            fit_info[group] = {"n": len(pairs), "r2": None}
            continue
        slope, intercept, r2 = fit
        fit_info[group] = {"n": len(pairs), "r2": round(r2, 3)}
        if r2 < MIN_FIT_R2:
            continue
        eligible_groups.append(group)
        for t in group_teams:
            predicted = math.exp(intercept + slope * math.log(t["wiki_baseline_12m"]))
            if predicted <= 0:
                continue
            vva = round_sig(t["value_m"] / predicted, 2)
            t["value_vs_attention"] = vva
            t["residual_pct"] = round_sig((vva - 1) * 100, 1)

    return sorted(eligible_groups), fit_info


def build_json(fan_index_dir, out_path, extended_valuations_path=None, speculative_valuations_path=None):
    attention_rows = read_csv(os.path.join(fan_index_dir, "teams_fan_attention.csv"))
    monthly_rows = read_csv(os.path.join(fan_index_dir, "teams_monthly_long.csv"))
    extended_val_only = load_extended_valuations(extended_valuations_path)
    speculative_val = load_speculative_valuations(speculative_valuations_path)
    extended_val = merge_valuation_sources(extended_val_only, speculative_val)

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

    residual_eligible_groups, fit_info_by_group = apply_value_vs_attention_fits(teams)

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
    write_method_summary(payload, fit_info_by_group,
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
def write_method_summary(payload, fit_info_by_group, out_path):
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
    args = ap.parse_args()
    if not args.fan_index_dir:
        ap.error("--fan-index-dir is required (or set FAN_INDEX_DIR)")
    ext_path = os.path.abspath(os.path.expanduser(args.valuations_extended)) if args.valuations_extended else None
    spec_path = os.path.abspath(os.path.expanduser(args.valuations_speculative)) if args.valuations_speculative else None
    build_json(os.path.abspath(os.path.expanduser(args.fan_index_dir)), os.path.abspath(args.out), ext_path, spec_path)


if __name__ == "__main__":
    sys.exit(main())
