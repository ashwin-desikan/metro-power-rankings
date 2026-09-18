# Daily Ops Sweep -- 2026-09-18

Window `2026-09-16T23:05Z` -> `2026-09-18T01:05Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data written, no
healthchecks pinged, nothing fixed. This file is the only thing committed.

## Jobs this window: 31 ok, 0 failed, 5 flagged

**Dispatcher: 31 DONE, 0 FAIL, 0 MISSED** (plus this sweep, in flight). First window with no
job-level failure at all since the sweep started reporting.

| job | runs | result |
|---|---|---|
| ops-autofix | 13 | all DONE, every one `no findings; nothing to do`. Nothing was re-run all window |
| football-standings | 4 | all DONE; every run `unmatched=45`, so the UNMATCHED ntfy fired each time (known, Attention 3) |
| claude-auth-canary | 4 | DONE; refresh token valid to 2026-10-08, 20.11 days left at 00:35Z (alert at 3) |
| mlb-sim | 2 | DONE 07:06Z 441s and 14:32Z 458s, **no `failed leagues` on either** (yesterday's watch item, cleared) |
| gap-league-watch | 1 | DONE; **auto-promoted CONCACAF Nations League** (Self-healed 2) |
| business-daily, substack-daily, euro-comps, nfl-elo, feed-monitor, activity-feed, daily-ops-sweep (09-17) | 1 each | DONE |

**Schedule audit (did anything fail to run rather than fail while running).** 2026-09-17 was a
Thursday, so the weekday-gated jobs (forecast 1/3/5, predictions-tue, predictions-fri, cfb-sun/wed/fri,
screen-number-ones 1/2/3, rugby-weekly, cricket-weekly, fiba-weekly, sound-weekly, egress-refresh,
economy-rates/housing/prices, mktcap-refresh, owners-weekly) were correctly not due, and the two
`days = [1]` monthly jobs (conflicts-monthly, cricket-monthly) fire on the 1st. Every job that WAS due
appears in the log. claude-auth-canary's four runs match its actual slots `["00:30","06:30","19:30"]`,
which look like a gap between 06:30Z and 19:30Z but are not one.

**Job logs checked for pushes from DONE jobs:** the only ntfy pushes this window were the five
football UNMATCHED alerts (four on 09-17, one at 23:04Z which lands in the 09-18 log). The
auth canary logged `no alert` four times. gap-league-watch's auto-promotion pushed **nothing**,
which is itself a finding (Attention 4). f1 hourly poller idle on `2026 R14 already synced` for all
27 ticks, which is correct: Madrid was 11 to 13 Sep and the next race is Azerbaijan 24 to 26 Sep
([formula1.com](https://www.formula1.com/en/racing/2026)).

**Newsletter (~/newsletter-podcast):** 09-17 morning built a 41:33 episode, published Spotify episode
`200LqyhJQPeAYzuD6Xs6UV`, pushed 48 of 54 items (per-publication cap) and carried 4 of 09-16's evening
items forward; 09:30 watchdog `Healthy`; 12:00 retention deleted the one episode older than 7 days
(2026-09-09), 0 failed; 20:00 evening appended 9 of 12, day holds 57. Normal. The morning draft noted
it had left The Athletic's Arch Manning story out of `feed.json` by mistake; `push_feed` carried it over
from 09-16 evening anyway, so it landed.

**GitHub Actions in window:** zero failures. The last two (WNBA 09-16 13:09Z, AFL+NRL 09-16 08:30Z)
are both before this window and both already reported green in yesterday's sweep.

**Vercel, 09-17 UTC:** 1 paid build (READY `dpl_HeBTthpr...`, sha `2f9a0f0d5`, 22:23Z), within the
2/day budget. Every other deployment that day was CANCELED, which is free. 09-18 so far: 0 paid.

**Deploy ordering on Ashwin's push, checked because it is the rule that bites:** `b9202b255`
(scripts, `[vercel skip]`) then `2f9a0f0d5` (app + lib + public/data, untagged) was pushed in that
order, so the build-relevant commit was HEAD and got its own deployment. Correct.

**Disk:** 106 GB used of 926 GB. Not a factor.

## Self-healed (informational only, no action needed)

**1. Yesterday's Attention 1 is closed: release notes are current.** `npm run check:release-notes`
now returns `OK (140 entries, newest 2026-09-17)`. Ashwin's `2f9a0f0d5` carried `lib/releases.ts`
(+18 lines) in the same commit as the app work, adding both the missing 2026-09-16 entry and one for
09-17, exactly as the report recommended and without spending a second build. Nothing further needed.

**2. gap-league-watch auto-promoted CONCACAF Nations League, and it is right.** At 05:07Z the watch
moved World L536 from `awaiting_target` to `ready` and promoted it into `leagues.json`
(`3df23071c`), removing it from `leagues_pending.json`. Verified rather than assumed:

- The promotion is by design. The pending entry carried `auto_promote: true` and
  `comp_type: "international"`, and `watch_gap_leagues.py`'s self-test asserts that 536 is the **only**
  id in the file allowed to self-promote, precisely because it is national teams and so carries no
  club-Lookup risk. The two club competitions beside it (CONCACAF Champions League 16, OFC Champions
  League 27) stayed human-gated and both correctly read `no season still running`.
- The trigger was real, not a glitch. `ready_on: "window"` ignores season years and reads dates,
  because these ids disagree about what a season year means. api-football published a season for 536
  whose end (`2026-11-11`) has not passed, so the window opened.
- The data that arrived matches the real competition. Supabase `football_fixtures` holds 90 rows for
  league 536, first kickoff 2026-09-23, last 2026-11-11. Concacaf has confirmed the 2026/27 Nations
  League, its fifth edition, starting in September 2026 with the League A group stage running
  24 Sept to 5 Oct and later rounds in the November window
  ([concacaf.com](https://www.concacaf.com/competitions/nations-league/news/2026-27-concacaf-nations-league-september-october-schedule-confirmed),
  [Wikipedia](https://en.wikipedia.org/wiki/2026%E2%80%9327_CONCACAF_Nations_League)).
- The site will handle it correctly. `liveData.tsx` gives a dedicated standings block only to
  league_id 5 and 7, but `intlEvents` flat-maps **every** international comp's fixtures into the
  On today / Upcoming strip under Football > International. So the fixtures appear from 23 Sept with
  no standings table, which is right: the api reports no standings coverage for this competition on
  any season it has ever had.

One cosmetic wrinkle, no action: api-football labels this campaign season **2025** even though it
starts in September 2026. The pending entry's note already documents that this id numbers a campaign
by the year it starts, and that note is now off by one. It changes nothing, because the window
variant never reads the year and the season number is only used to query the api, which returned the
right 90 fixtures.

**3. Both of yesterday's "watch today" triggers cleared without firing.**
- **WNBA season refresh** ran at 13:03Z on the fixed `_windows()` and succeeded (`abac92662`).
  It found 18 postseason games, so the "0 events" trigger did not fire. It correctly logged
  `NOT YET: expected 8 postseason teams, found 1 (TBD)` and left the postseason flags untouched,
  which is the script saying the bracket is not seeded yet rather than a fault.
- **mlb-sim** ran twice on the new query forms with no `failed leagues` on either run.

## Needs Ashwin's attention

### 1. Formula E season data is overdue, and the 2026 champion is known

**What happened.** `npm run check:data-currency` reports `current: 28  overdue: 1`:

```
OVERDUE
  Formula E season                       has 2025, owes 2026
```

**Root cause.** Not a fault. This is the slow-moving-data case the manifest exists for. The
`formula-e` entry in `scripts/data/data-currency.json` sets `endsMonthDay: "08-01"` with
`graceDays: 45`, so it tipped from current to overdue on **2026-09-15**. No scheduled job feeds it:
the probe reads `scripts/data/motorsport-series.json`, which is hand-kept and whose `formula-e`
`champions`, `runners_up` and `thirds` lists all still end at `{"year": 2025}`. The check is
warn-only and exits 0, so nothing blocked and nothing alerted. It was not in yesterday's report
because that sweep did not run this check.

**The real-world fact, verified.** The 2025-26 Formula E World Championship (Season 12) finished at
the London E-Prix in mid-August 2026. **Pascal Wehrlein (German, Porsche) is the 2026 champion**, his
second title, with **Jake Dennis (British, Andretti) second, five points behind**
([Porsche race report](https://racing.porsche.com/en-MY/articles/formulae-london-race-report-2026),
[FIA](https://www.fia.com/news/abb-fia-formula-e-world-championship-goes-down-wire-london-e-prix),
[Wikipedia](https://en.wikipedia.org/wiki/2025%E2%80%9326_Formula_E_World_Championship)).

**Recommended fix.** Add a 2026 row to each of the three lists for `key: "formula-e"` in
`scripts/data/motorsport-series.json`. The rows carry only `year` and `nat`, so:

- `champions`: `{"year": 2026, "nat": "German"}`
- `runners_up`: `{"year": 2026, "nat": "British"}`
- `thirds`: **do not fill this from memory.** I could confirm first and second from primary sources
  but not third: the standings pages the search surfaced were mid-season snapshots, not the final
  table. Read third place off the official final Season 12 drivers' standings
  (fiaformulae.com/en/results-and-standings) before adding the row. Per the project rule, an
  unresolved case gets logged rather than guessed.

`scripts/data/` is not build-relevant, so this costs no Vercel build and the commit takes
`[vercel skip]`. Once all three rows are in, `check:data-currency` returns to 29 current, 0 overdue.

### 2. The 2/day build cap is still inactive (fifth consecutive day reported)

**Evidence from today, not carried forward on trust.** The head of the build log for the one paid
build in this window (`dpl_HeBTthpr1zUfPcVZdhxbmEUzgh5b`, sha `2f9a0f0d5`, 22:23:45Z) reads:

```
vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
vercel-ignore: base '18eb6a0cd...' unreachable; falling back to HEAD^
vercel-ignore: build-relevant change in 2f9a0f0d5^..2f9a0f0d5; building
```

So the path check and the fail-closed base fallback both worked, and the guard made the right call.
The cap itself made no call at all: it is a no-op, and 09-17 stayed inside budget on volume alone.

**Recommended fix, unchanged since 09-13.** Add a read-scoped Vercel API token as
`VERCEL_BUILD_CAP_TOKEN` to project `metro-power-rankings`
(`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team `team_yQjbuPwcr40J6AxkjCv6AawD`), Environment: Production,
available at build time. Then check the next build log prints a count rather than the inactive line.
This is the one guardrail from the five overage incidents that is still not actually armed.

### 3. Football UNMATCHED ntfy, 5 alerts this window, Lookup edit is booked for today

All four 09-17 runs plus the 23:04Z run report `unmatched=45`, the same set each time, and each fires
an ntfy. The 05:09Z run also resolved 36 new teams to the Lookup, and the unmatched count still did
not move, which is consistent with 45 genuinely missing clubs rather than a matching regression.
Non-fatal by design: the job warns and continues so the site stays fresh.

**Booked for Friday 2026-09-18 on the Windows box, which is today.** Triage sheet:
`~/metro-mini-jobs/pending/unmatched-afc-caf-clubs-2026-09-14.xlsx` (with a .csv beside it). Use the
`cl-lookup-sync` skill, **not** `scripts/apifootball/sync_lookup.py`, which is a DELETE-then-INSERT
full mirror and would revert rulings applied in Supabase but not in the workbook. No action needed
before that edit; the alerts will stop on their own once the 45 are mapped.

### 4. A live competition went onto the site unannounced: gap-watch does not notify on promotion

**What happened.** The CONCACAF Nations League auto-promotion in Self-healed 2 added a competition to
the public site, committed and pushed it, and told nobody. The only reason it is in this report is
that this sweep reads the job logs.

**Root cause, read from the script.** `mac-mini-jobs/run-gap-league-watch.sh:17-18` defines `push()`
and then calls it from exactly one place, `fail()`. There is no call on the success path. The Python
prints `=== AUTO-PROMOTED: ... ===` and `=== TRANSITIONS ===` blocks that exist precisely to be
noticed, and the wrapper drops them. The job exits 0, dispatcher.log shows `DONE`, healthchecks goes
green, and a new competition is live.

**Why it matters more than it looks.** This is the exact shape the Silent failure register exists to
record: a success that changes what the public site shows and produces no signal. It also cuts the
other way. If a promotion is ever WRONG (the wrong league id, a season that turns out to be stale
api-football metadata, a competition Ashwin did not want live), the same silence applies, and the
first notice would be someone reading the page.

**Recommended fix.** In `run-gap-league-watch.sh`, capture the Python output that already goes
through `tee`, and when it contains `AUTO-PROMOTED` or `=== TRANSITIONS ===`, send one `push` at
default priority after the push to origin succeeds, with the promoted names and ids in the body.
Keep it to one notification per run regardless of how many leagues promoted, so this does not become
the noise problem the sweep exists to reduce. Worth a row in the Silent failure register either way,
since the class ("a job whose success is a state change nothing announces") is broader than this one
script.

### 5. Low priority: `football_league.has_standings` in Supabase disagrees with its source of truth

`scripts/apifootball/leagues.json` is the declared source of truth and records league 536 with
`"has_standings": false`, which is correct: api-football reports no standings coverage on any season
this competition has had. Supabase `public.football_league` holds `has_standings = true` for the same
league, with 0 rows in `football_standings`.

**Root cause.** `league_meta_rows()` in `scripts/apifootball/refresh.py:423-430` builds its upsert
from six fields (`league_id, name, country, level, comp_type, season`) and never includes
`has_standings`, so a newly inserted row takes the column default instead of the value from
`leagues.json`. Nothing reconciles them afterwards, so the two can disagree indefinitely.

**Impact today: none.** `export_bundles.py:70` does not select the column, and no file under `app/`
or `lib/` reads it, so nothing user-facing is wrong. Flagged because it is a source-of-truth claim
the code does not actually keep, and the next consumer to trust the column inherits the drift.

**Recommended fix.** Add `"has_standings": lg.get("has_standings", True)` to the dict in
`league_meta_rows()`, matching the same default `watch_gap_leagues.py:239` already uses, then let the
next `refresh.py --write` correct the existing rows. Scripts-only, `[vercel skip]`, no build.

### 6. Low priority: every international competition in the live bundle is labelled `confederation: "UEFA"`

`public/data/football/live-competitions-2026.json` carries six entries under `international`, and all
six read `"confederation": "UEFA"`, including the AFC Asian Cup, Africa Cup of Nations Qualification,
the Concacaf women's World Cup qualifiers and now the CONCACAF Nations League.

**Root cause.** `confed()` in `scripts/apifootball/export_bundles.py:42-50` maps a **country** name to
a confederation from a 16-entry override table and returns `"UEFA"` for anything unlisted. Its comment
scopes it to "the tracked domestic leagues", which is accurate for its original use. International
competitions carry `country: "World"`, which is not in the table, so they all fall through to the
default. This predates the Nations League promotion; that promotion just added a sixth wrong row.

**Impact today: none.** Nothing in `app/` or `lib/` reads `confederation` off the international
entries, so it is a dead field. Flagged because it is published, wrong, and one `find` away from
being believed.

**Recommended fix.** Either drop `confederation` from the international rows in `export_bundles.py`
rather than emitting a value that cannot be right, or give the international branch its own mapping
keyed on league_id (5 UEFA, 7 AFC, 36 CAF, 536 and 927 CONCACAF, 880 UEFA). Dropping it is the smaller
reversible change and nothing consumes it. Scripts-only, `[vercel skip]`.

## Standing

- The **Notion MCP is still not authorized** in this headless session, so the Backlog, the Data
  sources rows and the Silent failure register were not read or updated. Findings 4, 5 and 6 above are
  all register-shaped and have nowhere to go until it is. Authorize once with `/mcp` in an interactive
  session on the mini.
- Carried from HANDOFF 09-16 section H and 09-17 section C, unchanged: nothing alerts when a frontend
  reader swallows an upstream error with `return []`, and the ESPN date-form canary checks that
  upstream forms work, not that our callers use the working ones.
