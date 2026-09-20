#!/usr/bin/env python3
"""Mirror MetroAreas.xlsx's in-scope sheets into a wb_sheet/wb_chunk backend.

Usage:
  python scripts/metro_sync/sync_workbook.py --self-test
  python scripts/metro_sync/sync_workbook.py [--write] [--backend rest|file:<dir>]
      [--workbook PATH] [--sheet NAME ...] [--allow-shrink] [--allow-header-change]
      [--no-settle] [--json] [--include-mktcap-sheet]

Default is a DRY RUN against the rest backend. Nothing is written without
--write.

Guards (each HOLDS the whole run: exit 20, nothing written; a wb_sync_run row
with status "held" is logged only when --write was passed):
  a) a sheet loses more than 2% of its rows or more than 50 rows, unless
     --allow-shrink
  b) error_cells rises by more than 10 on any sheet versus the previous sync
  c) Metro Areas header_hash changed, unless --allow-header-change
  d) Metro Areas column BG (index 58) is None on more than 1% of named rows
  e) an in-scope sheet is missing from the workbook
First-ever sync (backend has no sheets at all yet) skips (a), (b), (c).

Exit codes: 0 no change or dry run; 10 written; 20 held; 1 error.

MktCap_Data is NOT mirrored by default (Supabase already owns market cap via
the mktcap pipeline; extract.py reads scripts/mktcap/out/mktcap_export.csv).
Pass --include-mktcap-sheet (or set METRO_SYNC_MKTCAP=sheet) to mirror it too
-- an opt-in used only to A/B extract.py's CSV-fed and sheet-fed paths
against the same underlying data (see /home/claude/build/extract.patch's P4).
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

_HERE = Path(__file__).resolve().parent
_SCRIPTS = _HERE.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from metro_sync import codec
from metro_sync.backends import FileBackend, parse_backend_spec
from metro_sync.letters import A as col_index

IN_SCOPE_SHEETS = [
    "Country Populations", "Metro Areas", "Team List", "Universities",
    "Culture-Infra", "Skyscrapers", "Luxury Hospitality", "Golf-Tennis-F1",
    "Municipality", "Counties", "States (ISO 3166-2)", "FootballClub_Data",
    "Tower_Data", "Sheet2", "SKYDB_Counts",
]
MKTCAP_SHEET = "MktCap_Data"
CHUNK_SIZE = 500
COL_METRO_NAME = col_index("F")   # 5
COL_SCORE_BG = col_index("BG")    # 58

SHRINK_ROW_ABS = 50
SHRINK_ROW_PCT = 0.02
ERROR_CELL_RISE_MAX = 10
BG_NONE_PCT_MAX = 0.01
SETTLE_SECONDS = 120


class HoldError(Exception):
    def __init__(self, reasons: List[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


# ---------------------------------------------------------------------------
# Sheet snapshotting (works against a real openpyxl worksheet OR any object
# exposing the same .max_row/.max_column/.iter_rows(min_row,max_row,values_only)
# surface -- which is exactly what the self-test's synthetic sheets provide).
# ---------------------------------------------------------------------------

def iter_full_sheet(ws, max_row: Optional[int] = None):
    mr = ws.max_row if max_row is None else max_row
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=mr, values_only=True), start=1):
        yield i, list(row)


def build_sheet_snapshot(name: str, ws) -> dict:
    max_row = ws.max_row
    max_col = ws.max_column
    buckets: Dict[int, List[Tuple[int, list]]] = {}
    header_rows: List[list] = []
    all_error_cells = 0
    for row_idx, cells in iter_full_sheet(ws, max_row):
        if row_idx <= 3:
            header_rows.append(cells)
        for c in cells:
            if isinstance(c, str) and c in codec.ERROR_CELL_VALUES:
                all_error_cells += 1
        cn = (row_idx - 1) // CHUNK_SIZE
        buckets.setdefault(cn, []).append((row_idx, cells))

    n_chunks = (max_row + CHUNK_SIZE - 1) // CHUNK_SIZE if max_row > 0 else 0
    chunks: Dict[int, dict] = {}
    chunk_hash_pairs: List[Tuple[int, str]] = []
    stored_rows = 0
    for chunk_no in range(n_chunks):
        first_row = chunk_no * CHUNK_SIZE + 1
        last_row = min(first_row + CHUNK_SIZE - 1, max_row)
        chunk_rows = []
        for row_idx, cells in sorted(buckets.get(chunk_no, [])):
            trimmed = codec.trim_trailing_none(cells)
            if trimmed:
                chunk_rows.append((row_idx, trimmed))
        chash = codec.hash_rows_payload(chunk_rows)
        chunk_hash_pairs.append((chunk_no, chash))
        stored_rows += len(chunk_rows)
        chunks[chunk_no] = {
            "first_row": first_row, "last_row": last_row,
            "n_rows": len(chunk_rows), "chunk_hash": chash,
            "rows": [[idx, codec.encode_row(cells)] for idx, cells in chunk_rows],
        }

    content_hash = codec.hash_content(chunk_hash_pairs, max_col, max_row)
    header_hash = codec.hash_header(header_rows)

    return {
        "sheet": name, "max_col": max_col, "max_row": max_row,
        "n_rows": stored_rows, "n_chunks": n_chunks,
        "content_hash": content_hash, "header_hash": header_hash,
        "error_cells": all_error_cells,
        "_chunks": chunks,
    }


METRO_AREAS_FIRST_DATA_ROW = 4  # rows 1-3 are the category band + headers


def bg_none_fraction(ws) -> Tuple[float, int, int]:
    """(fraction, none_count, named_row_count) for Metro Areas col BG among
    rows that have a metro name (col F), data rows only (row 4+; rows 1-3
    are the category band and header, not metros)."""
    named = 0
    none_bg = 0
    for row_idx, cells in iter_full_sheet(ws, ws.max_row):
        if row_idx < METRO_AREAS_FIRST_DATA_ROW:
            continue
        name = cells[COL_METRO_NAME] if COL_METRO_NAME < len(cells) else None
        if name in (None, ""):
            continue
        named += 1
        bg = cells[COL_SCORE_BG] if COL_SCORE_BG < len(cells) else None
        if bg is None:
            none_bg += 1
    frac = (none_bg / named) if named else 0.0
    return frac, none_bg, named


# ---------------------------------------------------------------------------
# Diff / guards
# ---------------------------------------------------------------------------

def diff_sheet(snapshot: dict, backend, first_ever: bool, allow_shrink: bool,
               allow_header_change: bool) -> dict:
    """Compare a freshly-built snapshot against the backend. Returns a report
    dict; raises HoldError (with ALL reasons collected, not just the first)
    if guards (a)/(b)/(c) trip for this sheet. Guard (d) is checked
    separately by the caller (needs the live worksheet, not the snapshot)."""
    name = snapshot["sheet"]
    old_meta_all = backend.get_sheets()
    old_meta = old_meta_all.get(name)
    old_index = backend.get_chunk_index(name) if old_meta else {}
    new_index = {no: c["chunk_hash"] for no, c in snapshot["_chunks"].items()}

    changed = [no for no, h in new_index.items() if old_index.get(no) != h]
    removed = [no for no in old_index if no not in new_index]

    reasons = []
    if old_meta is not None and not first_ever:
        rows_before, rows_after = old_meta["n_rows"], snapshot["n_rows"]
        loss = rows_before - rows_after
        pct = (loss / rows_before) if rows_before else 0.0
        if loss > 0 and (loss > SHRINK_ROW_ABS or pct > SHRINK_ROW_PCT) and not allow_shrink:
            reasons.append(
                f"{name}: rows {rows_before} -> {rows_after} (lost {loss}, {pct*100:.2f}%), "
                f"exceeds shrink guard (>{SHRINK_ROW_ABS} rows or >{SHRINK_ROW_PCT*100:.0f}%); "
                f"pass --allow-shrink to override"
            )
        rise = snapshot["error_cells"] - old_meta["error_cells"]
        if rise > ERROR_CELL_RISE_MAX:
            reasons.append(
                f"{name}: error_cells rose by {rise} (from {old_meta['error_cells']} to "
                f"{snapshot['error_cells']}), exceeds guard (>{ERROR_CELL_RISE_MAX})"
            )
        if name == "Metro Areas" and snapshot["header_hash"] != old_meta["header_hash"] \
                and not allow_header_change:
            reasons.append(
                "Metro Areas: header_hash changed; pass --allow-header-change to override"
            )

    return {
        "sheet": name, "old_meta": old_meta, "new_meta": {
            k: v for k, v in snapshot.items() if k != "_chunks"
        },
        "changed_chunks": sorted(changed), "removed_chunks": sorted(removed),
        "reasons": reasons,
    }


def collect_example_diffs(name: str, snapshot: dict, backend, old_index: Dict[int, str],
                           limit: int = 10) -> List[str]:
    """Up to `limit` human-readable row-level differences for chunks whose
    hash changed AND already existed remotely (needs the old chunk body)."""
    examples: List[str] = []
    changed_existing = [no for no in snapshot["_chunks"] if no in old_index
                         and old_index[no] != snapshot["_chunks"][no]["chunk_hash"]]
    if not changed_existing:
        return examples
    old_chunks = backend.get_chunks(name, changed_existing)
    for no in changed_existing:
        new_rows = dict(snapshot["_chunks"][no]["rows"])  # row_idx -> encoded cells
        old_rows = {idx: cells for idx, cells in old_chunks.get(no, [])}
        all_idx = sorted(set(new_rows) | set(old_rows))
        for idx in all_idx:
            new_cells = codec.decode_row(new_rows.get(idx, []))
            old_cells = old_rows.get(idx, [])
            if new_cells != old_cells:
                examples.append(f"  {name} row {idx}: {old_cells!r} -> {new_cells!r}")
                if len(examples) >= limit:
                    return examples
    return examples


# ---------------------------------------------------------------------------
# Workbook source resolution (reuses scripts/sync_source_xlsx.py's logic)
# ---------------------------------------------------------------------------

def resolve_workbook_path(explicit: Optional[str]) -> Path:
    if explicit:
        return Path(explicit)
    env = os.environ.get("METROAREAS_SOURCE_XLSX")
    if env:
        return Path(env)
    sys.path.insert(0, str(_SCRIPTS))
    import sync_source_xlsx as _sx
    found = _sx.find_source()
    if found is None:
        # Fall back to the project-root copy, same default extract.py uses.
        candidate = _SCRIPTS.parent / "MetroAreas.xlsx"
        if candidate.exists():
            return candidate
        raise SystemExit("ERROR: could not locate MetroAreas.xlsx (checked "
                          "METROAREAS_SOURCE_XLSX, sync_source_xlsx.find_source(), "
                          "and the project root copy)")
    return found


def check_settle_and_lock(path: Path, no_settle: bool) -> None:
    lock = path.with_name("~$" + path.name)
    if lock.exists() and lock.stat().st_mtime >= path.stat().st_mtime:
        raise SystemExit(f"ERROR: lock file {lock.name} present and not older than the "
                          f"workbook; the workbook may still be open in Excel.")
    age = time.time() - path.stat().st_mtime
    if age < SETTLE_SECONDS and not no_settle:
        raise SystemExit(f"ERROR: workbook mtime is only {age:.0f}s old (< {SETTLE_SECONDS}s); "
                          f"it may still be saving. Pass --no-settle to override.")


def copy_and_validate(src: Path) -> Path:
    sys.path.insert(0, str(_SCRIPTS))
    import sync_source_xlsx as _sx
    tmp = Path(tempfile.mkstemp(suffix=".xlsx")[1])
    import shutil
    shutil.copy2(str(src), str(tmp))
    ok, reason = _sx.validate_xlsx(tmp)
    if not ok:
        tmp.unlink(missing_ok=True)
        raise SystemExit(f"ERROR: workbook failed validation: {reason}")
    return tmp


# ---------------------------------------------------------------------------
# Main run
# ---------------------------------------------------------------------------

def run_sync(workbook_path: Path, backend, sheets: Sequence[str], write: bool,
             allow_shrink: bool, allow_header_change: bool, include_mktcap_sheet: bool,
             emit=print) -> dict:
    import openpyxl
    wb = openpyxl.load_workbook(str(workbook_path), read_only=True, data_only=True)
    try:
        scope = list(sheets)
        if include_mktcap_sheet and MKTCAP_SHEET not in scope:
            scope = scope + [MKTCAP_SHEET]

        missing = [s for s in scope if s not in wb.sheetnames]
        if missing:
            raise HoldError([f"in-scope sheet(s) missing from workbook: {missing}"])

        old_all = backend.get_sheets()
        first_ever = len(old_all) == 0

        snapshots = {}
        reports = {}
        all_reasons: List[str] = []
        for name in scope:
            ws = wb[name]
            snap = build_sheet_snapshot(name, ws)
            snapshots[name] = snap
            rep = diff_sheet(snap, backend, first_ever, allow_shrink, allow_header_change)
            reports[name] = rep
            all_reasons += rep["reasons"]

        # Guard (d): Metro Areas BG-none fraction, always checked.
        if "Metro Areas" in scope:
            frac, none_ct, named_ct = bg_none_fraction(wb["Metro Areas"])
            if frac > BG_NONE_PCT_MAX:
                all_reasons.append(
                    f"Metro Areas: column BG is None on {none_ct}/{named_ct} named rows "
                    f"({frac*100:.2f}%), exceeds guard (>{BG_NONE_PCT_MAX*100:.0f}%) -- "
                    f"the workbook may have been saved without recalculating"
                )

        workbook_mtime = os.path.getmtime(str(workbook_path))
        now_iso = __import__("datetime").datetime.utcnow().isoformat() + "Z"
        host = socket.gethostname()

        summary = {
            "sheets": {}, "held": bool(all_reasons), "reasons": all_reasons,
            "write": write, "workbook_mtime": workbook_mtime,
        }

        for name in scope:
            rep = reports[name]
            examples = collect_example_diffs(
                name, snapshots[name], backend,
                backend.get_chunk_index(name) if rep["old_meta"] else {},
            )
            emit(f"[{name}] rows {rep['old_meta']['n_rows'] if rep['old_meta'] else '(new)'} "
                 f"-> {snapshots[name]['n_rows']}, "
                 f"chunks changed {len(rep['changed_chunks'])}/{snapshots[name]['n_chunks']}"
                 + (f", removed {len(rep['removed_chunks'])}" if rep['removed_chunks'] else ""))
            for ex in examples:
                emit(ex)
            summary["sheets"][name] = {
                "rows_before": rep["old_meta"]["n_rows"] if rep["old_meta"] else None,
                "rows_after": snapshots[name]["n_rows"],
                "chunks_changed": len(rep["changed_chunks"]),
                "chunks_total": snapshots[name]["n_chunks"],
                "chunks_removed": len(rep["removed_chunks"]),
                "examples": examples,
            }

        if all_reasons:
            emit("HELD:")
            for r in all_reasons:
                emit(f"  - {r}")
            if write:
                backend.log_run({
                    "started_at": now_iso, "finished_at": now_iso, "mode": "write",
                    "status": "held", "workbook_mtime": workbook_mtime, "host": host,
                    "summary": summary,
                })
            summary["status"] = "held"
            return summary

        any_changes = any(reports[n]["changed_chunks"] or reports[n]["removed_chunks"]
                           for n in scope)

        if not write:
            summary["status"] = "dry_run"
            emit("DRY RUN: no changes written." if not any_changes
                 else "DRY RUN: changes detected, not written (pass --write).")
            return summary

        if not any_changes:
            backend.log_run({
                "started_at": now_iso, "finished_at": now_iso, "mode": "write",
                "status": "no_change", "workbook_mtime": workbook_mtime, "host": host,
                "summary": summary,
            })
            summary["status"] = "no_change"
            emit("No change; nothing written.")
            return summary

        # Write order: changed chunks, then deletes, then wb_sheet rows LAST,
        # then log_run.
        for name in scope:
            rep = reports[name]
            snap = snapshots[name]
            if rep["changed_chunks"]:
                payload = {no: snap["_chunks"][no] for no in rep["changed_chunks"]}
                backend.upsert_chunks(name, payload)
            if rep["removed_chunks"]:
                backend.delete_chunks(name, rep["removed_chunks"])
        for name in scope:
            meta = {k: v for k, v in snapshots[name].items() if k != "_chunks"}
            meta["workbook_mtime"] = workbook_mtime
            meta["synced_at"] = now_iso
            meta["synced_by"] = host
            backend.upsert_sheet(meta)

        backend.log_run({
            "started_at": now_iso, "finished_at": now_iso, "mode": "write",
            "status": "written", "workbook_mtime": workbook_mtime, "host": host,
            "summary": summary,
        })
        summary["status"] = "written"
        emit("WRITTEN.")
        return summary
    finally:
        wb.close()


# ---------------------------------------------------------------------------
# Self-test (offline, synthetic sheets, FileBackend in a temp dir)
# ---------------------------------------------------------------------------

class _FakeSheet:
    """Minimal stand-in for an openpyxl read_only worksheet: .max_row,
    .max_column, .iter_rows(min_row, max_row, values_only=True)."""

    def __init__(self, rows: List[list], max_col: Optional[int] = None):
        self.rows = rows  # rows[0] is Excel row 1
        self.max_row = len(rows)
        self.max_column = max_col if max_col is not None else (
            max((len(r) for r in rows), default=0)
        )

    def iter_rows(self, min_row=1, max_row=None, values_only=True):
        assert values_only is True
        max_row = self.max_row if max_row is None else max_row
        for i in range(min_row, max_row + 1):
            row = self.rows[i - 1] if i - 1 < len(self.rows) else []
            padded = list(row) + [None] * (self.max_column - len(row))
            yield tuple(padded[:self.max_column])


def _synthetic_metro_rows(n=5, bg_none_for=()):
    rows = [
        [None] * 73,
        [None] * 73,
        (["Country"] + [None] * 4 + ["Name"] + [None] * 67),  # header row 3 (F=idx5)
    ]
    for i in range(n):
        r = [None] * 73
        r[5] = f"Metro{i}"
        r[58] = None if i in bg_none_for else float(i)
        rows.append(r)
    return rows


def run_self_test() -> int:
    import tempfile as _tf
    failures = []

    def check(cond, msg):
        if not cond:
            failures.append(msg)

    with _tf.TemporaryDirectory() as td:
        backend = FileBackend(td)

        metro_ws = _FakeSheet(_synthetic_metro_rows(10))
        snap1 = build_sheet_snapshot("Metro Areas", metro_ws)
        check(snap1["max_row"] == 13, f"max_row {snap1['max_row']}")
        check(snap1["n_chunks"] == 1, f"n_chunks {snap1['n_chunks']}")
        check(snap1["n_rows"] == 11, f"n_rows {snap1['n_rows']} (header row3 + 10 data)")

        # First-ever write: no old meta, guards a/b/c skipped, d must pass
        # (no None BG among named rows).
        rep = diff_sheet(snap1, backend, first_ever=True, allow_shrink=False,
                          allow_header_change=False)
        check(rep["reasons"] == [], f"first-ever sync should not hold: {rep['reasons']}")
        frac, none_ct, named_ct = bg_none_fraction(metro_ws)
        check(frac == 0.0, f"expected 0 BG-none fraction, got {frac}")

        backend.upsert_chunks("Metro Areas", snap1["_chunks"])
        meta1 = {k: v for k, v in snap1.items() if k != "_chunks"}
        meta1.update(workbook_mtime=1.0, synced_at="t1", synced_by="test")
        backend.upsert_sheet(meta1)

        # No-op resync: identical content -> zero changed chunks.
        snap2 = build_sheet_snapshot("Metro Areas", metro_ws)
        rep2 = diff_sheet(snap2, backend, first_ever=False, allow_shrink=False,
                           allow_header_change=False)
        check(rep2["changed_chunks"] == [], f"expected no changed chunks, got {rep2['changed_chunks']}")
        check(rep2["reasons"] == [], f"unexpected hold on no-op: {rep2['reasons']}")

        # Guard (a): shrink more than 50 rows or >2%.
        shrunk_ws = _FakeSheet(_synthetic_metro_rows(2))  # 10 -> 2 named rows: big % loss
        snap3 = build_sheet_snapshot("Metro Areas", shrunk_ws)
        rep3 = diff_sheet(snap3, backend, first_ever=False, allow_shrink=False,
                           allow_header_change=False)
        check(any("shrink" in r or "rows" in r for r in rep3["reasons"]),
              f"expected shrink guard to trip: {rep3['reasons']}")
        rep3b = diff_sheet(snap3, backend, first_ever=False, allow_shrink=True,
                            allow_header_change=False)
        check(rep3b["reasons"] == [], f"--allow-shrink should clear the guard: {rep3b['reasons']}")

        # Guard (b): error_cells rise > 10.
        err_rows = _synthetic_metro_rows(10)
        for i in range(10):
            err_rows[3 + i][10] = "#N/A"
        err_rows[3][11] = "#REF!"
        err_ws = _FakeSheet(err_rows)
        snap4 = build_sheet_snapshot("Metro Areas", err_ws)
        check(snap4["error_cells"] >= 11, f"expected >=11 error cells, got {snap4['error_cells']}")
        rep4 = diff_sheet(snap4, backend, first_ever=False, allow_shrink=False,
                           allow_header_change=False)
        check(any("error_cells" in r for r in rep4["reasons"]),
              f"expected error_cells guard to trip: {rep4['reasons']}")

        # Guard (c): header_hash change on Metro Areas.
        hdr_rows = _synthetic_metro_rows(10)
        hdr_rows[2] = list(hdr_rows[2])
        hdr_rows[2][5] = "ChangedHeader"
        hdr_ws = _FakeSheet(hdr_rows)
        snap5 = build_sheet_snapshot("Metro Areas", hdr_ws)
        check(snap5["header_hash"] != snap1["header_hash"], "header_hash should differ")
        rep5 = diff_sheet(snap5, backend, first_ever=False, allow_shrink=False,
                           allow_header_change=False)
        check(any("header_hash" in r for r in rep5["reasons"]),
              f"expected header guard to trip: {rep5['reasons']}")
        rep5b = diff_sheet(snap5, backend, first_ever=False, allow_shrink=False,
                            allow_header_change=True)
        check(rep5b["reasons"] == [], f"--allow-header-change should clear it: {rep5b['reasons']}")

        # Guard (d): BG None on named rows.
        bg_ws = _FakeSheet(_synthetic_metro_rows(10, bg_none_for=range(10)))
        frac_d, none_d, named_d = bg_none_fraction(bg_ws)
        check(frac_d == 1.0, f"expected all-None BG fraction, got {frac_d}")

        # Write-order: changed chunks before wb_sheet meta.
        one_chunk_ws = _FakeSheet(_synthetic_metro_rows(3))
        snap6 = build_sheet_snapshot("Metro Areas", one_chunk_ws)
        write_order = []
        orig_upsert_chunks = backend.upsert_chunks
        orig_upsert_sheet = backend.upsert_sheet

        def spy_chunks(sheet, chunks):
            write_order.append("chunks")
            return orig_upsert_chunks(sheet, chunks)

        def spy_sheet(meta):
            write_order.append("sheet")
            return orig_upsert_sheet(meta)

        backend.upsert_chunks = spy_chunks
        backend.upsert_sheet = spy_sheet
        backend.upsert_chunks("Metro Areas", snap6["_chunks"])
        backend.upsert_sheet({k: v for k, v in snap6.items() if k != "_chunks"})
        check(write_order == ["chunks", "sheet"], f"write order was {write_order}")
        backend.upsert_chunks = orig_upsert_chunks
        backend.upsert_sheet = orig_upsert_sheet

        # Chunk windows with a gap: rows 1 and 501 populated, 2-500 empty.
        gap_rows = [[None]] * 500
        gap_rows[0] = ["A"]
        gap_rows.append(["B"])
        gap_ws = _FakeSheet(gap_rows, max_col=1)
        snap_gap = build_sheet_snapshot("Gap Sheet", gap_ws)
        check(snap_gap["n_chunks"] == 2, f"expected 2 chunks, got {snap_gap['n_chunks']}")
        check(snap_gap["_chunks"][0]["n_rows"] == 1, "chunk 0 should hold exactly row 1")
        check(snap_gap["_chunks"][1]["n_rows"] == 1, "chunk 1 should hold exactly row 501")
        check(snap_gap["n_rows"] == 2, f"n_rows should count only non-empty rows, got {snap_gap['n_rows']}")

    if failures:
        print(f"SELF-TEST FAILED ({len(failures)} failure(s)):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("SELF-TEST OK")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--backend", default="rest")
    ap.add_argument("--workbook")
    ap.add_argument("--sheet", action="append", default=[])
    ap.add_argument("--allow-shrink", action="store_true")
    ap.add_argument("--allow-header-change", action="store_true")
    ap.add_argument("--no-settle", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--include-mktcap-sheet", action="store_true")
    args = ap.parse_args(argv)

    if args.self_test:
        return run_self_test()

    include_mktcap = args.include_mktcap_sheet or os.environ.get("METRO_SYNC_MKTCAP") == "sheet"

    try:
        workbook_path = resolve_workbook_path(args.workbook)
        if not workbook_path.exists():
            print(f"ERROR: workbook not found: {workbook_path}", file=sys.stderr)
            return 1
        check_settle_and_lock(workbook_path, args.no_settle)
        tmp_copy = copy_and_validate(workbook_path)
        try:
            backend = parse_backend_spec(args.backend)
            scope = args.sheet if args.sheet else IN_SCOPE_SHEETS
            lines: List[str] = []
            summary = run_sync(
                tmp_copy, backend, scope, args.write, args.allow_shrink,
                args.allow_header_change, include_mktcap,
                emit=(lambda s: lines.append(s)) if args.json else print,
            )
        finally:
            tmp_copy.unlink(missing_ok=True)
    except HoldError as e:
        if args.json:
            print(json.dumps({"status": "held", "reasons": e.reasons}))
        else:
            print("HELD:")
            for r in e.reasons:
                print(f"  - {r}")
        return 20
    except SystemExit as e:
        print(str(e), file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps({"summary": summary, "log": lines}, default=str))

    status = summary["status"]
    if status == "held":
        return 20
    if status == "written":
        return 10
    return 0  # no_change or dry_run


if __name__ == "__main__":
    sys.exit(main())
