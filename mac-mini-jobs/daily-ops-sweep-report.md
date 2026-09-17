# Daily Ops Sweep -- 2026-09-17

Window `2026-09-15T23:04Z` -> `2026-09-17T01:04Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, nothing fixed. This file is the only thing committed.

## Jobs this window: 37 ok, 1 failed, 1 flagged

**Dispatcher: 37 DONE, 1 FAIL, 0 MISSED** (plus this sweep, in flight).

| job | runs | result |
|---|---|---|
| ops-autofix | 13 | all DONE. Findings: AFL+NRL Action rerun x3 (00:23Z, 02:24Z, 04:24Z, stopped at the attempt cap), mlb-sim rerun 08:23Z (failed again, see Self-healed 1), WNBA Action rerun 14:20Z. Other runs: no findings |
| claude-auth-canary | 4 | DONE; refresh token valid to 2026-10-08 (21.1 days left, alert at 3) |
| football-standings | 4 | all DONE; every run still `unmatched=45`, so the UNMATCHED ntfy fired each time (known, see Attention 2) |
| screen-number-ones | 3 | DONE; "no number-ones change this week" x3, nothing committed |
| mlb-sim | 2 | **FAIL 07:09Z** (`failed leagues: afl, nrl`), then DONE 14:30Z 450s |
| activity-feed, euro-comps, gap-league-watch, business-daily, forecast, substack-daily, fiba-weekly, feed-monitor, sound-weekly, nfl-elo, cfb-wed, daily-ops-sweep (09-16) | 1 each | DONE |

**Job logs checked for pushes from DONE jobs:** gap-league-watch has 4 leagues `awaiting_target`
and `no state transitions`, so no league-ready push. fiba: no ranking change (men 2026-09-01,
women 2026-04-01). substack: no new posts. euro-comps: 30 fixtures committed. f1 hourly poll idle
on `2026 R14 already synced`, which is still correct (no race since Madrid, 11-13 Sep).
Nothing else pushed an ntfy beyond UNMATCHED.

**Newsletter (~/newsletter-podcast):** 09-16 morning pushed 44 of 57 (per-publication cap) and
published the Spotify episode; 09:30 watchdog `Healthy`; 12:00 retention deleted the one episode
older than 7 days (2026-09-08), 0 failed; evening appended 4 of 12 (8 skipped on the 6-per-
publication cap), day holds 48. Normal.

**GitHub Actions in window:** 3 failed runs, all the ESPN date-range break, all now green (Self-healed 2, 3).
Every run since 14:23Z 09-16 is `success`.

**Vercel, 09-16 UTC:** 1 paid build (READY `de5721381`, 08:33Z), within the 2/day budget. Every
other deployment that day was CANCELED `[vercel skip]`. 09-17 so far: 0 paid.

## Self-healed (informational only, no action needed)

**1. mlb-sim FAIL 07:09Z: healed by the ESPN fix, and the 14:30Z run was clean.** This is exactly
what yesterday's sweep predicted: ESPN started rejecting hyphenated `dates=A-B` ranges with HTTP 400,
and `build_season_sims.py` failed AFL and NRL. The other five leagues still built and committed
(`857a5a840`). ops-autofix's 08:23Z rerun failed too, and that was expected: it started 8 minutes
before the fix landed. A mini session pushed `e7c8ab06b` at 08:32Z (`[vercel skip]`), which moved
every Python caller to season, month or per-day queries. It then ran mlb-sim by hand (`750dff2b0`
08:35Z regenerated `afl-sim.json` and `nrl-sim.json`) and marked the slot
`MARK-OK ... 'ok (manual)'` at 08:41Z. The scheduled 14:30Z run was DONE with no failed leagues.
Its commit `1230f7de0` does not touch the AFL/NRL files, and that is correct rather than stale: both
already carry `generated_at: 2026-09-16`, and no games had been played in between.

**2. AFL + NRL season refresh: green again.** Run `35038445464` failed at 00:04Z. ops-autofix re-ran
it three times and it failed each time (attempt 4, 04:25Z), then stopped at the attempt cap as designed.
A workflow_dispatch at 08:30Z also failed before the fix was pushed. Since the fix it has been
green four times: 08:32Z (dispatch), 10:28Z, 15:45Z and 00:15Z today, and each run
committed. This is well ahead of the deadline yesterday's report set (AFL preliminary finals on 09-18).

**3. WNBA season refresh: a half-applied fix, fixed the same afternoon.** Scheduled run
`35100107025` failed at 13:09Z. In `e7c8ab06b`, `wnba_finalize._windows()` got a new docstring but its
body still built fortnight ranges. On top of that, its self-test asserted the hyphenated form, so
the test would have rejected a correct fix. Fixed in `de5c233a4` (14:23Z): the function now uses
months and the self-test forbids a hyphen. The dispatch run `35108248420` at 14:23Z succeeded.
HANDOFF 2026-09-16 section H has the details. The next scheduled run is 08:00Z today.

**4. The Recent results strip is live again.** `lib/espnScores.ts` and `lib/wc2026Standings.ts`,
which yesterday's report flagged as silently returning `[]`, were moved to per-day and per-month
queries in `de5721381` and deployed READY at 08:33Z. The feed-shape monitor now also has an ESPN
date-form canary (`144bd511b`). A read-only grep finds no live `dates=A-B` callers left: the
only hyphenated range in the tree is in a docstring in the one-off `scripts/parse-espn-wc2026.py`.

## Needs Ashwin's attention

### 1. 09-16 has no release notes entry, so `npm run verify` now fails

**What happened.** `de5721381` ("Recent results and the World Cup readers follow ESPN's dropped
date range") changed `lib/` and shipped to production on 09-16. `lib/releases.ts` still ends at
`2026-09-15`. 09-16 is now an earlier day, so the gate has gone from a warning to a hard failure:

```
check:release-notes - FAIL: 2026-09-16 shipped 1 build-relevant commit(s) and closed with no entry (newest entry is 2026-09-15).
    Recent results and the World Cup readers follow ESPN's dropped date range
RELEASE_NOTES_MISSING
```

**Root cause.** The mini session that fixed the ESPN break wrote a HANDOFF entry but did not add the
public entry in the same commit, as CLAUDE.md requires. The `/updates drift watcher` Action at
14:01Z could not catch it, because until midnight 09-16 was "today" and only warned.

**Consequence.** Every session's `npm run verify` fails until this is fixed. That blocks
any frontend work, and a session may then push with the gate red.

**Recommended fix.** Add a `date: "2026-09-16"` block to the top of `lib/releases.ts`, e.g.
headline "Recent results show every final again", with one bullet:
"The Recent results strip on sports standings shows every final score again, after a data provider change had hidden some of them."
Keep to the build-time limits (4 to 8 word headline, at most 220 characters per bullet, no file names).
`lib/releases.ts` is build-relevant, so a separate commit costs a paid build. **Batch it into the
next commit that ships real app work**, not a standalone push. If nothing else is shipping today,
it is still worth that build to unblock verify. Today (09-17) has 0 paid builds so far.

### 2. Build cap still inactive (carried, one more day of evidence)

The one 09-16 build log shows `vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the
API did not answer)`. 09-16 stayed in budget only by luck. The fix is unchanged from the 09-13 to 09-16
reports: add a read-scoped `VERCEL_BUILD_CAP_TOKEN` to project `metro-power-rankings`
(`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`), Production, available at build time. Then check that the next build log
prints a count.

### 3. Football UNMATCHED ntfy, 4x/day, until Friday's Lookup edit (already booked, no action before then)

All 4 football-standings runs: `unmatched=45`, same set. Booked for **Fri 2026-09-18 on the Windows
box**. Triage sheet: `~/metro-mini-jobs/pending/unmatched-afc-caf-clubs-2026-09-14.xlsx`. Sync with the
`cl-lookup-sync` skill, not `sync_lookup.py`.

## Watch today (09-17), no action unless the trigger fires

- **WNBA season refresh 08:00Z** is the first scheduled run on the fixed `_windows()`. **Trigger:** any
  failure, or a postseason event count of 0.
- **mlb-sim** is the first full day on the new query forms. **Trigger:** anything in `failed leagues`.
- Known gap from HANDOFF 09-16 section H: the date-form canary checks that ESPN's forms still work, not that our
  callers use them. A caller still on the dead form would not be caught. This is worth a row in the Silent failure register.

## Standing

- The Notion MCP is **not authorized** in this headless session, so the Backlog and the Silent failure register were
  not read or updated. Authorize it with `/mcp` in an interactive session on the mini if sweeps should use it.
