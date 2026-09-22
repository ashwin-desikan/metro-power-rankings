# Daily Ops Sweep -- 2026-09-22

Window: 2026-09-20T23:07Z .. 2026-09-22T01:07Z (trailing 26h). Read-only run: nothing was
re-run, pinged, written or fixed. **Zero job failures this window** -- but three things want
Ashwin, and one of them has been sending him an alert every two hours since 20:21Z.

## Jobs this window: 19 ok, 0 failed, 3 flagged

**Every job that was due ran, and every one exited 0.** 187 RUN lines, 186 DONE (the 187th is
this sweep). No `FAIL`, no genuine `MISSED`. The one `MISSED` string the window query matches
is prose inside yesterday's own sweep summary, not a dispatcher event.

| job | runs | result |
|---|---|---|
| deploy-watch | 147 | ok 2-3s each |
| ops-autofix | 13 | ok -- but 3 of them stood down, see #1 |
| football-standings | 4 | ok 112-116s |
| claude-auth-canary | 4 | ok (16.1 days of refresh-token life left) |
| screen-number-ones | 3 | ok 36-418s |
| mlb-sim | 2 | ok 436s / 445s -- first clean unattended pair through the new `classify_win_mismatch` tolerance |
| daily-ops-sweep | 2 | ok |
| activity-feed, business-daily, cfb-sun, cricket-champions, euro-comps, feed-monitor, forecast, gap-league-watch, git-maintenance, nfl-elo, owners-weekly, substack-daily | 1 each | ok |

**Not due, correctly idle (verified against `jobs.toml`, not assumed):** egress-refresh,
economy-prices (both `weekdays = [7]`, Sunday, last ran 09-20); economy-rates `[5]`;
economy-housing, mktcap-refresh, metro-rankings `[6]`; predictions-tue `[2]`; cfb-wed/fiba/
sound `[3]`; cricket-weekly/rugby `[2]`; conflicts-monthly/cricket-monthly day 1.

**Not under the dispatcher.** The hourly `f1` launchd job logged `idle: 2026 R14 already
synced` 26 times -- correct, R15 (Azerbaijan) is Saturday 2026-09-26. newsletter-podcast ran
morning (36 items), evening (+4, day holds 40), watchdog (`final.mp3` present, episode READY)
and retention (deleted 1 episode older than 7 days) with no errors.

**Gates, run rather than assumed:** `check:release-notes` OK (144 entries, newest 2026-09-21).
`check:data-currency` 29 current, 0 overdue, 0 unreadable. `feed-monitor` 07:26Z all 12 probes
ok. `gap-league-watch` no state transitions, 3 leagues still `awaiting_target`. No job script
pushed an ntfy this window except ops-autofix (#1).

## Self-healed (informational only, no action needed)

**`deploy-watch` coalesced 9 of its 156 slots, and that is by design, not missed work.**
Slots skipped: 23:50Z, 01:10, 06:00, 07:10, 08:10, 08:40, 11:40, 14:40, 17:50. Each is a
single slot, and each sits where the dispatcher tick had drifted to 10 minutes late (e.g.
`RUN slot 11:30Z, 10m late` at 11:39:59, then `RUN slot 11:50Z, 0m late` at 11:50:05). The
dispatcher resolves an `every_minutes` job to its most recent due slot, so a drifted tick
takes the newer one and drops the intervening one. Nothing is lost: deploy-watch re-reads the
same Vercel state 10 minutes later. Not a fault, recorded so a future sweep does not chase it.

**`git-maintenance` passed vacuously at 03:02Z, exactly as last night's report predicted.**
`loose objects before: 632 (threshold 6700)` / `after: 632` / `done` in 0s. Step 2 (`tmp_obj_*`
older than 1 day) still has never had anything to delete. Do not read this green as proof the
step works. Loose objects are now 1692 (22h later) against the 6700 threshold; `.git` is 1.7 GB.

**Last night's watch items both resolved clean.** mlb-sim's 07:00Z and 14:30Z runs were the
first unattended pair through the new win-mismatch tolerance and both exited 0. The
`.autofix-attempts.json` cap reset on the new UTC day as expected.

## Needs Ashwin's attention

### 1. ops-autofix has been stood down for 5 hours and is alerting every 2 hours, and the thing blocking it is a real, correct, unshipped fix

**What happened.** From 20:21Z on 09-21, every ops-autofix run has printed:

```
1 finding(s):
   [blocker] working_tree_dirty -- repo has 8 uncommitted change(s); autonomous action is unsafe
STOP: uncommitted changes in the repo. Refusing to act around a human's work.
```

Three runs so far (20:21Z, 22:23Z, 00:16Z) and it fires on every 2-hourly slot from here.

**Root cause -- and it matters that this is not junk.** The 8 files are a finished, correct
piece of work from an interactive mini session on the evening of 09-21, modified 20:55-20:58
BST and never committed:

```
app/elections/forecast/page.tsx      data/forecast/uk_polls.json
data/forecast/snapshots/br-2026-10-04.json   lib/releases.ts
data/forecast/snapshots/fr-2027-04-11.json   public/data/forecast.json
data/forecast/snapshots/uk-2029-05-03.json   scripts/forecast/fetch_data.py
```

It is the fix for the UK 2024 baseline bug that the mini's own 09-21 (night) HANDOFF entry
filed as "UNRELATED FINDING, NOT FIXED HERE". The committed `uk_polls.json` records the 2024
general election as `lab 23.7, con 14.3, ref 12.2, ld 6.8, grn 2.5, snp 0.7` -- every value
shifted one party left. **Verified against the real result this run:** Labour 33.7%,
Conservative 23.7%, Reform UK 14.3%. The working-tree version has exactly those numbers. The
fix is right; it is simply not committed.

**Two consequences, both live right now.**
- **The published site is wrong.** `HEAD:public/data/forecast.json` starts the UK trend at
  `2024-07-12: lab 31.4, con 17.1` against the working tree's `lab 36.4, con 21.9`. Labour's
  2024 baseline reads about 10 points low on `/elections/forecast` today, and that file is
  ISR-from-raw, so it is what a reader sees.
- **Wednesday will half-ship it.** `forecast` next runs 2026-09-23 06:10Z (`weekdays [1,3,5]`).
  `mini_sync` is safe here -- the tree is dirty but 0 ahead, so `merge --ff-only` succeeds and
  nothing is discarded. But `runners/forecast.sh` then executes the **uncommitted**
  `fetch_data.py` and its `commit_paths` line stages `public/data/forecast.json` and
  `data/forecast`. So the data half of this work gets swept into a bot commit tagged
  `[vercel skip]`, produced by a script that is still uncommitted -- while
  `app/elections/forecast/page.tsx` (the Labour-first series reorder) and the `lib/releases.ts`
  bullet describing it stay stranded. The published release note would then read "Labour leads
  the party list" about a change that never shipped.

**Recommended fix.** Commit the 8 files as one commit, **untagged** (it touches `app/`, `lib/`,
`public/`, so it is a real build) and **last in its push**, before Wednesday 06:10Z. Run
`npm run verify` first -- `scripts/forecast/fetch_data.py` gained 74 lines and
`fetch_data.py --self-test` gates the runner, so a regression there fails the job, not just
the build. Note the 2026-09-21 release block is at exactly 4 bullets with this addition, which
is the ceiling; if it lands on 09-22 consider whether the bullet belongs under 09-22 instead.
Today's UTC build budget is untouched (0 used), so it is a clean slot -- but see #2.

**Secondary, worth fixing while you are in there.** The `working_tree_dirty` push in
`run-ops-autofix.sh:114` sits *above* the same-findings dedupe at line ~304 and `exit 0`s
immediately, so unlike every other finding it re-notifies on every single slot -- 12 alerts a
day for one unchanged condition. The dedupe comment two hundred lines below argues precisely
against this ("an alert channel that cries wolf on a schedule is worse than no alert channel").
Moving that push behind the same last-findings check would make it alert once and then go quiet.

### 2. The 2/day Vercel build cap is still INACTIVE, and it let a third build through yesterday. Measured, not inferred.

**Evidence, straight out of two production build logs:**

```
Running "sh scripts/vercel-ignore.sh"
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
```

-- `dpl_12Zw6W8s8mr4Eev6dR3bVqRzAtrT` (`766c23726`, 09-21 11:32Z) and
`dpl_6JK7TfWpNNrCeoCzQf7BK9myoJsi` (`5d10d273f`, 09-21 18:11Z). Two builds seven hours apart
both report inactive, so this is the token being absent, not a transient API timeout.

**What it cost.** Paid production builds for `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, per UTC day
(`list_deployments`, states READY+ERROR; CANCELED excluded as free):

| date | paid builds | |
|---|---|---|
| 2026-09-17 | 2 | at budget |
| 2026-09-18 | 1 | |
| 2026-09-19 | 4 | **over** |
| 2026-09-20 | 1 | |
| 2026-09-21 | 3 | **over** -- `7cb1f3d1f` 10:23Z, `766c23726` 11:32Z, `5d10d273f` 18:11Z |
| 2026-09-22 | 0 so far | |

With the cap live, `5d10d273f` ("Release notes: trim 21 Sep entry") would have been skipped at
18:11Z: the count was already 2 and its subject carries no `[deploy-now]`. Note that
`[deploy-retry]` does not beat the cap, so `7cb1f3d1f` correctly consumed a slot.

**This is not new and it is not a code bug.** `HANDOFF-recent.md:2041` and `:2117` already
carry it as Ashwin's own P0 row -- it needs Vercel dashboard access this session does not have
(`filter_project_envs` returns 403 for this token). It is in the report because it is still
open and it spent real money again yesterday.

**The fix, unchanged from the earlier entries.** Add `VERCEL_BUILD_CAP_TOKEN` (a read-scope
Vercel token) to project `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team
`team_yQjbuPwcr40J6AxkjCv6AawD`, as a **Production, build-time** environment variable. The next
build's log should then read `vercel-ignore: N paid production build(s) so far today (cap 2)`
instead of `build cap inactive` -- that line is the confirmation to look for.

### 3. Commit volume on the repo went up 4.5x on 2026-09-21, as a side effect of moving deploy-watch under the dispatcher

**What happened.** `data: refresh-schedule.json [vercel skip]` commits, per day:

```
09-14: 29   09-15: 31   09-16: 33   09-17: 27   09-18: 30   09-19: 32   09-20: 34
09-21: 135
```

Total commits on the repo went 60/day to **174** on 09-21. In the last ~6 hours Vercel recorded
**40 production deployments**, every one CANCELED.

**Root cause.** `dispatcher.py:1339` calls `export_schedule()` after *every* tick, and
`export_schedule.py:264-271` commits and pushes `public/data/refresh-schedule.json` whenever it
differs. Before 09-20 the file only changed when some job's state changed -- about 30 times a
day. `baeb6d021` moved deploy-watch from launchd into `jobs.toml` with `every_minutes = 10`, so
its `last_run.slot` and `next_run` now advance every tick and the file differs every tick. The
diff of `2a058483a` is exactly three lines: `generated_at`, deploy-watch's `next_run`, and its
`last_run.slot`.

**Why it is worth a line rather than a shrug.** Nothing is broken and no build is being spent
-- every one of these is skip-tagged and CANCELED, which is free. But CLAUDE.md's own reading
of the 2026-08-06 incident is that *"commit volume is what turns a latent guard bug into a
bill"*, and this is a 4.5x increase in guard evaluations per day. It also grew loose objects
from 632 to 1692 in 22 hours against git-maintenance's 6700 threshold, and it is the same churn
that made GitHub issue #26 unclosable (per the 09-21 (late) HANDOFF entry).

**Recommended fix (small, and I would do the first).** In `export_schedule.py`, compare the
regenerated JSON against the committed one with `generated_at` and every `every_minutes` job's
`last_run`/`next_run` masked out, and skip the commit when only those differ. A 10-minute
watcher's own heartbeat is not schedule information a reader of `/refresh-schedule` needs to
the minute. Alternative if you want it simpler: give `export_schedule()` its own interval (say
every 6th tick) rather than running it on every one.

### 4. Correction to last night's report: egress-refresh is Sunday-only, so the 6 deferred leader changes will NOT self-heal until 2026-09-27

Last night's item #3 said *"egress-refresh, 09:00Z today. Today's 09:00Z run should re-apply
and commit them."* That was wrong. `jobs.toml` has egress-refresh at `time = "09:00"`,
`weekdays = [7]` -- **Sunday only**. It ran 2026-09-20T09:00Z (`state.json`: `last_status: ok`),
did not run on Monday 09-21, and next fires **2026-09-27T09:00Z**.

So the six country leader changes an interactive session derived by hand on the 09-20 evening
(nigeria, kazakhstan, estonia, mauritius, madagascar, malawi) and then reverted rather than
committed are still not applied. Confirmed on disk: `public/data/leaders/_changes.json` is
unmodified against HEAD and still reads `"updated": "2026-09-13"`; its last commit is
`cd9bbbbab` (2026-09-13). Nothing is stranded or at risk -- it is simply a seven-day gap on
six countries' leadership data that yesterday's report implied was closing within hours.

**Recommended:** either accept the Sunday cadence and let 09-27 pick it up, or re-run the
leaders step by hand and commit it (it touches `public/data/leaders/**`, which country pages
read at build time, so it is a real build -- budget it against #2). No code change is needed;
the wrong thing here was a cadence assumption, now corrected in writing.

---
*Read-only sweep. Notion could not be read or updated: the Notion MCP server needs an
interactive OAuth authorisation a headless session cannot perform, so the contract's
start-of-session Backlog read did not happen. No queryable state was changed by this sweep.
Findings 1 (both halves), 3 and 4 are candidates for Backlog rows; finding 1's "the data half
ships and the page half does not" shape and finding 3 are both Silent failure register
candidates. Finding 2 is already a P0 row.*
