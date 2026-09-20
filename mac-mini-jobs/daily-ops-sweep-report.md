# Daily Ops Sweep -- 2026-09-20

Window `2026-09-18T23:02Z` to `2026-09-20T01:02Z` (trailing 26h), selected on each
dispatcher line's own UTC timestamp. Read-only run: nothing was executed, re-run,
pinged, written or fixed. This report file is the only thing this session changed.

## Jobs this window: 35 ok, 0 failed, 5 flagged

36 executions across 20 distinct jobs. 35 returned `DONE ok`; the 36th is this
sweep. **Zero `FAIL` lines.** Two `MISSED` lines, both for one job, both benign
and explained below.

Ran and green: `football-standings` x4, `ops-autofix` x12, `claude-auth-canary` x3,
`mlb-sim` x2, `daily-ops-sweep`, `activity-feed`, `euro-comps`, `gap-league-watch`,
`business-daily`, `substack-daily`, `feed-monitor`, `economy-housing`, `nfl-elo`,
`mktcap-refresh`, `cricket-champions`.

I reconciled the schedule as well as the log, so a job that never fired at all
would still be caught. 2026-09-19 was a Saturday: `forecast` (Mon/Wed/Fri),
`screen-number-ones` (Mon/Tue/Wed), `predictions-*`, `cfb-*`, `rugby/cricket/fiba/
sound-weekly`, `owners-weekly` (Mon), `conflicts-monthly` and `cricket-monthly`
(day 1) are all correctly absent, not silently missing. `egress-refresh`,
`economy-prices` and `cfb-sun` are Sunday jobs whose slots fall later today.

Off-dispatcher jobs checked too: the F1 poller (hourly launchd), the
newsletter-podcast daily, and its evening / watchdog / retention sidecars. All
completed. `npm run check:data-currency`: 29 current, 0 overdue, 0 unreadable.

## Self-healed (informational only, no action needed)

**1. `cricket-champions` logged `MISSED` twice, because it was born yesterday.**
`MISSED cricket-champions (slot 2026-09-18 22:30Z, 859m late)` at 12:49:02Z and
again at 12:58:57Z. Not an outage. The job was created by commit `13bfc18b3`
("Cricket champions promote themselves") at 12:48Z, and `jobs.toml` says so in
its own comment (`# no plist; born on the dispatcher 2026-09-19`). The dispatcher
computed the job's previous slot as 2026-09-18 22:30Z, which predates its
existence, found it past the 12h `catchup_hours` window, and skipped to the next
slot exactly as designed. That next slot ran clean: 2026-09-19T22:39Z, 12s,
self-test 26 checks OK, "0 new champion(s); 0 needing attention". Nothing to fix.
Cosmetic only: the MISSED notice was emitted on two consecutive ticks before
state settled, so a new daily job will always log this twice. Not worth a change
unless it recurs for a job that is not brand new.

**2. `economy-rates`: yesterday's headline finding is fixed, and I verified the
data rather than trusting the commit message.** The `pipefail`-inside-`bash -c`
bug was fixed on 09-19 (`eb3d5fa61`, `92f1432dc`, plus `3586981f0` for the
hardcoded `BUILT_DATE`), and the rates were rebuilt at 11:10 BST (`6ba4407ce`).
Checked against the real files: all 62 rate files carry `built: 2026-09-19`, and
the three real-world moves yesterday's sweep named as missing are now present:
ECB 2.50 effective 2026-09-16, Denmark 2.10 effective 2026-09-11, Fed 3.875
effective 2026-09-17. No BIS file is stale on the site: `bis-us` (3.625),
`bis-xm` (2.25), `bis-gb`, `bis-ca`, `bis-se`, `bis-ch`, `bis-au`, `bis-no`,
`bis-jp`, `bis-nz` and `bis-de` all lag, but every one of them is
`"listed": false` with a `superseded_by` pointing at its dedicated builder, so
the board never shows the stale twin. Closed, no action.

**3. F1 poller: one transient upstream failure, already self-healed and already
hardened.** `14:07:06 ERROR: jolpica fetch failed` in `logs/f1-2026-09-19.log`,
recovered on the very next hourly tick at 15:07 and clean through 01:07 today.
The commit that makes this retry rather than page hourly (`b0b43e2f8`, "F1
poller: retry, never hang, and stop paging hourly for one outage") landed five
minutes after the error, so this was the incident that motivated the fix. Zero
errors in the six preceding daily logs. No action.

**4. `ops-autofix` refused to act at 12:18Z, correctly.** It reported
`[blocker] working_tree_dirty -- repo has 7 uncommitted change(s)` and stopped
with "Refusing to act around a human's work." That was a live session mid-flight
(commits landed 12:08 through 12:33). Clean again by the 14:19Z run. Working as
designed; noted only so it is not mistaken for a fault on a future read.

**5. The S&P 500 "recent changes" list was silently empty for four weeks, and
repaired itself before this window.** `[mktcap] WARNING: table id=changes not
found` has fired every weekly run since 2026-08-17, falling back to a
week-over-week constituent diff. That fallback produced **0 rows** on 08-17,
08-22, 08-29, 09-05 and 09-12, which on the site is indistinguishable from "no
index changes happened". It started working on 09-13 (61 rows) and holds at 60
today. Confirmed by walking `sp500.json` through git history. Already healed,
but it is a clean example for the Silent failure register if it is not there
yet: a warn-and-fall-back path returning an empty list looks exactly like good
news.

## Needs Ashwin's attention

### 1. The Vercel 2/day build cap is still not enforcing, and I can now prove it from behaviour

**What happened.** Four paid production builds ran on 2026-09-19 UTC against a
budget of two:

| UTC | Deployment | Commit | Subject |
|---|---|---|---|
| 09:06:27 | `dpl_93ctYyxBSVoy35MzASvBQY72g6dA` | `dda64bbb1` | mktcap: weekly Top Companies refresh 2026-09-19 |
| 11:33:54 | `dpl_FNu4bjNsiVNX5yhms89JG59LEop8` | `80e1d5671` | Live Standings and the NBA scrubber |
| 13:05:31 | `dpl_HcW7NEVmcinuoiJgmDtPQH8PArXU` | `d2c3f82e6` | NBA season standings follow the week slider |
| 20:40:36 | `dpl_CqZBtiATwpcPkWsCNrXo5WphB5J9` | `778734ced` | Release 2026-09-20: forecasts that lead with the answer |

All other production deployments in the window are `CANCELED`, which is free and
is what the ignore guard produces on a skip. Today, 2026-09-20 UTC, the count so
far is **0 paid builds**.

**Root cause, and why this is now evidence rather than inference.** The Windows
session's HANDOFF entry of 09-19 (late) states "the cap is still inactive", and
yesterday's sweep could not check it because the Vercel MCP token returns
`403 forbidden` on `projectEnvVars`. It still does; I retried and got the same.
But the cap's own contract makes a direct test possible.
`scripts/vercel-ignore.sh` line 80 says `[deploy-now]` on the SUBJECT is the only
override, and line 88 sets `MAX_DAILY_BUILDS` to 2. **None of the four subjects
above carries `[deploy-now]`.** If the cap were live, builds three and four would
have been skipped. They were not. So the cap is inactive, independent of anyone's
report of it.

I also pulled the build log of a skipped deployment to try to read the guard's
own cap line. It is not there and cannot be: the guard exits at the `[vercel skip]`
subject check (rule 1) before it ever queries the API, so a skipped build's log
can never tell you the cap's state. Worth knowing before someone else tries it.

**Recommended fix.** Add `VERCEL_BUILD_CAP_TOKEN` to the metro-power-rankings
project's **build** environment as a Vercel read token. Until it exists, the guard
prints "build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)"
and passes everything through, and the 2/day budget remains a promise rather than
code, which is the exact condition CLAUDE.md says caused five prior overages. This
is already Ashwin's P0 Backlog row; this entry just adds the behavioural proof.
Two supporting asks: grant the MCP token `projectEnvVars:read` so this sweep can
verify it directly instead of inferring, and note that the guard fails open on the
API call (`curl ... || return 0`), so a token that exists but is rejected would
also read as "inactive" and look identical.

### 2. Vivmark Residential (VMRK), $47.4B, has sat unmapped for two weeks and needs your ruling

**What happened.** `mktcap-refresh` on 2026-09-19 reported
`METRO QUEUE (notable, unmapped): Vivmark Residential [VMRK] $47.4B (United States)`.
It is the only notable (>=$10B) unmapped company this week, and it also appeared
last week at $50.7B. The two other notables from 09-12, Sunbelt Rentals and
Quantinuum, have since resolved. This one has not.

**Root cause.** Checked against the real world: Vivmark Residential is the merged
AvalonBay Communities + Equity Residential, completed 2026-08-17, trading on NYSE
as VMRK since 2026-08-18. It has **dual headquarters**, Arlington VA
(4040 Wilson Blvd) and Chicago IL, and has said it intends an ongoing presence in
both. So the mapper has no single right answer, which is precisely the case
`civic_common`-style rules say to log and leave alone rather than guess. It is
correctly sitting in the queue waiting for a human.

**Evidence.** Supabase read-only confirms the merge was handled correctly on the
dedup side, so nothing is double counted:

| symbol | name | is_active | last_seen | latest mcap | metro |
|---|---|---|---|---|---|
| AVB | AvalonBay Communities | false | 2026-08-22 | $26.28B | Washington-Baltimore |
| EQR | Equity Residential | false | 2026-08-22 | $24.61B | Chicago |
| VMRK | Vivmark Residential | true | 2026-09-19 | $47.37B | **null** |

`mktcap_geo` has a stub row for VMRK with `metro`, `city` and `state` all null.
Independently corroborated by `public/data/business/sp500.json`, whose newest
change row reads "August 18, 2026 ... removed AvalonBay Communities ... the
combined company trades as Vivmark Residential (VMRK)".

**Impact.** A rank-632 company worth $47.4B is currently attributed to no metro
at all, so whichever metro should hold it is understated by that amount on
`/business` and its metro page.

**Recommended fix.** Your ruling, then one row. Precedent from the predecessors
is split: AVB was mapped to Washington-Baltimore, EQR to Chicago. If the house
rule is "one HQ, the primary one", Arlington VA is the registered principal
office, which maps to Washington-Baltimore. Set `mktcap_geo` for symbol `VMRK`
with `metro`, `city`, `state`, `mapped_by` and `mapped_at`, via the mktcap-refresh
skill's curation path rather than a raw write, and it will hold through the next
weekly run. Worth deciding this week: it is the largest single unattributed
company on the board. Minor, non-blocking: the retired `AVB` geo row records
`state: "DC"` for a city in Virginia; harmless now that the row is inactive, but
do not copy it forward.

### 3. `nba-elo` and seven more cache tags are live in production but have never been flushed, and the mini owes the one verification ping

**What happened.** The 09-19 (late) HANDOFF entry closes with an explicit request
addressed to this machine: "**Mini: flush `nba-elo` one time and confirm
`ok:true`.**" The Windows box could not do it, having no `REVALIDATE_SECRET`.
This sweep is read-only by charter, so I did not run it. Reporting it instead,
with the blockers cleared so it is a one-liner when you want it.

**Root cause and current state.** `lib/nbaElo.ts` tagged every NBA season shard
`nba-elo` for the life of the file while the tag was missing from `ALLOWED_TAGS`,
so every NBA correction silently waited out a full 24h ISR instead of flushing.
`check:cache-tags`, written the same day, then found seven more in the same
condition: `club-value`, `club-money`, `expectation`, `nfl-expectation`,
`pl-expectation`, `intl-expectation`, `footy-finals`. Both entries note the
allowlist was inert until the next build. **That build has since landed.** I
verified `915ce45f2` (nba-elo) and `7f58ffc06` (the seven) are both ancestors of
`778734ced`, which went READY at 20:48Z on 09-19, and all eight tags are present
in `app/api/revalidate/route.ts` on disk. So the flush should now answer
`ok:true` where it previously answered `{"ok":false,"error":"unknown tag"}`.

**Recommended fix.** Two things, in order.
First, the one-off verification, on the mini, which does have `REVALIDATE_SECRET`
in `~/metro-mini-jobs/config.env`: flush `nba-elo` once and confirm `ok:true`.
That closes the HANDOFF request and proves the whole allowlist change worked,
rather than assuming it from the build landing.
Second, the real follow-through, which is the open Backlog row "refresh jobs
should ping the seven newly flushable tags": listing a tag only makes it
flushable, nothing pings it. `expectation`, `nfl-expectation`, `pl-expectation`
and `intl-expectation` sit on 24h ISRs, so until a job pings them their data is
up to a day late by default. `footy-finals` is a 15 minute window and matters
this week for the AFL Grand Final result.

### 4. The news digest silently drops entity links whose slug does not exist

**What happened.** `~/newsletter-podcast/logs/2026-09-19.log` shows four dropped
entity links in one morning run, all the same target:
`[push_feed] entity dropped on 'OpenAI unveils a system for reporting rogue AI age': metro/san-francisco (no page at that slug)`
plus three more across other AI stories. The job exited clean, pushed 49 items,
and raised nothing.

**Root cause.** The site's slug is `san-francisco-san-jose`, not `san-francisco`.
Confirmed against `public/data/metros.json` (4,315 metros, the only San Francisco
entry is `san-francisco-san-jose`) and `public/data/details/`, which holds
`san-francisco-san-jose.json` and no `san-francisco.json`. The tagger is
generating a plausible slug from the city name rather than resolving against the
real slug table, and the push path fails open, dropping the link and continuing.

**Scope, measured rather than assumed.** I grepped every newsletter log on the
box. This is new and small, not a long-running leak: 0 occurrences through 09-17,
1 on 09-18 (`club/football/brighton`, where the real slug is `brighton-hove`),
4 on 09-19. Two distinct bad slugs, both of them a shortened form of a real
hyphenated one.

**Impact.** Low but growing, and invisible. San Francisco is the single most
common metro in an AI-heavy news feed, so this is likely the most-linked entity
on the site losing its link on most days. Nobody would notice: the item still
publishes, just unlinked.

**Recommended fix.** Resolve entity slugs against the real vocabulary instead of
generating them: `public/data/slug-lookup.json` already exists for exactly this
in the football path, and `metros.json` is the authority for metros. Cheapest
useful change is an alias map plus a louder failure, so an unresolved slug raises
once per new slug rather than being swallowed. Pure alias fixes if you want the
two known ones closed first: `san-francisco` to `san-francisco-san-jose`, and
`brighton` to `brighton-hove`. This is not urgent, but it is the kind of
fail-open drop that the Silent failure register exists to name.

### 5. Notion is unauthorized in this headless session, for the second day running

**What happened.** The `notion` MCP server needs OAuth and this session is
non-interactive, so it cannot be authorized here. Yesterday's sweep reported the
same thing and it has not changed.

**Why it matters.** CLAUDE.md makes Notion the source of truth for state, as a
hard rule with a gate: every ruling gets a Decisions row, every new silent fault
gets a Silent failure register row, in the same session. This job is the one that
finds those faults, and it is structurally incapable of recording them. Items 1
through 4 above each deserve a row and none can be written. The 09-19 evening
HANDOFF entry already found Notion had drifted inside a single day of the
contract, with none of six named Backlog rows actually created, so the daily
"Notion reconciler" backstop is carrying more than it was meant to.

**Recommended fix.** Run `claude` interactively on the mini once and complete
`/mcp` for the Notion connector, then confirm the token survives a headless
invocation of `run-daily-ops-sweep.sh`. If it does not persist into headless runs,
that is the finding, and the honest fix is to change the contract for this job
rather than let it silently owe rows every night: either give the sweep a
narrow Notion write path that works headless, or state in `jobs.toml` that the
sweep reports to this file only and the reconciler owns its rows.

## One piece of log noise worth silencing

`mktcap-refresh`'s log opens with
`[mktcap:selftest] WARNING: rename NVDA -> MSTR SKIPPED: both symbols live in this week's feed (recycled-ticker signature). Fix mktcap_symbol_changes.`
That is **a test fixture, not a live data fault.** It is emitted from inside the
self-test block, and the assertion it belongs to passes two lines later
(`PASS merge: recycled-ticker rename SKIPPED (NVDA->MSTR, both live in feed)`).
The live run on the same page reports `rename guard: 0 recycled-ticker renames
skipped: []`, so nothing is wrong with `mktcap_symbol_changes`.

The problem is that it is indistinguishable from a real alert to any grep, and it
ends with an imperative instruction to go fix a table that is fine. It cost this
sweep a detour and it will cost the next one the same. Suggest the self-test
harness prefix fixture output (`[selftest-fixture]`) or suppress `push()`-shaped
strings while running under `--self-test`.

---

*Generated by the unattended daily ops sweep on the Mac mini. Read-only run: no
jobs re-run, no healthchecks pinged, no Supabase writes, no data or code changed.
Supabase was queried with SELECTs only. This report file is the only write.*
