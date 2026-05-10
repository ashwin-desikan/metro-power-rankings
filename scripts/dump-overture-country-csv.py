"""Dump each per-country Overture parquet to a CSV file.

Mirrors the schema of the existing scripts/dump-overture-country.py xlsx
output, but writes plain CSV (UTF-8 with BOM so Excel opens Cyrillic /
Hanzi cleanly). One CSV per country.

Default countries: the seven new-country expansion set
(IE, CN, AT, CH, BE, BR, RU). Override with OVERTURE_DUMP_COUNTRIES env var
or pass ISO codes on the command line.

Output dir: Overture-Per-Country-Raw/ (existing convention).
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
DEFAULT_COUNTRIES = ("IE", "CN", "AT", "CH", "BE", "BR", "RU")

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


def dump_country(iso, out_dir):
    src = Path(SOURCE_DIR) / f"overture-{iso}.parquet"
    if not src.exists():
        print(f"  SKIP {iso}: parquet not found at {src}")
        return
    out_path = out_dir / f"overture-{iso}.csv"
    t0 = time.time()
    cols = ["id", "country", "region", "subtype", "admin_level", "class",
            "names", "is_land", "is_territorial", "bbox", "division_id"]
    pf = pq.ParquetFile(str(src))
    rows_written = 0
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8-sig", newline="") as cf:
        w = csv.writer(cf)
        w.writerow(HEADER)
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
                # Common is sometimes a list of [lang, name] pairs, sometimes
                # a dict. Either way, JSON-serialize verbatim for the CSV cell
                # so all language variants survive in one column.
                common_json = json.dumps(common, ensure_ascii=False) if common else ""
                bbox = bboxes[i] or {}
                xmin = bbox.get("xmin", "") if isinstance(bbox, dict) else ""
                ymin = bbox.get("ymin", "") if isinstance(bbox, dict) else ""
                xmax = bbox.get("xmax", "") if isinstance(bbox, dict) else ""
                ymax = bbox.get("ymax", "") if isinstance(bbox, dict) else ""
                w.writerow([
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
    print(f"  wrote {out_path}: {rows_written:,} rows ({elapsed:.1f}s)")


def main():
    countries = []
    for tok in sys.argv[1:]:
        if tok and len(tok) <= 4 and tok.isalpha():
            countries.append(tok.upper())
    if not countries:
        countries = list(DEFAULT_COUNTRIES)
    print(f"Source dir: {SOURCE_DIR}")
    print(f"Output dir: {OUT_DIR}")
    print(f"Countries: {countries}")
    print()
    for iso in countries:
        print(f"=== {iso} ===")
        dump_country(iso, OUT_DIR)


if __name__ == "__main__":
    main()
