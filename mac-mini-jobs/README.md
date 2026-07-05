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
