"""open_workbook.py - one entry point for a script that reads MetroAreas.xlsx
via python_calamine (`CalamineWorkbook.from_path(path).get_sheet_by_name(name)
.to_python(skip_empty_area=True)`), so it can also run with no workbook on
disk, against the Supabase mirror (or a local file: mirror), exactly the way
scripts/extract.py already does with METRO_WORKBOOK_SOURCE=supabase.

open_metro_workbook(path) returns an object exposing the ONE calamine method
the two builders (build-states-directory.py, build-state-metro-scores.py)
actually call: .get_sheet_by_name(name).to_python(skip_empty_area=True) ->
list of rows, each a plain python list, row 0 is the header row, trimmed to
the sheet's used area exactly as skip_empty_area=True does in calamine.

- METRO_WORKBOOK_SOURCE unset or "workbook" (default): opens `path` with
  python_calamine, unchanged behavior.
- METRO_WORKBOOK_SOURCE=supabase: builds a metro_sync backend from
  METRO_SYNC_BACKEND (default "rest" = Supabase; "file:<dir>" for a local
  mirror, same as extract.py) and adapts supabase_workbook's ShimWorkbook to
  the same to_python() shape. `path` is ignored in this mode.

This is ONLY safe to use where output has been proven byte-identical between
workbook mode and mirror mode for the sheets that script reads (Municipality,
Counties, States (ISO 3166-2) are mirrored; a script needing an unmirrored
sheet cannot use this).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Optional


import re as _re
_OOXML_ESC = _re.compile(r"_x([0-9A-Fa-f]{4})_")
_ERRORS = frozenset(("#N/A", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#NULL!", "#NUM!"))


def _as_calamine(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return float(v)
    if isinstance(v, str):
        if v in _ERRORS:
            return ""
        if "_x" in v:
            # OOXML escapes a control character as _xHHHH_. Calamine decodes it,
            # openpyxl's read-only reader does not (Municipality row 93191,
            # 'Utqiag_x001A_vik city', the one such cell on 2026-09-20).
            return _OOXML_ESC.sub(lambda m: chr(int(m.group(1), 16)), v)
    return v


class _AdapterSheet:
    """Wraps a ShimSheet to answer to_python(skip_empty_area=True) the way
    CalamineWorkbook's sheet does: a list of rows (lists), trimmed on the
    right to the sheet's used column width, with wholly-empty trailing rows
    dropped. Calamine's skip_empty_area also drops a wholly-empty LEADING
    area, but MetroAreas.xlsx's mirrored sheets all start at A1 with a header
    row, so that case does not arise here."""

    def __init__(self, shim_sheet):
        self._sheet = shim_sheet

    def to_python(self, skip_empty_area: bool = True) -> List[list]:
        rows = [list(r) for r in self._sheet.iter_rows(values_only=True)]
        if not skip_empty_area:
            return rows
        max_col = 0
        for r in rows:
            for i in range(len(r) - 1, -1, -1):
                if r[i] is not None:
                    if i + 1 > max_col:
                        max_col = i + 1
                    break
        rows = [r[:max_col] for r in rows]
        while rows and all(v is None for v in rows[-1]):
            rows.pop()
        # Calamine and openpyxl disagree about three things, measured cell by
        # cell on 2026-09-20 over Municipality, Counties, States and Metro
        # Areas: an empty cell is '' (not None), every number is a float (not
        # an int where Excel stored a whole number), and an error cell
        # (#N/A, #DIV/0! ...) is ''. The mirror holds openpyxl's view, so the
        # adapter converts. Identical JSON output hid this at first: a builder
        # logged 215 unmatched metros here against 3 under calamine.
        return [[_as_calamine(v) for v in r] for r in rows]


class _AdapterWorkbook:
    def __init__(self, shim_wb):
        self._wb = shim_wb

    def get_sheet_by_name(self, name: str) -> _AdapterSheet:
        return _AdapterSheet(self._wb[name])


def open_metro_workbook(path: Optional[str] = None):
    """Returns a workbook object with .get_sheet_by_name(name).to_python(...),
    from python_calamine against `path`, or from the metro_sync mirror when
    METRO_WORKBOOK_SOURCE=supabase (in which case `path` is ignored)."""
    source = os.environ.get("METRO_WORKBOOK_SOURCE", "workbook").lower()
    if source == "supabase":
        script_dir = Path(__file__).resolve().parents[1]
        sys.path.insert(0, str(script_dir))
        from metro_sync import supabase_workbook as _sw
        from metro_sync.backends import parse_backend_spec as _parse_backend

        backend_spec = os.environ.get("METRO_SYNC_BACKEND", "rest")
        backend = _parse_backend(backend_spec)
        cache_dir = str(script_dir / ".cache" / "metro_sync")
        mktcap_from_sheet = os.environ.get("METRO_SYNC_MKTCAP") == "sheet"
        wb = _sw.load(backend, cache_dir=cache_dir, mktcap_from_sheet=mktcap_from_sheet)
        return _AdapterWorkbook(wb)

    from python_calamine import CalamineWorkbook

    if path is None:
        raise ValueError("open_metro_workbook(path) needs a path in workbook mode")
    return CalamineWorkbook.from_path(str(path))
