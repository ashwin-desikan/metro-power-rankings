# Moving the scheduled fleet off GitHub Actions onto the Mac mini

Drafted 2026-08-05 (Windows session). **APPROVED the same day: move the four,
keep the rest, watchdog first.** The code is written and self-tested but nothing
is committed, nothing is pushed, no `schedule:` block has been touched and no
workflow has been dispatched. See `HANDOFF.md` (2026-08-05 windows to mini) for
what the mini needs to do, and `mac-mini-jobs/README.md` section 3 for install.

Built under this plan:

    mac-mini-jobs/dispatcher.py                          10-minute tick, 19 self-test cases
    mac-mini-jobs/jobs.toml                              UTC schedule table
    mac-mini-jobs/runners/_common.sh                     sync/guard/commit/ping helpers
    mac-mini-jobs/runners/business-daily.sh
    mac-mini-jobs/runners/forecast.sh
    mac-mini-jobs/runners/predictions.sh
    mac-mini-jobs/runners/mlb-sim.sh
    mac-mini-jobs/com.citizenofnowhere.dispatcher.plist  StartInterval 600
    scripts/ops/staleness_check.py                       watchdog logic, 10 self-test cases
    .github/workflows/staleness-watch.yml                the watchdog itself

## Why this came up

The 3/4/5 Aug "cron no-show" reports were wrong. Measured against the real
Actions API (348 schedule-event runs, 20 Jul to 4 Aug): **every scheduled
workflow fires, and every one of them succeeded. GitHub simply dispatches them
1 to 4 hours after the cron minute.** `created_at == run_started_at` on the late
runs, so the delay is in GitHub's dispatcher, not in job queueing.

| workflow | cron (UTC) | typical actual | lag |
|---|---|---|---|
| majors-ingest | 05:30 | ~07:45 | 2h15 |
| business-daily-refresh | 05:50 | 08:10 | 2h20 |
| anomaly-digest | 06:00 Mon | ~09:55 | 3h55 |
| forecast-weekly | 06:10 M/W/F | ~10:02 | 3h50 |
| predictions-refresh | 06:40 Tue | 09:26 | 2h45 |
| external-url-monitor | 07:30 | ~09:50 | 2h20 |
| wnba-refresh | 08:00 | ~10:25 | 2h25 |
| updates-drift-watcher | 09:00 | ~11:10 | 2h10 |
| cfl-refresh | 12:00 | ~14:20 | 2h20 |
| footy-refresh | 22:00 | ~23:05 | 1h05 |

The 06:00-06:10 UTC band is the worst in the day. 22:00 is the cleanest. Lag is
stable enough day to day to plan around.

## The honest read before we move anything

GitHub's failure mode here is **lateness, not unreliability**. Nothing was
dropped, nothing failed. So the case for the mini is punctuality, control of the
egress IP, and not being at the mercy of someone else's queue. It is not
"GitHub keeps breaking", and the plan should not be justified on that basis,
because the thing we would be trading away is real: GitHub is a second machine.
Right now, if the mini dies, the Actions fleet carries on. After a full
migration, one sleeping mini stops every refresh on the site, silently.

That argues for a migration that keeps GitHub in the picture as a **watchdog and
a manual fallback**, not one that empties it.

## Where the lag actually costs something

| workflow | cron | lag cost | verdict |
|---|---|---|---|
| business-daily-refresh | 05:50 daily | High. Markets/FX carry a visible `as of` date and drive the revalidate ping; the site shows yesterday until ~09:00 UTC | **Move first** |
| mlb-sim-refresh | 09:40 daily (Mar-Nov) | Medium. Playoff odds land ~12:00 instead of ~09:45 | **Move** |
| predictions-refresh | 06:40 Tue, 11:40 Fri | Medium. Fri slot is the NFL freeze; later is worse | **Move** |
| forecast-weekly | 06:10 M/W/F | Low, but it is the worst-lagged job on the board (3h50) | **Move** |
| majors-ingest | 05:30 daily | None. Idempotent ingest, no-op most days | Stay |
| footy-refresh | 22:00 daily | None. Best-lagged slot anyway (1h05) | Stay |
| cfl-refresh | 12:00 daily | None | Stay |
| wnba-refresh | 08:00 daily | None | Stay |
| honours-2026-champions | Wed/Sat 08:10, Aug-Oct | None. Seasonal scraper, no same-day deadline | Stay |
| honours-county-cricket / honours-rugby-league | annual | None | Stay |
| anomaly-digest | 06:00 Mon | None. Weekly digest | Stay |
| external-url-monitor | 07:30 daily | None, and it files GitHub Issues via `secrets.GITHUB_TOKEN` | **Stay (see below)** |
| updates-drift-watcher | 09:00 daily | None, same GITHUB_TOKEN dependency | **Stay (see below)** |

Not cron and therefore not movable at all: `cloudflare-purge.yml` fires on
`deployment_status` from Vercel, and `test.yml` is push CI. Both stay.

**My recommendation: move the four in bold, keep the rest.** That captures every
minute of lag that a human or a reader can actually perceive, costs one evening
of setup, and leaves nine jobs on a second machine as insurance. If you still
want the full sweep, the plan below scales to all fourteen; the only extra work
is a PAT for the two issue-filing monitors.

## The two monitors are a special case

`external-url-monitor` and `updates-drift-watcher` both use the ambient
`secrets.GITHUB_TOKEN` to open GitHub Issues on failure. On the mini that
becomes a personal access token with `issues: write`, stored in `config.env`,
with all the rotation and blast-radius that implies. They are also the two jobs
whose entire purpose is to tell you something else broke. Running your alarms on
the same box as the thing being alarmed about is the classic mistake. Leave them
on GitHub.

## Design: one dispatcher, not fourteen plists

Do not create fourteen `StartCalendarInterval` plists. Two reasons.

1. **DST.** launchd calendar intervals are local time. A plist set to 06:50
   fires at 05:50 UTC in summer and 06:50 UTC in winter. Market data keyed to
   the Asia close silently shifts an hour twice a year.
2. **Missed runs.** launchd fires a missed calendar interval once on wake, but
   not if the machine was powered off across the window. There is no catch-up
   and no record that nothing happened.

Instead: **one launchd job every 10 minutes** running a small Python dispatcher
that owns a table of jobs in UTC plus a `state.json` of last-successful-run
dates. Each tick, it asks "is this job due today in UTC, and has it not run
today?" and if so runs it. That gives UTC correctness, automatic catch-up after
sleep or downtime, one log, one ntfy path, and a job table you edit instead of a
plist you reload.

```
mac-mini-jobs/
  dispatcher.py          # the 10-minute tick
  jobs.toml              # id, utc time, weekdays/months, command, timeout, alert policy
  state.json             # {"business-daily": "2026-08-05", ...}
  runners/
    business-daily.sh    # mirrors business-daily-refresh.yml step for step
    mlb-sim.sh
    predictions.sh
    forecast-weekly.sh
  com.citizenofnowhere.dispatcher.plist   # StartInterval 600
```

Each runner mirrors its workflow exactly, in the same order, with the same
guards, because the guards are the point:

1. self-tests first (`--self-test`), abort the run on failure
2. the refresh script(s)
3. `git add` only the specific data paths, `git diff --cached --quiet` early-exit
4. commit with the skip marker, then the pull-rebase-push retry loop
5. the revalidate ping, fail-open, after the 300s raw-CDN sleep

Do not paraphrase these. Port them literally from the YAML.

## Secrets the mini needs

| secret | needed by |
|---|---|
| `EXCHANGERATE_API_KEY` | business-daily |
| `REVALIDATE_SECRET` | business-daily, forecast-weekly, mlb-sim, predictions |
| `SUPABASE_WRITE_KEY` | majors-ingest, cfl, footy, wnba (only if you move them) |
| `APISPORTS_KEY` | euro-comps, wc2026 (already mini-side) |
| PAT with `issues: write` | only if you move the two monitors |

All into `config.env`, which is already the pattern and already gitignored.
Push access: an SSH deploy key with write, as `README.md` specifies.

## The one-runner rule

`mac-mini-jobs/README.md` already states it and it is non-negotiable: for every
job you move, **comment out the `schedule:` block in the workflow, keeping
`workflow_dispatch`**. That leaves the Action as a one-click manual fallback if
the mini is down, and guarantees you never get two runners racing and producing
duplicate commits. This is exactly how `civic-data-refresh.yml`,
`leaders-refresh.yml` and `billionaires-refresh.yml` are already handled.

## Keep one GitHub job: the dead-man's switch

This is the piece that makes the migration safe, and it does not exist today.

A single new Action, `staleness-watch.yml`, cron `0 */6 * * *` (lag is
irrelevant for a watchdog, which is exactly why GitHub is the right home for
it). It checks the newest commit touching each data path against a per-path
threshold and opens or updates a GitHub Issue when anything is stale:

| path | max age |
|---|---|
| `public/data/business/markets.json` | 30h |
| `public/data/business/fx.json` | 30h |
| `public/data/mlb-sim.json` | 36h (Mar-Nov only) |
| `public/data/pl-sim.json`, `public/data/nfl-sim.json` | 9d |
| `public/data/forecast.json` | 9d |

The last three are change-gated (their jobs commit only when the data actually
moved), so a breach there is a prompt to look, not proof of a fault. Sized so it
takes at least two missed cycles to fire. Thresholds live in
`scripts/ops/staleness_check.py`.

It needs no secrets beyond the ambient `GITHUB_TOKEN` and it catches the exact
failure the migration introduces: the mini quietly not running. Without this,
a mini that sleeps through a weekend produces no error anywhere, and the first
symptom is a stale date on a public page.

## Suggested order

1. Ship `staleness-watch.yml` first, while everything is still on Actions. Prove
   it fires by pointing it at an artificially tight threshold once.
2. Build `dispatcher.py` + `jobs.toml` on the mini with a single job:
   business-daily, `DRY_RUN=1`. Run it by hand, read the diff, confirm the
   self-tests gate and the early-exit both behave.
3. Flip `DRY_RUN=0`. Watch one live run end to end, including
   "Revalidated on attempt 1" in the log and the `as of` date changing on
   `/business/markets`.
4. Only then comment out `schedule:` in `business-daily-refresh.yml` and push
   with the skip marker.
5. Repeat 2-4 for **forecast-weekly first**, then predictions, then mlb-sim, one
   at a time, never two in the same day.

   **Corrected 2026-08-05.** This step originally read "mlb-sim, predictions,
   forecast-weekly", which was wrong, and `jobs.toml` disagreed with it. The
   order is a dependency, not a preference: `scripts/forecast/fetch_data.py`
   touches Wikipedia and parliament.uk only, while `build_mlb_sim.py`,
   `build_nfl_sim.py` and `build_pl_sim.py` all make **required** (`soft=False`)
   calls to `site.api.espn.com` whose failure path is `SystemExit`.

   **Resolved the same evening: all four are movable.** The mini's Akamai 403s
   were a User-Agent problem, not an IP block. Akamai's ESPN edge applies
   different UA policy per PoP, so the same token can 200 from one machine and
   403 from another. Measured on 2026-08-05 across three vantages, the only
   shape that passed everywhere is a plain library token, so the three scripts
   now send no `User-Agent` and inherit urllib's own. The full matrix lives in
   `build_mlb_sim.py`'s `fetch_json` docstring, which is the one place to
   update if any of this changes.

   Regression evidence for the change: `build_mlb_sim.py` rebuilt locally with
   the new UA produced a file **byte-identical** to the one the Action's 11:39Z
   run produced with the old one (`git diff` empty), with the `verify_wins()`
   gate green at 30/30. Self-tests 30/17/14 across the three scripts.

   Still keep forecast first. It is the only one of the four with no ESPN
   exposure at all, which makes it the cleanest proof of the mini pattern.
6. Decide about the remaining nine once the pattern has run clean for a week.

## Also found while looking

- Four workflows read `disabled_manually` on GitHub: `billionaires-refresh`,
  `civic-data-refresh`, `daily-rebuild`, `leaders-refresh`. Expected, since the
  mini owns those, but worth confirming the mini really is running them.
- The working tree holds an **uncommitted ESPN bundle migration**:
  `.github/workflows/espn-standings-snapshot.yml` (cron `25 */3 * * *`,
  untracked), `lib/espnFetch.ts`, `scripts/espn/`,
  `public/data/espn-snapshots/`, plus edits to all seven standings libs. That is
  the fix for the 4 Aug night outage, half-built and unpushed. It should be
  finished or discarded before it rots, and if it ships it is a fifteenth
  scheduled job that should go straight onto the mini pattern rather than onto
  Actions.

  **Shipped 2026-08-05 (`464212184`, then `e2801ca8b`), onto Actions, and the
  recommendation above is now reversed: it should STAY on Actions.** Two
  reasons. It is the fallback generator for the case where ESPN is unreachable
  from Vercel, so hosting it on the mini collapses two independent failure
  domains into one, and a sleeping mini plus an ESPN block would take the
  standings down with nothing left to serve. And the mini itself started getting
  Akamai 403s from `site.api.espn.com` the same day, so depending on the UA test
  in HANDOFF.md it may be physically unable to generate the snapshot at all.
  Measured lag on its first two runs was +2h08 and +2h15 against a 3h cadence,
  which is real but invisible: standings do not move fast enough for a ~5h
  worst-case snapshot age to matter, and the repo is public so the Actions
  minutes are free.
