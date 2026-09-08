"""Builds public/data/business/economy/rates/rba.json (Reserve Bank of
Australia).

Spine: the RBA's own "Changes in Monetary Policy and Administered Rates"
(A2) table for the Cash Rate Target itself, 1990-01-23 onward (a band,
lower/upper stored per the contract's range-instrument rule, until
1990-08-02 when the RBA moved to a single-point target). Before 1990 the
cash rate was a market-determined interbank overnight rate, not an RBA
target -- per the task brief this is BIS-derived, from 1976-04-07 (the
earliest BIS Australia daily observation; the RBA itself dates to 1960 but
no daily series covers 1960-1976). coverage.spine is "mixed" throughout,
reflecting the different nature of the pre-1990 numbers, not just a data
gap.
"""

import argparse
import json
import os

import common as c

CODE = "rba"
FOUNDED = "1960-01-14"
SPLICE_DATE = "1990-01-23"
BAND_END = "1990-08-01"


def load_own():
    path = os.path.join(c.SCRATCH, "rba_a02_parsed.json")
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    own_rows = load_own()

    bis_rows, _compilation = c.load_bis_daily("AU")
    pre_rows = [r for r in bis_rows if r["date"] < SPLICE_DATE]

    changes = []
    changes.extend(c.derive_changes_from_daily(pre_rows, instrument="Interbank overnight cash rate (BIS-derived, market rate)"))
    changes.append(c.instrument_break_row(
        SPLICE_DATE,
        "The RBA began announcing an explicit Cash Rate Target on "
        "1990-01-23 (initially as a band); before this the cash rate was "
        "market-determined, not an RBA target.",
        instrument="Cash Rate Target (band)",
    ))
    for r in own_rows:
        row = {
            "date": r["date"],
            "level": c.round4(r["level"]),
        }
        if "lower" in r:
            row["lower"] = c.round4(r["lower"])
            row["upper"] = c.round4(r["upper"])
        changes.append(row)
    # fill in 'change' for the own-table rows (band + single-point, treated
    # as one continuous change series since both are the RBA's own target)
    prev_level = None
    for row in changes:
        if row.get("break") or row["date"] < SPLICE_DATE:
            if not row.get("break"):
                prev_level = row["level"]
            continue
        row["change"] = None if prev_level is None else c.round4(row["level"] - prev_level)
        row["instrument"] = "Cash Rate Target (band)" if row["date"] <= BAND_END else "Cash Rate Target"
        prev_level = row["level"]

    instruments = [
        {"from": "1976-04-07", "to": "1990-01-22", "name": "Interbank overnight cash rate (BIS-derived, market rate)"},
        {"from": SPLICE_DATE, "to": BAND_END, "name": "Cash Rate Target (band)"},
        {"from": "1990-08-02", "to": None, "name": "Cash Rate Target"},
    ]

    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=None)

    coverage = {
        "spine": "mixed",
        "note": (
            "Own change table for the Cash Rate Target from the RBA's A2 "
            "release, 1990-01-23 onward (a band, lower/upper on each row, "
            "until 1990-08-02 when the RBA moved to a single-point target). "
            "Before 1990 the cash rate was a market-determined interbank "
            "overnight rate, not an RBA target, so this is BIS-derived from "
            "1976-04-07, the earliest BIS Australia daily observation; the "
            "RBA itself dates to 1960 but no daily series covers 1960-1976, "
            "left as a gap. BIS Australia daily agrees on {} of {} "
            "overlapping change dates checked ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "RBA, Changes in Monetary Policy and Administered Rates (A2)",
            "url": "https://www.rba.gov.au/statistics/tables/xls/a02hist.xlsx",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Australia",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Reserve Bank of Australia", short="RBA", country="Australia",
        iso2="AU", currency="AUD", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    own = load_own()
    assert own[0]["date"] == "1990-01-23"
    assert own[0]["lower"] == 17.0 and own[0]["upper"] == 17.5
    assert own[3]["date"] == "1990-08-02"
    assert "lower" not in own[3]

    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    print("build_rba self-test OK")


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
