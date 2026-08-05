#!/usr/bin/env python3
"""Dead-man's switch for the scheduled data fleet.

Answers one question: has each auto-refreshed dataset been committed recently
enough that its owning job is plausibly still alive? It deliberately does NOT
check content, only recency, because the failure it exists to catch is a runner
that stopped running -- a mini that slept, a launchd job that never loaded, a
disabled workflow -- none of which produce an error anywhere today.

Why this lives on GitHub Actions and not on the mini: a watchdog must not share
a failure domain with the thing it watches. GitHub's 1-4h cron dispatch lag
(measured 2026-08-05 over 348 runs) is irrelevant for a 6-hourly check, which
makes Actions the correct home for exactly this one job.

Stdlib only. --self-test covers the pure decision logic and is gated in CI
before any git call, per the repo's refresh-script convention.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone

# --- the fleet -------------------------------------------------------------
# max_hours is deliberately generous: it is sized to catch "the runner is dead",
# not "a run was late". months=None means all year.
#
# CHANGE-GATED paths (the job commits only when the data actually moved) carry
# change_gated=True. For those, a breach is a prompt to look, not proof of a
# fault -- a genuinely quiet upstream can trip it. Sized so it takes at least
# two missed cycles to fire.
CHECKS = [
    {
        "id": "business-markets",
        "path": "public/data/business/markets.json",
        "max_hours": 30,
        "cadence": "daily 05:50 UTC (business-daily-refresh)",
        "months": None,
        "change_gated": False,
    },
    {
        "id": "business-fx",
        "path": "public/data/business/fx.json",
        "max_hours": 30,
        "cadence": "daily 05:50 UTC (business-daily-refresh)",
        "months": None,
        "change_gated": False,
    },
    {
        "id": "mlb-sim",
        "path": "public/data/mlb-sim.json",
        "max_hours": 36,
        "cadence": "daily 09:40 UTC, Mar-Nov (mlb-sim-refresh)",
        "months": list(range(3, 12)),
        "change_gated": False,
    },
    {
        "id": "pl-sim",
        "path": "public/data/pl-sim.json",
        "max_hours": 9 * 24,
        "cadence": "Tue 06:40 + Fri 11:40 UTC (predictions-refresh)",
        "months": None,
        "change_gated": True,
    },
    {
        "id": "nfl-sim",
        "path": "public/data/nfl-sim.json",
        "max_hours": 9 * 24,
        "cadence": "Tue 06:40 + Fri 11:40 UTC (predictions-refresh)",
        "months": None,
        "change_gated": True,
    },
    {
        "id": "forecast",
        "path": "public/data/forecast.json",
        "max_hours": 9 * 24,
        "cadence": "Mon/Wed/Fri 06:10 UTC (forecast-weekly)",
        "months": None,
        "change_gated": True,
    },
    {
        # Added 2026-08-05 alongside e2801ca8b / 464212184, the fix for the
        # 4 Aug night outage where Vercel-to-ESPN fetches failed for 3+ hours
        # and every live standings section vanished with zero runtime errors.
        # Committed snapshots are now the fallback, which means THIS path going
        # stale silently re-arms that exact failure mode: the fallback would be
        # there but old. Budget is provisional and deliberately loose until the
        # job's real commit rhythm is observed over a week -- an 8-runs-a-day
        # job that only commits when standings move can be quiet overnight, and
        # a watchdog that cries wolf in its first week gets muted forever.
        # Tighten it once there is a week of history, do not just delete it.
        "id": "espn-snapshots",
        "path": "public/data/espn-snapshots",
        "max_hours": 24,
        "cadence": "every 3h at :25 (espn-standings-snapshot)",
        "months": None,
        "change_gated": True,
    },
]


def evaluate(now, last_commit_iso, max_hours, months=None):
    """Pure decision logic. Returns (status, age_hours).

    status is one of: "ok", "stale", "skipped-out-of-season", "unknown".
    A path with no commits at all is "unknown", never "stale": a dataset that
    has never existed is a different problem from one that stopped updating,
    and conflating them makes the alarm untrustworthy.
    """
    if months is not None and now.month not in months:
        return "skipped-out-of-season", None
    if not last_commit_iso:
        return "unknown", None
    ts = datetime.fromisoformat(last_commit_iso)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_hours = (now - ts.astimezone(timezone.utc)).total_seconds() / 3600.0
    # Strictly greater: exactly at the threshold is still OK, so a job that
    # lands right on its budget every day does not flap.
    return ("stale" if age_hours > max_hours else "ok"), age_hours


def last_commit_iso(path):
    """Committer date of the newest commit touching path, or "" if none."""
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path],
            capture_output=True, text=True, check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""
    return out.stdout.strip()


def run_checks(now=None):
    now = now or datetime.now(timezone.utc)
    rows = []
    for c in CHECKS:
        iso = last_commit_iso(c["path"])
        status, age = evaluate(now, iso, c["max_hours"], c["months"])
        rows.append({
            "id": c["id"],
            "path": c["path"],
            "cadence": c["cadence"],
            "change_gated": c["change_gated"],
            "max_hours": c["max_hours"],
            "last_commit": iso,
            "age_hours": None if age is None else round(age, 1),
            "status": status,
        })
    return rows


MARKS = {
    "ok": "ok",
    "stale": "**STALE**",
    "unknown": "unknown",
    "skipped-out-of-season": "off-season",
}


def render(rows, now=None):
    now = now or datetime.now(timezone.utc)
    bad = [r for r in rows if r["status"] in ("stale", "unknown")]
    lines = [f"Checked {now.strftime('%Y-%m-%d %H:%M')} UTC.", ""]
    lines.append("| dataset | status | age | budget | cadence |")
    lines.append("|---|---|---|---|---|")
    for r in rows:
        age = "-" if r["age_hours"] is None else f"{r['age_hours']:.0f}h"
        lines.append(
            f"| `{r['path']}` | {MARKS[r['status']]} | {age} | "
            f"{r['max_hours']}h | {r['cadence']} |"
        )
    lines.append("")
    if bad:
        lines.append("### What to check")
        lines.append("")
        lines.append("1. Is the owning runner alive? Part of this fleet runs on the "
                     "Mac mini dispatcher; a sleeping mini is the likeliest cause.")
        lines.append("2. If the mini is down, every migrated job still exists as a "
                     "GitHub Action with `workflow_dispatch` kept as a manual fallback.")
        lines.append("3. Do NOT read a missing commit as a failed run. GitHub "
                     "dispatches crons 1-4h late; check the runner's own log or the "
                     "Actions runs API before diagnosing.")
        gated = [r for r in bad if r["change_gated"]]
        if gated:
            lines.append("")
            lines.append("Note: " + ", ".join(f"`{r['path']}`" for r in gated) +
                         " commit only when the data actually changes, so a quiet "
                         "upstream can trip this legitimately. Confirm the job ran "
                         "before treating it as a fault.")
    return "\n".join(lines)


def self_test():
    now = datetime(2026, 8, 5, 12, 0, tzinfo=timezone.utc)
    cases = []

    def check(label, got, want):
        cases.append((label, got, want))

    # exactly at the budget is OK, one minute past is not -- no flapping on a
    # job that lands right on its budget every day
    check("at budget", evaluate(now, "2026-08-04T06:00:00+00:00", 30)[0], "ok")
    check("past budget", evaluate(now, "2026-08-04T05:59:00+00:00", 30)[0], "stale")
    check("fresh", evaluate(now, "2026-08-05T08:10:00+00:00", 30)[0], "ok")

    # a path that has never been committed is unknown, not stale
    check("no commits", evaluate(now, "", 30)[0], "unknown")

    # seasonal jobs are skipped outside their months even when ancient
    check("out of season", evaluate(now, "2025-01-01T00:00:00+00:00", 36,
                                    months=[12, 1, 2])[0], "skipped-out-of-season")
    check("in season", evaluate(now, "2025-01-01T00:00:00+00:00", 36,
                                months=list(range(3, 12)))[0], "stale")

    # non-UTC offsets must normalise, not skew the age by the offset.
    # 2026-08-05T09:00+01:00 == 08:00 UTC == 4h before now
    check("offset normalised",
          round(evaluate(now, "2026-08-05T09:00:00+01:00", 30)[1], 1), 4.0)

    # naive timestamps are assumed UTC rather than crashing
    check("naive assumed utc",
          round(evaluate(now, "2026-08-05T08:00:00", 30)[1], 1), 4.0)

    # the real 4 Aug business-daily run, seen from 5 Aug noon, is 27.8h old:
    # inside the 30h budget precisely because the budget allows for dispatch lag
    check("measured 04-aug run",
          evaluate(now, "2026-08-04T08:10:10+00:00", 30)[0], "ok")

    # a seasonal job checked on its boundary month is in scope
    check("boundary month in scope",
          evaluate(datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc),
                   "2026-02-01T00:00:00+00:00", 36, months=list(range(3, 12)))[0],
          "stale")

    failed = [(l, g, w) for l, g, w in cases if g != w]
    for label, got, want in cases:
        print(f"  {'PASS' if got == want else 'FAIL'}  {label}: got {got!r}, want {want!r}")
    if failed:
        print(f"\n{len(failed)}/{len(cases)} FAILED", file=sys.stderr)
        return 1
    print(f"\nself-test OK ({len(cases)} cases)")
    return 0


def main():
    ap = argparse.ArgumentParser(description="staleness watchdog for the data fleet")
    ap.add_argument("--self-test", action="store_true",
                    help="run the offline decision-logic tests and exit")
    ap.add_argument("--json", action="store_true", help="emit raw rows as JSON")
    ap.add_argument("--fail-on-stale", action="store_true",
                    help="exit 1 if anything is stale or unknown")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    rows = run_checks()
    print(json.dumps(rows, indent=2) if args.json else render(rows))
    if args.fail_on_stale and [r for r in rows if r["status"] in ("stale", "unknown")]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
