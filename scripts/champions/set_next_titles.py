"""Champions ledger: add the 2026 OFC Champions League and set five next-title dates.

WHY. `/sports/champions` showed Auckland City still holding the OFC crown from
12 Apr 2025, with a next-title date of 22 Aug 2026 that had already passed --
because the 2026 final WAS played on 22 Aug 2026 and nobody entered the result.
The Hundred, added by hand on 2026-08-19, shipped with no next-title date at all.
Both are the same root cause: `Next Awarded Date` (column V) is a hand-typed
spreadsheet cell with no producer and no validator. The emit-time rule in
scripts/champions/build_champions.py now mints one when it is missing; this
script fixes the facts that a rule cannot know.

WHAT IT DOES, on the Champions sheet of Champions_History.xlsx:

  edit    V2475  2026-09-05 -> 2026-09-12   US Open Women's final (Ashwin)
  edit    V2476  2026-09-06 -> 2026-09-13   US Open Men's final (Ashwin)
  edit    V6405  2026-11-07 -> 2026-11-15   Rugby League World Cup (Ashwin)
  insert  V6812  (absent)   -> 2027-08-16   The Hundred: no 2027 date announced,
                                            so a year on from the 2026 final
  delete  R6733  'Y'                        retire the 2024-25 OFC row...
  delete  V6733  2026-08-22                 ...and its next-title date with it
  append  row 6813                          OFC Champions League 2025-26:
                                            Auckland City 2-0 Central Coast FC,
                                            22 Aug 2026, Govind Park, Ba, Fiji.
                                            Next: 11 Sep 2027 (OFC announced
                                            Fiji, 29 Aug - 11 Sep 2027).

METHOD -- see [[surgical-xlsx-cell-edit]]. An .xlsx is a zip. Patch only the
target <c> elements inside xl/worksheets/sheet2.xml and copy every other entry
back byte-for-byte with its original ZipInfo. openpyxl's load/save would rewrite
the whole 673 KB workbook from its own model and silently drop whatever that
model does not carry.

  * New strings are written t="inlineStr", NOT into sharedStrings.xml. Adding a
    shared string means renumbering count/uniqueCount, which the surgical rule
    refuses. Row 6812 already proves Excel reads inlineStr here natively.
  * Every cell carries an EXPECTED CURRENT VALUE and the run aborts on any
    mismatch, which is what stops a stale row number editing the wrong place.
  * Cells are located with a real XML parse, never a regex -- a naive
    `<c ...>(.*?)</c>` silently mis-consumes self-closing cells, and this sheet
    has them.

Run:  python scripts/champions/set_next_titles.py            (dry run)
      python scripts/champions/set_next_titles.py --write
"""

import os
import re
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET

SRC = os.path.expanduser(r"~\OneDrive\Excel Files\Champions_History.xlsx")
SHEET = "Champions"
STAMP = "20260827-ofc2026-nextdates"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# --- the plan -------------------------------------------------------------
# (cell, expected current value or None if the cell must be absent, new value)
EDITS = [
    ("V2475", "2026-09-05", "2026-09-12"),   # US Open Women's
    ("V2476", "2026-09-06", "2026-09-13"),   # US Open Men's
    ("V6405", "2026-11-07", "2026-11-15"),   # Rugby League World Cup
    ("V6812", None, "2027-08-16"),           # The Hundred (cell does not exist)
]
DELETES = [
    ("R6733", "Y"),           # OFC 2024-25 is no longer the current champion
    ("V6733", "2026-08-22"),  # a retired row carries no next-title date
]
APPEND_AFTER_ROW = 6812

OFC_SOURCE = (
    "https://www.oceaniafootball.com/fourteenth-ofc-mens-champions-league-crown-"
    "for-auckland-city/"
    ' | "Fourteenth OFC Men\'s Champions League Crown for Auckland City", '
    "22 August 2026 | Auckland City 2-0 Central Coast FC, Govind Park, Ba, Fiji"
)

# column index -> value for the appended row. Mirrors OFC row 6733 exactly.
NEW = {
    1: "Football",                     # Sport
    2: "OFC Champions League",         # Competition
    3: "OFC Champions League",         # Era Name
    4: "2025-26",                      # Season (the column's own convention:
                                       #   2021-22, 2022-23, 2023-24, 2024-25)
    5: 2026,                           # Year
    6: "Auckland City",                # Champion (era name)
    7: "Auckland City",                # Champion (canonical)
    8: "Auckland",                     # Metro
    9: "auckland",                     # Metro Slug
    10: "2026-08-22",                  # Date
    11: "OK",                          # Canonical Status
    12: "Oceania",                     # Scope
    13: "International",               # Scope Type
    14: 5,                             # Tier
    16: "oceaniafootball.com",         # Source
    18: "Y",                           # Is Current
    19: OFC_SOURCE,                    # Date Source
    20: "Men's competition. Final tournament 9-22 Aug 2026, hosted by Fiji.",
    21: "exact | champion_confirmed",  # Date Precision
    22: "2027-09-11",                  # Next Awarded Date -- OFC announced the
                                       #   2027 edition for Fiji, 29 Aug-11 Sep
}
NUMERIC = {5, 14}
STYLE_ROW = 6733  # copy per-column style ids from the OFC row we are succeeding


def col_letter(i):
    s = ""
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def col_index(letter):
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - 64)
    return n


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def sheet_xml_path(z, name):
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    relmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    for nm, rid in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if nm == name:
            return "xl/" + relmap[rid].lstrip("/")
    raise SystemExit("REFUSING: sheet %r not found" % name)


def span(xml, start_tag, close_tag, frm=0):
    """Byte span of one element, handling both <x .../> and <x ...>..</x>.

    A regex like `<c r="V1"[^>]*>(.*?)</c>` mis-consumes a self-closing cell --
    the greedy attribute class swallows the slash, the alternation then matches
    the NEXT `</c>`, and the parse silently reads a neighbouring cell's value.
    This sheet has self-closing cells, so scan properly.
    """
    i = xml.find(start_tag, frm)
    if i < 0:
        return None
    j = xml.find(">", i)
    if j < 0:
        raise SystemExit("REFUSING: unterminated tag at %d" % i)
    if xml[j - 1] == "/":
        return (i, j + 1)
    k = xml.find(close_tag, j)
    if k < 0:
        raise SystemExit("REFUSING: no %s after %d" % (close_tag, i))
    return (i, k + len(close_tag))


def read_values(xml_bytes, shared):
    """{'V2475': '2026-09-05', ...} for every cell, via a real XML parse."""
    out = {}
    root = ET.fromstring(xml_bytes)
    for row in root.iter(NS + "row"):
        for c in row.findall(NS + "c"):
            ref, t = c.get("r"), c.get("t")
            if t == "s":
                v = c.find(NS + "v")
                out[ref] = shared[int(v.text)] if v is not None else ""
            elif t == "inlineStr":
                out[ref] = "".join(x.text or "" for x in c.iter(NS + "t"))
            else:
                v = c.find(NS + "v")
                out[ref] = v.text if v is not None else ""
    return out


def cell_xml(ref, value, style):
    st = ' s="%s"' % style if style else ""
    if isinstance(value, (int, float)):
        return '<c r="%s"%s><v>%s</v></c>' % (ref, st, value)
    return ('<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
            % (ref, st, esc(value)))


def main():
    write = "--write" in sys.argv
    sys.stdout.reconfigure(encoding="utf-8")

    if not os.path.exists(SRC):
        raise SystemExit("REFUSING: %s not found" % SRC)
    lock = os.path.join(os.path.dirname(SRC), "~$" + os.path.basename(SRC))
    if os.path.exists(lock):
        raise SystemExit("REFUSING: %s exists -- Excel has the workbook open." % lock)

    with zipfile.ZipFile(SRC) as z:
        names = z.namelist()
        infos = {n: z.getinfo(n) for n in names}
        blobs = {n: z.read(n) for n in names}
        path = sheet_xml_path(z, SHEET)
    shared = ["".join(t.text or "" for t in si.iter(NS + "t"))
              for si in ET.fromstring(blobs["xl/sharedStrings.xml"]).iter(NS + "si")]
    xml = blobs[path].decode("utf-8", "replace")
    values = read_values(blobs[path], shared)
    print("workbook: %s\n  %d zip entries, sheet %r -> %s, %d shared strings"
          % (SRC, len(names), SHEET, path, len(shared)))

    # ---- refuse before touching anything ---------------------------------
    problems = []
    for ref, expect, new in EDITS:
        got = values.get(ref)
        if expect is None and ref in values:
            problems.append("%s should be ABSENT but holds %r" % (ref, got))
        elif expect is not None and got != expect:
            problems.append("%s expected %r, found %r" % (ref, expect, got))
    for ref, expect in DELETES:
        if values.get(ref) != expect:
            problems.append("%s expected %r, found %r" % (ref, expect, values.get(ref)))
    if ("V%d" % (APPEND_AFTER_ROW + 1)) in values or ("A%d" % (APPEND_AFTER_ROW + 1)) in values:
        problems.append("row %d already exists" % (APPEND_AFTER_ROW + 1))
    for r in range(2, APPEND_AFTER_ROW + 1):
        if values.get("B%d" % r) == NEW[2] and str(values.get("E%d" % r) or "") == str(NEW[5]):
            problems.append("%s %s is already on row %d" % (NEW[2], NEW[5], r))
    if problems:
        for p in problems:
            print("  REFUSE: " + p)
        raise SystemExit("REFUSING: %d precondition(s) failed. Nothing written." % len(problems))
    print("  preconditions OK: %d edits, %d deletes, 1 append"
          % (len(EDITS), len(DELETES)))

    # ---- per-column styles from the row we are succeeding -----------------
    rs = span(xml, '<row r="%d"' % STYLE_ROW, "</row>")
    if not rs:
        raise SystemExit("REFUSING: style row %d not found" % STYLE_ROW)
    styles = {}
    for m in re.finditer(r'<c r="([A-Z]+)%d"' % STYLE_ROW, xml[rs[0]:rs[1]]):
        cs = span(xml, '<c r="%s%d"' % (m.group(1), STYLE_ROW), "</c>", rs[0])
        head = xml[cs[0]:xml.find(">", cs[0])]
        sm = re.search(r'\ss="(\d+)"', head)
        if sm:
            styles[m.group(1)] = sm.group(1)
    print("  styles harvested from row %d: %d columns" % (STYLE_ROW, len(styles)))

    # ---- apply, highest row first so earlier offsets stay valid -----------
    def row_of(ref):
        return int(re.match(r"[A-Z]+(\d+)", ref).group(1))

    plan = ([("edit", r, e, n) for r, e, n in EDITS]
            + [("del", r, e, None) for r, e in DELETES])
    plan.sort(key=lambda x: (row_of(x[1]), col_index(re.match(r"([A-Z]+)", x[1]).group(1))),
              reverse=True)

    for kind, ref, expect, new in plan:
        letter = re.match(r"([A-Z]+)", ref).group(1)
        rn = row_of(ref)
        rowspan = span(xml, '<row r="%d"' % rn, "</row>")
        if not rowspan:
            raise SystemExit("REFUSING: row %d vanished" % rn)
        cs = span(xml, '<c r="%s"' % ref, "</c>", rowspan[0])
        inside = cs and cs[0] < rowspan[1]

        if kind == "del":
            if not inside:
                raise SystemExit("REFUSING: %s not found for delete" % ref)
            xml = xml[:cs[0]] + xml[cs[1]:]
            print("  delete %-6s was %r" % (ref, expect))
            continue

        style = None
        if inside:
            head = xml[cs[0]:xml.find(">", cs[0])]
            sm = re.search(r'\ss="(\d+)"', head)
            style = sm.group(1) if sm else None
            xml = xml[:cs[0]] + cell_xml(ref, new, style) + xml[cs[1]:]
            print("  edit   %-6s %r -> %r" % (ref, expect, new))
        else:
            # Insert in column order: before the first cell whose column sorts
            # after ours, else at the end of the row.
            body = xml[rowspan[0]:rowspan[1]]
            at = None
            for m in re.finditer(r'<c r="([A-Z]+)%d"' % rn, body):
                if col_index(m.group(1)) > col_index(letter):
                    at = rowspan[0] + m.start()
                    break
            if at is None:
                at = xml.rfind("</row>", rowspan[0], rowspan[1])
            xml = xml[:at] + cell_xml(ref, new, styles.get(letter)) + xml[at:]
            print("  insert %-6s -> %r" % (ref, new))
            # widen the row's declared span if the new column falls outside it
            head_end = xml.find(">", rowspan[0])
            head = xml[rowspan[0]:head_end]
            sm = re.search(r'spans="(\d+):(\d+)"', head)
            if sm and col_index(letter) > int(sm.group(2)):
                newhead = head.replace(sm.group(0), 'spans="%s:%d"'
                                       % (sm.group(1), col_index(letter)))
                xml = xml[:rowspan[0]] + newhead + xml[head_end:]
                print("         row %d spans widened to 1:%d" % (rn, col_index(letter)))

    # ---- append the new row ----------------------------------------------
    new_row = APPEND_AFTER_ROW + 1
    cells = "".join(cell_xml("%s%d" % (col_letter(i), new_row), NEW[i],
                             styles.get(col_letter(i)))
                    for i in sorted(NEW))
    if "</sheetData>" not in xml:
        raise SystemExit("REFUSING: no </sheetData> in the sheet XML")
    xml = xml.replace("</sheetData>",
                      '<row r="%d" spans="1:24">%s</row></sheetData>' % (new_row, cells), 1)
    xml, n = re.subn(r'(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")',
                     lambda m: m.group(1) + str(new_row) + m.group(3), xml, count=1)
    if n != 1:
        raise SystemExit("REFUSING: could not widen <dimension>")
    print("  append row %d: %s %s, %s" % (new_row, NEW[2], NEW[4], NEW[6]))
    for i in sorted(NEW):
        print("     %-2s = %r" % (col_letter(i), NEW[i]))

    if not write:
        print("\nDRY RUN. Re-run with --write to apply.")
        return

    backup = SRC + ".bak-" + STAMP
    shutil.copyfile(SRC, backup)
    print("\nbackup: %s" % backup)
    blobs[path] = xml.encode("utf-8")
    tmp = SRC + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
        for nm in names:
            out.writestr(infos[nm], blobs[nm])
    os.replace(tmp, SRC)
    print("written.")

    # ---- verify the write, then verify the consequence --------------------
    with zipfile.ZipFile(SRC) as z:
        if z.testzip() is not None:
            raise SystemExit("REFUSING to declare success: zip failed testzip()")
        if z.namelist() != names:
            raise SystemExit("REFUSING to declare success: zip entry order changed")
        after = read_values(z.read(path), shared)
    bad = []
    for ref, _, new in EDITS:
        if str(after.get(ref)) != str(new):
            bad.append("%s reads %r, wanted %r" % (ref, after.get(ref), new))
    for ref, _ in DELETES:
        if ref in after:
            bad.append("%s still present as %r" % (ref, after.get(ref)))
    for i in sorted(NEW):
        ref = "%s%d" % (col_letter(i), new_row)
        if str(after.get(ref)) != str(NEW[i]):
            bad.append("%s reads %r, wanted %r" % (ref, after.get(ref), NEW[i]))
    for line in bad:
        print("  MISMATCH: " + line)
    if bad:
        raise SystemExit("REFUSING to declare success: %d cell(s) read back wrong. "
                         "Restore %s -- do not edit forward." % (len(bad), backup))
    print("verify: zip OK, entry order unchanged, %d cells read back correct"
          % (len(EDITS) + len(NEW)))
    print("\nNEXT: python scripts/build-champions-history.py   (workbook -> Supabase -> JSON)")


if __name__ == "__main__":
    main()
