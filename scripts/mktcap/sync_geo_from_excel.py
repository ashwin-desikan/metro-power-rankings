#!/usr/bin/env python3
"""sync_geo_from_excel.py - pull Ashwin's metro curation from the workbook into mktcap_geo.

The City Lookup sheet of the CompaniesMarketCap workbook is where metro
assignments are actually curated (the 07-23 Supabase seed was a snapshot of it;
Excel has moved on every week since). This re-syncs: for every symbol whose
Excel row carries a VALIDATED metro that differs from mktcap_geo, PATCH metro/
city/state (mapped_by='excel-sync'). Never blanks a Supabase metro that Excel
lacks - those are reported for review instead. Run before the Saturday drill
whenever the ritual added assignments; retires at cutover (curation moves into
Supabase itself).

usage: sync_geo_from_excel.py [--write] [path-to-workbook]
       (dry-run by default; default workbook = the OneDrive master)
"""
import json, os, sys, urllib.parse
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import rest, select_all, in_list, log  # noqa: E402

DEFAULT_WB = r"C:\Users\ashwi\OneDrive\Excel Files\companiesmarketcap.com - Companies ranked by Market Cap - CompaniesMarketCap.com (1).xlsx"
TODAY = __import__("datetime").date.today().isoformat()


def load_excel(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["City Lookup"]
    rows = {}
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not r or len(r) < 6:
            continue
        name, symbol, metro, city, state = r[0], r[1], r[2], r[3], r[4]
        if not symbol:
            continue
        sym = str(symbol).strip()
        rows[sym] = {
            "name": str(name).strip() if name else "",
            "metro": str(metro).strip() if metro else "",
            "city": str(city).strip() if city else "",
            "state": str(state).strip() if state else "",
        }
    wb.close()
    return rows


def main(argv):
    write = "--write" in argv
    paths = [a for a in argv if not a.startswith("--")]
    wb_path = paths[0] if paths else DEFAULT_WB
    excel = load_excel(wb_path)
    log(f"excel City Lookup: {len(excel)} symbols ({wb_path})")

    valid = {v["metro"] for v in select_all("/rest/v1/mktcap_valid_metros?select=metro", order="metro")}
    geo = {g["symbol"]: g for g in select_all(
        "/rest/v1/mktcap_geo?select=symbol,metro,city,state", order="symbol")}
    log(f"supabase geo: {len(geo)} symbols, valid metros: {len(valid)}")

    updates, invalid, excel_blank = [], [], []
    for sym, e in excel.items():
        g = geo.get(sym)
        if g is None:
            continue  # symbol not tracked (or renamed); stubs handle new ones
        if not e["metro"]:
            if g["metro"]:
                excel_blank.append(sym)
            continue
        if e["metro"] not in valid:
            invalid.append((sym, e["metro"]))
            continue
        if (e["metro"] != (g["metro"] or "") or e["city"] != (g["city"] or "")
                or e["state"] != (g["state"] or "")):
            updates.append((sym, e))

    log(f"to update: {len(updates)} | excel-blank-but-supabase-mapped (NOT touched): "
        f"{len(excel_blank)} {excel_blank[:8]} | invalid metro names skipped: {len(invalid)} {invalid[:5]}")
    metro_only_new = sum(1 for s, e in updates if not geo[s]["metro"])
    log(f"of updates, net-new metro assignments: {metro_only_new}")

    if not write:
        log("dry-run: nothing written. Re-run with --write to persist.")
        return

    # group by identical payload to batch PATCHes
    by_payload = {}
    for sym, e in updates:
        key = (e["metro"], e["city"], e["state"])
        by_payload.setdefault(key, []).append(sym)
    n = 0
    for (metro, city, state), syms in by_payload.items():
        body = {"metro": metro, "city": city or None, "state": state or None,
                "mapped_at": TODAY, "mapped_by": "excel-sync"}
        for i in range(0, len(syms), 200):
            rest("PATCH", f"/rest/v1/mktcap_geo?symbol=in.({in_list(syms[i:i+200])})", body)
            n += len(syms[i:i+200])
    log(f"WRITE done: {n} geo rows updated")


if __name__ == "__main__":
    main(sys.argv[1:])
