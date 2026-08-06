#!/bin/bash
# UEFA club comps refresh (mini-owned; replaces euro-comps-refresh.yml).
# Fetch API-Football CL/EL/ECL fixtures -> build euro-comps.json -> commit
# [vercel skip]. The tournament hubs + Live Standings ISR-read it from GitHub
# raw, so NO Vercel build fires. A quiet run makes no diff and no commit.
#
# Scheduled 04:00 UTC by mac-mini-jobs/jobs.toml (dispatcher.py), which owns
# the schedule. No internal hour guard: one was here through 2026-08-06 to
# filter the old plist's local-time 04:00+05:00 bracket down to one real UTC
# run, DST-proofing it against launchd's local-time StartCalendarInterval. The
# dispatcher's schedule is UTC-native, so that trick is gone rather than kept
# as a second, invisible schedule a jobs.toml edit could be silently
# overridden by.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REPO="$HOME/Projects/Metro Area Project"; PY="$REPO/.venv/bin/python"
DATE="$(date +%F)"; LOGDIR="$HOME/metro-mini-jobs/logs"; mkdir -p "$LOGDIR"; LOG="$LOGDIR/euro-comps-$DATE.log"
log(){ echo "$(date +%T) $*" | tee -a "$LOG"; }
DRY_RUN="${DRY_RUN:-0}"   # capture caller intent before sourcing configs
[ -f "$HOME/.config/metro-supabase/env" ] && { set -a; source "$HOME/.config/metro-supabase/env"; set +a; }
push(){ [ -n "${NTFY_TOPIC:-}" ] || return 0; curl -s -o /dev/null -H "Title: $1" -H "Priority: $2" -H "Tags: $3" -d "$4" "https://ntfy.sh/$NTFY_TOPIC" || true; }
fail(){ log "ERROR: $1"; push "[ALERT] euro-comps FAILED -- $DATE" urgent rotating_light "$1"; exit 1; }

log "=== euro-comps start ($DATE, DRY_RUN=$DRY_RUN) ==="
[ -n "${APISPORTS_KEY:-}" ] || fail "APISPORTS_KEY not set (expected in ~/.config/metro-supabase/env)"
cd "$REPO" || fail "repo not found: $REPO"
git fetch origin main --quiet || fail "git fetch failed"
git merge --ff-only origin/main --quiet || fail "cannot fast-forward (repo diverged; resolve by hand)"

log "building euro-comps.json (API-Football)"
"$PY" scripts/football/build-euro-comps.py 2>&1 | tee -a "$LOG"; [ "${PIPESTATUS[0]}" -eq 0 ] || fail "build-euro-comps failed"

FILE="public/data/football/euro-comps.json"
if git diff --quiet -- "$FILE"; then
  log "no euro-comps change this run; nothing to commit"
elif [ "$DRY_RUN" = "1" ]; then
  log "DRY_RUN=1: euro-comps changed -- NOT committing. Diff stat:"
  git --no-pager diff --stat -- "$FILE" | tee -a "$LOG"; git checkout -- "$FILE"
else
  git config user.name "mac-mini[claude]"; git config user.email "mac-mini-claude@users.noreply.github.com"
  git add "$FILE"
  git commit -m "Auto: refresh UEFA club competition fixtures [vercel skip]" --quiet || fail "git commit failed"
  git push origin HEAD:main || fail "git push failed"
  log "committed + pushed euro-comps"
fi
log "=== euro-comps done ==="
