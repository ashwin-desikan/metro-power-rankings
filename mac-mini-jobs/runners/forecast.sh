#!/usr/bin/env bash
# Literal port of .github/workflows/forecast-weekly.yml
# (cron 10 6 * * 1,3,5). Stdlib only, no venv requirement.
#
# History worth knowing before touching the cadence: this used to live inside
# metro-mini-refresh.sh's weekly Sunday job, moved OUT to a GitHub Action on
# 2026-08-01 so it refreshed ~3x/week instead of drifting a full week, and is
# now moving back to the mini as its own dispatcher job keeping the Mon/Wed/Fri
# cadence. Do NOT re-add the fetch/build steps to metro-mini-refresh.sh, or the
# forecast double-runs on Sundays.
#
# This was the worst-lagged job on the board: GitHub was dispatching the 06:10
# slot at ~10:02, a 3h50 delay.
#
# Commits only when the scrape actually changed, so a quiet polling week is a
# clean no-op, not a fault. Needs REVALIDATE_SECRET in config.env.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

guarded "fetch polls"     "$PY" scripts/forecast/fetch_data.py
guarded "rebuild forecast" "$PY" scripts/forecast/build_forecast.py

commit_paths "data: weekly election forecast refresh [vercel skip]" \
  public/data/forecast.json \
  data/forecast

revalidate_ping "forecast-weekly" "/elections/forecast" "/predictions"
note "done"
