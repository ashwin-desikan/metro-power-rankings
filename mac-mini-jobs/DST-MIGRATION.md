# Folding the legacy launchd jobs into the dispatcher, before 25 October

Drafted 2026-08-06 (Windows session), from the repo only. **Nothing has been
changed on the mini and no plist has been touched.** This is the inventory, the
four blockers I found, and the decisions needed. Read it with
`GITHUB-TO-MINI-MIGRATION.md`, which covers the separate Actions-to-mini thread.

## Why this has a deadline

UK clocks go back **Sunday 25 October 2026**. Every `StartCalendarInterval`
plist is expressed in LOCAL time, so on that morning every one of these jobs
moves an hour later in UTC than it runs today. `dispatcher.plist`'s own comment
already explains why that is the wrong default for anything keyed to a market or
fixture clock, and `jobs.toml`'s header says the same. The four jobs that have
moved to the dispatcher are immune. These are not.

Two other launchd properties bite alongside it: a calendar interval that was
missed because the machine was asleep or off fires at most once on wake, with no
catch-up and no record that nothing happened.

## The reframe: this is not "move everything"

Local time is the CORRECT semantic for anything human-facing. A newsletter that
drops at 08:00 for a reader should keep dropping at 08:00 when the clocks
change, and for that job a launchd calendar interval is the right tool and the
dispatcher would be the wrong one.

So the rule is: **move the jobs whose slot was chosen against an external clock
(markets, fixtures, upstream publication); leave the jobs whose slot was chosen
against a human's morning.** By that test everything below except the three
newsletter jobs should move.

## Scope

23 plists on disk. 4 already use `StartInterval` and are DST-immune
(`dispatcher`, `deploy-watch`, `f1-weekly`, `heartbeat`). 2 are stale duplicates
(see blocker D). That leaves **17 live calendar jobs**, of which 3 are the
newsletter set that should stay on launchd.

**14 jobs to move.**

## STATUS: blockers A, B, C and the fifth one are DONE (2026-08-06)

`dispatcher.py` now supports `times`, `days`, `args` and `hc_slug`, plus a
`validate_jobs()` pass that turns a malformed `jobs.toml` into a hard startup
failure instead of a silently skipped job. Self-tests went 19 to **51 cases,
all passing**, with the original 19 unchanged. **No job uses any of it yet, so
this changed nothing operationally.** Blocker D is confirmed by the mini and
the two stale files are deleted in the same commit.

What that leaves is step 3 onwards below: move jobs one at a time. The
sections that follow are kept as the record of why each key exists.

## Four blockers, all in the dispatcher rather than in the schedule

These are why this is a small feature, not a data-entry exercise. None of them
showed up when the first four jobs moved, because those four happened to be the
easy shape.

**A. `jobs.toml` allows one time per job.** `dispatcher.py:65` does
`hh, mm = (int(x) for x in job["time"].split(":"))`. Four jobs have more than
one slot: `euro-comps` (2), `football-standings` (2), `gap-league-watch` (2) and
`screen-number-ones` (9, being 06/14/22 on Mon, Tue and Wed). Either add a
`times = ["04:00", "05:00"]` list, or emit one job row per slot with suffixed
ids. A `times` list is cleaner and keeps `state.json` keyed per job per slot.

**B. `command` cannot carry arguments.** `dispatcher.py:170-175` reads
`cmd = job["command"]` and then runs `subprocess.run(["/bin/bash", str(path)])`,
a bare path with no argv. Four jobs are the SAME script distinguished only by an
argument:

    run-scraper-refresh.sh conflicts     (conflicts-monthly)
    run-scraper-refresh.sh fiba          (fiba-weekly)
    run-scraper-refresh.sh rugby         (rugby-weekly)
    run-scraper-refresh.sh substack      (substack-daily)

As it stands those four cannot be expressed at all. Needs `command` to accept a
list, or an `args = [...]` key.

**C. Migrating as-is silently drops the healthchecks.io tiles.** Every legacy
plist wraps its real command in `hc-run.sh <slug> <command...>`, which pings
`hc-ping.com` start/success/fail and gives a per-job remote green/red dashboard
with no login. The dispatcher does not use it: it alerts through `notify.py`
(ntfy/pushover) instead. Moving a job without thinking about this trades a
per-job tile for a per-fleet notification. Options: have the dispatcher wrap
every command in `hc-run.sh` using the job id as the slug (my preference, it is
one line and preserves the existing slugs), or add an optional `hc_slug` key,
or accept the loss deliberately and write it down.

**D. Two stale duplicate plists.** `com.citizenofnowhere.egress-refresh.plist`
and `com.citizenofnowhere.feed-monitor.plist` exist BOTH at `mac-mini-jobs/`
root and in `mac-mini-jobs/launchd/`, and they are NOT identical. The root
copies are the older pre-healthchecks templates, still carrying
`<!-- EDIT this path to where you copied the folder on the mini -->` and no
`hc-run.sh` wrapper. The `launchd/` copies are hc-wrapped and
`launchctl`-normalised (tab-indented, keys alphabetised), i.e. they are what is
actually installed. **Recommend deleting the two root copies**, but the mini
should confirm against `~/Library/LaunchAgents/` first. Until then, two files
claim to configure the same label and a future reader can pick the wrong one.

## Inventory and proposed UTC slots

Default rule: **preserve the current effective UTC time**, i.e. subtract one
hour from the local slot. These jobs have run at that UTC time all summer, so
any downstream expectation is already calibrated to it, and it is the reading
that keeps behaviour identical on 26 October rather than changing it.

`hc slug` is the existing healthchecks slug, which should carry over per
blocker C.

| job id | script (+arg) | local now | proposed UTC | filter | hc slug |
|---|---|---|---|---|---|
| activity-feed | run-activity-feed.sh | 03:30 | **02:30** | daily | activity-feed |
| substack-daily | run-scraper-refresh.sh substack | 07:00 | **06:00** | daily | substack-daily |
| feed-monitor | feed_shape_monitor.py | 08:20 | **07:20** | daily | feed-monitor |
| euro-comps | run-euro-comps.sh | 04:00, 05:00 | **03:00, 04:00** | daily | euro-comps |
| football-standings | run-football-standings.sh | 05:00, 06:00 | **04:00, 05:00** | daily | football-standings |
| gap-league-watch | run-gap-league-watch.sh | 05:00, 06:00 | **04:00, 05:00** | daily | gap-league-watch |
| screen-number-ones | run-screen-number-ones.sh | 06:00, 14:00, 22:00 | **05:00, 13:00, 21:00** | Mon/Tue/Wed | screen-number-ones |
| rugby-weekly | run-scraper-refresh.sh rugby | Tue 08:05 | **Tue 07:05** | weekdays [2] | rugby-weekly |
| cricket-weekly | run-cricket-weekly.sh | Tue 10:00 | **Tue 09:00** | weekdays [2] | cricket-weekly |
| fiba-weekly | run-scraper-refresh.sh fiba | Wed 08:10 | **Wed 07:10** | weekdays [3] | fiba-weekly |
| sound-weekly | run-sound-weekly.sh | Wed 08:30 | **Wed 07:30** | weekdays [3] | sound-weekly |
| egress-refresh | metro-mini-refresh.sh | Sun 10:00 | **Sun 09:00** | weekdays [7] | egress-refresh |
| conflicts-monthly | run-scraper-refresh.sh conflicts | 1st 08:15 | **1st 07:15** | day-of-month 1 | conflicts-monthly |
| cricket-monthly | run-cricket-monthly.sh | 1st 11:00 | **1st 10:00** | day-of-month 1 | cricket-monthly |

**Not moving, deliberately.** The three newsletter jobs
(`com.newsletter.daily` 08:00, `com.newsletter.watchdog` 09:30,
`com.newsletter.weekly` Sun 09:00) are human-facing publication times, so local
time is the semantic they want. They also live in `~/newsletter-podcast/`, which
is explicitly not in this repo, so the dispatcher would be reaching outside its
own tree. Leave them on launchd and note in their plists that this is a choice,
not an oversight.

**Already immune, no action:** `dispatcher` (600s), `deploy-watch` (600s),
`heartbeat` (900s), `f1-weekly` (3600s).

## A fifth thing the schema does not express

`conflicts-monthly` and `cricket-monthly` fire on the **1st of the month**.
`jobs.toml` supports `weekdays` and `months`, but there is no day-of-month
filter, and `decide()` only handles weekday and month. So monthly jobs need a
`days = [1]` key too, or they cannot move either. That makes it three schema
additions in total: `times`, `args`, `days` (plus the `hc-run.sh` wrap).

## Suggested order

1. **Mini confirms blocker D** against `~/Library/LaunchAgents/`, and confirms
   the four `run-scraper-refresh.sh` arguments are the whole story (that script
   may take more than the one positional).
2. **Add the schema support first, with self-tests, and no jobs using it.**
   `times`, `args`, `days`, and the `hc-run.sh` wrap. `dispatcher.py` already
   has 19 self-test cases; these want cases of their own before anything real
   depends on them. This step changes nothing operationally.
3. **Move the simplest single-slot daily job first** to prove the wrap and the
   hc tile survive end to end. `activity-feed` is the best candidate: daily,
   single slot, no argument, and low blast radius if it misfires.
4. Then the rest in increasing awkwardness: single-slot weeklies, then the
   argument jobs, then multi-slot, then the two monthlies.
5. **Corrected 2026-08-06: the one-runner discipline here is NOT the Actions
   one.** For the Actions migration, letting both runners live briefly is the
   safe failure, and business-daily proved it on 5 Aug: the Action fired at
   08:09 and the mini at 08:46, harmlessly, because GitHub's 1-4h dispatch lag
   separates them in practice. That does not carry over. Here BOTH runners are
   the mini, and both fire at the same UTC minute, so an overlap is a genuine
   race: two copies of the same script running `git pull` / `commit` / `push`
   against one working tree, with the dispatcher's lock file offering no
   protection because it only guards against overlapping *ticks*.

   So for each legacy job: DRY_RUN, then a real hand-run to prove the
   invocation, then **uncomment the `jobs.toml` row and `launchctl unload` the
   plist in the SAME sitting**. Never leave both loaded overnight.

## Two more things found while drafting the first move (2026-08-06)

**Sixth blocker, now fixed: the mini keeps jobs in two places.** Most legacy
jobs run from `~/metro-mini-jobs/`, but four run straight out of the repo
checkout at `$HOME/Projects/Metro Area Project/mac-mini-jobs/`:
`activity-feed`, `football-standings`, `gap-league-watch` and
`screen-number-ones` (plus `deploy-watch`, which is `StartInterval` and not
moving). Their plists write that as `$HOME/...`, which is **not**
`os.path.isabs`, so the dispatcher would have silently resolved it under
`HERE` and the job would never have started. `build_argv()` now expands `~`
and `$VARS` before the absolute test. Note the repo path contains spaces,
which is safe because argv is a list, and is the reason it must never be
flattened into a shell string. Self-test cases pin all of that.

This is exactly what "move the simplest job first" is for: the sixth blocker
was invisible until the first row was actually drafted.

**`activity-feed` is drafted and commented in `jobs.toml`**, with its slot
(02:30 UTC, preserving today's effective time), its `hc_slug`, and notes for
whoever flips it.

Nothing here needs to land in a hurry. The real deadline is 25 October, and the
useful sequencing is to get step 2 in early so the rest is mechanical.

## The decided order for the remaining 13 (2026-08-06)

The mini asked for a call on ordering. The principle: **prove one unexercised
mechanism at a time, on the fastest-feedback job that uses it**, so a mistake
shows up the next morning rather than next month. Once a mechanism is proven,
every other job using it is mechanical and can move in a batch.

| # | job(s) | proves | feedback | UTC slot(s) |
|---|---|---|---|---|
| ✅ | activity-feed | `hc_slug`, `$HOME` expansion | next day | 02:30 |
| 1 | substack-daily | **`args`** | next day | 06:00 |
| 2 | euro-comps | **`times`** (2 slots) | next day | 03:00, 04:00 |
| 3 | football-standings, gap-league-watch | nothing new | next day | 04:00, 05:00 each |
| 4 | screen-number-ones | `times` at scale (9 slots) | next day | 05:00, 13:00, 21:00 Mon-Wed |
| 5 | cricket-weekly, rugby-weekly, fiba-weekly, sound-weekly | nothing new | weekly | Tue 09:00, Tue 07:05, Wed 07:10, Wed 07:30 |
| 6 | conflicts-monthly, cricket-monthly | **`days`** | monthly | 1st 07:15, 1st 10:00 |
| 7 | feed-monitor | needs a wrapper first | next day | 07:20 |
| 8 | egress-refresh | nothing new | weekly | Sun 09:00 |

Three notes on why the tail is ordered that way.

**Batch 6 has a deadline inside the deadline.** Monthly jobs only get an
unattended run on the 1st, so to get any real-world proof before 25 October
they must be flipped by **late August** (proving on 1 September, with 1 October
as the second chance). Left to last they would go into the clock change never
having fired from the dispatcher.

**Batch 7 needs code first.** `feed-monitor` is the only one of the fourteen
that is not a plain script: its plist runs an inline `bash -lc` string that
sources `config.env` and then execs `${PYTHON_BIN:-python3}` against
`feed_shape_monitor.py`. The dispatcher runs `/bin/bash <path> [args]`, so this
needs a small `run-feed-monitor.sh` wrapper in the repo, matching the existing
`run-*.sh` convention, before its row can be written. Every other job checked
clean on this.

**Batch 8 is last on purpose.** `egress-refresh` has an unexplained exit 126
from 2 August and has not run since. Migrating a job whose current health is
unknown means debugging two variables at once if it fails. Let Sunday 9 August
settle whether it is healthy first.

## 🔴 MAJOR CORRECTION (2026-08-06): three jobs already solved DST, and one has been running a quarter as often as it should

Found while drafting batch 3, off the back of the mini's euro-comps guard
discovery. Three of the legacy runners carry their own **internal UTC guard**:

    run-euro-comps.sh          runs only when `date -u +%H` == 04
    run-gap-league-watch.sh    runs only when `date -u +%H` == 05
    run-football-standings.sh  runs only when the UTC hour is in {05, 11, 17, 23}

Their plists bracket a pair of LOCAL hours on purpose, and the guard picks
whichever firing is the intended UTC hour. That is a deliberate, working
DST-proofing trick, documented in each script's header. It means **the paired
slots were never two runs a day — they are one run, fired twice and filtered.**

Three things follow, and two of them contradict what this document said.

**1. My proposed slots for those three were wrong.** I derived them by
subtracting an hour from each local time, which produced a spurious extra slot:

    job                  I proposed              correct
    euro-comps           times 03:00, 04:00      time 04:00
    gap-league-watch     times 04:00, 05:00      time 05:00
    football-standings   times 04:00, 05:00      see item 3

euro-comps went live with the redundant pair before this was understood. It is
harmless — the 03:00 firing hits the guard and exits 0 — but it should be
simplified to a single 04:00 row.

**2. The "urgency" framing in this document was overstated.** The three jobs I
named as most at risk from the clock change are precisely the three that had
already solved it. Re-checking every job: on 26 October the guarded three keep
running at exactly the same UTC time, and of the unguarded ones an hour's shift
is invisible in every case I can find. `screen-number-ones` at local 22:00 goes
from 21:00 to 22:00 UTC, which does not cross midnight, so the double-count
worry I raised was also wrong.

**The migration is still worth doing, but not primarily for DST.** The real
case is the one `dispatcher.plist` makes: catch-up after sleep or downtime, a
recorded MISSED instead of silence, one log and one alert path, and a job table
you edit instead of a plist you reload. Those hold regardless of the date. This
document should not have led with a deadline that three jobs had already
defused.

**3. `run-football-standings.sh` is running once a day when it is meant to run
four times.** Its header says "Scheduled 4x/day at 05:00, 11:00, 17:00, 23:00
UTC" and its guard allows all four. But its plist only fires at local 05:00 and
06:00, so the only UTC hour it can ever reach is **05:00**. The 11:00, 17:00 and
23:00 runs have never happened.

That is a live production gap, not a migration concern: the site's football
standings and continental fixtures refresh once a day rather than four times.
The migration is the natural place to fix it, but it is a real decision rather
than a mechanical port, because api-football has request quotas and the header's
own note about "spread the api-football load" suggests the 4x cadence was costed
deliberately. Either restore the documented intent with
`times = ["05:00", "11:00", "17:00", "23:00"]`, or accept 1x/day as the real
behaviour and correct the header and guard to match. ~~Needs Ashwin's call.~~

**DECIDED 2026-08-06 (Ashwin): restore the documented 4x/day.** The row is
drafted in `jobs.toml` accordingly. This is the one migration row that is not a
like-for-like port, so it carries its own risk note: it quadruples this job's
api-football usage. Watch for 429s or quota warnings in the first few days after
the flip, and if they appear step down to `["05:00", "17:00"]` rather than
reverting all the way to one run a day.

## Delete the guards as each job migrates

Once a job is on the dispatcher the guard is not just redundant, it is a second
and invisible schedule. Change a slot in `jobs.toml` without changing the guard
and the job silently stops doing anything, exit 0, healthchecks green. That is
the failure mode this whole system exists to prevent, reintroduced by a leftover.

So for each guarded job: set the `jobs.toml` slot to the guard's UTC hour, then
**delete the guard** and update the header. `FORCE_RUN` goes with it; a manual
run should just run. The dispatcher already guarantees UTC, which is the only
thing the guard was ever for.

## What would happen if we did nothing

**Superseded by the correction above — the original text is kept here struck
through, because being wrong in a specific way is worth remembering.**

> ~~The ones where it is not are `euro-comps` and `football-standings`, whose
> pairs were chosen to land after overnight fixture settlement, and
> `screen-number-ones`, whose 22:00 slot is close enough to midnight that a
> shift pushes it into the next UTC day.~~

All three of those are wrong. The two pairs are a DST-proofing bracket rather
than two meaningful runs, so those jobs do not move at all on 26 October, and
`screen-number-ones` shifts 21:00 to 22:00 UTC, which crosses nothing.

The honest version: **doing nothing costs very little.** The guarded jobs are
already correct year-round. The unguarded ones shift by an hour into times that
are, as far as I can tell from each script's purpose, equally fine. Nothing here
is an outage and nothing is even clearly degraded.

What doing nothing does cost is everything the dispatcher gives you that launchd
does not, and none of it is seasonal: a job missed because the mini was asleep
is re-run rather than skipped, a job missed entirely is recorded and alerted
rather than passing in silence, there is one log and one alert path instead of
seventeen, and adding or retiming a job is a table edit rather than a new plist
and a `launchctl` reload. That is the case for finishing this. The clock change
is a convenient forcing date, not the reason.
