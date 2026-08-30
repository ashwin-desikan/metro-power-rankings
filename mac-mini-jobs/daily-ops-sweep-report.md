# Daily Ops Sweep -- 2026-08-30

Window: 2026-08-29 09:30Z → 2026-08-30 11:30Z (trailing ~26h). Read-only run;
nothing was fixed, re-run, pinged or written except this file.

## Jobs this window: 21 ok, 2 failed, 6 flagged

Dispatcher-scheduled runs (23 total, from `dispatcher.log`):

| Job | Runs | Status |
|---|---|---|
| football-standings | 6 | all DONE (05/11/17/23Z 08-29, 05/11Z 08-30) |
| activity-feed | 2 | DONE, DONE |
| euro-comps | 2 | DONE, DONE |
| gap-league-watch | 2 | DONE, DONE |
| business-daily | 2 | DONE (617s), DONE (617s) |
| substack-daily | 2 | DONE, DONE |
| feed-monitor | 2 | DONE, DONE |
| mlb-sim | 3 | **FAIL** 08-29 07:00Z; DONE 08-29 14:30Z; DONE 08-30 07:00Z |
| mktcap-refresh | 1 | DONE (weekly, Sat 08-29 09:00Z) |
| egress-refresh | 1 | **FAIL** 08-30 09:00Z (weekly, Sun) |

No `MISSED` slots this window. Non-dispatcher jobs also checked and healthy:
newsletter-podcast daily digest (both days — see self-healed #3), the hourly F1
poller (idle, 2026 R12 already synced), Spotify retention (deleted 1 aged
episode), podcast watchdog (final.mp3 present, episode READY).

## Self-healed (informational only, no action needed)

**1. mlb-sim FAIL, 2026-08-29 07:00Z — NRL fixture/record race, not a data bug.**
`[nrl] fixture/record count mismatch: {'souths': -1, 'titans': -1}` from
`scripts/predictions/build_season_sims.py:412`. `-1` means `gp + remaining` came
in one game *short* of the season length for exactly two teams — i.e. one
head-to-head fixture had dropped off the "remaining" list but the played-record
hadn't ticked yet. Confirmed via search: **Titans v Rabbitohs, NRL Round 26, was
played 2026-08-29** — the 08:07 BST run landed right on kickoff. The 14:30Z run
the same day and the 07:00Z run on 08-30 both reconciled clean. Data is correct
now. (The recurrence pattern is a separate item — see attention #2.)

**2. egress-refresh FAIL, 2026-08-30 09:00Z — leaders sanity gate held the commit,
already investigated and fixed.** The gate flagged 5 hard problems and correctly
refused to auto-commit `_current.json`. A `mac-mini[claude]` session investigated
each and fixed them at 12:10 BST in `3976ba3c8` ("leaders: fix bad egress-refresh
scrape (5 countries) + Norway succession"): Hungary/India had collapsed to the
ceremonial President instead of the PM; Madagascar/Malawi had reverted to ousted
predecessors; Nigeria was a cosmetic name truncation. The refresh was then re-run
successfully and committed as `fcba480ad`. **I re-ran
`scripts/check-leaders-sanity.py` this run: exit 0, 0 hard flags**, only the known
pre-existing Switzerland soft flag (`"Swiss Federal Council" has no since date`).
Nothing further needed.

**3. newsletter-podcast, 2026-08-29 08:00 — Claude Code OAuth expired, recovered
same morning.** `Failed to authenticate: OAuth session expired and could not be
refreshed`; the runner's guard correctly skipped the retry. A manual re-run at
08:15:45 completed the full pipeline and published the episode
(`440dXOdlthwCD3gYPbAHKX`). Today's 08:00 run was clean end to end (34:13 audio,
episode `25r6DuEyk3js1jDHGqwsSe`, both Gmail drafts created).

**4. mktcap `write_unicorns` HTTP 400, 2026-08-29 19:21 — fixed the same evening.**
`POST /rest/v1/mktcap_unicorns -> HTTP 400: Column "id" is an identity column
defined as GENERATED ALWAYS`. The DELETE had already committed, so the table was
briefly left empty. `build_merged.py::write_unicorns` was fixed to omit `id` (the
docstring now records the incident), and the 19:23 re-run wrote the table back.
**Verified read-only in Supabase this run: `mktcap_unicorns` = 1404 rows.** Healthy.

**5. gap-league-watch — Greece Super League 2 auto-promoted (state change, expected).**
The 05:00Z scheduled run moved it `awaiting_target -> ready` (2026 standings
coverage came on) but held with 1 unmatched club. Two later manual runs at
12:16/12:18 BST cleared the last unmatched team and auto-promoted it into
`leagues.json` (`49496b533`). India L1 (Indian Super League) remains
`awaiting_target` — api-football's latest published season is still 2025. The
`[vercel skip]` tag on that commit is **correct**: it touched only
`scripts/apifootball/*.json`, and `scripts/` is deliberately not in
`scripts/vercel-build-paths.txt`.

## Needs Ashwin's attention

### 1. 🔴 The sound-pipeline atomic-credits fix never reached the mini — due before Wednesday

**What happened.** The 2026-08-27 HANDOFF entry ("cloud → MINI: THE SOUND PIPELINE
NEEDS THIS FIX APPLIED") is marked *ACTION REQUIRED ON THE MINI, BEFORE NEXT
WEDNESDAY'S `sound-weekly` RUN*. It has not been done.

**Evidence (checked read-only this run).** In `~/som-pipeline`:
- `credit_split_config.json` — no `atomic_extra` key (0 matches)
- `export_site.py`, `score_both58.py` — neither reads `atomic_extra`
- Neither of the two OneDrive-only probe overrides (`Prospa & Cloonee`,
  `Hugel, Imael Angel & Ultra Naté`) is present
- All three files still dated **2026-07-02** — untouched since July

**Consequence.** `sound-weekly` next fires **Wednesday 2026-09-02 07:30Z**
(`jobs.toml`: `time = "07:30"`, `weekdays = [3]`). With the stale config it will
re-emit the fused phantom entities ("Ice Spice and Nicki Minaj" etc.) with no
metro and no score reaching either artist, and print the loud stderr WARNING the
new code was written to emit in exactly this situation.

**Recommended fix.** Copy the three fixed files from
`~/OneDrive/Documents/Claude/Projects/Metro Area Project/_sound_of_metros_pipeline/`
to `~/som-pipeline/`: `credit_split_config.json`, `export_site.py`,
`score_both58.py`. Back up the mini's current `credit_split_config.json` first —
per the handoff it is a *separately drifted* copy, so diff it before overwriting
in case it holds mini-only overrides that aren't in the OneDrive version. Then
confirm `grep -c atomic_extra ~/som-pipeline/credit_split_config.json` returns 42
names before Wednesday.

### 2. mlb-sim hard-fails on any in-progress NRL game — second occurrence, same shape

**What happened.** This is not a one-off. Both occurrences in the whole
dispatcher history are Saturday 07:00Z runs, both NRL, both exactly `-1` on
exactly two teams:
- `2026-08-15T07:32:12Z` — `{'cronulla': -1, 'canberra': -1}`
- `2026-08-29T07:32:18Z` — `{'souths': -1, 'titans': -1}`

**Root cause.** `reconcile_remaining()` in
`scripts/predictions/build_season_sims.py` (~line 385) only knows how to absorb
*positive* excess — it drops fixtures the records say were already played. A
**negative** excess (a fixture that has left the upcoming list before the record
updates, i.e. a match currently in progress) falls straight through the loop to
`raise SystemExit(...)` at line 412, which fails the whole multi-league job with
exit 1 and fires an ntfy alert. The docstring only anticipates "afltables lags
ESPN", the opposite direction.

**Why it matters more than the failure itself.** The job builds *all* leagues;
one in-flight NRL match aborts the run after ~30 minutes of work, and the
dispatcher's own log line says "partial data may still have been committed". It
will keep recurring on Saturdays for as long as the NRL season runs.

**Recommended fix.** Treat a small negative excess as lag rather than a
structural mismatch — mirroring how positive excess is already tolerated. In
`reconcile_remaining`, before the hard exit, allow `-1` per team when the
deficit is consistent with an even number of teams (one missing fixture) and log
a warning instead of exiting; keep the hard failure for anything larger or
lopsided. Alternatively (smaller, more reversible) move the Saturday `mlb-sim`
slot off 07:00Z, which is mid-afternoon AEST and squarely inside the NRL
Saturday window. The first is the real fix; the second is a one-line
`jobs.toml` change if you want the alert to stop this weekend.

### 3. `run-daily-ops-sweep.sh` has no concurrency lock — it ran twice today

**What happened.** Two instances of this sweep ran simultaneously today:
- PID 66654, started 12:28:49 BST — launched **manually** from the interactive
  Claude Code session (parent chain: `claude` desktop session PID 65048)
- PID 66758, started 12:29:31 BST — the **real scheduled run** via
  `hc-run.sh daily-ops-sweep` (`dispatcher.log`: `11:29:30Z RUN daily-ops-sweep
  (slot 2026-08-30 01:00Z, 630m late)`)

`logs/daily-ops-sweep-2026-08-30.log` shows both "=== Daily Ops Sweep start ==="
lines 42 seconds apart.

**Root cause.** `dispatcher.py` protects *itself* with `.dispatcher.lock`
(`acquire_lock()`, line 184), but the individual runner scripts have none, and
neither `hc-run.sh` nor `runners/_common.sh` adds one. For most jobs a double-run
is merely wasteful. For this one it means two headless Claude sessions racing on
the same git working tree, both `git add/commit/push`-ing the same report file,
both firing an ntfy digest, and each burning a separate `--max-budget-usd 10`.
Two ntfy notifications is precisely the noise problem this job was commissioned
to remove.

**Recommended fix.** Add a lock at the top of `run-daily-ops-sweep.sh`, before
the `claude -p` call:

```bash
LOCKDIR="$HOME/metro-mini-jobs/.daily-ops-sweep.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  log "another sweep is already running (lock $LOCKDIR); exiting"; exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
```

`mkdir` is atomic on macOS, and exiting 0 keeps healthchecks green for the
instance that yields. Worth considering the same guard in `runners/_common.sh`
for every job, but this one is the urgent case because it writes and notifies.

*(Note: today's double-run is partly an artefact of the job being commissioned
and hand-tested this morning. The lock is still the right fix — nothing prevents
a repeat.)*

### 4. Wikipedia dropped the S&P 500 "selected changes" table — 3 weeks running, verified live

**What happened.** `build_sp500.py` has logged
`WARNING: table id=changes not found -- Wikipedia dropped the changes table;
shipping constituents only` on every weekly run since 2026-08-17. Clean on
08-08 and 08-15, missing on 08-17, 08-22 and 08-29 — a persistent upstream
change, not a transient scrape failure.

**Verified this run (live fetch of the same API the script uses).** The wikitext
of `List_of_S&P_500_companies` now contains exactly **one** table,
`id="constituents"`. There is no `changes` table and no second `{|` table start
anywhere on the page. The script's own diagnosis is correct, and its
`parse_changes()` (which looks for `parse_table(wikitext, "changes")`) cannot be
fixed by re-pointing a selector — the data is simply no longer on that page. The
article's Talk page carries a discussion debating table structure and content
inclusion, so this reads as a deliberate editorial removal.

**Impact is contained.** `build_sp500.py` degrades gracefully — the 08-29 run
still shipped 503 constituents, 496 matched to the site universe. Only the
membership-changes feed is dead (`changes rows: 0`).

**Recommended fix — your call between two options.** (a) Accept it: drop
`parse_changes()` and any UI that renders changes, and remove the warning so it
stops looking like a fault. (b) Re-source it: S&P Dow Jones Indices publishes
every index change as a press release at `press.spglobal.com` (e.g. the
2026-03-06 Vertiv/Lumentum/Coherent/EchoStar announcement), which is the
authoritative upstream Wikipedia was itself copying. (b) is more work and a new
scrape surface; (a) is honest and cheap. Either way the current state — a
weekly warning nobody acts on — is the worst of the three.

### 5. mktcap metro curation queue: 26 unmapped companies waiting

The 08-29 09:00Z run emitted a `METRO QUEUE (new, unmapped — for Ashwin)` push
listing 22 new companies. **Read-only Supabase check this run: `mktcap_geo` holds
26 rows with `mapped_by = 'auto-stub'`** still awaiting a metro ruling. Heavily
weighted to Japan and South Korea — Hyosung Corporation, Hyosung TNC, Hyosung
Chemical, Hyosung ITX, HD Construction Equipment, LX International, LX Hausys,
SNT Dynamics (KR); Daiwabo Holdings, Sansan, JustSystems, Tomen Devices, Furukawa,
SYLA Holdings (JP); plus Hengli Petrochemical (CN), Erste Bank Polska (PL),
Vincorion (DE), Panasonic Manufacturing Malaysia, Ryerson / Lyntris / First Breach
(US), VivoPower (UK).

No fix required — this is the queue working as designed. Flagging it only
because it is the alert that fired and nothing has consumed it yet.

### 6. Vercel: 3 production builds today against the 2/day budget, two of them 45s apart

Counted with the Vercel MCP per the CLAUDE.md discipline (`list_deployments`,
counting `state: READY`; the other 17 deployments today were `CANCELED` and are
free):

| Build | Commit | Justified? |
|---|---|---|
| `dpl_BA1jVBFh…` 11:10:08Z | `3976ba3c8` leaders fix | Yes — `public/data/leaders/**` is build-time read |
| `dpl_ETPmUkTe…` 11:10:53Z | `fcba480ad` mini refresh | Yes — build-time-read data changed |
| `dpl_3oKzDjy7…` 10:53Z | `bef55cb2a` deploy-retry | Yes — `run-deploy-watch.sh` healing a canceled build |

All three were individually legitimate, and the skip-tagging worked correctly
across ~20 pushes. But the first two landed **45 seconds apart** and were the
same piece of work (the leaders fix, then the refresh that consumed it). Squashed
or pushed together that would have been one build, and the day would have come in
on budget. This is exactly the "one commit per work item, not one per exchange"
rule in CLAUDE.md. Nothing to undo — noting it so the pattern is visible.

### 7. Minor observations (no action strictly required)

- **The mktcap runner's failure message misattributes errors.** When the 08-29
  19:21 run died on the `mktcap_unicorns` identity-column 400, the runner printed
  `ERROR: refresh.py --write failed (exit 1) -- check the sanity gate: a >5%
  week-over-week source swing aborts before writing`. The sanity gate had nothing
  to do with it. That hardcoded hint will send the next investigator down the
  wrong path; worth making it generic or echoing the real exception.
- **`state.json` records `egress-refresh` as `"ok"` for the 2026-08-30 09:00Z
  slot** while `dispatcher.log` records `FAIL` for that same slot.
  `dispatcher.py` writes the true status either way (line ~306), so something
  else updated it — most plausibly the successful manual re-run at 12:10 that
  produced `fcba480ad`. Benign here since the job genuinely did succeed on
  re-run, but worth knowing that dispatcher state can disagree with the log if
  any staleness check ever leans on it.
- **`empty:ESPN AFL standings` in feed-monitor** is *not* new: it has been
  `empty` in all 66 recorded checks since the log began 2026-07-01, never once
  `ok`, and the monitor's overall verdict stays `ok`. The AFL pipeline sources
  from afltables, not this ESPN feed, so this looks cosmetic — but the check has
  never once passed, so it is proving nothing and could be repointed or dropped.
- **The `[mktcap] WARNING: rename NVDA -> MSTR SKIPPED ... Fix
  mktcap_symbol_changes` line is self-test fixture noise, not a real problem.**
  It originates in `scripts/mktcap/selftest.py:46`, which uses NVDA→MSTR as the
  deliberate recycled-ticker test case; it prints inside the self-test block, and
  the real runs all report `rename guard: 0 recycled-ticker renames skipped: []`.
  `mktcap_symbol_changes` contains no NVDA/MSTR rows. Flagging it because it
  reads like an action item in the log and isn't one.
- **This project's memory directory is empty.** CLAUDE.md cites
  `feedback_vercel_build_budget_incident` as an existing memory, but
  `~/.claude/projects/-Users-ashwindesikan-Projects-Metro-Area-Project/memory/`
  contains no files and no `MEMORY.md`. Cross-referencing memory for known issues
  (STEP 3 of this sweep) is therefore a no-op until something is written there.
- **`jobs.toml`'s `daily-ops-sweep` entry and `run-daily-ops-sweep.sh` are still
  uncommitted** in the working tree (`M mac-mini-jobs/jobs.toml`,
  `?? mac-mini-jobs/run-daily-ops-sweep.sh`). Left alone deliberately — this run
  commits only this report.
