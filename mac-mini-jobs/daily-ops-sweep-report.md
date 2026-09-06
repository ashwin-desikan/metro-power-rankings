# Daily Ops Sweep -- 2026-09-06

Window: 2026-09-04T23:09Z -> 2026-09-06T01:09Z (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing was re-run,
pinged, promoted or written except this file. The one live network call made was
a read-only GET against api-football (evidence for item 1) and one WebSearch.

## Jobs this window: 15 ok, 0 failed, 2 flagged

Every dispatcher job DONE'd clean. No `FAIL`, no `MISSED`, no timeout.

| slot (UTC) | job | status |
|---|---|---|
| 09-04 23:00 | football-standings | ok 86s |
| 09-05 01:00 | daily-ops-sweep | ok 612s |
| 09-05 02:30 | activity-feed | ok 5s |
| 09-05 04:00 | euro-comps | ok 6s |
| 09-05 05:00 | gap-league-watch | ok 3s |
| 09-05 05:00 | football-standings | ok 89s |
| 09-05 05:50 | business-daily | ok 615s |
| 09-05 06:00 | substack-daily | ok 4s |
| 09-05 07:00 | mlb-sim | ok 444s |
| 09-05 07:20 | feed-monitor | ok 16s |
| 09-05 09:00 | mktcap-refresh | ok 368s |
| 09-05 11:00 | football-standings | ok 90s |
| 09-05 14:30 | mlb-sim | ok 449s |
| 09-05 17:00 | football-standings | ok 94s |
| 09-05 23:00 | football-standings | ok 87s |

Nothing is overdue. `screen-number-ones` (Mon/Tue/Wed) last ran Wed 09-02 and is
not due; `cfb-sun` (23:40Z Sun) and `egress-refresh` (09:00Z Sun) are both due
later today and have not missed a slot. `state.json` shows no job stuck in a
non-ok status. `npm run check:data-currency`: 23 current, 0 overdue.

Non-dispatcher launchd jobs, also checked: the **f1** poller ran 26 hourly ticks,
all `idle: 2026 R12 already synced` (correct -- R12 is Zandvoort, and R13 Monza
races TODAY, so there is nothing to sync until tonight); **newsletter-podcast**
built, published and drafted clean, `watchdog` OK, `retention` deleted 1 aged
episode; **deploy-watch** reports the live site serving `46df23bb3`, the newest
build-relevant commit. A **manual** FIBA refresh also ran at 20:02-20:13Z outside
the dispatcher -- that was yours, see self-healed item 3.

No job script fired an ntfy `push()` this window.

## Self-healed (informational only, no action needed)

**1. Sweep item 1 (the orphaned watchdog `sleep`) is fixed and measured.**
`48800e41f` redirected the watchdog subshell at all three call sites --
`runners/_common.sh` (`guarded`), `runners/mlb-sim.sh` (`run_soft`) and
`metro-mini-refresh.sh` (`run_step`) -- and the fleet numbers moved the way the
diagnosis predicted:

```
mlb-sim  09-04 07:00Z  ok 1826s  |  09-05 07:00Z  ok 444s
mlb-sim  09-04 14:30Z  ok 1826s  |  09-05 14:30Z  ok 449s
```

`business-daily` still reported 615s, but it ran at 05:52Z, ~1h before the fix
landed at 06:49Z -- its own log has the work finishing at 05:57Z, so it was still
carrying ~280s of dead pipe. **Its first post-fix run is today at 05:50Z**; expect
roughly 340s. `metro-mini-refresh.sh`'s first post-fix run is today at 09:00Z.

**2. Sweep item 3 (the silent wfootball ratchet) is fixed.** `ddc90636a` did more
than add the alert path that was asked for: it found that a hold was republishing
whatever api-football had just served rather than the last good table, and made a
hold republish the stored bundle, refuse when the stored table is not itself
fresh, and exit 4 once at 24h of unbroken hold so the runner turns it into one
ntfy. No `RATCHET HELD` occurred this window, and Liga F is now a genuine
2026-27 table (16 rows, `[2026-27]`, not placeholder). Item 3 is closed.

**3. The FIBA women assertion failure was yours and you fixed it the same hour.**
The 20:02Z manual run died on `AssertionError: sanity: only 119 teams (< 120)`.
`71b9458d6` replaced the single global `MIN_TEAMS=120` with per-gender floors
(men 140, women 105, set from observed sizes) and added a rank-contiguity gate,
which is the stronger check because a clean top-ten truncation passes a count
floor. The 20:13Z live run then wrote 159 men and 119 women and pushed
`8af8bcb7b`. Nothing outstanding.

**4. The mktcap METRO QUEUE alert was reworked and the queue worked to zero.**
Saturday's run emitted 40 unmapped names of which only 2 were new. That was
diagnosed and fixed within the day: `62a64b82a` (the alert said "new" and meant
"everything"), `0f50c145d` (a `metro-gap` hold state so cities absent from the
metro list stop nagging weekly), plus your rulings in `dccc6662d`, `aaa0de7da`,
`6841ca76f` and the CSV re-export `61a3f2de5`. The >=$10B queue is at 0.

## Needs Ashwin's attention

### 1. The FA WSL season started on Friday and the site is still showing 2025-26, with nothing that will ever tell you if it stays that way

**What happened.** Today's 00:07Z football-standings run logged:

```
[wfootball]   FA WSL (id 44): 12 standings rows [2025-26] PLACEHOLDER
[wfootball]   awaiting 2026-27 in api-football: FA WSL (showing 2025-26)
```

**Root cause -- verified upstream, not guessed.** Read-only GET against
api-football with the mini's key:

```
/leagues?id=44        2025  2025-09-05..2026-05-23  coverage.standings = True
                      2026  2026-09-04..2027-05-22  coverage.standings = False
/standings?league=44&season=2026   results: 0
/fixtures?league=44&season=2026    results: 182, of which 2 finished
    2026-09-04  London City Lionesses W 2-1 Manchester United W
    2026-09-05  Chelsea W 1-1 Aston Villa W
```

So api-football has the season and its fixtures, and is serving results, but has
not switched `coverage.standings` on for 2026 yet. The real-world season started
**4 September 2026** (runs to 23 May 2027; expanded to fourteen clubs), confirmed
via Wikipedia's 2026-27 Women's Super League page and the WSL fixture-release
coverage. `wleagues.json` already carries `watch_season: 2026`, and
`fetch_standings()` probes `/standings` for it on every run, so **this will clear
itself automatically the moment the provider flips coverage** -- historically
within days of kickoff, and 2025 is `True`.

**The part that needs you.** There is no upper bound on that wait. The
`_ratchet_holds` counter added yesterday only fires when a league REGRESSES from
a published season to a placeholder. FA WSL never regressed: it has been a
declared placeholder since before kickoff, so it takes the `pick_effective`
fall-through, no hold is recorded, and no alert can fire. If api-football never
turns 2026 standings on, `/teams/wfootball` shows a completed 2025-26 table --
correctly labelled, but a season out of date -- indefinitely and silently. This
is the same class of silence that item 3 was raised for.

**Recommended fix (small, and the data for it is already in hand).** The
`/leagues?id=<lid>` response carries `seasons[].start`. In
`scripts/apifootball/refresh_women.py`, when an entry defines a `watch_season`
and that season's probe returns no rows, compare today against that season's
`start` date and push one ntfy (the `bump_hold` once-per-condition pattern is
right there to copy) when it is more than ~10 days past kickoff. Add the same
`--self-test` shape as `bump_hold`'s: not yet started, started 3 days ago,
started 30 days ago, and recovery clearing the flag. Liga F's entry would exercise
the same path. Nothing else needs to change: the display behaviour is already
correct and honest, it is only the notification that is missing.

### 2. 2026-09-05 spent 9 production builds against the 2/day budget

Counted with the Vercel MCP across three pages, `state: READY`, `target:
production` only (`CANCELED` is free). Not from GitHub `deployment_status`.

```
07:12Z  order: the Force axis learns what a state can raise and spend     metro-mini[bot]
07:30Z  order: say how close each position is to another                  metro-mini[bot]
07:48Z  order(a11y): a real space between the margin and its axis word    metro-mini[bot]
09:06Z  mktcap: weekly Top Companies refresh 2026-09-05                   metro-mini[bot]
13:39Z  Add England v Norway quiz to /play                                Ashwin
17:32Z  Merge branch 'main' of github.com:...                             Ashwin
19:50Z  football: what the market thought a squad was worth               Ashwin
20:50Z  volleyball: thirty nations become a hundred and forty-one         Ashwin
21:31Z  zzc: one row per country, and the Countries hub decides its name  Ashwin
```

**The guard is not at fault.** Every automated data commit in the window -- mini
bot, footy-refresh-bot, espn-snapshot-bot, cfl-refresh-bot, mac-mini[claude], and
yesterday's own ops sweep -- was correctly CANCELED. Two of the nine were
knowingly authorised: `6df8fca13`'s own commit body records "Third production
build today against a 2/day budget, at Ashwin's explicit instruction", and the
mktcap weekly is untagged on purpose. Today (09-06) has spent 0 so far.

**The one avoidable build is the same one as yesterday: the bare `Merge branch
'main'` at 17:32Z.** That rebuilds the whole site to publish work that was
already built. It is the third such merge build in three days (09-04 had two).
`git config --global pull.rebase true`, or `git pull --rebase` on main, removes
this category entirely. The three consecutive `order:` builds in 36 minutes are
the other pattern worth naming: three separate pushes for what was one work item
with a follow-up correction, which is exactly the batching CLAUDE.md asks for.

## Also noted, no action implied

**The newsletter runtime overshoot recurred, and the question you were asked on
09-04 is still open.** 09-05's digest came in at 6,196 narration words / 38:03
against a 5,200-5,800 word, 30-35 minute format -- the second day running. The
script says it trimmed twice, from 7,265, and stopped where further cuts started
removing named sources rather than fat. It is asking whether to drop a chapter on
heavy news days rather than compress all seven. It also flagged that Semafor,
Democracy Docket, NYT, AdExchanger and Morning Brew wrap their links in
unrecoverable redirects, so those are cited in prose without links.

**Two log lines that read alarming and are not.**
- `[mktcap:selftest] WARNING: rename NVDA -> MSTR SKIPPED ... Fix
  mktcap_symbol_changes` is a **self-test fixture**, not a live table row -- the
  next line is `PASS merge: recycled-ticker rename SKIPPED`, and the live run
  reported `rename guard: 0 recycled-ticker renames skipped: []`.
- `[mktcap] WARNING: table id=changes not found` on the S&P 500 build is the
  known Wikipedia restructure of 2026-08-17, and the week-over-week constituent
  diff fallback shipped in `238dde631` on 09-05. `changes rows: 0` is genuine for
  this week (no membership change between the 08-29 and 09-05 constituent lists);
  the history accumulates forward from here rather than being recoverable
  backward. `constituents: 503, matched 496/503`.

**Still awaiting their first unattended run today**, both worth a glance at the
result and neither actionable now: `egress-refresh` at 09:00Z (first run with the
repaired Nigeria pin gate AND the first with the watchdog fix in `run_step`), and
`cfb-sun` at 23:40Z (last ran 08-30, manually).
