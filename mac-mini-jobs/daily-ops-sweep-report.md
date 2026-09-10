# Daily Ops Sweep -- 2026-09-10

Window `2026-09-09T12:30Z` -> `2026-09-10T14:30Z` (trailing 26h), selected on each
dispatcher.log line's own UTC timestamp. Read-only run: nothing re-run, no data
written, no healthchecks pinged, no Supabase write. This report file is the only
thing committed.

> Second sweep of the day. The 01:00Z scheduled occurrence FAILED (see below) and
> was re-run by hand at 09:08Z covering `09-09T07:08Z` -> `09-10T09:08Z`. This run
> re-derives everything independently and extends the window to 14:30Z, which picks
> up the 11:00Z football-standings run, the two MISSED economy slots, the canary's
> first dispatcher run and the WNBA re-run -- none of which existed at 09:08Z.

## Jobs this window: 16 ok, 2 failed (both already recovered), 3 flagged

**Dispatcher occurrences (16): 15 DONE, 1 FAIL.**

| when (UTC) | job | result |
|---|---|---|
| 09-09 13:09 | screen-number-ones | DONE 16s |
| 09-09 14:39 | mlb-sim | DONE 451s |
| 09-09 17:07 | football-standings | DONE 91s |
| 09-09 21:09 | screen-number-ones | DONE 17s |
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
| 09-10 11:48 | claude-auth-canary | DONE 0s (first real run) |

Plus `MISSED economy-rates` (slot 09-04 07:30Z) and `MISSED economy-housing`
(slot 09-05 07:30Z) at the 11:48Z tick -- both expected, see Self-healed §4.

**Off-dispatcher on the mini:** the `f1-weekly` launchd poller ran hourly all
window (~26 runs), every one `idle: 2026 R13 already synced`. Correct, not stale
-- verified against Jolpica directly: R13 (Italian GP, 2026-09-06) *is* the last
completed race, and R14 (Spanish GP) is 2026-09-13. `newsletter-daily` at 07:00Z
FAILED and was recovered by hand (Self-healed §1).

**GitHub Actions:** 61 runs in window, 1 failure (`WNBA season refresh`
34478252537, 12:42Z), re-run green as 34485939747 at 13:57Z. Self-healed §3.

**Vercel: 31 production deployments today (UTC), ALL `CANCELED` -- 0 paid
production builds** against the 2/day cap. Counted via the Vercel API across the
full UTC day in three pages (00:00Z-00:21Z empty, 00:21Z-06:09Z 11 deployments,
06:09Z-14:00Z 20 deployments); every commit carried `[vercel skip]` and the guard
skipped each. Nothing in `ERROR`, `BUILDING` or `QUEUED`.

## Self-healed (informational only, no action needed)

**1. The 01:00Z sweep and the 07:00Z newsletter digest both died on one expired
Claude OAuth session.** Identical cause, 6 hours apart: `Failed to authenticate:
OAuth session expired and could not be refreshed`. Both `auth_expired()` guards
did the right thing (3-second exits, no futile retry). Ashwin re-authed and
re-ran both by hand; I verified the digest is genuinely healthy rather than
merely exit-0 -- `final.mp3` 38,749,869 bytes, `episode.json` present, Spotify
episode `1IaF1Kz9HkIA1tqYQMyXPa` polled through to `READY`, both Gmail drafts
created (`logs/2026-09-10.log`, 10:10:48 done). Third occurrence: 2026-07-30,
2026-08-29, 2026-09-10. Fully documented in `HANDOFF.md` 2026-09-10 §A; the
forward-looking gap it leaves is the one item below.

**2. The `DIGEST-FAILED.txt` marker at the newsletter-podcast root is stale, not
live.** The watchdog wrote it at 08:30Z, 40 minutes before the manual re-run
finished at 10:10Z. I read `watchdog.sh` rather than assuming: the healthy branch
does `rm -f "$MARKER"` unconditionally, and today's build satisfies all four of
its conditions, so tomorrow's 08:30Z watchdog clears it. Nothing else in the tree
reads that file.

**3. `WNBA season refresh` failed at 12:42Z and it was the guard working.**
`wnba_finalize.py` refused to write flags against a postseason bracket ESPN has
scheduled but not yet seeded. Fixed and re-run green the same morning
(`ffebb034f`, `88e906673`; run 34485939747). `HANDOFF.md` §G and §H carry the
full reasoning, including the tied East lead being a shared title.

**4. `economy-rates` and `economy-housing` logged MISSED for slots six and five
days old.** Not a fault: both jobs were only deployed to the live dispatcher at
12:43Z today, so the 11:48Z tick was the first tick that could see them, found
their last slots past the 40h catch-up window, and correctly seeded to the next
real ones. `HANDOFF.md` §E has the root cause (launchd runs `~/metro-mini-jobs`,
a separate copy; committing to the repo schedules nothing). Confirmed resolved:
`python3 dispatcher.py --check-sync` run from the LIVE directory now reports
`in sync`, and `--status` lists 27 jobs where the live copy carried 24.

**5. Two healthchecks tiles currently misreport, and both self-correct tomorrow.**
`newsletter-daily` is `down` (last ping 07:00:03Z, the failure) and
`daily-ops-sweep` is stuck in `started` (last ping 11:50:58Z, from today's
provisioning). Cause in both cases is that a hand re-run bypasses `hc-run.sh`, so
the recovery never pings. `newsletter-daily` goes green at tomorrow's 07:00Z run
and `daily-ops-sweep` at tomorrow's 01:00Z run. Flagging only so a red tile
tonight is not chased twice. The other 20 checks are `up`.

**Also checked and clear:** no in-script `push()` alert fired anywhere this window
beyond the two known ones -- I scanned every log line in the window for alert
markers, not just failures. `gap-league-watch` reports Indian Super League still
`awaiting_target` (2026 not published upstream; latest season on the API is 2025),
"no state transitions this run". `business-daily` raised no new-geo-stub notice.
`feed-monitor` is all `ok` except the standing `empty ESPN PGA scoreboard`, which
is correct (Biltmore Championship Asheville is played Sept 17-20). The Champions
League label reconcile shipped this morning is confirmed live in the exported
bundle: `live-competitions-2026.json` now carries exactly ONE group
(`UEFA Champions League`, 36 rows, 24 teams on 1 game played), with the orphaned
`League Phase` table gone.

## Needs Ashwin's attention

### [P2] The auth canary cannot protect the earlier of the two jobs it was built for

**What happened.** `claude-auth-canary` was added today at `06:30` UTC. The
comment in `jobs.toml` gives the reason as *"30 minutes ahead of the 07:00Z
newsletter digest, so a warning lands before the day's first Claude-driven job
rather than after it."* That premise is wrong: the day's first Claude-driven job
is `daily-ops-sweep` at **01:00Z**, five and a half hours *earlier*. The canary's
own alert body already says so in as many words -- *"daily-ops-sweep (01:00Z) and
the newsletter digest (07:00Z) will both fail."*

**Why it matters.** Replay this morning exactly and the canary still does not
help the sweep. The credential held no refresh token by 01:01Z, so a canary run
at 00:30Z would have reported `NO_REFRESH_TOKEN` (its loudest branch) with 30
minutes to spare; a canary at 06:30Z reports it 5h31m after the sweep has already
failed. The digest is protected, the sweep is not -- and the sweep is the one job
whose whole purpose is that you should not have to notice things yourself. It
also has no same-day retry by design (`dispatcher.py` L314-316, "the alert is the
signal, and the next slot is the retry"), so a failed 01:00Z occurrence means no
ops sweep at all that day unless a human sees the ntfy, which is precisely what
happened today.

**Evidence.** `~/metro-mini-jobs/jobs.toml` (canary block, `time = "06:30"`;
daily-ops-sweep block, `time = "01:00"`); `mac-mini-jobs/run-claude-auth-canary.sh`
L78 and L103 (the `NO_REFRESH_TOKEN` branch is state-based, so it fires whenever
it is run, not on a date); `logs/daily-ops-sweep-2026-09-10.log` 02:01:15;
`HANDOFF.md` 2026-09-10 §A and §F.

**Recommended fix.** Move the canary ahead of the *first* Claude job, not the
second, in the repo's `mac-mini-jobs/jobs.toml`:

```toml
[[job]]
id = "claude-auth-canary"
time = "00:30"          # was 06:30 -- 30 min ahead of daily-ops-sweep (01:00Z),
                        # which is the day's FIRST Claude-driven job; the digest
                        # at 07:00Z is the second and is still covered.
```

The 00:30 slot is free (nearest neighbours are `daily-ops-sweep` 01:00 and
`activity-feed` 02:30). Leave `catchup_hours = 6` as is -- it still spans both
jobs from that slot. Then deploy it, because editing the repo copy schedules
nothing (§E): `cp "$REPO/mac-mini-jobs/jobs.toml" ~/metro-mini-jobs/jobs.toml`
followed by `cd ~/metro-mini-jobs && python3 dispatcher.py --check-sync`. Test any
warning branch with `--dry-run` only; `NTFY_TOPIC=""` does **not** muzzle this
script (it sources its own config afterwards) and already sent two real alerts
today.

### [P3] The dispatcher still records this morning's sweep as `failed`

**What happened.** `python3 dispatcher.py --status` reports
`daily-ops-sweep  09-10 01:00  2026-09-10  failed  already-ran`. That is
accurate about the 01:00Z occurrence and misleading about the day: the sweep ran
to completion twice afterwards by hand (09:08Z, report committed `e9ac778bc`; and
this 14:29Z run). A hand-launched `run-daily-ops-sweep.sh` writes no dispatcher
state and pings no healthchecks, so both status systems will read red until
tomorrow's 01:00Z occurrence overwrites them.

**Why it matters.** `--status` is the first thing a cold session or a future sweep
reads to decide what is broken. Left as is, tomorrow's sweep sees a `failed`
daily-ops-sweep and spends effort re-investigating a resolved incident -- and
`--mark-ok` exists in `dispatcher.py` for exactly this case ("record JOB_ID's last
recorded run as 'ok (manual)' after fixing a FAIL by hand outside the wrapper").

**Recommended fix.** One command, from the live directory:

```
cd ~/metro-mini-jobs && python3 dispatcher.py --mark-ok daily-ops-sweep
```

It corrects the existing entry, holds the tick lock, invents no occurrence, and
never affects what runs next (`decide()` does not read `last_status`). I did not
run it: this sweep is report-only and `--mark-ok` is a state write.

### [P3] Watch tomorrow's 07:30Z `economy-rates` -- first genuine run ever

Not yet a problem, but the first execution of a job that has never run, and the
next sweep will not see it until Saturday's report. Pre-flight done here, all
green: both symlinks exist and resolve into the repo
(`~/metro-mini-jobs/runners/economy-{rates,housing}.sh`, created 12:43Z today),
`_common.sh` is present, `weekdays = [5]` and `[6]` are correct for Friday
2026-09-11 and Saturday 2026-09-12, and both runners gate on `--self-test` before
any network call (`refresh.py --self-test` and `load_policy_rates.py --self-test`;
`build_housing.py --self-test`).

One thing that looks alarming and is not: both runner targets are mode `100644`,
not executable. That does not matter -- `dispatcher.py` L245 builds
`argv = ["/bin/bash", str(path)]`, and `business-daily.sh`, `forecast.sh` and
`predictions.sh` are all 644 and run fine. Recorded so it is not re-raised.

**What to look for:** a `DONE` for `economy-rates` around 07:30Z Friday, and the
`NEW DECISIONS` block in its refresh log. `HANDOFF.md` 2026-09-09 notes the rates
refresh refuses a thin base, so a refusal on the first run is the guard working,
not a break.

### [P3] Standing, not from this window: the mktcap metro queue is 40 deep

`mac-mini-jobs/mktcap-review-queue.md` is dated **2026-09-05** and lists 40
unmapped companies awaiting your metro curation (Boehringer Ingelheim, Anhui
Conch Cement, Mohawk Industries, St. James's Place and 36 others). `mktcap-refresh`
is weekly (Saturdays 09:00Z) and did not run in this window, so this is not a new
finding -- but nothing else surfaces it, and the next run overwrites the file.
Only you can clear it; unmapped companies queue as geo stubs and are never
guessed, so nothing on the site is wrong meanwhile.

---
*Read-only sweep. No job re-run, no data written, no healthchecks pinged, no
Supabase write. Only this file was committed.*
