#!/usr/bin/env bash
# Literal port of .github/workflows/predictions-refresh.yml
# (cron 40 6 * * 2 and 40 11 * * 5). The two slots are two entries in
# jobs.toml pointing at this one script, because the work is identical; only
# the moment matters.
#   Tue 06:40 UTC - grade the weekend's games with final results
#   Fri 11:40 UTC - fresh odds + picks ahead of the weekend
#
# The Action installs numpy at run time. On the mini it comes from the venv
# (numpy==2.5.1 in metro-venv-requirements.txt), so PYTHON_BIN in config.env
# MUST point at that venv's python, not the system one, or the sims fall back
# to the slow path or fail outright.
#
# Needs REVALIDATE_SECRET in config.env.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

"$PY" -c "import numpy" 2>/dev/null \
  || fail "numpy missing from $PY; point PYTHON_BIN at the venv (metro-venv-requirements.txt)"

guarded "self-test PL"  "$PY" scripts/predictions/build_pl_sim.py --self-test
guarded "self-test NFL" "$PY" scripts/predictions/build_nfl_sim.py --self-test

guarded "rebuild the Premier League model" "$PY" scripts/predictions/build_pl_sim.py
guarded "rebuild the NFL model"            "$PY" scripts/predictions/build_nfl_sim.py

commit_paths "Auto: refresh PL + NFL prediction models [vercel skip]" \
  public/data/pl-sim.json \
  public/data/pl-predictions.json \
  public/data/nfl-sim.json \
  public/data/nfl-predictions.json

# /predictions/mlb is warmed by mlb-sim.sh, which shares the predictions-daily
# tag -- a flush here invalidates all three, so include it too rather than
# leave it cold on Tue/Fri (the gap windows flagged 2026-08-06). Mirrors
# predictions-refresh.yml -- keep the two in step.
revalidate_ping "predictions-daily" "/predictions/pl" "/predictions/nfl" "/predictions/mlb" "/predictions"
note "done"
