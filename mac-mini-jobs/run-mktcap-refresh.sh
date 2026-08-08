#!/bin/bash
# CompaniesMarketCap -> Supabase weekly refresh (mini-owned, WEEKLY, Saturday).
#
# Runs the Supabase-only half of the Saturday mktcap ritual: refresh.py --write
# (fetch companiesmarketcap.com + CB Insights, merge, sanity-gate, write the
# weekly valuation snapshot, export out/mktcap_export.csv). Writes ONLY to
# Supabase + a local gitignored CSV -- no git commit, no build.
#
# Deliberately NOT run here: sync_city_lookup.py and compare_excel.py both
# need Excel workbooks that only exist on Ashwin's Windows machine (OneDrive
# paths, confirmed absent from this checkout 2026-08-08) -- those two stay
# part of Ashwin's own manual Saturday ritual. Running refresh.py before he's
# done that week's workbook update is safe, not wrong: unmapped new companies
# just queue as geo stubs (metro=null) for him to curate later, same as any
# other week -- "the pipeline NEVER guesses" per scripts/mktcap/README.md.
#
# Self-test gate before any live/network run (mirrors project discipline).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; MKTCAP="$REPO/scripts/mktcap"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/mktcap-refresh-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] mktcap-refresh FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== mktcap-refresh start ($DATE) ==="
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set (expected in ~/.config/metro-supabase/env)"
export MKTCAP_SUPABASE_KEY="$SUPABASE_SERVICE_KEY"

cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

cd "$MKTCAP" || fail "scripts/mktcap not found"
log "self-test"
"$PY" refresh.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh.py --self-test failed"

log "refresh --write (fetch + merge + Supabase write + CSV export)"
"$PY" refresh.py --write 2>&1 | tee -a "$LOG"; rc="${PIPESTATUS[0]}"
if [ "$rc" -ne 0 ]; then
  fail "refresh.py --write failed (exit $rc) -- check the sanity gate: a >5% week-over-week source swing aborts before writing"
fi

# Surface anything Ashwin should look at, without treating it as a failure:
# new geo stubs to curate. "none" is the only clean value; anything else
# (including grep finding nothing, which would mean the line's shape changed)
# is worth a look, not a silent pass.
QUEUE_LINE="$(grep 'METRO QUEUE' "$LOG" | tail -1)"
case "$QUEUE_LINE" in
  *": none"*) : ;;
  *) push "mktcap-refresh: new companies to map -- $DATE" default warning "${QUEUE_LINE:-METRO QUEUE line not found in log}" ;;
esac

log "=== mktcap-refresh done ==="
