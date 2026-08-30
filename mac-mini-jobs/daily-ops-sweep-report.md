# Daily Ops Sweep -- 2026-08-30

Rolling snapshot, rewritten every run. Window: **2026-08-29T09:00Z → 2026-08-30T11:29Z**
(trailing ~26h). Report-only — this sweep made **no writes** other than this file.

> **This report is a MERGE of two sweeps that ran concurrently today** (see
> "Needs attention #3"). A manually-launched instance (PID 66654) committed
> `8ce2e722d` at 11:38Z; the scheduled instance (PID 66758, `dispatcher.log`
> `11:29:30Z RUN daily-ops-sweep`) finished later and its first write overwrote
> that file. Findings unique to the overwritten version have been recovered from
> git and independently re-verified here — nothing has been lost. Items marked
> ⟲ originated in the manual run.

## Jobs this window: 22 ok, 2 failed, 6 flagged

| Job | Runs | Status |
|---|---|---|
| activity-feed | 08-29 02:39Z, 08-30 02:34Z | ok, ok |
| euro-comps | 08-29 04:09Z, 08-30 04:04Z | ok, ok |
| gap-league-watch | 08-29 05:09Z, 08-30 05:04Z | ok, ok *(flagged — state transition)* |
| football-standings | 08-29 ×4 (05,11,17,23Z), 08-30 ×2 (05,11Z) | all ok |
| business-daily | 08-29 05:51Z, 08-30 05:55Z | ok (617s), ok (617s) |
| substack-daily | 08-29 06:11Z, 08-30 06:16Z | ok, ok |
| mlb-sim | 08-29 07:01Z | **FAIL** exit 1 (1822s) — recurring, see #2 |
| mlb-sim | 08-29 14:30Z, 08-30 07:06Z | ok (1838s), ok (1822s) |
| feed-monitor | 08-29 07:42Z, 08-30 07:46Z | ok, ok *(flagged — AFL blind spot)* |
| mktcap-refresh | 08-29 09:02Z | ok (357s) *(flagged — queue + S&P 500)* |
| egress-refresh | 08-30 09:07Z | **FAIL** exit 1 (1852s) — resolved by hand |
| daily-ops-sweep | 08-30 11:29Z (+ manual 11:28Z) | this run *(flagged — no lock)* |

No `MISSED` entries. `state.json` shows every other job last-ran on its expected
slot (`cfb-sun` 08-23 → next fires tonight 23:40Z; `conflicts-monthly` /
`cricket-monthly` still `seeded` from 08-01 → next fire 09-01). Nothing silently
skipped.

**Non-dispatcher (launchd):** newsletter-podcast daily ok (episode
`25r6DuEyk3js1jDHGqwsSe`, 34:13, both Gmail drafts created); newsletter-podcast
weekly ok — clean skip, no unnarrated Substack post in the 14-day window (the
Substack has been quiet since 2026-07-01, so this skip repeats weekly);
f1 hourly watcher idle all 24h (`2026 R12 already synced`).

---

## Self-healed (informational only, no action needed)

**1. egress-refresh FAIL — leaders sanity gate HELD the commit (2026-08-30 09:38Z)**
The gate did its job: a bad Wikidata scrape hit 5 hard flags and the commit was
held. **Already investigated and fixed by hand ~90 min later** by the interactive
session — commits `3976ba3c8` (leaders fix) and `fcba480ad` (the held refresh
data), 11:10Z.

`dispatcher.log` retains only the last 6 stderr lines, so it shows 1 of the 5 hard
flags. The full set per `3976ba3c8`: Hungary + India (scrape collapsed the
PM/president pair to the ceremonial president), Madagascar + Malawi (reverted to
each country's *ousted* predecessor with a self-consistent old date), Nigeria
(cosmetic name truncation).

Re-ran `scripts/check-leaders-sanity.py` read-only: **exit 0, 0 hard flags**, 1
pre-existing Switzerland soft flag. Independently verified the Norway succession
shipped in the same commit — Harald V died 2026-08-28 aged 89 after 35 years,
Haakon succeeded as Haakon VIII ([NPR](https://www.npr.org/2026/08/28/nx-s1-5947778/norways-king-harald-v-dies-king-haakon-viii),
[Al Jazeera](https://www.aljazeera.com/news/2026/8/28/norways-king-harald-v-dies-succeeded-by-son))
— plus Malawi's Peter Mutharika (2025-10-04) and Madagascar's Michael
Randrianirina. All match production. **Nothing further needed.**

The underlying *scrape* bug is unfixed — only the data was corrected.
`egress-refresh` is weekly (Sundays), so the same countries may trip the gate
again on **2026-09-06**. The gate will hold it again, which is the designed
behaviour.

**2. Liga F `[2025-26] PLACEHOLDER` — this is the fix landing, not a regression**
Today's three football-standings runs disagree, which looks alarming in isolation:
00:02Z and 06:04Z say `Liga F (id 142): 16 standings rows [2026-27]`; 11:08Z says
`[2025-26] PLACEHOLDER`. **The 11:08Z line is the correct one.** Commit
`50951cab3` (women's season guard, `looks_fresh()` in
`scripts/apifootball/refresh_women.py`) landed 11:02Z and the runner's ff-only
pull picked it up. Confirmed against the real world: **Liga F 2026-27 kicked off
today, 30 August 2026** ([LALIGA](https://www.laliga.com/en-GB/futbol-femenino/calendar),
[RFEF](https://rfef.es/en/noticias/Spanish-football-unveils-the-calendars-for-the-2026-27-season)),
and api-football is still serving the *completed* 2025-26 table under
`season=2026` — exactly the rollover lag the guard was written for. The two
earlier runs shipped the mislabel, precisely as the 2026-08-30 HANDOFF entry
warned. Both Liga F and FA WSL now swap automatically once api publishes a
genuinely current table. **No action.**

**3. gap-league-watch — Greek Super League 2 auto-promoted**
Ran 3× today (05:04Z scheduled + 11:16Z/11:18Z manual). Verified end to end:
`scripts/apifootball/leagues.json` now has `{league_id: 494, Greece, Super League
2, season 2026, level 2}` and carries **121** leagues (was 120);
`leagues_pending.json` is down to India alone. Both clubs live in Supabase
`football_lookup` — `PAS Pyrgos`/`Pyrgos 1968` → Pyrgos and `Apollon
Kalamarias`/`Apollon Pontou` → Thessaloniki, level 2, applied 09:56Z. Per the
HANDOFF entry the full-table hash matched the workbook **with no exclusions**, so
these are workbook-backed and survive the next destructive `sync_lookup.py`
mirror. **No action.**

---

## Needs Ashwin's attention

### 1. 🔴 ⟲ The sound-pipeline atomic-credits fix never reached the mini — due before Wednesday

The 2026-08-27 HANDOFF entry ("cloud → MINI: THE SOUND PIPELINE NEEDS THIS FIX
APPLIED") is marked *ACTION REQUIRED ON THE MINI, BEFORE NEXT WEDNESDAY'S
`sound-weekly` RUN*. **It has not been done.** Re-verified read-only this run:

```
grep -c atomic_extra ~/som-pipeline/credit_split_config.json   -> 0
atomic_extra in export_site.py / score_both58.py               -> absent
mtimes: all three files 2026-07-02  (untouched since July)
```

**Consequence.** `sound-weekly` next fires **Wednesday 2026-09-02 07:30Z**
(`jobs.toml`: `time = "07:30"`, `weekdays = [3]`). With the stale config it will
re-emit the fused phantom entities ("Ice Spice and Nicki Minaj" etc.) with no
metro and no score reaching either artist.

**Fix.** Copy `credit_split_config.json`, `export_site.py`, `score_both58.py` from
`~/OneDrive/Documents/Claude/Projects/Metro Area Project/_sound_of_metros_pipeline/`
to `~/som-pipeline/`. **Back up and diff the mini's current
`credit_split_config.json` first** — per the handoff it is a separately drifted
copy that may hold mini-only overrides. Then confirm
`grep -c atomic_extra ~/som-pipeline/credit_split_config.json` returns 42 before
Wednesday. This is the only item here with a hard deadline.

### 2. ⟲ mlb-sim hard-fails on any in-progress NRL game — second occurrence, same shape

Not a one-off, and my scheduled run initially under-called this as transient. Both
occurrences in the entire dispatcher history are **Saturday 07:00Z** runs, both
NRL, both exactly `-1` on exactly two teams:

```
1455: 2026-08-15T07:32:12Z  ! [nrl] fixture/record count mismatch: {'cronulla': -1, 'canberra': -1}
4008: 2026-08-29T07:32:18Z  ! [nrl] fixture/record count mismatch: {'souths': -1, 'titans': -1}
```

**Root cause.** `reconcile_remaining()` in
`scripts/predictions/build_season_sims.py` (line 385) only absorbs *positive*
excess — fixtures the records say were already played. A **negative** excess (a
fixture that has left the upcoming list before the record updates, i.e. a match
currently in progress) falls through to `raise SystemExit(...)` at **line 412**,
failing the whole multi-league job with exit 1 and firing an ntfy alert. The
docstring only anticipates "afltables lags ESPN" — the opposite direction.

**Why it matters more than the failure.** The job builds all seven leagues; one
in-flight NRL match aborts the run after ~30 minutes, and the log warns "partial
data may still have been committed". It recurs every Saturday the NRL plays.
(The *data* does self-heal — the 14:30Z run and today's 07:06Z run were both
clean, the latter with zero stderr — but the alert and the wasted run do not.)

**Fix.** Treat a small negative excess as lag, mirroring how positive excess is
already tolerated: before the hard exit, allow `-1` per team when the deficit is
consistent with one missing fixture (even number of teams) and log a warning
instead of exiting; keep the hard failure for anything larger or lopsided.
Smaller, more reversible alternative: move the Saturday `mlb-sim` 07:00Z slot,
which is mid-afternoon AEST and squarely inside the NRL Saturday window — a
one-line `jobs.toml` change that stops the alert this weekend.

### 3. ⟲ `run-daily-ops-sweep.sh` has no concurrency lock — it ran twice today, and one run's report overwrote the other's

Two instances ran simultaneously:

- **PID 66654**, started 12:28:49 BST — launched **manually** from the interactive
  Claude session (parent chain: `claude` desktop PID 65048). Committed
  `8ce2e722d` at 12:38:30 BST.
- **PID 66758**, started 12:29:31 BST — the **scheduled** run via
  `hc-run.sh daily-ops-sweep` (`dispatcher.log`: `11:29:30Z RUN daily-ops-sweep
  (slot 2026-08-30 01:00Z, 630m late)`). Committed second.

`logs/daily-ops-sweep-2026-08-30.log` shows both start banners 42 seconds apart.
The second instance fetched, fast-forwarded past the first's commit, and
**overwrote the report wholesale** — the report is a full-rewrite snapshot, so
three findings (#1, #2, #5 here) were destroyed and had to be recovered from
`git show 8ce2e722d:` and re-verified. Both instances also fired their own ntfy
digest, which is exactly the notification noise this job exists to remove, and
each burned a separate `--max-budget-usd 10`.

**Root cause.** `dispatcher.py` protects *itself* with `.dispatcher.lock`
(`acquire_lock()`, line 184), but individual runner scripts have none, and neither
`hc-run.sh` nor `runners/_common.sh` adds one.

**Fix.** Add a lock at the top of `run-daily-ops-sweep.sh`, before the `claude -p`
call:

```bash
LOCKDIR="$HOME/metro-mini-jobs/.daily-ops-sweep.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  log "another sweep is already running (lock $LOCKDIR); exiting"; exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
```

`mkdir` is atomic on macOS; exiting 0 keeps healthchecks green for the yielding
instance. Worth the same guard in `runners/_common.sh` generally, but this job is
the urgent case because it writes *and* notifies. Today's double-run is partly an
artefact of the job being commissioned and hand-tested this morning — the lock is
still the right fix.

### 4. `_current.json` and the per-country leader timelines disagree — the sanity gate structurally cannot catch it

Cross-checked all 204 entries in `public/data/leaders/_current.json` against each
country's own `<slug>.json` timeline. 177 agree. **12 disagree on the start date
for the same person**, and two entries are confirmed stale in production now:

| Country | `_current.json` says | Reality (verified) | Country file |
|---|---|---|---|
| **Estonia** | PM **Kaja Kallas**, since 2021-01-26 | PM **Kristen Michal** since **2024-07-23** | already correct |
| **Mauritius** | PM **Pravind Jugnauth**, since 2017-01-23 | PM **Navin Ramgoolam** since **2024-11-12** | already correct |

Kallas left the Estonian premiership in July 2024 for the EU High Representative
role ([Prime Minister of Estonia](https://en.wikipedia.org/wiki/Prime_Minister_of_Estonia));
Ramgoolam replaced Jugnauth after the November 2024 election
([Prime Minister of Mauritius](https://en.wikipedia.org/wiki/Prime_Minister_of_Mauritius)).
So the file feeding the current-leaders display is ~2 years and ~1.8 years stale.

**The drift runs both ways.** For **Bulgaria** the *country file* is the wrong one:
`bulgaria.json` still flags Kiril Petkov as current PM since 2021-12-13, while
`_current.json` correctly has Rumen Radev as PM since 2026-05-08
([Euronews, 8 May 2026](https://www.euronews.com/my-europe/2026/05/08/bulgarian-parliament-confirms-rumen-radev-as-new-prime-minister)).

The 12 same-person date disagreements (one of each pair is wrong):

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

Madagascar is the clearest example: `_current.json` uses **2025-10-14** (the
CAPSAT takeover window) while `madagascar.json` uses **2025-10-17**, the date
Randrianirina was sworn in at the High Constitutional Court
([Wikipedia](https://en.wikipedia.org/wiki/Michael_Randrianirina)). Every other
entry uses the formal inauguration date (Malawi 2025-10-04, Nigeria 2023-05-29),
so 2025-10-14 breaks the file's own convention.

**Root cause.** `check-leaders-sanity.py` compares `_current.json` only against
**its own previous git revision** (`git show {ref}:{PATH}`). It is a *change*
detector — excellent at catching a bad scrape mid-flight, which is what it did
this morning. A value that is **stably wrong** never changes, so it never trips,
and the per-country timelines are never consulted. Estonia and Mauritius have been
wrong through every green run since `0f47b8cf4` (2026-06-30, the original
hand-population of 97 sovereigns) — which is also where Madagascar's date came
from. Hand-entry drift, not scrape damage.

**Fix.** Add a *cross-file* check to `check-leaders-sanity.py`, independent of the
git-diff check. For each country, load `<slug>.json`, take `current: true` entries,
and compare:

- **Date rule (HARD):** when names match, `since` must equal that entry's `start`.
  Catches all 12 above.
- **Name rule (SOFT first):** flag when `_current.json`'s primary/`second` names
  appear nowhere among the country file's current entries. Run soft for a cycle —
  my version produced 13 hits, mostly benign style variants (`King Philippe` vs
  `Philippe of Belgium`, `Tupou VI` vs `Tupou VI of Tonga`, Vietnam/Samoa
  diacritics), deliberate curation (Saudi Arabia's `⚠️ Mohammed bin Salman` pin),
  and legitimate different-office pairs (Ireland President Connolly vs Taoiseach
  Martin; Pakistan President Zardari vs PM Sharif; Bangladesh President
  Shahabuddin vs Chief Adviser Yunus). Normalise the crown/warning emoji and an
  `X of Y` → `X` suffix first, or noise drowns signal.
- Extend `--self-test` with the Estonia (stale `_current`), Bulgaria (stale country
  file) and Madagascar (date-only) cases — real, and covering both directions.

Independently of the gate: **Estonia, Mauritius and Bulgaria are wrong on the live
site right now.**

### 5. feed-monitor's AFL check has never once been green — it is not monitoring anything

`feed-monitor.log` reports `empty:ESPN AFL standings` on **66 of 66 runs** since
2026-07-01. There is no line where AFL is `ok`. Overall status stays `ok`, so it
never alerts.

**Root cause — confirmed by probing the endpoint read-only.** The feed is healthy;
the *check* is wrong. ESPN serves AFL with the ladder at the **top level**, no
conference grouping:

```
AFL  .../australian-football/afl/standings
     children: 0        standings.entries: 18   season 2026 (18 Feb – 30 Sep)
     entries[0] = Fremantle, has 'team', non-empty 'stats'
NRL  .../rugby-league/3/standings
     children: 1        (entries live under children[0].standings)
```

`check_espn_standings()` in `feed_shape_monitor.py` short-circuits at line 92
(`if not children: return "empty", ...`) and never looks at the 18 valid rows in
`doc["standings"]["entries"]`.

**Consequence:** if ESPN's AFL feed genuinely broke tomorrow the monitor's output
would not change by one character — it already says `empty`. Dead in the silent
direction. (The AFL *pipeline* sources elsewhere, so no data is at risk today —
this is purely a lost alarm.)

**Fix.** Before the `if not children` early return, fall back to the flat layout:

```python
if not children:
    entries = (doc.get("standings") or {}).get("entries")
    if isinstance(entries, list) and entries:
        e0 = entries[0]
        if "team" in e0 and isinstance(e0.get("stats"), list) and e0["stats"]:
            return "ok", f"flat standings, {len(entries)} teams"
    return "empty", "no conferences/groups (off-season?)"
```

Verified against the live payload: returns `ok, flat standings, 18 teams` for AFL
today and leaves NRL/NFL/NBA/NHL/EPL untouched. Add a self-test fixture for the
flat shape — ESPN demonstrably ships it. (Alternative, if AFL is genuinely not
worth monitoring: drop the check rather than leave it permanently amber.)

### 6. This sweep job's own wiring is uncommitted

```
 M mac-mini-jobs/jobs.toml               (the [[job]] daily-ops-sweep block)
?? mac-mini-jobs/run-daily-ops-sweep.sh  (untracked)
```

`~/metro-mini-jobs/run-daily-ops-sweep.sh` is a **symlink into the working tree**,
so the job runs off an untracked file. Any `git clean`, a fresh clone, or the
REBUILD-RUNBOOK recovery path loses this job silently — and because it is the job
that reports on the other jobs, nothing would report its absence.

Not committed by this run (scoped to the report only). **Recommend committing both
with `[vercel skip]`** (neither path is build-relevant), plus a HANDOFF entry so
the cloud/Windows instance knows the mini owns a daily sweep.

This also explains the `630m late`: the 01:00Z slot was long past when the job
block was saved ~11:27Z, and `catchup_hours = 20` correctly fired it immediately.
Expected first-run behaviour. Tomorrow it runs at 01:00Z.

### 7. ⟲ mktcap metro curation queue: 26 companies awaiting a ruling

The 08-29 09:00Z run pushed a `METRO QUEUE` alert listing 22 new companies.
Read-only Supabase check this run confirms **`mktcap_geo` holds exactly 26 rows
with `mapped_by = 'auto-stub'`**:

```
seed 12157 | excel-sync 1905 | claude-researched 48 | auto-stub 26 | ashwin 3
```

Heavily weighted to Japan and South Korea — Hyosung Corporation / TNC / Chemical /
ITX, HD Construction Equipment, LX International, LX Hausys, SNT Dynamics (KR);
Daiwabo Holdings, Sansan, JustSystems, Tomen Devices, Furukawa, SYLA Holdings (JP);
plus Hengli Petrochemical (CN), Erste Bank Polska (PL), Vincorion (DE), Panasonic
Manufacturing Malaysia, Ryerson / Lyntris / First Breach (US), VivoPower (UK).

Note `mac-mini-jobs/mktcap-review-queue.md` reads `METRO QUEUE (new, unmapped):
none` — that is the *new-this-run* queue and is not in conflict; these 26 are the
standing backlog. No fix required, this is the queue working as designed; flagged
only because the alert fired and nothing has consumed it.

### 8. Vercel: 3 billable builds today against the 2/day budget, two 45 seconds apart

Counted via Vercel MCP `list_deployments` per the CLAUDE.md rule (not GitHub
`deployment_status`). For 2026-08-30 UTC: **24 deployment events, 3 `READY`, 21
`CANCELED`** (canceled are free).

| Time (UTC) | Commit | Justified? |
|---|---|---|
| 10:53:51 | `bef55cb2a` deploy-retry | Yes — `run-deploy-watch.sh` healing a canceled build |
| 11:10:08 | `3976ba3c8` leaders fix | Yes — `public/data/leaders/**` is build-time read |
| 11:10:53 | `fcba480ad` mini refresh | Yes — build-time-read data changed |

All three individually legitimate and the skip-tagging worked correctly across
~20 pushes. But the last two landed **45 seconds apart and were the same piece of
work** (the leaders fix, then the refresh that consumed it). Squashed, the day
comes in on budget. This is the "one commit per work item, not one per exchange"
rule.

**Recommendation.** When the leaders gate holds a run, the recovery is inherently
one work item — stage the corrections **and** the held `$DATA_PATHS` and commit
once. Worth a line in `metro-mini-refresh.sh`'s gate comment (~line 194-196), since
the next person to hit a HOLD will otherwise rediscover this the same way. Nothing
to undo today.

### 9. S&P 500 membership changes permanently empty — a product decision, not a break

`mktcap-refresh` logs `WARNING: table id=changes not found -- Wikipedia dropped the
changes table`, and `public/data/business/sp500.json` ships `constituents: 503,
changes: []`.

Already known and handled — `scripts/business/build_sp500.py` lines 147-158
document the 2026-08-17 removal and degrade gracefully rather than failing. I
verified independently that it has not returned: the live page's only sections are
*S&P 500 component stocks*, *See also*, *References*, *External links*.

Nothing is broken, but whatever renders `changes` on `/business/sp500` is now
permanently empty. Your call: source membership changes elsewhere (S&P press
releases, or diff the constituents list between runs), or drop the section so it
doesn't read as a bug.

---

## Minor observations (no action strictly required)

- ⟲ **The mktcap runner's failure message misattributes errors.** When the 08-29
  19:21 manual run died on a `mktcap_unicorns` identity-column 400, the runner
  printed `ERROR: refresh.py --write failed (exit 1) -- check the sanity gate: a
  >5% week-over-week source swing aborts before writing`. The sanity gate was not
  involved. That hardcoded hint will send the next investigator down the wrong
  path; make it generic or echo the real exception.
- ⟲ **`[mktcap] WARNING: rename NVDA -> MSTR SKIPPED ... Fix mktcap_symbol_changes`
  is self-test fixture noise, not a real problem** — it originates in
  `scripts/mktcap/selftest.py` as the deliberate recycled-ticker case and prints
  inside the self-test block. The live run reported `rename guard: 0 recycled-ticker
  renames skipped: []`. Worth prefixing self-test output so it cannot be mistaken
  for a production warning.
- **`state.json` records `egress-refresh` as `"ok"` for the 09:00Z slot** while
  `dispatcher.log` records `FAIL` for that same slot, and there is no second run in
  the log. `dispatcher.py` line 305 writes the true status, and `--seed` writes
  `"seeded"`, so something else set it — most plausibly hand-reconciliation during
  the 11:10Z recovery, which is defensible since the work was completed. Consequence:
  `dispatcher.py --status` shows a clean green board today and would never reveal
  that the weekly civic refresh needed human intervention. If hand-reconciling is
  the intended workflow, a first-class `--mark-ok <job>` writing `"ok (manual)"`
  would stop the log and state file contradicting each other. Same family as the
  2026-08-25 HANDOFF note on stale healthchecks tiles after manual recovery.
- **`~/newsletter-podcast/logs/2026-08-30.log` duplicates two lines** (`Creating
  Gmail drafts…` / `Gmail draft step done…`) while the step's own output confirms
  exactly two drafts were created. Looks like a doubled `tee`/log call, not a
  double invocation.
- **Runners under `~/metro-mini-jobs/runners/`** (mlb-sim, business-daily,
  activity-feed, cfb, predictions, forecast) write to stdout only, so their sole
  record is `dispatcher.log`'s **last 12 stdout + 6 stderr lines**. That truncation
  is why this morning's 5 hard flags showed as 1. A per-run log file for those six —
  as the other runners already keep — would have saved a git-archaeology detour.
