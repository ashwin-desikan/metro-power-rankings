# Daily Ops Sweep -- 2026-09-11

Window `2026-09-09T23:00Z` -> `2026-09-11T01:00Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, no Supabase write. This report file is the only
thing committed.

## Jobs this window: 18 ok, 2 failed (both already recovered), 3 flagged

**Dispatcher occurrences (19 completed + this sweep): 18 DONE, 1 FAIL.**

| when (UTC) | job | result |
|---|---|---|
| 09-09 23:09 | football-standings | DONE 89s |
| 09-10 01:01 | **daily-ops-sweep** | **FAIL exit 1 after 3s** |
| 09-10 02:31 | activity-feed | DONE 5s |
| 09-10 04:01 | euro-comps | DONE 5s |
| 09-10 05:01 | gap-league-watch | DONE 3s |
| 09-10 05:01 | football-standings | DONE 87s |
| 09-10 05:53 | business-daily | DONE 340s |
| 09-10 06:08 | substack-daily | DONE 5s |
| 09-10 07:09 | mlb-sim | DONE 450s |
| 09-10 07:26 | feed-monitor | DONE 15s |
| 09-10 11:07 | football-standings | DONE 96s |
| 09-10 11:48 | claude-auth-canary | DONE 0s |
| 09-10 14:38 | mlb-sim | DONE 449s |
| 09-10 17:06 | football-standings | DONE 108s |
| 09-10 20:18 | ops-autofix | DONE 2s (first scheduled run) |
| 09-10 22:18 | ops-autofix | DONE 2s |
| 09-10 23:08 | football-standings | DONE 100s |
| 09-11 00:20 | ops-autofix | DONE 3s |
| 09-11 00:30 | claude-auth-canary | DONE 0s |
| 09-11 01:00 | daily-ops-sweep | this run |

**3 MISSED slots, all benign and all explained in Self-healed below:**
`economy-rates` (slot 09-04 07:30Z) and `economy-housing` (slot 09-05 07:30Z) at
the 11:48Z tick, and `ops-autofix` (slot 09-10 18:15Z) at the 19:48Z tick.

**Off-dispatcher on the mini:** the `f1-weekly` launchd poller ran hourly all
window, every run `idle: 2026 R13 already synced`. Correct, not stale -- see
Self-healed §4. `newsletter-daily` at 07:00Z FAILED and was recovered by hand
(§1).

**GitHub Actions:** 75 runs in window, 1 failure (`WNBA season refresh`
34478252537, 09-10 12:42Z), re-run green as 34485939747 at 13:57Z. §3.

**Vercel: 2 paid production builds on 09-10, exactly at the 2/day cap, neither
an ERROR.** Both `READY`, both Ashwin's: `b59c61a14` (17:34Z, money ledger /
countries-to-2100 / share cards) and `c095ad8b6` (22:02Z, NFL playoff and title
odds). Every other 09-10 deployment was `CANCELED`, which is free. So far on
09-11 UTC: 1 deployment, `CANCELED`, **0 paid builds**. Counted from the Vercel
API across the whole UTC day in three pages, not from GitHub `deployment_status`.

I also checked the ordering trap specifically, because 09-10 has an app commit
(`b59c61a14`) with a `[vercel skip]` doc commit (`bbed354ef`) immediately after
it in history. It did **not** bite: they went in separate pushes, and
`b59c61a14` has its own `READY` deployment. Release notes for 09-10 are present
in `lib/releases.ts` (as is a 09-11 block), so `check:release-notes` is satisfied.

## Self-healed (informational only, no action needed)

**1. The 01:00Z sweep and the 07:00Z newsletter digest both died on the same
expired Claude OAuth session.** `Failed to authenticate: OAuth session expired
and could not be refreshed`, six hours apart. Both `auth_expired()` guards did
the right thing (3-second exits, no futile retry). Ashwin re-authed; both jobs
were re-run by hand and both completed. The digest is genuinely healthy rather
than merely exit-0: Spotify episode `1IaF1Kz9HkIA1tqYQMyXPa` polled through to
`READY`, 40:21 of audio, both Gmail drafts created (`~/newsletter-podcast/logs/
2026-09-10.log`, 10:10:48 done). Fully documented in `HANDOFF.md` 2026-09-10 §A.

**This run is the proof the credential is good again**, and the canary agrees:
`status=OK days_left=27.11 -- refresh token valid until 2026-10-08 03:12 UTC`.

The two forward-looking gaps the last sweep raised are both **closed**:
- The canary now runs at **two** slots, `times = ["00:30", "06:30"]` -- 00:30Z as
  pre-flight for the sweep, 06:30Z as the one that actually gets read at a
  civilised hour. Ashwin shipped a better fix than the one I recommended
  (`87cc23363`); a bare move to 00:30 would have traded one gap for a worse one.
- `dispatcher.py --mark-ok daily-ops-sweep` was applied at 09-10 14:46:24Z, so
  `--status` no longer reads `failed` for a resolved incident.

**2. `economy-rates`, `economy-housing` and `ops-autofix` each logged a MISSED
slot, and all three are the expected consequence of a job being NEW.** A slot
that predates the job's deployment cannot have run. The first tick that could
see each job found its last slot outside the catch-up window and correctly
seeded forward instead of firing a backlog. `economy-{rates,housing}` reached the
live dispatcher at 09-10 12:43Z (`HANDOFF.md` §E: committing to the repo does not
deploy anything); `ops-autofix` at 09-10 19:37Z with `catchup_hours = 1`
deliberately. All three are now fully deployed: `dispatcher.py --status` from the
live directory lists 28 jobs including all three, and the runner symlinks for
`economy-rates`/`economy-housing` resolve into the repo. (I read `--status`, which
is read-only; I did not run `--check-sync`.)

**3. `WNBA season refresh` failed at 09-10 12:42Z and it was the guard working.**
Re-run green the same afternoon (34485939747). `HANDOFF.md` §G and §H carry the
reasoning, including the tied East lead being a shared title.

**4. F1 sitting on R13 in mid-September is correct, and I verified it rather than
assuming.** R13 is the Italian GP at Monza, 2026-09-06 -- genuinely the last
completed race. The stored 2026 season has 13 rounds and a conspicuous gap
between Japan (03-29) and Miami (05-03), which looks like two missing races and
is not: **Bahrain and Saudi Arabia were cancelled outright** after the Middle East
conflict, cutting the calendar from 24 races to 22 and renumbering everything
after them. That is exactly why Monza reads as round 13 here while pre-cancellation
calendar listings still call it round 15. Next race is Madrid on 09-13, so the
poller should pick up R14 this weekend. (Sources:
[Sky Sports](https://www.skysports.com/f1/news/12433/13519453/f1-confirms-cancellation-of-bahrain-and-saudi-arabian-grands-prix-due-to-war-in-middle-east-as-2026-calendar-reduced-to-22-races),
[Motorsport.com](https://www.motorsport.com/f1/news/bahrain-and-saudi-arabia-f1-races-officially-cancelled-amid-middle-east-conflict/10805321/).)
The single `ERROR: jolpica fetch failed` in `launchd-f1-weekly.out` is from an
older window (the R11 era) and the next hourly run recovered it.

**5. `newsletter-daily`'s healthchecks tile is red for a reason that is not a
failure, and it clears itself at 07:00Z today.** See the P3 below for the durable
fix; no action is needed for the tile itself.

**Also checked and clear.** I scanned every log line in the window for in-script
`push()` alerts, not just failures, and there are none beyond the two known ones.
`gap-league-watch`: Indian Super League still `awaiting_target` (2026 unpublished
upstream, latest season on the API is 2025), "no state transitions this run".
`business-daily` raised no new-geo-stub notice, revalidated on attempt 1 and
warmed `/business`, `/business/markets` and `/business/currencies` to HTTP 200.
`feed-monitor` is all `ok` except the standing `empty ESPN PGA scoreboard`, which
is correct -- the Biltmore Championship is played Sept 17-20. `football-standings`
ran 4x, every run `standings=2238 fixtures=1167 unmatched=0 collisions=0`.
**Yesterday's Champions League label reconcile is still holding**: the exported
`live-competitions-2026.json` (generated 09-10 23:10Z) carries exactly ONE
Champions League group of 36 rows, all on 1 game played, with no orphaned
`League Phase` table.

**The new `ops-autofix` job is behaving.** Three scheduled runs, each finding only
the `newsletter-daily` tile, each correctly declining to act because `check_down`
is not in its whitelist. It announced that finding once (09-10 20:40Z) and has
stayed quiet since, which is the de-duplication in `6299174d8` working as
intended. It also correctly refused to run at all while the working tree was
dirty. Worth knowing: two of its three remedies have still never fired on a live
fault, so their first real exercise will be against production.

## Needs Ashwin's attention

Nothing is broken right now. Three items, all low priority.

### [P3] Recovering the newsletter by hand leaves its healthchecks tile red, every time

**What happened.** `newsletter-daily` has read `down` since 09-10T07:00:03Z and
still does, even though that day's digest was completed successfully by hand 105
minutes later. `ops-autofix` has flagged it `[high]` on all three of its runs.

**Root cause, confirmed from the ping history rather than inferred.** The
healthchecks ping is not in `run-daily.sh` at all -- it comes from the launchd
plist, which invokes `hc-run.sh newsletter-daily /bin/bash .../run-daily.sh`. The
wrapper is what pings start/success/fail. The hand recovery invoked
`run-daily.sh` **directly**, so the success ping never happened. The ping log is
unambiguous:

```
135 fail     2026-09-10T07:00:03Z  dur=2.45     <- the OAuth failure
134 start    2026-09-10T07:00:00Z
133 success  2026-09-09T07:19:16Z  dur=1156.07  <- last healthy run
```

Nothing at 08:45Z, which is when the successful re-run actually ran.

**Why it matters, mildly.** The tile self-heals at today's 07:00Z launchd run, so
this specific instance needs nothing. But every hand recovery will do this again,
and a monitoring tile that stays red after the work succeeded is the thing that
teaches you to ignore red tiles. Note this is specific to the newsletter:
`daily-ops-sweep`'s own hand re-run on 09-10 *did* ping correctly (start 14:29:49,
success 14:39:14), because `run-daily-ops-sweep.sh` gets wrapped by the
dispatcher.

**Recommended fix.** Recover through the wrapper instead of around it:

```bash
/bin/bash ~/metro-mini-jobs/hc-run.sh newsletter-daily \
          /bin/bash ~/newsletter-podcast/run-daily.sh
```

That is byte-for-byte what the plist does, so the tile tracks reality. If you'd
rather not have to remember it, the durable version is to move the `hcping`
calls from `hc-run.sh` into `run-daily.sh` itself, guarded so the plist does not
double-ping. I did not make either change; this run is report-only.

### [P3] `economy-rates` fires at 07:30Z today -- the first genuine run it has ever had

Today is Friday, `weekdays = [5]`, so the job that has never once executed runs in
about six and a half hours. Pre-flight is green and unchanged from yesterday's
check: both runner symlinks exist and resolve into the repo, `_common.sh` is
present, and the runner gates on `--self-test` before any network call. Mode 644
on the runner targets is fine -- `dispatcher.py` invokes them as
`["/bin/bash", path]`, same as `business-daily.sh`.

`economy-housing` follows at 07:30Z tomorrow (Saturday). Tomorrow's 01:00Z sweep
will cover the rates run in its window, so this will be reported on without you
doing anything. **What to look for if you check yourself:** a `DONE economy-rates`
around 07:30Z and the `NEW DECISIONS` block in its log. `HANDOFF.md` 2026-09-09
notes the rates refresh refuses a thin base, so a refusal on the first run is the
guard working, not a break.

### [P3] Standing, not from this window: the mktcap metro queue is still 40 deep

`mac-mini-jobs/mktcap-review-queue.md` is still dated **2026-09-05** and still
lists the same 40 unmapped companies awaiting your metro curation (Boehringer
Ingelheim, Anhui Conch Cement, Mohawk Industries, St. James's Place and 36
others). `mktcap-refresh` next runs **tomorrow, Saturday 09-12 at 09:00Z**, and
that run overwrites this file -- the queue itself is regenerated from Supabase, so
nothing is lost, but the list you see today will be replaced by the list as of
tomorrow. Only you can clear it. Nothing on the site is wrong meanwhile: unmapped
companies queue as geo stubs and are never guessed.

---
*Read-only sweep. No job re-run, no data written, no healthchecks pinged, no
Supabase write. Only this file was committed.*
