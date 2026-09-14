# Daily Ops Sweep -- 2026-09-14

Window `2026-09-12T23:05Z` -> `2026-09-14T01:05Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, no Supabase write, nothing fixed. This report
file is the only thing committed.

## Jobs this window: 35 ok, 0 failed, 5 flagged

**Dispatcher: 35 DONE, 0 FAIL, 0 MISSED** (plus this sweep, in flight). Third
consecutive FAIL-free window.

| job | runs | result |
|---|---|---|
| ops-autofix | 13 | all DONE; **4 had findings**: 04:24 f1 tile down, 12:15 + 14:15 WWC tracker, 16:23 CFL (all in "Self-healed") |
| football-standings | 5 | all DONE; **23:07Z run raised UNMATCHED for 45 teams** (item 1) |
| claude-auth-canary | 4 | DONE, refresh token valid to 2026-10-08 (24.1 days left) |
| mlb-sim | 2 | DONE 442s / 459s |
| daily-ops-sweep (09-13) | 1 | DONE 720s |
| activity-feed, euro-comps, gap-league-watch, substack-daily, feed-monitor | 1 each | DONE |
| business-daily | 1 | DONE 337s, markets + FX pushed, revalidated |
| economy-prices | 1 | DONE 312s, **first genuine scheduled run confirmed** (HANDOFF 09-13 C left its DONE unconfirmed) |
| nfl-elo | 1 | DONE 330s |
| egress-refresh | 1 | DONE 157s; committed build-time data WITHOUT `[vercel skip]` (`cd9bbbbab`, leaders/owners/valuations), a real build, as designed |
| cfb-sun | 1 | DONE 396s |

**Off-dispatcher:** `f1-weekly` synced **R14 Spanish GP** at 20:00Z (Antonelli 292 pts,
title odds 99.8%). Newsletter daily (09-13) published `0PdQ035e6LkvlCRbvsXw6z` (39:19),
watchdog OK, retention deleted the 09-05 episode, both Gmail drafts created. The
**first live evening refresh** (20:00 BST) appended 12 items, 09-13 now holds 46.
Metro weekly **built** "Four seasons, one ledger" (23:30): manual upload still pending.

**Healthchecks: 20 of 20 `up`** (API read this run).
**GitHub Actions:** 3 failed runs in window, all root-caused and recovered (below). One
`Test` run (`34749326870`, on `5668e0142`) has sat `queued` with no jobs since 09-13 09:19Z;
GitHub never scheduled it. Harmless; cancel it if it bothers you.
**ntfy this window (topic cache):** the two ops-autofix reruns, `F1 synced`, and at
23:07Z **`football: unmatched team(s) -- add to Lookup`**.

## Self-healed (informational only, no action needed)

**1. WWC tracker failed on a Wikipedia restructure, fixed the same day.** The 11:23Z
scheduled run exited 2 (`PARSE FAILURE: Final section exists but no game could be read`).
ops-autofix re-ran the same failing commit at 12:15Z and 14:15Z, which could not help.
Fixed in `915c5c011`; dispatch `34763586124` green. Full account in HANDOFF 09-13 mini L.
**Real-world check for today's 06:00Z run:** the final was played on 09-13, **United
States 97, France 79** (fifth straight title). Expect a `[vercel skip]` commit rewriting
the 2026 block of `scripts/basketball/wbasketball_worldcup.txt` with USA/France and the
third-place game.

**2. CFL season refresh: one Supabase 504, recovered on rerun.** Attempt 1 at 16:05Z:
`HTTP 504 upserting cfl_standings: {"message":"Gateway Timeout"}`. ops-autofix re-ran it,
and attempt 2 succeeded at 16:24Z (commit `20dd92fe3`).

**3. `f1-weekly` tile down for one hour: also a Supabase 504.** At 04:00Z (log 05:00 local):
`ERROR: round check failed: ... 'code': 504 ... Gateway Timeout`. ops-autofix reported it
at 04:24Z, correctly without acting, and the 05:00Z poll was clean.
**Pattern worth knowing:** that is three Supabase gateway timeouts in about 36 hours:
09-12 majors `australian-open-womens`, 09-13 04:00Z f1, and 09-13 16:05Z CFL. Each was
a single request that passed on the next attempt. No action; if a fourth shows up on a
write path that has no retry, the pattern becomes a finding.

**4. Last sweep's items: two closed, one partly closed.**
- Item 1 (owners-weekly with no budget check): **closed** by `60d7f885d`. With no token
  the job now fails closed: push is disabled at the git level and it saves a patch.
  Today's 08:30Z run will be in no-token mode (`config.env` still has zero `VERCEL*`
  keys, rechecked). Expect "no changes" or NOT APPLIED plus a patch in `pending/`.
- Item 3 (S&P 500 index changes): **closed**. `55074565a` restored 61 rows, live.
- Item 2 (build cap and merge-commit builds): **partly closed**. `pull.ff only` is set on
  the mini. The guard's merge rule and the cap token are still not done (item 2 below).

**5. The /updates line "archive back to 20 June" is correct. It is not a typo.** HANDOFF
09-13 I says the archive runs from 29 June (75 days). Supabase now reads `digest_run`
**first day 2026-06-20, last 2026-09-13, 83 runs, 1,616 items**, so earlier days were
added later the same day. Recorded so that no later session "corrects" the release note.

**6. `feed-monitor` PGA `empty` is now self-explaining.** `Biltmore Championship
Asheville: not started (0 in field)`. Clears from 09-17 as predicted.
`gap-league-watch`: ISL still `awaiting_target`, unchanged, expected until mid-October.

## Needs Ashwin's attention

### 1. The football job will send an UNMATCHED alert every 6 hours until 45 CAF/AFC clubs are in the Lookup sheet

**What happened.** The 23:06Z `football-standings` run (DONE, 112s) logged
`fetched: standings=2323 fixtures=1800 teams_seen=2157`. Earlier runs read 2237/1167/1938.
It then logged `new teams resolved to Lookup=173 unmatched=45`, and `refresh.py --write`
exited 3. `run-football-standings.sh:47` treats rc 3 as non-fatal: it pushes
`football: unmatched team(s) -- add to Lookup` and carries on exporting. The site data was
still written and committed (`1df34791b`). **The alert fires on every run while any team
is unmatched**, so expect it at 05:00, 11:00, 17:00 and 23:00Z daily. That is the noise
this sweep exists to prevent.

**Root cause.** The Windows session's `26987d2ee` (09-13 21:04Z, "Live trackers carry the
confederation and national-team competitions") added **league 17, AFC Champions League
Elite** and **league 12, CAF Champions League** to `scripts/apifootball/leagues.json`
as `comp_type: continental`. That is the correct classification: `refresh.py`'s self-test
asserts both are club competitions, so their clubs go through the Lookup invariant.
Nothing added those clubs to the Lookup sheet, and the HANDOFF entry for that session does
not mention it. Nothing is wrong with the code. The club list simply has not caught up
with the competition list.

**Checked against the real world:** the clubs are genuine. The 2026-27 CAF Champions League
first preliminary round was played 4-6 Sept (first legs) and 11-13 Sept (second legs).
TP Mazembe, Simba, African Stars, Star Sport Academy, San-Pédro, Nouadhibou and Colombe
(which beat Stade Malien on penalties) all appear in the result reports and in the
unmatched list. The Asian three (`Johor Darul Takzim FC`, `Port`, `Công An Nhân Dân`)
are AFC entrants. `Neftchi` (team_id 4217) is ambiguous by name; confirm which club
api-football means before mapping it.

The 45 team_ids are in `~/metro-mini-jobs/logs/football-standings-2026-09-14.log`, lines
11-55: 4217, 2523, 16400, 4532, 12436, 8103, 26759, 4417, 4447, 24352, 16811, 17447,
20980, 8089, 5357, 28126, 4123, 4521, 8114, 6427, 28124, 5296, 28125, 27264, 25405, 4583,
6432, 6433, 4922, 15286, 5309, 25735, 20372, 5468, 5400, 6434, 6383, 24438, 12255, 6435,
6424, 19863, 6430, 19116, 6419.

**Expect the list to change.** Clubs eliminated in the first preliminary round stay in the
fetched fixtures. The CAF second preliminary round, and later draws, bring in clubs that
had byes (Mamelodi Sundowns, Espérance, RS Berkane), so more unmatched teams are likely.

**Recommended fix (choose one):**
1. **Map them (the intended path).** Add the 45 clubs to the `Lookup` sheet of
   `ChampionsLeague.xlsx` on the Windows box, then sync with the **`cl-lookup-sync`
   skill**. Do **not** run `sync_lookup.py` directly: it is a destructive
   DELETE-then-INSERT mirror and would revert rulings already applied in Supabase. Most of
   these clubs' cities will not be site metros. Decide first whether a Lookup row may carry
   no metro, and follow however existing non-metro continental clubs are recorded.
2. **Stop the noise first, map later.** Take leagues 12 and 17 back out of
   `leagues.json` (a one-line revert of that part of `26987d2ee`, `[vercel skip]`) until the
   Lookup work is done. This loses the CAF/AFC fixtures from the live trackers meanwhile.

Leaving it as is costs nothing in data. The cost is four identical warnings a day, and the
risk that a genuinely new unmatched club, the case this invariant exists for, gets lost
among them.

### 2. Seven paid production builds on 09-13 UTC, and the build cap is still off

**The count, from the Vercel API (READY, production, created UTC):**

| # | time | commit | what |
|---|---|---|---|
| 1 | 07:49 | `55074565a` | S&P 500 restore (your yes) |
| 2 | 09:03 | `cd9bbbbab` | egress-refresh, automated build-time data |
| 3 | 09:17 | `e902e4727` | digest feed on site (your yes) |
| 4 | 10:26 | `cb25a991a` | digest archive (your yes) |
| 5 | 12:06 | `bed0ae366` | homepage tickers (your yes, knowingly over budget per HANDOFF J) |
| 6 | 13:52 | `76e42d721` | `[deploy-retry]` for the Windows standings/digest commit |
| 7 | 21:05 | `838637b8a` | Windows evening batch (5 commits) |

Every other deployment that day is `CANCELED` (free). None `ERROR`. Pages 1-4 of the list
covered back to 05:38Z; the git log before that holds only `[vercel skip]` bot commits.
All seven builds were intended, so this is not a guard failure. It is recorded because
seven against a 2/day budget is the largest day in recent history, and the cap that would
have stopped at two is still unarmed. From the 21:05Z build log of `838637b8a`:

```
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
vercel-ignore: base '76e42d7218c0...' unreachable; falling back to HEAD^
```

The second line is also worth knowing. With about 40 bot commits between two builds, the
last-built sha falls outside Vercel's shallow clone, so the guard judges only HEAD's own
diff. That was harmless here, because HEAD was build-relevant, and it fails closed in the
other direction (a skip that `run-deploy-watch.sh` heals). But it means a multi-commit
push is judged on HEAD alone, which is one more reason for CLAUDE.md's "build-relevant
commit last" rule.

**Still open from last sweep, unchanged:**
- Place **`VERCEL_BUILD_CAP_TOKEN`** (read scope) in project `metro-power-rankings`
  (`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`), Production, build-time. The next build log should
  print a count instead of `build cap inactive`. If you want days like 09-13 to stay
  possible, `[deploy-now]` on the subject is the override.
- The same token as `VERCEL_TOKEN` in `~/metro-mini-jobs/config.env` puts owners-weekly back
  in counted apply-and-push mode.
- The guard's merge-commit rule (last sweep, item 2 fix 2) and `pull.ff only` on the other
  machines are not done.

## Watch today (09-14), no action unless the trigger fires

- **Majors: the US Open champions are not in Supabase yet.** `tennis_majors`' newest US Open
  rows are still 2025 for both genders, and `majors_pending` is empty. The 09-13 10:24Z run
  said `no new champions to record`, although Rybakina had won on 09-12 (last sweep expected
  her on that run). **The ESPN feed reads correctly now:** a read-only GET of the job's own
  14-day windowed ATP/WTA scoreboards at 01:xxZ shows `US Open` with `major=True`,
  Men's Singles final complete (winner **Alexander Zverev**, confirmed: beat Shelton 6-3
  7-6 5-7 6-2 on 09-13) and Women's Singles final complete (winner **Elena Rybakina**).
  Today's run (cron 05:30Z, usually lands ~09:30Z) should record both. It will likely make a
  build-relevant `public/data/majors` commit, which matters for item 2.
  **Trigger:** if today's run again prints `no new champions to record`, the detector has a
  real fault. The cause of the 09-13 miss cannot be read from the log because the workflow
  runs without `--debug` (the `[tennis ...]` lines only print with it). Run
  `python3 scripts/ingest/majors_ingest.py --debug` (dry-run without `SUPABASE_WRITE_KEY`),
  and consider adding `--debug` to the workflow step so the next miss is diagnosable.
- **owners-weekly 08:30Z**: first scheduled run, no-token mode. Expect ntfy "no changes" or
  NOT APPLIED with `~/metro-mini-jobs/pending/owners-2026-09-14.patch`. **Trigger:** any push
  from that job, which would mean the git-level block failed.
- **Newsletter 08:00 BST**: the first unattended `feed.json` plus the first morning "move"
  of last night's evening items (HANDOFF 09-13 F and K). In `~/newsletter-podcast/logs/2026-09-14.log`,
  look for `[push_feed] pushed N item(s)` (about 20-40 now). Also check that 09-13 lost
  exactly the evening URLs the morning feed carries. **Trigger:** `no feed.json ... nothing pushed`.
- **business-daily 05:50Z**: first run of `build_leaders.py` inside the runner (`a1cce05fd`).
- **WWC tracker 06:00Z**: should commit USA 97-79 France (Self-healed item 1).

## Standing items unchanged

- Metro weekly "Four seasons, one ledger" is built at
  `~/newsletter-podcast/builds/metro-power-rankings-weekly/2026-09-13/` and **awaits manual
  upload** at Spotify for Creators.
- mktcap curation queue: unchanged since the 09-12 run (next run 09-19).
- The Notion MCP is **not authorized** in this headless session, so the Backlog/Data sources/
  Silent failure register rows could not be read or updated from here. Authorize it with
  `/mcp` in an interactive session on the mini if sweeps should consult it.

Sources: [CAF CL 2026/27 first preliminary round results (nigfooty)](https://www.nigfooty.com/2026/09/caf-champions-league-202627-first.html),
[africasoccer.com first preliminary round](https://africasoccer.com/caf-champions-league-first-preliminary-round-cleared-as-zamalek-tp-mazembe-and-others-advance-to-second-phase/),
[CAF 2026-27 match calendar](https://www.cafonline.com/news/caf-announces-match-calendar-for-totalenergies-caf-champions-league-2026-27-and-totalenergies-caf-confederation-cup-2026-27-seasons/),
[CNN: Zverev wins US Open](https://www.cnn.com/2026/09/13/sport/us-open-mens-final-2026),
[Al Jazeera US Open men's final](https://www.aljazeera.com/sports/liveblog/2026/9/13/us-open-mens-singles-final-live-alexander-zverev-vs-ben-shelton),
[ESPN: United States 97-79 France](https://www.espn.com/fiba/game/_/gameId/401917260),
[Washington Post: US wins fifth straight World Cup](https://www.washingtonpost.com/sports/wnba/2026/09/13/france-us-world-cup-score/0939172e-afad-11f1-92c2-5c918f4a6127_story.html)
