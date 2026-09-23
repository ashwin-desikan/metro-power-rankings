#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assert the Notion reconciler left a log line for a given day.

WHY THIS EXISTS. The Notion reconciler is a Claude cloud routine on a 06:30 UTC
schedule. On 2026-09-23 it FIRED, made no tool call at all, and left no log line
on the "Notion operating contract" page; it completed only because Ashwin asked
about it four hours later. That is the fourth consecutive day the reconciler
needed a human, and the first where the cause was the run itself rather than its
inputs (the 19 to 21 September fetch failures are fixed).

THE RULING THIS OBEYS (Ashwin, 2026-09-23): the detector must not depend on the
thing it watches. A cloud routine cannot report that it died before it started,
and a scheduled trigger inside the same system cannot notice an absence. So this
runs on the Mac mini dispatcher, and it reads Notion DIRECTLY over the REST API
rather than through Claude. If it needed Claude it would share the failure mode
of the thing it is watching, which is the entire defect being fixed.

WHAT IT ASSERTS. That the page's "Reconciler log" section carries at least one
line whose date is the day being checked (yesterday, by default, because this
runs the morning after). Present means the run completed. ABSENT IS THE ALERT.

Exit codes: 0 = the line is there. 1 = it is not, or the page could not be read,
or the token is missing. Never 0 on doubt: a detector that fails open is the
fault it was built to catch.

Usage:
    python scripts/notion/reconcile_verify.py --self-test
    python scripts/notion/reconcile_verify.py --dry-run
    python scripts/notion/reconcile_verify.py                 # checks yesterday
    python scripts/notion/reconcile_verify.py --date 2026-09-22

Env: NOTION_API_TOKEN, placed in config.env on the mini by Ashwin. Absent means
fail closed, with no network call.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# The "Notion operating contract" page. Hardcoded because it is the one page
# this job exists to read, and a job that takes its target from an argument can
# be pointed at the wrong page by a typo and pass.
PAGE_ID = "3dfedcc4-e0f7-8190-a1e2-fb17b8b451f3"
PAGE_URL = "https://www.notion.so/3dfedcc4e0f78190a1e2fb17b8b451f3"
API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"

# The heading that opens the log. Matched case-insensitively on the text, not on
# a block id, so an editor retitling the heading breaks this LOUDLY (no section
# found is a failure) rather than silently returning an empty list.
LOG_HEADING = "reconciler log"

# A log line opens with a bare ISO date, optionally followed by a parenthetical
# qualifier: "2026-09-22 (follow-up, same session): ...". Anchored at the start
# so a date mentioned mid-sentence in some other line cannot satisfy the check.
LINE_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})\b")


# ------------------------------------------------------------------ pure ----

def log_dates(blocks):
    """The dates of the log lines, in page order.

    `blocks` is a list of (kind, text) pairs, kind being "heading" or "text",
    which is all this needs to know about Notion's block model. Collection
    starts AFTER the Reconciler log heading and runs to the end, because that
    section is last on the page. Returns None when the heading is absent, which
    the caller must treat as a failure rather than as "no dates".
    """
    started = False
    out = []
    for kind, text in blocks:
        t = (text or "").strip()
        if kind == "heading":
            if t.lower() == LOG_HEADING:
                started = True
            elif started:
                break          # a later heading ends the section
            continue
        if not started:
            continue
        m = LINE_DATE.match(t)
        if m:
            out.append(m.group(1))
    return out if started else None


def verify(blocks, want):
    """(ok, dates, reason). ok is True only when `want` is among the log dates."""
    dates = log_dates(blocks)
    if dates is None:
        return False, [], "no %r heading on the page (retitled, or the wrong page)" % LOG_HEADING
    if not dates:
        return False, [], "the Reconciler log section has no dated lines at all"
    if want in dates:
        return True, dates, "ok"
    return False, dates, "no log line dated %s" % want


def yesterday(today=None):
    return ((today or dt.date.today()) - dt.timedelta(days=1)).isoformat()


# ------------------------------------------------------------------ http ----

def _token():
    t = (os.environ.get("NOTION_API_TOKEN") or "").strip()
    if not t:
        sys.exit("NOTION_API_TOKEN is not set. Refusing to run: no network call made. "
                 "Ashwin places it in config.env on the mini.")
    return t


def fetch_blocks(page_id, token):
    """Top-level children of the page, as (kind, text) pairs.

    Only the top level is read: the log lines are top-level paragraphs under a
    top-level heading, so recursing would add failure modes without adding
    coverage.
    """
    out, cursor = [], None
    while True:
        url = "%s/blocks/%s/children?page_size=100" % (API, page_id)
        if cursor:
            url += "&start_cursor=%s" % urllib.parse.quote(cursor)
        req = urllib.request.Request(url, headers={
            "Authorization": "Bearer %s" % token,
            "Notion-Version": NOTION_VERSION,
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        for b in d.get("results", []):
            bt = b.get("type", "")
            body = b.get(bt) or {}
            text = "".join(rt.get("plain_text", "") for rt in body.get("rich_text", []))
            out.append(("heading" if bt.startswith("heading_") else "text", text))
        if not d.get("has_more"):
            return out
        cursor = d.get("next_cursor")


# ----------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="the day to require, default yesterday")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    want = args.date or yesterday()
    if args.dry_run:
        print("DRY RUN, no network call")
        print("  would GET  %s/blocks/%s/children?page_size=100 (paginated)" % (API, PAGE_ID))
        print("             with Authorization: Bearer <NOTION_API_TOKEN>, Notion-Version: %s" % NOTION_VERSION)
        print("  would assert: the 'Reconciler log' section carries a line beginning %s" % want)
        print("  on failure:   exit 1 so the runner alerts, naming the date and %s" % PAGE_URL)
        print("  token present: %s" % ("yes" if os.environ.get("NOTION_API_TOKEN") else "NO, this run would fail closed"))
        return 0

    token = _token()
    try:
        blocks = fetch_blocks(PAGE_ID, token)
    except urllib.error.HTTPError as e:
        sys.exit("Notion API HTTP %s reading the contract page. Not retried here: "
                 "the runner reports it and a second identical failure is Ashwin's "
                 "to look at, per the stop condition." % e.code)
    except Exception as e:
        sys.exit("could not read the contract page: %s: %s" % (type(e).__name__, e))

    ok, dates, reason = verify(blocks, want)
    print("Reconciler log dates found: %s" % (", ".join(dates[-6:]) if dates else "none"))
    if ok:
        print("PASS: the reconciler logged %s" % want)
        return 0
    # One machine-readable line, so the runner can put the date in the ntfy
    # without re-deriving it.
    print("MISSING %s" % want)
    print("FAIL: %s. The 06:30 UTC cloud run did not complete. %s" % (reason, PAGE_URL))
    return 1


# ------------------------------------------------------------ self-test ----

def self_test():
    n = [0]

    def check(name, got, want):
        n[0] += 1
        if got != want:
            raise SystemExit("self-test FAILED: %s\n  got  %r\n  want %r" % (name, got, want))

    real = [
        ("heading", "For each machine"),
        ("text", "Mac mini Claude Code: the Notion MCP is added once"),
        ("heading", "Reconciler log"),
        ("text", "2026-09-19: 0 Backlog closed, 5 added, 0 Decisions added."),
        ("text", "2026-09-21 (08:30 UTC re-run, supersedes the FAILED line above): 1 Backlog closed."),
        ("text", "2026-09-22 (follow-up, same session, at Ashwin's instruction): 0 Backlog closed."),
    ]
    check("dates are collected in order", log_dates(real),
          ["2026-09-19", "2026-09-21", "2026-09-22"])
    check("a parenthetical qualifier still parses", "2026-09-22" in log_dates(real), True)
    check("nothing before the heading is collected",
          "2026-09-18" in (log_dates(real) or []), False)

    # Present and absent, which is the whole job.
    check("present passes", verify(real, "2026-09-22")[0], True)
    check("absent fails", verify(real, "2026-09-23")[0], False)
    check("absent explains itself", verify(real, "2026-09-23")[2], "no log line dated 2026-09-23")

    # A date mentioned mid-line must NOT satisfy the check: that is how a
    # detector passes on prose about a day rather than a log line for it.
    midline = [("heading", "Reconciler log"),
               ("text", "The run of 2026-09-23 never fired, see the note above.")]
    check("a date mid-sentence does not count", verify(midline, "2026-09-23")[0], False)

    # Malformed pages. Both must FAIL, never pass: a detector that reads an
    # unexpected page shape and reports success is the fault it exists to catch.
    check("no heading at all fails", verify([("text", "2026-09-22: something")], "2026-09-22")[0], False)
    check("no heading is reported as such",
          "heading" in verify([("text", "x")], "2026-09-22")[2], True)
    check("log_dates returns None with no heading", log_dates([("text", "2026-09-22: x")]), None)
    check("an empty log section fails", verify([("heading", "Reconciler log")], "2026-09-22")[0], False)
    check("a later heading ends the section",
          log_dates([("heading", "Reconciler log"), ("text", "2026-09-22: a"),
                     ("heading", "Something else"), ("text", "2026-09-23: b")]),
          ["2026-09-22"])
    check("empty page fails", verify([], "2026-09-22")[0], False)

    check("yesterday is the default target", yesterday(dt.date(2026, 9, 23)), "2026-09-22")
    check("yesterday crosses a month", yesterday(dt.date(2026, 10, 1)), "2026-09-30")

    print("self-test OK (%d checks)" % n[0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
