"""Builds public/data/business/economy/rates/index.json from every bank file
already written to that directory, per RATES-CONTRACT.md.

One row per central bank: a bis-<iso2> file superseded by an own-spine bank
(carries "listed": false, "superseded_by": "<code>") is excluded entirely,
not just marked. power_rank is joined in here from public/data/countries.json
so common.py stays free of that file. Any bank whose data has gone stale
(more than 400 days with no update) and carries no `ended` date is printed,
never silently reclassified -- the contract's "print so I can decide,
default to leaving them as they are" rule.
"""

import argparse
import glob
import json
import os

import common as c

STALE_DAYS = 400


def load_all_banks(out_dir=c.OUT_DIR):
    banks = []
    for path in sorted(glob.glob(os.path.join(out_dir, "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            banks.append(json.load(f))
    return banks


def print_stale_without_ended(banks, built=c.BUILT_DATE):
    """Diagnostic only, per the contract: a bank whose series stopped more
    than STALE_DAYS before the build date, with no `ended` date, might be
    mislabeled hold/market rather than genuinely inactive. Print it; never
    change its direction_12m here."""
    stale = []
    for b in banks:
        if not b.get("listed", True) or b.get("ended"):
            continue
        gap = (c.parse_iso(built) - c.parse_iso(b["last_change"])).days
        if gap > STALE_DAYS:
            stale.append((b["code"], b["country"], b["last_change"], gap))
    if stale:
        print("  Stale, no ended date set (last data > {} days before build; "
              "left as-is, review and decide):".format(STALE_DAYS))
        for code, country, last, gap in sorted(stale, key=lambda r: -r[3]):
            print("    {:<10} {:<20} last_change={} ({} days stale)".format(
                code, country, last, gap))
    return stale


def build(write=True, out_dir=c.OUT_DIR):
    banks = load_all_banks(out_dir)
    if not banks:
        raise RuntimeError("no bank files found in {}".format(out_dir))

    print_stale_without_ended(banks)

    listed_banks = [b for b in banks if b.get("listed", True)]
    ranks_by_name = c.load_power_ranks()

    entries = []
    missing_rank = []
    for b in listed_banks:
        entry = c.compute_index_entry(b)
        entry["power_rank"] = c.power_rank_for(b["country"], ranks_by_name)
        if entry["power_rank"] is None and b["country"] != "Euro area":
            missing_rank.append((entry["code"], b["country"]))
        entries.append(entry)

    if missing_rank:
        print("  Banks with no power_rank match:")
        for code, country in missing_rank:
            print("    {:<10} {}".format(code, country))

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
        "country": "Testland",
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
    assert entry["country"] == "Testland"
    assert entry["ended"] is None

    # a bank whose latest era is market: direction_12m must be "market" and
    # level must come from the market summary, not a stale policy row
    market_bank = {
        "code": "mkt", "name": "Market Bank", "short": "MB", "iso2": "MM",
        "country": "Marketland",
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

    # an ended bank (euro adoption): forced to "ended", hold_days null,
    # changes_12m 0, level frozen at the last pre-end row even if a stray
    # post-end row exists
    ended_bank = {
        "code": "at", "name": "Test Euro Joiner", "short": "TEJ", "iso2": "AT",
        "country": "Austria",
        "founded": None, "first_change": "1990-01-01",
        "last_change": "1998-12-31", "built": "2026-09-08",
        "coverage": {"spine": "bis"},
        "ended": "1998-12-31",
        "ended_note": "Joined the euro on 1 January 1999; the ECB sets the rate since.",
        "instruments": [{"from": "1990-01-01", "to": None, "name": "X", "text": "X", "kind": "policy"}],
        "changes": [
            {"date": "1990-01-01", "level": 8.0, "change": None, "era": 0},
            {"date": "1998-06-01", "level": 3.0, "change": -5.0, "era": 0},
        ],
        "market": [],
    }
    eentry = c.compute_index_entry(ended_bank)
    assert eentry["direction_12m"] == "ended"
    assert eentry["hold_days"] is None
    assert eentry["changes_12m"] == 0
    assert eentry["level"] == 3.0
    assert eentry["ended"] == "1998-12-31"

    # power_rank aliasing
    ranks = {"Czech Republic": 30, "Hong Kong": 40, "South Korea": 12, "Turkey": 18, "France": 5}
    assert c.power_rank_for("Czechia", ranks) == 30
    assert c.power_rank_for("Hong Kong SAR", ranks) == 40
    assert c.power_rank_for("Korea", ranks) == 12
    assert c.power_rank_for("Turkiye", ranks) == 18
    assert c.power_rank_for("Euro area", ranks) is None
    assert c.power_rank_for("France", ranks) == 5
    assert c.power_rank_for("Nowhereland", ranks) is None

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
    print("  {} banks listed".format(len(index["banks"])))
    print()
    print("  {:<10} {:<20} {:>4} {:>8} {:<10} {:>9} {}".format(
        "code", "country", "rank", "level", "direction", "hold_days", "ended"))
    for e in index["banks"]:
        print("  {:<10} {:<20} {:>4} {:>8} {:<10} {:>9} {}".format(
            e["code"], e["country"][:20], e["power_rank"] if e["power_rank"] is not None else "-",
            e["level"] if e["level"] is not None else "-", e["direction_12m"],
            e["hold_days"] if e["hold_days"] is not None else "-", e["ended"] or "-"))


if __name__ == "__main__":
    main()
