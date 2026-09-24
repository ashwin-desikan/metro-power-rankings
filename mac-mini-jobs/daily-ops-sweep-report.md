# Daily Ops Sweep -- 2026-09-24

Window: 2026-09-22T23:09Z to 2026-09-24T01:09Z (trailing 26h), read from
`~/metro-mini-jobs/dispatcher.log` selected on each line's own UTC timestamp.
Read-only run: nothing was fixed, re-run, pinged or written except this file.

## Jobs this window: 184 ok, 6 failed, 3 flagged

21 distinct dispatcher jobs made 190 runs. 6 runs failed, across 5 jobs, plus
1 MISSED slot. The f1-weekly poller runs on its own launchd timer outside the
dispatcher and is healthy (hourly `idle: 2026 R14 already synced`).

| Job | Runs | Result |
|---|---|---|
| deploy-watch | 149 | all ok, `532698d33` live and serving since 22:27Z |
| ops-autofix | 13 | all exit 0, but **stood down every run since 16:15Z**, see item 2 |
| claude-auth-canary | 4 | ok, refresh token valid to 2026-10-08 (14.1 days) |
| football-standings | 4 | 2 ok (09:09Z, 11:08Z), **2 FAIL** (17:05Z, 23:07Z) |
| screen-number-ones | 3 | 2 ok (05:08Z, 13:06Z), **1 FAIL** (21:07Z) |
| mlb-sim | 2 | ok (448s, 461s) |
| activity-feed, business-daily, cfb-wed, daily-ops-sweep, euro-comps, feed-monitor, forecast, gap-league-watch, git-maintenance, nfl-elo, sound-weekly, substack-daily | 1 each | ok |
| cricket-champions | 1 | **FAIL** 22:37Z |
| fiba-weekly | 1 | **FAIL** 07:18Z, self-healed the same morning |
| notion-reconcile-verify | 1 | **FAIL** 10:56Z, self-resolving |
| notion-reconcile-ping | 0 | **MISSED** (job has since been retired) |

Also clean and worth recording as checked: feed-monitor's 2026-09-23 sweep
returned ok on all 18 probes bar `empty:ESPN PGA scoreboard`, which is the
normal between-tournaments state it has shown on and off since 09-02, not a
fault. newsletter-podcast ran morning and evening, 36 items, both Gmail drafts
created. gap-league-watch reported no state transitions (ISL, CONCACAF CL and
OFC CL all still `awaiting_target`), so no `[gap-watch]` push fired.

## Self-healed (informational only, no action needed)

**fiba-weekly, 07:18Z, AssertionError on the women's shrink guard.** The run
stopped at `apply_womens_ranking.py:173`: `118 ranks would replace 119`. The
guard did its job. A session completed the run by hand at 10:20Z and committed
`6766422dd` with `--allow-shrink`; the 10:20Z re-run then reported
`Women's Basketball now 118 ranks (was 118)` and `no change for fiba this run`.
I verified the underlying fact independently rather than taking the commit
message on trust: FIBA's World Ranking Women now carries **118 national
federations**, with Guam, the Federated States of Micronesia and Palau joining
after the FIBA Women's Micronesian Cup 2026. That matches the commit's account
(Barbados, St Vincent and the Grenadines, Moldova and Gibraltar left; three
Pacific federations joined). The data is correct and the item is closed.
Source: <https://www.fiba.basketball/en/news/spain-and-germany-enter-the-top-5-in-latest-fiba-world-ranking-women-presented-by-nike>

**notion-reconcile-verify, 10:56Z, "NOTION_API_TOKEN is not set".** An arming
race, not a defect. The catch-up run for the 08:10Z slot fired at 10:56:42Z;
`config.env` gained the token at **11:07:20Z**, eleven minutes later. The token
is present now (50 chars, `ntn_` prefix) and the runner sources `config.env`
through `_common.sh`. The next slot, 2026-09-24 08:10Z, had not yet fired when
this sweep ran, so the pass is expected but unproven. No action; if the 08:10Z
run fails again today, that is a real finding and this note is void.

**notion-reconcile-ping, MISSED its 2026-09-22 21:20Z slot by 817m.** The job
was still armed in `jobs.toml` at 10:56Z and was commented out at 11:09:53Z,
because its per-routine trigger token does not exist for any claude.ai routine.
The MISSED line is the dispatcher retiring a stale slot. Nothing to do.

**screen-number-ones, 21:07Z.** Caused by item 1 below, but harmless in its own
right: the job had already run clean twice that day (05:08Z and 13:06Z), both
reporting `no number-ones change this week; nothing to commit`. No data was
lost by the failed third run.

## Needs Ashwin's attention

### 1. BLOCKER: one uncommitted file has been stopping every git-syncing job for 9 hours, and still is

**What happened.** `lib/releases.ts` has an uncommitted edit in the mini's
working tree. Every mini job that fast-forwards the repo before working now
refuses to run. This started at **2026-09-23 16:09Z** and is still live as of
this sweep, 01:09Z on 09-24, so it is now into its tenth hour.

Confirmed casualties in the window:

- `football-standings` FAIL at 17:05Z, 23:07Z, and again at 00:07Z today
  (`logs/football-standings-2026-09-24.log`). Three missed refreshes.
- `screen-number-ones` FAIL at 21:07Z.
- `cricket-champions` FAIL at 22:37Z, reporting
  `0 ahead, 8 behind, 1 modified path(s)`.
- `export_schedule.py` WARN on **48 consecutive dispatcher ticks**:
  `git sync failed, skipping this run`.
- `ops-autofix` neutered on all 6 runs since 16:15Z, see item 2.

**Root cause.** The file's mtime is 2026-09-23T16:08:47Z, six minutes after the
security-hardening merge `e3ad59153` landed at 16:02:50Z. Someone drafted the
release note for that merge and never committed it. `origin/main` then moved 9
commits ahead, and one of them, `25fda2111`, edits the same region of the same
file. So `git pull` aborts with:

```
error: Your local changes to the following files would be overwritten by merge:
	lib/releases.ts
Please commit your changes or stash them before you merge.
```

**This is not a mechanical fix, which is why it needs you and not a script.**
The uncommitted draft adds a `2026-09-23` block for the security hardening.
`origin/main` already has a *different* `2026-09-23` block, for the Fan
Attention Index. Committing the draft as-is would put **two blocks on the same
date** on `/updates`, which `CLAUDE.md` forbids ("One date block per shipping
day"), and eight bullets across the day against a ceiling of four.

I checked whether anything would catch that: **nothing would.**
`node scripts/check-release-notes.mjs` passes right now with the duplicate in
place (`OK (146 entries, newest 2026-09-23)`), and `app/updates/page.tsx`
validates bullet count, headline length and character count *per block*, never
uniqueness of date. A duplicated day would ship silently.

There is a second, quieter consequence: because a `2026-09-23` entry does exist
upstream, the release-notes gate is satisfied for that date, so **the security
hardening shipped to production with no public release note and the gate will
never flag it.**

**Recommended fix, in two separable steps.**

Step 1, unblocks the whole fleet in seconds, safe to do before deciding
anything editorial:

```
cd "$HOME/Projects/Metro Area Project"
git stash push -m "09-23 security release note draft" lib/releases.ts
git pull --ff-only
```

Do **not** reach for `git checkout -- lib/releases.ts`. That is the reflexive
fix and it destroys the draft. To make the draft safe regardless, here it is
verbatim:

```
  {
    date: "2026-09-23",
    headline: "Stricter inputs, headers and admin checks",
    items: [
      "The public metro API now accepts real metro slugs only. Anything else gets a plain no-metro-found reply instead of being looked up at all.",
      "The admin tools check their login session on every change they make, and refuse the change outright when that session is missing or expired.",
      "Standard security headers go out with every page now, and the admin and activity pages can no longer be embedded in a frame on another site.",
      "The cap on AI-written banter is counted in one shared place, so it holds across every server rather than being counted afresh on each one.",
    ],
  },
```

Step 2, editorial, whenever suits: fold the security bullets into the existing
`2026-09-23` block so the day has **one** block of **at most four** bullets,
choosing across both sets what a reader would actually notice. Ship that edit
inside the next commit that already touches `app/` or `lib/`; `lib/releases.ts`
is build-relevant, so a release-notes-only commit spends a production build on
its own.

### 2. ops-autofix has been stood down for 9 hours and stopped saying so

**What happened.** Every `ops-autofix` run since 16:15Z exits 0 and logs
`STOP: uncommitted changes in the repo. Refusing to act around a human's work.`
Standing down on a dirty tree is correct and deliberate. The problem is that it
also went quiet. At 21:16Z the log reads:

```
21:16:42 same stand-down as the last run -- not re-notifying (still logged every run)
```

That dedupe was added on purpose (commit `24b7aa0b8`, "the stand-down alert
goes through the dedupe it already had") to stop an alert storm every two hours
during a normal working afternoon. The side effect is the one that matters
here: the tree stayed dirty overnight rather than for an afternoon, findings
accumulated from 2 to 5, and nobody was told. By 01:18Z today it was sitting on:

```
   [blocker] working_tree_dirty -- repo has 1 uncommitted change(s)
   [high] job_failed -- cricket-champions failed its 2026-09-23T22:30:00+00:00 slot
   [high] job_failed -- football-standings failed its 2026-09-23T23:00:00+00:00 slot
   [high] job_failed -- screen-number-ones failed its 2026-09-23T21:00:00+00:00 slot
   [high] deploy_drift -- live dispatcher directory is out of sync with the repo
```

This is exactly the Silent failure register shape: the safety net was disabled,
the tile was green, the topic was quiet, and the only record was a log file.
Item 1 would have been caught hours earlier if this had spoken once.

**Recommended fix.** Keep the dedupe, but do not let it hold silently across a
day boundary or while the finding set is growing. Two options, either is small:

- Re-notify when the **finding set changes**, not only when the stand-down
  reason changes. The set went 2 -> 3 -> 4 -> 5 findings and each of those
  transitions was newsworthy; the dedupe key is currently the stand-down
  reason, which never changed. `.autofix-attempts.json` already stores
  `reported_standdown` as a hash, so this is a change to what gets hashed.
- Or add a floor: re-notify once if a stand-down has persisted past N hours
  (4 would have caught this before midnight) or across a UTC day change.

### 3. The 2/day Vercel build cap is still inactive, and 09-23 spent three paid builds

**Already a known P0 of yours; recording the number, not re-opening it.** This
is the `VERCEL_BUILD_CAP_TOKEN` thread that HANDOFF has carried since 09-15.

Counted via the Vercel MCP (not GitHub `deployment_status`, which 404s under
secondary rate limiting), project `metro-power-rankings`, target production,
2026-09-23 UTC. **Three READY builds, against `MAX_DAILY_BUILDS=2`:**

| Time (UTC) | Commit | Subject |
|---|---|---|
| 16:02:50Z | `e3ad59153` | Merge security-hardening: slug guard, admin auth, headers, rate limits |
| 16:31:31Z | `25fda2111` | Fan Attention Index live: release note + handoff |
| 22:16:06Z | `532698d33` | fans: wire Fan Attention Index into every nav surface |

Every other production deployment that day was CANCELED, which is free.

I pulled the third build's log for the decisive line rather than inferring it:

```
Running "sh scripts/vercel-ignore.sh"
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
vercel-ignore: build-relevant change in 25fda2111..532698d33; building
```

So the guard is deployed, running, and reporting itself inactive on every
build. Nothing is broken in the script; the token has simply never been placed.

**Recommended fix, unchanged from HANDOFF.** Add `VERCEL_BUILD_CAP_TOKEN` (read
scope) to the build environment of project `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`.
I could not verify the variable's presence from here: the MCP token returns
`403 forbidden` on `projectEnvVars`, the same 403 recorded on 09-20. The build
log above is the better evidence anyway, and it is unambiguous.

Today, 2026-09-24 UTC, stands at **0 paid production builds** so far, so
whatever you do about item 1 has the full budget available.

### 4. Low: a permanent `deploy_drift` finding from a file that is not a runner

`python3 dispatcher.py --check-sync` reports exactly one item:

```
DRIFT vs .../mac-mini-jobs:
  missing-live  runners/_common-selftest.sh
```

`jobs.toml` is byte-identical to `origin/main`, so nothing is actually
mis-scheduled. The file arrived with `3e98ba80c` at 16:31Z on 09-23 and is a
self-test for `_common.sh`'s git guards: no job invokes it, and it has no
runtime role. But `--check-sync` compares directory contents, so it will report
drift forever, keeping a `[high]` finding permanently lit in `ops-autofix` and
raising the noise floor of the thing meant to spot real drift.

**Recommended fix, either one:** symlink it into the live directory alongside
its siblings (`ln -s "$REPO/mac-mini-jobs/runners/_common-selftest.sh" \
"$HOME/metro-mini-jobs/runners/"`), or teach `--check-sync` to ignore
`*-selftest.sh`, which is more honest about what the file is. The second also
covers the next test file someone adds.

---

*Written by the unattended daily ops sweep. Investigate-and-report only: no
job was re-run, no data written, no healthcheck pinged, nothing fixed.*
