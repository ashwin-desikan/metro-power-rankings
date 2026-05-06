"""Extract per-country Overture division_area parquet files from the global parquet.

Produces one parquet per country (full Overture schema preserved), suitable
for direct use in build-metro-boundaries.py via COUNTRY_PARQUET_MAP. Once
a country's per-country parquet exists, point COUNTRY_PARQUET_MAP at it
and that country's boundary build will scan ~10-500 MB instead of the full
5.8 GB global file.

Workflow:
  1. python scripts\\extract-overture-parquet.py           (default 8 countries)
  2. Add COUNTRY_PARQUET_MAP entries in build-metro-boundaries.py:
       "France": r"C:\\Users\\ashwi\\Desktop\\Projects\\MapData\\overture-FR.parquet",
  3. Re-run python scripts\\build-metro-boundaries.py and observe the
     per-parquet routing summary to confirm it picks up the per-country file.

Defaults match scripts\\dump-overture-country.py:
  GB DE FR IT ES NL PL JP AD SM VA

Override via env:
  OVERTURE_DIVISION_AREA      - source global parquet path
  OVERTURE_PER_COUNTRY_DIR    - output dir (default: same dir as source)
  OVERTURE_EXTRACT_COUNTRIES  - comma-sep ISO codes to extract

Streaming write: each batch is filtered per country and appended to that
country's open ParquetWriter. Peak RSS depends on the largest single batch
(~10k rows by default), not the full dataset. Output schema is identical
to the source parquet, so any tool that reads the global parquet works
unchanged on the per-country files.

Compression: zstd level 3 by default (good ratio, fast decode). Override
with OVERTURE_EXTRACT_COMPRESSION=snappy if you prefer.
"""
from __future__ import annotations

import os
import sys
import time
from collections import Counter
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


SOURCE_PARQUET = os.environ.get(
    "OVERTURE_DIVISION_AREA",
    r"C:\Users\ashwi\Desktop\Projects\MapData\global-division-area.parquet",
)
OUT_DIR = Path(os.environ.get(
    "OVERTURE_PER_COUNTRY_DIR",
    str(Path(SOURCE_PARQUET).parent),
))
DEFAULT_COUNTRIES = ("GB", "DE", "FR", "IT", "ES", "NL", "PL", "JP", "AD", "SM", "VA")
COUNTRIES = tuple(
    s.strip().upper()
    for s in os.environ.get(
        "OVERTURE_EXTRACT_COUNTRIES",
        ",".join(DEFAULT_COUNTRIES),
    ).split(",")
    if s.strip()
)
COMPRESSION = os.environ.get("OVERTURE_EXTRACT_COMPRESSION", "zstd")


def main():
    src = Path(SOURCE_PARQUET)
    if not src.exists():
        print(f"ERROR: source parquet not found at {src}", file=sys.stderr)
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Source : {src}  ({src.stat().st_size / 1e9:.2f} GB)")
    print(f"Output : {OUT_DIR}")
    print(f"Filter : {COUNTRIES}")
    print(f"Compression: {COMPRESSION}")
    print()

    pf = pq.ParquetFile(str(src))
    schema = pf.schema_arrow

    # One open ParquetWriter per target country. We don't open them up front -
    # we open lazily on first matching batch so countries with zero rows never
    # produce empty files.
    writers: dict[str, pq.ParquetWriter] = {}
    out_paths: dict[str, Path] = {
        iso: OUT_DIR / f"overture-{iso}.parquet"
        for iso in COUNTRIES
    }
    counts: Counter[str] = Counter()
    wanted = set(COUNTRIES)

    t0 = time.time()
    rows_scanned = 0
    rows_kept = 0
    batches_processed = 0
    print(f"Scanning {src.name} ...")
    try:
        for batch in pf.iter_batches(batch_size=10_000):
            batches_processed += 1
            countries_col = batch.column("country").to_pylist()
            rows_scanned += len(countries_col)

            # Group row indices by country in one pass
            per_country_indices: dict[str, list[int]] = {}
            for i, c in enumerate(countries_col):
                if c in wanted:
                    per_country_indices.setdefault(c, []).append(i)

            for iso, idxs in per_country_indices.items():
                if not idxs:
                    continue
                sub_batch = batch.take(pa.array(idxs))
                if iso not in writers:
                    writers[iso] = pq.ParquetWriter(
                        str(out_paths[iso]),
                        schema,
                        compression=COMPRESSION,
                    )
                writers[iso].write_batch(sub_batch)
                counts[iso] += len(idxs)
                rows_kept += len(idxs)

            if batches_processed % 100 == 0:
                elapsed = time.time() - t0
                print(f"  ... {batches_processed} batches  "
                      f"{rows_scanned:,} scanned  {rows_kept:,} kept  "
                      f"{elapsed:.1f}s")
    finally:
        for w in writers.values():
            w.close()

    elapsed = time.time() - t0
    print()
    print("=" * 60)
    print(f"Scanned {rows_scanned:,} rows in {elapsed:.1f}s "
          f"({batches_processed} batches)")
    print(f"Wrote {sum(counts.values()):,} matching rows across "
          f"{len(counts)} countries")
    print()
    for iso in COUNTRIES:
        p = out_paths[iso]
        if iso in counts:
            sz_mb = p.stat().st_size / (1024 * 1024)
            print(f"  {iso}: {counts[iso]:>8,} rows -> {p.name}  "
                  f"({sz_mb:>7.1f} MB)")
        else:
            print(f"  {iso}:        0 rows (nothing matched, no file written)")
    print("=" * 60)
    print()
    print("Next step: add the per-country parquet entries to "
          "COUNTRY_PARQUET_MAP in scripts\\build-metro-boundaries.py, e.g.:")
    print()
    for iso in COUNTRIES:
        if iso not in counts:
            continue
        # Map ISO to a likely canonical workbook name (best-effort hint only;
        # user knows the actual canonical key from COUNTRY_TO_ISO).
        hint = {
            "GB": "United Kingdom",
            "FR": "France",
            "DE": "Germany",
            "IT": "Italy",
            "ES": "Spain",
            "NL": "Netherlands",
            "PL": "Poland",
            "JP": "Japan",
            "AD": "Andorra",
            "SM": "San Marino",
            "VA": "Vatican City",
        }.get(iso, iso)
        print(f'    "{hint}": r"{out_paths[iso]}",')


if __name__ == "__main__":
    main()
