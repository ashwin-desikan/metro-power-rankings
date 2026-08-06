#!/usr/bin/env bash
# Literal port of .github/workflows/business-daily-refresh.yml (cron 50 5 * * *).
#
# Moved to the mini 2026-08 because this is the one job whose lag a reader can
# see: markets.json and fx.json carry a visible "as of" date, and GitHub was
# dispatching the 05:50 slot at ~08:10, so /business/markets sat on yesterday
# until mid-morning. Everything else about the job is unchanged.
#
# Needs EXCHANGERATE_API_KEY and REVALIDATE_SECRET in config.env.
# Disable the schedule: block in the YAML when this goes live. ONE runner.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

# Self-tests gate every run; a failing Yahoo symbol degrades gracefully inside
# the script, but fewer than six indices aborts the write.
guarded "self-test markets" "$PY" scripts/business/build_markets.py --self-test
guarded "self-test fx"      "$PY" scripts/business/build_fx.py --self-test

guarded "refresh markets (Yahoo, keyless)" "$PY" scripts/business/build_markets.py
guarded "refresh FX (exchangerate-api)"    "$PY" scripts/business/build_fx.py

commit_paths "Auto: daily markets + FX refresh [vercel skip]" \
  public/data/business/markets.json \
  public/data/business/markets-history.json \
  public/data/business/fx.json \
  public/data/business/fx-history.json \
  public/data/business/fx-series

# Runs even on no-change days; a redundant flush is harmless.
revalidate_ping "business-daily" "/business" "/business/markets" "/business/currencies"
note "done"
