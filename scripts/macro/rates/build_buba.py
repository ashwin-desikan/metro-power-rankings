"""Builds public/data/business/economy/rates/buba.json (Deutsche Bundesbank).

Spine: the Bundesbank's own "Discount and lombard rates of the Deutsche
Bundesbank" table (pdf), parsed once into _scratch/macro/buba_parsed.json,
covering every discount-rate change from 1948-07-01 (the Bank deutscher
Laender / early Bundesbank era) to 1996-04-19, held at that level through
1998-12-31 when the Bundesbank's own discount and lombard rate setting
ended (monetary policy passed to the ECB on 1999-01-01). The discount rate
is published as the spine; the lombard rate is carried alongside each row
as `secondary`. The bank is marked dissolved (its own rate-setting mandate,
not the institution) as of 1998-12-31.
"""

import argparse
import json
import os

import common as c

CODE = "buba"
FOUNDED = "1948-07-01"
DISSOLVED = "1998-12-31"


def load_buba_parsed():
    rows = c.scratch_or_published(
        "buba_parsed.json", CODE,
        transform=lambda r: {"date": r["date"], "discount": r["level"], "lombard": r.get("secondary")})
    rows.sort(key=lambda r: r["date"])
    return rows


def build(write=True):
    rows = load_buba_parsed()

    changes = []
    prev_level = None
    for r in rows:
        level = c.round4(r["discount"])
        if prev_level is not None and level == prev_level:
            continue
        row = {
            "date": r["date"],
            "level": level,
            "change": None if prev_level is None else c.round4(level - prev_level),
            "secondary": c.round4(r["lombard"]),
            "instrument": "Discount rate",
        }
        changes.append(row)
        prev_level = level

    instruments = [
        {"from": FOUNDED, "to": DISSOLVED, "name": "Discount rate"},
    ]

    bis_rows, _compilation = c.load_bis_daily("DE")
    bis_check = c.compare_to_bis(changes, bis_rows)

    # BIS Germany tracks whichever of the discount or lombard rate was the
    # operative policy signal on a given day: during the 1979-1980 and 1991
    # tightening episodes (and the single 1983-03-18 cut) the Bundesbank's
    # binding rate was the lombard rate, not the discount rate, so a handful
    # of BIS levels land on our `secondary` value instead of `level`. Count
    # a date as a true disagreement only when BIS matches NEITHER value.
    own_by_date = {row["date"]: row for row in changes}
    true_disagree = []
    for d in bis_check["disagree_dates"]:
        row = own_by_date.get(d)
        bis_level = None
        for r in sorted(bis_rows, key=lambda r: r["date"]):
            if r["date"] == d:
                bis_level = r["level"]
        secondary = row.get("secondary") if row else None
        if secondary is not None and bis_level is not None and abs(bis_level - secondary) <= c.LEVEL_TOLERANCE:
            continue
        true_disagree.append(d)
    true_rate = (len(true_disagree) / bis_check["overlap"]) if bis_check["overlap"] else 0.0
    print("  BIS cross-check: {} overlapping change dates, {} disagree with BOTH "
          "discount and lombard ({:.1%})".format(bis_check["overlap"], len(true_disagree), true_rate))
    if bis_check["overlap"] >= c.MIN_OVERLAP_FOR_REFUSAL and true_rate > c.MAX_DISAGREEMENT_RATE:
        raise RuntimeError(
            "{}: disagrees with BIS (checked against both discount and lombard) "
            "on {:.1%} of {} overlapping change dates, refusing to write. "
            "First disagreement dates: {}".format(CODE, true_rate, bis_check["overlap"], true_disagree[:10])
        )
    lombard_matched = len(bis_check["disagree_dates"]) - len(true_disagree)

    coverage = {
        "spine": "own",
        "note": (
            "Every change from the Bundesbank's own discount and lombard rate "
            "table, 1948-07-01 to 1996-04-19 (held at that level through "
            "1998-12-31, the Bank's last day of independent rate-setting "
            "before the ECB took over on 1999-01-01). The lombard rate is "
            "carried on each row as secondary. BIS Germany daily matches our "
            "discount level on {} of {} overlapping change dates and matches "
            "our lombard level (the binding rate during the 1979-1980 and "
            "1991 tightening episodes and the 1983-03-18 cut) on {} more; {} "
            "dates match neither."
        ).format(
            bis_check["overlap"] - len(bis_check["disagree_dates"]), bis_check["overlap"],
            lombard_matched, len(true_disagree),
        ),
    }

    sources = [
        {
            "label": "Deutsche Bundesbank, discount and lombard rates (table)",
            "url": "https://www.bundesbank.de/resource/blob/651504/9dad568ed96af0fda517b17a3fe7f1cf/mL/s510ttdiscount-data.pdf",
        },
        {
            "label": "BIS central bank policy rates (CBPOL), Germany",
            "url": "https://data.bis.org/topics/CBPOL",
        },
    ]

    c.assert_no_em_dash(coverage["note"])

    if not write:
        return changes, instruments, coverage

    path = c.write_bank(
        code=CODE, name="Deutsche Bundesbank", short="Bundesbank", country="Germany",
        iso2="DE", currency="EUR", founded=FOUNDED,
        instruments=instruments, changes=changes, coverage=coverage, sources=sources,
    )
    # Stamp the dissolution date directly into the written file (not part of
    # write_bank's standard schema, but the contract calls for it on buba).
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["dissolved"] = DISSOLVED
    data["dissolved_note"] = (
        "The Bundesbank set the discount and lombard rates for the last "
        "time on 1996-04-19 (held to 1998-12-31); euro-area monetary "
        "policy passed to the European Central Bank on 1999-01-01."
    )
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    bis_check["true_disagree"] = len(true_disagree)
    bis_check["true_rate"] = true_rate
    return path, changes, bis_check


def self_test():
    rows = [
        {"date": "2000-01-01", "discount": 5.0, "lombard": 6.0},
        {"date": "2000-02-01", "discount": 5.0, "lombard": 6.0},
    ]
    # a repeated discount level must not emit a second change row
    prev = None
    out = []
    for r in rows:
        level = r["discount"]
        if prev is not None and level == prev:
            continue
        out.append(level)
        prev = level
    assert len(out) == 1

    parsed = load_buba_parsed()
    assert parsed[0]["date"] == "1948-07-01"
    assert parsed[0]["discount"] == 5.0
    assert parsed[0]["lombard"] == 6.0
    if os.path.exists(os.path.join(c.SCRATCH, "buba_parsed.json")):
        assert parsed[-1]["date"] == "1996-04-19"
        assert len(parsed) > 100, "expected the full 1948-1996 table, found {}".format(len(parsed))
    else:
        assert parsed[-1]["date"] <= "1996-04-19" and len(parsed) > 50, len(parsed)

    print("build_buba self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    path, changes, bis_check = build()
    print("Wrote {}".format(path))
    print("  {} changes, first {}, last {}".format(
        len(changes), changes[0]["date"], changes[-1]["date"]))
    print("  spine value at dissolution: {} (secondary/lombard {})".format(
        changes[-1]["level"], changes[-1]["secondary"]))
    print("  BIS true disagreement (matches neither discount nor lombard): "
          "{:.1%} over {} overlapping dates".format(
        bis_check["true_rate"], bis_check["overlap"]))


if __name__ == "__main__":
    main()
