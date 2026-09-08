# Policy rate spines: the data contract

One JSON per central bank at `public/data/business/economy/rates/<code>.json`
and one `index.json` beside them. Every builder under `scripts/macro/rates/`
writes through `common.py` so the shape cannot drift.

## Bank file

```json
{
  "code": "boe",
  "name": "Bank of England",
  "short": "BoE",
  "country": "United Kingdom",
  "iso2": "GB",
  "currency": "GBP",
  "founded": "1694-07-27",
  "first_change": "1694-10-01",
  "last_change": "2025-12-18",
  "built": "2026-09-08",
  "instruments": [
    {"from": "1694-10-01", "to": "1972-10-12", "name": "Bank Rate",
     "text": "Bank Rate", "kind": "policy"},
    {"from": "1972-10-13", "to": "1981-08-19", "name": "Minimum Lending Rate",
     "text": "Minimum Lending Rate", "kind": "policy"},
    {"from": "2006-08-03", "to": null, "name": "Bank Rate",
     "text": "Bank Rate", "kind": "policy"}
  ],
  "changes": [
    {"date": "1694-10-01", "level": 6.0, "change": null, "era": 0},
    {"date": "2025-12-18", "level": 3.75, "change": -0.25, "era": 4}
  ],
  "market": [],
  "path": [["1694-10-01", 6.0], ["2025-12-18", 3.75]],
  "coverage": {
    "spine": "own",
    "note": "Every change from the Bank's own table; BIS daily from 1946 agrees on every date checked."
  },
  "sources": [
    {"label": "Bank of England, Bank Rate history", "url": "https://...", "licence": "PDDL via datahub"},
    {"label": "BIS central bank policy rates (CBPOL)", "url": "https://data.bis.org/topics/CBPOL"}
  ]
}
```

Rules.
- `changes` contains POLICY-era decisions only, plus `"break": true` marker
  rows (see below) -- never a market era's individual ticks. Sorted
  ascending, one row per decision date, `level` in per cent with at most 4
  decimals, `change` = level minus the previous level (null on the first
  row and on the first row after an instrument break).
- Each row carries `era`, the integer index into `instruments[]` its date
  falls in. Rows do NOT repeat the instrument text; look it up via `era`.
- A range instrument (the Fed since Dec 2008, the RBA's 1990 band) stores the
  MIDPOINT in `level` and the bounds in `lower`/`upper` on that row.
- An instrument break is a row with `"break": true`, a `note`, and `era` (the
  era being entered), never a silent restart. Break rows always stay in
  `changes` regardless of the era's kind, on both sides of the break.
- `instruments[]` entries carry `name` (a short label, the bank's own term,
  under 40 characters, e.g. "Bank Rate", "Fed funds target range"), `text`
  (the full source description that name was shortened from) and `kind`:
  `"policy"` (the bank sets it by decision: discount rate, Bank Rate,
  target, target range, repo rate, OCR, deposit facility) or `"market"` (a
  traded rate BIS uses as a proxy: interbank, call rate, effective funds,
  money market). `kind` is decided by a keyword rule in `common.py`
  (`classify_kind`) with hard-coded overrides for ambiguous text; "middle
  of ... range" always counts as policy.
- A market era's individual observations never appear in `changes`. Instead
  `market[]` carries one summary row per market era: `{era, from, to,
  observations, first, last, min, max}`.
- `path` is the compact [date, level] series for charting the whole span:
  every point for a policy era, thinned to at most one point per ISO week
  (always keeping each era's first and last point) for a market era.
- `coverage.spine` is `own` (the bank's own change table), `bis` (derived by
  differencing BIS daily levels; every level day is a change day) or `mixed`
  (own history to a date, BIS after or before). `coverage.note` says which
  years come from which, in one sentence a reader can trust.
- `founded` is the real institutional founding date where a builder knows
  one (every own-spine bank); null for BIS-only files, which don't carry
  founding-date knowledge, only a series start.
- Dates are ISO. No time zones. Nothing after the build date.
- `built` is the run date; the UI stamp reads it.

## Index

```json
{
  "built": "2026-09-08",
  "banks": [
    {"code": "boe", "name": "Bank of England", "short": "BoE", "iso2": "GB",
     "founded": "1694-07-27", "series_from": "1694-10-01", "last_change": "2025-12-18",
     "level": 3.75, "changes": 852, "changes_12m": 1, "spine": "own",
     "hold_days": 264, "direction_12m": "cutting"}
  ]
}
```

`founded` is the real founding date (null for BIS-only banks). `series_from`
is the file's overall span start (`first_change`) -- a series start, not
necessarily a founding. `changes`, `changes_12m`, `direction_12m` and
`hold_days` are computed from POLICY-era rows only. `direction_12m` is
`cutting`, `hiking`, `hold` or `mixed` from the sign of the moves in the
trailing 365 days, or `market` when the bank's latest instrument era is a
market era (its current level is BIS-observed, not a decision) or when it
has no policy-era rows at all. `level` in that case comes from the latest
`market[]` observation instead of a stale policy row. `hold_days` is days
since the last POLICY change to `built`, null when there is none.

## Bank codes

boe, fed, ecb, riksbank, boj, snb, boc, rba, rbnz, norges, buba (Bundesbank,
1948 to 1998, ends), plus BIS-only economies keyed by lowercase iso2 with a
`bis-` prefix (`bis-br`, `bis-in`, ...). A bank with its own spine ALSO
carries the BIS series for cross-checking, but only one `changes` list is
published: the spine. The builder prints the count of disagreement dates
against BIS and refuses to write a file whose own spine disagrees with BIS
on more than 2% of overlapping change dates, so a bad parse never ships.

## Sources of record (Ashwin, 2026-09-08)

Complete to founding. BIS is the join layer, not the spine, wherever the
bank publishes its own history. See `Macro Hub - scoping 2026-09-08.md`
section 4 for the per-bank table.
