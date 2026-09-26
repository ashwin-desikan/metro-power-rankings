#!/usr/bin/env python3
"""
scripts/fans/seed_us_attention.py -- one-off 2026-09-26 carry-forward seed.

Backlog P1 (due before 3 Oct): universe_state.json has never carried the six
us_* fields (us_attention, us_wiki_share, us_trends_area, us_trends_share,
us_attention_rank, us_attention_rank_in_league) that the currently-published
data/fans/fan-attention.json has for 301 teams (the Major American sports US
attention blend). The full US pipeline (Job Search/fan_index, the Trends
chain) is NOT ported into monthly_refresh.py yet -- that is tracked
separately ("Fan Index: port us_attention (US Wiki + US Trends blend) into
monthly_refresh.py before 3 Oct"). Until that lands, monthly_refresh.py's
recompute has nowhere to get these six fields from, so this script seeds them
onto universe_state.json once, from the last known-good fan-attention.json,
matched by qid (falling back to (league, team) when qid is missing on either
side). monthly_refresh.py then carries them forward unchanged every month
(see the "carry-forward" comment block above write_scratch_csvs there).

Safe to rerun: it is idempotent given the same source file (it always
overwrites the six fields from the source, never merges), and running it
again with the same data/fans/fan-attention.json produces no diff.

Usage:
    python3 scripts/fans/seed_us_attention.py --dry
    python3 scripts/fans/seed_us_attention.py --write
"""
import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
STATE_PATH = os.path.join(HERE, "universe_state.json")
SOURCE_PATH = os.path.join(REPO, "data", "fans", "fan-attention.json")

US_FIELDS = [
    "us_attention", "us_wiki_share", "us_trends_area",
    "us_trends_share", "us_attention_rank", "us_attention_rank_in_league",
]


def load_source_index(source_teams):
    by_qid = {}
    by_league_team = {}
    for t in source_teams:
        if t.get("qid"):
            by_qid[t["qid"]] = t
        by_league_team[(t.get("league"), t.get("team"))] = t
    return by_qid, by_league_team


def seed(u, source_teams):
    by_qid, by_league_team = load_source_index(source_teams)
    n_matched = 0
    n_with_us_attention = 0
    n_unmatched = 0
    for r in u:
        src = by_qid.get(r.get("qid"))
        if src is None:
            src = by_league_team.get((r.get("league"), r.get("team")))
        if src is None:
            n_unmatched += 1
            continue
        n_matched += 1
        for f in US_FIELDS:
            v = src.get(f)
            if v is not None:
                r[f] = v
        if src.get("us_attention") is not None:
            n_with_us_attention += 1
    return n_matched, n_with_us_attention, n_unmatched


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="print counts, write nothing")
    ap.add_argument("--write", action="store_true", help="write universe_state.json")
    ap.add_argument("--source", default=SOURCE_PATH,
                     help="fan-attention.json to seed from (default: data/fans/fan-attention.json)")
    ap.add_argument("--state", default=STATE_PATH,
                     help="universe_state.json to seed onto (default: scripts/fans/universe_state.json)")
    args = ap.parse_args()
    if not args.dry and not args.write:
        ap.error("pass --dry or --write")

    u = json.load(open(args.state, encoding="utf-8"))
    source = json.load(open(args.source, encoding="utf-8"))
    source_teams = source["teams"]

    n_matched, n_with_us_attention, n_unmatched = seed(u, source_teams)
    print(f"universe rows: {len(u)}")
    print(f"matched to source (by qid, fallback league+team): {n_matched}")
    print(f"unmatched (no source row): {n_unmatched}")
    print(f"rows seeded with a non-null us_attention: {n_with_us_attention}")

    if args.dry:
        print("DRY RUN: nothing written")
        return

    with open(args.state, "w", encoding="utf-8") as f:
        json.dump(u, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {args.state}")


if __name__ == "__main__":
    main()
