# Daily Ops Sweep -- 2026-09-09

Window: `2026-09-07T23:01Z` -> `2026-09-09T01:01Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing was re-run, pinged,
written or fixed. This file is the only thing this sweep touched.

## Jobs this window: 20 ok, 0 failed, 3 flagged

**Zero FAIL, zero MISSED.** Twenty completed dispatcher runs plus this sweep. Every
scheduled slot in the window fired and exited 0.

| job | slot (UTC) | result |
|---|---|---|
| football-standings | 09-07 23:00 | DONE 85s |
| daily-ops-sweep | 09-08 01:00 | DONE 595s |
| activity-feed | 09-08 02:30 | DONE 5s |
| euro-comps | 09-08 04:00 | DONE 5s |
| gap-league-watch | 09-08 05:00 | DONE 3s |
| football-standings | 09-08 05:00 | DONE 87s |
| screen-number-ones | 09-08 05:00 | DONE 15s |
| business-daily | 09-08 05:50 | DONE 338s |
| substack-daily | 09-08 06:00 | DONE 4s |
| predictions-tue | 09-08 06:40 | DONE 429s |
| mlb-sim | 09-08 07:00 | DONE 453s |
| rugby-weekly | 09-08 07:05 | DONE 11s |
| feed-monitor | 09-08 07:20 | DONE 16s |
| cricket-weekly | 09-08 09:00 | DONE 35s |
| football-standings | 09-08 11:00 | DONE 88s |
| screen-number-ones | 09-08 13:00 | DONE 15s |
| mlb-sim | 09-08 14:30 | DONE 449s |
| football-standings | 09-08 17:00 | DONE 92s |
| screen-number-ones | 09-08 21:00 | DONE 18s |
| football-standings | 09-08 23:00 | DONE 90s |

**Nothing was due-and-skipped.** I checked every non-running job against its
jobs.toml schedule rather than assuming: `forecast` (Mon/Wed/Fri) next fires 09-09
06:10Z, `fiba-weekly` and `sound-weekly` (Wed) 09-09 07:10Z/07:30Z, all three still
in the future at time of writing; `egress-refresh` (Sun) last ran 09-06,
`mktcap-refresh` (Sat) 09-05, `cfb-fri`/`predictions-fri` 09-04, `cfb-sun` 09-06,
the two monthlies 09-01. All correct for the calendar.

**Job-script `push()` alerts fired this window: none.** `gap-league-watch` logged
"no state transitions this run" (India ISL still `awaiting_target`, api-football's
latest season for league 323 is 2025, working as designed). `football-standings`
logged `unmatched=0 collisions=0 errors=0` on all five runs. No mktcap METRO QUEUE
nudge, no business-daily geo-stub notice, no F1 catch-up alert. The only ntfy push in
the window was yesterday's sweep digest.

**Non-dispatcher services, all healthy.** `f1-weekly` (hourly launchd) idle for all
26 ticks; verified below, not assumed. `deploy-watch` (600s) clean, TARGET
`0fb71d152` live and serving; `/tmp/deploy-watch.err` still unchanged since 09-06
17:31 (its one `curl 429` predates the window). `heartbeat` (900s) and the dispatcher
agent both last exit 0. `newsletter-podcast` completed 09-08 (episode
`2ycHZsDLqLpdO08tKefvaq` READY after six polls, both Gmail drafts created); its
09:30 watchdog logged "final.mp3 present (37 MB) and episode READY. Healthy."

**Standing gates, all green.** `check:release-notes` OK (131 entries, newest
2026-09-08, so yesterday's ten-commit shipping day is covered). `check:data-currency`
24 current / 0 overdue / 0 unreadable. Working tree clean; local `main` is 2 commits
behind origin, both data-bot commits pushed after this sweep's fetch.

**Vercel build ledger: 1 READY, 0 ERROR, 19 CANCELED** across the twenty deployments
in the window, queried directly from the Vercel API. The single production build is
`dpl_8BP4f56iheoFsauEyxkmv9J5Eogj` for `0fb71d152`, four Node functions. Ten untagged
app commits shipped on 09-08 and cost exactly one build, comfortably inside the 2/day
budget. The CLAUDE.md rule about the build-relevant commit being last in a push was
followed correctly: `8cb40287d` (handoff, `[vercel skip]`) has its own CANCELED
deployment created 8 minutes *after* the READY one, which means it went as a separate
push rather than sitting on top of `0fb71d152`.

## Self-healed / verified fine (informational only, no action needed)

**1. `f1-weekly` sitting at "R13 already synced" is correct, and I checked it against
the source rather than the previous sweep's note.** The poller compares Jolpica's
last-race round to the max round stored in Supabase, so a stale *upstream* would look
identical to a healthy idle: it can only ever report `IDLE`. That is a real blind spot
in the design, so it is worth confirming from outside rather than trusting the log.
A read-only fetch of `api.jolpi.ca/ergast/f1/2026/races.json` returns a 23-race 2026
calendar in which the Italian Grand Prix at Monza **is** round 13, dated 2026-09-06,
and the next race is R14, the Spanish Grand Prix, on 2026-09-13. So no race has
happened since the last sync and none will before Sunday. Idle is the right answer.
(Press coverage calls Monza "round 15"; that is a different calendar convention, not a
discrepancy in our data, since the poller is self-consistent Jolpica-to-Supabase.)

**2. `empty:ESPN PGA scoreboard` in feed-monitor is still expected, not a break.**
Unchanged since 09-02 and scored `ok` by the monitor, distinct from `FAIL`: the
endpoint answers with valid shape and zero events. The FedEx Cup season has ended and
the next PGA Tour event is 17 September, so an empty scoreboard this week is correct.
Every other probe green on the 09-08 run, all 16.

**3. Cricket, rugby, screen and football content all moved as expected.**
`cricket-weekly` staged 6 new internationals (22678 -> 22690 rows, 2026-08-23 ..
2026-09-01) with 0 Afghanistan additions. `screen-number-ones` ran three times and
correctly committed only on the third, when the week actually changed.
`football-standings` grew 2230 -> 2236 standings rows over the window with
`unmatched=0` throughout, and the FA WSL flip that the last three sweeps tracked is
fully settled (14 rows, `[2026-27]`, "all leagues on their current season").

## Needs Ashwin's attention

**Three items. The first is new, time-boxed to Friday, and found by this sweep.**

---

### 1. `economy-rates` cannot fire this Friday: the live dispatcher config never got the job

*What happened.* `dispatcher.py --status` now prints a drift warning that yesterday's
sweep explicitly reported as absent:

```
WARNING: live copy differs from the repo (.../mac-mini-jobs):
    differs       jobs.toml
    missing-live  runners/economy-rates.sh
```

`economy-rates` does **not appear at all** in the 23-row `--status` table. The
dispatcher reads `~/metro-mini-jobs/jobs.toml`, which is a real copy (mtime Aug 30),
not a symlink, and the new job only exists in the repo's copy:

```
$ diff "$REPO/mac-mini-jobs/jobs.toml" ~/metro-mini-jobs/jobs.toml
< id = "economy-rates"
< label = "Policy rate refresh (/business/economy)"
< time = "07:30"
< weekdays = [5]
< command = "runners/economy-rates.sh"
```

*Root cause.* Two independent gaps, and fixing only one is not enough:

1. `jobs.toml` is deployed by `cp`, per REBUILD-RUNBOOK.md line 135. Ashwin's
   `fd35d64c7` ("...economy refresh pipeline...") added the job to the repo on 09-08
   but nothing copied it across. The dispatcher therefore has no row for it.
2. `~/metro-mini-jobs/runners/` holds six symlinks into the repo and **no
   `economy-rates.sh`**. `dispatcher.py` runs a relative `command` with
   `cwd=HERE` (`HERE = Path(__file__).resolve().parent`, line 39/261), so
   `runners/economy-rates.sh` resolves to `~/metro-mini-jobs/runners/economy-rates.sh`,
   which does not exist. Even with `jobs.toml` copied, the job would fail to launch.

*This does not self-heal.* I checked `mini_sync()` in `runners/_common.sh` in case an
earlier job would fix it: it is only `git fetch` + `merge --ff-only` against the repo
working tree. It never copies `jobs.toml` or relinks `runners/`. So no Wednesday or
Thursday job will repair this before Friday 07:30Z.

*Precedent.* This is the same failure class the runbook already documents at lines
136-144: the runners were `cp -R`'d until 2026-08-31 and had silently drifted to
2026-08-06, so `forecast.sh` skipped its self-tests and `predictions.sh` never built
the UCL sim, **both jobs reporting green the whole time**. That is why the runners are
symlinks now and why `--check-sync` exists. `jobs.toml` is the one file still copied,
so it is the one file that can still drift this way.

*Recommended fix.* Three commands on the mini, no repo change, no build:

```bash
REPO="$HOME/Projects/Metro Area Project"
cp "$REPO/mac-mini-jobs/jobs.toml" "$HOME/metro-mini-jobs/"
ln -sf "$REPO/mac-mini-jobs/runners/economy-rates.sh" \
       "$HOME/metro-mini-jobs/runners/economy-rates.sh"
python3 "$HOME/metro-mini-jobs/dispatcher.py" --check-sync   # expect: no drift
python3 "$HOME/metro-mini-jobs/dispatcher.py" --status       # expect: economy-rates row, Fri 07:30
```

No `chmod`: the dispatcher always invokes a runner as `/bin/bash <path>`, and `chmod`
would follow the symlink and rewrite the repo file's mode (runbook line 142).

*Secondary, and softer than it looks: the Supabase migration is not applied.*
HANDOFF's watch list asks for
`supabase/migrations/20260908120000_policy_rate_tables.sql` before the first run. I
confirmed read-only that **neither `policy_rate_changes` nor `policy_rate_daily`
exists** in `public` yet. But this will *not* fail the Friday job:
`upsert_supabase()` in `scripts/macro/rates/refresh.py` (line 583) catches and prints
`"policy_rate_changes upsert failed (...)"` rather than aborting, so the JSON and the
commit still ship and only the Supabase mirror stays empty. It is recoverable
afterwards with `load_policy_rates.py --write`. Worth doing before Friday, but it is
the migration that is optional-for-Friday, not the config sync above.

*Also still outstanding from HANDOFF's watch list, unchanged:* the live dry run of
`scripts/macro/rates/refresh.py` and reading its NEW RATE DECISIONS block before the
first `--write`. If the config sync above lands without that dry run, Friday 07:30Z
will be the pipeline's first-ever live execution, unattended.

---

### 2. The NFL live-refresh User-Agent fix is still unpushed, and Friday's run will 403 again

*What happened.* HANDOFF's 09-08 close-out says plainly: "The NFL live refresh's
failure email is the 13:47 UTC 403 run; fixed in `e4c9500a0`, unpushed. Friday's run
fails again unless the push lands first."

*Evidence it is still open.* I fetched `origin/main` fresh during this sweep
(01:0xZ, 09-09) and `e4c9500a0` is not reachable from anywhere:

```
$ git branch -r --contains e4c9500a0
error: malformed object name e4c9500a0
```

The object does not exist in this clone at all, which is what an unpushed
Windows-side commit looks like from here. The only two commits that have landed on
origin since are `a19eb9031` and `f750f02ca`, both data-bot refreshes. So the fix is
still sitting on the Windows box.

*Impact.* `nfl-live-refresh.yml` runs Friday 09:30 UTC. Per the same HANDOFF entry
this is also the first run that would carry Thursday-opener results and flip the 2026
hub to `live` (week grid, "What is left"). If it 403s, that flip does not happen and
the failure email repeats.

*Recommended fix.* On the Windows box, push `e4c9500a0` before Friday 09:30 UTC. It
touches the workflow/scraper only, so it should carry `[vercel skip]` in the subject
unless it also touches `app/`, `lib/` or `public/`. If it 403s even after the push,
HANDOFF's own guidance applies: the UA policy moved again, so measure from a box with
`curl` and adjust the token rather than retrying the same request.

*Why this sweep cannot do more.* The commit is not on this machine and this run makes
no writes regardless.

---

### 3. `forecast` is still pinned at `last_status: "failed"` (repeat of yesterday's item, not yet done)

*What happened.* Unchanged since yesterday's sweep raised it. `--status` still reads:

```
forecast    09-07 06:10  2026-09-07   failed    already-ran
```

The 09-07 06:10Z slot genuinely failed (`ERROR France: required firstRound.shares is
empty`, a Wikipedia heading roll-forward, fixed by hand in `48ecffabd`/`e5555ad49`).
Because the fix landed by hand rather than by re-running the ~10-minute job, nothing
ever overwrote the status.

*Impact: cosmetic only, and this remains true.* `last_status` is bookkeeping and is
never read by `decide()`, which uses only `last_run_date` and `last_slot`. It cannot
suppress or delay the next run. **Note that next run is 09-09 06:10Z, roughly five
hours after this sweep was written**, so by the time you read this the status may well
have been overwritten with a genuine `ok` and the item closed itself. Worth a glance
at `--status` before doing anything.

*Recommended fix, only if 09-09 06:10Z did not already clear it:*

```bash
python3 ~/metro-mini-jobs/dispatcher.py --mark-ok forecast
```

That sets `ok (manual)`, deliberately distinct from a plain `ok`, and writes a
`MARK-OK` line to dispatcher.log. I did not run it: this sweep makes no writes, even
mechanical ones.

---
*Read-only sweep. No jobs re-run, no healthchecks pinged, no Supabase writes, no data
or script changes. Supabase was queried with a single read-only `SELECT` against
`information_schema`; Jolpica and the Vercel API with read-only GETs. Only this file
was written and committed.*
