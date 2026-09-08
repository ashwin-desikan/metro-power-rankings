"""Builds public/data/business/economy/rates/boc.json (Bank of Canada).

Spine: two of the Bank's own Valet series, spliced at 2009-04-21.
  - V122530 "Bank rate", monthly (first-of-month), 1935-01-01 onward. This
    is the Bank Rate throughout: the discount-window rate directly until
    1994-11, then set as the upper bound of the overnight rate operating
    band (== overnight rate target + 0.25) from 1994-11 to 2015, then equal
    to the overnight rate target itself from 2015-07-15.
  - V39079 "Target for the overnight rate" (business daily), exact change
    dates, 2009-04-21 onward.
Because V122530 is monthly, every change dated before 2009-04-21 is placed
on the first of its reporting month (the Bank does not publish the exact
day within that series); every change from 2009-04-21 has its exact date.
coverage.spine is "own" throughout (both series are the Bank's own Valet
data) but the note flags the monthly-vs-daily resolution seam honestly.
"""

import argparse
import csv
import os

import common as c

CODE = "boc"
FOUNDED = "1935-03-11"
SPLICE_DATE = "2009-04-21"

ERA_BOUNDARIES = [
    ("1935-01-01", "1994-11-30", "Bank Rate (discount rate)"),
    ("1994-12-01", "2015-07-14", "Bank Rate (overnight target + 25bp)"),
    ("2015-07-15", None, "Overnight rate target"),
]


def instrument_for(date_str):
    for start, end, name in ERA_BOUNDARIES:
        if date_str >= start and (end is None or date_str <= end):
            return name
    raise RuntimeError("no era covers {}".format(date_str))


def load_valet_csv(name, date_col="date"):
    path = os.path.join(c.SCRATCH, name)
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        lines = f.readlines()
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith('"date"'):
            start = i + 1
            break
    if start is None:
        raise RuntimeError("{}: no OBSERVATIONS header found".format(name))
    reader = csv.reader(lines[start:])
    for row in reader:
        if not row or not row[0].strip():
            continue
        d, v = row[0].strip('"'), row[1].strip('"')
        if not v:
            continue
        rows.append({"date": d, "level": float(v)})
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    monthly = load_valet_csv("boc_v122530.csv")
    monthly = [r for r in monthly if r["date"] < SPLICE_DATE]
    daily = load_valet_csv("boc_bankrate.csv")
    daily = [r for r in daily if r["date"] >= SPLICE_DATE]

    changes = []
    prev_era = None
    era_bucket = []

    def flush(bucket, era_name):
        if not bucket:
            return
        changes.extend(c.derive_changes_from_daily(bucket, instrument=era_name))

    combined = monthly + daily
    for r in combined:
        era = instrument_for(r["date"])
        if prev_era is not None and era != prev_era:
            flush(era_bucket, prev_era)
            era_bucket = []
            changes.append(c.instrument_break_row(
                r["date"],
                "Instrument switched from {} to {}.".format(prev_era, era),
                instrument=era,
            ))
        era_bucket.append(r)
        prev_era = era
    flush(era_bucket, prev_era)

    instruments = [{"from": s, "to": e, "name": n} for s, e, n in ERA_BOUNDARIES]

    bis_rows, _compilation = c.load_bis_daily("CA")
    # Only compare from the daily-resolution splice date: before it, our own
    # changes are dated to the first of the reporting month (V122530's own
    # resolution), so a mid-month BIS change date will legitimately not
    # match a first-of-month own date even though the level is correct --
    # that is a date-precision artifact, not a disagreement about the rate.
    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=SPLICE_DATE)

    coverage = {
        "spine": "own",
        "note": (
            "Own history from two Bank of Canada Valet series: 'Bank rate' "
            "(V122530), monthly first-of-month values, 1935-01-01 to "
            "2009-04-20 (the exact day of a change within that month is not "
            "published in this series, so each early change is dated to the "
            "first of its reporting month); then 'Target for the overnight "
            "rate' (V39079), exact daily change dates, 2009-04-21 onward. "
            "The Bank Rate was the discount rate directly until Nov 1994, "
            "then the upper bound of the overnight operating band (target "
            "+25bp) until 2015-07-15, then equal to the target itself. BIS "
            "Canada daily is compared from 2009-04-21 (the daily-resolution "
            "splice; the monthly era's first-of-month dates are not exact "
            "change days, so an earlier comparison would flag date "
            "precision, not real disagreement) and agrees on {} of {} "
            "overlapping change dates checked ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Bank of Canada Valet, Bank rate (V122530), monthly",
            "url": "https://www.bankofcanada.ca/valet/observations/V122530/csv",
        },
        {
            "label": "Bank of Canada Valet, Target for the overnight rate (V39079), daily",
            "url": "https://www.bankofcanada.ca/valet/observations/V39079/csv",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Canada",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Bank of Canada", short="BoC", country="Canada",
        iso2="CA", currency="CAD", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    assert instrument_for("1994-11-30") == "Bank Rate (discount rate)"
    assert instrument_for("1994-12-01") == "Bank Rate (overnight target + 25bp)"
    assert instrument_for("2015-07-14") == "Bank Rate (overnight target + 25bp)"
    assert instrument_for("2015-07-15") == "Overnight rate target"

    monthly = load_valet_csv("boc_v122530.csv")
    assert monthly[0]["date"] == "1935-01-01"
    assert monthly[0]["level"] == 2.5

    daily = load_valet_csv("boc_bankrate.csv")
    assert daily[0]["date"] == "2009-04-21"

    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    print("build_boc self-test OK")


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
