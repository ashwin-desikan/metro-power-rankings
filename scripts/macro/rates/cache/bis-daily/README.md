# BIS incremental cache

Written by `scripts/macro/rates/refresh.py` (never by hand). One file per
BIS economy, `<ISO2>.json`, holding a compact rolling window (about 400
days) of daily policy-rate levels fetched from the BIS SDMX v2 API:

```json
{"rows": [{"date": "2026-08-01", "level": 4.5}, ...]}
```

`scripts/macro/rates/common.py`'s `load_bis_daily()` / `load_bis_daily_all()`
merge this on top of the 470MB bulk CSV (`_scratch/macro/bis/
WS_CBPOL_csv_flat.csv`), cache winning on a shared date, so every builder
sees the latest fetched levels without ever needing a fresh bulk download.
Gitignored: it is a cache, not a data file, and rebuilds itself on the next
`refresh.py` run.
