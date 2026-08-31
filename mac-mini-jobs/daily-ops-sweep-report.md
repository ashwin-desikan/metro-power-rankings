# Daily Ops Sweep -- 2026-08-31

Rolling snapshot, rewritten every run. Window: **2026-08-29T23:07Z → 2026-08-31T01:07Z**
(trailing ~26h). Report-only — this sweep made **no writes** other than this file.

> **Note on the window query.** The command in the job prompt greps
> `date -u -v-26H` and `date -u`, which at 01:07Z resolves to **08-29 and 08-31 and
> silently drops 08-30 entirely** — the day almost everything in this report
> happened. This sweep used an explicit `awk $1 >= "2026-08-29T23:00:00Z"` filter
> over all three dates instead. See "Needs attention #3".

## Jobs this window: 15 ok, 4 failed, 2 flagged

| Job | Run(s) | Status |
|---|---|---|
| football-standings | 08-29 23:02Z, 08-30 05:04Z, 11:08Z, 23:05Z | ok |
| football-standings | 08-30 17:05Z | **FAIL** exit 1 (2s) — self-healed, see S1 |
| activity-feed | 08-30 02:34Z | ok (5s) |
| euro-comps | 08-30 04:04Z | ok (5s) — 69 fixtures, 3 comps |
| gap-league-watch | 08-30 05:04Z | ok (7s) *(flagged — state transition, S2)* |
| business-daily | 08-30 05:55Z | ok (617s) — markets+FX pushed, revalidate 200, 3 warms 200 |
| substack-daily | 08-30 06:16Z | ok (4s) — 20 posts, no new slugs |
| mlb-sim | 08-30 07:06Z, 14:34Z | ok (1822s / 1820s) — clean, no NRL crash |
| feed-monitor | 08-30 07:46Z | ok (16s) |
| egress-refresh | 08-30 09:07Z | **FAIL** exit 1 (1852s) — resolved by hand, see S3 |
| daily-ops-sweep | 08-30 11:29Z | **FAIL** timeout 15m — already fixed, see S4 |
| cfb-sun | 08-30 23:47Z | **FAIL** exit 1 (602s) — **NEW, unresolved, see #1** |
| daily-ops-sweep | 08-31 01:07Z | this run |

Launchd-side (outside the dispatcher): `f1` hourly watcher idle all 26h
(`2026 R12 already synced`) — **correct**, R12 was the Dutch GP at Zandvoort on
21–23 Aug and the next round (Monza) is 4–6 Sept, so there is nothing to sync.
`newsletter-podcast` daily produced episode `25r6DuEyk3js1jDHGqwsSe` (34:13,
READY) with both Gmail drafts; watchdog `Healthy`; retention deleted 1 expired
episode; weekly correctly skipped (no unnarrated Substack post inside the 14-day
window — Substack quiet since 2026-07-01, a known standing skip).

No `MISSED` entries. `state.json` shows every non-window job on its expected slot
(`cfb-fri` 08-28 ok, `forecast`/`predictions-fri` 08-28 ok, `predictions-tue`
`rugby-weekly` `cricket-weekly` 08-25, `fiba-weekly` 08-26, `mktcap-refresh` 08-29,
`conflicts-monthly`/`cricket-monthly` seeded 08-01 → next fire 09-01). Nothing
silently skipped. Working tree is clean; no stashes.

---

## Self-healed (informational only, no action needed)

**S1. football-standings FAIL 17:05Z + 10× `export_schedule.py` WARNs — one cause, one cure**
Both trace to a single uncommitted `HANDOFF.md` in the mini's working tree, which
made `git merge --ff-only` refuse:

```
17:05:08 ERROR: cannot fast-forward (repo diverged; resolve by hand)
! error: Your local changes ... would be overwritten by merge:  HANDOFF.md
```

The dispatcher's post-tick `export_schedule()` hit the same wall on every 10-minute
tick from **17:05:10Z to 18:35:25Z** (10 WARNs). The interactive session committed
that file as `c3dbba8d7` at **18:39:56Z**; the very next tick's export succeeded
(`503a29e77`, 18:45:27Z) and the 23:05Z scheduled football-standings run was clean
(83s). **Fully self-healed, nothing outstanding.** Worth knowing as a pattern: an
uncommitted file in the mini's clone quietly red-lines *every* ff-only job until
someone commits it.

**S2. gap-league-watch — Greek Super League 2 transition, already consumed**
The 05:04Z run pushed `=== TRANSITIONS === Greece L2 Super League 2:
awaiting_target -> ready`. The interactive session resolved the two unmatched
clubs and the 12:18 local run logged `AUTO-PROMOTED Super League 2 (api 494) ->
leagues.json`, pushed as `49496b533`. India ISL remains `awaiting_target` (api has
no 2026 season yet) — expected. **No action.**

**S3. egress-refresh FAIL 09:38Z — leaders sanity gate held the commit**
The gate did its job (5 hard flags; `dispatcher.log` keeps only the last 6 stderr
lines so it shows Nigeria + 3 softs). Investigated in full by yesterday's sweep and
fixed by hand: `c43399283`, `3976ba3c8`, `6d954fc67`, and the job was explicitly
`MARK-OK`'d at 12:47:46Z. Working tree is clean and `state.json` reads
`ok (manual)`. **Nothing further this window** — but see #2 for the recurrence risk
on 09-06.

**S4. daily-ops-sweep FAIL 11:44Z — its own timeout, already raised**
The 08-30 run was killed at the then-default 15m mid-investigation. `jobs.toml` now
carries `timeout_minutes = 25` with that exact comment, and `run-daily-ops-sweep.sh`
gained the PID lock yesterday's report asked for. Today's run started 01:07:11Z on
its proper slot, 7m late, single instance. **Both fixes verified in place.**

Also verified fixed from yesterday's report: the mlb-sim NRL in-progress crash and
the feed-monitor AFL blind spot (`35ddd39a3`), the sound-pipeline atomic-credits
copy (`298789fb5`), the S&P 500 changes diff (`238dde631`), the sweep's own wiring
committed (`b56222aee`), and the HOLD-recovery commit rule (`1240d8b6e`). Only the
mktcap 26-company backlog and one leaders date correction remain open from that
report.

---

## Needs Ashwin's attention

### 1. 🔴 cfb-sun hard-failed and the week-1 AP-25 slate never published — ESPN's scoreboard has lost 9 of Jacksonville State's 12 games

**What happened.** `cfb-sun` (08-30 23:47Z) passed its self-test (35 checks) and
then died 55s into the model build:

```
[00:47:06] step: rebuild the CFB model (sim + AP-25 slate + grading)
[00:48:01] FAIL: step failed (rc=1)
! schedule gap: Jacksonville State has only 3 games
```

`guarded` (not `run_soft`) means the old JSONs were kept — correct, no partial
shipped. But `public/data/cfb-sim.json` and `cfb-predictions.json` are still the
**2026-08-28 preseason build** (`generated_at: 2026-08-28`, `games_played: 0`,
poll `Preseason 2026-08-17`). Week 1 was played on 29–30 August. The site is
showing a preseason model on the Monday after the season opened, and the product
promise — "the week's slate comes out after the AP poll" — did not happen.

**Root cause — reproduced live, read-only, this run.** This is not a transient
fetch miss and not our bug. `build_cfb_sim.py` line 965 hard-exits when any FBS
team holds <10 games (played + remaining). I replayed the exact 21 scoreboard URLs
`season_events()` uses, with the same headers (no User-Agent, `Accept:
application/json`), and got 940 events and **exactly one** team short:

```
FBS teams with <10 scoreboard games: 1
   3  id 55  Jacksonville State
JSU games visible in groups=80 scoreboard:
   2026-08-29 wk1  JVST @ NDSU  (completed)
   2026-09-05 wk1  EKU @ JVST
   2026-10-29 wk9  JVST @ NMSU
```

The other 137 teams are fine, and no `soft-fetch miss:` line appeared in the run's
stdout, so no week query failed. The games genuinely exist — ESPN's **team**
endpoint returns all twelve:

```
/teams/55/schedule?season=2026  ->  12 events, group 12 (CUSA), parent 80 (FBS)
   09-12 JVST @ OHIO | 09-19 GASO | 09-26 MTSU | 10-07 @ KENN | 10-14 FIU
   11-08 SHSU | 11-14 @ WKU | 11-21 MOST | 11-28 @ DEL     (all missing above)
```

I pulled one of the missing ones end to end. Event **401866418** (`JVST @ OHIO`,
2026-09-12) resolves through `/teams/195/schedule` and `/summary?event=401866418`
with both competitors correctly grouped (Ohio group 15, JSU group 12) — yet it is
absent from `scoreboard?groups=80&seasontype=2&week=2`, from `week=3`, from
`dates=20260912&groups=80`, **and from `dates=20260912` with no groups filter at
all**. ESPN's scoreboard index is dropping these events; every other endpoint has
them. The `limit=` truncation trap documented at `season_events()` is not involved
— no limit param is passed.

**Why it will not fix itself.** `cfb-fri` fires **2026-09-04 11:40Z** and `cfb-sun`
**2026-09-06 23:40Z**; both run the same builder and will hit the same line. Unless
ESPN reindexes, the CFB pages stay frozen on preseason numbers through week 2, and
you get an ntfy alert each time.

**Recommended fix** (smallest change that owns the problem, in `scripts/predictions/build_cfb_sim.py`):
after `prepare_state()` and *before* the loop at line 962, backfill from the
per-team endpoint for any team the scoreboard shorted —

- for each `id_list` team whose `per_team_games + reg_wins + losses < 10`, GET
  `.../teams/{id}/schedule?season=2026`, take `seasonType.id == 2` events whose
  event id is not already in `seen`, and append them in `season_events()`'s shape
  (both competitor ids, `neutralSite`, `conferenceCompetition`, completed/score);
- log one `note:` line per backfilled team so a silent upstream regression is still
  visible in the run log;
- **keep the <10 hard exit** as the final gate, so if the backfill also comes up
  short the run still turns red instead of shipping a wrong CUSA title race.

Do **not** just relax the threshold to 3 — JSU's conference and playoff
probabilities would be computed off a 3-game season and CUSA's whole board would be
wrong. If you would rather not touch the builder mid-season, the honest alternative
is to leave it failing and accept a frozen CFB page until ESPN reindexes; the guard
is behaving correctly either way. Worth re-checking the scoreboard in a day or two
before writing code — this looks like an ESPN-side glitch that may clear on its own.

Evidence commands (all read-only, all re-runnable):
```
curl -s -H 'Accept: application/json' \
 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/55/schedule?season=2026' | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["events"]))'
# -> 12, vs 3 visible via scoreboard?groups=80
```

### 2. The leaders sanity gate will almost certainly HOLD egress-refresh again on 2026-09-06 — Nigeria is structurally unfixable as configured

`egress-refresh` is weekly (Sun 09:00Z) and has now failed **two Sundays running**
(08-23 and 08-30), both on `check-leaders-sanity.py`. The 08-30 data was corrected
by hand, but **the scrape was not**, so the same inputs return next Sunday.

Nigeria is the one that cannot resolve itself. `scripts/check-leaders-sanity.py`
pins `nigeria: "Bola Ahmed Tinubu"`, and its own comment (added 2026-08-15) says the
pin "stops it recurring at all instead of needing a fresh manual exclude every
time". **It does not.** The pin is a comparison, not a repair: the scrape writes the
short form, the pin compares bare names, they differ, and the run HOLDs —
which is exactly what happened on 08-30:

```
! HARD  nigeria: name "Bola Ahmed Tinubu" -> "Bola Tinubu" with unchanged since (2023-05-29)
```

Wikidata is oscillating between two labels for the same person with the same start
date (recorded 2026-08-15, 08-17, 08-23, and again 08-30). No data is at risk — the
gate is holding correctly — but it burns a 31-minute run and an ntfy alert every
Sunday, and it trains the gate's output to be ignored.

**Recommended fix.** Make the pin *load-bearing* rather than advisory: in the
refresh pipeline, after the scrape and before the gate, rewrite any pinned country's
name to the pinned value when the bare-name comparison shows a pure long/short-form
variant of the same person **and** `since` is unchanged; log it as a normalisation.
Then Nigeria stops flagging while a genuine handover (new `since`) still HOLDs.
Add a `--self-test` case for both directions. Smaller stopgap if you would rather
not touch the pipeline: treat a same-`since` name change that is a strict
subsequence of the pinned name as SOFT rather than HARD.

Also still open: Switzerland's `"Swiss Federal Council" has no since date` soft flag
(pre-existing, benign — a collective head of state genuinely has no single start
date; consider whitelisting it so the soft list stays meaningful), and the one
remaining real date correction from yesterday's report's item #4 that `6d954fc67`
deliberately left ("2 are false positives, 1 needs a real update").

### 3. This sweep job's own window query drops a whole day near UTC midnight

The prompt in `run-daily-ops-sweep.sh` builds its grep from two literal dates:

```
grep "$(date -u -v-26H +%Y-%m-%d)\|$(date -u +%Y-%m-%d)" dispatcher.log
```

Fired at its 01:00Z slot, that resolves to `2026-08-29` and `2026-08-31` — and
matches **nothing from 2026-08-30**, which is where every failure in this report
lives. It only appears to work because the sweep is told to reason about a 26h
window and a careful reader notices; a sweep that took the command literally would
have reported "31 lines, all clean" and missed the cfb-sun failure entirely. The
job runs at 01:00Z by design, so this misfires **every single day**.

**Recommended fix** — in `mac-mini-jobs/run-daily-ops-sweep.sh`, replace the grep
in `$PROMPT` with a filter that spans the range rather than two endpoints:

```bash
awk -v since="$(date -u -v-26H +%Y-%m-%dT%H:%M:%SZ)" '$1 >= since' \
  $HOME/metro-mini-jobs/dispatcher.log | grep -E '(RUN|DONE|FAIL|MISSED|WARN)'
```

`dispatcher.log`'s leading field is a sortable UTC ISO timestamp, so a plain string
compare is exact. Adding `WARN` to the pattern also surfaces the `export_schedule.py`
run in S1, which the current `(RUN|DONE|FAIL|MISSED)` pattern shows only by accident.

Two smaller things in the same file, worth folding into the same edit:
`$HOME/metro-mini-jobs/logs/*-$DATE.log` only globs *today's* logs, so at 01:07Z it
matches four files and misses the whole preceding day (this sweep read
`*-2026-08-30.log` explicitly); and `dispatcher.py` keeps only the last 12 stdout
and **6 stderr** lines per job (lines 254–258), which is why both the cfb-sun
traceback and 4 of the 5 leaders hard flags are unrecoverable from `dispatcher.log`
— worth raising the stderr tail to ~30 lines, or teeing each runner to its own
`logs/<job>-<date>.log` the way `football-standings` and `gap-league-watch` already do.

### 4. Vercel: 7 billable production builds on 2026-08-30 against the 2/day budget

Counted with the Vercel MCP `list_deployments` per the CLAUDE.md rule (not GitHub
`deployment_status`). `READY` production deployments, 2026-08-30 UTC:

| Time (UTC) | Commit | Work item |
|---|---|---|
| 10:53:51 | `bef55cb2a` | deploy-retry (healing a canceled build) |
| 11:10:08 | `3976ba3c8` | leaders fix |
| 11:10:53 | `fcba480ad` | the held refresh that consumed it |
| 16:06:00 | `74f444400` | football expectation ledger |
| 19:05:14 | `675cd0525` | deploy-retry for the mobile batch |
| 20:43:14 | `263fb4be5` | rugby rescoring |
| 20:55:56 | `0623a6b8c` | release notes for the day |

Every one is individually legitimate reader-visible work and the skip-tagging held
across ~40 pushes (all 08-31 deployments so far are `CANCELED`, i.e. free — 0
billable today). This is not a guard failure. It is the batching rule: **three of
the seven were second builds of a work item that had already built** — the 11:10:08
/ 11:10:53 pair (45s apart, flagged in yesterday's report too), and the two
`[deploy-retry]` commits, each spent because a `[vercel skip]`-tagged commit
happened to be the HEAD of a mixed push. `675cd0525`'s own commit message states the
lesson: **order a mixed batch so a build-relevant commit is LAST**, or push the
skip-tagged ones separately afterwards. Nothing to undo; flagged because this is the
line item that has been billed before.

### 5. mktcap metro curation queue: still 26 companies awaiting a ruling

Carried forward unchanged from yesterday's report (`mktcap_geo`, `mapped_by =
'auto-stub'`). `mktcap-refresh` is weekly (Sat 09:00Z), so nothing changed this
window and nothing will before 2026-09-05. Listed only so it does not fall off the
board — the queue is working as designed, it just has not been consumed.

---

*Generated by the unattended daily ops sweep on the Mac mini. Report-only: no jobs
were re-run, no healthchecks pinged, no data written. Network access this run was
read-only GETs against ESPN plus one web search, and read-only Vercel MCP listing.*
