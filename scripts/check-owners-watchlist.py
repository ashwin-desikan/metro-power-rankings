#!/usr/bin/env python3
"""Dead-man's switch for the /sports/owners watchlist.

The nine contested rows in scripts/data/team-owners-seed.json each record a
`pending_review_by` date: not "the deal closes then", but "a human should
re-verify this row by then". This checker is the only staleness signal the
ownership dataset has that costs nothing and cannot be wrong -- it does no
scraping and touches no network, it just compares dates.

Why a review date and not the prose in `pending_when`: that field says things
like "Two-month pre-emption window from 1 Aug 2026" and "Control expected to
pass around 2027". Regexing dates out of prose would be a guess dressed up as
a check.

Exit codes, deliberately graded so a just-passed date nudges before it shouts:
  0  nothing due, or something due within the grace period (warned, not failed)
  1  a row is overdue by more than GRACE_DAYS, or the seed is unreadable

The fix for a red run is always one of two human actions: update the row
because the deal resolved, or push `pending_review_by` out because it has not.
Both are content decisions, which is exactly why this does not try to automate
them.

Usage:
  python scripts/check-owners-watchlist.py
  python scripts/check-owners-watchlist.py --today 2026-12-01   # for testing
  python scripts/check-owners-watchlist.py --grace 0            # no grace
  python scripts/check-owners-watchlist.py --self-test
"""
import argparse
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "scripts", "data", "team-owners-seed.json")
GRACE_DAYS = 14


def classify(rows, today, grace_days=GRACE_DAYS):
    """Pure. Returns (overdue, due_soon, undated) lists of (team, league, by, days_over).

    `days_over` is positive when the review date has passed. A row whose date is
    still in the future is not reported at all -- this is a staleness check, not
    a calendar.
    """
    overdue, due_soon, undated = [], [], []
    for r in rows:
        if r.get("confidence") != "contested":
            continue
        raw = r.get("pending_review_by")
        if not raw:
            undated.append((r.get("team"), r.get("league")))
            continue
        try:
            by = datetime.date.fromisoformat(raw)
        except ValueError:
            undated.append((r.get("team"), r.get("league")))
            continue
        days_over = (today - by).days
        if days_over > grace_days:
            overdue.append((r["team"], r["league"], raw, days_over))
        elif days_over >= 0:
            due_soon.append((r["team"], r["league"], raw, days_over))
    overdue.sort(key=lambda t: -t[3])
    due_soon.sort(key=lambda t: -t[3])
    return overdue, due_soon, undated


def self_test():
    ok = True

    def check(label, got, want):
        nonlocal ok
        if got != want:
            ok = False
            print(f"  FAIL {label}: got {got!r}, want {want!r}")
        else:
            print(f"  ok   {label}")

    today = datetime.date(2026, 9, 10)
    rows = [
        {"team": "Future", "league": "NFL", "confidence": "contested", "pending_review_by": "2026-12-01"},
        {"team": "JustPassed", "league": "NFL", "confidence": "contested", "pending_review_by": "2026-09-05"},
        {"team": "LongOverdue", "league": "NBA", "confidence": "contested", "pending_review_by": "2026-06-01"},
        {"team": "NoDate", "league": "NHL", "confidence": "contested"},
        {"team": "Garbage", "league": "MLB", "confidence": "contested", "pending_review_by": "soon"},
        # A settled row with a past date must be ignored entirely: only
        # contested rows are on the watchlist.
        {"team": "Settled", "league": "MLB", "confidence": "sourced", "pending_review_by": "2020-01-01"},
    ]
    overdue, due_soon, undated = classify(rows, today)
    check("future date not reported", [t[0] for t in overdue + due_soon], ["LongOverdue", "JustPassed"])
    check("long overdue is overdue", [t[0] for t in overdue], ["LongOverdue"])
    check("just-passed is only due-soon", [t[0] for t in due_soon], ["JustPassed"])
    check("missing and unparseable dates flagged", sorted(t[0] for t in undated), ["Garbage", "NoDate"])
    check("non-contested row ignored", any(t[0] == "Settled" for t in overdue + due_soon + undated), False)

    # Exactly on the grace boundary is still only a warning, not a failure.
    boundary = [{"team": "Edge", "league": "NFL", "confidence": "contested",
                 "pending_review_by": (today - datetime.timedelta(days=GRACE_DAYS)).isoformat()}]
    o, d, _ = classify(boundary, today)
    check("grace boundary warns, does not fail", (len(o), len(d)), (0, 1))
    o, d, _ = classify(boundary, today, grace_days=0)
    check("--grace 0 makes the boundary fail", (len(o), len(d)), (1, 0))

    print("SELF-TEST:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", help="ISO date override, for testing")
    ap.add_argument("--grace", type=int, default=GRACE_DAYS)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    today = datetime.date.fromisoformat(args.today) if args.today else datetime.date.today()

    try:
        with open(SEED, encoding="utf-8") as fh:
            rows = json.load(fh)["rows"]
    except Exception as exc:  # unreadable seed is a real fault, not a quiet pass
        print(f"check-owners-watchlist: cannot read {SEED}: {exc}")
        return 1

    overdue, due_soon, undated = classify(rows, today, args.grace)
    contested = sum(1 for r in rows if r.get("confidence") == "contested")

    for team, league, by, days in overdue:
        print(f"OVERDUE  {team} ({league}) - review was due {by}, {days} days ago")
    for team, league, by, days in due_soon:
        print(f"due      {team} ({league}) - review date {by} passed {days} day(s) ago (within {args.grace}-day grace)")
    for team, league in undated:
        print(f"NO DATE  {team} ({league}) - contested with no usable pending_review_by")

    if overdue or undated:
        print(
            f"\ncheck-owners-watchlist FAIL - {len(overdue)} overdue, {len(undated)} undated, "
            f"of {contested} contested rows.\n"
            "Fix by editing scripts/data/team-owners-seed.json: either update the row because the\n"
            "deal resolved, or push pending_review_by out because it has not. Then re-run\n"
            "scripts/build-team-owners-data.py."
        )
        return 1

    if due_soon:
        print(f"\ncheck-owners-watchlist OK (warning) - {len(due_soon)} row(s) inside the {args.grace}-day grace window.")
    else:
        print(f"check-owners-watchlist OK - {contested} contested rows, none due for review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
