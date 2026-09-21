# Daily Ops Sweep -- 2026-09-21

Window: 2026-09-19T23:04Z .. 2026-09-21T01:04Z (trailing 26h). Read-only run: nothing
was re-run, pinged, written or fixed. Fleet is green as of 01:04Z.

## Jobs this window: 15 ok, 2 failed (both now green), 2 flagged

**Clean throughout (15):** deploy-watch (21 runs), ops-autofix (12), claude-auth-canary (4),
egress-refresh, business-daily, substack-daily, euro-comps, gap-league-watch, activity-feed,
feed-monitor, economy-prices, nfl-elo, cricket-champions, cfb-sun, daily-ops-sweep.

**Failed and recovered (2):**
- `mlb-sim` -- FAIL 07:16Z (`one or more leagues failed to build`) and FAIL 14:38Z
  (`cannot fast-forward`). Now `ok (manual)` for its 14:30Z slot.
- `football-standings` -- FAIL 17:09Z (`cannot fast-forward`). Re-ran clean at 22:23Z via
  ops-autofix and again on its own 23:00Z slot (`ok 102s`).

**Flagged, not failures (2):** `MISSED metro-rankings` (21:21Z) and `MISSED git-maintenance`
(21:31Z). See "Needs Ashwin's attention" #1 -- these are install artifacts, not missed work.

**Not under the dispatcher:** the hourly `f1` launchd job logged `idle: 2026 R14 already
synced` 26 times. Verified correct, not stuck: R14 was the Spanish GP (2026-09-13) and R15
is Azerbaijan on **Saturday** 2026-09-26, so no race has run since. Nothing to sync.
newsletter-podcast ran its morning (25 items pushed), evening (4 appended) and weekly
(clean skip, no unnarrated post in the 14-day window) slots without error.

## Self-healed (informational only, no action needed)

**All four failures above are one root cause, and it was diagnosed and FIXED last night
before this sweep ran.** Reconstructed from dispatcher.log, the reflog and HANDOFF.md:

- 13:17Z, business-daily committed `f5687d931` (Bank of China leader QID). Six seconds
  later a background `git gc` died holding `index.lock`, `HEAD.lock` and
  `objects/maintenance.lock`, so the commit never pushed.
- From 14:18Z that single unpushed commit had main diverged from origin. `mini_sync()` was
  `merge --ff-only` with no fallback, and every runner calls it first, so the whole fleet
  hard-failed for **6h27m** (14:18Z to 20:41Z) -- 30 `cannot fast-forward` events across
  mlb-sim, football-standings, export_schedule and every ops-autofix retry.
- 20:45Z an interactive mini session cleared the locks, rebased, pushed `3fd6a6061`, and
  shipped four fixes the same evening: `f091a06ec` (mini_sync rebases), `755ee51d9`
  (mini_sync pushes stranded tagged commits, alerts on untagged), `0689e3906` (gc.auto=0 +
  maintenance.auto=false + the new git-maintenance slot), `baeb6d021` (deploy-watch moved
  under the dispatcher lock).

**The 07:16Z mlb-sim failure is separate and also fixed.** `verify_wins()` demanded exact
equality with ESPN standings and read `Cardinals 75 vs 76` -- ESPN's standings endpoint
increments the moment a game goes final while the schedule endpoint's `completed` flag lags
minutes. `4a3ea669d` replaced that with `classify_win_mismatch()`, which tolerates up to 2
teams off by exactly 1 win and still hard-fails a systematic parse break.

**Verified live on the mini rather than taken from the handoff:** `_common.sh` is a symlink
into the repo, so all of it is already in effect; `classify_win_mismatch` is present in
`build_mlb_sim.py:229`; `gc.auto=0` and `maintenance.auto=false` are set on the clone; zero
stale `.lock` files and zero `tmp_obj_*` remain; tree clean and level with origin/main.

**Also clean, checked rather than assumed:**
- Vercel: **1 paid production build** for this project since 2026-09-20T00:00Z
  (`6d6a29447`, READY -- the legitimate untagged build-time-read data change at 09:25Z) and
  **0 so far today UTC**. Every other deployment in the window is CANCELED, i.e. skipped by
  the guard and free. No ERROR builds. Well inside the 2/day budget.
- `npm run check:release-notes` -- OK, 143 entries, newest 2026-09-20 (the untagged commit
  above is covered).
- `npm run check:data-currency` -- 29 current, 0 overdue, 0 unreadable.
- `feed-monitor` 07:26Z -- all 12 probes ok.
- `gap-league-watch` -- no state transitions; 3 leagues still `awaiting_target`.
- Supabase spot-check: Premier League standings read Man City 1st, P5, 15pts, WWWWW.
  Confirmed against the real 2026-27 table for 2026-09-20. Football data is current.

## Needs Ashwin's attention

### 1. Two false "scheduled job missed" ntfy alerts, and this will repeat on every new job

**What happened.** At 21:21Z and 21:31Z the dispatcher fired `Metro: scheduled job missed`
for `metro-rankings` (slot 2026-09-19 10:30Z, 2092m late) and `git-maintenance` (slot
2026-09-20 03:00Z, 1112m late). Both alerts carry the text *"The mini was probably off."*
The mini was not off -- it was running normally all day.

**Root cause.** Both jobs were installed into `jobs.toml` the same evening (metro-rankings
22:20 BST, git-maintenance 22:28 BST). On the next tick, `previous_occurrence()` looked back
and found the most recent slot matching their schedule -- a Saturday 10:30Z and a 03:00Z --
both of which fell *before the job existed*. Past its catch-up window, so `dispatcher.py:430`
recorded MISSED and notified. The code is behaving exactly as written; it has no notion of
when a job was installed, so a back-dated slot is indistinguishable from real missed work.

**Evidence.** `dispatcher.py:428-436` (the MISSED branch calls `notify()` unconditionally);
`jobs.toml:702-708` and `:738-744`; `state.json` now holds `"last_status": "missed"` for both;
`git log` puts both rows' commits at 22:21 and 22:30 BST, after the slots they were faulted for.

**Impact.** Low but corrosive: two alerts with an actively misleading explanation, on the same
night Ashwin was already triaging 14 real ones. Every future job added to `jobs.toml` will do
this once, and the alert text will point at the wrong cause each time.

**Recommended fix (pick one, both small):**
- *Cheapest:* when installing a job, seed its `state.json` row with the current slot so the
  first tick sees `already-ran`. Needs a documented install step, which is the weakness.
- *Better, and what I'd do:* record `first_seen` (UTC date) in `state.json` the first tick a
  job id is observed, and in the MISSED branch skip both the log line and `notify()` when
  `occ < first_seen`. Self-testable as a pure scheduling case alongside the existing 111.

Neither is urgent. Both MISSED rows are now marked `already-ran`, so they will not re-alert,
and neither job's real schedule is affected (`git-maintenance` next fires 2026-09-21 03:00Z,
`metro-rankings` Sat 2026-09-26 10:30Z).

### 2. git-maintenance's first run will be a vacuous pass -- do not read green as proof

**What happened.** Last night's entry deliberately left the eight genuine `tmp_obj_*` files
from the day's two gc crashes in place, stating: *"tomorrow's 03:00 run is a live test of
step 2, and if they are gone on Monday the job works."*

**They are already gone.** `ls .git/objects/tmp_obj_*` returns nothing as of 01:04Z, before
`git-maintenance` has ever run (there is no `logs/git-maintenance-*.log`, and its state row
reads `missed`). Something between roughly 00:00 and 01:00 BST cleared them -- most likely a
repack (`git count-objects -v` now shows 3 packs, 568 loose).

**Why it matters.** Step 2 only deletes `tmp_obj_*` older than 1 day (`git-maintenance.sh:121`),
so even had they survived they were under the floor and would *not* have been deleted at
03:00Z today -- the test as designed could not have passed today regardless. Either way the
run will report `removed 0` and a future session could easily read that as "step 2 works".

**Recommended:** it is not broken and needs no fix. But if you want step 2 genuinely proven,
plant a fixture with a backdated mtime and watch one run:
`touch -t 202609180000 .git/objects/tmp_obj_probe` then check the next 03:00Z log. (I did
not do this -- it is a write.)

### 3. Two watch items for the next 8 hours, no action now

- **egress-refresh, 09:00Z today.** Yesterday's run exited 0 with `2/16 non-fatal step
  failures` -- `leaders (auto-apply)` and `uk offices (check)`, both diagnosed as transient
  Wikidata. Last night's session re-ran them by hand successfully (204 countries, 6 changed:
  nigeria, kazakhstan, estonia, mauritius, madagascar, malawi) and **reverted** rather than
  committed, because `public/data/leaders/_changes.json` is build-triggering. Today's 09:00Z
  run should re-apply and commit them untagged, spending one production build. That is within
  budget (0 used today) and is the job's normal path, but it is the build to expect. **If the
  same 2/16 steps error again, it stops being transient and wants a real look.**
- **mlb-sim, 07:00Z today** is the first unattended run through the new `verify_wins`
  tolerance. `.autofix-attempts.json` still shows yesterday's 3/day cap for mlb-sim and
  football-standings; it keys on date and resets today.

### 4. Worth recording: `football_standings.updated_at` is not a freshness signal

Chasing what looked like a 24h-stale standings table, I confirmed `scripts/apifootball/refresh.py`
never sets `updated_at` anywhere -- the column is `default now()`, so it records each row's
INSERT time and is never touched by the conflict-update. Premier League rows therefore read
`updated_at = 2026-07-26` while their values are current (verified against the real table above).

**Why it is worth a line:** anyone monitoring that column for staleness gets a permanent false
positive, and -- the damaging direction -- a genuinely frozen standings table would look
*identical* to the healthy state. That is a Silent failure register shape: exits 0, tells nobody,
and the obvious freshness probe cannot distinguish the two. Suggest adding a row there, and using
`max(played)` per league against fixture counts if a real probe is ever wanted.

---
*Read-only sweep. Notion could not be read or updated this run: the Notion MCP server requires
an interactive OAuth authorisation that a headless session cannot perform. No queryable state
was changed by this sweep, but findings 1, 2 and 4 are candidates for Backlog / Silent failure
register rows if Ashwin wants them tracked.*
