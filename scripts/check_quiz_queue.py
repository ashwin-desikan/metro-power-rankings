#!/usr/bin/env python3
"""CI guard for the quiz queue.

Validates that the forward queue at public/data/quiz_queue.json:
  1. Extends at least MIN_FORWARD_DAYS into the future from today
  2. Every answer slug resolves to a real metros.json entry
  3. Tier-band claims (dimension-capital:top-N) still hold against
     current dimRanks data
  4. Badge-holder claims still hold against current badge CSVs
  5. Conurbation-member claims still hold against current conurbations.csv
  6. No duplicate answers within a single issue

Exits non-zero on failure. Run via CI on every commit, and locally before
pushing changes that touch the queue or the data layer.

Run:
  python3 scripts/check_quiz_queue.py
  python3 scripts/check_quiz_queue.py --strict      # fail on warnings too

Exit codes:
  0 — all checks passed (warnings allowed unless --strict)
  1 — at least one error
  2 — queue file missing
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
DETAILS = DATA / "details"
QUEUE_PATH = DATA / "quiz_queue.json"

MIN_FORWARD_DAYS = 21
BADGE_FILES = [
    "academic-gravity-wells", "conurbations", "cosmopolitan-capital",
    "culture-capital", "emerging-standout", "finance-capital",
    "frozen-conurbations", "global-gateway", "greying-power",
    "isolated-capital", "megaregions", "overperformer",
    "rail-hub", "skyline-cities", "sports-mecca", "twin-metros",
]


def parse_dim_rank(raw):
    if raw is None: return None
    if isinstance(raw, (int, float)): return int(raw)
    s = str(raw).strip()
    if not s or s.lower() == "none": return None
    m = re.match(r"T?-?(\d+)", s)
    if m: return int(m.group(1))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true",
                    help="Fail on warnings as well as errors")
    args = ap.parse_args()

    if not QUEUE_PATH.exists():
        print(f"ERROR: quiz queue not found at {QUEUE_PATH}", file=sys.stderr)
        return 2

    queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
    metros = json.loads((DATA / "metros.json").read_text(encoding="utf-8"))
    by_slug = {m["slug"]: m for m in metros}

    # Load badges
    badges_by_metro = defaultdict(set)
    for b in BADGE_FILES:
        p = DATA / f"{b}.csv"
        if not p.exists(): continue
        # Explicit encoding: cp1252 is the Windows default and blows up on accented
        # metro names. Same defect as generate_quiz_questions.py. Fixed 2026-08-07.
        with p.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if row.get("slug"):
                    badges_by_metro[row["slug"]].add(b)

    # Load conurbation cluster slug -> cluster_id
    slug_to_cluster: dict[str, str] = {}
    cluster_sizes: dict[str, int] = {}
    with (DATA / "conurbations.csv").open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            cid = row["cluster_id"]
            cluster_sizes[cid] = int(row["cluster_size"])
            for s in row["cluster_member_slugs"].split(";"):
                if s: slug_to_cluster[s] = cid

    today = datetime.now(timezone.utc).date()
    errors: list[str] = []
    warnings: list[str] = []

    issues = queue.get("issues", [])
    forward_issues = [i for i in issues if date.fromisoformat(i["date"]) >= today]

    # Check 1: forward queue depth
    if len(forward_issues) < MIN_FORWARD_DAYS:
        errors.append(
            f"Forward queue depth is {len(forward_issues)} days; "
            f"minimum is {MIN_FORWARD_DAYS}. Run scripts/generate_quiz_questions.py."
        )

    # Per-issue checks
    seen_dates = set()
    for issue in issues:
        d = issue["date"]
        if d in seen_dates:
            errors.append(f"Issue {issue['issue']}: duplicate date {d}")
        seen_dates.add(d)

        slugs_in_issue: list[str] = []
        for q_idx, q in enumerate(issue["questions"], 1):
            slug = q.get("answerSlug")
            if not slug:
                errors.append(f"{d} Q{q_idx}: missing answerSlug")
                continue
            slugs_in_issue.append(slug)

            # Check 2: slug exists
            if slug not in by_slug:
                errors.append(f"{d} Q{q_idx}: answerSlug '{slug}' not in metros.json")
                continue

            mode = q.get("mode")

            # Check 3: tier-band claim for dimension-capital
            if mode == "dimension-capital":
                hook = q.get("hookDimension")
                band = q.get("tierBand")
                if not hook or not band:
                    errors.append(f"{d} Q{q_idx}: dimension-capital missing hookDimension or tierBand")
                    continue
                detail_path = DETAILS / f"{slug}.json"
                if not detail_path.exists():
                    errors.append(f"{d} Q{q_idx}: details/{slug}.json missing for dimension-capital validation")
                    continue
                detail = json.loads(detail_path.read_text(encoding="utf-8"))
                rank = parse_dim_rank(detail.get("dimRanks", {}).get(hook))
                band_max = {"top-3": 3, "top-10": 10, "top-50": 50}.get(band)
                if band_max is None:
                    errors.append(f"{d} Q{q_idx}: unknown tierBand '{band}'")
                elif rank is None:
                    warnings.append(
                        f"{d} Q{q_idx}: {slug} has no rank for dimension '{hook}' "
                        f"(expected {band}); regenerate this issue"
                    )
                elif rank > band_max:
                    warnings.append(
                        f"{d} Q{q_idx}: {slug} is rank {rank} on '{hook}' "
                        f"but clue claims {band}; regenerate this issue"
                    )

            # Check 4: badge-holder claim
            elif mode == "badge-holder":
                badge_slug = q.get("extra", {}).get("badge")
                if not badge_slug:
                    errors.append(f"{d} Q{q_idx}: badge-holder missing extra.badge")
                    continue
                if badge_slug not in badges_by_metro.get(slug, set()):
                    warnings.append(
                        f"{d} Q{q_idx}: {slug} no longer holds badge '{badge_slug}'; "
                        f"regenerate this issue"
                    )

            # Check 5: conurbation-member claim
            elif mode == "conurbation-member":
                cid = q.get("extra", {}).get("clusterId")
                if not cid:
                    errors.append(f"{d} Q{q_idx}: conurbation-member missing extra.clusterId")
                    continue
                if slug_to_cluster.get(slug) != cid:
                    warnings.append(
                        f"{d} Q{q_idx}: {slug} no longer belongs to cluster '{cid}'; "
                        f"regenerate this issue"
                    )
                elif cluster_sizes.get(cid, 0) < 2:
                    warnings.append(
                        f"{d} Q{q_idx}: cluster '{cid}' is now a single-member cluster; "
                        f"regenerate"
                    )

            # Check 6: tier-reveal "second-ranked-in-country" claim
            elif mode == "tier-reveal":
                variant = q.get("extra", {}).get("variant", q.get("clueTemplate", "").split(":")[-1])
                if variant == "second-ranked-in-country":
                    me = by_slug[slug]
                    same_country = sorted(
                        (m for m in metros if m["country"] == me["country"]),
                        key=lambda x: -x["score"],
                    )
                    if len(same_country) < 2 or same_country[1]["slug"] != slug:
                        warnings.append(
                            f"{d} Q{q_idx}: {slug} is no longer rank-2 in {me['country']}; "
                            f"regenerate"
                        )

            # Check 7: top-teams team-still-exists
            elif mode == "top-teams":
                team = q.get("extra", {}).get("team")
                if not team:
                    errors.append(f"{d} Q{q_idx}: top-teams missing extra.team")
                    continue
                detail_path = DETAILS / f"{slug}.json"
                if detail_path.exists():
                    detail = json.loads(detail_path.read_text(encoding="utf-8"))
                    teams = detail.get("teams", [])
                    if not any(t.get("team") == team for t in teams):
                        warnings.append(
                            f"{d} Q{q_idx}: team '{team}' no longer in {slug} details; "
                            f"regenerate"
                        )

        # Same-day duplicates
        if len(slugs_in_issue) != len(set(slugs_in_issue)):
            dupes = [s for s in slugs_in_issue if slugs_in_issue.count(s) > 1]
            errors.append(f"{d}: duplicate answer slug(s) in same issue: {set(dupes)}")

    # Output
    if errors:
        print(f"FAILED: {len(errors)} error(s)", file=sys.stderr)
        for e in errors:
            print(f"  ERROR: {e}", file=sys.stderr)

    if warnings:
        level = "FAILED" if args.strict else "WARN"
        out = sys.stderr if args.strict else sys.stdout
        print(f"{level}: {len(warnings)} warning(s)", file=out)
        for w in warnings:
            print(f"  WARN: {w}", file=out)

    if errors or (warnings and args.strict):
        return 1

    print(
        f"OK: queue valid. Forward depth: {len(forward_issues)} days. "
        f"{len(issues)} total issues. {len(warnings)} warnings."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
