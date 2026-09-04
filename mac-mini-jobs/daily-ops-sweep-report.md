# Daily Ops Sweep -- 2026-09-04

Window: 2026-09-02T23:00Z -> 2026-09-04T01:00Z (trailing 26h, selected on each
line's own UTC timestamp). Read-only run: nothing was re-run, fixed, restored,
pinged, marked or written except this file.

## Jobs this window: 14 ok, 0 failed, 1 flagged

Fourteen completed dispatcher occurrences, plus this run. **No `FAIL` lines, no
`MISSED` lines, no job near its timeout.**

| When (UTC) | Job | Result |
|---|---|---|
| 09-02 23:09 | football-standings | DONE 86s |
| 09-03 01:01 | daily-ops-sweep | DONE 631s |
| 09-03 02:32 | activity-feed | DONE 5s |
| 09-03 04:02 | euro-comps | DONE 5s |
| 09-03 05:02 | gap-league-watch | DONE 4s |
| 09-03 05:02 | football-standings | DONE 89s |
| 09-03 05:54 | business-daily | DONE 615s |
| 09-03 06:14 | substack-daily | DONE 4s |
| 09-03 07:04 | mlb-sim | DONE 1822s |
| 09-03 07:44 | feed-monitor | DONE 15s |
| 09-03 11:05 | football-standings | DONE 89s |
| 09-03 14:36 | mlb-sim | DONE 1826s |
| 09-03 17:07 | football-standings | DONE 89s |
| 09-03 23:09 | football-standings | DONE 86s |
| 09-04 01:00 | daily-ops-sweep | RUN (this run) |

**Everything due in the window ran.** 09-03 was a Thursday, which carries no
weekday-specific job: `screen-number-ones` is `weekdays = [1,2,3]` (Mon-Wed) and
its absence is correct, not a miss; `forecast` is Mon/Wed/Fri; `rugby`/`cricket`
weekly are Tue; `fiba`/`sound` weekly are Wed. `state.json` shows nothing
overdue. `mktcap-refresh` is next Sat 09-05, `egress-refresh` Sun 09-06, and
`cfb-fri` / `predictions-fri` / `forecast` are due later today (11:40Z / 06:10Z).

All four launchd agents report exit 0 (`launchctl list`: heartbeat, deploy-watch,
dispatcher, f1-weekly). `f1-weekly` ticked hourly all window, every tick
`idle: 2026 R12 already synced`. `deploy-watch` ran ~156 times and never
re-triggered a build: it tracked TARGET `a83494a84` -> `89b2953e2` -> `824304002`
and found each live within one cycle. `newsletter-podcast` ran 09-03 clean end to
end (37:23 episode `spotify:episode:1EwIxfii0qzYNwkPGyzfRn` reached READY, both
Gmail drafts created, watchdog confirmed healthy at 09:30). Working tree clean.

**Job-script `push()` alerts: none this window.** The ntfy topic
(`?poll=1&since=30h`, read-only GET) returns **zero** retained messages, which on
ntfy.sh's ~12h free-tier retention independently proves push-silence from roughly
13:00Z on 09-03 onward; the earlier half rests on the job logs, all of which
logged a clean pass. `gap-league-watch` logged `no state transitions this run`;
`football-standings` logged `unmatched=0 collisions=0` on all five runs;
`business-daily`, `mlb-sim`, `activity-feed`, `substack-daily` and `euro-comps`
exited 0 and can only push via `fail()`. Both review queues are clean --
`mktcap-review-queue.md` reads `METRO QUEUE ... none` (closed 08-29) and
`cricket-review-queue.md` reads `none`.

**Two dispatcher latenesses, both benign and self-explaining.** `feed-monitor`
ran 25m after its 07:20Z slot and `substack-daily` 14m after 06:00Z: in both
cases the dispatcher was holding its own lock behind a long-running job
(`mlb-sim` ran 07:04-07:34Z; `business-daily` 05:54-06:04Z). Catchup fired
correctly in both cases and the work was done. No action.

**Evidence limit, unchanged from prior sweeps.** The six `runners/*.sh` jobs
(`business-daily`, `mlb-sim`, `activity-feed`, `forecast`, `predictions`, `cfb`)
still write no dated log of their own, so their evidence is the tail that
dispatcher.log captured plus their exit code. Both `mlb-sim` runs and
`business-daily` ended on clean revalidate + warm sequences, all HTTP 200.

## Self-healed (informational only, no action needed)

Nothing failed this window, so nothing needed healing. Four things that look
like they might want attention and do not:

- **`empty ESPN PGA scoreboard: Biltmore Championship Asheville: not started
  (0 in field)`** in the 09-03 feed-monitor run is the *correct* post-fix
  behaviour, not a recurrence. `b1c638b35` rewired the PGA feed off the
  team-sport checker (which a field sport can never satisfy pre-tournament);
  `empty` is a pass, and the job exited 0. The last actual PGA `FAIL` was
  09-02 08:41Z, resolved the same morning.
- **`[gap-watch] India L1 Indian Super League -> awaiting_target`** is steady
  state, not a stall: api-football's latest published ISL season is still 2025.
  The job wrote watch state and logged `no state transitions this run`.
- **The HANDOFF item "the mini needs the gitignored nflverse pbp cache under
  `data/nfl/` before Wed 9 Sep"** (2026-09-02 entry) is **already satisfied on
  this box** -- `data/nfl/` holds `pbp/` (29 entries), `rosters/`,
  `depth_charts/` and a `_manifest.json` dated 09-02 20:05. `predictions-fri`
  fires at 11:40Z today and will find the cache. No action.
- **Vercel builds on 09-03: two production builds, exactly at the 2/day budget.**
  Counted via the Vercel MCP (`list_deployments`), not GitHub: `89b2953e2`
  (21:31Z, shared SectionHead/DataBar/chart tokens) and `824304002` (21:52Z,
  the merge) are the only `READY` + `target: production` deployments; every
  other production deployment in the window is `CANCELED` (free). Two further
  `READY` builds were previews on `predictions/expert-upgrades`, which do not
  spend the production budget. deploy-watch's log independently confirms no
  build-triggering commit landed on main before 21:31Z -- it sat on TARGET
  `a83494a84` all day. **No guard bug, no overspend.** The `429` in
  `/tmp/deploy-watch.err` is the 09-02 13:58Z one already written up yesterday;
  that file has not been touched since (mtime 09-02 14:58 local).
- **Release notes for 09-03 exist** (`lib/releases.ts:21`), so `npm run
  check:release-notes` will not trip anyone tomorrow despite the twenty-odd
  commits Ashwin shipped that day.

## Needs Ashwin's attention

### 1. 🔴 Liga F still publishes the completed 2025-26 table under a "2026-27" label. Carried from yesterday's sweep, unfixed, and it has now been live ~2 days.

**What happened.** `public/data/football/wlive-2026.json` -- the bundle
`/teams/wfootball` and the Spain women's league hub read -- currently says
`season: 2026, season_label: "2026-27", placeholder: false` for Liga F while
carrying **the finished 2025-26 table**: all 16 clubs at `played: 30`,
Barcelona W on 87 points, Real Madrid W 72, Real Sociedad W 66. Verified on the
**published** artefact, not just locally:

```
$ curl -s https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/football/wlive-2026.json
generated_at 2026-09-03T23:10:26Z
Liga F: season 2026 label 2026-27 placeholder False rows 16
  played 30 pts 87 / played 30 pts 72 / played 30 pts 66
```

The real world, checked this run: **Liga F 2026-27 has played matchday 1**.
Barcelona, Athletic Club, Madrid CFF, DUX Logroño, Alavés, Real Madrid, Sevilla
and Eibar are all on 3 points from 1 game; the other eight are on 0. Nothing has
played 30 games. (Sources: [LaLiga official Liga F
standings](https://www.laliga.com/en-GB/futbol-femenino/standing), [2026-27 Liga
F on Wikipedia](https://en.wikipedia.org/wiki/2026%E2%80%9327_Liga_F), [ESPN Liga
F standings](https://www.espn.com/soccer/standings/_/league/esp.w.1/liga-f).)

This is strictly worse than the state it replaced. Before the ratchet the same
rows were at least honestly tagged `2025-26 PLACEHOLDER`; now nothing on the page
says the table is a year stale.

**Root cause -- `scripts/apifootball/refresh_women.py:167-173`.** The season
ratchet added by `bc9a7219c` (2026-09-02) reassigns `season`, `placeholder` and
`label` but **never reassigns `groups`**:

```python
was_season, was_placeholder = published.get(lid, (None, True))
if placeholder and not was_placeholder and was_season is not None and season != was_season:
    regressions.append(...)
    season, placeholder = was_season, False        # <-- groups is NOT touched
    label = e.get("watch_season_label", ...) if was_season == e.get("watch_season") else label
```

`groups` at that point is whatever `fetch_standings()` returned, which for Liga F
is the `base_groups` fallback: the completed 2025-26 table. `looks_fresh()`
(line 41) correctly refused the carried-over table upstream, the code fell back
to the placeholder as designed, and then the ratchet relabelled that fallback as
the new season without swapping the rows back.

**Evidence it is firing every single run.** All five `football-standings` runs in
this window logged, from `logs/football-standings-2026-09-0{3,4}.log`:

```
[wfootball]   Liga F (id 142): 16 standings rows [2026-27]
[wfootball]   RATCHET HELD: Liga F (id 142): published season 2026 -> 2025 placeholder;
              upstream regressed, keeping 2026
```

Git dates the transition precisely: `4d714edfe` (2026-09-01 00:05Z) is the last
commit carrying the **real** matchday-1 rows (Barcelona W `played 1, pts 3`).
From `c9d7c8f4b` (09-02 00:05Z) the rows are the 30-game table, honestly flagged
`season 2025 / 2025-26 / placeholder true`; from `bc9a7219c` (09-02 09:00Z)
onward the same wrong rows carry the `2026-27` label. Nothing has touched
`refresh_women.py` since. Scope is exactly one league: NWSL is genuinely current
(`played 21-22`, plausible for early September) and FA WSL is honestly flagged
`2025-26 PLACEHOLDER`.

**Recommended fix -- one condition and one assignment, and it self-heals.**
`looks_fresh(groups)` is already the right predicate and is already in the file.

1. Widen `committed_seasons()` (line 99) to also return the previously published
   rows: `{league_id: (season, placeholder, groups)}`.
2. Rewrite the ratchet at 167-173 to hold the rows too, **and to refuse to
   ratchet when the previously published rows are themselves a completed
   table**:

   ```python
   was_season, was_placeholder, prev_groups = published.get(lid, (None, True, []))
   if (placeholder and not was_placeholder and was_season is not None
           and season != was_season and looks_fresh(prev_groups)):
       regressions.append(...)
       season, placeholder, groups = was_season, False, prev_groups
       label = ...
   ```

   The `looks_fresh(prev_groups)` guard is what makes this **self-healing from
   today's poisoned bundle**: on the next run the currently published Liga F rows
   (30 of 30) fail it, so the ratchet declines to fire and the league drops back
   to the honest `2025-26 PLACEHOLDER` until api-football publishes the real
   2026-27 table, at which point the normal `watch_season` swap takes over.
   Without that guard, a plain `groups = prev_groups` would pin the wrong rows
   permanently, because the bad bundle is now what `committed_seasons()` reads.
3. Add a `selftest()` case (the function starts at line 229) for exactly this:
   published `(2026, placeholder=False, matchday-1 rows)` + upstream returning
   `(2025, placeholder=True, 30-of-30 rows)` must yield season 2026 **and** the
   matchday-1 rows; and published `(2026, False, 30-of-30 rows)` must NOT
   ratchet.
4. Optional, only if you want the matchday-1 rows back immediately rather than an
   honest placeholder for a day: the good Liga F block is recoverable with
   `git show 4d714edfe:public/data/football/wlive-2026.json`. **Restoring it
   without the code fix is pointless** -- the 05:00Z `football-standings` run
   overwrites the bundle four times a day. Ship the code change first, or both in
   one commit.

`scripts/apifootball/refresh_women.py` is outside the build-path list, so a
fix commit carries `[vercel skip]` and spends no Vercel build; the corrected
`wlive-2026.json` reaches the site through the ordinary ISR-from-raw path.

### 2. The ratchet can hold indefinitely and never tells anyone. That is why #1 sat for two days.

`RATCHET HELD` and the `N league(s) would have gone backwards this run` summary
(lines 208-213) are **`log()` calls only** -- they write to
`logs/football-standings-<date>.log` and nothing else. `run-football-standings.sh`
line 64 only calls `fail()` on a non-zero exit, so a held ratchet never reaches
ntfy. The bug was found by yesterday's sweep reading the job log by hand, which
is the one path that exists; without the sweep it would still be undetected.

**Recommended fix.** Give the hold a time bound and an alert. Persist a small
counter of consecutive held runs per league beside the bundle, and have
`run-football-standings.sh` push one ntfy warning when any league crosses ~6
consecutive holds (24h at 4 runs/day), then stay quiet until the count resets.
A ratchet that holds for a few hours is upstream lag and is the feature working;
one that holds for a day means either upstream has genuinely regressed or the
held rows are wrong, and both deserve a look. Worth pairing with the #1 fix in
the same change, since the `looks_fresh(prev_groups)` guard gives you the natural
place to distinguish "holding good rows" from "refusing to hold bad ones".

### 3. Watch item for this weekend, not yet a problem: FA WSL 2026-27 kicks off today.

The 2026-27 Women's Super League starts **Friday 4 September 2026** (London City
Lionesses v Manchester United), expanding from 12 clubs to **14**. The bundle
currently shows FA WSL as `season 2025 / 2025-26 / placeholder true / 12 rows`,
which is correct and honest today, and `refresh_women.py` logs
`awaiting 2026-27 in api-football: FA WSL (showing 2025-26)` on every run. When
api-football publishes the new table the normal `watch_season` swap should pick
it up with no intervention.

The reason to note it: FA WSL is currently `placeholder: true`, so the broken
ratchet cannot bite on the *first* swap. But the moment WSL publishes a real
2026-27 table, any subsequent upstream regression puts it on exactly Liga F's
path -- the completed 12-team 2025-26 table relabelled `2026-27`. **Landing the
#1 fix before WSL's first results settle removes that exposure.** If the swap has
not happened by early next week, or if WSL appears with 12 rows rather than 14,
that is worth a look at `wleagues.json`.
(Sources: [2026-27 Women's Super League on
Wikipedia](https://en.wikipedia.org/wiki/2026%E2%80%9327_Women%27s_Super_League),
[WSL 2026-27 key dates and
fixtures](https://www.stylist.co.uk/fitness-health/sport/womens-super-league-key-dates-2026-27/1107171).)
