<!-- GENERATED FILE - DO NOT EDIT BY HAND.
     Written by scripts/handoff_recent.py from HANDOFF.md, which is the source
     of truth. Holds only the most recent entries, because the Notion
     reconciler cannot fetch the full HANDOFF.md. Edits here are overwritten.

     NEWEST ENTRY FIRST, which is the opposite of HANDOFF.md and is the whole
     point: the reader fetches this over HTTP and its window can stop partway,
     so whatever it does see must be the most recent. Chronological order put
     2026-09-14 at the top and today's entry out of reach, which is exactly how
     the 2026-09-21 run failed even after this file existed.

     entries: 46, 2026-09-14 to 2026-09-21
     If the reader counts fewer than 46 entries, its fetch window stopped
     short and the entries it did not see are the OLDEST ones. -->

## 2026-09-21 (afternoon) - windows cowork -> mini and next session: CPL 2026 DONE BY HAND, AND THE CRICKET RUNNER WOULD HAVE LOST ITS FIRST REAL PROMOTION

**CPL.** The 20 to 21 Sep watch did not produce a promotion. Antigua & Barbuda Falcons are a first-time champion, which `cricket_finalize.py` refuses by design, and the Wikipedia final article still had no result at 11:00 UTC. Ashwin gave the result. Inserted by hand in the shape `build_row` writes: `public.champions` id 149514, source `cricket-finalizer`, metro St. John's (ANT) / `st-johns-ant`, `date_awarded` 2026-09-20, `is_current` true; id 148270 (Trinbago 2025) cleared. Not confirmed: whether the 22:30 UTC run sent a REFUSED ntfy or was a quiet no-op. **Mini: read that log.**

**Re-emit, run on Windows and checked row by row against HEAD.** `champions-history.json` 6,817 -> 6,818 rows: one row added (CPL 2026), one changed (CPL 2025 `isCurrent` true -> false), order of every other row identical. `champions-current.json` 106 -> 106, the CPL holder swapped. The builder's own positional diff looks like hundreds of changes because one inserted row shifts every later index; it is not.

**Two latent faults found on the way, both fixed in this commit.**
1. `mac-mini-jobs/runners/cricket-champions.sh` listed `public/data/golf-months.json` in `commit_paths`. The file lives at `public/data/majors/golf-months.json`. `git add` with one bad pathspec is fatal and stages NOTHING (seen live on the Windows box today), `commit_paths` then reads "No changes; nothing to commit" and returns 1, and the runner has no `set -e`, so it prints "done" and exits 0. The Supabase row would already be written, so the next run finds the season present, counts 0 new champions and never re-emits. The first automatic promotion, the County Championship in about a week, would have reached the table and never the site, with no alert. Read from the code, not reproduced on the mini.
2. `scripts/champions/build_champions.py` added `cricket-finalizer` to the base stream on 09-19 but not to the extras exclusion, so a finalizer row would be emitted into both files.

**Owed from this morning:** `.githooks/prepare-commit-msg` now exempts `[deploy-retry]` the way it exempts `[deploy-now]`. It stamped the empty recovery commit with `[vercel skip]`, which `vercel-ignore.sh` reads first. Shipped in `7cb1f3d1f`, which built READY and carries the Sweden result.

**Coalition model.** Research files in `data/forecast/coalitions/` (Israel ledger 1949 to 2022 with a mandate log, NZ ledger 1996 to 2023, sourced 2026 stances for both). Specification is the Project doc `claude/coalition-model-spec.md` v0.1. Nothing is built. Three rulings are open with Ashwin.

**Notion:** Backlog: cricket watch row rewritten (CPL by hand, County Championship is now the first real test); coalition row updated with research, spec and next steps. Decisions +1 (hook never stamps `[deploy-retry]`). Silent failure register +2 entries (the push faults; the runner pathspec).
## 2026-09-21 (midday) - windows cowork -> mini and next session: THE ISRAEL FORECAST PUBLISHED A BLOC TOTAL AS A PARTY FOR THREE WEEKS. FIX PUSHED AS `1d811d4de`. ALSO: `19b8c9b0e` (SWEDEN) WENT UP UNDER A SKIP-TAGGED HEAD AND HAS NO BUILD

**What was wrong.** `public/data/forecast.json` showed "Haredi Public 36.2" as the largest Israeli party and Likud at 15.0 against polls of 18 to 23. `gov.avg` and `pMajority` were null. History from `git show <sha>:data/forecast/il_polls.json`: clean on 08-26 (16 parties, gov 49, sum 120); ZERO polls from 09-02 (the RZP-Zehut and Joint List mergers changed the header); wrong numbers from 09-11.

**Cause (inferred, strong).** A merged list is ONE data cell with `colspan=2` under TWO header columns. `parse_tables` kept header spans and dropped data-cell spans, so every later value moved one column left and the Gov. total landed under the last party header. Evidence: on the three polls kept, RZP-Zehut recovered as `120 - other seats` equals RZP-Zehut recovered as `gov - (Likud + Otzma + Shas + UTJ)`, and the re-aligned averages match the last clean poll (08-20 Lazar) party by party. No session here could read the raw wikitext (Wikipedia is not reachable from cowork), so **the mini's next forecast run is the live proof.**

**Shipped in `1d811d4de`:**
- `scripts/forecast/fetch_data.py`: data cells expand `colspan` of 2 to 4 (wider spans are note rows and stay one cell); `fetch_il` split so `il_polls_from_wikitext(wt)` is pure; a row whose seats are not 120 (tolerance 2) is REJECTED and logged; party names de-duplicated. Self-test 7 -> 12 cases, fixture carries the real failure shape.
- `scripts/forecast/build_forecast.py`: `il_forecast` filters on the same 120 check and returns None when nothing survives. It no longer hides a wrong total by rescaling it.
- `data/forecast/il_polls.json`, `public/data/forecast.json` (`il` key only, verified), `data/forecast/snapshots/il-2026-10-27.json`: hand-corrected at Ashwin's ruling. 3 of 6 polls kept (LRI 09-08, Tatika 09-10 and 09-17). Three were dropped because a second lost column (Amcha Yisrael, probably 4 seats) left one identity only. Result: Yashar 24.4, Likud 21.1, Together 13.6, gov 49.3. The next fetch overwrites `il_polls.json` by design.
- `scripts/mktcap/jev_metro_pilot.py` (evaluation only, no `--write`) and a `typesafe_key.txt` line in `scripts/mktcap/.gitignore`. Deferred: no TypeSafe key.

**For the mini, on the first forecast run after this lands:** PASS is `IL seat polls: N` with N >= 6, no `IL row REJECTED` lines, gov not null. If EVERY row is rejected and `il` leaves forecast.json, the guard worked and the colspan diagnosis is wrong: print the raw header of the first Likud table and post it here.

**The push, and what it swept up.** Two sessions were working in the one Windows clone. (1) The index already held `HANDOFF-recent.md` and `scripts/handoff_recent.py`, staged by an earlier session and older than the remote's copies (89 lines against 140). They were taken out of the commit and moved to `%TEMP%`; the remote versions stand. (2) `git pull --rebase` replayed TWO local commits, not one: underneath was `19b8c9b0e` "elections(se): file the 2026 general election result" (author time 10:19 BST, session_014ZkZvdmw1MgEKQt84WVQdK, touches `app/`, `lib/`, `public/`, carries today's release note, untagged on purpose). It reached origin beneath a `[vercel skip]` HEAD, so GitHub made one deployment for the push HEAD only and Vercel CANCELED it. **Sweden has no build.** Measured with the Vercel MCP at 10:20 UTC: paid production builds today 0; the last READY is `6d6a29447` from 09-20 09:25 UTC. Recovery is the documented one, an empty commit whose subject carries `[deploy-retry]`, pushed LAST. Whether `19b8c9b0e` passed `npm run verify` is not known to this session.

**Also noted.** `check_forecast_health` warned "Israel: gov.avg is empty" on every run since 09-11 and nobody read it.

**`scripts/handoff_recent.py` failed its first run on Windows and is fixed in this commit.** It read stdin and wrote its output in the locale encoding. That is UTF-8 on the mini and cp1252 on the Windows box, where the first emoji inside the seven-day window raised `UnicodeEncodeError: surrogates not allowed` and the pre-commit hook rejected every commit that staged HANDOFF.md (an empty `--allow-empty` commit too, because HANDOFF.md was still staged). It now reads bytes, decodes UTF-8, normalises CRLF and writes bytes. Reproduced before the fix with `LC_ALL=C PYTHONUTF8=0`; after it, output is byte-identical under both locales (45 of 198 entries).

**Notion:** Decisions +3 (Arab lists differentiated; P(no government) a headline for both countries; 120-seat rejection rule). Backlog: coalition probabilities row -> In progress with the rulings and the NZ date of 7 Nov; +1 P0 watch (first mini forecast run after the parser fix); +1 Jev pilot row (Blocked, P3). Silent failure register +1 entry.

## 2026-09-21 (evening) - mini -> windows and next session: THE RECONCILER CAN NOW COUNT ITS INPUT AND SEE THE WORKFLOWS

Two small changes, both closing Backlog rows the reconciler filed about itself this morning.

**1. `HANDOFF-recent.md` says how many entries it contains.** The banner now carries, after the selection is made:
```
entries: 43, 2026-09-14 to 2026-09-21
If the reader counts fewer than 43 entries, its fetch window stopped
short and the entries it did not see are the OLDEST ones.
```
This turns "did I see the whole file" from an inference into an arithmetic check: count the `## ` headings, compare with N. It is the missing half of the newest-first ordering shipped earlier today. Ordering guarantees that what survives truncation is the part that matters; the count tells the reader whether truncation happened at all. The reconciler's own row recorded three passes over the same 09-20 file that saw two, nine and twenty entries, with two headings duplicated, and no way to tell which pass was complete. Now there is.

The count is derived only from the selection, so the file is still not rewritten when nothing changed. That mattered enough to test: a banner carrying a clock would have put a diff in every commit and defeated the idempotency check.

**2. `workflows-list.txt`, generated by the pre-commit hook.** One line per workflow file, repo-relative, each followed by its indented `cron:` lines WITH line numbers, so a schedule mismatch can be pointed at rather than described. First generation: 32 workflow files, 14 cron lines. The reconciler cannot list a directory: the `.github/workflows` tree page is disallowed by robots.txt, which its 2026-09-21 run hit, and there is no other path from the cloud. A plain file over raw fetch sidesteps it, the same shape as the other two inputs.

**🔴 One correction to the brief, and it matters for the 28 September audit.** The instruction said "the reconciler's prompt already looks for it, so the Monday audit picks up the GitHub Actions half automatically". It does not. Step 3 still reads "fetch mac-mini-jobs/jobs.toml and the list of .github/workflows/*.yml from the repo", which is exactly the directory listing that is blocked; the prompt does not name `workflows-list.txt` anywhere. Generating the file was necessary and not sufficient. The contract page's inputs section now names it as input 3 and tells step 3 to use it instead of listing the directory, and the contract page overrides the prompt, so the Monday audit will work. The prompt itself is still worth correcting so the two agree.

**Two implementation notes worth keeping.** The hook's cron grep uses `[[:space:]]` rather than `\s`, because `\s` is a GNU extension and this hook runs under `/bin/sh` on macOS; both were measured against the real files and match the same 14 lines. And the hand-run of that block failed first time under zsh, which aborts on an unmatched glob, where `/bin/sh` passes the pattern through for `[ -e "$f" ] || continue` to skip. The hook is `#!/bin/sh`, so it was the ad-hoc invocation that was wrong, not the code; worth remembering before "fixing" a glob that only fails when pasted into a terminal.

**Notion:** Backlog: "Reconciler: cannot prove it saw every 2026-09-20 HANDOFF entry" set Done with the count-and-range design and its verification; "Reconciler: the Monday GitHub Actions audit cannot list .github/workflows from the cloud" set Done on the repo side, with the prompt gap recorded on the row rather than left implied. Notion operating contract: `workflows-list.txt` added as input 3 under the backstop, with the instruction to use it in step 3 instead of listing the directory. No Decisions or Scheduled jobs rows changed: no ruling was made and no job's schedule moved.

## 2026-09-21 (later still) - mini -> windows and next session: RAN THE RECONCILER, IT STILL COULD NOT SEE TODAY, AND THE FIX WAS ORDERING NOT SIZE

Ashwin: "run the reconciler now". Running it exposed that this morning's work was not finished, which is the point of running a thing rather than declaring it done.

**First, what the 06:30 run had already told us.** It FAILED at its stop condition for the third day running: the raw fetch of HANDOFF.md returned only the head of the 1 MB file, the GitHub API returned 403 and the commits page is robots-blocked. It changed nothing and wrote a FAILED log line. That session is also the one that wrote the four-step brief Ashwin pasted here this morning, so the task and its author were the same loop.

**The routine's prompt was never updated.** It still said "Fetch .../HANDOFF.md. It is over 1 MB" and to list commits from the GitHub API, with zero mentions of the two new files. The files existed; the reader still pointed at what it cannot read. Editing the prompt directly was not safe from here: `job_config` is 112 KB, mostly a 79 KB system prompt, and the update API replaces that object wholesale, so a partial write would have destroyed the environment, model and MCP config. Instead the INPUTS were written into the "Notion operating contract" page, which the prompt already orders it to read first. That worked, in its own words: "The contract page overrides my task prompt on inputs. It directs me to two generated files instead of the 1 MB HANDOFF.md."

**🔴 Then it failed anyway, and the reason matters.** It fetched `HANDOFF-recent.md` and reported `HEADING NOT PRESENT: 2026-09-21`, `HEADING NOT PRESENT: 2026-09-20`, listing headings that began at 2026-09-14. **234 KB is still past its fetch window.** The file was chronological, so the window showed the OLDEST entries and stopped before reaching today's, which are the only ones it needs. The smaller file fixed the megabyte and reproduced the same failure one order of magnitude down.

**The fix is ordering, not size.** `HANDOFF-recent.md` is now written NEWEST ENTRY FIRST. Whatever the window does show is now the part that matters, and truncation costs the oldest entries instead of today's. Today's entry sits at **line 12 of 2251**, immediately after the banner, so any window reaches it. A size cut would have been a guess at someone else's limit; ordering does not care what the limit is.

Worth keeping as a general lesson: a file read over HTTP by something with an unknown window should lead with what matters. Chronological is right for HANDOFF.md, which humans read forwards; it is exactly wrong for a machine-read tail.

**Verified:** 6 new assertions on ordering (newest first, oldest last, full reverse-chronological order, nothing dropped, banner still first, and idempotency surviving the reorder), then regenerated for real, confirming the 09-21 entry is at line 12.

**Still open:** the routine's own prompt text remains wrong, and is only overridden by the contract page. It is worth editing at https://claude.ai/code/routines/trig_01MeTbjkpBua9UMypHz7KRFh when convenient, so the prompt and the contract agree rather than one quietly outranking the other. The triggered run was also rate-limited partway and had not finished at the time of writing; the next scheduled run is 06:30 UTC.

**Notion:** the Notion operating contract page gains the newest-first rule under the reconciler inputs, with the 234 KB evidence, and its inputs section already overrides the task prompt. No database rows changed by this entry. Decisions and Scheduled jobs rows for the reconciler inputs were written earlier today and still hold.


## 2026-09-21 (later) - mini -> windows and next session: commits-recent.txt IS MOSTLY SIGNAL NOW

Ashwin, on the noise limit filed an hour earlier: "widen the filter to exclude the data: refresh-schedule commits too". Done in the pre-commit hook.

**The measurement that prompted it.** With only `^Auto:` excluded, **56 of the 80 lines** were `data: refresh-schedule.json` -- the dispatcher rewriting its own schedule export, which lands several times an hour. The file built specifically so the reconciler could read something useful was about 70 percent filler.

**The change** is one more `--grep` on the existing `--invert-grep`. Worth knowing why that works rather than assuming it: multiple `--grep` patterns are OR'd, and `--invert-grep` then inverts the whole match, so a commit matching EITHER pattern is dropped. Verified before committing rather than after -- zero survivors matched either pattern.

**What it bought, measured both ways:**
```
content: 56 of 80 lines were noise  ->  67 of 80 are substantive
reach:   the same 80 lines covered 2 days  ->  they cover 3
```
The reach matters as much as the content: the file is capped at 80 lines, so every line of filler was costing a line of real history the reconciler could have seen.

**What was deliberately left in.** About 13 lines are still routine -- `football: refresh live bundles`, `chore(substack)`, `chore(activity)`, `screen: weekly`. They stay because they are low-volume and occasionally meaningful (a football bundle refresh failing IS news), unlike a schedule export that fires several times an hour and never says anything. The rule being applied is "exclude what cannot carry information", not "exclude everything automated".

**Still true, and structural:** `commits-recent.txt` is generated in a PRE-commit hook, so it is written from HEAD and always lags by exactly the commit being made. A post-commit hook cannot fix that without amending. It is recorded on the Decisions row as the one remaining open question.

**Notion:** Decisions: the reconciler-inputs row updated -- its Rule now names both excluded bot families, and its Open questions are down to the pre-commit lag, with the noise limit marked CLOSED and the before/after numbers recorded. Scheduled jobs: the "Notion reconciler (Citizen of Nowhere)" row's Notes updated with the widened filter and the same measurements, Last verified 2026-09-21. Backlog unchanged.


## 2026-09-21 - mini -> windows and next session: THE NOTION RECONCILER CAN ACTUALLY READ ITS INPUTS NOW

The reconciler is the backstop that stops Notion drifting from reality, and it had been running against sources it could not read. `HANDOFF.md` has passed a megabyte -- **1.26 MB across 193 dated entries** -- which it cannot fetch, and it cannot reach GitHub's API or the commits page either. So it was reconciling against whatever it could get, which was not the handoff and not the commit history.

The fix is two small GENERATED files at the repo root, because the thing reading them cannot run scripts: it can only read what it is handed.

- **`HANDOFF-recent.md`** -- the last 7 days of entries, never fewer than 4, trimmed oldest-first if it would pass 400 KB. Came out at **234 KB for 40 of 193 entries, an 81 percent cut**. Written by the new `scripts/handoff_recent.py`, stdlib-only because the hook runs it as plain `python3`, not the repo venv.
- **`commits-recent.txt`** -- the last 80 non-merge commits minus `Auto:` bot noise, as `iso-date  short-sha  subject`.

Both are regenerated and staged by `.githooks/pre-commit`, so they cannot quietly go stale. `HANDOFF.md` stays the source of truth and the only one anyone edits; `HANDOFF-recent.md` opens with a do-not-edit banner and is overwritten.

**🔴 The structural catch, which changes how the hook is written.** The instruction was to append after the existing Notion-line check. You cannot: that check `exit 0`s on FOUR separate paths -- no HANDOFF.md in the commit, a merge, no added lines, and the Notion line being found -- plus `exit 1` on rejection. Appended code would therefore have run ONLY on the rejection path, i.e. almost never, and the files would have silently stopped updating. The check is now a function, called as `notion_line_check || exit 1`, with its messages and behaviour byte-identical; generation runs after it on every path. The merge early-exit is deliberately left as a true early exit, because nothing here should touch a merge.

**Design points worth keeping.** The banner carries NO timestamp, on purpose: a generated-at line would make the output differ every run and defeat the unchanged-file check, putting a pointless diff in every commit. The script reads the STAGED blob (`git show :HANDOFF.md`), so what gets summarised is exactly what is being committed. A failure aborts the commit rather than letting the summary drift. The size cap deliberately wins over the keep-at-least-4 rule, since a run of huge entries could otherwise produce a file the reconciler still cannot read, and it never trims to nothing.

**Verified before trusting it.** 21 assertions on the script's logic -- heading splitting, preamble excluded, the day window, the boundary day itself being kept, the keep-at-least floor reaching back, the size cap trimming oldest-first, a typo'd date surviving as oldest rather than vanishing, no-headings exiting non-zero and writing nothing, and idempotency down to the file's mtime. Then the hook itself in throwaway repos, 19 assertions: rejection still rejects and generates nothing; acceptance generates and stages both; a commit NOT touching HANDOFF.md still regenerates `commits-recent.txt`; a script failure aborts; and `SKIP_NOTION_CHECK=1` still works AND still generates.

One of those failures was mine, twice over: a first test asserted the 7-day window in isolation while the keep-at-least-4 floor was also firing, and a first hook run "failed" only because my seed commit had itself been rejected for having no Notion line, leaving a repo with zero commits. Both were the harness, not the code -- but the second one did prove the `git log` guard works, since it declined to stage a file it could not generate.

**Two known limits, stated rather than hidden.** `commits-recent.txt` is written in a PRE-commit hook, so it is generated from HEAD and always lags by exactly the commit being made; a post-commit hook cannot fix that without amending. And `^Auto:` does not catch the `data: refresh-schedule.json` bot commits -- **56 of the 80 lines** on the day this shipped -- so roughly 70 percent of the file is still routine noise. Widening the filter or raising `-n` would help; not done, because the command was specified exactly.

**Notion:** Decisions +1 ("The Notion reconciler reads small generated files, not HANDOFF.md or GitHub", Infra / deploy, Ashwin 2026-09-21), carrying both known limits as its open questions. Scheduled jobs: the "Notion reconciler (Citizen of Nowhere)" row updated -- Purpose now names the two generated files instead of "the last 36h of HANDOFF.md and commits", Notes carry the sizes, the why and the limits, Last verified 2026-09-21. Backlog unchanged.


## 2026-09-21 - mini -> windows and next session: THE RUNNERS DIRECTORY IS 13 SYMLINKS AND NO EXCEPTIONS

Ashwin, ruling the open convention question from last night: "make the runner a symlink like the others". `metro-rankings.sh` in `~/metro-mini-jobs/runners/` is now a symlink into the checkout like the other twelve. No repo commit: `~/metro-mini-jobs` is not tracked.

**Why it was the odd one out.** Its phase 2 build entry said "separate copy, not a symlink" in as many words, so that is how it went in on 09-20 -- an explicit instruction beats an unstated convention, even against 11 symlinks. It was flagged at the time as needing a ruling rather than quietly overridden. This is the ruling.

**What the copy actually cost.** A real file does not track a `git pull`, so an edit to the runner would reach the repo and silently never reach the mini until someone remembered to re-copy it. That is the same quiet-staleness shape this project keeps finding in other clothes: the hardcoded build-paths list in deploy-watch, the two divergent plists, and last night's football-standings fallback that held a quarter of the real schedule. Nothing would have failed; it would just have been running yesterday's code.

**The fleet had already voted.** `ops-autofix` deployed `dispatcher-lock.sh` into that same directory as a SYMLINK, unprompted, hours earlier. The automation's own convention and the written instruction disagreed, which is exactly the situation that deserved a human ruling rather than a judgement call at midnight.

**Verified, not assumed:** the link resolves to the repo file byte for byte; `build_argv()` still resolves the command to `~/metro-mini-jobs/runners/metro-rankings.sh`; dispatcher self-test 121 cases; and a full `DRY_RUN=1` run THROUGH the symlink exits 0 with `guard verdict: pass (rc=0)` and `unmatched metros: 3` (the calamine baseline), `public/data` restored, nothing committed, clean tree. 13 of 13 runners are symlinks.

**One consequence worth stating plainly:** a runner edit in the checkout is now LIVE on the mini the moment it is saved, with no install step. That is the convenience being bought, and it is also why `_common.sh` work last night was developed and proven in throwaway repos before being written to the real file. The same care applies to every runner now.

**Notion:** Decisions +1 ("Every runner in ~/metro-mini-jobs/runners/ is a symlink into the repo, without exception", Infra / deploy, Ashwin 2026-09-21), recording that it supersedes the phase 2 row's wording and noting that jobs.toml, dispatcher.py and state.json deliberately stay real files. Scheduled jobs: the metro-rankings row updated to say symlink and why. Backlog: the phase 2 row's Needs updated the same way; shadow Saturdays and the cutover remain its only open work.


## 2026-09-20 (night, last +18) - mini -> windows and next session: ALL CLEAR, AND CHECKED POSITIVELY RATHER THAN BY SILENCE

Ashwin asked for the feed once more, as the closing check on the night's changes. **No new ntfy since 23:23 BST** -- but silence is the same signal whether everything is healthy or nothing is running, so this was verified from the dispatcher's own log instead.

**Jobs really are running, through all of tonight's lock code:**
```
22:22Z  deploy-watch        DONE ok 2s
22:22Z  ops-autofix         DONE ok 104s
22:34Z  cricket-champions   DONE ok 13s
22:34Z  deploy-watch        DONE ok 2s
22:44Z  deploy-watch        DONE ok 2s
22:54Z  deploy-watch        DONE ok 2s
```
Four consecutive clean deploy-watch ticks plus two other jobs, all after `_common.sh` started taking the dispatcher lock and after `acquire_lock()` became re-entrant. No FAIL, no MISSED.

**The specific regression I was looking for did not happen.** My stand-down wording (`NOTHING WAS DONE`, `dispatcher lock held by pid`) appears **zero** times in the whole dispatcher log. That is the correct result, not a lucky one: under a tick the marker always names the live lock owner, so a scheduled job can never stand down, and only a genuine outsider can. Had the strict marker check been wrong in either direction, this is where it would have shown -- every job standing down, or the log silent because nothing ran at all.

**The six `standing down` lines in the log are not mine either** -- all six are ops-autofix's own 3/day attempt-cap message, dating back to 09-12 and 09-14. Checked rather than assumed, because "standing down" was exactly the phrase to be suspicious of tonight.

**What to watch at the next ops-autofix tick (00:15Z).** Two things should now be different. It should find NO `job_failed` finding at all, because mlb-sim and football-standings were marked ok at 22:47 and no job records a failure any more. And the next time it does fix something, its `--mark-ok` should SUCCEED rather than report "a tick may have held the lock", because `acquire_lock()` now lets the tick's own children through. If that line ever appears again, the re-entrancy is not working and `e3d83ac7e` is the commit to look at.

**Notion:** no row changes. Nothing was created, changed or retired; this was a verification pass that found the fleet healthy.


## 2026-09-20 (night, last +17) - mini -> windows and next session: THE LOCK RULE IS NOW ONE RULE, NOT TWO

Ashwin: "tighten the shell side to match". Commit `a559b3ead`, `[vercel skip]`.

`dispatcher-lock.sh` had accepted `DISPATCHER_LOCK_HELD` on mere PRESENCE, while `dispatcher.py`'s `acquire_lock()` (tightened an hour earlier) required it to name the lock file's CURRENT owner and that PID to be ALIVE. Harmless in practice -- every caller of the shell helper really is a child of a tick, so the strict test would have passed anyway -- but two implementations of one rule that disagree is the exact bug class this repo keeps re-finding: the hardcoded build-paths list in deploy-watch, the two divergent plists, the inert githooks. The shell now applies the identical test, and both files say so in their headers.

**What the strictness buys.** A loose check means an env var that leaked into an unrelated shell -- inherited by a long-lived session, exported by hand while debugging -- would wave a manual run straight past a LIVE tick, which is the precise collision the helper exists to prevent. The strict check cannot be fooled that way: a marker that does not match a live owner decides nothing, and the normal path then blocks as it always did.

**Verified, 13 -> 19 assertions.** The rewritten scenarios use a real live PID as the tick rather than an invented number, because the old test 4 had passed a MISMATCHED marker (lock 99999, marker 12345) and asserted pass-through -- correct under the loose rule and wrong under the strict one. That test now pins the right behaviour instead: a child of the live owner is let through and neither takes over nor deletes the lock; a run with NO marker blocks; a run with a WRONG marker blocks too (the leaked-env-var case); a marker with no lock file falls back to a normal acquire that IS the caller's to release; and a stray release still cannot touch someone else's lock.

**Then both real consumers, through the dispatcher's own `run_job` path**, as a four-way matrix -- `runners/_common.sh` (via git-maintenance) and the standalone `run-deploy-watch.sh`, each with and without the marker, against a live tick holding the lock:
```
with marker:     both RUN, do not stand down, tick's lock intact
without marker:  both STAND DOWN (exit 0), tick's lock intact
```
Identical behaviour from the two entry points, which is the point of having one rule.

**Note on method, twice over tonight.** The first edit attempt asserted on comment text I had retyped from memory and failed -- twice, once on each anchor -- and because every assertion runs BEFORE the write, the file was left untouched both times rather than half-edited. Then I read the real wording out of the file and matched it. Retyping an anchor from memory is how a "targeted" edit silently lands in the wrong place; the assert-then-write shape is what made the mistake free.

**Notion:** Backlog: the `--mark-ok` row (closed earlier tonight) extended with the shell tightening, so the row records both halves of one rule rather than implying only python was fixed. No other rows; nothing scheduled changed.


## 2026-09-20 (night, last +16) - mini -> windows and next session: AUTOFIX CAN FINISH ITS OWN REMEDY NOW. acquire_lock IS RE-ENTRANT FOR THE TICK'S OWN CHILDREN

Ashwin: "make acquire_lock honour DISPATCHER_LOCK_HELD". Commit `e3d83ac7e`, `[vercel skip]`.

**The bug, restated.** ops-autofix IS a dispatcher job, so the tick holds `.dispatcher.lock` with a live PID for its whole run, and `dispatcher.py --mark-ok` deliberately acquires that same lock (2026-08-07, to stop a concurrent tick clobbering `state.json`). A child could therefore never win it. Autofix's remedy was permanently half-applied: re-run the job green, then fail to record it, so the next tick found the same `job_failed` and re-ran a healthy job until the 3/day cap.

**The fix.** `acquire_lock()` now lets a caller through when `DISPATCHER_LOCK_HELD` says its parent tick already holds the lock -- the same marker `job_env()` already exports to every job subprocess and that `dispatcher-lock.sh` already honours for shell runners. **Checked strictly, not merely present:** the marker must name the PID the lock file CURRENTLY HOLDS, and that PID must be ALIVE. So an env var that leaked into an unrelated shell proves nothing, and a real conflict with another tick still blocks.

**The half that carries the risk is `release_lock()`,** which now only releases a lock this process actually TOOK. Without that guard, a child waved through on the marker would delete the tick's lock on its way out and the very next tick could start on top of a run still in progress -- strictly worse than the bug being fixed. Same shape as the `_DL_HELD_BY_US` guard in the shell helper, and two of the new self-tests exist purely to pin it.

**Verified twice over.** Nine new self-test cases, 113 -> 122: the child is let through; it does NOT take the lock over; its release does NOT delete the tick's lock; the tick's lock still reads the tick's PID afterwards; a marker naming someone OTHER than the lock's owner still blocks; and a marker with no lock file at all falls back to a normal acquire that IS ours to release. Then the real thing, not a simulation of it: with a live process holding `.dispatcher.lock`, `dispatcher.py --mark-ok football-standings` **exits 1 without the marker and 0 with it**, and the lock is intact afterwards. That is the exact before/after of what autofix does.

**Also cleaned up on the way in.** `state.json` still carried `failed` for football-standings (17:00Z) and mlb-sim (14:30Z) although both had been green for hours -- the stale statuses this bug leaves behind. Marked ok by hand at 22:47 from outside a tick. No job on the mini now records a failure.

**🔴 One asymmetry left, deliberately.** `dispatcher-lock.sh` checks only that `DISPATCHER_LOCK_HELD` is PRESENT; the python side now checks that it MATCHES the live lock owner. Harmless today, because every caller of the shell helper really is a child of a tick, so the strict test would pass anyway. But two implementations of one rule that disagree is the bug class this repo keeps re-finding, and tightening the shell side to match costs nothing. Not done tonight; worth doing next time that file is open.

**Notion:** Backlog: the `--mark-ok` row filed an hour ago is CLOSED (Done), rewritten with the fix, the strict-marker reasoning, the release guard, the verification and the remaining shell asymmetry. No other rows; nothing scheduled changed.


## 2026-09-20 (night, last +15) - mini -> windows and next session: THE FIRST GREEN football-standings SINCE THE INCIDENT, AND AUTOFIX CANNOT FINISH ITS OWN REMEDY

Ashwin asked for the feed again. Three messages since the last check, and the 23:23 one carries three separate facts worth having.

**1. `re-ran football-standings successfully`.** That is the first clean football-standings run since it started failing at 18:09, and it was done by ops-autofix on its own, not by me. The pull-path fixes hold under the fleet's own machinery.

**2. `deployed dispatcher-lock.sh (symlink)`.** ops-autofix noticed the new file in the repo and installed it into `~/metro-mini-jobs` itself, AS A SYMLINK. Two things follow: the deploy path works unprompted, and the fleet's own automation treats symlink as the convention for `mac-mini-jobs` files, which is a data point for the still-unruled question of whether `metro-rankings.sh` should stay a copy.

**3. 🔴 `mark-ok failed; a tick may have held the lock` -- and it is structural.** ops-autofix IS a dispatcher job, so the tick holds `.dispatcher.lock` with a LIVE pid for its whole run, and `dispatcher.py --mark-ok` deliberately acquires that same lock (added 2026-08-07 so a concurrent tick cannot clobber `state.json`). A child process can therefore NEVER get it. So autofix's remedy is only ever half-applied: it re-runs the job successfully and then cannot record that success.

**The consequence was live on this machine.** `state.json` still read `last_status: failed` for football-standings' 17:00Z slot and mlb-sim's 14:30Z slot, though both had been re-run green hours earlier. Left alone, every autofix tick would keep finding the same `job_failed`, re-running healthy jobs, and burning the 3/day cap -- which is exactly what mlb-sim's "hit its 3/day attempt cap" line was, in part. Corrected by hand at 22:47 with `--mark-ok` for both, from outside a tick, where the lock is free. No job now records a failure.

**Not mine, and I checked rather than assumed.** The obvious suspicion was that tonight's `_common.sh` lock change caused it. It did not: the message wording lives at `run-ops-autofix.sh:222` and `git log -S` puts it in commit `4993d5efb`, the tiered-autofix commit, so this has been true since autofix shipped. It stayed invisible because nothing ever compared the autofix report against `state.json` afterwards -- the report says "re-ran successfully", which is true, and the stale status sits somewhere nobody looks.

**Filed, not fixed** (Backlog, P2, owner Ashwin): `dispatcher.py`'s `acquire_lock()` could honour `DISPATCHER_LOCK_HELD` exactly as `dispatcher-lock.sh` already does -- the marker is already exported to every job subprocess by `job_env()` -- which would let a child `--mark-ok` through while still blocking an unrelated process. Small, and it matches a pattern now proven in shell. It also changes the most safety-critical function on the mini, so it is a ruling rather than a drive-by at midnight.

**Everything else is quiet.** No failure alert since the pre-fix ones; the two git-maintenance alerts at 22:27/22:28 are the planted-fixture test and the false dry-run page already fixed in `4f91825d9`.

**Notion:** Backlog +1 (the `--mark-ok` re-entrancy ruling, P2, owner Ashwin, with the proposed fix and the evidence that it predates tonight). No other rows.


## 2026-09-20 (night, last +14) - mini -> windows and next session: EVERY PLIST PAIR NOW BYTE-IDENTICAL, REPO AND INSTALLED

Ashwin: "do that cp too". The repo copy of the football-standings plist was copied over `~/Library/LaunchAgents`, restoring the explanatory comment and the two-space style the installed copy had lost when some tool rewrote it (that rewrite is also how it gained tabs and dropped its documentation). No repo commit: `~/Library/LaunchAgents` is not tracked.

Safe by construction rather than by assumption: the two files were re-confirmed to parse to EQUAL dictionaries immediately before the copy, with the script asserting equality and refusing to proceed otherwise, so nothing behavioural could change. A fresh backup of the installed file was taken first. After: byte-identical, strict `plistlib` parse OK, `plutil -lint` OK, all eight schedule slots present, comment restored, no `hc-run` wrapper, `bash -n` clean on the command, target script exists, and the agent still **unloaded** -- it is a fallback and was left one.

**Then the obvious question: was football-standings the only drifted pair?** Audited all 17 plists that exist in both `mac-mini-jobs/launchd/` and `~/Library/LaunchAgents/`, comparing text AND parsed dictionaries:

```
17 pairs: TEXT identical, PARSED equal, in every single case
LOADED: f1-weekly, heartbeat   (the two jobs still genuinely on launchd)
unloaded: the other 15         (dispatcher-owned; plists kept as manual fallbacks)
```

So the answer is yes -- football-standings was the only one, and there is now no divergence anywhere between what the repo documents and what is installed. Worth saying because "the two copies disagree" has bitten this project more than once, and until tonight nothing compared them.

**State of the fallbacks at the end of the evening.** All 15 dormant plists run their job directly, none pings a dead healthchecks slug, and each matches its repo copy exactly, so reinstalling any of them does what its comment says. `deploy-watch`'s plist deliberately still carries its `hc-run.sh` wrapper, because that slug became VALID tonight when the tile was created -- reload it as a fallback and it reports properly.

**Notion:** no row changes. Nothing created, retired or rescheduled; this restored documentation to an installed file and confirmed the rest were already in step.


## 2026-09-20 (night, last +13) - mini -> windows and next session: THE football-standings FALLBACK PLIST NOW MATCHES WHAT WOULD ACTUALLY RUN

Ashwin: "sync the repo copy to the live football-standings schedule". Commit `2e2b68dab`, `[vercel skip]`.

**What was wrong.** The repo copy had TWO wake slots, 05:00 and 06:00 local; the live `~/Library/LaunchAgents` copy had EIGHT: 05/06, 11/12, 17/18, 23/00. The live one is right -- those four pairs are the four UTC hours in this job's `times` in jobs.toml (05:00, 11:00, 17:00, 23:00), each scheduled twice, an hour apart in LOCAL time, so the pair straddles GMT/BST and the script's own UTC guard then runs the real job only on the intended UTC hour. The repo copy had never been updated when the job went from daily to four times a day. Since the repo copy is the one the install instruction says to `cp` into place, the documented fallback was a QUARTER of the real schedule: reinstall it and football data would refresh once a day while everything assumed four times.

**The comment was wrong too, and that is the half that is easy to miss.** It read "Wakes at 05:00 AND 06:00 LOCAL; the script's UTC guard runs the real job only at 05:00 UTC" -- an accurate description of a schedule that no longer existed. Rewritten to describe the four runs and the DST pairing, with a line saying where the slots came from and when. Copying the array across without touching the prose would have left a file that contradicted itself, which is the same failure as a dangling slug: something that reads as documentation and is not.

**Method, after last round's two self-inflicted errors.** The new slots were GENERATED from the parsed live plist rather than retyped, so there is no transcription risk; the edit was a targeted text splice, not a `plistlib.dumps` rewrite, so the comment block and the file's compact one-dict-per-line style survive; and it was validated by strict `plistlib` parse AND checked for `--` inside comments, not just `plutil -lint`, which passed malformed XML earlier this evening.

**Verified:** both copies now parse to EQUAL dictionaries -- Label, ProgramArguments, StandardOutPath, StandardErrorPath and all eight StartCalendarInterval entries match key for key. The only remaining difference between the two files is textual: the repo copy carries the explanatory comment and two-space indentation, the live copy has neither (it was rewritten by a tool at some point, which is how it lost its comments and gained tabs). Behaviourally they are now the same file.

**Not done, deliberately:** the live copy was NOT overwritten with the repo copy. It would be harmless -- they are behaviourally identical and the agent is unloaded -- and it would restore the documentation to the installed file, but the instruction was to sync in the other direction and that is the direction taken. One `cp` whenever it is wanted.

**Still open from earlier tonight, unchanged:** nothing. Every Backlog row opened this session is Done, and there are no dangling slugs anywhere on the machine.

**Notion:** no row changes. The schedule in the Scheduled jobs row for football-standings already describes the dispatcher's `times` (05:00, 11:00, 17:00, 23:00 UTC), which is what the job actually runs on; this fixed the dormant fallback's copy of it, not the live schedule.


## 2026-09-20 (night, last +12) - mini -> windows and next session: ZERO DANGLING SLUGS ANYWHERE. TWO SELF-INFLICTED MISTAKES ON THE WAY, BOTH CAUGHT BEFORE COMMIT

Ashwin: "clear the dangling slugs in the unloaded plists too". Done for all five -- `cricket-monthly`, `activity-feed`, `football-standings`, `gap-league-watch`, `screen-number-ones`. Commit `b65225cdc`, `[vercel skip]`.

Each wrapped its job in `hc-run.sh <slug>` for a check that no longer exists. Dormant today because the agents are unloaded, but these plists exist precisely to be RELOADED as the manual fallback when the dispatcher is down -- the worst moment to discover a job is silently not reporting. Each now runs its script directly.

**Both copies, deliberately.** All five live in `mac-mini-jobs/launchd/` AND `~/Library/LaunchAgents/`. Editing one is how this repo gets the two-divergent-plists bug it has been bitten by before, so all ten files were changed together, and `ProgramArguments` now match across every pair.

**A pre-existing divergence found and NOT touched:** `football-standings`' live copy carries six more `StartCalendarInterval` slots than the repo copy (11:00, 12:00, 17:00, 18:00, 23:00, 00:00 -- the DST-paired set). Nothing to do with slugs. Both are unloaded and the job runs from the dispatcher, so it changes nothing today, but it means the repo copy is NOT what would run if someone reloaded the fallback. Left exactly as found, and edited in place rather than by copying one file over the other, precisely so the difference survived to be decided on deliberately.

**🔴 MISTAKE ONE: plistlib ate the documentation.** First pass rewrote the files with `plistlib.dumps`, which produced a 121-line diff on a one-line change and, worse, **silently deleted every XML comment** -- including the block explaining why screen-number-ones runs nine slots a week instead of one. Caught by reading the staged diff rather than trusting "5 files changed". Reverted both copies (repo via git, LaunchAgents from backup) and redone as minimal text edits: the diff is now 10 insertions and 8 deletions, and the comments are intact.

**🔴 MISTAKE TWO, worse, and it passed a linter.** Two of those comments claimed "through hc-run.sh for a healthchecks tile", so leaving them would have been the same class of lie as the slug. Rewriting them, I wrote ` -- ` inside the comment text. **`--` is illegal inside an XML comment**, so `activity-feed` and `screen-number-ones` became malformed XML. `plutil -lint` reported all ten OK. Python's expat parser rejected them. Caught only because the verification step parsed the files with plistlib instead of stopping at the lint. **Lesson worth keeping: `plutil -lint` is not a validator for hand-edited plists -- parse them strictly as well.** Repaired, re-validated strictly, and a check added that no comment contains `--`.

**Verified after repair:** all ten parse strictly; no `hc-run` reference survives in any of them; every `-lc` command passes `bash -n`; every target script exists; all five remain UNLOADED; and the football-standings divergence is still there.

**Fleet-wide audit, the whole point of the exercise:**
```
tiles: 20   jobs.toml hc_slugs: 15
dangling in jobs.toml:        NONE
dangling in LOADED plists:    NONE
dangling in unloaded plists:  NONE
```
Nothing anywhere on this machine -- running, dormant or in the repo -- pings a healthchecks check that does not exist. That statement was false in three separate places when the evening started.

**Notion:** no row changes. Nothing was created, retired or rescheduled; five dormant fallbacks stopped claiming monitoring they never had. The Scheduled jobs rows for these jobs already describe their real alerting, and the cricket-monthly row was rewritten earlier tonight when its tile was given up.


## 2026-09-20 (night, last +11) - mini -> windows and next session: newsletter-retention'S DEAD SLUG IS GONE. NOTHING RUNNING PINGS A CHECK THAT DOES NOT EXIST

Ashwin: "fix the newsletter-retention dangling slug". Done. No repo commit -- the change is a launchd plist in `~/Library/LaunchAgents`, which has no copy in the newsletter-podcast repo (checked, so no divergent-plist risk).

**What it was.** `com.newsletter.retention` is LOADED and wrapped its script in `hc-run.sh newsletter-retention`. No such check exists, so every ping 404'd into `|| true`. The job looked monitored and was not -- the same shape as deploy-watch, in the newsletter project.

**Why the fix was removal and not a tile.** The project is hard-capped at 20 and is exactly at it (a create returns HTTP 403), and the `cricket-monthly` slot freed earlier tonight had already gone to deploy-watch. So the choice was an honest config or a second sacrifice, and the job does not warrant one: `retention-spotify.sh` already pushes its own ntfy on every meaningful path -- an unparseable episode list (aborts, deletes nothing), a refusal when the count exceeds `MAX_DELETE`, any failed delete, and a routine daily success summary. A tile would have added only a hard dead-man's switch for "did not run at all", and THAT failure mode is benign here: episodes accumulate on the feed, nothing is destroyed. The dangerous paths self-alert already.

Worth stating plainly because the job is irreversible: ARM=1 and KEEP_DAYS=7 in the plist mean it really deletes published Spotify episodes older than a week. It is guarded -- dry run unless ARM=1, `MAX_DELETE=10` refuses a bulk purge unless FORCE=1 (a big number means the parse broke, not that the back catalogue aged), abort on an unparseable list -- and none of those guards were touched.

**A mistake I made and caught.** Rebuilding `ProgramArguments` as `[old[0]] + old[3:]` produced `["/bin/bash", "/bin/bash", "<script>"]`, because element 0 was bash-for-hc-run and element 3 was bash-for-the-script. It would have RUN -- bash invoking bash invoking the script -- which is exactly why it was worth reading the result instead of trusting the splice. Rewritten explicitly as the two elements it should be.

**Verified rather than assumed:** `plutil -lint` OK; agent booted out and re-bootstrapped; `launchctl list` confirms the two-element ProgramArguments launchd actually holds; and the script executed end to end through the new invocation as a DRY RUN -- 8 episodes, 0 older than 7 days, exit 0, and no stray ntfy, because the dry-run push only fires when there is something to prune. Everything else in the plist is untouched: ARM, KEEP_DAYS, the 12:00 slot, both log paths.

**Fleet-wide audit after the change -- 20 tiles, 15 jobs.toml slugs, and:**
- dangling in jobs.toml: **NONE**
- dangling in LOADED plists: **NONE**
- dangling in unloaded plists: `cricket-monthly`, `activity-feed`, `football-standings`, `gap-league-watch`, `screen-number-ones` -- all dormant, nothing pinging them. They matter only the day someone reloads one as the manual fallback, at which point it would silently not report. Clear them when those plists are next touched.

So: **nothing that currently runs pings a check that does not exist.** That statement was false twice tonight, in two different projects, and neither jobs.toml nor the dashboard could have told you on its own -- only comparing the two lists does, which is the five-line audit now recorded in these entries.

**Notion:** Scheduled jobs: the "Newsletter retention (mini)" row rewritten -- "Alerts via" corrected from `unknown, outside this repo` to the actual ntfy paths, and Notes now carry what the job deletes, its guards, the dangling-slug fix and why removal beat a tile. No other rows; no schedule changed.


## 2026-09-20 (night, last +10) - mini -> windows and next session: deploy-watch HAS A TILE AT LAST, PAID FOR WITH cricket-monthly

Ashwin: "swap a monthly tile for deploy-watch". Done. Commit `f86af4439`, `[vercel skip]`.

**The cap is real and it is 20.** Confirmed the hard way rather than from the comments: a create returns **HTTP 403** while the project is full, and a GET on the same key returns 200, so it is the limit and not the credentials. There is no add-then-remove; the delete has to come first. Ashwin ran the DELETE himself -- the session's permission layer refused it, which is the right default for an irreversible call against live monitoring.

**Which monthly, and why.** `cricket-monthly` over `conflicts-monthly`: the conflicts refresh has a catastrophic failure in its history -- the run that wiped five centuries of war data -- and cricket had 7 pings of history to lose against conflicts' 11. The underlying argument for spending a monthly at all: the dispatcher ALREADY pushes an ntfy on a missed slot ("Metro: scheduled job missed") as well as on a failed run, so for a job that runs 12 times a year a tile was adding remote visibility and little else. deploy-watch runs 144 times a day and its failure mode is silence -- a canceled Vercel build that never heals.

**The new tile:** uuid `e9a03a8e-28b0-4477-b042-05283aae4376`, period **1h**, grace **30m**, same notification channel as the rest. NOT 10 minutes, deliberately: the dispatcher can skip a tick while a long job holds its lock (mlb-sim up to 45m), and a run that stands down on the lock still pings success, so a gap that size means it is genuinely not running. Verified up: a real `hc-run.sh deploy-watch ...` run took it from `new` to `up`, 2 pings, 2s.

**🔴 A TRAP WORTH KNOWING, found in the act.** A check created through the API does **NOT** get a slug. It came back `slug: ''`, and hc-run.sh pings `hc-ping.com/<key>/<slug>` -- so the tile would have existed, looked healthy in the UI, and never received a single ping. Exactly the failure being fixed, recreated by the fix. `slug` turns out to be writable, so a follow-up POST with `{"slug":"deploy-watch"}` set it, and only then did the end-to-end ping register. Anyone scripting a check must set the slug explicitly and then prove it with a real ping, not assume the name derives it.

**And the other half of the swap, which is the part that is easy to skip:** `hc_slug = "cricket-monthly"` is GONE from jobs.toml, in the same commit. Leaving it would have left hc-run.sh pinging a slug with no check behind it, 404ing into `|| true`, so the job would look monitored and not be -- the dangling-slug trap the football-standings row warns about, and which an audit found live on deploy-watch itself an hour earlier. The removed line carries the full recreation recipe (cron `0 11 1 * *`, tz Europe/London, grace 48h, channel uuid) so the tile can be rebuilt exactly if the cap ever lifts.

**Re-audited after the change: 20 tiles, 15 configured `hc_slug`s, ZERO dangling.** dispatcher self-test 113 cases green, jobs.toml installed to the mini.

Still dangling, unchanged and harmless because their plists are UNLOADED: `activity-feed`, `football-standings`, `gap-league-watch`, `screen-number-ones`. Still genuinely unmonitored and LOADED: `newsletter-retention`, which pings a slug with no tile -- the same class as deploy-watch was, in the newsletter project, and the next candidate if a slot ever frees up.

**Notion:** Scheduled jobs: `deploy-watch` row's "Alerts via" corrected again -- from "no tile exists" (this evening's audit) to the created tile with its uuid and period, plus why 1h; `cricket-monthly` row rewritten with the tile given up, the reasoning, and the exact recreation recipe including the slug trap. No other rows; no schedule changed.


## 2026-09-20 (night, last +9) - mini -> windows and next session: HEALTHCHECKS IS ALL GREEN, AND TWO LIVE JOBS ARE PINGING TILES THAT DO NOT EXIST

Ashwin asked for the dashboard. Pulled all 20 checks through the API (`/api/v3/checks/`). **Every one is `up`. No red, no amber, nothing paused.** After tonight that is the answer that matters: the fleet recovered and stayed recovered.

Freshness is consistent with each check's own period -- `mac-mini` 14m, `f1-weekly` 13m, `claude-auth-canary` 2.8h, `egress-refresh` 12.9h (Sunday job), the weeklies 4-6d, the monthlies 18-19d.

**But the dashboard is not the whole monitoring story, and the gap is the finding.** I compared every configured `hc_slug` against the tiles that actually exist:

🔴 **`deploy-watch` has NO TILE.** jobs.toml sets `hc_slug = "deploy-watch"` and hc-run.sh dutifully pings it every 10 minutes, 144 times a day; the check does not exist, the ping 404s, and `|| true` swallows it. The job LOOKS monitored and is not. **This predates tonight** -- the retired plist pinged the same dead slug -- but I made it worse in the record: when I moved deploy-watch under the dispatcher I deliberately kept `hc_slug` "to keep the existing healthchecks tile alive" and wrote that into Notion. There was no tile to keep alive. The Scheduled jobs row now says so plainly. This is exactly the dangling-slug trap the football-standings row warned about in its own comment, and it caught me because I trusted the config instead of the dashboard.

🔴 **`newsletter-retention` has NO TILE either**, and its launchd agent IS loaded, so it is a live job in the same state.

Dangling-but-harmless: `activity-feed`, `football-standings`, `gap-league-watch`, `screen-number-ones` all ping dead slugs from plists that are UNLOADED, so nothing is pinging today. They matter only if someone reloads one as the manual fallback, at which point it would silently not report. Worth clearing when those plists are next touched.

Not a fault: the `mac-mini` tile has no `hc_slug` behind it because `run-heartbeat.sh` pings `$HEALTHCHECK_URL` directly rather than through hc-run.sh. Green and 14m fresh.

**Why it cannot simply be fixed.** The project holds EXACTLY 20 checks, which is its documented cap -- the football-standings and other tiles were given up on 2026-09-10 to get under it. Restoring a `deploy-watch` tile means deleting another or raising the plan, and that is a trade about what deserves remote visibility, not a mechanical fix. Ashwin's call. My view if asked: deploy-watch is a reasonable candidate BECAUSE it runs 144 times a day and its failure mode is silence -- a canceled build that never heals -- whereas several monthlies on the board fail loudly and rarely.

**Method note.** Two nights running, the thing that was wrong was invisible in the place you would naturally look. The dry-run false alert was invisible in the job's own output and showed up only in the ntfy feed; this dangling slug is invisible in jobs.toml and the dashboard alike -- the config says monitored, the dashboard simply has no row, and nothing anywhere says "these disagree". Comparing the two lists is a five-line script; it is now in this entry's history and worth re-running whenever a tile is deleted.

**Notion:** Scheduled jobs: the `deploy-watch` row's "Alerts via" corrected from claiming healthchecks coverage to stating there is no tile and why, with Last verified set. No other rows changed; no job or schedule touched.


## 2026-09-20 (night, last +8) - mini -> windows and next session: RE-READ THE ntfy FEED AFTER THE CHANGES AND CAUGHT MY OWN FALSE ALARM

Ashwin asked for the feed to be checked again. Fifteen messages in twelve hours; twelve are the original incident, already triaged and fixed. Three are new since 21:56, and one of them was a bug I had just shipped. Commit `4f91825d9`, `[vercel skip]`.

**The three new ones.**
- `21:56:42` "one or more leagues failed to build" -- my own first mlb-sim re-run, the Cardinals race. Explained at the time and the 21:58 run was clean.
- `22:28:07` "git-maintenance swept 1 stale lock(s)" -- the REAL test run quarantining a planted fixture. Correct, and useful: it proved the alert path works.
- `22:27:53` the same alert, **from the DRY RUN 14 seconds earlier. That one was a lie.**

**🔴 The bug.** In `git-maintenance.sh` the sweep counter is incremented in BOTH branches -- the real `mv` and the `DRY_RUN: would quarantine` note -- because it counts what a real run WOULD do, which is right for the note. But the alert was `[ "$swept" -gt 0 ] && alert ...`, ungated. So a rehearsal paged Ashwin with "something crashed mid-write; check dispatcher.log" while having quarantined precisely nothing. DRY_RUN's entire contract is that it has no side effects, and sending a push notification is a side effect. Gated on `DRY_RUN` now.

**How it was caught, which is the part worth keeping.** Not by the run's own output -- that said `DRY_RUN: would quarantine`, exactly as designed, and looked perfect. It was caught by re-reading the ntfy feed afterwards and finding a message that should not exist. A job's self-report cannot tell you about a side effect the job does not know it has. The same is true of the earlier 22:15 crash, which no job reported at all.

**Verified two ways.** The gate itself, across all six combinations of `swept` in {0,1,2} and `DRY_RUN` in {0,1}: fires only when `swept>0` AND `DRY_RUN` is not 1. Then end to end against the live feed: a stale lock planted, `DRY_RUN=1` run, fixture left untouched, and **zero** ntfy messages in the window afterwards.

**Everything else in the feed is quiet, and that is the real result.** Nothing has failed since the fixes went in. deploy-watch ran clean under the dispatcher at 22:10Z; `ops-autofix`, `football-standings` and `mlb-sim` have sent nothing since their pre-fix failures; no divergence alert since 21:21, when there had been one every two hours all evening.

**Notion:** Scheduled jobs: the `git-maintenance` row's Notes now carry the false-alert bug, the fix, and the re-verification -- recorded rather than quietly corrected, because the row previously claimed the dry run changed nothing, and that claim was incomplete. No other rows changed.


## 2026-09-20 (night, last +7) - mini -> windows and next session: EVERY RUNNER TAKES THE DISPATCHER LOCK. THE HAND-RUN HOLE IS SHUT

Ashwin: "do _common.sh too". Commit `fea5fe445`, `[vercel skip]`. This closes the case that actually did the damage -- the 22:15 collision was a hand-run `metro-rankings`, not deploy-watch.

**What it does.** `_common.sh` sources `dispatcher-lock.sh` and acquires at source time, so EVERY runner is covered, including ones that never call `mini_sync` (git-maintenance). Under a tick it is a no-op, because the tick exports `DISPATCHER_LOCK_HELD`; only a manual run can stand down, so no scheduled job can be silently skipped by this. Standing down is exit 0 with an explicit "NOTHING WAS DONE -- no data was built, fetched or committed", because a person reading their terminal must not mistake a stood-down run for a completed one.

**🔴 THE THING THAT WOULD HAVE BITTEN, and the reason this took measuring rather than typing.** The obvious implementation is `trap dispatcher_lock_release EXIT` in `_common.sh`. Do NOT. bash's `trap ... EXIT` REPLACES any previous EXIT trap, and TWO runners own theirs for real work:
- `metro-rankings.sh:70` -> `_restore_public_data`, which is the guarantee that `public/data` is put back after a shadow run;
- `economy-rates.sh:146` -> `report_failed_builders`.
Both set theirs AFTER sourcing `_common.sh`. I measured it before writing anything: with two EXIT traps registered, only the SECOND runs and the first is silently dropped. So a release trap here would never fire -- and had I ordered it the other way, it would have silently killed metro-rankings' restore, which is precisely the failure that left 775 files modified in the first place. A tidy-looking one-liner would have reintroduced tonight's worst outcome.

**Not releasing is safe, and that is the design, not a shortcut.** The lock is a PID, and both implementations probe it with signal 0 and take over a dead one. A manual run leaves a file whose owner is gone; the next acquirer reclaims it and says so. Correctness that does not depend on trap ordering is worth more than tidiness. Proven on the real lock file: after a hand-run metro-rankings exited, `.dispatcher.lock` held dead pid 5868, and the next runner printed `stale dispatcher lock (pid 5868); taking it over` and ran.

**Verified, five ways.** (1) Manual, lock free -> runs. (2) Manual, lock held by a live pid -> stands down, exit 0, ZERO work done, lock not stolen; the message names the runner, from `BASH_SOURCE[1]`. (3) `DISPATCHER_LOCK_HELD` set with the lock held -> runs normally, tick's lock intact. (4) **The trap regression**: a full `metro-rankings` dry run, where the log shows `shadow mode: restoring public/data` and the tree came back clean -- its own EXIT trap still fires. (5) The whole chain through the dispatcher's real `run_job` path: tick holds the lock, `job_env()` sets the marker, the runner sources `_common.sh`, does not stand down, does real work, and the tick's lock is intact afterwards.

**Fails open.** If `dispatcher-lock.sh` is ever missing, the `[ -r ... ]` guard skips locking entirely and behaviour is exactly what it was before. An absent helper must not take the fleet down.

**Where the mini stands now.** Every writer of this repo's git -- scheduled or by hand -- is serialised by one lock. gc is off git's hands with its own 03:00 slot that sweeps stale locks. dispatcher.log rotates. The pull path rebases a divergence and flushes tagged commits, alerting on untagged ones. verify_wins tolerates a settling game. Every Backlog row opened tonight is Done, and the four Decisions rows carry their own residual notes rather than a clean bill of health.

**Notion:** Decisions: the gc/lock row's Rule rewritten to describe the whole lock regime, and its open questions CLOSED -- with the no-trap decision recorded there explicitly, as a design note rather than a gap, so the next person does not "fix" it. No new rows; no job or schedule changed.


## 2026-09-20 (night, last +6) - mini -> windows and next session: deploy-watch TAKES THE DISPATCHER LOCK BY HAND TOO

Ashwin: "bring deploy-watch under the dispatcher lock for manual runs too". Commit `85565d230`, `[vercel skip]`.

**The gap.** Moving deploy-watch into jobs.toml put its SCHEDULED runs inside the dispatcher's lock, but a run started by hand still bypassed it -- and deploy-watch is the script most likely to be run by hand, because its launchd plist is deliberately kept (unloaded) as the fallback for when the dispatcher is down.

**`mac-mini-jobs/dispatcher-lock.sh`, new.** A shell counterpart to `dispatcher.py`'s `acquire_lock()`: SAME file (`~/metro-mini-jobs/.dispatcher.lock`), same format (a PID), same liveness probe (`kill -0`), same stale-file takeover. Deliberately a quote of that function rather than a parallel invention -- two locks that cannot see each other would be worse than one lock -- and the header says so, because this repo keeps finding the two-copies-of-one-rule bug class.

**Re-entrancy is the part that could have gone badly.** When the DISPATCHER runs deploy-watch it already holds the lock; a child that tried to take it again would block that job forever. `dispatcher.py` now exports `DISPATCHER_LOCK_HELD` to every job subprocess (new `job_env()`), and a child seeing it proceeds without touching the lock. The matching guard: `dispatcher_lock_release` only releases a lock the calling process actually TOOK. Without that, a job would delete the tick's lock on its way out and the next tick could start on top of a running one -- strictly worse than the problem being fixed.

**Standing down is exit 0.** deploy-watch is threshold-based (`STALE_MIN=20`) and reconciles on its next pass, so a skipped run costs nothing, while a red healthchecks tile for "the dispatcher was busy" would cost attention that should go to real breakage.

**Verified at three levels.** Unit: 13 assertions on the helper -- acquires when free, refuses a live holder without stealing the file, takes over a stale lock, and two cases specifically on the dangerous one (a child under `DISPATCHER_LOCK_HELD` neither overwrites nor deletes the tick's lock), plus a stray release being a no-op. Dispatcher: 3 new self-test cases on `job_env` (marker set, rest of the environment preserved, no leak into our own `os.environ`); 110 -> 113 cases. Integration, against the REAL script and the REAL lock file: (A) lock free -> runs and releases; (B) lock held by a live pid, run by hand -> stands down, exit 0, ZERO git work, lock untouched; (C) lock held plus `DISPATCHER_LOCK_HELD`, exactly as the dispatcher invokes it -> runs normally and leaves the tick's lock intact. Then a genuine scheduled tick at 22:10Z: `RUN deploy-watch (slot 22:10Z, 0m late)` / `DONE deploy-watch: ok 2s`, lock released after.

**🔴 What this does NOT cover, and it is the case that actually caused the damage.** Only deploy-watch is wired up. The hand-run that collided at 22:15 and cost a metro-rankings shadow run its restore -- 775 files left modified -- was `metro-rankings`, not deploy-watch. Sourcing the same helper from `runners/_common.sh` would cover every runner's manual invocation in one place, following the identical pattern (`dispatcher_lock_acquire` then `trap dispatcher_lock_release EXIT`), and the re-entrancy marker already exists for it. NOT done: Ashwin scoped this to deploy-watch, and widening a lock across the whole fleet unasked is how you get a job that silently never runs. Worth a decision.

**Notion:** Decisions: the gc ruling's row updated -- its third item (manual runs) now closed for deploy-watch, with the `_common.sh` extension recorded as what remains. No new rows: this created no job and changed no schedule. Backlog unchanged and still empty of tonight's rows.


## 2026-09-20 (night, last +5) - mini -> windows and next session: verify_wins TOLERATES A SETTLING GAME. EVERY BACKLOG ROW FROM TONIGHT IS CLOSED

Ashwin asked what ruling the P2 wanted, was given four options, and chose the bounded skew. Commit `4a3ea669d`, `[vercel skip]`.

**The problem, in one line.** ESPN's standings endpoint increments a team's wins the moment a game goes final; the per-team schedule endpoint's `completed` flag lags a few minutes. `verify_wins()` demanded exact equality across all 30 teams, so for those few minutes the two sources genuinely disagreed about one game for one team and mlb-sim hard-failed. 09-16 and 09-20 inside five days, both self-healing on the next slot, each costing an alert and ops-autofix's 3/day retry budget -- which trains everyone to ignore mlb-sim failures, the exact opposite of what the gate is for.

**The rule now.** A new PURE classifier, `classify_win_mismatch()`, sorts a disagreement into `match` / `settling` / `broken`. Settling is at most `SETTLING_TEAMS_MAX` (2) teams, each off by exactly one win; it proceeds and says so in meta's `wins_check`, so a run that published under a skew can be found afterwards rather than taken on trust. Everything else still raises.

Two judgement calls worth recording:
- **Either direction counts.** Standings-ahead is the diagnosed cause, but a cached standings response with a fresher schedule gives the mirror image, and failing on that would simply have reintroduced the false red under a different name. **Magnitude is the test, not direction**: off by one is a game in flight, off by two is not a story about timing.
- **Two teams, not one.** One game in flight moves one team; two covers a doubleheader or two games settling together. That bound is the thing to revisit if a slot ever moves into a window where many games end at once.

**This does not weaken what the gate is actually for,** and that is the whole argument for the change. `verify_wins` exists to catch a SILENT SYSTEMATIC parse break -- the incident where competitors on the schedule endpoint had no `name` field, every game was discarded, and all 30 teams sat at ~40% playoff odds off an unplayed season. That failure is off by HUNDREDS of wins league-wide. There is now a self-test case asserting precisely that shape still classes as `broken`. It also brings mlb-sim into line with `build_season_sims.py`, which has tolerated this same shape in its own self-test all along -- the inconsistency between the two was itself part of why this looked like a real fault.

**Verified.** Nine new self-test cases pin the boundary: match; one team off by one; off by MINUS one; two teams (the cap); three teams (broken); one team off by two (broken); one small plus one large (broken); the whole-league empty parse (broken); and that the returned list names the right team. `build_mlb_sim.py --self-test` 60 -> 69 cases. Then a live run against real ESPN, which reported `verified against ESPN standings (30/30 teams)` -- the normal path, unchanged, which is the other thing worth proving. Its two data outputs were reverted rather than committed; the 07:00 job regenerates them through its own commit path.

**Tonight's ledger is closed.** Every Backlog row opened during this session is Done: `mini_sync` rebase fallback (P1), and now `verify_wins` (P2). The three failure modes that cost 7h27m -- a crashed background gc, a stranded commit, and a pull path that could only refuse -- are each shut, along with the two gaps that closing them exposed (deploy-watch outside the lock; nobody owning the push of a stranded commit). Four Decisions rows record why, each with its own remaining open question rather than a clean bill of health.

**Notion:** Backlog: `verify_wins` row CLOSED (Done) -- no rows opened tonight remain open. Decisions +1 ("A game going final between two ESPN endpoints is not a data fault", Predictions / Ledger, Ashwin 2026-09-20), carrying the SETTLING_TEAMS_MAX bound as its open question. Data sources: the ESPN row already carries this quirk from earlier tonight, so it needed no edit. Scheduled jobs unchanged.


## 2026-09-20 (night, last +4) - mini -> windows and next session: mini_sync NOW FLUSHES WHAT IT REBASES. TAGGED COMMITS PUSH THEMSELVES, UNTAGGED ONES ALERT

Ashwin, on the gap the previous entry opened: "push tagged commits automatically and alert on untagged ones". Commit `755ee51d9`, `[vercel skip]`.

**The gap it closes.** Rebasing cleared the DIVERGENCE, which is what was breaking every job, but left the commit stranded -- quieter than a hard failure and worse in its own way, because data meant to be published could sit unpushed indefinitely with nothing alerting. `_mini_sync_note_unpushed` only said so into a log.

**The split is the `[vercel skip]` rule, and it is the whole design.** A tagged commit cannot trigger a build, so pushing it needs nobody's permission -- it is just finishing the job the committing runner started. An untagged commit IS a production build, which is Ashwin's call for that specific push, so this never pushes one; it alerts instead.

**All-or-nothing on the tag, and that is not tidiness.** Vercel reads the ignore rule from the PUSHED HEAD COMMIT ONLY (learned 2026-09-02). A mixed batch whose HEAD happens to be tagged would ship the untagged commit's changes with NO BUILD AT ALL -- silently. So one untagged commit anywhere in the range blocks the whole push. Scenario 11 in the harness exists specifically to hold that line: three commits, tagged / untagged / tagged, and it asserts origin stays untouched despite the tagged HEAD.

**The tag test is a deliberate quote**, character for character, of `.githooks/post-commit`'s own `case "$SUBJECT" in *"[vercel skip]"*)`. Two copies of one rule is the bug class this repo keeps finding (the hardcoded build-paths list in deploy-watch, the two divergent plists), so the comment says plainly: if the hook's definition changes, change this too.

**Alert dedupe, because the obvious version would be useless.** Every runner starts with `mini_sync`, so an unqualified alert would fire dozens of times a day for as long as the commit sat there, and be ignored by the second day. It keys on the short HEAD sha in `~/metro-mini-jobs/.mini-sync-untagged`: one alert per distinct state. The stamp is cleared when there is nothing unpushed, so a later recurrence alerts again. Delete the file and the next run re-alerts -- the intended failure direction.

**It cannot fail a job.** Every path returns 0. A push that does not go through (origin moved, no network) is a note, not a failure; the next job carries the commits. A self-heal that can kill a data job is not a self-heal.

**Verified: the harness is now 12 scenarios, 36 assertions, all passing**, still run against the text EXTRACTED FROM the shipped `_common.sh` rather than a draft. The five new ones: all-tagged pushes and reaches origin with no alert and no stamp; one untagged does NOT reach origin, alerts exactly once, writes the stamp; a second call on the same HEAD does not re-alert; the mixed batch pushes nothing; and diverged-plus-tagged both rebases AND pushes, ending level with origin with both sides' files present. Plus a live no-op on the real repo and a full `metro-rankings` dry run through it (exit 0, `guard verdict: pass`).

**Where tonight leaves the mini.** Every scheduled writer runs under one dispatcher lock; gc is off git's hands and has its own 03:00 slot that also sweeps stale locks; dispatcher.log rotates; the pull path self-heals a divergence and now flushes what it heals. The three failure modes that cost 7h27m today -- a crashed background gc, a stranded commit, and a pull path that could only refuse -- are each closed, and each closure is covered by tests that run from a self-test rather than from memory.

**Notion:** Decisions: the "pull path self-heals" row's Rule extended with the flush behaviour and its open question CLOSED. Backlog unchanged -- `verify_wins` in-progress-game skew (P2) is the last row still open from tonight, and Ashwin asked what ruling it wants; that answer is in the session, not yet in Notion. Scheduled jobs unchanged.


## 2026-09-20 (night, last +3) - mini -> windows and next session: mini_sync REBASES NOW. THE PULL PATH SELF-HEALS, WHICH IS THE ACTUAL FIX FOR TODAY'S 7h27m

Ashwin: "make mini_sync rebase instead of failing". The P1 filed at the start of tonight's triage, now shipped. Commit `f091a06ec`, `[vercel skip]`.

**What it was.** `git merge --ff-only` plus `fail "cannot fast-forward ... (resolve by hand)"`, no fallback. Every runner calls `mini_sync` as its first step, so ONE stranded bot commit -- `f5687d931`, left unpushed by the crashed gc at 14:17:50 -- diverged main by a single commit and hard-failed the entire mini for 7h27m, 7 of the day's 14 alerts, waiting for a human to type one rebase. The push path in the SAME FILE has auto-rebased on rejection for months and nobody has ever regretted it. The asymmetry was the bug, not the strictness.

**What it is now.** Fast-forward when it can; rebase our own commits on top when it cannot. It still refuses in four cases, each one deliberate rather than leftover:
- **0 ahead** -- nothing of ours to replay, so a rebase would hide whatever is really wrong (usually a dirty tree).
- **Dirty working tree** -- replaying commits underneath someone's half-finished output is not a safe thing to do unasked. Tonight that output was 775 restored files.
- **Past `MINI_SYNC_MAX_REBASE`** (default 50) -- the stranded-commit case is one or two. Dozens means a wrong branch or an unrelated history, and replaying it silently would turn a visible problem into an invisible one.
- **A conflict** -- `rebase --abort`, so the branch is left exactly where it was. Same outcome for the human as the old hard failure, minus any chance of finding the repo mid-rebase.

The original reasoning survives intact: refusing beats silently discarding, and a rebase discards nothing -- it replays.

**It does NOT push, on purpose.** Whether a given commit may reach origin is a tagging question (the `[vercel skip]` rule), not a sync function's call. So it clears the DIVERGENCE -- which is what was breaking every job -- and then says how many commits are sitting local, to ride out with the next job that commits, since `commit_paths` pushes HEAD.

**Verified against real git, not mocks.** A 7-scenario harness builds a real bare origin and clone per case: fast-forward, no-op, ahead-only, diverged-and-rebases, diverged-and-conflicts, diverged-with-a-dirty-tree, and over-the-limit. **16 assertions, all passing** -- and deliberately run against the text EXTRACTED FROM the shipped `_common.sh`, not against my draft, because those are not the same thing and only one of them runs tomorrow. The conflict case asserts the properties that matter: `rc=1`, HEAD byte-identical to where it started, no `.git/rebase-merge` left behind, working tree clean. Then a live no-op against the real repo, and a full `metro-rankings` dry run through the new code (exit 0, `guard verdict: pass`).

**Worth knowing:** `_common.sh` is a SYMLINK into the repo on the mini, so editing it in the checkout is live immediately, with no install step. That is why the whole thing was developed and proven in scratch repos first and only then written to the real file.

**🔴 The gap this leaves, and it is a real one.** Nobody owns PUSHING a stranded commit. mini_sync now clears the divergence but still will not push, so the commit sits local until some later job happens to commit. For a `[vercel skip]` bot commit that is harmless. For an UNTAGGED one it means data that was meant to trigger a build can sit unpublished indefinitely with nothing alerting -- quieter than tonight's failure, and therefore worse in its own way. Filed as the open question on the new Decisions row: should mini_sync push tagged commits automatically and alert on untagged ones?

**Notion:** Backlog: the `mini_sync` P1 row CLOSED (Done), with the four refusal cases and the verification recorded. Decisions +1 ("The mini's pull path self-heals", Infra / deploy, Ashwin 2026-09-20), carrying the unpushed-commit gap as its open question. Scheduled jobs unchanged -- no job's schedule moved. Still open in Backlog: `verify_wins` in-progress-game skew (P2), which still wants a ruling rather than code.


## 2026-09-20 (night, last +2) - mini -> windows and next session: dispatcher.log ROTATES NOW, 5 MB AND FIVE GENERATIONS

Ashwin: "add log rotation to dispatcher.log". The last loose end from tonight. Commit `26e6cd53b`, `[vercel skip]`.

**Why it mattered now.** The log had NO rotation and was 823 KB after roughly two months -- about 14 KB a day, which nobody would ever have noticed. Bringing deploy-watch under the dispatcher an hour earlier added ~430 lines a day on its own (RUN + one output line + DONE, 144 times), quadrupling the growth rate on a machine nobody logs into. Unbounded from there.

**`rotate_log()` in dispatcher.py.** 5 MB, five generations -- about 100 days per generation at the new rate, so well over a year of history retained, and 30 MB worst case on disk. Called ONCE per real tick, from inside the `try` that already holds the dispatcher's lock, so two dispatchers can never rotate at the same moment and neither `--dry-run` nor `--self-test` ever writes. When it fires, the first line of the fresh file says why it is fresh.

Three decisions worth keeping:
- **It renames, it does not truncate.** That is safe precisely because `log()` opens the file with `"a"` for every single line and holds no handle between calls -- the rename moves the old bytes aside and the very next `log()` recreates the file. Truncating would also work and would throw the history away, and the history is the only record of what the fleet did.
- **Oldest first, then shift up, then move the live file** -- in that order, so a crash midway leaves every surviving generation still correctly numbered instead of overwriting one.
- **It never raises.** Every `OSError` is swallowed and the tick carries on. A dispatcher that died because it could not tidy its own log would be a strictly worse failure than an oversized log.

**Verified, including against the real file.** Ten new self-test cases cover the threshold, the rename, the `.1 -> .2` shift, dropping the oldest past `keep`, and a missing file being a no-op. Then a live proof rather than a synthetic one: the real 823 KB `dispatcher.log` was copied to a temp dir, rotated with a low threshold, and came back byte-identical as `.1`, with `log()` recreating the live file immediately after -- which is the `open("a")` assumption above, demonstrated rather than asserted. On the mini it correctly does NOT rotate yet (0.79 MB against a 5 MB threshold) and a live tick runs clean. **Self-test 86 -> 111 cases across tonight's three changes, all green.**

A note on my own test-writing: I first compared two 2000-character strings in the generation checks, which passed but made the self-test output unreadable. Rewritten to compare a single marker character per generation, so the ordering check now reads `['b', 'a', 'z']` and actually tells you the shift chain is right. A test whose output nobody can read is most of the way to no test.

**Where the rotated files live:** `~/metro-mini-jobs/dispatcher.log.1` through `.5`, outside the git checkout, so nothing to gitignore.

**Notion:** Decisions: the gc ruling's open questions are now BOTH closed (deploy-watch under the lock; dispatcher.log rotating), leaving only the human-at-a-terminal case. Scheduled jobs: the deploy-watch row's log-volume note updated from a concern to a handled one. No new rows -- this changed no job's schedule. Backlog unchanged; `mini_sync` rebase fallback (P1) and `verify_wins` skew (P2) are still open and still want a ruling rather than code.


## 2026-09-20 (night, last +1) - mini -> windows and next session: DEPLOY-WATCH IS A DISPATCHER JOB. EVERY SCHEDULED WRITER OF THIS REPO NOW RUNS UNDER ONE LOCK

Ashwin: "bring deploy-watch under the dispatcher". Done, and it needed a new scheduling primitive to do honestly. Commit `baeb6d021`, `[vercel skip]`.

**Why it was the last gap.** `run-deploy-watch.sh` ran on its own launchd agent, `StartInterval 600`, doing `git fetch`, `git log` and -- on a re-trigger -- `git pull --rebase --autostash` plus a commit and push, every 10 minutes, OUTSIDE the dispatcher's lock. At 22:15 tonight that is exactly what raced the metro-rankings shadow run: the run's restore of `public/data` failed and left 775 files modified. Once gc was taken off git's hands earlier this evening, this was the only remaining way two SCHEDULED things could touch this index at the same moment.

**`every_minutes`, new in dispatcher.py.** The scheduler only understood clock slots (`time`, `times`). Ten-minute cadence as 144 `times` entries would have worked and been unreadable. So the interval is expanded inside `job_times()` -- the ONE pure function every scheduling decision reads its slots from -- and returns the same sorted `(hh, mm)` list it always returned. `previous_occurrence`, catchup, MISSED and `last_slot` are untouched and needed no changes. Validation makes it mutually exclusive with `time`/`times` and requires it to divide 1440 evenly, so the pattern is identical every day instead of drifting across midnight. **Self-test 86 -> 101 cases, all green.**

One of those new cases caught me rather than the code: I asserted that just after midnight an `every_minutes` job falls back to yesterday's last slot, the way a `times` job does. It does not, and should not -- such a job always owns a 00:00 slot, so there is always a slot just behind it. My expectation was wrong, the scheduler was right, and the corrected case now documents that property, which is also what makes a skipped tick harmless.

**The flip, done in the same change** as the house rule requires: `com.citizenofnowhere.deploy-watch` is UNLOADED, plist left on disk as the manual fallback, exactly as football-standings and the other migrated jobs were treated. Unloaded FIRST, then the row installed, so there was never a window with both live -- two copies would have fought over the same re-trigger cooldown in `.deploy-watch-state`.

**Verified live, not asserted.** `dispatcher.py --dry-run` showed `WOULD RUN deploy-watch (slot 21:30Z)`; a real tick ran it, `DONE deploy-watch: ok 2s`, output `up to date: TARGET 6d6a29447 is live`; `state.json` recorded `last_slot 21:30Z`, status ok. `build_argv` returns `/bin/bash hc-run.sh deploy-watch /bin/bash run-deploy-watch.sh` -- byte-for-byte what the plist ran, so the healthchecks tile keeps its pings unchanged. (`HC_PING_KEY` IS set; my first grep missed the `export ` prefix and briefly said otherwise.)

**The trade, stated because it is real.** On its own agent it ran every 10 minutes no matter what. In here a long job holds the lock -- mlb-sim can take 45 minutes -- so a tick can be skipped and a canceled build can sit un-healed that much longer. Acceptable because the script is threshold-based, not schedule-based: `STALE_MIN=20` decides what counts as canceled, `COOLDOWN_MIN=18` spaces retries, `MAX_ATTEMPTS=3` bounds them, so a late run sees a slightly staler build and does the same thing. It is NOT acceptable to coarsen the cadence much past 10 minutes, because it must stay well inside `STALE_MIN`.

**Two things now worth someone's attention.** (1) `dispatcher.log` gains roughly 430 lines a day from this (RUN + one output line + DONE, 144 times) and has **no rotation**; it is already 822 KB. (2) The lock now covers every scheduled writer, but NOT a human at a terminal -- a manual job run is still outside it, which is what collided at 22:15. Check the schedule before running a job by hand.

**Also explained, a loose end from earlier tonight:** the self-test case count differs by one between machines (86 vs 87 before, 100 vs 101 now) because `no NOT_DEPLOYED entry names a file that is gone` only runs from the repo checkout, not from `~/metro-mini-jobs`. Nothing is missing on the mini.

**Notion:** Scheduled jobs: the `Deploy watch` row rewritten as `deploy-watch`, Runs on launchd -> **Mac mini (dispatcher)**, with the every_minutes rationale, the live verification and the trade. Decisions: the gc ruling's open question CLOSED -- deploy-watch was the named gap -- leaving only the human-at-a-terminal case and dispatcher.log rotation. Backlog unchanged; the two rows from earlier tonight (`mini_sync` rebase fallback P1, `verify_wins` skew P2) are still open and still want a ruling.


## 2026-09-20 (night, last) - mini -> windows and next session: GC IS OFF GIT'S HANDS. ONE 03:00 SLOT OWNS IT, AND IT SWEEPS THE LOCKS TOO

Ashwin's ruling tonight, after the crash recurred mid-install: "apply gc.auto 0 and add the maintenance slot". Both done and verified. Commit `0689e3906`, `[vercel skip]`, no build path touched.

**Config on the clone, two settings not one.** `gc.auto=0` is what was asked for and it disables the gc TASK. But the lock that actually crashed twice is `objects/maintenance.lock`, which belongs to `git maintenance run --auto` -- the hook git 2.54 fires off the back of a commit, gated by `maintenance.auto` (default true), not by `gc.auto`. With only `gc.auto=0` that hook still runs and still takes the lock; it just finds nothing to do. So the clone now carries **both**:
```
gc.auto = 0
maintenance.auto = false
```
`maintenance.auto=false` is the one that actually stops the thing we kept finding dead.

**New job: `git-maintenance`, daily 03:00, `runners/git-maintenance.sh`.** 03:00 is the quietest slot in the day -- activity-feed (02:30, timeout 20) is done by 02:50, ops-autofix's 02:15 tick by 02:40, and nothing else runs until euro-comps at 04:00. Three things, in order:
1. **Stale lock sweep.** The recovery I did by hand twice today, automated. A lock is touched ONLY if it is older than 60 minutes AND no git process is running anywhere on the box. It is MOVED to `~/metro-mini-jobs/quarantine/` with a timestamp, never deleted, so a wrong call is recoverable. A lock younger than 60 minutes ends the run on the spot -- it may belong to a live git we cannot see. Sweeping anything fires an ntfy, because a stale lock means something crashed mid-write and that is the event worth knowing about.
2. **`tmp_obj_*` older than a day**, deleted. These are half-written objects from a crashed writer; a live one is seconds old. `git gc` only clears them once they pass `gc.pruneExpire` (two weeks), which is why EIGHT had piled up by tonight.
3. **The gc**, as `git -c gc.auto=6700 -c gc.autoDetach=false gc --auto`. The threshold is git's own default: `gc.auto=0` exists to stop git picking the MOMENT, not to abandon the threshold, so the slot re-applies it. `autoDetach=false` is the point -- it runs in the foreground, where a collision fails visibly instead of orphaning locks in a background process nobody is waiting on. That detach is the whole bug.

**It does not commit, does not push, and never calls `mini_sync`.** A janitor that refuses to tidy because the branch diverged is precisely the failure this job exists to clean up after.

**Verified 22:28, with planted fixtures rather than by assertion.** Dry run reported both a planted stale lock and a planted stale `tmp_obj` and changed nothing. The real run quarantined the lock, deleted the `tmp_obj`, left the EIGHT genuine `tmp_obj` files from today's two crashes alone -- correctly, they are under the one-day floor -- did a no-op gc at 288 loose objects, and left `fsck` clean and the tree untouched. Those eight are deliberately still there: tomorrow's 03:00 run is a live test of step 2, and if they are gone on Monday the job works.

**🔴 The remaining gap, and it is real.** `run-deploy-watch.sh` has its OWN launchd agent, runs every 10 minutes, and does real git including `pull --rebase --autostash` and a commit -- entirely outside the dispatcher's lock. So this slot is no longer self-inflicted, but it is not collision-proof. The runner therefore treats "another git holds the lock" as a SKIP, not a failure: gc is never urgent, and paging Ashwin at 03:00 because a fetch was in flight is worse than shrugging and trying tomorrow. But if deploy-watch itself crashes mid-write, a lock can now sit for up to 24h until the next sweep. Bringing deploy-watch under the dispatcher, or giving the two a shared lock, is the honest fix and is NOT done.

**Convention, still unruled.** I symlinked this runner, matching 11 of the 12 in `~/metro-mini-jobs/runners/`, so a `git pull` updates it. `metro-rankings.sh` is the lone real copy, because its build entry said "separate copy, not a symlink" in as many words. Two conventions now live side by side in one directory. Ashwin to rule; whichever way it goes, the loser needs changing, because a janitor that silently goes stale is worse than no janitor.

**Notion:** Scheduled jobs +1 (`git-maintenance`, Active, Ops / monitoring, with the why and the deploy-watch gap). Decisions +1 ("Git never runs its own maintenance on the rankings clone; one dispatcher slot owns gc", Infra / deploy, Ashwin 2026-09-20, open question = deploy-watch outside the lock). Backlog unchanged -- the two rows filed earlier tonight (`mini_sync` rebase fallback P1, `verify_wins` skew P2) are still open and still need a ruling, not code. Data sources unchanged.


## 2026-09-20 (night, later) - mini -> windows and next session: METRO RANKINGS IS INSTALLED AND ACTIVE (SHADOW); THE GC CRASH RECURRED MID-INSTALL AND IS NOW A PATTERN, NOT AN INCIDENT

Windows relayed that only two steps were left, "copy two files and one dry run". The build entry actually lists five, and steps 3 and 5 are real: the prerequisite check, and the Notion row. All five are done.

**Installed 22:20 BST.** `jobs.toml` copied to `~/metro-mini-jobs/`; `runners/metro-rankings.sh` copied (NOT symlinked) and `chmod +x`. `dispatcher.py --self-test` OK. `DRY_RUN=1 runners/metro-rankings.sh` exit 0, `guard verdict: pass (rc=0)`, `unmatched metros: 3` (the calamine baseline -- 215 would have meant the adapter was on the wrong code path), `public/data` restored, nothing committed, clean tree. Scheduled jobs row set Active. First real run Sat 2026-09-26 10:30 UTC in shadow.

**Prerequisites, step 3, all satisfied but not as written:** the venv has `openpyxl` 3.1.5. `python_calamine` is NOT installed and is NOT needed -- `open_workbook.py` imports it only on the non-Supabase branch, and the runner sets `METRO_WORKBOOK_SOURCE=supabase`. `MKTCAP_SUPABASE_KEY` is absent from `~/.config/metro-supabase/env`, but `SUPABASE_SERVICE_KEY` is there and `metro-rankings.sh` lines 99-100 map it across, exactly as the entry claimed. Nothing to install.

**A mistake, made and undone.** I first symlinked the runner into the repo, because all ELEVEN sibling runners in `~/metro-mini-jobs/runners/` are symlinks and a lone real file will not track a `git pull`. The Backlog row says "separate copy, not a symlink" in as many words. That is explicit, so I reverted to a copy and re-ran the dry run against it (exit 0, guard pass). Convention and instruction genuinely disagree here and the disagreement is now the only thing standing between a runner edit and a silently stale mini -- Ashwin to rule which way `runners/` goes. The self-test reports 86 cases, not the 87 the build entry predicted; `dispatcher.py` on the mini is byte-identical to the repo's, so that is a count from the Windows environment, not a missing piece.

**🔴 THE GC CRASH RECURRED, 22:15, and this is the important part.** Same signature as 14:17:50: `index.lock`, `HEAD.lock`, `objects/maintenance.lock`, this time with a 1.7 MB `next-index-6.lock`. It landed while a mini job committed `0880b185a` and my dry run was restoring `public/data`. Consequences: the shadow restore FAILED, leaving **775 modified files** in the tree, and `0880b185a` was left unpushed -- the exact stranded-commit shape that cost 7h27m earlier today, forming again within six hours. I cleared the locks (no git process was running; backed up, not deleted), completed the restore by hand, and pushed `0880b185a`.

Twice in eight hours is a pattern. `gc.auto`, `gc.autoDetach` and `maintenance.auto` are all UNSET here, so git 2.54 takes its defaults: auto-gc fires off the back of a commit and **detaches into the background**, where it races whatever git command the next job runs and dies holding three locks. This repo commits from a dozen scheduled jobs all day, so it will keep happening. `.git/objects` now holds EIGHT `tmp_obj_*` garbage files, one pair per crash. **Recommended (not done, Ashwin's call): `git config gc.auto 0` on this repo and run `git maintenance` from a dispatcher slot at a quiet hour, or at minimum `git config gc.autoDetach false` so a gc that collides fails in the foreground instead of orphaning locks.** Also worth noting for anyone running a job by hand: the dispatcher can fire mid-run, and that is what collided tonight -- check the schedule before a manual run.

**Notion:** Scheduled jobs: `metro-rankings` Disabled -> **Active**, notes rewritten with the verified install and the symlink-vs-copy question. Backlog: the phase 2 row retitled and its Needs rewritten -- install struck off, shadow-two-Saturdays and the cutover remain, owner Mac mini. Decisions: none new (the runners/ convention and the gc config are both Ashwin's to rule). Data sources unchanged.


## 2026-09-20 (night) - mini -> next session and windows: TODAY'S 14 ntfy ALERTS WERE ONE STRANDED COMMIT; A CRASHED GC LEFT THREE LOCKS; `mini_sync` HAS NO REBASE FALLBACK

Triage of every ntfy message dated 2026-09-20. Fourteen alerts, one systemic cause, two racy-but-healthy jobs. Nothing left red.

**The chain.** 14:17:44 the business job committed `f5687d931` (leader QID, Bank of China). Six seconds later, 14:17:50, a git gc/maintenance pass took `index.lock`, `HEAD.lock` and `objects/maintenance.lock` and died without releasing them — `.git/objects` still held two `tmp_obj_*` files, the signature of an interrupted object write. The commit never pushed and sat local-only. From then, every job that calls `mini_sync()` failed: it is `git merge --ff-only` with `fail "cannot fast-forward ... (resolve by hand)"` and **no rebase fallback** — while the PUSH path in the same codebase auto-rebases on rejection (football-standings did exactly that at 21:56:50 tonight). One stranded bot commit reds the whole fleet until a human turns up. 7h27m today.

**Fixed:** the three stale locks moved aside (backed up, not deleted), `git pull --rebase` (local 1 / remote 7, zero overlapping files — checked before rebasing), pushed `3fd6a6061`. Tree clean, in sync.

**The 14, by cause:**
- **7 = the chain above.** `cannot fast-forward` at 15:18 / 15:38 / 17:19 / 19:20, plus football-standings ALERT at 18:09 / 19:20 / 21:21. Re-ran football-standings tonight: exit 0, bundles pushed.
- **4 = mlb-sim `job_failed`, then its 3/day autofix cap.** Not a code bug. `verify_wins()` in `build_mlb_sim.py` is an exact-equality gate against ESPN standings and at 07:09 read `Cardinals 75 vs 76`. ESPN's standings endpoint increments the moment a game goes final; the per-team schedule endpoint's `completed` flag lags a few minutes. Reproduced live tonight — the same parse gave 75 at 21:49 and 76 at 21:52. The 21:58 run is `wins: verified against ESPN standings (30/30 teams)`. 09-16 failed the same way and self-healed on its next slot. I did **not** touch the gate: it is the reason the model is trustworthy and the runner header says never route around it.
- **2 = ops-autofix "stood down -- uncommitted work"** (11:15, 13:18). A dirty tree it refused to act through. Clean now.
- **1 = refresh "2/16 best-effort steps errored"** (10:25): `leaders (auto-apply)` and `uk offices (check)`, both transient Wikidata. Re-ran tonight: uk offices `current holders unchanged in all 8 offices`; leaders exit 0, 204 countries, 6 changed (nigeria, kazakhstan, estonia, mauritius, madagascar, malawi). I **reverted** those 6 rather than commit them — `public/data/leaders/_changes.json` is on `scripts/refresh-needs-build-paths.txt`, so that commit is build-triggering and needs Ashwin's word. They re-apply at the next 09:00 egress-refresh.

**Open for Ashwin (two):**
1. `mini_sync()` should rebase, or at least retry once, instead of `fail ... resolve by hand`. The push path already proves the pattern is safe here. As it stands, any unpushed local commit is a fleet-wide outage with no self-heal.
2. `verify_wins()` could tolerate a one-team, one-game skew (or retry after a few minutes). The season-sims self-test already tolerates exactly this — `gp ahead of remaining+records by 1, consistent with an in-progress match -- proceeding`. verify_wins does not, so an in-flight game is a guaranteed red at the 07:00 and 14:30 slots.

**Two mistakes worth recording.** I first reproduced the leaders step with plain `python3`, got `ModuleNotFoundError: No module named 'requests'`, and nearly filed that as the bug — the jobs use `PYTHON_BIN="$REPO/.venv/bin/python"`, which has requests 2.34.2. Repro a step with the job's interpreter, never the shell's. And a bulk `git diff --quiet -- $NEEDS_BUILD_PATHS` answered "no build needed" when `_changes.json` **had** changed; the per-path loop was right. Check needs-build paths one at a time before concluding a commit can be tagged `[vercel skip]`.

**Left alone deliberately:** `.autofix-attempts.json` still shows mlb-sim at its 3/day cap (resets at midnight; the job is green now). Two `tmp_obj_*` garbage objects remain in `.git/objects` — harmless; `git prune` clears them when no job is running. I did not run gc while jobs were live, since that is what started this.

**Notion:** Backlog +2 (`mini_sync()` should rebase or retry, P1, owner Ashwin; `verify_wins()` hard-fails on an in-progress game, P2, owner Ashwin — both need a ruling, not code). Data sources: the ESPN row gains a quirk, STANDINGS LEAD THE SCHEDULE ENDPOINT, with the measured times. Scheduled jobs unchanged — no job was created, moved, disabled or retired tonight. Decisions: none new (I made no ruling; both are Ashwin's).


## 2026-09-20 (late) - windows (Cowork, cloud bridged to the Windows box) -> next session and mini: METRO RANKINGS PHASE 3, THE WINDOWS WATCHER IS INSTALLED; ONE PHASE 1 FIX HAD NEVER REACHED GIT; SUPABASE IS ON PRO

**Rulings today (Ashwin, all in Notion Decisions):** a workbook edit goes live with the Saturday run, never at once; the publish guard keeps its default thresholds; `build-states-directory.py` owns `public/data/state-metro-scores.json` (`build-state-metro-scores.py` now writes `state-metro-scores.weighted-experiment.json`, which the site does not read).

**Supabase moved to Pro** (verified through the API: plan `pro`). The 500 MB read-only risk is closed: 8 GB included, 439 MB used. Compute still shows the free-plan settings (60 connections, 224 MB shared buffers); Nano bills at the Micro price in a paid org, so Ashwin should move it to Micro in Settings, Compute and Disk, outside Saturday 09:00 to 11:00 UTC.

**The watcher (Scheduled jobs row: Active):**
- Task Scheduler task `Metro workbook sync watcher` on AshGaming, every 15 minutes while logged on plus at logon, current user, no elevation. `scripts/metro_sync/install_watcher_task.ps1` installs it; `-Uninstall` removes it.
- `scripts/metro_sync/watch_workbook.ps1`, one tick: exits silently when the OneDrive master has the stamp it last handled; waits if Excel has the file open or it was saved under 180 s ago; else `sync_workbook.py --json` dry, then `--write` only if no guard held. Alerts by Windows toast, and by ntfy if `%LOCALAPPDATA%\metro_sync\config.env` holds `NTFY_TOPIC=` (not set today). A hold or an error alerts once per save. It writes Supabase only: never git, never `public/data`, never a build.
- Proven on this machine: a no-change tick and a silent repeat; a copy of the workbook with ONE shared string changed gives `Municipality: 133584 -> 133584, 1 chunks`; a workbook missing its sheets is held, alerts once and does not re-alert; one tick through the scheduler, result 0, logged `no_change`. NOT exercised: the `--write` leg inside the watcher. It is the same CLI call that loaded the mirror by hand, and a failure alerts.

**Three faults the live runs found:**
1. 🔴 The phase 1 Windows fix to `sync_workbook.py` (close the `mkstemp` descriptor, tolerate the temp unlink, no `utcnow`) NEVER reached the repo. Commit `7ae9c1aed` carried the unfixed file; the 09-20 evening entry's claim that it was fixed was true of my workspace and false of git. Cause: re-sending a file to this machine under a name already sent once can deliver the EARLIER bytes. It is in this commit now, and every file sent since was checked by sha256 on the Windows side. The mirror itself was unaffected: the fault fired after the write, at temp cleanup, and exit 1 was the only symptom.
2. PowerShell turns a one-line pipeline result into a string, so `$lines[$lines.Count - 1]` returned the character `{` and the watcher called valid JSON unparseable. Wrapped in `@()`.
3. A lock file `~$MetroAreas.xlsx` dated July 2025 sits in the OneDrive folder. The watcher now uses the rule `sync_workbook.py` already had: a lock file counts only if it is at least as new as the workbook.
Not a fault: files this session's shell writes under `%LOCALAPPDATA%` land in the desktop app's private copy of that folder, so its `watch.log` and the scheduler's were two different files for a while. The scheduler's is the real one.

**Still open:** the mini install of `metro-rankings` (evening entry, five steps); two clean shadow Saturdays, then the cutover; Municipality row 93191 (`Utqiag_x001A_vik city`) for Ashwin to retype, which will be the watcher's first real write.

**Notion:** Scheduled jobs +1 (`Metro workbook sync watcher`, Active). Decisions +3 (edit timing; guard thresholds; owner of state-metro-scores.json). Backlog: phase 3 row Done; two-writers row Done; Supabase free plan row Done.


## 2026-09-20 (night) - windows (Cowork, cloud bridged to the Windows box) -> MINI (action needed) and next session: METRO RANKINGS PHASE 2 BUILT, THE WEEKLY JOB IS IN THE REPO IN SHADOW MODE AND NOT YET INSTALLED

Phase 1 went to main as `7ae9c1aed` on Ashwin's word. This entry is phase 2: the job that recalculates the rankings every Saturday with no workbook and no person.

**In this commit (all `[vercel skip]`, no build path touched):**
- `mac-mini-jobs/runners/metro-rankings.sh` : sources `_common.sh`. Steps: `mini_sync`; three self-tests (sync shim, publish guard, score parity); `METRO_WORKBOOK_SOURCE=supabase extract.py`; revert `quiz_queue.json`; `build-states-directory.py` from the mirror; the publish guard; then by `METRO_RANKINGS_MODE`: **shadow (default)** restores every output and commits only `mac-mini-jobs/reports/metro-rankings-<date>.md` tagged `[vercel skip]`; **publish** runs `check-slug-drift` and commits the literal output paths UNTAGGED, which is the weekly build. A hold restores the outputs, commits the report tagged, and `fail`s with the first reason so the alert names it. `DRY_RUN=1` commits nothing in any mode. The restore touches only this job's own paths, never a blanket `git checkout -- public/data`, so it cannot wipe another job's uncommitted output.
- `scripts/metro_sync/publish_guard.py` : seven rules, each a constant with an env override `METRO_GUARD_<NAME>`: metro count falls; a slug disappears; an old top-100 metro moves more than 10 places; a score moves more than 3.0; total market cap moves more than 15 percent; zero-score metros rise by more than 50; fewer than 1,000 metros or a parse failure. Exit 0 pass or no_change, 20 held. `--self-test` 12 cases.
- `scripts/metro_sync/open_workbook.py` : lets the two calamine readers (`build-states-directory.py`, `build-state-metro-scores.py`) run from the mirror. Calamine and openpyxl disagree on three things, measured cell by cell: empty is `''` not `None`, every number is a float, an error cell is `''`. The adapter converts, and decodes OOXML `_xHHHH_` escapes. After the fix: Municipality, Counties, States and Metro Areas match calamine exactly, value and type. Before it the JSON was already byte-identical but one builder logged 215 unmatched metros against 3, so identical output had hidden a different code path.
- `mac-mini-jobs/jobs.toml` : `metro-rankings`, Saturday 10:30 UTC, after `mktcap-refresh` (09:00, timeout 20). `dispatcher.py --self-test` 87 of 87.

**Measured:**
- Real Supabase REST, end to end, from the Windows box: `extract.py` 11 s on a warm chunk cache, `metros.json` sha256 `0cc06c867e8d5036...`, identical to the offline mirror run; guard `pass`; 774 files differ from HEAD (718 metros move, largest move 40 places, Carlsbad NM 3617 to 3657; total market cap down 0.45 percent). That difference is the update the site is waiting for. Every file was restored; nothing was published.
- Two mirror-fed runs give the same `metros.json` hash. The run is deterministic.
- Offline runner proofs (fake mini dir, local bare remote): dry run clean in both modes; forced hold exits 1, restores, names the reason; a live shadow run commits the report file only, subject tagged.

**MINI, to install (nothing runs until this is done; the dispatcher reads `~/metro-mini-jobs`, not the repo):**
1. `git pull --ff-only`
2. `cp mac-mini-jobs/jobs.toml ~/metro-mini-jobs/ && cp mac-mini-jobs/runners/metro-rankings.sh ~/metro-mini-jobs/runners/ && chmod +x ~/metro-mini-jobs/runners/metro-rankings.sh`
3. Confirm the venv has `openpyxl`, and that `~/.config/metro-supabase/env` exports `MKTCAP_SUPABASE_KEY` (the runner also maps `SUPABASE_SERVICE_KEY` onto it).
4. `python3 ~/metro-mini-jobs/dispatcher.py --self-test`, then `DRY_RUN=1 ~/metro-mini-jobs/runners/metro-rankings.sh`. Expect `guard verdict: pass` and a clean tree.
5. Set the Notion Scheduled jobs row `metro-rankings` from Disabled to Active.

**Cutover rule (not now):** after two clean shadow Saturdays, set `METRO_RANKINGS_MODE=publish` AND remove the `update_top_companies` step from the tail of `run-mktcap-refresh.sh` IN THE SAME CHANGE. Both are untagged Saturday commits; together they spend the whole daily build budget. Open at cutover: `check:release-notes` wants a `lib/releases.ts` entry for a day with an untagged `public/` commit, and the existing Top Companies commit already has that gap.

**Not done:** phase 3, the Windows Task Scheduler watcher. `relocations` reads the league workbooks, not MetroAreas, and is out of scope. `build-state-metro-scores.py` is switched to the mirror but NOT run by the job: it writes the same file as `build-states-directory.py` with different arithmetic (Backlog row, Ashwin to rule).

**Notion:** Scheduled jobs +1 (`metro-rankings`, Disabled until installed). Backlog: phase 2 row rewritten as the install and cutover, owner Mac mini; +2 (two writers of state-metro-scores.json; the Utqiagvik control character in Municipality row 93191). Decisions: none new.


## 2026-09-20 (evening) - windows (Cowork, cloud bridged to the Windows box) -> mini and next session: METRO RANKINGS GO WORKBOOK-FREE, PHASE 1 OF 3 (MIRROR LOADED AND PROVEN; NOTHING COMMITTED, NOTHING SCHEDULED)

Ashwin's ask: stop rebuilding the site by hand each week. MetroAreas.xlsx syncs to Supabase, the rankings calculate from there, and he edits the workbook only now and then. Four rulings, all by multiple choice: scope = all 15 sheets extract.py reads; truth splits by data type (workbook wins curated sheets, Supabase wins feeds, so MktCap_Data is NOT mirrored); the site keeps reading public/data and a job makes one build a week; workbook edits reach Supabase through a Windows watcher.

**Built (in the working tree, UNCOMMITTED, no build-relevant path touched):**
- `scripts/metro_sync/` : `sync_workbook.py` (dry run default, `--write`, `--self-test`, `--json`; guards: Excel lock file, 120 s settle, shrink over 2 percent or 50 rows, error cells up by more than 10, Metro Areas header change, BG blank on over 1 percent of rows, missing sheet; exit 0 / 10 written / 20 held / 1 error), `supabase_workbook.py` (a shim with openpyxl's `sheetnames` / `iter_rows` surface, local chunk cache in `.cache/metro_sync`, serves MktCap_Data from `scripts/mktcap/out/mktcap_export.csv`), `codec.py`, `backends.py` (REST and `file:<dir>`), `parity_cells.py`, README. `scripts/tests/test_metro_sync.py` (22 cases).
- `scripts/extract.py` : `METRO_WORKBOOK_SOURCE=supabase` runs the whole ETL with no workbook on disk. Default is unchanged. In that mode the display dims AQ to BF come from the score engine, not the cached cells, and `meta.lastUpdate` is the newer of the workbook save and the mktcap snapshot.
- Supabase migration `create_workbook_mirror_tables`: `wb_sheet` (written last; `content_hash` is the commit marker), `wb_chunk` (500-row jsonb windows), `wb_sync_run` (service role only). Chunked because the project is on the FREE plan at 439 of 500 MB.

**Measured, not inferred:**
- First live `--write` from the Windows box: 15 sheets, 459 chunks, 221,404 rows, 45 s, 9.8 MB in Postgres. Second run: no change, exit 0, so the hashes survive real jsonb normalisation.
- `parity_cells.py --backend rest` against the OneDrive master: 15 of 15 sheets, zero mismatches, value AND type per cell.
- Offline end to end (clone of origin at `a45994f`, workbook renamed away for the mirror run): 777 files written each way, 774 byte-identical. The three: `quiz_queue.json` (unseeded RNG, differs on any two runs), and `metros.json` + `details/crewe.json` on one field, Crewe marketCap 1070000000.0000001 against 1070000000.0, float addition order. Fixed by rounding AU to cents in `patch_metro_derived` and re-run: 776 of 777 byte-identical, `quiz_queue.json` the only difference.
- Two faults only the live run could find, both fixed: PostgREST rejects an epoch float for a timestamptz (conversion now lives in `RestBackend`), and `mkstemp` leaves an open descriptor that blocks the temp unlink on Windows.

**Not done:** phase 2, the mini's weekly job (it must REPLACE the `update_top_companies` commit in `run-mktcap-refresh.sh`, or Saturday spends both builds; shadow two Saturdays first). Phase 3, the Task Scheduler watcher. No scheduled job was created or changed today. The metro-join builders (states, similar, relocations) were not checked for workbook reads.

**Notion:** Decisions +2 (workbook-free metro rankings; positional chunked mirror). Backlog +3 (phase 2 mini job; phase 3 Windows watcher; Supabase free plan at 439 of 500 MB, owner Ashwin). Scheduled jobs: none changed.


## 2026-09-19 (late) - windows (Cowork, cloud bridged to the Windows box) -> mini and next session: THE RELEASE IS LIVE (`778734ced`), FOURTH PAID BUILD OF THE DAY, ON ASHWIN'S WORD

Ashwin: "Commit and push everything to main". That is the explicit yes, given knowing three builds had run. The scheduled 00:10 UTC push was deleted unused.

- `git pull --rebase` replayed the nine local commits onto `49aa53f00`; the SHAs in the two entries above are PRE-REBASE. On origin: forecast hubs `43077db72`, NBA vs Last `43f298303`, NBA weekly seeds `341bb9f0f`, NFL honours `4db7dba60`, subscribe path `eb3c0f8e9`, check:cache-tags `7f58ffc06`, release `778734ced` (HEAD of the push, no skip marker).
- Before the push: `npm run verify` EXIT 0 end to end (typecheck, every check, 339 JS tests, 112 Python tests, build, function size). `probe-mobile` at concurrency 1 on a local production build: `/` 17.7 screens, `/digest` 5.6, `/teams/nfl/season/1980` 13.4, `/teams/nba/season/2001` 9.3, `/deep-dives` 6.1; 5/5 clean at 390px. The homepage was 16.5 on 09-13.
- Deployment `dpl_CqZBtiATwpcPkWsCNrXo5WphB5J9`: BUILDING 20:40 UTC, READY by 20:48. **Builds on 2026-09-19 UTC: FOUR** (09:06 mktcap weekly, 11:33, 13:05, 20:40). The cap is still inactive.
- Verified on production from fresh fetches (`x-vercel-cache` PRERENDER or MISS, age 0; `/updates` HIT at age 8 and already carrying the new entry): the NFL headline reads "The Buffalo Bills have a 10.8% chance to win Super Bowl LXI, up 1.6pp over 7 days"; heat board, movers strip, the PL headline, the NBA 2000-01 page, "Houston Oilers" on the 1980 NFL honours, the subscribe card on `/` and `/digest`, and Writing on Deep Dives are all present.
- The release note is dated 2026-09-20 and went live at 21:48 BST on the 19th. It was written for a push after midnight and left as it was rather than squeezed into the 19th's full four bullets.
- Ashwin ruled the NBA honours badges stay as built: they follow the scrub.
- Not proven: a real flush of `nba-elo` or the seven new tags. This box has no `REVALIDATE_SECRET`. **Mini: flush `nba-elo` one time and confirm `ok:true`.**

**Notion:** Backlog closed 2 (forecast hubs, nba-elo tag inert); Scheduled jobs: the one-off "Push the 2026-09-20 release" row added and then set to Retired, never fired.


## 2026-09-19 (night) - windows (Cowork, cloud bridged to the Windows box) -> mini and next session: ONE RELEASE QUEUED ON LOCAL MAIN (NOT PUSHED), SEVEN UNFLUSHABLE CACHE TAGS, A WORKBOOK FAULT IN THE NFL AWARDS SHEET

Nothing pushed, no paid build. Local `main` carries the whole release as a stack of commits; the LAST one is build-relevant and holds the `lib/releases.ts` entry dated 2026-09-20. **To ship: `git pull --rebase`, confirm `git log origin/main..HEAD --format=%s | head -1` has no `[vercel skip]`, push after 00:00 UTC so it counts against 20 September.** If a job commit lands on top first, the release commit must be moved back to the top or the build never runs (2026-08-18 and 2026-09-04).

### A. What the release holds

- **Forecast hubs** (section B of the evening entry), cherry-picked onto main as `7a1943368`. The local branch `feature/forecast-hubs` and the worktree `C:\Users\ashwi\wt-forecast` are leftovers to remove.
- **NBA season hubs, Ashwin's four asks.** "vs Last" reads against last WEEK on a scrubbed week and against last YEAR on the final standings. Weekly playoff seeds (`weeklySeeds.ts`): record and division-leader rules only, ties to the eventual higher seed, numbers only for teams in a playoff or play-in place, and nothing until EVERY team has played `MIN_GAMES_FOR_SEEDS` (5). The date is stated on the control, on the chart's scrub line and above the table. The control sits between the chart and the table. The honours badges follow the scrub too.
- **NFL season hubs gain "The honours"**: that year's award winners and every All-Pro pick, under the ERA name of each club (1980: Houston Oilers, Oakland Raiders). `pro-bowl-counts.json` is a per-franchise CAREER count with no year, so there is no Pro Bowl block and none was invented.
- **Subscribe path**: `app/_shared/SubscribeCta.tsx`, an outbound Substack link (no form, no data kept), after the digest module on `/` and before the sources card on `/digest` and `/digest/[date]`. "Writing" joins the About menu, pointing at `/deep-dives#writing` (the Deep Dives group is at its 10-item cap).

### B. The seed era table, and where the evidence runs out

Confirmed against the stored final seeds: 1947-70 record; 1973-77 record; 1978-2006 division leaders on top; 2007-15 leaders guaranteed the top four; 2016 on record. Golden test 152 of 157 season-conferences; the five misses are named in `KNOWN_SEED_MISMATCHES` (1948 W, 1956 E, 1969 W, 1976 W, and 2023 E where a play-in game put Miami above Atlanta). **2016 and 2017 reproduce under both of the last two rules**, so that boundary comes from the NBA's rule change, not from the data; 1975-77 reproduce under all three. On a scrubbed week the rules differ, so a wrong boundary is invisible to the golden test. Worth one source check.

### C. 🔴 Seven data tags could never be flushed (the nba-elo fault, seven more times)

New gate `npm run check:cache-tags` (in `verify`): every `tags: [...]` on a fetch in `lib/` or `app/` must be in `ALLOWED_TAGS` or named in the script's `UPSTREAM_ONLY` with a reason. Its first run FAILED on `club-value`, `club-money`, `expectation`, `nfl-expectation`, `pl-expectation`, `intl-expectation` and `footy-finals`: all GitHub-raw reads that answer "unknown tag" to a flush. All seven are now listed; five ESPN and SPAIA upstream caches are exempt by name. **Listing makes a tag flushable, it does not make any job ping it.** `footy-finals` matters this week: the AFL Grand Final result will otherwise wait out its 15 minute window, which is fine, but the expectation files wait 24 hours. Inert until the build lands, like `nba-elo`.

### D. 🔴 Workbook fault: St. Louis Cardinals All-Pros are filed under the Rams

`public/data/nfl/award-winners.json` (from the Awards sheet, canonical in column J): 301 All-Pro rows sit under `Rams` for 1960-87 and ZERO under `Cardinals` in those 28 seasons. Dan Dierdorf, Larry Wilson, Jackie Smith, Roger Wehrli and Conrad Dobler all read as Rams. Single-winner awards are filed correctly (1979 Ottis Anderson, Cardinals), and the other relocations probed are right (Unitas Colts, Long Raiders, Moon Titans, Fouts Chargers). It looks like a "St. Louis" lookup resolving to the Rams on the All-Pro rows only. It is PRE-EXISTING on the Rams and Cardinals team pages. The new season section shows player and position only for `All-Pro` + `Rams` + 1960-87, because a wrong club is worse than none; the guard is a no-op to delete once column J is fixed and the file rebuilt.

### E. Midterms map: what the forecast file can and cannot feed

`forecast.json` `us.senate.competitive` (6 races) and `us.governors.competitive` (8) carry `state`, `held`, `pDem`; the other races have no per-state probability in the file. A battleground board can be built today. A full tinted map needs `scripts/forecast` to emit every race, which is a builder change and a first dry run.

### F. Gates

tsc clean; vitest 339 passed in 28 files; `next build --webpack` compiled; check:function-size OK (largest 138.4 MB); check:release-notes OK (newest 2026-09-20); check:cache-tags OK (24 tags, 19 flushable, 5 upstream-only). Probe at 390 and 1280 for the forecast hubs is in the evening entry; the NBA season page measured 390/390 and 1280/1280 with the control in its new place. NOT run: `npm run verify` end to end, `test:python`, and `probe:mobile` on `/`, `/digest` and the NFL season page. Run the probe on those three before the push.

**Notion:** Backlog closed 4 (subscribe path, Writing in the nav, cache-tag check, NFL year hubs: awards done and the Pro Bowl half impossible from a career file); Backlog edited 2 (midterms map: data finding; forecast hubs: now on local main); Backlog added 3 (Awards sheet column J files St. Louis Cardinals All-Pros under Rams; refresh jobs should ping the seven newly flushable tags; confirm the 2016 and 1975-77 seed-rule boundaries from a source); Decisions added 2 (NBA weekly seeds ruling; subscribe path is an outbound Substack link).

## 2026-09-19 (evening) - windows (Cowork, cloud bridged to the Windows box) -> mini and next session: FORECAST HUBS BUILT ON A LOCAL BRANCH (NOT PUSHED), NOTION RECONCILED, THREE PAID BUILDS TODAY

No paid build from this session. Nothing on main changed except this entry.

### A. Build count, and a correction to section O

Vercel `list_deployments` for 2026-09-19 UTC: THREE READY production builds, 09:06 `dda64bbb1` (the Saturday "mktcap: weekly Top Companies refresh", untagged by design), 11:33 `80e1d5671`, 13:05 `d2c3f82e6`. Section O names the first build as `18eb6a0cd`; that build ran on 2026-09-17 11:06. The Saturday mktcap commit takes a slot every week, so Saturdays have ONE spare build, not two. The cap is still inactive (`VERCEL_BUILD_CAP_TOKEN`, Ashwin's P0 row). 2026-09-13 had seven builds and 2026-09-15 had four.

### B. Forecast hubs package: local branch `feature/forecast-hubs`, commit `b5b46f601`, NOT pushed, NOT on main

Ashwin asked for a competitive read of prediction.com, Underdog and Carlo De Marchis's YouTube Football Tracker, then chose this package first and ruled "build locally, hold the push". Order for the rest: midterms map, sign-in gate, daily data recap.

- `app/predictions/_shared/ForecastHeadline.tsx`: one sentence above the first board of every hub ("The Buffalo Bills have a 10.8% chance to win Super Bowl LXI"), 7-day change from the sim-history file, sparkline, one MONO context line. UCL has no history file, so no movement row there.
- `app/predictions/_shared/HeatBoard.tsx`: generic group / column / tile board on the `--seq` tokens; NFL hub gets 8 divisions by 4 teams in a Disclosure plus a HubNav chip. Tint steps 10 to 45 percent; a stronger `--seq-5` mix drops `var(--text)` below 4.5:1 (3.7:1 at 60 percent).
- `app/predictions/_shared/Movers.tsx`: largest 7-day title swing per league on `/predictions`.
- Every hub's `PredHeader sub` is now one reading-key clause under 20 words; the method text already stands in each page's sources section.

Measured on a production build served locally, `probe-mobile` at concurrency 1: `/predictions` 4.8 screens (4.3 on 09-03), nfl 3.7 (3.4), cfb 3.8 (3.6), mlb 2.6 (2.3), pl 2.8 (2.5), ucl 2.7 (2.5); 6/6 clean at 390px. tsc clean, `next build --webpack` compiled, check:mobile, check:sortable, check:table-scroll, check:client-imports, check:data-reads OK. NOT run: vitest and the full `npm run verify` (run it before the merge).

**To ship:** on Ashwin's yes, merge the branch into main with the `lib/releases.ts` entry for the shipping day IN THE SAME COMMIT, as the LAST commit of the push. That build also makes the `nba-elo` revalidate tag live (section R).

**Why a branch and not a dirty tree:** this clone has `pull.rebase` set, so `git pull --ff-only` refuses with "cannot pull with rebase: You have unstaged changes". Six modified files blocked every pull on this box. The work was committed on a new local branch and main switched back clean. A non-main branch without `[preview]` does not build, so a later push of the branch is free.

### C. Notion had drifted inside one day of the contract

Sections J, L, Q and R each end with a `**Notion:**` line that names Backlog rows. A query of rows created on 2026-09-19 found NONE of six: the Hundred strand conflict, the cricket `is_current` producer, footy_finalize anon (add and close), the NBA.xlsx source fix, the inert `nba-elo` tag, the cache-tag check. Two rows stayed open that the entries closed ("NBA Elo: 2 of the 2024 team-seasons", "Formula E data is overdue"). `cricket-champions` had no Scheduled jobs row. The reverse also occurred: the `BUILT_DATE` fix (`3586981f0`) is Done in Notion and has no HANDOFF record.

The pre-commit hook proves that the line exists. It does not prove that the writes happened. A session that loses the Notion connector after it wrote the line leaves a false receipt. Cheap guard worth a row: the reconciler should compare each `**Notion:**` line with rows created that day.

**Notion:** Backlog closed 2 (NBA Elo 2024 pair, Formula E overdue); Backlog added 11 (NBA.xlsx source fix, nba-elo tag inert, cache-tag check, CPL first-promotion watch, Hundred honours row, forecast hubs [In progress], midterms map, sign-in gate, daily data recap, model-against-market board, small items bundle); Scheduled jobs added `cricket-champions` (not yet verified against the live jobs.toml); Decisions added "The champions tables are read with the service key".

## 2026-09-19 — mini → next session: the NPB score fields were the WRONG ONES; yesterday's NPB results never existed

### A. NPB read HScore/VScore, which are always null

Shipped yesterday in `8ea042238` and wrong on arrival. Noticed because Recent results carried **zero** NPB rows the
morning after, while On today carried six.

`HScore` and `VScore` are present on every SPAIA row and **null on every SPAIA row**, including a finished game. The
live score is `H_Score_R` / `V_Score_R`. Measured 2026-09-19 on a completed game: `HScore=null, VScore=null,
H_Score_R=4, V_Score_R=7`. So `final` was permanently false and NPB could never produce a result at all.

**Completion is `GameStateID`, not `GameState`.** `GameState` is 1 on a game in the 2nd inning AND on one that has
ended, so it carries no information. `GameStateID` 4 goes with `GameStateName` 試合終了 ("game over"), 1 with 試合中
("in progress"). Keyed on the id, not the Japanese label, so an upstream wording change cannot turn every finished
game back into a fixture. In-progress games now set `live` and show no score, because these strips are a schedule and
not a scoreboard.

Verified by replaying the corrected shaping against the live feed: 3 final with real scores (Orix 7-4 Nippon-Ham,
SoftBank 2-5 Rakuten, Chunichi 1-14 Yomiuri), 3 in play with no score. The shipped code would have produced 0 finals.

**Correcting section E of 09-17, which overstated the source.** SPAIA fills On today, fills Recent results ONLY for
games that finished earlier the SAME DAY, and cannot fill Coming up. Once the date rolls over in Japan the feed drops
those games, so NPB results vanish rather than ageing out of the 72h window like every other sport's. A real NPB
results history needs npb.jp's monthly page and a parser.

### B. What went right, and what that says

The rest of yesterday's change held: MLB is serving 15 on today, 54 recent, 91 coming up, the AFL finals rows are
there, the only data-cache warning is still the pre-existing `companies.json` one, and no job or Action has failed
since 09-18 08:00Z. `feed-monitor` green today at 08:29Z.

**The NPB bug is the same class as the ESPN `score: "0"` bug I caught the day before, and I only caught that one.**
Both are "the field exists, so the value must mean what I assume". The ESPN one I found by replaying the shaping
against the live feed before building; the NPB one I did not, because the three games that day had not started yet, so
every score was legitimately null and the broken and correct code were indistinguishable. **A shaping replay proves
nothing unless the sample contains the state you care about.** Next time a source has states (scheduled, live, final),
wait for or find a row in each state before believing the mapping.

### C. The Notion contract caught me out, and it was right to

The pre-commit hook rejected this entry: a HANDOFF change with no `**Notion:**` line. My first push then printed
"HANDOFF pushed and confirmed" anyway, because `git push` succeeded at pushing NOTHING and HEAD was still someone
else's commit. That is the same false-success trap as 09-16 section E, so the check is the SHA, never the exit code.

Reading Notion at session start is a hard rule in CLAUDE.md and I had not done it. The cost was concrete: the ESPN
Data sources row has said since 2026-09-13 that **"SCOREBOARDS SHOW 0-0 BEFORE KICK-OFF: a score's presence means
nothing; use status.type.completed"**. That is exactly the bug I "discovered" on 09-18 and wrote up as a finding. It
was already written down, in the store whose whole purpose is to be queried, and I rediscovered it from first
principles a day later. The NPB bug in section A is the same class again, third time in three days.

Notion also had **no row at all for SPAIA**, a source that has backed the NPB ladder since August, so there was
nowhere for the field-level quirks to live. There is now.

**Notion:** Data sources added "SPAIA (spaia.jp unofficial NPB API)" with the field-level quirks (H_Score_R not
HScore, GameStateID not GameState, today-only endpoint) and the 09-19 incident; Decisions added 4 rows that were
missing entirely (MLB regular season overrules postseason-only, Coming up 7 days with results and On today unchanged,
CFB labels carry the current lead poll rank, NPB from SPAIA not Flashscore); Backlog added "NPB results history and
fixtures beyond today need an npb.jp monthly-schedule parser"; Silent failure register added "A feed's field exists on
every row and is null on every row, so the reader takes the wrong one" under Still silent.

### D. The ntfy trail led to a hardcoded "today" that has been rejecting rate decisions for eleven days

Ashwin asked for the ntfy of the last 24 hours to be examined and anything wrong fixed. Two messages, and the quiet
one mattered.

**What the ntfy said.** 01:21Z daily ops sweep (34 jobs ok, 1 failed, 1 flagged) and 09:00Z mktcap curation queue. The
FAIL was `gap-league-watch`, already closed same-day by `0731cb049`. The flagged job was the real finding.

**The first fault: a swallowed exit code.** `economy-rates` logged `DONE ok 361s` and went green on 09-18 while
`refresh.py` printed `3 builder(s) FAILED` and `sys.exit(1)`. `_common.sh` sets `set -uo pipefail` in the runner's
shell, but pipefail is a shell option a new `bash -c` does not inherit, so `guarded()` received `tee`'s status.
Verified on this box rather than taken from the report: the idiom returns 0 with a failing python inside and 1 the
moment `set -o pipefail;` is added. Fixed in `eb3d5fa61`.

**My own fix was dead code, and the re-run proved it.** The `builder(s) FAILED` watcher I added sat AFTER the guarded
step, and `guarded()` calls `fail()` which exits immediately, so it could never run on the one run that needed it. The
only alert Ashwin got was the generic `step failed (rc=1): refresh policy rates (--write)`. Moved into an EXIT trap in
`92f1432dc`, rehearsed in isolation first, and the duplicate copy left by a failed edit removed.

🔴 **The real fault, and it is live: `BUILT_DATE` is a hardcoded literal.** With the log kept, the re-run named the
three failures for the first time:

```
bis-dk:    change on 2026-09-11 is after the build date 2026-09-08
build_fed: change on 2026-09-17 is after the build date 2026-09-08
build_ecb: change on 2026-09-16 is after the build date 2026-09-08
```

`common.py:22` is `BUILT_DATE = "2026-09-08"  # today, per the environment`. `common.py:588` refuses to publish any
change dated after it, so **the ECB hike to 2.50 (effective 09-16), Denmark's to 2.10 (09-11) and the Fed's 09-17 move
are all rejected**, and `/business/economy` still reads 2.25% from 2026-06-17 (checked live). It also sets the
incremental fetch window at `refresh.py:537-538`, so the job asks upstream for a window that ended eleven days ago AND
refuses what does arrive. `refresh.py --self-test` passes: nothing pins the constant, nothing warns when it rots.

**Two wrong diagnoses corrected, one of them mine.** The sweep concluded "a re-run with the log kept fixes the data";
it cannot, because the builders compute the new values correctly and the publish guard then refuses them. I then
restated it as "the base inputs need rebuilding", which was also wrong: the base inputs refreshed fine today
(`ecb_dfr.csv` 11:01), it is the constant that is stale.

**NOT changed, deliberately.** `BUILT_DATE` drives eleven call sites including the `built` stamp in every bank file
and `index.json`, `trailing_365_changes`, `print_stale_without_ended` and the BIS splice tails in
`build_boe`/`build_boj`/`build_snb`, and `refresh.py` writes to Supabase. That is a ruling, not a drive-by: P0 Backlog
row filed, owner Ashwin.

**Also open from the sweep, neither actionable here:** Formula E still owes a 2026 champion row (third place needs the
official final table), and the Vercel build cap could not be re-verified because the MCP token returns 403 on
`projectEnvVars`. The FIFA women's world ranking is one edition behind: `public/data/rankings/womens-football.json` is
`asOf 2026-04-21` and FIFA published 16 June, 151 days against a 150-day limit in `scripts/data/data-currency.json`.
`check:data-currency` is warn-only, so it alerted nobody; confirmed by running it (27 current, 2 overdue).

**Coming up is back to three days** at Ashwin's request, with results and On today untouched as before. Built and
verified; unpushed with the NPB score fix, both waiting on one paid build.

One process note: the sweep could not write Notion at all (connector unauthorized in a headless session), so the row
its own finding 1 deserved had nowhere to go. That gap is closed from this session.

**Notion:** Backlog added "BUILT_DATE in scripts/macro/rates/common.py is a hardcoded 2026-09-08 and is silently
rejecting every rate decision since" (P0 watch, owner Ashwin); Silent failure register added "A \"today\" constant is
hardcoded, so a publish guard silently rejects everything newer than the day it was written" under Still silent.

### E. KHL: investigated, then declined, and the research is kept

Ashwin asked whether the KHL standings and then its fixtures could be wired into Live Standings against his canonical
team names, and after seeing the cost ruled it out: "too much work for a league that no one cares about considering
Russian sanctions... I don't want to create a separate job just for it." Agreed, and recorded in Decisions so nobody
re-investigates.

**Why it is expensive.** `en.khl.ru` cannot be read server-side. urllib gets 403 with every User-Agent tried (none,
urllib's own token, curl's); a browser UA gets a 307. With a cookie jar and redirect-following it returns 200 and
about 92 KB, but that HTML carries ZERO tables and ZERO dates: both `/standings/` and `/calendar/` render entirely in
the client. Every other Live Standings board is a server-side fetch with ISR, so the KHL alone would need a headless
browser on a schedule, writing a JSON bundle the site reads. That is a new mini job, a new lib and a Scheduled jobs
row for one league.

**What the browser does show**, so the feasibility is not in doubt, only the price: a full two-conference table with
PTS/GP/W/OTW/SOW/SOL/OTL/LEN/L/G, and a calendar with dates, Moscow kick-off times, venues, scores, period-by-period
splits, overtime flags and future fixtures.

**The expensive half was already solved and is worth keeping.** The canonical names Ashwin asked to match against are
in `public/data/sports/all-teams.json`, the committed mirror of MetroAreas.xlsx "Team List" (he thought they were in
Supabase; they are in the repo, and `lib/allTeams.ts` already reads that file). It carries exactly 22 KHL rows, one
per club, each with division, city and metro_slug, and they line up one-for-one with the 22 clubs the KHL renders.
The short-form crosswalk is written out in full in the Decisions row, including the two nobody would guess: `Dragons`
is Shanghai Dragons, the former Kunlun Red Star, and `Metallurg Mg` maps to the disambiguated
"Metallurg Magnitogorsk (ice hockey)".

**What would change the decision:** a plain JSON feed. That could ride an existing job rather than justifying a new
one, which is the actual objection.

**Notion:** Decisions added "The KHL is not wired into Live Standings: not worth a bespoke scraping job", carrying the
access findings and the full 22-club crosswalk so the investigation is not repeated.

### F. Seven Live Standings and NBA fixes, and a verification habit that wasted half of them

Shipped as `80e1d5671`, one paid build, all seven verified on production from a FRESH render.

**Upcoming is three days again.** `COMING_DAYS` 7 to 3 after a day at a week: the week bought volume, not reach (135
fixtures to 293, mostly domestic league games nobody looks a week ahead for). Results and On today were never touched.

**The Football strips are ordered.** They rendered in `collectEvents` emission order, so the Premier League could sit
below the Taca de Portugal. `FOOTBALL_EVENT_ORDER` keys the supranational entries by COMPETITION and the domestic ones
by COUNTRY, so a country's cups travel with its league (Coppa Italia under Italy) and a new competition in a listed
country needs no edit. `LiveEvent` gained an optional `country`. Production now reads Premier League, La Liga, Serie A,
Bundesliga, Ligue 1, then MLS, Brazil, Argentina, Mexico, then the unlisted.

**Brazil, Argentina and Liga MX carry fixtures and results**, registry rows only (`191f805ab`). The 11:00Z job had
already committed a TEN-league bundle from a SEVEN-league registry, so a clean checkout would have reverted it.

**Argentina's Clausura and Uruguay's four missing tables are back.** `dedupeLeague` dropped any group whose TEAM SHEET
matched an earlier one, with a comment asserting Apertura/Clausura were safe; the same clubs contest both halves, so it
ate them. Keyed on the table's values now, Clausura first, seven new tests including the duplicate-spelling case the
rule exists for.

**Continental tables on the 2026-27 hub are closed** by default: 88 details, zero `open`.

**NPB results exist at all.** `lib/npbFixtures.ts` read SPAIA's `HScore`/`VScore`, null on every row, so `final` was
permanently false from the day it shipped. The score is `H_Score_R`/`V_Score_R` and completion is `GameStateID` 4.

**The FIFA ranking is the June edition**, header corrected and ranks 191-198 appended. `check:data-currency` 2 overdue
to 1.

**The NBA scrubber moves the records, not just the Elo.** `recordsAtWeek` splits the week's cumulative `rec`. Week 17
of 2026 reads 38-17 with no playoff cell, week 26 reads 62-20 and 1-1, the final week 62-20 and 13-11. Play-in games
are postseason (Ashwin), so the subtraction applies at every week; production shows `13-11` and no `13-10`. Two bugs
the tests caught first: a zero difference at the exact end of the regular season printed the season's 13-10 for a team
with no playoff game yet, and one of my own tests asserted a fallback that never fires.

🔴 **Documented, not hidden:** 8 of 330 played team-seasons disagree by one game between the weekly series and
`reg + post`, in both directions. NOT a play-in artefact, which was my first explanation and was wrong: those eight are
seeds 1 to 6. Backlog row filed to reconcile the source.

### G. The habit that cost the most today

Three of today's four false alarms were verification errors, not code errors, and they share one shape: **reading a
cached or truncated view and reporting it as the state of the world.**

- Aussie Rules "missing from the strips" and Baseball "missing from Coming up" were both present, at offsets past the
  slice I read.
- The football order looked wrong on production for several rounds. It was correct; I was reading a pre-deploy
  prerender. `x-vercel-cache` said `HIT` and then `STALE` the whole time and I did not look until the third attempt.
  Cache-busting query strings do nothing here: they are not in the cache key.
- The three new leagues looked absent from a LOCAL render. `getClubFootball`'s loader fetches GitHub raw FIRST and only
  falls back to disk, so a local build reads the committed bundle, not the file just written.

**The rule for next time: check `x-vercel-cache` and `age` before believing any production read, and grep for the thing
itself rather than slicing a region.** A stale 200 is the most expensive kind of evidence, because it looks like data.

**Notion:** none (no queryable state changed; the NBA one-game discrepancy Backlog row is filed in the next step).

### H. The NBA Cup final is the missing game, and it now has a date

Ashwin worked out what the one-game discrepancy was: **the NBA Cup final counts toward neither the regular season nor
the playoffs.** For the two finalists the weekly cumulative `rec` carries a game that appears in neither `reg` nor
`post`, which is why a naive `rec - reg` read the 2026 Spurs' playoffs as 13-11 against the workbook's 13-10.

Confirmed against the data before building on it: of the 8 mismatched team-seasons, **6 are exactly the three Cup
finals** and pair perfectly, one team a win up and one a loss up. 2024 Lakers beat Pacers, 2025 Bucks beat Thunder,
2026 Knicks beat Spurs.

**His ruling:** "you can consider the final a playoff game for the standings tracking purposes... after those dates you
would show the regular season totals as expected and the extra cup final games in the playoffs section."

So the DATE does the work, and an earlier version of this that inferred a residual from the final week is gone. New
`public/data/nba/cup-finals.json` (three editions, hand-maintained, one row a year in December) and `lib/nbaCup.ts`.
`recordsAtWeek` now takes the week's date and the team's Cup result:

- before the final: the week's record is all regular season, playoff cell blank
- from the final to the end of the regular season: regular season is `rec` MINUS the Cup result, and the Cup result
  sits alone in the playoff column
- once the regular season is complete: regular fixed at `reg`, playoffs `rec - reg`, which includes the Cup game by
  design

Verified against the real seasons, not just the unit tests. 2026 Spurs: week 8 (ending 12-14) 18-7 and no playoff cell;
week 9 (ending 12-21, the 12-16 final inside it) 21-7 and 0-1; final week 62-20 and 13-11. Knicks the mirror: 20-8 and
1-0, ending 53-29 and 17-3. 2025 Thunder and Bucks likewise.

**The Cup also has a home now:** a small table at the foot of the NBA hub, winners with date, score, runner-up and MVP,
each season linking to its year hub. It is there because the dates are load-bearing for the standings, not only as a
record.

⚠️ **2024 is still not fully explained.** Four teams are off, and the Mavericks are a loss DOWN, where one final can
only put one team up. Those weeks fall back to the workbook's `post` rather than printing a negative. The Backlog row
is narrowed to the two teams the Cup does not account for.

**State: NOT PUSHED.** Seven files sit in the shared tree, built and green (20 Cup tests, 322 in the suite, build exit
0). It touches `app/`, so it needs a paid build, and both of today's two are already spent on `18eb6a0cd` and
`80e1d5671`. Waiting on Ashwin: push now as a third build, or hold until tomorrow. A dirty shared tree is the hazard to
watch if it waits, since the mini's jobs ff-only merge into this clone.

**Notion:** Decisions added "The NBA Cup final counts as a postseason game for standings tracking"; Backlog row "NBA
Elo: 8 team-seasons disagree..." narrowed to the 2 the Cup does not explain.

### I. Formula E was never blocked on third place, and it is now current

Ashwin: "why do you keep asking about the 2026 Formula E champion? It's already completed in August." He was right to
push back, and the fault was mine twice over: I relayed the ops sweep's line about it on two consecutive days without
checking either half of it.

**The sweep's reason was wrong.** It said third place "still needs the official final table, which is why yesterday's
sweep stopped rather than guessing". But `probeMotorsport` in `check-data-currency.mjs` takes the MAX year across
`champions`, `runners_up` and `thirds` in `scripts/data/motorsport-series.json`. Any one of the three clears the
warning, so the champion alone would always have been enough. Nobody had read the probe.

**And the data was obtainable.** The 2025-26 FIA Formula E World Championship ended in August 2026: Pascal Wehrlein
(German, Porsche) champion, his second; Jake Dennis (British, Andretti) runner-up; Mitch Evans (New Zealander, Jaguar)
third. Wikipedia carries the full podium in its lead paragraph. The rows in this file hold only `year` and `nat`, so
the whole fix was three lines.

`check:data-currency` now reports **29 current, 0 overdue**, for the first time since the manifest was written.

**Knock-on worth knowing:** `scripts/zzc_v1_multipillar.py` scores nations from the same file (champion 1.0, runner-up
0.5, third 0.25), so the next manual Zone Zero Cup rebuild will move Germany, Great Britain and New Zealand slightly.
That sits alongside the existing Backlog row about the next rebuild moving five nations.

**The lesson, which is the same one as section G:** an inherited finding is not evidence. The sweep is a useful alarm
and a poor diagnosis, and I passed its reasoning on twice without opening the probe it was describing.

**Notion:** none (no queryable state changed; the currency manifest and series file are repo data, and the Formula E
row was a warning rather than a Backlog item).

### J. The Champions Current board is a closed set, and the door is ALWAYS_CURRENT

Ashwin, two questions: "why don't we display the current county championship winner in cricket, we track it in the
Time Machine but it's not in the Current list of champions", then "why aren't all of the other T20 leagues on the
Champions table for both Current/Time Machine (BBL, CPL, etc). We only have Hundred and IPL".

**The Time Machine half of the premise is wrong, and checking it first saved a wasted fix.** Fetched the production
`/api/champions-timeline` and resolved every cricket reign against today: 14 of the 15 cricket competitions are live
there right now, County Championship and BBL and CPL and BPL and PSL and SA20 and Super Smash and ILT20 and T20 Blast
included. Only Lanka Premier League is absent, and correctly so, because its last title in the ledger is July 2024 and
the liveness rule ages a trophy out at the end of the year after it was last won. Nothing is wrong with the Time
Machine: it reads `champions-history.json` directly and never consults the current flag at all.

**So the whole fault is the Current board, and it is a circular definition.** The chain is
`champions.json` -> workbook "Is Current" -> Supabase `is_current` -> `champions-current.json` -> the board:

- `scripts/merge-champions-sources.py:169` writes `Is Current = "Y"` only inside `if zz_entry:`, that is, only for a
  competition that already appears in `public/data/champions.json`.
- `public/data/champions.json` is built by `scripts/build-champions-data.py`, which emits the rows where
  `Is Current = "Y"`.

A competition that is not already on the board therefore cannot ever get onto it, no matter how complete its history
or how recent its champion. That is not a cricket bug; cricket is just where Ashwin noticed it. The roster holds 92
competitions and the board holds 97, the extra five being the four boxing belts and The Hundred, which were flagged
directly rather than through the workbook.

**The only door in is `ALWAYS_CURRENT`** in `scripts/build-champions-data.py`, a set whose comment already says it is
for competitions "whose Is Current flag is not maintained". It held five football and volleyball entries. Added the
nine cricket competitions that belong on the board, and documented the circularity above it so the next reader does
not have to re-derive it. Lanka Premier League deliberately left out: promoting it would put a champion from July 2024
on a board that means "reigning".

**A second fault found while checking, which is why the Supabase half is NOT done.** Cricket is fed by two independent
strands that disagree:

- the workbook strand, canonical slugs (`t20-blast`), carries `match_date` and `is_current`;
- the honours strand, alias slugs (`cricket-t20-blast`, resolved through `champion_competitions.alias_of`), written by
  the GitHub honours workflows, carries runners-up and usually no `year` at all, only a `season` string.

They are not redundant copies. The workbook's T20 Blast stops at 2025 (Somerset) while the honours strand has 2026
(Northants Steelbacks), so flagging the workbook's latest row would have published a year-stale champion. And the two
strands give different champions for The Hundred 2025: Oval Invincibles in the workbook, MI London in honours. One of
those is wrong, or they are men's and women's conflated, and I have not established which.

**Ashwin supplied the two missing facts mid-session, so all nine are done.** "Northamptonshire won the 2026 T20
Blast on 18 July 2026" settles the strand conflict in the honours strand's favour: the canonical `t20-blast` line was
simply missing 2026. That could not be fixed by flipping a flag, so a new row was inserted (id 149513, source
`majors-ingest`, the sanctioned hand-insert channel, borrowing 2025's `source_ordinal` 5572 so `id.asc` lands it
directly after 2025). He then gave the CPL's next final as 20 September 2026, which replaced a minted estimate.

**What was written.** Supabase: `is_current` on the eight existing rows, one inserted T20 Blast 2026 row, and a
published `next_awarded_date` for the CPL. Locally, `champions-history.json` 6,816 to 6,817 rows and
`champions-current.json` 97 to 106. The board now carries 14 of the 15 cricket competitions, all but Lanka Premier
League.

**Regenerating it without the builder, and why that is safe.** The reproduction was proved before being relied on:
filtering `champions-history.json` to `isCurrent` and re-serialising with the same separators is BYTE-IDENTICAL to the
committed `champions-current.json`, so the board is exactly that subset and can be rebuilt by hand with confidence.

CORRECTION, made the same day in section L: the stated REASON for doing it by hand was wrong. I wrote that
`build_champions.py` needs `requests` and no interpreter here has it, having tested only the system pythons. The repo
has a venv at `.venv/bin/python` with requests 2.34.2, which every cricket runner already uses. The hand edit was
right and is now independently confirmed: `build_champions.py --check` run against Supabase reports BYTE-IDENTICAL to
`champions-history.json` and 106 unchanged holders, which validates the inserted T20 Blast row's position and the
minted next-title dates.

**The trap in doing it by hand, which nearly shipped wrong.** Flipping `isCurrent` is not a one-field edit.
`to_row()` also MINTS `nextAwardedDate` as the award date plus a year and appends `nextAwardedEstimated: true`
whenever a current row has no published next date. Editing only the flag would have produced a file that the next real
builder run silently rewrote. All nine needed the mint; the CPL then lost it again when Ashwin's real date arrived.

**Notion:** Backlog row added for "The Hundred 2025 strands disagree (Oval Invincibles in the workbook, MI London in
honours), likely men's and women's conflated"; and one for "no producer moves cricket is_current forward, so each new
champion needs a hand promotion" (the CPL crowns one on 20 Sep 2026, the first test of it).

### K. The 13:15 ntfy was our own dirty tree, not a fault

Ashwin got an ntfy mid-session and asked me to investigate. It was `ops-autofix`, which fires daily at 12:15 UTC and
so landed at 13:15 BST, standing down with "uncommitted work".

Ran `detect_issues.py --json` directly: exactly one finding, `working_tree_dirty`, blocker, listing the eight files of
the unpushed NBA Cup work plus the `build-champions-data.py` edit from section J. Nothing else is wrong anywhere. The
guard at `run-ops-autofix.sh:113` refuses to act around a human's work, which is correct behaviour, and it will
re-fire every day at 12:15 UTC until the tree is clean.

**Worth recording because I nearly concluded the opposite:** there is no `config.env` and no `logs/` directory in this
checkout, which made it look like this machine was not the mini and therefore could not be the source of the alert.
The test that settled it was `_scratch/`, which `.gitignore:169` excludes and git does not track: files in it were
written at 11:09 today, so they cannot have arrived by pull and a job must have run here.

And the reason the config is absent is now known, found while building the job in section L: **the jobs run from a
LIVE directory, `~/metro-mini-jobs/`, not from the repo.** dispatcher.py copies `*.py`, `*.sh` and `*.toml` from
`mac-mini-jobs/` into it and deliberately never copies back, because `config.env`, `state.json`, `dispatcher.log` and
the lock belong only there. `REPO_DIR` then points the runners back at this clone, which is why a dirty tree here
stops a job that lives somewhere else. A runner edited in the repo is NOT live until that copy happens, and
dispatcher.py has a drift check for exactly that.

**Notion:** none (no queryable state changed; the finding was our own working tree and clears when it is committed or
stashed).

### L. Cricket champions now promote themselves

Ashwin, after section J: "Add a job to promote cricket champions automatically". Section J fixed the ten competitions
that were missing; this is the producer that keeps them right, and it is what section J's Backlog row asked for.

**What was already there, and why none of it could be used.** Three candidate sources were checked before writing
anything:

- `cricket_matches` (the cricsheet staging the weekly job already refreshes) is TEST CRICKET ONLY. Its 2024-2026 rows
  are tours, the Ashes and the WTC final; there is not one T20 league or county match in it.
- The honours strand in Supabase (`source='honours/cricket-t20.json'`) has the T20 leagues, but nothing refreshes it:
  `load_champions.py` is a manual one-off and `public/data/honours/cricket-t20.json` does not exist in the repo at
  all. It was a snapshot, not a feed.
- `.github/workflows/honours-county-cricket.yml` covers one competition, once a year, and writes only the honours
  roll.

So the detector had to be new: **`scripts/ingest/cricket_finalize.py`**, modelled on `footy_finalize.py` down to the
dry-run-by-default, the `--self-test`, and the refusal to invent.

**It reads the SEASON article's infobox, not the competition's.** The competition article does carry `champions`, but
with no season and no date, and it cannot tell a side retaining its title from a page nobody has edited. The season
article carries champion and final date together. Measured across all eleven competitions on 2026-09-19, the parse
reproduced the ledger EXACTLY, dates included, for IPL, BBL, CPL, T20 Blast, County Championship, PSL, SA20, BPL,
ILT20, Super Smash and The Hundred. Eleven confirmations of rows that reached the ledger by a completely different
route is the reason to trust it.

**Two traps found by testing, both of which would have written a wrong champion:**

1. 🔴 **A year with no season article redirects to the COMPETITION article**, whose infobox `champions` field is the
   REIGNING champion. Left alone, the job would re-crown the current holder for a season not yet played, every night.
   Today's markup happens to save it (no `todate`, so the date check refuses), but that is an accident and not a
   design. They are now told apart by template name: all eleven season articles use `Infobox cricket tournament`,
   while the competition article uses `Infobox cricket tournament main`. That case is a SILENT skip, not an alert,
   because it is the normal state of next season for most of the year.
2. 🔴 **The men's and women's competitions share an article.** The Hundred's infobox reads "'''W''': Trent Rockets
   ... '''M''': Manchester Super Giants", women FIRST. Taking the first name would have recorded the women's champion
   as the men's. `GENDER_MARKER` handles it, and a missing marker refuses rather than falling back.

That second one also **settles the Backlog row from section J**: the 2025 season article reads "'''M''': Oval
Invincibles (3rd title)", so the workbook was right, the honours strand's "MI London" is the wrong row, and the
promotion in section J took the correct one. The Hundred's women's competition is not tracked in the ledger at all,
which is a separate question and not a bug.

**What it refuses to do,** the same rule footy_finalize.py follows: a first-time champion whose metro cannot be
resolved from that competition's own history, a champion with no readable final date, a final dated in the future,
and a competition with no history to template from are all REFUSED and reported. The runner raises an ntfy on any of
them. Proved live by monkeypatching the ledger a season behind: County Championship 2025, T20 Blast 2026 and BBL
2025/26 were all detected with the right champion, metro, season label and exact date, and The Hundred 2026 correctly
refused, because Manchester Super Giants had never won it before and a metro is curation, never a guess.

**Two incidental fixes were needed to make it work at all:**

- `build_champions.py` read its key only from `scripts/mktcap/supabase_key.txt`, which is gitignored and NOT PRESENT
  in this clone, so any runner calling it died on FileNotFoundError before reading a row. It now falls back to
  `SUPABASE_SERVICE_KEY`, which config.env already carries.
- Its `source` filter now includes `cricket-finalizer`, exactly as `footy-finalizer` was added, or the promoted rows
  would sit in the table and never reach the JSON.

🔴 **ANON READS ARE DEAD ON THIS PROJECT, WHICH IS A PROBLEM BEYOND CRICKET.** The legacy anon key AND the
publishable key both return 401 on `champions` (both tested directly). `footy_finalize.py` reads as anon on every
path, so **the AFL and NRL finalizer would 401 today**, and the AFL Grand Final is days away. cricket_finalize.py
reads with the service key for this reason. This was not chased down further because it is outside what was asked,
but it should be, and soon.

Registered as `cricket-champions` in jobs.toml, daily at 22:30 UTC, `runners/cricket-champions.sh`. Daily because
cricket finals are scattered from January to September and a weekly slot would leave a champion off the board for up
to six days; the cost on a quiet day is eleven Wikipedia reads and one select. No `hc_slug`: the budget is full, and
this is the same trade that retired the football-standings tile. NO BUILD, ever: the board reads
`champions-current.json` from GitHub raw, so a champion ships on a `[vercel skip]` commit plus a tag flush.

**NOT LIVE UNTIL IT IS COPIED.** Per section K, the dispatcher runs from `~/metro-mini-jobs/`, so
`runners/cricket-champions.sh` and `jobs.toml` have to be copied there before 22:30 UTC or nothing fires. The first
real test is the CPL final on 20 September 2026, Antigua and Barbuda against Jamaica, which is the day after this was
written.

**Notion:** Backlog row added for "footy_finalize.py reads as anon and anon is 401 on this project, so the AFL/NRL
finalizer is probably broken with the Grand Final days away"; the section J row about the two cricket strands is
resolved (the workbook was right) and can be closed.

### M. Four continental club cups were scoped International

Ashwin: "In Champions hub, please ensure CONCACAF Champions Cup, AFC Champions League Elite, CAF Champions League, OFC
Champions League are scoped as Continental and not International".

All four carried `scope_type = 'International'` across every row. `Continental` already existed and already held the
exact analogues, Champions League and Copa Libertadores, alongside EuroLeague, rugby union's Champions Cup and the
UEFA Women's Champions League, so the category is "club competition above domestic level" and the four plainly belong
in it. 191 rows moved: CONCACAF 63, CAF 61, AFC 44, OFC 23.

**One near miss worth recording.** The search for those four also returned `concacaf-championship-gold-cup`, which is
a NATIONAL TEAM competition and genuinely International. It was not in Ashwin's list and it was left alone. Matching
on "CONCACAF" and changing everything that came back would have mis-scoped the Gold Cup.

Verified by parsing both versions rather than reading the minified diff: 6,817 rows before and after, 191 changed,
`scopeType` the ONLY field that differs on any of them, and no competition touched beyond the four.

**Europa and Conference followed.** They are the same kind of competition and were also `International`. They were
left out of the first pass rather than quietly widening the request, Ashwin said yes, and they moved in a second pass:
60 more rows, Europa League 55 and Europa Conference League 5, verified the same way. The Current board now carries 13
Continental competitions.

**Notion:** none (no queryable state beyond the ledger itself; the Backlog row that would have asked about Europa and
Conference was answered in the same session and never filed).

### N. footy_finalize.py could not read the champions table, with the Grand Final a week out

Flagged at the end of section L and Ashwin said fix it. It was real.

**The fault.** `_headers(write=False)` returned the ANON key, and `champions` answers anon with HTTP 401 and Postgres
42501, "Grant the required privileges to the current role". There is simply no SELECT grant for anon on that table.

**Why it had gone unnoticed, which is the interesting part.** It is NOT a project-wide outage. The same anon key reads
`afl_nrl_ladders` and `cricket_matches` with a 200, and those are the tables the script's early stages use. So every
ladder stage worked, the run looked healthy, and only the final stage, the one that appends the premier and flips
`is_current`, would have thrown. The premier would have reached the AFL and NRL pages and never reached
/sports/champions or the Time Machine. Both tables that refuse anon are the champions pair: `champions` and
`champion_competitions`.

**The fix** is one line of behaviour: use the service key for reads as well as writes, exactly as
`majors_to_champions.py` already does. That script sets `CHAMPIONS_KEY = WRITE_KEY` unconditionally and its docstring
already says reading champions "needs the SAME elevated key as writing", so this was the house pattern all along and
footy_finalize was the one that missed it. No write path changed.

**Verified, not assumed.** The champions read now returns the AFL's 2025 Brisbane Lions and the NRL's 2025 Brisbane
Broncos with `is_current` true, the ladder read still returns its 18 rows, the self-test passes 19 checks, and a full
dry run reports "ladder flags already exact / Grand Final not decided yet" for both leagues, which is the correct
state for 19 September.

**Blast radius checked rather than guessed.** Nine scripts carry a hardcoded anon key. Seven of them read
sport-specific tables (`golf_majors`, `cws_standings`, `wnba_seasons` and friends) where anon works fine and matched
the search only because they mention champions in prose. Of the three that touch the champions tables,
`majors_to_champions.py` was already correct and `cricket_finalize.py` was written with the service key yesterday.
footy_finalize was the only broken one.

**Notion:** Backlog row "footy_finalize.py reads as anon" closed as fixed; the underlying fact that anon has no SELECT
on `champions`/`champion_competitions` is worth keeping, since the next script to read that table will hit it too.

### O. Pushing the NBA Cup work, and what the gate caught on the way

Ashwin: "push everything to main". That is the explicit yes the standing rule needs for a build-triggering push, and
it is a THIRD paid build today, after `18eb6a0cd` and `80e1d5671`. He asked for it knowing that.

Running `npm run verify` before spending it was worth doing twice over, because it failed twice for reasons a Vercel
build would never have reported:

1. **`check:sortable`** rejected the new NBA Cup finals table: a fixed-order board with 5 or more columns, against a
   baseline of 0 for that file. Vercel runs `next build`, not this gate, so this would have shipped and only surfaced
   the next time someone ran verify. Fixed with `data-static-sort` and a reason rather than a sortable board: three
   rows in the chronological order the editions happened, where the DATE column is the table's whole purpose, since
   the season standings key their Cup handling on it.
2. **`check:release-notes`** refused a day with build-relevant commits and no entry. 2026-09-18 had closed with none
   at all and 2026-09-19 had two before this push. Both entries written, inside the house limits (4 bullets, one
   sentence each, 220 chars, headline 4 to 8 words).

**`test:python` cannot run from the system python** and says so honestly: "python3 cannot import pytest ... This is a
missing dependency, not a failing test". The suite was run against `.venv/bin/python` instead and passes 112 tests.
Worth knowing for the next session, and it is the same lesson as section J's correction: reach for `.venv/bin/python`
here, not `python3`.

Everything else green: typecheck clean, 322 JS tests in 26 files, all fifteen data checks, and the production build.

**Notion:** none (no queryable state changed; the gate findings are repo hygiene and are recorded here).

### P. The F1 poller paged hourly for a one-hour upstream outage

Ashwin: "just got a ntfy". It was `run-f1-weekly.sh` at 14:07 BST with "ERROR: jolpica fetch failed", carrying
`curl: (6) Could not resolve host: api.jolpi.ca`.

**Nothing was wrong on our side and nothing was missed.** Measured minutes later: `api.jolpi.ca` resolved fine to
Cloudflare, but every request to it hung and returned nothing after 25s, while `jolpi.ca` itself served 200 and a
GitHub raw control served 200. So the API was down, not our egress and not DNS despite what the error said. It came
back about an hour later, 200 in 0.06s. The day's log is "idle: 2026 R14 already synced" on every hourly poll, so no
race was pending and the next poll simply carries on.

**The actual defect is the alerting, and it would have paged once an hour until the API returned.** `fail()` sent an
URGENT ntfy on every failed run and this poller runs HOURLY, so an afternoon-long outage means an afternoon of
identical urgent alerts. That is precisely the trap `run-ops-autofix.sh` already names in its own comments: an alert
channel that cries wolf on a schedule trains you to swipe it away.

Fixed on the edges rather than by silencing it. `fail()` now records the failure reason and time in
`$LOGDIR/.f1-outage`; an identical failure on the next run logs and does NOT re-notify, while a DIFFERENT failure
still pages immediately, and `clear_outage()` sends one low-priority recovery note. Every path still exits 1, so the
healthchecks tile still goes red and carries the persistence the ntfy no longer needs to.

Also fixed while in there: the fetches had **no timeout and no retry**. Plain `curl` has no timeout at all, so against
an endpoint that HANGS rather than refuses, an hourly job can sit there until launchd kills it and then overlap
itself. Both the round-check fetch and the four per-file fetches now go through `curl_retry`, which is 3 attempts with
backoff and `-m 30`.

Tested by extracting the shipped functions and exercising them against stubs, rather than reimplementing them: first
failure pages, an identical repeat is silent, a different failure pages, recovery notifies once and clears the marker,
and a second recovery is silent.

🔴 **CORRECTION TO SECTION K, AND IT MATTERS FOR DEPLOYING ANYTHING HERE.** I wrote that the dispatcher runs from
`~/metro-mini-jobs/` and that a runner edited in the repo is not live until it is copied. That is only half true. Most
live files, including every runner in `runners/` and `run-f1-weekly.sh` itself, are **SYMLINKS into the repo**, so
editing the repo file IS the deployment and no copy happens. Only some are real files: `jobs.toml`, `dispatcher.py`
and, until now, the `cricket-champions.sh` I added in section L, which I copied in by hand and which was therefore the
only runner in that directory that would silently go stale on its next edit. It is now a symlink like its siblings,
and `--check-sync` is clean.

**Notion:** none (no queryable state changed; the outage was upstream and transient, and the alerting change is repo
behaviour recorded here).

### Q. The two 2024 NBA discrepancies were a workbook error, and the series was six games

Ashwin: "fix the two 2024 discrepancies". They are fixed, and the diagnosis is better than the Backlog row assumed.

**First, the count was wrong.** Rescanning every complete season rather than trusting the earlier note: TEN
team-seasons fail to reconcile, not eight. Six are the NBA Cup finalists from section H and are legitimate. The other
four are 2024 Mavericks and Clippers, and 1953 Hawks and Warriors, which the earlier note never mentioned.

**The 2024 pair is one error, not two.** They fail in OPPOSITE directions, the Mavericks a loss short of their
recorded postseason and the Clippers a loss long, which no single missing game can produce. That asymmetry is the
clue: the two met in the first round. Dallas won that series 4-2, in six games, closing it out at home on 3 May 2024.
Three places in the workbook disagreed about it and only one was right:

- the bracket recorded **Mavericks 4-3**, a seventh game that was never played;
- Year by Year gave Dallas a postseason of **13-10**, which is exactly what that phantom loss produces: 4-3, 4-2,
  4-1, 1-4 sums to 13-10, while the real 4-2, 4-2, 4-1, 1-4 sums to 13-9;
- Year by Year gave the Clippers **2-3**, which matches NEITHER reading of the series and is a second, independent
  typo for 2-4.

The weekly cumulative record had Dallas 13-9 and the Clippers 2-4 all along. It is the arbiter here because it is a
running total of games actually played rather than a hand-typed summary, and the bracket's other three Mavericks
series sum correctly against it.

**Fixed in two places, because the workbook is not in this clone.** `POST_CORRECTIONS` and `BRACKET_CORRECTIONS` in
`scripts/build-nba-elo.py` re-assert the right values on read, and the generated `seasons/2024.json` is corrected
directly so the site is right now rather than at the next Windows rebuild. The corrections are written to become
no-ops once NBA.xlsx itself is fixed, which is worth doing: **the workbook is still wrong at source.**

**And the check that was missing.** The builder now reconciles reg + post against the final weekly record for every
complete season on every run, allows the Cup finalists by reading `cup-finals.json` rather than hardcoding them,
carries the 1953 pair in `KNOWN_UNRECONCILED`, and prints a loud warning for anything else. Nothing said a word about
this before; that is why it survived as a Backlog row instead of being found.

**Still open, deliberately:** 1953 Hawks and 1953 Warriors each carry one game more in the weekly series than their
season line, with no postseason. Not chased down; they are listed rather than silently tolerated, so the new check
still speaks up for anything new.

No build needed: `lib/nbaElo.ts` is GitHub-raw-first with a 24h ISR and an `nba-elo` tag, which the file's own comment
calls "what makes a data refresh free of a build". The only `app/` changes in this commit are a stale comment and a
test, verified comment-only before tagging `[vercel skip]`.

**Notion:** Backlog row "NBA Elo: 8 team-seasons disagree" closed, with the correction that it was 10 and that the
2024 pair was one workbook error; a new row filed for "NBA.xlsx still has the 2024 Mavericks/Clippers first round as
4-3 and the Clippers postseason as 2-3; fix at source so the build overrides become no-ops".

### R. Nothing could flush the NBA data cache, and nobody knew

Found while shipping section Q. The corrected 2024 data went to GitHub raw fine, but the flush came back
`{"ok":false,"error":"unknown tag"}`.

`lib/nbaElo.ts` tags every season shard `nba-elo` and is GitHub-raw-first on a 24h ISR, which is what makes an NBA
data refresh free of a build. But `nba-elo` was never added to `ALLOWED_TAGS` in `app/api/revalidate/route.ts`, even
though its exact twin `nfl-elo` is listed one line above. So there has never been a way to flush NBA data, and every
NBA correction since that lib was written has quietly waited out the full 24 hours. Nothing failed loudly; the data
just took a day.

Now listed. 🔴 **It is INERT until the next build**, because the allowlist is code rather than data, and it was
committed `[vercel skip]` rather than spending a fourth paid build on a one-line convenience. Nothing is withheld by
that: the section Q data correction ships from raw and reaches production on the ordinary ISR window either way. This
only makes the NEXT NBA correction promptable.

The lesson is narrower than "add the tag": a cache tag and its allowlist entry are two halves of one thing, and this
repo has no check that they match. `lib/nflElo.ts` and `lib/championsCurrent.ts` happen to be complete. Worth a
check that every `tags: [...]` in lib/ appears in ALLOWED_TAGS, which would have caught this the day it was written.

**Notion:** Backlog row filed for "the nba-elo revalidate tag is listed but inert until the next build", and another
for "no check that a lib's cache tag appears in ALLOWED_TAGS; nba-elo was missing for the life of lib/nbaElo.ts".

## 2026-09-18 - windows (Cowork, cloud bridged to the Windows box) -> mini and next session: LOOKUP SYNCED, CAF PRELIMS STOP ALERTING, OWNERS SWEPT (CHELSEA), NOTION MADE THE SOURCE OF TRUTH

No paid build from this session. Everything below is `[vercel skip]` or lives outside git.

### A. Lookup sync (cl-lookup-sync, Supabase only)

Ashwin set `API Name` on the clubs already in the Lookup (sheet 1 of the mini's 09-14 triage) and added no new rows. Diff: 17 countries differed; **16 CHANGE + 1 ADD, 0 REMOVE, 0 HELD**. The 16 are the 15 from the triage plus Atletico Petroleos (`api_name` Petro de Luanda). The ADD is Apollon Pontus FC (Greece), Ashwin's own edit. Applied on his explicit yes (the first attempt was blocked by the session's safety check, which is correct for a shared table). **Verified by hash: 9,954 compared rows, `8c6c1d527eeae65435008eacb1b38db0` on both sides.**

### B. CAF Champions League prelims no longer page anyone (ruling)

Ashwin: "I want the ntfy notifications to stop as I'm not going to add any more African teams unless they make the CAF Champions League group stage (not prelims)." Implemented as an opt-in gate, not a mute:
- `leagues.json` league 12 gains `"lookup_gate": "group_stage"`.
- `refresh.py`: pure `gate_defer()` plus `MAIN_STAGE_ROUND_RE`. A team is DEFERRED only when every league it appeared in this run carries the gate AND none of those appearances is main stage (a standings row, or a fixture round matching group / quarter / semi / final). Deferred teams are not written to `football_team`, do not count as unmatched and do not exit 3, but each is logged by name (`deferred (CAF prelims, ...)`), and the api-name display fallback still names them on the site.
- Self-test covers five planted cases (prelim-only defers; group-stage fixture alerts; standings row alerts; prelim plus a non-gated league alerts; a non-gated league's prelim alerts) and was proven to FAIL with the logic inverted.
- Real round labels in today's bundle are "1st Preliminary Round" and "2nd Preliminary Round"; neither matches. **The group-stage label has never been seen**, so the first run after the CAF draw must show group-stage clubs as UNMATCHED, not deferred. Backlog row filed for the mini.
- The job does an ff-merge at the start of each run, so the next football-standings slot after the push picks this up.

### C. Owners: full sweep, applied today on Ashwin's instruction (not waiting for Monday)

Research sweep 2026-09-07 to 09-18 over every contested row plus new transactions; curation rules from `run-owners-weekly.sh` and `check-owners-watchlist.py`.
- **Chelsea RESOLVED:** Clearlake bought out Boehly's and Walter's stakes (reported combined ~$950m, Bloomberg 16 Sep, CNBC 17 Sep), now 99.9% and sole controller; Boehly stepped down as chairman; Wyss keeps an economic interest without control. Dodgers row text that said Walter holds a Chelsea stake corrected.
- **Timberwolves / Lynx:** no NBA release or official recap of the 14-15 Sep BoG mentions the Stad sale; presumed pending; review moved 09-18 to 10-16. Not proof of non-approval: WebFetch was blocked on startribune.com and sportico.com. **Mini, Monday's run: check a Minneapolis source.**
- **West Ham:** moved, not resolved; completion expected end of September with reported post-completion stakes noted.
- No change: Lakers (not on the docket), Crystal Palace, Sevilla, Sounders, Whitecaps, Earthquakes, Lightning, Angels.
- Flagged, not applied: Giants (Koch 10%) and 49ers (Briger 3.2%) minority sales approved in Oct 2025 are missing from those rows' minority text. Pre-dates the window; left for a curation pass.
- Gates: build self-test 16/16, 220 franchises, `check-owners-watchlist` OK (11 contested, none due). Runtime read with tag `owners`, so no build; there is no revalidate secret on this box, so the hourly ISR window publishes it.

### D. Notion: why it went stale, and the fix

Measured today: six Backlog rows open for finished work (Sweden, three NFL Friday watches, NRL finals, evening news), one item duplicated, and **no Decisions row since 09-11** although about ten rulings were made. Causes: the Notion rule was one paragraph of advice while HANDOFF had a standing rule; the mini had no ids (they lived in Windows memory); nothing checked; and scheduled jobs had no home at all.

Fixed:
- **Notion operating contract** page (under Citizen of Nowhere): what lives where, start / during / end duties, the trigger table.
- **Scheduled jobs** database: 90 rows, every job on every machine (31 dispatcher jobs, launchd agents including the newsletter ones, 34 workflows, 13 Claude cloud tasks, 3 Windows tasks, healthchecks). Built from the REPO copy of `jobs.toml`; Backlog row for the mini to reconcile against the live copy.
- **CLAUDE.md** section rewritten as a hard rule with every database id inline, so the mini no longer depends on Windows memory.
- **`.githooks/pre-commit`**: a commit that adds HANDOFF lines without a `**Notion:**` line is rejected (`SKIP_NOTION_CHECK=1` overrides loudly). Tested in a temp clone, five cases plus deletion. `core.hooksPath` is already `.githooks` on Windows; confirm on the mini.
- **Notion reconciler**, Claude cloud task `trig_01MeTbjkpBua9UMypHz7KRFh`, daily 06:30 UTC: closes finished rows, adds missing rulings and jobs, files doubts, logs one line on the contract page. A backstop, not the process.
- Reconciled today: 8 Backlog rows closed, 5 added, 11 Decisions rows added (09-13 to 09-18).

Found by the inventory, for Ashwin: the Windows task "Daily Newsletter Digest" has failed daily since 29 June (81 missed runs) while the mini runs the same pipeline. Backlog row filed; likely a leftover to retire.

**Notion:** Backlog closed 8 (NFL seeds watch, NFL Friday refresh, NFL hand dispatch, NRL finals, Sweden, evening news, 45 AFC/CAF clubs, duplicate build-cap row), added 5 (Windows newsletter task, CAF group-stage regex check, reconciler first run, live jobs.toml reconcile, stale REBUILD-RUNBOOK table); Decisions added 11; Scheduled jobs database created with 90 rows; Notion operating contract page created.

## 2026-09-18 — mini → next session: a SUCCESSFUL promotion failed the job; the season 2025 row is correct; ntfy reviewed

### A. gap-league-watch failed for doing its job right

Failed its 05:00Z slot, ops-autofix re-ran it, it failed again and was left for a human. Fixed in `0731cb049`.

The watcher auto-promoted CONCACAF Nations League on 09-17 (`3df23071c`), so 536 left `leagues_pending.json`
exactly as designed. The self-test then asserted `{ids with nations_auto} == {536}` against the LIVE file, which a
successful promotion could only fail. Line 174's `next(e for e in _p if ... == 536)` would have raised
`StopIteration` immediately after, so fixing the assertion alone just moved the error, and the 323 lookup beside it
was primed to break the same way the day the Indian Super League promotes.

**Third instance this week of a self-test encoding a transient state as an invariant**, after `wnba_finalize`'s
fortnight shape and its window assertions. The pattern is now worth naming: a test that pins today's data rather than
the rule will reject the correct future state, and because it runs as a gate before `--write`, it blocks the fix and
passes the bug. It now asserts the rule, that nothing skips the club-Lookup gate unless it is a known national-team
competition, against whatever the file holds.

🔴 **The first rewrite leaked, and an adversarial probe caught it, not review.** Gating on `nations_auto()` meant a
club competition carrying `auto_promote: true` with `comp_type: "continental"` returned False, dropped out of the
set, and sailed through the very check meant to stop it. The old `== {536}` form caught that case only as a side
effect of demanding exact membership. Now gated on the raw `auto_promote` flag, with three planted cases proven to
fail: continental plus auto_promote, an unknown international id, and no comp_type at all. **Plant a bad row and
watch the test fail before believing a guard works.**

### B. The `season: 2025` row in leagues.json is CORRECT

Worth writing down because it looks like a bug and is not. api-football labels the CONCACAF Nations League campaign
that runs 23 Sep to 11 Nov 2026 as season **2025**: id 536 numbers a campaign by the year it STARTS, 880 by the World
Cup it feeds, 36 by the year it ENDS. `classify`'s window variant takes the season year verbatim and ignores the
target year, which is why `season_used` is 2025, and `refresh.py:465` passes that same label to `/standings` and
`/fixtures`. Querying 2026 would return nothing. Do not "fix" this to 2026.

### C. ntfy over the last 12 hours: six messages, nothing unexplained

Two `[ALERT] gap-league-watch FAILED` (05:05Z, 06:29Z) plus the ops-autofix note, all section A. Two
`football: unmatched team(s) -- add to Lookup` (23:04Z, 05:07Z), the standing Neftchi / Johor Darul Takzim backlog
that Friday's Windows session is booked to clear. One Daily Ops Sweep at 01:15Z reporting **31 jobs ran, 0 failed, 0
missed, the first fully clean window**, and flagging Formula E data as overdue. No unexplained pages.

**Still open:** Formula E is overdue per the 01:15Z sweep, and `run-gap-league-watch.sh` still calls `push()` only
from `fail()`, so a promotion goes live silently. A wrong promotion would be equally silent.

### E. MLB and NPB in the event strips, and Coming up widened to a week

All three sit UNPUSHED in the shared tree as of this entry: Ashwin said "wait" on the build. `liveData.tsx` modified,
`lib/mlbFixtures.ts` and `lib/npbFixtures.ts` new and untracked. Build passes, exit 0. One paid build covers all three
when he says go.

**Coming up is 7 days, results and On today unchanged.** `COMING_DAYS` 3 to 7. Ashwin then said "keep it at 3 days for
results and upcoming", which was already true and was verified rather than assumed: `COMING_DAYS` feeds only the
`coming` filter, results use `RESULTS_BACK_MS` (72h) and On today uses `todayWindow`. Measured by serving the build:
Coming up 135 to 202 fixtures before baseball, page weight up 0.4%.

**MLB overrules the 2026-09-11 ruling.** That ruling is quoted in `mlbBlock` ("the playoffs must show, fifteen
regular-season games a day would make the list too long") and is why MLB was invisible all September: the postseason
ledger has 0 rows until the bracket exists. Ashwin overruled it on 09-18. Both sources now feed the strips, postseason
ledger first so a bracket game keeps its label, then the live scoreboard.

`lib/mlbFixtures.ts` is ONE REQUEST PER DAY across a 13-day window, not the month form: a month of a 15-game-a-day
league is far more than the window needs and large enough to worry the 2 MB data-cache item limit. Raw bodies are
fetched `noStore` (2.4 MB across the window) and the SHAPED result is what `unstable_cache` holds, the same lesson as
`getCfbStandings`. Confirmed in the build log: the only data-cache warning is the pre-existing `companies.json` one.

🔴 **A bug this caught before shipping: ESPN sends `score: "0"` on games that have NOT been played.** Replaying the
shaping against the live feed showed tonight's fixtures coming back 0-0, and `collectEvents` treats any event carrying
a score as a RESULT, so every scheduled game would have rendered as a 0-0 final and vanished from On today. Scores are
now gated on `state === "post"`, not on the field being present.

**NPB uses SPAIA, not Flashscore.** Ashwin suggested Flashscore; SPAIA returns real JSON, is already trusted here for
the ladder, and is already shape-checked daily by the mini's feed monitor. Flashscore is JS-rendered and scraping it
would be fragile and against its terms.

🔴 **SPAIA's `game_schedule` is TODAY ONLY.** `Month`, `DateJPN`, `From`/`To`, `GameKindID`, `LeagueCD`, `TeamID` are
all ignored: every variant returns the identical rows. So NPB fills On today and Recent results and CANNOT fill Coming
up. Anyone wanting NPB fixtures further out needs npb.jp's monthly page, which carries the full month as
Japanese-language HTML and means a real parser, not a quick patch.

Also checked before raising a false alarm: 18 Sept returned three games, all Central League, and npb.jp's own index
confirms three games that day (Tokyo Dome, Yokohama, Koshien). **A short card is a quiet day, not a truncated feed.**

**Verified live, by serving the build:** On today 20 to 38 fixtures (18 Baseball: 3 NPB, 15 MLB), Recent results 64 to
113 (49 MLB finals with real scores), Coming up 202 to 293 (91 MLB). `/api/on-today` carries the baseball items too.

**Method note, and it is the fourth this week.** Three times in this session I concluded something was MISSING by
reading a truncated slice: Aussie Rules "absent" from all strips (it was in On today), and Baseball "absent" from
Coming up twice, when it sat at offset 14,233 of a 9,000-character read. Each time the executed check said the
opposite. Grep for the thing itself, or print the whole section; never conclude absence from a prefix.

**SHIPPED, superseding the "all three sit UNPUSHED" line above.** Ashwin said go; `8ea042238` pushed alone as HEAD
(`touches_build=1 tagged=0`), one paid build, live at 11:46Z about six minutes after the push. Verified on production
by searching for the rows themselves rather than a slice: On today 38 fixtures across 7 sports with a Baseball group
of 18 (15 MLB, 3 NPB), Recent results 113 across 5 sports (49 MLB finals), Coming up 293 across 7 sports (91 MLB).
NPB correctly appears in On today only, which is the SPAIA today-only ceiling described above, not a fault.

One note for whoever runs the em-dash check next: a whole-file `grep '—'` on `liveData.tsx` reports 8 hits and blocks
the commit, but they are all pre-existing, and one of them is `const DASH = "—"`, the display character itself. The
check that means anything is the added-lines one, `git diff -U0 <file> | grep '^+' | grep '—'`.

## 2026-09-17 — windows → next session (NBA season hubs, NHL odds, and two constants that were wrong)

Cowork session. Two commits, one production build: `b9202b255` (builders, `[vercel skip]`) then `2f9a0f0d5` (app + lib + data, build-relevant, at the push HEAD). `npm run verify` green before the push. Deployment `dpl_HeBTthpr1zUfPcVZdhxbmEUzgh5b` reached **READY** and `rankings.citizenofnowhere.org/teams/nba/season` serves the 2026-27 shell. **Two paid Vercel builds today, which is the whole budget** — the other was the mini's CFB poll-rank commit `18eb6a0cd`.

### A. THE NBA ELO IS AN EXTERNAL SERIES. WE CANNOT COMPUTE IT.

This is the load-bearing finding and it is the OPPOSITE of the NFL, so anyone porting `build-nfl-elo.py` will assume wrong. Established by measurement, not by reading:

- `NBA_RegSeason` "Formula Backup" carries a damped MOV shift formula that looks exactly like the NFL's (K=9.3, HFA=65). Replayed against 30,958 rated team-games it reproduces **nothing**: mean |diff| 3.26 Elo, worst 16.47, and the ratio to the real column is not constant (sd 0.13 over 5,286 rows) so it is not a fittable scale constant.
- That formula belongs to column **BP, whose header is the keyboard-mash "sdfd"**, and which is EMPTY for every recent season. An abandoned attempt, not the generator.
- The real column, BL "ELO Shift", is exactly `BM - BI` in **99.39%** of rows. So ELO-Post is the primitive, not the derived value.
- ELO-Post is not internally generated either: a self-consistent pairwise Elo is zero-sum by construction, and this one is zero-sum in only **63.26% of 15,317 game pairs**. That asymmetry is the fingerprint of a published, rounded, editorially adjusted series being pasted in. The 2026 preseason seeds carried injury adjustments (Pacers −136, 76ers +143, Celtics −131) that no formula reproduces.

**Consequence:** the 2026-27 season refreshes by REREADING the workbook after Ashwin updates it on a Sunday, not by carrying a chain forward in Python. `--audit` replaces `--replay`: it gates chain continuity rather than pretending to regenerate. 27 historical breaks are baselined, all pre-1984 except the **8 Mar 2008 Hawks/Heat game replayed from the 51:50 mark** (the only replayed game in modern NBA history) and a Hornets/Pelicans naming split. Named in an allowlist, not silenced, so a twenty-eighth still fails.

### B. THE NHL PLAYS 84 GAMES FROM 2026-27, AND 82 WAS IN SHIPPED CODE

The new CBA (term began 2026-09-16) expanded the regular season for the first time in 33 years: 1,344 games, both added games intra-division. **ESPN returned 84 per team and I treated it as a feed bug** because 82 was the number in my head; Ashwin corrected it. Two shipped call sites passed 82 (`liveData.tsx` nhlBlock, `app/teams/nhl/[slug]/page.tsx`), which ends the season two games early: once every club reaches 82, `min(games) < 82` goes false, the board closes itself and the live rows vanish with two games still to play. The number now lives once, in `GAMES_PER_SEASON` in `lib/seasonWindows.ts`.

🔴 **That fix opens a new exposure, and `lib/seasonWindows.test.ts` asserts it rather than hoping it away.** A completed 82-game table now reads `82 < 84` = true, so if ESPN is still serving last season when the October window opens, the board goes LIVE showing a finished table. Not hypothetical: on 2026-09-17 ESPN was still serving the completed 2025-26 season as seasonType 2. Only the calendar window stops it. If it bites, gate on the payload's own season year; do **not** put 82 back.

### C. NHL PRESEASON MISLABEL, CAUGHT 12 DAYS BEFORE THE OPENER

`lib/nhl-standings.ts` and `lib/nba-standings.ts` keep private copies of the shaping logic and never inherited the 2026-09-04 NFL fix. Both ended their ladder at `"unknown"`, so `is_preseason` fell through to "are all the records zero", and preseason records are not zero. **My first fix was wrong**: I ported the NFL's `seasons[].types[]` calendar fallback, then measured live ESPN and found neither league sends `season.type`, a `seasons[]` array, or any date field in 98 KB of payload. The only season-type field either carries is `seasonType`, nested under `children[].standings`. Measure the payload before fixing the parser.

⚠️ **Still unverified, and unverifiable until about 20 Sep:** whether ESPN flips `seasonType` to 1 during preseason at all. Check the NHL board between 20 and 28 Sep and record what it did.

### D. NBA SEASON HUBS

`/teams/nba/season` and `/teams/nba/season/[year]`, 81 seasons from 1947, built to match the NFL's. Weekly rating race, week scrubber, sortable standings, playoff bracket (the two conferences either side of a dotted rule, the Finals at the right), the twenty best games by the workbook's frozen Game Score, and the individual honours from the Awards and All-Stars sheets. The hub opens on **2026-27**, an `"upcoming"` shell carrying the field only — a status kept distinct from `"seeded"` because a page that conflates them draws an empty chart. It disappears on its own once the workbook carries the season.

**ERA NAMES EVERYWHERE, CANONICAL ONLY AS A LINK.** A 1978 bracket reading "Thunder" is wrong: that club was the Seattle SuperSonics. Verified on 1979 across bracket, standings, top games and All-Star.

Two mistakes worth keeping: the award-order list said "MVP" and the sheet says **"Most Valuable Player"**, so the headline award silently sorted LAST, under Coach of the Year. And the standings shipped with `data-static-sort` plus an argument for why they were the exception; the argument was wrong on the facts (`SortableBoard`'s `rank` renumbers) and wrong on the principle (sortability is a standing rule, per Ashwin).

### E. NHL PLAYOFF AND CUP ODDS

`scripts/predictions/build_nhl_sim.py` runs Monte Carlo on ESPN's real schedule into `public/data/nhl-sim.json`, read by `lib/nhlSim.ts` and rendered as `PO%` / `Cup%` in `nhlBlock`. Two constants **measured** from 13,511 games in NHL.xlsx: **22.46%** of games go past regulation, the home side wins **54.04%**. The three-point game is modelled explicitly; without it every points total runs about 9 low per season. Mutation testing found the bracket self-test could not see wild cards swapped between halves, so that assertion now exists.

⚠️ **No market blend.** `meta.market` is null and the page says so. Regulation wins are approximate for completed games: the schedule feed gives a final score with no period detail.

### F. THE ELO CHART IS NOW ONE COMPONENT

`app/teams/_shared/SeasonEloChart.tsx` and `WeekScrubber.tsx`, with both sports' old paths left as re-export shims. The scrubber especially HAD to be shared: it is a React context, and two copies are two different contexts, so a page mixing them loses the scrub silently, with no error anywhere. Axes read in dates rather than the workbook's week counter, marking the year at the January crossing. A hover no longer outlives the pointer **on mouse only**: touch fires `pointerleave` on lift, which is the one moment a phone reader wants the reading to stay.

### Housekeeping / open threads

- 🔴 **`tsconfig.json` includes the DEV SERVER's generated types in the production typecheck** (`.next/dev/types/**/*.ts`, plus a duplicated-looking `.next/dev/dev/types/**/*.ts`). So `npm run verify` type-checks files Turbopack is actively rewriting. This cost real debugging time today: `Type error: Cannot find name 'ecific'` was a torn write in `.next/dev/types/validator.ts`, not a typo anywhere in the repo. **Do not run `npm run dev` and `npm run verify` at the same time.** I also killed Ashwin's dev server repeatedly with `Stop-Process -Force` on all node; don't.
- The `DEP0205 module.register()` warning on every node command is `@tailwindcss/node@4.2.2`. **4.3.3 fixes it** (prefers `registerHooks`), it sits inside the declared `^4.2.2` range, and CI runs Node 20 so it never reaches a build. Local noise on Node 26 only. Ashwin's call whether to bump.
- NOT DONE: the weekly Sunday job that restages both NBA workbooks and reruns `build-nba-elo.py --audit` then `--write`. Until it exists the NBA Elo only updates when someone runs it by hand.
- NOT DONE, and explicitly asked for: **NFL awards and Pro Bowl in the NFL year hubs.** `build-nfl-data.py` already emits `award-winners.json` and `pro-bowl-counts.json`; they need a by-year slice and a component mirroring `SeasonHonours.tsx`.
- NOT DONE: validating the NHL sim against NHL.xlsx's own "2026 Projections" logreg Cup odds, which was the agreed benchmark.
- The mobile probe was NOT rerun after the last few edits (sort keys, season jumper, honours). Typecheck and full verify are green; the 390px numbers are from one revision earlier: season pages 7.0 to 7.7 phone screens, the 2027 shell 3.1, the index 6.7, no page-level horizontal scroll anywhere.

## 2026-09-17 — mini → next session: HANDOFF entries are now written WITHOUT ASKING (standing rule); first clean night since the ESPN outage

### A. Standing rule from Ashwin

**Always add work to HANDOFF without asking.** Ruled 2026-09-17 after he had to say "add it to HANDOFF" three
times in a row for entries that were already written, which made the ask pure ceremony.

Treat the entry as part of the definition of done for a change, alongside the code and the verification: write it
before reporting the work finished, commit it in the same push or the adjacent one tagged `[vercel skip]`, and do
not report "added it to HANDOFF" as a separate accomplishment. Record the reasoning and the mistakes, not only the
fix. The entries that have earned their keep are the ones saying why something was built differently from how it was
asked for (09-16 section G) or which assumption turned out false (09-16 section H). The no-em-dash rule stands, and
stale open items still get closed in place with a marker rather than left reading as outstanding.

### B. Overnight: nothing failed

First night with no GitHub Actions failure at all since the 09-15 ESPN outage began. Every scheduled run since
18:00Z yesterday is green, including AFL + NRL at 00:15Z and 10:38Z (the finals data the 09-16 fix unfroze, now
refreshing unattended), Majors at 10:08Z, ESPN standings snapshot at 05:00Z and the staleness dead-man's switch at
04:39Z. `Test` is green across every push.

`feed-monitor` ran on schedule at 07:24Z and logged `ok` for all 18 entries, including the two new date-form canary
rows from 09-16 section G. That is the canary's first unattended run.

**Still unproven:** the WNBA fix (`de5c233a4`) has only been verified by my manual dispatch. Its cron is written
`0 8 * * *` but GitHub has actually fired it between 11:00Z and 14:00Z every day this week, so at 10:41Z today's run
had not started yet. The first scheduled confirmation is due later today. If it fails, the place to look is
`_windows()` in `wnba_finalize.py` and the self-test assertions immediately above it, both rewritten yesterday.

### C. Carried forward, unchanged

Nothing yet alerts when a frontend reader swallows an upstream error with `return []`, and the 09-16 canary cannot
see a caller still using a dead upstream form: it checks that ESPN's forms work, not that our code uses the working
ones. Other readers converted in `6edc58ecb` may still have the silent trace gap from 09-15.

### D. Live standings: college football events showed a frozen poll rank

Ashwin reported that On today / Recent / Upcoming for college football carried the wrong ranking, and that it should
show AP until the CFP rankings exist, then CFP. Fixed in `18eb6a0cd`, verified live at 11:11Z.

**Cause.** The labels read `g.ap` from `cfb-predictions.json`. `build_cfb_sim.py:1084` stamps that field ONCE, when
the job first adds a fixture, so the label froze at whatever rank the team held that week. Miami read `#7` from its
Week 2 entry while the live AP poll had it 5th; Ohio State read `#1` against an actual 6th. It is wrong in both
directions over a season: a team that drops out of the Top 25 keeps its number forever, and one that climbs in after
its fixture was added shows nothing at all, because the stored value is null.

`cfbBlock` already held the live snapshot. It calls `getCfbRankings()` on its first line and renders it in the table
immediately above the strip. The events strip simply never read it.

**The CFP half needed no new code.** `lead` is `s.polls[0]`, ordered CFP, AP, Coaches by `POLL_ORDER` in
`lib/cfb-live.ts`. Joining the labels to the lead poll means they follow whatever poll the block is already showing,
so when ESPN starts publishing CFP in November the labels switch on their own. Measured 2026-09-17: ESPN's rankings
feed carries AP, AFCA Coaches, FCS, DII and DIII, and no CFP poll, which is why AP leads today.

**The join is not name equality, and that was the trap.** ESPN says "Miami" and "Ole Miss"; the poll rows carry the
canonical "Miami FL" and "Mississippi" because they pass through `resolve()`. A raw join would have silently dropped
exactly the ranked teams, producing a page that looked fine and showed no ranks. Exported `canonicalSchool()` from
`lib/cfb-live.ts` reusing the existing private `resolve()`, rather than copying `CANONICAL_OVERRIDE` to the call
site: a duplicated lookup drifting from its original is precisely what broke `wnba_finalize` on 09-16.

**Ruling.** Ashwin chose live rank everywhere, completed games included, so Recent results agrees with the table
beside it instead of showing two different numbers for the same team. The frozen `g.ap` stays on `/predictions/cfb`,
where the rank at prediction time is the honest number for an accuracy ledger.

**Verification, in the order it was done.** Replayed the join in Python over the real slate against the live AP poll
BEFORE spending a build: 7 of the first 10 upcoming labels changed, 25 ranked-team hits, and the three unresolved
names (Eastern Washington, Northern Iowa, Portland State) are unranked FCS visitors that correctly take no prefix.
Then `typecheck`, `check:live-data`, `check:data-reads` (1115 files) and a full `npm run build`, exit 0. Pushed alone
as HEAD so Vercel read the build-required rule from the right commit. Polled production until the label turned over:
`#7 Miami` to `#5 Miami` at 11:11Z, about four minutes after the push.

**Worth knowing for November.** The ledger's scope is still "games involving AP Top 25 teams only", so when CFP goes
live the labels will read CFP while the slate is still SELECTED by AP involvement. Defensible, but it is a second
decision hiding behind the first, and it belongs to `build_cfb_sim.py`, not to this page.

---

## 2026-09-16 — mini → next session: ESPN DROPPED `dates=A-B` SITE-WIDE; every caller moved to season, month or per-day queries

Ashwin asked why the morning was full of ntfys and GitHub emails, then "fix the python callers now and do the
standings fix too". Five of the seven pings came from one upstream change.

### A. The break, and what it cost before anyone noticed

Between 2026-09-15T15:53Z (last good run) and 09-16T00:04Z, ESPN's team-sport scoreboards began rejecting **any**
hyphenated `dates=A-B` range with HTTP 400, including a one-day range. Bisected by the daily sweep and re-measured
here: single date, month (`202609`) and year (`2026`) all still answer 200. Golf and tennis do NOT 400, but a range
there now returns almost nothing (`golf/pga` 0 events against 2 for the month, ATP 1 against 5), which is worse,
because it is silent.

- `AFL + NRL season refresh` failed 00:04Z and again on its autofix rerun; three reruns, three ntfys, GitHub emails.
- `mlb-sim` failed 07:00Z, "failed leagues: afl, nrl" (the 08:17 "CoN mini job" ping).
- `lib/espnScores.ts` swallowed it with `return []`: the Recent results strip lost every ESPN-supplied final and
  nothing logged it.
- AFL/NRL `finals.json` froze at 09-15 15:54Z, with AFL preliminary finals on 09-18/19 and the Grand Final after.

### B. Python callers (`e7c8ab06b`, no build)

One shape per call site, each measured live before committing:
- **Whole-season windows -> `dates=<season>`:** `footy_finals.py`, `build_season_sims.py`. AFL `dates=2026` returns
  226 events of which `parse_finals` keeps exactly the 10 finals; NRL 213 -> exactly 6. Same bundles the last good
  run committed.
- **Fortnights -> MONTHS:** `build_mlb_postseason.py`, `wnba_finalize.py`. A month keeps both old scars at bay (a wide
  range silently caps at 100 events and ignores `seasontype`; `limit=` truncates WNBA): mlb `202610&seasontype=3` = 45
  events, wnba `202609` = 38.
- **`build_nfl_sim.py` `played_results`: months + a `season.year` guard.** The bare year is NOT safe here: `dates=2026`
  returns from 2026-01-03, i.e. LAST season's playoffs, and the filter keys on season TYPE only. `scan()` (upcoming) is
  per-day.
- **Per-day across the horizon, deduped by event id:** `build_meta_market.py`, `build_pl_sim.py`, NFL `scan()`. A failed
  day costs that day, not the window.
- **`majors_ingest.py`: the 14-day lookback becomes month queries** (current, plus previous when the window straddles),
  because a range there fails silently rather than loudly.

Self-tests all pass: footy_finals 19 checks, wnba 88, season sims 27, nfl 79, meta-market 56, mlb postseason 8, pl 53.

### C. The two frontend readers (`de5721381`, one paid build, LIVE and verified)

- `lib/espnScores.ts`: one request per feed per DAY across the results window, deduped (ESPN answers a single date with
  a neighbouring late kick-off), capped at `DAYS_MAX` 8 so a widened window cannot fan out.
- `lib/wc2026Standings.ts`: both readers share a new `koEvents()` over `dates=202606` and `202607`. The year form is not
  a substitute: `dates=2026` caps at 100 events and stops on 12 July, before the Final (202606 = 79 events, 202607 = 25
  ending 07-19).
- `npm run verify` in a scratch worktree: typecheck, every check:*, vitest 294, pytest 112, `next build --webpack`,
  function-size. Live at 09:39; the page cycles HIT -> STALE -> HIT on the new code.
- **Recent results still reads "150 results across 7 sports", and that is correct:** every ledger game played 09-12 to
  09-15 is already graded, so the ESPN merge has nothing to add today. It earns its keep this weekend, when finals land
  before the grading jobs run.

### D. Jobs put back green

`footy-refresh` re-run on the fix: success, committed `587d334b0`, so AFL/NRL data is live again ahead of Friday.
`mlb-sim` re-ran from the shared tree (exit 0, pushed, revalidated, every warm 200) and its 07:00Z slot is
`--mark-ok`. `detect_issues.py`: 0 findings.

### E. Mistakes worth not repeating

- **The first push of B silently did not land.** `git rebase` refused because the two `lib/*.ts` files were unstaged in
  the same worktree, so `push` was a non-fast-forward and only my local echo said "pushed". I then dispatched
  `footy-refresh` and watched it fail on the OLD code at the old line number. Stash the unrelated changes, rebase, push,
  THEN confirm with `git merge-base --is-ancestor HEAD origin/main` before dispatching anything.
- **`mlb-sim`'s 09:23 autofix rerun failed for a stale reason:** the shared tree had not been pulled, so it ran the old
  range. Pull `~/Projects/Metro Area Project` after pushing a job fix; the jobs run from that clone, not from a worktree.
- Two of my own read errors, both caught by checking rather than assuming: `footy_finals.build()` returns
  `meta`/`weeks`/`premier`, not `games`, so a first probe printed "0 finals" for a working fetch; and counting
  "ungraded" ledger rows without excluding FUTURE fixtures made the strip look half-dead when it was not.
- A `urllib` probe of the live site with `Cache-Control: no-cache` got 403 from the edge; `curl` was fine all morning.

### F. Also today

Another session fixed the cricket REVIEW ntfy that arrived with only its header lines (`21c47d243`, 08:22): the
wrapper's `grep -iE 'REVIEW'` kept the header and dropped the items under it, now an awk block. That was the gap
recorded in 09-15 section B.

**Open:** add a range-versus-single-date probe to `feed_shape_monitor.py`, so the next silent ESPN parameter change is
caught by a job rather than by a finals bracket freezing. The Silent failure register row from 09-15 (a route's data
missing from its bundle) has a sibling here: two frontend readers swallowed a 400 with `return []` and nothing logged.
**CLOSED same day, see section G.**

### G. The ESPN date-form canary (closes F's open item)

`feed_shape_monitor.py` now carries two entries, `ESPN date forms (soccer)` and `ESPN date forms (golf)`, via a new
`fetch_espn_date_forms` fetcher and `check_espn_date_forms` validator. One team sport (the loud case, read per-day by
`lib/espnScores.ts`) and one non-team (the silent case, months in `majors_ingest.py`).

**It is deliberately not the probe the open item asked for.** A literal range-versus-single-date check would compare a
form nothing reads any more against one everything reads, so it would FAIL on every run from now on. That is permanent
noise, not detection. Inverted instead: it asserts the three forms the callers moved to on 09-16 (`dates=YYYYMMDD`,
`dates=YYYYMM`, `dates=YYYY`) still answer with a well-formed `events` array, and FAILs when one of *those* breaks.
That catches the next change in whichever direction it comes, which is what the open item actually wanted.

Two design points worth keeping:

- **The probe day is two days back, not today.** A quiet today would otherwise read as a broken parameter.
- **A working range is a note, never a failure, and only when it returns events.** First run exposed why: golf answers
  200 with **0 events** to a range and always has. That is precisely the silent shape that hid the 09-15 break, not a
  recovery, and noting it every run would be wallpaper. The count has to be non-zero to earn the note.

It also FAILs when the month form returns fewer events than the single day, which is the silent-truncation shape
itself rather than an outright error.

Verified before it went live: all eight failure paths fire on synthetic docs (each form erroring, all three at once, a
renamed `events` key, the truncation shape), off-season stays a soft `empty`, and the full 18-entry registry is green,
so the real run was silent. Live copy synced, `dispatcher.py --check-sync` in sync, run logged `ok` at 09:56. No
healthchecks change: this rides the existing `feed-monitor` slug at 07:20 UTC.

**Still open from F:** other readers converted in `6edc58ecb` may have the same silent trace gap, and nothing yet
alerts when a frontend reader swallows an upstream error with `return []`. This canary watches the upstream, not the
swallowing.

### H. The WNBA failure emails, and the assertion that hid the bug

Ashwin asked about the constant GitHub Action failure emails. Measured rather than guessed: 42 failures in the last
200 runs, but 15 are `Test` from July and early August, and `Test` has been green for 45 straight pushes since. The
WWC tracker's cron is already commented out, so its four stopped after 09-15. Majors 09-12, NFL Elo 09-08 and CFL
08-31 are one-offs predating the outage. The only thing still failing on a schedule was **WNBA season refresh**,
daily, and that one was mine.

**The bug.** This morning's `e7c8ab06b` rewrote `_windows()`'s docstring in `wnba_finalize.py` to say months and left
the body building fortnight ranges. The 13:09Z run failed on `833002ee8`, a tree that already contained the "fix", so
this was not a stale-tree artifact. All eight URLs it generated 400d. Fixed in `de5c233a4`: 29 postseason events
against 0 before.

**The part worth remembering is not the bug, it is the self-test.** It already executed `_windows()` and asserted
`len(x) == 17 and "-" in x`, which is to say it demanded the exact form ESPN had dropped. The workflow runs
`--self-test` immediately before `--write`, so that assertion would have REJECTED a correct fix and PASSED the broken
one. An assertion that encodes the bug is worse than no assertion, because it converts review into rubber-stamping.
It now pins the month shape and forbids a hyphen outright, and the docstring carries a note saying the body is what
is checked.

**Method change, applied same day.** Having missed one caller by reading its comment, I re-swept all seven others
from `e7c8ab06b` by EXECUTING their URL builders and probing what came back, not by reading what they claimed:
`majors_ingest` months (golf 2 events, tennis 5), `build_nfl_sim` months (48) and per-day, `build_meta_market`
per-day, `build_pl_sim` per-day, `build_season_sims` season year (AFL 226, NRL 213). All returned real events. WNBA
was the only miss. Comments in those files were accurate, but that was luck, not verification.

**Note for the canary in section G:** it did not catch this and could not. It asserts ESPN's forms still work, and
they do. A caller still using the dead form is invisible to it. The gap between "upstream is healthy" and "our
callers use the healthy thing" is still unmonitored.

**Deliberately not done:** turning off GitHub's Actions failure email. It did its job here, surfacing a real break
that would otherwise have sat until the next finals weekend. With WNBA fixed the volume should fall to near zero on
its own, so the setting stays until there is evidence it is noise rather than signal.

## 2026-09-15 (late) — windows → mini (Zone Zero Cup: tiers, weekly snapshots, season boards; a Wikipedia attention prototype)

Ashwin was shown index.evidense.io by its owner and asked what the site could take from it. Four ideas
implemented on the Cup, plus a prototype for the fifth. Commit `TBD-on-push`, one real build.

### A. WHAT EVIDENSE ACTUALLY IS, AND WHY IT IS WORTH COPYING

A monthly ranking of the 43 Olympic International Federations on **demand**: Wikipedia readership across 16
language editions weighted by market size, plus Google Trends, rescaled 0-100, summer and winter ranked
SEPARATELY, tier letters A-E plus W and NEW, and a YoY arrow that compares each federation with the **median
of its group** rather than with zero. Their own framing is the sharp bit: "attention is not demand and not
revenue; it is an early signal of both."

Every index we run is the opposite half: supply. Titles won, things built, rankings held. That asymmetry is
the reason this was worth an afternoon.

### B. SHIPPED ON THE CUP

- **Tiers A-G on merit breakpoints, not rank quantiles.** The distribution is 191.2 to 0.0 with a median of
  3.2, so quantiles would force equal counts across a savagely skewed field. Cuts are round numbers, published
  in `_meta.method.tierCuts`, and the page prints them and the live counts (6 / 11 / 23 / 33 / 36 / 44 / 46,
  plus 41 untiered). **Six bands left F holding 105 of 240, which is not a band**, hence seven. `tier_of()`
  takes the ROUNDED merit so the letter and the printed number cannot disagree on screen.
- **Weekly snapshots -> `public/data/zone-zero-cup-history.json`.** Merit only, ~3.4 KB a run, one snapshot
  per DATE (a re-run replaces, never appends a second point), capped at 160 snapshots. Written LAST, after
  every existing guard, because a snapshot of a board that was refused would poison the series for a year and
  the series is the one thing here that cannot be rebuilt from current data.
- **Movement vs the continent median, not vs zero.** With an 8-year half-life every nation drifts weekly, so
  an absolute arrow would mostly report which flagship tournaments fell in the window. Percentage change,
  floored at merit 2.0 so the bottom of the board does not generate noise. **The window is honest: it says
  "vs N weeks" and lengthens on its own toward 52.** Today N = 0 and the column is not rendered at all.
- **Winter and Summer views.** Two more entries in the existing `VIEWS` toggle, so no new table. Winter is
  recomputed at `WINTER_WEIGHT = 1.0` (mutate-and-restore, this file's own idiom from HALFLIFE_LOCKED) or it
  would be the blend again at half scale. The winter sport set is DERIVED from the medal data each run (a
  sport is winter when it has more winter than summer medals), which correctly keeps Ice Hockey and Figure
  Skating on the winter side despite 1908/1920.
  **Verified no leak: `compute()` before and after `season_boards()` gives zero merit drift.**
  First findings: Norway 20th overall / 3rd winter / 25th summer, Austria 36th / 7th / 48th, Canada 1st on
  winter ahead of the USA and Norway.
- **A scope line under the description**, in the spirit of their "attention is not demand" sentence: what the
  Cup measures and what it does not.

🔴 **Honest narrowing, and say this before anyone "completes" it:** a Cup winter board is NOT their
summer/winter split. Winter here exists only inside the Olympics pillar plus ice hockey's own competitions,
because every other pillar is a summer or year-round sport. It is a winter-SPORT board, not half the Cup.

### C. `scripts/attention/wikipedia_attention.py` — PROTOTYPE, NOT WIRED TO THE SITE

Wikimedia REST pageviews across 16 weighted editions. **No Google Trends, deliberately**: no official API,
every route is a scrape, and this repo has already lost jobs to exactly that (the ESPN UA flip, WDQS limits).
Writes nothing to `public/data` and refuses to if asked. `--self-test` is offline and passes.

Pointed at one question: do the hand-set PRESTIGE weights match measured attention? **Spearman 0.82 over 15
sports.** Football and cricket 1-2 on both. Three sports move 4+ places, all the same direction, all rewarded
more by the Cup than they are read about: **Ice Hockey (8th attention / 4th prestige), Athletics (12th / 8th),
Road Cycling (15th / 10th)**. Road cycling only became a pillar on 2026-09-04, so that one is worth a look.

🔴 **I shipped a biased comparison first and caught it on the live run.** v1 subtracted two 0-100 scales and
reported the gap; every sport but football came out negative, which looked like a finding and was an
artefact of football being a large outlier on attention. Rewritten to compare by RANK. The reasoning is in
the docstring so nobody reinstates it. Standing caveat on all of it: **a language is a proxy for a market,
not a country.**

### D. NOT DONE, ON PURPOSE

Movement could have been made to appear today by backdating a baseline. I do not have last week's merit and
inventing it would have poisoned the series, so the page says plainly that recording started today and
movement needs two points. **First real arrows come from your Sunday `metro-mini-refresh.sh` run or the next
`civic-data-refresh.yml`** — worth confirming the arrows appear and the window reads "1 week".

### E. VERIFIED

typecheck, all `check:*`, 294 vitest, 112 pytest, `next build --webpack`, `check:function-size`.
`/sports/zone-zero-cup` still ISR at 1h. The Cup regenerated clean through the new code path (240 nations,
history written). Two nations moved merit in this rebuild (germany 127.6 -> 128.3, kazakhstan 19.7 -> 20.6)
and **that is your women's basketball ranking change from this morning's pull, not my code** — confirmed by
the zero-drift test above.

### F. STILL OPEN FROM EARLIER TODAY

`VERCEL_BUILD_CAP_TOKEN` is still unset, so the 2/day cap remains inactive and this is the third real build
today. Fourth day flagged. Notion Backlog P0, owner Ashwin.

## 2026-09-15 (evening) — windows → mini (champions and majors read at runtime; a new check:live-data guard; the build cap is still a no-op)

Cowork session, Ashwin travelling. He asked why adding the US Open champions cost a full Vercel build and wanted a
process where it does not. Answer, fix, guard and a finding he should see, below.

### A. WHY `6871c2a9d` BUILT (14 Sep, "Auto: record new major champion(s)")

Not a guardrail gap. A documented decision. The commit changed three files and three lines
(`majors/tennis.json`, `champions-history.json`, `majors/zzc-titles.json`) and deliberately carried no
`[vercel skip]`, because `lib/majors.ts` and `lib/champions.ts` both `readFileSync` their JSON, so the build WAS the
publishing mechanism. `majors-ingest.yml`'s header argued "only ~8 majors a year, so a build each is cheap".
`footy-refresh.yml` did the same thing, branching its commit message to drop the tag whenever
`champions-history.json` changed.

Two things were wrong with the premise. It was never only ~8: the ledger in the same commit also carries boxing, the
AFL/NRL premiers and anything else the finalizers append. **Seven pure champions-data production builds in the 180 days
to 09-14** (`6871c2a9d`, `1e84f9abf`, `137d66b10`, `166580c7e`, `3cdf4e87e`, `a95599daa`, `f389da010`). And the data was
already in Supabase the whole time: `majors_ingest.py` writes `tennis_majors`, `majors_to_champions.py` appends to
`public.champions`, and the JSON is a derived cache. Nothing needed to move. The problem was only ever on the read side.

### B. THE FIX — shipped, modelled on the mini's own `0cd37969a` (owners)

- `lib/majors.ts` — `getGolfMajors`/`getTennisMajors` now async, GitHub raw, `revalidate: 3600`, tag `majors`.
- `lib/championsCurrent.ts` (new) — the Current board only, tag `champions`.
- `scripts/champions/build_champions.py` — two new derived files: `champions-current.json` (the `isCurrent` rows alone,
  **97 rows / 38 KB** vs the ledger's 6,816 / 2.58 MB) and `majors/golf-months.json` (478 dated majors / 12 KB). Both
  rendered by the existing `render()` so the row shape stays single-source. `build_current` has its own shrink guard
  (`sys.exit(5)`): a competition does not stop having a reigning holder, and the board is now runtime-read, so a partial
  Supabase page would empty it with no deploy to notice.
- `lib/championsHub.ts` — enrichment factored into `enrich()`; `getChampionsWithLinks()` stays SYNC and build-time for
  its two remaining callers (`championsHistory` competition metadata, `championsTimeline`), new async
  `getChampionsWithLinksLive()` for the board.
- Both workflows now `[vercel skip]` and ping `/api/revalidate` (tags `majors`, `champions`), gated on an actual push,
  then warm `/sports/champions`, `/teams/tennis`, `/teams/golf`. **The 300s sleep before the flush is load-bearing** —
  same reason as `business-daily-refresh.yml`: raw.githubusercontent has a ~5-min CDN cache and flushing early
  re-caches the OLD list for the full hour.

**Deliberately NOT converted**, and say so before anyone "finishes the job": the `<ChampionBadge>` on the 54 call sites
of `getCurrentChampionships`, the metro Championship History, the per-competition rolls and the Time Machine. They pick
a champion up on the next natural deploy. Converting them means an async ripple through 54 call sites and a fetch
inside all 4,261 metro pages, to buy a day of freshness on a badge.

### C. THE TRACER BIT ME, EXACTLY AS `DATA-READS-RECIPE.md` SAID IT WOULD

First build after the conversion: `.next/server/app/teams/tennis/page.js.nft.json` traced **111 files and none of the
majors JSON**. Same silent miss the recipe records for `lib/international.ts` on 09-15, and the `MAJORS_FILES` map was
rule 1's exact shape. Harmless while those pages were fully static; a blank hub once they carry an ISR window and the
fallback runs on a real re-render, because both pages do `if (!data) return null`.

Fixed the way the recipe prescribes: **static imports**, not `readFileSync`, for `golf.json`, `tennis.json`,
`golf-months.json` and `champions-current.json`. That also removed a 2.58 MB build-time ledger read from
`/teams/golf`, which existed to look up 478 integers. Traces after: tennis/golf 115 files, and the data now compiles
into the bundle where there is nothing to trace. **Your 09-14 note asked for a sweep of other readers converted to
literal-join maps in `6edc58ecb` — this is one more confirmed case. The sweep is still open.**

Related, and it vindicates the slice: the build logs `Failed to set Next.js data cache ... items over 2MB can not be
cached` for `business/companies.json` (2,987,575 bytes). A runtime fetch of the 2.58 MB ledger would have hit the same
ceiling and re-fetched on every render. 38 KB is nowhere near it.

### D. NEW GUARD — `check:live-data` now enforces the MIRROR case

The script already caught "data refreshed with `[vercel skip]` but read at build time" (never deploys). It now also
catches "data read at RUNTIME but committed WITHOUT `[vercel skip]`" (wasted build), scanning every `git commit -m`
subject in `.github/workflows/*` and `mac-mini-jobs/*.sh` against the declared `OUT_OF_BAND` paths. `WASTE_EXEMPT` is
empty; add to it only for a job whose commit genuinely has to build something else, and say what. Negative-tested by
stripping the tag back off `majors-ingest.yml`, confirming FAIL, restoring. This is what stops the regression, not the
comments.

### E. 🔴 THE 2/DAY BUILD CAP IS STILL INACTIVE — third day flagged, still not done

`scripts/vercel-ignore.sh` reads `VERCEL_BUILD_CAP_TOKEN` and, without it, prints `build cap inactive` and applies NO
cap. Your daily-ops sweep has said so on 09-13, 09-14 and 09-15. So the ceiling that `feedback_vercel_guardrail_must_be_infra_not_memory`
concluded had to be code rather than a promise is, right now, neither: the code is shipped and disabled. **Anyone with
Vercel dashboard access should add `VERCEL_BUILD_CAP_TOKEN` (read scope) to project `prj_eGoUAOrnwvNP86s7p74ruILMl3Dr`,
Production, build-time.** Until then, every "we are capped at 2" statement in this repo is false, mine included — I told
Ashwin this change saves a daily slot, and it does not yet, because there are no slots being counted.

### F. VERIFIED / OPEN

Verified locally on Windows: typecheck, all 13 `check:*`, 294 vitest, 112 pytest, `next build --webpack`,
`check:function-size` (92.1 MB `/sports/champions`, under the 220 MB line). `build_champions.py` `py_compile` only —
the two new emitters could not be run here (no `scripts/mktcap/supabase_key.txt`), so both output files in this commit
were generated by reproducing the same filter and join against the committed ledger. **First real majors-ingest or
footy-refresh run should be checked: the files it writes must come back byte-identical, and the ping must log a 200 for
both tags.** If `champions-current.json` churns, `build_current` is not reproducing `render()` faithfully.

### D. WWC tracker: daily schedule retired, self-tests made state-agnostic (`52fab443e`, no build)

Ashwin asked why he got GitHub Actions emails and an ntfy. The 09-15 scheduled run of `wwc-2026-tracker.yml`
(11:24Z) failed at "Self-test the builder and the tracker"; ops-autofix re-ran it (13:19 BST ntfy) and it failed
again, and GitHub emails on each failed scheduled run. Not the parser this time: both self-tests hard-coded the
PRE-FINAL dump, and recording the final on 09-14 (`8f43c6971`, section L of 09-14) broke them.
- `build_intl_wbasketball.py` asserted `WC editions == 19` and `2026` scheduled ("got 20, want 19"; "2026 not counted
  as played"). `track_wwc.py`'s round trip copied the live dump and expected 2026 absent. Left alone, every daily run
  to 30 Sept would have failed, emailed and drawn an autofix re-run.
- **Schedule retired** (Ashwin: "do both"): the cron in `.github/workflows/wwc-2026-tracker.yml` is commented out with
  the reason; `workflow_dispatch` kept; re-enable for 2030. Checked with Ruby's YAML: triggers are only
  `workflow_dispatch` (note a bare `on:` key parses as boolean `true` in YAML, which is why a naive check reads nil).
- **Builder self-test:** played + scheduled editions total 20, 2026 counted exactly once, and a played 2026 has a
  champion. Bump the 20 when a 2030 row is added.
- **Tracker self-test:** the round trip first resets its temp copy's 2026 block to `SCHEDULED_BLOCK_2026` (identical,
  byte for byte, to the dump before `8f43c6971`) via a new `swap_block()`, which `replace_block()` now uses. A first
  draft left `render_block(e)` inside `swap_block()`; caught by the self-test run before commit.
- **Verified:** both self-tests pass against the current dump (2026 played) AND the pre-final dump from git (2026
  scheduled; the real dump restored, unchanged). `track_wwc.py` on the real dump: "2026 already in ...; nothing to
  do", exit 0. Dispatched run 34969956543 on `52fab443e`: success, so the workflow's latest run is green and
  `detect_issues.py` reports 0 findings (no more autofix re-runs today).

## 2026-09-15 — mini → next session: INTERNATIONAL FOOTBALL HUB WAS SILENTLY EMPTY (fixed, one paid build); cricket REVIEW rows fixed

Ashwin, the morning of 09-15 (conference day): "why have all of the countries disappeared from the home page of
international football", then "build the static-import fix and push once the build passes", then "fix the
Afghanistan v India rows". `git pull`: nothing new on either repo.

### A. `/teams/national` showed "0 teams", no tournament hubs, no top games (`f24f4bde6`, one paid build)

- **Symptom, production:** the National teams list read "0 teams match the current filters" with no filter set; the
  Tournament hubs cards and "Top games of all-time" rows were empty too. Only the World Cup 2026 section (fetched from
  GitHub raw) rendered. Response `x-vercel-cache: STALE`, i.e. an ISR re-render. `public/data/international/index.json`
  itself was fine (235 teams). Country pages (`/teams/national/france`) still rendered.
- **Cause:** `lib/international.ts` read its eleven JSON files with `readFileSync` through a map of arrow functions,
  each a fully literal `join()`, called as `MAP[name]()` (`6edc58ecb`, 09-08, the file-tracer scoping; rule 1 of
  `scripts/DATA-READS-RECIPE.md`). In the real build, `.next/server/app/teams/national/page.js.nft.json` listed **0**
  international files. The build machine has the whole repo, so every deploy prerendered the page complete; the first
  ISR re-render on Vercel found no file, `existsSync()` returned false and `loadJson()` returned its empty fallback,
  logging nothing. `check:data-reads` passed. So the hub has most likely been empty between every deploy and the next
  revalidation since 09-08, and "came back" with each build.
- **Fix:** static JSON imports for all eleven files (~1.35 MB) in `lib/international.ts`; `fs`/`path` removed. Safe for
  the client: the module is `import "server-only"` and listed in `check-client-imports`, and all four client components
  that touch it (`WorldCup2026`, `TopGamesTable`, `TeamTopGames`, `RadialKnockout`) import types only.
  `getWorldCup2026` now copies the bundled object before attaching `.sim`. Data still changes with a build, as before.
- **Recipe updated:** `DATA-READS-RECIPE.md` gains the "too FEW files fails silently" section: verify the route's real
  `page.js.nft.json` after a build, prefer a static import for a small fixed build-time set, and do not hide a missing
  file behind an `existsSync()` fallback.
- **Verified** in a scratch worktree on `origin/main`: `npm run verify` with
  `PYTHON_BIN=~/Projects/Metro Area Project/.venv/bin/python` (typecheck, every check:*, vitest 294, pytest 112,
  `next build --webpack`, function-size under 220 MB) passed. Trace after: `/teams/national` 11 international files
  (was 0), `/teams/national/[slug]` 12. Pushed alone as HEAD at 10:12 BST on Ashwin's yes; the day's first paid build.
- **Deploy: LIVE, verified through two ISR re-renders.** `/deployed` returned `f24f4bde6` at 10:19 BST (~6.5 min).
  Live HTML: 10:19 `PRERENDER` 347 `cur_name` entries and 9 hub links; 10:21:33 `STALE` (the request that triggers a
  re-render) still full; 10:21:54 `HIT` age 19 (the re-rendered copy, the one that used to come back empty) still 347
  and 9; the same again at 10:24:25 / 10:24:45. No "0 teams" text in any of them.
- **Open, worth a sweep:** the same trace gap showed for `/teams/national/womens-world-cup/[slug]` (0 international)
  and `/teams/national/tournaments/[slug]` (0) in a 09-11 build; now fixed for anything reading `lib/international`, but
  any OTHER reader converted to literal-join maps in `6edc58ecb` may fail the same silent way. Not yet swept.

### B. Cricket weekly REVIEW (09-15 10:07 ntfy): Afghanistan v India fixed (`b26709cfe`, no build)

- The ntfy body arrived nearly empty ("REVIEW BEFORE PASTING" twice): the wrapper's `grep -i REVIEW` keeps only the
  header lines, not the items under them. The items are in `~/metro-mini-jobs/logs/cricket-weekly-DATE.log`. Not fixed.
- **Gahanga B Ground, Rwanda (8 rows, 8-9 Sep, Africa Continental Cup):** flagged only because the ground is new and
  the country was inferred from the city; every field is correct. No change.
- **Afghanistan v India T20I, 13 Sep (cricket_matches 22711, 22712):** were "Arun Jaitley Cricket Stadium, New Delhi" /
  "New Delhi" with `venue_country`, `host_country`, `tournament_series` null. Set, on Ashwin's instruction, to the
  existing convention: "Arun Jaitley Stadium, Delhi", Delhi, India, India, "Afghanistan v India T20I Series, Sep 2026
  (in India)" (Wikipedia: the Friendship Cup, Afghanistan the designated host, all three T20Is in New Delhi).
- Portal data rebuilt from Supabase (`build_cricket_portal_data.py`, `build_cricket_top_games.py`; both need
  `~/.config/metro-supabase/env` sourced for `SUPABASE_URL`, as the wrapper does). Only `team-detail/afghanistan.json`
  and `india.json` changed.
- **Not changed:** the 2026-08-05..08-15 Afghanistan rows from the Ireland tour also have no `tournament_series`
  (never flagged). A Wikipedia 429 skipped "Zimbabwean cricket team against Afghanistan in the UAE in 2026-27"; the next
  weekly run harvests from the workbook's last Afghanistan match (08-15) again, so it should retry.

### C. The rest of the morning's ntfys

Football UNMATCHED at 00:02 and 06:09 (expected until Friday's Lookup sync); Daily Ops Sweep 02:06: 37 ok, 1 failed
(the 09-14 gap-league-watch, already fixed). It still reports the build-cap token unset, now irrelevant to owners-weekly.

## 2026-09-14 — mini → laptop and next session: gap-league-watch FIXED (schema), WWC final RECORDED, laptop's checks confirmed

Ashwin asked why the day's ntfys piled up, then "apply both fixes". This answers both laptop entries above.

### A. gap-league-watch: the cause was a NOT NULL column, not the script (migration only, no code change)

- **Failure:** `football_league_watch.target_season` was `NOT NULL`. `26987d2ee` added World 16 (CONCACAF Champions League),
  27 (OFC Champions League) and 536 (CONCACAF Nations League) with `target_season: null`, correctly: `ready_on: window`
  ignores it. The whole upsert was rejected (HTTP 400, Postgres `23502`, failing row `World, 16, CONCACAF Champions
  League, null, ...`), so ALL four leagues went unwritten at 05:00Z and on every autofix rerun (06:27, 08:21, 10:16Z;
  six ntfys, then the 3/day cap). The laptop's `--self-test` passed because it never touches Supabase.
- **Fix (Ashwin approved):** migration `football_league_watch_target_season_nullable` drops `NOT NULL` and comments the
  column (null = window-gated).
- **Verified:** `run-gap-league-watch.sh` re-run 17:40Z: self-test OK, "wrote watch state for 4 leagues", no
  transitions. India L1 awaiting 2026; the three World comps have no live season (latest ended 2026-05-31, 08-22,
  2025-03-24); their rows store `target_season` null. `dispatcher.py --mark-ok gap-league-watch`; `detect_issues.py`
  0 findings. Notion Backlog row closed with the cause.

### B. Women's Basketball World Cup: parser fixed a second time, result recorded (`f1b438170`, `8f43c6971`, no build)

- The 09-14 scheduled run (started 12:16Z) found the final PLAYED and failed "Final box has a score (97-79) but no
  teams". Once a game is over Wikipedia bolds the winner's cell (`'''{{bkw-rt|USA}}'''`); `clean_team` stripped the
  template first, leaving a non-empty `''''''`, so the flag code was never read. Quotes are now stripped first;
  self-test adds a bold cell and a played bold box. Autofix had re-run it three times (13:18, 15:18, 17:16 BST).
- Dispatch 34876273431 on `f1b438170`: success, committed `8f43c6971` "Auto: 2026 Women's Basketball World Cup result
  [vercel skip]". **United States 97-79 France; third Spain 81-58 Germany.** `nations.json`: United States 12 titles
  (2026 added), France runner-up 2026, Spain and Germany one more final four each. Read at runtime, no build.
- The tracker's schedule runs to 30 Sept; from now on it prints "2026 already in ..." and exits 0.

### C. The laptop's three checks

1. **gap-league-watch:** diagnosed and fixed, section A.
2. **owners-weekly (`0cd37969a`):** `dispatcher.py --check-sync` reports in sync. The live `jobs.toml` HAD drifted (only
   the owners-weekly comments and label); synced by hand at ~17:45Z after diffing it, which also kept the
   `claude-auth-canary` 19:30 slot from 09-13. `REVALIDATE_SECRET` is set (non-empty) in `config.env`. `VERCEL_TOKEN`
   left out, as asked. This morning's `~/metro-mini-jobs/pending/owners-2026-09-14.patch` (3 moved: Lakers,
   Timberwolves, one more) was saved under the OLD build-time rules (it may touch `lib/releases.ts`); re-run the job or
   re-derive it rather than applying it as is.
3. **API-name fallback (`68eeb6360`):** `scripts/apifootball/_scratch/api_team_names.json` exists (2,158 entries,
   written 18:07), gitignored. Log: "api team names cached for export: 2157" (12:06 run) and "2158" (18:06 run).
   `public/data/football/live-competitions-2026.json` has no `name: null` anywhere. The UNMATCHED alert is still
   firing, as intended, until Ashwin maps the 45 clubs.

### D. Evening news refresh: first morning move verified (09-13 section K)

The 09-14 08:00 push carried 57 morning items (the new every-linked-story size). All 12 of 09-13's evening stories
moved to 09-14 ("moves from 2026-09-13 evening to today" x12); 09-13 now holds 34, 09-14 holds 57, both
`digest_run.item_count`s match, positions have no gaps, and no url is on both days. Topics patched 24 of 57 rows.

### E. Remote Control

The laptop asked which reachable session is the mini: this interactive one is titled **"Latest commits review"**.
"Ops sweep" is not it (likely the headless daily-ops-sweep, which is report-only and cannot act on a message).

### F. owners-weekly re-run under the new runtime-read job: 4 moved, APPLIED (`d926034f1`, no build)

Ashwin: "re-run owners-weekly under the new job". Hand-launched `~/metro-mini-jobs/run-owners-weekly.sh` at 18:55
BST on a clean tree (after the jobs.toml sync in C). This morning's log, summary and patch were first copied to
`*.morning-oldrules`; the job then retired both patch files to `.applied-d926034f1`, so `pending/` holds
`owners-2026-09-14.patch.applied-d926034f1` and `owners-2026-09-14.patch.morning-oldrules.applied-d926034f1`.

**Applied, `d926034f1` "Owners: Lakers not on the Sep BoG docket, Wolves/Lynx and Palace moved [vercel skip]"**, on
`origin/main`; stages only `scripts/data/team-owners-seed.json` and `public/data/owners/team-owners.json`. 0 resolved,
4 moved, 0 new; control unchanged on every row (no league approval or closing reported).
- **Lakers:** Kushner/Iger purchase not expected at the 14-15 Sep NBA Board of Governors (SBJ; L.A. Times via SI).
  Adds the Buss family's 17.8% also going to the buyers (ESPN, 17 Aug), Jeanie Buss's petition (hearing 9 Dec) and the
  federal probe of related-party accounting at two insurers Mark Walter controls, which TWG Global denies is fraud
  (CNBC, ESPN, 26 Aug). Drops the claim the buyers would keep her as Governor. Review 2026-09-18 -> 2026-10-15.
- **Timberwolves and Lynx:** BoG dates corrected to 14-15 Sep; 11 Sep agenda previews did not list the Stad sale
  (Hoops Rumors, TSN). Review stays 2026-09-18.
- **Crystal Palace:** FT (16 Jun, via Irish Times) reported all three American holders, Woody Johnson included,
  exploring a sale via Raine Group and open to a full sale, wider than the 30% the board carried.
- Re-checked, no change: West Ham, Angels, Sevilla, Vancouver Whitecaps, Seattle Sounders, San Jose Earthquakes,
  Tampa Bay Lightning. The sweep found nothing the board lacks.
- Gates: `--self-test` PASS, build 220 franchises / 11 contested, `check-owners-watchlist` OK; tree clean, HEAD ==
  origin/main. ntfy "Owners weekly -- 2026-09-14" at 19:02.

**Revalidate:** the wrapper waited out the 300s raw CDN TTL, then "Revalidated on attempt 1" at 19:07:41 BST;
warm `/sports/owners` 200 and `/sports/valuations` 200; "Owners weekly done" 19:07:52, exit 0. At 19:08 the live
`/sports/owners` shows the new Crystal Palace text ("Raine Group; a full club sale is among the options").

**Next:** the scheduled run is Monday 2026-09-21 08:30Z. Timberwolves/Lynx review falls due 18 Sept, so that run should
re-check them first.

### G. The 45 unmatched AFC/CAF clubs, triaged for Ashwin's Lookup edit (no code change)

Ashwin asked for the list with each club's competition so he can add them to the Lookup and sync. Delivered as
`~/metro-mini-jobs/pending/unmatched-afc-caf-clubs-2026-09-14.xlsx` (plus `.csv`); not in git.

- **Source:** the 18:06 football-standings log ("unmatched=45"), competitions from `football_fixtures` joined to
  `football_league`, country/city/venue from api-football `/teams?id=` (45 calls).
- **By competition:** AFC Champions League Elite (17): 4 clubs. CAF Champions League (12): 41. Intercontinental Cup: 0.
- **15 are already in the Lookup and only lack `API Name`** (the resolver's first key; Lookup last synced 2026-08-30):
  Al Hussein -> Hussein Irbid, Johor Darul Takzim FC -> Johor Darul Ta'zim, Neftchi -> FK Neftchi Farg'ona,
  Công An Nhân Dân -> Cong An Hanoi FC, Colombe, Fomboni, TP Mazembe, Mangasport, Horoya, Stade Malien, Nouadhibou,
  APR, Simba, Vipers, and ASC Kara -> ASKO Kara (**unconfirmed**, may be a different Kara club). Sheet 1 carries each
  Lookup row id.
- **TP Mazembe is the instructive one:** its name IS in the Lookup, but the separate "TP Englebert" row (id 139470) also
  has Cur. Name "TP Mazembe", so `build_resolver` marks the name AMBIG and returns nothing. An `API Name` on row 139465
  fixes it, because `by_api` is consulted before `by_name`. Any club listed under a former name on another row has
  the same trap.
- **30 are new rows** (sheet 2, Lookup column order Cur. Name..Long, country spelled the Lookup's way: Côte d'Ivoire,
  Congo DR, Sierra Leone). Fuzzy near-misses rejected by hand as different clubs: Port (not AS Port Louis 2000),
  Medina United (not Brikama United), NIGELEC (not the "Niger" row), 15 de Agosto (not Primeiro de Agosto).
- **Data to confirm:** 15 de Agosto (api says Paraguay, impossible for CAF; country left blank); African Stars (api
  venue in Gaborone, club is Namibian).
- **Next:** Ashwin edits the workbook and runs `cl-lookup-sync`; the following football-standings run should log
  `unmatched=0` (or fewer) and the twice-daily UNMATCHED ntfy stops.
- **Scheduled: Friday 2026-09-18, 10:00-10:45 BST, on the Windows box** (Ashwin is travelling with the MacBook and
  the Lookup workbook lives on Windows). Google Calendar event "Map the 45 unmatched AFC/CAF clubs into the Lookup
  (Windows)" on ashwind@gmail.com, marked free, popup 30 min and email 60 min before, no invitees; the description
  carries the steps and the three checks. The workbook is not reachable from Windows at its mini path: Ashwin was
  asked to save the copy sent in chat somewhere Windows can open (e.g. OneDrive). Until the sync, the UNMATCHED ntfy
  keeps firing twice a day; that is expected, not a new fault.

### H. Tonight's evening run, a headline rule, the worktree cleanup, and the site feed's new shape rules (newsletter-podcast `a0e4de4`, `c62c56c`; no build)

**Evening run, 2026-09-14 20:00.** Exit 0 (launchd runs = 2). Claude picked 11 new stories; only 3 went on (positions
58-60), because the morning feed had already filled the day to 57 of `MAX_ITEMS` 60 and 8 were skipped "today already
holds 60". It again flagged that Business Insider's newsletter did not show a title, so it wrote the Anthropic-Nasdaq
headline itself.

**Headline rule (`a0e4de4`, `run-evening.sh`).** "REAL HEADLINES ONLY": the headline must be the article's own title
word for word; open the article to copy it when the newsletter does not print it; otherwise leave the story out.
Applies from the 09-15 evening run. The morning recipe already had the rule and has not shown the problem.

**Scratch worktree removed.** The ticker/standings build worktree (`bed0ae366`, already on `origin/main`, 5.7 GB of
build output, `node_modules` only a symlink) was removed with `git worktree remove --force` and pruned; the main repo's
`node_modules` is intact. Its scratch folder (logs, screenshots, draft commit message) was deleted with it.

**Why 57 was too many (Ashwin: "I saw a lot of Washington Post headlines").** Three causes stacked:
1. The first every-linked-story morning (section K, `a476ad1`): `feed.json` copied all 59 links in the day's
   `socials/substack.md`. Archive days built the same way run 20-38.
2. Sunday list newsletters: WaPo's weekly *Week in Ideas* and Business Insider's Sunday edition. The day had 22 WaPo
   stories (the archive's highest ever; 1-12 is normal, and 09-11 and 09-12 had none) and 14 Business Insider. One post
   section, "AI Hits the Ballot", was 9 WaPo links of 9.
3. 13 of the 60 were articles published 4-7 days earlier; the 2-day age rule then applied only to the evening edition.

**Fix, Ashwin's choice "A plus B, 6 per publication, re-push today" (`c62c56c`, `push_feed.py`).**
- `morning_filter()`: after validation, drop a url dated more than `FEED_MAX_AGE_DAYS` (2) before the digest date
  (undated urls pass), keep at most `MAX_PER_SOURCE` (6) per publication in post order (source names case- and
  whitespace-folded), then `MAX_ITEMS`. `validate()` gained a `limit` so the filter sees every valid story before the cap.
- `plan_evening()` applies the same per-publication cap, counting what the day already holds.
- `--all-stories` bypasses both, for archive re-pushes (`archive/qa.py` reads only the "valid, dropped" line, which
  still prints before the filter, so its checks are unaffected). The podcast, script and socials are untouched.
- Self-test covers age, cap order, source folding, the day cap and the evening count.

**Re-push of 2026-09-14.** 31 of 57 morning stories kept (13 too old, 13 over the cap), plus the 3 evening stories: 34,
`digest_run.item_count` 34, positions contiguous, `/digest/2026-09-14` shows "Show all 34 stories". Topics re-tagged
(a re-push rewrites morning rows and clears their topics): 19 of 34 tagged. WaPo and Business Insider show 7 each, not
6: six morning plus one evening story appended at 20:02, before the rule; from 09-15 the evening counts the day.
Side effect, intended: some 09-13 evening stories that had moved to 09-14 this morning (e.g. "Bye, America", "Will the
real Elizabeth Holmes please stand up?") fell over the cap and are no longer on the site.

**Consequence for the cap question.** With mornings around 30, the evening has room under 60 again, so `MAX_ITEMS` was
NOT raised. Notion Decision "The live daily news feed carries every linked story" amended with both rules.

**Watch 2026-09-15:** the morning log's "N of M kept after the age and per-publication rules" line, and that the evening
run's headlines are all real titles.

## 2026-09-14 (later) — laptop → mini and next session: OWNERS DATA IS READ AT RUNTIME; owners-weekly NEEDS NO VERCEL TOKEN AND SPENDS NO BUILD

Ashwin asked why an owners change cost a build when "isn't it just stored in a table".
It was not: `lib/teamOwners.ts` read `public/data/owners/team-owners.json` with a
build-time `readFileSync`, so every owners push needed a paid production build, and
`run-owners-weekly.sh` counted the 2/day budget with a Vercel token and blocked its own
push without one (`60d7f885d`). This commit removes that dependency.

- **`lib/teamOwners.ts`** fetches the owners JSON from GitHub raw, `revalidate: 3600`,
  tag **`owners`**, bundled file as fallback, local file first in development. The
  module memo is keyed on the file's `generated` stamp, not kept forever, so a warm
  instance picks up the next week's file. All six exports are now async;
  `/sports/owners` and `/sports/valuations` await them. No other callers exist.
- **`lib/valuations.ts` is deliberately still build-time** (valuations change only on a
  real ETL, and `ValuationChip` renders on every team page). Owners rows attach to the
  build-time valuations exactly as before.
- **`/api/revalidate`** allows tag `owners`; **`check-live-data.mjs`** declares
  `owners/team-owners.json`, so a regression to build-time reads fails verify.
- **`run-owners-weekly.sh`**: the budget count, the no-token git push block and the
  `lib/releases.ts` step are gone. Commits carry `[vercel skip]` and stage only the seed
  and the built JSON. When the published owners file changed during the run, the wrapper
  sources `runners/_common.sh` and calls `revalidate_ping owners /sports/owners
  /sports/valuations` (300s CDN wait, fail-open). ntfy tag is now `clipboard`, not
  `rotating_light`. **`VERCEL_TOKEN` is no longer needed in `config.env` for this job.**
- **Trade-off, accepted:** owners changes no longer write a release note, because
  `lib/releases.ts` needs a build. Fold notable ownership news into the next real
  shipping day's entry by hand.

**Mini, next Monday's run (09-21 08:30Z):** confirm the log shows a push with
`[vercel skip]` (or "no changes"), and, if the file changed, `Revalidated on attempt 1`
and both warm paths 200. If `REVALIDATE_SECRET` is unset, the hourly ISR window covers it.

Verification on the laptop: `check:live-data`, `check:data-reads`, `check:release-notes`,
`check:client-imports`, `dispatcher.py --self-test` and `bash -n` all pass; typecheck
reports no errors in any touched file (the laptop's `node_modules` is stale, so the
full `npm run verify` and `next build` status is recorded in the commit message).

## 2026-09-14 — laptop (Ashwin's MacBook Air, not the mini) → mini and next session: DISPLAY-ONLY CONTINENTAL COMPS FALL BACK TO API NAMES; gap-league-watch FAILED 05:00Z, CAUSE UNREAD

Interactive session investigating the morning's ntfy alerts from the laptop. The mini
could not be reached (the venue Wi-Fi's WebTitan filter intercepts TLS to tailscale.com),
so everything below comes from the repo, `public/data/refresh-schedule.json` and `gh`.

### A. `gap-league-watch` failed its 05:00Z slot — NOT diagnosed

Only non-ok job today; still `failed` after the 06:15Z ops-autofix slot, so the autofix
rerun presumably failed too. First run since `26987d2ee` (09-13 15:23Z), which rewrote
`watch_gap_leagues.py` and added the three World entries (16, 27, 536) with
`target_season: null` and `ready_on: window`. `--self-test` passes on current `main` from
the laptop, so the fault is in the live `--write` path (api-football, the
`football_league_watch` upsert, or the git ff/commit step). **Mini: read
`~/metro-mini-jobs/logs/gap-league-watch-2026-09-14.log` and fix.** Low stakes: the job
writes nothing to the site and any missed transition is re-observed next run.

### B. Unmatched CAF/AFC clubs now display under api-football's name (this commit)

The 45 UNMATCHED clubs from 26987d2ee (daily sweep 09-14, item 1) were not only an alert:
`football_fixtures` stores team ids only, and `export_bundles.py` took names solely from
`football_team`, so every unmatched side shipped `name: null` and rendered "TBD" (live
bundle: CAF 49 of 74 fixtures, AFC 26 sides). The domestic cups never had this because
`refresh_domestic_cups.py` already falls back to the api name.

- `refresh.py` caches api team names (id → name, merged across runs) to
  `scripts/apifootball/_scratch/api_team_names.json` right after fetching. Gitignored, so
  it cannot dirty the tree and stand ops-autofix down.
- `leagues.json`: `"display_only": true` on 17 (AFC CL Elite), 12 (CAF CL) and 1168
  (Intercontinental Cup). Ashwin's ruling: these are scores and fixtures only, linked into
  nothing else. UEFA comps and Libertadores deliberately NOT flagged (badges, club pages,
  rankings).
- `export_bundles.py` uses the cached name only for display_only comps and only when
  `canonical_name` is missing; `lookup` stays null, so it never reads as a resolved club.
- **The UNMATCHED alert is unchanged, on Ashwin's instruction**: it is his reminder to add
  the clubs to Lookup, which he plans to do by hand later today (via `cl-lookup-sync`, not
  `sync_lookup.py` directly).

Verified offline only (the laptop has no Supabase key): both self-tests, compile, and unit
checks of the cache and fallback. **Mini, first football-standings run after this lands:**
confirm the log line `api team names cached for export: N` and that
`live-competitions-2026.json` has no `name: null` in leagues 12/17 (a club whose api name
was never fetched would still be null).

