#!/usr/bin/env python3
"""update_top_companies.py — refresh the Top Companies section of the metro
detail JSONs straight from the pipeline's committed CSV, no Excel involved.

Since the 2026-08-29 CMC-workbook sunset, out/mktcap_export.csv (written by
refresh.py --write, committed by run-mktcap-refresh.sh every Saturday) is the
canonical metro->company feed: MetroAreas.xlsx reads it via Power Query, and
scripts/extract.py reads it too. But extract.py needs the workbook for
everything else it emits, so it can only run where MetroAreas.xlsx exists
(Ashwin's Windows box). This script is the workbook-free path: it patches ONLY
the `marketCap` block of public/data/details/*.json (plus meta.json's
`companiesAsOf`), so the mini's Saturday job can keep the site's Top Companies
current without waiting for the next manual workbook-sync.

It mirrors extract.py's extract_mktcap() + build_detail() marketCap logic
exactly (same skip rules, same sort, same round(), same compact JSON
serialization) — proven byte-identical across all 555 mapped metros on
2026-08-29 before this script was wired in. If you change the shape in one
place, change it in the other.

Decision rules (house style: never guess, log and skip):
  * CSV metro names not in public/data/metros.json -> WARNING, skipped.
  * Metro in CSV but no detail file on disk -> WARNING, skipped (extract.py
    creates detail files; this script only edits existing ones).
  * Detail file has marketCap but its metro vanished from the CSV -> the
    marketCap block is REMOVED (same as extract.py, which only adds the block
    for metros present in the feed).
  * Orphan detail files (slug not in metros.json, e.g. almere.json since the
    2026-07 metro list change) are never touched.
  * as_of date: Supabase mktcap_valuations' latest snapshot (anon read, same
    as extract.py). --as-of YYYY-MM-DD overrides; if Supabase is unreachable
    and no override is given, the run ABORTS — on the mini this runs minutes
    after refresh.py wrote that snapshot, so unreachable means something is
    genuinely wrong, not a case to paper over.

Usage:
    python update_top_companies.py                # dry run, shows the plan
    python update_top_companies.py --write        # apply
    python update_top_companies.py --self-test    # offline logic checks
"""

import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent          # scripts/mktcap
REPO = HERE.parent.parent
CSV_PATH = HERE / "out" / "mktcap_export.csv"
DATA_DIR = REPO / "public" / "data"

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


# ------------------------------------------------------------- sources ------

def load_csv(path):
    """CSV -> {metro_name: [{valuation, name, source}, ...] sorted desc}.
    Same skip rules as extract.py's extract_mktcap(): blank metro or zero
    valuation rows are ignored."""
    by_metro = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            metro = (r.get("Metro Area") or "").strip()
            try:
                val = float(r.get("Valuation") or 0)
            except ValueError:
                val = 0.0
            if not metro or val == 0:
                continue
            by_metro.setdefault(metro, []).append({
                "valuation": val,
                "name": (r.get("Company Name") or "").strip(),
                "source": (r.get("Source") or "").strip(),
            })
    for m in by_metro:
        by_metro[m].sort(key=lambda x: x["valuation"], reverse=True)
    return by_metro


def fetch_snapshot_date():
    """Latest weekly snapshot date from Supabase (anon read; the key below is
    the project's public anon key, safe to embed). Returns 'YYYY-MM-DD' or
    None. Mirrors extract.py's fetch_mktcap_snapshot_date()."""
    url = (os.environ.get("SUPABASE_URL")
           or "https://nmprqkmymrdknffwnuur.supabase.co").rstrip("/")
    anon = (os.environ.get("SUPABASE_ANON_KEY") or
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30."
            "4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM")
    try:
        req = urllib.request.Request(
            url + "/rest/v1/mktcap_valuations?select=as_of&order=as_of.desc&limit=1",
            headers={"apikey": anon, "Authorization": "Bearer " + anon})
        with urllib.request.urlopen(req, timeout=15) as r:
            rows = json.load(r)
        as_of = (rows or [{}])[0].get("as_of")
        return as_of if as_of and DATE_RE.fullmatch(str(as_of)) else None
    except Exception:
        return None


# ---------------------------------------------------------- pure logic ------

def market_cap_block(companies, as_of):
    """Identical shape to extract.py build_detail()'s marketCap block."""
    block = {
        "total": round(sum(c["valuation"] for c in companies)),
        "count": len(companies),
        "top12": [
            {"name": c["name"], "valuation": round(c["valuation"]),
             "source": c["source"]}
            for c in companies[:12]
        ],
    }
    if as_of:
        block["asOf"] = as_of
    return block


def plan(by_metro, name_to_slug, existing, as_of):
    """Decide per-slug actions. `existing` maps slug -> current marketCap
    block (or None if the detail file has none). Only slugs whose detail file
    exists appear in `existing`; CSV metros with no file are warned about.

    Returns (actions, warnings) where actions is a list of
    (slug, 'set'|'remove', new_block_or_None)."""
    actions, warnings = [], []
    matched_slugs = set()

    for metro, companies in sorted(by_metro.items()):
        slug = name_to_slug.get(metro)
        if slug is None:
            warnings.append(f"CSV metro not in metros.json, skipped: {metro!r}")
            continue
        if slug not in existing:
            warnings.append(f"no detail file for {slug} ({metro!r}); "
                            "skipped — extract.py/workbook-sync creates detail files")
            continue
        matched_slugs.add(slug)
        new_block = market_cap_block(companies, as_of)
        if existing[slug] != new_block:
            actions.append((slug, "set", new_block))

    for slug, cur in sorted(existing.items()):
        if cur is not None and slug not in matched_slugs and slug in set(name_to_slug.values()):
            actions.append((slug, "remove", None))
    return actions, warnings


def self_test():
    """Offline checks of the pure decision logic. Exit 0 iff all pass."""
    failures = []

    def check(label, cond):
        print(f"  {'ok' if cond else 'FAIL'}: {label}")
        if not cond:
            failures.append(label)

    # 1. grouping/sorting/skip rules
    import io
    rows = ("Metro Area,Valuation,Company Name,Source\n"
            "Alpha,100.6,A2,Public\n"
            "Alpha,200.4,A1,Private\n"
            ",999,Ghost,Public\n"
            "Beta,0,ZeroCo,Public\n"
            "Beta,50,B1,Unicorn\n")
    tmp = HERE / "out" / ".selftest.csv"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(rows, encoding="utf-8")
    try:
        by = load_csv(tmp)
    finally:
        tmp.unlink()
    check("blank-metro and zero-valuation rows skipped",
          set(by) == {"Alpha", "Beta"} and len(by["Beta"]) == 1)
    check("companies sorted by valuation desc",
          [c["name"] for c in by["Alpha"]] == ["A1", "A2"])

    # 2. block shape + rounding matches extract.py (round(), not int())
    blk = market_cap_block(by["Alpha"], "2026-08-29")
    check("total is round(sum) and top12 valuations rounded",
          blk["total"] == 301 and blk["top12"][0]["valuation"] == 200
          and blk["top12"][1]["valuation"] == 101)
    check("block keys and asOf stamp",
          list(blk) == ["total", "count", "top12", "asOf"]
          and blk["count"] == 2 and blk["asOf"] == "2026-08-29")
    blk_nodate = market_cap_block(by["Beta"], None)
    check("no asOf key when date unknown", "asOf" not in blk_nodate)

    # 3. plan(): set / unchanged / remove / skip decisions
    n2s = {"Alpha": "alpha", "Beta": "beta", "Gamma": "gamma", "Delta": "delta"}
    existing = {
        "alpha": {"stale": True},                      # differs -> set
        "beta": market_cap_block(by["Beta"], "2026-08-29"),  # identical -> no-op
        "gamma": {"total": 1, "count": 1, "top12": []},      # gone from CSV -> remove
        "delta": None,                                       # never had one -> no-op
    }
    acts, warns = plan(by, n2s, existing, "2026-08-29")
    got = {(s, a) for s, a, _ in acts}
    check("plan: stale updated, identical untouched, vanished removed",
          got == {("alpha", "set"), ("gamma", "remove")})
    check("plan: no warnings when everything matches", warns == [])

    # 4. plan(): unknown CSV metro and missing detail file both warn+skip
    acts2, warns2 = plan({"Nowhere": by["Alpha"], "Alpha": by["Alpha"]},
                         {"Alpha": "alpha"}, {}, None)
    check("unknown metro name warns, writes nothing",
          acts2 == [] and len(warns2) == 2)

    # 5. orphan detail files (slug not in metros.json) are never touched
    acts3, _ = plan({}, {"Alpha": "alpha"}, {"almere": {"total": 1}}, None)
    check("orphan detail file left alone", acts3 == [])

    print(f"self-test: {9 - len(failures)}/9 passed")
    return 0 if not failures else 1


# ---------------------------------------------------------------- main ------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="apply changes (default: dry run)")
    ap.add_argument("--as-of", dest="as_of",
                    help="override the snapshot date (YYYY-MM-DD); default: "
                         "Supabase mktcap_valuations latest")
    ap.add_argument("--csv", default=str(CSV_PATH))
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        sys.exit(self_test())

    mode = "WRITE" if args.write else "DRY RUN"
    print(f"update_top_companies — {mode}")

    as_of = args.as_of
    if as_of and not DATE_RE.fullmatch(as_of):
        print(f"ERROR: --as-of {as_of!r} is not YYYY-MM-DD"); sys.exit(2)
    if not as_of:
        as_of = fetch_snapshot_date()
        if not as_of:
            print("ERROR: could not read the latest snapshot date from "
                  "Supabase and no --as-of given. On the mini this runs right "
                  "after refresh.py --write, so this is a real failure, not a "
                  "case to default around.")
            sys.exit(2)
    print(f"snapshot date: {as_of}")

    by_metro = load_csv(args.csv)
    print(f"CSV: {sum(len(v) for v in by_metro.values())} mapped companies "
          f"across {len(by_metro)} metros ({args.csv})")

    metros = json.load(open(DATA_DIR / "metros.json", encoding="utf-8"))
    name_to_slug = {m["name"]: m["slug"] for m in metros}

    details_dir = DATA_DIR / "details"
    existing, details = {}, {}
    for m in metros:
        p = details_dir / f"{m['slug']}.json"
        if p.exists():
            d = json.load(open(p, encoding="utf-8"))
            details[m["slug"]] = d
            existing[m["slug"]] = d.get("marketCap")

    actions, warnings = plan(by_metro, name_to_slug, existing, as_of)
    for w in warnings:
        print(f"  WARNING: {w}")

    sets = [a for a in actions if a[1] == "set"]
    removes = [a for a in actions if a[1] == "remove"]
    unchanged = sum(1 for s, c in existing.items() if c is not None) \
        - len(sets) - len(removes)
    # (sets includes metros gaining a block for the first time, so
    #  `unchanged` can undercount by those; the summary line is informational)
    print(f"plan: ~{len(sets)} set, {len(removes)} remove, "
          f"~{max(unchanged, 0)} unchanged")
    for slug, act, _ in actions[:15]:
        print(f"    {act}: {slug}")
    if len(actions) > 15:
        print(f"    ... and {len(actions) - 15} more")

    meta_path = DATA_DIR / "meta.json"
    meta = json.load(open(meta_path, encoding="utf-8"))
    meta_changed = meta.get("companiesAsOf") != as_of

    if not args.write:
        print(f"meta.json companiesAsOf: {meta.get('companiesAsOf')} -> {as_of}"
              if meta_changed else "meta.json companiesAsOf already current")
        print("\nDry run only. Re-run with --write to apply.")
        return

    written = 0
    for slug, act, block in actions:
        d = details[slug]
        if act == "set":
            d["marketCap"] = block
        else:
            d.pop("marketCap", None)
        with open(details_dir / f"{slug}.json", "w", encoding="utf-8") as f:
            json.dump(d, f, separators=(",", ":"))   # extract.py's format
        written += 1
    if meta_changed:
        meta["companiesAsOf"] = as_of
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, separators=(",", ":"))
    print(f"\nDONE: {written} detail files written, "
          f"meta.json {'updated' if meta_changed else 'unchanged'}")


if __name__ == "__main__":
    main()
