# Daily Ops Sweep -- 2026-09-19

Window: `2026-09-17T23:09Z` to `2026-09-19T01:09Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing was written, re-run,
pinged or fixed except this file. Working tree verified clean after every probe.

## Jobs this window: 34 ok, 1 failed, 1 flagged

35 dispatcher executions completed, 0 MISSED. The one FAIL (`gap-league-watch`) is
fully closed. The one flagged job (`economy-rates`) exited 0 and went green while
three of its builders failed, which is the substantive finding below.

Ran and clean: `ops-autofix` x13, `football-standings` x4, `claude-auth-canary` x4,
`mlb-sim` x2, `daily-ops-sweep`, `activity-feed`, `euro-comps`, `business-daily`,
`forecast`, `substack-daily`, `feed-monitor`, `nfl-elo`, `predictions-fri`, `cfb-fri`.
`newsletter-podcast` (launchd, not dispatcher) completed clean at 08:22 local:
episode `6DslVqYwtIAH0Y1o3D7okU`, 44 feed items pushed, both Gmail drafts created.

Nothing was silently skipped. `conflicts-monthly` and `cricket-monthly` are gated
`days = [1]` (day of month), so they were correctly not due on the 18th or 19th.
`economy-housing` (Sat 07:30Z) and `mktcap-refresh` (Sat 09:00Z) are due later today.
`feed_shape_monitor` reported all 18 registry entries `ok`, including both ESPN
date-form canaries added on 09-16.

## Self-healed (informational only, no action needed)

**`gap-league-watch` FAIL at 05:05:51Z, and again on the 06:29Z autofix retry.**
Both died in `--self-test`, not on the network: `watch_gap_leagues.py` line 170
asserted `{... nations_auto(e)} == {536}` against the live `leagues_pending.json`,
and 536 (CONCACAF Nations League) had been correctly promoted out on 09-17, leaving
the set empty. The test demanded a transient membership, so a *successful* promotion
failed the job. A mini session fixed it the same morning: commit `0731cb049`
("the self-test asserted a transient state, not the rule"), which re-expresses the
check as `_flagged <= SELF_PROMOTERS` plus an international-comp assertion, so it
still catches a club comp acquiring both flags but survives legitimate promotions.
That session also re-ran the job by hand at 07:09Z: `self-test OK`, three pending
leagues classified, watch state written, no transitions. I re-ran `--self-test`
read-only just now (it returns on main()'s first line, before any key, network or
write): `self-test OK`, exit 0. Fix is committed and pushed. Next dispatcher slot
is 05:00Z today. No action.

**Football `unmatched=45` cleared to 0.** The 09-18 runs alerted 45 unmapped
api-football teams three times (00:04Z, 05:05Z, 11:09Z). The Windows/Cowork session
synced the Lookup sheet during the day; the 17:03Z run and every run since reports
`unmatched=0` (latest 09-19 00:06Z: `unmatched=0 deferred=29`). Closed by the work
already booked for it in yesterday's report. The new `deferred=29` counter is a
by-product of that Lookup work, not an error state.

## Needs Ashwin's attention

### 1. `economy-rates` went green on 09-18 while 3 builders failed, and the ECB and Denmark rate hikes are NOT on the live site

**What happened.** The 07:37Z Friday run printed
`refresh.py: 3 builder(s) FAILED; review before trusting the published files.`
then `No changes; nothing to commit`, revalidated, warmed both pages 200, and the
dispatcher logged `DONE economy-rates: ok 361s`. No ntfy fired, and the
healthchecks tile went green. This is the exact silent-failure shape the register
exists for: exit 0, clean `--status`, quiet topic, wrong data.

**Root cause A, why the failure was invisible.** `refresh.py` is written to be loud:
lines 769 to 772 `sys.exit(1)` when any builder fails. That exit is thrown away by
the runner. `runners/economy-rates.sh` calls

```
guarded "refresh policy rates (--write)" \
  bash -c "\"$PY\" scripts/macro/rates/refresh.py --write | tee \"$REFRESH_LOG\""
```

`guarded()` checks the status correctly, but the status it receives is `tee`'s.
`_common.sh` sets `set -uo pipefail` in the *runner's* shell, and `pipefail` is a
shell option that a new `bash -c` process does not inherit. Verified on this box
just now: the exact idiom returns 0 with a failing python inside, and returns 1 the
moment `set -o pipefail;` is added inside the `bash -c`. So the one mechanism that
was supposed to make a builder failure loud is disabled by the pipe that captures
the log.

The runner does have watchers, but only for `NEW RATE DECISIONS` and
`source(s) unreachable this run`. There is no watcher for `builder(s) FAILED`, so
even the fail-open notification path had nothing to match.

**Root cause B, which builders failed, and why that is now hard to answer.**
`refresh.py` prints a `builder <name>: FAILED: <error>` line per builder, but the
runner captures them to a `mktemp` it deletes on the next line, and `dispatcher.py`
keeps only `DEFAULT_LOG_TAIL_LINES = 12` of stdout. Both copies of the error strings
are gone. I identified the three from output-file mtimes instead:

- `bis-*` (the `build_bis.build_all()` step) crashed partway through. `build_all`
  iterates `sorted(BIS_ECONOMIES)`; files `bis-ar` through `bis-de` carry the
  09-18 08:37 rebuild, and `bis-dk` onward are still 09-11 10:16. A perfect
  alphabetical split at `de|dk` is a crash at DK, not content-based skipping.
  **37 BIS country files have been stale since 09-11**, including `bis-us`,
  `bis-xm` (euro area), `bis-gb` and `bis-dk`.
- `build_fed` and `build_ecb` are the first two entries in `BUILDER_MODULES`, and
  `fed.json` / `ecb.json` are the only own-source outputs still dated 09-11 10:16.
  Every builder after them (`boe`, `riksbank`, `boj`, `snb`, `boc`, `rba`, `rbnz`,
  `norges`, `buba`) plus `index` carries 09-18 08:38. That is exactly three
  failures, matching the count refresh.py printed.

**Live data impact, verified against the real world.** The published files are
behind on two confirmed decisions:

| file | published last change | actual |
|---|---|---|
| `ecb.json`, `bis-xm.json` | 2026-06-17, 2.25 | **2026-09-16, 2.50** (+0.25) |
| `bis-dk.json` | 2026-06-12, 1.85 | **2026-09-11, 2.10** (+0.25) |

The ECB raised on 10 September effective 16 September, deposit facility to 2.50%,
MRO 2.65%, marginal lending 2.90%. Danmarks Nationalbank followed on 11 September,
certificates of deposit to 2.10%. `fed.json` is stale but not *wrong*: the US spine
still reads 3.625 as of 2026-09-15, unchanged since 2025-12-11.

This is precisely the loss the runner's own comment predicted in the 09-11 restore
("the ECB hike announced 09-10 takes effect 09-16, and would have been silently
missed on the 09-18 run"). It was missed, just through a builder crash rather than
an unreachable source, which is the one path that block does not watch.

**The inputs are fine and the builders now run clean.** I ran the compute paths
read-only (`build_write=False`, no files touched, `git status` clean afterwards):

```
build_fed  build(write=False) OK      BIS cross-check: 147 dates, 0 disagree
build_ecb  build(write=False) OK      BIS cross-check: 8 dates, 0 disagree
build_bis.build_one('DK'/'ES'/'GB', write=False) OK
ECB computed last change: 2026-09-16  2.5  (+0.25)  Deposit facility rate
DK  computed last change: 2026-09-11  2.1  (+0.25)  certificates of deposits
```

Both computed values match the real-world facts exactly. The 470 MB BIS flat file
is intact (ends on a complete Saudi Arabia row), every `_scratch/macro` base input
is present, and the disk is at 12%. So the data needed to correct the site is
already on the mini; only the 09-18 *write* failed. Since the compute path succeeds
today and failed on 09-18, the crash most likely sits in the write path
(`c.write_bank`'s era lookup, which `build_bis.py` line 39 already flags as the
thing an unclamped instrument-era gap crashes) on the newly arrived observation.
I could not confirm that without running the write path, which would be a write,
so this last step is inference, not measurement.

**Recommended fix, in order.**

1. **Get the data right.** Re-run the job with the log kept:
   `bash ~/metro-mini-jobs/runners/economy-rates.sh 2>&1 | tee /tmp/econ-rates.log`
   That rebuilds and publishes ECB 2.50, DK 2.10 and the 37 stale `bis-*` files,
   commits `[vercel skip]` and revalidates, as it does every week. **Read the
   `builder ...: FAILED:` lines in that log** before anything else: they are the
   tracebacks this report could not recover, and they will say whether the write
   path still breaks on DK/fed/ecb or whether 09-18 was transient.
2. **Stop the masking** (one line, the actual bug):
   `guarded "refresh policy rates (--write)" bash -c "set -o pipefail; \"$PY\" scripts/macro/rates/refresh.py --write | tee \"$REFRESH_LOG\""`
   With that, a builder failure fails the step, `fail()` fires, and the job goes red.
3. **Make it audible even if it stays fail-open.** Add a third watcher block beside
   the two that exist, matching `builder(s) FAILED` and pushing the failing bank
   names, same shape as the `source(s) unreachable this run` block.
4. **Keep the evidence.** `economy-rates` has no `log_tail_lines` in jobs.toml, so
   it gets the 12-line default and the builder lines fall off every time.
   `economy-housing` already sets `log_tail_lines = 30`; give `economy-rates` the
   same, and consider writing `REFRESH_LOG` to `logs/economy-rates-$DATE.log`
   instead of a `mktemp` that is deleted.
5. **Silent failure register:** this is a new row. "A builder crash inside
   `refresh.py` exits 0 because `bash -c`'s pipeline to `tee` drops the non-zero
   status, publishing stale policy rates with a green tile." Register is
   unreachable from here, see the note at the end.

### 2. FIFA women's world ranking is one edition behind, and newly overdue today

`npm run check:data-currency` (warn-only, so it alerted nobody) reports 2 overdue as
of today, and this one crossed its limit *today*: `FIFA women's world ranking,
as of 2026-04-21, 151 days old, 1 over the limit`. FIFA published an update on
**16 June 2026** that the site does not have, so this is a real gap rather than a
manifest that is merely impatient. The next FIFA update is scheduled for
**20 October 2026**, so ingesting the June edition clears the warning and it will
stay clear until late October. Recommended: load the 2026-06-16 table, in the same
commit adjusting nothing in the manifest (the limit is behaving correctly).

### 3. Carried forward from yesterday, still open

- **Formula E season is still overdue** (`has 2025, owes 2026`), unchanged since
  yesterday's report. Wehrlein is the confirmed 2026 champion and Dennis second;
  third place still needs the official final table, which is why yesterday's sweep
  stopped rather than guessing. No new information today.
- **The Vercel build cap could not be re-verified this run.** Yesterday's report had
  it inactive for a fifth day (`build cap inactive (no VERCEL_BUILD_CAP_TOKEN...)`).
  The Vercel MCP token here returns `403 forbidden` on `projectEnvVars`, so I could
  neither confirm nor clear it. Treat yesterday's finding as still standing until
  someone checks `VERCEL_BUILD_CAP_TOKEN` in the project's build environment.

---

**Caveat on coverage, unchanged from yesterday:** the **Notion connector is not
authorized in this headless session**, so the Backlog, the Decisions database, the
Scheduled jobs table and the Silent failure register went unread and unupdated. The
register row proposed in finding 1 has nowhere to go until someone authorizes the
connector with `/mcp` in an interactive session on the mini. Per the 2026-09-18
contract this is a gap in the audit trail, not an optional extra.

**Nothing in this run wrote to any data file, table, job state or healthcheck.**
Every probe was a read or a `write=False` compute; `git status` was verified clean
afterwards. The only write is this report file.
