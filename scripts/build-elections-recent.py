#!/usr/bin/env python3
"""Build public/data/elections-recent.json: a small index of COMPLETED
elections, so /elections can show what has just been voted on beside what is
coming next.

Why a summary file rather than reading the sources directly. The results live
in 67 per-country files, `public/data/<code>-elections.json`, 5.1 MB in total,
and each has its own lib module with a fully literal path -- which is the rule
that keeps Next's file tracer from sweeping all of public/data into a route.
Importing 67 of them into one page would bundle all 5.1 MB into it. This emits
ONE small file instead, and the page reads that.

Why it holds three years rather than six months. The page filters to its own
window at render time, so the window slides with the clock instead of freezing
at whatever day this script last ran. A rebuild is then only needed when a
RESULT is filed, not to keep the section honest.

Dates in the sources are human prose, in 42 distinct shapes across 1,383
elections ("13 September 2026", "26-29 April 1994", "25 October and 22
November 2015", "16 (Maori) & 17 December (general) 1919", "convened 21
September 1949"). The rule that survives all of them: take the LAST complete
day-month-year in the string, which is the day the election concluded. Where
no day is given, the precision is recorded and the page prints the source's
own wording rather than a day this script invented.
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "data", "elections-recent.json")
KEEP_YEARS = 3

MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}
MONTH_RE = "|".join(MONTHS)

# "22 November 2015" and the US-style "January 22, 1874". A parenthetical may
# sit between any two parts: New Zealand's split Maori and general rolls are
# written "16 (Maori) & 17 December (general) 1919", so the year is fenced off
# from its own month. Only ONE parenthetical is allowed between parts, which is
# enough for every shape in the sources and stops a day pairing with a year
# from a different clause.
GAP = r"\s*(?:\([^)]*\)\s*)?"
DMY = re.compile(r"(\d{1,2})%s(%s)%s(\d{4})" % (GAP, MONTH_RE, GAP), re.I)
MDY = re.compile(r"(%s)%s(\d{1,2}),?%s(\d{4})" % (MONTH_RE, GAP, GAP), re.I)
MY = re.compile(r"(%s)\s+(\d{4})" % MONTH_RE, re.I)
YEAR = re.compile(r"\b(\d{4})\b")


def month_end(year, month):
    if month == 12:
        return datetime.date(year, 12, 31)
    return datetime.date(year, month + 1, 1) - datetime.timedelta(days=1)


def parse_election_date(text):
    """(iso, precision) for a prose election date, or (None, None).

    An election that runs over several days, in two rounds, or on separate
    rolls concludes on its LAST day, so the last full date in the string is
    the one that matters -- "25 October and 22 November 2015" concluded in
    November. Taking the first would file a two-round election under its
    opening round."""
    if not text:
        return None, None
    s = str(text)
    best = None
    for m in DMY.finditer(s):
        d, mon, y = int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3))
        try:
            got = datetime.date(y, mon, d)
        except ValueError:
            continue                     # e.g. "31 February": upstream typo
        if best is None or got > best:
            best = got
    for m in MDY.finditer(s):
        mon, d, y = MONTHS[m.group(1).lower()], int(m.group(2)), int(m.group(3))
        try:
            got = datetime.date(y, mon, d)
        except ValueError:
            continue
        if best is None or got > best:
            best = got
    if best:
        return best.isoformat(), "day"
    # No day anywhere: fall back to month, then year. The sort key is the end
    # of the period, because that is when the election had finished; the page
    # prints the source's own wording, never this date.
    best_my = None
    for m in MY.finditer(s):
        mon, y = MONTHS[m.group(1).lower()], int(m.group(2))
        got = month_end(y, mon)
        if best_my is None or got > best_my:
            best_my = got
    if best_my:
        return best_my.isoformat(), "month"
    years = [int(y) for y in YEAR.findall(s)]
    if years:
        return datetime.date(max(years), 12, 31).isoformat(), "year"
    return None, None


def year_agrees(iso, year):
    """Does the parsed date agree with the record's own `year`?

    `year` is a second and INDEPENDENT statement of when the election was, and
    the only thing available to check a date string against. Five Greek rows
    for 1874, 1910, 1912 and 1915 all read "August 29, 2026"; without this they
    would publish as this year's results.

    A date ending in year+1 is NOT a fault: plenty of elections open in one
    year and close in the next (India 1951-52, Norway's 1817 Storting, the
    first US presidential election), and `year` is the year they began."""
    if not isinstance(year, int):
        return True
    return int(iso[:4]) in (year, year + 1)


def top_party(election):
    """(name, seats, share) for the seat leader, preferring the file's own
    seatLeader over re-deriving it."""
    parties = election.get("parties") or []
    named = election.get("seatLeader")
    row = None
    if named:
        row = next((p for p in parties if p.get("name") == named), None)
    if row is None:
        seated = [p for p in parties if isinstance(p.get("seats"), (int, float))]
        row = max(seated, key=lambda p: p["seats"]) if seated else None
    if row is None:
        return named, None, None
    return row.get("name") or named, row.get("seats"), row.get("share")


def build(today=None, keep_years=KEEP_YEARS):
    today = today or datetime.date.today()
    floor = datetime.date(today.year - keep_years, today.month, 1)
    rows, skipped, mismatched = [], 0, []
    for path in sorted(glob.glob(os.path.join(ROOT, "public", "data", "*-elections.json"))):
        code = os.path.basename(path).split("-")[0]
        doc = json.load(open(path, encoding="utf-8"))
        for e in doc.get("elections") or []:
            iso, precision = parse_election_date(e.get("date"))
            if not iso:
                skipped += 1
                continue
            # Every record carries its own `year`, which is a second and
            # INDEPENDENT statement of when the election was. When the two
            # disagree the date string is not to be trusted: five Greek rows
            # for 1874, 1910, 1912 and 1915 all read "August 29, 2026", which
            # would otherwise publish four long-dead elections as this year's
            # results. Refuse the row and name it, rather than pick a side.
            #
            # A date ending in year+1 is NOT a fault: plenty of elections open
            # in one year and close in the next (India 1951-52, Norway's 1817
            # Storting, the first US presidential election), and `year` is the
            # year they began. Only a gap that cannot be that is corruption.
            if not year_agrees(iso, e.get("year")):
                mismatched.append((code, e.get("label"), e.get("year"), e.get("date")))
                continue
            if iso < floor.isoformat() or iso > today.isoformat():
                continue               # future-dated rows are not results yet
            name, seats, share = top_party(e)
            rows.append({
                "code": code,
                "date": iso,
                "precision": precision,
                "dateText": str(e.get("date")),
                "label": e.get("label"),
                "kind": e.get("kind"),
                "seatLeader": name,
                "seatLeaderSeats": seats,
                "seatLeaderShare": share,
                "totalSeats": e.get("totalSeats"),
                "majoritySeats": e.get("majoritySeats"),
                "turnout": e.get("turnout"),
                "summary": e.get("summary"),
                "unfree": e.get("unfree"),
                "caveat": e.get("caveat"),
            })
    rows.sort(key=lambda r: (r["date"], r["code"]), reverse=True)
    return rows, skipped, mismatched


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true",
                    help="write public/data/elections-recent.json (default: dry run)")
    args = ap.parse_args()
    if args.self_test:
        return _self_test()
    if _self_test() != 0:
        return 1

    today = datetime.date.today()
    rows, skipped, mismatched = build(today)
    print("elections with a usable date in the last %d years: %d (%d rows had no "
          "parseable date at all)" % (KEEP_YEARS, len(rows), skipped))
    if mismatched:
        print("\n%d row(s) REFUSED: the date string disagrees with the record's own "
              "year, so the date is not trustworthy:" % len(mismatched))
        for code, label, year, text in mismatched:
            print("   %-3s %-14s year=%s but date=%r" % (code, label, year, text))
    win = [r for r in rows if r["date"] >= (today - datetime.timedelta(days=183)).isoformat()]
    print("in the trailing 183 days: %d" % len(win))
    for r in win:
        print("   %s  %-3s %-12s %-22s %s" % (r["date"], r["code"], r["kind"] or "-",
                                              (r["seatLeader"] or "-")[:22], r["dateText"]))
    if args.write:
        # _meta.asOf is the convention scripts/check-data-currency.mjs reads,
        # and this file is in its manifest: nothing schedules this builder, so
        # the only sign it has stopped is a board that quietly stops growing.
        payload = {"_meta": {"asOf": today.isoformat(),
                             "source": "public/data/<code>-elections.json",
                             "keepYears": KEEP_YEARS},
                   "elections": rows}
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print("\nWROTE %s (%d rows)" % (os.path.relpath(OUT, ROOT), len(rows)))
    else:
        print("\nDry run: nothing written. Re-run with --write.")
    return 0


def _self_test():
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    # The shapes that actually occur, counted across the 67 source files.
    check("plain day", parse_election_date("13 September 2026"), ("2026-09-13", "day"))
    check("US order", parse_election_date("January 22, 1874"), ("1874-01-22", "day"))
    # A range, a two-round election and a split roll all END on their last date.
    check("day range", parse_election_date("26–29 April 1994"), ("1994-04-29", "day"))
    check("two rounds", parse_election_date("25 October and 22 November 2015"),
          ("2015-11-22", "day"))
    check("cross-month range", parse_election_date("30 May – 1 June 1869"),
          ("1869-06-01", "day"))
    check("cross-year range", parse_election_date("25 October 1951 – 21 February 1952"),
          ("1952-02-21", "day"))
    check("three polling days", parse_election_date("16, 18 and 20 December 2006"),
          ("2006-12-20", "day"))
    check("split roll with parentheses",
          parse_election_date("16 (Māori) & 17 December (general) 1919"),
          ("1919-12-17", "day"))
    check("prefixed prose", parse_election_date("convened 21 September 1949"),
          ("1949-09-21", "day"))
    check("two regions, two dates",
          parse_election_date("21 June 2021 (most regions) 30 September 2021 (Harari)"),
          ("2021-09-30", "day"))
    # No day given: the sort key is the end of the period and the precision
    # says so, because the page must print the source's wording instead.
    check("month only", parse_election_date("September 1893"), ("1893-09-30", "month"))
    check("month range", parse_election_date("August and September 1887"),
          ("1887-09-30", "month"))
    check("year only", parse_election_date("1866"), ("1866-12-31", "year"))
    # Nothing usable, and an upstream impossible date, are both refused rather
    # than guessed at.
    check("no date at all", parse_election_date(""), (None, None))
    check("none", parse_election_date(None), (None, None))
    check("impossible day is skipped, not coerced",
          parse_election_date("31 February 2020"), ("2020-02-29", "month"))

    # seatLeader is preferred over re-deriving, but a file without one still
    # resolves to the largest party rather than nothing.
    e1 = {"seatLeader": "B", "parties": [{"name": "A", "seats": 10},
                                         {"name": "B", "seats": 4, "share": 9.1}]}
    check("named seat leader wins over the biggest", top_party(e1), ("B", 4, 9.1))
    e2 = {"parties": [{"name": "A", "seats": 10}, {"name": "B", "seats": 4}]}
    check("no seatLeader falls back to the largest", top_party(e2), ("A", 10, None))
    check("no parties at all", top_party({}), (None, None, None))

    # The record's own `year` is the only outside check on its date string.
    # Real corruption, live in the sources today:
    check("1874 row dated 2026 is refused", year_agrees("2026-08-29", 1874), False)
    check("1832 row dated 1830 is refused", year_agrees("1830-11-22", 1832), False)
    # ...and the cross-year elections that must NOT be mistaken for it.
    check("same year agrees", year_agrees("1951-10-25", 1951), True)
    check("election closing the next year agrees", year_agrees("1952-02-21", 1951), True)
    check("no year to check against passes", year_agrees("1952-02-21", None), True)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("build-elections-recent self-test OK (24 cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
