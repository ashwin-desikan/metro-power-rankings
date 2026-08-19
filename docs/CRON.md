# Operational cadence: cron jobs and scheduled triggers

Internal runbook for every recurring or scheduled job that touches the rankings site or the brand site. Captures the trigger, the command, the expected runtime, the failure mode, and the alerting path. Update when a new job lands.

Last reviewed: 2026-06-30.

---

## Jobs at a glance

| Job | Trigger | Cadence | Owner | Failure impact |
|---|---|---|---|---|
| ETL refresh (`scripts/extract.py`) | Manual after MetroAreas.xlsx edit | Weekly-ish, batch | Ashwin local | Dataset stale; site keeps serving last successful build |
| Quiz queue regeneration + implicit freeze | Tail end of `scripts/extract.py` | Every ETL run | Ashwin local | Forward queue stale; no leaderboard impact for already-locked issues |
| Substack RSS rebuild | `.github/workflows/daily-rebuild.yml` | Daily 13:32 UTC | GH Actions | Featured Articles strip lags ≤24h |
| Boundary build cache rotation | Manual via build-metro-boundaries.py | As needed (after Overture quarterly) | Ashwin local | New metros render single-pin until next build |
| WC2026 results + sim + bracket | `.github/workflows/wc2026-daily.yml` | Every 3h during knockouts (revert to 2x/day after 2026-07-19) | GH Actions | `[vercel skip]` + ISR, no build; bracket/standings lag a few hours |
| F1 hub live season | `.github/workflows/f1-refresh.yml` | Sun 22:00 + Mon 10:00 UTC | GH Actions | `[vercel skip]` + ISR, no build; F1 race results lag |
| Current world leaders | `.github/workflows/leaders-refresh.yml` | Weekly | GH Actions | `[vercel skip]` + ISR; current-leader column lags |
| Billionaires | `.github/workflows/billionaires-refresh.yml` | Monthly (2nd, 06:00 UTC) | GH Actions | `[vercel skip]` + ISR; billionaires hub lags |
| CFB predictions (sim + AP-25 slate + grading) | mini `runners/` (commissioned via HANDOFF 2026-08-19, **pending mini confirmation**) | Sun 23:40 + Fri 11:40 UTC, ~Aug-Jan | mac mini | `[vercel skip]` + ISR (`predictions-daily` tag); slate lags the AP poll, grades lag finals |
| Other data refreshes (conflicts / FIBA / rugby / anomaly digest / external-URL monitor / /updates drift) | `.github/workflows/*.yml` | Weekly/monthly (confirm cron in each file) | GH Actions | See "Site-data refresh Actions" below |

**No standalone freeze cron.** The original design called for a daily 23:00 UTC cron to lock tomorrow's quiz issue. That job has been folded into the generator itself: each ETL run auto-locks any issue whose date is at or before today + 1 day, and the generator's `start_date` defaults to today + 2 days so the locked region is never re-generated. This removes a moving part (no GH Actions workflow, no commit-from-bot, no scheduled deploy hook) at the cost of an edge case: if no ETL runs for several days, the queue still locks correctly because the generator on the next run will lock everything that crossed the cutoff. See "Quiz queue lifecycle → Implicit freeze rule" below.

---

## Quiz queue lifecycle

The forward queue at `public/data/quiz_queue.json` has two triggers and one implicit freeze rule.

### Triggers

**1. ETL run (always).** `scripts/extract.py` regenerates `public/data/` and then calls `scripts/generate_quiz_questions.py --days 30`. The generator preserves any issue with a `lockedAt` timestamp set; only forward, unlocked issues are recomputed against the freshly written data. Then `scripts/check_quiz_queue.py` validates the result. Tier-band slips emit warnings rather than failing the ETL because tier shifts are expected drift.

**2. New badge or conurbation rebuild.** When `lib/badges.ts` ships a new badge slug or `scripts/generate-distance-badges.py` rebuilds `conurbations.csv`, the next ETL tick regenerates the forward queue against the new data. Badge-holder and conurbation-member questions can shift their answer slugs in the unlocked window; locked issues are unaffected.

### Implicit freeze rule

The generator computes `frozen_cutoff = today_utc + 1 day` on each invocation. Issues whose date is at or before the cutoff are treated as locked: their `lockedAt` field is auto-populated to the current UTC timestamp on first observation, and the generator's default `start_date` skips ahead to `frozen_cutoff + 1 day` so locked dates are never re-generated.

Concretely for an issue dated `D`:
- Any ETL run before `D-1`: issue is in the regenerable window. The generator can replace any of its 5 questions against current data.
- Any ETL run on or after `D-1`: issue is in the frozen window. The generator preserves the answer slugs verbatim. Only clue text and factoid render live at page load time.

The 1-day buffer (locking takes effect at `today_utc + 1 day`, not just `today_utc`) prevents an end-of-day ETL run from regenerating tomorrow's issue moments before it goes live. Effectively, the lock takes hold from the moment ETL runs at any point during the day before play.

### Why the queue is committed to git

Same pattern as `public/data/metros.json` and `public/data/details/*.json`. The committed queue:
- Survives Vercel deploys and cold starts (needed for leaderboard integrity)
- Is build-reproducible (a fresh checkout produces the same questions for play day)
- Avoids requiring Python in the Vercel build environment
- Acts as a stable record of what was asked when (replay-mode archive)

Decision locked 2026-05-09. The queue regenerates locally during ETL, the regeneration is committed, and the deploy ships the committed file.

### Failure modes and recovery

**Generator script fails during ETL.** `scripts/extract.py` catches the exception and prints a warning rather than aborting; the existing `quiz_queue.json` remains in place. Next ETL retries.

**Forward queue depth drops below 21 days.** `scripts/check_quiz_queue.py` flags this as an error. CI should fail. Recovery: run `scripts/generate_quiz_questions.py --days 30` manually.

**Locked answer slug disappears from corpus.** `scripts/check_quiz_queue.py` flags this as an error. Recovery: edit `quiz_queue.json` by hand to move the locked issue to a different metro, or use `--regenerate-locked` with the generator (emergency only; resets the affected leaderboard).

**Tier-band claim becomes false.** `scripts/check_quiz_queue.py` flags this as a warning, not an error. The render layer falls back to a softer clue at runtime ("This metro ranks among the top-100 globally on cultural events"). Next ETL regenerates the slot if it is still unlocked.

**No ETL runs for several days.** The queue still locks correctly because the generator on the next ETL run auto-sets `lockedAt` for every historical issue whose date is at or before the freeze cutoff. The forensic record of "when was this issue locked" reflects the ETL time, not the play day, but the answer slugs are stable from the moment they are written and the leaderboard cannot split.

**ETL runs more than once on the same day.** Both runs see the same freeze cutoff (today + 1 day). Tomorrow's issue and earlier are preserved verbatim. Forward issues regenerate against current data each time, but since those dates have not yet locked, no leaderboard impact.

---

## Substack RSS rebuild (existing)

The Featured Articles strip reads from `lib/substack.ts`, which fetches the Substack feed via runtime ISR (with a committed snapshot as fallback). The GitHub Actions workflow at `.github/workflows/daily-rebuild.yml` is now a Substack *snapshot* refresh: it runs daily and commits the snapshot with `[vercel skip]`. As of 2026-06-27 it NO LONGER triggers a Vercel rebuild — the live ISR fetch keeps the strip current without a daily build.

Failure mode: only if the live ISR fetch fails does the strip fall back to the committed snapshot (≤24h stale). No reader-visible error.

---

## ETL refresh (existing)

Run by hand after the MetroAreas.xlsx workbook is edited:

```bash
# from project root
npm run extract                    # python3 scripts/extract.py
git add public/data
git diff --cached --stat
git commit -m "Data refresh"
git push
```

The ETL takes 30-60 seconds end to end. Quiz queue regeneration adds another 5-10 seconds. CI guard adds another 1-2 seconds.

---

## Boundary build (existing)

The boundary builder at `scripts/build-metro-boundaries.py` runs against per-country Overture parquet exports and produces simplified MultiPolygon GeoJSONs at `public/data/metro-boundaries/{slug}.geojson`. Run by hand after a new country is wired in or after Overture publishes a new quarterly release.

Cache at `.build-cache.json` keeps incremental builds in the 3-5 second range; `--force` bypasses for full rebuild.

---

## Site-data refresh Actions (GitHub Actions; `[vercel skip]` + ISR) — added in the 2026-06-30 review

Several feeds refresh on GitHub Actions and commit their JSON with `[vercel skip]`; the pages read that JSON via ISR from GitHub raw, so a data update appears within the revalidate window with **no Vercel build**. Each job commits only when its data actually changed. Exact cron expressions live in each workflow file — confirm there before relying on a time.

- **`wc2026-daily.yml`** — World Cup 2026. Pulls results (API-Football primary, ESPN fallback), reconditions the Monte Carlo sim, recomputes Group Stage standings from the results feed, and patches the knockout bracket (R32 pinned via `R32_OFFICIAL` (date,metro)->teams). Every 3 hours during the knockouts (was 07:00 + 23:00 UTC); revert to twice daily after the final.
- **`f1-refresh.yml`** — F1 hub live season. `scripts/refresh-f1-current-season.py` fetches the season's winners/poles/fastest-laps + standings from Jolpica and patches only the live-season slice of `public/data/f1/data.json` (deep 1950-present history untouched). Sun 22:00 + Mon 10:00 UTC + manual dispatch. The full rebuild (`scripts/build-f1-data.py` from the sibling F1 Data CSVs) is now only for historical corrections.
- **`leaders-refresh.yml`** — current heads of state/government from Wikidata into `public/data/leaders/_current.json`. Weekly. NOTE: refreshes only countries that ALREADY have a `_current.json` entry; it does not cover the long tail.
- **`billionaires-refresh.yml`** — Forbes real-time list via the rtb-api repo (served from jsdelivr; switched off cdn.statically.io 2026-06-30) into `public/data/billionaires.json`. Monthly (2nd of the month, 06:00 UTC).
- **`conflicts-refresh.yml`** — Interstate Wars dataset (monthly).
- **`fiba-ranking.yml`**, **`rugby-rankings.yml`** — sport ranking refreshes (weekly).
- **`anomaly-digest.yml`** — internal weekly anomaly digest.
- **`external-url-monitor.yml`** — external-URL health monitor.
- **`updates-drift-watcher.yml`** — guards the /updates (release-notes) page against drift.

Manual: any of these can be run on demand from the Actions tab via `workflow_dispatch` — useful when a scheduled run lagged (GitHub cron frequently fires an hour+ late, which is why the WC job was moved to every 3 hours during the knockouts).

---

## What is not on cron

These run only on demand or in response to user action, never on a schedule:

- `scripts/sync_source_xlsx.py` — copies the OneDrive workbook to the project. Manual.
- `scripts/dump-overture-country.py` — generates per-country Overture parquet for editorial review. Manual, infrequent.
- `scripts/generate-dimension-badges.py` and `scripts/generate-distance-badges.py` — recompute the deterministic badge CSVs. Run as part of editorial sessions, not on a schedule.

---

## Operational checklist when adding a new cron

1. Add a row to the table at the top of this document.
2. Document the trigger, command, runtime, failure mode, and alerting path.
3. If the job touches a leaderboard-relevant artifact, document the freeze and lock rules.
4. Add a section under "Failure modes and recovery" with the manual recovery command.
5. If the job runs in CI, add a `scripts/check_*.py` guard.
6. Update the daily workflow file (`.github/workflows/`) or the Vercel cron config in `vercel.json` if the trigger lives there.
