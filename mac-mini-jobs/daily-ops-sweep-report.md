# Daily Ops Sweep -- 2026-08-31

Window: 2026-08-30T06:13Z -> 2026-08-31T08:18Z (trailing 26h, selected on each
line's own UTC timestamp). Read-only run: nothing was re-run, fixed, pinged or
written except this file.

## Jobs this window: 17 ok, 4 failed, 3 flagged

21 dispatcher occurrences:

| When (UTC) | Job | Result |
|---|---|---|
| 08-30 06:16 | substack-daily | DONE 4s |
| 08-30 07:06 | mlb-sim | DONE 1822s |
| 08-30 07:46 | feed-monitor | DONE 16s |
| 08-30 09:07 | egress-refresh | **FAIL** exit 1, 1852s |
| 08-30 11:08 | football-standings | DONE 75s |
| 08-30 11:29 | daily-ops-sweep | **FAIL** timeout 15m |
| 08-30 14:34 | mlb-sim | DONE 1820s |
| 08-30 17:05 | football-standings | **FAIL** exit 1, 2s |
| 08-30 23:05 | football-standings | DONE 83s |
| 08-30 23:47 | cfb-sun | **FAIL** exit 1, 602s |
| 08-31 01:07 | daily-ops-sweep | DONE 535s |
| 08-31 02:36 | activity-feed | DONE 5s |
| 08-31 04:06 | euro-comps | DONE 4s |
| 08-31 05:06 | gap-league-watch | DONE 3s |
| 08-31 05:06 | football-standings | DONE 81s |
| 08-31 05:07 | screen-number-ones | DONE 22s |
| 08-31 05:58 | business-daily | DONE 617s |
| 08-31 06:18 | forecast | DONE 607s (**flagged** -- ran the stale runner, see #1) |
| 08-31 06:28 | substack-daily | DONE 4s |
| 08-31 07:09 | mlb-sim | DONE 1824s |
| 08-31 07:49 | feed-monitor | DONE 14s |

Outside the dispatcher, both healthy: the hourly F1 watcher logged 26h of
`idle: 2026 R12 already synced` (correct -- R12 Zandvoort was 21-23 Aug, Monza
is 4-6 Sept), and newsletter-podcast's weekly run on 08-30 09:00 took a clean
skip with no script written.

`python3 dispatcher.py --check-sync` reports **in sync** -- the runner drift
described in #1 is closed as of 08:53Z today.

## Self-healed (informational only, no action needed)

**`daily-ops-sweep` 15m timeout (08-30 11:29Z).** Already handled on 08-30
(timeout raised to 25m, PID lock added). The 08-31 01:07Z run finished clean in
535s, and `bef7f8e3d` additionally fixed the window query that had been dropping
the middle day of its own 26h window. Nothing outstanding.

**`football-standings` exit 1 after 2s (08-30 17:05Z).** `git pull --ff-only`
refused because an uncommitted `HANDOFF.md` sat in the working tree:
`error: Your local changes to the following files would be overwritten by merge`.
Same cause produced 10 consecutive `WARN export_schedule.py failed` lines from
17:05Z to 18:35Z. HANDOFF.md was committed at 18:39:56Z; the 19:41 local run,
the 23:05Z slot and both of today's slots all completed clean. Working tree is
clean now and `origin/main` is level with HEAD.

**`cfb-sun` exit 1 after 602s (08-30 23:47Z)** -- `schedule gap: Jacksonville
State has only 3 games`. Diagnosed and fixed today: ESPN's `groups=80`
scoreboard was omitting 9 of JSU's 12 games (upstream indexing, not our bug).
`8617e8368` backfills any FBS team under `MIN_TEAM_GAMES` from its own
`/teams/<id>/schedule` endpoint and keeps the hard gate as the final check.
Verified in the rebuilt artefact: `public/data/cfb-sim.json` is now
`generated_at 2026-08-31`, `games_played: 8`, and records
`schedule_backfill: [{team: "Jacksonville State", scoreboard: 3, after: 12}]`.
Published via `a1952febe`; state marked `ok (manual)` at 06:52Z. The fix gets its
first *unattended* exercise at `cfb-fri`, Fri 09-04 11:40Z.

**Greek Super League 2 auto-promoted.** `gap-league-watch` went
`awaiting_target -> ready` on 08-30 with one UNMATCHED club; after the Lookup
entry was added, the 12:18 run matched 16/16 and auto-promoted the league.
Confirmed present in `scripts/apifootball/leagues.json`. India L1 (Indian Super
League) remains correctly `awaiting_target` -- api-football's latest published
season is still 2025.

**Vercel build budget: 0 billable builds today.** All 28 production deployments
between 08-31 00:00Z and 09:06Z are `CANCELED` (free). Spot-checked that today's
`[vercel skip]` tags were *correct*, not lucky: today's leaders commits touched
only `_current.json`, `power-ranking.json` and `power-ranking-history/**`, all of
which `lib/currentLeaders.ts` / `lib/powerRanking.ts` serve ISR-from-raw. No
per-country `public/data/leaders/<slug>.json` file was committed today, so the
build-required case (`6d954fc67` on 08-30, correctly tagged `[triggers build]`)
did not arise. This is a clean day against 08-30's 7 billable builds.

**Release notes:** no commit touched `app/` or `lib/` today, so no
`lib/releases.ts` entry is due yet. If anything reader-visible ships later today,
08-31 still needs its block.

## Needs Ashwin's attention

### 1. This morning's `forecast` run silently skipped its gate and its scoring

**What happened.** `forecast` ran at 06:18Z, reported `DONE ok 607s`, and
committed `2b41e6e1a` -- but it ran the *stale* copy of `runners/forecast.sh`,
frozen at 2026-08-06. That version has none of the steps the repo copy has had
since: the four `--self-test` calls, `check_forecast_health.py` (the gate that
must pass between build and commit), `score_forecasts.py --write`, and
`forecast-scoreboard.json` in its `commit_paths` list.

**Root cause.** `REBUILD-RUNBOOK.md` §7 symlinked the top-level wrappers but
`cp -R`'d `runners/` two lines later, so the live runners never picked up repo
edits. `0b94d2f72` closed this at **08:53Z today** -- two and a half hours *after*
the forecast run. I diffed the backup (`~/metro-mini-jobs/runners-backup-2026-08-31/`)
against the repo: `_common.sh`, `business-daily.sh`, `cfb.sh` and `mlb-sim.sh`
were identical, so only two jobs were ever affected -- `forecast.sh` and
`predictions.sh`. Both reported green throughout, which is what made it silent.

**Consequences, verified on disk.**
- `public/data/forecast-scoreboard.json` is unchanged since the `62979497c`
  hand-seed of 08-30. The ledger has not been graded on the mini, ever.
- Today's published `forecast.json` shipped **without passing
  `check_forecast_health.py`** -- the "a block that publishes must contain what
  it says it contains" check. That is the part worth caring about.
- `predictions.sh` never built the UCL sim. `public/data/ucl-sim.json` is dated
  08-30 12:01 from `669e6249e`, a hand-run, not the job.

**Recommended fix.** Both self-heal on the now-symlinked runners --
`forecast` next fires **Wed 09-02 06:10Z** (Mon/Wed/Fri) and `predictions-tue`
**Tue 09-01 06:40Z** -- so no change is required if you are content to wait.
If you want the ledger and the health gate honoured before Wednesday, run on the
mini:

```
cd ~/metro-mini-jobs && bash runners/forecast.sh
```

or, to touch only the missing half without refetching polls:

```
cd "$HOME/Projects/Metro Area Project"
python3 scripts/forecast/check_forecast_health.py     # gate today's published file
python3 scripts/forecast/score_forecasts.py --write   # regrade the ledger
git add public/data/forecast-scoreboard.json data/forecast
```

`forecast-scoreboard.json` is ISR-from-raw (`lib/forecastScoreboard.ts`), so that
commit takes `[vercel skip]` and costs no build.

### 2. `egress-refresh`'s leaders fixes are unproven -- today's 09:00Z slot is the test

**What happened.** The 08-30 09:07Z run got 30 minutes into the pipeline
(billionaires, civic, zone-zero-cup and the citypopulation watcher all completed)
and then the leaders sanity gate HELD the commit: `HOLD: 5 hard flag(s)`, led by
`HARD nigeria: name "Bola Ahmed Tinubu" -> "Bola Tinubu" with unchanged since
(2023-05-29)`, plus SOFT flags on hungary, india and switzerland. That is the
**fourth-plus** recurrence since early August, and each one has red-lined the
whole job for a country whose correct value was already in the file.

**Root cause (found today, not previously understood).** Wikidata has been
migrating person labels to the language-agnostic `mul` code and deleting the
redundant `en` one. Asked for `en` alone the label service returns a bare QID,
`_plausible()` rejects it, and the head-of-government candidate is silently
*dropped* -- so `pick` falls through to the ceremonial President. Measured today
this hit 9 label slots across 7 countries (IN, HU, MX, US among them), which is
why India led with Murmu and France with Lecornu rather than Modi and Macron.
Three commits landed this morning: `3a618cea5` (keep `mul` in the label
fallback), `64da27c52` (pins restore the whole entry and the run *continues*
instead of halting), `31c2d59a0` (pin estonia/madagascar/malawi/mauritius as
known-stale sources), `c67a8eb8e` (France back to Macron, ranking rebuilt).

**Why it still needs your eye.** `egress-refresh` has not run since. Its next
slot is **today 09:00Z**, roughly 40 minutes after this report was written, and
that is the first real exercise of all four commits together. Its state currently
reads `ok (manual)`, which is bookkeeping, not evidence.

**What to check.** After 09:40Z, `grep -A20 'RUN egress-refresh'
~/metro-mini-jobs/dispatcher.log | tail -40`. A clean run ends `DONE
egress-refresh`. If it HOLDs again, the `!` lines name the countries, and the new
pin mechanism means a HOLD now indicates a country that is *not* pinned -- a
genuinely new case, not the Nigeria loop.

**Data spot-check, done independently rather than assumed.** Current
`_current.json` values for the flagged countries are correct as of today:
Nigeria = Bola Ahmed Tinubu (Pres., 2023-05-29); India = Modi (PM) with Murmu as
ceremonial second; France = Macron (Pres., 2017-05-14). Hungary = Péter Magyar
(PM since 2026-05-09) with Ágnes Forsthoffer as "Pres." -- confirmed by search
that Magyar was sworn in 09 May 2026 after Tisza's April landslide, and that
Forsthoffer, Speaker of the National Assembly, is **acting** head of state after
Tamás Sulyok's term was ended early in July 2026. So the entry is substantively
right, with one caveat worth knowing: parliament is expected to elect a new
president, so Hungary's `second` will move again and will trip the same SOFT flag
when it does. Switzerland's missing `since` on "Swiss Federal Council" is the
known, deliberate SOFT case -- no action.

### 3. Minor: `--self-test` writes fake MARK-OK lines into the real dispatcher.log

`dispatcher.log` carries three lines reading
`MARK-OK test-job: last_status 'failed' -> 'ok (manual)'` (08-30 12:47 x2,
**08-31 07:53**, in this window), each preceded by `stale lock file; taking it
over`. There is no `test-job` in `jobs.toml` and none in `state.json`, and
`mark_ok()` refuses unknown ids -- these come from `dispatcher.py --self-test`,
which exercises `mark_ok()` against a synthetic jobs table and lets the result
land in the operational log. Harmless to state, but a log reader (including this
sweep) has to rule it out every day, and it looks exactly like a human clearing a
real failure. Suggested fix: have the self-test log to a null/temp sink, or
prefix its lines with `SELFTEST` so they can be filtered.

### 4. Carried from HANDOFF J2, self-heals tomorrow -- flagging so it isn't lost

The 08-30 rugby entry notes that `public/data/rugby-union/top-games.json` was
**re-scored from the published board rather than rebuilt from source**, because
Supabase was unreachable from that Cowork session, so the committed file predates
the new upset term. `rugby-weekly` runs **Tue 09-01 07:05Z** on the mini and will
rebuild it natively from source, which resolves this without action. Worth
knowing only because the board's ordering may shift when it does -- that is the
model finally being applied, not a regression.

## Also noted, no action

- `[wfootball] FA WSL (id 44): 12 standings rows [2025-26] PLACEHOLDER` on every
  football-standings run this window. Liga F flipped from PLACEHOLDER to 2026-27
  between the 00:05 and 06:06 runs today, so the mechanism works; the WSL
  2026-27 season simply has not opened on api-football yet. Expect it to clear on
  its own in early September.
- The Substack has been quiet since 2026-07-01. The newsletter-podcast weekly
  skip will keep repeating each Sunday until a new post lands, and
  **Greying Power** (2026-05-10) remains the one published post with no episode --
  it is outside the 14-day rule, so it needs a deliberate manual run if you want
  it narrated.
