# Daily Ops Sweep -- 2026-09-03

Window: 2026-09-01T23:01Z -> 2026-09-03T01:01Z (trailing 26h, selected on each
line's own UTC timestamp). Read-only run: nothing was re-run, fixed, pinged,
marked or written except this file.

## Jobs this window: 18 ok, 2 failed, 1 flagged

20 completed dispatcher occurrences, plus this run:

| When (UTC) | Job | Result |
|---|---|---|
| 09-01 23:03 | football-standings | DONE 87s |
| 09-02 01:05 | daily-ops-sweep | DONE 751s |
| 09-02 02:37 | activity-feed | DONE 5s |
| 09-02 04:08 | euro-comps | DONE 5s |
| 09-02 05:08 | gap-league-watch | DONE 3s |
| 09-02 05:08 | football-standings | DONE 86s |
| 09-02 05:09 | screen-number-ones | DONE 21s |
| 09-02 05:50 | business-daily | DONE 615s |
| 09-02 06:10 | forecast | DONE 615s |
| 09-02 06:20 | substack-daily | DONE 4s |
| 09-02 07:00 | mlb-sim | DONE 1821s |
| 09-02 07:41 | fiba-weekly | **FAIL** exit 1, 5s (resolved, see below) |
| 09-02 07:41 | sound-weekly | DONE 10s |
| 09-02 07:41 | feed-monitor | **FAIL** exit 1, 16s (resolved, see below) |
| 09-02 11:01 | football-standings | DONE 88s |
| 09-02 13:03 | screen-number-ones | DONE 220s |
| 09-02 14:37 | mlb-sim | DONE 1823s |
| 09-02 17:07 | football-standings | DONE 88s |
| 09-02 21:09 | screen-number-ones | DONE 29s |
| 09-02 23:09 | football-standings | DONE 86s |
| 09-03 01:01 | daily-ops-sweep | RUN (this run) |

No `MISSED` lines. Every job due in the window ran: all eight dailies, plus the
Wednesday set (`fiba-weekly`, `sound-weekly`) and `forecast` (Mon/Wed/Fri).
`state.json` shows no job overdue; `mktcap-refresh` is next Sat 09-05 and
`egress-refresh` Sun 09-06. Working tree clean. No job came near its timeout --
`business-daily` and `forecast` both landing on 615s is coincidence, their
limits are 25m and 45m.

All four launchd agents report exit 0 (`launchctl list`: heartbeat,
deploy-watch, dispatcher, f1-weekly). `newsletter-podcast` ran 09-02 clean end
to end: 42:47 episode `spotify:episode:67xwhBoSDywJhsUDY3XZgf` reached READY,
both Gmail drafts created. No 09-03 run yet.

**Job-script `push()` alerts.** One ntfy message fired in this window from a job
that exited clean, and it is retained and readable: `run-deploy-watch.sh` at
09-02 13:58:06Z, "Vercel auto-retry -- Re-triggered canceled build of
df1db8447". Covered in item 2 below. The two dispatcher FAIL pushes (both
07:41Z) are the only others. Everything else that can notify mid-run logged a
clean pass: `gap-league-watch` "no state transitions this run", `football-standings`
`unmatched=0` on all five runs, `business-daily` / `forecast` / `mlb-sim` /
`activity-feed` all exited 0 and can only push via `fail()`.
**Evidence limit, unchanged from prior sweeps:** the ntfy topic
(`?poll=1&since=30h`, read-only GET) retains only that one message, because
ntfy.sh's free tier keeps ~12h -- so it independently confirms push-silence
from ~13:00Z on 09-02 onward, and the earlier half rests on the job logs above.
The six `runners/*.sh` jobs still write no log of their own.

## Self-healed (informational only, no action needed)

**`fiba-weekly` FAIL (09-02 07:41Z)** -- `euroleague.json exists but could not
be read (object of type 'int' has no len())`. Not a corrupt file: the shrink
guard added 09-01 did `len(_before.get("seasons", _before))`, and
euroleague.json's `seasons` is a scalar count (69), not a list, so `len()` raised
TypeError and the `except` reported it as an unreadable file. Fixed the same
morning by `b1c638b35`, which replaces the comparison with a `_sizes()` helper
that uses the int directly where a value is scalar and `len()` where it is
sized, and keeps `ValueError` separate so a genuine corruption still refuses.
**Verified in the artefact, not the commit message:** two clean re-runs at
08:48:09 and 09:09:30 local, both `nations: 59 | WC finals: 19 | EL seasons: 69`
and "no change for fiba this run".

**`feed-monitor` FAIL (09-02 07:41Z)** -- `ESPN PGA scoreboard: competition
missing 2 'competitors'`. A false positive: the PGA feed was wired to
`check_espn_scoreboard`, the team-sport checker, which requires two competitors
per competition. Golf is a field, and the live event (Biltmore Championship,
2026-09-17, state `pre`) had no `competitors` key at all -- so this would have
failed in every gap between tournaments and had been passing on luck. Same
`b1c638b35` adds `check_espn_golf_scoreboard`, which branches on
`status.type.state` and only requires a field once play is under way.
**Verified live:** `feed-monitor.log` shows two clean runs after the fix
(09-02 08:50:03 and 09:09:16 local), both `ok` with PGA a soft `empty`.

Both jobs were marked `ok (manual)` at 07:51:27Z, two seconds after that commit.

**Liga F's disappearance was acted on** (yesterday's item 1). The monotonic
season ratchet this sweep recommended was implemented the same morning in
`bc9a7219c`, including the loud log line -- `RATCHET HELD` now prints on every
run, and `awaiting 2026-27 in api-football:` names the leagues still waiting.
That closes the "nothing logs a league regressing" half completely. **The other
half did not land correctly -- see item 1 below.**

**The HANDOFF question "would run-deploy-watch have healed this on its own?"
now has an answer: yes, in about 30 minutes, unattended.** The 09-02 entry
records a build-relevant commit pushed under a `[vercel skip]` tip
(`f7090d28c` under `73339f8bd`) and asks whether the watcher would have caught
it. It happened a second time that afternoon -- `df1db8447` (the ESPN
User-Agent fix, touching `lib/`) was pushed at 13:28:10Z with
`3a4cd879b` (docs, `[vercel skip]`) as the tip, so Vercel evaluated the tip
only, `vercel-ignore.sh` rule 1 matched, and no build ran. `run-deploy-watch.sh`
re-triggered it unattended at 13:58:03Z with `19f8c2181`, which touches only
`lib/deploy-retry.ts` and carries the script's exact generated subject
(`run-deploy-watch.sh:144`). It reached READY. No human involved.

## Needs Ashwin's attention

### 1. 🔴 The Liga F ratchet relabels the season but does not swap the table, so the site is now publishing last season's completed table AS the live 2026-27 season

**What happened.** `bc9a7219c` fixed the label and left the data behind. The
ratchet at `scripts/apifootball/refresh_women.py:167-173` reassigns `season`,
`placeholder` and `label`, but never reassigns `groups` -- and `groups` still
holds what `fetch_standings()` returned, which in the regression case is the
*placeholder* payload: the completed 2025-26 table.

`public/data/football/wlive-2026.json` right now (generated 09-02T23:11:18Z,
and again at 09-03 00:09Z):

```
season_label "2026-27"   season 2026   placeholder FALSE
16 rows, every club played: 30
rank 1  Barcelona W   P30 W29 D0 L1  GF130 GA9  87 pts
rank 16 (last)        P30            9 pts
```

That is unambiguously the finished 2025-26 season -- yesterday's report
identified exactly this shape ("all 16 clubs on `played: 30`, Barcelona W on 87
points") as the completed table. It is now flying a `2026-27` label with
`placeholder: false`.

**This is strictly worse than the state it replaced.** Walking the committed
bundle through git:

| Bundle commit | UTC | Published |
|---|---|---|
| `50fbad7d7` .. `4d714edfe` | 08-31 06:07 -> 09-01 00:05 | `2026-27` ph=false, **played=[1]** -- correct |
| `c8c24b4f3` .. `0808ba120` | 09-01 06:05 -> 09-02 06:09 | `2025-26` ph=**true**, played=[30] -- stale but honestly labelled |
| `bc9a7219c` .. `8dce7ee3d` | 09-02 09:00 -> 09-03 00:11 | `2026-27` ph=**false**, played=[30] -- **stale AND mislabelled** |

Before the ratchet a reader saw "2025-26" on a placeholder. After it, the same
rows are presented as the current season with the placeholder flag cleared, so
nothing on the page or in the data says the table is a year out of date.

**Verified against the real world, not assumed.** Liga F 2026-27 has played
matchday 1 only: Barcelona top on 1 game (5-0), CD Tenerife bottom after losing
0-5, all 16 clubs on one match. So the correct table is 16 clubs at `played: 1`
-- which the site *had* on 08-31, and which is still recoverable from
`4d714edfe` (09-01 00:05Z), the last commit carrying it.

**Scope is exactly one league.** Today's log prints `1 league(s) would have gone
backwards this run`, and only Liga F. FA WSL is correctly still
`2025-26 PLACEHOLDER` (its season starts 4 Sept, so that is right and should
clear on its own around 5-6 Sept); NWSL is on a genuine live `played=[21,22]`.

**Recommended fix.** Make the ratchet carry the last published *rows*, which is
what the invariant was supposed to mean:

1. `committed_seasons()` (`refresh_women.py:99-115`) currently returns
   `{league_id: (season, placeholder)}` -- it reads the bundle and throws the
   rows away. Return `groups` too, e.g.
   `{league_id: (season, placeholder, groups)}`.
2. In the ratchet block (`:167-173`), when the regression fires, also restore
   `groups = was_groups` alongside the season/label reassignment.
3. **If there are no committed groups to restore, do not flip the label.** Fall
   through to the honest placeholder instead. A label change with no data behind
   it is the bug being fixed; it must not be reachable.
4. Because the guard's whole job is to survive this, add the case to the
   self-test: published `2026 played=1` + upstream returning
   `2025 played=30 placeholder` must yield `2026-27` **with the played=1 rows**,
   and a missing-prior-bundle variant must yield the placeholder.

Once shipped, the first run repopulates from whatever api-football is serving;
if upstream is still regressed, the ratchet will hold the recovered matchday-1
table from `4d714edfe` rather than the finished one. Worth checking again after
matchday 2 (~5-7 Sept), when upstream should publish a genuinely live table and
the ratchet stops firing -- today's log line `RATCHET HELD: Liga F` disappearing
is the signal.

### 2. `run-deploy-watch.sh`'s duplicate-build guard fails OPEN under GitHub rate limiting, and was actually bypassed that way on 09-02

**What happened.** `/tmp/deploy-watch.err` recorded
`curl: (56) The requested URL returned error: 429` at 09-02 14:58 local
(13:58Z) -- the same minute the watcher re-triggered `df1db8447`. The 429 came
from the duplicate-build guard at `run-deploy-watch.sh:89`, the *unauthenticated*
`api.github.com/repos/.../deployments?sha=$TARGET` call whose comment reads
"Repo is public; unauthenticated API is fine at this rate."

**Root cause.** That call is `curl -fsS ... 2>/dev/null || true`. On a 429,
`curl -f` fails, `|| true` swallows it, `DEPLOY_OK` comes back empty, the
`[ "$DEPLOY_OK" = "yes" ]` test is false, and the script proceeds to spend a
build. The inner `urllib.request.urlopen(statuses_url)` has the same shape --
its failure is caught by a bare `except Exception: pass`. Both paths read
**"no answer" as "no successful deployment."**

**This is the exact hazard CLAUDE.md already names**, one endpoint over: "Do not
count GitHub `deployment_status` events: that endpoint returns 404 under
secondary rate limiting, which reads as 'no builds' when it means 'no answer'.
That is exactly how the 13 went unnoticed." The deploy-watch guard consults the
sibling `deployments` endpoint unauthenticated and makes the same inference.

**On 09-02 the outcome was still correct** -- I checked all three pages of
Vercel deployments across the window and `df1db8447` has no deployment record at
all, so it genuinely needed the re-trigger. But the guard did not establish
that; it simply failed open. The scenario it exists to prevent (a build that
finished while the live check lagged, which "burned ~8 min on 2026-08-03") is
the one where a 429 makes it spend a duplicate build.

**Blast radius is bounded**, which is why this is a fix-when-convenient and not
an emergency: `STALE_MIN=20`, `COOLDOWN_MIN=18`, `MAX_ATTEMPTS=3`, and the
agent runs on `StartInterval 600`. Worst case is up to 3 duplicate builds on one
target before it gives up -- but against a 2/day budget that is a real cost.

**Recommended fix**, smallest reversible change first:

1. Distinguish "no" from "no answer". Capture the HTTP status
   (`curl -sS -o body -w '%{http_code}'`) instead of relying on `-f` + `|| true`.
   On any non-200 (429, 403, 5xx), **skip the re-trigger this tick and return** --
   the agent runs again in 10 minutes and the target is still stale, so nothing
   is lost by waiting for a real answer. That is the fail-closed posture
   `vercel-ignore.sh` already adopted for the same class of problem.
2. Send `Authorization: Bearer $GITHUB_TOKEN` if one is available on the mini.
   The unauthenticated limit is 60 requests/hour per IP shared with every other
   job on this box, and this agent alone wakes 144 times a day; authenticated is
   5,000/hour. That most likely removes the 429 entirely.
3. Log the distinction. The current failure is invisible except as a bare curl
   line in `/tmp/deploy-watch.err` with no timestamp and no context -- it only
   surfaced here because the file's mtime happened to match the retry.

### 3. Carried from yesterday, still open: the `prepare-commit-msg` merge hole is unpatched

`.githooks/prepare-commit-msg` still reads
`case "$SOURCE" in merge|squash|commit) exit 0;; esac`, so git-generated merge
subjects still get no `[vercel skip]` consideration. Yesterday's report has the
concrete patch and the three pinned SHAs.

**It did not recur on 09-02, and I want to be precise about why rather than
imply it is fixed.** The one merge that built (`8ccb4d98a`, 11:47:32Z) was
*legitimate*: it carried `027923904` "fix(espn): stop sending the User-Agent
that Akamai's edge rejects", which is untagged and touches `lib/espnFetch.ts`.
Yesterday's proposed patch would correctly have left that merge alone (1
untagged commit on the range -> `exit 0`). So the hole is still there; it just
was not hit by an all-skipped merge this window. The fix is still worth applying
before it is.

### 4. Carried, unchanged

- **`egress-refresh`** has failed two Sundays running (08-23, 08-30) and
  `state.json` still sits on the 08-30 slot at `ok (manual)`. Next unattended
  run is **Sun 2026-09-06 09:00Z**. After 09:40Z that day:
  `grep -A20 'RUN egress-refresh' ~/metro-mini-jobs/dispatcher.log | tail -40`.
- **The mini's project memory directory is still empty** with no `MEMORY.md`
  (`~/.claude/projects/-Users-ashwindesikan-Projects-Metro-Area-Project/memory/`),
  so CLAUDE.md's pointer to `feedback_vercel_build_budget_incident` still
  resolves to nothing on this machine. This run is read-only and did not create
  it.

## Also noted, no action

- **Vercel: 4 READY production builds on 09-02, against the 2/day budget** --
  counted with the Vercel MCP across three pages covering the whole window
  (`CANCELED` is free and there were 40+ of those), not from GitHub
  `deployment_status`. All four were genuinely build-worthy, so there is no
  guard bug here, but the day ran double the budget:
  `6468e8837` 10:09Z (rugby + EuroLeague boards, `[deploy-retry]`),
  `8ccb4d98a` 11:47Z (merge carrying the untagged `lib/espnFetch.ts` fix),
  `19f8c2181` 13:58Z (deploy-watch's re-trigger of `df1db8447`),
  `a83494a84` 18:59Z (the 47 misrecorded football fixtures).
  Two of the four were `[deploy-retry]` commits rescuing work whose own build
  never ran -- both instances of the `[vercel skip]`-tip behaviour in the 09-02
  HANDOFF entry. The mechanism is understood and documented as designed
  behaviour; the cost is that shipping through a batched push takes a second
  commit to land.
- **Release notes are current.** `npm run check:release-notes` passes,
  125 entries, newest 2026-09-02 -- so 09-02's shipping day was logged despite
  being a heavy one.
- `gap-league-watch`: India L1 (Indian Super League) remains correctly
  `awaiting_target`; api-football's latest published season is still 2025. One
  pending league, no transitions, no push.
- `screen-number-ones` ran three times cleanly. `mktcap-review-queue.md` is
  untouched since 08-29; `mktcap-refresh` next runs Sat 09-05.

Sources for the real-world check in item 1:
[2026-27 Liga F (Wikipedia)](https://en.wikipedia.org/wiki/2026%E2%80%9327_Liga_F),
[2026-27 Spanish Liga F standings (ESPN)](https://www.espn.com/soccer/standings/_/league/esp.w.1)
