# Daily Ops Sweep -- 2026-09-08

Window: `2026-09-06T23:04Z` -> `2026-09-08T01:04Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing was re-run, pinged,
written or fixed. This file is the only thing this sweep touched.

## Jobs this window: 18 ok, 1 failed, 2 flagged

Nineteen completed dispatcher runs, plus this sweep. **Zero MISSED**, and
`dispatcher.py --status` reports every job `already-ran` with no drift between the
live copy and the repo checkout.

| job | slot (UTC) | result |
|---|---|---|
| football-standings | 09-06 23:00 | DONE 85s |
| cfb-sun | 09-06 23:40 | DONE 401s |
| daily-ops-sweep | 09-07 01:00 | DONE 688s |
| activity-feed | 09-07 02:30 | DONE 5s |
| euro-comps | 09-07 04:00 | DONE 5s |
| gap-league-watch | 09-07 05:00 | DONE 3s |
| football-standings | 09-07 05:00 | DONE 87s |
| screen-number-ones | 09-07 05:00 | DONE 16s |
| business-daily | 09-07 05:50 | DONE 336s |
| substack-daily | 09-07 06:00 | DONE 4s |
| **forecast** | **09-07 06:10** | **FAIL exit 1 after 15s** |
| mlb-sim | 09-07 07:00 | DONE 459s |
| feed-monitor | 09-07 07:20 | DONE 16s |
| football-standings | 09-07 11:00 | DONE 89s |
| screen-number-ones | 09-07 13:00 | DONE 17s |
| mlb-sim | 09-07 14:30 | DONE 457s |
| football-standings | 09-07 17:00 | DONE 90s |
| screen-number-ones | 09-07 21:00 | DONE 16s |
| football-standings | 09-07 23:00 | DONE 85s |

**Non-dispatcher services, all healthy.** `f1-weekly` (hourly launchd) idle all
window, correctly: R13 Italian GP at Monza was 4-6 Sep and synced on 09-06.
`deploy-watch` (600s) clean, no re-triggers, `/tmp/deploy-watch.err` unchanged since
09-06 17:31. `heartbeat` (900s) last exit 0, empty stderr. `newsletter-podcast`
completed 09-07 (episode `1MurdylD42MC1AbOjE6hXP` READY, both Gmail drafts created).

**Job-script `push()` alerts fired this window: none.** `gap-league-watch` logged
"no state transitions this run" (India ISL still `awaiting_target`, api-football has
no 2026 season yet -- working as designed). `football-standings` logged
`unmatched=0 collisions=0` on all five runs. No mktcap METRO QUEUE nudge, no
business-daily geo-stub notice.

**Standing gates, all green:** `check:release-notes` OK (130 entries, newest
2026-09-07, so yesterday's shipping day is covered). `check:data-currency` 24
current / 0 overdue / 0 unreadable. Working tree clean.

**Vercel build ledger:** the last ~17h of deployments are **1 READY, 0 ERROR, 19
CANCELED** -- one production build (`c2db399ab`, Ashwin's elections/heartbreak
commit), comfortably inside the 2/day budget. I chased an apparent 3.7h gap where
`fec7feb5c` (owners, build-relevant, no skip marker) had no deployment, and it is a
false alarm: `deploy-watch.out` shows TARGET going straight from `ebbdd66d6` to
`c2db399ab` with a single "not live, 4m old" tick, which means the whole chain
`fec7feb5c -> ddb802577 -> 31f4fd739 -> 81f57c446 -> bc84ab6c7 -> c2db399ab` reached
origin in **one push with the app commit at HEAD**. That is the CLAUDE.md rule
followed correctly, not broken. No build was missed.

## Self-healed (informational only, no action needed)

**1. `forecast` FAIL 09-07 06:10Z -- diagnosed and fixed the same morning, by hand.**

The health gate rejected the build with `ERROR France: required firstRound.shares is
empty`; the run had already printed `FR R1: {} runoffs: 8`. The gate sits between
build and commit, so **nothing was published** -- the failure mode was a stalled
forecast, never a wrong one. The job exited in 15s instead of its usual ~607s
precisely because it aborted before the commit/CDN-flush steps.

Root cause (from `48ecffabd`): `fetch_fr()` sliced the first round with a hardcoded
date-stamped heading, `=== Since July 2026 ===`. Wikipedia's editors rolled that
heading forward over the weekend to "July 2026 - August 2026" with a new "Since
September 2026" above it, so the slice returned empty. The runoffs key off undated
"X vs. Y" subsections, which is why they still parsed 8/8 and the fetch printed a
cheerful "FR OK" -- the asymmetry that hid it.

Fixed same morning by the mini session, in two commits: `48ecffabd` (France moved to
`find_section()` + per-subsection years, plus a hard fail naming the article when a
section yields 0 rows) and `e5555ad49` (audited all nine fetches; Brazil had the
identical defect, `=== 2026 ===` hardcoded with no fallback, and was fixed the same
way). Data verified live in this sweep: `public/data/forecast.json` `built:
2026-09-07`, `fr.firstRound.shares` holds 14 candidates, Le Pen 33.4. Written up in
HANDOFF.md under "2026-09-07 -- mini -> Windows ... FORECAST FETCHES AUDITED".

Note the cadence: `forecast` runs Mon/Wed/Fri 06:10Z, so **no later scheduled run
existed inside this window to self-heal it** -- the recovery was the manual session,
not the schedule. Next scheduled run is Wed 09-09 06:10Z and should pass.

**2. FA WSL flipped from placeholder to real 2026-27 data, mid-morning 09-07.**

Carried as a flagged item by the 09-06 and 09-07 sweeps. It resolved itself between
the 06:05Z and 12:01Z `football-standings` runs:

```
06:05Z  [wfootball]  FA WSL (id 44): 12 standings rows [2025-26] PLACEHOLDER
        [wfootball]  awaiting 2026-27 in api-football: FA WSL (showing 2025-26)
12:01Z  [wfootball]  FA WSL (id 44): 14 standings rows [2026-27]
```

api-football published the season. The latest bundle
(`public/data/football/wlive-2026.json`, generated 09-07T23:03Z) carries
`placeholder: false`, `_ratchet_holds: {}`, and the "awaiting 2026-27" line is gone,
replaced by `all leagues on their current season`.

I checked the 14 rows against the real world rather than trusting the row count. The
WSL did expand from 12 to 14 clubs for 2026-27; Birmingham City and Crystal Palace
went up automatically as WSL2 winner and runner-up (2 May 2026), and Charlton
Athletic took the fourteenth place by beating Leicester City in the promotion/
relegation play-off on 23 May 2026 (0-0, 2-1 on penalties), sending Leicester down.
All fourteen clubs in the bundle match that, matchday 1 played. **The data is
correct, not a scraper artefact.** Sources:
[ESPN on the expansion vote](https://www.espn.com/soccer/story/_/id/45523903/wsl-clubs-vote-expand-league-14-teams-2026-27-season),
[Sky Sports on FA approval](https://www.skysports.com/football/news/11095/13386295/fa-approves-womens-super-league-expansion-to-14-teams-from-2026-27-season),
[2026-27 WSL](https://en.wikipedia.org/wiki/2026%E2%80%9327_Women%27s_Super_League).

The blind spot yesterday's sweep named still exists in principle (`_ratchet_holds`
only fires on a regression, so a placeholder-before-kickoff never records a hold),
but the case that prompted it has resolved and the proposed ~10-day check would not
have fired until 09-14. Nothing owed this week.

**3. The deploy watcher fix is applied.** Yesterday's sweep flagged that
`run-deploy-watch.sh` was still unchanged since `3b6a60d5d`. Ashwin shipped it in
`81f57c446` on 09-07: the watcher now asks GitHub for the deployment state and
treats `failure`/`error` as do-not-retry with a one-per-sha "deploy manually" alert.
On the residual 429 case, he considered the recommendation and deliberately kept
`none/unknown` falling through to the retry path, documenting why in the comment
(a build canceled by a newer push is the case the watcher exists for). That
exposure is bounded by `MAX_ATTEMPTS=3` and `COOLDOWN_MIN=18`. **Recorded as his
decision, not re-raised.**

**4. `empty:ESPN PGA scoreboard` in feed-monitor -- correct, not a break.** Has read
`empty` since 09-02; the monitor scores it as ok, distinct from `FAIL` (the endpoint
answers with valid shape and zero events). The FedEx Cup season has ended and the
next PGA Tour event is 17 September, so an empty scoreboard the week of 7 September
is the right answer. Expect it to return to `ok` around 09-17. Every other probe
green, including AFL, which came back on 08-31.

## Needs Ashwin's attention

**One item, and it is bookkeeping only.**

**`forecast` is still pinned at `last_status: "failed"` in `state.json`.**

*What happened.* The 09-07 06:10Z slot genuinely failed, so the dispatcher correctly
recorded `failed`. The fix landed by hand (commits `48ecffabd` / `e5555ad49` /
`7de55bfdd` / `019c090ee`) rather than by re-running the ~10-minute job, so nothing
ever overwrote that status. `dispatcher.py --status` therefore still shows:

```
forecast    09-07 06:10  2026-09-07   failed    already-ran
```

*Root cause.* This is the exact situation `--mark-ok` was added for on 2026-08-30,
after `egress-refresh`'s sanity gate was resolved the same way. It is the same call
made for `cfb-sun` on 08-31 and for `conflicts-monthly` / `fiba-weekly`, both of
which currently read `ok (manual)`.

*Impact: cosmetic only.* I read `mark_ok()`'s docstring and confirmed the claim
rather than assuming it -- `last_status` is pure bookkeeping and **is never read by
`decide()`**, which uses only `last_run_date` and `last_slot`. So this cannot
suppress, delay or double-fire Wednesday's run. The only cost is that the next
sweep, and any `--status` you run, will keep reporting a failure that was fixed
twelve hours later, which is the alert-fatigue problem this job exists to reduce.

*Recommended fix.* One command on the mini, no repo change, no build:

```bash
python3 ~/metro-mini-jobs/dispatcher.py --mark-ok forecast
```

That sets it to `ok (manual)` -- deliberately distinct from a plain `ok`, so the
record still says a human resolved it -- and writes a `MARK-OK` line to
dispatcher.log. I did not run it: this sweep makes no writes, even mechanical ones.

*Optional, only if you want it to stop recurring.* The general gap is that a job
fixed outside its wrapper never clears its own status. If that becomes a pattern
worth automating, the smallest reversible change is for the forecast wrapper to
call `--mark-ok` on itself after a successful manual rebuild -- but with three
instances in six weeks, doing it by hand is probably still the right cost.

---
*Read-only sweep. No jobs re-run, no healthchecks pinged, no Supabase writes, no
data or script changes. Only this file was written and committed.*
