# Daily Ops Sweep -- 2026-09-25

Window: 2026-09-23T23:06:44Z to 2026-09-25T01:06:27Z (trailing 26h), read from
`~/metro-mini-jobs/dispatcher.log` selected on each line's own UTC timestamp.
Read-only run: nothing was fixed, re-run, pinged or written except this file.
(One exception worth declaring: I ran `git fetch origin`, which updates
remote-tracking refs only and touched neither the working tree nor the remote.)

## Jobs this window: 176 ok, 8 failed, 3 flagged

184 dispatcher runs across 16 distinct jobs, plus one run outside the
dispatcher. 7 dispatcher runs failed, all of them from a single cause, plus
1 failure from a second launchd copy of `football-standings`. No MISSED slots.
The 184th run is this sweep.

| Job | Runs | Result |
|---|---|---|
| deploy-watch | 148 | all ok, `5e7377c43` live and serving since 00:46Z |
| ops-autofix | 13 | all exit 0; stood down 00:15Z to 06:15Z on the dirty tree, clean since 08:15Z |
| football-standings | 5 | 3 ok, **2 FAIL** (09-23 23:07Z, 05:09Z), both the git block |
| claude-auth-canary | 4 | ok, refresh token valid to 2026-10-08 (13.1 days) |
| mlb-sim | 2 | ok (464s, 478s) |
| daily-ops-sweep | 2 | 1 ok (517s), 1 in flight (this run) |
| activity-feed, business-daily, euro-comps, gap-league-watch, substack-daily | 1 each | **all 5 FAIL**, the git block |
| cricket-champions, feed-monitor, git-maintenance, nfl-elo, notion-reconcile-verify | 1 each | ok |
| football-standings (launchd copy) | n/a | **1 FAIL** 17:01:58Z, lost a push race |

Also checked and clean, so it is on the record as looked at rather than
assumed: feed-monitor's 09-24 sweep returned ok on 17 of 18 probes, the
exception being `empty:ESPN PGA scoreboard`, which I verified is correct rather
than a fault (see below). newsletter-podcast ran its single 08:00 local slot on
09-24, 40 items kept of 54, both Gmail drafts created; it runs once a day, not
twice. The f1-weekly launchd poller is healthy (hourly `idle: 2026 R14 already
synced`). No job script fired an in-script `push()` state-change alert this
window: gap-league-watch reported no transitions (ISL, CONCACAF CL and OFC CL
all still `awaiting_target`), screen-number-ones found no weekly change,
substack found no new slugs.

**On the PGA probe.** It has read `empty` on and off since 09-02 and it did
again on 09-24 with `Presidents Cup: not started (2 in field)`. I checked the
real-world fact rather than assuming the usual between-tournaments state: the
2026 Presidents Cup runs **September 24 to 27 at Medinah Country Club**, and
the 09-24 probe fired at 08:42 local (02:42 CDT), before round 1 teed off. The
reading was correct. 🔴 It stops being correct today: if the 07:20Z probe on
09-25 or later this weekend still reads `empty`, that IS a fault, because the
tournament is live. Worth a glance at tomorrow's sweep rather than pattern
matching on "PGA empty is normal".

## Self-healed (informational only, no action needed)

**All 7 dispatcher failures share one cause and were fully recovered on 09-24
morning.** An uncommitted `lib/releases.ts` sat in the mini's working tree from
before 23:07Z on 09-23. Every job that fast-forwards the repo died in its git
preamble (`error: Your local changes to the following files would be
overwritten by merge`). Casualties in this window, in order: football-standings
23:07Z, activity-feed 02:38Z, euro-comps 04:08Z, gap-league-watch 05:09Z,
football-standings 05:09Z, business-daily 05:59Z, substack-daily 06:09Z. The
previous sweep reported this blocker at 01:17Z while it was live.

Resolution, from the log and from git: commit `0738bd796` ("Release notes:
amend 2026-09-23 to cover the security hardening") landed 06:39Z and cleared
the tree. Between 06:46Z and 07:19Z the eight failed slots were flipped with
`--mark-ok`. **`--mark-ok` only flips a status flag, it does not run the job**,
so I checked each one separately to confirm the day's work actually happened,
rather than trusting the green status:

- **activity-feed**: commit `f7a922ddc` at 06:46Z; `activity-feed.json` carries
  `generatedAt: 2026-09-24`. Ran.
- **business-daily**: commit `ff5d25ff0` at 06:46Z; `markets.json` meta reads
  `generated_at 2026-09-24T06:46:33Z`, `as_of 2026-09-24`. Ran. This is the one
  with reader-visible staleness, and it is current.
- **euro-comps**: hand-run 07:52:48 local, 30 fixtures across 3 competitions,
  committed and pushed.
- **gap-league-watch**: hand-run 07:54:31 local, self-test OK, 3 leagues
  checked, no transitions.
- **screen-number-ones**: hand-run 07:54:34 local, 4,190 weeks / 2,025 films,
  no weekly change so nothing to commit.
- **substack-daily**: hand-run 08:02:57 local, 20 live posts, no new slugs,
  committed and pushed.
- **cricket-champions**: its 09-23 22:37Z failure healed on its own next daily
  slot, `DONE ok 12s` at 09-24 22:33Z.

I confirmed these second runs were hand-run and not a second scheduler: none of
the four jobs' launchd calendars land anywhere near 07:52 to 08:02 local. So
nothing was lost and no re-run is owed.

**football-standings' launchd race, 17:01:58Z, already fixed the same evening.**
Two copies of the job ran four seconds apart; one pushed, the other lost the
push, failed its rebase and alerted. A session retired
`com.citizenofnowhere.football-standings` to `~/Library/LaunchAgents/retired/`
that evening and wrote it up in HANDOFF section AY. Verified fixed: the 09-24
log shows 9 starts, five of them exactly on the hour (the launchd copy); the
09-25 log shows exactly 1.

## Needs Ashwin's attention

### 1. The build cap is still inactive, and 09-24 spent 8 paid production builds against a budget of 2

**What happened.** 2026-09-24 UTC ran **8 paid production builds**, all READY,
zero ERROR. In order: `0738bd796`, `951f230e0`, `572f3c079`, `317328155`,
`ad3172ac7`, `ebd7e3d23`, `6d98ce3b1`, `b245c6f5b`. Today (09-25 UTC) stands at
**1** so far (`5e7377c43`). This is the sixth overage.

**Root cause, measured rather than inferred.** `scripts/vercel-ignore.sh` needs
`VERCEL_BUILD_CAP_TOKEN` in the project's build environment to ask the API how
many builds today has already started. It is absent. I pulled the build log of
`b245c6f5b` (the day's sixth paid build, `dpl_6ZUCZj2izwNDECdyw9oujYw7D25o`)
and it prints, verbatim:

```
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
vercel-ignore: build-relevant change in 6d98ce3b1..b245c6f5b; building
```

So the cap did not decline to fire, it was never armed. `MAX_DAILY_BUILDS` is
still 2 and the code is correct; only the token is missing. The token is also
not in `~/metro-mini-jobs/config.env` (that is the wrong place for it anyway,
the build reads its own environment). I could not read the project's env vars
to confirm from the other side: the MCP token gets `403 forbidden` on
`projectEnvVars`.

**Evidence.** Vercel API `list_deployments` for `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`,
production target, counted by UTC day, paid states only (READY, ERROR,
BUILDING, QUEUED, INITIALIZING; CANCELED excluded as free). Build log via
`list_deployment_events` on `bld_764rfivvl`.

**Recommended fix.** Mint a Vercel read token and add it to the
metro-power-rankings project as `VERCEL_BUILD_CAP_TOKEN`, scoped to Production
(and Preview if you want the same protection there). Nothing in the repo needs
to change; the next build will print the count instead of the "inactive" line,
and that line is how you confirm it took. This has been the standing P0 across
at least the last three sweeps and it is the single change that converts the
budget from a promise back into code, which is what
`feedback_vercel_guardrail_must_be_infra_not_memory` already rules it must be.
Note that 09-24's eight were legitimate shipping work (the Fan Attention Index
wave), not a guard bug, so the cap would have *deferred* six of them rather
than prevented anything; `[deploy-now]` on the subject is the override for the
ones that genuinely could not wait.

### 2. `run-activity-feed.sh`'s `--autostash` turned a recoverable dirty tree into an unresolved merge conflict, and left it that way

**What happened.** This is the part of the outage that was avoidable, and it is
a code defect rather than a housekeeping miss. Until 02:38Z the repo was merely
*dirty*: jobs failed with "your local changes would be overwritten", which any
commit or stash clears. At 02:38:01Z `run-activity-feed.sh` ran:

```
git pull --rebase --autostash -q origin main
```

The autostash stashed `lib/releases.ts`, the rebase succeeded, and **re-applying
the autostash conflicted**. dispatcher.log records the exact sequence:

```
| Created autostash: 7dcb4fc1d
| wrote .../public/data/activity-feed.json  (600 entries)
| U	lib/releases.ts
| commit failed
! error: Committing is not possible because you have unmerged files.
```

The script's `||` guard caught the failed commit and exited 1, but it never
cleaned up the index it had just broken. From that moment every other job hit
the strictly worse `Merging is not possible because you have unmerged files.
fatal: Exiting because of an unresolved conflict`, which is what euro-comps,
gap-league-watch, football-standings, business-daily and substack-daily all
died on for the next 3.5 hours. `export_schedule.py` warned on every dispatcher
tick across the whole 7 hours.

**Why nothing self-healed.** `run-ops-autofix.sh` behaved exactly as designed
and that is the trap: `working_tree_dirty` is a [blocker], so it logged
`STOP: uncommitted changes in the repo. Refusing to act around a human's work.`
on all four stand-down runs and never touched anything. Its stand-down dedupe
("same stand-down as the last run -- not re-notifying") then kept it quiet
while its finding count grew from 5 to 11. Green tile, quiet topic, disabled
safety net. The previous sweep raised this half; the new half is that a job
script actively deepened the damage.

**Recommended fix**, smallest reversible change at the point that owns the
problem. In `mac-mini-jobs/run-activity-feed.sh`, replace the bare pull with
one that cannot leave a conflicted index behind:

```bash
if ! git pull --rebase --autostash -q origin main; then
  git rebase --abort 2>/dev/null || true
  git merge --abort 2>/dev/null || true
  echo "git pull failed; tree left as found"; exit 1
fi
# and after the commit step, on failure:
#   git reset -q && git checkout -q -- lib/releases.ts 2>/dev/null || true
```

The principle worth applying beyond this one script: **a job that fails must
leave the repo no worse than it found it**, because fourteen other jobs share
this clone. `mac-mini-jobs/runners/*.sh` get this right through `_common.sh`'s
`mini_sync`, which is why business-daily printed a clean "resolve by hand" and
stopped. The top-level `run-*.sh` scripts do not source `_common.sh` at all,
and `run-activity-feed.sh` is the only one of them that uses `--autostash`.
Moving it onto `_common.sh` would fix the class rather than the instance.

**Also worth knowing:** the autostash commit `7dcb4fc1d` still exists as a
dangling object. If anything from that editing session looks missing,
`git show 7dcb4fc1d` has it. It will be pruned by the next `git gc`.

### 3. HANDOFF section AY's "all fifteen collide on 25 October" is not supported by the evidence, and the fourteen agents are dormant rather than double-running

**Why I am raising this.** AY (09-24) is an excellent catch and its core fact is
right: fourteen `com.citizenofnowhere.*` launchd agents are still loaded that
`jobs.toml` lines 214 to 227 record as "Plist unloaded." I re-verified today and
the count is unchanged: 17 loaded, of which `dispatcher`, `f1-weekly` and
`heartbeat` are legitimately launchd-owned, leaving 14. None is disabled
(`launchctl print-disabled` lists none), all show last exit status 0.

**But the risk model attached to them is wrong, and acting on it would be
wasted urgency.** AY explains that the fourteen currently miss their dispatcher
slots because "the plists use LOCAL calendar times and the dispatcher uses UTC,
so under BST they miss each other by an hour", predicting that all fifteen
collide when BST ends on 2026-10-25. Two pieces of evidence contradict that:

- **The offset does not actually save euro-comps or gap-league-watch.** Their
  plists list BOTH hours of each slot, exactly like football-standings did:
  euro-comps fires at 04:00 and 05:00 local, gap-league-watch at 05:00 and
  06:00. Under BST, euro-comps' 05:00 local IS its dispatcher slot of 04:00Z,
  and gap-league-watch's 06:00 local IS its 05:00Z slot. If these agents were
  live they would have been colliding every single day already. They are not.
- **Thirteen of the fourteen have not executed since early August.** Their
  launchd stdout files stopped dead the week each job moved to the dispatcher
  and have not been written since:

  | agent | `launchd-<slug>.out` last written |
  |---|---|
  | conflicts-monthly, cricket-monthly | 2026-08-01 |
  | cricket-weekly, rugby-weekly | 2026-08-04 |
  | fiba-weekly, sound-weekly | 2026-08-05 |
  | euro-comps, substack-daily | 2026-08-06 |

  And the per-job daily logs agree: euro-comps and gap-league-watch show
  exactly **one** start per day on 09-18 through 09-23, the dispatcher's.
  By contrast football-standings, the one that genuinely was double-firing,
  shows **9** starts on 09-24, five of them exactly on the hour.

**So the real situation is:** football-standings was the only live duplicate,
and it is already retired. The other fourteen are registered-but-dormant, which
is untidy and genuinely worth cleaning up, but is not a dated emergency.

**Recommended action.** Still unload them, because a dormant registered agent is
a thing that can wake up on a reboot or a re-login and nobody would expect it,
and because `jobs.toml` should stop lying about it. The commands are the ones
AY lists (`launchctl bootout gui/$(id -u)/com.citizenofnowhere.<slug>`, then
move the plist to `~/Library/LaunchAgents/retired/`). But treat it as hygiene at
your convenience, not as a 25 October deadline. 🔴 Before relying on that
downgrade, it is worth someone establishing *why* they are dormant, because
"loaded, enabled, scheduled, and silently not running" is not a state launchd
is supposed to have, and whatever explains it might also apply to an agent you
do want firing. That question is the one thing here I could not settle
read-only.

### 4. Release notes for 2026-09-25 (heads-up, becomes a hard failure tomorrow)

`npm run check:release-notes` currently returns:

```
WARN: 2026-09-25 has shipped 1 build-relevant commit(s) so far with no entry yet
(newest entry is 2026-09-24).
    Owners: 32 more owner rows from overnight research (16 board teams still pending)
```

Today only warns by design, so nothing is broken. But `5e7377c43` has shipped
since that check ran, so it is two commits now, and from 00:00Z tomorrow this
becomes a hard `npm run verify` failure for every session until an entry
exists. 2026-09-24 is correctly covered, so this is only about today.
Cheapest fix is to fold the entry into whatever commit ships next, since
`lib/releases.ts` is build-relevant and a standalone release-notes commit
spends one of the day's two builds on its own.

**Related, low priority, no action needed today.** The duplicate-09-23 problem
the last sweep flagged is resolved: there is now exactly one 2026-09-23 block.
But the underlying gap it identified is still open. `lib/releases.ts` today
holds 6 blocks dated 2026-05-20, 3 dated 2026-08-11, and 2 each for 2026-05-24
and 2026-05-25, against the "one date block per shipping day" rule. Neither
`check-release-notes.mjs` nor the build-time validator checks date uniqueness,
so these pass everything. Historical and harmless; worth a line in the gate
next time someone is in that file.

## Checked, current, nothing owed

- **Deploy state healthy.** `5e7377c43` built READY and is live and serving.
  deploy-watch made 148 passes with no retrigger and no failure-vs-canceled
  ambiguity.
- **metro-rankings publishes for the first time tomorrow**, Saturday 2026-09-26
  10:30Z, in publish mode (`METRO_RANKINGS_MODE` is unset in `config.env`, so
  the default applies). Its untagged commit IS the week's production build, by
  design. I confirmed the release-notes collision flagged on 09-23 was handled:
  `AUTOMATED_SHIPPING_SUBJECTS` in `scripts/check-release-notes.mjs` now exempts
  `/^rankings: weekly metro recalculation \d{4}-\d{2}-\d{2}\b/`. Its `missed`
  status in `state.json` for the 2026-09-19 slot is the known false-MISSED from
  install day (dispatcher.py has no `first_seen`), not a real skip.
- **owners-weekly** next fires Monday 2026-09-28. Per HANDOFF 2026-09-25, 16
  board teams still have no owner row, so `build-team-owners-data.py` fails
  validation and the job will not commit. Expected, tracked in Notion Backlog,
  no action from this sweep.
- **`notion-reconcile-ping` MISSED** in `state.json` is a retired job, as
  previously established.
- Local clone is 1 commit behind `origin/main` with a clean working tree. Normal
  between jobs; the next `mini_sync` fast-forwards it.

## Caveat on this run

The Notion MCP server is **not authorised in this headless session**, so I could
not cross-check the Backlog, Decisions, Data sources or Scheduled jobs rows, and
could not confirm whether items 1 and 3 above already have rows. Everything in
this report is from the logs, git, the Vercel API, launchd and the filesystem.
If you want the sweep to reconcile against Notion, the server needs authorising
interactively on the mini (`claude mcp` / `/mcp`); a headless run cannot
complete the OAuth flow.
