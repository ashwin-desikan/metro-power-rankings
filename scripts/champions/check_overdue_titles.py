#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dead-man's switch for the champions board's next-title dates.

WHY THIS EXISTS. On 2026-08-27 Ashwin asked why /sports/champions still showed
Auckland City winning the OFC Champions League on 12 Apr 2025. The board's own
"Next title" column said 22 Aug 2026 -- and the 2026 final WAS played on exactly
that day. The date was right. Nobody entered the result, and nothing anywhere
noticed: the page rendered a five-day-old date in the same grey as every future
one, and the staleness watchdog checks commit recency, not content.

So this checks the content. One question: is any current champion's next-title
date in the past? If it is, either that title has been won and the ledger has
not learned it, or the competition moved and the date needs correcting. Both are
things a person has to decide, and both start with being told.

It deliberately does NOT try to fix anything. Rolling a passed date forward by a
year would tidy the board and hide a missing champion, which is the failure this
was built to catch. Ashwin's ruling, 2026-08-27: flag it, do not hide it.

  GRACE covers the ordinary case where a final is played and the result lands a
  day or two later. Anything still overdue after that is a real gap.

Stdlib only. --self-test covers the pure decision logic and runs before any file
read, per the repo's refresh-script convention.

    python scripts/champions/check_overdue_titles.py --self-test
    python scripts/champions/check_overdue_titles.py            # report, exit 1 if overdue
    python scripts/champions/check_overdue_titles.py --json     # machine-readable
"""
from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LEDGER = ROOT / "public" / "data" / "champions-history.json"

# Days past the published date before a competition counts as overdue. A final
# played on Saturday whose row lands on Monday should not page anyone.
GRACE = 3


def classify(row, today, grace=GRACE):
    """-> 'ok' | 'overdue' | 'missing'. Pure; the only thing worth self-testing.

    'missing' should be unreachable now that build_champions.py mints a date for
    every current champion, so it firing means that rule broke.
    """
    if not row.get("isCurrent"):
        return "ok"
    nxt = row.get("nextAwardedDate")
    if not nxt:
        return "missing"
    try:
        due = datetime.date.fromisoformat(nxt)
    except (TypeError, ValueError):
        return "missing"
    return "overdue" if (today - due).days > grace else "ok"


def self_test():
    t = datetime.date(2026, 8, 27)
    cases = [
        ({"isCurrent": True, "nextAwardedDate": "2027-09-11"}, "ok", "future"),
        ({"isCurrent": True, "nextAwardedDate": "2026-08-27"}, "ok", "due today"),
        ({"isCurrent": True, "nextAwardedDate": "2026-08-25"}, "ok", "2 days, inside grace"),
        ({"isCurrent": True, "nextAwardedDate": "2026-08-24"}, "ok", "3 days, on the grace edge"),
        ({"isCurrent": True, "nextAwardedDate": "2026-08-23"}, "overdue", "4 days, past grace"),
        ({"isCurrent": True, "nextAwardedDate": "2026-08-22"}, "overdue", "the real OFC case"),
        ({"isCurrent": False, "nextAwardedDate": "2020-01-01"}, "ok", "retired rows never fire"),
        ({"isCurrent": True, "nextAwardedDate": None}, "missing", "blank"),
        ({"isCurrent": True, "nextAwardedDate": ""}, "missing", "empty string"),
        ({"isCurrent": True, "nextAwardedDate": "not a date"}, "missing", "unparseable"),
        ({"isCurrent": True}, "missing", "absent key"),
    ]
    bad = 0
    for row, want, label in cases:
        got = classify(row, t)
        if got != want:
            print("  FAIL %-32s wanted %-8s got %s" % (label, want, got))
            bad += 1
    if bad:
        print("check_overdue_titles self-test FAILED -- %d of %d" % (bad, len(cases)))
        return 1
    print("check_overdue_titles self-test OK -- %d checks" % len(cases))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--grace", type=int, default=GRACE)
    args = ap.parse_args()
    if args.self_test:
        return self_test()

    if not LEDGER.exists():
        print("champions ledger not found: %s" % LEDGER)
        return 2
    rows = json.loads(LEDGER.read_text(encoding="utf-8"))
    today = datetime.date.today()

    overdue, missing, estimated = [], [], 0
    for r in rows:
        if not r.get("isCurrent"):
            continue
        if r.get("nextAwardedEstimated"):
            estimated += 1
        state = classify(r, today, args.grace)
        item = {
            "competition": r.get("competition"),
            "compSlug": r.get("compSlug"),
            "champion": r.get("champion"),
            "wonOn": r.get("dateAwarded"),
            "nextTitle": r.get("nextAwardedDate"),
            "estimated": bool(r.get("nextAwardedEstimated")),
        }
        if state == "overdue":
            item["daysOverdue"] = (today - datetime.date.fromisoformat(r["nextAwardedDate"])).days
            overdue.append(item)
        elif state == "missing":
            missing.append(item)

    current = sum(1 for r in rows if r.get("isCurrent"))
    overdue.sort(key=lambda x: -x["daysOverdue"])

    if args.json:
        print(json.dumps({"checkedOn": today.isoformat(), "current": current,
                          "estimated": estimated, "overdue": overdue,
                          "missing": missing}, indent=2))
    else:
        print("champions next-title check, %s" % today.isoformat())
        print("  %d current champions | %d next dates estimated (+1y rule) | grace %d days"
              % (current, estimated, args.grace))
        if not overdue and not missing:
            print("  OK: every current champion has a next-title date still ahead of it.")
        for m in missing:
            print("  MISSING  %-42s %s -- no next-title date at all"
                  % (m["competition"], m["champion"]))
        for o in overdue:
            print("  OVERDUE  %-42s %-26s next title was %s, %d days ago"
                  % (o["competition"], o["champion"], o["nextTitle"], o["daysOverdue"]))
        if overdue:
            print("\n  Either the title has been won and the ledger has not learned it, or the\n"
                  "  competition moved. Both need a person. Add the champion to the Champions\n"
                  "  sheet of Champions_History.xlsx (see scripts/champions/set_next_titles.py\n"
                  "  for the surgical-edit shape), then run scripts/build-champions-history.py.")

    return 1 if (overdue or missing) else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
