# Daily Ops Sweep -- 2026-09-12

Window `2026-09-10T23:02Z` -> `2026-09-12T01:02Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, no Supabase write, nothing fixed. This report
file is the only thing committed.

## Jobs this window: 35 ok, 0 failed, 3 flagged

**Dispatcher occurrences: 35 DONE, 0 FAIL, 1 MISSED** (plus this sweep, in flight).
The first FAIL-free window in some time.

| when (UTC) | job | result |
|---|---|---|
| 09-10 23:08 | football-standings | DONE 100s |
| 09-11 00:20 | ops-autofix | DONE 3s |
| 09-11 00:30 | claude-auth-canary | DONE 0s |
| 09-11 01:00 | daily-ops-sweep | DONE 610s |
| 09-11 02:20 | ops-autofix | DONE 2s |
| 09-11 02:31 | activity-feed | DONE 5s |
| 09-11 04:01 | euro-comps | DONE 5s |
| 09-11 04:21 | ops-autofix | DONE 2s |
| 09-11 05:01 | gap-league-watch | DONE 3s |
| 09-11 05:01 | football-standings | DONE 101s |
| 09-11 05:53 | business-daily | DONE 337s |
| 09-11 06:08 | substack-daily | DONE 4s |
| 09-11 06:19 | forecast | DONE 329s |
| 09-11 06:24 | ops-autofix | DONE 2s |
| 09-11 06:34 | claude-auth-canary | DONE 0s |
| 09-11 07:04 | mlb-sim | DONE 438s |
| 09-11 07:22 | feed-monitor | DONE 16s |
| 09-11 07:32 | **economy-rates** | **DONE 348s -- but fired an EMPTY ntfy, see item 2** |
| 09-11 08:18 | ops-autofix | DONE 2s |
| 09-11 10:18 | ops-autofix | DONE 2s |
| 09-11 11:08 | football-standings | DONE 104s |
| 09-11 11:40 | predictions-fri | DONE 433s |
| 09-11 11:47 | cfb-fri | DONE 394s |
| 09-11 12:24 | ops-autofix | DONE 2s |
| 09-11 14:24 | ops-autofix | DONE 2s |
| 09-11 14:34 | mlb-sim | DONE 450s |
| 09-11 16:22 | ops-autofix | DONE 3s |
| 09-11 17:02 | football-standings | DONE 95s |
| 09-11 18:23 | ops-autofix | DONE 2s |
| 09-11 19:23 | nfl-elo | DONE 334s (first mini run, 684m late -- benign, §3) |
| 09-11 20:19 | ops-autofix | DONE 2s |
| 09-11 22:19 | ops-autofix | DONE 2s |
| 09-11 23:09 | football-standings | DONE 105s |
| 09-12 00:21 | ops-autofix | DONE 2s |
| 09-12 00:31 | claude-auth-canary | DONE 0s |
| 09-12 01:01 | daily-ops-sweep | this run |

**1 MISSED slot:** `economy-prices` (slot 09-06 07:30Z, 7914m late) at the 19:29Z
tick. Benign new-job artefact, explained in Self-healed §2.

**Off-dispatcher on the mini:** the `f1-weekly` poller ran hourly all window,
every run `idle: 2026 R13 already synced`. Correct, not stale -- R13 is the
Italian GP (2026-09-06) and R14 (Spanish GP) is tomorrow, 09-13, per
`mac-mini-jobs/f1-data/schedule_2026.csv`. `newsletter-daily` ran clean at 07:00Z
and published (episode `2qsW3z25GnvpM2eMYV9Xzp`, 41:01); its healthchecks tile
recovered with it (§1).

**Healthchecks: 20 of 20 checks, every one `up`** (read via the API this run).
The project is at its hard cap, which is why `economy-prices` has no tile -- see
the note under item 2.

**GitHub Actions: 90 runs in window, 0 failures** (89 success, 1 skipped).

**Vercel: 5 paid production builds on 09-11 UTC against a 2/day budget.** This
is item 1 and the main thing in this report. So far on 09-12 UTC: 3 deployments,
all `CANCELED` (free), **0 paid builds**. Release notes for 09-11 are present in
`lib/releases.ts`; 09-12 has shipped only `[vercel skip]` automation so far, so
nothing is owed yet. The push-ordering trap did **not** bite: the 19:00Z push of
19 commits had `5640996d0`, a real app commit, as HEAD, and it got its own
`READY` deployment.

## Self-healed (informational only, no action needed)

**1. `newsletter-daily` healthchecks tile was down; the 09-11 run cleared it.**
`ops-autofix` reported `[high] check_down -- healthchecks tile newsletter-daily
is down (last ping 2026-09-10T07:00:03+00:00)` on its 00:20Z run and notified
once, then correctly suppressed the repeat on 02:20Z, 04:20Z and 06:24Z ("same
unfixable finding(s) as the last run -- not re-notifying"). This was the tail of
the 09-10 newsletter failure recovered by hand, already in HANDOFF. The 09-11
07:00Z run succeeded end to end -- narration, 16 TTS chunks, cover, Spotify
episode `READY`, both Gmail drafts -- and pinged at 07:19:01Z. `ops-autofix` was
clean from 08:18Z onward and has stayed clean for 10 consecutive runs. The tile
reads `up` now. Nothing to do.

**2. `economy-prices` MISSED its 09-06 slot because it did not exist yet.**
The job was deployed on 09-11 (commit `203c464a9`, 17:43Z, which shipped the
Prices tab, `build_prices.py`, the runner and the jobs.toml entry). Its first
dispatcher tick computed the most recent Sunday slot, 09-06 07:30Z, found it
7914m late, correctly declined to fire a stale slot past its 40h catch-up window
and skipped forward. `state.json` now holds `last_slot 2026-09-06T07:30:00+00:00,
last_status missed`, so the next genuine slot is **Sunday 09-13 07:30Z**. The data
itself is fresh -- `public/data/business/economy/prices/index.json` was built and
committed 09-11 17:43Z. This is the identical shape `economy-rates` (09-04 slot)
and `economy-housing` (09-05 slot) each produced on deployment; it needs nothing.
The ntfy you saw for it is the dispatcher doing its job.

**3. `nfl-elo` ran 684 minutes late, and that was the catch-up working.**
Also deployed 09-11 (commit `8966c4218`, 16:29Z), moving the live Elo refresh off
GitHub Actions onto the mini after GitHub's cron fired 09-08 four hours late and
skipped 09-11. Its 08:00Z slot had already passed when the job first became
visible, so the dispatcher caught it up at 19:23Z -- 11h24m late, inside the
14h `catchup_hours`. Output is correct: `reg_end_week` reads 18 (the `34beaf835`
fix from earlier that day, which had the updater writing the last week PLAYED as
the season's end), the 49ers carry a week-1 result dated 2026-09-10 and teams
that have not played yet carry only their week-0 seed. That is right for a
season whose Thursday opener was 09-10 with the first full Sunday on 09-13.
Next run is today, 08:00Z, on time.

**4. The retired NFL Action and the mini both ran on 09-11. One day only.**
`NFL live Elo refresh` shows a `schedule` run at 13:40Z and the mini's run at
19:23Z on the same day. Not a double-run going forward: the Friday cron fired
before commit `8966c4218` commented the `schedule:` block out at 16:29Z.
`workflow_dispatch` remains as the manual fallback, which is what the migration
intended. The mini ran last, so its output is what is published. No conflict.

## Needs Ashwin's attention

### 1. 🔴 The 2/day Vercel build cap is INACTIVE, and 09-11 cost five paid production builds

**What happened.** Five paid production builds ran on 2026-09-11 UTC against a
budget of two:

| # | commit | deployment | state |
|---|---|---|---|
| 1 | `647310a5a` 09:33:21Z | (build `9zuTiF2CBmGM2TLhxHoQBAp98Fes`) | **ERROR** -- `RELEASE_NOTES_VIOLATION`, 276-char bullet |
| 2 | `770368de1` 09:40:13Z | `dpl_AXMhPsxXQp4Fekb5iWosLwRmCAYB` 09:40:16Z | READY |
| 3 | `441f2be5a` 09:52:55Z | `dpl_49x2FnwJhmRGXiGQvqgyt54hEZq4` 09:53:05Z | READY |
| 4 | `2a32e0068` 09:54:22Z | `dpl_DC1EGfqkFKtL9cXGbG3iLDrpR8Ko` 09:54:32Z | READY -- `[deploy-now]` |
| 5 | `5640996d0` 19:00:52Z | `dpl_EuVWNXqzohWaBSxMk5FVpLBjvT9i` 19:01:15Z | READY -- the 19-commit push |

A failed build is not a free build: #1 spent the minutes and produced nothing.

**Root cause, from the build logs themselves rather than inference.** Every one
of these logs the same line before deciding:

```
19:01:34  Running "sh scripts/vercel-ignore.sh"
19:01:34  vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
19:01:34  vercel-ignore: build-relevant change in 5640996d0^..5640996d0; building
```

Verified on two separate builds (the 09:53:05Z one prints it identically), so it
is the persistent state, not a transient API failure. `VERCEL_BUILD_CAP_TOKEN` is
not present in the project's build environment, so `builds_today()` never runs and
`MAX_DAILY_BUILDS` is never applied. **The 2/day budget is still a promise, not
code**, despite the 2026-09-09 work that was meant to make it code.

**This is a known open item, not a new bug** -- HANDOFF section E of 2026-09-09
and section B of 2026-09-11 both record it as waiting on you, and the same
`b59c61a14` build log said so on 09-10. What is new is that it has now measurably
cost a day: three builds over budget.

**One correction to the record.** HANDOFF 2026-09-11 section B counted four paid
builds. The day finished at **five** -- the 19:00Z push added `5640996d0` at
19:01:15Z, after that entry was written. Section B is otherwise exactly right,
including the sharpest part of it: build #4 was pushed `[deploy-now]` on the
reasoning that the cap had skipped `441f2be5a`, and it had not -- `441f2be5a`
built normally at 09:53:05Z, so the override rebuilt an identical tree for
nothing. With the cap inactive that reasoning could never have held, because
nothing was ever being skipped.

(Times in HANDOFF section B read `10:53Z`/`10:54Z`; the API `created` values and
the git committer dates both put these at 09:53:05Z and 09:54:32Z UTC. The
HANDOFF times look like BST labelled as Z. Cosmetic, but worth knowing if you
reconcile the two.)

**Recommended fix (yours, needs the Vercel dashboard -- I made no change).**
1. Create a read-scoped token at <https://vercel.com/account/tokens>.
2. Add it to project `metro-power-rankings`
   (`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team `team_yQjbuPwcr40J6AxkjCv6AawD`) as
   `VERCEL_BUILD_CAP_TOKEN`, **Production, build-time**.
3. Confirm on the next app commit that the build log says the cap is active and
   prints a count instead of `build cap inactive`. That line is the whole test,
   and it is in every build log, so it costs nothing to check.

Until that is done, assume every app commit that lands on `main` builds, and keep
batching by hand.

### 2. 🔴 `economy-rates` sends a "Policy rate decisions" ntfy with an EMPTY body, every time

**What happened.** The 09-11 07:32Z run finished clean (`DONE 348s`, healthcheck
green) and pushed a real notification, but with no content. From dispatcher.log:

```
2026-09-11T07:38:14Z | [2026-09-11 08:38:14] New rate decisions detected:
2026-09-11T07:38:14Z | [2026-09-11 08:38:14]
2026-09-11T07:38:14Z | [2026-09-11 08:38:14] done
```

The heading printed, the summary was blank, and `notify.py` was then called with
that blank string as the body. So you received a push titled "Policy rate
decisions" that did not say which bank moved or by how much -- which is the
entire content the alert exists to deliver.

**Root cause: an off-by-one-line awk bug, and it is deterministic.**
`mac-mini-jobs/runners/economy-rates.sh` extracts the summary with:

```awk
awk '/^NEW RATE DECISIONS$/{f=1;next} /^={10,}$/{if(f){f=0}} f'
```

`scripts/macro/rates/refresh.py:756-764` prints the block as a **rule, heading,
rule, rows, rule**:

```
============================================================
NEW RATE DECISIONS
============================================================
  bis-nz: 2026-09-03 -> 2.7500% (+0.2500 pts)
============================================================
```

So the line immediately after the heading is the 60-character underline. The awk
sets `f=1` on the heading, then the very next line matches `/^={10,}$/` and sets
`f=0` before a single row is ever printed. The extraction therefore returns the
empty string **whenever there are decisions to report** -- it cannot succeed. This
is not an intermittent fault and it is not "there were no decisions": the `grep -q
"NEW RATE DECISIONS"` that gates the whole block only matches when `refresh.py`
found decisions (`if decisions:` at line 756), so a fired alert always means real
content existed and was thrown away.

**Recommended fix** -- skip the underline, and only close the block on the rule
that comes *after* content:

```bash
SUMMARY="$(awk '/^NEW RATE DECISIONS$/{f=1;n=0;next}
                f&&/^={10,}$/{if(n)f=0;next}
                f{print;n++}' "$REFRESH_LOG" | sed 's/^  //' | head -8)"
```

Worth doing two more things in the same change:
- **Guard against sending an empty push at all.** `[ -n "$SUMMARY" ]` before the
  `notify.py` call, falling back to a generic "decisions found, see the log" body
  rather than silence. A notification whose body is empty is worse than no
  notification, because it reads as noise and trains you to ignore the topic.
- The sibling unreachable-sources block just below it uses
  `awk '/source\(s\) unreachable this run/{f=1} f'`, which prints to EOF and is
  **not** affected by this bug. Leave it alone.

**Not self-healing.** `economy-rates` is Friday-only, so the next run is
**09-18 07:30Z**, and the ECB hike announced 09-10 takes effect 09-16 -- meaning
the very next run is the one most likely to have a real decision to report, and
it will report it blank. Worth fixing before Friday.

**Related, lower priority:** `economy-prices` is the only one of the three
economy jobs with no `hc_slug`. That is forced, not an oversight -- healthchecks
is at exactly 20 of 20 checks and the 09-11 pair of tiles was already paid for by
deleting two others. The dispatcher does ntfy this job's failures and missed
slots (it did on 09-11), so the gap only matters if the dispatcher itself stops.
Flagging it because the two siblings shipped the same day and got tiles, and this
one silently did not. Candidate for the Silent failure register rather than an
action.

## Standing items unchanged this window

- **mktcap metro curation queue is still ~40 deep.** `mktcap-refresh` last ran
  09-05 09:00Z; its next slot is today, 09-12 09:00Z, which regenerates the queue
  file from Supabase (nothing is lost).
- **`economy-housing` has its first genuine run today**, 09-12 07:30Z. Worth a
  glance at tomorrow's sweep to confirm it fired.
