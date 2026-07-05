#!/bin/bash
# Cricket monthly rankings refresh (Supabase). 1st of month.
# Appends the newly-completed month's ICC rankings (append-only, validation-gated),
# then rebuilds public/data/cricket and commits [vercel skip]. If the validation
# gate aborts (e.g. late matches changed an already-stored month), nothing is
# written and we ntfy for review — never a silent skip, never a corrupt write.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"; CRICKET="$REPO/scripts/cricket"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/cricket-monthly-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] Cricket monthly FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== Cricket monthly start ($DATE, DRY_RUN=$DRY_RUN) ==="
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set"

cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged)"

cd "$CRICKET" || fail "scripts/cricket not found"
log "appending completed-month ICC rankings (append-only, validation-gated)"
RANK_OUT="$("$PY" build_icc_rankings.py --workbook supabase --write 2>&1)"; rc=$?
echo "$RANK_OUT" | tee -a "$LOG"
if [ $rc -ne 0 ]; then
  if echo "$RANK_OUT" | grep -qi 'VALIDATION FAILED'; then
    push "Cricket monthly: rankings validation FAILED -- $DATE" urgent warning "build_icc_rankings validation gate aborted (a stored month no longer reproduces — likely late matches were added). Nothing written; needs review. Tail:
$(echo "$RANK_OUT" | tail -6)"
    log "validation gate aborted; alerted, no write, exiting 0 (safe)"
    log "=== Cricket monthly done (validation blocked) ==="; exit 0
  fi
  fail "build_icc_rankings failed (non-validation error)"
fi

log "rankings written; rebuilding portal data"
"$PY" build_cricket_portal_data.py supabase "$REPO/public/data/cricket" 2>&1 | tee -a "$LOG" || fail "build_cricket_portal_data failed"

cd "$REPO"
if git diff --quiet -- public/data/cricket; then
  log "no data change; nothing to commit"
elif [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: would commit (diff stat):"; git --no-pager diff --stat -- public/data/cricket | tee -a "$LOG"; git checkout -- public/data/cricket
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add public/data/cricket
  git commit -m "data: cricket monthly rankings refresh [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main || fail "git push failed"
  log "committed + pushed cricket rankings"
fi
log "=== Cricket monthly done ==="
