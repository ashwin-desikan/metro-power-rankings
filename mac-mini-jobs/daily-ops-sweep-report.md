# Daily Ops Sweep -- 2026-09-05

Window: 2026-09-03T23:10Z -> 2026-09-05T01:10Z (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing was re-run,
pinged, promoted or written except this file.

## Jobs this window: 17 ok, 0 failed, 3 flagged

Every dispatcher job DONE'd clean. No `FAIL`, no `MISSED`, no timeout.

| slot (UTC) | job | status |
|---|---|---|
| 09-03 23:00 | football-standings | ok 86s |
| 09-04 01:00 | daily-ops-sweep | ok 515s |
| 09-04 02:30 | activity-feed | ok 5s |
| 09-04 04:00 | euro-comps | ok 5s |
| 09-04 05:00 | gap-league-watch | ok 3s |
| 09-04 05:00 | football-standings | ok 85s |
| 09-04 05:50 | business-daily | ok 616s |
| 09-04 06:00 | substack-daily | ok 4s |
| 09-04 06:10 | forecast | ok 615s |
| 09-04 07:00 | mlb-sim | ok 1826s |
| 09-04 07:20 | feed-monitor | ok 15s |
| 09-04 11:00 | football-standings | ok 86s |
| 09-04 11:40 | predictions-fri | ok 698s |
| 09-04 11:40 | cfb-fri | ok 602s |
| 09-04 14:30 | mlb-sim | ok 1826s |
| 09-04 17:00 | football-standings | ok 88s |
| 09-04 23:00 | football-standings | ok 86s |

Non-dispatcher launchd jobs, also checked: the **f1** poller ran 26 hourly ticks,
all `idle: 2026 R12 already synced` (correct, see below); **newsletter-podcast**
built, published and drafted clean (`watchdog` OK, `retention` deleted 1 aged
episode). No job script fired an ntfy `push()` this window.

## Self-healed (informational only, no action needed)

**1. The Liga F ratchet hold cleared itself.** Yesterday's sweep flagged
`RATCHET HELD` on Liga F as a two-day silent condition. It held for three more
runs today and then stopped:

```
09-04 00:09  RATCHET HELD: Liga F (id 142): published season 2026 -> 2025 placeholder
09-04 06:09  RATCHET HELD
09-04 12:02  RATCHET HELD
09-04 18:06  (clear)
09-05 00:08  (clear)
```

api-football resumed serving the real 2026-27 table between the 12:02 and 18:06
runs. `public/data/football/wlive-2026.json` now carries Liga F as
`season_label 2026-27, placeholder false, 16 rows, played 1` -- a genuine
in-progress table, not a ratchet-preserved one. The ratchet did its job. Nothing
to restore.

**2. `cfb-fri` did not fail as predicted.** The 08-31 sweep concluded the
Jacksonville State schedule gap would hard-fail `cfb-fri` on 09-04 the same way
it failed `cfb-sun` on 08-30. It ran clean: ESPN's indexing caught up,
`cfb-sim.json` rebuilt at `generated_at 2026-09-04` with `schedule_backfill: []`,
`teams: 138`, `schedule_games: 891`, `games_played: 19`. The 19 is consistent
with the real calendar (2026 week 1 is 5-6 Sept, so only week 0 plus midweek
games have been played), as is the still-`Preseason` AP poll dated 08-17. The
recommended per-team backfill was never implemented and, on this evidence, is no
longer needed for this occurrence.

**3. The Nigeria pin was fixed before it could bite.** The 08-31 sweep warned
that `check-leaders-sanity.py`'s Nigeria pin would HOLD `egress-refresh` again on
09-06. That was addressed the same day: `64da27c52` made pins repair rather than
merely compare, and the module docstring now documents the long/short label
oscillation explicitly. `egress-refresh` last ran 08-30 (manual), so **tomorrow's
09:00Z slot is the first unattended run with the repaired gate** -- worth a
glance at the result, but no action needed now.

**4. F1 idle at R12 is correct, not stuck.** R12 was Zandvoort (21-23 Aug); R13
is Monza, whose race is **tomorrow, 6 Sept**. Practice has run, the race has not,
so there is nothing for the poller to sync. Confirmed against
[Wikipedia -- 2026 Italian Grand Prix](https://en.wikipedia.org/wiki/2026_Italian_Grand_Prix)
and [Formula1.com -- Italian Grand Prix 2026](https://www.formula1.com/en/racing/2026/italy).
(The job is named `run-f1-weekly.sh` but is an hourly `StartInterval 3600`
launchd poller by design -- the name is legacy, not a misconfiguration.)

## Needs Ashwin's attention

### 1. Every guarded job blocks the dispatcher for its full step timeout, long after its work is done

**What happened.** `mlb-sim` reported `ok 1826s` on both of its runs -- identical
to the second, which is not something real work does. Its own log shows the work
finishing far earlier:

```
RUN  07:01:53Z  (08:01:53 local)
     [2026-09-04 08:09:23] done      <- runner's last line, ~450s in
DONE 07:32:19Z  = 1826s
```

The same shape is all over the fleet: `cfb-fri` 602s, `cfb-sun`'s 08-30 failure
"after 602s", `business-daily` 616s, `forecast` 615s -- all sitting just above
the 600s `STEP_TIMEOUT` default rather than anywhere near their real cost.

**Root cause.** `guarded()` (and `run_soft()`) start a watchdog as a background
subshell whose first statement is `sleep "$STEP_TIMEOUT"`. On the success path
they run `kill "$watcher"`, which kills **the subshell but not the `sleep` child
it forked**. The orphaned `sleep` inherits the job's stdout, and `dispatcher.py`
reads that output with `subprocess.run(..., capture_output=True)`, which blocks
until EOF -- and EOF only arrives when every holder of the pipe's write end is
gone. So the dispatcher waits out the whole `sleep` regardless of when the work
finished. For `mlb-sim` the last watchdog is `run_soft "rebuild the season sims"
1800`, launched ~26s in, which pins the job at ~1826s exactly -- both runs, every
day.

**Evidence.** Reproduced in isolation (nothing production touched): a script
doing 3s of work under the real `guarded` body was observed by a `subprocess.run`
caller as **20.1s** with `STEP_TIMEOUT=20`. Adding `>/dev/null 2>&1` to the
watchdog subshell brought the same script to **3.2s**.

**Why it matters.** The dispatcher runs jobs serially in one tick, so this dead
time cascades into the lateness visible all window -- `feed-monitor`'s 07:20Z
slot fired at 07:42Z (22m late) purely because `mlb-sim` held the tick until
07:32Z for ~7.5 minutes of actual work. On 09-04 roughly 103 minutes of dispatcher
time was spent this way, most of it in orphaned `sleep`. It also makes every
duration in `dispatcher.log` and any duration-based alerting meaningless, and it
eats headroom against `timeout_minutes` (mlb-sim's floor is 1826s of a 2700s
budget before the model does anything unusual).

**Recommended fix.** Three call sites, all the same shape:
- `mac-mini-jobs/runners/_common.sh:59` (`guarded`)
- `mac-mini-jobs/runners/mlb-sim.sh:56` (`run_soft`)
- `mac-mini-jobs/metro-mini-refresh.sh:93` (`run_step`) -- **this one runs
  tomorrow at 09:00Z**

Minimal, reversible change: detach the watchdog from the captured pipe by
redirecting the subshell.

```bash
  ( sleep "$STEP_TIMEOUT"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null
    fi ) >/dev/null 2>&1 &
```

The watchdog prints nothing on the success path, so nothing is lost. If you also
want the orphan reaped rather than just muted, trap TERM inside the subshell and
kill the sleep by pid:

```bash
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    sleep "$STEP_TIMEOUT" & sp=$!; wait "$sp"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null
    fi ) >/dev/null 2>&1 &
```

Verify by watching the next `mlb-sim` line: it should report roughly 450-500s
instead of 1826s. The kill path is unchanged either way, so the timeout
protection these wrappers exist for is preserved.

### 2. 2026-09-04 spent 6 production builds against the 2/day budget

Counted with the Vercel MCP across three pages, `state: READY`, `target:
production` only (`CANCELED` is free). Not from GitHub `deployment_status`.

```
07:06Z  Merge branch 'main'
09:31Z  chore: trigger the production build for 337418799 [deploy-retry]
10:37Z  predictions: show the four books, open the Champions League slate
11:18Z  fix(nfl): stop presenting preseason records as the 2026 season
17:34Z  Merge branch 'main'
21:38Z  zzc: swimming softened to 0.4
```

**The guard is not at fault, and this is worth stating plainly:** all six are
your own commits. Every single automated commit in the window -- mini bot,
footy-refresh-bot, espn-snapshot-bot, mac-mini[claude], and yesterday's own ops
sweep -- was correctly CANCELED. `[vercel skip]` and the path check both did
exactly their job.

Three of the six were process overhead rather than distinct work items: two bare
`Merge branch 'main'` commits, which rebuild everything to publish work that was
already built, and one `[deploy-retry]` recovering the push-order trap
(build-relevant commit underneath a `[vercel skip]` HEAD) that CLAUDE.md already
flags as having bitten on 08-18 and 09-04. Pulling with `--rebase` on main, and
running the `git log origin/main..HEAD --format=%s` first-line check before a
push with app changes, would have avoided all three. Release notes for 09-04 are
present and `check:release-notes` passes, so nothing is owed there.

### 3. Still open from yesterday: the wfootball ratchet has no alert path

Re-flagging because it recurred today and is unchanged. `RATCHET HELD` is still
only a `log()` call at `scripts/apifootball/refresh_women.py:211`, and the runner
only pushes ntfy on a non-zero exit. The hold fired three times today and cleared
without anyone being told either way -- the only reason it is in this report is
that the sweep read the job log by hand, which is the same way it surfaced
yesterday. Yesterday's recommendation stands: a consecutive-hold counter with one
ntfy warning at ~24h, and gating the ratchet on `looks_fresh(prev_groups)` so it
self-rejects a poisoned bundle. This occurrence resolved itself, so it is not
urgent; it is just still silent.

## Also noted, no action implied

The 09-04 newsletter digest self-reported a **runtime overshoot** -- 6,457 words
against the recipe's 5,200-5,800 band, 39:54 against a 30-35 minute format -- and
explicitly asked you a question it cannot answer itself: whether to cut a chapter
on heavy news days rather than compress all seven. It also substituted two
newsletter section-page links where The Information and Semafor expose only
per-subscriber shortlinks. Both are judgment calls awaiting your answer, not
faults.

`mktcap-refresh` (Sat 09:00Z) and `egress-refresh`/`cfb-sun` (Sun) are due within
the next 36h and are not overdue. Dispatcher `state.json` shows no job stuck in a
non-ok status.
