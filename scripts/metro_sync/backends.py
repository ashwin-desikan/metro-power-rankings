"""Storage backends for the workbook mirror: FileBackend (offline, disk) and
RestBackend (Supabase PostgREST, unreachable from this environment — built
small, careful and literal, and unit-tested only for URL/batch construction by
monkeypatching rest()/select()/select_all()).

Both backends share one interface:

  get_sheets() -> {sheet: meta}
  get_chunk_index(sheet) -> {chunk_no: chunk_hash}
  get_chunks(sheet, chunk_nos) -> {chunk_no: [[row_idx, [cell, ...]], ...]}   (DECODED)
  upsert_chunks(sheet, chunks)   # chunks: {chunk_no: {"first_row","last_row","n_rows",
                                  #           "chunk_hash", "rows": [[row_idx, [enc_cell,...]], ...]}}
  delete_chunks(sheet, chunk_nos)
  upsert_sheet(meta)             # meta: dict with key "sheet" plus wb_sheet columns
  log_run(run)                   # dict; appended, never mutated in place
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence
from urllib.parse import quote

from . import codec

_MKTCAP_DIR = str(Path(__file__).resolve().parent.parent / "mktcap")
if _MKTCAP_DIR not in sys.path:
    sys.path.insert(0, _MKTCAP_DIR)


def _safe_sheet_dirname(sheet: str) -> str:
    """Filesystem-safe directory name for a sheet. Sheet names contain
    spaces, parentheses and hyphens ('States (ISO 3166-2)') which are all
    fine on a POSIX filesystem, so this only escapes the characters that
    genuinely aren't (path separators)."""
    return sheet.replace("/", "_SLASH_").replace("\\", "_BSLASH_")


class FileBackend:
    def __init__(self, directory: str):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)

    def _sheet_dir(self, sheet: str) -> Path:
        d = self.dir / _safe_sheet_dirname(sheet)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _sheets_path(self) -> Path:
        return self.dir / "_sheets.json"

    def _runs_path(self) -> Path:
        return self.dir / "_runs.jsonl"

    # -- sheets -----------------------------------------------------------
    def get_sheets(self) -> Dict[str, dict]:
        p = self._sheets_path()
        if not p.exists():
            return {}
        return json.loads(p.read_text(encoding="utf-8"))

    def upsert_sheet(self, meta: dict) -> None:
        sheets = self.get_sheets()
        sheets[meta["sheet"]] = meta
        self._sheets_path().write_text(
            codec.canonical_json(sheets, sort_keys=True), encoding="utf-8"
        )

    # -- chunks -------------------------------------------------------------
    def get_chunk_index(self, sheet: str) -> Dict[int, str]:
        d = self._sheet_dir(sheet)
        out = {}
        for f in d.glob("*.json"):
            chunk_no = int(f.stem)
            data = json.loads(f.read_text(encoding="utf-8"))
            out[chunk_no] = data["chunk_hash"]
        return out

    def get_chunks_raw(self, sheet: str, chunk_nos: Iterable[int]) -> Dict[int, dict]:
        """Chunk payloads exactly as stored (encoded rows, chunk_hash,
        first_row/last_row/n_rows) — what upsert_chunks would need to
        replay this chunk into another backend unchanged."""
        d = self._sheet_dir(sheet)
        out = {}
        for no in chunk_nos:
            f = d / f"{no}.json"
            if not f.exists():
                continue
            out[no] = json.loads(f.read_text(encoding="utf-8"))
        return out

    def get_chunks(self, sheet: str, chunk_nos: Iterable[int]) -> Dict[int, List]:
        raw = self.get_chunks_raw(sheet, chunk_nos)
        return {
            no: [[row_idx, codec.decode_row(cells)] for row_idx, cells in data["rows"]]
            for no, data in raw.items()
        }

    def upsert_chunks(self, sheet: str, chunks: Dict[int, dict]) -> None:
        d = self._sheet_dir(sheet)
        for no, payload in chunks.items():
            f = d / f"{no}.json"
            f.write_text(codec.canonical_json(payload, sort_keys=True), encoding="utf-8")

    def delete_chunks(self, sheet: str, chunk_nos: Iterable[int]) -> None:
        d = self._sheet_dir(sheet)
        for no in chunk_nos:
            f = d / f"{no}.json"
            if f.exists():
                f.unlink()

    # -- runs -----------------------------------------------------------
    def log_run(self, run: dict) -> None:
        with open(self._runs_path(), "a", encoding="utf-8") as f:
            f.write(codec.canonical_json(run, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# RestBackend
# ---------------------------------------------------------------------------

# Cap chunk-upsert request bodies at roughly this many bytes of JSON so a
# single POST never blows past PostgREST/Supabase's request-size limits.
REST_UPSERT_BATCH_BYTES = 4 * 1024 * 1024
# Batch size for reading chunk bodies by chunk_no=in.(...).
REST_READ_CHUNK_BATCH = 20


def _epoch_to_iso(v):
    """wb_sheet.workbook_mtime and wb_sync_run.workbook_mtime are timestamptz.
    The pipeline carries mtimes as epoch floats (what os.path.getmtime returns
    and what FileBackend stores), so the conversion lives at this seam only."""
    if v is None or isinstance(v, str):
        return v
    import datetime as _dt
    return _dt.datetime.fromtimestamp(float(v), _dt.timezone.utc).isoformat()


def _iso_to_epoch(v):
    if v is None or isinstance(v, (int, float)):
        return v
    import datetime as _dt
    return _dt.datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()


class RestBackend:
    """Built on scripts/mktcap/common.py's rest/select/select_all/get_key.
    Cannot be exercised against a live server from this environment; every
    method here is validated only by unit tests that monkeypatch `rest`,
    `select` and `select_all` and inspect the URL/body/batching it builds.
    """

    def __init__(self):
        import common as _common  # scripts/mktcap/common.py
        self._common = _common

    def _rest(self, method, path, body=None, headers=None):
        return self._common.rest(method, path, body=body, headers=headers)

    def _select(self, path):
        return self._common.select(path)

    def _select_all(self, path, order):
        return self._common.select_all(path, order)

    # -- sheets -----------------------------------------------------------
    def get_sheets(self) -> Dict[str, dict]:
        rows = self._select_all("/rest/v1/wb_sheet?select=*", order="sheet")
        for r in rows:
            r["workbook_mtime"] = _iso_to_epoch(r.get("workbook_mtime"))
        return {r["sheet"]: r for r in rows}

    def upsert_sheet(self, meta: dict) -> None:
        self._rest(
            "POST", "/rest/v1/wb_sheet?on_conflict=sheet",
            body=[dict(meta, workbook_mtime=_epoch_to_iso(meta.get("workbook_mtime")))],
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    # -- chunks -----------------------------------------------------------
    def get_chunk_index(self, sheet: str) -> Dict[int, str]:
        enc = quote(sheet, safe="")
        path = (f"/rest/v1/wb_chunk?sheet=eq.{enc}"
                f"&select=chunk_no,chunk_hash")
        rows = self._select_all(path, order="chunk_no")
        return {r["chunk_no"]: r["chunk_hash"] for r in rows}

    def get_chunks_raw(self, sheet: str, chunk_nos: Iterable[int]) -> Dict[int, dict]:
        enc_sheet = quote(sheet, safe="")
        out: Dict[int, dict] = {}
        nos = list(chunk_nos)
        for i in range(0, len(nos), REST_READ_CHUNK_BATCH):
            batch = nos[i:i + REST_READ_CHUNK_BATCH]
            in_list = quote(",".join(str(n) for n in batch), safe=",")
            path = (f"/rest/v1/wb_chunk?sheet=eq.{enc_sheet}"
                    f"&chunk_no=in.({in_list})"
                    f"&select=chunk_no,first_row,last_row,n_rows,chunk_hash,rows")
            rows = self._select(path)
            for r in rows:
                out[r["chunk_no"]] = {
                    "first_row": r["first_row"], "last_row": r["last_row"],
                    "n_rows": r["n_rows"], "chunk_hash": r["chunk_hash"],
                    "rows": r["rows"],
                }
        return out

    def get_chunks(self, sheet: str, chunk_nos: Iterable[int]) -> Dict[int, List]:
        raw = self.get_chunks_raw(sheet, chunk_nos)
        return {
            no: [[row_idx, codec.decode_row(cells)] for row_idx, cells in data["rows"]]
            for no, data in raw.items()
        }

    def upsert_chunks(self, sheet: str, chunks: Dict[int, dict]) -> None:
        records = []
        for no, payload in chunks.items():
            records.append({
                "sheet": sheet,
                "chunk_no": no,
                "first_row": payload["first_row"],
                "last_row": payload["last_row"],
                "n_rows": payload["n_rows"],
                "chunk_hash": payload["chunk_hash"],
                "rows": payload["rows"],
            })
        for batch in _batch_by_bytes(records, REST_UPSERT_BATCH_BYTES):
            self._rest(
                "POST", "/rest/v1/wb_chunk?on_conflict=sheet,chunk_no",
                body=batch,
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            )

    def delete_chunks(self, sheet: str, chunk_nos: Iterable[int]) -> None:
        nos = list(chunk_nos)
        if not nos:
            return
        enc_sheet = quote(sheet, safe="")
        for i in range(0, len(nos), REST_READ_CHUNK_BATCH):
            batch = nos[i:i + REST_READ_CHUNK_BATCH]
            in_list = quote(",".join(str(n) for n in batch), safe=",")
            path = f"/rest/v1/wb_chunk?sheet=eq.{enc_sheet}&chunk_no=in.({in_list})"
            self._rest("DELETE", path)

    # -- runs -----------------------------------------------------------
    def log_run(self, run: dict) -> None:
        run = dict(run, workbook_mtime=_epoch_to_iso(run.get("workbook_mtime")))
        self._rest("POST", "/rest/v1/wb_sync_run", body=[run],
                    headers={"Prefer": "return=minimal"})


def _batch_by_bytes(records: Sequence[dict], max_bytes: int) -> Iterable[List[dict]]:
    """Split `records` into batches whose JSON encoding stays under max_bytes.
    A single record larger than max_bytes still goes out alone (never split
    mid-record, and never dropped)."""
    batch: List[dict] = []
    batch_size = 2  # account for the enclosing [] and separators loosely
    for rec in records:
        rec_size = len(codec.canonical_json(rec).encode("utf-8")) + 1
        if batch and batch_size + rec_size > max_bytes:
            yield batch
            batch = []
            batch_size = 2
        batch.append(rec)
        batch_size += rec_size
    if batch:
        yield batch


def parse_backend_spec(spec: str):
    """'rest' -> RestBackend(); 'file:<dir>' -> FileBackend(dir)."""
    if spec == "rest":
        return RestBackend()
    if spec.startswith("file:"):
        return FileBackend(spec[len("file:"):])
    raise ValueError(f"unknown backend spec {spec!r}; expected 'rest' or 'file:<dir>'")
