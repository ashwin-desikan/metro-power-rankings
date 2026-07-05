#!/usr/bin/env python3
"""Load InternationalCricket.xlsx into the Supabase cricket_* mirror tables.

This runs on YOUR machine (it needs the workbook and real internet). It is the
reusable monthly-sync step: edit the workbook as you do today, then run this to
push the current state into Supabase. Full replace per table, so it is safe to
re-run any number of times.

Setup (once):
    pip install openpyxl supabase
    set SUPABASE_URL=https://nmprqkmymrdknffwnuur.supabase.co
    set SUPABASE_SERVICE_KEY=<your service_role key from Supabase > Settings > API>

Run:
    python load_cricket_to_supabase.py "C:\\path\\to\\InternationalCricket.xlsx"

The service_role key bypasses row-level security so writes are allowed. Keep it
secret: never commit it, never put it in front-end code.
"""
import os, sys, openpyxl
from supabase import create_client
from cricket_source import SHEET_TABLES, extract_sheet_rows

BATCH = 500


def main(wb_path):
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_KEY"]
    sb = create_client(url, key)

    wb = openpyxl.load_workbook(wb_path, read_only=True, data_only=True)
    grand = 0
    for sheet, (table, cols) in SHEET_TABLES.items():
        rows = extract_sheet_rows(wb[sheet])
        # full replace: clear the table, then insert current rows in sheet order
        sb.table(table).delete().gte("row_num", 0).execute()
        payload = []
        for i, r in enumerate(rows, start=1):
            rec = {"row_num": i}
            for c, v in zip(cols, r):
                rec[c] = v
            payload.append(rec)
        for j in range(0, len(payload), BATCH):
            sb.table(table).insert(payload[j:j + BATCH]).execute()
        got = sb.table(table).select("row_num", count="exact").limit(1).execute().count
        flag = "OK" if got == len(rows) else "MISMATCH!"
        print(f"  {table:32s} loaded {len(rows):6d}  in-db {got:6d}  {flag}")
        grand += len(rows)
    print(f"Done. {grand} rows across {len(SHEET_TABLES)} tables.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python load_cricket_to_supabase.py <InternationalCricket.xlsx>")
    main(sys.argv[1])
