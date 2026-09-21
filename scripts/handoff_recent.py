#!/usr/bin/env python3
"""Write HANDOFF-recent.md: just the last few days of HANDOFF.md.

WHY THIS EXISTS. HANDOFF.md is the narrative audit trail and it is now over a
megabyte. The Notion reconciler cannot fetch a file that size, and it cannot
reach GitHub's API or the commits page either, so it was reconciling Notion
against whatever it could actually read -- which was not the handoff. This
writes a small file it CAN read, holding the entries that could still describe
unreconciled state.

Pairs with commits-recent.txt, which the pre-commit hook generates for the same
reason. Both are GENERATED: edit HANDOFF.md, not these.

Stdlib only on purpose: the pre-commit hook runs it as plain `python3`, not the
repo venv, so it must not import anything that is only installed there.
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

HEADING = re.compile(r"^## (\d{4}-\d{2}-\d{2})", re.M)
MAX_BYTES = 400 * 1024
MIN_ENTRIES = 4

# Deliberately carries NO timestamp. A generated-at line would make the output
# differ on every run, which would defeat the unchanged-file check below and
# put a pointless diff in every single commit.
BANNER_TEMPLATE = """<!-- GENERATED FILE - DO NOT EDIT BY HAND.
     Written by scripts/handoff_recent.py from HANDOFF.md, which is the source
     of truth. Holds only the most recent entries, because the Notion
     reconciler cannot fetch the full HANDOFF.md. Edits here are overwritten.

     NEWEST ENTRY FIRST, which is the opposite of HANDOFF.md and is the whole
     point: the reader fetches this over HTTP and its window can stop partway,
     so whatever it does see must be the most recent. Chronological order put
     2026-09-14 at the top and today's entry out of reach, which is exactly how
     the 2026-09-21 run failed even after this file existed.

     entries: {n}, {oldest} to {newest}
     If the reader counts fewer than {n} entries, its fetch window stopped
     short and the entries it did not see are the OLDEST ones. -->
"""


def split_entries(text):
    """[(date, source_index, chunk)] in file order, one per dated heading.

    A chunk runs from its own heading to the next one, so it carries its
    trailing blank lines and the original spacing survives a round trip.
    Anything before the first dated heading (the file's protocol preamble) is
    not an entry and is not carried over.
    """
    marks = [(m.start(), m.group(1)) for m in HEADING.finditer(text)]
    out = []
    for i, (pos, datestr) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        try:
            day = datetime.date.fromisoformat(datestr)
        except ValueError:
            # A typo'd date must not silently drop the entry: treat it as very
            # old so it survives only via the keep-at-least rule, and say so.
            print(f"handoff_recent: unparseable date in heading {datestr!r}; "
                  f"treating it as oldest", file=sys.stderr)
            day = datetime.date.min
        out.append((day, i, text[pos:end]))
    return out


def select(entries, days, today=None):
    """Entries within `days`, but never fewer than MIN_ENTRIES, and never more
    than MAX_BYTES. Returned in file order."""
    today = today or datetime.date.today()
    cutoff = today - datetime.timedelta(days=days)
    kept = [e for e in entries if e[0] >= cutoff]
    if len(kept) < MIN_ENTRIES:
        # Most recent by date, ties broken by position, then back to file order.
        kept = sorted(sorted(entries, key=lambda e: (e[0], e[1]))[-MIN_ENTRIES:],
                      key=lambda e: e[1])
    kept.sort(key=lambda e: e[1])
    # Size cap wins over the keep-at-least rule, or a run of huge entries could
    # produce a file the reconciler still cannot read. Never trims to nothing.
    while len(kept) > 1 and sum(len(e[2].encode()) for e in kept) > MAX_BYTES:
        kept.pop(0)
    return kept


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--stdin", action="store_true",
                    help="read HANDOFF.md content from stdin instead of the file")
    ap.add_argument("--days", type=int, default=7,
                    help="keep entries dated within this many days (default 7)")
    ap.add_argument("--out", default=None, help="output path (default HANDOFF-recent.md)")
    args = ap.parse_args(argv)

    root = Path(__file__).resolve().parent.parent
    text = sys.stdin.read() if args.stdin else (root / "HANDOFF.md").read_text()
    out_path = Path(args.out) if args.out else root / "HANDOFF-recent.md"

    entries = split_entries(text)
    if not entries:
        print("handoff_recent: no '## YYYY-MM-DD' headings found; refusing to "
              "write an empty HANDOFF-recent.md", file=sys.stderr)
        return 1

    kept = select(entries, args.days)
    # Newest first: see the banner. select() works in file order because the
    # oldest-first trimming is easier to reason about there; only the OUTPUT
    # is reversed.
    # The count and range let the reader PROVE it saw the whole file rather
    # than infer it: if it counts fewer entries than the banner promises, its
    # window stopped short. Every value here is derived from `kept`, so the
    # banner only changes when the selection does and the unchanged-file check
    # below still holds.
    banner = BANNER_TEMPLATE.format(n=len(kept),
                                    oldest=kept[0][0].isoformat(),
                                    newest=kept[-1][0].isoformat())
    body = banner + "\n" + "".join(e[2] for e in reversed(kept))
    if not body.endswith("\n"):
        body += "\n"

    try:
        unchanged = out_path.read_text() == body
    except OSError:
        unchanged = False
    if unchanged:
        print(f"handoff_recent: {out_path.name} already current "
              f"({len(kept)} of {len(entries)} entries, {len(body.encode())} bytes)")
        return 0

    out_path.write_text(body)
    print(f"handoff_recent: wrote {out_path.name} "
          f"({len(kept)} of {len(entries)} entries, {len(body.encode())} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
