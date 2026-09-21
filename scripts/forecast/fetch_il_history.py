#!/usr/bin/env python3
"""Re-read the seven historical Israeli opinion-polling articles from raw
wikitext and replace the provisional `final_polls` rows in
data/forecast/coalitions/polls-il.json.

Why this exists (step B2 of the coalition model). The rows in polls-il.json
were transcribed through a page summariser, which cannot see wikitext spans.
Two elections came out of that with ZERO usable polls (2013 and 2015) because
the summariser SUMMED the columns a merged list spans: the 2015 Zionist Union
is one `colspan=2` cell over the Labor and Hatnuah headers, so reading it as
two parties counts 24 seats twice and the row totals 144, not 120. Every such
row then failed the 120-seat rule and was thrown away.

Reading the same tables span-aware reproduces the real 2015 result exactly
(Likud 30, Zionist Union 24, Joint List 13, Yesh Atid 11, Kulanu 10, Jewish
Home 8, Shas 7, Yisrael Beiteinu 6, UTJ 6, Meretz 5 = 120), which is the
evidence that the span, not the arithmetic, was the problem.

Dry-run by default, per the repo rule for new automation: it prints what it
would change and writes nothing until --write. Run --self-test first; it
covers the decision logic offline with the real failure shapes.
"""
import argparse
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_data as F  # noqa: E402  (path set above)

HISTORY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "..", "data", "forecast", "coalitions", "polls-il.json")

IL_SEATS = 120
SEAT_TOL = 2          # the established rule: a row must total 120 +/- 2
WINDOW_DAYS = 14      # "final polls" = the last fortnight of the campaign

# election date -> (article title, default year for bare "17 Mar" cells)
ARTICLES = {
    "2013-01-22": ("Opinion polling for the 2013 Israeli legislative election", 2013),
    "2015-03-17": ("Opinion polling for the 2015 Israeli legislative election", 2015),
    "2019-04-09": ("Opinion polling for the April 2019 Israeli legislative election", 2019),
    "2019-09-17": ("Opinion polling for the September 2019 Israeli legislative election", 2019),
    "2020-03-02": ("Opinion polling for the 2020 Israeli legislative election", 2020),
    "2021-03-23": ("Opinion polling for the 2021 Israeli legislative election", 2021),
    "2022-11-01": ("Opinion polling for the 2022 Israeli legislative election", 2022),
}

# Leading columns that describe the poll rather than a party.
META_COL = r"^(date|poll|polling firm|publisher|sample|fieldwork|source|lead)"
# Trailing columns that aggregate parties. "Gov."/"Opp." are bloc totals and
# "L"/"R" are left/right blocs: counting any of them as a party is the exact
# fault that published a 36-seat "Haredi Public" in September 2026.
AGG_COL = r"^(others?|gov\.?|opp\.?|l|r|total|majority)$"


def clean_header(h):
    """Wikipedia header cells carry entities and link residue."""
    h = h.replace("&nbsp;", " ")
    if "|" in h:                       # "YB|Yisrael Beiteinu" -> "Yisrael Beiteinu"
        h = h.split("|")[-1]
    return re.sub(r"\s+", " ", h).strip(" -–—")


def party_span(cols):
    """(start, end): the party columns, after the meta block and before the
    trailing aggregates."""
    start = 0
    for i, c in enumerate(cols):
        if re.match(META_COL, clean_header(c).lower()):
            start = i + 1
        else:
            break
    end = len(cols)
    for i in range(len(cols) - 1, start, -1):
        if re.match(AGG_COL, clean_header(cols[i]).lower()):
            end = i
        else:
            break
    return start, end


def split_firm_publisher(firm, publisher):
    """2019-04 and 2013 have no Publisher column: the firm cell carries
    "Smith/Maariv". Split on the last slash so rows stay comparable with the
    articles that do separate the two."""
    if publisher or "/" not in firm:
        return firm, publisher
    head, _, tail = firm.rpartition("/")
    return head.strip(), tail.strip()


def read_table(cols, rows, year):
    """(kept, sum_rejected, bad_dates) from one span-aware parsed table."""
    start, end = party_span(cols)
    names = [clean_header(c) for c in cols]
    kept, rejected, bad_dates = [], [], []
    for r in rows:
        slot, cells = 0, {}
        for text, cs in r:
            cells[slot] = (text, cs)
            slot += cs
        if slot < end:
            continue
        dcell = cells.get(0)
        # A label row ("Final results", "Seats in the outgoing Knesset") spans
        # the meta columns. A poll row has a date of its own.
        if not dcell or dcell[1] != 1:
            continue
        date = F.parse_date(dcell[0], year)
        if not date:
            continue
        try:
            datetime.date.fromisoformat(date)
        except ValueError:
            # The 2013 article contains "29 Feb", a date that does not exist.
            # Upstream typos are reported, never repaired by guesswork.
            bad_dates.append((dcell[0], date))
            continue
        firm = cells.get(1, ("?", 1))[0]
        publisher = cells.get(2, ("", 1))[0] if 2 < start else ""
        firm, publisher = split_firm_publisher(firm, publisher)
        seats, below, merged = {}, {}, []
        i = start
        while i < end:
            if i not in cells:
                i += 1
                continue
            text, cs = cells[i]
            width = min(cs, end - i)
            # A cell spanning k party headers is ONE list, not k parties.
            label = " + ".join(names[i:i + width]) if width > 1 else names[i]
            if width > 1:
                merged.append(label)
            t = text.strip()
            pct = re.search(r"(\d+(?:\.\d+)?)\s*%", t)
            num = re.match(r"^(\d{1,2})$", t)
            if pct:                    # below threshold, shown as a share
                seats[label] = 0
                below[label] = float(pct.group(1))
            elif num:
                seats[label] = int(num.group(1))
            i += width
        total = sum(seats.values())
        row = {"date": date, "pollster": firm[:60], "publisher": publisher[:60],
               "seats": seats, "sums_to": total,
               "kind": "exit_poll" if "exit poll" in firm.lower() else "pre_election"}
        if below:
            row["pct_below"] = below
        if merged:
            row["merged_columns"] = merged
        (kept if abs(total - IL_SEATS) <= SEAT_TOL else rejected).append(row)
    return kept, rejected, bad_dates


def polls_from_wikitext(wt, year, election, window_days=WINDOW_DAYS):
    """(window, stats) for one article. Pure, so the self-test can run it."""
    kept, rejected, bad_dates = [], [], []
    for cols, rows in F.parse_tables(wt, keep_spans=True):
        if "likud" not in " ".join(cols).lower():
            continue
        k, rj, bd = read_table(cols, rows, year)
        kept += k
        rejected += rj
        bad_dates += bd
    election_day = datetime.date.fromisoformat(election)
    window, seen = [], set()
    for p in sorted(kept, key=lambda p: p["date"], reverse=True):
        days = (election_day - datetime.date.fromisoformat(p["date"])).days
        if not 0 <= days <= window_days:
            continue
        # the same poll can appear in more than one of an article's tables
        key = (p["date"], p["pollster"].lower()[:14])
        if key in seen:
            continue
        seen.add(key)
        window.append(p)
    window.sort(key=lambda p: (p["date"], p["pollster"]))
    return window, {"kept": len(kept), "sum_rejected": len(rejected),
                    "bad_dates": bad_dates}


def build(window_days=WINDOW_DAYS, verbose=True):
    """Fetch all seven articles and return {election: (window, stats)}."""
    out = {}
    for election, (title, year) in sorted(ARTICLES.items()):
        wt = F.wikitext(title)
        window, stats = polls_from_wikitext(wt, year, election, window_days)
        out[election] = (window, stats)
        if verbose:
            print("%s: %3d usable rows, %3d rejected on the 120 rule, "
                  "%d in the final %dd window"
                  % (election, stats["kept"], stats["sum_rejected"],
                     len(window), window_days))
            for raw, got in stats["bad_dates"]:
                print("    upstream date is impossible: %r -> %r (row dropped)"
                      % (raw, got))
    return out


def report(built, history):
    """Print the dry-run diff against the rows currently on disk."""
    by_el = {e["election"]: e for e in history["elections"]}
    print("\n%-12s %8s %8s   %s" % ("election", "on disk", "wikitext", "change"))
    for election in sorted(built):
        window, _ = built[election]
        old = by_el.get(election, {}).get("final_polls") or []
        print("%-12s %8d %8d   %+d" % (election, len(old), len(window),
                                       len(window) - len(old)))
    # Where both sources hold the same poll, do they agree?
    agree = disagree = 0
    diffs = []
    for election in sorted(built):
        window, _ = built[election]
        new = {(p["date"], p["pollster"].lower()[:14]): p for p in window}
        for op in (by_el.get(election, {}).get("final_polls") or []):
            np_ = new.get((op["date"], op["pollster"].lower()[:14]))
            if not np_:
                continue
            common = set(op["seats"]) & set(np_["seats"])
            if common and all(op["seats"][c] == np_["seats"][c] for c in common):
                agree += 1
            else:
                disagree += 1
                d = [(c, op["seats"][c], np_["seats"][c])
                     for c in sorted(common) if op["seats"][c] != np_["seats"][c]]
                diffs.append((election, op["date"], op["pollster"][:20], d[:4]))
    print("\ncorroboration on rows both sources hold: %d agree, %d disagree"
          % (agree, disagree))
    for election, date, firm, d in diffs:
        print("   %s %s %-20s %s" % (election, date, firm, d))


def write(built, history, path=HISTORY_PATH):
    by_el = {e["election"]: e for e in history["elections"]}
    for election, (window, stats) in built.items():
        el = by_el.get(election)
        if el is None:
            continue
        el["final_polls"] = window
        el["rejected_polls"] = stats["sum_rejected"]
        el["poll_source"] = "raw wikitext via parse_tables(keep_spans=True)"
    history["built"] = datetime.date.today().isoformat()
    history["note"] = (
        "Results verified: Bader-Ofer with the listed surplus agreements "
        "reproduces the real seats exactly for all seven elections. Poll rows "
        "were re-read from raw wikitext on %s (step B2), span-aware, so a "
        "merged list spanning k header columns is counted once rather than k "
        "times; rows that do not total %d seats within %d are rejected rather "
        "than rescaled. final_polls holds the last %d days before each "
        "election, de-duplicated per date and pollster."
        % (datetime.date.today().isoformat(), IL_SEATS, SEAT_TOL, WINDOW_DAYS))
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(history, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


# ---------------------------------------------------------------- self-test

# The 2015 shape, reduced: a full-width year banner, a merged list under two
# headers, a three-column merged list, an impossible date, a below-threshold
# share, an exit poll, and a row that does not add up.
_FIXTURE = """{| class="wikitable"
! rowspan=2 |Date
! rowspan=2 |Poll
! Likud !! Labor &nbsp; !! Hatnuah !! Hadash !! UAL !! Balad !! Meretz !! Yachad !! Others !! Gov.
|-
! !! !! !! !! !! !! !! !!
|-
!colspan=20|2015
|-
|colspan=2| Final results || 30 || colspan=2 | 24 || colspan=3 | 13 || 53 || 0 || 0 || 61
|-
| 15 Mar || Midgam/Channel 2 || 30 || colspan=2 | 25 || colspan=3 | 13 || 52 || 0 || 0 || 60
|-
| 14 Mar || Smith/Maariv || 30 || colspan=2 | 24 || colspan=3 | 13 || 53 || (2.1%) || 0 || 59
|-
| 17 Mar || Channel 1 exit poll || 28 || colspan=2 | 27 || colspan=3 | 13 || 52 || 0 || 0 || 58
|-
| 13 Mar || Shortfall/X || 10 || colspan=2 | 10 || colspan=3 | 10 || 10 || 0 || 0 || 30
|-
| 29 Feb || Impossible/X || 30 || colspan=2 | 24 || colspan=3 | 13 || 53 || 0 || 0 || 61
|}
"""


def _self_test():
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    window, stats = polls_from_wikitext(_FIXTURE, 2015, "2015-03-17", window_days=14)
    by_firm = {p["pollster"]: p for p in window}

    # 1. The year banner must not become the column headers. Before the fix in
    #    parse_tables, all 17 columns of the real article read "2015".
    check("banner is not a header", [p["pollster"] for p in window],
          ["Smith", "Midgam", "Channel 1 exit poll"])

    # 2. A merged list spanning two headers is ONE list at its own seat count,
    #    not the same number counted twice.
    mid = by_firm.get("Midgam", {})
    check("merged pair counted once", mid.get("seats", {}).get("Labor + Hatnuah"), 25)
    check("merged triple counted once", mid.get("seats", {}).get("Hadash + UAL + Balad"), 13)
    check("merged columns recorded", mid.get("merged_columns"),
          ["Labor + Hatnuah", "Hadash + UAL + Balad"])

    # 3. The row totals 120 only because the spans are counted once.
    check("row totals 120", mid.get("sums_to"), 120)

    # 4. Bloc totals and Others are not parties. Reading "Gov." as one is the
    #    September 2026 fault this whole thread began with.
    check("Gov. is not a party", "Gov." in mid.get("seats", {}), False)
    check("Others is not a party", "Others" in mid.get("seats", {}), False)

    # 5. The publisher is split off a combined firm cell.
    check("publisher split from firm", by_firm.get("Smith", {}).get("publisher"), "Maariv")

    # 6. A below-threshold share becomes 0 seats and keeps the percentage.
    check("below-threshold share kept", by_firm.get("Smith", {}).get("pct_below"),
          {"Yachad": 2.1})

    # 7. An exit poll is kept but TAGGED, so il_seat_sim's usable-poll filter
    #    drops it. Discarding it here would hide it from that filter instead.
    check("exit poll tagged, not dropped",
          by_firm.get("Channel 1 exit poll", {}).get("kind"), "exit_poll")
    check("ordinary poll tagged pre_election", mid.get("kind"), "pre_election")
    # A row that does not total 120 is rejected rather than rescaled.
    check("short row rejected", stats["sum_rejected"], 1)

    # 8. An impossible upstream date is reported, not repaired.
    check("impossible date reported", stats["bad_dates"], [("29 Feb", "2015-02-29")])

    # 9. parse_tables' default path must be untouched by keep_spans.
    plain = [cols for cols, _ in F.parse_tables(_FIXTURE)]
    spanned = [cols for cols, _ in F.parse_tables(_FIXTURE, keep_spans=True)]
    check("keep_spans does not change headers", plain, spanned)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("fetch_il_history self-test OK (%d cases)" % 13)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true",
                    help="run the offline decision-logic tests and exit")
    ap.add_argument("--write", action="store_true",
                    help="replace final_polls in polls-il.json (default: dry run)")
    ap.add_argument("--window-days", type=int, default=WINDOW_DAYS)
    args = ap.parse_args()

    if args.self_test:
        return _self_test()

    # The self-test gates every live run, per the repo rule.
    if _self_test() != 0:
        return 1

    history = json.load(open(HISTORY_PATH, encoding="utf-8"))
    built = build(window_days=args.window_days)
    report(built, history)
    if args.write:
        write(built, history)
        print("\nWROTE %s" % os.path.relpath(HISTORY_PATH))
    else:
        print("\nDry run: nothing written. Re-run with --write to replace the rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
