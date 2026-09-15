# Daily Ops Sweep -- 2026-09-15

Window `2026-09-13T23:03Z` -> `2026-09-15T01:03Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, nothing fixed. This file is the only thing committed.

## Jobs this window: 37 ok, 1 failed, 2 flagged

**Dispatcher: 37 DONE, 1 FAIL, 0 MISSED** (plus this sweep, in flight).

| job | runs | result |
|---|---|---|
| ops-autofix | 13 | all DONE; findings at 06:27, 08:21, 10:16Z (gap-league-watch reruns) and 12:18, 14:18, 16:16Z (WWC Actions reruns + gap-watch at cap). 18:18Z onward: no findings |
| football-standings | 5 | all DONE; every run `unmatched=45`, UNMATCHED ntfy each time (known, flagged 2) |
| claude-auth-canary | 4 | DONE; refresh token valid to 2026-10-08 (23.1 days left) |
| screen-number-ones | 3 | DONE; 05:05Z and 21:09Z pushed, 13:08Z no change |
| mlb-sim | 2 | DONE 448s / 448s |
| **gap-league-watch** | 1 | **FAIL exit 1, 05:03Z**. Fixed by hand 17:40Z (Self-healed 1) |
| cfb-sun, activity-feed, euro-comps, business-daily, forecast, substack-daily, feed-monitor, nfl-elo, owners-weekly, daily-ops-sweep (09-14) | 1 each | DONE |

**Off-dispatcher:** `f1` hourly poll idle all day (`2026 R14 already synced`). Newsletter
09-14: morning pushed 57, evening appended 3, then the mini's hand re-push under the new
age and per-publication rules left 34 (`digest_run` 09-14 `item_count` 34, confirmed in Supabase).
**Healthchecks: 20 of 20 `up`** (API read this run).
**GitHub Actions:** one failure in window, WWC tracker `34842544506` (Self-healed 2). Every
run since 17:41Z green. The stuck `Test` run `34749326870` (09-13) is still `queued`: harmless.
**ntfy (topic cache, last ~12h visible):** ops-autofix x2 (14:18, 16:16Z), football UNMATCHED
(17:08, 23:02Z), Owners weekly (18:02Z). Nothing unexplained.

## Self-healed (informational only, no action needed)

**1. gap-league-watch: a NOT NULL column, fixed by migration, verified.** At 05:03Z the upsert
to `football_league_watch` was rejected with HTTP 400, Postgres `23502`: `null value in column
"target_season"`, failing row `World, 16, CONCACAF Champions League, null`. `26987d2ee` added
World 16/27/536 with `target_season: null` (correct, since `ready_on: window` ignores it). One
bad row sank the whole batch, so all four leagues went unwritten. ops-autofix re-ran it at
06:27, 08:21 and 10:16Z (same error each time) and then stood down at its 3/day cap. The mini
session applied migration `football_league_watch_target_season_nullable` (HANDOFF 09-14 mini A),
and the 17:40Z re-run wrote all 4. **Verified read-only this run:** Supabase rows 283/284/285
carry `target_season` null, `last_checked 2026-09-14 17:40:46Z`; ISL (id 9) still
`awaiting_target` (2025 is the latest api season). The next scheduled run, 05:00Z today, is the
first unattended one since the fix.

**2. WWC tracker: second Wikipedia parse fault, fixed.** The 12:16Z run exited 2:
`PARSE FAILURE: Final box has a score (97-79) but no teams` (the played final bolds the winner's
cell). Fixed in `f1b438170`, and dispatch `34876273431` committed `8f43c6971` (USA 97-79 France;
Spain 81-58 Germany for third, matching the real result recorded in yesterday's sweep).

**3. Yesterday's watch items all landed.**
- **Majors:** the 09-14 run recorded the US Open. Supabase `tennis_majors` 2026 now has
  **Zverev (M)** and **Rybakina (W)** at US Open (commit `6871c2a9d`). The 09-13 miss did not
  recur, so no `--debug` investigation is needed. The new rows carry `venue` and `career_no`
  null, the same as the existing 2026 Wimbledon rows, so this is not new.
- **owners-weekly:** the 08:30Z no-token run correctly saved a patch and did not push. It was
  superseded by `0cd37969a` (owners read at runtime) and a hand re-run applied `d926034f1` under
  `[vercel skip]`, then revalidated. The morning patch was retired to `.applied-d926034f1`.
- **business-daily** (`build_leaders.py` first run): DONE 363s, `/business/leaders` warmed 200.
- **Newsletter first morning move:** 12 evening items moved 09-13 -> 09-14 as designed.

## Needs Ashwin's attention

Nothing new broke. Two carried-over items remain:

### 1. The build budget sat at 2 of 2 on 09-14, and the cap is still off

Vercel API, production, 09-14 UTC: **2 paid builds, both READY, 0 ERROR**, everything else CANCELED.
- 10:49Z `6871c2a9d` majors-update-bot "Auto: record new major champion(s)". Untagged by design,
  because `public/data/majors` is build-time.
- 17:18Z `0cd37969a` Ashwin, owners runtime read (intended, release note included).

That is within budget. But the automated majors commit spends a build whenever a champion lands,
with no cap behind it, so any hand deploy the same day goes over.

**Fix (unchanged from 09-13/09-14):** add `VERCEL_BUILD_CAP_TOKEN` (read scope) to project
`metro-power-rankings` (`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`), Production, build-time. The next
build log should print a count instead of `build cap inactive`. `VERCEL_TOKEN` in `config.env`
is **no longer needed** for owners-weekly (HANDOFF 09-14 later).

### 2. The football UNMATCHED ntfy continues 4x/day until the Lookup edit (already scheduled)

All 5 runs logged `unmatched=45` with the same 45 ids, and fixtures are displaying under api names
(`68eeb6360`). Kept on purpose as your reminder. The work is scheduled for **Fri 2026-09-18
10:00 BST on the Windows box**: triage sheet at
`~/metro-mini-jobs/pending/unmatched-afc-caf-clubs-2026-09-14.xlsx` (15 need only `API Name`,
30 are new rows; TP Mazembe needs `API Name` on row 139465 because of the AMBIG trap). Sync via
the `cl-lookup-sync` skill, **not** `sync_lookup.py`. No action before then. Nothing in this
window changed the count.

### Minor, optional: ops-autofix re-runs deterministic Actions failures

On 09-13 and 09-14 it spent all three reruns on a WWC parse failure (exit 2, `PARSE FAILURE`),
which no rerun on the same commit can fix. That cost 3 ntfys a day and Actions minutes. The cap
held, so nothing is broken. If you want less noise: in `fix_action_failed`
(`mac-mini-jobs/run-ops-autofix.sh:230`), skip the rerun when the run has already been attempted
once (`gh run view --json attempt` > 1 with conclusion failure), and report it for a human instead.

## Watch today (09-15), no action unless the trigger fires

- **gap-league-watch 05:00Z**, first unattended run since the migration. **Trigger:** any FAIL.
- **Newsletter 08:00 BST**: look for `N of M kept after the age and per-publication rules` in
  `~/newsletter-podcast/logs/2026-09-15.log`; the evening run is the first under the
  REAL-HEADLINES-ONLY rule. **Trigger:** `nothing pushed`, or a source over 6.

## Standing

- Notion MCP is **not authorized** in this headless session, so the Backlog and Silent failure
  register were not read here. Authorize with `/mcp` interactively on the mini if sweeps should use it.
