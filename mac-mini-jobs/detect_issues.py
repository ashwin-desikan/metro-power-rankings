#!/usr/bin/env python3
"""Reconcile the mini's ACTUAL state against what it should be, and emit findings.

This is the cheap half of the auto-fix loop: pure Python, no LLM, no network
beyond three small API reads, safe to run every few minutes. It decides whether
there is anything worth waking an expensive headless Claude for. Exit 0 with an
empty list is the normal case and costs nothing.

WHY IT RECONCILES STATE RATHER THAN READING NOTIFICATIONS
--------------------------------------------------------
The obvious design is to watch the ntfy topic or the alert mailbox and react to
what arrives. That was rejected on evidence: of the six real faults on
2026-09-10, THREE sent no notification at all, and the two most damaging exited
with status 0 --

  * fiba-weekly mapped 114 of 119 nations and committed it, exit 0, no alert.
  * The Champions League table froze on Tuesday's results while Wednesday's sat
    in the feed, no alert; Ashwin noticed it visually.
  * economy-rates and economy-housing had never once run, because a job
    committed to the repo is not deployed until it is copied to the live
    dispatcher directory. No alert. The 09-09 ops sweep reported it in writing
    and the report went unactioned for a day.

A notification-driven fixer would have fixed none of those. Notifications are a
lossy projection of state; the state itself is authoritative, and checking it
directly catches the silent failures too. See HANDOFF 2026-09-10 sections B, C
and E.

WHAT COUNTS AS A FINDING
------------------------
Each finding is a dict with a stable `kind`, a `severity`, a human `summary`,
and `evidence` -- never a proposed fix. Deciding what to do is the next stage's
job; conflating detection with remedy is how a detector starts lying to justify
an action it already wants to take.

Usage:
    python3 detect_issues.py              # human-readable
    python3 detect_issues.py --json       # machine-readable, for the runner
    python3 detect_issues.py --self-test  # offline, no network
"""
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LIVE_DIR = os.path.expanduser("~/metro-mini-jobs")
REPO = os.path.expanduser("~/Projects/Metro Area Project")
STATE_FILE = os.path.join(LIVE_DIR, "state.json")
HC_ENV = os.path.expanduser("~/.config/mini-hc.env")

# A job that failed its LAST slot is the clearest signal there is. "missed" is
# deliberately NOT a finding on its own: the dispatcher records it and moves to
# the next slot by design, and a missed slot is usually the mini having been
# off, which nothing here can fix.
FAILED_STATUSES = {"failed", "error", "timeout"}


def _now():
    return dt.datetime.now(dt.timezone.utc)


def read_state(path=None):
    path = path or STATE_FILE
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        return {}


def find_failed_jobs(state):
    """Jobs whose most recent recorded slot failed."""
    out = []
    for jid, st in sorted((state or {}).items()):
        status = str((st or {}).get("last_status", "")).lower()
        if status in FAILED_STATUSES:
            out.append({
                "kind": "job_failed",
                "severity": "high",
                "id": jid,
                "summary": "%s failed its %s slot" % (jid, (st or {}).get("last_slot", "?")),
                "evidence": {"last_slot": (st or {}).get("last_slot"),
                             "last_status": (st or {}).get("last_status"),
                             "last_run_date": (st or {}).get("last_run_date")},
            })
    return out


def find_drift(run=None):
    """jobs.toml or a runner committed to the repo but never deployed.

    This is the failure mode that hid economy-rates and economy-housing for
    days: launchd runs ~/metro-mini-jobs/dispatcher.py, a SEPARATE copy with its
    own jobs.toml, so editing the repo schedules nothing. --check-sync only
    tells the truth when run from the live directory.
    """
    run = run or (lambda argv, cwd: subprocess.run(
        argv, cwd=cwd, capture_output=True, text=True, timeout=60))
    try:
        p = run([sys.executable, "dispatcher.py", "--check-sync"], LIVE_DIR)
    except Exception as ex:                                   # noqa: BLE001
        return [{"kind": "drift_check_failed", "severity": "low",
                 "summary": "could not run --check-sync: %s" % type(ex).__name__,
                 "evidence": {"error": str(ex)[:200]}}]
    text = (p.stdout or "") + (p.stderr or "")
    if "DRIFT" not in text:
        return []
    lines = [l.strip() for l in text.splitlines() if l.strip().startswith(("differs", "missing"))]
    return [{
        "kind": "deploy_drift",
        "severity": "high",
        "summary": "live dispatcher directory is out of sync with the repo (%d item(s))" % len(lines),
        "evidence": {"items": lines},
    }]


def find_down_checks(fetch=None):
    """healthchecks tiles reporting down -- a job that did not run AT ALL.

    This is the one signal the dispatcher cannot produce for itself: state.json
    only records slots the dispatcher reached. If launchd stopped, or a job was
    dropped from jobs.toml by accident, only the external tile notices.
    """
    key = None
    try:
        with open(HC_ENV, encoding="utf-8") as f:
            for line in f:
                if "HC_API_KEY" in line and "=" in line:
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return []
    if not key:
        return []
    try:
        if fetch is None:
            req = urllib.request.Request("https://healthchecks.io/api/v1/checks/",
                                         headers={"X-Api-Key": key})
            with urllib.request.urlopen(req, timeout=30) as r:
                doc = json.load(r)
        else:
            doc = fetch()
    except Exception as ex:                                   # noqa: BLE001
        return [{"kind": "healthchecks_unreachable", "severity": "low",
                 "summary": "could not read healthchecks: %s" % type(ex).__name__,
                 "evidence": {"error": str(ex)[:200]}}]
    out = []
    for c in doc.get("checks", []):
        if c.get("status") == "down":
            out.append({
                "kind": "check_down",
                "severity": "high",
                "id": c.get("slug"),
                "summary": "healthchecks tile %s is down (last ping %s)"
                           % (c.get("slug"), c.get("last_ping")),
                "evidence": {"slug": c.get("slug"), "last_ping": c.get("last_ping"),
                             "n_pings": c.get("n_pings")},
            })
    return out


def find_failed_actions(run=None):
    """Workflows whose MOST RECENT run failed.

    Deliberately not "any failure in the window". A workflow that failed and was
    then re-run green is FIXED, and reporting it anyway sends the fixer off to
    repair something already repaired -- which, for a fixer allowed to change
    code, means it invents a problem and then edits production to solve it.
    Caught on this detector's first live run: the 2026-09-10 WNBA failure at
    12:42Z was green again by 13:57Z and still showed up as a finding.

    So: group by workflow, keep the newest run of each, report only those that
    ended in failure. The 6h cutoff then just stops it re-raising something old
    and already dealt with.
    """
    run = run or (lambda argv, cwd: subprocess.run(
        argv, cwd=cwd, capture_output=True, text=True, timeout=60))
    try:
        p = run(["gh", "run", "list", "--limit", "40", "--json",
                 "workflowName,conclusion,status,createdAt,databaseId"], REPO)
        rows = json.loads(p.stdout or "[]")
    except Exception as ex:                                   # noqa: BLE001
        return [{"kind": "actions_unreachable", "severity": "low",
                 "summary": "could not list GitHub Actions runs: %s" % type(ex).__name__,
                 "evidence": {"error": str(ex)[:200]}}]

    def when_of(r):
        try:
            return dt.datetime.fromisoformat(str(r.get("createdAt")).replace("Z", "+00:00"))
        except ValueError:
            return None

    newest = {}
    for r in rows:
        w = when_of(r)
        if w is None:
            continue
        # An in-flight run supersedes an older failure: it is not yet a verdict,
        # and acting mid-run would race it.
        name = r.get("workflowName")
        if name not in newest or w > newest[name][0]:
            newest[name] = (w, r)

    cutoff = _now() - dt.timedelta(hours=6)
    out = []
    for name, (w, r) in sorted(newest.items()):
        if r.get("conclusion") != "failure" or w < cutoff:
            continue
        out.append({
            "kind": "action_failed",
            "severity": "high",
            "id": name,
            "summary": "GitHub Actions '%s' failed at %s (latest run of that workflow)"
                       % (name, r.get("createdAt")),
            "evidence": {"run_id": r.get("databaseId"), "created": r.get("createdAt")},
        })
    return out


def find_dirty_tree(run=None):
    """Uncommitted work in the repo.

    Not a fault, and NOT something to clean up -- it is a STOP sign. Ashwin may
    be mid-edit, and an autonomous fixer that commits on top of, stashes, or
    reverts a human's uncommitted work is the single most destructive thing this
    system could do. The runner refuses to act while this is present.
    """
    run = run or (lambda argv, cwd: subprocess.run(
        argv, cwd=cwd, capture_output=True, text=True, timeout=60))
    try:
        p = run(["git", "status", "--porcelain"], REPO)
    except Exception:                                         # noqa: BLE001
        return []
    lines = [l for l in (p.stdout or "").splitlines() if l.strip()]
    if not lines:
        return []
    return [{
        "kind": "working_tree_dirty",
        "severity": "blocker",
        "summary": "repo has %d uncommitted change(s); autonomous action is unsafe" % len(lines),
        "evidence": {"files": lines[:20]},
    }]


def detect():
    findings = []
    findings += find_dirty_tree()
    findings += find_failed_jobs(read_state())
    findings += find_drift()
    findings += find_down_checks()
    findings += find_failed_actions()
    return findings


def _self_test():
    n = [0]

    def check(label, got, want):
        n[0] += 1
        if got != want:
            print("self-test FAILED: %s\n  got  %r\n  want %r" % (label, got, want))
            raise SystemExit(1)

    check("no state -> no findings", find_failed_jobs({}), [])
    check("ok job is not a finding",
          find_failed_jobs({"a": {"last_status": "ok"}}), [])
    check("'ok (manual)' is not a failure",
          find_failed_jobs({"a": {"last_status": "ok (manual)"}}), [])
    check("missed is deliberately not a finding",
          find_failed_jobs({"a": {"last_status": "missed"}}), [])
    failed = find_failed_jobs({"a": {"last_status": "failed", "last_slot": "S"}})
    check("failed job is found", len(failed), 1)
    check("...with the right kind", failed[0]["kind"], "job_failed")

    insync = lambda argv, cwd: type("P", (), {"stdout": "in sync with /repo", "stderr": ""})()
    check("in sync -> no drift finding", find_drift(insync), [])
    drifted = lambda argv, cwd: type("P", (), {
        "stdout": "DRIFT vs /repo:\n  differs       jobs.toml\n  missing-live  runners/x.sh\n",
        "stderr": ""})()
    d = find_drift(drifted)
    check("drift is found", len(d), 1)
    check("...and lists the items", len(d[0]["evidence"]["items"]), 2)

    check("no down checks -> nothing",
          find_down_checks(fetch=lambda: {"checks": [{"status": "up", "slug": "a"}]}), [])
    down = find_down_checks(fetch=lambda: {"checks": [{"status": "down", "slug": "b"}]})
    check("a down tile is found", down[0]["id"], "b")

    # A workflow that failed and was then re-run green must NOT be reported.
    import datetime as _dt
    now = _dt.datetime.now(_dt.timezone.utc)
    def _runs(rows):
        return lambda argv, cwd: type("P", (), {"stdout": json.dumps(rows), "stderr": ""})()
    recent = (now - _dt.timedelta(minutes=30)).isoformat().replace("+00:00", "Z")
    older = (now - _dt.timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    healed = [{"workflowName": "W", "conclusion": "failure", "createdAt": older, "databaseId": 1},
              {"workflowName": "W", "conclusion": "success", "createdAt": recent, "databaseId": 2}]
    check("a failure already re-run green is NOT reported",
          find_failed_actions(_runs(healed)), [])
    still = [{"workflowName": "W", "conclusion": "success", "createdAt": older, "databaseId": 1},
             {"workflowName": "W", "conclusion": "failure", "createdAt": recent, "databaseId": 2}]
    got = find_failed_actions(_runs(still))
    check("a workflow whose LATEST run failed is reported", len(got), 1)
    check("...and names the failing run", got[0]["evidence"]["run_id"], 2)
    stale = [{"workflowName": "W", "conclusion": "failure",
              "createdAt": (now - _dt.timedelta(hours=9)).isoformat().replace("+00:00", "Z"),
              "databaseId": 3}]
    check("a failure older than the window is not re-raised",
          find_failed_actions(_runs(stale)), [])

    clean = lambda argv, cwd: type("P", (), {"stdout": "", "stderr": ""})()
    check("clean tree is not a finding", find_dirty_tree(clean), [])
    dirty = lambda argv, cwd: type("P", (), {"stdout": " M a.py\n?? b.py\n", "stderr": ""})()
    dt_ = find_dirty_tree(dirty)
    check("dirty tree IS a blocker", dt_[0]["severity"], "blocker")

    print("self-test OK (%d checks)" % n[0])
    return 0


def main():
    if "--self-test" in sys.argv:
        return _self_test()
    findings = detect()
    if "--json" in sys.argv:
        print(json.dumps(findings, indent=1))
        return 0
    if not findings:
        print("no findings; nothing to do")
        return 0
    for f in findings:
        print("[%s] %s -- %s" % (f["severity"], f["kind"], f["summary"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
