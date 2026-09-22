#!/usr/bin/env python3
"""fix_geo_state.py -- correct mktcap_geo.state where it is provably wrong.

DRY RUN BY DEFAULT. Prints every change it would make and writes nothing until
--write is passed. Needs the Supabase service_role key (anon lost write access
on mktcap_geo 2026-08-02, migration lock_down_mktcap_pipeline_writes).

Two corrections, both found 2026-09-22 by check_geo_consistency.py:

1. state='DC' on 36 Washington-Baltimore rows whatever the row's real state.
   Boeing, AvalonBay and AES are in ARLINGTON and Booz Allen and Capital One
   in MCLEAN, which are Virginia; McCormick is in HUNT VALLEY and Constellation
   in BALTIMORE, which are Maryland. The column was holding a metro shorthand,
   so anything keyed on state mis-handled those rows.

2. CVX (Chevron) carries state='California' on a row whose city and metro are
   both Houston, stale since the HQ move from San Ramon.

WHAT THIS DOES NOT DO. It maps cities from an EXPLICIT table below and skips
any city not in it, loudly. It never infers a state from a metro, a country or
a company name, because that inference is exactly the mistake being corrected.
It also leaves `city` alone: 'DC', 'Washington DC' and 'Washington' all appear
and normalising them is a separate decision, reported at the end but not made
here.

Modes: --self-test  --report  --write
"""
import argparse, os, sys, urllib.parse
from collections import Counter

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Every city that appears on a state='DC' row, with the state it is actually
# in. Hand-checked one by one 2026-09-22 against the row's company. A city not
# in this table is SKIPPED, never guessed.
DC_METRO_CITY_STATE = {
    # Virginia
    "Arlington": "Virginia",             # Boeing, AES, AvalonBay, RTX
    "McLean": "Virginia",                # Booz Allen, Capital One
    "Reston": "Virginia",
    "Tysons Corner": "Virginia",
    "Vienna": "Virginia",
    "Herndon": "Virginia",
    "West Falls Church": "Virginia",     # Northrop Grumman
    # Maryland
    "Bethesda": "Maryland",
    "Baltimore": "Maryland",             # Constellation Energy
    "Silver Spring": "Maryland",
    "Hunt Valley": "Maryland",           # McCormick & Company
    "Ellicott City": "Maryland",         # Huntress
    "Hanover": "Maryland",               # Dragos -- Hanover MD, near BWI
    # The District itself
    "Washington": "District of Columbia",
    "Washington DC": "District of Columbia",
    "DC": "District of Columbia",
}

# Single-row corrections keyed on symbol, each guarded by the value we expect
# to find so a re-run cannot clobber an already-corrected row.
SYMBOL_FIXES = {
    "CVX": {"expect_state": "California", "expect_city": "Houston", "new_state": "Texas"},
}


def plan_dc_fixes(rows, table=None):
    """Rows whose state is exactly 'DC'. Returns (changes, skipped).

    changes: (row, new_state). skipped: (row, reason).
    A row already carrying the right state is not a change; that is what makes
    this idempotent."""
    table = DC_METRO_CITY_STATE if table is None else table
    changes, skipped = [], []
    for r in rows:
        if (r.get("state") or "").strip() != "DC":
            continue
        city = (r.get("city") or "").strip()
        if city not in table:
            skipped.append((r, f"city {city!r} is not in the checked table"))
            continue
        changes.append((r, table[city]))
    return changes, skipped


def plan_symbol_fixes(rows, fixes=None):
    """Returns (changes, skipped). A row whose current values do not match the
    guard is skipped, not forced -- if Chevron's state already reads Texas the
    job is done, and if it reads something else entirely that is new news."""
    fixes = SYMBOL_FIXES if fixes is None else fixes
    changes, skipped = [], []
    by_symbol = {r["symbol"]: r for r in rows}
    for sym, spec in fixes.items():
        r = by_symbol.get(sym)
        if r is None:
            skipped.append(({"symbol": sym}, "symbol not present in mktcap_geo"))
            continue
        state = (r.get("state") or "").strip()
        city = (r.get("city") or "").strip()
        if state == spec["new_state"]:
            skipped.append((r, f"already {spec['new_state']}, nothing to do"))
            continue
        if state != spec["expect_state"] or city != spec["expect_city"]:
            skipped.append((r, f"guard failed: expected city={spec['expect_city']!r} "
                               f"state={spec['expect_state']!r}, found {city!r}/{state!r}"))
            continue
        changes.append((r, spec["new_state"]))
    return changes, skipped


def apply_change(row, new_state):
    """PATCH one row by symbol. Symbols carry '&', '(', ')' and spaces
    ('Applied Aerospace &amp; Defe', 'Arcadia(Uni)'), so the value is
    percent-encoded rather than interpolated raw."""
    import common
    sym = urllib.parse.quote(row["symbol"], safe="")
    path = f"/rest/v1/mktcap_geo?symbol=eq.{sym}"
    status, _ = common.rest("PATCH", path, body={"state": new_state})
    return status


def fetch_rows():
    import common
    return common.select_all(
        "/rest/v1/mktcap_geo?select=symbol,name,metro,city,state,country",
        order="symbol")


def show(changes, skipped, title):
    print("=" * 72)
    print(f"{title}: {len(changes)} change(s), {len(skipped)} skipped")
    print("=" * 72)
    by_new = Counter(n for _, n in changes)
    for r, new in sorted(changes, key=lambda t: (t[1], t[0]["city"], t[0]["symbol"])):
        print(f"  {r['symbol']:22} {(r.get('name') or '')[:30]:30} {r['city']:18} "
              f"{r.get('state')!r:12} -> {new!r}")
    if by_new:
        print("  totals: " + ", ".join(f"{k}={v}" for k, v in sorted(by_new.items())))
    for r, why in skipped:
        print(f"  SKIP {r.get('symbol','?'):20} {why}")


def cmd_run(args):
    rows = fetch_rows()
    print(f"mktcap_geo: {len(rows)} rows\n")
    dc_changes, dc_skipped = plan_dc_fixes(rows)
    sym_changes, sym_skipped = plan_symbol_fixes(rows)
    show(dc_changes, dc_skipped, "state='DC' -> real state")
    print()
    show(sym_changes, sym_skipped, "single-symbol corrections")

    # city hygiene, reported not fixed
    variants = sorted({(r.get("city") or "").strip() for r, _ in dc_changes
                       if (r.get("city") or "").strip() in ("DC", "Washington DC", "Washington")})
    if len(variants) > 1:
        print(f"\nNOTE, not changed by this script: the District appears as "
              f"{', '.join(repr(v) for v in variants)}. Normalising `city` is a "
              f"separate decision.")

    total = len(dc_changes) + len(sym_changes)
    if not args.write:
        print(f"\nDRY RUN. {total} row(s) would change. Nothing was written. "
              f"Re-run with --write to apply.")
        return
    if not total:
        print("\nNothing to do.")
        return
    print(f"\nWRITING {total} row(s)...")
    ok = failed = 0
    for r, new in dc_changes + sym_changes:
        try:
            status = apply_change(r, new)
            ok += 1
            print(f"  {r['symbol']:22} -> {new!r}  HTTP {status}")
        except Exception as e:
            failed += 1
            print(f"  {r['symbol']:22} FAILED: {e}")
    print(f"\n{ok} written, {failed} failed. Verifying against a fresh read...")
    after = fetch_rows()
    still_dc = [r for r in after if (r.get("state") or "").strip() == "DC"]
    by_symbol = {r["symbol"]: r for r in after}
    wrong = [(r["symbol"], by_symbol[r["symbol"]].get("state"), new)
             for r, new in dc_changes + sym_changes
             if r["symbol"] in by_symbol and (by_symbol[r["symbol"]].get("state") or "").strip() != new]
    print(f"  rows still carrying state='DC': {len(still_dc)} "
          f"(expected {len(dc_skipped)}, the skipped ones)")
    print(f"  rows that did not take the new value: {len(wrong)}")
    for sym, got, want in wrong:
        print(f"    {sym}: wanted {want!r}, reads {got!r}")
    if not wrong and len(still_dc) == len(dc_skipped):
        print("  VERIFIED.")


def cmd_self_test():
    fail = []
    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fail.append(label)

    rows = [
        {"symbol": "BA", "name": "Boeing", "city": "Arlington", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "MKC", "name": "McCormick", "city": "Hunt Valley", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "CG", "name": "Carlyle", "city": "Washington", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "ZZZ", "name": "Unknown Co", "city": "Nowheresville", "state": "DC",
         "country": "United States", "metro": "Washington-Baltimore"},
        {"symbol": "AAPL", "name": "Apple", "city": "Cupertino", "state": "California",
         "country": "United States", "metro": "San Francisco-San Jose"},
    ]
    ch, sk = plan_dc_fixes(rows)
    got = {r["symbol"]: n for r, n in ch}
    check("dc: Arlington -> Virginia", got.get("BA") == "Virginia")
    check("dc: Hunt Valley -> Maryland", got.get("MKC") == "Maryland")
    check("dc: Washington -> District of Columbia", got.get("CG") == "District of Columbia")
    check("dc: an unknown city is SKIPPED, never guessed",
          "ZZZ" not in got and any(r["symbol"] == "ZZZ" for r, _ in sk))
    check("dc: a row that is not state='DC' is untouched", "AAPL" not in got)
    check("dc: exactly 3 changes from 4 DC rows", len(ch) == 3 and len(sk) == 1)

    # idempotence: after the fix, a second run finds nothing
    fixed = [dict(r, state=got[r["symbol"]]) if r["symbol"] in got else r for r in rows]
    ch2, _ = plan_dc_fixes(fixed)
    check("dc: re-running after a successful write changes nothing", ch2 == [])

    # every value in the table is a real full state name
    try:
        import check_geo_consistency as C
        bad = [c for c, s in DC_METRO_CITY_STATE.items() if s not in C._STATES]
        check("dc: every mapped state is a canonical full state name", not bad)
        check("dc: the table only maps to VA, MD or DC",
              set(DC_METRO_CITY_STATE.values()) ==
              {"Virginia", "Maryland", "District of Columbia"})
    except ImportError:
        check("dc: check_geo_consistency importable for the state-name check", False)

    # --- symbol fixes -----------------------------------------------------
    cvx_rows = [{"symbol": "CVX", "name": "Chevron", "city": "Houston",
                 "state": "California", "country": "United States", "metro": "Houston"}]
    ch, sk = plan_symbol_fixes(cvx_rows)
    check("cvx: California on a Houston row -> Texas",
          len(ch) == 1 and ch[0][1] == "Texas")

    done = [dict(cvx_rows[0], state="Texas")]
    ch2, sk2 = plan_symbol_fixes(done)
    check("cvx: already Texas -> no change, and says so",
          ch2 == [] and len(sk2) == 1 and "already" in sk2[0][1])

    moved = [dict(cvx_rows[0], city="San Ramon")]
    ch3, sk3 = plan_symbol_fixes(moved)
    check("cvx: guard fails if the city is not what we checked",
          ch3 == [] and "guard failed" in sk3[0][1])

    other = [dict(cvx_rows[0], state="Nevada")]
    ch4, sk4 = plan_symbol_fixes(other)
    check("cvx: guard fails on an unexpected current state",
          ch4 == [] and "guard failed" in sk4[0][1])

    check("cvx: a missing symbol is reported, not crashed on",
          plan_symbol_fixes([], {"NOPE": {"expect_state": "a", "expect_city": "b",
                                          "new_state": "c"}})[1][0][1]
          == "symbol not present in mktcap_geo")

    print(f"\n{len(fail)} failures" if fail else "\nALL SELF-TESTS PASS")
    sys.exit(1 if fail else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--report", action="store_true", help="dry run (default)")
    ap.add_argument("--write", action="store_true", help="actually PATCH Supabase")
    args = ap.parse_args()
    if args.self_test:
        cmd_self_test(); return
    if args.report or args.write:
        cmd_run(args); return
    ap.print_help()


if __name__ == "__main__":
    main()
