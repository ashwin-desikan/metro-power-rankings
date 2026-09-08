"""Builds public/data/business/economy/rates/index.json from every bank file
already written to that directory, per RATES-CONTRACT.md.
"""

import argparse
import glob
import json
import os

import common as c


def load_all_banks(out_dir=c.OUT_DIR):
    banks = []
    for path in sorted(glob.glob(os.path.join(out_dir, "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            banks.append(json.load(f))
    return banks


def build(write=True, out_dir=c.OUT_DIR):
    banks = load_all_banks(out_dir)
    if not banks:
        raise RuntimeError("no bank files found in {}".format(out_dir))
    entries = [c.compute_index_entry(b) for b in banks]
    entries.sort(key=lambda e: e["code"])
    index = {"built": c.BUILT_DATE, "banks": entries}
    if not write:
        return index
    path = os.path.join(out_dir, "index.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return path, index


def self_test():
    # direction_from_changes: cutting, hiking, hold, mixed
    cutting = [{"date": "2026-01-01", "change": -0.25}, {"date": "2026-02-01", "change": -0.5}]
    hiking = [{"date": "2026-01-01", "change": 0.25}]
    hold = [{"date": "2026-01-01", "change": None}]
    mixed = [{"date": "2026-01-01", "change": 0.25}, {"date": "2026-02-01", "change": -0.25}]
    assert c.direction_from_changes(cutting) == "cutting"
    assert c.direction_from_changes(hiking) == "hiking"
    assert c.direction_from_changes(hold) == "hold"
    assert c.direction_from_changes(mixed) == "mixed"

    # compute_index_entry on a synthetic all-policy bank
    bank = {
        "code": "test", "name": "Test Bank", "short": "TB", "iso2": "TT",
        "founded": "2000-01-01", "first_change": "2000-01-01",
        "last_change": "2026-08-01", "built": "2026-09-08",
        "coverage": {"spine": "own"},
        "instruments": [{"from": "2000-01-01", "to": None, "name": "X", "text": "X", "kind": "policy"}],
        "changes": [
            {"date": "2000-01-01", "level": 1.0, "change": None, "era": 0},
            {"date": "2025-09-01", "level": 1.25, "change": 0.25, "era": 0},
            {"date": "2026-08-01", "level": 1.0, "change": -0.25, "era": 0},
        ],
        "market": [],
    }
    entry = c.compute_index_entry(bank)
    assert entry["level"] == 1.0
    assert entry["changes"] == 3
    assert entry["changes_12m"] == 1  # only 2026-08-01 falls after the 2025-09-08 cutoff
    assert entry["hold_days"] == 38  # 2026-08-01 to 2026-09-08
    assert entry["direction_12m"] == "cutting"
    assert entry["series_from"] == "2000-01-01"
    assert entry["founded"] == "2000-01-01"

    # a bank whose latest era is market: direction_12m must be "market" and
    # level must come from the market summary, not a stale policy row
    market_bank = {
        "code": "mkt", "name": "Market Bank", "short": "MB", "iso2": "MM",
        "founded": None, "first_change": "2000-01-01",
        "last_change": "2020-06-01", "built": "2026-09-08",
        "coverage": {"spine": "bis"},
        "instruments": [
            {"from": "2000-01-01", "to": "2010-12-31", "name": "X", "text": "X", "kind": "policy"},
            {"from": "2011-01-01", "to": None, "name": "Y", "text": "Y", "kind": "market"},
        ],
        "changes": [{"date": "2005-01-01", "level": 3.0, "change": None, "era": 0}],
        "market": [{"era": 1, "from": "2011-01-01", "to": "2020-06-01",
                     "observations": 400, "first": 3.0, "last": 4.5, "min": 2.0, "max": 5.0}],
    }
    mentry = c.compute_index_entry(market_bank)
    assert mentry["direction_12m"] == "market"
    assert mentry["level"] == 4.5
    assert mentry["series_from"] == "2000-01-01"
    assert mentry["founded"] is None

    # an all-market bank with zero policy rows at all
    all_market_bank = dict(market_bank, changes=[])
    aentry = c.compute_index_entry(all_market_bank)
    assert aentry["changes"] == 0
    assert aentry["hold_days"] is None
    assert aentry["direction_12m"] == "market"
    assert aentry["level"] == 4.5

    print("build_index self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    path, index = build()
    print("Wrote {}".format(path))
    print("  {} banks".format(len(index["banks"])))
    for e in index["banks"]:
        print("  {:<10} {:<28} level={:<7} changes={:<5} 12m={:<3} spine={:<5} hold_days={:<5} founded={:<12} series_from={:<10} dir={}".format(
            e["code"], e["name"][:28], e["level"], e["changes"], e["changes_12m"],
            e["spine"], e["hold_days"] if e["hold_days"] is not None else "-",
            e["founded"] or "-", e["series_from"], e["direction_12m"]))


if __name__ == "__main__":
    main()
