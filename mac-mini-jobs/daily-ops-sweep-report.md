# Daily Ops Sweep -- 2026-09-07

Window: 2026-09-05T23:03Z to 2026-09-07T01:03Z (trailing 26h). Read-only run,
no writes made except this file.

## Jobs this window: 19 ok, 0 failed, 2 flagged

**Dispatcher jobs (16 runs, all DONE ok, zero FAIL, zero MISSED):**

| Slot (UTC) | Job | Result |
|---|---|---|
| 09-05 23:00 | football-standings | ok 87s |
| 09-06 01:00 | daily-ops-sweep | ok 438s |
| 09-06 02:30 | activity-feed | ok 5s |
| 09-06 04:00 | euro-comps | ok 5s |
| 09-06 05:00 | gap-league-watch | ok 3s |
| 09-06 05:00 | football-standings | ok 88s |
| 09-06 05:50 | business-daily | ok 337s |
| 09-06 06:00 | substack-daily | ok 4s |
| 09-06 07:00 | mlb-sim | ok 448s |
| 09-06 07:20 | feed-monitor | ok 16s |
| 09-06 09:00 | egress-refresh | ok 116s |
| 09-06 11:00 | football-standings | ok 89s |
| 09-06 14:30 | mlb-sim | ok 444s |
| 09-06 17:00 | football-standings | ok 95s |
| 09-06 23:00 | football-standings | ok 85s |
| 09-06 23:40 | cfb-sun | ok 401s |

**Non-dispatcher services (3, all healthy):**

- **f1-weekly** (hourly launchd, not dispatcher-managed, so it is absent from
  `state.json` by design): ~26 ticks, all clean. Ingested a new race at
  09-06 22:54Z: `2026 R13 (Italian Grand Prix)`, results +22, poles +1,
  driverStand 23, constructorStand 11, 0 unresolved metros. Verified against
  the real world: Monza was Round 13 of the 2026 season on 2026-09-06, won by
  Kimi Antonelli, on a 22-car / 11-team grid. Counts match. Its `[vercel skip]`
  is correct, `lib/f1.ts:100` reads `public/data/f1/data.json` from GitHub raw
  (ISR), not at build time.
- **newsletter-podcast** (daily): 09-06 run clean, episode
  `spotify:episode:4QQqkc35KOIhjQPEEpyPMy` reached READY, both Gmail drafts
  created. No 09-07 log yet, it runs later this morning.
- **deploy-watch** (10-min launchd): ~156 ticks. Fired one retry, see flagged
  item 1. Production is currently live and correct: last tick reads
  `up to date: TARGET ebbdd66d6 is live (serving ebbdd66d6)`.

**No job-script `push()` alerts fired this window.** The only alert-adjacent
log lines were `[gap-watch] India L1 Indian Super League -> awaiting_target`
(2026 not yet published upstream, `no state transitions this run`, so no push),
the citypopulation watcher reporting no new in-coverage updates, and
`check-leaders-sanity: OK`.

**Nothing was silently skipped.** Every job whose `last_run_date` looks stale is
on a weekly or monthly cadence and ran on its correct slot: `mktcap-refresh` is
`weekdays = [6]` (Saturday) and ran 09-05, `egress-refresh` is `weekdays = [7]`
(Sunday) and ran 09-06. 09-05 was a Saturday and 09-06 a Sunday, so both are on
time. Next mktcap run is Saturday 09-12.

## Self-healed (informational only, no action needed)

- **The 250 MB function-limit deploy failure (09-06).** Two production
  deployments ERRORed: `dpl_J5tyi4v...` (commit `b40726b7b`, 16:10Z) and
  `dpl_F2hkf3e...` (the retry commit `1291a3818`, 16:31Z). Both were the OG
  comparison card pulling all of `public/data` into the function bundle.
  Ashwin diagnosed and fixed it the same afternoon in `ebbdd66d6`, which
  deployed READY at 16:48Z and is what production serves now. No action left
  on the failure itself. The watcher's behaviour during it is flagged below.
- **Nothing app-side is unshipped.** Every commit after `ebbdd66d6` that touches
  a build-relevant path is an ISR-backed `[vercel skip]` data refresh
  (`git log ebbdd66d6..HEAD -- app lib public ...` returns 10 commits, all
  `[vercel skip]`). The site is fully up to date with the day's work.
- **Release notes are satisfied.** 09-06 shipped a lot of `app/`+`lib/` work and
  does have its `lib/releases.ts` entry. `npm run check:release-notes` passes:
  `OK (129 entries, newest 2026-09-06)`.
- **Build budget.** UTC day 09-06: 2 READY, 2 ERROR, 20 CANCELED. Both READY
  builds were justified (`599d58a51`, egress-refresh's build-time-read data
  change, by design; and `ebbdd66d6`, the fix for the ERRORs). UTC day 09-07 so
  far: 5 deployments, all CANCELED, 0 READY, 0 ERROR. The `[vercel skip]`
  discipline is working.

## Needs Ashwin's attention

### 1. The deploy watcher still cannot tell CANCELED from ERROR, and its own safety check silently failed open

**What happened.** You wrote this up yourself last night in HANDOFF
(`7dc5e4d7d`, "The deploy watcher retried a build that had genuinely FAILED"),
so the diagnosis is yours and this entry exists to confirm two things: the fix
is still not applied, and there is a second defect underneath it that the
write-up does not cover.

**Still unfixed, confirmed.** `mac-mini-jobs/run-deploy-watch.sh` is unchanged
since `3b6a60d5d` (2026-08-06); `git status --porcelain` on it is clean. The
launchd job `com.citizenofnowhere.deploy-watch` is loaded and firing every 600s.
So the exposure is live: a genuinely failing build still gets retried up to
`MAX_ATTEMPTS=3`, each attempt a production build that is certain to fail the
same way.

**The second defect, which is new information.** The script has a guard at
lines 89-110 that is supposed to prevent exactly this class of pointless retry:
before re-triggering, it asks the GitHub deployments API whether TARGET already
has a successful production deployment. At the moment it mattered, that call
was rate-limited. `/tmp/deploy-watch.err` contains:

```
curl: (56) The requested URL returned error: 429
post-commit CHECK: OK (touches_build=1 tagged=0)
```

with mtime `2026-09-06 17:31:29` BST, which is the exact minute of
`re-triggered build of b40726b7b (attempt 1)`, and the `post-commit CHECK`
lines immediately after it are that retry commit's own git hook. So the
sequence was: guard call 429s, guard returns empty, script reads empty as "no
successful deployment", script retries.

The guard cannot distinguish those two states. The python it pipes through
swallows every exception (`except Exception: pass`) and the whole call ends in
`2>/dev/null || true`, so an HTTP failure and a definitive "this commit never
deployed" produce the identical empty string. It **fails open into a retry**.

This did not change the outcome on 09-06, because that build had genuinely
ERRORed and the guard would have returned empty anyway. But it is the exact
failure mode the guard was added to prevent (its own comment cites ~8 minutes
burned on 2026-08-03): on a day when the build actually succeeded and only the
live check lags, a 429 causes a spurious retry and a wasted production build.
This also matches the standing CLAUDE.md warning that the GitHub deployment
endpoint gives misleading answers under secondary rate limiting (404 there, 429
here) and should not be trusted as a source of build truth.

**Recommended fix**, extending the one you already specified:

1. Your fifteen-liner: before re-triggering, query the deployment *state* for
   TARGET. `CANCELED` retries; `ERROR` does not retry and instead pushes a loud
   "build FAILED, deploy manually" ntfy with the commit and the inspector URL.
2. Additionally, make the pre-check **fail closed**. Have the python emit three
   distinguishable values, `yes` / `no` / `unknown`, and treat `unknown` (any
   HTTP or parse failure, including 429) as "do not retry this tick, try again
   in 10 minutes". A missed retry self-heals on the next tick; a spurious retry
   costs a production build and heals nothing. This is the same fail-closed
   reasoning already applied to `scripts/vercel-ignore.sh`.
3. Prefer the Vercel API over the GitHub deployments endpoint for both
   questions. It answers state directly and is not the endpoint CLAUDE.md
   already warns about.

Per the repo convention this is mini-side and needs its own test before it goes
live.

**Minor, unexplained, low impact.** `$HOME/metro-mini-jobs/.deploy-watch-state`
does not currently exist, although the 16:31Z retry should have written it
(`printf ... > "$STATE"` at line 147 runs immediately before the
`re-triggered build of...` line that is in the log). Nothing in the repo deletes
it, so it was most likely removed by hand while you were investigating last
night. Practical impact is close to nil, since the attempts counter resets on a
new TARGET sha anyway. Worth knowing only because if that file is ever
*unwritable* rather than merely absent, `ATTEMPTS` reads 0 every tick, and both
`MAX_ATTEMPTS` and `COOLDOWN_MIN` stop bounding the retry loop.

### 2. FA WSL is still on the 2025-26 placeholder, and still cannot alert (carried from 09-06)

**Unchanged from yesterday's sweep, re-verified today, no action taken.**
Today's `football-standings` run at 09-07 00:06Z still logs:

```
[wfootball]   FA WSL (id 44): 12 standings rows [2025-26] PLACEHOLDER
```

Read-only api-football check this run confirms the upstream state is identical
to yesterday's:

| season | start | current | coverage.standings | /standings rows |
|---|---|---|---|---|
| 2025 | 2025-09-05 | false | true | (last season) |
| 2026 | 2026-09-04 | **true** | **false** | **0** |

So the 2026-27 season is live upstream and 3 days past kickoff, but the provider
has not enabled standings coverage. The site's labelled 2025-26 fallback is
correct behaviour and will self-clear when coverage flips.

**Why nothing will ever alert.** The `_ratchet_holds` alert fires only on a
*regression*. FA WSL was a declared placeholder before kickoff, so it takes the
`pick_effective` fall-through and no hold is ever recorded. A season can sit on
last year's table indefinitely without anyone being told.

**Recommended fix (unchanged, and now with the field confirmed present).**
`/leagues?id=44` returns `seasons[].start`, verified today as `2026-09-04`.
Compare against it and push one ntfy when a watched season is ~10 days past
kickoff with no standings rows. At 10 days that alert would first fire on
2026-09-14, so there is no urgency this week, but it needs building before the
next league does the same thing quietly.

**Not urgent, do not rush it.** The user-facing page is correct and honest
today. This is about closing a blind spot, not repairing broken output.
