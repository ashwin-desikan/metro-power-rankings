#!/usr/bin/env python3
"""fix_geo_metro.py -- correct mktcap_geo.metro on the rows ruled on 2026-09-22.

DRY RUN BY DEFAULT. Prints every change and writes nothing until --write.
Needs the Supabase service_role key. Sibling of fix_geo_state.py, which does
the same job for the `state` column; kept separate because these are metro
ASSIGNMENTS, a judgment, where the state fixes were provably wrong values.

Each row carries the evidence for its ruling and a TIER:

  1  corroborated BY THE TABLE ITSELF -- another row with the same city says
     the opposite. Same standard as the Taoyuan trio. 14 rows.
  2  good confidence, but resting on geography rather than on our own data.
     4 rows.
  3  a genuine judgment call. 2 rows. --skip-tier3 leaves them alone.

A useful corroboration found while checking: FOUR metros contain nothing but
the disputed rows. 'Foggia' holds only Italgas (a Turin company), 'Carlsbad
(NM)' only Ionis (a California company), bare 'Lancaster' only Clark
Associates (a Lancaster PA company, while 'Lancaster (PA)' exists separately),
and 'Nazareth' only the two Migdal HaEmek rows. A metro whose entire
membership is one disputed row is not a metro; it is the mis-assignment given
a name.

Kaohsiung is NOT one of them and an earlier draft of this comment wrongly said
it was. It holds 7 rows in the full table -- the 3 Taoyuan ones plus 4 with no
city (1301.TW, 1303.TW, 2002A.TW and one more), which the labelled-row view
the consistency checker uses filters out. The Taoyuan ruling does not depend
on it: it rests on three OTHER Taoyuan rows being filed under Taipei. Note the
trap for anyone repeating this analysis -- check_geo_consistency.py sees 5,531
labelled rows while the table has 14,291, so "this metro holds only X" is only
ever true of the labelled subset unless you check the full table, which
emptied_metros() below does.

NOT CHANGED HERE, on purpose:
  ICUI  San Clemente is Orange County, so the stored Los Angeles is right and
        Jev's San Diego is wrong.
  2688.HK / 600803.SS  Langfang is ~60km from Beijing and ~70km from Tianjin.
        A coin flip, and both ENN rows already agree, so leave them.
  600026.SS  the METRO is right and the CITY is wrong: COSCO Shipping Energy
        is a Shanghai company whose city field reflects its HK listing. That
        one is a city fix and is handled below, separately.

Modes: --self-test  --report  --write [--skip-tier3]
"""
import argparse, os, sys, urllib.parse
from collections import Counter

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def M(city, old, new, tier, why):
    return {"expect_city": city, "expect_metro": old, "new_metro": new,
            "tier": tier, "why": why}


METRO_FIXES = {
    # --- tier 1: another row with the same city contradicts this one -------
    "IG.MI": M("Turin", "Foggia", "Turin", 1,
               "city field says Turin; Iveco and Reply are Turin. 'Foggia' holds only this row"),
    "RGA": M("Chesterfield", "Detroit", "St. Louis", 1,
             "Bunge and Amdocs, same city and state, are St. Louis. Chesterfield MI also exists"),
    "IONS": M("Carlsbad", "Carlsbad (NM)", "San Diego", 1,
              "4 other Carlsbad CA rows are San Diego. 'Carlsbad (NM)' holds only this row"),
    "QXO": M("Greenwich", "Albany", "New York", 1,
             "GXO and W.R. Berkley, same city, are New York. Albany's others are Malta, Schenectady, Latham NY"),
    "SGI": M("Lexington", "Atlanta", "Lexington", 1,
             "Gray and Valvoline, same city and state, are Lexington"),
    "3037.TW": M("Taoyuan", "Kaohsiung", "Taipei", 1,
                 "3 other Taoyuan rows are Taipei. Taoyuan borders Taipei, ~300km from Kaohsiung"),
    "2408.TW": M("Taoyuan", "Kaohsiung", "Taipei", 1, "as 3037.TW"),
    "2360.TW": M("Taoyuan City", "Kaohsiung", "Taipei", 1,
                 "as 3037.TW; city spelled 'Taoyuan City', which is why the conflict check did not merge it"),
    "SNX": M("Clearwater", "Minneapolis", "Tampa", 1,
             "Clearwater is Tampa Bay; the Tampa metro already holds the Florida St. Pete companies"),
    "HPE": M("Spring", "Dallas", "Houston", 1, "Spring TX is the Houston metro"),
    "Clark Associates": M("Lancaster", "Lancaster", "Lancaster (PA)", 1,
                          "duplicate metro: Armstrong and Fulton, same city and state, use 'Lancaster (PA)'"),
    "WSFS": M("Wilmington", "Wilmington", "Philadelphia", 1,
              "Ashland and InterDigital, same city and state, are Philadelphia. The 'Wilmington' "
              "metro currently mixes Wilmington DE with Wilmington NC"),
    "000301.SZ": M("Suzhou", "Shanghai", "Suzhou", 1,
                   "city IS Suzhou and 4 Suzhou rows use the Suzhou metro"),
    "Abogen(Uni)": M("Suzhou", "Shanghai", "Suzhou", 1, "as 000301.SZ"),

    # --- tier 2: geography, not our own data ------------------------------
    "BS6.SI": M("Jiangyin", "Shanghai", "Suzhou", 2,
                "Citic Pacific, same city, is Suzhou; the Suzhou metro already absorbs Jiangyin and Wujiang"),
    "1585.HK": M("Wuxi", "Shanghai", "Suzhou", 2,
                 "Wuxi is ~40km from Suzhou and ~130km from Shanghai"),
    "ChinaC.com(Uni)": M("Wuxi", "Shanghai", "Suzhou", 2, "as 1585.HK"),
    "ShopMy(Uni)": M("Worcester", "Boston", "Worcester", 2,
                     "Worcester is its own MSA and the dataset carries the metro"),

    # --- tier 3: judgment -------------------------------------------------
    "TSEM": M("Migdal HaEmek", "Nazareth", "Haifa", 3,
              "all three Migdal HaEmek rows must match; Camtek is already Haifa, and 'Nazareth' "
              "holds no actual Nazareth company. Nazareth is nearer (~10km vs ~30km), so moving "
              "Camtek the other way is defensible"),
    "NXSN.TA": M("Migdal HaEmek", "Nazareth", "Haifa", 3, "as TSEM"),
}

CITY_FIXES = {
    "600026.SS": {"expect_city": "Hong Kong", "expect_metro": "Shanghai",
                  "new_city": "Shanghai",
                  "why": "COSCO Shipping Energy is a Shanghai company; the city field carried its "
                         "HK listing venue. The METRO was right all along, so only the city moves"},
}


def plan(rows, fixes=None, skip_tier3=False, field="metro"):
    """Guarded planning. Returns (changes, skipped).

    Every fix states the city and current value it expects to find. If either
    has moved on, the row is SKIPPED with the mismatch spelled out rather than
    forced -- these are judgments, and a judgment made against different facts
    is not the same judgment."""
    fixes = (METRO_FIXES if field == "metro" else CITY_FIXES) if fixes is None else fixes
    new_key = "new_metro" if field == "metro" else "new_city"
    changes, skipped = [], []
    by_symbol = {r["symbol"]: r for r in rows}
    for sym, spec in fixes.items():
        if skip_tier3 and spec.get("tier") == 3:
            skipped.append(({"symbol": sym}, "tier 3, skipped by request"))
            continue
        r = by_symbol.get(sym)
        if r is None:
            skipped.append(({"symbol": sym}, "symbol not present in mktcap_geo"))
            continue
        cur = (r.get(field) or "").strip()
        city = (r.get("city") or "").strip()
        metro = (r.get("metro") or "").strip()
        if cur == spec[new_key]:
            skipped.append((r, f"already {spec[new_key]!r}, nothing to do"))
            continue
        mismatch = []
        if city != spec["expect_city"]:
            mismatch.append(f"city {city!r} != expected {spec['expect_city']!r}")
        if metro != spec["expect_metro"]:
            mismatch.append(f"metro {metro!r} != expected {spec['expect_metro']!r}")
        if mismatch:
            skipped.append((r, "guard failed: " + "; ".join(mismatch)))
            continue
        changes.append((r, spec[new_key], spec))
    return changes, skipped


def apply_change(row, value, field):
    import common
    sym = urllib.parse.quote(row["symbol"], safe="")
    status, _ = common.rest("PATCH", f"/rest/v1/mktcap_geo?symbol=eq.{sym}",
                            body={field: value})
    return status


def fetch_rows():
    import common
    return common.select_all(
        "/rest/v1/mktcap_geo?select=symbol,name,metro,city,state,country", order="symbol")


def emptied_metros(rows, changes):
    """Metros that would be left with no rows at all."""
    moving = {r["symbol"] for r, _, _ in changes}
    losing = {r["metro"] for r, _, _ in changes}
    out = []
    for m in sorted(losing):
        remaining = [r for r in rows if r["metro"] == m and r["symbol"] not in moving]
        if not remaining:
            out.append((m, 0))
        elif len(remaining) <= 2:
            out.append((m, len(remaining)))
    return out


def cmd_run(args):
    rows = fetch_rows()
    print(f"mktcap_geo: {len(rows)} rows\n")
    changes, skipped = plan(rows, skip_tier3=args.skip_tier3)
    city_changes, city_skipped = plan(rows, skip_tier3=False, field="city")

    for tier in (1, 2, 3):
        tc = [c for c in changes if c[2]["tier"] == tier]
        if not tc:
            continue
        print("=" * 74)
        print(f"TIER {tier}: {len(tc)} metro change(s)")
        print("=" * 74)
        for r, new, spec in sorted(tc, key=lambda t: t[0]["symbol"]):
            print(f"  {r['symbol']:18} {(r.get('name') or '')[:26]:26} {r['city']}")
            print(f"      {r['metro']!r} -> {new!r}")
            print(f"      {spec['why']}")
        print()

    print("=" * 74)
    print(f"CITY corrections (metro deliberately unchanged): {len(city_changes)}")
    print("=" * 74)
    for r, new, spec in city_changes:
        print(f"  {r['symbol']:18} {(r.get('name') or '')[:26]:26} metro={r['metro']} (kept)")
        print(f"      city {r['city']!r} -> {new!r}")
        print(f"      {spec['why']}")

    if skipped or city_skipped:
        print("\nSKIPPED:")
        for r, why in skipped + city_skipped:
            print(f"  {r.get('symbol','?'):18} {why}")

    emptied = emptied_metros(rows, changes)
    if emptied:
        print("\nMETROS LEFT EMPTY OR NEARLY EMPTY (a separate decision, not made here):")
        for m, n in emptied:
            print(f"  {m!r}: {n} row(s) would remain")

    total = len(changes) + len(city_changes)
    if not args.write:
        print(f"\nDRY RUN. {total} row(s) would change. Nothing was written. "
              f"Re-run with --write to apply.")
        return
    if not total:
        print("\nNothing to do.")
        return
    print(f"\nWRITING {total} row(s)...")
    ok = failed = 0
    for r, new, _ in changes:
        try:
            print(f"  {r['symbol']:18} metro -> {new!r}  HTTP {apply_change(r, new, 'metro')}")
            ok += 1
        except Exception as e:
            failed += 1
            print(f"  {r['symbol']:18} FAILED: {e}")
    for r, new, _ in city_changes:
        try:
            print(f"  {r['symbol']:18} city  -> {new!r}  HTTP {apply_change(r, new, 'city')}")
            ok += 1
        except Exception as e:
            failed += 1
            print(f"  {r['symbol']:18} FAILED: {e}")

    print(f"\n{ok} written, {failed} failed. Verifying against a fresh read...")
    after = {r["symbol"]: r for r in fetch_rows()}
    wrong = []
    for r, new, _ in changes:
        got = (after.get(r["symbol"], {}).get("metro") or "").strip()
        if got != new:
            wrong.append((r["symbol"], "metro", got, new))
    for r, new, _ in city_changes:
        got = (after.get(r["symbol"], {}).get("city") or "").strip()
        if got != new:
            wrong.append((r["symbol"], "city", got, new))
    print(f"  rows that did not take the new value: {len(wrong)}")
    for sym, f, got, want in wrong:
        print(f"    {sym} {f}: wanted {want!r}, reads {got!r}")
    if not wrong:
        print("  VERIFIED.")


def cmd_self_test():
    fail = []
    def check(label, cond):
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            fail.append(label)

    base = [
        {"symbol": "RGA", "name": "RGA", "city": "Chesterfield", "state": "Missouri",
         "country": "United States", "metro": "Detroit"},
        {"symbol": "TSEM", "name": "Tower", "city": "Migdal HaEmek", "state": None,
         "country": "Israel", "metro": "Nazareth"},
        {"symbol": "NXSN.TA", "name": "NextVision", "city": "Migdal HaEmek", "state": None,
         "country": "Israel", "metro": "Nazareth"},
        {"symbol": "600026.SS", "name": "COSCO", "city": "Hong Kong", "state": None,
         "country": "China", "metro": "Shanghai"},
    ]
    ch, sk = plan(base, fixes={k: v for k, v in METRO_FIXES.items()
                               if k in ("RGA", "TSEM", "NXSN.TA")})
    got = {r["symbol"]: n for r, n, _ in ch}
    check("plan: RGA Detroit -> St. Louis", got.get("RGA") == "St. Louis")
    check("plan: TSEM Nazareth -> Haifa", got.get("TSEM") == "Haifa")
    check("plan: 3 changes, 0 skipped", len(ch) == 3 and not sk)

    ch2, sk2 = plan(base, fixes={k: v for k, v in METRO_FIXES.items()
                                 if k in ("RGA", "TSEM", "NXSN.TA")}, skip_tier3=True)
    check("plan: --skip-tier3 drops both Migdal HaEmek rows and keeps RGA",
          len(ch2) == 1 and ch2[0][0]["symbol"] == "RGA" and len(sk2) == 2)
    check("plan: the skip reason names tier 3",
          all("tier 3" in why for _, why in sk2))

    done = [dict(r, metro="St. Louis") if r["symbol"] == "RGA" else r for r in base]
    ch3, sk3 = plan(done, fixes={"RGA": METRO_FIXES["RGA"]})
    check("plan: idempotent -- already St. Louis means no change",
          ch3 == [] and "already" in sk3[0][1])

    moved = [dict(r, city="Clayton") if r["symbol"] == "RGA" else r for r in base]
    ch4, sk4 = plan(moved, fixes={"RGA": METRO_FIXES["RGA"]})
    check("plan: guard fails if the city moved", ch4 == [] and "guard failed" in sk4[0][1])

    reassigned = [dict(r, metro="Kansas City") if r["symbol"] == "RGA" else r for r in base]
    ch5, sk5 = plan(reassigned, fixes={"RGA": METRO_FIXES["RGA"]})
    check("plan: guard fails if someone else already changed the metro",
          ch5 == [] and "guard failed" in sk5[0][1])

    check("plan: a missing symbol is reported, not crashed on",
          plan([], fixes={"RGA": METRO_FIXES["RGA"]})[1][0][1]
          == "symbol not present in mktcap_geo")

    # city fixes operate on the city field and leave metro alone
    cc, _ = plan(base, field="city")
    check("city: COSCO city Hong Kong -> Shanghai",
          len(cc) == 1 and cc[0][0]["symbol"] == "600026.SS" and cc[0][1] == "Shanghai")
    check("city: COSCO is NOT in the metro fix table",
          "600026.SS" not in METRO_FIXES)

    # the rows we deliberately left alone must not appear anywhere
    for sym in ("ICUI", "2688.HK", "600803.SS"):
        check(f"left alone: {sym} is in neither fix table",
              sym not in METRO_FIXES and sym not in CITY_FIXES)

    # table hygiene
    check("table: every fix has a tier of 1, 2 or 3",
          all(s["tier"] in (1, 2, 3) for s in METRO_FIXES.values()))
    check("table: every fix carries a why",
          all(s.get("why") for s in METRO_FIXES.values()))
    check("table: no fix is a no-op",
          all(s["expect_metro"] != s["new_metro"] for s in METRO_FIXES.values()))
    counts = Counter(s["tier"] for s in METRO_FIXES.values())
    check(f"table: 14 tier-1, 4 tier-2, 2 tier-3 (got {dict(counts)})",
          counts[1] == 14 and counts[2] == 4 and counts[3] == 2)
    check("table: 20 metro fixes in total", len(METRO_FIXES) == 20)

    # emptied_metros
    rows = [{"symbol": "A", "metro": "Foggia", "city": "Turin"},
            {"symbol": "B", "metro": "Turin", "city": "Turin"},
            {"symbol": "C", "metro": "Turin", "city": "Turin"}]
    em = emptied_metros(rows, [(rows[0], "Turin", {"tier": 1})])
    check("emptied: Foggia is reported as left with 0 rows", em == [("Foggia", 0)])

    print(f"\n{len(fail)} failures" if fail else "\nALL SELF-TESTS PASS")
    sys.exit(1 if fail else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--report", action="store_true", help="dry run (default)")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--skip-tier3", action="store_true",
                    help="leave the two Migdal HaEmek judgment rows alone")
    args = ap.parse_args()
    if args.self_test:
        cmd_self_test(); return
    if args.report or args.write:
        cmd_run(args); return
    ap.print_help()


if __name__ == "__main__":
    main()
