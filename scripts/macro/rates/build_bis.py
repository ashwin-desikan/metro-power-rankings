"""Builds public/data/business/economy/rates/bis-<iso2>.json for every BIS
CBPOL economy (49 of them, all daily FREQ=D rows in WS_CBPOL_csv_flat.csv).

spine is always "bis": every day the level differs from the previous day is
a change day, derived straight from the daily series with
derive_changes_from_daily. Where the COMPILATION column's free text parses
into dated instrument eras ("From D Mon YYYY onwards: X; from ... to ...:
Y"), those eras are attached; where it doesn't parse (a handful of one-line
descriptions with no dates, or scraps this parser can't read), the whole
series gets a single undated instrument named from the COMPILATION text
itself, noted in coverage.

GB, US and XM are written too, for completeness, even though the site
publishes boe/fed/ecb as those countries' own spine.
"""

import argparse

import common as c

CODE_FOR_ISO2_OVERRIDE = {}  # BIS_CODE_OVERRIDES in common.py covers XM


def build_one(iso2, write=True, daily_rows=None, compilation=None):
    if daily_rows is None:
        daily_rows, compilation = c.load_bis_daily(iso2)
    if not daily_rows:
        raise RuntimeError("{}: no BIS daily rows found".format(iso2))

    eras = c.parse_instrument_eras(compilation)

    if eras:
        instruments = [
            {"from": e["from"], "to": e["to"], "name": e["name"]}
            for e in eras
        ]
        # defensive clamp: make sure the parsed eras actually span every row
        # in the daily series, even where a segment of the COMPILATION text
        # didn't parse into a date at all -- an unclamped gap would crash
        # write_bank's era lookup instead of just losing a label.
        if instruments[0]["from"] is None or instruments[0]["from"] > daily_rows[0]["date"]:
            instruments[0]["from"] = daily_rows[0]["date"]
        if instruments[-1]["to"] is not None and instruments[-1]["to"] < daily_rows[-1]["date"]:
            instruments[-1]["to"] = None
        # close any gap between consecutive eras (a middle COMPILATION
        # segment that failed to parse a date would otherwise leave a hole
        # no row can land in): extend the earlier era's 'to' up to the day
        # before the next era's 'from'.
        for i in range(len(instruments) - 1):
            import datetime as _dt
            nxt_from = instruments[i + 1]["from"]
            cur_to = instruments[i]["to"]
            if nxt_from and cur_to:
                gap_day = (_dt.date.fromisoformat(cur_to) + _dt.timedelta(days=1)).isoformat()
                if gap_day < nxt_from:
                    instruments[i]["to"] = (_dt.date.fromisoformat(nxt_from) - _dt.timedelta(days=1)).isoformat()
        fallback_name = eras[-1]["name"]
    else:
        fallback_name = (compilation or "Policy rate").strip().rstrip(".") or "Policy rate"
        instruments = [{"from": daily_rows[0]["date"], "to": None, "name": fallback_name}]

    tagged_rows = []
    for r in daily_rows:
        name = c.instrument_name_for_date(eras, r["date"], fallback_name) if eras else fallback_name
        tagged_rows.append({"date": r["date"], "level": r["level"], "instrument": name})

    changes = c.derive_changes_from_daily(tagged_rows)

    # insert break rows wherever the tagged instrument name actually changes
    # between two consecutive emitted changes (own eras already know where
    # those boundaries are; this catches them without a second daily pass)
    out = []
    prev_instrument = None
    for row in changes:
        if prev_instrument is not None and row["instrument"] != prev_instrument:
            out.append(c.instrument_break_row(
                row["date"],
                "Instrument switched from {} to {}, per BIS's own era text.".format(
                    prev_instrument, row["instrument"]),
                instrument=row["instrument"],
            ))
            row = dict(row, change=None)
        out.append(row)
        prev_instrument = row["instrument"]
    changes = out

    code = c.bis_code_for(iso2)
    name = c.bis_name_for(iso2)
    currency = c.CURRENCY_BY_ISO2.get(iso2, "")

    note = (
        "Derived entirely from BIS daily policy-rate levels (WS_CBPOL); every "
        "day the level differs from the prior day is a change day. "
        + (
            "Instrument eras parsed from the BIS COMPILATION field ({} era(s))."
            .format(len(eras))
            if eras else
            "The BIS COMPILATION text did not parse into dated eras, so the "
            "whole run is tagged with a single instrument name taken from "
            "that text."
        )
    )
    c.assert_no_em_dash(note)

    coverage = {"spine": "bis", "note": note}
    sources = [
        {
            "label": "BIS central bank policy rates (CBPOL), {}".format(name),
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    if not write:
        return changes, instruments, coverage

    out_dir = c.OUT_DIR
    path = c.write_bank(
        code=code, name=name, short=name, country=c.BIS_ECONOMIES[iso2],
        iso2=iso2, currency=currency, founded=None,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
        out_dir=out_dir,
    )
    return path, changes


def build_all(codes=None):
    codes = codes or sorted(c.BIS_ECONOMIES)
    all_data = c.load_bis_daily_all(codes)
    written = []
    for iso2 in codes:
        rows, compilation = all_data.get(iso2, ([], ""))
        path, changes = build_one(iso2, daily_rows=rows, compilation=compilation)
        real = [x for x in changes if not x.get("break")]
        written.append((iso2, path, len(real), real[0]["date"], real[-1]["date"]))
    return written


def self_test():
    # a level that repeats must not emit a change (shared logic, re-verified
    # here against a synthetic tagged-row input like build_one produces)
    rows = [
        {"date": "2000-01-01", "level": 5.0, "instrument": "X"},
        {"date": "2000-01-02", "level": 5.0, "instrument": "X"},
        {"date": "2000-01-03", "level": 5.25, "instrument": "X"},
    ]
    ch = c.derive_changes_from_daily(rows)
    assert len(ch) == 2

    # instrument break: AU has a single era text with no dated break in the
    # window we test, so use a synthetic multi-era case that mirrors GB
    text = ("From 3 Aug 2006 onwards: official bank rate; from 6 May 1997 to "
            "2 Aug 2006: repo rate; from 20 Aug 1981 to 5 May 1997: minimum "
            "Bank of England Band 1 dealing rate.")
    eras = c.parse_instrument_eras(text)
    assert len(eras) == 3
    assert c.instrument_name_for_date(eras, "1999-01-01", "fallback") == "repo rate"
    assert c.instrument_name_for_date(eras, "2010-01-01", "fallback") == "official bank rate"

    # a real BIS economy end to end, on a small one for speed
    changes, instruments, coverage = build_one("CO", write=False)  # Colombia: single-line text
    assert coverage["spine"] == "bis"
    assert len(changes) > 0

    print("build_bis self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--only", help="comma-separated iso2 codes to build (debug)")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    if args.only:
        codes = [x.strip().upper() for x in args.only.split(",")]
    else:
        codes = sorted(c.BIS_ECONOMIES)
    written = build_all(codes)
    total_changes = 0
    for iso2, path, n, first, last in written:
        total_changes += n
        print("{}: {} ({} changes, {} to {})".format(iso2, path, n, first, last))
    print("Wrote {} files, {} total changes".format(len(written), total_changes))


if __name__ == "__main__":
    main()
