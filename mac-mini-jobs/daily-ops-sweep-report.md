# Daily Ops Sweep -- 2026-09-13

Window `2026-09-11T23:02Z` -> `2026-09-13T01:02Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, no Supabase write, nothing fixed. This report
file is the only thing committed.

## Jobs this window: 33 ok, 0 failed, 5 flagged

**Dispatcher occurrences: 33 DONE, 0 FAIL, 1 MISSED** (plus this sweep, in flight).
Second consecutive FAIL-free window.

| when (UTC) | job | result |
|---|---|---|
| 09-11 23:09 | football-standings | DONE 105s |
| 09-12 00:21 | ops-autofix | DONE 2s |
| 09-12 00:31 | claude-auth-canary | DONE 0s |
| 09-12 01:01 | daily-ops-sweep | DONE 740s |
| 09-12 02:24 | ops-autofix | DONE 2s |
| 09-12 02:34 | activity-feed | DONE 5s |
| 09-12 04:04 | euro-comps | DONE 4s |
| 09-12 04:24 | ops-autofix | DONE 2s |
| 09-12 05:04 | gap-league-watch | DONE 3s |
| 09-12 05:04 | football-standings | DONE 100s |
| 09-12 05:56 | business-daily | DONE 337s |
| 09-12 06:12 | substack-daily | DONE 4s |
| 09-12 06:22 | ops-autofix | DONE 2s |
| 09-12 06:32 | claude-auth-canary | DONE 0s |
| 09-12 07:02 | mlb-sim | DONE 446s |
| 09-12 07:29 | feed-monitor | DONE 17s |
| 09-12 07:40 | **economy-housing** | **DONE 316s -- first genuine scheduled run, see §4** |
| 09-12 08:05 | nfl-elo | DONE 332s |
| 09-12 08:21 | ops-autofix | DONE 2s |
| 09-12 09:01 | **mktcap-refresh** | **DONE 372s -- see §5, §6** |
| 09-12 10:17 | **ops-autofix** | **DONE 4s -- acted on a real failure, §1** |
| 09-12 11:07 | football-standings | DONE 102s |
| 09-12 12:19 | **ops-autofix** | **DONE 5s -- acted, §1 and §2** |
| 09-12 14:19 | **ops-autofix** | **DONE 3s -- stood down at its attempt cap, §1** |
| 09-12 14:39 | mlb-sim | DONE 448s |
| 09-12 16:17 | ops-autofix | DONE 2s |
| 09-12 17:07 | football-standings | DONE 107s |
| 09-12 18:19 | **ops-autofix** | **DONE 2s -- refused to act, dirty tree, §3** |
| 09-12 20:19 | ops-autofix | DONE 2s |
| 09-12 22:19 | ops-autofix | DONE 2s |
| 09-12 23:09 | football-standings | DONE 105s |
| 09-13 00:21 | ops-autofix | DONE 2s |
| 09-13 00:31 | claude-auth-canary | DONE 0s |
| 09-13 01:01 | daily-ops-sweep | this run |

**1 MISSED slot:** `owners-weekly` (slot 09-07 08:30Z, 7960m late) at the 21:09Z
tick. Expected, and explicitly predicted in writing before it happened -- HANDOFF
2026-09-12 mini section A says "Expect ONE 'scheduled job missed' ntfy for the
09-07 slot (before the job existed, past its 48h catch-up). Not a fault." The job
appears exactly once in the whole of dispatcher.log, as this line. Its first real
slot is **Monday 2026-09-14 08:30Z**, which is item 1 below.

**Off-dispatcher on the mini:** `f1-weekly` polled hourly all window, every run
`idle: 2026 R13 already synced`. R14 (Spanish GP) is today, 09-13, so the poller
should pick it up over the next day; nothing stale yet. `newsletter-daily` ran
clean at 08:00Z and published (episode `454SMsAUNy0wFGBkHpHNt3`, 38:32, 9 chapters,
16 TTS chunks), cover built, both Gmail drafts created.

**Healthchecks: 20 of 20 checks, every one `up`** (read via the API this run).
Still at the hard 20-check cap.

**GitHub Actions: 1 failure in window**, `Majors auto-update` at 09-12 09:27:37Z,
root-caused and fixed the same day (§1). Everything else green, including the
`WNBA season refresh` that failed transiently and recovered (§2).

**Vercel: 3 paid production builds on 09-12 UTC against a 2/day budget.** That is
item 2. So far on 09-13 UTC: 2 deployments, both `CANCELED` (free), **0 paid
builds**. Release notes for 09-12 are present and `npm run check:release-notes`
passes (135 entries, newest 2026-09-12). `npm run check:data-currency` reports 28
datasets current, 0 overdue.

## Self-healed (informational only, no action needed)

**1. `Majors auto-update` failed on a missing `requests` install, and was fixed
the same day.** The 09-12 scheduled run (09:27:37Z) died at its last step with:

```
File "scripts/champions/build_champions.py", line 34, in <module>
    import requests
ModuleNotFoundError: No module named 'requests'
```

`ops-autofix` spotted it and re-ran it at 10:17Z and 12:19Z, then stood down at
its 3/day attempt cap at 14:19Z. That was the correct outcome twice over: a rerun
replays the same YAML and could never have worked, and the cap is what stopped it
becoming a loop. The real fix landed by hand in `2324c497d` (09-12 16:10:03Z),
adding `pip install requests` to `.github/workflows/majors-ingest.yml`, and a
`workflow_dispatch` at 16:10:45Z went green: `summary: 0 appended, 12 up to date,
0 skipped`. `ops-autofix` read clean from 16:17Z onward.

Worth knowing, and already written into the workflow's own comment block by
`3c2751e81`: **exactly one run was lost**, and it died *after* `majors_ingest.py`
had written to Supabase and after the ledger append, so the cost was a red tile
and a `champions-history.json` that was not re-emitted, not bad data.

The 09:27Z run also logged `australian-open-womens: ERROR reading champions: HTTP
Error 504: Gateway Timeout` (`1 skipped`). Transient: the 16:11Z run read it as
`up to date (ledger 2026, majors table 2026)`. Nothing to do.

**2. `WNBA season refresh` failed once and recovered on the rerun.** Failed
09-12 11:58:38Z, re-run by `ops-autofix` at 12:19Z, and run `34692419868` now
reads `success`. No further action.

**3. `ops-autofix` refused to act at 18:19Z because the working tree was dirty,
and that is the design working.** `[blocker] working_tree_dirty -- repo has 1
uncommitted change(s); autonomous action is unsafe` / `STOP: uncommitted changes
in the repo. Refusing to act around a human's work.` This coincides with the
evening session editing `dispatcher.py` and `jobs.toml`; by 20:19Z it read clean
again. Exactly the behaviour HANDOFF 2026-09-12 section B asks for ("a dirty tree
stops scheduled jobs").

**4. `economy-housing` had its first genuine scheduled run, and it worked.**
`DONE 316s` at 07:40Z: `real terms: base year 2024, CPI 1960..2024`, `latest
quarter in the file: 2026Q2`, `wrote .../housing/index.json and 410 MSA files`,
then `1 file changed` (the 410 MSA files were byte-identical, which is this job's
normal quiet-week case), pushed, revalidated, `warm /business/economy/housing ->
HTTP 200`. One thing to know rather than act on: this run *predates* the
`log_tail_lines` widening that landed later the same evening, so its dispatcher
log still starts at `real terms:` and the crosswalk count is truncated away. The
widened window was proven by hand at ~17:00Z (hence the 17:02:33Z healthchecks
ping) but **its first proof on a real scheduled run is Saturday 09-19**.

**5. The `NVDA -> MSTR` warning in the mktcap log is a self-test fixture, not
production data.** Flagging it as benign explicitly, because it reads exactly like
a live data-integrity alarm and it will appear in every weekly log:

```
[mktcap:selftest] WARNING: rename NVDA -> MSTR SKIPPED: both symbols live in this
week's feed (recycled-ticker signature). Fix mktcap_symbol_changes.
```

The `[mktcap:selftest]` tag is the tell, and it was added for precisely this
confusion by the 2026-08-30 sweep (see the comment at `scripts/mktcap/common.py:107`).
The fixture is `scripts/mktcap/selftest.py:50`. The real run in the same log says
`- rename guard: 0 recycled-ticker renames skipped: []`. Nothing wrong with
`mktcap_symbol_changes`.

**6. `gap-league-watch` is correctly waiting on the Indian Super League, and will
be for another month.** Every run reports `India L1 Indian Super League ->
awaiting_target [api 323 season None] -- 2026 not published yet (latest season on
api = 2025)`; Supabase `football_league_watch` id 9 confirms `state
awaiting_target, latest_available_season 2025`, and it is the only one of the ten
rows not `promoted`. Checked against the real world rather than assumed: the
**2026-27 ISL is scheduled to start mid-October 2026** with 13 teams, after the
2025-26 season was put on hold in the AIFF/FSDL rights dispute and did not begin
until February 2026. So api-football showing 2025 as its latest season in
mid-September is correct upstream, not a scrape fault. Expect the promotion around
mid-October; if it has not flipped by early November, *then* it is worth a look.

**7. `feed-monitor`'s `empty:ESPN PGA scoreboard` is the golf off-season, verified.**
Empty on every run since 2026-09-02, eleven days, while all fifteen other feeds
read `ok`. The 2026 FedExCup Fall opens with the **Biltmore Championship in
Asheville on 2026-09-17**, so the gap between the Tour Championship and the fall
opener is genuinely empty. The monitor treats `empty` as non-fatal by design and
this is the same shape `empty:ESPN AFL standings` had for weeks before flipping to
`ok` on 08-31. **Expect it to clear on or after 09-17**; still empty in October
would be a real fault.

## Needs Ashwin's attention

### 1. 🔴 `owners-weekly` fires Monday 09-14 08:30Z unattended, in apply-mode, with NO build-budget protection -- and nothing gates it on the tokens

**Why this is first.** It is about 31 hours away, it is the only unattended job on
the mini that edits seed data, commits, and pushes a build-triggering commit on its
own judgment, and the protection its own design names does not exist.

**What HANDOFF already says.** 2026-09-12 mini section A records, correctly, that
the by-hand validation run is being held at your choice because the job "is not a
check" (no `--dry-run`; a by-hand run is a live apply run), because the read-scope
Vercel token is absent, and because the named fallback -- the server-side cap --
protects nothing.

**What HANDOFF does not say, and is the actual finding.** Holding the *by-hand*
run does not hold the *scheduled* run. The job is live on the dispatcher
(`jobs.toml` line 758, Mondays 08:30Z, `catchup_hours = 48`), `state.json` carries
it, and the dispatcher will fire it on Monday whether or not either token is in
place. Read its own budget step, `mac-mini-jobs/run-owners-weekly.sh:66`:

> "BEFORE committing, count today's paid production builds: if `VERCEL_TOKEN` or
> `VERCEL_BUILD_CAP_TOKEN` is set in the environment ... **If no token is
> available, say so in the report and proceed**; `scripts/vercel-ignore.sh`
> enforces the cap server-side."

Both halves of that fail closed on nothing:

- Verified read-only this run: `~/metro-mini-jobs/config.env` contains
  `DRY_RUN, EXCHANGERATE_API_KEY, GIT_BRANCH, GIT_REMOTE, LOG_DIR, NOTIFY_PROVIDER,
  NTFY_SERVER, NTFY_TOPIC, PYTHON_BIN, REPO_DIR, REVALIDATE_SECRET,
  SUPABASE_SERVICE_KEY`. **Zero `VERCEL*` entries.** So the pre-count is skipped
  and the job proceeds.
- The server-side cap it falls back to is inactive (item 2). So the fallback is a
  no-op too.

Net effect: on Monday the job pushes an untagged build-triggering commit with no
budget check anywhere in the path. And Monday is a day that already has a likely
second build in it: `majors-ingest` runs daily and should append the US Open men's
champion (item 3 note), each major append being a deliberate real build.

**The specific choice in front of you -- three options, any one is enough:**

1. **Place `VERCEL_TOKEN` (read scope) in `~/metro-mini-jobs/config.env`**, which
   turns the job's own pre-count on, so it saves a patch to
   `~/metro-mini-jobs/pending/owners-$DATE.patch` and reports NOT APPLIED instead
   of pushing over budget. This is the option the script was written for.
2. **Place `VERCEL_BUILD_CAP_TOKEN` in the Vercel project build env** (item 2),
   which re-arms the cap for this job and every other push from every machine.
   Strictly better, and it is the same token task either way.
3. **Take the job off Monday's schedule until you have run it by hand**, by
   commenting out the `owners-weekly` block in `~/metro-mini-jobs/jobs.toml` (the
   live copy, not the repo symlink). This matches the stated intent that the
   by-hand validation run comes first.

If you want it to go ahead, the expected result is benign: `owners weekly: no
changes`, because the week was already applied in `c52b2ec86`. The first run
likely to apply anything is Monday 21 Sep, after the NBA votes on the Lakers and
Timberwolves/Lynx sales expected 15-16 Sep.

### 2. 🔴 The build cap is still INACTIVE, 09-12 spent 3 paid builds against the 2/day budget, and one of the three was a `git pull` merge commit

**The count, from the Vercel API this run, with the API's own `created` times.**
Exactly three commits landed on 09-12 UTC without `[vercel skip]` on the subject,
and all three produced a `READY` production build:

| # | commit | subject | build created (UTC) | wanted? |
|---|---|---|---|---|
| 1 | `b24d47c93` | mktcap: weekly Top Companies refresh 2026-09-12 | 09:07:34Z | **yes** -- the weekly build, "untagged on purpose" per its own log line |
| 2 | `a67a39c45` | Merge branch 'main' of https://github.com/... | 10:33:43Z | **no** -- shipped nothing, see below |
| 3 | `c52b2ec86` | owners: Seahawks close, Liverpool minority stake, F1 updates | 20:29:22Z | **yes** -- owners data is build-time |

(HANDOFF 2026-09-12 section B records these as 09:14Z / 10:40Z / 20:36Z. The API
`created` values are the three above; the HANDOFF times look like build-completion
rather than build-start. Cosmetic, noted only so the two reconcile. Section B's
finding itself is exactly right and is what sent me looking.)

**The cap is still off, confirmed from a build log rather than from the source.**
`dpl_EavY2D12Ho8nbA4PXGrksHzSmy6V`, build #2 above:

```
10:34:01  Running "sh scripts/vercel-ignore.sh"
10:34:01  vercel-ignore: build cap inactive (no VERCEL_BUILD_CAP_TOKEN or the API did not answer)
10:34:01  vercel-ignore: build-relevant change in b24d47c93..a67a39c45; building
```

This is day three of the same line (09-11, 09-12, and nothing has changed since).
Had the cap been active it would have counted 2 paid builds before `c52b2ec86` and
skipped it, or counted 1 before the merge and skipped that; either way the day
would have come in at budget.

**The new part: why a merge commit builds, which is a recurring mechanism and not
a one-off.** `a67a39c45` is a `git pull` merge on the mini, authored `Claude`, two
parents `da75ab1f6` and `bf9b324c1`:

- vs parent 1 the diff is one file: `public/data/refresh-schedule.json`
- vs parent 2 the diff is one file: `mac-mini-jobs/mktcap-metro-proposals-2026-09-12.md`

Both sides were `[vercel skip]` commits. But `git pull` generates the subject
`Merge branch 'main' of ...`, which **cannot carry the marker**, so rule 1 of
`scripts/vercel-ignore.sh` does not fire; the ref is `main`, so rule 2 does not
fire; and rule 4 then diffs `VERCEL_GIT_PREVIOUS_SHA..HEAD`, which necessarily
contains the `public/data/**` files the skipped commits brought in. So the guard
builds. **Every reconciling `git pull` on this repo is a latent paid build**, and
it spends one for a tree in which nothing needing a build changed.

**Recommended fixes, smallest first.**

1. **Stop creating the merge commit at all** (one command, no code change, fixes
   the common case):
   ```
   git -C "$HOME/Projects/Metro Area Project" config pull.ff only
   ```
   The mini's job runners already use `fetch` + `merge --ff-only` and so never do
   this; the merges come from interactive sessions running a bare `git pull`. With
   `pull.ff only` such a pull fails loudly instead of minting a merge, which is
   also the behaviour CLAUDE.md's handoff protocol already asks for (`pull
   --ff-only`). Do this on any machine working the repo.
2. **Belt as well as braces, in the guard**: teach `scripts/vercel-ignore.sh` to
   skip a commit with two or more parents when every non-merge commit in
   `BASE..SHA` carries `[vercel skip]` on its subject. Roughly, after the rule-1
   check:
   ```sh
   # A merge commit's auto-generated subject cannot carry the marker, so judge it
   # by its constituents: if every non-merge commit in the range is tagged, the
   # merge introduces nothing that needs a build.
   if [ "$(git rev-list --count --min-parents=2 -1 "$SHA")" = "1" ]; then
     UNTAGGED=$(git log --no-merges --format=%s "$BASE..$SHA" 2>/dev/null \
                 | grep -cv '\[vercel skip\]')
     [ "$UNTAGGED" = "0" ] && { echo "vercel-ignore: merge of only [vercel skip] commits; skipping"; exit 0; }
   fi
   ```
   That has to sit *after* base resolution, since it needs `$BASE`. **If you touch
   the guard, run `scripts/test-vercel-ignore.sh`** (CI job `vercel-ignore-guard`),
   and add a pinned case for this shape while you are in there -- there is
   currently no regression test for a merge commit.
3. **And still place `VERCEL_BUILD_CAP_TOKEN`**, which is the only thing that
   bounds the damage from whatever the next unforeseen shape turns out to be:
   read-scoped token from <https://vercel.com/account/tokens>, added to project
   `metro-power-rankings` (`prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`, team
   `team_yQjbuPwcr40J6AxkjCv6AawD`) as `VERCEL_BUILD_CAP_TOKEN`, **Production,
   build-time**. The test is one line in the next build log: it should print a
   count instead of `build cap inactive`.

### 3. `/business/sp500`'s "The turnstile" has read "0 on record" for four weeks, and 60 rows of index-change history are gone

**What a reader sees.** `app/business/sp500/page.tsx:133` renders
`Index changes, newest first ({changes.length} on record)` above an empty bordered
box. `changes.length` is 0. The page's own description promises "a running feed of
index changes".

**The data.** `public/data/business/sp500.json` today: `count 503, matched 498`,
`changes: []`. Traced through git, the array has been empty on **every** commit
since `ddb490095` (2026-08-17); the commit before it, `b2ea93d50` (2026-08-08),
carried **60 rows spanning October 18, 2023 to August 5, 2026**.

**Root cause, and why it cannot self-heal.** Wikipedia removed the "Selected
changes" table from *List of S&P 500 companies* on 2026-08-17. `d8d313390` (that
same day) adapted the builder by degrading a missing changes table to zero rows,
which was the right call for keeping the 503-company list publishing -- but the
run wrote `changes: []` over the file that held the 60 rows. The week-over-week
constituent-diff fallback (`diff_changes`) only arrived on 2026-08-30 in
`238dde631`, and it accumulates via:

```python
changes = new_changes + (prev.get("changes", []) if prev else [])
```

By then `prev["changes"]` was already `[]`, so the accumulator has nothing to
accumulate onto. It is working exactly as written and will preserve everything
from here on; it simply cannot recover a history that was overwritten thirteen
days before it existed. This week's run confirms the steady state:
`[mktcap] constituents: 503, changes rows: 0`.

**The diff mechanism itself is about to be tested for real, which is why this is
worth fixing now rather than later.** S&P DJI announced on 2026-09-04 that
effective before the open on **Monday 2026-09-21**, Bloom Energy, Everpure and
Illumina join the S&P 500 and Molson Coors, The Trade Desk and Builders
FirstSource leave. `mktcap-refresh` runs Saturdays 09:00Z, so **the 2026-09-26 run
is the first that should detect a change through the fallback** and write six
rows. If you backfill before then, that run prepends onto a real history; if not,
the page goes from "0 on record" to "6 on record" and three years of context stays
lost.

**Recommended fix -- a one-time backfill, no code change, reversible.** The rows
are intact in git:

```sh
cd "$HOME/Projects/Metro Area Project"
git show b2ea93d50:public/data/business/sp500.json > /tmp/sp500-old.json
python3 - <<'PY'
import json
cur = json.load(open('public/data/business/sp500.json', encoding='utf-8'))
old = json.load(open('/tmp/sp500-old.json', encoding='utf-8'))
assert cur['changes'] == [], f"not empty any more ({len(cur['changes'])} rows); re-check before overwriting"
cur['changes'] = old['changes'][:60]
json.dump(cur, open('public/data/business/sp500.json', 'w', encoding='utf-8'),
          indent=1, ensure_ascii=False)
print('seeded', len(cur['changes']), 'rows;', cur['changes'][0]['date'], '->', cur['changes'][-1]['date'])
PY
```

Two things to know before you run it:

- **The commit needs a real build.** `/business/sp500` reads this file at build
  time, so the commit must NOT carry `[vercel skip]`, and it owes a
  `lib/releases.ts` entry for the day in the same commit. Given item 2, pick a day
  with budget room, or pair it with something else that is shipping anyway.
- **Date formats will be mixed and that is cosmetic only.** The recovered rows use
  Wikipedia's long form (`"August 5, 2026"`); `diff_changes` writes ISO
  (`"2026-09-26"`). The page renders `ch.date` verbatim, so both display fine and
  nothing sorts on it. Normalising is optional polish, not part of this fix.
- The builder's own `source` string is already correct for the mixed state and
  needs no edit.

### 4. Minor: two synthetic test lines are sitting in the real `dispatcher.log`

At `2026-09-12T16:51:02Z` the ops log carries:

```
2026-09-12T16:51:02Z     ! WARN: something odd but survivable
2026-09-12T16:51:02Z     ! WARN: second stderr line
```

These are the fixtures from the by-hand `run_job` testing described in `f41f08db4`
and `98da06a0b` ("shows all 20 stdout plus the two `!` lines"), written into the
production log by testing against the live dispatcher. Harmless, and they belong to
no job -- there is no `RUN`/`DONE` pair around them. Noting it only so a future
sweep does not spend time on them, and as a small argument for pointing by-hand
dispatcher tests at a scratch log file. No action needed.

## Standing items unchanged this window

- **mktcap metro curation queue is 6,880 unmapped, 3 notable (>=$10B):** Vivmark
  Residential `VMRK` $50.7B, Sunbelt Rentals `SUNB` $29.8B, Quantinuum `QNT`
  $13.0B, all United States. 116 new companies this week, 116 geo stubs queued, 44
  deactivated, 3 held awaiting a metro area (all China). Queue file regenerated
  09-12 10:02Z; proposals in `mac-mini-jobs/mktcap-metro-proposals-2026-09-12.md`.
- **`build_sp500.py` still logs `WARNING: table id=changes not found`** every run.
  That warning is correct and expected since 2026-08-17 and is the documented
  degraded path, not a new fault. Item 3 is the consequence worth acting on.
- **`economy-prices` has its first genuine run today, 09-13 07:30Z.** Its 09-06
  MISSED was the deploy-day artefact explained in last sweep's §2. Worth a glance
  in tomorrow's sweep to confirm it fired, the same check `economy-housing` got
  today and passed.
- **`economy-rates`' empty-body ntfy bug is FIXED**, closing last sweep's item 2.
  `5abfc9e58` (09-12 08:16Z) replaced the one-flag awk with the three-state version,
  and added the guard that was recommended alongside it: an unparseable block now
  alerts on the parse failure itself rather than sending silence. Next run 09-18
  07:30Z, the one carrying the ECB move effective 09-16.
- **`majors-ingest` should append US Open champions today and tomorrow.** Verified
  against the real result rather than assumed: Elena Rybakina beat Aryna Sabalenka
  6-4, 5-7, 6-2 in the women's final on Saturday 2026-09-12, and the men's final
  (Zverev v Shelton) is today, 09-13. The 09-12 16:11Z run correctly still read
  `us-open-womens: up to date (ledger 2025)` because it ran hours before that
  final. The workflow is daily at 05:30Z but lands ~4h late on shared runners, so
  expect the women's champion on today's run and the men's on 09-14's. Each append
  is a deliberate real build, which is the second build in Monday's day and bears
  on items 1 and 2.
