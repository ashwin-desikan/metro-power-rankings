#!/usr/bin/env bash
# Literal port of .github/workflows/mlb-sim-refresh.yml (cron 40 9 * 3-11 *).
#
# Kept DELIBERATELY separate from the predictions runner, for the same reason
# the workflows are separate: predictions runs Tue/Fri because its ledgers
# freeze a pick the first time a fixture enters the 8-day window, and making it
# daily would quietly freeze NFL picks earlier on less information. Baseball has
# no ledger and plays every day. Two cadences, two jobs.
#
# The March-November restriction lives in jobs.toml (months), matching the
# YAML's cron month field. Out of season the script exits clean without writing
# anyway, but there is no reason to burn a run every winter morning.
#
# Needs REVALIDATE_SECRET in config.env.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "self-test" "$PY" scripts/predictions/build_mlb_sim.py --self-test

# build() hard-fails if the derived W-L disagrees with ESPN's own standings, so
# a silent schedule-parse break stops the run rather than publishing a
# plausible-looking wrong table. That verify_wins() gate is the whole reason
# this model is trustworthy; never route around it.
guarded "rebuild the MLB model" "$PY" scripts/predictions/build_mlb_sim.py

commit_paths "Auto: refresh MLB playoff odds [vercel skip]" \
  public/data/mlb-sim.json

revalidate_ping "predictions-daily" "/predictions/mlb"
note "done"
