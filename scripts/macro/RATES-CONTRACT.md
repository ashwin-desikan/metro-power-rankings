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
  ],
  "listed": true,
  "superseded_by": null,
  "ended": null,
  "ended_note": null
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
- `listed` is `false` on a `bis-<iso2>` file whose iso2 also has an own-spine
  bank (the 11 in `ISO2_SUPERSEDED_BY` in `common.py`: GB/boe, US/fed,
  XM/ecb, JP/boj, CH/snb, SE/riksbank, CA/boc, AU/rba, NZ/rbnz, NO/norges,
  DE/buba). That file is still written and still cross-checked against, it
  is simply not a second listing of the same central bank; `superseded_by`
  names the code that supersedes it. Every other file is `listed: true`,
  `superseded_by: null`.
- `ended`/`ended_note` mark a currency the bank no longer sets because the
  euro replaced it: looked up in `common.py`'s `ISO2_ENDED` by `iso2`, so it
  applies automatically to both a country's own-spine file and its
  `bis-<iso2>` cross-check file. `null`/`null` otherwise.
- Dates are ISO. No time zones. Nothing after the build date.
- `built` is the run date; the UI stamp reads it.

## Index

```json
{
  "built": "2026-09-08",
  "banks": [
    {"code": "boe", "name": "Bank of England", "short": "BoE", "country": "United Kingdom", "iso2": "GB",
     "founded": "1694-07-27", "series_from": "1694-10-01", "last_change": "2025-12-18",
     "level": 3.75, "changes": 852, "changes_12m": 1, "spine": "own", "power_rank": 3,
     "hold_days": 264, "direction_12m": "cutting", "ended": null, "ended_note": null}
  ]
}
```

`index.json` has ONE ROW PER CENTRAL BANK: `build_index.py` drops every
`listed: false` file before computing entries, so a `bis-<iso2>` file
superseded by an own-spine bank never appears here at all (it still exists
on disk, for cross-checking).

`founded` is the real founding date (null for BIS-only banks). `series_from`
is the file's overall span start (`first_change`) -- a series start, not
necessarily a founding. `power_rank` is `public/data/countries.json`'s
`scoreRank`, joined on `country` with aliases (Czechia -> Czech Republic,
Hong Kong SAR -> Hong Kong, Korea -> South Korea, Turkiye -> Turkey; Euro
area -> always null, not a miss). `build_index.py` prints any other bank
left without a match.

`changes`, `changes_12m`, `direction_12m` and `hold_days` are computed from
POLICY-era rows only. `direction_12m` is `cutting`, `hiking`, `hold` or
`mixed` from the sign of the moves in the trailing 365 days; `market` when
the bank's latest instrument era is a market era (its current level is
BIS-observed, not a decision) or it has no policy-era rows at all; `ended`
when the bank's currency was replaced by the euro (see `ended` above) -- an
ended bank is not "on hold", so `hold_days` is null and `changes_12m` is
forced to 0 rather than reporting a multi-decade hold. `level` for a
`market` bank comes from the latest `market[]` observation; for an `ended`
bank it is the last level as of the end date. `hold_days` is days since the
last POLICY change to `built`, null when there is none or the bank has
ended.

A bank whose data has gone stale (last change more than 400 days before
`built`) with no `ended` date is printed by `build_index.py` at every run
("Stale, no ended date set...") rather than silently reclassified --
Ashwin reviews that list and decides case by case.

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
