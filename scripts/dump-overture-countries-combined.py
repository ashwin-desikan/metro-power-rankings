"""Dump per-country Overture parquets into ONE combined CSV file.

Same schema and UTF-8-with-BOM encoding as scripts/dump-overture-country-csv.py,
but writes a single output file collating all listed countries. Useful when
the editorial matching pass benefits from one big sortable / filterable
sheet rather than 20+ separate files.

Usage:
  python scripts\\dump-overture-countries-combined.py BG TW MD EG KW DZ GR VN IL WS TN ID SE AR QA FI VE DK GH HU PR
  python scripts\\dump-overture-countries-combined.py --out my-batch.csv BG TW MD

Default output: Overture-Per-Country-Raw/overture-combined.csv

The script reads each country's per-country parquet from SOURCE_DIR
(default C:\\Users\\ashwi\\Desktop\\Projects\\MapData), so the per-country
parquets must already exist. Generate them first via
scripts/extract-overture-parquet.py.
"""
from __future__ import annotations

import csv
import json
import os
import sys
import time
from pathlib import Path

import pyarrow.parquet as pq


SOURCE_DIR = os.environ.get(
    "OVERTURE_PER_COUNTRY_DIR",
    r"C:\Users\ashwi\Desktop\Projects\MapData",
)
OUT_DIR = Path(os.environ.get(
    "OVERTURE_DUMP_DIR",
    "Overture-Per-Country-Raw",
))
DEFAULT_OUT_NAME = "overture-combined.csv"

HEADER = [
    "GERS ID",
    "Country (ISO)",
    "Region (ISO 3166-2)",
    "Subtype",
    "Admin Level",
    "Class",
    "Primary Name",
    "Common Names (JSON)",
    "Is Land",
    "Is Territorial",
    "BBox xmin",
    "BBox ymin",
    "BBox xmax",
    "BBox ymax",
    "Division ID",
]


def stream_country(iso, writer):
    """Stream one per-country parquet into the open csv writer.

    Returns the number of rows appended.
    """
    src = Path(SOURCE_DIR) / f"overture-{iso}.parquet"
    if not src.exists():
        print(f"  SKIP {iso}: parquet not found at {src}")
        return 0
    cols = ["id", "country", "region", "subtype", "admin_level", "class",
            "names", "is_land", "is_territorial", "bbox", "division_id"]
    pf = pq.ParquetFile(str(src))
    rows_written = 0
    t0 = time.time()
    for batch in pf.iter_batches(batch_size=10_000, columns=cols):
        countries = batch.column("country").to_pylist()
        ids = batch.column("id").to_pylist()
        regions = batch.column("region").to_pylist()
        subtypes = batch.column("subtype").to_pylist()
        admins = batch.column("admin_level").to_pylist()
        classes = batch.column("class").to_pylist()
        names_col = batch.column("names").to_pylist()
        is_land = batch.column("is_land").to_pylist()
        is_terr = batch.column("is_territorial").to_pylist()
        bboxes = batch.column("bbox").to_pylist()
        div_ids = batch.column("division_id").to_pylist()
        for i, c in enumerate(countries):
            if c != iso:
                continue
            nm = names_col[i] or {}
            primary = nm.get("primary") if isinstance(nm, dict) else ""
            common = nm.get("common") if isinstance(nm, dict) else None
            common_json = json.dumps(common, ensure_ascii=False) if common else ""
            bbox = bboxes[i] or {}
            xmin = bbox.get("xmin", "") if isinstance(bbox, dict) else ""
            ymin = bbox.get("ymin", "") if isinstance(bbox, dict) else ""
            xmax = bbox.get("xmax", "") if isinstance(bbox, dict) else ""
            ymax = bbox.get("ymax", "") if isinstance(bbox, dict) else ""
            writer.writerow([
                ids[i] or "",
                countries[i] or "",
                regions[i] or "",
                subtypes[i] or "",
                admins[i] if admins[i] is not None else "",
                classes[i] or "",
                primary or "",
                common_json,
                is_land[i] if is_land[i] is not None else "",
                is_terr[i] if is_terr[i] is not None else "",
                xmin, ymin, xmax, ymax,
                div_ids[i] or "",
            ])
            rows_written += 1
    elapsed = time.time() - t0
    print(f"  appended {iso}: {rows_written:,} rows ({elapsed:.1f}s)")
    return rows_written


def main():
    countries = []
    out_name = DEFAULT_OUT_NAME
    argv = sys.argv[1:]
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok == "--out":
            if i + 1 >= len(argv):
                sys.exit("--out requires a filename argument")
            out_name = argv[i + 1]
            i += 2
            continue
        if tok and len(tok) <= 4 and tok.isalpha():
            countries.append(tok.upper())
        i += 1

    if not countries:
        sys.exit("Pass one or more ISO country codes (e.g. BG TW MD EG)")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / out_name

    print(f"Source dir: {SOURCE_DIR}")
    print(f"Output    : {out_path}")
    print(f"Countries : {countries}")
    print()

    total = 0
    t0 = time.time()
    with open(out_path, "w", encoding="utf-8-sig", newline="") as cf:
        w = csv.writer(cf)
        w.writerow(HEADER)
        for iso in countries:
            print(f"=== {iso} ===")
            total += stream_country(iso, w)

    elapsed = time.time() - t0
    print()
    print(f"Done. {total:,} rows across {len(countries)} countries in {elapsed:.1f}s")
    print(f"Output: {out_path}  ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
