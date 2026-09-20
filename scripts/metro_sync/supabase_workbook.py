"""The shim: makes a synced mirror (FileBackend or RestBackend) look like an
openpyxl read_only+data_only Workbook to scripts/extract.py and
scripts/metro_score/sources.py.

ShimWorkbook exposes .sheetnames, __getitem__(name) -> ShimSheet, .close().
ShimSheet.iter_rows(min_row, max_row, min_col, max_col, values_only=True)
yields tuples IDENTICAL in shape and content to what openpyxl's read_only
data_only iter_rows(values_only=True) yields for the same sheet/arguments:
padded on the right with None up to max_col, one tuple per row in
[min_row, max_row] inclusive (including all-None tuples for rows that carry
no data), truncated to max_col when max_col < the sheet's own max_col.

MktCap_Data is not mirrored by default (see CLAUDE.md / the sync tool's
README): it is served from scripts/mktcap/out/mktcap_export.csv unless
mktcap_from_sheet=True (the --include-mktcap-sheet / METRO_SYNC_MKTCAP=sheet
opt-in used only to A/B extract.py's two code paths against the same source).
"""
from __future__ import annotations

import csv as _csv
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from . import codec
from .backends import FileBackend


class ShimSheet:
    def __init__(self, name: str, meta: dict, rows_by_idx: Dict[int, List]):
        self.name = name
        self._meta = meta
        self._rows_by_idx = rows_by_idx
        self.max_row = meta["max_row"]
        self.max_column = meta["max_col"]

    def iter_rows(self, min_row=None, max_row=None, min_col=None, max_col=None,
                  values_only=False):
        if values_only is not True:
            raise ValueError(
                "ShimSheet.iter_rows only supports values_only=True "
                "(mirrors how extract.py and metro_score/sources.py call openpyxl)"
            )
        lo = 1 if min_row is None else min_row
        hi = self.max_row if max_row is None else max_row
        col_lo = 1 if min_col is None else min_col
        col_hi = self.max_column if max_col is None else max_col
        for row_idx in range(lo, hi + 1):
            cells = self._rows_by_idx.get(row_idx, [])
            # Pad/truncate to col_hi (0-based length col_hi), matching
            # openpyxl's values_only tuple shape for this max_col.
            if len(cells) < col_hi:
                padded = list(cells) + [None] * (col_hi - len(cells))
            else:
                padded = list(cells[:col_hi])
            if col_lo > 1:
                padded = padded[col_lo - 1:]
            yield tuple(padded)


class ShimWorkbook:
    def __init__(self, sheets: Dict[str, ShimSheet], sheetnames: List[str]):
        self._sheets = sheets
        self.sheetnames = sheetnames

    def __getitem__(self, name: str) -> ShimSheet:
        try:
            return self._sheets[name]
        except KeyError:
            raise KeyError(f"Worksheet {name} does not exist.")

    def close(self) -> None:
        # Nothing to release; symmetry with openpyxl's Workbook.close().
        pass


def _assemble_sheet_rows(name: str, remote_meta: dict, backend, cache_dir: Optional[str]
                          ) -> Tuple[Dict[int, List], List[Tuple[int, str]]]:
    """Pull whatever chunks are needed and return (rows_by_idx, chunk_hash_pairs).

    When cache_dir is given, only chunks whose hash differs from the remote
    index are actually fetched over the backend; everything else comes from
    the on-disk FileBackend cache.
    """
    remote_index = backend.get_chunk_index(name)
    all_nos = sorted(remote_index.keys())

    if cache_dir is not None:
        cache = FileBackend(cache_dir)
        local_index = cache.get_chunk_index(name)
        need = [no for no in all_nos if local_index.get(no) != remote_index[no]]
        stale = [no for no in local_index if no not in remote_index]
        if need:
            fresh = backend.get_chunks_raw(name, need)
            cache.upsert_chunks(name, fresh)
        if stale:
            cache.delete_chunks(name, stale)
        cache.upsert_sheet(remote_meta)
        raw_all = cache.get_chunks_raw(name, all_nos)
    else:
        raw_all = backend.get_chunks_raw(name, all_nos)

    rows_by_idx: Dict[int, List] = {}
    chunk_hash_pairs: List[Tuple[int, str]] = []
    for no in all_nos:
        data = raw_all[no]
        chunk_hash_pairs.append((no, data["chunk_hash"]))
        for row_idx, cells in data["rows"]:
            rows_by_idx[row_idx] = codec.decode_row(cells)
    return rows_by_idx, chunk_hash_pairs


def _load_sheet_verified(name: str, remote_meta: dict, backend, cache_dir: Optional[str]
                          ) -> Dict[int, List]:
    rows_by_idx, chunk_hash_pairs = _assemble_sheet_rows(name, remote_meta, backend, cache_dir)
    content_hash = codec.hash_content(chunk_hash_pairs, remote_meta["max_col"], remote_meta["max_row"])
    if content_hash != remote_meta["content_hash"]:
        # Re-pull once, bypassing whatever local cache produced the mismatch,
        # then raise if it still doesn't match. A mismatch after a full
        # bypass re-pull means the two sides genuinely disagree (corruption,
        # or a sheet meta row that doesn't match its own chunks), not a
        # locally-stale cache.
        if cache_dir is not None:
            cache = FileBackend(cache_dir)
            cache.delete_chunks(name, [no for no, _ in chunk_hash_pairs])
        rows_by_idx, chunk_hash_pairs = _assemble_sheet_rows(name, remote_meta, backend, cache_dir)
        content_hash = codec.hash_content(chunk_hash_pairs, remote_meta["max_col"], remote_meta["max_row"])
        if content_hash != remote_meta["content_hash"]:
            raise RuntimeError(
                f"metro_sync: sheet {name!r} content_hash mismatch after re-pull "
                f"(expected {remote_meta['content_hash']}, got {content_hash}). "
                f"The mirror is inconsistent with its own wb_sheet row."
            )
    return rows_by_idx


def _mktcap_rows_from_csv(csv_path: Path) -> Tuple[Dict[int, List], int, int]:
    """MktCap_Data as extract.py's fallback path and metro_score/sources.py's
    Indexes() both read it: row 1 = CSV header row, then data rows, 4 columns
    (Metro Area, Valuation, Company Name, Source). Valuation is converted to a
    number the way openpyxl would hand back a numeric cell (int when the CSV
    value is integral, float otherwise — mirroring how Excel itself stores a
    numeric cell: no separate int/float typing at the cell level beyond
    whether it has a fractional part)."""
    rows: Dict[int, List] = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = _csv.reader(f)
        for i, row in enumerate(reader, start=1):
            if i == 1:
                rows[i] = list(row[:4])
                continue
            metro = row[0] if len(row) > 0 else None
            raw_val = row[1] if len(row) > 1 else None
            name = row[2] if len(row) > 2 else None
            source = row[3] if len(row) > 3 else None
            val = None
            if raw_val not in (None, ""):
                f_val = float(raw_val)
                val = int(f_val) if f_val.is_integer() else f_val
            rows[i] = [metro or None, val, name or None, source or None]
    n_rows = max(rows) if rows else 0
    return rows, n_rows, 4


def load(backend, cache_dir: Optional[str] = None, mktcap_csv: Optional[str] = None,
         mktcap_from_sheet: bool = False, sheets: Optional[Iterable[str]] = None) -> ShimWorkbook:
    """Build a ShimWorkbook from a synced backend.

    sheets: restrict to this subset (mainly for tests); default is every
    sheet present in the backend's wb_sheet index, plus MktCap_Data (served
    from CSV unless mktcap_from_sheet=True and it is itself mirrored).
    """
    remote_sheets_meta = backend.get_sheets()
    wanted = list(sheets) if sheets is not None else list(remote_sheets_meta.keys())

    shim_sheets: Dict[str, ShimSheet] = {}
    sheetnames: List[str] = []

    for name in wanted:
        if name == "MktCap_Data" and not mktcap_from_sheet:
            continue  # handled below from CSV
        if name not in remote_sheets_meta:
            raise KeyError(f"metro_sync mirror has no synced sheet {name!r}")
        meta = remote_sheets_meta[name]
        rows_by_idx = _load_sheet_verified(name, meta, backend, cache_dir)
        shim_sheets[name] = ShimSheet(name, meta, rows_by_idx)
        sheetnames.append(name)

    if not mktcap_from_sheet:
        csv_path = Path(mktcap_csv) if mktcap_csv else (
            Path(__file__).resolve().parent.parent / "mktcap" / "out" / "mktcap_export.csv"
        )
        if csv_path.exists():
            rows_by_idx, n_rows, n_cols = _mktcap_rows_from_csv(csv_path)
            meta = {"sheet": "MktCap_Data", "max_row": n_rows, "max_col": n_cols}
            shim_sheets["MktCap_Data"] = ShimSheet("MktCap_Data", meta, rows_by_idx)
            sheetnames.append("MktCap_Data")
        # If the CSV is missing, MktCap_Data is simply absent from
        # sheetnames — matching extract.py's own CSV-then-sheet fallback,
        # which checks `"MktCap_Data" in wb.sheetnames` nowhere directly; it
        # instead branches on the CSV file's existence before ever touching
        # wb["MktCap_Data"], so this is safe.

    return ShimWorkbook(shim_sheets, sheetnames)


def patch_metro_derived(engine_rows) -> Dict[str, Dict[int, float]]:
    """Build a name-key -> {col_idx: value} override map for Metro Areas'
    cached derived columns (indices 42..57, AQ..BF) from the score engine's
    per-metro computed columns, so extract_metros() reads live-recomputed
    values instead of the workbook's frozen cache in supabase mode.

    engine_rows: the iterable engine.rows() yields, i.e.
    (name, key, cached_score, computed_score, terms, cols) tuples, where
    `cols` is score.py's derived_columns() dict keyed by column LETTER
    (AQ, AR, ..., BF). Keyed here the same way extract_metros keys its own
    index (name.strip().lower()), NOT the engine's unstripped join key.
    """
    from .letters import A  # local import: keeps this module import-light

    # AQ..BF in workbook column order == indices 42..57.
    letters = ["AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX",
               "AY", "AZ", "BA", "BB", "BC", "BD", "BE", "BF"]
    idx_by_letter = {L: A(L) for L in letters}

    out: Dict[str, Dict[int, float]] = {}
    for name, _k, _cached, _computed, _terms, cols in engine_rows:
        key = name.strip().lower()
        vals = {idx_by_letter[L]: cols[L] for L in letters if L in cols}
        # AU is a SUMIFS of dollar valuations. Python and Excel add the same
        # floats in a different order, which leaves noise in the 7th decimal
        # (Crewe read 1070000000.0000001 on 2026-09-20). Cents are exact enough.
        au = idx_by_letter["AU"]
        if isinstance(vals.get(au), float):
            vals[au] = round(vals[au], 2)
        out[key] = vals
    return out
