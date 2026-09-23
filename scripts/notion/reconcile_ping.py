#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Trigger the Notion reconciler cloud routine, and report the HTTP status.

WHY. The reconciler runs at 06:30 UTC, which is BEFORE most of a day's HANDOFF
entries exist. This gives the day's work a second pass while it is still
same-day, so a session's rows are reconciled against the entries it actually
wrote rather than waiting for tomorrow morning.

It is the smaller half of the pair. scripts/notion/reconcile_verify.py is the
job that actually fixes the 2026-09-23 defect (a run that fires, does nothing
and leaves no log line). Triggering an extra pass without verifying it just
moves the silence to a different hour, which is why these shipped together.

FAILURE IS LOUD BY CONSTRUCTION. Only a 2xx exits 0. Anything else exits
non-zero, which is what makes the runner alert and what makes hc-run.sh withhold
its success ping, so a tile cannot go green on a failed trigger. Retried EXACTLY
once: a trigger endpoint that is down stays down for a minute, and a loop of
retries would turn one outage into a long hang inside a dispatcher slot.

Usage:
    python scripts/notion/reconcile_ping.py --self-test
    python scripts/notion/reconcile_ping.py --dry-run
    python scripts/notion/reconcile_ping.py

Env, both placed in config.env on the mini by Ashwin, never in the repo:
    NOTION_RECONCILE_TRIGGER_URL    the routine's per-routine trigger endpoint
    NOTION_RECONCILE_TRIGGER_TOKEN  its bearer token
Absent means fail closed, with no network call.
"""
import argparse
import os
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 30
MAX_ATTEMPTS = 2          # the first try, and one retry. Not configurable on purpose.
RETRY_WAIT = 10


# ------------------------------------------------------------------ pure ----

def is_success(status):
    """2xx and nothing else. A 3xx is not success: a redirect on a POST trigger
       means the endpoint moved, which is Ashwin's to fix, not ours to follow."""
    return isinstance(status, int) and 200 <= status < 300


def should_retry(status, attempt, max_attempts=MAX_ATTEMPTS):
    """Retry once, and never on 401 or 404.

    A 401 or 404 means the endpoint or the token is wrong. Retrying it cannot
    help and the standing stop condition says to report rather than probe
    variations, so those fail on the first attempt.
    """
    if is_success(status):
        return False
    if status in (401, 404):
        return False
    return attempt < max_attempts


def redact(url):
    """A trigger URL can carry a token in a query string. Never log it whole."""
    if not url:
        return "<unset>"
    head, sep, _ = url.partition("?")
    return head + ("?<redacted>" if sep else "")


# ------------------------------------------------------------------ http ----

def _env():
    url = (os.environ.get("NOTION_RECONCILE_TRIGGER_URL") or "").strip()
    tok = (os.environ.get("NOTION_RECONCILE_TRIGGER_TOKEN") or "").strip()
    missing = [n for n, v in (("NOTION_RECONCILE_TRIGGER_URL", url),
                              ("NOTION_RECONCILE_TRIGGER_TOKEN", tok)) if not v]
    if missing:
        sys.exit("%s not set. Refusing to run: no network call made. "
                 "Ashwin places these in config.env on the mini." % " and ".join(missing))
    return url, tok


def post_once(url, tok):
    """(status, body_head). A transport error is reported as status 0."""
    req = urllib.request.Request(url, method="POST", data=b"{}", headers={
        "Authorization": "Bearer %s" % tok,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, (r.read(200) or b"").decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, (e.read(200) or b"").decode("utf-8", "replace")
    except Exception as e:
        return 0, "%s: %s" % (type(e).__name__, e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if args.dry_run:
        url = (os.environ.get("NOTION_RECONCILE_TRIGGER_URL") or "").strip()
        have = bool(url) and bool(os.environ.get("NOTION_RECONCILE_TRIGGER_TOKEN"))
        print("DRY RUN, no network call")
        print("  would POST %s" % redact(url))
        print("             Authorization: Bearer <NOTION_RECONCILE_TRIGGER_TOKEN>")
        print("             Content-Type: application/json, body {}")
        print("  success is a 2xx ONLY; 401 and 404 are not retried, anything else "
              "gets one retry after %ss" % RETRY_WAIT)
        print("  on failure:  exit 1, so the runner alerts and hc-run.sh withholds its ping")
        print("  secrets present: %s" % ("yes" if have else "NO, this run would fail closed"))
        return 0

    url, tok = _env()
    status, body = 0, ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        status, body = post_once(url, tok)
        print("attempt %d of %d: HTTP %s" % (attempt, MAX_ATTEMPTS, status or "no response"))
        if is_success(status):
            print("PASS: reconciler triggered (HTTP %d)" % status)
            return 0
        if not should_retry(status, attempt):
            break
        print("  retrying once in %ss" % RETRY_WAIT)
        time.sleep(RETRY_WAIT)

    print("BODY %s" % (body or "")[:200].replace("\n", " "))
    if status in (401, 404):
        print("FAIL: HTTP %s is the endpoint or the token, not a transient fault. "
              "Not retried, and not to be probed with variations: this one is "
              "Ashwin's to fix." % status)
    else:
        print("FAIL: reconciler trigger returned HTTP %s after %d attempt(s)."
              % (status or "no response", MAX_ATTEMPTS))
    return 1


# ------------------------------------------------------------ self-test ----

def self_test():
    n = [0]

    def check(name, got, want):
        n[0] += 1
        if got != want:
            raise SystemExit("self-test FAILED: %s\n  got  %r\n  want %r" % (name, got, want))

    for s in (200, 201, 202, 204, 299):
        check("HTTP %d is success" % s, is_success(s), True)
    for s in (0, 199, 301, 302, 400, 401, 403, 404, 429, 500, 502, 503):
        check("HTTP %s is not success" % s, is_success(s), False)
    check("a non-int status is not success", is_success(None), False)

    # Exactly one retry, and none at all for the two that mean "wrong endpoint".
    check("500 retries on attempt 1", should_retry(500, 1), True)
    check("500 does NOT retry on attempt 2", should_retry(500, 2), False)
    check("no response retries once", should_retry(0, 1), True)
    check("429 retries once", should_retry(429, 1), True)
    check("401 never retries", should_retry(401, 1), False)
    check("404 never retries", should_retry(404, 1), False)
    check("a 2xx never retries", should_retry(200, 1), False)
    check("a 3xx retries but is not success", (should_retry(302, 1), is_success(302)), (True, False))

    # The URL must never reach a log whole, because a trigger URL can carry a
    # token in its query string.
    check("a query string is redacted",
          redact("https://example.com/t/abc?token=SECRET"), "https://example.com/t/abc?<redacted>")
    check("a plain url is left alone",
          redact("https://example.com/t/abc"), "https://example.com/t/abc")
    check("no url reads as unset", redact(""), "<unset>")
    check("the secret never appears",
          "SECRET" in redact("https://e.com/x?token=SECRET"), False)

    print("self-test OK (%d checks)" % n[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
