#!/usr/bin/env python3
"""
scripts/fans/csv_to_json.py

Turns the three Fan Attention Index CSVs (teams_fan_attention.csv,
teams_monthly_long.csv, teams_fan_vs_valuation.csv) into the single JSON file
the /fans page reads: public/data/fans/fan-attention.json.

Pure offline transform, no network calls. Safe to re-run any time the source
CSVs change (e.g. after a Mac-mini refresh via build_fan_index.py); it does
not touch the CSVs themselves.

Usage:
    python3 scripts/fans/csv_to_json.py \
        --fan-index-dir "/path/to/fan_index" \
        --out public/data/fans/fan-attention.json

--fan-index-dir can also be set via the FAN_INDEX_DIR environment variable.
--out defaults to public/data/fans/fan-attention.json relative to the repo
root (this file's grandparent directory), which is right when run from
anywhere inside the repo.
"""
import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

WINDOW_START = "2025-09"
WINDOW_END = "2026-08"
VERSION = "v0.1"
METHOD_URL = "/fans/methodology"

# Groups whose log-log value_m ~ baseline_12m regression clears R^2 >= 0.4
# (see README.md "Regression: value_m ~ baseline_12m (log-log OLS)"). Only
# these groups get a residual_pct on the page; the rest render "n/a" because
# the fitted line explains too little of the group's variance to make a
# per-team residual meaningful.
RESIDUAL_ELIGIBLE_GROUPS = {"European football", "MLB", "NBA", "NFL"}

GROUP_ORDER = [
    "NFL", "NBA", "MLB", "NHL", "MLS", "WNBA/NWSL", "F1",
    "European football", "Liga MX",
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


def build_json(fan_index_dir, out_path):
    attention_rows = read_csv(os.path.join(fan_index_dir, "teams_fan_attention.csv"))
    valuation_rows = read_csv(os.path.join(fan_index_dir, "teams_fan_vs_valuation.csv"))
    monthly_rows = read_csv(os.path.join(fan_index_dir, "teams_monthly_long.csv"))

    # (league, team) -> {residual_pct, value_per_1k_baseline}, only present for
    # the 220 teams with a valuation.
    val_by_key = {}
    for r in valuation_rows:
        key = (r["league"], r["team"])
        val_by_key[key] = {
            "residual_pct": to_float(r["residual_pct"]),
            "value_per_1k_baseline": to_float(r["value_per_1k_baseline"]),
        }

    # (league, team) -> 12 ints, oldest first (year_month sorts correctly as a
    # string in YYYYMM form).
    monthly_by_key = defaultdict(list)
    for r in monthly_rows:
        key = (r["league"], r["team"])
        monthly_by_key[key].append((r["year_month"], to_int(r["all_lang_views"]) or 0))
    for key in monthly_by_key:
        monthly_by_key[key].sort(key=lambda p: p[0])

    # Group baseline_12m totals and maxima, for attention_share_in_group,
    # attention_score and rank_in_group.
    baseline_by_group = defaultdict(list)  # group -> [(team_key, baseline_12m)]
    for r in attention_rows:
        b = to_float(r["baseline_12m"]) or 0.0
        baseline_by_group[r["group"]].append((r["league"], r["team"], b))

    group_max = {g: max((b for _, _, b in rows), default=0.0) for g, rows in baseline_by_group.items()}
    group_sum = {g: sum(b for _, _, b in rows) for g, rows in baseline_by_group.items()}
    group_rank = {}
    for g, rows in baseline_by_group.items():
        ordered = sorted(rows, key=lambda t: t[2], reverse=True)
        for i, (league, team, _b) in enumerate(ordered, start=1):
            group_rank[(g, league, team)] = i

    teams = []
    for r in attention_rows:
        league = r["league"]
        team = r["team"]
        group = r["group"]
        key = (league, team)
        baseline = to_float(r["baseline_12m"]) or 0.0
        gmax = group_max.get(group) or 1.0
        gsum = group_sum.get(group) or 1.0
        attention_score = round(baseline / gmax * 100, 1) if gmax else 0.0
        attention_share = round(baseline / gsum, 4) if gsum else 0.0

        has_val = r.get("has_valuation") == "1"
        val = val_by_key.get(key)
        residual_pct = None
        if has_val and group in RESIDUAL_ELIGIBLE_GROUPS and val and val["residual_pct"] is not None:
            residual_pct = round(val["residual_pct"] * 100, 1)

        monthly_series = [v for _, v in monthly_by_key.get(key, [])]
        if len(monthly_series) != 12:
            # Missing/short series should never silently ship a misleading
            # sparkline; pad with None rather than guessing.
            monthly_series = (monthly_series + [None] * 12)[:12]

        teams.append({
            "team": team,
            "group": group,
            "league": league,
            "qid": r["qid"],
            "en_title": r["en_title"],
            # Finer-grained than `league` for the WNBA/NWSL group (whose
            # `league` column is the same for both leagues); the frontend
            # needs this to resolve the right team-link sport (WNBA vs the
            # "W Football" NWSL portal).
            "val_league": r["val_league"],
            "baseline_12m": to_int(baseline),
            "all_lang_views_12m": to_int(r["all_lang_views_12m"]),
            "en_views_12m": to_int(r["en_views_12m"]),
            "lang_count": to_int(r["lang_count"]),
            "spike_ratio": round_sig(to_float(r["spike_ratio"]), 2),
            "attention_share_in_group": attention_share,
            "attention_score": attention_score,
            "rank_in_group": group_rank.get((group, league, team)),
            "monthly": monthly_series,
            "value_m": to_float(r["value_m"]) if has_val else None,
            "val_source": r["val_source"] if has_val else None,
            "val_year": to_int(r["val_year"]) if has_val else None,
            "residual_pct": residual_pct,
            "value_per_1k_baseline": round_sig(val["value_per_1k_baseline"], 0) if (has_val and val) else None,
        })

    groups = [g for g in GROUP_ORDER if g in baseline_by_group]

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "window": {"start": WINDOW_START, "end": WINDOW_END},
        "version": VERSION,
        "method_url": METHOD_URL,
        "groups": groups,
        "teams": teams,
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({len(teams)} teams, {size_kb:.1f} KB)")
    return payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--fan-index-dir",
        default=os.environ.get("FAN_INDEX_DIR"),
        help="Directory holding teams_fan_attention.csv, teams_monthly_long.csv and "
             "teams_fan_vs_valuation.csv. Required unless FAN_INDEX_DIR is set.",
    )
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fans", "fan-attention.json"))
    args = ap.parse_args()
    if not args.fan_index_dir:
        ap.error("--fan-index-dir is required (or set FAN_INDEX_DIR)")
    build_json(os.path.abspath(os.path.expanduser(args.fan_index_dir)), os.path.abspath(args.out))


if __name__ == "__main__":
    sys.exit(main())
