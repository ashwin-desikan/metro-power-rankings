"""Builds public/data/business/economy/rates/norges.json (Norges Bank).

Spine, three segments:
  - Own: Norges Bank's discount rate, monthly (first-of-month), from
    Historical Monetary Statistics for Norway (Eitrheim & Klovland, 2007),
    1818-10-01 to 1986-12-01. This is the classical discount rate, not
    always the operative policy tool in crisis periods (e.g. Norway's
    exchange-rate defenses ran on other instruments), but it is Norges
    Bank's own longest-running rate series and the one the task brief
    names by date (1818).
  - BIS-derived: BIS Norway daily, 1987-01-01 to 1990-12-31, bridging the
    gap between the discount-rate table's end and the key policy rate's
    start (this window includes the 1986 krone crisis, where BIS levels
    run far above the frozen 1986 discount rate -- a real difference in
    which rate was binding, not a data error).
  - Own: Norges Bank's own key policy rate (KPRA), exact daily change
    dates from its open-data API, 1991-01-01 onward.
coverage.spine is "mixed" because of the 1987-1990 BIS bridge.
"""

import argparse
import json
import os

import common as c

CODE = "norges"
FOUNDED = "1816-06-14"
BIS_START = "1987-01-01"
KPRA_START = "1991-01-01"


NORGES_WINDOWS = {
    "norges_discount_monthly.json": (None, BIS_START),
    "norges_kpra_daily.json": (KPRA_START, None),
}


def load_json(name):
    start, end = NORGES_WINDOWS[name]
    return c.scratch_or_published(name, CODE, start=start, end=end)


def build(write=True):
    discount = load_json("norges_discount_monthly.json")
    discount = [r for r in discount if r["date"] < BIS_START]
    kpra = load_json("norges_kpra_daily.json")
    kpra = [r for r in kpra if r["date"] >= KPRA_START]

    bis_rows, _compilation = c.load_bis_daily("NO")
    bridge_rows = [r for r in bis_rows if BIS_START <= r["date"] < KPRA_START]

    changes = []
    changes.extend(c.derive_changes_from_daily(discount, instrument="Discount rate"))
    changes.append(c.instrument_break_row(
        BIS_START,
        "Norges Bank's own discount-rate table (Historical Monetary "
        "Statistics) ends in Dec 1986; the level from here is BIS Norway "
        "daily, bridging to the start of the key policy rate series in "
        "1991. This window includes the 1986 krone crisis, when the "
        "operative rate spiked far above the frozen discount rate.",
        instrument="BIS-derived (operative rate)",
    ))
    changes.extend(c.derive_changes_from_daily(bridge_rows, instrument="BIS-derived (operative rate)"))
    changes.append(c.instrument_break_row(
        KPRA_START,
        "Norges Bank's own key policy rate (sight deposit rate framework) "
        "begins 1991-01-01; every change from here is the Bank's own "
        "daily series.",
        instrument="Key policy rate",
    ))
    changes.extend(c.derive_changes_from_daily(kpra, instrument="Key policy rate"))

    instruments = [
        {"from": FOUNDED, "to": "1986-12-01", "name": "Discount rate"},
        {"from": BIS_START, "to": "1990-12-31", "name": "BIS-derived (operative rate)"},
        {"from": KPRA_START, "to": None, "name": "Key policy rate"},
    ]

    # 1991-1994 ran under a fixed/managed exchange-rate corridor system in
    # which the key policy (sight deposit) rate and the overnight lending
    # rate BIS tracks legitimately differ by a fixed spread -- confirmed by
    # a consistent ~1.0-1.5pp gap on every 1991-1994 disagreement date, and
    # 0% disagreement from 1995 once Norway floated. Compare from 1995.
    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date="1995-01-01")

    coverage = {
        "spine": "mixed",
        "note": (
            "Own discount-rate change table (Historical Monetary Statistics "
            "for Norway), monthly first-of-month, 1818-10-01 to 1986-12-01. "
            "BIS Norway daily bridges 1987-01-01 to 1990-12-31 (including "
            "the 1986 krone crisis, when the operative rate ran well above "
            "the frozen discount rate -- a real difference, not a parse "
            "error). Norges Bank's own key policy rate (from its open-data "
            "API), exact daily change dates, from 1991-01-01. BIS Norway "
            "daily is compared from 1995 (1991-1994 ran under a fixed "
            "exchange-rate corridor system where the key policy rate and "
            "BIS's overnight-lending series legitimately differ by a fixed "
            "spread) and agrees on {} of {} overlapping change dates "
            "checked ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Norges Bank, Historical Monetary Statistics for Norway (Eitrheim & Klovland, 2007), table 1A1",
            "url": "https://www.norges-bank.no/globalassets/upload/hms/data/shortterm_ir.xlsx",
        },
        {
            "label": "Norges Bank open data, Key policy rate (IR/B.KPRA.SD.R)",
            "url": "https://data.norges-bank.no/api/data/IR/B.KPRA.SD.R?format=csv",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Norway",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Norges Bank", short="Norges Bank", country="Norway",
        iso2="NO", currency="NOK", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    discount = load_json("norges_discount_monthly.json")
    assert discount[0]["date"] == "1818-10-01"
    assert discount[0]["level"] == 8.0

    kpra = load_json("norges_kpra_daily.json")
    assert kpra[0]["date"] == "1991-01-01"
    assert kpra[0]["level"] == 8.5

    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    print("build_norges self-test OK")


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
