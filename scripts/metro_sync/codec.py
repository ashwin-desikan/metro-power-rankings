"""Cell encode/decode and canonical hashing for the workbook mirror.

int, float, str, bool, None pass through JSON as themselves. datetime/date/time
become a tagged dict `{"$dt": iso, "k": "datetime"|"date"|"time"}` so they
round-trip back to the same Python type (openpyxl returns real
datetime.datetime/date/time objects for date-formatted cells, never strings).

Canonical JSON is `json.dumps(obj, separators=(",", ":"), ensure_ascii=False,
sort_keys=False)` for chunk/sheet payloads (row order matters and must not be
reordered), and hashes are sha256 hex over that string's UTF-8 bytes.

ASSUMPTION (documented, not offline-testable against the real server): a
Python int stored as JSON `5` and a Python float stored as JSON `5.0` are
assumed to survive a Postgres jsonb round trip with their int/float-ness
intact, because jsonb keeps the textual scale of a numeric literal (`5` reads
back as an integral JSON number, `5.0` keeps its decimal point) and
psycopg/postgrest's JSON encoder distinguishes them on read. This cannot be
verified from here since Supabase is unreachable; decode() is written to be
robust to either representation regardless (see _decode_cell), and hashing
always re-encodes from DECODED Python values, never from raw server text, so
even if jsonb's own textual formatting differs (e.g. normalizing `1e-07` to
`0.0000001`), the hash used for the mirror's integrity check is unaffected:
it is always computed by decoding to Python and re-encoding canonically here,
never by hashing whatever bytes Postgres happens to hand back.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
from typing import Any, Dict, List, Sequence, Tuple

ERROR_CELL_VALUES = {
    "#N/A", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!", "#NULL!", "#NUM!",
}


def encode_cell(v: Any) -> Any:
    """Python cell value -> JSON-safe value."""
    if v is None or isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, _dt.datetime):
        return {"$dt": v.isoformat(), "k": "datetime"}
    if isinstance(v, _dt.date):
        return {"$dt": v.isoformat(), "k": "date"}
    if isinstance(v, _dt.time):
        return {"$dt": v.isoformat(), "k": "time"}
    # Fallback: anything else openpyxl might hand back (rare: timedelta) is
    # stringified rather than silently dropped.
    if isinstance(v, _dt.timedelta):
        return {"$dt": str(v), "k": "timedelta"}
    return str(v)


def decode_cell(v: Any) -> Any:
    """JSON-safe value -> Python cell value. Robust to jsonb's own
    normalisation of the tagged-dict's key order and number formatting."""
    if v is None or isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, dict) and "$dt" in v and "k" in v:
        kind = v["k"]
        s = v["$dt"]
        if kind == "datetime":
            return _dt.datetime.fromisoformat(s)
        if kind == "date":
            return _dt.date.fromisoformat(s)
        if kind == "time":
            return _dt.time.fromisoformat(s)
        if kind == "timedelta":
            return s  # timedelta never appears in real workbook cells; passthrough
        raise ValueError(f"unknown datetime-tag kind {kind!r} in {v!r}")
    # Unrecognised shape (should not happen in a well-formed mirror); return
    # as-is rather than raising, so a forward-compatible payload doesn't crash
    # an older reader outright.
    return v


def _json_default(o: Any):
    raise TypeError(f"not JSON serialisable in canonical encoding: {o!r}")


def canonical_json(obj: Any, *, sort_keys: bool = False) -> str:
    return json.dumps(
        obj, separators=(",", ":"), ensure_ascii=False,
        sort_keys=sort_keys, default=_json_default,
    )


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _canonical_cell_for_hash(v: Any) -> Any:
    """Re-encode a DECODED python cell value for hashing. The `$dt` tagged
    dict is hashed with sort_keys=True (see module docstring: jsonb does not
    preserve key order), everything else passes through encode_cell as-is."""
    enc = encode_cell(v)
    return enc


def _row_for_hash(row_idx: int, cells: Sequence[Any]) -> List[Any]:
    return [row_idx, [_canonical_cell_for_hash(c) for c in cells]]


def hash_rows_payload(rows: Sequence[Tuple[int, Sequence[Any]]]) -> str:
    """Hash a chunk's `rows` array: [[row_idx, [cell, ...]], ...].

    `rows` here is the DECODED form (row_idx, python-cell-list) pairs, in
    ascending row_idx order. Each tagged datetime dict is hashed with
    sort_keys=True so the value is stable no matter how jsonb reordered its
    keys on the way back from Postgres; plain scalars hash however
    canonical_json renders them (order-independent for a list).
    """
    payload = [_row_for_hash(idx, cells) for idx, cells in rows]
    # sort_keys applies recursively to any dict encountered (the $dt tags),
    # which is exactly what we need; lists keep their given order.
    return sha256_hex(canonical_json(payload, sort_keys=True))


def hash_content(chunk_hashes: Sequence[Tuple[int, str]], max_col: int, max_row: int) -> str:
    """content_hash over the ordered list of [chunk_no, chunk_hash] plus
    max_col and max_row. chunk_hashes must already be ordered by chunk_no."""
    payload = {
        "chunks": [[no, h] for no, h in chunk_hashes],
        "max_col": max_col,
        "max_row": max_row,
    }
    return sha256_hex(canonical_json(payload, sort_keys=True))


def hash_header(first_three_rows: Sequence[Sequence[Any]]) -> str:
    """header_hash over the first 3 rows (decoded python values)."""
    payload = [[_canonical_cell_for_hash(c) for c in row] for row in first_three_rows]
    return sha256_hex(canonical_json(payload, sort_keys=True))


def trim_trailing_none(cells: Sequence[Any]) -> List[Any]:
    out = list(cells)
    while out and out[-1] is None:
        out.pop()
    return out


def count_error_cells(rows: Sequence[Sequence[Any]]) -> int:
    n = 0
    for row in rows:
        for c in row:
            if isinstance(c, str) and c in ERROR_CELL_VALUES:
                n += 1
    return n


def encode_row(cells: Sequence[Any]) -> List[Any]:
    """Trim trailing Nones, then encode each remaining cell for JSON."""
    trimmed = trim_trailing_none(cells)
    return [encode_cell(c) for c in trimmed]


def decode_row(cells: Sequence[Any]) -> List[Any]:
    return [decode_cell(c) for c in cells]
