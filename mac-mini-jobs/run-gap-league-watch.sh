#!/bin/bash
# Gap-league watcher (mini-owned, DAILY). Polls api-football for leagues Ashwin tracks that are
# not yet available for 2026-27 (scripts/apifootball/leagues_pending.json) and records coverage
# state in Supabase (football_league_watch). Writes ONLY to Supabase -- no git commit, no build.
#
# Scheduled daily 05:00 UTC. launchd fires in LOCAL time, so the plist wakes this at BOTH 05:00
# and 06:00 local; the UTC guard runs the real job only at 05:00 UTC (GMT/BST safe).
# If the mini is NOT on UK time, change the plist Hours to bracket your local 05:00 UTC.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/gap-league-watch-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] gap-league-watch FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

# --- 05:00 UTC guard (see header); FORCE_RUN=1 bypasses for manual tests ---
if [ "${FORCE_RUN:-0}" != "1" ] && [ "$(date -u +%H)" != "05" ]; then
  log "guard: UTC hour $(date -u +%H) != 05; skipping (set FORCE_RUN=1 to override)"
  exit 0
fi

log "=== gap-league-watch start ($DATE) ==="
[ -n "${APISPORTS_KEY:-}" ]      || fail "APISPORTS_KEY not set (expected in ~/.config/metro-supabase/env)"
[ -n "${SUPABASE_WRITE_KEY:-}" ] || fail "SUPABASE_WRITE_KEY not set (expected in ~/.config/metro-supabase/env)"
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

# self-test gate before any live/network run (mirrors project discipline)
"$PY" scripts/apifootball/watch_gap_leagues.py --self-test 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "watch self-test failed"

log "running daily gap-league watch (--write)"
"$PY" scripts/apifootball/watch_gap_leagues.py --write 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "watch --write failed"
log "=== gap-league-watch done ==="
