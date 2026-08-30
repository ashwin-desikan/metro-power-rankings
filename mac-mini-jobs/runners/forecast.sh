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

# Self-tests before any network call, so a parser regression is caught on the
# mini in a second rather than on Wikipedia in ten minutes.
guarded "self-test: parsers"  "$PY" scripts/forecast/fetch_data.py --self-test
guarded "self-test: dates"    "$PY" scripts/forecast/hub_dates.py --self-test
guarded "self-test: health"   "$PY" scripts/forecast/check_forecast_health.py --self-test
guarded "self-test: scoring"  "$PY" scripts/forecast/score_forecasts.py --self-test

guarded "fetch polls"     "$PY" scripts/forecast/fetch_data.py
guarded "rebuild forecast" "$PY" scripts/forecast/build_forecast.py

# Between build and commit: a block that publishes must contain what it says
# it contains. Exits non-zero only when the file is unpublishable, so an empty
# runoff list warns loudly and still ships the first round.
guarded "forecast health"  "$PY" scripts/forecast/check_forecast_health.py

# Re-grade the ledger. Freezes nothing itself: build_forecast.py has already
# written the pre-election snapshots, and a race scores the moment somebody
# files its result in data/forecast/results/.
guarded "score forecasts"  "$PY" scripts/forecast/score_forecasts.py --write

commit_paths "data: weekly election forecast refresh [vercel skip]" \
  public/data/forecast.json \
  public/data/forecast-scoreboard.json \
  data/forecast

revalidate_ping "forecast-weekly" "/elections/forecast" "/predictions"
note "done"
