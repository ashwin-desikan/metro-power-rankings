"""Builds public/data/business/economy/rates/fed.json (Federal Reserve).

Three instrument eras:
  Discount rate                1914-11-16 to 1982-09-26 (the actual decision
                                instrument before the FOMC began targeting
                                fed funds; NOT the effective funds rate)
  Federal funds target rate    1982-09-27 to 2008-12-15 (single target,
                                FRED DFEDTAR)
  Federal funds target range   2008-12-16 to present (range instrument:
                                level is the midpoint, lower/upper the bounds,
                                FRED DFEDTARU/DFEDTARL)

The 1914-1934 discount rate is only available at monthly grain (FRED
M13009USM156NNBR, NBER monthly averages); 1934-09-27-1982 is exact dated
changes (FRED DISCOUNT). Both are checked in as constants in
fed_discount_history.py -- see that file's docstring for why (FRED does not
serve either as a fetchable machine CSV in this environment).
"""

import argparse
import csv
import os

import common as c
import fed_discount_history as hist

CODE = "fed"
FOUNDED = "1913-12-23"
FIRST_CHANGE = "1914-11-16"  # Reserve Banks opened for business
DISCOUNT_END = "1982-09-26"
TARGET_START = "1982-09-27"
RANGE_START = "2008-12-16"


def load_fred_csv(filename, value_col):
    path = os.path.join(c.SCRATCH, filename)
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            val = r[value_col].strip()
            if not val or val == ".":
                continue
            rows.append({"date": r["observation_date"].strip(), "level": float(val)})
    rows.sort(key=lambda r: r["date"])
    return rows


def build_discount_rows():
    """Monthly 1914-1934 (average-of-month proxy) then dated 1934-1982,
    stitched to a single ascending list. The monthly span's first date is
    forced to FIRST_CHANGE so first_change lines up with the Fed's actual
    opening rather than the 1st of a month with no real decision."""
    monthly = hist.monthly_rows()
    monthly[0] = dict(monthly[0], date=FIRST_CHANGE)
    dated = hist.dated_rows()
    return monthly + dated


def build_instruments():
    return [
        {"from": FIRST_CHANGE, "to": DISCOUNT_END, "name": "Discount rate"},
        {"from": TARGET_START, "to": "2008-12-15", "name": "Federal funds target rate"},
        {"from": RANGE_START, "to": None, "name": "Federal funds target range"},
    ]


def build(write=True):
    discount_rows = build_discount_rows()
    target_rows = load_fred_csv("dfedtar.csv", "DFEDTAR")
    upper_rows = {r["date"]: r["level"] for r in load_fred_csv("dfedtaru.csv", "DFEDTARU")}
    lower_rows = {r["date"]: r["level"] for r in load_fred_csv("dfedtarl.csv", "DFEDTARL")}

    range_rows = []
    for d in sorted(set(upper_rows) & set(lower_rows)):
        u, l = upper_rows[d], lower_rows[d]
        range_rows.append({"date": d, "level": (u + l) / 2.0, "lower": l, "upper": u})

    changes = []
    changes.extend(c.derive_changes_from_daily(discount_rows, instrument="Discount rate"))
    changes.append(c.instrument_break_row(
        TARGET_START,
        "Instrument switched from the discount rate to an FOMC federal funds "
        "target rate; the discount rate continued to be set but stopped "
        "being the Federal Reserve's decision instrument.",
        instrument="Federal funds target rate",
    ))
    changes.extend(c.derive_changes_from_daily(target_rows, instrument="Federal funds target rate"))
    changes.append(c.instrument_break_row(
        RANGE_START,
        "Instrument switched from a single federal funds target rate to a "
        "target range; level from here on is the range midpoint, with the "
        "bounds in lower/upper.",
        instrument="Federal funds target range",
    ))
    changes.extend(c.derive_changes_from_daily(range_rows, instrument="Federal funds target range"))

    instruments = build_instruments()

    bis_rows, _compilation = c.load_bis_daily("US")
    # BIS's US series is the effective fed funds rate (a market rate) before
    # 1985-12-19 -- explicitly not comparable to a decision instrument, per
    # the contract. Cross-check only from where BIS itself switches to "the
    # mid-point of the Federal Reserve target rate".
    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date="1985-12-19")

    coverage = {
        "spine": "own",
        "note": (
            "Discount rate is the decision instrument from 1914-11-16 "
            "(Reserve Banks opening) to 1982-09-26: monthly averages "
            "(FRED M13009USM156NNBR, NBER) from 1914-11 to 1934-01, exact "
            "dated changes (FRED DISCOUNT) from 1934-02-02; the 1914-1934 "
            "span is month granularity only, not exact decision dates. "
            "FOMC federal funds target rate (FRED DFEDTAR) from 1982-09-27, "
            "target range midpoint with lower/upper bounds (FRED "
            "DFEDTARU/DFEDTARL) from 2008-12-16. The effective funds rate "
            "is never published as the decision instrument for 1954-1982; "
            "BIS United States daily is a market rate, not this spine, "
            "before 1985-12-19, so the cross-check runs only from there: "
            "{} of {} overlapping change dates agree ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "FRED, Discount Rate Changes: Historical Dates of Changes and Rates (DISCOUNT)",
            "url": "https://fred.stlouisfed.org/series/DISCOUNT",
        },
        {
            "label": "FRED, Discount Rates, Federal Reserve Bank of New York (M13009USM156NNBR, NBER monthly)",
            "url": "https://fred.stlouisfed.org/series/M13009USM156NNBR",
        },
        {
            "label": "FRED, Federal Funds Target Rate (DFEDTAR)",
            "url": "https://fred.stlouisfed.org/series/DFEDTAR",
        },
        {
            "label": "FRED, Federal Funds Target Range - Upper/Lower Limit (DFEDTARU / DFEDTARL)",
            "url": "https://fred.stlouisfed.org/series/DFEDTARU",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), United States",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Federal Reserve", short="Fed", country="United States",
        iso2="US", currency="USD", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    # a level that repeats must not emit a change
    rows = [{"date": "1934-02-02", "level": 1.5}, {"date": "1934-03-01", "level": 1.5}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    # range midpoint
    rr = c.derive_changes_from_daily(
        [{"date": "2008-12-16", "level": 0.125, "lower": 0.0, "upper": 0.25}])
    assert rr[0]["level"] == 0.125 and rr[0]["lower"] == 0.0 and rr[0]["upper"] == 0.25

    # instrument break row present at the 1982 handoff
    changes, instruments, _coverage = build(write=False)
    breaks = [x for x in changes if x.get("break")]
    assert any(b["date"] == TARGET_START for b in breaks), "missing 1982 break"
    assert any(b["date"] == RANGE_START for b in breaks), "missing 2008 break"

    # the row right after a break carries change=null
    for i, row in enumerate(changes):
        if row.get("break"):
            nxt = changes[i + 1]
            assert nxt["change"] is None, "row after break must have change=null"

    # this must NOT be the effective funds rate for 1954-1982: check a known
    # discount-rate decision date lands at the discount-rate level, not the
    # market effective rate (e.g. 1973-08-14 discount rate change to 7.50)
    d = {x["date"]: x["level"] for x in changes if not x.get("break")}
    assert d.get("1973-08-14") == 7.50

    print("build_fed self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    path, changes, bis_check = build()
    real = [x for x in changes if not x.get("break")]
    print("Wrote {}".format(path))
    print("  {} changes, first {}, last {}".format(
        len(real), real[0]["date"], real[-1]["date"]))
    print("  BIS disagreement: {:.1%} over {} overlapping dates".format(
        bis_check["rate"], bis_check["overlap"]))


if __name__ == "__main__":
    main()
