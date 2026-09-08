"""Builds public/data/business/economy/rates/ecb.json (European Central Bank).

Spine: the deposit facility rate (DFR) -- the ECB's steering rate since
2024-09-18 and the rate that bound through the negative-rate years, so it is
what markets actually watched even while MRR was nominally "the" policy rate.
The main refinancing rate (MRR) is carried as a `secondary` list per the
build instructions.

Both source files are ECB Data Portal "date of changes" series (already one
row per change, but the raw CSV repeats the level daily-adjacent in the
scratch download; dedupe to change days only).
"""

import argparse
import csv
import os

import common as c

CODE = "ecb"
FOUNDED = "1998-06-01"


def load_ecb_series(filename):
    path = os.path.join(c.SCRATCH, filename)
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            val = r["OBS_VALUE"].strip()
            if not val or val.upper() == "NAN":
                continue
            rows.append({"date": r["TIME_PERIOD"].strip(), "level": float(val)})
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    dfr_rows = load_ecb_series("ecb_dfr.csv")
    mrr_rows = load_ecb_series("ecb_mrr.csv")

    changes = c.derive_changes_from_daily(dfr_rows, instrument="Deposit facility rate")
    secondary_changes = c.derive_changes_from_daily(mrr_rows, instrument="Main refinancing rate")

    instruments = [
        {"from": FOUNDED, "to": None, "name": "Deposit facility rate"},
    ]

    bis_rows, _compilation = c.load_bis_daily("XM")
    # BIS's XM series tracks MRR as the steering rate until 2024-09-18, when
    # the ECB itself made DFR the steering rate (BIS COMPILATION text: "From
    # 18 Sep 2024 onwards: official central bank steering rate is the
    # deposit facility rate"). Compare the DFR spine to BIS only from that
    # date; before it the two are different instruments by design, not a
    # parse error.
    dfr_bis_from = "2024-09-18"
    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=dfr_bis_from)
    mrr_bis_check = c.compare_to_bis(secondary_changes, bis_rows)

    coverage = {
        "spine": "own",
        "note": (
            "Deposit facility rate from the ECB Data Portal date-of-changes "
            "series (FM.D.U2.EUR.4F.KR.DFR.LEV), first change 1999-01-01; the "
            "main refinancing rate is carried alongside as a secondary series. "
            "BIS treated MRR, not DFR, as the euro area's steering rate until "
            "2024-09-18, so the DFR spine is cross-checked against BIS only "
            "from that date ({} of {} overlapping dates agree, {:.1%} "
            "disagreement); the MRR secondary series agrees with BIS on {} of "
            "{} overlapping dates across the full run ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
            mrr_bis_check["overlap"] - mrr_bis_check["disagree"], mrr_bis_check["overlap"],
            mrr_bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "ECB Data Portal, Deposit facility rate (FM.D.U2.EUR.4F.KR.DFR.LEV)",
            "url": "https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.DFR.LEV",
        },
        {
            "label": "ECB Data Portal, Main refinancing rate (FM.D.U2.EUR.4F.KR.MRR_FR.LEV)",
            "url": "https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.MRR_FR.LEV",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Euro area",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, secondary_changes, instruments, coverage

    real_changes = [x for x in changes if not x.get("break")]
    secondary_clean = [{k: v for k, v in row.items() if k != "instrument"} for row in secondary_changes]
    data_extra = {"secondary": {"name": "Main refinancing rate", "changes": secondary_clean}}

    # write_bank doesn't know about `secondary`, so build then patch it in.
    path = c.write_bank(
        code=CODE, name="European Central Bank", short="ECB", country="Euro area",
        iso2="XM", currency="EUR", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    import json
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data.update(data_extra)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path, changes, secondary_changes, bis_check


def self_test():
    # a level that repeats must not emit a change
    rows = [{"date": "1999-01-01", "level": 2.0}, {"date": "1999-01-02", "level": 2.0},
            {"date": "1999-01-04", "level": 2.75}]
    ch = c.derive_changes_from_daily(rows)
    assert len(ch) == 2 and ch[1]["change"] == 0.75

    dfr_rows = load_ecb_series("ecb_dfr.csv")
    assert dfr_rows[0]["date"] == "1999-01-01"
    changes = c.derive_changes_from_daily(dfr_rows, instrument="Deposit facility rate")
    assert changes[0]["change"] is None
    # first ECB change is 1999-01-04, DFR moves 2.0 -> 2.75 per the raw file
    assert changes[1]["date"] == "1999-01-04"

    print("build_ecb self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    path, changes, secondary_changes, bis_check = build()
    real = [x for x in changes if not x.get("break")]
    print("Wrote {}".format(path))
    print("  {} DFR changes, first {}, last {}; {} MRR changes".format(
        len(real), real[0]["date"], real[-1]["date"], len(secondary_changes)))
    print("  BIS disagreement: {:.1%} over {} overlapping dates".format(
        bis_check["rate"], bis_check["overlap"]))


if __name__ == "__main__":
    main()
