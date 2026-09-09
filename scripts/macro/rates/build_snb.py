"""Builds public/data/business/economy/rates/snb.json (Swiss National Bank).

Spine: the SNB's own daily official discount rate series (table 1.1 of its
"Historical time series: Interest rates and yields" publication), every
change from 1907-06-20 (the discount rate's first published daily value;
the SNB itself opened for business in 1907) through 1999-12-30, the end of
the discount-rate regime before the SNB moved to targeting the three-month
Libor in January 2000. From 2000-01-01 the SNB's own operating target
(Libor target range 2000-2019, SNB policy rate since 2019) is taken from
BIS daily Switzerland levels, so coverage.spine is "mixed".
"""

import argparse
import json
import os

import common as c

CODE = "snb"
FOUNDED = "1907-06-20"
SPLICE_DATE = "2000-01-01"


def load_snb_discount():
    rows = c.scratch_or_published("snb_discount_daily.json", CODE, end=SPLICE_DATE)
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    own_rows = load_snb_discount()
    last_own_date = own_rows[-1]["date"]

    bis_rows, _compilation = c.load_bis_daily("CH")
    tail_rows = [r for r in bis_rows if r["date"] >= SPLICE_DATE and r["date"] <= c.BUILT_DATE]

    changes = c.derive_changes_from_daily(own_rows, instrument="Discount rate")
    changes.append(c.instrument_break_row(
        SPLICE_DATE,
        "The SNB retired the discount rate on 1999-12-30 and began "
        "targeting the three-month Libor on 2000-01-01; the level from "
        "here is BIS Switzerland daily (Libor target midpoint to 2019, "
        "SNB policy rate from 2019).",
        instrument="SNB operating target (BIS-derived)",
    ))
    seeded = [{"date": last_own_date, "level": own_rows[-1]["level"]}] + tail_rows
    tail_changes = c.derive_changes_from_daily(seeded, instrument="SNB operating target (BIS-derived)")
    tail_changes = [tc for tc in tail_changes if tc["date"] != last_own_date]
    changes.extend(tail_changes)

    instruments = [
        {"from": FOUNDED, "to": "1999-12-30", "name": "Discount rate"},
        {"from": SPLICE_DATE, "to": None, "name": "SNB operating target (BIS-derived)"},
    ]

    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=SPLICE_DATE)

    coverage = {
        "spine": "mixed",
        "note": (
            "Own daily discount-rate change table from the SNB's Historical "
            "time series publication, 1907-06-20 to 1999-12-30. From "
            "2000-01-01, when the SNB retired the discount rate for a Libor "
            "target (later the SNB policy rate), the level is BIS "
            "Switzerland daily; every level day there is treated as a "
            "change day. BIS Switzerland daily agrees on {} of {} "
            "overlapping change dates checked from the splice ({:.1%} "
            "disagreement, necessarily 0 since the tail is BIS-derived)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Swiss National Bank, Historical time series 4 (interest rates and yields), table 1.1",
            "url": "https://www.snb.ch/dam/jcr:7d42dd04-945c-4e40-8e40-1fd20d372e3f/histz_rd.n.xls",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Switzerland",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Swiss National Bank", short="SNB", country="Switzerland",
        iso2="CH", currency="CHF", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    own_rows = load_snb_discount()
    assert own_rows[0]["date"] == "1907-06-20"
    assert own_rows[0]["level"] == 4.5
    if os.path.exists(os.path.join(c.SCRATCH, "snb_discount_daily.json")):
        assert own_rows[-1]["date"] == "1999-12-30"
        assert len(own_rows) > 20000, "expected the full daily series, found {}".format(len(own_rows))
    else:
        assert own_rows[-1]["date"] < SPLICE_DATE and len(own_rows) > 50, len(own_rows)

    print("build_snb self-test OK")


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
