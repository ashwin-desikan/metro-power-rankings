# Daily Ops Sweep -- 2026-09-10

Window: `2026-09-09T07:08:47Z` -> `2026-09-10T09:08:30Z` (trailing 26h).
Run context: this sweep is itself the **manual re-run** at 09:08Z. The scheduled
01:00Z occurrence failed (see Self-healed #1); Ashwin re-authenticated and
relaunched `run-daily-ops-sweep.sh` at 09:08Z.

## Jobs this window: 19 ok, 1 failed, 1 flagged

**Dispatcher jobs (20 runs):**

| Job | Slot(s) | Result |
|---|---|---|
| mlb-sim | 09-09 07:00Z, 14:30Z, 09-10 07:00Z | DONE (442s / 451s / 450s) |
| fiba-weekly | 09-09 07:10Z | DONE 6s -- **FLAGGED**, see attention #1 |
| feed-monitor | 09-09 07:20Z, 09-10 07:20Z | DONE (14s / 15s) |
| sound-weekly | 09-09 07:30Z | DONE 9s |
| football-standings | 09-09 11:00Z, 17:00Z, 23:00Z, 09-10 05:00Z | DONE (82/91/89/87s) |
| cfb-wed | 09-09 11:40Z | DONE 405s |
| screen-number-ones | 09-09 13:00Z, 21:00Z | DONE (16s / 17s) |
| daily-ops-sweep | 09-10 01:00Z | **FAIL** exit 1 after 3s -- self-healed |
| activity-feed | 09-10 02:30Z | DONE 5s |
| euro-comps | 09-10 04:00Z | DONE 5s |
| gap-league-watch | 09-10 05:00Z | DONE 3s |
| business-daily | 09-10 05:50Z | DONE 340s |
| substack-daily | 09-10 06:00Z | DONE 5s |

No `MISSED` slots. `state.json` shows every job current; the only non-ok status
is `daily-ops-sweep: failed`, which is the 01:00Z record and will clear at the
next scheduled slot.

**Non-dispatcher jobs checked:**
- `newsletter-podcast` daily digest (own launchd agent, 07:00Z): **FAILED**, then
  re-run and completed clean -- see Self-healed #2.
- F1 hourly poller: 10 ticks, all `idle: 2026 R13 already synced`. Nominal.

**In-job `push()` alerts this window (STEP 2):** one, the newsletter watchdog at
08:30Z. `gap-league-watch` logged `no state transitions this run` (no push).
`football-standings` logged `unmatched=0 collisions=0 errors=0` on all four runs
(no UNMATCHED alert). `mktcap-refresh` is Saturday-only and did not run.

## Self-healed (informational only, no action needed)

**1. `daily-ops-sweep` FAIL at 01:01Z -- expired Claude OAuth session.**
```
2026-09-10T01:01:15Z | Failed to authenticate: OAuth session expired and could not be refreshed
2026-09-10T01:01:15Z | ERROR: Claude Code login expired on the mini -- run 'claude' ... and re-run.
2026-09-10T01:01:15Z FAIL daily-ops-sweep: failed exit 1 after 3s
```
The `auth_expired()` guard in `run-daily-ops-sweep.sh` worked exactly as designed:
it detected the condition, refused the pointless retry, and exited 1, which made
`dispatcher.py` push its `Metro: daily-ops-sweep failed` ntfy. Ashwin re-authed and
relaunched at 09:08Z -- this report is that run. Nothing further needed for the
run itself; the recurring *cause* is attention item #2.

**2. `newsletter-podcast` daily digest FAILED at 07:00Z -- same OAuth expiry.**
Same root cause, same guard, 90 minutes later. Timeline:
- 07:00:03Z fail (silent from the job itself -- `run-daily.sh` has no ntfy path)
- 08:30:06Z `watchdog.sh` caught it and pushed the urgent alert (`final.mp3` missing)
- 08:45Z re-run; 09:06Z audio built; 09:10:48Z done

Verified healthy, not just "exited 0": `final.mp3` 37 MB, `episode.json` present,
Spotify episode `1IaF1Kz9HkIA1tqYQMyXPa` polled through to `status: READY`, and the
Gmail LinkedIn/Substack drafts were created. No action needed.

**3. Stale `~/newsletter-podcast/DIGEST-FAILED.txt` (written 08:30Z).**
`watchdog.sh` only `rm -f`s the marker on a healthy run, and it runs once daily at
08:30Z. The marker is therefore stale-but-harmless until 2026-09-11 08:30Z, when it
clears itself. Noted so it is not mistaken for a live failure. No action.

## Needs Ashwin's attention

### 1. [P1] `fiba-weekly` silently dropped 5 nations from the Women's Basketball ranking. The bad data is committed; the damage is latent and lands on the next ZZC rebuild.

**What happened.** The 2026-09-09 07:20Z `fiba-weekly` run exited 0 and pushed
`b17d55d9c`, but its log shows a regression the exit code cannot express:

```
UNMAPPED, no rank credited:
    Czechia (CZE, rank 17)
    Chinese Taipei (TPE, rank 39)
    Cote d'Ivoire (CIV, rank 53)
    Virgin Islands (ISV, rank 64)
    St.Vincent and the Grenadines (VIN, rank 103)
mapped 114 of 119 teams, ranking date 2026-04-01
wrote .../public/data/rankings/zzc-extra.json: Women's Basketball now 114 ranks (was 119)
```

The previous run (2026-09-05, `scraper-fiba-2026-09-05.log`) mapped **119 of 119**,
on the *same* source date `2026-04-01`. The upstream data did not change -- 119 teams
both times. Only the mapping broke.

**Root cause.** Commit `46df23bb3` (2026-09-05 22:30, *"zzc: one row per country, and
the Countries hub decides its name"*) deduplicated `public/data/zone-zero-cup.json`
from 249 nation rows to 240, collapsing the double-entries (Taiwan sat on the board
twice: `chinese-taipei` 44th on 21.70 merit and `taiwan` 153rd on 1.00). Its own
comment states the new rule: *"fold to the countries.json slug, never away from it."*

`scripts/basketball/apply_womens_ranking.py` builds its valid-slug universe from
`zone-zero-cup.json` + `countries.json`, and `resolve()` returns `None` -- dropping
the nation -- when its mapped slug is not in that universe. Its `IOC_SLUG` and
`NAME_SLUG` tables (written 2026-09-04 in `17e1c6f94`, one day *before* the
consolidation) still fold the **wrong** way, at exactly these five entries:

| IOC | `IOC_SLUG` target (line) | actual `countries.json` slug |
|---|---|---|
| CZE | `czechia` (L46) | `czech-republic` |
| TPE | `chinese-taipei` (L43) | `taiwan` |
| CIV | `ivory-coast` (L43) | `cote-divoire` |
| ISV | `united-states-virgin-islands` (L52) | `us-virgin-islands` |
| VIN | `st-vincent-and-the-grenadines` (L52) | `st-vincent-the-grenadines` |

The men's script got this right and was never affected: `build_intl_basketball.py`'s
`_FIBA_TO_COUNTRY` (L227-236) folds `czechia -> czech-republic`,
`chinese-taipei -> taiwan`, `cote-d-ivoire -> cote-divoire`,
`virgin-islands -> us-virgin-islands`,
`st-vincent-and-the-grenadines -> st-vincent-the-grenadines`. The women's script is
the odd one out.

**Why the guard didn't catch it.** `apply_womens_ranking.py` L35 sets
`MAX_UNMAPPED = 12`. Five unmapped passes. The assertion's own message --
*"Add them to IOC_SLUG rather than letting the ranking quietly shrink"* -- names
precisely the failure that then occurred.

**Impact is latent, not live.** `zone-zero-cup.json` was last rebuilt 2026-09-05 22:30,
*before* the bad `zzc-extra.json` landed, and the ZZC rebuild is not a scheduled job
(no entry in `jobs.toml` -- it is run by hand). All five countries currently still
carry their Women's Basketball merit on the live board:

```
czech-republic | rank 28  | has Women's Basketball: True
taiwan         | rank 44  | True
cote-divoire   | rank 88  | True
us-virgin-islands | rank 152 | True
st-vincent-the-grenadines | rank 170 | True
```

So nothing is visibly wrong on the site today. **The next `zzc_v1_multipillar.py` run
will silently drop that merit for all five** -- Czechia most materially, at world
rank 17 and currently 28th on the Cup board.

**Corroborating evidence that this is a producer bug, not an engine one.** Four other
sports in the same `zzc-extra.json` emit the alias slugs raw and survive, because
`zzc_v1_multipillar.py`'s `FOLD` map (L249-256) remaps every one of them:

```
Badminton          emits ['chinese-taipei']
Lacrosse           emits ['czechia']
Table Tennis       emits ['chinese-taipei']
Women's Ice Hockey emits ['czechia', 'chinese-taipei']
Women's Basketball emits none -- they were DROPPED, not folded
```

Women's Basketball is the only sport whose producer *validates* against the slug
universe and therefore discards rather than passing through to `FOLD`.

**Recommended fix** (two small edits in `scripts/basketball/apply_womens_ranking.py`,
one file, no other script touched):

1. Repoint the five entries in `IOC_SLUG` (L43, L46, L52) and the matching targets in
   `NAME_SLUG` (L72-82, which carry the same five wrong slugs) at the `countries.json`
   spellings in the table above. This follows `46df23bb3`'s stated rule and matches
   what `build_intl_basketball.py` already does, rather than depending on `FOLD`
   staying in sync with a second table.
2. Tighten the guard so a shrink cannot pass silently again. The script already reads
   the previous count into `before` (L160) purely for a log line -- assert on it, e.g.
   fail when `len(ranks) < before` unless an explicit `--allow-shrink` flag is passed.
   `MAX_UNMAPPED = 12` cannot catch this class of regression, because the failure is a
   *drop against last week*, not an absolute count.

Then re-run `python3 scripts/basketball/apply_womens_ranking.py --dry-run` and confirm
it reports `119 of 119` before writing. Note `--dry-run` exists and is safe.

**I made no change.** The next `fiba-weekly` slot is Wednesday 2026-09-16 07:10Z and
will reproduce 114/119 unchanged; there is no self-heal path.

---

### 2. [P2] Third Claude OAuth expiry on the mini. It takes out both Claude-driven jobs at once, and there is no warning before it happens.

**What happened.** One expired OAuth session failed `daily-ops-sweep` (01:00Z) and the
`newsletter-podcast` digest (07:00Z) on the same morning. Both recovered only because
Ashwin re-authed by hand.

**This is a recurring pattern, not a one-off.** Occurrences found across all logs:

| Date | Job(s) hit | Gap since last re-auth |
|---|---|---|
| 2026-07-30 | newsletter digest (2 attempts) | -- |
| 2026-08-29 | newsletter digest | 30 days |
| 2026-09-10 | newsletter digest **and** daily-ops-sweep | 12 days |

(`~/newsletter-podcast/logs/launchd-daily.out` L2004/2006, 4047, 4871.) The interval is
not a fixed TTL -- 30 days then 12 -- so this reads as a refresh-token failure rather
than a predictable expiry, and it cannot be planned around by calendar.

**What already works, so it does not need rebuilding.** Both wrappers have a correct
`auth_expired()` guard that detects the condition and refuses the futile retry, which
is why each burned 3 seconds rather than a full run. `dispatcher.py` pushed an ntfy for
the sweep, and `watchdog.sh` pushed one for the newsletter. Detection is sound.

**The three real gaps.**
1. **No proactive warning.** Nothing tells Ashwin the session is close to expiring; the
   first signal is always a job that already failed.
2. **`run-daily.sh` is silent on its own failure.** It logs and exits 1, with no ntfy.
   Today the newsletter failure was invisible for 90 minutes until `watchdog.sh` ran at
   08:30Z. That gap is pure luck of scheduling -- the watchdog exists to check Spotify
   readiness, not to be the auth alarm.
3. **A failed sweep produces no report for that day.** `dispatcher.py` records the slot
   and deliberately does not retry (*"the alert is the signal, and the next slot is the
   retry"*, L316-318). So without a human noticing the ntfy and re-running by hand, the
   01:00Z failure would simply have meant no ops sweep on 2026-09-10 at all -- the one
   job whose entire purpose is that Ashwin should not have to notice things himself.

**Recommended fixes, cheapest first:**
- **(a) Give `run-daily.sh` the same alert path the sweep gets.** Add a `push()` ntfy on
  the `auth_expired` branch (the helper already exists verbatim in
  `newsletter-podcast/run-weekly.sh` L9-11 and `retention-spotify.sh` L22-23 -- copy it).
  One-line-ish, removes the 90-minute blind window.
- **(b) Add a proactive expiry canary.** Claude Code stores the OAuth blob in the macOS
  Keychain under service `Claude Code-credentials` (confirmed present on this mini; I did
  not read the secret). A tiny precheck can read its `expiresAt` and push a low-priority
  "re-auth needed within 48h" ntfy, well before any job is due. That converts an
  after-the-fact failure into scheduled maintenance.
- **(c) Consider one same-day retry for `daily-ops-sweep` specifically.** Not a change to
  the dispatcher's general no-retry policy, which is correct -- either a second slot in
  `jobs.toml` (e.g. a 13:00Z catch-up that no-ops when the report file already carries
  today's date) or leaving it as-is and accepting that this job depends on Ashwin seeing
  the alert. Worth an explicit decision either way, since today it was manual recovery
  that saved the run.

**I made no change to any of these.**

## Checked and clear (no action)

- **Deploy discipline.** 20 Vercel deployments since 00:00Z today, **all `CANCELED`** --
  zero `READY`, zero `ERROR`, so **0 paid production builds** against the 2/day cap.
  Every commit carried `[vercel skip]` and the guard skipped each one. Counted via the
  Vercel API (`list_deployments`), not GitHub `deployment_status`, per CLAUDE.md.
- **`substack-daily` new post `four-seasons-one-ledger`,** committed `[vercel skip]`.
  Correct: `lib/substack.ts` fetches the live RSS with hourly revalidation and treats
  `public/data/substack-feed.json` only as a fallback snapshot, so no build is owed.
- **`feed-monitor` "empty ESPN PGA scoreboard: Biltmore Championship Asheville: not
  started (0 in field)"** on both days. Verified against the real world rather than
  assumed: the Biltmore Championship Asheville is a new FedExCup Fall event played
  **Sept 17-20, 2026** at The Cliffs at Walnut Cove. A week out, an unposted field is
  correct. `feed_shape_monitor.py` classes `empty` as a soft note that never alerts
  (L16-18, L84) -- working as designed.
- **`gap-league-watch`**: Indian Super League still `awaiting_target` (api season 2025,
  2026 unpublished). No state transition, no push. Unchanged from prior runs.
- **`football-standings`**: all four runs `unmatched=0 collisions=0 errors=0`. The
  `empty=2` in the fetch line is steady across runs, not a new drift.
- **Git health**: working tree clean, `origin/main` and `HEAD` level (0 behind, 0 ahead).
- **`HANDOFF.md`** (2026-09-09 entry, §F "Open, carried forward") and the project memory
  carry nothing on the FIBA/countries slug consolidation. Finding #1 is new.

## Sources

- [PGA Tour: Biltmore Championship Asheville, FedExCup Fall 2026](https://www.pgatour.com/article/news/latest/2025/11/10/biltmore-championship-asheville-north-carolina-new-event-pga-tour-schedule-2026-fedexcup-fall)
- [Golf Channel: 2026 Biltmore Championship Asheville](https://www.golfchannel.com/pga-tour/2026/biltmore-championship-asheville)

Local evidence: `~/metro-mini-jobs/dispatcher.log`,
`~/metro-mini-jobs/logs/{scraper-fiba-2026-09-05,scraper-fiba-2026-09-09,daily-ops-sweep-2026-09-10}.log`,
`~/newsletter-podcast/logs/{2026-09-10,watchdog-2026-09-10,launchd-daily.out}`,
`~/metro-mini-jobs/state.json`, and `git show 46df23bb3^:public/data/zone-zero-cup.json`.

---
*Read-only sweep. No job was re-run, no data written, no healthchecks pinged. The only
file this run wrote is this report.*
