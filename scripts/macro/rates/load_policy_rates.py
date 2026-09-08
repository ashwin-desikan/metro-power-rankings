#!/usr/bin/env python3
"""load_policy_rates.py - one-time seed of Supabase from the current JSON.

Fills public.policy_rate_changes (one row per policy-era decision, across
every published bank file) and public.policy_rate_daily (the BIS daily
levels cache, when present) from what is already on disk under
public/data/business/economy/rates/**. After this runs once,
scripts/macro/rates/refresh.py --write only ever appends what changed.

Dry-run by default, same idiom as refresh.py and every other pipeline
script in this repo: prints row counts per table and a sample, writes
nothing until --write. Uses the SAME rest() helper and the SAME fail-open
posture as scripts/business/series_store.py: without SUPABASE_SERVICE_KEY
this logs loudly and exits 0 rather than aborting - there is nothing here
that can't be re-run once the key is set.

usage:
  python3 scripts/macro/rates/load_policy_rates.py --self-test
  python3 scripts/macro/rates/load_policy_rates.py            # dry run
  python3 scripts/macro/rates/load_policy_rates.py --write
"""
import argparse
import glob
import json
import os
import sys

import common as c

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK = 5000


def _service_key():
    k = (os.environ.get("SUPABASE_SERVICE_KEY")
         or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if k:
        return k
    root = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
    for fn in (".env.local", ".env"):
        p = os.path.join(root, fn)
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            for name in ("SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
                if line.strip().startswith(name + "="):
                    return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def changes_rows_from_bank(bank):
    """Every policy-era change row (break rows excluded, market-era rows are
    not in `changes` at all per the contract) as a policy_rate_changes row."""
    out = []
    for ch in bank.get("changes", []):
        if ch.get("break"):
            continue
        era = bank["instruments"][ch["era"]] if 0 <= ch.get("era", -1) < len(bank["instruments"]) else None
        out.append({
            "bank_code": bank["code"],
            "date": ch["date"],
            "level": ch.get("level"),
            "change": ch.get("change"),
            "lower": ch.get("lower"),
            "upper": ch.get("upper"),
            "era_name": era["name"] if era else "",
            "kind": era["kind"] if era else "policy",
            "source": bank["coverage"]["spine"],
            "built_at": bank["built"],
        })
    return out


def daily_rows_from_cache():
    """Every row currently sitting in the incremental BIS cache
    (scripts/macro/rates/cache/bis-daily/*.json). Empty until refresh.py has
    run at least once; the seed still succeeds with zero daily rows, since
    policy_rate_changes is the table that matters for a first load."""
    out = []
    for path in sorted(glob.glob(os.path.join(c.BIS_CACHE_DIR, "*.json"))):
        iso2 = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for r in data.get("rows", []):
            out.append({"bank_code": c.bis_code_for(iso2), "date": r["date"], "level": c.round4(r["level"])})
    return out


def load_all_banks():
    banks = []
    for path in sorted(glob.glob(os.path.join(c.OUT_DIR, "*.json"))):
        base = os.path.basename(path)
        if base in ("index.json", "changelog.json"):
            continue
        with open(path, encoding="utf-8") as f:
            banks.append(json.load(f))
    return banks


def run(write):
    banks = load_all_banks()
    if not banks:
        print("load_policy_rates: no bank files found in {}".format(c.OUT_DIR))
        return 1

    change_rows = []
    for bank in banks:
        change_rows.extend(changes_rows_from_bank(bank))
    daily_rows = daily_rows_from_cache()

    print("load_policy_rates: {} bank files, {} policy_rate_changes rows, "
          "{} policy_rate_daily rows (from the incremental cache)".format(
              len(banks), len(change_rows), len(daily_rows)))
    if change_rows:
        sample = change_rows[0]
        print("  sample: {} {} {}%".format(sample["bank_code"], sample["date"], sample["level"]))

    if not write:
        print("Dry run: nothing written. Pass --write to seed Supabase.")
        return 0

    key = _service_key()
    if not key:
        print("load_policy_rates: NO SUPABASE KEY, nothing written "
              "(set SUPABASE_SERVICE_KEY in mac-mini-jobs/config.env or .env.local). "
              "Re-run once it is set; this script is idempotent (upsert on the primary key).")
        return 0

    sys.path.insert(0, os.path.join(HERE, "..", "..", "business"))
    from load_market_series import rest

    n = 0
    for i in range(0, len(change_rows), CHUNK):
        batch = change_rows[i:i + CHUNK]
        rest("POST", "/rest/v1/policy_rate_changes", body=batch, key=key,
             prefer="resolution=merge-duplicates,return=minimal")
        n += len(batch)
    for i in range(0, len(daily_rows), CHUNK):
        batch = daily_rows[i:i + CHUNK]
        rest("POST", "/rest/v1/policy_rate_daily", body=batch, key=key,
             prefer="resolution=merge-duplicates,return=minimal")
        n += len(batch)
    print("load_policy_rates: upserted {} row(s)".format(n))
    return 0


def self_test():
    bank = {
        "code": "test", "built": "2026-09-08",
        "coverage": {"spine": "own"},
        "instruments": [
            {"name": "Policy rate", "kind": "policy", "from": "2000-01-01", "to": None, "text": "x"},
        ],
        "changes": [
            {"date": "2000-01-01", "level": 1.0, "change": None, "era": 0},
            {"date": "2000-06-01", "break": True, "note": "n", "era": 0},
            {"date": "2000-07-01", "level": 1.5, "change": 0.5, "era": 0},
        ],
    }
    rows = changes_rows_from_bank(bank)
    # the break row must never become a policy_rate_changes row
    assert len(rows) == 2, "break rows must be excluded"
    assert rows[0]["bank_code"] == "test" and rows[0]["level"] == 1.0
    assert rows[1]["change"] == 0.5
    assert rows[0]["era_name"] == "Policy rate" and rows[0]["kind"] == "policy"

    # a range-instrument row keeps lower/upper alongside the midpoint level
    bank2 = dict(bank, changes=[
        {"date": "2008-12-16", "level": 0.125, "lower": 0.0, "upper": 0.25, "change": None, "era": 0},
    ])
    rows2 = changes_rows_from_bank(bank2)
    assert rows2[0]["lower"] == 0.0 and rows2[0]["upper"] == 0.25

    print("load_policy_rates self-test OK")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return
    sys.exit(run(write=args.write))


if __name__ == "__main__":
    main()
