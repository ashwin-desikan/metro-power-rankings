#!/usr/bin/env python3
"""Prove the mirror is faithful: for every in-scope sheet, compare
shim[sheet].iter_rows(values_only=True) against openpyxl's own read_only
data_only iter_rows(values_only=True), tuple by tuple, with == AND type
equality per cell (so 5 vs 5.0 counts as a mismatch). Tested against the
specific (min_row, max_row) argument combinations extract.py and
metro_score/sources.py actually use (grepped, listed in ARG_COMBOS below).

Usage:
  python scripts/metro_sync/parity_cells.py --workbook PATH --backend file:DIR
      [--cache-dir DIR] [--sheet NAME ...]

Exit 0 on zero mismatches across all sheets/combos; non-zero otherwise, with
the first 5 mismatches per sheet printed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple

_HERE = Path(__file__).resolve().parent
_SCRIPTS = _HERE.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from metro_sync import supabase_workbook as sw
from metro_sync.backends import parse_backend_spec
from metro_sync.sync_workbook import IN_SCOPE_SHEETS

# (min_row, max_row) combinations actually used against each sheet, grepped
# from scripts/extract.py and scripts/metro_score/sources.py. `None` means
# "not given" (defaults to the sheet's own max_row / whole sheet).
ARG_COMBOS: Dict[str, List[Tuple]] = {
    "Country Populations": [(4, None)],
    "Metro Areas": [(4, None), (1, 3)],
    "Team List": [(2, None)],
    "Universities": [(2, None)],
    "Culture-Infra": [(2, None)],
    "Skyscrapers": [(3, None)],
    "Luxury Hospitality": [(2, None)],
    "Golf-Tennis-F1": [(2, None)],
    "Municipality": [(2, None)],
    "Counties": [(2, None)],
    "States (ISO 3166-2)": [(2, None)],
    "FootballClub_Data": [(2, None)],
    "Tower_Data": [(3, None)],
    "Sheet2": [(4, None)],
    "SKYDB_Counts": [(2, None)],
}


def cells_equal(a, b) -> bool:
    if type(a) is not type(b):
        # int vs float must be caught: 5 != 5.0 in type even though ==.
        # bool is a subclass of int in Python; guard against a bool/int mixup too.
        return False
    return a == b


def compare_sheet(name: str, real_ws, shim_ws, combos) -> List[str]:
    mismatches = []
    for min_row, max_row in combos:
        real_rows = list(real_ws.iter_rows(min_row=min_row, max_row=max_row, values_only=True))
        shim_rows = list(shim_ws.iter_rows(min_row=min_row, max_row=max_row, values_only=True))
        if len(real_rows) != len(shim_rows):
            mismatches.append(
                f"{name} (min_row={min_row}, max_row={max_row}): row count "
                f"{len(real_rows)} (real) vs {len(shim_rows)} (shim)"
            )
            continue
        for i, (rr, sr) in enumerate(zip(real_rows, shim_rows)):
            if len(rr) != len(sr):
                mismatches.append(
                    f"{name} row {(min_row or 1) + i}: tuple length {len(rr)} (real) "
                    f"vs {len(sr)} (shim)"
                )
                continue
            for ci, (rc, sc) in enumerate(zip(rr, sr)):
                if not cells_equal(rc, sc):
                    mismatches.append(
                        f"{name} row {(min_row or 1) + i} col {ci}: "
                        f"{rc!r} ({type(rc).__name__}) real vs {sc!r} ({type(sc).__name__}) shim"
                    )
            if len(mismatches) >= 5:
                return mismatches
    return mismatches


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workbook", required=True)
    ap.add_argument("--backend", default="rest")
    ap.add_argument("--cache-dir")
    ap.add_argument("--sheet", action="append", default=[])
    args = ap.parse_args(argv)

    import openpyxl
    real_wb = openpyxl.load_workbook(args.workbook, read_only=True, data_only=True)
    backend = parse_backend_spec(args.backend)
    shim_wb = sw.load(backend, cache_dir=args.cache_dir)

    scope = args.sheet if args.sheet else IN_SCOPE_SHEETS
    total_mismatches = 0
    for name in scope:
        combos = ARG_COMBOS.get(name, [(None, None)])
        mismatches = compare_sheet(name, real_wb[name], shim_wb[name], combos)
        if mismatches:
            total_mismatches += len(mismatches)
            print(f"MISMATCH in {name} ({len(mismatches)} shown, capped at 5):")
            for m in mismatches[:5]:
                print(f"  {m}")
        else:
            print(f"OK: {name}")

    real_wb.close()
    shim_wb.close()

    if total_mismatches:
        print(f"\nFAILED: {total_mismatches} mismatch line(s) across sheets.")
        return 1
    print(f"\nPASSED: {len(scope)} sheet(s), zero mismatches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
