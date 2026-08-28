---
name: cl-lookup-sync
description: "Sync the Champions League workbook's Lookup sheet into Supabase public.football_lookup, safely and with a reviewable diff. Use this whenever Ashwin says any of: 'sync the Lookup sheet', 'sync ChampionsLeague.xlsx to Supabase', 'the Lookup sheet changed', 'I added a club to Lookup', 'update the football mappings', 'the metro mapping for a club is wrong', or when an UNMATCHED alert from the daily football-standings job needs a new club mapped. Also use it before anyone runs scripts/apifootball/sync_lookup.py, because that script is a destructive DELETE-then-INSERT full mirror and will silently revert rulings Ashwin has applied in Supabase but not yet in the workbook. Works by hashing both sides so a 10,000-row table diffs in four small queries. Do NOT use for the metro/league JSON pipeline (workbook-sync), the market-cap pipeline (mktcap-refresh), or for api-football standings and fixtures themselves (apifootball-refresh) -- this touches exactly one table and never git, public/data or a Vercel build."
---

# cl-lookup-sync

One command, one table. `public.football_lookup` in Supabase project
`nmprqkmymrdknffwnuur` is the club-identity crosswalk that `refresh.py` resolves
every api-football team against. Its source of truth is the `Lookup` sheet of
`Champions League-201516.xlsx` in OneDrive. This skill moves the sheet into the
table and proves it landed.

## Why this exists rather than just running sync_lookup.py

`scripts/apifootball/sync_lookup.py` does `DELETE FROM football_lookup` then
re-inserts every row. That is fine when the workbook is genuinely ahead of the
table, and dangerous the rest of the time: any correction applied directly in
Supabase disappears without a trace the next time someone runs it. That has
already happened once in this project's history, which is why
`references/protected_rows.json` exists.

Two other reasons the old script cannot be the whole answer:

- It reports a row count and nothing else. You cannot tell a one-club addition
  from a mass blanking caused by a renamed column.
- In a Cowork session neither the cloud container nor the device shell can reach
  Supabase over HTTP. The egress allowlist blocks it. The only working path is
  the Supabase MCP, which the script knows nothing about.

So: diff first, apply deltas, hold the protected rows, verify by hash.

## The run

Everything on the device side runs through `device_bash`, on the user's machine,
where the workbook is mounted. Nothing is staged into the container.

```bash
SK=~/mnt/Desktop--Projects--Metro\ Area\ Project/.claude/skills/cl-lookup-sync
python3 "$SK/scripts/cl_lookup.py" extract
```

That reads the sheet and prints how many rows and countries it found. It aborts
if an expected column is missing, because a renamed header would otherwise sync
as a silent mass blanking.

Then the loop, four steps, each one told to you by the previous:

1. `extract` writes `~/cl-lookup-sync/lookup.json` and the workbook's
   per-country hashes.
2. Run **step 2** of `references/sql.md` through `mcp__Supabase__execute_sql`.
   Write the single `packed` value it returns to
   `~/cl-lookup-sync/supabase_countries.txt`, then run `cl_lookup.py countries`.
   Usually two or three countries differ out of 250, and often none.
3. Run **step 3** of `references/sql.md` for just those countries. Save the
   `packed` value to `~/cl-lookup-sync/supabase_rows.txt`, then run
   `cl_lookup.py rows`. It prints the exact deltas and writes
   `~/cl-lookup-sync/apply.sql`.
4. Read `apply.sql`, then run each statement through the Supabase MCP.
5. Run **step 5** of `references/sql.md` and the device-side snippet beside it.
   The two `hash_excl_protected` values must match.

Write the `packed` values to the device with a quoted heredoc (`<<'EOF'`), not
an echo. Club names contain apostrophes and accents, and shell expansion will
corrupt them.

## How to read the four verdicts

**ADD** - in the workbook, absent from Supabase. Almost always a club Ashwin
just added to clear an UNMATCHED alert. Apply without ceremony.

**CHANGE** - the row exists on both sides and disagrees. The workbook wins,
unless the key appears in `protected_rows.json`. Show Ashwin the before and
after for each one; a change he did not expect usually means a formula moved or
a cell was overwritten, and that is worth catching before it reaches the table.

**REMOVE** - in Supabase, gone from the workbook. Treat with suspicion. A club
deleted from the sheet by accident looks identical to one retired on purpose,
and dropping it makes `refresh.py --write` exit 3 with an UNMATCHED alert the
next morning. The script emits these commented out. Ask before uncommenting.

**HELD** - the row is in `protected_rows.json`. Supabase is deliberately ahead
of the workbook because Ashwin ruled on it and the sheet was never corrected.
Do not touch the row. Report the hold, quote the ruling, and remind him of the
one cell that retires it. When the workbook is finally fixed the row falls out
of the diff by itself, and the entry can be deleted from the file.

## Adding a hold

When Ashwin rules that a mapping in Supabase is right and the workbook is wrong,
add an entry to `references/protected_rows.json` in the same session, with the
ruling in his words and the exact cell that would retire it. A ruling recorded
only in `HANDOFF.md` is a ruling that gets reverted, because nothing reads
`HANDOFF.md` at sync time. This file is the durable form.

## Native Windows runs

`scripts/apifootball/sync_lookup.py` still works from a PowerShell session on
the Windows host, which does have network access to Supabase, and it is faster
when the workbook is unambiguously ahead. Use it only after this skill has shown
a clean diff with no HELD rows, so nothing gets reverted. If any hold is live,
use the delta path here instead.

## What this never does

No git commit, no `public/data` write, no Vercel build. `football_lookup` is
read from Supabase at request time. When the sync finishes, the site is already
current. If a club page still looks wrong afterwards, the fault is downstream in
`football_team` or in `refresh.py`, and that is `apifootball-refresh` territory.
