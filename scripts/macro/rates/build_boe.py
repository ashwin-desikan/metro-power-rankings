"""Builds public/data/business/economy/rates/boe.json (Bank of England).

Spine: the datahub interest-rates-gb change table (boe.csv), which runs
1694-10-01 to 2025-05-08 without a gap across the 1981-1997 band/base-rate
years. The datahub file lags the Bank's current publication schedule, so the
tail from 2025-05-08 to the build date is filled from BIS GB daily levels
(coverage.spine becomes "mixed").

Instrument eras (own history, matches the BIS COMPILATION text for GB):
  Bank Rate                 1694-10-01 to 1972-10-12
  Minimum Lending Rate       1972-10-13 to 1981-08-19
  Band 1 dealing rate        1981-08-20 to 1997-05-05
  Repo rate                  1997-05-06 to 2006-08-02
  Bank Rate                  2006-08-03 to present
"""

import argparse
import csv
import os
import sys

import common as c

CODE = "boe"
FOUNDED = "1694-07-27"

ERA_BOUNDARIES = [
    ("1694-10-01", "1972-10-12", "Bank Rate"),
    ("1972-10-13", "1981-08-19", "Minimum Lending Rate"),
    ("1981-08-20", "1997-05-05", "Band 1 dealing rate"),
    ("1997-05-06", "2006-08-02", "Repo rate"),
    ("2006-08-03", None, "Bank Rate"),
]


def instrument_for(date_str):
    for start, end, name in ERA_BOUNDARIES:
        if date_str >= start and (end is None or date_str <= end):
            return name
    raise RuntimeError("no era covers {}".format(date_str))


def load_boe_csv():
    path = os.path.join(c.SCRATCH, "boe.csv")
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({"date": r["date"].strip(), "level": float(r["rate"])})
    rows.sort(key=lambda r: r["date"])
    return rows


def build_instruments():
    instruments = []
    for start, end, name in ERA_BOUNDARIES:
        instruments.append({"from": start, "to": end, "name": name})
    return instruments


def build(write=True):
    own_rows = load_boe_csv()
    last_own_date = own_rows[-1]["date"]

    bis_rows, _compilation = c.load_bis_daily("GB")
    tail_rows = [r for r in bis_rows if r["date"] > last_own_date and r["date"] <= c.BUILT_DATE]

    changes = []
    # Own history: one era at a time so each era's first row gets change=null
    # right after a break, never bleeding a "change" across an instrument
    # switch.
    prev_era = None
    era_bucket = []

    def flush(bucket, era_name):
        if not bucket:
            return
        changes.extend(c.derive_changes_from_daily(bucket, instrument=era_name))

    for r in own_rows:
        era = instrument_for(r["date"])
        if prev_era is not None and era != prev_era:
            flush(era_bucket, prev_era)
            era_bucket = []
            boundary_date = r["date"]
            changes.append(c.instrument_break_row(
                boundary_date,
                "Instrument switched from {} to {}.".format(prev_era, era),
                instrument=era,
            ))
        era_bucket.append(r)
        prev_era = era
    flush(era_bucket, prev_era)

    # Tail from BIS, still "Bank Rate" (no era boundary crossed: tail starts
    # 2025-05-09, well inside the 2006-08-03-to-present Bank Rate era).
    if tail_rows:
        last_level = changes[-1]["level"] if changes and not changes[-1].get("break") else None
        tail_bucket = [{"date": r["date"], "level": r["level"]} for r in tail_rows]
        # seed with the last own level so a repeat doesn't get re-emitted and
        # the first genuine tail change still gets a real 'change' value
        seeded = [{"date": last_own_date, "level": own_rows[-1]["level"]}] + tail_bucket
        tail_changes = c.derive_changes_from_daily(seeded, instrument="Bank Rate")
        # drop the seed row itself (already published above)
        tail_changes = [tc for tc in tail_changes if tc["date"] != last_own_date]
        changes.extend(tail_changes)

    instruments = build_instruments()

    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date="1946-01-01")

    coverage = {
        "spine": "mixed" if tail_rows else "own",
        "note": (
            "Own change table (datahub interest-rates-gb) from 1694-10-01 to "
            "{}; BIS United Kingdom daily fills {} to the build date because "
            "the datahub file lags the Bank's current publication schedule. "
            "BIS daily from 1946 agrees on {} of {} overlapping change dates "
            "checked ({:.1%} disagreement)."
        ).format(
            last_own_date, last_own_date if not tail_rows else tail_rows[0]["date"],
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Bank of England Bank Rate history (datahub interest-rates-gb)",
            "url": "https://datahub.io/core/interest-rates-gb",
            "licence": "PDDL via datahub",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), United Kingdom",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Bank of England", short="BoE", country="United Kingdom",
        iso2="GB", currency="GBP", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    # a level that repeats must not emit a change
    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    # instrument boundary lookups match the published eras
    assert instrument_for("1972-10-12") == "Bank Rate"
    assert instrument_for("1972-10-13") == "Minimum Lending Rate"
    assert instrument_for("1981-08-19") == "Minimum Lending Rate"
    assert instrument_for("1981-08-20") == "Band 1 dealing rate"
    assert instrument_for("2006-08-03") == "Bank Rate"

    # the real boe.csv has no gap across 1981-1997 (127 rows in that window)
    own_rows = load_boe_csv()
    span = [r for r in own_rows if "1981-08-20" <= r["date"] <= "1997-05-05"]
    assert len(span) > 50, "expected a dense 1981-1997 span, found {}".format(len(span))

    print("build_boe self-test OK")


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
