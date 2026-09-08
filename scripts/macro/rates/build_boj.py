"""Builds public/data/business/economy/rates/boj.json (Bank of Japan).

Spine: the BOJ's own official/basic discount rate tables while the discount
rate was the operative policy tool (1882-10-11 to 1995-09-08), then BIS
Japan daily from 1995-09-09 (the uncollateralized overnight call rate
target, later the BOJ policy rate under QQE/YCC) because after the 1995
easing cycle the discount rate stopped moving with monetary policy -- the
Bank's own "Basic Discount Rate and Basic Loan Rate" table (still
published, see sources) is a penalty rate on standing-facility lending and
diverges from the real policy stance from 2001 onward, so it is not a
faithful policy-rate spine after the splice. coverage.spine is "mixed".

Two windows in the own-table era have no published discount-rate change:
1936-04-08 to 1955-08-09 (the BOJ's own release explicitly defers to an
"explanatory note" it does not publish in this table for 1938-1941, and
the wartime/occupation-era rate mechanism is not comparable to a market
discount rate) and 1968-08-08 to 1969-08-31 (a gap between two of the
Bank's own release tables). Both are left as genuine gaps, not filled with
BIS -- checking, BIS Japan in that era does not track the discount rate
either (it disagrees with the Bank's own values on dates either side of
each gap), so bridging would risk publishing a level the Bank itself never
set.
"""

import argparse
import json
import os

import common as c

CODE = "boj"
FOUNDED = "1882-10-10"
SPLICE_DATE = "1995-09-09"

ERA_BOUNDARIES = [
    ("1882-10-11", "1936-04-07", "Official discount rate"),
    ("1955-08-10", "1968-08-07", "Official discount rate"),
    ("1969-09-01", "1995-09-08", "Official discount rate"),
    (SPLICE_DATE, None, "Call rate target / policy rate (BIS-derived)"),
]


def load_json(name):
    path = os.path.join(c.SCRATCH, name)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build(write=True):
    early = load_json("boj_early_parsed.json")
    c40 = load_json("boj_cdab0040_parsed.json")
    c50 = load_json("boj_cdab0050_parsed.json")
    c100 = load_json("boj_cdab0100_parsed.json")

    changes = []
    changes.extend(c.derive_changes_from_daily(sorted(early, key=lambda r: r["date"]),
                                                instrument="Official discount rate"))
    changes.append(c.instrument_break_row(
        "1955-08-10",
        "Gap in the Bank's own published discount-rate table, 1936-04-08 "
        "to 1955-08-09 (wartime and occupation-era rates are not published "
        "in this series); resumes here from the Bank's own postwar table.",
        instrument="Official discount rate",
    ))
    changes.extend(c.derive_changes_from_daily(sorted(c40, key=lambda r: r["date"]),
                                                instrument="Official discount rate"))
    changes.append(c.instrument_break_row(
        "1969-09-01",
        "Gap between two of the Bank's own release tables, 1968-08-08 to "
        "1969-08-31 (not published in either).",
        instrument="Official discount rate",
    ))
    combined_69_95 = sorted(c50, key=lambda r: r["date"]) + sorted(c100, key=lambda r: r["date"])
    changes.extend(c.derive_changes_from_daily(combined_69_95, instrument="Official discount rate"))

    bis_rows, _compilation = c.load_bis_daily("JP")
    tail_rows = [r for r in bis_rows if r["date"] >= SPLICE_DATE and r["date"] <= c.BUILT_DATE]
    changes.append(c.instrument_break_row(
        SPLICE_DATE,
        "The discount rate stopped moving with monetary policy after the "
        "1995 easing cycle; from here the level is BIS Japan daily "
        "(uncollateralized overnight call rate target, later the BOJ "
        "policy rate under QQE/YCC).",
        instrument="Call rate target / policy rate (BIS-derived)",
    ))
    seeded = [{"date": "1995-09-08", "level": 0.5}] + tail_rows
    tail_changes = c.derive_changes_from_daily(seeded, instrument="Call rate target / policy rate (BIS-derived)")
    tail_changes = [tc for tc in tail_changes if tc["date"] != "1995-09-08"]
    changes.extend(tail_changes)

    instruments = [{"from": s, "to": e, "name": n} for s, e, n in ERA_BOUNDARIES]

    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date=SPLICE_DATE)

    coverage = {
        "spine": "mixed",
        "note": (
            "Own official/basic discount rate change tables from the "
            "Bank's own releases, 1882-10-11 to 1995-09-08 (with two "
            "undocumented gaps: 1936-04-08 to 1955-08-09, and 1968-08-08 to "
            "1969-08-31, neither bridged by BIS since BIS Japan does not "
            "track the discount rate in those windows either). From "
            "1995-09-09, once the discount rate stopped moving with "
            "monetary policy, the level is BIS Japan daily (the "
            "uncollateralized overnight call rate target, later the BOJ "
            "policy rate). BIS Japan daily agrees on {} of {} overlapping "
            "change dates checked from the splice ({:.1%} disagreement, "
            "necessarily 0 since the tail is BIS-derived)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Bank of Japan, Official Discount Rates 1882-1941 (IMES Historical Statistics)",
            "url": "https://www.imes.boj.or.jp/jp/historical/hstat/data/rates/rates1906_1941.csv",
        },
        {
            "label": "Bank of Japan, Official Discount Rates 1955-1995 (statistics release)",
            "url": "https://www.boj.or.jp/en/statistics/boj/other/discount/cdab0040.csv",
        },
        {
            "label": "Bank of Japan, Basic Discount Rate and Basic Loan Rate, 2001-present",
            "url": "https://www.boj.or.jp/en/statistics/boj/other/discount/cdab0101.csv",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Japan",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Bank of Japan", short="BoJ", country="Japan",
        iso2="JP", currency="JPY", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    early = load_json("boj_early_parsed.json")
    assert early[0]["date"] == "1882-10-11"
    assert early[0]["level"] == 10.22
    assert early[-1]["date"] == "1936-04-07"

    c40 = load_json("boj_cdab0040_parsed.json")
    assert c40[0]["date"] == "1955-08-10"
    assert c40[0]["level"] == 7.3

    c101 = load_json("boj_cdab0101_parsed.json")
    assert c101[0]["date"] == "2001-01-04"

    print("build_boj self-test OK")


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
