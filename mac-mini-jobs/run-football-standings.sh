#!/bin/bash
# api-football -> Supabase daily standings + continental fixtures, then export to committed
# JSON bundles the site reads via ISR (mini-owned).
# refresh.py writes football_standings/football_fixtures to Supabase; export_bundles.py then
# writes public/data/football/live-*.json and commits them with [vercel skip] (ISR from GitHub
# raw, so NO Vercel build -- vercel.json's ignoreCommand short-circuits on the [vercel skip] tag).
#
# Scheduled 05:00 UTC (after run-euro-comps at 04:00 to spread the api-football load).
# launchd fires in LOCAL time, so the plist wakes this at BOTH 05:00 and 06:00 local;
# the UTC guard below runs the real job only at 05:00 UTC, correct year-round across
# the GMT/BST switch. If the mini is NOT on UK time, change the plist Hours to bracket
# your local 05:00 UTC.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/football-standings-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] football-standings FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

# --- 05:00 UTC guard (see header); FORCE_RUN=1 bypasses for manual tests ---
if [ "${FORCE_RUN:-0}" != "1" ] && [ "$(date -u +%H)" != "05" ]; then
  log "guard: UTC hour $(date -u +%H) != 05; skipping (set FORCE_RUN=1 to override)"
  exit 0
fi

log "=== football-standings start ($DATE) ==="
[ -n "${APISPORTS_KEY:-}" ]      || fail "APISPORTS_KEY not set (expected in ~/.config/metro-supabase/env)"
# Accept SUPABASE_SERVICE_KEY as well as SUPABASE_WRITE_KEY (refresh.py already falls
# back to it, and the mini standardises on SERVICE_KEY). See run-gap-league-watch.sh.
[ -n "${SUPABASE_WRITE_KEY:-}${SUPABASE_SERVICE_KEY:-}" ] || fail "no Supabase key set (SUPABASE_WRITE_KEY or SUPABASE_SERVICE_KEY expected in ~/.config/metro-supabase/env)"
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

# self-test gate before any live/network run (mirrors project discipline)
"$PY" scripts/apifootball/refresh.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh self-test failed"

log "running daily refresh (--write)"
# refresh.py exit codes: 0 = clean; 3 = data WRITTEN but one+ api teams don't map to the
# Lookup (UNMATCHED); other = real failure. An unmatched team is a curation TODO (add it to
# the Lookup workbook + sync_lookup.py) -- NOT a pipeline failure -- so on exit 3 we WARN
# (so it gets fixed) but continue, letting export+commit still ship fresh bundles. One
# obscure reserve side must not freeze the whole daily football refresh. Real failures (any
# other nonzero) still hard-fail.
"$PY" scripts/apifootball/refresh.py --write 2>&1 | tee -a "$LOG"; rc="${PIPESTATUS[0]}"
if [ "$rc" -eq 3 ]; then
  unmatched="$(grep 'UNMATCHED ALERT' -A6 "$LOG" | grep -E 'team_id' | sed 's/^\[football\][[:space:]]*//' | head -10)"
  push "football: unmatched team(s) -- add to Lookup" default warning "Daily refresh wrote all other data; these api teams need a Lookup entry (then run sync_lookup.py):
${unmatched:-see log}"
  log "  UNMATCHED (non-fatal): warned; continuing to export + commit so the site stays fresh"
elif [ "$rc" -ne 0 ]; then
  fail "refresh --write failed (rc=$rc)"
fi

# Export Supabase -> committed ISR bundles the site reads (no Vercel build; [vercel skip]).
log "exporting frontend bundles"
"$PY" scripts/apifootball/export_bundles.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "export_bundles failed"
"$PY" scripts/apifootball/refresh_supercups.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "supercups export failed"
"$PY" scripts/apifootball/refresh_domestic_cups.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "domestic cups export failed"
# Women's hub: bundle-direct (no Supabase), writes wlive-2026.json. Its WSL auto-watch
# swaps FA WSL to 2026-27 the day api-football publishes that table -- so it must run
# daily, not once. lib/wLive.ts ISR-reads the bundle from GitHub raw ([vercel skip]).
"$PY" scripts/apifootball/refresh_women.py --write 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "women's refresh failed"
BUNDLES="public/data/football/live-standings-2026.json public/data/football/live-competitions-2026.json public/data/football/live-supercups-2026.json public/data/football/live-cups-2026.json public/data/football/wlive-2026.json"
if ! git diff --quiet -- $BUNDLES; then
  git add $BUNDLES
  git commit -q -m "football: refresh live bundles [vercel skip]" || fail "bundle commit failed"
  git push -q origin main || fail "bundle push failed"
  log "pushed updated football bundles"
else
  log "bundles unchanged"
fi
log "=== football-standings done ==="
