#!/usr/bin/env python3
"""
scripts/fans/csv_to_json.py

Turns the three Fan Attention Index CSVs (teams_fan_attention.csv,
teams_monthly_long.csv, teams_fan_vs_valuation.csv) into the single JSON file
the /fans page reads: public/data/fans/fan-attention.json.

v0.2: new schema (wiki_baseline_12m, social_followers, signal, fan_index_raw,
score_in_group, global_score, global_rank, in_flux, etc). See
fan_index/README.md REVISION 5 for the full method writeup.

Pure offline transform, no network calls. Safe to re-run any time the source
CSVs change; it does not touch the CSVs themselves.

Usage:
    python3 scripts/fans/csv_to_json.py \
        --fan-index-dir "/path/to/fan_index" \
        --out public/data/fans/fan-attention.json

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
VERSION = "v0.2.1"
METHOD_URL = "/fans/methodology"

GROUP_ORDER = [
    "NFL", "NBA", "MLB", "NHL", "Football", "College football",
    "College basketball", "EuroLeague", "AFL", "NRL", "IPL", "F1",
    "WNBA", "NWSL",
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
    monthly_rows = read_csv(os.path.join(fan_index_dir, "teams_monthly_long.csv"))

    monthly_by_key = defaultdict(list)
    for r in monthly_rows:
        key = (r["league"], r["team"])
        monthly_by_key[key].append((r["year_month"], to_int(r["all_lang_views"]) or 0))
    for key in monthly_by_key:
        monthly_by_key[key].sort(key=lambda p: p[0])

    residual_eligible_groups = set()
    for r in attention_rows:
        if r.get("residual_pct") not in (None, ""):
            residual_eligible_groups.add(r["group"])

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

        residual_pct = None
        if has_val and group in residual_eligible_groups:
            residual_pct = to_float(r.get("residual_pct"))

        value_m = to_float(r["value_m"]) if has_val else None
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
            "spike_ratio": round_sig(to_float(r.get("wiki_spike_ratio")), 2),
            "monthly": monthly_series,
            "value_m": value_m,
            "val_source": r["val_source"] if has_val else None,
            "val_year": to_int(r["val_year"]) if has_val else None,
            "val_league": r.get("val_league") or None,
            "residual_pct": round_sig(residual_pct, 1),
            "value_per_1k_baseline": value_per_1k_baseline,
        })

    groups = [g for g in GROUP_ORDER if g in seen_groups]

    payload = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        "window": {"start": WINDOW_START, "end": WINDOW_END},
        "version": VERSION,
        "method_url": METHOD_URL,
        "groups": groups,
        "residual_eligible_groups": sorted(residual_eligible_groups),
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
