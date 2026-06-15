# -*- coding: utf-8 -*-
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, "scripts/build-cfb-data.py")
c = io.open(P, "r", encoding="utf-8").read()

def sub(old, new, n=1):
    global c
    if c.count(old) != n:
        sys.exit("ANCHOR FAIL (%d!=%d): %r" % (c.count(old), n, old[:70]))
    c = c.replace(old, new)

# 1) after loading cfb-colors, add cbb-colors as a fallback (covers FCS / non-FBS
#    schools, e.g. the Ivies and Patriot League). cfb-colors keeps precedence.
sub(
'''    if os.path.exists(_cp):
        for row in _csv.DictReader(open(_cp,encoding="utf-8")):
            CSV_COLORS[(row.get("Cur. Name") or "").strip()]=(hexcol(row.get("Primary")),hexcol(row.get("Secondary")))
''',
'''    if os.path.exists(_cp):
        for row in _csv.DictReader(open(_cp,encoding="utf-8")):
            CSV_COLORS[(row.get("Cur. Name") or "").strip()]=(hexcol(row.get("Primary")),hexcol(row.get("Secondary")))
    # Fallback brand colors for non-FBS (FCS / D-I) schools that aren't in
    # cfb-colors.csv but ARE in the college-basketball color file (same schools).
    # cfb-colors keeps precedence; a normalized key handles minor name drift.
    import re as _re
    def _cnorm(s): return _re.sub(r"[^a-z0-9]","",(s or "").lower())
    CSV_COLORS_NORM={_cnorm(k):v for k,v in CSV_COLORS.items()}
    _cbp=os.path.join(os.path.dirname(os.path.abspath(__file__)),"cbb-colors.csv")
    if os.path.exists(_cbp):
        for row in _csv.DictReader(open(_cbp,encoding="utf-8-sig")):
            _nm=(row.get("Cur. Name") or "").strip()
            if not _nm: continue
            _cols=(hexcol(row.get("Primary")),hexcol(row.get("Secondary")))
            CSV_COLORS.setdefault(_nm,_cols)
            CSV_COLORS_NORM.setdefault(_cnorm(_nm),_cols)
''',
)

# 2) lookup also tries the normalized fallback
sub(
    '        _cc=CSV_COLORS.get(str(cur), (None,None))',
    '        _cc=CSV_COLORS.get(str(cur)) or CSV_COLORS_NORM.get(_cnorm(cur)) or (None,None)',
)

io.open(P, "w", encoding="utf-8").write(c)
print("OK build-cfb-data.py now falls back to cbb-colors.csv for FCS/non-FBS")
