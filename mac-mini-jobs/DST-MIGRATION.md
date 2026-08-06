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
5. Same one-runner discipline as the Actions migration: the plist gets
   `launchctl unload`ed only AFTER the dispatcher has run the job successfully
   once, never before.

Nothing here needs to land in a hurry. The real deadline is 25 October, and the
useful sequencing is to get step 2 in early so the rest is mechanical.

## What would happen if we did nothing

Not an outage. On 26 October every job in the table above starts running an hour
later in UTC than it does today, permanently until March. For most of them that
is invisible. The ones where it is not are `euro-comps` and
`football-standings`, whose 04:00/05:00 and 05:00/06:00 pairs were chosen to
land after overnight fixture settlement, and `screen-number-ones`, whose 22:00
slot is close enough to midnight that a shift pushes it into the next UTC day
and could double-count or skip a chart day. Those three are the ones worth
moving even if the rest slips.
