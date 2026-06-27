#!/usr/bin/env python3
"""
Build public/data/champions.json from Champions_History.xlsx.

SOURCE OF TRUTH for "current champions" badges + the /sports/champions board.
Reads the Champions sheet and emits all rows where Is Current = "Y".

Supersedes ZoneZero_Champions.xlsx, which can be retired once the merge is done.
Columns used from Champions_History (post-merge schema):
  Sport, Competition, Champion (Canonical), Scope Type, Year,
  Date Awarded, Next Awarded Date, Tier, Is Current

Run after editing the sheet:
    python scripts/build-champions-data.py

Set env var CHAMPS_SRC to override the default path.
"""
import os, json, datetime, re
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.environ.get("CHAMPS_SRC", os.path.expanduser("~/OneDrive/Excel Files/Champions_History.xlsx"))
OUT  = os.path.join(ROOT, "public", "data", "champions.json")

# Fallback: if Champions_History not yet merged, read legacy ZoneZero file
LEGACY_SRC = os.path.join(ROOT, "ZoneZero_Champions.xlsx")

def to_iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return (v.date() if isinstance(v, datetime.datetime) else v).isoformat()
    if isinstance(v, str) and v.strip():
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
            try:
                return datetime.datetime.strptime(v.strip(), fmt).date().isoformat()
            except ValueError:
                pass
    return None

def to_year(v):
    iso = to_iso(v)
    if iso:
        return int(iso[:4])
    try:
        return int(v)
    except (TypeError, ValueError):
        return None

def cell(v):
    return "" if v is None else (v if isinstance(v, (int, float)) else str(v).strip())

def build_from_history(src):
    """Read Champions_History.xlsx (post-merge) filtered to Is Current = Y."""
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb["Champions"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c).strip() if c is not None else "" for c in rows[0]]
    idx = {h.lower(): i for i, h in enumerate(hdr)}

    def col(*names):
        for n in names:
            if n.lower() in idx:
                return idx[n.lower()]
        return None

    iSport    = col("Sport")
    iComp     = col("Competition")
    iCanon    = col("Champion (Canonical)", "Canonical", "Champion")
    iEra      = col("Champion", "Era Name")
    iScope    = col("Scope Type")
    iYear     = col("Year")
    iDate     = col("Date Awarded", "Date")  # "Date" is used post-merge
    iNext     = col("Next Awarded Date")
    iTier     = col("Tier")
    iCurrent  = col("Is Current")
    iIntl     = col("International"); iCont = col("Continental"); iDom = col("Domestic")

    out = []
    missing_current_col = iCurrent is None
    if missing_current_col:
        print("WARNING: 'Is Current' column not found -- run merge-champions-sources.py first.")
        print("         Falling back to most-recent-year-per-comp logic.")

    if missing_current_col:
        comp_max = {}
        for r in rows[1:]:
            def gv(i): return r[i] if i is not None and i < len(r) else None
            comp = cell(gv(iComp))
            yr   = to_year(gv(iYear))
            if comp and yr:
                if comp not in comp_max or yr > comp_max[comp]:
                    comp_max[comp] = yr

    for r in rows[1:]:
        def g(i): return r[i] if i is not None and i < len(r) else None

        comp = cell(g(iComp))
        if not comp:
            continue

        if not missing_current_col:
            if str(cell(g(iCurrent))).strip().upper() != "Y":
                continue
        else:
            yr = to_year(g(iYear))
            if comp_max.get(comp) != yr:
                continue

        canon = cell(g(iCanon)) if iCanon is not None else ""
        era   =