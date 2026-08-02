---
name: apifootball-refresh
description: "Refresh api-football standings/fixtures and the football_lookup club crosswalk (scripts/apifootball) that feed Supabase-backed team pages. Use when the user wants to 'sync the Lookup sheet to Supabase', 'run the football standings refresh', 'check for UNMATCHED teams', or asks why a club's standings page is missing or wrong. Two split scripts: sync_lookup.py (Windows-only, mirrors the Champions League workbook Lookup sheet) and refresh.py (Mac-mini-only, needs network + APISPORTS_KEY; --self-test / dry-run / --write). The hard invariant: every api-football team must resolve to a Lookup club, or refresh.py --write exits 3 with an UNMATCHED alert. Do NOT use for the xlsx-driven metro/league-standings JSON pipeline (workbook-sync) or the mktcap pipeline -- this is standings/fixtures data that lives only in Supabase, no git commit or Vercel build involved."
---

# apifootball-refresh

Keeps `football_standings`, `football_fixtures`, and the `football_team` ->
`football_lookup` crosswalk current in Supabase (project `nmprqkmymrdknffwnuur`).
Unlike workbook-sync and mktcap-refresh, this pipeline is **split across the
two Claude Code instances by necessity** — read "What this skill assumes"
before doing anything.

## When to invoke

Trigger on any of:

- "sync the Lookup sheet" / "the Lookup sheet changed" / "I added a club to Lookup"
- "run the football standings refresh" / "check for unmatched teams"
- A club's standings/fixtures page is missing, showing a stub, or looks wrong
- Diagnosing an UNMATCHED alert from the mini's daily job
- After editing the Champions League workbook's `Lookup` sheet

Do NOT trigger for the workbook-driven league JSON (`workbook-sync`) or for
mktcap work (`mktcap-refresh`) — this only touches `football_*` Supabase
tables, never git or `public/data/**`.

## What this skill assumes — read this first, it's not optional here

This is the one pipeline in the repo genuinely split by *machine*, not just
by convention:

- **`sync_lookup.py` runs on the Windows host only** — it needs the OneDrive
  Champions League workbook (`CL_WORKBOOK` env, defaults to the OneDrive
  master) and a Supabase write key. This is the half you (Windows Claude) can
  actually run yourself.
- **`refresh.py` runs on the Mac mini only** — it needs live network access
  and `APISPORTS_KEY`. If you're the Windows/cloud instance and no network
  egress is confirmed, you cannot run this half; say so and hand off via
  `HANDOFF.md` instead of guessing at results. Per `CLAUDE.md`'s session
  model: never fabricate a diagnosis you can't verify.
- The daily production job (`mac-mini-jobs/run-football-standings.sh`,
  05:00 UTC, self-test gated) already runs `refresh.py --write` on the mini
  every day. Don't assume a manual run is needed unless something is
  actually broken — this is a live cron, not a dormant script.
- **THE INVARIANT (hard rule, not a suggestion):** every api-football team
  must map to a `football_lookup` (workbook `Lookup` sheet) club. There are
  no stubs, ever. `refresh.py --write` tries exact `api_name` match, then
  unambiguous cross-field name match; anything it can't resolve gets an
  UNMATCHED alert and the run exits 3. The only fix is adding the club to
  the `Lookup` sheet, then re-running `sync_lookup.py` — never patch around
  it in `football_team` directly.
- Data lives entirely in Supabase. A refresh run needs no git commit and no
  Vercel build (unlike workbook-sync's JSON output).

## How to run

```
# Windows host, after a Lookup-sheet edit:
python sync_lookup.py                 # full-replace mirror of Lookup -> football_lookup

# Mac mini, needs APISPORTS_KEY + network:
python refresh.py --self-test         # offline parser/resolver tests, no network
python refresh.py                     # DRY RUN: fetch + report, no writes (default)
python refresh.py --write             # upsert standings/fixtures, resolve new teams, alert on UNMATCHED
```

Both from `scripts/apifootball/`. `leagues.json` is the tracked-league list;
Serie D (76) standings are intentionally skipped.

| Situation                                     | What to run / do                                         |
|--------------------------------------------------|-------------------------------------------------------------|
| Lookup sheet just changed                        | `sync_lookup.py` (Windows) — do this BEFORE the next mini run |
| Suspect an UNMATCHED alert is stale               | `refresh.py --self-test` then dry-run (mini) — read the alert detail |
| A club's page looks wrong but Lookup is correct  | Check `football_team`'s existing mapping before assuming a Lookup problem |
| Not on the mini, no confirmed network             | Don't run `refresh.py` — write up what you know in `HANDOFF.md` instead |

## What to do at each phase

1. **On Windows, after a Lookup edit:** run `sync_lookup.py`, confirm it
   completed (full-replace, so a partial failure is obvious from the row
   count), and note in your summary that the mini's next scheduled run will
   pick it up — you're not triggering `refresh.py` yourself.

2. **On the mini, or when asked to diagnose a live alert:** run
   `--self-test` first. Only take a real `--write` action if genuinely fixing
   something broken; the daily cron already covers routine refreshes.

3. **On an UNMATCHED exit-3:** identify which api team failed to resolve
   from the alert text, check whether it's a genuinely new/renamed club
   (needs adding to `Lookup`) versus a name-matching edge case (needs
   `api_name` backfilled once matched) — don't guess, read `refresh.py`'s
   resolver logic if the cause isn't obvious from the alert alone.

## Failure recipes

| Symptom                                    | Likely cause                                                | First move |
|----------------------------------------------|-----------------------------------------------------------------|------------|
| Exit 3, UNMATCHED alert                       | A new/renamed api-football team has no Lookup club              | Add the club to the workbook `Lookup` sheet, run `sync_lookup.py`, it resolves on the next `refresh.py --write`. |
| Club's canonical name wrong on the site       | `football_team` crosswalk stale, or Lookup sheet itself wrong    | Check the workbook `Lookup` sheet first — it's the source of truth, not `football_team`. |
| `refresh.py` can't be run at all              | You're not on the mini / no network egress                      | Don't attempt it or guess results — hand off via `HANDOFF.md`, per the dual-session evidence rule. |
| `sync_lookup.py` fails to find the workbook   | `CL_WORKBOOK` env not set and OneDrive default path is wrong     | Confirm the OneDrive master path; this only runs on Windows for a reason. |

## What this skill does NOT do

- Does NOT touch `public/data/**`, git, or trigger a Vercel build — this is
  Supabase-only data.
- Does NOT resolve UNMATCHED alerts automatically — a human decides whether
  a new club belongs in `Lookup` and under what canonical name.
- Does NOT cover the adjacent scripts in this directory
  (`refresh_domestic_cups.py`, `refresh_supercups.py`, `refresh_women.py`,
  `watch_gap_leagues.py`, `build_unmatched_report.py`, `export_bundles.py`) —
  those aren't documented in `scripts/apifootball/README.md` in the same
  depth; treat them as related but out of scope until they get their own
  documented contract.
- Does NOT run `refresh.py` from a session without confirmed network egress.

## Source of truth

`scripts/apifootball/README.md` and `scripts/apifootball/refresh.py` /
`sync_lookup.py`. If the split of responsibility or the invariant's
resolution logic changes, update both.
