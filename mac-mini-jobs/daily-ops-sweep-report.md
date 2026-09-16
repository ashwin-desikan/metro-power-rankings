# Daily Ops Sweep -- 2026-09-16

Window `2026-09-14T23:03Z` -> `2026-09-16T01:03Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, nothing fixed. This file is the only thing committed.

## Jobs this window: 37 ok, 0 failed, 3 flagged

**Dispatcher: 37 DONE, 0 FAIL, 0 MISSED** (plus this sweep, in flight). Every job due
in the window fired, and the schedule reconciles against `jobs.toml` with nothing
missing: Tuesday-only rows (`predictions-tue`, `rugby-weekly`, `cricket-weekly`) all
ran, and the rows that did not run are correctly not due (`forecast` and `cfb-wed` are
Wed and fire later today; `economy-*`, `mktcap-refresh`, `egress-refresh`,
`owners-weekly`, `sound-weekly`, `fiba-weekly` last ran on their correct weekday).

| job | runs | result |
|---|---|---|
| ops-autofix | 13 | all DONE; one finding 13:19Z (WWC rerun), one 01:23Z (AFL+NRL rerun). Other 11: no findings |
| claude-auth-canary | 4 | DONE; refresh token valid to 2026-10-08 (22.1 days left) |
| football-standings | 4 | all DONE; every run `unmatched=45`, UNMATCHED ntfy each time (known, see Known//deliberate) |
| screen-number-ones | 3 | DONE; all three "no number-ones change this week", nothing committed |
| mlb-sim | 2 | DONE 441s / 445s |
| cricket-weekly | 1 | DONE; **pushed a REVIEW ntfy** (Self-healed 3) |
| activity-feed, euro-comps, gap-league-watch, business-daily, substack-daily, predictions-tue, rugby-weekly, feed-monitor, nfl-elo, daily-ops-sweep (09-15) | 1 each | DONE |

**Off-dispatcher:** `f1` hourly poll idle all day (`2026 R14 already synced`). Verified
correct, not stale: 2026 Round 14 was the Madrid GP, 11-13 September, so R14 is genuinely
the latest round. Newsletter 09-15 morning 08:00Z pushed 46 of 58 (age + per-publication
rules), evening 20:00Z appended 3 of 12 with 9 skipped on the 6-per-publication cap. Both
of yesterday's newsletter triggers ("nothing pushed", "a source over 6") are clear.

**GitHub Actions:** one workflow failed in window, `AFL + NRL season refresh`, twice
(Attention 1). The WWC tracker failure that recurred for three days is closed (Self-healed 2).

**Vercel:** 4 paid production builds on 09-15 UTC against a 2/day budget (Attention 2).

## Self-healed (informational only, no action needed)

**1. gap-league-watch: the 09-14 NOT NULL failure did not recur.** The 09-15 05:07Z run was
the first unattended one after the `football_league_watch_target_season_nullable` migration,
and it wrote all four pending leagues clean (`wrote watch state for 4 leagues`, `no state
transitions this run`), including the CONCACAF Champions League row whose null `target_season`
sank the whole batch on 09-14. Yesterday's watch item is cleared.

**2. WWC tracker: failing run self-healed, and the schedule is now retired for good.** Run
`34963140563` failed at 11:24Z on its ops-autofix rerun (attempt 2), then the next scheduled
run `34969956543` at 12:37Z succeeded. Separately, a mini session retired the cron the same
afternoon (`52fab443e`, 13:37 BST): `.github/workflows/wwc-2026-tracker.yml` now has its
`schedule:` block commented out with `workflow_dispatch` kept, because recording the final on
09-14 broke two self-tests that assumed 2026 was unplayed. Verified in the file this run.
This failure class cannot recur before 2030, and ops-autofix will not burn reruns on it again.

**3. cricket-weekly's REVIEW ntfy: all three items check out against reality.** The job DONE'd
clean and pushed `REVIEW items surfaced via ntfy` at 09:07Z with three flags. I verified each
one; none is a data error:
- **Afghanistan v India T20I, 2026-09-13, "venue city 'New Delhi' not in workbook".** Real
  result confirmed: Arun Jaitley Stadium, Delhi, India won by 7 wickets, Afghanistan 156/8 and
  India 157/3, exactly what the scraper stored. Afghanistan were the designated home side for a
  series played in India, which is why an Afghan "home" match carries an Indian venue city. A
  mini session had already corrected the venue, countries and series string by hand at 09:13Z
  (`b26709cfe`), so this is closed.
- **Two Rwanda matches at "Gahanga B Ground", country inferred from city name alone.** The
  inference is right: ESPNcricinfo lists Gahanga B Ground (ground 1435506) as a cricket ground
  in Kigali City, Rwanda. No collision.
- One Wikipedia fetch returned HTTP 429 (`Zimbabwean cricket team against Afghanistan in the
  UAE in 2026-27`). That series has not been played yet, so nothing was lost, and the harvest
  window re-reads from the last stored match date, so next week's run picks it up regardless.

## Needs Ashwin's attention

### 1. ESPN has dropped the `dates=A-B` range parameter site-wide. One job is already failing; four more break on their next run.

**What happened.** `AFL + NRL season refresh` (run `35038445464`) failed at 2026-09-16T00:04:48Z
on the step `Finals feed self-test, then refresh finals.json`. ops-autofix re-ran it at 00:23Z
and **it failed again** (attempt 2, `updatedAt` 00:23:57Z), so this is not self-healed. The
self-test passed (19 checks); the live fetch raised `urllib.error.HTTPError: HTTP Error 400`
at `scripts/ingest/footy_finals.py:76`.

**Root cause, measured this run.** It is not our code and not AFL-specific. ESPN's
`site.api.espn.com/.../scoreboard` now rejects **any** hyphenated `dates=` range with
`{"code":400,"message":"Failed to get events endpoint."}`. Bisected read-only:

| query | result |
|---|---|
| `?dates=20260801-20261101&limit=1000` | **HTTP 400** |
| `?dates=20260801-20260901` | **HTTP 400** |
| `?dates=20260901-20260902` | **HTTP 400** (even a 1-day range) |
| `?limit=1000` (no `dates`) | HTTP 200 |
| `?dates=20260913` (single day) | HTTP 200 |
| `?dates=202609` (month) | HTTP 200, 8 events |
| `?dates=2026` (year) | HTTP 200, 226 events |

`limit` is innocent; the hyphen is the trigger. It is global across sports, not per-league:
`australian-football/afl`, `rugby-league/3`, `soccer/eng.1`, `football/nfl`, `baseball/mlb`,
`basketball/wnba` and `soccer/fifa.world` all 400 on a range and all 200 on a single date.
(`golf/pga` still 200s, so it is the team-sport scoreboards.) Nothing is documented upstream;
ESPN's site.api is undocumented and changes without notice. The break landed in an 8-hour
window: the same URL succeeded at 2026-09-15T15:53Z (run `34991503398` wrote
`finals.json` at 15:54:25Z, `2892ad20b`) and 400s now.

**Blast radius of the AFL/NRL failure.** The failing step is third of eight, and later steps do
not run: the season-end finalizer, `build_champions.py`, the AFL/NRL hub rebuild and the commit
are all skipped. Only the two Supabase ladder ingests (steps before it) still run. So
`public/data/{afl,nrl}/data.json`, `finals.json` and the champions files are frozen at
2026-09-15T15:54Z. **The committed data is still correct today** (AFL: 10 games over 4 weeks;
NRL: 6 over 2; no premier), because the next fixtures had not been played. **The deadline is
2026-09-18**: AFL preliminary finals are 09-18 and 09-19, NRL week 2 is 09-19 and 09-20, and
the AFL Grand Final follows. Left unfixed, the brackets freeze mid-finals and the premiership
finalizer never fires.

**What breaks next, and how loudly.** Verified by reading each call site:

| caller | next run | behaviour |
|---|---|---|
| `scripts/ingest/footy_finals.py:203` | already failing | **LOUD** (raises, kills the workflow) |
| `scripts/predictions/build_season_sims.py:357` (AFL+NRL fixtures) | **mlb-sim, today 07:00Z** | **LOUD**: `fetch_json` defaults `soft=False`, so AFL and NRL raise. `main()` isolates per league, so the other five still build; the process exits nonzero, `run_soft` sets `PARTIAL_FAILURE`, and the runner calls `fail` -> dispatcher FAIL. You will get an ntfy. |
| `scripts/predictions/build_pl_sim.py:611` | predictions-fri, 09-18 11:40Z | **LOUD** (`fetch()` raises) |
| `scripts/ingest/majors_ingest.py:47` | daily Action | **LOUD** (`get_json` raises) |
| `scripts/ingest/wnba_finalize.py:243` | WNBA refresh | **LOUD** (raises) |
| `scripts/predictions/build_nfl_sim.py:257,303` | predictions-fri | **SILENT**: `soft=True` -> `None` -> reads as "no games" |
| `scripts/predictions/build_meta_market.py:335` | predictions-fri | **SILENT**: `fetch_json` defaults `soft=True` |
| `scripts/predictions/build_mlb_postseason.py:159` | mlb-sim | **SILENT**: `soft=True` -> empty postseason |
| `lib/espnScores.ts:62` | **live now** | **SILENT**: `if (!res.ok) return []`. The "Recent results" strip on /sports/standings (shipped 09-13) is dead and shows nothing. No error anywhere. |
| `lib/wc2026Standings.ts:216,371` | live, dormant | **SILENT** (`return null` / `[]`). Its window is `20260628-20260720`, long past, so no visible effect. |

**Not affected** (they use the year+week form, which still works, and both ran green):
`scripts/nfl/nfl_live_update.py:92`, `scripts/nfl/nfl_playoffs.py:88`,
`scripts/predictions/build_cfb_sim.py:291,295`. The ESPN **standings** endpoints are also
untouched: `ESPN standings snapshot` succeeded at 21:30Z, and feed-monitor's six shape probes
were all `ok`.

**Recommended fix.** One-token change per call site: replace the range with the season/year
form, which the parsers already filter down anyway. For `footy_finals.py:203`:

```python
url = "%s/site/v2/sports/%s/scoreboard?dates=%d&limit=1000" % (ESPN, FRAG[league], season)
```

I verified read-only that this produces exactly the right bundle today: AFL `dates=2026`
returns 226 events of which `_is_finals_slug` keeps precisely the 10 finals (WC1/WC2, QF1/QF2,
EF1/EF2, SF1/SF2, PF1/PF2), and NRL returns 213 of which it keeps precisely the 6
(`2026-final-nrl`). Same shape the working 15:54Z run committed. Apply the same substitution at
`build_season_sims.py:357` (already a `%d0201-%d1101` whole-season range, so `dates=%d` is a
strict superset and the regular-season slug filter is unchanged). For the rolling-window
callers (`majors_ingest.py`, `build_nfl_sim.py`, `build_meta_market.py`,
`build_mlb_postseason.py`, `wnba_finalize.py`, `lib/espnScores.ts`) the direct translation is a
loop of single `dates=YYYYMMDD` requests over the window, or `dates=YYYYMM` per month where the
window is wide; note `wnba_finalize.py` deliberately omits `limit=`, so keep that.

Please run `python3 scripts/ingest/footy_finals.py --self-test` and a dry run before 09-18, and
**add a range-vs-single-date probe to the feed-shape monitor** so the next silent ESPN
parameter change is caught by `feed_shape_monitor.py` rather than by a finals bracket freezing.
Worth a row in the Silent failure register: two frontend readers (`lib/espnScores.ts`,
`lib/wc2026Standings.ts`) swallow this with `return []` and nothing logs it.

### 2. Four paid Vercel builds on 09-15, against a 2/day budget, and the cap is still inactive

Counted with the Vercel MCP across the full UTC day (`state: READY` or `ERROR` are paid;
`CANCELED` is free). **4 READY, 0 ERROR:**

| time (UTC) | commit | subject | author |
|---|---|---|---|
| 08:32Z | `f24f4bde6` | International football hub: bundle its data with static imports | mac-mini[claude] |
| 09:18Z | `5429bed4c` | Champions and majors are read at runtime, so a new champion no longer needs a build | Ashwin |
| 16:09Z | `6780abc98` | Zone Zero Cup: tier letters, weekly snapshots, and the winter and summer boards | Ashwin |
| 16:36Z | `d92f9cae7` | Winter and Summer filter every column, not just the score | Ashwin |

Every one is a legitimate build-relevant change, correctly untagged; no guard bug, and no
repeat of the 2026-08-06 pattern of untagged data commits. The problem is only the count: this
is 2x the budget, and it is the **sixth** overage. 09-16 so far is clean (0 paid; the three
deployments since 00:00Z are all CANCELED `[vercel skip]` refresh-schedule commits).

The 4 builds are themselves the proof the cap is still off: `scripts/vercel-ignore.sh` would
have skipped the 16:09Z and 16:36Z builds at `MAX_DAILY_BUILDS=2` had it been able to count.

**Fix (unchanged, carried from 09-13/09-14/09-15, now with a fourth day of evidence):** add
`VERCEL_BUILD_CAP_TOKEN` (read scope) to project `metro-power-rankings`
(`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team `team_yQjbuPwcr40J6AxkjCv6AawD`), Production,
build-time. The next build log should print a count instead of `build cap inactive`. Note
09-15's own two afternoon builds were 27 minutes apart, which is exactly the "evening burst"
shape of the 09-06 overage, so batching would have saved one even with the cap off.

Release notes are **not** a problem here: `npm run check:release-notes` passes, 138 entries,
newest 2026-09-15, and 09-13/09-14/09-15 all have blocks.

### 3. The football UNMATCHED ntfy continues 4x/day until Friday's Lookup edit (already scheduled, no action before then)

All 5 runs in window logged `unmatched=45` with the same 45 ids. Unchanged from yesterday, kept
on purpose as the reminder. The work is booked for **Fri 2026-09-18 10:00 BST on the Windows
box**: triage sheet at `~/metro-mini-jobs/pending/unmatched-afc-caf-clubs-2026-09-14.xlsx`
(15 need only `API Name`, 30 are new rows; TP Mazembe needs `API Name` on row 139465 because of
the AMBIG trap). Sync via the `cl-lookup-sync` skill, **not** `sync_lookup.py`.

## Watch today (09-16), no action unless the trigger fires

- **mlb-sim 07:00Z.** Expect a **FAIL** on `build_season_sims` with `[afl] FAILED:` and
  `[nrl] FAILED:` and `HTTP Error 400`, per Attention 1. The other five leagues should still
  build and commit. **Trigger:** anything beyond AFL and NRL in the failed-leagues list.
- **cfb-wed 11:40Z** and **forecast 06:10Z**, both due today. `build_cfb_sim.py` uses the
  year+week form, so CFB should be unaffected; a FAIL there would mean ESPN broke something
  wider than the range parameter.
- **AFL + NRL season refresh** next fires on its Sep/Oct 06:00Z cron. It will fail the same way
  until `footy_finals.py:203` is changed.

## Standing

- Notion MCP is **not authorized** in this headless session, so the Backlog, the Data sources
  rows and the Silent failure register were not read or updated here. Authorize with `/mcp` in
  an interactive session on the mini if sweeps should use it. Attention 1 is worth a Silent
  failure register row and a Data sources note against the ESPN scoreboard feed.
