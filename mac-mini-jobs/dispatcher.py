#!/usr/bin/env python3
"""Ten-minute tick that owns the mini's scheduled data jobs.

Replaces one launchd StartCalendarInterval plist per job. Two reasons that
pattern is wrong here:

  1. DST. launchd calendar intervals are LOCAL time. A plist set to 06:50 fires
     at 05:50 UTC in summer and 06:50 UTC in winter, so market data keyed to the
     Asia close silently shifts an hour twice a year. Every time in jobs.toml is
     UTC and is compared in UTC.

  2. Missed runs. launchd fires a missed calendar interval once on wake, but not
     if the machine was powered off across the window, and it leaves no record
     that nothing happened. This dispatcher compares the most recent scheduled
     occurrence against a per-job last-run date, so a mini that was asleep at
     05:50 and woke at 07:30 still runs the job, and a mini that was off all day
     records a MISSED and alerts instead of failing silently.

State lives in state.json next to this file. Config in jobs.toml (stdlib
tomllib, Python 3.11+). Runner scripts do the actual work and are literal ports
of the GitHub workflows they replace.

    python3 dispatcher.py --self-test    # pure scheduling logic, no side effects
    python3 dispatcher.py --dry-run      # decide and log, run nothing
    python3 dispatcher.py --status       # what is scheduled and when it last ran
    python3 dispatcher.py                # the real tick (launchd calls this)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tomllib
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
JOBS_FILE = HERE / "jobs.toml"
STATE_FILE = HERE / "state.json"
LOG_FILE = HERE / "dispatcher.log"
LOCK_FILE = HERE / ".dispatcher.lock"

DEFAULT_CATCHUP_HOURS = 12
DEFAULT_TIMEOUT_MINUTES = 30
# How far back to look for a live occurrence. Must exceed the longest gap any
# configured job has between runs (daily = 1 day, Tue-only = 7), and must NOT be
# so large that it reaches across a seasonal gap: on 10 February a Mar-Nov job
# would otherwise "find" last November's slot and fire a spurious MISSED alert.
# Raise it per job via lookback_days for anything monthly or rarer.
DEFAULT_LOOKBACK_DAYS = 8


# --- pure scheduling logic (covered by --self-test) -------------------------

def job_times(job):
    """Every UTC slot a job has in a day, as (hh, mm), earliest first.

    `time = "05:50"` and `times = ["04:00", "05:00"]` are both accepted; a job
    must use exactly one of them. The list form exists because four of the
    legacy launchd jobs have more than one slot a day (euro-comps and
    football-standings run twice, screen-number-ones three times).
    """
    raw = job.get("times") or ([job["time"]] if job.get("time") else [])
    out = []
    for t in raw:
        hh, mm = (int(x) for x in str(t).split(":"))
        out.append((hh, mm))
    return sorted(out)


def previous_occurrence(now, job):
    """The most recent scheduled datetime at or before `now`, or None.

    Walks back day by day (bounded) looking for a date that satisfies the job's
    weekday, month and day-of-month filters, then takes the LATEST of that
    day's slots that is not in the future. Handles the weekday case correctly:
    on a Wednesday, a Tuesday-only job's previous occurrence is yesterday, not
    today. Handles the multi-slot case correctly too: at 04:30 for a job with
    04:00 and 05:00 slots the answer is 04:00 today, and at 03:00 it is 05:00
    yesterday, not 04:00 today.
    """
    weekdays = job.get("weekdays") or []
    months = job.get("months") or []
    days = job.get("days") or []          # day-of-month, for the monthly jobs
    times = job_times(job)
    lookback = job.get("lookback_days", DEFAULT_LOOKBACK_DAYS)
    for back in range(0, lookback + 1):
        day = (now - timedelta(days=back)).date()
        if months and day.month not in months:
            continue
        if weekdays and day.isoweekday() not in weekdays:
            continue
        if days and day.day not in days:
            continue
        best = None
        for hh, mm in times:
            occ = datetime(day.year, day.month, day.day, hh, mm, tzinfo=timezone.utc)
            if occ <= now and (best is None or occ > best):
                best = occ
        if best is not None:
            return best
    return None


def decide(now, job, last_run_date, last_slot=""):
    """Returns (verdict, occurrence, lateness).

    verdict is one of:
      "due"          run it now
      "already-ran"  this occurrence is already accounted for
      "missed"       too far past the slot to be useful; record and alert
      "off-schedule" no occurrence found inside the lookback window

    `last_slot` is the ISO timestamp of the last slot accounted for, and is the
    authoritative comparison when present: a date alone cannot tell the 04:00
    slot from the 05:00 slot on a multi-slot job, so it would swallow the second
    run of the day. `last_run_date` remains the fallback for a state file
    written before slots were tracked, and is exactly equivalent for the
    single-slot jobs.
    """
    occ = previous_occurrence(now, job)
    if occ is None:
        return "off-schedule", None, None
    if last_slot:
        if last_slot >= occ.isoformat():
            return "already-ran", occ, None
    elif last_run_date and last_run_date >= occ.date().isoformat():
        return "already-ran", occ, None
    late = now - occ
    catchup = timedelta(hours=job.get("catchup_hours", DEFAULT_CATCHUP_HOURS))
    if late > catchup:
        return "missed", occ, late
    return "due", occ, late


# --- state, logging, notification -------------------------------------------

def load_state():
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        # A corrupt state file must not wedge the fleet. Losing it means at
        # worst one duplicate run, and every runner is idempotent or
        # change-gated, so that is cheap. Wedging is not.
        log("WARN state.json unreadable; starting from empty state")
        return {}


def save_state(state):
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
    tmp.replace(STATE_FILE)


def log(msg):
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')} {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def notify(title, body):
    """Best effort. notify.py already owns ntfy/pushover config."""
    script = HERE / "notify.py"
    if not script.exists():
        log(f"NOTIFY (no notify.py) {title}: {body}")
        return
    try:
        subprocess.run([sys.executable, str(script), title, body],
                       timeout=30, capture_output=True)
    except Exception as exc:  # notification failure must never fail a run
        log(f"WARN notify failed: {exc}")


# --- execution ---------------------------------------------------------------

def acquire_lock():
    """Refuse to overlap ticks. A long business-daily run (the revalidate step
    sleeps 300s) must not be re-entered by the next 10-minute tick."""
    if LOCK_FILE.exists():
        try:
            pid = int(LOCK_FILE.read_text().strip())
            os.kill(pid, 0)          # signal 0 = liveness probe only
            return False
        except (ValueError, OSError, ProcessLookupError):
            log("stale lock file; taking it over")
    LOCK_FILE.write_text(str(os.getpid()))
    return True


def release_lock():
    try:
        LOCK_FILE.unlink()
    except OSError:
        pass


def build_argv(job):
    """The argv for a job, including its arguments and healthchecks wrapper.

    `args` exists because four of the legacy launchd jobs are the SAME script
    distinguished only by one positional: run-scraper-refresh.sh takes exactly
    one of conflicts|fiba|rugby|substack and fails on anything else.

    `hc_slug` opts a job into hc-run.sh, which pings hc-ping.com start/success/
    fail and gives that job its own green/red tile on the healthchecks
    dashboard, viewable remotely with no login. Every legacy plist wraps its
    command this way, so a job that moves here without it would silently trade
    a per-job tile for the fleet-wide notify.py alert. Deliberately OPT-IN
    rather than defaulted to the job id: the four jobs that migrated before
    this existed have no tiles provisioned, and inventing pings for them would
    be noise. hc-run.sh no-ops silently when HC_PING_KEY is unset and never
    changes the wrapped command's exit code.
    """
    # `~` and $VARS are expanded before the absolute test, because the mini
    # keeps its jobs in TWO places and about a third of the legacy plists point
    # at the second one: most run from ~/metro-mini-jobs/, but activity-feed,
    # football-standings, gap-league-watch and screen-number-ones run straight
    # out of the repo checkout at "$HOME/Projects/Metro Area Project/
    # mac-mini-jobs/". Without expansion, "$HOME/..." is not os.path.isabs, so
    # it would be silently resolved under HERE and the job would fail to start.
    # Note the repo path contains spaces; argv is a list, so that is safe, but
    # it is the reason this must never be flattened into a shell string.
    cmd = os.path.expandvars(os.path.expanduser(job["command"]))
    path = Path(cmd) if os.path.isabs(cmd) else HERE / cmd
    argv = ["/bin/bash", str(path)] + [str(a) for a in (job.get("args") or [])]
    slug = job.get("hc_slug")
    if slug:
        wrapper = HERE / "hc-run.sh"
        if wrapper.exists():
            argv = ["/bin/bash", str(wrapper), str(slug)] + argv
        else:
            log(f"WARN {job['id']}: hc_slug set but hc-run.sh missing; running unwrapped")
    return argv


def run_job(job):
    timeout = job.get("timeout_minutes", DEFAULT_TIMEOUT_MINUTES) * 60
    argv = build_argv(job)
    started = datetime.now(timezone.utc)
    try:
        proc = subprocess.run(argv, cwd=str(HERE),
                              capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "timeout", f"exceeded {timeout // 60}m"
    dur = (datetime.now(timezone.utc) - started).total_seconds()
    tail = (proc.stdout or "").strip().splitlines()[-12:]
    for line in tail:
        log(f"    | {line}")
    if proc.returncode != 0:
        err = (proc.stderr or "").strip().splitlines()[-6:]
        for line in err:
            log(f"    ! {line}")
        return "failed", f"exit {proc.returncode} after {dur:.0f}s"
    return "ok", f"{dur:.0f}s"


def tick(now, jobs, state, dry_run=False):
    """One pass over the fleet. Returns the updated state."""
    for job in jobs:
        jid = job["id"]
        st = state.get(jid) or {}
        verdict, occ, late = decide(now, job, st.get("last_run_date", ""),
                                    st.get("last_slot", ""))

        if verdict in ("already-ran", "off-schedule"):
            continue

        stamp = occ.date().isoformat()
        late_str = f"{late.total_seconds() / 60:.0f}m late" if late else ""

        if verdict == "missed":
            log(f"MISSED {jid} (slot {occ:%Y-%m-%d %H:%M}Z, {late_str}) "
                f"- past its {job.get('catchup_hours', DEFAULT_CATCHUP_HOURS)}h "
                f"catch-up window; skipping to the next slot")
            notify("Metro: scheduled job missed",
                   f"{jid} did not run for its {occ:%Y-%m-%d %H:%M}Z slot "
                   f"({late_str}). The mini was probably off. The GitHub "
                   f"staleness watch will confirm whether the data went stale.")
            state[jid] = {"last_run_date": stamp, "last_status": "missed",
                          "last_slot": occ.isoformat()}
            continue

        if dry_run:
            log(f"WOULD RUN {jid} (slot {occ:%Y-%m-%d %H:%M}Z, {late_str})")
            continue

        log(f"RUN {jid} (slot {occ:%Y-%m-%d %H:%M}Z, {late_str})")
        status, detail = run_job(job)
        log(f"{'DONE' if status == 'ok' else 'FAIL'} {jid}: {status} {detail}")
        if status != "ok":
            notify(f"Metro: {jid} {status}",
                   f"Slot {occ:%Y-%m-%d %H:%M}Z. {detail}. See dispatcher.log "
                   f"on the mini. The Action still exists as a manual fallback.")
        # Record the slot either way. A job that failed should not be retried
        # every 10 minutes for the rest of the day; the alert is the signal,
        # and the next slot is the retry.
        state[jid] = {"last_run_date": stamp, "last_status": status,
                      "last_slot": occ.isoformat()}
    return state


# --- self-test ---------------------------------------------------------------

def self_test():
    cases = []

    def check(label, got, want):
        cases.append((label, got, want))

    daily = {"id": "d", "time": "05:50"}
    tue = {"id": "t", "time": "06:40", "weekdays": [2]}
    seasonal = {"id": "s", "time": "09:40", "months": list(range(3, 12))}

    # 2026-08-05 is a Wednesday.
    at0600 = datetime(2026, 8, 5, 6, 0, tzinfo=timezone.utc)

    # basic daily behaviour
    check("daily due", decide(at0600, daily, "")[0], "due")
    check("daily already ran", decide(at0600, daily, "2026-08-05")[0], "already-ran")

    # before today's slot, yesterday's occurrence is the live one
    at0500 = datetime(2026, 8, 5, 5, 0, tzinfo=timezone.utc)
    check("before slot uses yesterday",
          decide(at0500, daily, "2026-08-04")[0], "already-ran")
    # yesterday's slot skipped AND today's is 50 minutes away: running a 23h-old
    # slot now is pointless, so it is recorded as missed rather than fired late
    check("stale slot with the next one imminent",
          decide(at0500, daily, "2026-08-03")[0], "missed")

    # THE POINT OF THE WHOLE DESIGN: mini asleep at 05:50, wakes at 07:30,
    # job still runs. launchd with StartCalendarInterval would too, but only
    # on wake, and not if the box was powered off.
    at0730 = datetime(2026, 8, 5, 7, 30, tzinfo=timezone.utc)
    check("catch-up after sleep", decide(at0730, daily, "2026-08-04")[0], "due")

    # ... but not 18h later, when the next slot is nearly here
    at2359 = datetime(2026, 8, 5, 23, 59, tzinfo=timezone.utc)
    check("too late to be useful", decide(at2359, daily, "2026-08-04")[0], "missed")

    # weekday filter: on Wednesday, a Tuesday job's live occurrence is Tuesday,
    # so having run Tuesday means nothing is owed
    check("tue job on wed, ran tue",
          decide(at0600, tue, "2026-08-04")[0], "already-ran")
    # and if it did NOT run Tuesday, Wednesday 06:00 is 23h20 past the slot,
    # so it is correctly reported missed rather than run a day late
    check("tue job on wed, skipped tue",
          decide(at0600, tue, "2026-07-28")[0], "missed")
    # on Tuesday itself it is simply due
    tue_0700 = datetime(2026, 8, 4, 7, 0, tzinfo=timezone.utc)
    check("tue job on tue", decide(tue_0700, tue, "")[0], "due")

    # month filter: in February a Mar-Nov job has no occurrence in the lookback
    feb = datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc)
    check("seasonal out of season", decide(feb, seasonal, "")[0], "off-schedule")
    check("seasonal in season",
          decide(datetime(2026, 8, 5, 10, 0, tzinfo=timezone.utc), seasonal, "")[0],
          "due")
    # THE SEASON-BOUNDARY BUG the lookback bound exists to prevent: before the
    # bound, an unbounded walk-back from 1 March 00:30 reached last November's
    # slot and fired a spurious MISSED alert on the first tick of the season.
    mar1_early = datetime(2026, 3, 1, 0, 30, tzinfo=timezone.utc)
    check("season boundary finds nothing owed",
          previous_occurrence(mar1_early, seasonal), None)
    check("season boundary is off-schedule, not missed",
          decide(mar1_early, seasonal, "")[0], "off-schedule")
    mar1 = datetime(2026, 3, 1, 9, 45, tzinfo=timezone.utc)
    check("season opens on its own slot",
          previous_occurrence(mar1, seasonal).date().isoformat(), "2026-03-01")
    # a weekly job still resolves across a 7-day gap inside the 8-day lookback
    check("weekly gap inside lookback",
          previous_occurrence(datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
                              tue).date().isoformat(), "2026-08-04")

    # exact boundary: at the slot minute it is due, one minute before it is not
    check("exactly at slot",
          decide(datetime(2026, 8, 5, 5, 50, tzinfo=timezone.utc), daily, "2026-08-04")[0],
          "due")
    check("one minute before slot",
          decide(datetime(2026, 8, 5, 5, 49, tzinfo=timezone.utc), daily, "2026-08-04")[0],
          "already-ran")

    # DST is a non-event because everything is UTC: the same wall-clock UTC slot
    # is chosen either side of the European clock change
    for d in (datetime(2026, 10, 24, 6, 0, tzinfo=timezone.utc),
              datetime(2026, 10, 26, 6, 0, tzinfo=timezone.utc)):
        check(f"utc slot stable {d:%d %b}",
              previous_occurrence(d, daily).strftime("%H:%M"), "05:50")

    # --- multi-slot jobs (times), added 2026-08-06 for the DST migration -----
    # euro-comps and football-standings run twice a day, screen-number-ones
    # three times. A single "time" cannot express that.
    twice = {"id": "x", "times": ["04:00", "05:00"]}
    def occ_at(h, m, job=twice, d=5):
        o = previous_occurrence(datetime(2026, 8, d, h, m, tzinfo=timezone.utc), job)
        return o.strftime("%m-%d %H:%M") if o else None

    check("two slots: between them picks the earlier", occ_at(4, 30), "08-05 04:00")
    check("two slots: after both picks the later", occ_at(5, 30), "08-05 05:00")
    check("two slots: before both falls to yesterday's LAST slot",
          occ_at(3, 0), "08-04 05:00")
    check("times parse and sort", job_times({"times": ["05:00", "04:00"]}),
          [(4, 0), (5, 0)])
    check("time and times are interchangeable for one slot",
          job_times({"time": "06:10"}), job_times({"times": ["06:10"]}))

    # THE REASON last_slot EXISTS: having run the 04:00 slot, the 05:00 slot on
    # the SAME DAY is still due. A date-only comparison swallows it.
    at0530 = datetime(2026, 8, 5, 5, 30, tzinfo=timezone.utc)
    check("second slot of the day is still due",
          decide(at0530, twice, "2026-08-05", "2026-08-05T04:00:00+00:00")[0], "due")
    check("second slot not re-run once done",
          decide(at0530, twice, "2026-08-05", "2026-08-05T05:00:00+00:00")[0],
          "already-ran")
    check("date-only would have swallowed it (documents the bug)",
          decide(at0530, twice, "2026-08-05")[0], "already-ran")
    # and last_slot must not break the single-slot jobs
    check("last_slot on a single-slot job still already-ran",
          decide(at0600, daily, "2026-08-05", "2026-08-05T05:50:00+00:00")[0],
          "already-ran")
    check("last_slot from yesterday leaves today due",
          decide(at0600, daily, "2026-08-04", "2026-08-04T05:50:00+00:00")[0], "due")

    # --- day-of-month filter (days), for conflicts- and cricket-monthly ------
    monthly = {"id": "m", "time": "07:15", "days": [1]}
    check("monthly due on the 1st",
          decide(datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc), monthly, "")[0], "due")
    check("monthly resolves back to the 1st a few days later",
          previous_occurrence(datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc),
                              monthly).date().isoformat(), "2026-09-01")
    check("monthly is off-schedule mid-month, not missed",
          decide(datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc), monthly, "")[0],
          "off-schedule")
    check("monthly ignores the 2nd", previous_occurrence(
        datetime(2026, 9, 2, 7, 20, tzinfo=timezone.utc), monthly).day, 1)

    # --- argv: args and the healthchecks wrapper -----------------------------
    plain = build_argv({"id": "p", "command": "runners/forecast.sh"})
    check("plain argv is bash + one path", len(plain), 2)
    check("plain argv is not hc-wrapped", "hc-run.sh" in " ".join(plain), False)
    witharg = build_argv({"id": "a", "command": "run-scraper-refresh.sh",
                          "args": ["conflicts"]})
    check("args are appended", witharg[-1], "conflicts")
    check("args land after the script path",
          witharg[-2].endswith("run-scraper-refresh.sh"), True)
    wrapped = build_argv({"id": "w", "command": "run-activity-feed.sh",
                          "hc_slug": "activity-feed"})
    check("hc wrap puts hc-run.sh first", wrapped[1].endswith("hc-run.sh"), True)
    check("hc wrap passes the slug next", wrapped[2], "activity-feed")
    check("hc wrap still ends with the real script",
          wrapped[-1].endswith("run-activity-feed.sh"), True)
    both = build_argv({"id": "b", "command": "run-scraper-refresh.sh",
                       "args": ["fiba"], "hc_slug": "fiba-weekly"})
    check("hc wrap and args compose", (both[2], both[-1]), ("fiba-weekly", "fiba"))

    # The mini keeps jobs in TWO places: most under ~/metro-mini-jobs/, but
    # activity-feed, football-standings, gap-league-watch and screen-number-ones
    # run from "$HOME/Projects/Metro Area Project/mac-mini-jobs/". Their plists
    # write that as $HOME/..., which is NOT os.path.isabs, so without expansion
    # it would be resolved under HERE and the job would never start.
    os.environ["MINI_TEST_ROOT"] = "/tmp/minitest"
    ev = build_argv({"id": "e", "command": "$MINI_TEST_ROOT/run-x.sh"})
    check("env var in command is expanded", "$MINI_TEST_ROOT" in ev[-1], False)
    check("env var resolves to its value", "minitest" in ev[-1], True)
    sp = build_argv({"id": "s",
                     "command": "$MINI_TEST_ROOT/Metro Area Project/run-z.sh"})
    check("a path with spaces stays ONE argv element", len(sp), 2)
    check("the spaced path is not split", sp[-1].endswith("run-z.sh"), True)
    del os.environ["MINI_TEST_ROOT"]
    th = build_argv({"id": "t", "command": "~/metro-mini-jobs/run-y.sh"})
    check("tilde is expanded", "~" in th[-1], False)
    rel = build_argv({"id": "r", "command": "runners/mlb-sim.sh"})
    check("a relative command still resolves under HERE",
          str(HERE) in rel[-1], True)

    # --- jobs.toml validation ------------------------------------------------
    good = [{"id": "g", "command": "runners/x.sh", "time": "05:50",
             "weekdays": [1, 3, 5]}]
    check("valid table has no problems", validate_jobs(good), [])
    check("time and times together is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "05:50", "times": ["06:00"]}])), 1)
    check("neither time nor times is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh"}])), 1)
    check("duplicate id is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "05:50"},
         {"id": "g", "command": "y.sh", "time": "06:00"}])), 1)
    check("missing command is rejected", len(validate_jobs(
        [{"id": "g", "time": "05:50"}])), 1)
    check("weekday 8 is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "05:50", "weekdays": [8]}])), 1)
    check("day-of-month 32 is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "05:50", "days": [32]}])), 1)
    check("args must be a list", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "05:50", "args": "conflicts"}])), 1)
    check("garbage time is rejected", len(validate_jobs(
        [{"id": "g", "command": "x.sh", "time": "half past four"}])), 1)

    # the real jobs.toml must always validate
    with JOBS_FILE.open("rb") as fh:
        check("shipped jobs.toml validates",
              validate_jobs(tomllib.load(fh).get("job", [])), [])

    # --- live-vs-repo drift detection ----------------------------------------
    # The mini's live jobs.toml was found a full day stale on 2026-08-06 and
    # nothing failed, which is why this exists.
    import tempfile, shutil
    with tempfile.TemporaryDirectory() as td:
        repo, live = Path(td) / "repo", Path(td) / "live"
        (repo / "runners").mkdir(parents=True)
        live.mkdir()
        (repo / "jobs.toml").write_text("a = 1\n")
        (repo / "hc-run.sh").write_text("echo hi\n")
        (repo / "runners" / "x.sh").write_text("echo x\n")
        (repo / "README.md").write_text("not compared\n")
        shutil.copy(repo / "jobs.toml", live / "jobs.toml")
        shutil.copy(repo / "hc-run.sh", live / "hc-run.sh")
        (live / "runners").mkdir()
        shutil.copy(repo / "runners" / "x.sh", live / "runners" / "x.sh")
        check("identical trees report no drift", sync_report(live, repo), [])

        (live / "config.env").write_text("SECRET=x\n")
        (live / "state.json").write_text("{}\n")
        check("live-only files are ignored", sync_report(live, repo), [])

        (live / "jobs.toml").write_text("a = 2\n")
        check("a changed file is reported",
              sync_report(live, repo), [("jobs.toml", "differs")])

        (live / "jobs.toml").write_text("a = 1\n")
        (live / "runners" / "x.sh").unlink()
        check("a missing runner is reported",
              sync_report(live, repo), [("runners/x.sh", "missing-live")])

        shutil.copy(repo / "runners" / "x.sh", live / "runners" / "x.sh")
        (live / "hc-run.sh").write_bytes(b"echo hi\r\n")
        check("CRLF alone is not drift", sync_report(live, repo), [])
        check("a missing repo dir is reported, not crashed",
              sync_report(live, Path(td) / "nope")[0][1], "missing-repo")

    # --- this file must stay pure ASCII --------------------------------------
    # Learned the hard way on 2026-08-06: a single U+26A0 in a print() crashed
    # --status with UnicodeEncodeError on a cp1252 Windows console. The mini is
    # UTF-8 so it would never have shown up there, and this is a tool people
    # read output from on both boxes. Cheaper to ban the glyphs than to
    # remember to reconfigure stdout at every entry point.
    src_bytes = Path(__file__).read_bytes()
    check("dispatcher.py is pure ASCII",
          [b for b in set(src_bytes) if b > 127], [])

    failed = [c for c in cases if c[1] != c[2]]
    for label, got, want in cases:
        print(f"  {'PASS' if got == want else 'FAIL'}  {label}: got {got!r}, want {want!r}")
    if failed:
        print(f"\n{len(failed)}/{len(cases)} FAILED", file=sys.stderr)
        return 1
    print(f"\nself-test OK ({len(cases)} cases)")
    return 0


# --- entry point -------------------------------------------------------------

def sync_report(live_dir, repo_dir):
    """Compare the LIVE copy of the job code against the repo copy.

    The mini runs from ~/metro-mini-jobs/, which is a manual copy of the repo's
    mac-mini-jobs/. That copy step has no verification, and on 2026-08-06 the
    live jobs.toml was found stale by a full day: it still described forecast's
    Action schedule as "retirement pending" hours after it had been retired.
    Nothing failed, which is the problem. Drift here is silent by construction,
    so it needs a way to be seen.

    Returns a sorted list of (relative_path, status) where status is one of
    "differs" or "missing-live". Files that exist only live are ignored on
    purpose: config.env, state.json, dispatcher.log and the lock all belong
    there and must never be copied back.
    """
    import hashlib
    live, repo = Path(live_dir), Path(repo_dir)
    if not repo.is_dir():
        return [("(repo dir not found)", "missing-repo")]

    def digest(p):
        return hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest()

    out = []
    candidates = sorted(
        [p for p in repo.glob("*") if p.is_file() and p.suffix in (".py", ".sh", ".toml")]
        + [p for p in (repo / "runners").glob("*.sh") if p.is_file()]
    )
    for src in candidates:
        rel = src.relative_to(repo).as_posix()
        dst = live / rel
        if not dst.exists():
            out.append((rel, "missing-live"))
        elif digest(src) != digest(dst):
            out.append((rel, "differs"))
    return sorted(out)


def repo_dir_guess():
    """Where the repo checkout lives on the mini.

    REPO_DIR in the environment wins (config.env is the single source of truth
    for this kind of thing). Otherwise fall back to the path four of the legacy
    jobs already hardcode in their plists.
    """
    return os.environ.get("REPO_DIR") or os.path.expanduser(
        "~/Projects/Metro Area Project/mac-mini-jobs")


def validate_jobs(jobs):
    """Fail loudly on a malformed jobs.toml rather than skipping a job quietly.

    A typo here is a job that silently never runs, which is the exact failure
    mode this whole dispatcher exists to make impossible. Returns a list of
    problems; empty means the table is usable.
    """
    problems, seen = [], set()
    for i, job in enumerate(jobs):
        where = job.get("id") or f"job #{i + 1}"
        if not job.get("id"):
            problems.append(f"{where}: missing id")
        elif job["id"] in seen:
            problems.append(f"{where}: duplicate id")
        else:
            seen.add(job["id"])
        if not job.get("command"):
            problems.append(f"{where}: missing command")
        has_t, has_ts = bool(job.get("time")), bool(job.get("times"))
        if has_t and has_ts:
            problems.append(f"{where}: set time OR times, not both")
        elif not has_t and not has_ts:
            problems.append(f"{where}: needs time or times")
        else:
            try:
                for hh, mm in job_times(job):
                    if not (0 <= hh <= 23 and 0 <= mm <= 59):
                        problems.append(f"{where}: time {hh:02d}:{mm:02d} out of range")
            except (ValueError, AttributeError):
                problems.append(f"{where}: unparseable time; want \"HH:MM\"")
        for key, lo, hi in (("weekdays", 1, 7), ("months", 1, 12), ("days", 1, 31)):
            for v in (job.get(key) or []):
                if not isinstance(v, int) or not (lo <= v <= hi):
                    problems.append(f"{where}: {key} value {v!r} outside {lo}-{hi}")
        if job.get("args") is not None and not isinstance(job["args"], list):
            problems.append(f"{where}: args must be a list")
    return problems


def load_jobs():
    with JOBS_FILE.open("rb") as fh:
        jobs = tomllib.load(fh).get("job", [])
    problems = validate_jobs(jobs)
    if problems:
        for p in problems:
            log(f"CONFIG ERROR {p}")
        raise SystemExit(f"{JOBS_FILE.name} is invalid; refusing to run "
                         f"({len(problems)} problem(s) above)")
    return jobs


def show_status(now, jobs, state):
    print(f"now {now:%Y-%m-%d %H:%M}Z\n")
    print(f"{'job':<20} {'slot (UTC)':<12} {'last run':<12} {'status':<9} verdict")
    print("-" * 72)
    for job in jobs:
        st = state.get(job["id"]) or {}
        verdict, occ, _ = decide(now, job, st.get("last_run_date", ""),
                                 st.get("last_slot", ""))
        occ_s = f"{occ:%m-%d %H:%M}" if occ else "-"
        print(f"{job['id']:<20} {occ_s:<12} {st.get('last_run_date', '-'):<12} "
              f"{st.get('last_status', '-'):<9} {verdict}")
    repo = repo_dir_guess()
    drift = sync_report(HERE, repo)
    if drift and drift[0][1] == "missing-repo":
        # Not a warning worth shouting about: this is what you get when the
        # dispatcher is run from a checkout rather than from the mini's live
        # copy, which is exactly what happens on the Windows box.
        print(f"\n(no repo checkout at {repo}; skipped the live-vs-repo check)")
    elif drift:
        print(f"\nWARNING: live copy differs from the repo ({repo}):")
        for rel, status in drift:
            print(f"    {status:<13} {rel}")
        print("  Copy the repo version across, or the table above is not what "
              "a fresh clone would run.")


def seed(now, jobs, state):
    """Mark every job's live occurrence as handled, without running anything.

    Run this once at install. Without it, the first real tick on a cold state
    file sees every job's most recent slot as unrun and past its catch-up
    window, and fires a MISSED alert per job for slots that were in fact
    covered by the GitHub Actions the mini is replacing. That is a noisy,
    untrue first impression for an alarm channel that only works if it is
    trusted.
    """
    for job in jobs:
        occ = previous_occurrence(now, job)
        if occ is None:
            print(f"  {job['id']}: no live occurrence (off-season); left unseeded")
            continue
        state[job["id"]] = {"last_run_date": occ.date().isoformat(),
                            "last_status": "seeded",
                            "last_slot": occ.isoformat()}
        print(f"  {job['id']}: seeded at {occ:%Y-%m-%d %H:%M}Z")
    save_state(state)
    print(f"\nWrote {STATE_FILE.name}. The next genuine slot for each job runs normally.")
    return 0


def main():
    ap = argparse.ArgumentParser(description="mini scheduled-job dispatcher")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="decide and log, but run nothing and write no state")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--check-sync", action="store_true",
                    help="report any file where this live copy differs from the "
                         "repo checkout; exit 1 if anything has drifted")
    ap.add_argument("--seed", action="store_true",
                    help="mark every job's current occurrence as handled without "
                         "running it; use once at install so a cold start does not "
                         "alert on historic slots the Actions already covered")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if args.check_sync:
        repo = repo_dir_guess()
        drift = sync_report(HERE, repo)
        if not drift:
            print(f"in sync with {repo}")
            return 0
        if drift[0][1] == "missing-repo":
            print(f"no repo checkout at {repo}; nothing to compare against. "
                  f"Set REPO_DIR in config.env if it lives elsewhere.")
            return 0
        print(f"DRIFT vs {repo}:")
        for rel, status in drift:
            print(f"  {status:<13} {rel}")
        return 1

    now = datetime.now(timezone.utc)
    jobs = load_jobs()
    state = load_state()

    if args.status:
        show_status(now, jobs, state)
        return 0

    if args.seed:
        return seed(now, jobs, state)

    if not args.dry_run and not acquire_lock():
        log("previous tick still running; skipping")
        return 0
    try:
        state = tick(now, jobs, state, dry_run=args.dry_run)
        if not args.dry_run:
            save_state(state)
    finally:
        if not args.dry_run:
            release_lock()
    return 0


if __name__ == "__main__":
    sys.exit(main())
