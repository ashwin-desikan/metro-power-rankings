---
name: mktcap-refresh
description: "Refresh the CompaniesMarketCap -> Supabase market-cap pipeline (scripts/mktcap). Use whenever the user wants to 'run the mktcap refresh', 'update market caps', 'refresh company valuations', 'check the metro curation queue', or asks about new unmapped companies from CompaniesMarketCap.com / CB Insights unicorns. Chains fetch_source.py -> build_merged.py [--write] -> export_csv.py (write only), gated by an offline self-test and a >5% week-over-week source-count sanity check that aborts before writing. Writes require the Supabase service_role key (anon lost write access on mktcap_companies/geo/valuations 2026-08-02, migration lock_down_mktcap_pipeline_writes); reads stay public. Do NOT use for the Excel-workbook-driven metro/sports pipeline (that's workbook-sync) -- this only touches the mktcap_* Supabase tables and the eventual MktCap_Data worksheet import bridge."
---

# mktcap-refresh

Runs the weekly CompaniesMarketCap.com + CB Insights unicorn ingest into the
`mktcap_*` Supabase tables that back the site's market-cap figures. Unlike
workbook-sync, the source of truth here is Supabase, not an xlsx file — the
xlsx only re-enters the picture as a one-way export bridge after `--write`.

## When to invoke

Trigger on any of:

- "run the mktcap refresh" / "update market caps" / "refresh company valuations"
- "check the metro curation queue" / "any new unmapped companies?"
- A user message mentioning CompaniesMarketCap.com or the CB Insights unicorn list
- Diagnosing why a company's valuation or metro looks stale/wrong on the site
- After any change to `scripts/mktcap/*.py` (verify with `--self-test` at minimum)

Do NOT trigger for the MetroAreas/league-workbook pipeline (`workbook-sync`
owns that) or for anything not touching `mktcap_*` tables.

## What this skill assumes

- Working directory is `C:\Users\ashwi\Desktop\Projects\Metro Area Project`.
- Supabase project `nmprqkmymrdknffwnuur`. Reads are public (`USING (true)`);
  writes to `mktcap_companies`, `mktcap_geo`, `mktcap_valuations` require the
  **service_role** key — the anon key that used to work was locked out
  (2026-08-02 security review; see `scripts/mktcap/README.md` "Access +
  hardening"). The key lives in `scripts/mktcap/supabase_key.txt` (gitignored)
  or env `MKTCAP_SUPABASE_KEY`. If a run fails with an HTTP 401/403 from
  PostgREST, the key is missing, stale, or still the old anon key — that is
  the first thing to check, not a code bug.
- `mktcap_overrides`, `mktcap_private`, `mktcap_unicorns`, `mktcap_valid_metros`,
  `mktcap_symbol_changes` are read-only to the pipeline; they're curated by
  hand via the Supabase MCP, not written by any script here.
- No GitHub Action or launchd job runs this today — it's manual/ad hoc
  (`common.py`'s own docstring: "Runs on the Mac mini (weekly) or any machine
  with network access"). Don't assume a cron job will catch a skipped week.
- This does NOT feed the site JSON automatically. A `--write` run only
  updates Supabase + produces `out/mktcap_export.csv`; getting that into
  `public/data/**` is a separate manual step (see "MetroAreas.xlsx import
  contract" below) that this skill does not perform.

## How to run

```
python refresh.py --self-test    # offline fixture tests, no network, run first
python refresh.py                # dry-run: fetch + report, NO writes (default)
python refresh.py --write        # writes snapshot + diffs + out/mktcap_export.csv
```

All from `scripts/mktcap/`. There is no `--only`/`--skip` flag set like
workbook-sync has — it's a strict 3-stage chain (`fetch_source.py` ->
`build_merged.py [--write]` -> `export_csv.py` on write only), each stage a
separate subprocess that aborts the whole run non-zero on failure.

| Situation                                  | Command                          |
|---------------------------------------------|-----------------------------------|
| After any code change to scripts/mktcap/*   | `python refresh.py --self-test`  |
| Routine check / before a real write          | `python refresh.py`              |
| Weekly refresh, ready to persist             | `python refresh.py --write`      |
| A source fetch keeps failing                 | Drop `companiesmarketcap.csv` and/or `unicorns.html`/`unicorns.csv` into `drop/`, then re-run |

## What to do at each phase

1. **Before invoking `--write`.** Run `--self-test` then a plain dry-run
   first and read the report. Show the user the report summary (merged
   count, top company, mapped-metro count, new/removed companies, IPO
   dedups, ticker-rename candidates, metro queue) before proposing `--write`.
   Only run `--write` after the user has actually seen that report — this
   mirrors the repo's dry-run-by-default discipline (`CLAUDE.md` rule 3), not
   a special rule invented for this skill.

2. **Read the sanity gate seriously.** `build_merged.py` aborts before
   writing if either source's row count swings >5% week-over-week. If that
   fires, assume a fetch/parse bug first (per `CLAUDE.md` rule: "assume your
   own code first") — do not add a flag to force past it.

3. **After a `--write` run.** Report:
   - New companies and the **METRO QUEUE COUNTS** line. The queue is a standing
     backlog of thousands (mostly `mapped_by='seed'` rows that arrived unmapped
     in the 2026-07-23 workbook seed), so report `new` and `notable` — not the
     whole list, which is the same names every week.
     These need a human HQ-in-metro (~30km) call — the pipeline never
     guesses. The ~30km is a default, not the test: where the metro is a
     polycentric REGION (Rhine-Neckar, Rhine-Ruhr, and `Frankfurt` = Rhein-Main)
     an HQ inside the region maps even past 30km. See "Region vs radius" in
     scripts/mktcap/README.md. Assigning one is a direct SQL `update mktcap_geo set metro=...`
     via the Supabase MCP, not a script. When you have looked and no valid
     metro applies, set `mapped_by='no-metro'` (metro stays null) — that is the
     queue's terminal state and drops the row from every future report.
   - "possible ticker renames (REVIEW, not auto-applied)" — flag these to
     the user; they are not safe to apply without confirmation.
   - Point out `out/mktcap_export.csv` exists but has NOT been imported into
     the site's JSON yet (see below) — don't imply the site is updated.

## The MetroAreas.xlsx import bridge (manual, out of scope for this skill)

A `--write` run does not touch `public/data/**`. To get the new numbers live:
replace `A2:D{N+1}` of the `MktCap_Data` sheet in `MetroAreas.xlsx` from
`out/mktcap_export.csv`, stamp `E1`/`E2`, confirm calc mode Automatic, save —
then run `workbook-sync` for the normal `sync_source_xlsx.py -> extract.py`
flow. This skill stops at "here's the export CSV"; hand off to `workbook-sync`
for the rest, don't try to do it inline here.

## Failure recipes

| Symptom                                   | Likely cause                                              | First move |
|--------------------------------------------|-------------------------------------------------------------|------------|
| HTTP 401/403 from any `rest()` call         | Missing/stale service_role key, or still the old anon key   | Check `supabase_key.txt` / `MKTCAP_SUPABASE_KEY`; anon can no longer write as of 2026-08-02. |
| `fetch_source.py` fails                     | Source site changed/blocked the fetch                        | Manually drop `companiesmarketcap.csv` / `unicorns.html` or `.csv` into `drop/`, re-run. |
| Sanity gate abort (>5% swing)               | Fetch or parse bug, not a real market move                  | Diff the raw fetched file against last week's before assuming the market actually moved that much. |
| Company sitting in the metro queue for weeks | Nobody's assigned it yet                                    | Surface it explicitly to the user each run; don't let it silently persist. |
| Ticker rename flagged but site still shows old symbol | Renames are REVIEW-only, never auto-applied              | Confirm the rename with the user, then apply by hand via the Supabase MCP. |

## What this skill does NOT do

- Does NOT write to `mktcap_overrides`, `mktcap_private`, `mktcap_unicorns`,
  `mktcap_valid_metros`, or `mktcap_symbol_changes` — those are hand-curated.
- Does NOT delete rows anywhere in this pipeline (no delete grants exist).
- Does NOT touch `public/data/**` or trigger a Vercel build by itself.
- Does NOT auto-resolve the metro curation queue or apply ticker renames.

## Source of truth

`scripts/mktcap/README.md` ("Access + hardening" section especially) and
`scripts/mktcap/refresh.py`/`build_merged.py`/`common.py`. If the pipeline
shape changes, update both the README and this file.
