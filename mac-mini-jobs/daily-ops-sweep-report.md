# Daily Ops Sweep -- 2026-08-30

Rolling snapshot, rewritten every run. Window: **2026-08-29T09:00Z → 2026-08-30T11:29Z**
(trailing ~26h). Report-only run — this sweep made **no writes** other than this file.
Investigator: headless Claude on `Ashwins-Mac-mini.local`.

## Jobs this window: 22 ok, 2 failed, 3 flagged

**Dispatcher jobs (24 runs incl. this sweep):**

| Job | Runs | Status |
|---|---|---|
| activity-feed | 08-29 02:39Z, 08-30 02:34Z | ok, ok |
| euro-comps | 08-29 04:09Z, 08-30 04:04Z | ok, ok |
| gap-league-watch | 08-29 05:09Z, 08-30 05:04Z | ok, ok *(flagged — state transition)* |
| football-standings | 08-29 ×4 (05,11,17,23Z), 08-30 ×2 (05,11Z) | all ok |
| business-daily | 08-29 05:51Z, 08-30 05:55Z | ok (617s), ok (617s) |
| substack-daily | 08-29 06:11Z, 08-30 06:16Z | ok, ok |
| mlb-sim | 08-29 07:01Z | **FAIL** exit 1 (1822s) — self-healed, see below |
| mlb-sim | 08-29 14:30Z, 08-30 07:06Z | ok (1838s), ok (1822s) |
| feed-monitor | 08-29 07:42Z, 08-30 07:46Z | ok, ok *(flagged — AFL blind spot)* |
| mktcap-refresh | 08-29 09:02Z | ok (357s) *(flagged — S&P 500 changes table)* |
| egress-refresh | 08-30 09:07Z | **FAIL** exit 1 (1852s) — resolved by hand, see below |
| daily-ops-sweep | 08-30 11:29Z | this run |

No `MISSED` entries in the window. `state.json` shows every other job last-ran on
its expected slot (`cfb-sun` 08-23 → next fires tonight 23:40Z; `conflicts-monthly`
/ `cricket-monthly` still `seeded` from 08-01 → next fire 09-01). Nothing silently
skipped.

**Non-dispatcher (launchd) jobs:** newsletter-podcast daily ok (episode
`25r6DuEyk3js1jDHGqwsSe`, 34:13, both Gmail drafts created); newsletter-podcast
weekly ok — clean skip, no unnarrated Substack post inside the 14-day window;
f1 hourly watcher idle all 24h (`2026 R12 already synced`).

---

## Self-healed (informational only, no action needed)

**1. mlb-sim FAIL — NRL fixture/record mismatch (2026-08-29 07:32Z)**
`[nrl] fixture/record count mismatch: {'souths': -1, 'titans': -1}` tripped the
run's soft-fail rollup, so the job exited 1 *after* committing partial data
(`40789fecbc..781ee55445`). The `-1` signature means ESPN had posted a result for
both clubs but not yet the matching fixture row — transient mid-round ingestion
lag, not a code fault. The same-day 14:30Z run completed clean (1838s), and
today's 07:06Z run produced **zero stderr lines** and a clean `done`. Already
healed twice over; the other six leagues were never affected (per-league soft-fail
isolation in `runners/mlb-sim.sh` working as designed).

**2. egress-refresh FAIL — leaders sanity gate HELD the commit (2026-08-30 09:38Z)**
The gate did its job: a bad Wikidata scrape hit 5 hard flags and the commit was
held. **This was already investigated and fixed by hand ~90 minutes later** by the
interactive session on this machine — commits `3976ba3c8` (leaders fix) and
`fcba480ad` (the rest of the held refresh data), 11:10Z.

Note the dispatcher only retains the last 6 stderr lines, so `dispatcher.log`
shows just 1 of the 5 hard flags. The full set, per `3976ba3c8`'s message:
Hungary + India (scrape collapsed the PM/president pair down to the ceremonial
president), Madagascar + Malawi (scrape reverted to each country's *ousted*
predecessor with a self-consistent old date), Nigeria (cosmetic name truncation).

I re-ran `scripts/check-leaders-sanity.py` read-only just now: **exit 0, 0 hard
flags**, 1 pre-existing Switzerland soft flag. I also independently verified the
Norway succession that shipped in the same commit — Harald V died 2026-08-28 aged
89 after 35 years, Haakon succeeded as Haakon VIII ([NPR](https://www.npr.org/2026/08/28/nx-s1-5947778/norways-king-harald-v-dies-king-haakon-viii),
[Al Jazeera](https://www.aljazeera.com/news/2026/8/28/norways-king-harald-v-dies-succeeded-by-son)) — and
Malawi's Peter Mutharika (since 2025-10-04) and Madagascar's Michael Randrianirina.
All match production. **Nothing further needed.**

Caveat worth knowing, not acting on: the underlying *scrape* bug is unfixed — only
the data was corrected. `egress-refresh` is weekly (Sundays), so the same 5
countries can trip the gate again on **2026-09-06**. The gate will hold it again,
which is the designed behaviour.

**3. Liga F `[2025-26] PLACEHOLDER` — this is the fix landing, not a regression**
Today's three football-standings runs disagree, which looks alarming in isolation:

- 00:02Z and 06:04Z → `Liga F (id 142): 16 standings rows [2026-27]`
- 11:08Z → `Liga F (id 142): 16 standings rows [2025-26] PLACEHOLDER`

The 11:08Z line is the **correct** one. Commit `50951cab3` (women's season guard,
`looks_fresh()` in `scripts/apifootball/refresh_women.py`) landed at 11:02Z and the
runner's ff-only pull picked it up. Confirmed against the real world: **Liga F
2026-27 kicked off today, 30 August 2026** ([LALIGA calendar](https://www.laliga.com/en-GB/futbol-femenino/calendar),
[RFEF](https://rfef.es/en/noticias/Spanish-football-unveils-the-calendars-for-the-2026-27-season)),
and api-football is still serving the *completed* 2025-26 table under `season=2026`
— exactly the upstream rollover lag the guard was written for. The two earlier runs
shipped the mislabel, precisely as the 2026-08-30 HANDOFF entry warned they would
("the mini's daily run uses the OLD refresh_women.py until this pushes"). Both
Liga F and FA WSL now swap automatically once api publishes a genuinely current
table. **No action.**

**4. gap-league-watch — Greek Super League 2 auto-promoted**
Ran 3× today (05:04Z scheduled, plus 11:16Z and 11:18Z manual). The scheduled run
fired the `[gap-watch]` ready notice; the manual runs resolved the last two
unmatched clubs and auto-promoted. Verified end to end:
`scripts/apifootball/leagues.json` now has `{league_id: 494, Greece, Super League 2,
season 2026, level 2}` and carries **121** leagues (was 120); `leagues_pending.json`
is down to India alone. Both clubs are live in Supabase `football_lookup` —
`PAS Pyrgos`/`Pyrgos 1968` → Pyrgos, and `Apollon Kalamarias`/`Apollon Pontou` →
Thessaloniki, both level 2, applied 09:56Z. Per the HANDOFF entry the full-table
hash matched the workbook **with no exclusions**, so these are workbook-backed and
will survive the next destructive `sync_lookup.py` mirror. **No action.**

---

## Needs Ashwin's attention

### 1. `_current.json` and the per-country leader timelines disagree — and the sanity gate structurally cannot catch it (HIGH)

**What happened.** While verifying the egress-refresh fix I cross-checked all 204
entries in `public/data/leaders/_current.json` against each country's own
`public/data/leaders/<slug>.json` timeline. 177 agree. **12 disagree on the
start date for the same person, and a further set disagree on who the officeholder
even is.** Two are confirmed stale in production right now:

| Country | `_current.json` says | Reality (verified) | Country file |
|---|---|---|---|
| **Estonia** | PM **Kaja Kallas**, since 2021-01-26 | PM **Kristen Michal** since **2024-07-23** | correct already |
| **Mauritius** | PM **Pravind Jugnauth**, since 2017-01-23 | PM **Navin Ramgoolam** since **2024-11-12** | correct already |

Kallas left the Estonian premiership in July 2024 for the EU High Representative
role ([Prime Minister of Estonia](https://en.wikipedia.org/wiki/Prime_Minister_of_Estonia));
Ramgoolam replaced Jugnauth after the November 2024 election
([Prime Minister of Mauritius](https://en.wikipedia.org/wiki/Prime_Minister_of_Mauritius)).
So `_current.json` — the file that feeds the prominent current-leaders display — has
been ~2 years and ~1.8 years stale respectively.

**The drift runs both ways.** For **Bulgaria** it is the *country file* that is
wrong: `bulgaria.json` still flags Kiril Petkov as current PM since 2021-12-13,
while `_current.json` correctly has Rumen Radev as PM since 2026-05-08
([Euronews, 8 May 2026](https://www.euronews.com/my-europe/2026/05/08/bulgarian-parliament-confirms-rumen-radev-as-new-prime-minister)).

The 12 same-person date disagreements (one of each pair is simply wrong):

```
angola      _current 2017-08-23  vs  angola.json      2017-09-26
benin       _current 2026-05-24  vs  benin.json       2026-01-01
comoros     _current 2016-01-01  vs  comoros.json     2016-05-26
cuba        _current 2021-04-19  vs  cuba.json        2018-04-19
micronesia  _current 2023-01-01  vs  ...json          2023-05-11
gambia      _current 2017-01-21  vs  gambia.json      2017-01-19
guinea      _current 2021-10-01  vs  guinea.json      2021-09-05
madagascar  _current 2025-10-14  vs  madagascar.json  2025-10-17
nauru       _current 2023-09-30  vs  nauru.json       2023-10-30
rwanda      _current 2000-03-24  vs  rwanda.json      2000-04-22
somalia     _current 2022-05-15  vs  somalia.json     2022-05-23
uae         _current 2006-02-11  vs  uae.json         2006-01-05
```

Madagascar is the clearest worked example: `_current.json` uses **2025-10-14** (the
CAPSAT takeover window) while `madagascar.json` uses **2025-10-17**, the date
Randrianirina was actually sworn in at the High Constitutional Court
([Wikipedia](https://en.wikipedia.org/wiki/Michael_Randrianirina)). Every other
entry in the file uses the formal inauguration date (Malawi 2025-10-04, Nigeria
2023-05-29), so 2025-10-14 is inconsistent with the site's own convention.

**Root cause.** `scripts/check-leaders-sanity.py` compares `_current.json` only
against **its own previous git revision** (`git show {ref}:{PATH}`). It is a
*change* detector — excellent at catching a bad scrape mid-flight, which is exactly
what it did this morning. But a value that is **stably wrong** never changes, so it
never trips anything, and the per-country timeline files are not consulted at all.
Estonia and Mauritius have been quietly wrong through every green run since
`0f47b8cf4` (2026-06-30, the original hand-population of 97 sovereigns) — that
commit is where Madagascar's 2025-10-14 came from too, so this is hand-entry drift,
not scrape damage.

**Recommended fix.** Add a *cross-file* check to `check-leaders-sanity.py`,
independent of the existing git-diff check:

- For each country in `_current.json`, load `public/data/leaders/<slug>.json`, take
  the entries with `current: true`, and compare.
- **Date rule (high confidence, ship as HARD):** when the names match, `since` must
  equal that entry's `start`. That alone catches all 12 above.
- **Name rule (ship as SOFT first):** flag when `_current.json`'s primary/`second`
  names appear nowhere among the country file's `current` entries. Run it in soft
  mode for a cycle before promoting — my crude version produced 13 hits of which
  most are benign style variants (`King Philippe` vs `Philippe of Belgium`,
  `Tupou VI` vs `Tupou VI of Tonga`, diacritic differences in Vietnam/Samoa), plus
  deliberate curation (Saudi Arabia's `⚠️ Mohammed bin Salman` pin) and legitimate
  different-office pairs (Ireland's President Connolly vs Taoiseach Martin;
  Pakistan's President Zardari vs PM Sharif; Bangladesh's President Shahabuddin vs
  Chief Adviser Yunus). Normalise the crown/warning emoji and a `X of Y` → `X`
  suffix before comparing, or the noise will drown the signal.
- Extend `--self-test` with the Estonia (stale `_current`), Bulgaria (stale country
  file) and Madagascar (date-only) cases — all three are real, and they cover both
  drift directions.

Separately, and independently of the gate: **Estonia, Mauritius and Bulgaria are
wrong on the live site right now** and want a data fix regardless of whether the
check ships.

### 2. feed-monitor's AFL check has never once been green — it is not monitoring anything (MEDIUM)

**What happened.** `~/metro-mini-jobs/feed-monitor.log` reports
`empty:ESPN AFL standings` on **66 of 66 runs**, every day since the monitor's
first entry on 2026-07-01. There is no line anywhere in the file where AFL is `ok`.
The overall run status is still `ok`, so it never alerts.

**Root cause — confirmed by probing the endpoint directly (read-only GET).** The
feed is healthy; the *check* is wrong. ESPN serves AFL with the ladder at the
**top level** and no conference grouping:

```
AFL  https://site.api.espn.com/apis/v2/sports/australian-football/afl/standings
     children: 0          standings.entries: 18   season 2026 (18 Feb – 30 Sep)
     entries[0] = Fremantle, has 'team', non-empty 'stats'
NRL  https://site.api.espn.com/apis/v2/sports/rugby-league/3/standings
     children: 1          (entries live under children[0].standings)
```

`check_espn_standings()` in `feed_shape_monitor.py` short-circuits at line 92:

```python
if not children:
    return "empty", "no conferences/groups (off-season?)"
```

AFL has 18 valid rows sitting in `doc["standings"]["entries"]` that the function
never looks at. **Consequence:** if ESPN's AFL feed genuinely broke tomorrow, the
monitor's output would not change by a single character — it already says `empty`.
The one AFL signal you have is dead, and it is dead in the silent direction.

**Recommended fix.** In `check_espn_standings()`, before the `if not children`
early return, fall back to the flat layout:

```python
if not children:
    entries = (doc.get("standings") or {}).get("entries")
    if isinstance(entries, list) and entries:
        e0 = entries[0]
        if "team" in e0 and isinstance(e0.get("stats"), list) and e0["stats"]:
            return "ok", f"flat standings, {len(entries)} teams"
    return "empty", "no conferences/groups (off-season?)"
```

I verified against the live payload that this returns `ok, flat standings, 18
teams` for AFL today and leaves the NRL/NFL/NBA/NHL/EPL paths untouched. Worth
adding a fixture to the monitor's self-test for the flat shape, since it is now a
layout ESPN demonstrably ships.

### 3. Vercel: 3 billable builds today against the 2/day budget, two of them 45 seconds apart (MEDIUM)

Counted via Vercel MCP `list_deployments` per the CLAUDE.md rule (not GitHub
`deployment_status`). For 2026-08-30 UTC: **24 deployment events, 3 `READY`, 21
`CANCELED`** (canceled are free). The three that built:

| Time (UTC) | Commit | Subject |
|---|---|---|
| 10:53:51 | `bef55cb2a` | `chore(deploy): re-trigger canceled build of 669e6249e (attempt 1) [deploy-retry]` |
| 11:10:08 | `3976ba3c8` | `leaders: fix bad egress-refresh scrape (5 countries) + Norway succession` |
| 11:10:53 | `fcba480ad` | `data: mini refresh - build-time-read data changed, rebuild required` |

The guard is working correctly — all 21 skips were legitimate. But **#2 and #3
landed 45 seconds apart and both needed a build**, so two builds ran where one
would have done. Both were parts of the *same* recovery: the leaders correction and
the refresh data the sanity gate had held. This is precisely the batching failure
CLAUDE.md calls out ("One commit per work item, not one per exchange").

**Recommendation.** When the leaders gate holds a run, the recovery is inherently
one work item — stage the `_current.json`/country-file corrections **and** the held
`$DATA_PATHS` and commit once, without `[vercel skip]`. Worth adding a line to
`metro-mini-refresh.sh`'s gate comment (around line 194-196) saying so, since the
next person to hit a HOLD will otherwise rediscover this the same way. No action
needed on today's spend beyond knowing it happened.

### 4. This sweep job's own wiring is uncommitted (MEDIUM — easy to lose)

`git status` on the repo shows:

```
 M mac-mini-jobs/jobs.toml            (the [[job]] daily-ops-sweep block)
?? mac-mini-jobs/run-daily-ops-sweep.sh   (untracked)
```

`~/metro-mini-jobs/run-daily-ops-sweep.sh` is a **symlink into the working tree**,
so the job runs off an untracked file. Any `git clean`, a fresh clone, or the
REBUILD-RUNBOOK recovery path loses this job entirely and silently — and because
it is the job that reports on the other jobs, nothing would report its absence.

I did not commit these: this run is scoped to the report file only. **Recommend
committing both with `[vercel skip]`** (neither path is build-relevant), plus a
HANDOFF entry so the cloud/Windows instance knows the mini now owns a daily sweep.

This also explains this run's `630m late`: the 01:00Z slot was already long past
when the job block was saved at ~11:27Z, and `catchup_hours = 20` correctly fired
it immediately. Expected first-run behaviour, not a fault — tomorrow it runs at
01:00Z. (`dispatcher.log` also shows `11:27:39Z stale lock file; taking it over`
immediately before, consistent with the interactive session's dispatcher probe.)

### 5. `state.json` says egress-refresh is `ok`; `dispatcher.log` says it FAILED (LOW, but it hides a real event)

`~/metro-mini-jobs/state.json` currently reads:

```json
"egress-refresh": { "last_run_date": "2026-08-30",
                    "last_slot": "2026-08-30T09:00:00+00:00",
                    "last_status": "ok" }
```

but `dispatcher.log` has `FAIL egress-refresh: failed exit 1 after 1852s` for that
same slot, and **no second egress-refresh run exists** — I grepped the whole log
after 09:38:06Z and there is exactly one mention. `dispatcher.py` line 305 writes
`last_status: status` verbatim from `run_job()`, and the `--seed` path writes
`"seeded"` (as `conflicts-monthly`/`cricket-monthly` show), so I could not find a
code path that produces `ok` here. `state.json`'s mtime is 11:20Z — about 10
minutes after the manual-recovery commits.

Most likely this was reconciled by hand during that recovery, which is defensible
(the work *was* completed). Flagging it because the consequence is real: anyone
running `python3 dispatcher.py --status` today sees a clean green board and would
never learn that the weekly civic refresh needed human intervention. If hand-
reconciling state after a manual recovery is the intended workflow, it's worth a
first-class `--mark-ok <job>` flag that writes something like `"ok (manual)"`, so
the log and the state file stop contradicting each other. Same family as the
2026-08-25 HANDOFF note about stale healthchecks tiles after manual recovery.

### 6. S&P 500 membership changes are permanently empty — a product decision, not a break (LOW)

`mktcap-refresh` logs `WARNING: table id=changes not found -- Wikipedia dropped the
changes table; shipping constituents only`, and `public/data/business/sp500.json`
ships `constituents: 503, changes: []`.

This is **already known and handled** — `scripts/business/build_sp500.py` lines
147-158 document that Wikipedia dropped the table on 2026-08-17 and degrade
gracefully to zero changes rather than failing. I verified independently that it
has not come back: the live page's only sections are *S&P 500 component stocks*,
*See also*, *References*, *External links* — no "Selected changes" section at all.

So nothing is broken. But whatever renders `changes` on `/business/sp500` is now
permanently empty, which is a decision for you rather than the pipeline: either
source membership changes elsewhere (S&P's own press releases, or the
`List_of_S%26P_500_companies` page history diffed between runs), or drop the
section from the page so it doesn't read as a bug to visitors.

---

## Notes

- Minor, no action: `~/newsletter-podcast/logs/2026-08-30.log` duplicates two lines
  (`Creating Gmail drafts…` / `Gmail draft step done…` each appear twice) while the
  step's own output confirms exactly two drafts were created. Looks like a doubled
  `tee`/log call in the wrapper, not a double invocation.
- Runners under `~/metro-mini-jobs/runners/` (mlb-sim, business-daily, activity-feed,
  cfb, predictions, forecast) write to stdout only, so the sole record of their
  output is `dispatcher.log`'s **last 12 stdout + 6 stderr lines**. That truncation
  is why this morning's 5 hard flags showed as 1. Not urgent, but a per-run log file
  for those six — as the other runners already keep — would have saved a git-archaeology
  detour today.
