#!/usr/bin/env python3
"""Writes public/data/refresh-schedule.json from jobs.toml + state.json.

Powers the (unlisted) /refresh-schedule calendar page -- Ashwin's own answer
to "it's hard to keep up with the refreshment [schedule] with so many jobs."
Not a jobs.toml entry itself: dispatcher.py calls this directly, unconditionally,
after every real tick (see main()'s post-tick step), so the export is never
more than ~10 minutes stale relative to jobs.toml or state.json -- add a job,
change a time, and the calendar picks it up on its own without anyone
remembering to run a separate step.

Reuses dispatcher.py's own scheduling functions (job_times, previous_occurrence,
decide, load_jobs, load_state, repo_dir_guess) via import rather than
reimplementing them, so the calendar can never drift from what actually fires.

Usage:
    python3 export_schedule.py             # write + commit + push if changed
    python3 export_schedule.py --self-test  # offline logic check, no writes
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dispatcher  # noqa: E402  (path insert must come first)


def next_occurrence(now, job):
    """The next scheduled datetime at or after `now`.

    The forward-looking counterpart to dispatcher.previous_occurrence -- that
    one exists to answer "was this job's due slot already handled"; this one
    exists to answer "when does the calendar show this job next". Same
    day-by-day walk, just forward instead of back, and unbounded in practice
    (370 days covers even a months-filtered job whose window hasn't opened
    yet this year, e.g. checking mlb-sim in December).
    """
    weekdays = job.get("weekdays") or []
    months = job.get("months") or []
    days = job.get("days") or []
    times = dispatcher.job_times(job)
    for fwd in range(0, 370):
        day = (now + timedelta(days=fwd)).date()
        if months and day.month not in months:
            continue
        if weekdays and day.isoweekday() not in weekdays:
            continue
        if days and day.day not in days:
            continue
        for hh, mm in times:
            occ = datetime(day.year, day.month, day.day, hh, mm, tzinfo=timezone.utc)
            if occ >= now:
                return occ
    return None


_WEEKDAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}
_MONTH_NAMES = {1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
                7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"}


def _times_text(job):
    times = dispatcher.job_times(job)
    return ", ".join(f"{hh:02d}:{mm:02d}" for hh, mm in times) + " UTC"


def schedule_text(job):
    """Human-readable schedule description, e.g. "Tue at 09:00 UTC" or
    "1st of the month at 07:15 UTC"."""
    weekdays = job.get("weekdays") or []
    days = job.get("days") or []
    months = job.get("months") or []
    when = _times_text(job)
    if days:
        day_word = "/".join(str(d) for d in sorted(days))
        prefix = f"{day_word}{_ordinal_suffix(days[0]) if len(days) == 1 else ''} of the month"
        text = f"{prefix} at {when}"
    elif weekdays:
        day_word = "/".join(_WEEKDAY_NAMES[d] for d in sorted(weekdays))
        text = f"{day_word} at {when}"
    else:
        text = f"Daily at {when}"
    if months and len(months) < 12:
        span = "/".join(_MONTH_NAMES[m] for m in sorted(months))
        text += f" ({span})"
    return text


def _ordinal_suffix(n):
    if 10 <= n % 100 <= 20:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def cadence(job):
    """Coarse grouping for the calendar UI: daily / weekly / monthly."""
    if job.get("days"):
        return "monthly"
    if job.get("weekdays"):
        return "weekly"
    return "daily"


def build_schedule(now, jobs, state):
    out = []
    for job in jobs:
        jid = job["id"]
        st = state.get(jid) or {}
        next_occ = next_occurrence(now, job)
        out.append({
            "id": jid,
            "label": job.get("label") or jid,
            "schedule_text": schedule_text(job),
            "cadence": cadence(job),
            "times": [f"{hh:02d}:{mm:02d}" for hh, mm in dispatcher.job_times(job)],
            "weekdays": sorted(job.get("weekdays") or []),
            "months": sorted(job.get("months") or []),
            "days_of_month": sorted(job.get("days") or []),
            "next_run": next_occ.isoformat() if next_occ else None,
            "last_run": {
                "date": st.get("last_run_date") or None,
                "status": st.get("last_status") or None,
                "slot": st.get("last_slot") or None,
            },
        })
    out.sort(key=lambda j: j["next_run"] or "")
    return {"generated_at": now.isoformat(), "jobs": out}


def self_test():
    cases = []

    def check(name, got, want):
        cases.append((name, got, want))

    now = datetime(2026, 8, 9, 12, 0, tzinfo=timezone.utc)

    daily = {"id": "d", "time": "05:50"}
    check("daily schedule_text", schedule_text(daily), "Daily at 05:50 UTC")
    check("daily cadence", cadence(daily), "daily")

    tue = {"id": "t", "time": "09:00", "weekdays": [2]}
    check("weekly schedule_text", schedule_text(tue), "Tue at 09:00 UTC")
    check("weekly cadence", cadence(tue), "weekly")

    monthly = {"id": "m", "time": "07:15", "days": [1]}
    check("monthly schedule_text", schedule_text(monthly), "1st of the month at 07:15 UTC")
    check("monthly cadence", cadence(monthly), "monthly")

    season = {"id": "s", "time": "09:40", "months": [3, 4, 5, 6, 7, 8, 9, 10, 11]}
    check("months-filtered schedule_text", schedule_text(season),
          "Daily at 09:40 UTC (Mar/Apr/May/Jun/Jul/Aug/Sep/Oct/Nov)")

    multi = {"id": "mt", "times": ["05:00", "11:00", "17:00", "23:00"]}
    check("multi-slot schedule_text", schedule_text(multi),
          "Daily at 05:00, 11:00, 17:00, 23:00 UTC")

    # next_occurrence: forward from a known instant, single daily slot already
    # past today -> tomorrow same time.
    past_today = {"id": "p", "time": "05:50"}
    got = next_occurrence(now, past_today)
    check("next_occurrence rolls to tomorrow when today's slot has passed",
          got.isoformat(), "2026-08-10T05:50:00+00:00")

    # next_occurrence: a slot later today is still today.
    later_today = {"id": "l", "time": "18:00"}
    got = next_occurrence(now, later_today)
    check("next_occurrence stays today when the slot hasn't happened yet",
          got.isoformat(), "2026-08-09T18:00:00+00:00")

    # next_occurrence: weekday filter finds the right future date, not just
    # the nearest calendar day.
    # 2026-08-09 is a Sunday (isoweekday 7); next Tuesday (2) is 2026-08-11.
    tue_job = {"id": "tw", "time": "09:00", "weekdays": [2]}
    got = next_occurrence(now, tue_job)
    check("next_occurrence honours weekdays filter",
          got.isoformat(), "2026-08-11T09:00:00+00:00")

    # next_occurrence: months filter skips an out-of-season window entirely.
    # From August, Mar-Nov is already in season, so the next slot is today or
    # tomorrow, not next March. Use a job restricted to a month that's over.
    past_month = {"id": "pm", "time": "09:00", "months": [1]}  # Jan only
    got = next_occurrence(now, past_month)
    check("next_occurrence skips forward across a closed season to next Jan",
          got.isoformat(), "2027-01-01T09:00:00+00:00")

    # build_schedule: sorts by next_run and carries state through.
    jobs = [
        {"id": "b", "label": "B job", "time": "05:50"},
        {"id": "a", "label": "A job", "time": "18:00"},
    ]
    state = {"b": {"last_run_date": "2026-08-09", "last_status": "ok",
                   "last_slot": "2026-08-09T05:50:00+00:00"}}
    sched = build_schedule(now, jobs, state)
    ids_in_order = [j["id"] for j in sched["jobs"]]
    check("build_schedule sorts by soonest next_run", ids_in_order, ["a", "b"])
    check("build_schedule carries last_run state through",
          sched["jobs"][1]["last_run"]["status"], "ok")
    check("build_schedule reports null last_run for a never-run job",
          sched["jobs"][0]["last_run"]["status"], None)

    ok = True
    for name, got, want in cases:
        if got == want:
            print(f"  PASS  {name}")
        else:
            ok = False
            print(f"  FAIL  {name}: got {got!r}, want {want!r}")
    print(f"\n{'ALL SELF-TESTS PASS' if ok else 'SELF-TEST FAILURES'}")
    return 0 if ok else 1


def repo_root_guess():
    import os
    base = os.path.expanduser(os.environ.get("REPO_DIR") or "~/Projects/Metro Area Project")
    return base if os.path.basename(base.rstrip(os.sep)) != "mac-mini-jobs" \
        else os.path.dirname(base)


def run(cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)


def main():
    if "--self-test" in sys.argv:
        return self_test()

    now = datetime.now(timezone.utc)
    jobs = dispatcher.load_jobs()
    state = dispatcher.load_state()
    schedule = build_schedule(now, jobs, state)

    repo = repo_root_guess()
    out_path = Path(repo) / "public" / "data" / "refresh-schedule.json"
    new_content = json.dumps(schedule, indent=2, sort_keys=False) + "\n"

    # generated_at always differs, so compare on the jobs payload only -- a
    # commit every 10 minutes with zero real change would be pure noise.
    old_jobs = None
    if out_path.exists():
        try:
            old_jobs = json.loads(out_path.read_text()).get("jobs")
        except (json.JSONDecodeError, OSError):
            old_jobs = None
    if old_jobs == schedule["jobs"]:
        return 0

    try:
        run(["git", "fetch", "origin", "main", "--quiet"], repo)
        run(["git", "merge", "--ff-only", "origin/main", "--quiet"], repo)
    except subprocess.CalledProcessError as e:
        print(f"export_schedule: git sync failed, skipping this run: {e.stderr}",
              file=sys.stderr)
        return 1

    out_path.write_text(new_content)

    try:
        run(["git", "add", "public/data/refresh-schedule.json"], repo)
        diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo)
        if diff.returncode == 0:
            return 0  # add staged nothing new (shouldn't happen given the check above)
        run(["git", "-c", "user.name=metro-mini[bot]",
             "-c", "user.email=metro-mini-bot@users.noreply.github.com",
             "commit", "-q", "-m",
             "data: refresh-schedule.json [vercel skip]"], repo)
        for attempt in range(3):
            try:
                run(["git", "push", "-q", "origin", "HEAD:main"], repo)
                break
            except subprocess.CalledProcessError:
                run(["git", "fetch", "origin", "main", "--quiet"], repo)
                run(["git", "rebase", "origin/main", "--quiet"], repo)
        else:
            print("export_schedule: push failed after 3 attempts", file=sys.stderr)
            return 1
    except subprocess.CalledProcessError as e:
        print(f"export_schedule: git commit/push failed: {e.stderr}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
