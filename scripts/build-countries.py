"""build-countries.py - refresh public/data/countries.json from the workbook.

Closes a real gap found 2026-08-04: NOTHING in the repo wrote countries.json.
Its last content change was 17 May 2026, so country populations edited in
MetroAreas.xlsx never reached /countries. At the time of writing 77 of 246
countries were stale and the world total was 29.3M short (India alone 11.9M).

Source sheet: "Country Populations". Its header is on ROW 3 (row 1 holds stray
working cells, row 2 is blank), so data starts at row 4. Col A is PARENT
Country, col H is Country - they differ for the 49 constituents and
territories, and the UK exists ONLY as a parent, with no row of its own.

DESIGN - deliberately conservative, this file backs 247 live URLs:

  * UPDATE IN PLACE. Rows are matched by name and their owned fields
    overwritten. Rows are never added or deleted, only reported. A country
    missing from the sheet (the United Kingdom) keeps its existing values
    rather than vanishing from /countries.
  * SLUGS ARE NEVER TOUCHED. They are live URLs.
  * Only fields the sheet demonstrably owns are written. The mapping was
    validated empirically before this script existed, by measuring agreement
    across all 246 matched countries; anything that did not agree is excluded:
      - isoCode      0% agreement (site holds the NAME, sheet holds "US")
      - popRank      15%, and consistently off BY EXACTLY ONE
      - scoreRank    22%, same off-by-one signature
      - parent       sheet self-references, JSON uses null for sovereigns
    Those four are left alone. Fixing them is a separate, deliberate decision.
  * DRY RUN BY DEFAULT. Prints the full field-level diff and writes nothing
    unless --write is passed.

usage: build-countries.py [--write] [--self-test] [--quiet]
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "data", "countries.json")
XLSX = os.path.join(ROOT, "MetroAreas.xlsx")

SHEET = "Country Populations"
DATA_STARTS = 4          # header is row 3
COL_COUNTRY = 7          # H

# field -> 0-based column. Only fields the sheet owns; see DESIGN above.
OWNED = {
    "source": 1, "metroAreas": 2, "teams": 4, "pop": 9, "metroPop": 10,
    "metroPct": 11, "areaSqKm": 12, "continent": 13, "altContinent": 14,
    "states": 15, "counties": 16, "municipal": 17, "scoreTotal": 18,
    "capital": 19, "biggestMetro": 20, "mostImportantMetro": 21,
}
NEVER_TOUCH = ("slug", "name", "parent", "parent_slug", "isoCode",
               "popRank", "scoreRank")


def norm(v):
    """Excel gives floats for whole numbers and pads strings; normalise so a
    cosmetic difference never counts as a change."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        v = v.strip()
        return v or None
    if isinstance(v, float) and abs(v - round(v)) < 1e-9:
        return int(round(v))
    return v


def changed(old, new):
    """True when new genuinely differs from old. A blank cell NEVER clears an
    existing value - upstream silence is not a deletion instruction."""
    if new is None:
        return False
    if isinstance(old, (int, float)) and isinstance(new, (int, float)):
        return abs(float(old) - float(new)) >= 0.51
    return norm(old) != new


def read_sheet(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = {}
    for row in wb[SHEET].iter_rows(min_row=DATA_STARTS, values_only=True):
        if not row or len(row) <= max(OWNED.values()):
            continue
        name = norm(row[COL_COUNTRY])
        if name and name not in rows:      # first occurrence wins
            rows[name] = list(row)
    return rows


def apply(site_rows, sheet, quiet=False):
    """Returns (updated_rows, per_field_counts, row_diffs, unmatched_site,
    unmatched_sheet). Pure apart from reading its arguments."""
    by_name = {}
    for r in site_rows:
        n = norm(r.get("name"))
        if n:
            by_name.setdefault(n, r)

    counts = {f: 0 for f in OWNED}
    diffs = []
    for name, row in sheet.items():
        target = by_name.get(name)
        if target is None:
            continue
        for field, ci in OWNED.items():
            new = norm(row[ci]) if ci < len(row) else None
            old = target.get(field)
            if changed(old, new):
                diffs.append((name, field, old, new))
                counts[field] += 1
                target[field] = new

    unmatched_site = sorted(n for n in by_name if n not in sheet)
    unmatched_sheet = sorted(n for n in sheet if n not in by_name)
    return site_rows, counts, diffs, unmatched_site, unmatched_sheet


def recompute_ranks(rows):
    """Re-derive popRank / scoreRank from the values now in the file.

    Needed because updating pop desynchronises the stored ranks: measured
    2026-08-04, 52 countries would have had a popRank inconsistent with their
    own population (Congo DR and the Philippines swap at 12/13, Tanzania 22->20).
    A page that sorts by rank would visibly contradict the number beside it.

    Recomputed rather than copied from the sheet, deliberately. The sheet ranks
    246 countries; this file holds 247 (the UK has no sheet row), so the sheet's
    ranks cannot be transplanted. And the stored ranks are NOT simply the
    sheet's plus one - only 98 of 240 fit that pattern, so they are just stale.

    Competition ranking: equal values share the better rank (1, 2, 2, 4). Rows
    with no value keep whatever they had rather than being forced to a number.
    """
    out = []
    for field, key in (("popRank", "pop"), ("scoreRank", "scoreTotal")):
        ranked = [r for r in rows if isinstance(r.get(key), (int, float))]
        ranked.sort(key=lambda r: -float(r[key]))
        prev_val, prev_rank = None, 0
        for i, r in enumerate(ranked, 1):
            val = float(r[key])
            rank = prev_rank if val == prev_val else i
            prev_val, prev_rank = val, rank
            if r.get(field) != rank:
                out.append((norm(r.get("name")), field, r.get(field), rank))
                r[field] = rank
    return out


def self_test():
    """Pure decision logic, no workbook, no network."""
    assert norm("  France ") == "France"
    assert norm(1429404000.0) == 1429404000
    assert norm("") is None and norm(None) is None
    # a blank upstream cell must never clear a good value
    assert changed(1000, None) is False
    # sub-unit float noise is not a change
    assert changed(1000, 1000.4) is False
    assert changed(1000, 1001) is True
    assert changed("Europe", "Europe") is False
    assert changed(None, "Asia") is True

    site = [
        {"slug": "india", "name": "India", "pop": 1417492000, "popRank": 26,
         "isoCode": "India", "continent": "Asia"},
        {"slug": "united-kingdom", "name": "United Kingdom", "pop": 69487000,
         "isoCode": "United Kingdom"},
    ]
    sheet = {"India": [None] * 22}
    sheet["India"][COL_COUNTRY] = "India"
    sheet["India"][OWNED["pop"]] = 1429404000
    sheet["India"][OWNED["continent"]] = "Asia"
    rows, counts, diffs, un_site, un_sheet = apply(site, sheet, quiet=True)

    assert rows[0]["pop"] == 1429404000, "population must update"
    assert counts["pop"] == 1 and counts["continent"] == 0
    assert len(diffs) == 1
    # protected fields survive untouched
    assert rows[0]["popRank"] == 26 and rows[0]["isoCode"] == "India"
    assert rows[0]["slug"] == "india"
    # the UK has no sheet row and must keep its values, not vanish
    assert rows[1]["pop"] == 69487000
    assert un_site == ["United Kingdom"] and un_sheet == []
    for f in NEVER_TOUCH:
        assert f not in OWNED, f"{f} must never be writable"

    # ranks: competition style, ties share the better rank, blanks untouched
    rk = [{"name": "A", "pop": 300, "popRank": 9},
          {"name": "B", "pop": 200, "popRank": 9},
          {"name": "C", "pop": 200, "popRank": 9},
          {"name": "D", "pop": 100, "popRank": 9},
          {"name": "E", "popRank": 42}]                 # no pop -> keep 42
    recompute_ranks(rk)
    assert [r.get("popRank") for r in rk] == [1, 2, 2, 4, 42], rk
    assert recompute_ranks(rk) == [], "recompute must be idempotent"
    print("self-test: 22/22 PASS")
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="actually write countries.json (default: dry run)")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--ranks", action="store_true",
                    help="also re-derive popRank/scoreRank from the updated "
                         "values (leaving them stale contradicts the numbers)")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    self_test()  # never touch live data on broken logic

    doc = json.load(open(OUT, encoding="utf-8"))
    rows = doc if isinstance(doc, list) else (doc.get("countries") or [])
    if not rows:
        print("ERROR: could not locate the country rows in countries.json", file=sys.stderr)
        return 1
    before = json.dumps(doc, ensure_ascii=False, sort_keys=True)

    sheet = read_sheet(XLSX)
    rows, counts, diffs, un_site, un_sheet = apply(rows, sheet, args.quiet)

    print(f"countries.json rows: {len(rows)}   sheet rows: {len(sheet)}")
    print(f"field changes: {sum(counts.values())} across {len({d[0] for d in diffs})} countries\n")
    for f, c in sorted(counts.items(), key=lambda kv: -kv[1]):
        if c:
            print(f"   {f:<20} {c:>4} changed")

    if un_site:
        print(f"\nIn countries.json but NOT in the sheet ({len(un_site)}) - left untouched, "
              f"never deleted:\n   {', '.join(un_site)}")
    if un_sheet:
        print(f"\nIn the sheet but NOT in countries.json ({len(un_sheet)}) - NOT auto-added, "
              f"add deliberately with a reviewed slug:\n   {', '.join(un_sheet)}")

    rank_diffs = recompute_ranks(rows) if args.ranks else []
    if args.ranks:
        print(f"\nrank recomputation: {len(rank_diffs)} rank values change")
        for name, field, old, new in sorted(rank_diffs)[:20]:
            print(f"   {name[:26]:<26} {field:<10} {old} -> {new}")
        if len(rank_diffs) > 20:
            print(f"   ... and {len(rank_diffs) - 20} more")
    else:
        stale = recompute_ranks([dict(r) for r in rows])
        if stale:
            print(f"\n⚠  {len(stale)} stored rank values would no longer match the "
                  f"updated numbers. Re-run with --ranks to re-derive them.")

    if not args.quiet and diffs:
        print(f"\n--- full diff ({len(diffs)} changes) ---")
        for name, field, old, new in sorted(diffs):
            o = f"{old:,}" if isinstance(old, (int, float)) else repr(old)
            n = f"{new:,}" if isinstance(new, (int, float)) else repr(new)
            print(f"   {name[:26]:<26} {field:<18} {o:>18} -> {n}")

    after = json.dumps(doc, ensure_ascii=False, sort_keys=True)
    if before == after:
        print("\nNo changes; countries.json already matches the workbook.")
        return 0

    if not args.write:
        print("\nDRY RUN - nothing written. Re-run with --write once the diff above "
              "has been reviewed.")
        print("NOTE: /countries reads this file at BUILD time (readFileSync + "
              "dynamicParams=false), so the commit needs a real Vercel build; a "
              "skip-tagged data commit will not surface it.")
        return 0

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"\nWROTE {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
