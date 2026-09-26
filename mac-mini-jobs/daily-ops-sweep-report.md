# Daily Ops Sweep -- 2026-09-26

Window: 2026-09-24T23:06Z to 2026-09-26T01:05Z (trailing 26h), run read-only on the Mac mini.
Rolling snapshot: this file is rewritten every run, never appended.

## Jobs this window: 185 ok, 1 failed, 3 flagged

**Dispatcher jobs (186 runs, 20 distinct ids, 0 MISSED):**

| job | runs | result |
| --- | --- | --- |
| deploy-watch | 148 | all DONE, every one "up to date" |
| ops-autofix | 13 | all DONE (12 "no findings", 1 acted on feed-monitor) |
| football-standings | 4 | all DONE, pushed live bundles each time |
| claude-auth-canary | 4 | all DONE, refresh token valid to 2026-10-08, 12.1 days left |
| mlb-sim | 2 | DONE 457s / 450s |
| **feed-monitor** | **1** | **FAIL exit 1** -- see "Self-healed" item 1 |
| activity-feed, business-daily, cfb-fri, cricket-champions, economy-rates, euro-comps, forecast, gap-league-watch, git-maintenance, nfl-elo, notion-reconcile-verify, predictions-fri, substack-daily, daily-ops-sweep | 1 each | all DONE |

**Not dispatcher-owned, checked separately:**
- `f1-weekly` (launchd, hourly): 26 runs, all "idle: 2026 R14 already synced". Healthy, see below.
- `newsletter-podcast`: daily 08:27Z done (episode live, 41 morning items pushed, Gmail drafts created), evening 20:02Z done (7 items appended, day holds 48), watchdog 09:30Z "final.mp3 present and episode READY on Spotify. Healthy", retention 12:00Z deleted 1 episode older than 7 days as designed. No alerts.

**Alert scan of individual job logs (Step 2):** no in-script `push()` fired this window other than the feed-monitor failure path. gap-league-watch logged "no state transitions this run" on all three of its runs; cricket-champions "0 new champion(s)"; euro-comps and substack-daily both "no change, nothing to commit"; economy-rates reported three new policy-rate decisions (bis-xm, bis-br, bis-us) which is normal output, not an alert.

## Self-healed (informational only, no action needed)

**1. feed-monitor FAIL at 07:30Z -- ESPN PGA probe, already diagnosed and fixed.**
The probe returned `ESPN PGA scoreboard: golf competitor missing 'athlete' (ESPN shape change?)`. ops-autofix re-ran it at 08:22Z and it failed again, correctly standing down ("leaving it failed for a human"). It was not a shape change: the 2026 Presidents Cup teed off that morning, and team match play has competitors of `type: team`/`pair` carrying a `team` object and no `athlete`. A session fixed it the same morning (`498756518`, 08:23Z), and the slot was flipped to `ok (manual)` at 08:24Z.

Verified live during this sweep rather than assumed: fetching the real endpoint and calling the current validator returns
`('ok', 'Presidents Cup: team match play, 2 sides (post); not rendered by the site, which shows majors only')`.
The mini's `feed_shape_monitor.py` is byte-identical to the repo copy (it is a real file, not a symlink, so this was checked). feed-monitor is daily at 07:20Z, so its next unattended run is ~07:20Z today and should pass. Nothing for Ashwin to do.

**2. The fourteen duplicate launchd agents -- retired mid-window.**
Evidence found before reading HANDOFF: gap-league-watch ran three times on 09-25 (04:00Z, 05:00Z from launchd; 05:07Z from the dispatcher) against one dispatcher slot, and `/tmp/gap-league-watch.out` plus the `launchd-euro-comps.*` and `launchd-substack-daily.*` files confirm those plists were genuinely executing. The retired `gap-league-watch.plist` carries `StartCalendarInterval: [{Hour:5},{Hour:6}]`, exactly matching the stray runs. This is HANDOFF section BA: at Ashwin's instruction all fourteen were `launchctl bootout`ed at 08:32Z on 09-25 and the plists moved to `~/Library/LaunchAgents/retired/`.

Confirmed resolved: `launchctl list` now shows only `dispatcher`, `heartbeat` and `f1-weekly`; no launchd output file has been written by any retired agent since 09-25 09:32 local. No duplicate runs today.

**3. Release notes for 2026-09-25 -- written, gate is green.**
Yesterday's sweep warned this would become a hard `npm run verify` failure from 00:00Z today. It was written (`5884897ba`). Ran the check read-only this morning: `check:release-notes - OK (148 entries, newest 2026-09-25)`. No action.

**4. F1 "R14 already synced" is correct, not stale.**
The hourly poller has reported R14 for two weeks, which reads like a stuck sync. It is not. Queried Jolpica read-only: 2026's last race with results is genuinely **round 14, Spanish Grand Prix, 2026-09-13**. Round 15 (Azerbaijan) is **today**, and the calendar has 23 rounds. The poller will pick it up within ~1h of Jolpica publishing. No action.

**5. Vercel production builds are within budget this window.**
09-25 UTC: exactly **2** paid production builds (both READY, 0 ERROR) -- at the 2/day budget, not over. 09-26 UTC so far: **0**. Every other push in the window shows `CANCELED`, which is the free skip. Counted with the Vercel API per CLAUDE.md, not from GitHub deployment events. This is a sharp improvement on 09-24's eight. But see finding 1 below: it stayed in budget by luck of the commit mix, not because anything enforced it.

## Needs Ashwin's attention

### 1. The 2/day Vercel build cap is STILL not armed (7th day flagged, and it is the only thing standing between a quiet day and a seventh overage)

**What happened.** Nothing failed. The cap simply is not running, so the 2/day limit remains a convention rather than code, exactly as it was when the 09-24 burst spent 8 paid builds.

**Root cause.** `scripts/vercel-ignore.sh`'s `builds_today()` returns empty when `VERCEL_BUILD_CAP_TOKEN` is absent, and line 111 then takes the "cap inactive" branch and lets the build through unconditionally. The code is correct; only the token is missing.

**Evidence (primary, not inferred).** Build log of `dpl_EL7Qo1SgG7gyiPKuine59xDf2jQn` (commit `5884897ba`, 2026-09-25T09:39Z), the most recent paid production build:

```
Running "sh scripts/vercel-ignore.sh"
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
```

**Recommended fix.** Add a Vercel **read** token to the project's build environment as `VERCEL_BUILD_CAP_TOKEN` (Vercel dashboard, project `metro-power-rankings`, `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team `team_yQjbuPwcr40J6AxkjCv6AawD`, Settings > Environment Variables, Production). The next build's log line then reads `vercel-ignore: N paid production build(s) so far today (cap 2)` instead of "inactive", which is the one-line way to confirm it took. Nothing in the repo needs changing.

**Note on why I could not check it any other way:** the Vercel MCP token in this session gets 403 on `projectEnvVars` (`You don't have permission to list the project environment variable`), so the build log is the only read-only proof available to an unattended run. That is fine as a method, but it means the cap can only ever be confirmed *after* a build has already been spent.

**Also checked, and NOT a problem:** the same build log shows `vercel-ignore: base '5e7377c43...' unreachable; falling back to HEAD^`. That is the intended intermediate fallback at `scripts/vercel-ignore.sh:145-148`; the real fail-closed path is lines 149-152 (`no usable base at all; skipping rather than building`). The guard behaved correctly here.

### 2. `run-activity-feed.sh` still does `git pull --rebase --autostash` -- the exact mechanism behind the 2026-09-24 multi-job outage

**What happened.** Nothing this window; activity-feed ran once at 02:36Z and DONE'd clean. This is a live latent fault, not an incident.

**Root cause.** On 09-24 this script's `git pull --rebase --autostash` stashed a dirty tracked file, conflicted on re-apply, and exited 1 **without cleaning the index**, converting a recoverable "local changes would be overwritten" into `unmerged files`. That killed five more jobs over 3.5 hours while ops-autofix correctly stood down on `working_tree_dirty`. HANDOFF sections AZ and BB name the class fix and explicitly leave it undone.

**Evidence.** Verified against the live file rather than taken from HANDOFF:

```
mac-mini-jobs/run-activity-feed.sh:16  require_main_branch "the activity-feed refresh"
mac-mini-jobs/run-activity-feed.sh:19  git pull --rebase --autostash -q origin main || { echo "git pull failed"; exit 1; }
mac-mini-jobs/run-activity-feed.sh:36  git pull --rebase --autostash -q origin main || true
```

Section BE gave this script the branch guard (line 16), but the autostash was not touched. Line 36's `|| true` is the worse of the two: it swallows the failure entirely.

**Recommended fix.** Move both call sites onto `runners/_common.sh`'s `mini_sync`, which refuses rather than half-merging. `run-activity-feed.sh` does not currently source `_common.sh`, so this is a small refactor, not a one-line swap, and it changes an Active job's behaviour -- so it wants a worktree test with a deliberately dirty tracked file (the control being the current script leaving `unmerged files` behind), in the style of the BD/BE/BF harnesses. Worth pairing with the conflicts-monthly restore-on-failure work already done in `BC`, since it is the same failure class.

### 3. HANDOFF section BA retired fourteen scheduled jobs and closed with `**Notion:** none`

**What happened.** Section BA is the entry that `launchctl bootout`ed fourteen agents and moved their plists. Its closing line is:

> `**Notion:** none by this entry. Worth filing on the next pass: a Backlog row to validate conflicts-monthly before 2026-10-01, and one to teach --check-sync about launchd.`

**Why this matters.** CLAUDE.md's Notion contract states in red that *"an entry whose subject IS a scheduled job can almost never close with `none`"*, and gives retiring or changing a job on any machine as the canonical example. BA changed the real execution path of fourteen Active jobs, so fourteen Scheduled jobs rows are the queryable record of that change and, if BA wrote none of them, they still describe a second scheduler that no longer exists. The two Backlog rows BA said to file also appear not to have been filed.

**Evidence.** HANDOFF.md, section BA closing line (the entry pushed as `25c0afd9a`). Sections BC, BD and BE each *do* carry verified row updates, so this is specific to BA, not a general lapse by those sessions.

**Recommended fix.** In one pass: set Last verified and a "plist booted out 2026-09-25, dispatcher is now the only scheduler" note on the fourteen Scheduled jobs rows (activity-feed, conflicts-monthly, cricket-monthly, cricket-weekly, deploy-watch, egress-refresh, euro-comps, feed-monitor, fiba-weekly, gap-league-watch, rugby-weekly, screen-number-ones, sound-weekly, substack-daily), and open the two Backlog rows BA named. Note the traps BE recorded: the f1 row is titled "F1 weekly sync", and deploy-watch's note has already hit Notion's 2000-character per-item limit and is split across items.

**Caveat, and it is the reason this is a recommendation rather than a finding of fact:** I could not verify any of it. See below.

### 4. Capability gap: this sweep cannot see Notion, so the contract's daily backstop has a blind spot

The Notion MCP server is not authorised in a headless `claude -p` session, so I could not read Backlog, Decisions or Scheduled jobs to confirm finding 3, or to do the start-of-session row read the contract asks for. Yesterday's sweep hit and reported the same wall, which makes it a standing limitation rather than a one-off.

`notion-reconcile-verify` ran clean at 08:22Z and confirmed the reconciler logged 09-24, so the separate cloud reconciler is alive and should independently check 09-25's entries (including BA's `none`) today. That is the existing backstop and it is working. But it means two of the three daily Notion checks are cloud-side and this one is blind.

**Recommended fix if you want sweeps to reconcile against Notion:** authorise it once interactively on the mini (`claude mcp` or `/mcp`), per CLAUDE.md's own instruction for adding the Notion MCP there. If headless sessions cannot hold that auth, the honest alternative is to drop the expectation and let the cloud reconciler own it, rather than leaving it ambiguous.

## Housekeeping observed, nothing to do

- No `MISSED` slots in the window. Dispatcher lateness peaked at 12 minutes (notion-reconcile-verify, 08:10Z slot) and is otherwise 0-10 minutes, which is normal tick lag.
- Shared clone is on `main` and clean; no `.mini-wrong-branch` stamp.
- `git-maintenance` ran at 03:07Z: 4683 loose objects, threshold 6700, no repack needed.
- `~/metro-mini-jobs/pending/` holds only `.applied-*` files plus the 09-14 unmatched-clubs CSV/XLSX; `quarantine/` holds one zero-byte lock from 09-20. Neither is growing.
- `mktcap-refresh` is Saturday 09:00Z and had not yet run at sweep time (today is Saturday, so it is due in ~8h). Not a miss.

---
*Written by the unattended daily ops sweep. Report-only: no job was re-run, no data written, no healthchecks pinged. The only file this run changed is this one.*
