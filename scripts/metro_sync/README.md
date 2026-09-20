# metro_sync

Mirrors MetroAreas.xlsx's sheets into Supabase (`wb_sheet` / `wb_chunk` /
`wb_sync_run`) so scripts/extract.py and the score engine can run on a
machine that has no copy of the workbook, with byte-identical output.

## What it is

- `codec.py`: cell encode/decode (datetime/date/time get a tagged dict) and
  the canonical-JSON hashing used for chunk_hash, content_hash and
  header_hash.
- `backends.py`: `FileBackend(dir)` (an offline mirror on disk) and
  `RestBackend()` (Supabase via PostgREST, built on `scripts/mktcap/common.py`).
  Same interface for both.
- `supabase_workbook.py`: the shim. `load(backend, cache_dir=..., mktcap_csv=...)`
  returns a `ShimWorkbook` whose `.sheetnames` / `__getitem__` / `iter_rows`
  reproduce openpyxl's read_only, data_only `iter_rows(values_only=True)`
  output exactly, for the argument combinations extract.py and
  metro_score/sources.py actually use. `MktCap_Data` is served from
  `scripts/mktcap/out/mktcap_export.csv`, not mirrored, unless
  `mktcap_from_sheet=True`.
- `sync_workbook.py`: the CLI that reads the real workbook and writes (or
  dry-runs) the mirror.
- `parity_cells.py`: proves the mirror byte/type-identical to the workbook.

## Commands

```
# offline, no workbook or network needed
python scripts/metro_sync/sync_workbook.py --self-test

# dry run against a local file mirror
python scripts/metro_sync/sync_workbook.py --backend file:/path/to/mirror

# write it
python scripts/metro_sync/sync_workbook.py --backend file:/path/to/mirror --write

# write to Supabase (default backend)
python scripts/metro_sync/sync_workbook.py --write

# prove the mirror matches the workbook cell for cell
python scripts/metro_sync/parity_cells.py --workbook MetroAreas.xlsx --backend file:/path/to/mirror
```

## Guards (sync_workbook.py --write)

Every guard HOLDS the whole run: exit 20, nothing written. A `wb_sync_run`
row with status `held` is logged only in `--write` mode (a dry run that
would hold just reports it and exits 20; there's nothing to log).

1. A sheet loses more than 2% of its rows or more than 50 rows since the
   last sync: override with `--allow-shrink`.
2. `error_cells` rises by more than 10 on any sheet versus the previous
   sync: no override; fix the source.
3. Metro Areas' `header_hash` changed: override with `--allow-header-change`.
4. Metro Areas column BG (index 58) is `None` on more than 1% of named
   rows: usually means the workbook was saved without recalculating.
5. An in-scope sheet is missing from the workbook entirely.

The first-ever sync (an empty backend) skips guards 1-3; there is nothing
to compare against yet. Guards 4 and 5 always apply.

## Exit codes

- `0`: no change, or a dry run (whether or not it would change anything).
- `10`: written.
- `20`: held (a guard tripped).
- `1`: error (bad workbook, missing source, etc.).

## MktCap_Data is not mirrored

Supabase already owns market-cap data through the separate mktcap pipeline
(`scripts/mktcap/`). `MktCap_Data` is deliberately excluded from
`IN_SCOPE_SHEETS`; the feed extract.py reads in supabase mode is the
committed CSV, `scripts/mktcap/out/mktcap_export.csv`, exactly the same file
it reads in workbook mode. `--include-mktcap-sheet` (or
`METRO_SYNC_MKTCAP=sheet`) exists only to mirror it anyway, for an A/B test
that feeds both code paths the same underlying data: never use it in a real
sync.
