---
name: workbook-sync
description: "Run the full Metro Area Project data refresh pipeline end to end. Use whenever the user says they updated MetroAreas.xlsx, edited a league workbook (NFL_all.xlsx, NBA.xlsx, NHL.xlsx, MLB.xlsx), wants to 'sync the workbook', 'rebuild the data', 'refresh the JSON', 'rerun the ETL', regenerate metro boundaries, or anything that should propagate xlsx edits to public/data/*.json and the boundary geojsons. Chains sync_source_xlsx.py -> stage-leagues.py -> extract.py -> build-nfl-data.py -> build-nba-data.py -> build-mlb-data.py -> build-nhl-data.py -> build-sports-index.py -> build-metro-boundaries.py -> client-import check -> tsc, then proposes a commit. The stage step copies league workbooks out of OneDrive so OneDrive sharing locks never block a builder mid-run, and treats stale (pre-workbook) ~$ lockfiles as warnings rather than aborts. Do NOT use for content/Substack drafts, plugin work, or anything that does not touch workbook-derived data."
---

# workbook-sync

Compresses the 7-to-9 step Metro Area Project data refresh into one orchestrated
run, with verify gates before the proposed commit. The skill body tells you
(future Claude) when and how to fire `scripts/run-workbook-sync.py` and what to
do at each handoff with the user.

## When to invoke

Trigger on any of:

- "I updated MetroAreas.xlsx" / "I edited the workbook" / "I added a team"
- "sync the workbook" / "rebuild data" / "rerun ETL" / "refresh the JSON"
- A user message that says the league xlsx (NFL/NBA/NHL/MLB) was changed
- Boundary refresh requests ("rebuild boundaries", "polygons look stale")
- After a session that landed schema-affecting code changes in `scripts/extract.py`,
  `lib/goldStandard.ts`, the build-*-data.py family, or
  `build-metro-boundaries.py`

Do NOT trigger on Substack draft work, /updates entries, plugin scaffolding,
or anything that doesn't touch workbook-derived JSON.

## What this skill assumes

- Working directory is `C:\Users\ashwi\Desktop\Projects\Metro Area Project`
  (the canonical project copy; the `Documents\Claude\Projects` folder is
  stale per memory).
- User edits the OneDrive `Excel Files` masters directly. The project copy of
  `MetroAreas.xlsx` lags until `sync_source_xlsx.py` runs.
- The bindfs mount pads xlsx files on copy; `sync_source_xlsx.py` already
  validates EOCD before clobbering, so the skill does not need to.
- League workbooks (NFL_all.xlsx, NBA.xlsx, NHL.xlsx, MLB.xlsx) are
  staged into `./workbooks/` by `stage-leagues.py` before any builder runs.
  This is the reason the skill exists in this shape: reading league workbooks
  in place from OneDrive triggers sharing-violation aborts whenever Excel is
  open or OneDrive is mid-upload, and we want that failure to surface up
  front at the stage step instead of mid-pipeline. `workbooks/` is gitignored.
- Default branch is `main`. There is no `master`.
- `BACKLOG.md`, `CONTENT.md`, and `docs/` are gitignored. Never stage them.
- Edit and Write tools are forbidden on this project; all writes go through
  bash heredocs or `scripts/safe-edit.py`. The orchestrator does not edit
  files; it only spawns child scripts that write their own outputs.

## How to run

The skill is a thin shell over `scripts/run-workbook-sync.py`. Default
invocation:

```
python3 scripts/run-workbook-sync.py
```

Common variants:

| Situation                                         | Command                                                        |
|---------------------------------------------------|----------------------------------------------------------------|
| Standard refresh after a workbook edit             | `python3 scripts/run-workbook-sync.py`                         |
| Just rebuild the JSON, skip boundaries             | `python3 scripts/run-workbook-sync.py --skip boundaries`        |
| Boundaries only (no workbook change)               | `python3 scripts/run-workbook-sync.py --only boundaries`        |
| One sport only (e.g. NHL roster fix)               | `python3 scripts/run-workbook-sync.py --only sync,nhl,sports-index` |
| Force the boundary cache (deep refresh)            | `python3 scripts/run-workbook-sync.py --max-age-days 1`         |
| Project copy is newer than OneDrive (clobber it)   | `python3 scripts/run-workbook-sync.py --force-sync`             |
| See the plan without touching anything             | `python3 scripts/run-workbook-sync.py --dry-run`                |
| Skip type-check + import gates (rare)              | `python3 scripts/run-workbook-sync.py --skip-verify`            |

Step short names: `sync`, `extract`, `nfl`, `nba`, `mlb`, `nhl`,
`sports-index`, `boundaries`, `check-imports`, `tsc`.

## What to do at each phase

1. **Before invoking.** Show the user the plan you intend to run (the
   command line you're about to issue) and call out any non-default flags.
   For a routine workbook edit, no confirmation is needed; for `--force-sync`,
   `--skip-verify`, or destructive flags, pause and confirm.

2. **During the run.** The orchestrator prints a per-step OK/FAIL line and
   tees the full stdout to `.workbook-sync-log/sync-YYYYMMDD-HHMMSS.log`. If
   any step fails, the orchestrator aborts and exits with the 1-based step
   index. Do NOT retry blindly; surface the failure tail to the user and ask
   what changed.

3. **After green.** Summarize what was rebuilt by reading the orchestrator's
   summary table back to the user. Then run `git status --short` and present:
   - the staged candidate list (everything under `public/data/`,
     `MetroAreas.xlsx`, plus any geojson under `public/data/boundaries/`),
   - any uncommitted code changes that did NOT come from this run (those
     belong in a separate commit per the user's commit hygiene),
   - the proposed PowerShell commit commands, one `git add` per file, with
     `[brackets]` and spaces quoted per the COMMIT PROTOCOL memory.

4. **ASK BEFORE COMMIT.** Per the user's standing rule, do not produce or
   run the commit commands unless the user explicitly says "and commit" in
   the same turn. The skill stops at "here is the proposed commit, want me
   to push it?"

## Verify gates

The orchestrator ends with two gates by default. If `--skip-verify` is used,
note that explicitly in the wrap-up so the user can decide whether to run
them by hand before pushing.

- `node scripts/check-client-imports.mjs` — catches `'use server'`
  modules accidentally imported from client components.
- `npx tsc --noEmit` — full typecheck. This is the slowest step (typically
  20-60s) and runs last because failures here usually mean a code change
  is needed before the workbook data even matters.

## Failure recipes

| Failed step      | Likely cause                                                                | First move                                                                  |
|------------------|------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| sync             | OneDrive source missing, or `~$MetroAreas.xlsx` lock file present            | Ask user to close Excel; re-run. If genuinely missing, set `METROAREAS_SOURCE_XLSX`. |
| sync (exit 2)    | Project copy is newer than OneDrive source                                   | Confirm intent with user, then re-run with `--force-sync`.                  |
| sync (exit 4)    | xlsx integrity check failed (bindfs padding, OneDrive mid-sync)              | Wait 30 seconds, re-run. If it persists, user must re-save the workbook.    |
| stage-leagues (2)| Active Excel `~$NAME.xlsx` lockfile (mtime >= workbook mtime)                | Ask user to close Excel for the named workbook; re-run. Stale lockfiles (older than the workbook) are warned and proceed automatically. |
| stage-leagues (3)| Sharing violation persisted across retries (OneDrive mid-upload, anti-virus) | Wait 30-60 seconds and re-run; raise `--retry-count` if it recurs.          |
| stage-leagues (4)| Source xlsx failed EOCD validation                                           | OneDrive partial-write or bindfs pad. Wait for OneDrive icon to settle.     |
| stage-leagues (5)| Staged copy is newer than OneDrive source                                    | Confirm intent, re-run with `--force-sync` (forwards `--force` to stage-leagues). |
| extract          | Column rename or new sheet                                                   | Read `scripts/extract.py` and compare against the changed sheet header.     |
| nfl/nba/mlb/nhl  | Player-name spelling mismatch across sheets, or a new championship row       | Surface the script's stderr; the build-*-data.py family has explicit join failure messages. |
| sports-index     | Missing franchises.json from a prior sport step                              | Re-run the prior step alone via `--only`.                                   |
| boundaries       | Missing Overture parquet for a newly added country                           | Direct user to `dump-overture-country.py` workflow; do not stub it here.    |
| check-imports    | A `'use server'` module was imported by a client component                   | Show the offending file:line; the gate exists for exactly this.             |
| tsc              | Type error in code that was changed alongside the workbook                   | Surface the error; the workbook refresh is irrelevant until tsc is clean.   |

## What this skill does NOT do

- Does NOT commit or push. Per ASK BEFORE COMMIT, the skill stops at the
  proposed-commit step and waits for the user.
- Does NOT touch the brand site at `citizenofnowhere-brand`. That repo has
  its own daily Substack rebuild via GitHub Action.
- Does NOT regenerate logos, distance badges, or dimension badges. Those have
  dedicated scripts and run on their own cadence.
- Does NOT trigger a Vercel deploy. After the user accepts the commit, the
  push to `main` triggers the production build; use `scripts/deploy-status.mjs`
  to monitor.

## Source of truth

The pipeline order, flag set, and short-step names live in
`scripts/run-workbook-sync.py`. If anything in that script changes, update
the table above. This SKILL.md is the user-facing contract; the orchestrator
is the implementation.
