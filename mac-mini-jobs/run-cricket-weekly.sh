#!/bin/bash
# Cricket weekly refresh (Supabase source of truth). Every Tuesday.
# Fetches the Cricsheet 30-day rolling zip, appends new matches into Supabase
# (append-only + dedupe), rebuilds public/data/cricket, commits [vercel skip].
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; CRICKET="$REPO/scripts/cricket"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/cricket-weekly-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"   # capture caller intent before sourcing configs
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] Cricket weekly FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== Cricket weekly start ($DATE, DRY_RUN=$DRY_RUN) ==="
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set"

cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

ZIP="$(mktemp -t cricsheet).zip"
trap 'rm -f "$ZIP"' EXIT
log "fetching Cricsheet 30-day rolling zip"
curl -fsSL -o "$ZIP" "https://cricsheet.org/downloads/recently_added_30_male_json.zip" || fail "cricsheet download failed"
log "  got $(stat -f%z "$ZIP") bytes"

cd "$CRICKET" || fail "scripts/cricket not found"
before=$("$PY" -c "import os;from supabase import create_client;print(create_client(os.environ['SUPABASE_URL'],os.environ['SUPABASE_SERVICE_KEY']).table('cricket_matches').select('row_num',count='exact').limit(1).execute().count)" 2>/dev/null || echo "?")
log "cricket_matches before: $before"

log "staging cricsheet -> supabase"
STAGE_OUT="$("$PY" cricsheet_stage.py --zip "$ZIP" --workbook supabase --to-supabase 2>&1)"; [ $? -eq 0 ] || { echo "$STAGE_OUT" | tee -a "$LOG"; fail "cricsheet_stage failed"; }
echo "$STAGE_OUT" | tee -a "$LOG"
log "staging afghanistan -> supabase"
AFG_OUT="$("$PY" afghanistan_stage.py --workbook supabase --to-supabase 2>&1)"; [ $? -eq 0 ] || { echo "$AFG_OUT" | tee -a "$LOG"; fail "afghanistan_stage failed"; }
echo "$AFG_OUT" | tee -a "$LOG"

after=$("$PY" -c "import os;from supabase import create_client;print(create_client(os.environ['SUPABASE_URL'],os.environ['SUPABASE_SERVICE_KEY']).table('cricket_matches').select('row_num',count='exact').limit(1).execute().count)" 2>/dev/null || echo "?")
log "cricket_matches after: $after"

log "building portal data from supabase"
"$PY" build_cricket_portal_data.py supabase "$REPO/public/data/cricket" 2>&1 | tee -a "$LOG" || fail "build_cricket_portal_data failed"
log "building top games from supabase"
"$PY" build_cricket_top_games.py --workbook supabase 2>&1 | tee -a "$LOG" || fail "build_cricket_top_games failed"

cd "$REPO"
if git diff --quiet -- public/data/cricket; then
  log "no cricket data change this run; nothing to commit"
else
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN=1: cricket data changed — diff summary (NOT committing):"
    git --no-pager diff --stat -- public/data/cricket | tee -a "$LOG"
    git checkout -- public/data/cricket
  else
    git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
    git add public/data/cricket
    git commit -m "data: cricket weekly refresh [vercel skip]" --quiet || fail "git commit failed"
    git push origin HEAD:main || fail "git push failed"
    log "committed + pushed cricket data"
  fi
fi

REVIEW="$(printf '%s\n%s\n' "$STAGE_OUT" "$AFG_OUT" | grep -iE 'REVIEW' || true)"
if [ -n "$REVIEW" ]; then
  push "Cricket weekly: REVIEW items -- $DATE" default warning "Unresolved team/venue spellings inserted with blanks; fix via the Supabase connector:
$REVIEW"
  log "REVIEW items surfaced via ntfy"
fi
log "=== Cricket weekly done (before=$before after=$after) ==="
