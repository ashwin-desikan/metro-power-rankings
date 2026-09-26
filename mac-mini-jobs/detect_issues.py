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
    out = []
    lines = [l.strip() for l in text.splitlines() if l.strip().startswith(("differs", "missing"))]
    if lines:
        out.append({
            "kind": "deploy_drift",
            "severity": "high",
            "summary": "live dispatcher directory is out of sync with the repo (%d item(s))" % len(lines),
            "evidence": {"items": lines},
        })
    # launchd drift is its OWN kind, deliberately outside ops-autofix's
    # whitelist: loading or booting out an agent is a judgement, never a
    # mechanical copy. (Before 2026-09-26 --check-sync could not see launchd.
    # Fifteen agents unloaded non-persistently on 08-07 were reloaded by the
    # 09-24 reboot and ran their jobs twice for a day. HANDOFF BA, BL, BM.)
    agents = [l.strip() for l in text.splitlines()
              if l.strip().startswith(("agent-", "plist-", "launchd-"))]
    if agents:
        out.append({
            "kind": "launchd_drift",
            "severity": "high",
            "summary": "launchd agents do not match jobs.toml [launchd] (%d item(s)); not auto-fixed" % len(agents),
            "evidence": {"items": agents},
        })
    return out


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



CONFIG_ENV = os.path.join(LIVE_DIR, "config.env")


def _config_value(name):
    """One value out of config.env, without sourcing it. Same shallow parse as
    find_down_checks uses on mini-hc.env, for the same reason: importing shell
    would mean running it."""
    try:
        with open(CONFIG_ENV, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def find_limiter_degraded(fetch=None):
    """Is the site's rate limiter actually holding across the fleet?

    lib/rateLimit.ts falls back to a per-instance in-memory counter when no
    shared store is configured or when Redis errors. Eight limits across six
    routes share it, two of them a spend cap and a brute-force limit, so one
    missing environment variable turns all eight into speed bumps. Until
    2026-09-24 that happened in total silence; this is the outside observer that
    ends the silence, and it is on the mini rather than in the app for the same
    reason notion-reconcile-verify is: a detector must not depend on the thing
    it watches.

    It reads /api/health/limiter, which PROBES the store per request, so one
    call speaks for the fleet. The endpoint's per-instance fallback counter is
    forensics and is deliberately NOT what this decides on.

    An absent secret is a LOW finding rather than nothing, because "the probe is
    not configured" and "the probe says fine" must not look the same. That
    distinction is the whole lesson of the build cap, which failed open and said
    so only in a log line.
    """
    origin = _config_value("SITE_ORIGIN") or "https://rankings.citizenofnowhere.org"
    secret = _config_value("REVALIDATE_SECRET")
    if not secret:
        return [{"kind": "limiter_probe_unconfigured", "severity": "low",
                 "summary": "REVALIDATE_SECRET not in config.env, so the rate limiter cannot be probed",
                 "evidence": {"config_env": CONFIG_ENV}}]
    url = origin.rstrip("/") + "/api/health/limiter"
    try:
        if fetch is None:
            # 🔴 THE USER-AGENT IS LOAD-BEARING. Measured 2026-09-24: our own
            # origin answers 403 to the default `Python-urllib/3.x` UA on EVERY
            # route, including ones that exist -- /api/revalidate gives curl a
            # 405 and urllib a 403. Without this header the probe below would
            # report limiter_probe_unreachable for ever and check nothing, which
            # is exactly the class of dead detector this function exists to
            # prevent. The other finders here are unaffected because they call
            # healthchecks.io and GitHub, which are not behind our Cloudflare.
            req = urllib.request.Request(url, headers={
                "x-revalidate-secret": secret,
                "User-Agent": "Mozilla/5.0 (compatible; CitizenOfNowhere/1.0; "
                              "+https://rankings.citizenofnowhere.org)",
            })
            with urllib.request.urlopen(req, timeout=20) as r:
                doc = json.load(r)
        else:
            doc = fetch()
    except Exception as ex:                                   # noqa: BLE001
        return [{"kind": "limiter_probe_unreachable", "severity": "low",
                 "summary": "could not probe the rate limiter: %s" % type(ex).__name__,
                 "evidence": {"url": url, "error": str(ex)[:200]}}]
    if doc.get("shared") is True:
        return []
    return [{"kind": "limiter_degraded", "severity": "high",
             "summary": "rate limiter is NOT shared across instances (%s); the spend cap and the "
                        "login brute-force limit are per-instance speed bumps right now"
                        % (doc.get("reason") or "unknown reason"),
             "evidence": {"store": doc.get("store"), "reason": doc.get("reason"),
                          "detail": doc.get("detail"),
                          "fallbacks_this_instance": doc.get("fallbacksThisInstance")}}]

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


SOFTWARE_UPDATE_DOMAIN = "/Library/Preferences/com.apple.SoftwareUpdate"


def find_macos_autoinstall(read=None):
    """The mini must NOT install macOS updates by itself (Decisions, 2026-09-26).

    On 2026-09-24 the macOS 27 upgrade installed itself overnight-style
    (SUOSUScheduler.tonight.install), its reboot re-loaded fifteen retired
    launchd agents that then raced the dispatcher, and the post-upgrade screen
    ended in a hand power-cycle (HANDOFF BM, BN, BO). The setting is a System
    Settings toggle this machine's sessions may not change, and a future macOS
    upgrade can quietly turn it back on, so it is watched here and reported,
    never "fixed": the kind is outside ops-autofix's whitelist.

    Reads through `defaults` (cfprefsd), not the plist file, so a change made
    moments ago in System Settings is seen before it is flushed to disk. An
    unreadable, missing or unrecognised value is a LOW finding, never an
    all-clear: a check that passes when it cannot see is worse than none.
    """
    read = read or (lambda: subprocess.run(
        ["defaults", "read", SOFTWARE_UPDATE_DOMAIN, "AutomaticallyInstallMacOSUpdates"],
        capture_output=True, text=True, timeout=15))
    try:
        p = read()
    except Exception as ex:                                   # noqa: BLE001
        return [{"kind": "macos_update_check_failed", "severity": "low",
                 "summary": "could not read the macOS auto-install setting: %s" % type(ex).__name__,
                 "evidence": {"error": str(ex)[:200]}}]
    val = (p.stdout or "").strip()
    if p.returncode != 0:
        why = "key not set" if "does not exist" in (p.stderr or "") else "defaults exited %d" % p.returncode
        return [{"kind": "macos_update_check_failed", "severity": "low",
                 "summary": "macOS auto-install setting unreadable (%s); cannot confirm it is off" % why,
                 "evidence": {"stderr": (p.stderr or "")[:200]}}]
    if val.lower() in ("0", "false", "no"):
        return []
    if val.lower() in ("1", "true", "yes"):
        return [{"kind": "macos_autoinstall_on", "severity": "high",
                 "summary": "the mini is set to install macOS updates by itself, against the 2026-09-26 "
                            "decision; turn off System Settings > General > Software Update > (i) > "
                            "'Install macOS updates'",
                 "evidence": {"AutomaticallyInstallMacOSUpdates": val}}]
    return [{"kind": "macos_update_check_failed", "severity": "low",
             "summary": "unrecognised AutomaticallyInstallMacOSUpdates value %r; cannot confirm it is off" % val[:40],
             "evidence": {"value": val[:80]}}]


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
    findings += find_limiter_degraded()
    findings += find_macos_autoinstall()
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
    lonly = lambda argv, cwd: type("P", (), {"stdout":
        "in sync with /repo\nLAUNCHD DRIFT vs jobs.toml [launchd] (com.citizenofnowhere.* only):\n"
        "  agent-loaded-undeclared   com.citizenofnowhere.rugby-weekly (ALSO a jobs.toml job: it runs twice)\n",
        "stderr": ""})()
    ld = find_drift(lonly)
    check("launchd-only drift is NOT a deploy_drift (autofix would act on it)",
          [f["kind"] for f in ld], ["launchd_drift"])
    check("...and carries its item", len(ld[0]["evidence"]["items"]), 1)
    both = lambda argv, cwd: type("P", (), {"stdout":
        "DRIFT vs /repo:\n  differs       jobs.toml\n"
        "LAUNCHD DRIFT vs jobs.toml [launchd] (com.citizenofnowhere.* only):\n"
        "  plist-loads-at-login      com.citizenofnowhere.x.plist\n", "stderr": ""})()
    bd = find_drift(both)
    check("file and launchd drift are separate findings",
          sorted(f["kind"] for f in bd), ["deploy_drift", "launchd_drift"])
    check("...and the file finding holds only the file",
          [f for f in bd if f["kind"] == "deploy_drift"][0]["evidence"]["items"], ["differs       jobs.toml"])

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


    # --- the rate-limiter probe -------------------------------------------
    # The shape that matters: a healthy-looking instance counter alongside a
    # store that is not shared. Deciding on `shared` and not on the counter is
    # the difference between catching this and missing it.
    ok_doc = lambda: {"ok": True, "shared": True, "store": "redis", "fallbacksThisInstance": 0}
    check("a shared store is not a finding", find_limiter_degraded(ok_doc), [])
    bad_doc = lambda: {"ok": True, "shared": False, "store": "memory",
                       "reason": "no-store-configured", "fallbacksThisInstance": 0}
    got = find_limiter_degraded(bad_doc)
    check("an unshared store IS a finding", len(got), 1)
    check("...and it is high severity", got[0]["severity"], "high")
    check("...and it names the reason", "no-store-configured" in got[0]["summary"], True)
    check("...even though this instance's counter reads zero",
          got[0]["evidence"]["fallbacks_this_instance"], 0)

    def _boom():
        raise OSError("refused")
    # The "not configured" branch, exercised by pointing the module at a path
    # that does not exist. Worth covering: "the probe is unconfigured" and "the
    # probe says fine" must never render the same, and an empty list would.
    global CONFIG_ENV
    _saved_cfg = CONFIG_ENV
    try:
        CONFIG_ENV = "/nonexistent/config.env"
        unconf = find_limiter_degraded(ok_doc)
        check("no secret gives a LOW finding, not silence", unconf[0]["kind"],
              "limiter_probe_unconfigured")
        check("...and it is not mistaken for an all-clear", len(unconf), 1)
    finally:
        CONFIG_ENV = _saved_cfg

    unreach = find_limiter_degraded(_boom)
    check("an unreachable probe is LOW, not a false all-clear", unreach[0]["severity"], "low")
    check("...and is named as a probe failure", unreach[0]["kind"], "limiter_probe_unreachable")


    # --- macOS auto-install (Decisions 2026-09-26) ----------------------------
    R_ = lambda rc, out="", err="": (lambda: type("P", (), {"returncode": rc, "stdout": out, "stderr": err})())
    on = find_macos_autoinstall(R_(0, "1\n"))
    check("auto-install ON is found", [f["kind"] for f in on], ["macos_autoinstall_on"])
    check("...at high severity", on[0]["severity"], "high")
    check("auto-install off (0) is silent", find_macos_autoinstall(R_(0, "0\n")), [])
    check("'false' is off too", find_macos_autoinstall(R_(0, "false")), [])
    check("'true' is on too", [f["kind"] for f in find_macos_autoinstall(R_(0, "true"))], ["macos_autoinstall_on"])
    miss = find_macos_autoinstall(R_(1, "", "The domain/default pair of (...) does not exist"))
    check("a missing key is LOW, not an all-clear", [(f["kind"], f["severity"]) for f in miss],
          [("macos_update_check_failed", "low")])
    def _nodefaults():
        raise FileNotFoundError("defaults")
    check("no `defaults` binary is LOW, not an all-clear",
          [f["severity"] for f in find_macos_autoinstall(_nodefaults)], ["low"])
    check("a garbage value is LOW, not an all-clear",
          [f["kind"] for f in find_macos_autoinstall(R_(0, "maybe"))], ["macos_update_check_failed"])
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
