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

# Both builders above also upsert today's closes into Supabase
# (market_series_daily), which is the system of record for the long history
# behind /business/markets/[symbol] and /business/currencies/[code]. That needs
# SUPABASE_SERVICE_KEY in config.env; without it they log loudly and carry on,
# because a missing day of rows is recoverable with load_market_series.py
# whereas a failed job leaves the page visibly stale.
#
# The overlay is rebuilt from the read-model files the two steps just wrote, not
# from the database: it changes by one trailing point a day and re-reading 277k
# rows through PostgREST's 1000-row pages would be ~280 requests for that.
guarded "rebuild markets overlay" "$PY" scripts/business/emit_market_series.py --overlay-only

# /business/leaders: CEOs, fund heads and central-bank governors, resolved from
# Wikidata (P169/P488/P1037).
#
# 🔴 Added 2026-09-13 because NOTHING ran this. The board was curated by hand on
# 2026-08-03 and then sat untouched for six weeks: Apple still read Tim Cook on the
# live page while Wikidata had carried John Ternus since 1 September. Project memory
# claimed it ran "in the Saturday chain"; a search of mac-mini-jobs, the workflows
# and every shell script found no caller at all. The first real run picked the
# succession up immediately, so the script was never the problem, the schedule was.
#
# Daily rather than weekly: it is ~107 Wikidata lookups against a cached QID map,
# and a CEO change is exactly the kind of thing a reader notices before we do.
# Pinned seats (personQid/personName overrides) still win over Wikidata by design,
# so an override must be deleted once Wikidata catches up or that seat stays frozen.
guarded "refresh business leaders (Wikidata)" "$PY" scripts/business/build_leaders.py

# scripts/business/data/leader-qids.json is in this list, and it is the only
# non-public/data path here. build_leaders.py resolves an unknown entity's QID by
# name and APPENDS it to that cache, which is tracked (deliberately, so a bad
# match is hand-correctable). Until 2026-09-20 no job committed it, so every new
# entity left the repo permanently dirty -- and a dirty tree is a HARD STOP for
# run-ops-autofix.sh, which then stands the whole fleet's autofix down until a
# human commits. Found when "Bank of China" -> Q790068 landed on 09-20 and blocked
# the mlb-sim re-run for the rest of the day. The cache is not build-relevant
# (nothing under lib/ or app/ reads it), so this commit still rides [vercel skip].
commit_paths "Auto: daily markets + FX refresh [vercel skip]" \
  public/data/business/leaders.json \
  public/data/business/leaders-changes.json \
  public/data/business/markets.json \
  public/data/business/markets-history.json \
  public/data/business/markets-series \
  public/data/business/markets-overlay.json \
  public/data/business/fx.json \
  public/data/business/fx-history.json \
  public/data/business/fx-series \
  scripts/business/data/leader-qids.json

# Runs even on no-change days; a redundant flush is harmless.
revalidate_ping "business-daily" "/business" "/business/markets" "/business/currencies" "/business/leaders"
note "done"
