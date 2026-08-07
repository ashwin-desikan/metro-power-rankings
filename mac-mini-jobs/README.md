# Metro Area Project — Mac mini jobs

> **Cross-machine coordination:** the Mac mini Claude and the Windows Claude
> coordinate via `HANDOFF.md` at the root of the metro-power-rankings repo
> (`~/Projects/Metro Area Project/HANDOFF.md` on the mini). Pull it and read the
> latest entries before making changes that affect both machines.

Two always-on jobs for the Mac mini, both grounded in how the repo already works.

**Caveat:** these were written and syntax-checked on a Windows machine, not the
mini. Test each one by hand (steps below) before loading it into `launchd`. The
ESPN standings validator was verified against the live payload; the scoreboard,
SPAIA/NPB, and Sportz/WTC validators were built from your `lib/*.ts` parsers.

---

## 1. Feed-shape monitor (`feed_shape_monitor.py`)

**What it does that you don't already have.** `.github/workflows/external-url-monitor.yml`
already checks HTTP *status* (2xx/3xx) on the ESPN and Substack URLs and files a
GitHub Issue on failure. It explicitly does **not** check response *shape*. This
job fetches each feed, parses the JSON, and asserts the structural keys your
parsers depend on still exist. A feed that returns `200` with renamed keys (ESPN
has renamed things mid-season; SPAIA and Sportz are undocumented) passes the
status probe but silently breaks a page. This catches that. No overlap.

**Feeds checked:** ESPN standings (NFL, MLB, NBA, NHL, EPL, MLS, WC2026, AFL, NRL),
ESPN scoreboards (WC2026, PGA, ATP), SPAIA NPB, Sportz ICC WTC.

**Noise posture:** an empty-but-well-formed payload (off-season) is a soft note,
never an alert. Only a missing/renamed key or a fetch failure alerts. Every run
appends one line to `feed-monitor.log`; healthy runs are otherwise silent.

Test it:

    cd ~/metro-mini-jobs
    set -a; . config.env; set +a
    python3 feed_shape_monitor.py     # prints a per-feed table; exit 1 if any FAIL

---

## 2. Egress refresh (`metro-mini-refresh.sh`)

A local mirror of `.github/workflows/civic-data-refresh.yml`: runs the
egress-sensitive refreshes (leaders + governors + congress + mayors via Wikidata
SPARQL, billionaires, valuations, power ranking), commits changed files under
`public/data` with a `[vercel skip]` marker, and pushes to `origin/main`. ISR
reads from GitHub raw, so **no Vercel build fires**. Each underlying script
aborts without writing on any upstream failure, so bad data can't overwrite good.

**Why run it on the mini:** offloads Actions minutes, and Wikidata SPARQL is more
reliable from a stable residential IP than from a shared GitHub runner (which
gets rate-limited). It also gives a home to refreshes that today only run
interactively in Cowork.

> **Run exactly one runner.** If you enable this, disable the overlapping
> GitHub Actions schedules (`civic-data-refresh.yml`, `leaders-refresh.yml`,
> `billionaires-refresh.yml`) — comment out their `schedule:` blocks, keeping
> `workflow_dispatch` as a manual fallback. Otherwise the mini and Actions will
> race and produce duplicate commits.

Prerequisites on the mini: Python 3.12, and a repo clone that can push to
`origin/main` non-interactively (an SSH deploy key with write access is cleanest).

Test it (safe, no commit):

    cd ~/metro-mini-jobs
    # set DRY_RUN="1" in config.env first
    ./metro-mini-refresh.sh            # runs refreshes, shows the diff, commits nothing

Then set `DRY_RUN="0"` for the real run.

---

## Setup

1. Copy this whole folder to the mini, e.g. `~/metro-mini-jobs`.
2. `cp config.env.example config.env` and fill it in (repo path, ntfy topic).
3. Notifications: with ntfy (free, no account), pick a private topic name in
   `config.env` and subscribe to it in the ntfy app or at `https://ntfy.sh/<topic>`.
   Test: `python3 notify.py "test" "hello from the mini"`.
4. Make the scripts executable: `chmod +x metro-mini-refresh.sh feed_shape_monitor.py notify.py`.
5. Test both jobs by hand (above) before scheduling.
6. Edit the two `.plist` files: fix the folder path if you didn't use
   `~/metro-mini-jobs`, and adjust the times if you like (monitor defaults to
   daily 08:00, refresh to Sunday 09:00 local).
7. Load them:

       cp com.citizenofnowhere.*.plist ~/Library/LaunchAgents/
       launchctl load ~/Library/LaunchAgents/com.citizenofnowhere.feed-monitor.plist
       launchctl load ~/Library/LaunchAgents/com.citizenofnowhere.egress-refresh.plist

   Force a run to confirm: `launchctl start com.citizenofnowhere.feed-monitor`.
   Unload with `launchctl unload ~/Library/LaunchAgents/<label>.plist`.

launchd stdout/stderr go to `/tmp/con-*.log`; the monitor's own history is in
`feed-monitor.log`.

---

## 3. Scheduled-data dispatcher (`dispatcher.py`) — added 2026-08-05

**⚠️ CORRECTED 2026-08-07 — `jobs.toml`'s ROLLOUT STATE block is the authority for what the mini actually owns, not this file and not `GITHUB-TO-MINI-MIGRATION.md`. This paragraph used to say four; it is two. Believing otherwise invites someone to comment out the remaining Action schedules and leave those jobs with no runner anywhere.** The mini owns two data refreshes that used to run as GitHub Actions:
**business-daily** and **forecast**, live since 2026-08-05 with their Action schedules commented out. **predictions** (Tue+Fri, `40 6 * * 2` / `40 11 * * 5`) and **mlb-sim** (`40 9 * 3-11 *`) are ported but their Actions still own them, and their `jobs.toml` rows are commented out. Five legacy launchd jobs were also folded onto the dispatcher on 2026-08-06 — activity-feed, substack-daily, euro-comps (04:00 UTC), gap-league-watch (05:00 UTC) and football-standings (05:00/11:00/17:00/23:00 UTC, a deliberate 1x→4x restore; on api-football 429s step down to `["05:00","17:00"]`, never back to one run) — and **their plists are deliberately UNLOADED and must stay unloaded**, because loading one alongside its dispatcher row races two copies of the same script through `git pull`/`commit`/`push` on one working tree and the dispatcher lock does not protect against it. See `DST-MIGRATION.md`. The reasoning,
the per-job verdicts and what deliberately stayed on Actions are in
[`GITHUB-TO-MINI-MIGRATION.md`](GITHUB-TO-MINI-MIGRATION.md). Short version:
GitHub dispatches cron 1-4 hours late (measured across 348 runs; every run
succeeded, every run was late), and these are the ones whose lateness a
reader can actually see.

### Why one dispatcher instead of one plist per job

- **DST.** launchd `StartCalendarInterval` is *local* time, so a 06:50 plist
  fires at 05:50 UTC in summer and 06:50 UTC in winter. These slots were chosen
  against market and fixture clocks. Every time in `jobs.toml` is UTC.
- **Missed runs.** launchd fires a missed calendar interval once on wake, but
  not if the machine was powered off across the window, and it leaves no record.
  The dispatcher compares the most recent scheduled occurrence against a per-job
  last-run date: asleep at 05:50 and awake at 07:30 still runs; off all day
  records a `MISSED` and ntfy's instead of failing silently.
- Adding or retiming a job is a `jobs.toml` edit, not a new plist and a reload.

### Files

    dispatcher.py                            the 10-minute tick
    jobs.toml                                schedule table (UTC), one [[job]] per slot
    state.json                               last-run date per job (gitignored, machine-local)
    dispatcher.log                           append-only run log (gitignored)
    runners/_common.sh                       shared sync / guard / commit / revalidate helpers
    runners/business-daily.sh                port of business-daily-refresh.yml
    runners/forecast.sh                      port of forecast-weekly.yml
    runners/predictions.sh                   port of predictions-refresh.yml (both slots)
    runners/mlb-sim.sh                       port of mlb-sim-refresh.yml
    com.citizenofnowhere.dispatcher.plist    StartInterval 600

Each runner is a **literal** port of its workflow: same step order, same
self-test gate, same early-exit when nothing changed, same five-attempt
pull-rebase-push loop, same fail-open revalidate ping after the 300 second
GitHub-raw CDN sleep. Do not paraphrase those guards; each exists because of a
specific incident documented in the YAML.

### Install

    cd ~/metro-mini-jobs
    cp config.env.example config.env        # fill in EXCHANGERATE_API_KEY + REVALIDATE_SECRET
    chmod +x runners/*.sh
    python3 dispatcher.py --self-test       # 19 cases, no side effects
    python3 dispatcher.py --status          # what is scheduled and when it last ran

`PYTHON_BIN` must point at the venv (`metro-venv-requirements.txt` pins
numpy 2.5.1) or `runners/predictions.sh` refuses to run.

Then a dry run of one job, before anything is scheduled:

    DRY_RUN=1 bash runners/business-daily.sh

That fetches for real, shows the staged diff and commits nothing. Read the diff.
When it looks right, run it once for real by hand, confirm
`Revalidated on attempt 1` in the output and the `as of` date changing on
`/business/markets`, and only then schedule it.

    python3 dispatcher.py --seed            # <- do not skip this
    cp com.citizenofnowhere.dispatcher.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.citizenofnowhere.dispatcher.plist

`--seed` marks each job's current occurrence as already handled. Without it the
first tick sees every job's last slot as unrun and past its catch-up window, and
fires a `MISSED` alert per job for slots the Actions had in fact already
covered. An alarm channel only works while it is trusted.

### The one-runner rule

For every job moved here, **comment out the `schedule:` block in its workflow
and keep `workflow_dispatch`**. That leaves the Action as a one-click manual
fallback when the mini is down, and guarantees the two never race and produce
duplicate commits. Same discipline `civic-data-refresh.yml`,
`leaders-refresh.yml` and `billionaires-refresh.yml` already follow.

### What watches the watchman

`.github/workflows/staleness-watch.yml` stays on GitHub deliberately: it checks
every 6 hours how long ago each auto-refreshed dataset was last committed and
opens a single rolling Issue when one goes past its budget. A watchdog must not
share a failure domain with the thing it watches, and a 6-hourly check does not
care about a 3-hour dispatch lag. Its thresholds live in
`scripts/ops/staleness_check.py` (also `--self-test`-gated). If you add a job
here, add its output path there.

### Day-to-day

    python3 dispatcher.py --status      # table: slot, last run, status, verdict
    tail -f dispatcher.log              # what the ticks did
    tail -f /tmp/con-dispatcher.err     # launchd-level failures

A failed run alerts once and is **not** retried every 10 minutes; the next slot
is the retry, and the GitHub staleness watch is the backstop if the data goes
genuinely stale.
