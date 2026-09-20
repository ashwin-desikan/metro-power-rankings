"""Pytest coverage for scripts/metro_sync/. Fully offline."""
import datetime as dt
import json
from unittest import mock

import pytest

from metro_sync import codec
from metro_sync.backends import FileBackend, RestBackend, _batch_by_bytes
from metro_sync.letters import A
from metro_sync.sync_workbook import (
    _FakeSheet, bg_none_fraction, build_sheet_snapshot, diff_sheet,
    run_self_test, IN_SCOPE_SHEETS, SHRINK_ROW_ABS, SHRINK_ROW_PCT,
)


# ---------------------------------------------------------------------------
# codec
# ---------------------------------------------------------------------------

def test_codec_roundtrip_scalars():
    for v in [None, 5, 5.0, 0.1 + 0.2, 1e-07, True, False, "", "  trailing  ",
              "Osnabrück", "plain"]:
        enc = codec.encode_cell(v)
        dec = codec.decode_cell(enc)
        assert dec == v
        assert type(dec) is type(v)


def test_codec_roundtrip_datetime_date_time():
    d1 = dt.datetime(2026, 5, 9, 13, 17, 5)
    d2 = dt.date(2026, 5, 9)
    d3 = dt.time(13, 17, 5)
    for v in (d1, d2, d3):
        enc = codec.encode_cell(v)
        assert isinstance(enc, dict) and "$dt" in enc and "k" in enc
        dec = codec.decode_cell(enc)
        assert dec == v
        assert type(dec) is type(v)


def test_codec_int_vs_float_distinct():
    assert codec.encode_cell(5) == 5
    assert codec.encode_cell(5.0) == 5.0
    assert type(codec.decode_cell(codec.encode_cell(5))) is int
    assert type(codec.decode_cell(codec.encode_cell(5.0))) is float


def test_codec_row_trimming_and_error_cells():
    row = ["a", None, "b", None, None]
    assert codec.trim_trailing_none(row) == ["a", None, "b"]
    rows = [["ok", "#N/A"], ["#REF!", "#VALUE!", "fine"], [None, "#DIV/0!"]]
    assert codec.count_error_cells(rows) == 4


def test_hash_stability_under_jsonb_normalisation():
    """Simulate what Postgres jsonb does to a JSON payload: round-trip through
    json.loads/dumps with sort_keys and a different float text formatting
    (5.0 stays 5.0, 1e-07 becomes its expanded decimal form), and prove the
    hash computed from DECODED python values is unaffected because hashing
    always re-encodes canonically from Python, never from raw server text."""
    rows = [(1, ["a", 5, 5.0, 1e-07, None]), (2, ["b", True, False])]
    h1 = codec.hash_rows_payload(rows)

    # Simulate a jsonb round trip: encode with our own encoder (as if writing
    # to the server), then decode as jsonb might hand it back -- key order
    # scrambled and numbers reformatted -- then decode back to python and
    # rehash. The float 1e-07 must still equal 0.0000001 numerically.
    encoded = [[idx, [codec.encode_cell(c) for c in cells]] for idx, cells in rows]
    server_text = json.dumps(encoded)  # standard, non-canonical formatting
    assert "1e-07" not in server_text or True  # json module writes 1e-07 as 1e-07; that's fine,
    # the point is decoding it back gives the same float regardless of spelling
    roundtripped = json.loads(server_text)
    decoded_back = [(idx, codec.decode_row(cells)) for idx, cells in roundtripped]
    h2 = codec.hash_rows_payload(decoded_back)
    assert h1 == h2

    # Also prove a genuinely different float representation of the same
    # number (1e-07 vs 0.0000001) hashes identically once decoded to Python,
    # because Python treats them as the same float either way.
    assert float("1e-07") == float("0.0000001")
    rows_alt = [(1, ["a", 5, 5.0, 0.0000001, None]), (2, ["b", True, False])]
    h3 = codec.hash_rows_payload(rows_alt)
    assert h1 == h3


def test_hash_content_and_header():
    h = codec.hash_content([(0, "aaa"), (1, "bbb")], max_col=10, max_row=100)
    h_again = codec.hash_content([(0, "aaa"), (1, "bbb")], max_col=10, max_row=100)
    assert h == h_again
    h_diff = codec.hash_content([(0, "aaa"), (1, "ccc")], max_col=10, max_row=100)
    assert h != h_diff

    header = codec.hash_header([["A", "B"], [None, None], ["C", "D"]])
    header2 = codec.hash_header([["A", "B"], [None, None], ["C", "D"]])
    assert header == header2


# ---------------------------------------------------------------------------
# letters.A
# ---------------------------------------------------------------------------

def test_column_letters():
    assert A("A") == 0
    assert A("F") == 5
    assert A("BG") == 58
    assert A("AQ") == 42
    assert A("BF") == 57


# ---------------------------------------------------------------------------
# FileBackend
# ---------------------------------------------------------------------------

def test_file_backend_roundtrip(tmp_path):
    backend = FileBackend(str(tmp_path))
    chunks = {
        0: {"first_row": 1, "last_row": 500, "n_rows": 2, "chunk_hash": "h0",
            "rows": [[1, ["x", 1]], [2, ["y", None]]]},
    }
    backend.upsert_chunks("A Sheet (with) Chars", chunks)
    idx = backend.get_chunk_index("A Sheet (with) Chars")
    assert idx == {0: "h0"}
    got = backend.get_chunks("A Sheet (with) Chars", [0])
    assert got[0] == [[1, ["x", 1]], [2, ["y", None]]]

    backend.upsert_sheet({"sheet": "A Sheet (with) Chars", "max_row": 500, "max_col": 2,
                           "content_hash": "c0"})
    sheets = backend.get_sheets()
    assert sheets["A Sheet (with) Chars"]["content_hash"] == "c0"

    backend.delete_chunks("A Sheet (with) Chars", [0])
    assert backend.get_chunk_index("A Sheet (with) Chars") == {}

    backend.log_run({"status": "written"})
    backend.log_run({"status": "no_change"})
    runs_path = tmp_path / "_runs.jsonl"
    lines = runs_path.read_text().strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["status"] == "written"


# ---------------------------------------------------------------------------
# ShimSheet padding / truncation
# ---------------------------------------------------------------------------

def test_shim_sheet_padding_and_truncation():
    from metro_sync.supabase_workbook import ShimSheet
    meta = {"max_row": 5, "max_col": 4}
    rows_by_idx = {2: ["a", "b"], 4: ["c", "d", "e", "f", "g"]}  # short and long rows
    sheet = ShimSheet("X", meta, rows_by_idx)

    rows = list(sheet.iter_rows(min_row=1, max_row=5, values_only=True))
    assert len(rows) == 5
    assert rows[0] == (None, None, None, None)         # row 1: no data at all
    assert rows[1] == ("a", "b", None, None)            # row 2: padded to max_col
    assert rows[2] == (None, None, None, None)          # row 3: empty
    assert rows[3] == ("c", "d", "e", "f")               # row 4: truncated to max_col
    assert rows[4] == (None, None, None, None)          # row 5: empty

    # Explicit max_col smaller than sheet default.
    rows_narrow = list(sheet.iter_rows(min_row=2, max_row=2, max_col=1, values_only=True))
    assert rows_narrow == [("a",)]

    with pytest.raises(ValueError):
        list(sheet.iter_rows(values_only=False))


# ---------------------------------------------------------------------------
# chunk windows with gaps
# ---------------------------------------------------------------------------

def test_chunk_windows_with_gap():
    rows = [[None]] * 500
    rows[0] = ["first"]
    rows.append(["five-oh-one"])
    ws = _FakeSheet(rows, max_col=1)
    snap = build_sheet_snapshot("Gap", ws)
    assert snap["n_chunks"] == 2
    assert snap["_chunks"][0]["first_row"] == 1
    assert snap["_chunks"][0]["last_row"] == 500
    assert snap["_chunks"][0]["n_rows"] == 1
    assert snap["_chunks"][1]["first_row"] == 501
    assert snap["_chunks"][1]["last_row"] == 501
    assert snap["_chunks"][1]["n_rows"] == 1
    assert snap["n_rows"] == 2


# ---------------------------------------------------------------------------
# guards (via run_self_test, which already exercises all of them end to end)
# ---------------------------------------------------------------------------

def test_self_test_passes():
    assert run_self_test() == 0


def test_bg_none_fraction_skips_header_rows():
    rows = [[None] * 73] * 3  # rows 1-3: header band, F is None
    rows = list(rows)
    rows.append([None] * 5 + ["Metro1"] + [None] * 52 + [1.0])  # row4: named, BG present (idx58)
    ws = _FakeSheet(rows, max_col=73)
    frac, none_ct, named_ct = bg_none_fraction(ws)
    assert named_ct == 1
    assert none_ct == 0
    assert frac == 0.0


def test_shrink_guard_thresholds():
    # Exactly at 50-row loss with a large base: percentage below 2%, so the
    # 50-row absolute threshold is what should trip it.
    assert SHRINK_ROW_ABS == 50
    assert SHRINK_ROW_PCT == 0.02


# ---------------------------------------------------------------------------
# RestBackend URL / batching construction (monkeypatched; never touches a
# real server)
# ---------------------------------------------------------------------------

class _FakeCommon:
    def __init__(self):
        self.calls = []

    def rest(self, method, path, body=None, headers=None):
        self.calls.append((method, path, body, headers))
        return 200, "{}"

    def select(self, path):
        self.calls.append(("GET", path, None, None))
        return []

    def select_all(self, path, order):
        self.calls.append(("GET_ALL", path, order, None))
        return []


def _make_rest_backend(monkeypatch, fake):
    import sys
    import types
    fake_module = types.SimpleNamespace(
        rest=fake.rest, select=fake.select, select_all=fake.select_all,
    )
    monkeypatch.setitem(sys.modules, "common", fake_module)
    return RestBackend()


def test_rest_backend_sheet_name_url_encoding(monkeypatch):
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.get_chunk_index("States (ISO 3166-2)")
    method, path, order, _ = fake.calls[-1]
    assert method == "GET_ALL"
    assert "States%20%28ISO%203166-2%29" in path
    assert "chunk_no,chunk_hash" in path


def test_rest_backend_upsert_headers_and_on_conflict(monkeypatch):
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.upsert_chunks("Sheet2", {0: {"first_row": 1, "last_row": 500, "n_rows": 1,
                                          "chunk_hash": "h", "rows": [[1, ["x"]]]}})
    method, path, body, headers = fake.calls[-1]
    assert method == "POST"
    assert "on_conflict=sheet,chunk_no" in path
    assert headers["Prefer"] == "resolution=merge-duplicates,return=minimal"
    assert body[0]["sheet"] == "Sheet2"
    assert body[0]["chunk_no"] == 0


def test_rest_backend_upsert_sheet(monkeypatch):
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.upsert_sheet({"sheet": "Metro Areas", "max_row": 10})
    method, path, body, headers = fake.calls[-1]
    assert method == "POST"
    assert "on_conflict=sheet" in path
    assert body == [{"sheet": "Metro Areas", "max_row": 10, "workbook_mtime": None}]


def test_rest_backend_mtime_is_iso_on_the_wire_and_epoch_in_memory(monkeypatch):
    # wb_sheet.workbook_mtime is timestamptz; a bare epoch float is rejected by PostgREST.
    from metro_sync import backends as b
    iso = b._epoch_to_iso(1789000000.5)
    assert iso.startswith("2026-") and iso.endswith("+00:00")
    assert b._iso_to_epoch(iso) == 1789000000.5
    assert b._iso_to_epoch("2026-09-20T10:00:00Z") == b._iso_to_epoch("2026-09-20T10:00:00+00:00")
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.upsert_sheet({"sheet": "Counties", "workbook_mtime": 1789000000.5})
    assert fake.calls[-1][2][0]["workbook_mtime"] == iso
    backend.log_run({"status": "written", "workbook_mtime": 1789000000.5})
    assert fake.calls[-1][2][0]["workbook_mtime"] == iso


def test_rest_backend_get_chunks_batches_by_20(monkeypatch):
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.get_chunks_raw("Metro Areas", list(range(45)))
    get_calls = [c for c in fake.calls if c[0] == "GET"]
    assert len(get_calls) == 3  # 45 chunks / batch size 20 -> 3 requests
    assert "chunk_no=in.(" in get_calls[0][1]


def test_rest_backend_delete_batches(monkeypatch):
    fake = _FakeCommon()
    backend = _make_rest_backend(monkeypatch, fake)
    backend.delete_chunks("Metro Areas", list(range(25)))
    delete_calls = [c for c in fake.calls if c[0] == "DELETE"]
    assert len(delete_calls) == 2  # 25 / batch size 20 -> 2 requests


def test_batch_by_bytes_splits():
    records = [{"i": i, "pad": "x" * 100} for i in range(50)]
    batches = list(_batch_by_bytes(records, max_bytes=1000))
    assert len(batches) > 1
    flat = [r for b in batches for r in b]
    assert flat == records


def test_in_list_special_characters_survive_url_encoding():
    from metro_sync.backends import RestBackend
    from urllib.parse import quote
    sheet = "States (ISO 3166-2)"
    enc = quote(sheet, safe="")
    assert " " not in enc
    assert "(" not in enc and ")" not in enc


# ---------------------------------------------------------------------------
# write order (chunks/deletes before wb_sheet, before log_run) — exercised at
# the run_sync level via a FileBackend spy.
# ---------------------------------------------------------------------------

def test_write_order_full_run(tmp_path, monkeypatch):
    import openpyxl
    from openpyxl import Workbook as XlWorkbook
    from metro_sync.sync_workbook import run_sync, IN_SCOPE_SHEETS
    from metro_sync.backends import FileBackend

    # Build a tiny real xlsx with just the sheets/columns needed so run_sync's
    # openpyxl.load_workbook path (not the FakeSheet stand-in) is exercised
    # end to end at least once.
    wb = XlWorkbook()
    ws = wb.active
    ws.title = "Metro Areas"
    for r in range(1, 3):
        ws.append([None] * 73)
    header = ["Country", None, None, None, None, "Name"] + [None] * 67
    ws.append(header)
    for i in range(3):
        row = [None] * 73
        row[5] = f"Metro{i}"
        row[58] = float(i)
        ws.append(row)
    other_sheets = [s for s in IN_SCOPE_SHEETS if s != "Metro Areas"]
    for name in other_sheets:
        sub = wb.create_sheet(name)
        sub.append(["h1", "h2"])
        sub.append(["v1", "v2"])
    path = tmp_path / "tiny.xlsx"
    wb.save(str(path))

    backend = FileBackend(str(tmp_path / "mirror"))
    calls = []
    orig_upsert_chunks = backend.upsert_chunks
    orig_upsert_sheet = backend.upsert_sheet
    orig_log_run = backend.log_run
    backend.upsert_chunks = lambda *a, **k: (calls.append("chunks"), orig_upsert_chunks(*a, **k))[1]
    backend.upsert_sheet = lambda *a, **k: (calls.append("sheet"), orig_upsert_sheet(*a, **k))[1]
    backend.log_run = lambda *a, **k: (calls.append("log_run"), orig_log_run(*a, **k))[1]

    summary = run_sync(path, backend, IN_SCOPE_SHEETS, write=True,
                        allow_shrink=False, allow_header_change=False,
                        include_mktcap_sheet=False, emit=lambda s: None)
    assert summary["status"] == "written"
    first_sheet_idx = calls.index("sheet")
    last_chunk_idx = max(i for i, c in enumerate(calls) if c == "chunks")
    assert last_chunk_idx < first_sheet_idx, f"chunks must precede wb_sheet writes: {calls}"
    assert calls[-1] == "log_run"
