#!/usr/bin/env bash
# Weekly refresh for the /business/economy policy-rate layer
# (scripts/macro/RATES-CONTRACT.md). BIS publishes WS_CBPOL weekly on
# Thursday, so this runs Fridays 07:30 UTC -- see jobs.toml, id
# "economy-rates". Same runner idiom as business-daily.sh: self-test gate,
# guarded steps, commit_paths with "[vercel skip]", revalidate_ping.
#
# scripts/macro/rates/refresh.py is the whole pipeline in one entry point:
# incremental fetch (BIS SDMX API + FRED/ECB/Riksbank/BoC/Norges direct,
# last 90 days), merge onto the stored daily levels, rerun every builder and
# build_index.py, append public/data/business/economy/rates/changelog.json
# on any new decision. It is dry-run by default; --write is what actually
# fetches live and commits, so it is what this runner calls.
#
# Needs SUPABASE_SERVICE_KEY (fail-open, same as business-daily.sh's series
# writes -- a missing key logs loudly and the JSON build still ships) and
# REVALIDATE_SECRET in config.env. ONE runner.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

mini_sync

# Self-tests before any network call: refresh.py's own pure decision logic
# (dedup, overlap-safety, the unreachable-source path) plus the Supabase
# loader's row-shaping. Both run fully offline against
# scripts/macro/rates/fixtures/, never touching a real bank file.
guarded "self-test refresh"           "$PY" scripts/macro/rates/refresh.py --self-test
guarded "self-test load_policy_rates" "$PY" scripts/macro/rates/load_policy_rates.py --self-test

# The real run: fetch, merge, rerun every builder + build_index.py, write.
# Captured to a temp file so the runner can grep it for a "NEW RATE
# DECISIONS" block afterward without refresh.py needing to know anything
# about how this mini alerts.
REFRESH_LOG="$(mktemp)"
guarded "refresh policy rates (--write)" \
  bash -c "\"$PY\" scripts/macro/rates/refresh.py --write | tee \"$REFRESH_LOG\""

commit_paths "Auto: policy rates refresh [vercel skip]" \
  public/data/business/economy/rates

# Runs even on a no-change week; a redundant flush is harmless. The tag
# ("economy-rates") is registered in ALLOWED_TAGS, app/api/revalidate/route.ts.
revalidate_ping "economy-rates" "/business/economy" "/business/economy/compare"

# The watcher: a genuine push notification naming the bank and the move,
# distinct from _common.sh's alert() (which only fires on job failure).
# Fail-open: a notify.py hiccup here must never fail an otherwise-successful
# refresh, so it is deliberately NOT wrapped in guarded/fail.
if grep -q "NEW RATE DECISIONS" "$REFRESH_LOG"; then
  SUMMARY="$(awk '/^NEW RATE DECISIONS$/{f=1;next} /^={10,}$/{if(f){f=0}} f' "$REFRESH_LOG" | sed 's/^  //' | head -8)"
  note "New rate decisions detected:"
  note "$SUMMARY"
  "$PY" "$MINI_DIR/notify.py" "Policy rate decisions" "$SUMMARY" 0 || true
fi
rm -f "$REFRESH_LOG"

note "done"
