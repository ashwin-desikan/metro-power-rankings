#!/usr/bin/env python3
"""Supabase write helpers for the cricket pipeline (append-only).

Used by the stagers (append new matches) and the ICC rankings recompute
(append the new month's ranking rows). Continues row_num from the current max
so original sheet order is preserved and downstream date-sorts are unaffected.
Needs SUPABASE_URL + SUPABASE_SERVICE_KEY (service role bypasses RLS).
"""
import os
from cricket_source import SHEET_TABLES, normalize_cell


def make_client():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]
    return create_client(url, key)


def _max_row_num(sb, table):
    r = sb.table(table).select("row_num").order("row_num", desc=True).limit(1).execute()
    return r.data[0]["row_num"] if r.data else 0


def append_sheet_rows(sheet, rows, sb=None, batch=500):
    """Append rows (each a sequence in that sheet's DB-column order) to its table,
    continuing row_num from the current max. Empty strings are stored as NULL.
    Returns the number of rows inserted."""
    sb = sb or make_client()
    table, cols = SHEET_TABLES[sheet]
    start = _max_row_num(sb, table)
    payload = []
    for i, row in enumerate(rows, start=start + 1):
        rec = {"row_num": i}
        for c, v in zip(cols, row):
            v = normalize_cell(v)
            rec[c] = None if v == "" else v
        payload.append(rec)
    for j in range(0, len(payload), batch):
        sb.table(table).insert(payload[j:j + batch]).execute()
    return len(payload)


def append_matches(rows, sb=None):
    """rows: sequences in the Matches header order (Format..Ball-by-Ball)."""
    return append_sheet_rows("Matches", rows, sb=sb)
