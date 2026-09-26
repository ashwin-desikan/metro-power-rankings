#!/usr/bin/env bash
# Combined port of .github/workflows/mlb-sim-refresh.yml (cron 40 9 * 3-11 *,
# schedule already retired 2026-08-07) and .github/workflows/season-sims-
# refresh.yml (cron 30 14 * 3-11 *, folded in here 2026-08-11 rather than run
# as a second mini job). Seven leagues, two scripts, two daily slots.
#
# Kept DELIBERATELY separate from the predictions runner, for the same reason
# predictions.sh is its own job: predictions runs Tue/Fri because its ledgers
# freeze a pick the first time a fixture enters the 8-day window, and making it
# daily would quietly freeze NFL picks earlier on less information. These seven
# have no ledger and play/finish every day.
#
# Runs twice (jobs.toml times = ["07:00", "14:30"] UTC, fixed year-round --
# never local, see that file's header):
#   07:00 = Ashwin wants it done by 8AM BST. Freshest for MLB/WNBA/CFL/MLS
#           (their games are long over by then).
#   14:30 = season-sims' original slot. AFL/NRL/NPB play evening games
#           (Australia/Japan) that haven't kicked off yet at 07:00, so this
#           second run is what actually gets their SAME-DAY results; the
#           07:00 run alone would always be one day behind for those three.
# The 14:30 run is a harmless no-op for MLB/WNBA/CFL/MLS: nothing changed for
# them since 07:00, so it just recomputes and finds an empty diff.
#
# One broken source must not silence the other six leagues. All seven builds
# below get the SAME soft-fail treatment (own timeout watchdog, tolerate a
# nonzero exit, note it, keep going) rather than `guarded`'s hard-fail-the-
# whole-run behaviour: sharing a job now means MLB failing must not cost the
# other six their day's odds, and vice versa. A failed league still writes
# nothing for itself -- build_mlb_sim.py's verify_wins() gate and
# build_season_sims.py's per-source hard-fail are both untouched, so a broken
# parse still can't publish a plausible-looking wrong table.
#
# The March-November restriction lives in jobs.toml (months), matching both
# YAMLs' cron month field. Out of season each script exits clean without
# writing, but there is no reason to burn a run every winter morning.
#
# Needs REVALIDATE_SECRET in config.env (already there for the other jobs; all
# seven builders are stdlib-only, keyless HTTP fetches -- nothing new to add).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test MLB"          "$PY" scripts/predictions/build_mlb_sim.py --self-test
guarded "self-test season sims"  "$PY" scripts/predictions/build_season_sims.py --self-test
guarded "self-test MLB season finalize" "$PY" scripts/ingest/mlb_season_finalize.py --self-test

PARTIAL_FAILURE=0

# run_soft "label" timeout_seconds cmd...
# Same watchdog shape as _common.sh's guarded(), but notes a failure/timeout
# and returns instead of killing the whole run -- see the header above for why.
run_soft() {
  local label="$1"; local step_timeout="$2"; shift 2
  note "step: $label (timeout ${step_timeout}s)"
  "$@" &
  local pid=$!
  # Redirected: killing $watcher reaps the subshell but not the sleep it
  # forked, and an orphan still holding this pipe keeps the dispatcher's
  # capture_output read blocked until the full timeout elapses.
  ( sleep "$step_timeout"
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null; sleep 3; kill -KILL "$pid" 2>/dev/null
    fi ) >/dev/null 2>&1 &
  local watcher=$!
  if wait "$pid" 2>/dev/null; then
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
  else
    local rc=$?
    kill "$watcher" 2>/dev/null; wait "$watcher" 2>/dev/null
    PARTIAL_FAILURE=1
    if [ "$rc" -ge 124 ] || [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
      note "WARN: $label TIMED OUT after ${step_timeout}s"
    else
      note "WARN: $label failed (rc=$rc) -- see output above"
    fi
  fi
}

# build() hard-fails internally if the derived W-L disagrees with ESPN's own
# standings -- that verify_wins() gate is the whole reason this model is
# trustworthy; never route around it. A single league, so 600s is plenty.
run_soft "rebuild the MLB model" 600 \
  "$PY" scripts/predictions/build_mlb_sim.py

# Seven leagues fetched from four external sources (afltables, ESPN, cfl.ca,
# SPAIA) in one process -- give this one more room than a single-league step.
run_soft "rebuild the season sims" 1800 \
  "$PY" scripts/predictions/build_season_sims.py

guarded "self-test postseason series feed" "$PY" scripts/ingest/playoff_series.py --self-test
run_soft "postseason series feed (MLB playoffs.json)" 300 \
  "$PY" scripts/ingest/playoff_series.py --league mlb

# season-overlay.json bridges the current season into team pages while
# MLB.xlsx is still hand-edited (see the script's own docstring for the
# full why). Runs after playoffs.json above so a completed postseason's
# champ/ws_app/lcs_app flags are available the same run. Soft-fail like
# every other league here: a broken ESPN parse must not cost the other six
# leagues their day's odds, and the script's own refuse-on-unresolved-team
# check means a bad run writes nothing rather than a plausible-looking
# wrong overlay.
run_soft "finalize the MLB season overlay" 300 \
  "$PY" scripts/ingest/mlb_season_finalize.py --write

# The *-sim-history.json snapshots were written by the builders from
# 2026-09-03 but never staged, so the week-over-week deltas and
# sparklines on the hubs stayed blank. Added 2026-09-04.
commit_paths "Auto: refresh MLB + season playoff odds [vercel skip]" \
  public/data/mlb-sim.json public/data/mlb-sim-history.json \
  public/data/afl-sim.json public/data/nrl-sim.json \
  public/data/wnba-sim.json public/data/cfl-sim.json \
  public/data/npb-sim.json public/data/mls-sim.json \
  public/data/nwsl-sim.json public/data/mlb/playoffs.json

# [vercel skip] ON PURPOSE, even though lib/mlb.ts reads season-overlay.json at
# Next.js BUILD time (readFileSync, not ISR). The file changes every run during
# the season (W-L moves daily), so an untagged commit here would spend one of
# the two daily production builds twice a day for six weeks. The overlay is a
# bridge: it reaches the team pages on the next app build, which happens
# several times a week anyway, and the values that matter permanently (final
# record, place, playoff flags) are read from the file whenever that build
# runs. If a build is ever wanted on demand, an empty [deploy-now] commit is
# the override. Committed separately from the sims/playoffs above so a
# soft-failed overlay run never blocks those.
commit_paths "Auto: refresh MLB season overlay [vercel skip]" \
  public/data/mlb/season-overlay.json

# Same predictions-daily tag both YAMLs used -- one flush covers all seven.
# The lock feed for the RLS policy on public.picks. Runs here, and in the
# other two ledger runners, because its input is the ledger this step just
# rebuilt. See sync_pick_locks in _common.sh.
sync_pick_locks

revalidate_ping "predictions-daily" \
  /predictions/mlb /predictions \
  /sports/standings /teams/afl /teams/nrl /teams/wnba /teams/cfl /teams/baseball/npb \
  /teams/wfootball /teams/wfootball/leagues/united-states

if [ "$PARTIAL_FAILURE" = "1" ]; then
  fail "one or more leagues failed to build this run (partial data may still have been committed)"
fi

note "done"
