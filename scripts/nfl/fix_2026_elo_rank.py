#!/usr/bin/env python3
"""
Repair the 2026 ELO Rank formula in NFL_all.xlsx, sheet 'NFL Standings'.

THE DEFECT
----------
Every 2026 row returns rank 1. The formula was copied down without its absolute
ranges being extended, so it reads:

  =SUMPRODUCT(($B$47166:$B$47869=B47950)*($E$47166:$E$47869=E47950)
             *($D$47166:$D$47869=D47950)*($AI$47166:$AI$47869>AI47950))+1

Rows 47166-47869 are the 2025 block. The formula asks for Season = 2026 inside
rows that only contain 2025, matches nothing, and returns 0 + 1. Unlike the
6.9283225680685128 ratings, which clear themselves the moment real results
arrive, this one never self-corrects.

WHY NOT JUST REPOINT THE RANGES
-------------------------------
🔴 160 of the 2026 `AI` cells are #N/A. SUMPRODUCT over a range containing an
error returns that error, so repointing to the 2026 block would turn all 704
ranks from a wrong 1 into #N/A. COUNTIFS ignores non-numeric cells in a
comparison criterion, so it is correct here AND needs no range maintenance in
2027. An ISNUMBER guard returns "" rather than a rank where there is no rating,
because a team with no rating does not have a rank.

The League criterion is KEPT, faithful to the original, even though 2026 is
single-league so it is a no-op. Note for Ashwin: the frozen historical ranks are
pooled ACROSS leagues (1966 has the AFL Chiefs 2nd between two NFL clubs), so if
two leagues ever ran again this criterion would disagree with history. Not
changed here, because the bug is the range and nothing else.

SAFETY
------
- Refuses to run if an active Excel lock file sits beside the workbook.
- Backs the workbook up before writing, and refuses to write if the backup fails.
- Touches ONLY cells in column AJ, on rows 47902-48637, that already carry a
  formula. The 32 week-0 rows hold frozen values and are left alone.
- Sets fullCalcOnLoad so Excel recalculates rather than trusting a stale cache,
  and drops the now-invalid calcChain along with its content-type and
  relationship entries.
- Writes to a temp file in the same folder and only then replaces the original,
  so a half-written file can never be what OneDrive picks up.
- Re-opens the result and verifies before declaring success.

Dry run by default. --write is required to change anything.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

SHEET = "xl/worksheets/sheet3.xml"
FIRST_ROW, LAST_ROW = 47902, 48637
COL = "AJ"
ROOT = Path(__file__).resolve().parent.parent.parent


def new_formula(r: int) -> str:
    """XML-escaped <f> content. Excel stores formulas without the leading '='."""
    return (
        f"IF(ISNUMBER(AI{r}),"
        f"COUNTIFS($B:$B,$B{r},$E:$E,$E{r},$D:$D,$D{r},$AI:$AI,\"&gt;\"&amp;$AI{r})+1,"
        f"\"\")"
    )


CELL_RE = re.compile(r'<c r="' + COL + r'(\d+)"([^>]*?)(/>|>(.*?)</c>)', re.S)


def rewrite_sheet(xml: str) -> tuple[str, int, int]:
    """Replace the AJ formula on every in-range row that has one."""
    changed = 0
    skipped_no_formula = 0

    def repl(m: re.Match) -> str:
        nonlocal changed, skipped_no_formula
        row = int(m.group(1))
        if not (FIRST_ROW <= row <= LAST_ROW):
            return m.group(0)
        attrs, body = m.group(2), m.group(4)
        if m.group(3) == "/>" or body is None or "<f" not in body:
            skipped_no_formula += 1
            return m.group(0)
        # Keep the style index; drop the cached value and any cached type, so
        # Excel cannot render a stale number against a new formula.
        keep = re.search(r'\ss="\d+"', attrs)
        s = keep.group(0) if keep else ""
        changed += 1
        return f'<c r="{COL}{row}"{s}><f>{new_formula(row)}</f></c>'

    return CELL_RE.sub(repl, xml), changed, skipped_no_formula


def self_test() -> int:
    fails = []
    f = new_formula(47934)
    for frag in ('IF(ISNUMBER(AI47934)', 'COUNTIFS($B:$B,$B47934', '"&gt;"&amp;$AI47934', ')+1,"")'):
        if frag not in f:
            fails.append(f"formula missing {frag!r}")
    if "&gt;&gt;" in f or "&amp;amp;" in f:
        fails.append("double-escaped")

    sample = (
        '<row r="47934"><c r="AI47934" s="5"><f>OLD</f><v>6.9</v></c>'
        '<c r="AJ47934" s="7"><f>SUMPRODUCT(1&gt;2)</f><v>1</v></c>'
        '<c r="AK47934" s="7" t="s"><v>3</v></c></row>'
        '<row r="47901"><c r="AJ47901" s="7"><f>KEEPME</f><v>9</v></c></row>'
        '<row r="47902"><c r="AJ47902" s="7"/></row>'
    )
    out, ch, sk = rewrite_sheet(sample)
    if ch != 1:
        fails.append(f"changed {ch}, expected 1")
    if sk != 1:
        fails.append(f"skipped-no-formula {sk}, expected 1")
    if "KEEPME" not in out:
        fails.append("a row outside the range was rewritten")
    if 'SUMPRODUCT(1&gt;2)' in out:
        fails.append("the target formula survived")
    if '<v>1</v>' in out.split('AJ47934')[1][:120]:
        fails.append("the stale cached value survived")
    if 'r="AI47934" s="5"' not in out:
        fails.append("a neighbouring column was disturbed")
    if 'AJ47934" s="7"' not in out:
        fails.append("the style index was lost")
    for x in fails:
        print(f"  FAIL {x}")
    print(f"[self-test] {8 - len(fails)}/8 checks passed")
    return 1 if fails else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workbook", default=r"C:\Users\ashwi\OneDrive\Excel Files\NFL_all.xlsx")
    ap.add_argument("--backup-dir", default=str(ROOT / "_to_delete"))
    ap.add_argument("--write", action="store_true", help="without this, nothing is written")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)

    rc = self_test()
    if args.self_test:
        return rc
    if rc:
        print("ABORT: self-test failed; the workbook was not opened.")
        return rc

    wb = Path(args.workbook)
    if not wb.exists():
        print(f"ABORT: no workbook at {wb}")
        return 1

    lock = wb.with_name("~$" + wb.name)
    if lock.exists() and lock.stat().st_mtime >= wb.stat().st_mtime:
        print(f"ABORT: {lock.name} is newer than the workbook. Excel has it open.")
        return 2

    print(f"workbook {wb}  {wb.stat().st_size / 1e6:.1f} MB")
    zin = zipfile.ZipFile(wb)
    names = zin.namelist()
    if SHEET not in names:
        print(f"ABORT: {SHEET} not in the archive")
        return 1

    sheet_xml = zin.read(SHEET).decode("utf-8")
    out_xml, changed, skipped = rewrite_sheet(sheet_xml)
    print(f"AJ cells rewritten: {changed}   in-range cells with no formula, left alone: {skipped}")
    if changed != 704:
        print(f"ABORT: expected 704 formula cells, found {changed}. The sheet is not what was surveyed.")
        return 3

    book_xml = zin.read("xl/workbook.xml").decode("utf-8")
    if "fullCalcOnLoad" not in book_xml:
        book_xml = re.sub(r"<calcPr([^>]*?)/>", r'<calcPr\1 fullCalcOnLoad="1"/>', book_xml, count=1)
    if "fullCalcOnLoad" not in book_xml:
        print("ABORT: could not set fullCalcOnLoad; refusing to ship stale cached values.")
        return 3

    ct = zin.read("[Content_Types].xml").decode("utf-8")
    ct_new = re.sub(r'<Override[^>]*calcChain\.xml"[^>]*/>', "", ct)
    rels = zin.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rels_new = re.sub(r"<Relationship[^>]*calcChain\.xml\"[^>]*/>", "", rels)

    if not args.write:
        print("\n(dry run; nothing written). Sample of the new formula:")
        print("  =" + new_formula(FIRST_ROW + 32).replace("&gt;", ">").replace("&amp;", "&"))
        return 0

    args_backup = Path(args.backup_dir)
    args_backup.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = args_backup / f"NFL_all_backup_{stamp}.xlsx"
    shutil.copy2(wb, backup)
    if backup.stat().st_size != wb.stat().st_size:
        print("ABORT: backup size does not match the original.")
        return 4
    print(f"backup: {backup}  {backup.stat().st_size / 1e6:.1f} MB")

    tmp = wb.with_name(wb.stem + f".rebuild-{stamp}.tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            if info.filename == "xl/calcChain.xml":
                continue
            if info.filename == SHEET:
                data = out_xml.encode("utf-8")
            elif info.filename == "xl/workbook.xml":
                data = book_xml.encode("utf-8")
            elif info.filename == "[Content_Types].xml":
                data = ct_new.encode("utf-8")
            elif info.filename == "xl/_rels/workbook.xml.rels":
                data = rels_new.encode("utf-8")
            else:
                data = zin.read(info.filename)
            zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zi.compress_type = info.compress_type
            zi.external_attr = info.external_attr
            zout.writestr(zi, data)
    zin.close()

    # ---- verify the rebuild BEFORE it replaces anything -------------------
    zv = zipfile.ZipFile(tmp)
    problems = []
    if len(zv.namelist()) != len(names) - 1:
        problems.append(f"entry count {len(zv.namelist())}, expected {len(names) - 1}")
    if "xl/calcChain.xml" in zv.namelist():
        problems.append("calcChain survived")
    for part in ("[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", SHEET):
        try:
            ET.fromstring(zv.read(part))
        except ET.ParseError as e:
            problems.append(f"{part} does not parse: {e}")
    v = zv.read(SHEET).decode("utf-8")
    if v.count("COUNTIFS($B:$B") != 704:
        problems.append(f"COUNTIFS count {v.count('COUNTIFS($B:$B')}, expected 704")
    # 🔴 The 2025 rows (47198-47869) reference $B$47166:$B$47869 CORRECTLY -- it
    # is their own block. 1,376 AJ cells carry that literal: 704 in 2026, which
    # is the bug, and 672 in 2025, which is right. So the assertion is scoped to
    # the 2026 rows, and separately pins the survivors at exactly 672 so a
    # careless future edit cannot quietly rewrite 2025 as well.
    stale_in_2026 = [
        int(m.group(1))
        for m in re.finditer(r'<c r="AJ(\d+)"[^>]*>(?:(?!</c>).)*?\$B\$47166:\$B\$47869', v, re.S)
        if FIRST_ROW <= int(m.group(1)) <= LAST_ROW
    ]
    if stale_in_2026:
        problems.append(f"the 2025 range survived on {len(stale_in_2026)} AJ cells inside 2026")
    if v.count("$B$47166:$B$47869") != 672:
        problems.append(f"2025's own AJ formulas: {v.count('$B$47166:$B$47869')} left, expected 672")
    zv.close()
    if problems:
        for p in problems:
            print(f"  FAIL {p}")
        tmp.unlink()
        print("ABORT: rebuild failed verification. The original workbook is untouched.")
        return 5

    os.replace(tmp, wb)
    print(f"WROTE {wb}  {wb.stat().st_size / 1e6:.1f} MB")
    print("Excel will recalculate on open (fullCalcOnLoad). Save once to bake the values.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
