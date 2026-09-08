"""Builds public/data/business/economy/rates/rbnz.json (Reserve Bank of
New Zealand).

Spine: BIS New Zealand daily from 1999-03-17 (the OCR's introduction --
BIS's own era text confirms the switch to "Official cash rate" on that
exact date) to 2009-10-28; then the RBNZ's own OCR decision history
(rbnz.govt.nz/monetary-policy/monetary-policy-decisions), every decision
date and level, from 2009-10-29 onward. coverage.spine is "mixed": the
Bank's downloadable B2 wholesale-rates workbooks (both the current and the
1985-2017 historical file) returned "Website unavailable" on two separate
attempts, so the 1999-2009 window is BIS-derived rather than the Bank's
own table; no discount-rate table survives from before the OCR era either,
so founding-to-1999 is left uncovered rather than guessed.
"""

import argparse
import json
import os

import common as c

CODE = "rbnz"
FOUNDED = "1934-08-01"
OCR_START = "1999-03-17"
OWN_START = "2009-10-29"


def load_own():
    path = os.path.join(c.SCRATCH, "rbnz_ocr_own.json")
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    own_rows = load_own()

    bis_rows, _compilation = c.load_bis_daily("NZ")
    bis_span = [r for r in bis_rows if OCR_START <= r["date"] < OWN_START]

    changes = c.derive_changes_from_daily(bis_span, instrument="Official Cash Rate (BIS-derived)")
    changes.append(c.instrument_break_row(
        OWN_START,
        "From here every decision date is the RBNZ's own published OCR "
        "history (rbnz.govt.nz/monetary-policy/monetary-policy-decisions); "
        "before it, BIS New Zealand daily (the Bank's own B2 wholesale-"
        "rates workbooks were unreachable on two attempts).",
        instrument="Official Cash Rate",
    ))
    seeded = [{"date": bis_span[-1]["date"], "level": bis_span[-1]["level"]}] + own_rows
    own_changes = c.derive_changes_from_daily(seeded, instrument="Official Cash Rate")
    own_changes = [oc for oc in own_changes if oc["date"] != bis_span[-1]["date"]]
    changes.extend(own_changes)

    instruments = [
        {"from": OCR_START, "to": "2009-10-28", "name": "Official Cash Rate (BIS-derived)"},
        {"from": OWN_START, "to": None, "name": "Official Cash Rate"},
    ]

    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=OWN_START)

    coverage = {
        "spine": "mixed",
        "note": (
            "BIS New Zealand daily from 1999-03-17 (the OCR's introduction) "
            "to 2009-10-28, standing in for the RBNZ's own B2 wholesale-"
            "rates workbooks, which returned 'Website unavailable' on two "
            "separate download attempts. From 2009-10-29 every decision "
            "date and level is the RBNZ's own published OCR history. No "
            "rate table survives from before the OCR era, so founding "
            "(1934) to 1999 is left uncovered rather than guessed. BIS New "
            "Zealand daily agrees on {} of {} overlapping change dates "
            "checked from the own-data start ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Reserve Bank of New Zealand, past monetary policy decisions",
            "url": "https://www.rbnz.govt.nz/monetary-policy/monetary-policy-decisions",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), New Zealand",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Reserve Bank of New Zealand", short="RBNZ", country="New Zealand",
        iso2="NZ", currency="NZD", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    own = load_own()
    assert own[0]["date"] == "2009-10-29"
    assert own[0]["level"] == 2.5
    assert own[-1]["date"] > "2026-01-01"

    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    print("build_rbnz self-test OK")


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
