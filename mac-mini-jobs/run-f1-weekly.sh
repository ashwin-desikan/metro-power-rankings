#!/bin/bash
# F1 weekly refresh (Supabase source of truth). Day after races (~Monday).
# Fetches the 5 Jolpica JSONs, merges the current season into Supabase (idempotent,
# hardened against wipe), rebuilds public/data/f1/data.json, sanity-gates it,
# commits [vercel skip].
#
# LIVE 2026-07-05: the mini is the sole owner of public/data/f1/data.json. The
# GitHub Action f1-refresh.yml has had its schedule disabled (manual-dispatch
# only), so there is no double-writer. If that Action's cron is ever re-enabled,
# set DRY_RUN=1 here again to avoid a race.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
F1DIR="$HOME/Projects/F1 Data"; INCOMING="$F1DIR/data/_incoming"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/f1-weekly-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"   # live: mini owns data.json (f1-refresh.yml cron disabled)
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
export F1_SUPABASE=1
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] F1 weekly FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== F1 weekly start ($DATE, DRY_RUN=$DRY_RUN) ==="
[ -n "${SUPABASE_SERVICE_KEY:-}" ] || fail "SUPABASE_SERVICE_KEY not set"
cd "$REPO" || fail "repo not found"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged)"

# 1. fetch the 5 Jolpica feeds, validate each is JSON
BASE="https://api.jolpi.ca/ergast/f1"
mkdir -p "$INCOMING"; rm -f "$INCOMING"/*.json
fetch(){ # $1=filename $2=path
  curl -fsSL "$BASE/$2" -o "$INCOMING/$1" || fail "fetch $1 failed"
  "$PY" -c "import json;json.load(open('$INCOMING/$1'))" 2>/dev/null || fail "$1 is not valid JSON"
  log "  fetched $1 ($(stat -f%z "$INCOMING/$1") bytes)"
}
fetch results.json              current/last/results.json
fetch qualifying.json           current/last/qualifying.json
fetch sprint.json               current/last/sprint.json
fetch driverStandings.json      current/driverStandings.json
fetch constructorStandings.json current/constructorStandings.json

# 2. merge current season into Supabase (idempotent; _replace_supabase is hardened
#    to refuse a wipe-to-empty / suspicious shrink and to verify the row count)
cd "$F1DIR"
log "merging into Supabase (f1_update.py)"
"$PY" f1_update.py 2>&1 | tee -a "$LOG" || fail "f1_update failed"

# 3. rebuild data.json from Supabase
log "rebuilding public/data/f1/data.json from Supabase"
"$PY" "$REPO/scripts/build-f1-data.py" 2>&1 | tee -a "$LOG" || fail "build-f1-data failed"

# 4. data.json sanity gate (defence-in-depth vs a table wipe slipping past the DB guards)
DJ="$REPO/public/data/f1/data.json"
[ -f "$DJ" ] || fail "data.json not produced"
new_size=$(stat -f%z "$DJ")
old_size=$(git -C "$REPO" show HEAD:public/data/f1/data.json 2>/dev/null | wc -c | tr -d ' ')
log "data.json size: new=$new_size prev=${old_size:-0}"
if [ "${old_size:-0}" -gt 0 ] && [ "$new_size" -lt $(( old_size / 2 )) ]; then
  git -C "$REPO" checkout -- public/data/f1/data.json
  fail "data.json sanity gate: new $new_size < 50% of prev $old_size — refusing to commit (possible table wipe). Reverted."
fi

# 5. commit (HELD unless DRY_RUN=0 AND the f1-refresh.yml Action is disabled)
cd "$REPO"
if git diff --quiet -- public/data/f1/data.json; then
  log "no data.json change this run"
elif [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: data.json changed — NOT committing (double-writer hold). Diff stat:"
  git --no-pager diff --stat -- public/data/f1/data.json | tee -a "$LOG"
  git checkout -- public/data/f1/data.json
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add public/data/f1/data.json
  git commit -m "data: f1 weekly refresh [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main || fail "git push failed"
  log "committed + pushed f1 data.json"
fi

rm -f "$INCOMING"/*.json
log "=== F1 weekly done ==="
