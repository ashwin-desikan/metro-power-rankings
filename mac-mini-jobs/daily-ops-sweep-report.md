# Daily Ops Sweep -- 2026-09-23

Window: 2026-09-21T23:01Z .. 2026-09-23T01:01Z (trailing 26h), selected on each log line's own
UTC timestamp. Read-only run: nothing was re-run, pinged, committed or fixed except this file.
**Zero job failures.** Yesterday's most urgent item resolved itself with hours to spare; two
things want Ashwin, and one has a Saturday deadline.

## Jobs this window: 19 ok, 0 failed, 2 flagged

188 `RUN` lines, 187 `DONE`, **zero `FAIL`, zero `MISSED`**, no traceback anywhere in the
window (the 188th RUN is this sweep). Every job that `jobs.toml` made due actually ran, and
nothing ran that shouldn't have -- all 35 job schedules were evaluated against the window
rather than eyeballed.

| job | runs | result |
|---|---|---|
| deploy-watch | 149 | ok 2-3s each |
| ops-autofix | 13 | ok (4 stood down early in the window, see Self-healed #1) |
| football-standings | 5 | ok 112-124s, `errors=0` every run |
| claude-auth-canary | 4 | ok -- 15.11 days of refresh-token life left (threshold 3) |
| screen-number-ones | 3 | ok 18s / 21s / 351s |
| mlb-sim | 2 | ok 445s / 446s, all 11 warm targets HTTP 200 |
| daily-ops-sweep | 2 | ok (one is this run) |
| activity-feed, business-daily, cricket-champions, cricket-weekly, euro-comps, feed-monitor, gap-league-watch, git-maintenance, nfl-elo, predictions-tue, rugby-weekly, substack-daily | 1 each | ok |

**Not due, verified against the weekday/day/month masks rather than assumed:** forecast,
cfb-wed, fiba-weekly, sound-weekly (all `weekdays=[3]`, due later today, after this window);
predictions-fri, cfb-fri, economy-rates `[5]`; economy-housing, mktcap-refresh, metro-rankings
`[6]`; cfb-sun, egress-refresh, economy-prices `[7]`; owners-weekly `[1]` (ran 09-21, before
the window); conflicts-monthly and cricket-monthly day 1.

**Not under the dispatcher, checked separately.** Only three launchd agents are actually loaded
(`dispatcher`, `f1-weekly`, `heartbeat`); the other 15 plists on disk are inert leftovers from
the dispatcher migration. `f1` logged `idle: 2026 R14 already synced` hourly -- **correct**, R14
(Madrid, 11-13 Sep) is the latest completed round and R15 (Azerbaijan) is 24-26 Sep.
newsletter-podcast's four agents all ran clean: daily digest + 2 Gmail drafts 08:20, evening
refresh (45 items, 30 tagged), watchdog `final.mp3` present + episode READY, retention deleted
1 episode older than 7 days. heartbeat writes nothing by design -- `HEALTHCHECK_URL`,
`HC_PING_KEY` and `NTFY_TOPIC` were all confirmed present, so its silence is real health, not a
disabled dead-man's switch.

**Gates and probes, read rather than assumed:** feed-monitor 07:23Z all 12 probes `ok`.
gap-league-watch: 3 leagues still `awaiting_target`, no state transitions. cricket-champions:
self-test 26 checks, 0 new champions. git-maintenance: loose objects 1760 against the 6700
threshold, so another vacuous pass (still not evidence the step works -- carried from 09-22).

## Self-healed (informational only, no action needed)

**1. Yesterday's #1 -- the uncommitted UK forecast fix -- shipped, and the Wednesday half-ship
risk is closed.** Yesterday's report warned that 8 uncommitted files had stood ops-autofix down
since 09-21T20:21Z, and that if they weren't committed before **today 06:10Z** the `forecast`
job would sweep the data half into a skip-tagged bot commit while the page change and its
release note stayed stranded. They were committed on 09-22 between 07:18Z and 08:13Z
(`6e86b214e`, `7d371d8f1`, `a1ca4b388`, `95b49a60f`, `3f1c3dd27`, `546debfc2`). Verified on
disk, not inferred: `HEAD:public/data/forecast.json` now opens the UK trend at `lab 36.4 /
con 21.9` -- exactly the corrected values yesterday's report identified as right and unshipped
-- and ops-autofix has logged `no findings; nothing to do` on every slot from 08:20Z onward.
Nothing further is needed from Ashwin, and `forecast`'s 06:10Z run today is now safe.

**2. `jobs.toml` drift self-corrected.** Ashwin's `c803564bb` (20:56Z) edited the repo's
`jobs.toml`; the live dispatcher copy is a real file, not a symlink, so it went stale until
ops-autofix's 22:16Z slot found `deploy_drift` and copied it. Working as designed. Worth
knowing that a `jobs.toml` change can therefore run stale for up to ~2h (this one was a
comment-only rewrite, so no scheduling behaviour was affected) -- unlike `runners/*.sh`, which
are symlinks and take effect immediately.

**3. `deploy-watch` coalesced 4 of ~153 slots** (05:10, 08:10, 14:40, 20:30Z). Each sits
directly after a long job (screen-number-ones, nfl-elo, mlb-sim) that pushed the dispatcher tick
past a slot boundary; the dispatcher resolves an `every_minutes` job to its most recent due slot
and drops the intervening one. Same benign pattern explained in the 09-22 report; recorded so a
future sweep doesn't chase it.

**4. The HANDOFF pre-Saturday check is satisfied.** The 09-22 cutover entry asked that someone
confirm on the mini, before Saturday 10:30Z, that `runners/metro-rankings.sh` shows the publish
default. Confirmed: it is a symlink into the repo and reads `MODE="${METRO_RANKINGS_MODE:-publish}"`.

**5. A Wikipedia 429 during cricket-weekly cost nothing.** The fetch of *Zimbabwean cricket team
against Afghanistan in the UAE in 2026-27* failed with HTTP 429. Checked the real fixture list:
that series doesn't begin until **17 October 2026** (ODI tri-series 17-23 Oct, T20Is 27 Oct-1
Nov, Tests 5-17 Nov), so the page had no played matches to harvest. No data was lost. The
*shape* of that failure is still worth fixing -- see Needs attention #2.

## Needs Ashwin's attention

### 1. cricket-weekly pushed an ntfy from inside a clean run, and it is right to: 4 Supabase rows have NULL venue_country and host_country because Wikipedia says "New Delhi" and the workbook says "Delhi"

**What happened.** `cricket-weekly` exited 0 (`DONE ok 35s`) but logged `REVIEW items surfaced
via ntfy` at 09:01Z. `mac-mini-jobs/cricket-review-queue.md` holds:

```
2026-09-15 T20I Afghanistan v India: venue city 'New Delhi' not in workbook
2026-09-17 T20I India v Afghanistan: venue city 'New Delhi' not in workbook
```

**The matches are real and the scrape is correct.** Verified against the actual series: India
toured Afghanistan (hosted in India) for three T20Is at the Arun Jaitley Stadium, Delhi, on
13 / 15 / 17 September 2026. The workbook already held 09-13, so harvesting "since 2026-09-14"
and picking up exactly the 15th and 17th is right, as are the scores in the log.

**Root cause, pinned to the line.** `venue_fields()` in `scripts/cricket/afghanistan_stage.py:268`
takes the city as the text after the last comma of the Wikipedia venue string, canonicalises it
through `CITY_ALIASES` (line 58), then looks it up in `venue_by_city` built from the workbook.
The 09-13 match's page names the ground `Arun Jaitley Stadium, Delhi`; the 2nd and 3rd T20Is'
page names it `Arun Jaitley Cricket Stadium, New Delhi`. `"new delhi"` is not in `CITY_ALIASES`
and is not a workbook Venue City, so the lookup misses and the function returns blank
venue_country / host_country.

**The measured consequence** (read-only SELECT on `public.cricket_matches`, not inferred):

| start_date | venue | venue_city | venue_country | host_country |
|---|---|---|---|---|
| 2026-09-13 | Arun Jaitley Stadium, Delhi | Delhi | India | India |
| 2026-09-15 | Arun Jaitley Cricket Stadium, New Delhi | New Delhi | **null** | **null** |
| 2026-09-17 | Arun Jaitley Cricket Stadium, New Delhi | New Delhi | **null** | **null** |

Two matches x two perspective rows = **4 rows** carrying NULL country fields, sitting next to a
row from the same series and the same ground that has them filled. Anything that groups cricket
matches by `host_country` or `venue_country` now undercounts these two.

**Recommended fix.** One line in `scripts/cricket/afghanistan_stage.py`, following the exact
precedent already in the table:

```python
CITY_ALIASES = {
    "magheramason": "Derry",    # Bready Cricket Club; workbook uses "Derry"
    "new delhi": "Delhi",       # Arun Jaitley Stadium; workbook uses "Delhi"
}
```

Then backfill the 4 existing rows (`venue_country='India'`, `host_country='India'`, and
optionally normalise `venue`/`venue_city` to the workbook's spelling so the series reads
consistently). Next scheduled cricket-weekly is **2026-09-30 09:00Z**; the alias alone will
stop it recurring but will NOT repair the rows already inserted, so the backfill is the part
that needs doing deliberately.

### 2. That 429 exits 0 and tells nobody -- Silent failure register candidate

Nothing was lost this week (Self-healed #5), which is exactly why it is worth writing down now
rather than after it costs something. The harvester enumerated 7 candidate Wikipedia pages,
one returned HTTP 429, and the run printed `(fetch failed ...)`, carried on, inserted what it
had, and **exited 0 with no alert**. Had that page been one with played matches, those matches
would simply be absent -- no FAIL, no ntfy, no review-queue line, and the next run's
"harvest since <last workbook match>" window would have moved past them only if something else
had advanced the watermark. The tell would be a quiet gap in a country's fixture list.

**Recommended fix.** cricket-weekly already owns a review-queue + ntfy channel that works
(finding #1 proves it), so route the failure into it: append a `fetch failed <title>: <error>`
line to `cricket-review-queue.md` and include it in the "REVIEW items surfaced" push, rather
than only printing to the log. A bounded retry with backoff on 429 specifically would be a
reasonable addition, but the alert matters more than the retry. Add a row to the Silent failure
register for "candidate-page fetch failure drops matches silently".

### 3. Carried and still unfixed: ops-autofix's `working_tree_dirty` alert bypasses its own dedupe

Yesterday's report filed this as the secondary half of its #1. Confirmed still present:
`mac-mini-jobs/run-ops-autofix.sh:112-117` pushes `[ops-autofix] stood down -- uncommitted work`
and `exit 0`s immediately, while the same-findings dedupe lives at line ~280 and is never
reached. So this one finding re-notifies on all 12 daily slots, which is what produced the
alert-every-2-hours complaint on 09-21/09-22. It is **latent right now** (the tree is clean and
ops-autofix has been quiet since 08:20Z on 09-22), so nothing is firing today -- but it will
recur in full the next time uncommitted work sits overnight.

**Recommended fix.** Move that `push` behind the same last-findings comparison the other
findings use, so it alerts once per distinct condition and then goes quiet. The comment at
line 280 already argues this case ("an alert channel that cries wolf on a schedule is worse
than no alert channel").

### 4. 2026-09-22 spent 3 paid production builds against the 2/day budget -- but deliberately, unlike 09-21

**Measured, with the 404-as-empty trap avoided:** GitHub core rate limit was 4729/5000 when
queried, so these are real answers rather than rate-limited silence. The three build-relevant
commits (the only ones since 09-22 without `[vercel skip]`) each produced a deployment, all
`success`:

| commit | created | subject |
|---|---|---|
| `3f1c3dd27` | 2026-09-22T07:25:20Z | elections: Labour leads the UK polling chart |
| `546debfc2` | 2026-09-22T08:05:04Z | elections: a "Just voted" board for the last six months |
| `e43dc4a22` | 2026-09-22T08:19:44Z | Release notes: the eight corrected election dates **[deploy-now]** |

**The important distinction from 09-21.** The third build carries `[deploy-now]`, which is the
documented and only override of the cap, and the session that made it recorded the overage in
HANDOFF (`224fc050b`, "the date corrections are live on a third build"). So 09-22's third build
was a deliberate, logged choice, not a guard failure -- materially different from 09-21, where
the third had no override. **2026-09-23 so far: 0 paid builds** (every deployment today is
CANCELED, which is free).

**Not re-verified this run, stated rather than assumed.** Whether `VERCEL_BUILD_CAP_TOKEN` is
still absent could not be confirmed from the mini: there is no Vercel token in any config here,
and the Vercel MCP ignored `since`, `until`, `state` and `limit` (every call returned the same
newest 20 deployments), so paid builds could not be enumerated through it. Yesterday's
measurement -- two 09-21 build logs both printing `vercel-ignore: build cap inactive` -- is the
last hard evidence, and nothing in the repo or on the mini would have changed it, since it is a
Vercel dashboard env var. It remains Ashwin's existing P0: add a read-scope
`VERCEL_BUILD_CAP_TOKEN` as a Production build-time variable on `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`
(team `team_yQjbuPwcr40J6AxkjCv6AawD`); the confirmation to look for in the next build log is
`vercel-ignore: N paid production build(s) so far today (cap 2)`.

### 5. Saturday deadline, from the 09-22 cutover entry rather than any job failure: `check:release-notes` will complain on the first publish-mode metro-rankings run

The mini is confirmed ready to publish (Self-healed #4): `metro-rankings` runs **Saturday
2026-09-26 at 10:30Z** and, on a clean guarded run, makes **one UNTAGGED `public/` commit**
(metros, regions, states, meta, details, state-metro-scores, states-directory, plus the report).
`npm run check:release-notes` fails when an earlier day shipped an untagged `app/`/`lib/`/
`public/` commit with no `lib/releases.ts` entry covering it -- so the first publish Saturday
leaves that gap, exactly as the retired Top Companies commit used to. The 09-22 HANDOFF entry
flagged this as still open and asked for it to be settled before Saturday.

**Recommended fix, pick one.** Either add a standing weekly-rankings entry convention (the
runner writes a `lib/releases.ts` block in the same commit -- note that makes the commit
build-relevant on purpose, which it already is), or exempt bot-authored commits in
`scripts/check-release-notes` the way other guards distinguish automated data commits. The
second is smaller and does not spend a build; the first is more honest to readers of `/updates`.
Either way it wants deciding before Saturday 10:30Z, or the day's verify goes red.

### 6. Minor housekeeping, no urgency

- **15 stale launchd plists** sit in `~/Library/LaunchAgents/` (activity-feed, cricket-weekly,
  euro-comps, feed-monitor, fiba-weekly, football-standings, gap-league-watch, rugby-weekly,
  screen-number-ones, sound-weekly, substack-daily, egress-refresh, conflicts-monthly,
  cricket-monthly, deploy-watch) that are **not loaded** -- their jobs moved into the dispatcher.
  Harmless, but a future session reading the directory could reasonably think they run. Worth
  deleting, or a README line saying they are archived.
- **`com.citizenofnowhere.f1-weekly` is named "weekly" and runs hourly** (`StartInterval 3600`),
  pinging the healthchecks slug `f1-weekly` 24 times a day. Behaviour is correct and idempotent;
  only the name misleads. Its `.err` file last changed 2026-09-19 (a `curl (56) 504` on a
  healthchecks ping), nothing since.

---
*Read-only sweep: no job re-run, no healthchecks ping, no Supabase write, no commit but this
file. **Notion was not read or updated** -- the Notion MCP needs an interactive OAuth
authorisation this headless session cannot perform, so the contract's start-of-session Backlog
read and end-of-session row updates did not happen. Findings 1, 2, 3 and 5 are Backlog
candidates; finding 2 is a Silent failure register candidate; finding 4 is an existing P0.*
