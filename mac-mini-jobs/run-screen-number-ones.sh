#!/bin/bash
# Screen of the Metros — weekly US box-office number-ones refresh (mini-owned).
#
# Runs TUESDAY, not in the Sunday egress job: the US number-one for a weekend is only
# tallied Mon/Tue, so the old Sunday slot always ran a day early and saw last week's data
# (moved out 2026-07-28). Re-scrapes the current-year Wikipedia page, re-resolves
# wikilink -> QID -> IMDb tt (both cached), rewrites public/data/screen/screen_number_ones.json,
# commits [vercel skip] (the /screen/number-ones page ISR-reads it from GitHub raw, so NO
# Vercel build). A quiet week produces no diff and no commit.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/screen-number-ones-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] screen-number-ones FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== screen-number-ones start ($DATE) ==="
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

"$PY" scripts/screen/refresh_number_ones.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "refresh_number_ones failed"

# public/data/screen = the exported JSON the site reads; scripts/screen/data = the
# wikilink->QID->IMDb caches the refresh rewrites (kept warm so the weekly delta is small).
PATHS="public/data/screen scripts/screen/data"
if git diff --quiet -- $PATHS; then
  log "no number-ones change this week; nothing to commit"
else
  git config user.name  "metro-mini[bot]"
  git config user.email "metro-mini-bot@users.noreply.github.com"
  git add $PATHS
  git commit -q -m "screen: weekly US number-ones refresh [vercel skip]" || fail "commit failed"
  git push -q origin main || fail "push failed"
  log "committed + pushed number-ones update"
fi
log "=== screen-number-ones done ==="
