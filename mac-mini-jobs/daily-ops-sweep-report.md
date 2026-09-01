# Daily Ops Sweep -- 2026-09-01

Window: 2026-08-30T23:06Z -> 2026-09-01T01:06Z (trailing 26h, selected on each
line's own UTC timestamp). Read-only run: nothing was re-run, fixed, pinged or
written except this file.

## Jobs this window: 18 ok, 1 failed, 4 flagged

20 dispatcher occurrences:

| When (UTC) | Job | Result |
|---|---|---|
| 08-30 23:07 | football-standings | DONE 83s |
| 08-30 23:47 | cfb-sun | **FAIL** exit 1, 602s (resolved, see below) |
| 08-31 01:07 | daily-ops-sweep | DONE 535s |
| 08-31 02:36 | activity-feed | DONE 5s |
| 08-31 04:06 | euro-comps | DONE 4s |
| 08-31 05:06 | gap-league-watch | DONE 3s |
| 08-31 05:06 | football-standings | DONE 81s |
| 08-31 05:07 | screen-number-ones | DONE 22s |
| 08-31 05:58 | business-daily | DONE 617s |
| 08-31 06:18 | forecast | DONE 607s |
| 08-31 06:28 | substack-daily | DONE 4s |
| 08-31 07:09 | mlb-sim | DONE 1824s |
| 08-31 07:49 | feed-monitor | DONE 14s |
| 08-31 11:09 | football-standings | DONE 84s |
| 08-31 13:01 | screen-number-ones | DONE 25s |
| 08-31 14:31 | mlb-sim | DONE 1821s |
| 08-31 17:02 | football-standings | DONE 85s |
| 08-31 21:03 | screen-number-ones | DONE 18s |
| 08-31 23:04 | football-standings | DONE 83s |
| 09-01 01:05 | daily-ops-sweep | RUN (this run) |

Plus one hand-launched `daily-ops-sweep` at 08-31 08:12Z, outside the
dispatcher (it rewrote the report; it is why `logs/daily-ops-sweep-2026-08-31.log`
carries two blocks). Its lock held correctly.

Outside the dispatcher, all four launchd agents report exit 0:

- **f1-weekly** (hourly): 26 ticks of `idle: 2026 R12 already synced`. Verified
  against the real calendar rather than assumed -- R12 was Zandvoort 21-23 Aug
  and R13 is Monza 4-6 Sept, so there has been no race to sync. Correctly idle.
- **deploy-watch**: fired once, at 08-31 09:56Z, re-triggering the canceled
  build of `a5645d46a` as `4c5c6cfcf`. That build went READY. Working as designed.
- **heartbeat**, **dispatcher**: loaded, status 0.
- **newsletter-podcast** daily digest, 08-31 07:0x-08:17Z: clean end to end --
  episode `spotify:episode:11wrjgvYhool8gdwQNrnfM` reached READY, both Gmail
  drafts created. No 09-01 run yet (it runs later in the morning).

No job-script `push()` alerts fired this window. Every job that can notify
mid-run logged a clean pass: `gap-league-watch` "no state transitions this run",
`football-standings` `unmatched=0 collisions=0` on all five runs,
`feed-monitor` 12/12 `ok`, `screen-number-ones`, `euro-comps` and
`scraper-substack` all silent. `business-daily`, `forecast`, `mlb-sim` and
`activity-feed` can only push via `fail()`, and all four exited 0.
**Evidence limit worth stating:** the ntfy topic's own message history
(`?poll=1&since=...`, read-only) returned empty, but ntfy.sh's free tier only
retains ~12h, so that independently confirms silence for 08-31 13:00Z onward
only. The earlier half of the window rests on the job logs above.

`python3 dispatcher.py --check-sync` reports **in sync**. Working tree clean;
local HEAD is one commit behind `origin/main` (`c48acbb99`, an ESPN snapshot
pushed at 00:40Z), which the next job's `mini_sync` fast-forwards.

## Self-healed (informational only, no action needed)

**`cfb-sun` exit 1 (08-30 23:47Z)** -- `schedule gap: Jacksonville State has
only 3 games`. Diagnosed and fixed on 08-31 by `8617e8368`, which backfills any
FBS team under `MIN_TEAM_GAMES` from its own `/teams/<id>/schedule` endpoint and
keeps the hard gate as the final check. Verified in the artefact rather than the
commit message: `public/data/cfb-sim.json` now reads `generated_at 2026-08-31`,
`games_played: 8`, `schedule_games: 892`, and
`meta.schedule_backfill: [{team: "Jacksonville State", scoreboard: 3, after: 12}]`.
State marked `ok (manual)` at 06:52Z. The fix still gets its first *unattended*
exercise at `cfb-fri`, Fri 09-04 11:40Z.

**`forecast-scoreboard.json` was regraded.** Yesterday's report flagged it as
frozen at its 08-30 hand-seed because `forecast` ran the stale runner. It now
reads `built: 2026-08-31`, graded by hand in `e280008aa`. The remaining half of
that item -- that 08-31's published `forecast.json` never passed
`check_forecast_health.py` -- self-heals at the next `forecast` slot,
**Wed 09-02 06:10Z**, now that the runners are symlinked.

**`dispatcher.py --self-test` no longer pollutes `dispatcher.log`.** Fixed by
`e280008aa` and confirmed live on this machine: `log()` now returns early when
`IN_SELF_TEST`, which `self_test()` sets. The last stray
`MARK-OK test-job` line in the log is 08-31 07:53:24Z, before the fix landed at
09:28Z. Nothing since.

**Rugby `top-games.json`** (HANDOFF J2, carried) -- `rugby-weekly` runs today
**09-01 07:05Z** and rebuilds it natively from source. No action.

## Needs Ashwin's attention

### 1. The one open thread from yesterday is dated wrong: `egress-refresh` cannot run until Sunday 09-06

**What happened.** Yesterday's report (item #2) said the four leaders fixes were
unproven and that "its next slot is **today 09:00Z**, roughly 40 minutes after
this report was written", with instructions to grep `dispatcher.log` after
09:40Z. That run could never have happened. `egress-refresh` is
`weekdays = [7]` in `jobs.toml` -- Sunday only -- and `dispatcher.py:93`
filters on `day.isoweekday()`, where 7 is Sunday. 08-31 was a Monday.

**Evidence.** `python3 dispatcher.py --status` (read-only, run this sweep) still
shows `egress-refresh` sitting on slot `08-30 09:00`, and `state.json` still
reads `last_slot: 2026-08-30T09:00:00+00:00`. `grep egress-refresh
dispatcher.log` has no 08-31 entry at all. The 01:07Z sweep the same morning had
this right ("it will HOLD `egress-refresh` again on **09-06**"); the 08:12Z
hand-launched rerun overwrote that with the wrong date.

**Why it matters.** `egress-refresh` has now failed two Sundays running --
08-23 (`FAIL exit 1 after 1819s`) and 08-30 (`FAIL exit 1 after 1852s`) -- and
its `ok (manual)` state is bookkeeping, not evidence. **Five** commits are
staked on the next run and none has been exercised unattended:
`3a618cea5` (`mul` label fallback), `64da27c52` (pins restore the whole entry
and the run continues), `31c2d59a0` (estonia/madagascar/malawi/mauritius pins),
`e33250265` (ceremonial-succession SOFT flag), and `59744e9ab` (gate extended
past `_current.json` to the timelines and changes log). Following yesterday's
instruction on Monday would have produced no output, which reads identically to
"the job silently didn't run".

**Recommended fix.** Nothing to change in the pipeline -- just move the check to
the right day. After **Sun 2026-09-06 09:40Z**, run
`grep -A20 'RUN egress-refresh' ~/metro-mini-jobs/dispatcher.log | tail -40`.
A clean run ends `DONE egress-refresh`. A `HOLD` now names countries on `!`
lines, and because pins repair rather than halt, any HOLD indicates a country
that is *not* pinned -- a genuinely new case, not the Nigeria loop.
Separately, worth considering: have the sweep prompt compute next slots from
`dispatcher.py --status` rather than from prose, so a report cannot assert a
slot the schedule does not have.

### 2. 08-31 spent 3 billable Vercel builds against the 2/day budget, one of them repairing the other

**Counted with the Vercel MCP** (`list_deployments`, two pages covering
08-31 04:28Z -> now; `CANCELED` is free), not from GitHub `deployment_status`:

| UTC | Commit | State |
|---|---|---|
| 08-31 08:27 | `c66ce6c60` data: mini refresh - build-time-read data changed | **READY** |
| 08-31 09:56 | `4c5c6cfcf` deploy-retry of `a5645d46a` | **READY** |
| 08-31 19:11 | `31a9c0949` club football greatest games (Ashwin) | **READY** |

Everything else on 08-31 and everything so far on 09-01 is `CANCELED`.
Today is clean: **0 billable builds** as of 01:06Z.

**Root cause of the extra one.** `c66ce6c60` (the 09:27 local leaders refresh)
published per-country leaders files that regressed the timelines; `a5645d46a`
-- "leaders: repair the per-country timelines the 09:27Z refresh regressed" --
was the repair. Vercel canceled `a5645d46a`'s own build when a newer commit
superseded it, `deploy-watch` correctly re-triggered it as `4c5c6cfcf`, and that
one built. So two builds went to one work item, which is exactly the pattern
flagged on 08-30 (7 billable, three of them second builds). The third build was
Ashwin's own feature and is legitimately billable.

**The guard is already in, and is also unproven.** `59744e9ab` extended the
leaders sanity gate past `_current.json` to the timelines and changes log --
but it landed at 09:09Z, *after* the 08:27Z refresh that caused this. Like item
#1, its first real exercise is `egress-refresh` on **09-06**. No action is
needed now beyond knowing 08-31 ran one over budget and why; the check that
would prevent a repeat is written and waiting on the same Sunday slot.

### 3. Today is the first unattended dispatcher run the two monthly jobs have ever had

`conflicts-monthly` (07:15Z) and `cricket-monthly` (10:00Z) are `days = [1]`.
Both still read `last_status: "seeded"`, `last_run_date: 2026-08-01` in
`state.json` -- that is the install seed, not a run. They were flipped from
launchd to the dispatcher on 2026-08-07, after August's 1st had passed, so
**2026-09-01 is the first time either has actually fired from `dispatcher.py`**.
`jobs.toml`'s own comment anticipates this ("monthly jobs only get a real
unattended proof on the 1st").

**What to check, after ~10:30Z today:**
`grep -E 'conflicts-monthly|cricket-monthly' ~/metro-mini-jobs/dispatcher.log | tail`
plus `logs/scraper-conflicts-2026-09-01.log` and
`logs/cricket-monthly-2026-09-01.log`. Both are 20-minute-timeout jobs. This
morning is unusually loaded -- `predictions-tue` 06:40Z, `rugby-weekly` 07:05Z,
`conflicts-monthly` 07:15Z, `cricket-monthly` 09:00/10:00Z and `cricket-weekly`
09:00Z all land alongside the daily cluster -- so some slots will run late; late
is normal, `MISSED` is not.

### 4. `ucl-sim.json` is still frozen; today's `predictions-tue` is its first repaired run

`0b94d2f72` established that the live `runners/predictions.sh` was stuck at
2026-08-06 and **never built the UCL sim at all**, so `ucl-sim.json` sat on its
`4cd9ca0de` hand-seed and `/predictions/ucl` was never refreshed or re-warmed.
The drift was closed at 08-31 08:53Z. `git log -1 -- public/data/ucl-sim.json`
still shows `669e6249e` (2026-08-30, "emit Ashwin's canonical Lookup names"),
a hand edit -- so the model output has not been rebuilt yet.

`predictions-tue` runs **today 09-01 06:40Z** and is the first exercise of the
un-drifted runner. Worth an eyeball afterwards: `git log -1 --format='%h %ad %s'
--date=iso -- public/data/ucl-sim.json` should move to today. If it does not,
the runner is running but the UCL step is not, which is a different bug from the
symlink drift.

## Also noted, no action

- `[wfootball] FA WSL (id 44): 12 standings rows [2025-26] PLACEHOLDER` still
  appears on every `football-standings` run, including 09-01 00:05Z. Liga F
  flipped to 2026-27 on 08-31, so the mechanism works; api-football simply has
  not opened the WSL 2026-27 season. Expect it to clear on its own.
- `gap-league-watch`: India L1 (Indian Super League) remains correctly
  `awaiting_target` -- api-football's latest published season is still 2025.
  One pending league, no transitions.
- Release notes are current: `lib/releases.ts` carries a 2026-08-31 block
  ("The greatest club football games, ranked") covering `31a9c0949`, the only
  reader-visible commit of the day. Nothing owed.
- `CLAUDE.md` cites a memory named `feedback_vercel_build_budget_incident`, but
  this machine's project memory directory
  (`~/.claude/projects/-Users-ashwindesikan-Projects-Metro-Area-Project/memory/`)
  is empty and has no `MEMORY.md`. A future session on the mini following that
  pointer will find nothing. Harmless, but the incident detail lives only in the
  08-06 HANDOFF entry and in CLAUDE.md itself.
