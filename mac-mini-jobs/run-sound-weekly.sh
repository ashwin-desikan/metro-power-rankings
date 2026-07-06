#!/bin/bash
# Sound of the Metros weekly refresh (mini). Fetch Billboard + UK top-ten from
# Wikipedia (pandas.read_html), splice the current-year rows, rebuild the hub JSON
# via refresh_all.py (JSON only; no Excel), commit public/data/sound [vercel skip].
# A dry-run overlap gate runs first and aborts on an implausible parse. New artists
# needing a hometown are surfaced by ntfy (you add them to user_fixes.json).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
PIPE="$HOME/som-pipeline"                       # relocated Sound pipeline folder
export SOM_PIPE="$PIPE" SOM_REPO="$REPO"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/sound-weekly-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; . "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] Sound weekly FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== Sound weekly start ($DATE, DRY_RUN=$DRY_RUN) ==="
[ -d "$PIPE" ] || fail "pipeline folder missing: $PIPE"
cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (diverged)"

log "overlap gate (dry-run fetch, no write)"
"$PY" "$PIPE/sound_ingest.py" --dry-run 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "overlap gate failed"
if [ "$DRY_RUN" = "1" ]; then log "DRY_RUN=1: gate passed, stopping before write."; exit 0; fi

log "ingest (splice current-year rows)"
"$PY" "$PIPE/sound_ingest.py" 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "ingest failed"

log "rebuild hub JSON (refresh_all.py)"
REPORT="$("$PY" "$PIPE/refresh_all.py" 2>&1)"; echo "$REPORT" | tee -a "$LOG"
echo "$REPORT" | grep -qi "DONE" || fail "refresh_all did not complete cleanly"

cd "$REPO"
if git diff --quiet -- public/data/sound; then
  log "no sound data change; nothing to commit"
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add public/data/sound
  git commit -m "data: sound of the metros weekly refresh [vercel skip]" --quiet || fail "commit failed"
  git push origin HEAD:main || fail "push failed"
  log "committed + pushed sound data"
fi

NEW="$(echo "$REPORT" | sed -n '/needing a hometown/,/DONE/p' | grep -E '^[[:space:]]+[0-9]' | head -30 || true)"
[ -n "$NEW" ] && push "Sound weekly: new artists need a metro -- $DATE" default warning "Add to user_fixes.json:
$NEW"
log "=== Sound weekly done ==="
