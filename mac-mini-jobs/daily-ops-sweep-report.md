# Daily Ops Sweep -- 2026-09-02

Window: 2026-08-31T23:05Z -> 2026-09-02T01:05Z (trailing 26h, selected on each
line's own UTC timestamp). Read-only run: nothing was re-run, fixed, pinged or
written except this file.

## Jobs this window: 19 ok, 2 failed, 2 flagged

21 completed dispatcher occurrences, plus this run:

| When (UTC) | Job | Result |
|---|---|---|
| 09-01 01:05 | daily-ops-sweep | DONE 491s |
| 09-01 02:33 | activity-feed | DONE 5s |
| 09-01 04:04 | euro-comps | DONE 4s |
| 09-01 05:04 | gap-league-watch | DONE 4s |
| 09-01 05:04 | football-standings | DONE 82s |
| 09-01 05:05 | screen-number-ones | DONE 14s |
| 09-01 05:56 | business-daily | DONE 617s |
| 09-01 06:16 | substack-daily | DONE 5s |
| 09-01 06:46 | predictions-tue | DONE 608s |
| 09-01 07:06 | mlb-sim | **FAIL** exit 1, 1822s (resolved, see below) |
| 09-01 07:37 | rugby-weekly | DONE 9s |
| 09-01 07:47 | feed-monitor | DONE 14s |
| 09-01 07:47 | conflicts-monthly | **FAIL** exit 1, 3s (resolved, see below) |
| 09-01 09:07 | cricket-weekly | DONE 36s |
| 09-01 10:08 | cricket-monthly | DONE 27s |
| 09-01 11:08 | football-standings | DONE 91s |
| 09-01 13:00 | screen-number-ones | DONE 33s |
| 09-01 14:31 | mlb-sim | DONE 1822s |
| 09-01 17:01 | football-standings | DONE 91s |
| 09-01 21:03 | screen-number-ones | DONE 21s |
| 09-01 23:03 | football-standings | DONE 87s |
| 09-02 01:05 | daily-ops-sweep | RUN (this run) |

No `MISSED` lines. `dispatcher.py --status` shows every other job
`already-ran`, none overdue: `fiba-weekly` and `sound-weekly` (Wed 07:10/07:30Z)
are due later today, `mktcap-refresh` Sat 09-05, `egress-refresh` and `cfb-sun`
Sun 09-06. `--check-sync` reports **in sync**. Working tree clean.

Outside the dispatcher, all four loaded launchd agents report exit 0
(`launchctl list`: heartbeat, deploy-watch, dispatcher, f1-weekly):

- **f1-weekly** (hourly): 26 ticks of `idle: 2026 R12 already synced`. Correct
  -- R13 is Monza 4-6 Sept, so there has been no race to sync.
- **deploy-watch**: no re-triggers this window. `/tmp/deploy-watch.out` reads
  `up to date: TARGET 2c245844d is live (serving 2c245844d)` on every tick;
  `/tmp/deploy-watch.err` was last written 08-31.
- **newsletter-podcast**: 09-01 daily digest clean end to end -- episode
  `spotify:episode:1CAskYyOdXQ3evS7lF95rd` reached READY, both Gmail drafts
  created, and the 09:30 watchdog confirms `final.mp3` present (38 MB) and the
  episode READY. No 09-02 run yet (it runs later this morning).

**Job-script `push()` alerts.** The two dispatcher FAIL notifications (07:37Z,
07:47Z) are the only pushes this window that can be evidenced. Every job that
can notify mid-run logged a clean pass: `gap-league-watch` "no state
transitions this run", `football-standings` `unmatched=0 collisions=0` on all
five runs, `feed-monitor` 12/12 `ok`, `business-daily`, `predictions-tue`,
`mlb-sim` and `activity-feed` all exited 0 (they can only push via `fail()`).
**Evidence limit, same as yesterday:** the ntfy topic's own history
(`?poll=1&since=30h`, read-only GET) returned 0 retained messages, but ntfy.sh's
free tier only keeps ~12h, so that independently confirms silence from roughly
13:00Z on 09-01 onward. The earlier half rests on the job logs above. Note also
that the six `runners/*.sh` jobs write no log file of their own -- `dispatcher.py`
keeps only the last 12 stdout lines (`run_job`, line 266) -- so a `push()` from
inside one of those leaves no local trace at all once ntfy retention lapses.

## Self-healed (informational only, no action needed)

**`mlb-sim` FAIL (09-01 07:06Z)** -- `[cfl] expected 81 regular-season games,
parsed 0`. cfl.ca was rebuilt from server-rendered WordPress to a Nuxt app,
breaking the schedule parse, the `/standings/<year>/` URL and the standings
regex at once. Fixed the same morning by `1879faa51`, which reads the
`__NUXT_DATA__` devalue payload for the schedule and `api.stats.cfl.ca/standings/<season>`
for the table. Verified in the artefact, not the commit message: the 14:30Z run
DONE'd ok in 1822s and committed `public/data/cfl-sim.json` in `f1054c7d6`
(09-01 14:32Z). The 81-game gate did its job -- it failed loudly rather than
publishing an empty CFL, and the other six leagues still committed (`ce48a7e84b`).

**`conflicts-monthly` FAIL (09-01 07:47Z)** -- `UNMAPPED belligerents: PLO`,
exit 2 from `build-conflicts.py`. Working as designed: a belligerent that
resolves to neither a country slug nor an intentional label stops the run for a
human to classify. The source relabelled the 1982 Lebanon War's participants.
Fixed by the same `1879faa51`, which adds `"PLO"` to `KEEP_LABEL` alongside
Houthis / Northern Alliance / SPLA. Both jobs were marked `ok (manual)` at
08:04Z.

**The conflicts dataset wipe (HANDOFF 09-01 "🔴 THE CONFLICTS REFRESH WIPED
FIVE CENTURIES OF WAR") is fully recovered.** `public/data/conflicts.json` now
reads `generated 2026-09-01`, `count 623`, earliest start `1500-01-01` (Second
Muscovite-Lithuanian War), and the 2003 Iraq invasion row is present again.
Restored and re-merged in `8849f5577`. The merging builder has been exercised
live by hand; its first *unattended* run is **Thu 2026-10-01 07:15Z**.

**`ucl-sim.json` is no longer frozen** (yesterday's item #4). `predictions-tue`
ran 09-01 06:40Z and rebuilt it: `meta.generated_at 2026-09-01T06:46:39Z`,
10,000 sims, committed in `cb1810395`. The runner also warmed `/predictions/ucl`,
so the UCL step is running, not just the runner.

**Both monthly jobs survived their first unattended dispatcher run**
(yesterday's item #3). `cricket-monthly` DONE'd clean (Test/ODI/T20I rankings
appended, `rankings as-of 2026-08`); `conflicts-monthly` failed only on the
review gate above, which is the gate working.

## Needs Ashwin's attention

### 1. Liga F has gone backwards on the site: live 2026-27 table replaced by last season's, and the reversal was silent

**What happened.** `public/data/football/wlive-2026.json` carried the real
Liga F 2026-27 matchday-1 table for five consecutive `football-standings` runs
(08-31 06:04Z through 09-01 00:04Z): `season 2026`, `season_label "2026-27"`,
`placeholder false`, every one of the 16 clubs on `played: 1`, Barcelona W on 3
points. From the 09-01 06:04Z run onward it is back to `season 2025`,
`season_label "2025-26"`, `placeholder true`, all 16 clubs on `played: 30`,
Barcelona W on 87 points -- and has stayed there for five further runs, through
09-02 00:03Z. The bundle is `[vercel skip]`-committed and ISR-read, so the live
`/teams/wfootball` is serving the 2025-26 table now.

**Root cause: upstream, not ours.** I probed api-football read-only this run.
`/standings?league=142&season=2026` currently returns the COMPLETED table --
all 16 clubs at `played=30`, Barcelona 84 pts. `looks_fresh()` in
`scripts/apifootball/refresh_women.py:41` requires at least one club short of
the full double round-robin (`2*(n-1)` = 30), so it correctly refuses to present
a finished table under a 2026-27 label and falls back to the declared 2025-26
placeholder. That guard was written on 2026-08-30 for exactly this shape and it
is doing its job. api-football published a genuine matchday-1 table on 08-31 and
then reverted its own `season=2026` payload to a carried-over final table.

**Verified against the real world, not assumed.** Liga F 2026-27 began 29-30
August 2026, which matches the `played: 1` table we captured -- so the 08-31
data was right and the current state is stale, not wrong-but-fresh.
(FA WSL is a separate and correct case: the 2026-27 season does not start until
Fri 4 September, so its `PLACEHOLDER` line is expected and should clear on its
own around 5-6 Sept. The 12-row placeholder is last season's; the new season has
14 teams.)

**Why it needs you.** Nothing failed. Every one of those five runs exited 0 and
pushed. A league silently *regressing* from a live season back to a placeholder
produces no alert, no non-zero exit, and no distinguishable log line beyond the
` PLACEHOLDER` suffix reappearing -- which is why it sat for 18 hours until this
sweep diffed the bundles.

**Recommended fix, two parts.**

1. *Likely self-heal, check it rather than assume it.* Liga F matchday 2 falls
   around 5-7 Sept; once api-football publishes it, `looks_fresh()` flips the
   league back automatically. Check after **Mon 2026-09-07**:
   `grep 'Liga F' ~/metro-mini-jobs/logs/football-standings-2026-09-07.log`
   -- `[2026-27]` with no `PLACEHOLDER` suffix means it healed itself.
2. *Durable fix, if you want it not to happen again.* Add a monotonic ratchet to
   `fetch_standings()`: once a league's `watch_season` has been accepted as
   fresh and published, never fall back to the base season for that league --
   carry the last published watch-season table forward instead, and log the
   refusal loudly. This is the same invariant already adopted three times in this
   repo in the last four days (`build-conflicts.py` refuses a run that would
   shrink the file; `build_champions.py` refuses any net row loss;
   `build_intl_basketball.py` refuses a shrinking season list). The state it
   needs is already on disk -- the previous `wlive-2026.json` -- so this is a
   read-compare-refuse, not new persistence. Whether or not you take the ratchet,
   the cheap half is worth doing on its own: **print a distinct warning line
   when a league moves from a real season back to a placeholder**, so this
   transition is visible in the log instead of inferable only by diffing
   committed bundles.

### 2. 2026-09-01 spent 3 billable Vercel builds against the 2/day budget; exactly one was avoidable, and its cause is a documented hole in the commit hook

**Counted with the Vercel MCP** (`list_deployments`, three pages covering
08-31T23:05Z -> now; `CANCELED` is free), not from GitHub `deployment_status`.
Three `READY` production builds, all on 09-01, all triggered by `git pull` merge
commits authored by you:

| UTC | Commit | Local-side (first parent) | Verdict |
|---|---|---|---|
| 07:36 | `7db89c48f` "Merge branch 'main' of …" | `13e0cf417` football: refresh UEFA coefficients **[vercel skip]** | **avoidable** |
| 08:18 | `5abdf2a9c` "Merge branch 'main' of …" | `0a4abd6bc` football: first live club power ranking (untagged) | legitimate |
| 13:31 | `2c245844d` "Merge branch 'main' of …" | `d5494823d` updates: merge the three 2026-09-01 release blocks into one (`lib/releases.ts`) | legitimate |

**Root cause of the avoidable one.** For `7db89c48f`, *every* commit on both
sides carried `[vercel skip]`: the local side was a tagged data-only commit, and
all eight incoming commits (`ce48a7e84`, `9e77038fc`, `cb1810395`, `ce4a885da`,
`d8b7ea72d`, `2d25fcc1c`, `3d47bc258`, `7e5114ffe`) were tagged automated data
refreshes. The merge introduced nothing that had not already been deliberately
skipped -- but the merge commit's own subject is git's default
`Merge branch 'main' of https://…`, which carries no marker, and its diff
touches 70 files under `public/data/**`, which is deliberately build-relevant.
So `scripts/vercel-ignore.sh` rule 4 correctly built. **The guard is not the
bug.** The gap is one line up the chain:
`.githooks/prepare-commit-msg` line 32 --
`case "$SOURCE" in merge|squash|commit) exit 0;;` -- exits unconditionally for
merges, on the stated reasoning that a merge message "already has its own
settled intent". It does not: git generated it.

The other two builds were correct and should not be suppressed. `0a4abd6bc`
touched `public/data/football/live-ranking-2026-27.json` untagged, and
`d5494823d` touched `lib/releases.ts`, which genuinely needs a build. Any fix
must keep building those.

**Recommended fix.** In `.githooks/prepare-commit-msg`, stop treating `merge` as
unconditionally hands-off. Handle it as its own case: append `[vercel skip]`
only when **every** commit on both sides since the merge base carries
`[vercel skip]` on its subject, i.e.

```sh
# in the merge branch of the case statement
BASE=$(git merge-base HEAD MERGE_HEAD) || exit 0
UNTAGGED=$(git log --format=%s HEAD MERGE_HEAD --not "$BASE" \
           | grep -cv '\[vercel skip\]')
[ "$UNTAGGED" -eq 0 ] || exit 0     # anything untagged -> leave the merge alone
```

then fall through to the existing tag-append. On the three real cases above this
skips `7db89c48f` and leaves `5abdf2a9c` and `2c245844d` building, which is
exactly right. Keep `squash|commit` exiting as they do now.

Per CLAUDE.md's "change the guard, run the suite": `scripts/test-vercel-ignore.sh`
covers `vercel-ignore.sh` and not the hook, so this wants its own pinned cases.
Those three SHAs are real, in history, and cover both outcomes -- pin them.

**Worth a separate word:** `2c245844d`'s subject is the entire commented-out git
merge template (`# Please enter a commit message…`) pasted onto one line. Cosmetic,
but it is in `main` forever and it means an editor opened and was saved without
stripping comments -- the same class of default-message accident as the missing
marker.

## Also noted, no action

- `gap-league-watch`: India L1 (Indian Super League) remains correctly
  `awaiting_target` -- api-football's latest published season is still 2025.
  One pending league, no transitions.
- `screen-number-ones` reported `no number-ones change this week; nothing to
  commit` on both 09-01 runs. Expected mid-week.
- Release notes are current -- `npm run check:release-notes` passes
  (124 entries, newest 2026-09-01). Nothing owed for 09-02 yet; today's only
  commits so far are data refreshes.
- **Carried from yesterday, unchanged and still open:** `egress-refresh` has
  failed two Sundays running (08-23, 08-30) and five commits are staked on its
  next run unexercised. It is `weekdays = [7]`, so that run is **Sun 2026-09-06
  09:00Z**. `--status` confirms it still sits on the 08-30 slot. After 09:40Z
  that day: `grep -A20 'RUN egress-refresh' ~/metro-mini-jobs/dispatcher.log | tail -40`.
- **Carried, unchanged:** the mini's project memory directory
  (`~/.claude/projects/-Users-ashwindesikan-Projects-Metro-Area-Project/memory/`)
  is still empty with no `MEMORY.md`, so CLAUDE.md's pointer to
  `feedback_vercel_build_budget_incident` still resolves to nothing on this
  machine. This run is read-only and did not create it.

Sources for the real-world checks in item 1:
[2026-27 Liga F (Wikipedia)](https://en.wikipedia.org/wiki/2026%E2%80%9327_Liga_F),
[2026-27 FC Barcelona Femení season](https://en.wikipedia.org/wiki/2026%E2%80%9327_FC_Barcelona_Femen%C3%AD_season),
[2026-27 Women's Super League (Wikipedia)](https://en.wikipedia.org/wiki/2026%E2%80%9327_Women's_Super_League),
[Sky Sports -- WSL 2026/27 opening fixtures](https://www.skysports.com/football/news/36996/13567659/womens-super-league-fixtures-2026-27-man-city-host-birmingham-city-and-london-city-lionesses-face-man-utd-in-opening-round)
