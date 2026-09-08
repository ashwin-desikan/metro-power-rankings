"""Builds public/data/business/economy/rates/riksbank.json (Sveriges
Riksbank).

Spine: three of the Riksbank's own SWEA API series, spliced where each
took over as the operative key rate.
  - SECBDISCEFF "Discount rate", daily, 1907-11-11 to 1987-01-29 (the
    earliest date the SWEA API returns; the discount rate is documented
    back to the 1850s but no daily series survives in the API before
    1907-11-11).
  - SECBMARGEFF "Marginal rate", daily, 1987-01-30 to 1994-05-31 (the
    Riksbank's key rate from December 1985 to end-May 1994, per the
    Riksbank's own group description; the API's earliest observation is
    1987-01-30, so the discount rate above continues to cover the ~14
    months from Dec 1985 that the marginal-rate series itself does not).
  - SECBREPOEFF "Policy rate" (called the repo rate until 2022-06-08),
    daily, 1994-06-01 onward.
coverage.spine is "own" throughout.
"""

import argparse
import json
import os

import common as c

CODE = "riksbank"
FOUNDED = "1668-09-17"

DISC_END = "1987-01-29"
MARG_START = "1987-01-30"
MARG_END = "1994-05-31"
REPO_START = "1994-06-01"


def load_swea(name):
    path = os.path.join(c.SCRATCH, name)
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)
    out = [{"date": r["date"], "level": r["value"]} for r in rows]
    out.sort(key=lambda r: r["date"])
    return out


def build(write=True):
    disc = [r for r in load_swea("riksbank_disc.json") if r["date"] <= DISC_END]
    marg = load_swea("riksbank_marg.json")
    repo = load_swea("riksbank_repo.json")

    changes = c.derive_changes_from_daily(disc, instrument="Discount rate")
    changes.append(c.instrument_break_row(
        MARG_START,
        "The marginal rate was the Riksbank's key rate from Dec 1985 to "
        "May 1994; the SWEA API's marginal-rate series itself only starts "
        "1987-01-30, so the discount rate above stands in for the ~14 "
        "months before that.",
        instrument="Marginal rate",
    ))
    changes.extend(c.derive_changes_from_daily(marg, instrument="Marginal rate"))
    changes.append(c.instrument_break_row(
        REPO_START,
        "Repo rate (renamed policy rate on 2022-06-08) becomes the "
        "Riksbank's key rate.",
        instrument="Policy rate",
    ))
    changes.extend(c.derive_changes_from_daily(repo, instrument="Policy rate"))

    instruments = [
        {"from": "1907-11-11", "to": DISC_END, "name": "Discount rate"},
        {"from": MARG_START, "to": MARG_END, "name": "Marginal rate"},
        {"from": REPO_START, "to": None, "name": "Policy rate (repo rate until 2022-06-08)"},
    ]

    bis_rows, _compilation = c.load_bis_daily("SE")
    bis_check = c.check_bis_agreement(changes, bis_rows, CODE, from_date="1946-01-02")

    coverage = {
        "spine": "own",
        "note": (
            "Own daily change series from the Riksbank's SWEA API: "
            "discount rate 1907-11-11 to 1987-01-29 (the API's earliest "
            "date; the discount rate itself is documented back to the "
            "1850s but no daily series survives in the API before this), "
            "marginal rate 1987-01-30 to 1994-05-31 (the Riksbank's key "
            "rate from Dec 1985, per its own group description, though "
            "the API series itself starts 1987-01-30), and the policy "
            "rate (called the repo rate until 2022-06-08) from 1994-06-01. "
            "BIS Sweden daily agrees on {} of {} overlapping change dates "
            "checked from 1946 ({:.1%} disagreement)."
        ).format(
            bis_check["overlap"] - bis_check["disagree"], bis_check["overlap"],
            bis_check["rate"],
        ),
    }

    sources = [
        {
            "label": "Sveriges Riksbank, SWEA API, Discount rate (SECBDISCEFF)",
            "url": "https://api.riksbank.se/swea/v1/Observations/SECBDISCEFF/1907-01-01/2002-12-31",
        },
        {
            "label": "Sveriges Riksbank, SWEA API, Marginal rate (SECBMARGEFF)",
            "url": "https://api.riksbank.se/swea/v1/Observations/SECBMARGEFF/1985-01-01/1994-12-31",
        },
        {
            "label": "Sveriges Riksbank, SWEA API, Policy rate (SECBREPOEFF)",
            "url": "https://api.riksbank.se/swea/v1/Observations/SECBREPOEFF/1994-01-01/2026-09-08",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Sweden",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Sveriges Riksbank", short="Riksbank", country="Sweden",
        iso2="SE", currency="SEK", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    return path, changes, bis_check


def self_test():
    disc = load_swea("riksbank_disc.json")
    assert disc[0]["date"] == "1907-11-11"
    assert disc[0]["level"] == 6.5

    repo = load_swea("riksbank_repo.json")
    assert repo[0]["date"] == "1994-06-01"

    rows = [{"date": "2000-01-01", "level": 5.0}, {"date": "2000-02-01", "level": 5.0}]
    assert len(c.derive_changes_from_daily(rows)) == 1

    print("build_riksbank self-test OK")


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
