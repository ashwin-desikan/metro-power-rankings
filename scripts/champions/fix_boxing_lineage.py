"""Champions ledger: correct the WBA heavyweight date and close the IBF gap.

WHY. Ashwin asked on 2026-08-27 how the three heavyweight belts are tracked.
The answer was: they are not. Nothing in .github/workflows/, mac-mini-jobs/ or
docs/CRON.md references boxing; all 112 rows were entered by hand. Two errors
had accumulated unseen.

  1. WBA -- our row says Murat Gassiev won on 2026-06-26. He did not win
     anything that day: 26 June is the day OLEKSANDR USYK VACATED the WBA, WBC
     and IBF belts. Gassiev won the WBA *Regular* title on 2025-12-12 (KO6 over
     Kubrat Pulev in Dubai) and was elevated to primary WBA champion when Usyk
     vacated, dated 2026-07-01 by BoxRec.

     🔧 WHY 2026-07-01 AND NOT 2025-12-12. This ledger models each sanctioning
     body as one competition with one holder at a time -- the reign chain ends
     a belt's reign "when any competition sharing one of its sanctioning bodies
     crowns someone" [[champions-boxing-nwsl-ship]]. Usyk held the WBA (Super)
     until 26 June, so dating Gassiev from his December Regular win would put
     two WBA champions on the board at once, which is the exact defect that
     model was built to remove. The elevation date is also what we already use
     for Kabayel's WBC row (2026-06-27, an elevation from interim, no fight).
     The December win is recorded in the Date Method cell rather than lost.

  2. IBF -- our lineage stops at Daniel Dubois winning on 2024-06-26 and no
     row after it. Two events are missing: Usyk beat Dubois by KO5 at Wembley
     on 2025-07-19 to regain the belt, and vacated it on 2026-06-26. This adds
     the Usyk row. It is deliberately NOT marked current, because the IBF
     heavyweight title is vacant today -- ibf-usba-boxing.com shows "TITLE
     VACANT" -- and a competition with no current row is how this ledger
     already represents a vacancy. Itauma vs Hrgovic contest it on 2026-08-29.

⚠️ ONE CONVENTION LEFT FOR ASHWIN, NOT GUESSED. The reign suffix is
inconsistent in the source: "Daniel Dubois (Second reign)" sits on a WBO row
although his first reign was the IBF, so the suffix appears to count world
reigns across bodies rather than within one competition. Usyk has held the IBF
before (2024, as part of the undisputed run), so a suffix may be correct here.
This writes the plain name and says so in the Date Method cell.

METHOD -- see [[surgical-xlsx-cell-edit]] and scripts/champions/set_next_titles.py.
Patch only the target <c> elements inside the sheet XML, copy every other zip
entry through byte-for-byte. New strings go in as t="inlineStr" so
sharedStrings.xml never has to be renumbered.

🔴 THE DATE COLUMN HOLDS EXCEL SERIALS, NOT STRINGS, on these rows -- J3250 is
a numeric cell carrying a yyyy-mm-dd number format. Writing an inline string
there would render left-aligned and break the column's type. Dates in column J
are therefore written as serial numbers with the original style preserved.
(Newer appended rows use ISO strings; build-champions-history.py's _norm_date
accepts both, which is why the sheet has drifted into carrying both.)

Run:  python scripts/champions/fix_boxing_lineage.py            (dry run)
      python scripts/champions/fix_boxing_lineage.py --write
"""

import datetime
import os
import re
import shutil
import sys
import zipfile
import xml.etree.ElementTree as ET

SRC = os.path.expanduser(r"~\OneDrive\Excel Files\Champions_History.xlsx")
SHEET = "Champions"
STAMP = "20260827-boxing-lineage"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
EPOCH = datetime.date(1899, 12, 30)  # Excel's 1900 date system, leap-bug included

WBA_ROW = 3250      # Murat Gassiev, the row whose date is wrong
IBF_MODEL_ROW = 3247  # Daniel Dubois 2024 -- style and convention template
APPEND_AFTER_ROW = 6813

USYK_SOURCE = (
    "https://www.aljazeera.com/sports/2025/7/20/usyk-beats-dubois-to-reclaim-undisputed-"
    "heavyweight-crown"
    " | Usyk KO5 Dubois, Wembley Stadium, 19 July 2025"
)
PRIOR_METHOD = ("Begin-reign date from the source table (one row per numbered reign "
                "of the primary lineage).")
GASSIEV_METHOD = (
    "Elevated to primary WBA champion when Usyk vacated on 26 Jun 2026; BoxRec dates the "
    "elevation 1 Jul 2026. Gassiev won the WBA (Regular) title on 12 Dec 2025, KO6 over "
    "Kubrat Pulev in Dubai, and defended it 11 Jul 2026 (TKO6 Peter Kadiru). The earlier "
    "date is not used here because Usyk held the WBA (Super) until 26 Jun and this ledger "
    "allows one holder per body at a time."
)

# --- the plan -------------------------------------------------------------
# cell -> (expected current value, new value). None expected = must be absent.
EDITS = [
    ("J%d" % WBA_ROW, datetime.date(2026, 6, 26), datetime.date(2026, 7, 1)),
    # T3250 already carries the generic note the boxing import wrote on every row;
    # it is replaced rather than appended to, because "begin-reign date from the
    # source table" is exactly the claim that turned out to be wrong here.
    ("T%d" % WBA_ROW, PRIOR_METHOD, GASSIEV_METHOD),
]

# The appended IBF row. Mirrors row 3247 (IBF, Dubois 2024).
NEW = {
    1: "Boxing",
    2: "World Heavyweight Championship (IBF)",
    3: "World Heavyweight Championship (IBF)",
    5: 2025,                              # Year
    6: "Oleksandr Usyk",                  # Champion (era name)
    7: "Oleksandr Usyk",                  # Champion (canonical)
    10: datetime.date(2025, 7, 19),       # Date
    11: "OK",
    12: "World",
    13: "International",
    14: 3,
    16: "boxrec.com",
    19: USYK_SOURCE,
    20: ("Regained the IBF title by KO5 over Daniel Dubois at Wembley, 19 Jul 2025, "
         "restoring undisputed status. Vacated the WBA, WBC and IBF belts on 26 Jun 2026, "
         "which is why this row is not current: the IBF heavyweight title is vacant, and "
         "Itauma vs Hrgovic contest it on 29 Aug 2026. Reign suffix left off deliberately "
         "- the sheet's convention counts reigns across bodies, not within a competition, "
         "and that is Ashwin's ruling to make, not this script's."),
    21: "exact | champion_confirmed",
    # 18 (Is Current) deliberately ABSENT -- the belt is vacant.
    # 22 (Next Awarded Date) deliberately ABSENT -- a retired row carries none.
}
DATE_COLS = {10}  # columns written as Excel serials rather than strings


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
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def serial(d):
    return (d - EPOCH).days


def sheet_xml_path(z, name):
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    relmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    for nm, rid in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if nm == name:
            return "xl/" + relmap[rid].lstrip("/")
    raise SystemExit("REFUSING: sheet %r not found" % name)


def span(xml, start_tag, close_tag, frm=0):
    """Byte span of one element, correct for both <x .../> and <x ...>..</x>."""
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
    """{'J3250': date|str|num} for every cell, via a real XML parse."""
    out = {}
    for row in ET.fromstring(xml_bytes).iter(NS + "row"):
        for c in row.findall(NS + "c"):
            ref, t = c.get("r"), c.get("t")
            if t == "s":
                v = c.find(NS + "v")
                out[ref] = shared[int(v.text)] if v is not None else ""
            elif t == "inlineStr":
                out[ref] = "".join(x.text or "" for x in c.iter(NS + "t"))
            else:
                v = c.find(NS + "v")
                if v is None:
                    continue
                txt = v.text
                col = re.match(r"([A-Z]+)", ref).group(1)
                if col_index(col) in DATE_COLS and txt and txt.isdigit():
                    out[ref] = EPOCH + datetime.timedelta(days=int(txt))
                else:
                    out[ref] = txt
    return out


def cell_xml(ref, value, style):
    st = ' s="%s"' % style if style else ""
    if isinstance(value, datetime.date):
        return '<c r="%s"%s><v>%d</v></c>' % (ref, st, serial(value))
    if isinstance(value, (int, float)):
        return '<c r="%s"%s><v>%s</v></c>' % (ref, st, value)
    return ('<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>'
            % (ref, st, esc(value)))


def main():
    write = "--write" in sys.argv
    sys.stdout.reconfigure(encoding="utf-8")

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
    print("workbook: %s\n  %d zip entries, sheet %r, %d shared strings"
          % (SRC, len(names), SHEET, len(shared)))

    # ---- refuse before touching anything ---------------------------------
    problems = []
    if values.get("B%d" % WBA_ROW) != "World Heavyweight Championship (WBA)":
        problems.append("row %d is not the WBA row (B=%r)" % (WBA_ROW, values.get("B%d" % WBA_ROW)))
    if values.get("F%d" % WBA_ROW) != "Murat Gassiev":
        problems.append("row %d champion is %r, expected 'Murat Gassiev'"
                        % (WBA_ROW, values.get("F%d" % WBA_ROW)))
    for ref, expect, _ in EDITS:
        got = values.get(ref)
        if expect is None and ref in values:
            problems.append("%s should be ABSENT but holds %r" % (ref, got))
        elif expect is not None and got != expect:
            problems.append("%s expected %r, found %r" % (ref, expect, got))
    if values.get("B%d" % IBF_MODEL_ROW) != "World Heavyweight Championship (IBF)":
        problems.append("model row %d is not an IBF row" % IBF_MODEL_ROW)
    new_row = APPEND_AFTER_ROW + 1
    if ("A%d" % new_row) in values:
        problems.append("row %d already exists" % new_row)
    for r in range(2, new_row):
        if (values.get("B%d" % r) == NEW[2] and values.get("F%d" % r) == NEW[6]):
            problems.append("%s / %s already on row %d" % (NEW[2], NEW[6], r))
    if problems:
        for p in problems:
            print("  REFUSE: " + p)
        raise SystemExit("REFUSING: %d precondition(s) failed. Nothing written." % len(problems))
    print("  preconditions OK: %d edits, 1 append" % len(EDITS))

    # ---- styles from the model row ---------------------------------------
    rs = span(xml, '<row r="%d"' % IBF_MODEL_ROW, "</row>")
    styles = {}
    for m in re.finditer(r'<c r="([A-Z]+)%d"' % IBF_MODEL_ROW, xml[rs[0]:rs[1]]):
        cs = span(xml, '<c r="%s%d"' % (m.group(1), IBF_MODEL_ROW), "</c>", rs[0])
        sm = re.search(r'\ss="(\d+)"', xml[cs[0]:xml.find(">", cs[0])])
        if sm:
            styles[m.group(1)] = sm.group(1)
    print("  styles harvested from row %d: %d columns" % (IBF_MODEL_ROW, len(styles)))

    # ---- apply the edits, highest cell first ------------------------------
    for ref, expect, new in sorted(
            EDITS, key=lambda e: col_index(re.match(r"([A-Z]+)", e[0]).group(1)), reverse=True):
        letter = re.match(r"([A-Z]+)", ref).group(1)
        rn = int(re.match(r"[A-Z]+(\d+)", ref).group(1))
        rowspan = span(xml, '<row r="%d"' % rn, "</row>")
        cs = span(xml, '<c r="%s"' % ref, "</c>", rowspan[0])
        inside = cs and cs[0] < rowspan[1]
        if inside:
            sm = re.search(r'\ss="(\d+)"', xml[cs[0]:xml.find(">", cs[0])])
            xml = xml[:cs[0]] + cell_xml(ref, new, sm.group(1) if sm else None) + xml[cs[1]:]
            print("  edit   %-7s %r -> %r" % (ref, expect, new))
        else:
            body = xml[rowspan[0]:rowspan[1]]
            at = None
            for m in re.finditer(r'<c r="([A-Z]+)%d"' % rn, body):
                if col_index(m.group(1)) > col_index(letter):
                    at = rowspan[0] + m.start()
                    break
            if at is None:
                at = xml.rfind("</row>", rowspan[0], rowspan[1])
            xml = xml[:at] + cell_xml(ref, new, styles.get(letter)) + xml[at:]
            print("  insert %-7s -> %r" % (ref, str(new)[:60] + "..."))
            head_end = xml.find(">", rowspan[0])
            head = xml[rowspan[0]:head_end]
            sm = re.search(r'spans="(\d+):(\d+)"', head)
            if sm and col_index(letter) > int(sm.group(2)):
                xml = (xml[:rowspan[0]]
                       + head.replace(sm.group(0), 'spans="%s:%d"' % (sm.group(1), col_index(letter)))
                       + xml[head_end:])
                print("         row %d spans widened to 1:%d" % (rn, col_index(letter)))

    # ---- append the IBF row ----------------------------------------------
    cells = "".join(cell_xml("%s%d" % (col_letter(i), new_row), NEW[i],
                             styles.get(col_letter(i))) for i in sorted(NEW))
    xml = xml.replace("</sheetData>",
                      '<row r="%d" spans="1:24">%s</row></sheetData>' % (new_row, cells), 1)
    xml, n = re.subn(r'(<dimension ref="[A-Z]+\d+:[A-Z]+)(\d+)(")',
                     lambda m: m.group(1) + str(new_row) + m.group(3), xml, count=1)
    if n != 1:
        raise SystemExit("REFUSING: could not widen <dimension>")
    print("  append row %d: %s, %s, %s (NOT current -- belt is vacant)"
          % (new_row, NEW[2], NEW[6], NEW[10]))
    for i in sorted(NEW):
        print("     %-2s = %r" % (col_letter(i), str(NEW[i])[:70]))

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
    for i in sorted(NEW):
        ref = "%s%d" % (col_letter(i), new_row)
        if str(after.get(ref)) != str(NEW[i]):
            bad.append("%s reads %r, wanted %r" % (ref, after.get(ref), NEW[i]))
    if ("R%d" % new_row) in after:
        bad.append("R%d present -- the vacant belt must have no Is Current" % new_row)
    for line in bad:
        print("  MISMATCH: " + line)
    if bad:
        raise SystemExit("REFUSING to declare success: %d cell(s) wrong. Restore %s -- "
                         "do not edit forward." % (len(bad), backup))
    print("verify: zip OK, entry order unchanged, %d cells read back correct"
          % (len(EDITS) + len(NEW)))
    print("\nNEXT: python scripts/build-champions-history.py")


if __name__ == "__main__":
    main()
